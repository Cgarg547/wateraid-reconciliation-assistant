
from pathlib import Path

from app.reconciliation import reconcile


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data" / "synthetic"


def run_demo():
    return reconcile(
        DATA_DIR / "processor.csv",
        DATA_DIR / "bank.csv",
        DATA_DIR / "ledger.csv",
    )


def test_all_source_records_are_loaded():
    result = run_demo()
    summary = result["summary"]

    assert summary["processor_records"] == 10
    assert summary["bank_records"] == 8
    assert summary["ledger_records"] == 9


def test_exact_amount_match():
    result = run_demo()
    item = next(
        item for item in result["items"]
        if item["reference"] == "DON-100"
    )

    assert item["classification"] == "exact_amount_match"
    assert item["status"] == "pending_review"


def test_fee_adjusted_settlement():
    result = run_demo()
    item = next(
        item for item in result["items"]
        if item["reference"] == "DON-101"
    )

    assert item["classification"] == "fee_adjusted_settlement"
    assert any("Expected net: 48.50" in e for e in item["evidence"])


def test_missing_bank_record():
    result = run_demo()
    item = next(
        item for item in result["items"]
        if item["reference"] == "DON-102"
    )

    assert item["classification"] == "missing_bank_record"


def test_duplicate_processor_record_is_flagged():
    result = run_demo()
    item = next(
        item for item in result["items"]
        if item["reference"] == "DON-104"
    )

    assert item["classification"] == "duplicate_processor_record"


def test_amount_mismatch_is_flagged():
    result = run_demo()
    item = next(
        item for item in result["items"]
        if item["reference"] == "DON-106"
    )

    assert item["classification"] == "amount_mismatch"


def test_refund_is_classified_as_payment_and_partial_refund():
    result = run_demo()
    item = next(
        item for item in result["items"]
        if item["reference"] == "DON-103"
    )

    assert item["classification"] == "donation_and_partial_refund"
    assert item["status"] == "pending_review"
    assert item["review_required"] is True
    assert len(item["source_records"]["processor"]) == 2
    assert len(item["source_records"]["bank"]) == 2
    assert len(item["source_records"]["ledger"]) == 2


def test_unreferenced_bank_records_are_ambiguous_not_auto_matched():
    result = run_demo()

    items = [
        item for item in result["items"]
        if item["classification"] == "ambiguous_bank_candidate"
    ]

    assert len(items) == 2
    assert all(item["status"] == "pending_review" for item in items)
    assert all(item["review_required"] is True for item in items)

    # The same processor candidate must not be presented as a linked
    # source record for both unreferenced bank entries.
    assert all(not item["source_records"]["processor"] for item in items)


def test_all_items_require_human_review():
    result = run_demo()

    assert result["items"]
    assert all(
        item["review_required"] is True
        and item["status"] == "pending_review"
        for item in result["items"]
    )


def test_source_row_references_are_preserved():
    result = run_demo()
    item = next(
        item for item in result["items"]
        if item["reference"] == "DON-100"
    )

    processor_records = item["source_records"]["processor"]

    assert processor_records
    assert processor_records[0]["source"] == "processor"
    assert processor_records[0]["row_number"] == 2


def test_refund_with_incorrect_ledger_amount_is_not_classified_as_valid(
    tmp_path,
):
    import csv

    processor_path = DATA_DIR / "processor.csv"
    bank_path = DATA_DIR / "bank.csv"
    ledger_path = tmp_path / "ledger.csv"

    with ledger_path.open("w", newline="", encoding="utf-8") as file:
        with (DATA_DIR / "ledger.csv").open(
            newline="", encoding="utf-8"
        ) as original:
            reader = csv.DictReader(original)
            writer = csv.DictWriter(file, fieldnames=reader.fieldnames)
            writer.writeheader()

            for row in reader:
                if row["donation_reference"] == "DON-103" and row[
                    "entry_type"
                ].strip().lower() == "refund":
                    row["recorded_amount"] = "-15.00"
                writer.writerow(row)

    result = reconcile(processor_path, bank_path, ledger_path)
    item = next(
        item for item in result["items"]
        if item["reference"] == "DON-103"
    )

    assert item["classification"] != "donation_and_partial_refund"
    assert item["status"] == "pending_review"


def test_refund_with_currency_mismatch_is_not_classified_as_valid(
    tmp_path,
):
    import csv

    processor_path = DATA_DIR / "processor.csv"
    bank_path = DATA_DIR / "bank.csv"
    ledger_path = tmp_path / "ledger.csv"

    with ledger_path.open("w", newline="", encoding="utf-8") as file:
        with (DATA_DIR / "ledger.csv").open(
            newline="", encoding="utf-8"
        ) as original:
            reader = csv.DictReader(original)
            writer = csv.DictWriter(file, fieldnames=reader.fieldnames)
            writer.writeheader()

            for row in reader:
                if row["donation_reference"] == "DON-103" and row[
                    "entry_type"
                ].strip().lower() == "refund":
                    row["currency"] = "USD"
                writer.writerow(row)

    result = reconcile(processor_path, bank_path, ledger_path)
    item = next(
        item for item in result["items"]
        if item["reference"] == "DON-103"
    )

    assert item["classification"] != "donation_and_partial_refund"
    assert item["status"] == "pending_review"



