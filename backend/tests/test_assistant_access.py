"""Stage 3E-B5A isolated access security tests. No external services called."""
from __future__ import annotations

import asyncio
import hashlib

import httpx
import pytest
from fastapi.testclient import TestClient

from app import assistant_access
from app.assistant_routes import assistant_access_gateway
from app.main import app

CLIENT = TestClient(app)
FINGERPRINT = "a" * 64
OTHER_FINGERPRINT = "b" * 64
NONCE = "0123456789abcdef0123456789abcdef"
REDIS_URL = "https://test-access.upstash.io"
TOKEN = "x" * 45


@pytest.fixture(autouse=True)
def cleanup():
    yield
    app.dependency_overrides.clear()


def test_private_access_endpoint_fails_closed_without_flag_or_service_key(monkeypatch):
    monkeypatch.delenv("ENABLE_FINANCIAL_ASSISTANT", raising=False)
    request = {"action": "attempt", "fingerprint": FINGERPRINT}
    assert CLIENT.post("/api/internal/assistant/access", json=request).status_code == 503
    monkeypatch.setenv("ENABLE_FINANCIAL_ASSISTANT", "1")
    monkeypatch.setenv("ASSISTANT_SERVICE_KEY", "s" * 64)
    assert CLIENT.post("/api/internal/assistant/access", json=request).status_code == 401
    assert CLIENT.post(
        "/api/internal/assistant/access",
        json=request, headers={"X-Assistant-Service-Key": "wrong"}
    ).status_code == 401


def test_strict_access_schema_rejects_raw_ip_password_and_extra_fields():
    app.dependency_overrides[assistant_access_gateway] = lambda: True
    for request in (
        {"action": "attempt", "fingerprint": "203.0.113.12"},
        {"action": "attempt", "fingerprint": "too-short"},
        {"action": "attempt", "fingerprint": FINGERPRINT, "passcode": "private"},
        {"action": "attempt", "fingerprint": FINGERPRINT, "session_id": NONCE},
        {"action": "register", "fingerprint": FINGERPRINT},
        {"action": "register", "fingerprint": FINGERPRINT, "session_id": "bad"},
        {"action": "revoke", "fingerprint": FINGERPRINT},
        {"action": "unknown", "fingerprint": FINGERPRINT},
    ):
        assert CLIENT.post("/api/internal/assistant/access", json=request).status_code == 422


