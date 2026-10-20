import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

const script = readFileSync(new URL("../natlas-voice.js", import.meta.url), "utf8");

class Element {
  constructor() {
    this.listeners = {};
    this.textContent = "";
    this.dataset = {};
    this.value = "";
    this.checked = false;
    this.disabled = false;
  }
  addEventListener(type, callback) {
    (this.listeners[type] ||= []).push(callback);
  }
  async emit(type) {
    for (const callback of this.listeners[type] || []) {
      await callback({ preventDefault() {} });
    }
  }
}
function lab({ transcript = "What is a payment receipt?", lang = "en-NG",
               model = "NCAIR1/NigerianAccentedEnglish", provider = "natlas" } = {}) {
  const ids = [
    "natlas-record", "natlas-stop", "natlas-submit", "natlas-check",
    "natlas-capacity", "natlas-capacity-status", "natlas-result",
    "natlas-status", "natlas-language", "natlas-passcode", "natlas-privacy",
    "natlas-send-to-assistant", "natlas-handoff-status"
  ];
  const els = Object.fromEntries(ids.map(id => [id, new Element()]));
  els["natlas-language"].value = lang;
  const events = [];
  const requests = [];
  const doc = {
    getElementById(id) { return els[id] || null; },
    dispatchEvent(event) { events.push(event); return true; }
  };
  const globals = {
    document: doc,
    navigator: { mediaDevices: {} }, window: {},
    CustomEvent: class {
      constructor(type, init) { this.type = type; this.detail = init.detail; }
    },
    fetch: async (path, options) => {
      assert.equal(path, "/api/voice");
      requests.push(JSON.parse(options.body));
      return {
        ok: true,
        json: async () => ({
          ok: true, status: "completed", provider, language: lang,
          model_id: model, transcript, duration_ms: 1750
        })
      };
    }
  };
  runInNewContext(script, globals, { timeout: 1000 });
  const finish = async () => {
    els["natlas-check"].dataset.pending = "1";
    await els["natlas-check"].emit("click");
    // The production click handler intentionally does not await a poll.
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
  };
  return { els, events, requests, finish };
}

test("a verified Nigerian English status enables explicit text-only import", async () => {
  const t = lab();
  await t.finish();
  assert.equal(t.els["natlas-result"].textContent, "What is a payment receipt?");
  assert.equal(t.els["natlas-send-to-assistant"].disabled, false);
  assert.equal(t.events.length, 0);
  assert.deepEqual(t.requests.map(x => x.action), ["status"]);
  await t.els["natlas-send-to-assistant"].emit("click");
  assert.equal(t.events.length, 1);
  assert.equal(t.events[0].type, "voicebridge:natlas-transcript-handoff");
  assert.equal(t.events[0].detail.text, "What is a payment receipt?");
  assert.equal(t.events[0].detail.language, "en-NG");
  assert.deepEqual(t.requests.map(x => x.action), ["status"]);
  // No /api/assistant, PayPal order creation or new N-ATLAS reservation.
});

test("transcripts in other supported languages are displayed but cannot be imported", async () => {
  for (const [lang, model] of [
    ["yo-NG", "NCAIR1/Yoruba-ASR"],
    ["ha-NG", "NCAIR1/Hausa-ASR"],
    ["ig-NG", "NCAIR1/Igbo-ASR"]
  ]) {
    const t = lab({ lang, model, transcript: "Educational sample" });
    await t.finish();
    assert.equal(t.els["natlas-result"].textContent, "Educational sample");
    assert.equal(t.els["natlas-send-to-assistant"].disabled, true);
    await t.els["natlas-send-to-assistant"].emit("click");
    assert.equal(t.events.length, 0);
  }
});

test("language switch revokes previous verified transcript and blocks stale handoff", async () => {
  const t = lab();
  await t.finish();
  assert.equal(t.els["natlas-send-to-assistant"].disabled, false);
  t.els["natlas-language"].value = "ha-NG";
  await t.els["natlas-language"].emit("change");
  assert.equal(t.els["natlas-send-to-assistant"].disabled, true);
  assert.match(t.els["natlas-handoff-status"].textContent, /Language changed/);
  await t.els["natlas-send-to-assistant"].emit("click");
  assert.equal(t.events.length, 0);
});

test("unverified model, mismatched language and too-short transcripts cannot be transferred", async () => {
  for (const t of [
    lab({ model: "NCAIR1/Hausa-ASR" }),
    lab({ transcript: "ok" }),
    lab({ lang: "en-NG", provider: "other" })
  ]) {
    await t.finish();
    assert.equal(t.els["natlas-send-to-assistant"].disabled, true);
    await t.els["natlas-send-to-assistant"].emit("click");
    assert.equal(t.events.length, 0);
  }
});
