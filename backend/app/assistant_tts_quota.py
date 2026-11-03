"""Independent Redis quota for staging-only Langa speech generation.

No payment, N-ATLAS or conversational AI quota changes.
Reservations are atomic and are not refunded after uncertain outcomes.
The calling route must independently authenticate the live assistant
session and verify the signed AI-answer authorization before reserving.
"""
from __future__ import annotations

import hashlib
import re
from datetime import datetime, timedelta, timezone

from .assistant_access import _eval, AssistantAccessUnavailable

_PREFIX = "vbpay:{assistant-tts}:"
_HEX64 = re.compile(r"^[a-f0-9]{64}$")
_HEX32 = re.compile(r"^[a-f0-9]{32}$")

_DAILY_LIMIT = 15
_MONTHLY_LIMIT = 50
_CLIENT_DAILY_LIMIT = 10
_SESSION_LIMIT = 6
_MINUTE_LIMIT = 4

_RESERVE_LUA = """
if redis.call('EXISTS', KEYS[6]) == 1 then return 2 end

local day = tonumber(redis.call('GET', KEYS[1]) or '0')
local month = tonumber(redis.call('GET', KEYS[2]) or '0')
local client = tonumber(redis.call('GET', KEYS[3]) or '0')
local session = tonumber(redis.call('GET', KEYS[4]) or '0')
local minute = tonumber(redis.call('GET', KEYS[5]) or '0')

if day >= tonumber(ARGV[1]) or
   month >= tonumber(ARGV[2]) or
   client >= tonumber(ARGV[3]) or
   session >= tonumber(ARGV[4]) or
   minute >= tonumber(ARGV[5]) then
    return 0
end

redis.call('INCR', KEYS[1])
redis.call('EXPIREAT', KEYS[1], tonumber(ARGV[6]))

redis.call('INCR', KEYS[2])
redis.call('EXPIREAT', KEYS[2], tonumber(ARGV[7]))

redis.call('INCR', KEYS[3])
redis.call('EXPIREAT', KEYS[3], tonumber(ARGV[6]))

redis.call('INCR', KEYS[4])
redis.call('EXPIRE', KEYS[4], 900)

redis.call('INCR', KEYS[5])
redis.call('EXPIRE', KEYS[5], 120)

redis.call('SET', KEYS[6], 'reserved', 'EX', 172800)
return 1
"""


class TTSQuotaUnavailable(Exception):
    pass


class TTSQuotaReached(Exception):
    pass


class TTSDuplicateRequest(Exception):
    pass


async def reserve_tts_quota(
    fingerprint: str,
    session_id: str,
    token_id: str,
) -> None:
    if (
        not isinstance(fingerprint, str)
        or not _HEX64.fullmatch(fingerprint)
        or not isinstance(session_id, str)
        or not _HEX32.fullmatch(session_id)
        or not isinstance(token_id, str)
        or not _HEX32.fullmatch(token_id)
    ):
        raise TTSQuotaUnavailable("Invalid speech reservation")

    now = datetime.now(timezone.utc)
    next_day = (now + timedelta(days=1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    next_month = (now.replace(day=28) + timedelta(days=4)).replace(
        day=1, hour=0, minute=0, second=0, microsecond=0
    )

    session_hash = hashlib.sha256(
        session_id.encode("ascii")
    ).hexdigest()

    keys = [
        _PREFIX + "day:" + now.strftime("%Y%m%d"),
        _PREFIX + "month:" + now.strftime("%Y%m"),
        _PREFIX + "client:" + now.strftime("%Y%m%d") + ":" + fingerprint,
        _PREFIX + "session:" + session_hash,
        _PREFIX + "minute:" + now.strftime("%Y%m%d%H%M"),
        _PREFIX + "request:" + token_id,
    ]

    args = [
        str(_DAILY_LIMIT),
        str(_MONTHLY_LIMIT),
        str(_CLIENT_DAILY_LIMIT),
        str(_SESSION_LIMIT),
        str(_MINUTE_LIMIT),
        str(int((next_day + timedelta(days=1)).timestamp())),
        str(int((next_month + timedelta(days=1)).timestamp())),
    ]

    try:
        result = await _eval(_RESERVE_LUA, keys, args)
    except AssistantAccessUnavailable:
        raise TTSQuotaUnavailable("Speech quota store unavailable") from None

    if type(result) is not int or result not in (0, 1, 2):
        raise TTSQuotaUnavailable("Invalid speech quota response")
    if result == 2:
        raise TTSDuplicateRequest("Speech request already reserved")
    if result == 0:
        raise TTSQuotaReached("Speech allowance reached")
