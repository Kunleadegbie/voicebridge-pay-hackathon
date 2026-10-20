# VOICEBRIDGE AI PAY — PRIVACY NOTICE

**Operated by:** Chumcred Limited  
**Business Contact Address:** No. 60, Akerele Street, Surulere, Lagos, Nigeria  
**Privacy Contact:** chumcred@gmail.com  
**Version:** Draft 1.0  
**Draft Date:** 20 October 2026  
**Status:** DRAFT — Subject to legal, provider-policy and operational review before publication

---

## 1. Introduction

Chumcred Limited ("Chumcred", "we", "our" or "us") operates VoiceBridge AI Pay, a demonstration platform exploring accessible digital payments, Nigerian-language speech transcription and AI-assisted financial education.

We are committed to protecting personal information and promoting responsible, transparent use of digital technology.

This Privacy Notice explains the types of information that may be processed when you use VoiceBridge AI Pay, why that information is processed, the external service providers involved, and your privacy rights.

VoiceBridge AI Pay is a demonstration environment. PayPal Sandbox transactions do not involve real-money transfers. Its Financial Intelligence Assistant is a separate educational feature and remains disabled pending testing and approval.

## 2. Information We May Process

Depending on the features you choose to use, VoiceBridge AI Pay may process the following categories of information.

### A. Website and Technical Information

Technical information required for the website to function and remain secure, potentially including network identifiers, IP-related information, request metadata, security events and temporary session identifiers.

### B. Speech Transcription Information

When you voluntarily use the N-ATLAS Speech Lab, your submitted audio and resulting transcription may be processed by the configured speech-processing infrastructure.

Transcription accuracy may vary depending on language, accent, recording quality and technical conditions.

### C. Financial Education Questions

When the Financial Intelligence Assistant is enabled, we may process:

- The educational question you deliberately submit.
- Relevant recent conversation context.
- The AI-generated educational response.
- Limited operational information needed for security, usage management and troubleshooting.

### D. Restricted Demonstration Access Information

For restricted features, the platform may process access-attempt counts, temporary session identifiers and protected network-related fingerprints to help prevent abuse.

The assistant's access-control system is designed not to store raw IP addresses, passcodes, question text, speech or PayPal information in its dedicated Redis access-control records.

### E. PayPal Sandbox Information

The PayPal Sandbox demonstration uses simulated payment information processed through the separate PayPal testing environment.

Sandbox approvals and captures do not represent transfers of real money.

### F. Privacy Correspondence

If you contact Chumcred Limited about a privacy concern, we may process the contact details and information you voluntarily provide to address your request.

## 3. Information You Must Not Submit

Do not enter or submit confidential financial or identity information to the Financial Intelligence Assistant, including:

- Passwords, PINs or one-time passwords (OTPs).
- Bank Verification Numbers (BVNs).
- Bank account numbers or account statements.
- Full payment-card numbers, CVVs or card authentication details.
- Identity documents or other sensitive personal information.

The Financial Intelligence Assistant is intended for general educational questions, not personal account servicing.

## 4. Purposes of Information Processing

We may process information to:

1. Provide the requested demonstration features.
2. Convert voluntarily submitted speech into text.
3. Generate AI-assisted explanations about financial literacy and digital payments.
4. Maintain the security and reliability of the platform.
5. Enforce demonstration access restrictions and usage limits.
6. Prevent abuse, investigate technical problems and support authorised testing.
7. Respond to privacy enquiries.
8. Meet applicable legal and regulatory obligations.

Our processing will be based on the applicable lawful grounds under Nigerian data-protection law, including consent where required, legitimate interests where legally appropriate, and compliance with legal obligations.

Providing consent to the Financial Intelligence Assistant does not authorise payments or give the assistant access to your financial accounts.

## 5. External Service Providers

VoiceBridge AI Pay uses separate technical services for different functions.

### OpenAI — Financial Education

