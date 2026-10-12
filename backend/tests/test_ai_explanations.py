
import pytest

from app.ai_explanations import (
    build_fallback_explanation,
    explain_reconciliation_item,
)


@pytest.mark.parametrize(
    ("classification", "expected_phrase"),
    [
        ("fee_adjusted_settlement", "processor fee"),
        ("amount_mismatch", "processing fees"),
        ("exact_amount_match", "classified this item as a match"),
        ("missing_bank_record", "bank entry"),
        ("ambiguous_bank_candidate", "Amount agreement alone does not prove"),
        ("unreferenced_bank_record", "no settlement reference"),
    ],
)
def test_engine_classifications_get_specific_explanations(
    classification, expected_phrase
):
    result = build_fallback_explanation(
        {
            "classification": classification,
            "evidence": ["Example evidence for testing."],
        }
    )

    assert result["mode"] == "rules_based"
    assert result["advisory_only"] is True
    assert expected_phrase.lower() in result["likely_cause"].lower()
    assert result["recommended_steps"]
    assert result["evidence_considered"] == [
        "Example evidence for testing."
    ]
    assert "human" in result["limitations"].lower()


def test_unknown_classification_uses_safe_generic_guidance():
    result = build_fallback_explanation(
        {
            "classification": "unrecognized_test_classification",
            "evidence": [],
        }
    )

    assert result["mode"] == "rules_based"
    assert result["advisory_only"] is True
    assert result["recommended_steps"]
    assert "not an independent" in result["limitations"]


def test_live_ai_disabled_uses_fallback_without_api_call(monkeypatch):
    monkeypatch.setenv("OPENAI_ENABLED", "false")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key-not-used")

    def fail_if_called(*args, **kwargs):
        raise AssertionError("OpenAI must not be called in disabled mode")

    monkeypatch.setattr(
        "app.ai_explanations.OpenAI",
        fail_if_called,
    )

    result = explain_reconciliation_item(
        {
            "classification": "amount_mismatch",
            "evidence": ["Expected net: 50.00.", "Bank deposit: 45.00."],
        }
    )

    assert result["mode"] == "rules_based"
    assert result["advisory_only"] is True



def test_duplicate_and_partial_refund_classifications_have_specific_guidance():
    duplicate = build_fallback_explanation(
        {
            "classification": "duplicate_processor_record",
            "evidence": [
                "Repeated processor transaction ID detected.",
                "All affected records require review.",
            ],
        }
    )
    refund = build_fallback_explanation(
        {
            "classification": "donation_and_partial_refund",
            "evidence": [
                "Payment and refund records are present.",
                "All source currencies agree.",
            ],
        }
    )

    assert duplicate["mode"] == "rules_based"
    assert duplicate["advisory_only"] is True
    assert "repeated processor transaction id" in (
        duplicate["likely_cause"].lower()
    )
    assert any(
        "processor transaction ID" in step
        for step in duplicate["recommended_steps"]
    )

    assert refund["mode"] == "rules_based"
    assert refund["advisory_only"] is True
    assert "partial refund" in refund["likely_cause"].lower()
    assert any(
        "refund" in step.lower()
        for step in refund["recommended_steps"]
    )

    assert duplicate["evidence_considered"]
    assert refund["evidence_considered"]
