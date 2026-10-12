
import sqlite3

from app.review_store import (
    DB_PATH,
    initialize_database,
    record_review,
    get_review_state,
)


def test_review_is_persisted_and_history_is_retained():
    initialize_database()

    run_id = f"test-persistence-{__import__('uuid').uuid4()}"
    reviewer = "test-reviewer"

    first = record_review(
        run_id,
        0,
        reviewer,
        "approved",
        "First review decision.",
    )

    second = record_review(
        run_id,
        0,
        reviewer,
        "rejected",
        "Correction after further investigation.",
    )

    state = get_review_state(run_id)

    assert first["id"] != second["id"]
    assert state["decisions"]["0"]["decision"] == "rejected"

    history = [
        event for event in state["history"]
        if event["run_id"] == run_id
    ]
    assert len(history) == 2
    assert history[0]["decision"] == "approved"
    assert history[1]["decision"] == "rejected"
    assert all(event["created_at"] for event in history)
