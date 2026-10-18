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
    "assistant-question", "assistant-privacy", "assistant-form",
    "assistant-ask"
  ];
  const els = Object.fromEntries(ids.map(id => [id, new Element()]));
  const examples = [new Element(), new Element(), new Element()];
  examples[0].dataset.question = "What is a digital payment?";
  examples[1].dataset.question = "How can I avoid payment scams?";
  examples[2].dataset.question = "What is a payment receipt?";
  const doc = {
    getElementById(id) { return els[id] || null; },
    querySelectorAll(selector) { return selector === ".assistant-example" ? examples : []; },
    createElement() { return new Element(); }
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
  return { els, examples, requests };
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
