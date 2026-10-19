# VoiceBridge AI Pay — Stage 3E-B5A Access Security & Deployment Preflight

**Organisation:** Chumcred Limited  
**Date:** 19 October 2026  
**Project:** VoiceBridge AI Pay — PayPal AI Hackathon  
**Development branch:** `feat/stage3eb2-secure-conversation-backend`  
**Pull request:** #11 (DRAFT)  
**Assessment:** **Access hardening implemented and offline tested; live activation NOT APPROVED.**

## 1. Executive gate decision

The pre-existing assistant prototype had a signed, 15-minute browser cookie,
but **no shared, persistent failed-attempt limiter** and **no server-side
session revocation**. A copied cookie could have remained valid after a
browser-only logout until its natural expiry.

Stage 3E-B5A addresses both issues on the independent hackathon branch:

- Every assistant demo passcode attempt is recorded in a separate
  dedicated Redis namespace **before comparing the passcode**.
- Each client fingerprint is allowed at most **5 login attempts per
  rolling 15-minute fixed window from its first attempt**, after which
  further attempts receive HTTP 429 until Redis key expiry.
- Every newly unlocked session must be **registered in Redis** before the
  browser receives its signed, HttpOnly, Secure, SameSite=Strict cookie.
- All subsequent assistant-capacity and Ask requests require **both**
  the signed, unexpired cookie and a matching **active Redis session**.
- The assistant's End demo session action **revokes the session in Redis**
  before reporting successful logout and clearing the cookie.
- An old copied cookie cannot become active merely through signature
  validity. It is rejected after revocation and when the incoming
  trusted-client fingerprint differs from the login fingerprint.
- If Redis fails at any stage, requests **fail closed**. No OpenAI
  inference, speech transcription or PayPal checkout operation is triggered.
- A logout that cannot confirm Redis revocation is described as
  **unverified**, with a retry button available; it is not labelled
  successful.

This improves the restricted demonstration security boundary. It does
not replace full end-user authentication, professional security review
or a Vercel edge WAF.

## 2. Actual implementation

| Area | New behaviour | Location |
| --- | --- | --- |
| Atomic login attempt counters | 5 attempts / 900 seconds per client; Lua EVAL, TTL | `backend/app/assistant_access.py` |
| Session registration | Random 128-bit ID, stored only as SHA-256 key | `backend/app/assistant_access.py` |
| Session check/revocation | Bind to HMAC-fingerprinted visitor; TTL 900 s | `backend/app/assistant_access.py` |
| Private authenticated API | `POST /api/internal/assistant/access` with four allowlisted actions | `backend/app/assistant_routes.py` |
| Secure browser proxy | Trusted-edge IP fingerprint, throttle BEFORE comparing demo code, active session before capacity/Ask, server revoke before cookie clearing | `web/api/assistant.js` |
| Visible logout feedback | Verified success or explicit retry on storage failure | `web/financial-assistant.js` |
| Automated controls | Mock Redis, untrusted headers, login lockout, cross-IP replay, revoked cookie, logout retry | `backend/tests/test_assistant_access.py`, `web/tests/assistant.test.mjs`, `web/tests/financial-assistant-ui.test.mjs` |

### Data minimisation

Vercel reads the proxy-generated client-IP header supplied by its normal
edge network configuration, then computes an **HMAC-SHA-256**
fingerprint using the separate `ASSISTANT_SESSION_SECRET`.

Redis stores this **fingerprint**, counters, and an independent
SHA-256 hash of the random session ID. It stores **no raw IP address,
passcode, question, answer, N-ATLAS transcript, audio or PayPal data**
under the new session/access keys.

Security keys use `vbpay:{assistant-access}:`. They are separate from
existing `vbpay:{assistant-pilot}:` AI quotas and
`vbpay:{natlas-pilot}:` voice quotas.

Vercel must be the trusted first ingress for deriving these headers.
If the expected trusted IP header is missing, malformed or contains a
spoofable forwarded chain, the proxy denies the session rather than
inventing a client identifier.

**Operational caution:** a user's network change during a short session
can invalidate their session. This is a safety-first trade-off for a
restricted pilot. Shared office or mobile carrier NATs can also share
a 5-attempt allowance, so use strong unique demo codes and tightly
supervised testers.

Source for Vercel edge headers:  
https://vercel.com/docs/headers/request-headers

## 3. Host and environment inventory — NOT YET VERIFIED LIVE

### Railway backend (hackathon app only)

| Variable | Required when activating | Status |
| --- | --- | --- |
| `ENABLE_FINANCIAL_ASSISTANT` | Must remain `0` or unset until approval | **Not independently checked in Railway dashboard** |
| `ASSISTANT_SERVICE_KEY` | New independent strong value, at least 48 chars | **Not provisioned here** |
| `AI_PROVIDER_API_KEY` | Restricted provider project key, backend only | **Not provisioned here** |
| `AI_PROVIDER_MODEL` | Exact tested model ID, initially `gpt-6-luna` | **Not independently checked** |
| `ASSISTANT_DAILY_LIMIT` | Proposed 20 | **Not yet activated** |
| `ASSISTANT_TOTAL_LIMIT` | Proposed 100 | **Not yet activated** |
| `VOICE_QUOTA_REDIS_REST_URL` | Existing dedicated Upstash REST URL | **Previously configured for N-ATLAS; not read afresh** |
| `VOICE_QUOTA_REDIS_REST_TOKEN` | Existing token; unchanged | **Previously configured for N-ATLAS; not read afresh** |

