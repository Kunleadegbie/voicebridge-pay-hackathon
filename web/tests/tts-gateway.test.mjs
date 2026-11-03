import assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "node:test";
import { createHash, createHmac } from "node:crypto";
import handler from "../api/tts.js";

const originalFetch = globalThis.fetch;
const keys = [
  "VERCEL", "VERCEL_ENV", "ENABLE_FINANCIAL_ASSISTANT",
  "ENABLE_LANGA_TTS", "BACKEND_URL",
  "ASSISTANT_SESSION_SECRET", "ASSISTANT_SERVICE_KEY",
  "LANGA_TTS_API_KEY"
];
const originalEnv = Object.fromEntries(keys.map(k => [k, process.env[k]]));
const secret = "s".repeat(64);
const nonce = "a".repeat(32);
const answer = "Digital payments are electronic payments.";
const backend = "https://voicebridge-pay-hackathon-production.up.railway.app";
const langa = "https://langa.julimer.com/v1/audio/speech";

function sign(payload, purpose) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(purpose + ":" + body).digest("base64url");
  return body + "." + signature;
}

function request() {
  const session = sign({
    nonce, exp: Date.now() + 60000
  }, "assistant-session");

  const proof = sign({
    digest: createHash("sha256")
      .update("yo-NG\n" + answer, "utf8").digest("hex"),
    token_id: "b".repeat(32),
    exp: Date.now() + 60000
  }, "assistant-tts:" + nonce);

  return {
    method: "POST",
    headers: {
      origin: "https://voicebridgepay.chumcred.com",
      host: "voicebridgepay.chumcred.com",
      "x-requested-with": "VoiceBridgeTTS",
      "content-type": "application/json",
      "sec-fetch-site": "same-origin",
      "x-vercel-forwarded-for": "203.0.113.9",
      cookie: "__Host-vbpay_assistant_session=" + session
    },
    body: {
      answer,
      language: "yo-NG",
      speech_proof: proof,
      confirm_tts_privacy: true
    }
  };
}

function response() {
  return {
    statusCode: 0, headers: {},
    headersSent: false, writableEnded: false,
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers;
      this.headersSent = true;
    },
    end(body) {
      this.body = body;
      this.writableEnded = true;
    }
  };
}

beforeEach(() => {
  process.env.VERCEL = "1";
  process.env.VERCEL_ENV = "production";
  process.env.ENABLE_FINANCIAL_ASSISTANT = "1";
  process.env.ENABLE_LANGA_TTS = "1";
  process.env.BACKEND_URL = backend;
  process.env.ASSISTANT_SESSION_SECRET = secret;
  process.env.ASSISTANT_SERVICE_KEY = "a".repeat(64);
  process.env.LANGA_TTS_API_KEY = "l".repeat(40);
  globalThis.fetch = async () => {
    throw Error("Unexpected network call");
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of keys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

test("speech gateway is disabled without explicit enablement", async () => {
  delete process.env.ENABLE_LANGA_TTS;
  const res = response();
  await handler(request(), res);
  assert.equal(res.statusCode, 503);
});

test("untrusted website origin is rejected", async () => {
  const req = request();
  req.headers.origin = "https://untrusted.example";
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 403);
});

test("missing assistant session blocks speech", async () => {
  const req = request();
  delete req.headers.cookie;
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 401);
});

test("missing speech privacy consent is rejected", async () => {
  const req = request();
  req.body.confirm_tts_privacy = false;
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 422);
});

test("invalid speech proof blocks quota and provider calls", async () => {
  const req = request();
  req.body.speech_proof = "invalid-proof";
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 403);
});

test("duplicate quota reservation prevents audio generation", async () => {
  const res = response();
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls++;
    assert.equal(String(url), backend + "/api/internal/assistant/tts/reserve");
    return new Response(JSON.stringify({ detail: "duplicate" }), {
      status: 409
    });
  };
  await handler(request(), res);
  assert.equal(res.statusCode, 409);
  assert.equal(calls, 1);
});

test("valid authorized speech reserves quota before audio generation", async () => {
  const res = response();
  const calls = [];

  globalThis.fetch = async (url, options) => {
    calls.push(String(url));

    if (String(url) === backend + "/api/internal/assistant/tts/reserve") {
      assert.equal(
        options.headers["X-Assistant-Service-Key"],
        "a".repeat(64)
      );
      const reservation = JSON.parse(options.body);
      assert.equal(reservation.session_id, nonce);
      assert.equal(reservation.token_id, "b".repeat(32));
      assert.match(reservation.fingerprint, /^[a-f0-9]{64}$/);
      return new Response(JSON.stringify({ status: "reserved" }), {
        status: 200
      });
    }

    if (String(url) === langa) {
      const payload = JSON.parse(options.body);
      assert.equal(payload.voice, "yo");
      assert.equal(payload.input, answer);
      const audio = new Uint8Array(600);
      audio.set([73, 68, 51]);
      return new Response(audio, {
        status: 200,
        headers: { "content-length": "600" }
      });
    }

    throw Error("Unexpected URL");
  };

  await handler(request(), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Content-Type"], "audio/mpeg");
  assert.equal(Buffer.from(res.body).length, 600);
  assert.deepEqual(calls, [
    backend + "/api/internal/assistant/tts/reserve",
    langa
  ]);
});