When the Financial Intelligence Assistant is activated and you deliberately submit a question with the required consent, the question and relevant conversation history are sent to OpenAI through its API to generate an educational response.

The assistant is configured for text-based educational explanations and is not authorised to access personal financial accounts or execute transactions.

OpenAI states that data submitted through its API is not used to train or improve its models by default unless the customer explicitly opts in. Chumcred Limited has disabled voluntary sharing of model feedback, evaluation and fine-tuning data, and API inputs and outputs within its OpenAI organization. Under OpenAI's standard API arrangements, abuse-monitoring logs may contain submitted questions, AI responses and associated metadata. These records are generally retained for up to 30 days, unless longer retention is required by law or reasonably necessary to protect OpenAI's services or third parties from harm. The dedicated VoiceBridge AI Pay OpenAI project has Global data residency, meaning that information may be stored or processed outside Nigeria. Special Zero Data Retention or Modified Abuse Monitoring approval has not been confirmed.

The application's use of `store: false` does not itself guarantee Zero Data Retention.

Official information: https://platform.openai.com/docs/guides/your-data

### N-ATLAS and RunPod — Speech Transcription

The separate Speech Lab uses the configured N-ATLAS transcription service and RunPod infrastructure to process voluntarily submitted speech.

The supported demonstration languages include Nigerian English, Yoruba, Hausa and Igbo.

A completed Nigerian English transcript may be transferred into the Financial Intelligence Assistant only through a separate user-controlled review and consent process.

### PayPal — Sandbox Checkout

The PayPal Sandbox processes simulated checkout transactions independently of the Financial Intelligence Assistant.

The assistant and speech-processing features cannot initiate, approve, capture or refund payments.

### Vercel, Railway and Upstash — Hosting and Security

Vercel supports the demonstration website, Railway supports the hackathon backend, and Upstash provides Redis infrastructure used for selected usage limits and access-security controls.

These providers may process information required to operate, secure and maintain their services.

Before public testing, Chumcred Limited will complete the necessary review of applicable provider terms, data-processing arrangements and operational retention settings.

## 6. Financial Intelligence Assistant: Important Limitations

The Financial Intelligence Assistant is an educational technology demonstration.

It may provide general explanations concerning:

- Digital payments and bank transfers.
- Debit cards and digital wallets.
- Receipts and transaction statuses.
- Payment fees and fraud prevention.
- PayPal Sandbox concepts and payment safety.

AI-generated explanations may contain inaccuracies or omissions.

The assistant does not provide personalised financial, investment, legal or regulatory advice.

It cannot independently verify a payment, check an individual bank balance, access transaction records or confirm receipt of money.

Neither written questions nor spoken instructions can authorise, initiate, approve, capture or refund a payment.

Users should verify actual financial transactions only through their authorised financial-service providers.

## 7. Speech Processing and User Review

The N-ATLAS Speech Lab is separate from the Financial Intelligence Assistant.

Transcribed speech may contain recognition errors. You should review the resulting text carefully.

Where the Financial Intelligence Assistant supports transferring a completed Nigerian English transcript:

1. The user must deliberately choose the transfer action.
2. The resulting text must be reviewed and, if necessary, corrected.
3. The user must expressly confirm the reviewed question.
4. Separate consent to AI processing is required.
5. A separate deliberate action is required to submit the question.

Copying or reviewing a transcript does not itself authorise a payment or submit an AI question.

## 8. Security, Cookies and Temporary Sessions

VoiceBridge AI Pay uses security measures intended to protect restricted features.

The Financial Intelligence Assistant is designed to use:

- Secure, temporary browser-session cookies.
- Restricted demonstration access.
- Login-attempt limits.
- Server-side session registration and revocation.
- Separate usage allowances for AI questions.
- Independent security controls for N-ATLAS speech transcription.

Assistant demonstration sessions are designed to expire after approximately 15 minutes.

Conversation history is designed to remain in the active browser page rather than being deliberately saved to browser local storage.

