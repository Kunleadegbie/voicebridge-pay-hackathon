"""Small, reviewed educational knowledge set for the Stage 3E-B2 pilot.

These are general explanations, not live payment/account records, regulatory
advice or transaction verification. No search service or live web tools are used.
"""
from __future__ import annotations

import re

RECORDS = (
    {
        "id": "digital_payments",
        "title": "Digital payments",
        "keywords": ("digital payment", "electronic payment", "cashless", "pay for goods"),
        "text": (
            "A digital payment is a payment initiated or made electronically rather "
            "than with physical cash. Bank transfers, card payments and mobile "
            "wallets are examples. Confirmation must come from the payment "
            "provider's verified records, not an AI explanation."
        ),
    },
    {
        "id": "transfers",
        "title": "Bank transfers",
        "keywords": ("bank transfer", "transfer money", "transfer", "recipient", "beneficiary"),
        "text": (
            "A bank transfer is an instruction sent through an authorised financial "
            "service to move funds between accounts. Verify the intended recipient, "
            "amount and applicable charges using your trusted provider before "
            "authorising the transfer. This assistant cannot make transfers."
        ),
    },
    {
        "id": "cards",
        "title": "Card payments",
        "keywords": ("card payment", "debit card", "credit card", "card", "cvv", "card details"),
        "text": (
            "Card payments use a payment card through a merchant or payment service. "
            "Never share the full card number, CVV, PIN, password or OTP with this "
            "assistant. Confirmation of a card charge requires the relevant provider."
        ),
    },
    {
        "id": "wallets",
        "title": "Digital wallets",
        "keywords": ("mobile wallet", "mobile wallets", "digital wallet", "digital wallets", "e-wallet", "wallet", "wallets"),
        "text": (
            "A digital wallet is an electronic service that can store payment "
            "methods or value and help users make transactions where supported. "
            "Features and charges depend on the actual provider."
        ),
    },
    {
        "id": "receipts",
        "title": "Payment receipts and references",
        "keywords": ("receipt", "reference", "proof of payment", "transaction id"),
        "text": (
            "A payment receipt may show a date, amount and transaction reference. "
            "A receipt or reference alone is not definitive proof that funds arrived. "
            "Use the provider's authenticated status and contact official support "
            "if a transaction is disputed."
        ),
    },
    {
        "id": "statuses",
        "title": "Payment statuses",
        "keywords": ("pending", "approved", "completed", "failed", "payment status",
                     "successful payment", "payment succeed", "payment confirmation"),
        "text": (
            "Pending means a transaction is not yet final. Approved can mean a payer "
            "authorised an operation without proving capture. Completed often denotes "
            "a finished operation, but precise meanings vary by provider. This "
            "assistant has no access to live account or transaction status."
        ),
    },
    {
        "id": "fees",
        "title": "Fees and charges",
        "keywords": ("fee", "fees", "charge", "charges", "payment charges", "cost", "pricing", "exchange rate"),
        "text": (
            "Fees may vary by provider, country, channel, currency and transaction. "
            "Review the provider's current fee disclosures before authorising any "
            "payment; this assistant cannot verify live pricing or exchange rates."
        ),
    },
    {
        "id": "fraud",
        "title": "Payment safety and scams",
        "keywords": ("safe", "safety", "scam", "fraud", "phishing", "suspicious",
                     "otp", "pin", "password", "protect", "security"),
        "text": (
            "Protect passwords, PINs and OTPs. Use official websites or apps, "
            "check the recipient, avoid urgent requests to disclose codes, and "
            "contact the provider through an independently verified official "
            "channel when suspicious. Never include sensitive credentials here."
        ),
    },
    {
        "id": "sandbox",
        "title": "PayPal Sandbox",
        "keywords": ("paypal", "sandbox", "test payment", "buyer approval",
                     "capture", "checkout"),
        "text": (
            "PayPal Sandbox supports simulated checkout and payment testing; no "
            "real-money transfer occurs in that sandbox. Buyer approval is separate "
            "from payment capture. VoiceBridge AI Pay's existing sandbox checkout "
            "must be used independently; conversation cannot create or capture orders."
        ),
    },
    {
        "id": "voicebridge",
        "title": "VoiceBridge AI Pay guidance",
        "keywords": ("voicebridge", "n-atlas", "natlas", "speech", "transcription",
                     "microphone", "passcode", "quota", "allowance", "voice"),
        "text": (
            "VoiceBridge AI Pay has a restricted N-ATLAS lab for short transcripts "
            "in Nigerian English, Yoruba, Hausa and Igbo, with a separate speech "
            "quota. Users review transcripts before any future conversational "
            "question. Neither speech nor conversation may approve or capture "
            "payments. The assistant is educational, not an account-status service."
        ),
    },
)


def select_knowledge(question: str, history: list[dict[str, str]] | None = None) -> list[dict[str, str]]:
    """Return at most three relevant records; history supplies topic only."""
    haystack = question.lower()
    # A follow-up such as 'explain that' needs the previous user topic.
    if history and not any(any(word in haystack for word in r["keywords"]) for r in RECORDS):
        user_questions = [turn["content"] for turn in history if turn["role"] == "user"]
        if user_questions:
            haystack += " " + user_questions[-1].lower()
    matches = []
    for record in RECORDS:
        score = sum(1 for word in record["keywords"] if
                    re.search(r"(?<![a-z])" + re.escape(word) + r"(?![a-z])", haystack))
        if score:
            matches.append((score, record))
    matches.sort(key=lambda value: -value[0])
    return [
        {"id": record["id"], "title": record["title"], "text": record["text"]}
        for _, record in matches[:3]
    ]
