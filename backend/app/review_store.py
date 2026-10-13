
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(os.getenv("DATABASE_PATH", str(Path(__file__).resolve().parents[1] / "reconciliation.db")))


def connect():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    with connect() as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS review_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT NOT NULL,
                item_index INTEGER NOT NULL,
                reviewer_id TEXT NOT NULL,
                decision TEXT NOT NULL
                    CHECK (decision IN ('approved', 'rejected')),
                rationale TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)

        connection.execute("""
            CREATE INDEX IF NOT EXISTS idx_review_events_run_item
            ON review_events (run_id, item_index, id)
        """)


def record_review(
    run_id: str,
    item_index: int,
    reviewer_id: str,
    decision: str,
    rationale: str,
):
    created_at = datetime.now(timezone.utc).isoformat()

    with connect() as connection:
        cursor = connection.execute(
            """
            INSERT INTO review_events (
                run_id, item_index, reviewer_id,
                decision, rationale, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                item_index,
                reviewer_id,
                decision,
                rationale,
                created_at,
            ),
        )

        return dict(
            connection.execute(
                "SELECT * FROM review_events WHERE id = ?",
                (cursor.lastrowid,),
            ).fetchone()
        )


def get_review_state(run_id: str):
    with connect() as connection:
        rows = connection.execute(
            """
            SELECT * FROM review_events
            WHERE run_id = ?
            ORDER BY id ASC
            """,
            (run_id,),
        ).fetchall()

    history = [dict(row) for row in rows]
    latest = {}

    for event in history:
        latest[str(event["item_index"])] = event

    return {
        "run_id": run_id,
        "decisions": latest,
        "history": history,
    }
