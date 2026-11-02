"""Stage 3E-B2 private educational conversation routes; OFF by default.

Only a future Vercel service proxy may call these routes, using an independent
server-side service key. No public browser endpoint is introduced by this stage.
"""
from __future__ import annotations

import os
import re
import unicodedata
import secrets
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .assistant_knowledge import select_knowledge
from .assistant_provider import (
    AssistantConfigurationError, AssistantProviderError,
    OpenAIAssistantGateway, provider_config,
)
from .assistant_quota import (
    AssistantQuotaReached, AssistantQuotaUnavailable,
    AssistantDuplicateRequest, reserve_assistant_quota, assistant_quota_status,
)
from .assistant_safety import guard_question
from .assistant_access import (
    AssistantAccessLimited, AssistantAccessUnavailable,
    register_attempt, register_session, validate_session, revoke_session,
)

router = APIRouter(prefix="/api/internal/assistant", tags=["internal-assistant"])
_BANNER = "Educational AI assistance only. No account access or payment authorisation."
_FALSE_COMPLETION = re.compile(
    # Reject AI assertions of access or completion of a SPECIFIC user's
    # transaction. Conservative false positives are acceptable for this pilot.
    r"\b(?:i|we)\s+(?:have|'ve)\s+(?:sent|transferred|captured|refunded|approved|"
    r"verified|completed)\s+(?:your|the|a)\s+(?:payment|transfer|refund)\b|"
    r"\b(?:your|the)\s+(?:payment|transfer|refund|transaction)\s+"
    r"(?:has\s+(?:been\s+)?|is\s+|was\s+)"
    r"(?:successfully\s+)?(?:completed|captured|approved|confirmed|"
    r"sent|refunded|processed|successful)\b",
    re.I,
)


_ML_FALSE_COMPLETION = (
    re.compile(r"\bmo\s+ti\s+(?:fi\s+owo\s+ranse|san\s+owo)\b"),
    re.compile(r"\bisanwo\s+re\s+ti\s+pari\b"),
    re.compile(r"\bna\s+(?:tura|aika)\s+(?:maka\s+)?kudi\b"),
    re.compile(r"\ban\s+kammala\s+biyan\s+kudinka\b"),
    re.compile(r"\beziga(?:ra|la)\s+m\s+(?:gi\s+)?ego\b"),
    re.compile(r"\bakwu\s+ugwo\s+gi\s+agwula\b"),
)


def _false_payment_completion(answer: str) -> bool:
    if _FALSE_COMPLETION.search(answer):
        return True
    folded = unicodedata.normalize("NFKD", answer.casefold())
    folded = "".join(
        char for char in folded
        if not unicodedata.combining(char)
    )
    folded = folded.translate({0x0257: "d", 0x0199: "k", 0x0253: "b"})
    return any(pattern.search(folded) for pattern in _ML_FALSE_COMPLETION)


class ConversationTurn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=1200)


class AssistantQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    # Generated for each deliberate Ask click; duplicate ID must never run twice.
    request_id: UUID
    language: Literal["en-NG", "yo-NG", "ha-NG", "ig-NG"]
    # Informational metadata only. It never conveys verified model origin or
    # permission to take any financial action.
    source_type: Literal["typed", "reviewed_transcript"] = "typed"
    question: str = Field(min_length=3, max_length=500)
    history: list[ConversationTurn] = Field(default_factory=list, max_length=8)
    confirm_privacy: Literal[True]


def assistant_gateway(
    x_assistant_service_key: str | None = Header(default=None),
) -> OpenAIAssistantGateway:
    if os.getenv("ENABLE_FINANCIAL_ASSISTANT") != "1":
        raise HTTPException(status_code=503, detail="Financial assistant pilot is disabled")
    expected = os.getenv("ASSISTANT_SERVICE_KEY", "")
    if len(expected) < 48:
        raise HTTPException(status_code=503, detail="Financial assistant is not configured")
    if not x_assistant_service_key or not secrets.compare_digest(
        x_assistant_service_key, expected
    ):
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        key, model = provider_config()
        return OpenAIAssistantGateway(key, model)
    except AssistantConfigurationError:
        raise HTTPException(status_code=503, detail="AI provider is not configured") from None


