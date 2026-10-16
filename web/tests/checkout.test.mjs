import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/checkout.js";

const ORIGIN = "https://voicebridge-pay-hackathon-web.vercel.app";
const ID = "2E2603450P696001B";
const APPROVE = "https://www.sandbox.paypal.com/checkoutnow?token=TEST-ORDER";
const saved = { ...process.env };
const originalFetch = globalThis.fetch;

function configure() {
  process.env.BACKEND_URL = "https://voicebridge-pay-hackathon-production.up.railway.app";
  process.env.ENABLE_PUBLIC_DEMO_CHECKOUT = "1";
  process.env.CHECKOUT_SERVICE_KEY = "k".repeat(64);
  process.env.CHECKOUT_SESSION_SECRET = "s".repeat(64);
}

function makeRequest(body, cookie = "") {
  return {
    method: "POST",
    headers: {
      "origin": ORIGIN,
      "content-type": "application/json",
      "x-requested-with": "VoiceBridgePay",
      "sec-fetch-site": "same-origin",
      "cookie": cookie
    },
    body
  };
}

function makeResponse() {
  const headers = new Map();
  return {
    statusCode: 200, headers, data: null,
    setHeader(k, v) { headers.set(k.toLowerCase(), v); },
    end(value) { this.data = JSON.parse(value); }
  };
}

function upstream(approved = false) {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    const target = new URL(url);
    calls.push({ path: target.pathname, method: opts.method, key: opts.headers["X-Checkout-Service-Key"] });
    if (target.pathname === "/api/internal/checkout/orders" && opts.method === "POST") {
      return new Response(JSON.stringify({
        order_id: ID, status: "CREATED", currency: "USD",
        amount: "5.00", approve_url: APPROVE
      }), { status: 201 });
    }
    if (target.pathname.endsWith("/status")) {
      return new Response(JSON.stringify({
        order_id: ID, status: approved ? "APPROVED" : "CREATED",
        currency: "USD", amount: "5.00", capture_status: null, capture_id: null
      }), { status: 200 });
    }
    if (target.pathname.endsWith("/capture") && opts.method === "POST") {
      return new Response(JSON.stringify({
        order_id: ID, status: "COMPLETED", currency: "USD",
        amount: "5.00", capture_status: "COMPLETED", capture_id: "DEMO-CAPTURE-ID"
      }), { status: 200 });
    }
    throw new Error("Unexpected upstream request");
  };
  return calls;
}

test("feature disabled by default", async () => {
  delete process.env.ENABLE_PUBLIC_DEMO_CHECKOUT;
  const response = makeResponse();
  await handler(makeRequest({ action: "create", item_code: "financial-literacy-demo", confirm: true }), response);
  assert.equal(response.statusCode, 503);
  assert.equal(response.data.reason, "checkout_not_configured");
});

test("rejects cross-origin and missing deliberate click header", async () => {
  configure();
  let request = makeRequest({ action: "create", item_code: "financial-literacy-demo", confirm: true });
  request.headers.origin = "https://attacker.example";
  let response = makeResponse();
  await handler(request, response);
  assert.equal(response.statusCode, 403);
  request = makeRequest({ action: "create", item_code: "financial-literacy-demo", confirm: true });
  delete request.headers["x-requested-with"];
  response = makeResponse();
  await handler(request, response);
  assert.equal(response.statusCode, 403);
});

test("explicit confirmation and fixed catalog item mandatory", async () => {
  configure();
  let response = makeResponse();
  await handler(makeRequest({ action: "create", item_code: "financial-literacy-demo", confirm: false }), response);
  assert.equal(response.statusCode, 422);
  response = makeResponse();
  await handler(makeRequest({ action: "create", item_code: "evil-price", confirm: true }), response);
  assert.equal(response.statusCode, 422);
});

test("create signed cookie, verify payment, block premature capture", async () => {
  configure();
  const calls = upstream(false);
  const created = makeResponse();
  await handler(makeRequest({ action: "create", item_code: "financial-literacy-demo", confirm: true }), created);
  assert.equal(created.statusCode, 201);
  assert.equal(created.data.approve_url, APPROVE);
  const cookie = created.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly; Secure; SameSite=Lax; Path=\//);
  const cookieValue = cookie.split(";")[0];
  const verified = makeResponse();
  await handler(makeRequest({ action: "status" }, cookieValue), verified);
  assert.equal(verified.statusCode, 200);
  assert.equal(verified.data.status, "CREATED");
  const premature = makeResponse();
  await handler(makeRequest({ action: "capture", confirm: true }, cookieValue), premature);
  assert.equal(premature.statusCode, 409);
  assert.equal(premature.data.reason, "buyer_approval_required");
  assert.equal(calls.some((x) => x.path.endsWith("/capture")), false);
  assert.equal(calls.every((x) => x.key === "k".repeat(64)), true);
});

test("approved order captured only with explicit independent confirmation", async () => {
  configure();
  const calls = upstream(true);
  const created = makeResponse();
  await handler(makeRequest({ action: "create", item_code: "financial-literacy-demo", confirm: true }), created);
  const cookie = created.headers.get("set-cookie").split(";")[0];
  const bad = makeResponse();
  await handler(makeRequest({ action: "capture", confirm: false }, cookie), bad);
  assert.equal(bad.statusCode, 422);
  assert.equal(calls.some((x) => x.path.endsWith("/capture")), false);
  const capture = makeResponse();
  await handler(makeRequest({ action: "capture", confirm: true }, cookie), capture);
  assert.equal(capture.statusCode, 200);
  assert.equal(capture.data.status, "COMPLETED");
  assert.equal(capture.data.capture_status, "COMPLETED");
  assert.equal(calls.filter((x) => x.path.endsWith("/capture")).length, 1);
});

test("tampered session cookie cannot approve or capture", async () => {
  configure();
  const calls = upstream(true);
  const created = makeResponse();
  await handler(makeRequest({ action: "create", item_code: "financial-literacy-demo", confirm: true }), created);
  const cookie = created.headers.get("set-cookie").split(";")[0];
  const tampered = cookie.slice(0, -4) + "XXXX";
  const response = makeResponse();
  await handler(makeRequest({ action: "capture", confirm: true }, tampered), response);
  assert.equal(response.statusCode, 401);
  assert.equal(calls.some((x) => x.path.endsWith("/capture")), false);
});

test.after(() => {
  globalThis.fetch = originalFetch;
  for (const key of ["BACKEND_URL", "ENABLE_PUBLIC_DEMO_CHECKOUT", "CHECKOUT_SERVICE_KEY", "CHECKOUT_SESSION_SECRET"]) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});