def test_atomic_login_limiter_lockout_and_session_revoke(monkeypatch):
    """Mock Redis Lua transport but exercise real functions and HTTP contracts."""
    monkeypatch.setenv("VOICE_QUOTA_REDIS_REST_URL", REDIS_URL)
    monkeypatch.setenv("VOICE_QUOTA_REDIS_REST_TOKEN", TOKEN)
    monkeypatch.setenv("ASSISTANT_DAILY_LIMIT", "20")
    monkeypatch.setenv("ASSISTANT_TOTAL_LIMIT", "100")
    memory = {}
    access_requests = []
    actual_client = httpx.AsyncClient

    def respond(request):
        assert str(request.url) == REDIS_URL + "/"
        assert request.headers["Authorization"] == "Bearer " + TOKEN
        cmd = __import__("json").loads(request.content)
        assert cmd[0] == "EVAL"
        script = cmd[1]
        key_count = int(cmd[2])
        keys = cmd[3:3 + key_count]
        args = cmd[3 + key_count:]
        access_requests.append((keys, args))
        assert all(key.startswith("vbpay:{assistant-access}:") for key in keys)
        assert not any("natlas-pilot" in key or "assistant-pilot" in key for key in keys)
        if script == assistant_access._LOGIN_LUA:
            count = memory.get(keys[0], 0) + 1
            memory[keys[0]] = count
            outcome = [1 if count <= 5 else 0, count, 900]
        elif script == assistant_access._REGISTER_LUA:
            if keys[0] in memory:
                outcome = 0
            else:
                memory[keys[0]] = args[0]
                outcome = 1
        elif script == assistant_access._VALIDATE_LUA:
            outcome = int(memory.get(keys[0]) == args[0])
        elif script == assistant_access._REVOKE_LUA:
            outcome = int(memory.get(keys[0]) == args[0])
            if outcome:
                del memory[keys[0]]
        else:
            raise AssertionError("Unknown access Lua operation")
        return httpx.Response(200, json={"result": outcome})

    monkeypatch.setattr(
        assistant_access.httpx, "AsyncClient",
        lambda **kwargs: actual_client(
            transport=httpx.MockTransport(respond), **kwargs
        )
    )
    app.dependency_overrides[assistant_access_gateway] = lambda: True

    def post(action, fingerprint=FINGERPRINT, nonce=None):
        payload = {"action": action, "fingerprint": fingerprint}
        if nonce:
            payload["session_id"] = nonce
        return CLIENT.post("/api/internal/assistant/access", json=payload)

    for remaining in range(4, -1, -1):
        response = post("attempt")
        assert response.status_code == 200
        assert response.json() == {
            "status": "allowed", "attempts_remaining": remaining
        }

    blocked = post("attempt")
    assert blocked.status_code == 429
    # Distinct clients have independent rate limiters.
    assert post("attempt", OTHER_FINGERPRINT).status_code == 200

    registered = post("register", nonce=NONCE)
    assert registered.status_code == 200
    assert registered.json()["status"] == "registered"
    assert post("register", nonce=NONCE).status_code == 409
    assert post("validate", nonce=NONCE).json()["status"] == "active"
    assert post("validate", OTHER_FINGERPRINT, NONCE).json()["status"] == "inactive"
    assert post("revoke", OTHER_FINGERPRINT, NONCE).json()["status"] == "inactive"
    assert post("revoke", nonce=NONCE).json()["status"] == "revoked"
    assert post("validate", nonce=NONCE).json()["status"] == "inactive"
    assert post("revoke", nonce=NONCE).json()["status"] == "inactive"

    token_key = "vbpay:{assistant-access}:session:" + hashlib.sha256(
        NONCE.encode("ascii")
    ).hexdigest()
    assert NONCE not in " ".join(memory)
    assert token_key not in memory
    assert all(NONCE not in str(args) for keys, args in access_requests)
    assert all("203.0.113" not in str(args) for keys, args in access_requests)


def test_redis_unavailability_disallows_login_and_session_operations(monkeypatch):
    app.dependency_overrides[assistant_access_gateway] = lambda: True
    monkeypatch.delenv("VOICE_QUOTA_REDIS_REST_URL", raising=False)
    monkeypatch.delenv("VOICE_QUOTA_REDIS_REST_TOKEN", raising=False)
    for action in ("attempt", "register", "validate", "revoke"):
        request = {"action": action, "fingerprint": FINGERPRINT}
        if action != "attempt":
            request["session_id"] = NONCE
        response = CLIENT.post("/api/internal/assistant/access", json=request)
        assert response.status_code == 503
        assert "token" not in response.text.lower()
        assert "redis" not in response.text.lower()


def test_invalid_redis_result_fails_closed(monkeypatch):
    async def invalid(*args, **kwargs):
        return "OK"
    monkeypatch.setattr(assistant_access, "_eval", invalid)
    with pytest.raises(assistant_access.AssistantAccessUnavailable):
        asyncio.run(assistant_access.register_attempt(FINGERPRINT))
    with pytest.raises(assistant_access.AssistantAccessUnavailable):
        asyncio.run(assistant_access.register_session(FINGERPRINT, NONCE))
    with pytest.raises(assistant_access.AssistantAccessUnavailable):
        asyncio.run(assistant_access.validate_session(FINGERPRINT, NONCE))
    with pytest.raises(assistant_access.AssistantAccessUnavailable):
        asyncio.run(assistant_access.revoke_session(FINGERPRINT, NONCE))
