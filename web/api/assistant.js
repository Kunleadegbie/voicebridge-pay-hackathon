// Stage 3E-B3: restricted, read-only financial education proxy.
// Distinct from PayPal checkout and N-ATLAS voice; no payment or audio calls.
// The assistant is OFF unless configured deliberately on BOTH cloud services.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

const ORIGINS = new Set([
  "https://voicebridgepay.chumcred.com",
  "https://voicebridge-pay-hackathon-web.vercel.app"
]);
const BACKEND = "https://voicebridge-pay-hackathon-production.up.railway.app";
const COOKIE = "__Host-vbpay_assistant_session";
const TTL_MS = 15 * 60 * 1000;
const MAX_BODY = 6500;
const MAX_HISTORY = 8;
const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCE_IDS = new Set([
  "digital_payments", "transfers", "cards", "wallets", "receipts",
  "statuses", "fees", "fraud", "sandbox", "voicebridge"
]);

function header(req, name) {
  const value = req.headers?.[name];
  return Array.isArray(value) ? value[0] : (value || "");
}
function reply(res, status, body, cookie) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (cookie) res.setHeader("Set-Cookie", cookie);
  res.end(JSON.stringify(body));
}
function config() {
  if (process.env.ENABLE_FINANCIAL_ASSISTANT !== "1") return null;
  const key = process.env.ASSISTANT_SERVICE_KEY || "";
  const secret = process.env.ASSISTANT_SESSION_SECRET || "";
  const passcode = process.env.ASSISTANT_DEMO_PASSCODE || "";
  if (key.length < 48 || secret.length < 48 ||
      passcode.length < 16 || passcode.length > 128 ||
      process.env.BACKEND_URL !== BACKEND) return null;
  // Do not treat shared voice/checkout keys as assistant credentials.
  if (key === process.env.VOICE_SERVICE_KEY ||
      key === process.env.CHECKOUT_SERVICE_KEY) return null;
  return { key, secret, passcode };
}
function clientFingerprint(req, secret) {
  // Vercel overwrites proxy client-IP headers in its normal network
  // topology. Never use an arbitrary browser-supplied IP from a JSON body
  // or fall back to user-controlled X-Forwarded-For chains.
  const trusted = header(req, "x-vercel-forwarded-for") ||
    header(req, "x-real-ip");
  if (typeof trusted !== "string" || trusted.length > 65 ||
      !isIP(trusted.trim())) return null;
  return createHmac("sha256", secret)
    .update("vbpay-assistant-access:" + trusted.trim()).digest("hex");
}
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}
function sign(payload, secret, purpose) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return body + "." + createHmac("sha256", secret)
    .update(purpose + ":" + body).digest("base64url");
}
function verify(token, secret, purpose) {
  if (typeof token !== "string" || token.length > 1000) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) ||
      !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;
  const expected = createHmac("sha256", secret)
    .update(purpose + ":" + parts[0]).digest();
  const supplied = Buffer.from(parts[1], "base64url");
  if (supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (typeof data !== "object" || data === null ||
        !Number.isSafeInteger(data.exp) || data.exp <= Date.now() ||
        data.exp > Date.now() + TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}
function cookieValue(req) {
  const raw = header(req, "cookie").split(";").map(x => x.trim())
    .find(x => x.startsWith(COOKIE + "="));
  return raw ? raw.slice(COOKIE.length + 1) : "";
}
function session(req, secret) {
  const value = verify(cookieValue(req), secret, "assistant-session");
  return value && typeof value.nonce === "string" &&
    /^[a-f0-9]{32}$/.test(value.nonce) ? value : null;
}
function newCookie(token, expires = 900) {
  return COOKIE + "=" + token +
    "; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=" + expires;
}
function validHistory(history) {
  if (!Array.isArray(history) || history.length > MAX_HISTORY ||
      history.length % 2 !== 0) return false;
  let total = 0;
  for (let i = 0; i < history.length; i++) {
    const turn = history[i];
    if (!turn || typeof turn !== "object" || Array.isArray(turn) ||
        Object.keys(turn).sort().join(",") !== "content,role" ||
        turn.role !== (i % 2 ? "assistant" : "user") ||
        typeof turn.content !== "string" || !turn.content.trim() ||
        turn.content.length > 1200) return false;
    total += turn.content.length;
  }
  return total <= 2800;
}
function boundedHistory(turns) {
  // The backend permits at most 1,200 characters per history turn.
  // Keep a longer answer visible, but bound its future context explicitly.
  const history = turns.slice(-MAX_HISTORY).map(turn => ({
    role: turn.role, content: turn.content.slice(0, 1200)
  }));
  while (history.length > 2 &&
         history.reduce((sum, turn) => sum + turn.content.length, 0) > 2800) {
    history.splice(0, 2);
  }
  return history;
}
function contextDigest(history) {
  return createHash("sha256").update(JSON.stringify(history)).digest("hex");
}
function checkContext(history, proof, currentSession, secret) {
  if (history.length === 0) return proof === undefined || proof === "";
  const value = verify(proof, secret, "assistant-context:" + currentSession.nonce);
  return Boolean(value && value.digest === contextDigest(history) &&
    /^[a-f0-9]{64}$/.test(value.digest));
}
function validCapacity(data) {
  return data && typeof data === "object" && !Array.isArray(data) &&
    ["available", "reached"].includes(data.status) &&
    Number.isSafeInteger(data.remaining) && data.remaining >= 0 &&
    Number.isSafeInteger(data.daily_used) && data.daily_used >= 0 &&
    Number.isSafeInteger(data.daily_limit) && data.daily_limit > 0 &&
    Number.isSafeInteger(data.lifetime_remaining) && data.lifetime_remaining >= 0 &&
    typeof data.reset_at_utc === "string" &&
    /^\d{4}-\d{2}-\d{2}T00:00:00Z$/.test(data.reset_at_utc);
}
function validAnswer(data, expectedLanguage = "en-NG") {
  return data && typeof data === "object" && !Array.isArray(data) &&
    ["answered", "clarification", "refused"].includes(data.status) &&
    typeof data.answer === "string" && data.answer.trim().length > 0 &&
    data.answer.length <= 1300 &&
    typeof data.category === "string" && data.category.length <= 40 &&
    data.language === expectedLanguage &&
    data.payment_action_allowed === false &&
    Array.isArray(data.source_ids) && data.source_ids.length <= 3 &&
    data.source_ids.every(x => SOURCE_IDS.has(x)) &&
    typeof data.safety_notice === "string" &&
    data.safety_notice.length > 0 && data.safety_notice.length <= 300 &&
    typeof data.follow_up_suggestion === "string" &&
    data.follow_up_suggestion.length <= 220;
}
async function backend(cfg, method, path, body) {
  const response = await fetch(BACKEND + path, {
    method, redirect: "error", cache: "no-store",
    headers: {
      "X-Assistant-Service-Key": cfg.key,
      "Accept": "application/json",
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(28000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = response.status === 429 ? "assistant_capacity_reached" :
      response.status === 409 ? "assistant_duplicate_request" :
      response.status === 422 ? "assistant_question_invalid" :
      response.status === 503 ? "assistant_unavailable" : "assistant_provider_unavailable";
    return { error: reason, status: [409, 422, 429].includes(response.status) ? response.status : 503 };
  }
  return { data };
}

async function accessOperation(cfg, action, fingerprint, sessionId) {
  const result = await backend(
    cfg, "POST", "/api/internal/assistant/access",
    { action, fingerprint, ...(sessionId ? { session_id: sessionId } : {}) }
  );
  if (result.error) {
    return {
      error: result.status === 429 ? "assistant_access_limited" :
        "assistant_access_unavailable",
      status: result.status === 429 ? 429 : 503
    };
  }
  if (!result.data || typeof result.data !== "object" ||
      typeof result.data.status !== "string") {
    return { error: "assistant_access_unavailable", status: 503 };
  }
  return { data: result.data };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    reply(res, 405, { ok: false, reason: "method_not_allowed" });
    return;
  }
  const origin = header(req, "origin");
  const host = header(req, "host");
  let sameHost = false;
  try { sameHost = new URL(origin).host === host; }
  catch { /* reject */ }
  if (!ORIGINS.has(origin) || !sameHost ||
      header(req, "x-requested-with") !== "VoiceBridgeAssistant" ||
      !header(req, "content-type").toLowerCase().startsWith("application/json") ||
      (header(req, "sec-fetch-site") &&
       header(req, "sec-fetch-site") !== "same-origin")) {
    reply(res, 403, { ok: false, reason: "origin_rejected" });
    return;
  }
  const cfg = config();
  if (!cfg) {
    reply(res, 503, { ok: false, reason: "assistant_not_configured" });
    return;
  }
  // Keep the password and history out of logs and out of error responses.
  let data;
  try {
    const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    if (!raw || Buffer.byteLength(raw, "utf8") > MAX_BODY) throw Error("size");
    data = JSON.parse(raw);
  } catch {
    reply(res, 413, { ok: false, reason: "invalid_request" });
    return;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    reply(res, 400, { ok: false, reason: "invalid_request" });
    return;
  }
  try {
    const fingerprint = clientFingerprint(req, cfg.secret);
    if (!fingerprint) {
      // A missing/untrusted proxy identity must never bypass rate limits.
      reply(res, 503, { ok: false, reason: "assistant_access_unavailable" });
      return;
    }
    if (data.action === "start") {
      if (Object.keys(data).sort().join(",") !== "action,passcode" ||
          typeof data.passcode !== "string" ||
          data.passcode.length > 128) {
        reply(res, 400, { ok: false, reason: "invalid_request" });
        return;
      }
      // Atomically debit the LOGIN attempt BEFORE comparing the password,
      // across all Vercel/Railway instances; fail closed on Redis outage.
      const attempt = await accessOperation(cfg, "attempt", fingerprint);
      if (attempt.error) {
        reply(res, attempt.status, { ok: false, reason: attempt.error });
        return;
      }
      if (attempt.data.status !== "allowed") {
        reply(res, 503, { ok: false, reason: "assistant_access_unavailable" });
        return;
      }
      if (!safeEqual(data.passcode, cfg.passcode)) {
        reply(res, 403, { ok: false, reason: "assistant_access_denied" });
        return;
      }
      const issued = { nonce: randomBytes(16).toString("hex"),
        exp: Date.now() + TTL_MS };
      // Stateless signed cookie is NOT sufficient. Redis registration must
      // succeed so a later logout can revoke a copied/replayed cookie.
      const register = await accessOperation(cfg, "register", fingerprint, issued.nonce);
      if (register.error || register.data.status !== "registered") {
        reply(res, 503, { ok: false, reason: "assistant_access_unavailable" });
        return;
      }
      const cookie = sign(issued, cfg.secret, "assistant-session");
      reply(res, 200, { ok: true, status: "ready", expires_in_seconds: 900 },
        newCookie(cookie));
      return;
    }
    const active = session(req, cfg.secret);
    if (data.action === "end") {
      if (Object.keys(data).sort().join(",") !== "action") {
        reply(res, 400, { ok: false, reason: "invalid_request" });
        return;
      }
      if (!active) {
        reply(res, 200, { ok: true, status: "ended" }, newCookie("", 0));
        return;
      }
      const revoke = await accessOperation(cfg, "revoke", fingerprint, active.nonce);
      if (revoke.error || !["revoked", "inactive"].includes(revoke.data.status)) {
        // Do NOT falsely claim server-side logout when storage failed.
        reply(res, 503, { ok: false, reason: "assistant_access_unavailable" });
        return;
      }
      reply(res, 200, { ok: true, status: "ended" }, newCookie("", 0));
      return;
    }
    if (!active) {
      reply(res, 401, { ok: false, reason: "assistant_session_expired" });
      return;
    }
    const verification = await accessOperation(
      cfg, "validate", fingerprint, active.nonce
    );
    if (verification.error) {
      reply(res, verification.status, { ok: false, reason: verification.error });
      return;
    }
    if (verification.data.status !== "active") {
      reply(res, 401, { ok: false, reason: "assistant_session_expired" },
        newCookie("", 0));
      return;
    }
    if (data.action === "capacity") {
      if (Object.keys(data).sort().join(",") !== "action") {
        reply(res, 400, { ok: false, reason: "invalid_request" });
        return;
      }
      const result = await backend(cfg, "GET", "/api/internal/assistant/capacity");
      if (result.error) {
        reply(res, result.status, { ok: false, reason: result.error });
        return;
      }
      if (!validCapacity(result.data)) {
        reply(res, 503, { ok: false, reason: "assistant_response_invalid" });
        return;
      }
      reply(res, 200, { ok: true, ...result.data });
      return;
    }
    const askKeys = Object.keys(data).sort().join(",");
    if (data.action !== "ask" ||
        (askKeys !== "action,confirm_privacy,context_proof,history,question,request_id" &&
         askKeys !== "action,confirm_privacy,context_proof,history,language,question,request_id" &&
         askKeys !== "action,confirm_privacy,context_proof,history,question,request_id,source_type" &&
         askKeys !== "action,confirm_privacy,context_proof,history,language,question,request_id,source_type")) {
      reply(res, 400, { ok: false, reason: "invalid_request" });
      return;
    }
    // A client-provided source_type is descriptive, not proof of ASR
    // provenance and never gives payment or other elevated privileges.
    const language = data.language === undefined ? "en-NG" : data.language;
    if (!["en-NG", "yo-NG", "ha-NG", "ig-NG"].includes(language)) {
      reply(res, 422, { ok: false, reason: "assistant_language_invalid" });
      return;
    }
    const sourceType = data.source_type === undefined ? "typed" : data.source_type;
    if (sourceType !== "typed" && sourceType !== "reviewed_transcript") {
      reply(res, 422, { ok: false, reason: "assistant_question_invalid" });
      return;
    }
    if (typeof data.question !== "string" ||
        data.question.trim().length < 3 || data.question.length > 500 ||
        data.confirm_privacy !== true || !UUID4.test(data.request_id || "") ||
        !validHistory(data.history) ||
        !checkContext(data.history, data.context_proof, active, cfg.secret)) {
      reply(res, 422, { ok: false, reason: "assistant_question_invalid" });
      return;
    }
    const result = await backend(cfg, "POST", "/api/internal/assistant/respond", {
      request_id: data.request_id, language: language, source_type: sourceType,
      question: data.question, history: data.history, confirm_privacy: true
    });
    if (result.error) {
      reply(res, result.status, { ok: false, reason: result.error });
      return;
    }
    if (!validAnswer(result.data, language)) {
      reply(res, 503, { ok: false, reason: "assistant_response_invalid" });
      return;
    }
    const updated = boundedHistory([
      ...data.history,
      { role: "user", content: data.question },
      { role: "assistant", content: result.data.answer }
    ]);
    const proof = sign({
      digest: contextDigest(updated), exp: active.exp
    }, cfg.secret, "assistant-context:" + active.nonce);
    reply(res, 200, {
      ok: true,
      status: result.data.status, category: result.data.category,
      answer: result.data.answer,
      follow_up_suggestion: result.data.follow_up_suggestion,
      source_ids: result.data.source_ids, safety_notice: result.data.safety_notice,
      language: result.data.language, payment_action_allowed: false,
      history: updated, context_proof: proof,
      speech_proof: language === "en-NG" ? null : sign({
        digest: createHash("sha256")
          .update(language + "\n" + result.data.answer, "utf8")
          .digest("hex"),
        token_id: randomBytes(16).toString("hex"),
        exp: Math.min(active.exp, Date.now() + 5 * 60 * 1000)
      }, cfg.secret, "assistant-tts:" + active.nonce)
    });
  } catch {
    reply(res, 503, { ok: false, reason: "assistant_unavailable" });
  }
}
