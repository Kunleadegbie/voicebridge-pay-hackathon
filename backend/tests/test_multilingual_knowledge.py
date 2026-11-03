
import pytest
from app.assistant_knowledge import select_knowledge


@pytest.mark.parametrize("language, question", [
    ("en-NG", "What is a digital payment?"),
    ("yo-NG", "K\u00ed ni \u00ecsanw\u00f3 on\u00ed-n\u1ecd\u0301mb\u00e0?"),
    ("ha-NG", "Menene biyan ku\u0257i ta hanyar lantarki?"),
    ("ig-NG", "G\u1ecbn\u1ecb b\u1ee5 \u1ecbkw\u1ee5 \u1ee5gw\u1ecd dijital\u1ee5?"),
])
def test_digital_payment_recognition(language, question):
    notes = select_knowledge(question, [])
    assert "digital_payments" in [note["id"] for note in notes]


def test_unrelated_question_not_matched():
    assert select_knowledge("What is the weather today?", []) == []


def test_multilingual_alias_respects_word_boundaries():
    assert select_knowledge("prefixisanwo oni-nombasuffix", []) == []
