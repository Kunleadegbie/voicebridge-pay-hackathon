"""Stage 3E-B5A: durable assistant demo login throttling and session revocation.

Uses the EXISTING dedicated Upstash REST database but an independent
vbpay:{assistant-access} Redis hash-tag namespace; no voice/AI quota changes.

Vercel submits only a server-HMAC fingerprint of its trusted edge-provided
visitor IP; no raw IP, passcode, credentials, text or audio is stored in Redis.
All calls are authenticated service-to-service and fail closed on DB outage.
This protects a *restricted pilot*, not general-purpose user authentication.
"""
from __future__ import annotations

import hashlib
import os
import re

import httpx
from .assistant_quota import AssistantQuotaUnavailable, _config

_NAMESPACE = "vbpay:{assistant-access}:"
_DIGEST = re.compile(r"^[a-f0-9]{64}$")
_NONCE = re.compile(r"^[a-f0-9]{32}$")
_LOGIN_WINDOW_SECONDS = 900
_SESSION_SECONDS = 1800
_MAX_LOGIN_ATTEMPTS = 5

_LOGIN_LUA = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1])) end
local ttl = redis.call('TTL', KEYS[1])
if count > tonumber(ARGV[2]) then return {0, count, ttl} end
return {1, count, ttl}
"""

_REGISTER_LUA = """
local result = redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[2]), 'NX')
if result then return 1 else return 0 end
"""

_VALIDATE_LUA = """
local value = redis.call('GET', KEYS[1])
if value and value == ARGV[1] then return 1 else return 0 end
"""

_REVOKE_LUA = """
local value = redis.call('GET', KEYS[1])
if value and value == ARGV[1] then
  redis.call('DEL', KEYS[1])
  return 1
end
return 0
"""


class AssistantAccessUnavailable(Exception):
    """Redis unavailable or returned an invalid result."""


class AssistantAccessLimited(Exception):
    """Login attempts for this client fingerprint exceeded the allowance."""


def _inputs(fingerprint: str, session_id: str | None = None) -> None:
    if not isinstance(fingerprint, str) or not _DIGEST.fullmatch(fingerprint):
        raise AssistantAccessUnavailable("Invalid assistant access fingerprint")
    if session_id is not None and (
        not isinstance(session_id, str) or not _NONCE.fullmatch(session_id)
    ):
        raise AssistantAccessUnavailable("Invalid assistant session ID")


async def _eval(script: str, keys: list[str], argv: list[str]) -> object:
    try:
        # Validate the existing dedicated Redis REST environment. Never log
        # its URL/token or any raw inbound authentication parameters.
        url, token, *_ = _config()
        async with httpx.AsyncClient(
            timeout=6.0, follow_redirects=False, trust_env=False
        ) as client:
            response = await client.post(
                url, json=["EVAL", script, str(len(keys)), *keys, *argv],
                headers={"Authorization": "Bearer " + token},
            )
            response.raise_for_status()
            payload = response.json()
    except (AssistantQuotaUnavailable, httpx.HTTPError, ValueError) as exc:
        raise AssistantAccessUnavailable("Assistant access store unavailable") from exc
    if not isinstance(payload, dict) or "error" in payload or "result" not in payload:
        raise AssistantAccessUnavailable("Invalid assistant access store response")
    return payload["result"]


async def register_attempt(fingerprint: str) -> dict:
    """Atomically consume one authentication attempt BEFORE password comparison."""
    _inputs(fingerprint)
    result = await _eval(
        _LOGIN_LUA, [_NAMESPACE + "login:" + fingerprint],
        [str(_LOGIN_WINDOW_SECONDS), str(_MAX_LOGIN_ATTEMPTS)]
    )
    if not isinstance(result, list) or len(result) != 3 or any(
        type(i) is not int for i in result
    ):
        raise AssistantAccessUnavailable("Invalid assistant login counter response")
    allowed, attempts, ttl = result
    if allowed not in (0, 1) or attempts < 1 or not 0 <= ttl <= _LOGIN_WINDOW_SECONDS:
        raise AssistantAccessUnavailable("Invalid assistant login counter values")
    if allowed == 0:
        raise AssistantAccessLimited("Assistant login temporarily limited")
    return {"status": "allowed", "attempts_remaining": max(0, _MAX_LOGIN_ATTEMPTS - attempts)}


def _session_key(session_id: str) -> str:
    # Only hash the random nonce; its value never goes into Redis unchanged.
    return _NAMESPACE + "session:" + hashlib.sha256(session_id.encode("ascii")).hexdigest()


async def register_session(fingerprint: str, session_id: str) -> bool:
    _inputs(fingerprint, session_id)
    result = await _eval(
        _REGISTER_LUA, [_session_key(session_id)],
        [fingerprint, str(_SESSION_SECONDS)]
    )
    if type(result) is not int or result not in (0, 1):
        raise AssistantAccessUnavailable("Invalid session register result")
    return result == 1


async def validate_session(fingerprint: str, session_id: str) -> bool:
    """No TTL extension. A signed cookie alone is NOT an active session."""
    _inputs(fingerprint, session_id)
    result = await _eval(_VALIDATE_LUA, [_session_key(session_id)], [fingerprint])
    if type(result) is not int or result not in (0, 1):
        raise AssistantAccessUnavailable("Invalid session validation result")
    return result == 1


async def revoke_session(fingerprint: str, session_id: str) -> bool:
    """Delete the server-side grant immediately. Replayed cookies then fail."""
    _inputs(fingerprint, session_id)
    result = await _eval(_REVOKE_LUA, [_session_key(session_id)], [fingerprint])
    if type(result) is not int or result not in (0, 1):
        raise AssistantAccessUnavailable("Invalid session revoke result")
    return result == 1