class AssistantAccessRequest(BaseModel):
    """Private service-to-service access contract; only hashed client identity."""
    model_config = ConfigDict(extra="forbid")
    action: Literal["attempt", "register", "validate", "revoke"]
    fingerprint: str = Field(pattern=r"^[a-f0-9]{64}$")
    session_id: str | None = Field(default=None, pattern=r"^[a-f0-9]{32}$")


def assistant_access_gateway(
    x_assistant_service_key: str | None = Header(default=None),
) -> bool:
    # Access security uses the same independent service key as conversation,
    # but does NOT need live OpenAI credentials or any model invocation.
    if os.getenv("ENABLE_FINANCIAL_ASSISTANT") != "1":
        raise HTTPException(status_code=503, detail="Financial assistant pilot is disabled")
    expected = os.getenv("ASSISTANT_SERVICE_KEY", "")
    if len(expected) < 48:
        raise HTTPException(status_code=503, detail="Assistant access service is not configured")
    if not x_assistant_service_key or not secrets.compare_digest(
        x_assistant_service_key, expected
    ):
        raise HTTPException(status_code=401, detail="Unauthorized")
    return True


@router.post("/access")
async def access(
    body: AssistantAccessRequest,
    authorised: bool = Depends(assistant_access_gateway),
) -> dict[str, str | int]:
    if body.action == "attempt" and body.session_id is not None:
        raise HTTPException(status_code=422, detail="Invalid access request")
    if body.action != "attempt" and body.session_id is None:
        raise HTTPException(status_code=422, detail="Missing assistant session")
    try:
        if body.action == "attempt":
            return await register_attempt(body.fingerprint)
        if body.action == "register":
            registered = await register_session(body.fingerprint, body.session_id)
            if not registered:
                raise HTTPException(status_code=409, detail="Session collision")
            return {"status": "registered"}
        if body.action == "validate":
            active = await validate_session(body.fingerprint, body.session_id)
            return {"status": "active" if active else "inactive"}
        revoked = await revoke_session(body.fingerprint, body.session_id)
        return {"status": "revoked" if revoked else "inactive"}
    except AssistantAccessLimited:
        raise HTTPException(status_code=429, detail="Assistant login temporarily limited") from None
    except AssistantAccessUnavailable:
        raise HTTPException(status_code=503, detail="Assistant access temporarily unavailable") from None


@router.get("/capacity")
async def capacity(gateway: OpenAIAssistantGateway = Depends(assistant_gateway)) -> dict:
    # Read-only, no model request and no quota debit.
    try:
        return await assistant_quota_status()
    except AssistantQuotaUnavailable:
        raise HTTPException(status_code=503, detail="Assistant quota service unavailable") from None


_LOCAL_REPLY_TEXT = {
    "yo-NG": {
        "clarification": (
            "Mo lè ṣàlàyé ìsanwó orí ẹ̀rọ, rírán owó, "
            "ìwé ẹ̀rí ìsanwó àti ààbò ìsanwó. "
            "Kí ni o fẹ́ mọ̀?"
        ),
        "refused": (
            "Mi ò lè ṣe ìsanwó fún ọ tàbí béèrè fún "
            "PIN, OTP, CVV tàbí àlàyé aṣírí. "
            "Má ṣe pín àlàyé aṣírí rẹ."
        ),
    },
    "ha-NG": {
        "clarification": (
            "Zan iya bayyana biyan kuɗi ta intanet, "
            "aika kuɗi, rasit da tsaron biyan kuɗi. "
            "Me kake son sani?"
        ),
        "refused": (
            "Ba zan iya aiwatar da biyan kuɗi ba "
            "ko neman PIN, OTP, CVV ko bayanan sirri. "
            "Kada ka raba bayanan sirrinka."
        ),
    },
    "ig-NG": {
        "clarification": (
            "Enwere m ike ịkọwa ịkwụ ụgwọ dijitalụ, "
            "nnyefe ego, akwụkwọ nnata na nchekwa ịkwụ ụgwọ. "
            "Gịnị ka ị chọrọ ịmata?"
        ),
        "refused": (
            "Enweghị m ike ịkwụ ụgwọ n'aha gị ma ọ bụ "
            "ịrịọ PIN, OTP, CVV ma ọ bụ ozi nzuzo. "
            "Ekekọrịtala ozi nzuzo gị."
        ),
    },
}


