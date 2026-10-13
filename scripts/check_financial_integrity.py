import csv
from decimal import Decimal
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data" / "synthetic"

# Expected totals for dataset version 1.0.
# These are independent source totals, not cross-system equality targets.
EXPECTED = {
    "processor": {
        "records": 10,
        "gross_total": Decimal("490.00"),
        "fee_total": Decimal("1.50"),
    },
    "bank": {
        "records": 8,
        "deposit_total": Decimal("337.50"),
    },
    "ledger": {
        "records": 9,
        "recorded_total": Decimal("450.00"),
    },
}


def read_rows(filename: str) -> list[dict[str, str]]:
    with (DATA_DIR / filename).open(
        newline="", encoding="utf-8-sig"
    ) as file:
        return list(csv.DictReader(file))


def total(rows: list[dict[str, str]], field: str) -> Decimal:
    return sum((Decimal(row[field]) for row in rows), Decimal("0.00"))


def main() -> int:
    processor = read_rows("processor.csv")
    bank = read_rows("bank.csv")
    ledger = read_rows("ledger.csv")

    actual = {
        "processor": {
            "records": len(processor),
            "gross_total": total(processor, "gross_amount"),
            "fee_total": total(processor, "fee"),
        },
        "bank": {
            "records": len(bank),
            "deposit_total": total(bank, "deposit_amount"),
        },
        "ledger": {
            "records": len(ledger),
            "recorded_total": total(ledger, "recorded_amount"),
        },
    }

    print("WATERAID SOURCE FINANCIAL INTEGRITY CHECK")
    print("=" * 48)
    failures = []

    for source, fields in EXPECTED.items():
        print(f"\n{source.upper()}")
        for field, expected_value in fields.items():
            actual_value = actual[source][field]
            passed = actual_value == expected_value
            print(
                f"  {'PASS' if passed else 'FAIL'} {field}: "
                f"actual={actual_value}; expected={expected_value}"
            )
            if not passed:
                failures.append(f"{source}.{field}")

    print("\nThese are independent source totals.")
    print("Differences between sources are not automatically errors;")
    print("fees, refunds, missing records, and timing can explain differences.")

    print(f"\nIntegrity checks passed: {sum(len(v) for v in EXPECTED.values()) - len(failures)}"
          f"/{sum(len(v) for v in EXPECTED.values())}")
    if failures:
        print("Failed checks: " + ", ".join(failures))
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
