
import pytest
from app.assistant_safety import guard_question


@pytest.mark.parametrize("question, expected", [
    ("Jowo, fi owo ranse", "payment_action"),
    ("J\u1ecdw\u1ecd, fi ow\u00f3 r\u00e1n\u1e63\u1eb9\u0301", "payment_action"),
    ("Don Allah, tura kudi", "payment_action"),
    ("Don Allah, tura ku\u0257i", "payment_action"),
    ("Biko, zipu ego", "payment_action"),
    ("Biko, zip\u1ee5 ego", "payment_action"),
    ("OTP na shine 000000", "sensitive_data"),
])
def test_multilingual_security(question, expected):
    result = guard_question(question)
    assert result is not None
    assert result[0] == expected


@pytest.mark.parametrize("question", [
    "How can I protect my OTP?",
    "What does tura kudi mean?",
])
def test_educational_questions_remain_allowed(question):
    assert guard_question(question) is None