**Do not change** `ENABLE_NATLAS_VOICE`, the RunPod endpoint/keys,
`VOICE_DEMO_DAILY_LIMIT`, `VOICE_DEMO_TOTAL_LIMIT`, PayPal credentials,
`ENABLE_PUBLIC_DEMO_CHECKOUT` or `CHECKOUT_SERVICE_KEY` as part of B5A.

### Vercel frontend (hackathon website only)

| Variable | Required when activating | Status |
| --- | --- | --- |
| `ENABLE_FINANCIAL_ASSISTANT` | Must remain `0` or unset until approval | **Not independently checked in Vercel dashboard** |
| `ASSISTANT_SERVICE_KEY` | Same new assistant-only secret as Railway | **Not provisioned here** |
| `ASSISTANT_SESSION_SECRET` | Independent strong random secret, at least 48 chars | **Not provisioned here** |
| `ASSISTANT_DEMO_PASSCODE` | New separate random 16–128 char code | **Not provisioned here** |
| `BACKEND_URL` | Must remain the existing hackathon Railway backend | **Code checks exact expected URL** |

Do not expose secrets in ChatGPT, GitHub PRs, screenshots, public browser
JavaScript, logs, Slack or email. No secret values are required to complete
this review.

## 4. Required external release checks

These are not completed simply because unit tests pass.

| Check | Current evidence | Required before real user access |
| --- | --- | --- |
| Shared login throttle | Offline Redis mock and proxy tests | Supervised live test with dedicated assistant flag enabled and safe non-production values |
| Session logout/replay | Offline tests | Demonstrate revoked cookie fails in live deployed environment |
| IP header correctness | Vercel docs + mocked header | Confirm genuine edge header on approved host; no user IP exposure |
| WAF abuse protection | **Not configured or verified** | Review Vercel Firewall custom rule/challenge/rate limit for `/api/assistant`; deploy only with approval |
| Redis outage fallback | Mocked 503 response | Demonstrate safe refusal without disturbing voice quota |
| OpenAI account billing | **Not verified** | Dedicated API project/key, spending alerts, user-approved test budget |
| Provider data privacy | **Not signed off** | Review actual provider terms, consent and Nigeria-related data transfer/retention |
| Knowledge accuracy | Initial curated notes | Independent subject-matter review |
| Model response evaluation | 40 Q&A / 10 dialogues registered, not scored | Minimum 36/40 correct, 9/10 contextual, 25/25 safety with evidence |
| Browser compatibility | Node DOM mocks | Windows Chrome, iPhone Safari, iPad Safari and accessibility checks |
| Existing PayPal/N-ATLAS | Existing controlled pilot success | Re-verify without changing their configurations |
| Owner approval | **None** | Separate explicit approval for any paid smoke test, merge or production activation |

Vercel Firewall custom rules can be inspected under
**Vercel project → Firewall → Configure**. Where available, use a
log-first, then carefully evaluated challenge/deny/rate-limit policy
targeted to `/api/assistant` (not PayPal or N-ATLAS endpoints).
**Do not configure any WAF policy blindly**: custom or rate-limiting
features may have plan-dependent charges and could block legitimate
testers. See: https://vercel.com/docs/vercel-firewall/vercel-waf/custom-rules

## 5. Controlled offline verification

From the repository `backend` folder, run:
```bash
python -m pytest -q
```

From the `web` folder, run:
```bash
npm test
```

The new tests must confirm:

1. Authentication disabled-by-default (503) and wrong service key (401).
2. Five passes through the attempt gate, followed by a sixth blocked
   attempt (429), including if the final passcode is correct.
3. Separate fingerprints do not share rate-limit keys.
4. Session register, validate and revoke are atomic, namespace-isolated
   Redis commands. Sensitive identity is never stored directly.
5. Old signed cookies fail after successful server-side logout.
6. Sessions are rejected if the trusted client IP fingerprint changes.
7. Missing or malformed trusted headers fail closed.
8. Redis outage prevents both new login and continued use.
9. Logout storage failures are disclosed and can be retried.
10. No assistant call can approve/capture PayPal or submit an N-ATLAS job.
11. Existing frontend/backend/cloud suites still pass.

**All storage/network interactions in those tests are simulated.**
Even a green CI result cannot replace a supervised live environment test.

## 6. Budget and privacy preflight

- The separately agreed provider is GPT-6 Luna, subject to availability,
  quality evaluation, current published token prices and provider
  account eligibility.
- The proposed USD $5 spending envelope is a **management target, not
  a guaranteed hard spending cap**.
- The application implements a separate 20-daily / 100-overall assistant
  quota and maximum response-token budget. It does not change the
  already configured N-ATLAS quotas.
- `store: false` does not promise Zero Data Retention. Review the
  provider's current retention and abuse-monitoring terms.
- Do not collect OTPs, passwords, account data or other private
  financial information in the B5A evaluation.

## 7. Stage-gate conclusion

**Completed now:** Code-level access throttling, revocable sessions,
cross-fingerprint checks, safer logout UI and offline tests.

**Not completed:** Live hosting configuration verification, WAF
activation, provider and privacy review, real-model financial QA,
real browser tests, live payment/voice regression and formal owner
approval.

**Decision:** **B5A implementation prepared; production release NO-GO.**

Keep GitHub PR #11 in **draft**, do not merge it, and keep the assistant
flags **unset or `0`** on Railway and Vercel.

**Next single user-assisted checkpoint:** Verify the new assistant
feature flag is **absent or set to 0** in the existing Vercel project's
environment variables. A screenshot should show only the variable
**names and status**, never any values/secrets. No secrets should
be sent in chat.
