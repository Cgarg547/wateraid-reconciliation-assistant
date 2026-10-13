import sys
from decimal import Decimal
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = PROJECT_ROOT / "backend"
DATA_DIR = PROJECT_ROOT / "data" / "synthetic"

sys.path.insert(0, str(BACKEND_DIR))

from app.reconciliation import reconcile  # noqa: E402


def amount(value: str) -> Decimal:
    return Decimal(value)


def main() -> int:
    result = reconcile(
        DATA_DIR / "processor.csv",
        DATA_DIR / "bank.csv",
        DATA_DIR / "ledger.csv",
    )

    summary = result["summary"]
    items = result["items"]

    by_reference = {
        item["reference"]: item
        for item in items
        if item.get("reference")
    }

    duplicate = by_reference["DON-104"]
    mismatch = by_reference["DON-106"]
    refund = by_reference["DON-103"]
    fee_case = by_reference["DON-101"]

    ambiguous_bank_items = [
        item for item in items
        if item["classification"] == "ambiguous_bank_candidate"
    ]

    duplicate_gross = sum(
        (
            amount(record["record"]["gross_amount"])
            for record in duplicate["source_records"]["processor"]
        ),
        Decimal("0.00"),
    )
    duplicate_potential_exposure = (
        duplicate_gross
        - max(
            (
                amount(record["record"]["gross_amount"])
                for record in duplicate["source_records"]["processor"]
            ),
            default=Decimal("0.00"),
        )
    )

    mismatch_bank = amount(
        mismatch["source_records"]["bank"][0]["record"]["deposit_amount"]
    )
    mismatch_expected_net = (
        amount(
            mismatch["source_records"]["processor"][0]["record"]["gross_amount"]
        )
        - amount(
            mismatch["source_records"]["processor"][0]["record"]["fee"]
        )
    )
    mismatch_difference = mismatch_expected_net - mismatch_bank

    ambiguous_bank_total = sum(
        (
            amount(item["source_records"]["bank"][0]["record"]["deposit_amount"])
            for item in ambiguous_bank_items
        ),
        Decimal("0.00"),
    )

    fee_amount = amount(
        fee_case["source_records"]["processor"][0]["record"]["fee"]
    )

    refund_amount = sum(
        (
            amount(record["record"]["gross_amount"])
            for record in refund["source_records"]["processor"]
            if record["record"]["entry_type"].lower() == "refund"
        ),
        Decimal("0.00"),
    )

    print("WATERAID FINANCIAL-IMPACT EVALUATION")
    print("=" * 54)
    print("Synthetic data only · CAD · Human review required")
    print()
    print("INDEPENDENT SOURCE TOTALS")
    print(f"Processor gross:       ${amount(summary['processor_gross_total']):,.2f}")
    print(f"Processor fees:        ${amount(summary['processor_fee_total']):,.2f}")
    print(f"Bank deposits:         ${amount(summary['bank_deposit_total']):,.2f}")
    print(f"Ledger recorded total: ${amount(summary['ledger_recorded_total']):,.2f}")
    print()
    print("INVESTIGATION EXAMPLES")
    print(
        f"DON-101 fee:            ${fee_amount:,.2f} "
        "(recorded fee; verify net settlement)"
    )
    print(
        f"DON-103 refund:         ${refund_amount:,.2f} "
        "(recorded refund; not automatically a loss)"
    )
    print(
        f"DON-104 duplicate:      ${duplicate_potential_exposure:,.2f} "
        "(potential duplicate exposure; not confirmed loss)"
    )
    print(
        f"DON-106 difference:     ${mismatch_difference:,.2f} "
        "(expected net less observed bank deposit)"
    )
    print(
        f"DON-107 ambiguous bank: ${ambiguous_bank_total:,.2f} "
        "(two unreferenced deposits; not confirmed matches)"
    )
    print()
    print("REVIEW SAFEGUARDS")
    print(f"Reconciliation items: {len(items)}")
    print(
        "All items require human review: "
        f"{all(item.get('review_required') is True for item in items)}"
    )
    print(
        "All items remain pending: "
        f"{all(item.get('status') == 'pending_review' for item in items)}"
    )
    print()
    print(
        "Interpretation: source totals are independent. The amounts above "
        "are investigation evidence, not confirmed losses or cash savings."
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
