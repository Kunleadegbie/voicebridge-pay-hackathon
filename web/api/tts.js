"use strict";

// VoiceBridge AI Pay: protected staging-only speech gateway.
// Not connected to the public website until security tests pass.

import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { verifySpeechProof } from "./tts-proof.js";
import { generateLangaAudio } from "./langa-tts.js";

const BACKEND = "https://voicebridge-pay-hackathon-production.up.railway.app";
const COOKIE = "__Host-vbpay_assistant_session";
const TTL_MS = 15 * 60 * 1000;
const LANGUAGES = new Set(["yo-NG", "ha-NG", "ig-NG"]);

function reject(res, status, reason) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(JSON.stringify({ ok: false, reason }));
}

function activeSession(req, secret) {
  const cookie = (req.headers.cookie || "").split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(COOKIE + "="));

  if (!cookie) return null;

  const token = cookie.slice(COOKIE.length + 1);
  if (token.length > 1000) return null;

  const parts = token.split(".");
  if (parts.length !== 2 ||
      !/^[A-Za-z0-9_-]+$/.test(parts[0]) ||
      !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;

  try {
    const expected = createHmac("sha256", secret)
      .update("assistant-session:" + parts[0]).digest();
    const supplied = Buffer.from(parts[1], "base64url");

    if (supplied.length !== expected.length ||
        !timingSafeEqual(supplied, expected)) return null;

    const data = JSON.parse(
      Buffer.from(parts[0], "base64url").toString("utf8")
    );

    if (!data || !/^[a-f0-9]{32}$/.test(data.nonce) ||
        !Number.isSafeInteger(data.exp) ||
        data.exp <= Date.now() ||
        data.exp > Date.now() + TTL_MS) return null;

    return data;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return reject(res, 405, "method_not_allowed");
  }

  const origin = req.headers?.origin;
  const host = req.headers?.host;

  const allowedHosts = new Map([
    ["https://voicebridgepay.chumcred.com", "voicebridgepay.chumcred.com"],
    ["https://voicebridge-pay-hackathon-web.vercel.app", "voicebridge-pay-hackathon-web.vercel.app"]
  ]);

  if (typeof origin !== "string" ||
      !allowedHosts.has(origin) ||
      host !== allowedHosts.get(origin) ||
      req.headers["x-requested-with"] !== "VoiceBridgeTTS" ||
      !String(req.headers["content-type"] || "")
        .toLowerCase().startsWith("application/json") ||
      (req.headers["sec-fetch-site"] &&
       req.headers["sec-fetch-site"] !== "same-origin")) {
    return reject(res, 403, "origin_rejected");
  }

  const secret = process.env.ASSISTANT_SESSION_SECRET || "";
  const serviceKey = process.env.ASSISTANT_SERVICE_KEY || "";
  const langaKey = process.env.LANGA_TTS_API_KEY || "";

  if (process.env.VERCEL !== "1" ||
      process.env.VERCEL_ENV !== "production" ||
      process.env.ENABLE_FINANCIAL_ASSISTANT !== "1" ||
      process.env.ENABLE_LANGA_TTS !== "1" ||
      process.env.BACKEND_URL !== BACKEND ||
      secret.length < 48 ||
      serviceKey.length < 48 ||
      langaKey.length < 30) {
    return reject(res, 503, "tts_disabled");
  }

  const session = activeSession(req, secret);
  if (!session) {
    return reject(res, 401, "assistant_session_expired");
  }

  const ip = req.headers["x-vercel-forwarded-for"] || req.headers["x-real-ip"];
  if (typeof ip !== "string" || ip.length > 65 ||
      !isIP(ip.trim())) {
    return reject(res, 503, "tts_access_unavailable");
  }

  let data;
  try {
    const raw = req.body;
    const serialized = typeof raw === "string" ? raw : JSON.stringify(raw);
    if (typeof serialized !== "string" ||
        Buffer.byteLength(serialized, "utf8") > 6500) {
      return reject(res, 413, "tts_invalid_request");
    }
    data = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return reject(res, 400, "tts_invalid_request");
  }

  if (!data || typeof data !== "object" ||
      Array.isArray(data) ||
      Object.keys(data).sort().join(",") !==
        "answer,confirm_tts_privacy,language,speech_proof" ||
      data.confirm_tts_privacy !== true ||
      typeof data.answer !== "string" ||
      !LANGUAGES.has(data.language)) {
    return reject(res, 422, "tts_invalid_request");
  }

  const proof = verifySpeechProof(
    data.speech_proof,
    data.answer,
    data.language,
    session.nonce,
    secret
  );

  if (!proof) {
    return reject(res, 403, "tts_authorization_invalid");
  }

  const fingerprint = createHmac("sha256", secret)
    .update("vbpay-assistant-access:" + ip.trim())
    .digest("hex");

  let ttsStage = "reservation";
  try {
    const reservation = await fetch(
      BACKEND + "/api/internal/assistant/tts/reserve",
      {
        method: "POST",
        redirect: "error",
        cache: "no-store",
        headers: {
          "X-Assistant-Service-Key": serviceKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fingerprint,
          session_id: session.nonce,
          token_id: proof.token_id
        }),
        signal: AbortSignal.timeout(15000)
      }
    );

    if (!reservation.ok) {
      const status = reservation.status === 409 ? 409 :
        reservation.status === 429 ? 429 :
        reservation.status === 401 ? 401 : 503;
      return reject(res, status, "tts_reservation_rejected");
    }

    const result = await reservation.json();
    if (result.status !== "reserved") {
      return reject(res, 503, "tts_reservation_invalid");
    }

    ttsStage = "langa";
    const audio = await generateLangaAudio(
      data.answer, data.language
    );

    const mp3 = audio.subarray(0, 3).toString("ascii") === "ID3" ||
      (audio[0] === 255 && (audio[1] & 224) === 224);

    if (!mp3) {
      return reject(res, 503, "tts_audio_invalid");
    }

    res.writeHead(200, {
      "Content-Type": "audio/mpeg",
      "Content-Length": audio.length,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    });
    res.end(audio);
  } catch (error) {
    const errorType = error?.name === "TimeoutError" ? "timeout" :
      error?.name === "AbortError" ? "aborted" : "other";
    console.warn("[tts] stage=" + ttsStage + " type=" + errorType);
    if (!res.headersSent) {
      reject(res, 503, "tts_provider_unavailable");
    } else if (!res.writableEnded) {
      res.end();
    }
  }
}