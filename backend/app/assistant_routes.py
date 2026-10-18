"""Stage 3E-B2 private educational conversation routes; OFF by default.

Only a future Vercel service proxy may call these routes, using an independent
server-side service key. No public browser endpoint is introduced by this stage.
"""
from __future__ import annotations

import os
import re
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

router = APIRouter(prefix="/api/internal/assistant", tags=["internal-assistant"])
_BANNER = "Educational AI assistance only. No account access or payment authorisation."
_FALSE_COMPLETION = re.compile(
    r"\b(?:i|we)\s+(?:have|'ve)\s+(?:sent|transferred|captured|refunded|approved|"
    r"verified|completed)\s+(?:your|the|a)\s+(?:payment|transfer|refund)\b",
    re.I,
)


class ConversationTurn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=1200)


class AssistantQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    # Generated for each deliberate Ask click; duplicate ID must never run twice.
    request_id: UUID
    language: Literal["en-NG"]
    source_type: Literal["typed"] = "typed"
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


@router.get("/capacity")
async def capacity(gateway: OpenAIAssistantGateway = Depends(assistant_gateway)) -> dict:
    # Read-only, no model request and no quota debit.
    try:
        return await assistant_quota_status()
    except AssistantQuotaUnavailable:
        raise HTTPException(status_code=503, detail="Assistant quota service unavailable") from None


def _local_response(status: str, category: str, answer: str) -> dict:
    return {
        "status": status, "category": category, "answer": answer,
        "source_ids": [], "follow_up_suggestion": "",
        "safety_notice": _BANNER, "language": "en-NG",
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
        return _local_response("refused", guarded[0], guarded[1])
    knowledge = select_knowledge(body.question, history)
    if not knowledge:
        return _local_response(
            "clarification", "unsupported",
            "I can help explain digital payments, receipts, transfers and payment "
            "safety. What would you like to understand?"
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
        response = await gateway.respond(body.question, history, knowledge)
    except AssistantProviderError:
        raise HTTPException(status_code=502, detail="Conversational AI service unavailable") from None
    if _FALSE_COMPLETION.search(response["answer"]):
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
