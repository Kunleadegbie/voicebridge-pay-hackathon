"use strict";

// PayPal may redirect with token/PayerID query params. Do not retain them in
// the browser address bar or read them as proof of approval. Our signed session
// cookie identifies the one server-side verified sandbox order.
if (window.location.search) {
  window.history.replaceState(null, "", window.location.pathname);
}

const verifyButton = document.getElementById("pilot-verify");
const captureButton = document.getElementById("pilot-capture");
const statusLine = document.getElementById("pilot-result");
let lastVerified = null;

async function request(action, confirm = false) {
  const response = await fetch("/api/checkout", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "VoiceBridgePay"
    },
    body: JSON.stringify({ action, confirm }),
    cache: "no-store"
  });
  const data = await response.json();
  if (!response.ok || data.ok !== true) {
    if (data.reason === "session_expired") {
      throw new Error("Your signed sandbox checkout session has expired. Start a new order from the homepage.");
    }
    if (data.reason === "checkout_not_configured") {
      throw new Error("Cloud checkout is not yet enabled. Contact the test coordinator.");
    }
    if (data.reason === "buyer_approval_required") {
      throw new Error("PayPal has not yet approved the order. Do not attempt capture.");
    }
    throw new Error("Unable to verify the sandbox payment right now. Retry status before another action.");
  }
  return data;
}

function validFixedOrder(data) {
  return data.currency === "USD" &&
    String(data.amount) === "5.00" &&
    typeof data.order_id === "string";
}

verifyButton.addEventListener("click", async () => {
  captureButton.disabled = true;
  verifyButton.disabled = true;
  statusLine.textContent = "Checking the actual PayPal sandbox order…";
  try {
    const info = await request("status");
    if (!validFixedOrder(info)) throw new Error("Order amount mismatch. Capture is blocked.");
    lastVerified = info;
    if (info.status === "COMPLETED" && info.capture_status === "COMPLETED") {
      statusLine.textContent = "Sandbox payment COMPLETED. Capture reference: " + String(info.capture_id || "unavailable") + ".";
    } else if (info.status === "APPROVED") {
      statusLine.textContent = "PayPal confirms APPROVED for USD $5.00. To capture the simulated payment, click the separate confirmation button below.";
      captureButton.disabled = false;
    } else {
      statusLine.textContent = "PayPal order status: " + info.status + ". Payment is not approved for capture.";
    }
  } catch (error) {
    statusLine.textContent = error.message || "Sandbox verification unavailable.";
  } finally {
    verifyButton.disabled = false;
  }
});

captureButton.addEventListener("click", async () => {
  if (captureButton.disabled || lastVerified?.status !== "APPROVED" ||
      !validFixedOrder(lastVerified)) return;
  captureButton.disabled = true;
  verifyButton.disabled = true;
  statusLine.textContent = "Requesting a simulated USD $5.00 capture and verifying PayPal's response…";
  try {
    const result = await request("capture", true);
    if (!validFixedOrder(result) ||
        result.status !== "COMPLETED" || result.capture_status !== "COMPLETED") {
      throw new Error("PayPal has not confirmed a completed sandbox capture.");
    }
    lastVerified = result;
    statusLine.textContent = "Sandbox capture COMPLETED for USD $5.00. PayPal capture reference: " +
      String(result.capture_id || "unavailable") + ". No real money was transferred.";
  } catch (error) {
    statusLine.textContent = error.message || "Capture status uncertain. Use Verify PayPal approval to check the actual order before retrying.";
  } finally {
    verifyButton.disabled = false;
  }
});