Other infrastructure providers may process operational information necessary for hosting and security.

Although we apply reasonable safeguards, no internet-based service can guarantee absolute security.

## 9. Data Retention

Chumcred Limited seeks to retain information only as long as reasonably necessary for its intended purposes, subject to applicable legal requirements.

Different information categories may have different retention periods.

- Temporary Financial Intelligence Assistant sessions are designed to expire after 15 minutes.
- Conversation history is designed to remain in the current browser page rather than being deliberately stored in browser local storage.
- OpenAI may retain certain information under its applicable API data-handling and abuse-monitoring arrangements.
- Hosting and infrastructure providers may retain security, diagnostic and operational records in accordance with their applicable arrangements.
- Speech-processing systems may process technical and transcription-related information as necessary for the requested service.
- Privacy correspondence may be retained as reasonably necessary to respond to requests and meet legal obligations.

**Pre-publication requirement:** The precise applicable retention periods and deletion procedures for hosting, transcription, security logs and privacy correspondence must be verified and documented before the notice is approved for real-user deployment.

We do not represent that all submitted information is immediately deleted or that external providers have no data-retention obligations.

## 10. International Data Processing

Some of the infrastructure and AI providers supporting VoiceBridge AI Pay may process information outside Nigeria.

Accordingly, information submitted to the platform may be transferred to or processed in other jurisdictions.

Chumcred Limited will assess applicable Nigerian cross-border data-transfer requirements and implement legally appropriate safeguards before enabling broader real-user processing.

Where additional consent, contractual safeguards or another lawful transfer mechanism is required, the relevant requirements must be addressed before deployment.

## 11. Your Data Protection Rights

Subject to the Nigeria Data Protection Act 2023 and other applicable laws, you may have rights concerning personal information processed about you.

These may include:

- Being informed about the processing of your information.
- Requesting access to eligible personal information.
- Requesting correction of inaccurate information.
- Requesting deletion of eligible information.
- Objecting to or seeking restrictions on certain processing.
- Withdrawing consent where processing is based on consent.
- Requesting data portability where applicable.
- Lodging a complaint with the Nigeria Data Protection Commission.

The availability and scope of these rights depend on applicable law and the circumstances of processing.

To make a privacy request, email **chumcred@gmail.com**.

We may request appropriate verification before responding to a request involving personal information.

Withdrawing consent does not automatically invalidate processing that was lawful before withdrawal.

## 12. Children's Privacy

VoiceBridge AI Pay is intended for authorised demonstration participants. It is not designed as a service directed to children.

Any proposed testing involving children would require a separate assessment and appropriate safeguards, including applicable parental or guardian consent requirements.

## 13. Contact Information

For questions, concerns, privacy requests or complaints, contact:

**Chumcred Limited**  
No. 60, Akerele Street  
Surulere, Lagos  
Nigeria

**Email:** chumcred@gmail.com

If you believe your privacy concern has not been appropriately resolved, you may contact the Nigeria Data Protection Commission.

Official website: https://ndpc.gov.ng/

## 14. Changes to This Notice

Chumcred Limited may update this Privacy Notice when platform features, processing activities, service providers or legal requirements change.

The approved version and effective date will be displayed when the notice is published.

Material changes affecting personal information will be communicated where required by applicable law.

---

## Important Demonstration Disclaimer

VoiceBridge AI Pay is a technology demonstration.

The Financial Intelligence Assistant provides educational information only and cannot move money or access individual financial accounts.

N-ATLAS speech transcription cannot authorise financial transactions.

PayPal Sandbox payments are simulated and do not transfer real money.

---

**DOCUMENT CONTROL**

- Status: Draft — not approved for publication.
- Next review: Provider retention, cross-border processing, legal basis, operational security and privacy contact procedures.
- Release restriction: No public activation of the Financial Intelligence Assistant until privacy, security, model-quality and owner-approval requirements are satisfied.
- GitHub scope: Development branch only; Pull Request #11 remains Draft.
