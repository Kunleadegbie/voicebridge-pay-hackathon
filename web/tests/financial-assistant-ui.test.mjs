import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

const script = readFileSync(new URL("../financial-assistant.js", import.meta.url), "utf8");

class Element {
  constructor() {
    this.listeners = {};
    this.value = "";
    this.checked = false;
    this.disabled = false;
    this.dataset = {};
    this.className = "";
    this.textContent = "";
    this.children = [];
    this.parent = null;
    this.scrollTop = this.scrollHeight = 0;
  }
  addEventListener(type, callback) {
    (this.listeners[type] ||= []).push(callback);
  }
  async emit(type) {
    for (const listener of this.listeners[type] || []) {
      await listener({ preventDefault() {} });
    }
  }
  appendChild(child) {
    this.children.push(child);
    child.parent = this;
  }
  append(...children) {
    for (const child of children) this.appendChild(child);
  }
  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
  }
  querySelector(selector) {
    if (selector !== ".assistant-empty") return null;
    return this.children.find(child => child.className === "assistant-empty") || null;
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this);
  }
  focus() { this.focused = true; }
}

function ui(fetchImpl) {
  const ids = [
    "assistant-passcode", "assistant-start", "assistant-end",
    "assistant-new", "assistant-capacity", "assistant-capacity-status",
    "assistant-access-status", "assistant-status", "assistant-messages",
    "assistant-question", "assistant-review", "assistant-source-status",
    "assistant-privacy", "assistant-form", "assistant-ask"
  ];
  const els = Object.fromEntries(ids.map(id => [id, new Element()]));
  const examples = [new Element(), new Element(), new Element()];
  examples[0].dataset.question = "What is a digital payment?";
  examples[1].dataset.question = "How can I avoid payment scams?";
  examples[2].dataset.question = "What is a payment receipt?";
  const documentListeners = {};
  const doc = {
    getElementById(id) { return els[id] || null; },
    querySelectorAll(selector) { return selector === ".assistant-example" ? examples : []; },
    createElement() { return new Element(); },
    addEventListener(type, listener) {
      (documentListeners[type] ||= []).push(listener);
    }
  };
  const handoff = async (text, language = "en-NG") => {
    for (const callback of documentListeners["voicebridge:natlas-transcript-handoff"] || [])
      await callback({ detail: { text, language } });
  };
  const requests = [];
  const context = {
    document: doc,
    fetch: async (path, options) => {
      assert.equal(path, "/api/assistant");
      const body = JSON.parse(options.body);
      requests.push(body);
      return fetchImpl(body);
    },
    globalThis: {
      crypto: { randomUUID: () => "12345678-1234-4123-8123-123456789abc" }
    }
  };
  runInNewContext(script, context, { timeout: 1000 });
  return { els, examples, requests, handoff };
}
function ok(body) {
  return { ok: true, status: 200, json: async () => ({ ok: true, ...body }) };
}

test("the interface is disabled until deliberate user authentication", async () => {
  const { els, requests } = ui(async body => {
    assert.equal(body.action, "start");
    return ok({ status: "ready" });
  });
  assert.equal(els["assistant-ask"].disabled, true);
  assert.equal(els["assistant-capacity"].disabled, true);
  els["assistant-passcode"].value = "private-strong-passcode";
  await els["assistant-passcode"].emit("input");
  await els["assistant-start"].emit("click");
  assert.equal(els["assistant-ask"].disabled, true);
  assert.equal(els["assistant-question"].disabled, false);
  assert.equal(els["assistant-passcode"].value, "");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].action, "start");
});

test("capacity is a separate click and examples only fill, never submit", async () => {
  const { els, examples, requests } = ui(async body => {
    if (body.action === "start") return ok({ status: "ready" });
    if (body.action === "capacity") return ok({
      status: "available", remaining: 20, daily_limit: 20,
      daily_used: 0, lifetime_remaining: 100,
      reset_at_utc: "2026-10-19T00:00:00Z"
    });
    throw Error("No paid call authorised");
  });
  els["assistant-passcode"].value = "private";
  await els["assistant-start"].emit("click");
  await examples[0].emit("click");
  assert.equal(els["assistant-question"].value, "What is a digital payment?");
  assert.deepEqual(requests.map(x => x.action), ["start"]);
  await els["assistant-capacity"].emit("click");
  assert.deepEqual(requests.map(x => x.action), ["start", "capacity"]);
  assert.match(els["assistant-capacity-status"].textContent, /20 available/);
});

