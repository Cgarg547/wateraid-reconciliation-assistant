import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app, validate_review_request, ReviewRequest

client = TestClient(app)


def test_blank_reviewer_id_is_rejected():
    request = ReviewRequest(
        reviewer_id="   ",
        decision="approved",
        rationale="Verified the supporting records.",
    )

    with pytest.raises(HTTPException) as exc:
        validate_review_request(request)

    assert exc.value.status_code == 400
    assert "Reviewer ID cannot be blank" in exc.value.detail


def test_short_rationale_is_rejected():
    with pytest.raises(Exception) as exc:
        ReviewRequest(
            reviewer_id="reviewer-test",
            decision="approved",
            rationale="  ",
        )

    assert "at least 3 characters" in str(exc.value)


def test_invalid_decision_is_rejected():
    request = ReviewRequest(
        reviewer_id="reviewer-test",
        decision="pending",
        rationale="Checked the source records.",
    )

    with pytest.raises(HTTPException) as exc:
        validate_review_request(request)

    assert exc.value.status_code == 400
    assert "Decision must be approved or rejected" in exc.value.detail


@pytest.mark.parametrize("decision", ["approved", "rejected"])
def test_valid_review_request_is_accepted(decision):
    request = ReviewRequest(
        reviewer_id="reviewer-test",
        decision=decision,
        rationale="Checked the source records.",
    )

    validate_review_request(request)


def test_review_api_rejects_negative_item_index():
    response = client.post(
        "/api/reconciliation-runs/demo/reviews/-1",
        json={
            "reviewer_id": "reviewer-test",
            "decision": "approved",
            "rationale": "Checked the source records.",
        },
    )

    assert response.status_code == 400
    assert "non-negative" in response.json()["detail"]
