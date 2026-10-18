"""Pre-provider guardrails for the educational assistant.

This is deliberately not presented as exhaustive DLP. The hard security
boundary is that this service has no PayPal tools or payment credentials.
"""
from __future__ import annotations

import re


_SENSITIVE = (
    re.compile(r"\b(?:otp|pin|cvv|password|passcode|bvn)\s*(?:is|:|=)\s*\S+", re.I),
    re.compile(r"\b(?:my|here is|here's)\s+(?:otp|pin|cvv|password|passcode|bvn)\b", re.I),
    re.compile(r"\b(?:\d[ -]?){15,19}\b"),
)
_ACTION = re.compile(
    r"^\s*(?:(?:please|kindly)\s+)?(?:send|transfer|capture|refund|approve|"
    r"charge|execute|initiate|pay)\b|"
    r"\b(?:can you|could you|will you)\s+(?:send|transfer|capture|refund|approve|"
    r"charge|execute|initiate|pay)\b|\bpay my\b",
    re.I,
)
_ACCOUNT = re.compile(
    r"\b(?:my|our)\s+(?:bank|paypal|wallet|card|account)\s+"
    r"(?:balance|transactions?|statement|history|details)\b|"
    r"\b(?:check|show|fetch|access)\s+(?:my|our)\s+"
    r"(?:bank|paypal|wallet|account)\b",
    re.I,
)
_OVERRIDE = re.compile(
    r"\b(?:ignore\s+(?:all\s+)?(?:previous|system|safety|instructions|rules)|"
    r"bypass\s+(?:payment|security|safety)|"
    r"reveal\s+(?:your|the)\s+(?:system prompt|secrets?|api keys?))\b",
    re.I,
)


def guard_question(question: str) -> tuple[str, str] | None:
    """A deterministic local refusal. Does not call the model or reserve quota."""
    if any(pattern.search(question) for pattern in _SENSITIVE):
        return (
            "sensitive_data",
            "Please do not enter passwords, PINs, OTPs, card details or identity "
            "numbers here. Remove sensitive information and ask a general question."
        )
    if _ACTION.search(question):
        return (
            "payment_action",
            "I can explain payment processes, but I cannot initiate, authorise, "
            "capture or refund a payment. Use the provider's official checkout."
        )
    if _ACCOUNT.search(question):
        return (
            "personal_account",
            "I cannot access your accounts or verify an individual transaction. "
            "Please check through your financial provider's official service."
        )
    if _OVERRIDE.search(question):
        return ("unsupported", "I can only provide general, safe financial education.")
    return None
