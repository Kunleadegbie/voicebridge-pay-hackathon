"""Independent, durable conversational AI quota for VoiceBridge AI Pay.

Reuses the existing dedicated Upstash Redis database but NEVER its N-ATLAS
counter keys. Atomically reserve once per request id, fail closed on Redis
failure, and reject duplicate ids before charging a paid AI provider.
Reservations are not refunded after uncertain provider outcomes.
"""
from __future__ import annotations

import os
import re
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

import httpx

_KEY_PREFIX = "vbpay:{assistant-pilot}:"
_MAX_DAILY = 100
_MAX_TOTAL = 500
_UUID = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.I
)
_RESERVE_SCRIPT = """
local day = tonumber(redis.call('GET', KEYS[1]) or '0')
local total = tonumber(redis.call('GET', KEYS[2]) or '0')
if redis.call('EXISTS', KEYS[3]) == 1 then
    return {2, day, total}
end
if day >= tonumber(ARGV[1]) or total >= tonumber(ARGV[2]) then
    return {0, day, total}
end
day = redis.call('INCR', KEYS[1])
if day == 1 then redis.call('EXPIREAT', KEYS[1], tonumber(ARGV[3])) end
total = redis.call('INCR', KEYS[2])
redis.call('SET', KEYS[3], 'reserved', 'EX', 172800)
return {1, day, total}
"""
_READ_SCRIPT = """
return {
    tonumber(redis.call('GET', KEYS[1]) or '0'),
    tonumber(redis.call('GET', KEYS[2]) or '0')
}
"""


class AssistantQuotaUnavailable(Exception):
    pass


class AssistantQuotaReached(Exception):
    pass


class AssistantDuplicateRequest(Exception):
    pass


def _bounded(name: str, default: int, maximum: int) -> int:
    raw = os.getenv(name, str(default))
    if not re.fullmatch(r"[0-9]{1,3}", raw):
        raise AssistantQuotaUnavailable("Invalid assistant quota configuration")
    value = int(raw)
    if not 1 <= value <= maximum:
        raise AssistantQuotaUnavailable("Invalid assistant quota configuration")
    return value


def _config() -> tuple[str, str, int, int]:
    # The same dedicated Upstash DB, but separate Redis namespace and limits.
    url = os.getenv("VOICE_QUOTA_REDIS_REST_URL", "").rstrip("/")
    token = os.getenv("VOICE_QUOTA_REDIS_REST_TOKEN", "")
    parts = urlsplit(url)
    if (parts.scheme != "https" or
            not re.fullmatch(r"[a-z0-9-]+\.upstash\.io", parts.hostname or "") or
            parts.netloc != parts.hostname or
            parts.path not in ("", "/") or parts.query or parts.fragment or
            len(token) < 20):
        raise AssistantQuotaUnavailable("Assistant quota database not configured")
    return url, token, _bounded("ASSISTANT_DAILY_LIMIT", 20, _MAX_DAILY), _bounded(
        "ASSISTANT_TOTAL_LIMIT", 100, _MAX_TOTAL
    )


def _keys(now: datetime) -> tuple[str, str, str, int]:
    instant = now.astimezone(timezone.utc)
    midnight = datetime.combine(
        instant.date() + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc
    )
    date_key = _KEY_PREFIX + "daily:" + instant.strftime("%Y%m%d")
    return (
        date_key, _KEY_PREFIX + "lifetime",
        midnight.isoformat().replace("+00:00", "Z"),
        int((midnight + timedelta(days=1)).timestamp())
    )


async def _eval(url: str, token: str, script: str, keys: list[str], args: list[str]) -> list[int]:
    try:
        async with httpx.AsyncClient(
            timeout=6.0, trust_env=False, follow_redirects=False
        ) as client:
            response = await client.post(
                url, headers={"Authorization": "Bearer " + token},
                json=["EVAL", script, str(len(keys)), *keys, *args],
            )
            response.raise_for_status()
            result = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise AssistantQuotaUnavailable("Assistant quota store unavailable") from exc
    values = result.get("result") if isinstance(result, dict) and "error" not in result else None
    expected = 3 if args else 2
    if not isinstance(values, list) or len(values) != expected or any(
        type(value) is not int or value < 0 for value in values
    ):
        raise AssistantQuotaUnavailable("Invalid assistant quota store response")
    return values


def _status(day: int, total: int, day_limit: int, total_limit: int, reset: str) -> dict:
    daily_left = max(0, day_limit - day)
    total_left = max(0, total_limit - total)
    return {
        "status": "available" if daily_left and total_left else "reached",
        "remaining": min(daily_left, total_left),
        "daily_limit": day_limit,
        "daily_used": day,
        "lifetime_remaining": total_left,
        "reset_at_utc": reset,
    }


async def assistant_quota_status(*, now: datetime | None = None) -> dict:
    url, token, daily, total = _config()
    keys = _keys(now or datetime.now(timezone.utc))
    used = await _eval(url, token, _READ_SCRIPT, list(keys[:2]), [])
    return _status(used[0], used[1], daily, total, keys[2])


async def reserve_assistant_quota(request_id: str, *, now: datetime | None = None) -> dict:
    if not _UUID.fullmatch(request_id):
        raise AssistantQuotaUnavailable("Invalid assistant request identifier")
    url, token, daily, total = _config()
    keys = _keys(now or datetime.now(timezone.utc))
    request_key = _KEY_PREFIX + "request:" + request_id.lower()
    result = await _eval(
        url, token, _RESERVE_SCRIPT,
        [keys[0], keys[1], request_key],
        [str(daily), str(total), str(keys[3])],
    )
    if result[0] == 2:
        raise AssistantDuplicateRequest("This AI request was already reserved")
    if result[0] == 0:
        raise AssistantQuotaReached("Conversational AI pilot capacity reached")
    if result[0] != 1:
        raise AssistantQuotaUnavailable("Invalid AI quota reservation")
    return _status(result[1], result[2], daily, total, keys[2])