def _local_response(
    status: str, category: str, answer: str, language: str = "en-NG"
) -> dict:
    if language != "en-NG":
        answer = _LOCAL_REPLY_TEXT[language][status]
    return {
        "status": status, "category": category, "answer": answer,
        "source_ids": [], "follow_up_suggestion": "",
        "safety_notice": _BANNER, "language": language,
        "payment_action_allowed": False,
    }


@router.post("/respond")
async def respond(
    body: AssistantQuestion,
    gateway: OpenAIAssistantGateway = Depends(assistant_gateway),
) -> dict:
    history = [turn.model_dump() for turn in body.history]
    if sum(len(item["content"]) for item in history) > 2800:
        raise HTTPException(status_code=422, detail="Conversation context is too long")
    # A compromised or untrusted client must not sneak credential text into history.
    if any(guard_question(item["content"]) and
           guard_question(item["content"])[0] == "sensitive_data" for item in history):
        raise HTTPException(status_code=422, detail="Remove sensitive data from conversation")
    guarded = guard_question(body.question)
    if guarded:
        return _local_response("refused", guarded[0], guarded[1], body.language)
    knowledge = select_knowledge(body.question, history)
    if not knowledge:
        return _local_response(
            "clarification", "unsupported",
            "I can help explain digital payments, receipts, transfers and payment "
            "safety. What would you like to understand?",
            body.language,
        )
    try:
        await reserve_assistant_quota(str(body.request_id))
    except AssistantDuplicateRequest:
        raise HTTPException(status_code=409, detail="This request was already submitted") from None
    except AssistantQuotaReached:
        raise HTTPException(status_code=429, detail="Assistant pilot capacity reached") from None
    except AssistantQuotaUnavailable:
        raise HTTPException(status_code=503, detail="Assistant quota service unavailable") from None
    try:
        response = await gateway.respond(body.question, history, knowledge, language=body.language)
    except AssistantProviderError:
        raise HTTPException(status_code=502, detail="Conversational AI service unavailable") from None
    if _false_payment_completion(response["answer"]):
        raise HTTPException(status_code=502, detail="AI response did not pass verification")
    return {
        "status": response["status"],
        "category": knowledge[0]["id"],
        "answer": response["answer"],
        "source_ids": [note["id"] for note in knowledge],
        "follow_up_suggestion": response["follow_up_suggestion"],
        "safety_notice": _BANNER,
        "language": body.language,
        "payment_action_allowed": False,
    }

# Stage 3E: private, staging-only speech quota reservation.
# The web gateway must verify the signed answer proof independently.
from .assistant_tts_quota import (
    reserve_tts_quota,
    TTSQuotaUnavailable,
    TTSQuotaReached,
    TTSDuplicateRequest,
)


class AssistantTTSReservation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fingerprint: str = Field(pattern=r"^[a-f0-9]{64}$")
    session_id: str = Field(pattern=r"^[a-f0-9]{32}$")
    token_id: str = Field(pattern=r"^[a-f0-9]{32}$")


@router.post("/tts/reserve")
async def reserve_tts(
    body: AssistantTTSReservation,
    authorised: bool = Depends(assistant_access_gateway),
) -> dict[str, str]:
    if (
        os.getenv("RAILWAY_ENVIRONMENT_NAME") not in ("assistant-test", "production")
        or os.getenv("ENABLE_LANGA_TTS") != "1"
    ):
        raise HTTPException(
            status_code=503, detail="Speech pilot is disabled"
        )

    try:
        active = await validate_session(
            body.fingerprint, body.session_id
        )
        if not active:
            raise HTTPException(
                status_code=401, detail="Assistant session expired"
            )

        await reserve_tts_quota(
            body.fingerprint, body.session_id, body.token_id
        )
        return {"status": "reserved"}

    except AssistantAccessUnavailable:
        raise HTTPException(
            status_code=503, detail="Session verification unavailable"
        ) from None
    except TTSDuplicateRequest:
        raise HTTPException(
            status_code=409, detail="Speech request already reserved"
        ) from None
    except TTSQuotaReached:
        raise HTTPException(
            status_code=429, detail="Speech allowance reached"
        ) from None
    except TTSQuotaUnavailable:
        raise HTTPException(
            status_code=503, detail="Speech quota unavailable"
        ) from None
