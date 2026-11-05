# VoiceBridge AI Pay — PayPal AI Hackathon 2026

**Voice-first financial education and PayPal Sandbox accessibility prototype for Nigeria**  
Built by **Chumcred Limited**.

**Try the hosted prototype:** https://voicebridgepay.chumcred.com  
**Privacy notice:** https://voicebridgepay.chumcred.com/privacy-notice.html

> **Prototype notice:** VoiceBridge AI Pay is an educational, sandbox-only demonstration. It does not transfer real money, access bank accounts, provide personalised financial advice, or permit AI or speech to authorise payments.

## The problem and our approach

Digital payment interfaces and financial explanations are often difficult to use for people who are more comfortable speaking than typing, especially in familiar local languages. VoiceBridge AI Pay explores a more accessible journey: ask a basic financial question in Nigerian English, Yorùbá, Hausa, or Igbo; review the recognised text; receive an educational AI explanation in the selected language; optionally hear the answer; and separately try a user-controlled PayPal Sandbox checkout.

The application combines **AI-powered financial education** with an **actual PayPal developer-platform integration**. Financial conversation and payment authorisation are deliberately separated: the assistant explains payments, while PayPal and explicit user actions govern the simulated checkout.

## What the prototype demonstrates

### Multilingual speech and financial education

- A restricted **N-ATLAS automatic speech recognition (ASR)** demonstration for Nigerian English, Yorùbá, Hausa, and Igbo, served through a **RunPod** gateway. All four languages have been exercised in testing; recognition accuracy varies by language, speaker, accent, pronunciation, and recording conditions.
- A deliberate **transcript review and handoff**: recognised speech is displayed for the user to check before submitting it as a question to the assistant. Transcription alone never submits a financial instruction.
- A restricted **Financial Intelligence Assistant** using the **OpenAI Responses API**, reviewed educational notes, and a selected response language. Basic digital-payment questions have been tested with direct written answers in all four languages.
- **Audible responses:** browser speech playback for English and **Langa text-to-speech** for supported Nigerian-language answers. Separate answer playback has been demonstrated; speech input, transcription, answer quality, and audio output are not guaranteed on every device.
- A **typed-question alternative** where speech recognition is unavailable or inaccurate.
- Consent prompts, separate demonstration access controls, and quotas for speech, AI responses, and speech generation.

**Validation limits:** The four-language question-and-answer checks are small demonstration tests, not a formal linguistic accuracy assessment. Comprehensive end-to-end spoken-conversation validation in all four languages, native-speaker evaluation, and iPhone/iPad compatibility remain areas for further testing. Do not interpret a selectable language or a successful text answer as proof of universal speech accuracy.

### PayPal Sandbox checkout

- Authenticates to the official **PayPal Sandbox API** through server-side components.
- Creates a **fixed US$5.00 simulated checkout order**.
- Redirects the user to PayPal's Sandbox buyer-approval experience.
- Checks PayPal's reported order status after return; **a redirect alone is not proof of payment**.
- Requires a separate, deliberate confirmation step before requesting sandbox capture.
- Has demonstrated **approved and completed Sandbox capture**, with status verification.
- Does **not** move real money or let the AI, speech, or a transcript approve, initiate, or capture a payment.

## Try the hosted demonstration

1. Open **https://voicebridgepay.chumcred.com** on a supported browser.
2. In the **Financial Intelligence Assistant**, select Nigerian English, Yorùbá, Hausa, or Igbo. Enter a non-sensitive educational question, such as *What is a digital payment?*, and review the answer. Use the available playback control if you wish to hear it.
3. Optionally, in the **N-ATLAS Speech Lab**, choose a spoken language, record a short question, consent to transcription, and check the result. If the text is acceptable, explicitly choose to use the reviewed transcript as an AI question.
4. To demonstrate payments, use the separate **PayPal Sandbox** checkout, approve the simulated US$5.00 transaction with a Sandbox buyer account, verify PayPal approval on return, and deliberately confirm sandbox capture.

**Demonstration access:** Some features require **separate, restricted demonstration passcodes** and are subject to shared quotas. Passcodes are **not** published in this repository. Authorised judges/testers must receive any necessary demo access through a secure communication channel. Do not enter real PINs, OTPs, BVNs, card details, passwords, personal account information, or actual payment credentials in the demonstration.

## Technology and services

| Component | Role |
| --- | --- |
| PayPal Developer Platform / Orders API (Sandbox) | Simulated order creation, buyer approval, order verification, and capture |
| OpenAI Responses API | Educational financial explanations in the selected language |
| N-ATLAS ASR | Restricted speech-to-text demonstrations for Nigerian English and three Nigerian languages |
| RunPod Serverless | Hosted gateway/compute for N-ATLAS speech recognition |
| Langa TTS | Audio rendering of supported indigenous-language AI answers |
| Browser speech APIs | Optional browser speech features, including English playback; browser support varies |
| FastAPI / Python | Backend, access control, provider integration, and PayPal routes |
| Vercel / JavaScript | Hosted web interface and server-side API gateways |
| Railway | Hosted backend |
| Upstash Redis | Shared demonstration quota state and controls |

