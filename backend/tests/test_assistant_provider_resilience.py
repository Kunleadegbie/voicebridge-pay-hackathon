"""Offline provider-adapter safety tests for VoiceBridge AI Pay.

Only mocked HTTP requests are used; no live API keys or provider network calls.
"""
from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from app.assistant_provider import AssistantProviderError, OpenAIAssistantGateway


_MODEL = "gpt-6-luna"
_KEY = "sk-test-" + "x" * 32
_NOTES = [{"id": "receipts", "text": "A receipt summarizes a payment's details."}]
_QUESTION = "What does a payment receipt show?"


def _gateway(handler):
    return OpenAIAssistantGateway(
        _KEY, _MODEL, transport=httpx.MockTransport(handler)
    )


def _ask(gateway):
    return asyncio.run(gateway.respond(_QUESTION, [], _NOTES))


def _response_text(status="answered", answer="A receipt shows payment details.",
                   follow_up=""):
    return json.dumps({
        "status": status, "answer": answer, "follow_up_suggestion": follow_up,
    })


def _provider_envelope(text=None, *, status="completed", model=_MODEL,
                       output=None):
    if output is None:
        output = [{"type": "message", "content": [
            {"type": "output_text", "text": text or _response_text()}
        ]}]
    return {"status": status, "model": model, "output": output}


def test_provider_offline_request_contract_and_one_call():
    seen = []

    def respond(request):
        seen.append(request)
        assert request.method == "POST"
        assert str(request.url) == "https://api.openai.com/v1/responses"
        assert request.headers["authorization"] == "Bearer " + _KEY
        body = json.loads(request.content)
        assert body["model"] == _MODEL
        assert body["store"] is False
        assert body["reasoning"] == {"effort": "none"}
        assert body["max_output_tokens"] == 500
        assert body["text"]["format"]["type"] == "json_schema"
        assert body["text"]["format"]["strict"] is True
        assert "tools" not in body
        assert len(body["input"]) == 1
        assert body["input"][0]["content"] == _QUESTION
        return httpx.Response(200, json=_provider_envelope())

    result = _ask(_gateway(respond))
    assert result == {
        "status": "answered",
        "answer": "A receipt shows payment details.",
        "follow_up_suggestion": "",
    }
    assert len(seen) == 1


@pytest.mark.parametrize("status", [400, 401, 403, 429, 500, 503])
def test_http_failures_are_generic_and_never_retried(status):
    seen = []

    def respond(request):
        seen.append(request)
        return httpx.Response(status, json={"error": {"message": "private provider message"}})

    with pytest.raises(AssistantProviderError) as exc:
        _ask(_gateway(respond))
    assert len(seen) == 1
    assert "private provider message" not in str(exc.value)
    assert _KEY not in str(exc.value)


def test_malformed_provider_json_fails_closed():
    with pytest.raises(AssistantProviderError):
        _ask(_gateway(lambda request: httpx.Response(
            200, text="{not-valid-json", headers={"content-type": "application/json"}
        )))


@pytest.mark.parametrize("envelope", [
    _provider_envelope(status="incomplete"),
    _provider_envelope(status="failed"),
    _provider_envelope(model="unexpected-model"),
    _provider_envelope(output=[]),
    _provider_envelope(output=[{"type": "message", "content": []}]),
    _provider_envelope(output=[{"type": "message", "content": [
        {"type": "output_text", "text": _response_text()},
        {"type": "output_text", "text": _response_text()},
    ]}]),
    _provider_envelope(text="not valid JSON"),
    _provider_envelope(text=json.dumps({
        "status": "answered", "answer": "ok", "follow_up_suggestion": "", "extra": "x"
    })),
    _provider_envelope(text=_response_text(status="invalid")),
    _provider_envelope(text=_response_text(answer="   ")),
    _provider_envelope(text=_response_text(answer="x" * 1301)),
    _provider_envelope(text=_response_text(follow_up="x" * 221)),
], ids=[
    "incomplete", "failed", "model-mismatch", "no-output", "no-text",
    "multiple-chunks", "invalid-text-json", "extra-output-field",
    "invalid-status", "blank-answer", "oversized-answer", "oversized-follow-up",
])
def test_unexpected_response_shapes_fail_closed(envelope):
    with pytest.raises(AssistantProviderError):
        _ask(_gateway(lambda request: httpx.Response(200, json=envelope)))