test("a deliberate question requires consent and renders AI output as text only", async () => {
  const submitted = [];
  const { els, requests } = ui(async body => {
    if (body.action === "start") return ok({ status: "ready" });
    if (body.action === "ask") {
      submitted.push(body);
      return ok({
        status: "answered", answer: "A digital payment is electronic. <script>alert(1)</script>",
        language: "en-NG", payment_action_allowed: false,
        history: [
          { role: "user", content: body.question },
          { role: "assistant", content: "A digital payment is electronic." }
        ],
        context_proof: "signed-context-placeholder"
      });
    }
    throw Error("Unexpected request");
  });
  els["assistant-passcode"].value = "private";
  await els["assistant-start"].emit("click");
  els["assistant-question"].value = "What is a digital payment?";
  await els["assistant-question"].emit("input");
  assert.equal(els["assistant-ask"].disabled, true);
  els["assistant-privacy"].checked = true;
  await els["assistant-privacy"].emit("change");
  assert.equal(els["assistant-ask"].disabled, false);
  await els["assistant-form"].emit("submit");
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].confirm_privacy, true);
  assert.equal(submitted[0].request_id, "12345678-1234-4123-8123-123456789abc");
  assert.equal(els["assistant-messages"].children.length, 2);
  const reply = els["assistant-messages"].children[1];
  assert.equal(reply.dataset.role, "assistant");
  assert.match(reply.children[1].textContent, /<script>alert\(1\)<\/script>/);
  assert.equal(requests.length, 2);
});

test("ambiguous network failure locks Ask until user deliberately starts a new conversation", async () => {
  let asks = 0;
  const { els } = ui(async body => {
    if (body.action === "start") return ok({ status: "ready" });
    if (body.action === "ask") {
      asks++;
      throw Error("Timeout after possible provider submission");
    }
    throw Error("Unexpected request");
  });
  els["assistant-passcode"].value = "private";
  await els["assistant-start"].emit("click");
  els["assistant-question"].value = "What is a digital wallet?";
  els["assistant-privacy"].checked = true;
  await els["assistant-privacy"].emit("change");
  await els["assistant-form"].emit("submit");
  assert.equal(asks, 1);
  assert.equal(els["assistant-ask"].disabled, true);
  assert.match(els["assistant-status"].textContent, /might have counted/);
  await els["assistant-form"].emit("submit");
  assert.equal(asks, 1);
  await els["assistant-new"].emit("click");
  assert.equal(els["assistant-question"].value, "");
  assert.equal(els["assistant-question"].disabled, false);
});

test("session ending clears conversation and does not initiate payments", async () => {
  const { els, requests } = ui(async body => {
    if (body.action === "start") return ok({ status: "ready" });
    if (body.action === "end") return ok({ status: "ended" });
    throw Error("No other action authorised");
  });
  els["assistant-passcode"].value = "private";
  await els["assistant-start"].emit("click");
  await els["assistant-end"].emit("click");
  assert.equal(els["assistant-question"].disabled, true);
  assert.equal(els["assistant-passcode"].value, "");
  assert.deepEqual(requests.map(x => x.action), ["start", "end"]);
});

test("import while assistant locked requires unlock and never submits", async () => {
  const { els, requests, handoff } = ui(async body => {
    if (body.action === "start") return ok({ status: "ready" });
    throw Error("Import may not contact any provider or payment service");
  });
  await handoff("What is a digital payment?");
  assert.match(els["assistant-access-status"].textContent, /Unlock/);
  assert.equal(els["assistant-question"].value, "");
  assert.equal(requests.length, 0);
  els["assistant-passcode"].value = "private";
  await els["assistant-start"].emit("click");
  await handoff("What is a digital payment?", "ha-NG");
  assert.equal(els["assistant-question"].value, "");
  assert.equal(requests.length, 1);
});

