# Stage 3C — Private PayPal Sandbox Checkout Verification

These are **developer-only routes** requiring the existing \`X-Demo-Key\` authorization, which must only be supplied in secure local tests. Never embed the demo key in the public frontend.

**Prerequisite:** Sandbox order successfully created with the fixed USD 5.00 amount (Stage 3B).

## Flow

1. Create the test order with the existing private endpoint. Capture the \`order_id\` and \`approve_url\` in your PowerShell session.
2. Open the approval URL in a separate browser and sign in as a **PayPal Sandbox Personal (buyer)** test account. Do not use real PayPal buyer credentials.
3. The buyer explicitly approves the $5.00 sandbox order on PayPal's sandbox website.
4. Call \`GET /api/paypal/orders/{order_id}/status\` with \`X-Demo-Key\`. Status must become \`APPROVED\`. Do not mistake \`CREATED\` for approval.
5. When the buyer confirms, use \`POST /api/paypal/orders/{order_id}/capture\` with body \`{"confirm":true}\` and \`X-Demo-Key\`.
6. Verify that PayPal reports order \`COMPLETED\` and a completed $5.00 capture. Only then display success.

Capture is refused if the buyer has not approved, if the order is not a $5.00 USD CAPTURE order, or if the API key is invalid. Repeat requests for an already completed order are read-only when PayPal reports a completed capture. PayPal-Request-Id is stable for retries; it is not a substitute for an application transaction database.

## Example (local PowerShell session, backend remains cloud-hosted)

Never paste your private key into the terminal command line or chat. Use the existing \`$env:DEMO_ACCESS_KEY\` session variable.

    $base = "https://voicebridge-pay-hackathon-production.up.railway.app"
    $orderId = $order.order_id # From Stage 3B, or paste only the sandbox order ID
    $headers = @{ "X-Demo-Key" = $env:DEMO_ACCESS_KEY }
    Invoke-RestMethod -Uri "$base/api/paypal/orders/$orderId/status" -Headers $headers

Only after buyer approval:

    Invoke-RestMethod -Uri "$base/api/paypal/orders/$orderId/capture" -Method Post -ContentType "application/json" -Headers $headers -Body '{"confirm":true}'

## Known limitations — do not expose as customer checkout

- This stage supports an administrator's manual sandbox demonstration only.
- It has no customer-bound identity/session, durable transaction database, CSRF protection, or webhook reconciliation.
- **Do not** call these backend routes directly from public Vercel browser JavaScript, expose the demo key, or describe this as a finished customer payment flow.
- We will implement user-controlled approval, durable transaction state, CSRF/rate limiting, and hosted multilingual AI before hackathon demo publication.
- This stage does not touch the original VoiceBridge AI deployment, and real money cannot be captured because PayPal uses only sandbox credentials and endpoints.
