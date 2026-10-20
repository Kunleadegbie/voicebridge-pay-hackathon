# Stage 3E-B3 — Restricted Financial Assistant Interface

**Status:** Prepared and reviewed on draft Pull Request #11.
**Live production status:** NOT deployed or enabled. No OpenAI API calls were
performed as part of these automated tests.

## What is now implemented

- A separate Financial Intelligence Assistant section in the existing
  `web/index.html`; it does **not** change the PayPal checkout section
  or N-ATLAS Speech Lab behavior.
- Browser script `web/financial-assistant.js`, using text questions,
  explicit consent, a short conversation in page memory, and accessibility
  status messages. No auto-transcribe, auto-submit, audio transmission,
  external payment call, or permanent browser storage.
- Vercel server-side endpoint `POST /api/assistant` with actions:
  `start`, `capacity`, `ask`, `end`.
- An independent passcode-protected, 15-minute signed HttpOnly Secure
  SameSite=Strict browser session. User passcode is cleared after unlock.
- Server-side authentication to Railway using the NEW assistant service key,
  which never appears in browser JavaScript or JSON responses.
- Origin/host and X-Requested-With checks, strict request schemas and limits,
  constrained Nigerian English text questions, and signed conversation
  context proofs. Tampered conversation history is rejected without
  contacting the AI provider.
- Verified responses are rendered through `textContent` only; model text
  cannot inject executable HTML.
- `Check AI capacity` is read-only and distinct from the existing N-ATLAS
  quota; it does not call a model or spend credits.
- Failed/uncertain Ask submissions do **not** automatically retry. The
  interface pauses Ask until a user explicitly starts a new conversation.
- The `New conversation` action clears the current in-memory discussion
  but **does not reset any quota**.
- A separate `End demo session` action clears the signed browser cookie.

## Implementation boundaries

**No direct conversation from N-ATLAS audio is introduced in B3.**
Stage 3E-B4, only after additional safety review, will explicitly transfer
a verified transcript into an editable question field after user consent.
B3 supports `source_type: typed` only.

**No changes were made to** the original
`Kunleadegbie/voicebridge-ai` repo, PayPal sandbox approval/capture logic,
RunPod worker, Hugging Face models, N-ATLAS credentials or voice quotas.

**This is not a finished public product.** There is no customer sign-in,
financial-transaction ledger, production penetration test, or assurance of
100% sensitive-data detection. A demo passcode is not a substitute for
production user authentication and anti-abuse protections.

## Activation prerequisites (do not enable without explicit approval)

The backend and frontend MUST both remain disabled until completing the
pilot-release gate. Do not merge PR #11 until those gates are met.

**Railway only:**

- `ENABLE_FINANCIAL_ASSISTANT=0` during development.
- `ASSISTANT_SERVICE_KEY`: new strong secret >=48 characters.
- `AI_PROVIDER_API_KEY`: dedicated secret API key with reviewed billing scope.
- `AI_PROVIDER_MODEL=gpt-6-luna` (exact backend allowlist for this stage).
- `ASSISTANT_DAILY_LIMIT=20` (or lower after approval).
- `ASSISTANT_TOTAL_LIMIT=100` (or lower after approval).
- Reuse the existing dedicated Upstash REST URL and token
  `VOICE_QUOTA_REDIS_REST_URL` and
  `VOICE_QUOTA_REDIS_REST_TOKEN`, with distinct assistant quota keys.

**Vercel server-side only (never `NEXT_PUBLIC_` / browser source):**

- `ENABLE_FINANCIAL_ASSISTANT=0` during development.
- `ASSISTANT_SERVICE_KEY`: same dedicated new secret as Railway.
- `ASSISTANT_SESSION_SECRET`: separate random >=48-character secret.
- `ASSISTANT_DEMO_PASSCODE`: separate strong random passcode, 16–128 chars.
- Existing `BACKEND_URL` must remain the exact current hackathon Railway
  origin. Do not change checkout or speech keys.

Store all secrets privately in the corresponding hosting service. Never
paste them into chat, screenshots, source control, browser storage,
app logs or release notes.

Before switching the feature flag to `1`, also:

1. Verify pricing, API availability, provider data retention/transfer terms,
   and an independently configured billing alert or spending safeguard.
2. Establish edge/WAF rate limits against repeated attempts to guess the
   demonstration passcode. The B3 proxy does not itself provide durable
   login-attempt throttling; the long random passcode alone is not a public
   authentication mechanism.
3. Finish Stage 3E-B4 transcript-review handoff, the 40 educational Q&A
   checks, contextual evaluations, at least 25 adversarial tests, and
   full PayPal/N-ATLAS regression checks.
4. Review feature isolation, input-data screening, unsupported financial
   claims, accessibility, and Nigerian data-privacy obligations.
5. Explicitly approve the merge and production activation; initially
   deploy OFF and test availability, then enable only for a supervised pilot.

## Recommended supervised test after separate approval

1. Confirm PayPal Sandbox and N-ATLAS flows are unchanged.
2. Confirm the assistant is disabled before private credentials are set.
3. Using one of the two approved VoiceBridge AI Pay hosts, enter the
   independent demonstration passcode and click **Unlock assistant**.
4. Click **Check AI capacity**; verify this does not change either quota.
5. Type a non-sensitive educational question, check the consent box,
   and click **Ask financial assistant** once.
6. Verify the answer explains the question and cannot approve a payment.
7. Ask a related follow-up; verify the signed context is maintained.
8. Use **New conversation** and verify context is cleared without resetting
   the daily or overall limits.
9. Test session expiry and **End demo session**.
10. Test unauthorized access, forged history, injected HTML, secrets,
    quota exhaustion, provider outage and ambiguous response handling.
    Check that no PayPal order or RunPod transcription was initiated by
    any assistant request.

## Offline automated tests

From the repository `web/` folder:

```bash
node --check api/assistant.js
node --check financial-assistant.js
npm test
```

From `backend/`:

```bash
python -m pip install -r requirements.txt
python -m pytest -q
```

Tests use mocked provider responses. They do not require real API keys,
private user data or paid provider calls.

## Known limitations and release blockers

- No independent real-provider test or business-approved AI evaluation yet.
- Responses use a small reviewed educational topic list, not live
  transaction records, current charges or financial advice.
- Demo passcode may be brute-forced without deployed edge protection;
  require WAF-based login-attempt rate limiting before enabling.
- Short histories reside in memory and are signed by the Vercel server,
  but previous chat text is still transmitted to the model when asking
  a follow-up. This must be explained in the privacy notice.
- Temporary failures may consume AI quotas; automatic retries are disabled.
- A 20-daily / 100-overall request limit is not a strict monetary budget
  ceiling. Establish provider billing controls and monitoring separately.
- Assistant is text-first only; no user-reviewed N-ATLAS transcript handoff
  or Nigerian-language TTS is introduced here.
- No production release or unqualified financial accuracy claim is approved.