test("completed en-NG transcript copies as editable text, requires review plus AI consent", async () => {
  const { els, requests, handoff } = ui(async body => {
    if (body.action === "start") return ok({ status: "ready" });
    if (body.action === "ask") return ok({
      status: "answered", answer: "A receipt shows payment details.",
      language: "en-NG", payment_action_allowed: false,
      history: [
        { role: "user", content: body.question },
        { role: "assistant", content: "A receipt shows payment details." }
      ],
      context_proof: "signed-context-placeholder"
    });
    throw Error("Only deliberate ask may call AI");
  });
  els["assistant-passcode"].value = "private";
  await els["assistant-start"].emit("click");
  await handoff("What is a payment receive?");
  assert.equal(els["assistant-question"].value, "What is a payment receive?");
  assert.equal(els["assistant-review"].disabled, false);
  assert.equal(els["assistant-ask"].disabled, true);
  assert.deepEqual(requests.map(x => x.action), ["start"]);
  // Correct an ASR substitution and explicitly reconfirm it.
  els["assistant-question"].value = "What is a payment receipt?";
  await els["assistant-question"].emit("input");
  els["assistant-privacy"].checked = true;
  await els["assistant-privacy"].emit("change");
  assert.equal(els["assistant-ask"].disabled, true);
  els["assistant-review"].checked = true;
  await els["assistant-review"].emit("change");
  assert.equal(els["assistant-ask"].disabled, false);
  // Editing after review must revoke the approval.
  els["assistant-question"].value = "What is a receipt?";
  await els["assistant-question"].emit("input");
  assert.equal(els["assistant-review"].checked, false);
  assert.equal(els["assistant-ask"].disabled, true);
  els["assistant-review"].checked = true;
  await els["assistant-review"].emit("change");
  await els["assistant-form"].emit("submit");
  assert.deepEqual(requests.map(x => x.action), ["start", "ask"]);
  assert.equal(requests[1].source_type, "reviewed_transcript");
  assert.equal(requests[1].question, "What is a receipt?");
  assert.equal(els["assistant-review"].checked, false);
  assert.match(els["assistant-source-status"].textContent, /Previous question answered/);
});

test("oversized transcript does not truncate, guess or submit AI question", async () => {
  const { els, requests, handoff } = ui(async body => {
    if (body.action === "start") return ok({ status: "ready" });
    throw Error("No AI call authorised");
  });
  els["assistant-passcode"].value = "private";
  await els["assistant-start"].emit("click");
  await handoff("X".repeat(520));
  assert.equal(els["assistant-question"].value, "");
  assert.match(els["assistant-source-status"].textContent, /500-character/);
  assert.equal(els["assistant-ask"].disabled, true);
  assert.equal(requests.length, 1);
});

test("example and New conversation remove imported review state without spending quota", async () => {
  const { els, requests, handoff, examples } = ui(async body => {
    if (body.action === "start") return ok({ status: "ready" });
    throw Error("No AI request authorised");
  });
  els["assistant-passcode"].value = "private";
  await els["assistant-start"].emit("click");
  await handoff("What is a bank transfer?");
  els["assistant-review"].checked = true;
  await els["assistant-review"].emit("change");
  await examples[0].emit("click");
  assert.equal(els["assistant-review"].checked, false);
  assert.equal(els["assistant-review"].disabled, true);
  assert.equal(els["assistant-question"].value, "What is a digital payment?");
  await handoff("What is a payment receipt?");
  await els["assistant-new"].emit("click");
  assert.equal(els["assistant-question"].value, "");
  assert.equal(els["assistant-review"].disabled, true);
  assert.deepEqual(requests.map(x => x.action), ["start"]);
});


test("failed server-side End keeps explicit retry available and clears local question", async () => {
  let logoutCalls = 0;
  const { els } = ui(async body => {
    if (body.action === "start") return ok({ status: "ready" });
    if (body.action === "end") {
      logoutCalls++;
      if (logoutCalls === 1) return {
        ok: false, status: 503, json: async () => ({
          ok: false, reason: "assistant_access_unavailable"
        })
      };
      return ok({ status: "ended" });
    }
    throw Error("Unexpected paid request");
  });
  els["assistant-passcode"].value = "private";
  await els["assistant-start"].emit("click");
  els["assistant-question"].value = "What is an electronic payment?";
  await els["assistant-end"].emit("click");
  assert.match(els["assistant-access-status"].textContent, /not be verified/);
  assert.equal(els["assistant-end"].disabled, false);
  assert.equal(els["assistant-ask"].disabled, true);
  assert.equal(els["assistant-question"].value, "");
  await els["assistant-end"].emit("click");
  assert.equal(logoutCalls, 2);
  assert.match(els["assistant-access-status"].textContent, /revoked on the server/);
  assert.equal(els["assistant-end"].disabled, true);
});

test("backend rate-limit reason is explained without revealing the access code", async () => {
  const { els } = ui(async body => {
    if (body.action === "start") return {
      ok: false, status: 429, json: async () => ({
        ok: false, reason: "assistant_access_limited"
      })
    };
    throw Error("No model or payment calls allowed");
  });
  els["assistant-passcode"].value = "a-valid-private-code";
  await els["assistant-start"].emit("click");
  assert.match(els["assistant-access-status"].textContent, /15 minutes/);
  assert.equal(els["assistant-passcode"].value, "");
  assert.equal(els["assistant-ask"].disabled, true);
});
