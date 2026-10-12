
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
