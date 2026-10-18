"""Conservative pre-provider guardrails for restricted financial education.

These local regex checks reduce accidental credential transmission and catch
obvious payment-action requests before paid AI calls. They are not complete
DLP, prompt-injection resistance, identity verification, or account security.
The hard payment boundary remains NO access to PayPal tools or credentials.
"""
from __future__ import annotations

import re

_SECRET_WORDS = r"(?:otp|pin|cvv|password|passcode|bvn|one[- ]time(?: password| code)?)"
_SENSITIVE = (
    # "My OTP is 123456", "The PIN is 1234", "CVV: 123".
    re.compile(
        rf"\b{_SECRET_WORDS}\s*(?:is|:|=)\s*[\w!@#$%*.-]{{3,}}\b", re.I
    ),
    # "Use OTP 654321", "Enter the CVV 123"; avoid matching educational
    # questions such as "How should I protect my OTP?".
    re.compile(
        rf"\b(?:use|enter|submit|verify using|here is)\s+"
        rf"(?:(?:my|the|our)\s+)?{_SECRET_WORDS}\s*[:=]?\s*"
        rf"[\w!@#$%*.-]{{3,}}\b", re.I
    ),
    # "123456 is my OTP".
    re.compile(
        rf"\b\d{{3,12}}\s+(?:is|=)\s+(?:my|the|our)\s+{_SECRET_WORDS}\b", re.I
    ),
    # Obvious credit/debit card numbers with spaces or dashes; not a card
    # validation algorithm, and unrelated numbers may still be sensitive.
    re.compile(r"(?<!\d)(?:\d[ -]?){15,19}(?!\d)"),
    # Nigerian 10-digit account number or 11-digit BVN when explicitly
    # labelled as such; intentional conservative false positives possible.
    re.compile(
        r"\b(?:account(?: number)?|bvn)\s*(?:is|:|=)?\s*\d{10,11}\b", re.I
    ),
)
_OPERATION = r"(?:send|transfer|capture|refund|approve|charge|execute|initiate|pay)"
_ACTION = (
    re.compile(rf"^\s*(?:(?:please|kindly|now)\s+)?{_OPERATION}\b", re.I),
    re.compile(
        rf"\b(?:can|could|would|will)\s+you\s+(?:please\s+)?{_OPERATION}\b", re.I
    ),
    re.compile(
        rf"\b(?:i\s+(?:want|need)\s+you\s+to|"
        rf"(?:please\s+)?go\s+ahead\s+and|make\s+a)\s+{_OPERATION}\b", re.I
    ),
    re.compile(
        r"\b(?:pay my|make (?:the|this) payment|complete (?:my|the) payment)\b", re.I
    ),
)
_ACCOUNT = (
    re.compile(
        r"\b(?:my|our)\s+(?:(?:bank|paypal|wallet|card)\s+)?(?:account\s+)?"
        r"(?:balance|transactions?|statement|history|details)\b", re.I
    ),
    re.compile(
        r"\b(?:check|show|fetch|access|display|retrieve|read|tell)\s+"
        r"(?:me\s+)?(?:my|our)\s+"
        r"(?:(?:bank|paypal|wallet|card)\s+)?(?:account\s+)?"
        r"(?:balance|transactions?|statement|history|details)\b", re.I
    ),
    re.compile(
        r"\b(?:tell|show|read)\s+me\s+(?:my|our)\s+"
        r"(?:bank|paypal|wallet|card)\s+(?:transaction\s+)?history\b", re.I
    ),
)
_OVERRIDE = (
    re.compile(
        r"\b(?:ignore\s+(?:all\s+)?(?:previous|system|safety|instructions|rules)|"
        r"bypass\s+(?:payment|security|safety)|"
        r"reveal\s+(?:your|the)\s+(?:system prompt|secrets?|api keys?))\b", re.I
    ),
    re.compile(
        r"\b(?:disable\s+(?:the\s+)?(?:safeguards|guardrails|security checks)|"
        r"act as an unrestricted|developer mode|override your instructions)\b", re.I
    ),
)


def guard_question(question: str) -> tuple[str, str] | None:
    """Return a local refusal or None. No model, RunPod or PayPal call here."""
    if any(pattern.search(question) for pattern in _SENSITIVE):
        return (
            "sensitive_data",
            "Please do not enter passwords, PINs, OTPs, card details, account "
            "numbers or identity identifiers here. Remove sensitive information "
            "and ask a general question."
        )
    if any(pattern.search(question) for pattern in _ACTION):
        return (
            "payment_action",
            "I can explain payment processes, but I cannot initiate, authorise, "
            "capture or refund a payment. Use the provider's official checkout."
        )
    if any(pattern.search(question) for pattern in _ACCOUNT):
        return (
            "personal_account",
            "I cannot access your accounts or verify an individual transaction. "
            "Please check through your financial provider's official service."
        )
    if any(pattern.search(question) for pattern in _OVERRIDE):
        return (
            "unsupported",
            "I can only provide general, safe financial education."
        )
    return None
