
import csv
import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
EXPECTED_DIR = BASE_DIR.parent / "expected"
EXPECTED_DIR.mkdir(parents=True, exist_ok=True)

processor = [
    ["TX100", "DON-100", "100.00", "0.00", "CAD", "2026-10-01", "payment", ""],
    ["TX101", "DON-101", "50.00", "1.50", "CAD", "2026-10-02", "payment", ""],
    ["TX102", "DON-102", "75.00", "0.00", "CAD", "2026-10-03", "payment", ""],
    ["TX103", "DON-103", "80.00", "0.00", "CAD", "2026-10-04", "payment", ""],
    ["TX103-R1", "DON-103", "-20.00", "0.00", "CAD", "2026-10-05", "refund", "TX103"],
    ["TX104", "DON-104", "40.00", "0.00", "CAD", "2026-10-06", "payment", ""],
    ["TX104", "DON-104", "40.00", "0.00", "CAD", "2026-10-06", "payment", ""],
    ["TX105", "DON-105", "60.00", "0.00", "CAD", "2026-10-07", "payment", ""],
    ["TX106", "DON-106", "40.00", "0.00", "CAD", "2026-10-08", "payment", ""],
    ["TX107", "DON-107", "25.00", "0.00", "CAD", "2026-10-09", "payment", ""],
]

bank = [
    ["BANK100", "DON-100", "100.00", "CAD", "2026-10-02"],
    ["BANK101", "DON-101", "48.50", "CAD", "2026-10-03"],
    ["BANK103", "DON-103", "80.00", "CAD", "2026-10-05"],
    ["BANK103R", "DON-103", "-20.00", "CAD", "2026-10-06"],
    ["BANK104", "DON-104", "40.00", "CAD", "2026-10-07"],
    ["BANK106", "DON-106", "39.00", "CAD", "2026-10-09"],
    ["BANK107A", "", "25.00", "CAD", "2026-10-10"],
    ["BANK107B", "", "25.00", "CAD", "2026-10-10"],
]

ledger = [
    ["J100", "DON-100", "100.00", "CAD", "2026-10-02", "donation", ""],
    ["J101", "DON-101", "50.00", "CAD", "2026-10-03", "donation", ""],
    ["J102", "DON-102", "75.00", "CAD", "2026-10-04", "donation", ""],
    ["J103", "DON-103", "80.00", "CAD", "2026-10-05", "donation", ""],
    ["J103R", "DON-103", "-20.00", "CAD", "2026-10-06", "refund", "DON-103"],
    ["J104", "DON-104", "40.00", "CAD", "2026-10-07", "donation", ""],
    ["J105", "DON-105", "60.00", "CAD", "2026-10-08", "donation", ""],
    ["J106", "DON-106", "40.00", "CAD", "2026-10-09", "donation", ""],
    ["J107", "DON-107", "25.00", "CAD", "2026-10-10", "donation", ""],
]

def write_csv(filename, headers, rows):
    path = BASE_DIR / filename
    with path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        writer.writerow(headers)
        writer.writerows(rows)
    print(f"Created {path.name}: {len(rows)} records")

write_csv(
    "processor.csv",
    [
        "transaction_id", "payment_reference", "gross_amount",
        "fee", "currency", "settlement_date", "entry_type",
        "original_transaction_id",
    ],
    processor,
)

write_csv(
    "bank.csv",
    [
        "bank_reference", "settlement_reference",
        "deposit_amount", "currency", "transaction_date",
    ],
    bank,
)

write_csv(
    "ledger.csv",
    [
        "journal_reference", "donation_reference",
        "recorded_amount", "currency", "posting_date",
        "entry_type", "original_donation_reference",
    ],
    ledger,
)

# This answer key is for evaluation only.
# The reconciliation engine must never load or import it.
answer_key = {
    "dataset_version": "1.0",
    "synthetic_data_only": True,
    "cases": [
        {
            "case_id": "DON-100",
            "expected": "exact_match",
            "review_required": True,
        },
        {
            "case_id": "DON-101",
            "expected": "fee_adjusted_settlement",
            "review_required": True,
        },
        {
            "case_id": "DON-102",
            "expected": "missing_bank_record",
            "review_required": True,
        },
        {
            "case_id": "DON-103",
            "expected": "donation_and_partial_refund",
            "review_required": True,
        },
        {
            "case_id": "DON-104",
            "expected": "duplicate_processor_record",
            "review_required": True,
        },
        {
            "case_id": "DON-105",
            "expected": "missing_bank_record",
            "review_required": True,
        },
        {
            "case_id": "DON-106",
            "expected": "amount_mismatch",
            "review_required": True,
        },
        {
            "case_id": "DON-107",
            "expected": "ambiguous_bank_candidate",
            "review_required": True,
        },
    ],
}

answer_path = EXPECTED_DIR / "answer_key.json"
answer_path.write_text(
    json.dumps(answer_key, indent=2) + "\n",
    encoding="utf-8",
)

print(f"Created answer key: {answer_path}")
print("Synthetic dataset generation complete.")
