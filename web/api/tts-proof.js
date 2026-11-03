"use strict";

// VoiceBridge AI Pay: staging-only speech authorization verification.
// No API calls, payments, credentials in browser, or external dependencies.

import {
  createHash, createHmac, timingSafeEqual
} from "node:crypto";

const LANGUAGES = new Set(["yo-NG", "ha-NG", "ig-NG"]);
const HEX32 = /^[a-f0-9]{32}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const MAX_PROOF_AGE = 5 * 60 * 1000;

export function verifySpeechProof(
  token, answer, language, sessionNonce, secret
) {
  if (
    typeof token !== "string" ||
    token.length < 20 || token.length > 1000 ||
    typeof answer !== "string" ||
    answer.trim().length < 2 || answer.length > 1300 ||
    !LANGUAGES.has(language) ||
    typeof sessionNonce !== "string" ||
    !HEX32.test(sessionNonce) ||
    typeof secret !== "string" || secret.length < 48
  ) {
    return null;
  }

  const parts = token.split(".");

  if (
    parts.length !== 2 ||
    !BASE64URL.test(parts[0]) ||
    !BASE64URL.test(parts[1])
  ) {
    return null;
  }

  try {
    const expected = createHmac("sha256", secret)
      .update("assistant-tts:" + sessionNonce + ":" + parts[0])
      .digest();

    const supplied = Buffer.from(parts[1], "base64url");

    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      return null;
    }

    const proof = JSON.parse(
      Buffer.from(parts[0], "base64url").toString("utf8")
    );

    if (
      !proof || typeof proof !== "object" ||
      Array.isArray(proof) ||
      !Number.isSafeInteger(proof.exp) ||
      proof.exp <= Date.now() ||
      proof.exp > Date.now() + MAX_PROOF_AGE ||
      typeof proof.token_id !== "string" ||
      !HEX32.test(proof.token_id) ||
      typeof proof.digest !== "string" ||
      !HEX64.test(proof.digest)
    ) {
      return null;
    }

    const digest = createHash("sha256")
      .update(language + "\n" + answer, "utf8")
      .digest();

    if (!timingSafeEqual(
      Buffer.from(proof.digest, "hex"), digest
    )) {
      return null;
    }

    return { token_id: proof.token_id };
  } catch {
    return null;
  }
}