import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { verifySpeechProof } from "../api/tts-proof.js";

const secret = "s".repeat(64);
const nonce = "a".repeat(32);
const answer = "Digital payments allow electronic transfers.";

function makeProof(language = "yo-NG", text = answer, session = nonce, expires = Date.now() + 60000) {
  const payload = {
    digest: createHash("sha256")
      .update(language + "\n" + text, "utf8").digest("hex"),
    token_id: randomBytes(16).toString("hex"),
    exp: expires
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update("assistant-tts:" + session + ":" + body)
    .digest("base64url");
  return body + "." + signature;
}

for (const language of ["yo-NG", "ha-NG", "ig-NG"]) {
  test("valid signed speech proof for " + language, () => {
    const token = makeProof(language);
    const verified = verifySpeechProof(token, answer, language, nonce, secret);
    assert.match(verified?.token_id || "", /^[a-f0-9]{32}$/);
  });
}

test("modified answer is rejected", () => {
  assert.equal(verifySpeechProof(
    makeProof(), answer + " Changed.", "yo-NG", nonce, secret
  ), null);
});

test("wrong language is rejected", () => {
  assert.equal(verifySpeechProof(
    makeProof("yo-NG"), answer, "ha-NG", nonce, secret
  ), null);
});

test("wrong assistant session is rejected", () => {
  assert.equal(verifySpeechProof(
    makeProof(), answer, "yo-NG", "b".repeat(32), secret
  ), null);
});

test("expired speech proof is rejected", () => {
  assert.equal(verifySpeechProof(
    makeProof("yo-NG", answer, nonce, Date.now() - 10000),
    answer, "yo-NG", nonce, secret
  ), null);
});

test("tampered signature is rejected", () => {
  const token = makeProof();
  const [body, signature] = token.split(".");
  const changed = (signature[0] === "A" ? "B" : "A") + signature.slice(1);
  assert.equal(verifySpeechProof(
    body + "." + changed, answer, "yo-NG", nonce, secret
  ), null);
});

test("English cannot use the Langa speech proof endpoint", () => {
  assert.equal(verifySpeechProof(
    makeProof("en-NG"), answer, "en-NG", nonce, secret
  ), null);
});