# VoiceBridge AI Pay — PayPal AI Hackathon 2026

A sandbox-only prototype by Chumcred Limited, extending the existing VoiceBridge AI financial-literacy assistant into accessible voice-assisted payments.

## Current implementation — Stage 1

The backend demonstrates PayPal sandbox OAuth authentication and controlled test-order creation. The demo order amount is USD 5.00, fixed in server-side code. Payment routes require an X-Demo-Key header for private tests.

**Not yet implemented:** buyer approval and capture, voice-driven payment commands, AI interpretation and the final interface. No real payments are supported.

## Local setup — Windows PowerShell

From the backend directory:

1. Create a virtual environment: py -m venv .venv
2. Activate it: .venv\Scripts\Activate.ps1
3. Install dependencies: pip install -r requirements.txt
4. Set three environment variables: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, DEMO_ACCESS_KEY. Only use PayPal *sandbox* credentials.
5. Run the app: uvicorn app.main:app --reload --port 8080

Example PowerShell requests:

- Health: Invoke-RestMethod http://127.0.0.1:8080/health
- Authenticate: Invoke-RestMethod http://127.0.0.1:8080/api/paypal/connectivity -Headers @{ "X-Demo-Key" = $env:DEMO_ACCESS_KEY }
- Create order: $body = @{ item_code = "financial-literacy-demo" } | ConvertTo-Json
- Invoke-RestMethod http://127.0.0.1:8080/api/paypal/orders -Method Post -ContentType "application/json" -Headers @{ "X-Demo-Key" = $env:DEMO_ACCESS_KEY } -Body $body

This creates a sandbox order but does NOT capture a payment.

## Run tests

From the backend directory, run: pytest -q

Tests use mocked PayPal responses, no external calls or real credentials.

## Security and boundaries

- All requests target the official api-m.sandbox.paypal.com hostname.
- Secrets remain in environment variables; never commit them or paste them into frontend code.
- Do not expose these private testing endpoints publicly or embed the demo access key in browser JavaScript. A proper authenticated user flow is planned in Stage 2.
- No raw access tokens or raw PayPal API error bodies are returned to users.
- The production VoiceBridge AI repository and live website are unchanged.
- Check N-ATLAS licensing, attribution and open-source competition requirements before copying components.

See docs/ROADMAP.md for subsequent milestones.
