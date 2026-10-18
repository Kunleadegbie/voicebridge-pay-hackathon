# Stage 3E-B2 — Private Conversational Financial Intelligence Backend

Status: **development branch only; must remain disabled** until explicit release
approval after tests and Stage 3E-B3 browser proxy review.

## Scope and isolation

- Adds a private, *text-first*, educational API under `/api/internal/assistant/`.
- The default and required launch setting is **`ENABLE_FINANCIAL_ASSISTANT=0`**.
- Does not modify PayPal order creation, approval or capture paths, the N-ATLAS
  provider, or the original `Kunleadegbie/voicebridge-ai` repository.
- No browser-facing assistant endpoint, chatbot interface or voice-to-assistant
  auto-transfer is introduced here; those are later gated stages.
- No OpenAI account billing or live calls were used during this branch's tests.
- The AI model receives no tools/function-calling capabilities or payment keys.
- Responses are educational only, never evidence of a real account status.
- Nigerian English only until independent language evaluation is completed.

## Server-side configuration (Railway, not the browser)

Do **not** add these before deciding to activate a supervised demo:

| Variable | Description |
| --- | --- |
| `ENABLE_FINANCIAL_ASSISTANT` | Default 0; set to 1 only after release gates |
| `ASSISTANT_SERVICE_KEY` | Independent random secret, at least 48 chars; future Vercel proxy must match |
| `AI_PROVIDER_API_KEY` | Private OpenAI API key, Railway only, not the ChatGPT subscription |
| `AI_PROVIDER_MODEL` | `gpt-6-luna` only in Stage 3E-B2 |
| `ASSISTANT_DAILY_LIMIT` | Default 20, bounded to 1–100 |
| `ASSISTANT_TOTAL_LIMIT` | Default 100, bounded to 1–500 |

The assistant quota **reuses the dedicated Upstash database** through the
existing `VOICE_QUOTA_REDIS_REST_URL` and
`VOICE_QUOTA_REDIS_REST_TOKEN`, but stores counters under
`vbpay:{assistant-pilot}:` rather than the N-ATLAS namespace
`vbpay:{natlas-pilot}:`. Do not alter existing N-ATLAS limits.

## Private API

Both endpoints require `X-Assistant-Service-Key` and enabled + valid
server-side provider configuration. Never expose this key to the browser.

### `GET /api/internal/assistant/capacity`

Read-only; does not reserve quota or contact OpenAI.

Example response shape:

```json
{
  "status": "available",
  "remaining": 20,
  "daily_limit": 20,
  "daily_used": 0,
  "lifetime_remaining": 100,
  "reset_at_utc": "2026-10-19T00:00:00Z"
}
```

### `POST /api/internal/assistant/respond`

Body shape (user-confirmed text only):

```json
{
  "request_id": "12345678-1234-4123-8123-123456789abc",
  "language": "en-NG",
  "source_type": "typed",
  "question": "What is a digital payment?",
  "history": [],
  "confirm_privacy": true
}
```

- Unique UUID4-shaped `request_id` per intentional Ask event.
- Question length 3–500 chars.
- At most 8 recent, bounded text history turns (max 2,800 chars together).
- `source_type` accepts only `typed` in this stage. Direct unreviewed
  transcription is explicitly unsupported.
- `extra=forbid` rejects injected payment parameters.
- Obvious credentials and action requests are locally refused before quota
  reservation. This screening is not a substitute for full privacy review.
- Unsupported questions receive a clarification without spending quota.
- Supported questions reserve quota atomically in Upstash before a provider
  call. Duplicate request IDs are rejected with 409 and do not call the model.
- If the provider fails or times out after reservation, it is **not retried
  automatically**, and the reservation is **not refunded**.
- Upstash outage or misconfiguration fails closed, with no model call.
- Normal response includes `status`, `category`, `answer`,
  `source_ids`, `follow_up_suggestion`, `safety_notice`, `language`,
  and `payment_action_allowed: false`. A source ID identifies an internal,
  reviewed topic, not a claim of live citation.
- OpenAI Responses API uses `store: false`, `reasoning.effort: none`,
  `max_output_tokens: 500`, strict structured outputs, and **no tools**.
  This does not establish zero data retention at the provider.

## Additional release prerequisites

- Confirm the target OpenAI API project/key is enabled, scoped and funded.
- Review current API prices and configure billing alerts; a Redis request
  allowance is not an absolute hard-dollar spending cap.
- Review provider retention and Nigerian privacy obligations before wider
  data processing.
- Build a private, same-origin Vercel proxy with passcode, CSRF/origin checks,
  bounded payloads and independently signed session handling (Stage 3E-B3).
  Never invoke these internal routes from browser JavaScript with a service key.
- Validate 40 educational questions, 10 contextual dialogues and at least
  25 safety/adversarial tests before opening the pilot.
- Complete negative payment-action tests and the existing PayPal/voice
  regression suites.
- Approve deployment separately. A draft PR may run CI but should not be
  merged into the production branch until those gates are satisfied.

## Offline tests

```bash
cd backend
python -m pip install -r requirements.txt
python -m pytest -q
```

Tests mock OpenAI and Upstash; no API credentials or billable operations
are required.
