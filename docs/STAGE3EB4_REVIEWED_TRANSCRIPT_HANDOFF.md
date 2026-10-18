# Stage 3E-B4 — Explicit, Reviewed N-ATLAS Transcript → Financial Assistant

**Status:** Implemented for development review in draft PR #11 only.  
**Deployment:** Not merged or enabled. No live API credentials were added or used.

## Purpose and security boundary

Stage 3E-B4 adds a **browser-only copy** from the already established
N-ATLAS Speech Lab to the separate Stage 3E-B3 text-first assistant.
This copy is **not an AI request** and can never create, authorise, capture
or refund a PayPal transaction.

The first approved handoff language is **Nigerian English (`en-NG`) only**.
N-ATLAS may still transcribe Yoruba, Hausa and Igbo inside the speech lab,
but a button to send those texts to the English financial assistant is
**disabled** pending separate language-quality validation. Users may
manually write an English financial-literacy question in the assistant.

## Required user journey

1. The N-ATLAS Speech Lab continues to operate under its existing restricted
   demo passcode, explicit privacy consent and **separate speech quota**.
2. The user deliberately records and submits a short Nigerian English sample.
3. The browser waits for a **completed and verified** N-ATLAS result through
   the existing Vercel voice proxy. The proxy confirms the model identity.
4. After completion the new **Use reviewed transcript as AI question** button
   becomes available only when the selected language and result agree on
   `en-NG` and the model is `NCAIR1/NigerianAccentedEnglish`.
5. The user unlocks the *separately protected* Financial Intelligence Assistant.
6. The user **clicks the transfer button**. It copies text locally into an
   editable question box. It does not contact OpenAI, Railway, RunPod or
   PayPal, and does not consume any quota.
7. The user reads the whole text, corrects any N-ATLAS recognition mistakes
   and checks **I have reviewed this text**. Every subsequent edit cancels
   this confirmation until it is checked again.
8. The user separately consents to send this question and recent context
   to the external AI provider.
9. Only a new deliberate click on **Ask financial assistant** may submit
   the reviewed English text through `/api/assistant`. This is the first
   step that may reserve **one separate conversational AI slot**.
10. The backend runs the exact same financial-safety, privacy, quota, provider
    and payment-isolation checks as it does for any manually typed question.

**If the assistant is locked:** the voice transcript remains available in
the speech lab; the user must first unlock the assistant and then click the
transfer button again. No speech or AI job is created by that retry.

**If the completed transcript exceeds 500 characters:** the browser refuses
the import rather than silently truncating or changing its meaning. The user
may type a shorter English question instead.

**If a new recording begins or language is changed:** the old handoff
eligibility is invalidated immediately; previously displayed text can no
longer be transferred as a current English result.

## Data / trust architecture

The existing Vercel `/api/voice` endpoint has already checked the RunPod
model identity when it returned the completed transcript. The speech-lab
browser script makes the text available to the assistant section only
after a completed `en-NG` result.

That copy is a local browser event carrying **text and language only**.
It contains **no raw audio, passcode, RunPod job ID, AI API key, transaction
ID, order amount or payment authorization**.

The assistant sends `source_type: "reviewed_transcript"` to the private
Vercel proxy and Railway endpoint only after user review, consent and Ask.
That field is **client-provided descriptive metadata**, not
cryptographically verifiable proof that N-ATLAS originated the text and
never a source of additional authorization. Any typed/forged input under
this label remains subject to the same restrictions as ordinary text.
It must not be used for model-provenance claims, financial decisions or
automatic actions. Stronger signed provenance would require a separately
designed, user-session-bound handoff artifact.

## What was changed

- `web/index.html`: adds the opt-in speech handoff button, status message,
  editable-question review checkbox, and clear two-stage consent notices.
- `web/natlas-voice.js`: in-memory, bounded eligibility for completed
  Nigerian English model results, invalidated on any new recording,
  language selection or submission.
- `web/financial-assistant.js`: local copy, correction, renewed
  confirmation after edits, separate consent and explicit Ask.
- `web/api/assistant.js`: strict allowlisting and forwarding of either
  `source_type=typed` or `reviewed_transcript`, no new privileges.
- `backend/app/assistant_routes.py`: same source-type allowlist and
  same quota, safety rules and educational-only service behaviour.
- Automated tests for UI review/consent gates, separate source metadata,
  injection rejection and N-ATLAS handoff conditions.

**Not changed:** The original `Kunleadegbie/voicebridge-ai` repository;
the fixed $5 PayPal Sandbox approval or capture; the existing N-ATLAS
provider, RunPod endpoint, audio pipeline, Upstash speech quota or API keys.

## Offline verification

**Frontend**
```sh
cd web
npm test
```

**Backend**
```sh
cd backend
python -m pytest -q
```

Tests use local mock requests. They are not independent evidence of live
OpenAI model suitability, N-ATLAS linguistic accuracy, mobile microphone
behaviour, security penetration resistance or a hard provider cost limit.

## Conditions remaining before supervised deployment

1. Complete the pre-agreed **40 financial-literacy answers**, **10 short
   conversations** and **at least 25 high-risk tests** under controlled
   conditions (offline mocks for logic, then separately approved low-cost
   real provider sampling).
2. Establish login-attempt throttling / edge WAF for passcode access,
   security review of signed sessions and meaningful logout/replay controls.
3. Review provider credentials, availability, billing alerts,
   data-processing terms, Nigerian data-privacy obligations and
   the final knowledge-base editorial quality.
4. Recheck all existing PayPal Sandbox and N-ATLAS integrations on both
   desktop and supported mobile browsers. Do not claim four-language
   conversational support from the current English-only handoff.
5. Keep the financial assistant **disabled on both hosts** until explicit
   owner approval. Do not merge or activate draft PR #11 as part of this
   development-only stage.

## Recommended stage-gate determination

**Stage 3E-B4:** Functionally implemented and passing mocked regression
tests; **not validated with paid live model requests and not production ready**.

**Next stage:** Stage 3E-B5 — Controlled evaluation, hardening, budget and
production-release review, with a separate explicit decision before any
new provider credentials or live charges.