**Third-party services:** Their availability, usage limits, and licences are governed by their respective providers. The source-code licence below does not grant rights to third-party APIs, models, voices, brands, or other provider assets.

## Architecture and security boundaries

The browser communicates with the application's server-side gateways. Provider API credentials remain on server-side infrastructure rather than in public JavaScript. The assistant uses a bounded educational knowledge set; it has **no PayPal tools, bank-account access, payment status feed, or authority to transact**.

Important protections include:

- PayPal REST operations are restricted to the **Sandbox** environment.
- Buyer approval and server-side capture are separate actions.
- A payment-return URL alone is not treated as proof of successful capture.
- N-ATLAS transcripts require review before the user can submit them to the assistant.
- AI output and spoken commands cannot authorise payments.
- Provider credentials and demo passcodes are configured as environment variables, never published in documentation.
- Demonstration features can be disabled through server-side configuration and are protected by limits and consent controls.

This prototype is not a production banking service. Customer authentication, a production-grade transaction ledger, webhook reconciliation, independent accessibility testing, and large-scale language accuracy validation are outside the demonstrated pilot scope.

## Repository structure

```text
backend/                 FastAPI service and Python tests
web/                     Website, Vercel API gateways, and JavaScript tests
docs/                    Deployment notes, stage checklists, and roadmap
.github/workflows/       Automated test and review workflows
.env.example             Placeholder-only environment template
LICENSE                  MIT source-code licence
```

## Local development and tests

**Prerequisites:** Git, Python with `venv`, and Node.js 22. Optional full-stack local operation also requires appropriately configured developer accounts, provider credentials, and relevant cloud services. Never use live customer credentials for Sandbox testing.

Clone the repository and run the backend checks:

```powershell
git clone https://github.com/Kunleadegbie/voicebridge-pay-hackathon.git
cd voicebridge-pay-hackathon\backend
py -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m pytest -q
```

Run the web checks in another terminal:

```powershell
cd voicebridge-pay-hackathon\web
npm install
npm test
```

To start the backend locally **after setting the required environment variables**:

```powershell
cd voicebridge-pay-hackathon\backend
python -m uvicorn app.main:app --reload --port 8000
```

The deployed web frontend uses Vercel gateways and the configured backend URL. Running the complete payment, speech, AI, and TTS flow locally requires valid **sandbox/test** configuration and access to the relevant providers; simply running the test suites does not activate those integrations. Consult the stage-specific documents in `docs/` for configuration guidance.

### Configuration

The tracked `.env.example` intentionally contains **placeholders only**. Use it as a starting point and configure any additional backend/Vercel variables required by the selected features in the relevant **private** environment settings. Feature flags and secrets must be configured on the correct services. Do not commit `.env` files, passcodes, personal data, or private keys. The `.gitignore` excludes common local credentials and build artefacts.

**Never put actual API keys or judge passcodes in public GitHub issues, source files, commits, screenshots, or this README.**

## Testing and evidence

- PayPal Sandbox: fixed US$5.00 order, buyer approval, deliberate capture, and completed status have been demonstrated.
- AI: direct educational answers for a common digital-payment question have been tested in Nigerian English, Yorùbá, Hausa, and Igbo.
- Speech: N-ATLAS transcription tests have been attempted in each of the four languages; accuracy and wider-speaker performance require further validation.
- Audio: answer playback has been tested for all four selected languages in desktop-browser demonstrations; additional device-specific and end-to-end checks remain advisable.
- Automated tests cover backend and web behaviours, including safety controls and mocked provider interactions. **Automated tests do not send real or simulated money.**

For more detail, see the [roadmap](docs/ROADMAP.md), [Stage 3C Sandbox checkout notes](docs/STAGE3C_SANDBOX_CHECKOUT.md), [Stage 3D voice and checkout notes](docs/STAGE3D_VOICE_CHECKOUT.md), and [Stage 3E N-ATLAS notes](docs/STAGE3E_NATLAS_VOICE.md).

## Privacy, limitations, and responsible use

This is an educational prototype, not financial advice or a financial institution. Users must not provide sensitive financial information. Speech, assistant questions, and answer text may be sent to the relevant third-party service **only through the application's disclosed, consent-based demonstration workflow**. Review the [privacy notice](https://voicebridgepay.chumcred.com/privacy-notice.html) before testing. AI-generated explanations may contain errors and should not be relied on as evidence that a payment occurred.

## Licence

This repository's original source code is provided under the [MIT License](LICENSE). Third-party services, software, trademarks, APIs, model weights, voices, and any externally sourced material remain subject to their own terms and permissions.

---

**VoiceBridge AI Pay** — a Chumcred Limited proof of concept exploring safer and more accessible financial education alongside a deliberately user-controlled PayPal Sandbox checkout.
