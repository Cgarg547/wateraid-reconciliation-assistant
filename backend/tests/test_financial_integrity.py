import csv
from decimal import Decimal
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data" / "synthetic"


def read_rows(filename: str) -> list[dict[str, str]]:
    with (DATA_DIR / filename).open(
        newline="", encoding="utf-8-sig"
    ) as file:
        return list(csv.DictReader(file))


def total(rows: list[dict[str, str]], field: str) -> Decimal:
    return sum(
        (Decimal(row[field]) for row in rows),
        Decimal("0.00"),
    )


def test_processor_source_integrity():
    rows = read_rows("processor.csv")

    assert len(rows) == 10
    assert total(rows, "gross_amount") == Decimal("490.00")
    assert total(rows, "fee") == Decimal("1.50")


def test_bank_source_integrity():
    rows = read_rows("bank.csv")

    assert len(rows) == 8
    assert total(rows, "deposit_amount") == Decimal("337.50")


def test_ledger_source_integrity():
    rows = read_rows("ledger.csv")

    assert len(rows) == 9
    assert total(rows, "recorded_amount") == Decimal("450.00")