def test_ambiguous_bank_candidates_are_never_auto_approved():
    result = run_demo()

    ambiguous_items = [
        item for item in result["items"]
        if item["classification"] == "ambiguous_bank_candidate"
    ]

    assert len(ambiguous_items) == 2

    for item in ambiguous_items:
        assert item["status"] == "pending_review"
        assert item["review_required"] is True
        assert item["source_records"]["processor"] == []


def test_every_reconciliation_item_requires_review():
    result = run_demo()

    for item in result["items"]:
        assert item["status"] == "pending_review"
        assert item["review_required"] is True


def test_duplicate_processor_record_retains_source_evidence():
    result = run_demo()

    item = next(
        item for item in result["items"]
        if item["reference"] == "DON-104"
    )

    processor_records = item["source_records"]["processor"]

    assert item["classification"] == "duplicate_processor_record"
    assert len(processor_records) >= 2
    assert all(
        record["source"] == "processor"
        and record["row_number"] >= 2
        for record in processor_records
    )


def test_blank_processor_payment_reference_is_rejected(tmp_path):
    import csv

    processor_path = tmp_path / "processor.csv"

    with (DATA_DIR / "processor.csv").open(
        newline="", encoding="utf-8"
    ) as original:
        reader = csv.DictReader(original)
        rows = list(reader)
        fieldnames = reader.fieldnames

    rows[0]["payment_reference"] = ""

    with processor_path.open(
        "w", newline="", encoding="utf-8"
    ) as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    from app.reconciliation import ReconciliationError

    try:
        reconcile(
            processor_path,
            DATA_DIR / "bank.csv",
            DATA_DIR / "ledger.csv",
        )
    except ReconciliationError as exc:
        assert "payment_reference" in str(exc)
    else:
        raise AssertionError(
            "Expected a blank processor payment reference to be rejected"
        )


def test_invalid_processor_amount_is_rejected(tmp_path):
    import csv

    from app.reconciliation import ReconciliationError

    processor_path = tmp_path / "processor.csv"

    with (DATA_DIR / "processor.csv").open(
        newline="", encoding="utf-8"
    ) as original:
        reader = csv.DictReader(original)
        rows = list(reader)
        fieldnames = reader.fieldnames

    rows[0]["gross_amount"] = "abc"

    with processor_path.open(
        "w", newline="", encoding="utf-8"
    ) as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    try:
        reconcile(
            processor_path,
            DATA_DIR / "bank.csv",
            DATA_DIR / "ledger.csv",
        )
    except ReconciliationError as exc:
        assert "gross_amount" in str(exc)
        assert "abc" in str(exc)
    else:
        raise AssertionError(
            "Expected invalid processor amount to be rejected"
        )


def test_missing_required_processor_column_is_rejected(tmp_path):
    import csv

    from app.reconciliation import ReconciliationError

    processor_path = tmp_path / "processor.csv"

    with (DATA_DIR / "processor.csv").open(
        newline="", encoding="utf-8"
    ) as original:
        reader = csv.DictReader(original)
        fieldnames = [
            field for field in reader.fieldnames
            if field != "gross_amount"
        ]
        rows = list(reader)

    with processor_path.open(
        "w", newline="", encoding="utf-8"
    ) as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(
            {
                key: value
                for key, value in row.items()
                if key in fieldnames
            }
            for row in rows
        )

    try:
        reconcile(
            processor_path,
            DATA_DIR / "bank.csv",
            DATA_DIR / "ledger.csv",
        )
    except ReconciliationError as exc:
        assert "gross_amount" in str(exc)
        assert "missing columns" in str(exc)
    else:
        raise AssertionError(
            "Expected missing processor column to be rejected"
        )

def test_every_item_has_explicit_review_priority():
    result = run_demo()

    assert result["items"]
    assert all(
        item.get("review_priority") in {"high", "medium", "low"}
        for item in result["items"]
    )

def test_high_risk_exceptions_are_prioritized():
    result = run_demo()

    high_priority = [
        item for item in result["items"]
        if item.get("review_priority") == "high"
    ]

    high_priority_classifications = {
        item["classification"] for item in high_priority
    }

    assert "amount_mismatch" in high_priority_classifications
    assert "duplicate_processor_record" in high_priority_classifications
    assert "ambiguous_bank_candidate" in high_priority_classifications

def test_confidence_never_automatically_approves_items():
    result = run_demo()

    assert all(
        item["status"] == "pending_review"
        and item["review_required"] is True
        for item in result["items"]
    )
