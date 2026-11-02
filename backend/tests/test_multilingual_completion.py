
import pytest
from app.assistant_routes import _false_payment_completion


@pytest.mark.parametrize("answer", [
    "Mo ti fi owo ran\u1e63\u1eb9 fun \u1ecd.",
    "Isanwo re ti pari.",
    "Na tura maka ku\u0257i.",
    "An kammala biyan kudinka.",
    "Ezigara m g\u1ecb ego.",
    "Akw\u1ee5 \u1ee5gw\u1ecd g\u1ecb agw\u1ee5la.",
])
def test_multilingual_false_payment_claims_blocked(answer):
    assert _false_payment_completion(answer)


@pytest.mark.parametrize("answer", [
    "A digital payment is electronic.",
    "Bank transfers should be verified with the payment provider.",
])
def test_educational_answers_not_blocked(answer):
    assert not _false_payment_completion(answer)
