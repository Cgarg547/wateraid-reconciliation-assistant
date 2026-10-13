
import csv
from collections import Counter, defaultdict
from decimal import Decimal, InvalidOperation
from pathlib import Path


class ReconciliationError(ValueError):
    """Raised when a source file cannot be reconciled safely."""


REQUIRED_COLUMNS = {
    "processor": {
        "transaction_id",
        "payment_reference",
        "gross_amount",
        "fee",
        "currency",
        "settlement_date",
        "entry_type",
        "original_transaction_id",
    },
    "bank": {
        "bank_reference",
        "settlement_reference",
        "deposit_amount",
        "currency",
        "transaction_date",
    },
    "ledger": {
        "journal_reference",
        "donation_reference",
        "recorded_amount",
        "currency",
        "posting_date",
        "entry_type",
        "original_donation_reference",
    },
}


def load_csv(path: str | Path, source: str) -> list[dict]:
    """Load a CSV and preserve its original row numbers."""
    with Path(path).open(
        "r", newline="", encoding="utf-8-sig"
    ) as file:
        reader = csv.DictReader(file)

        if not reader.fieldnames:
            raise ReconciliationError(
                f"{source}: file is empty or has no header."
            )

        missing = REQUIRED_COLUMNS[source] - set(reader.fieldnames)
        if missing:
            raise ReconciliationError(
                f"{source}: missing columns: {sorted(missing)}"
            )

        rows = []
        for line_number, row in enumerate(reader, start=2):
            row["_source"] = source
            row["_row_number"] = line_number
            rows.append(row)

        return rows

def validate_nonempty_fields(
    rows: list[dict],
    fields: list[str],
    source: str,
) -> None:
    """Reject records with missing identifiers or required text fields."""
    for row in rows:
        for field in fields:
            if not row.get(field, "").strip():
                raise ReconciliationError(
                    f"{source}: missing required value in {field} "
                    f"at row {row['_row_number']}."
                )

def money(value: str, field: str) -> Decimal:
    try:
        amount = Decimal(value)
        if not amount.is_finite():
            raise InvalidOperation
        return amount
    except (InvalidOperation, TypeError, ValueError):
        raise ReconciliationError(
            f"Invalid monetary value in {field}: {value!r}"
        ) from None


def index_by(rows: list[dict], field: str) -> dict[str, list[dict]]:
    index = defaultdict(list)
    for row in rows:
        key = row.get(field, "").strip()
        if key:
            index[key].append(row)
    return index


def reconcile(
    processor_path: str | Path,
    bank_path: str | Path,
    ledger_path: str | Path,
) -> dict:
    processor = load_csv(processor_path, "processor")
    bank = load_csv(bank_path, "bank")
    ledger = load_csv(ledger_path, "ledger")


    validate_nonempty_fields(
        processor,
        [
            "transaction_id",
            "payment_reference",
            "currency",
            "settlement_date",
            "entry_type",
        ],
        "processor",
    )
    validate_nonempty_fields(
        bank,
        [
            "bank_reference",
            "currency",
            "transaction_date",
        ],
        "bank",
    )
    validate_nonempty_fields(
        ledger,
        [
            "journal_reference",
            "donation_reference",
            "currency",
            "posting_date",
            "entry_type",
        ],
        "ledger",
    )


    # Validate monetary fields before matching.
    for row in processor:
        row["_gross"] = money(row["gross_amount"], "gross_amount")
        row["_fee"] = money(row["fee"], "fee")

        if row["currency"].strip() == "":
            raise ReconciliationError("Processor currency is missing.")

    for row in bank:
        row["_amount"] = money(row["deposit_amount"], "deposit_amount")

        if row["currency"].strip() == "":
            raise ReconciliationError("Bank currency is missing.")

    for row in ledger:
        row["_amount"] = money(row["recorded_amount"], "recorded_amount")

        if row["currency"].strip() == "":
            raise ReconciliationError("Ledger currency is missing.")

    # Repeated transaction IDs must be flagged before matching.
    transaction_counts = Counter(
        row["transaction_id"].strip()
        for row in processor
        if row["transaction_id"].strip()
    )

    processor_by_ref = index_by(processor, "payment_reference")
    bank_by_ref = index_by(bank, "settlement_reference")
    ledger_by_ref = index_by(ledger, "donation_reference")

    results = []
    handled_bank_rows = set()

    def source_record(row: dict | None) -> dict | None:
        if row is None:
            return None

        return {
            "source": row["_source"],
            "row_number": row["_row_number"],
            "record": {
                key: value
                for key, value in row.items()
                if not key.startswith("_")
            },
        }

    def emit(
        reference: str,
        classification: str,
        processor_rows: list[dict],
        bank_rows: list[dict],
        ledger_rows: list[dict],
        evidence: list[str],
        score: int,
    ) -> None:
        results.append({
            "reference": reference or None,
            "classification": classification,
            "status": "pending_review",
            "review_required": True,
            "confidence_score": score,
            "evidence": evidence,
            "source_records": {
                "processor": [
                    source_record(row) for row in processor_rows
                ],
                "bank": [source_record(row) for row in bank_rows],
                "ledger": [source_record(row) for row in ledger_rows],
            },
        })

    # Evaluate each donation/payment reference.
    all_references = sorted(
        set(processor_by_ref)
        | set(bank_by_ref)
        | set(ledger_by_ref)
    )

    for reference in all_references:
        p_rows = processor_by_ref.get(reference, [])
        b_rows = bank_by_ref.get(reference, [])
        l_rows = ledger_by_ref.get(reference, [])

        duplicate_ids = [
            row["transaction_id"]
            for row in p_rows
            if transaction_counts[row["transaction_id"].strip()] > 1
        ]

        if duplicate_ids:
            emit(
                reference,
                "duplicate_processor_record",
                p_rows,
                b_rows,
                l_rows,
                [
                    "Repeated processor transaction ID detected.",
                    "All affected records require review.",
                ],
                100,
            )
            continue

        # Recognize a payment with its linked partial refund.
        # This is a classification for human review, not an approval.
        processor_types = {
            row["entry_type"].strip().lower() for row in p_rows
        }
        ledger_types = {
            row["entry_type"].strip().lower() for row in l_rows
        }

        is_payment_refund = (
            len(p_rows) == 2
            and len(b_rows) == 2
            and len(l_rows) == 2
            and processor_types == {"payment", "refund"}
            and ledger_types == {"donation", "refund"}
            and len({
                row["transaction_id"].strip() for row in p_rows
            }) == 2
        )

        if is_payment_refund:
            processor_by_id = {
                row["transaction_id"].strip(): row for row in p_rows
            }
            refund_processors = [
                row for row in p_rows
                if row["entry_type"].strip().lower() == "refund"
            ]
            refund_ledgers = [
                row for row in l_rows
                if row["entry_type"].strip().lower() == "refund"
            ]

            refund_linked = (
                len(refund_processors) == 1
                and len(refund_ledgers) == 1
                and refund_processors[0]["original_transaction_id"].strip()
                    in processor_by_id
                and refund_ledgers[0]["original_donation_reference"].strip()
                    == reference
            )

            if refund_linked:
                all_refund_currencies = {
                    row["currency"].strip()
                    for row in p_rows + b_rows + l_rows
                }

                processor_by_type = {
                    row["entry_type"].strip().lower(): row
                    for row in p_rows
                }
                ledger_by_type = {
                    row["entry_type"].strip().lower(): row
                    for row in l_rows
                }

                ledger_amounts_agree = (
                    ledger_by_type["donation"]["_amount"]
                    == processor_by_type["payment"]["_gross"]
                    and ledger_by_type["refund"]["_amount"]
                    == processor_by_type["refund"]["_gross"]
                )

                expected_bank_amounts = sorted(
                    row["_gross"] - row["_fee"] for row in p_rows
                )
                actual_bank_amounts = sorted(
                    row["_amount"] for row in b_rows
                )

                if (
                    len(all_refund_currencies) == 1
                    and ledger_amounts_agree
                    and expected_bank_amounts == actual_bank_amounts
                ):
                    handled_bank_rows.update(
                        row["_row_number"] for row in b_rows
                    )
                    emit(
                        reference,
                        "donation_and_partial_refund",
                        p_rows,
                        b_rows,
                        l_rows,
                        [
                            "Payment and refund records are present.",
                            "Processor payment/refund net amounts agree "
                            "with the bank deposits.",
                            "Ledger donation/refund amounts agree with "
                            "the corresponding processor entries.",
                            "All source currencies agree.",
                            "Review the original transaction link and "
                            "all source records before approval.",
                        ],
                        90,
                    )
                    continue

        if len(p_rows) > 1 or len(b_rows) > 1 or len(l_rows) > 1:
            emit(
                reference,
                "ambiguous_multiple_records",
                p_rows,
                b_rows,
                l_rows,
                ["Multiple records share this reference."],
                50,
            )
            continue

        p = p_rows[0] if p_rows else None
        b = b_rows[0] if b_rows else None
        l = l_rows[0] if l_rows else None

        if b is not None:
            handled_bank_rows.add(b["_row_number"])

        if p is None:
            emit(
                reference,
                "missing_processor_record",
                p_rows,
                b_rows,
                l_rows,
                ["No processor record exists for this reference."],
                100,
            )
            continue

        if l is None:
            emit(
                reference,
                "missing_ledger_record",
                p_rows,
                b_rows,
                l_rows,
                ["No ledger record exists for this reference."],
                100,
            )
            continue

        currencies = {
            p["currency"].strip(),
            l["currency"].strip(),
        }
        if b is not None:
            currencies.add(b["currency"].strip())

        if len(currencies) != 1:
            emit(
                reference,
                "currency_mismatch",
                p_rows,
                b_rows,
                l_rows,
                [f"Currency values differ: {sorted(currencies)}."],
                100,
            )
            continue

        if p["_gross"] != l["_amount"]:
            emit(
                reference,
                "amount_mismatch",
                p_rows,
                b_rows,
                l_rows,
                [
                    f"Processor gross: {p['_gross']}.",
                    f"Ledger amount: {l['_amount']}.",
                ],
                100,
            )
            continue

        if b is None:
            emit(
                reference,
                "missing_bank_record",
                p_rows,
                b_rows,
                l_rows,
                [
                    "Processor and ledger amounts agree.",
                    "No bank record was found for this reference.",
                ],
                100,
            )
            continue

        expected_net = p["_gross"] - p["_fee"]

        if b["_amount"] == expected_net and p["_fee"] != 0:
            classification = "fee_adjusted_settlement"
            evidence = [
                f"Gross amount: {p['_gross']}.",
                f"Processor fee: {p['_fee']}.",
                f"Expected net: {expected_net}.",
                f"Bank deposit: {b['_amount']}.",
            ]
        elif b["_amount"] != expected_net:
            classification = "amount_mismatch"
            evidence = [
                f"Expected net: {expected_net}.",
                f"Bank deposit: {b['_amount']}.",
                "The difference is not explained by the recorded fee.",
            ]
        else:
            classification = "exact_amount_match"
            evidence = [
                f"Processor gross and bank deposit agree: {b['_amount']}."
            ]

        emit(
            reference,
            classification,
            p_rows,
            b_rows,
            l_rows,
            evidence,
            100,
        )

    # Bank rows without a settlement reference are not safe to auto-match.
    unreferenced_bank = [
        row for row in bank
        if not row["settlement_reference"].strip()
    ]

    # Amount-only candidates are clues, never confirmed matches.
    # If multiple unreferenced bank rows point to the same processor row,
    # expose the ambiguity without attaching that processor row to each item.
    candidate_map = {}
    candidate_usage = Counter()

    for row in unreferenced_bank:
        candidates = [
            p for p in processor
            if p["currency"].strip() == row["currency"].strip()
            and p["_gross"] - p["_fee"] == row["_amount"]
        ]
        candidate_map[row["_row_number"]] = candidates
        for candidate in candidates:
            candidate_usage[candidate["_row_number"]] += 1

    for row in unreferenced_bank:
        candidates = candidate_map[row["_row_number"]]
        shared_candidates = [
            candidate for candidate in candidates
            if candidate_usage[candidate["_row_number"]] > 1
        ]
        classification = (
            "ambiguous_bank_candidate"
            if candidates
            else "unreferenced_bank_record"
        )

        # Shared candidates are described as evidence, not duplicated as
        # linked source records across multiple bank items.
        displayed_candidates = [
            candidate for candidate in candidates
            if candidate not in shared_candidates
        ]

        evidence = [
            f"Bank row {row['_row_number']} has no settlement reference.",
            f"{len(candidates)} processor record(s) share its net amount "
            "and currency.",
            "Amount agreement alone does not prove a match.",
        ]
        if shared_candidates:
            evidence.append(
                "Candidate processor record(s) are also plausible for "
                "another unreferenced bank row; no match was assigned."
            )

        emit(
            "",
            classification,
            displayed_candidates,
            [row],
            [],
            evidence,
            50 if candidates else 0,
        )

    processor_gross_total = sum(
        (row["_gross"] for row in processor),
        Decimal("0.00"),
    )
    processor_fee_total = sum(
        (row["_fee"] for row in processor),
        Decimal("0.00"),
    )
    bank_deposit_total = sum(
        (row["_amount"] for row in bank),
        Decimal("0.00"),
    )
    ledger_recorded_total = sum(
        (row["_amount"] for row in ledger),
        Decimal("0.00"),
    )

    return {
        "summary": {
            "processor_records": len(processor),
            "bank_records": len(bank),
            "ledger_records": len(ledger),
            "reconciliation_items": len(results),
            "items_pending_review": len(results),
            "processor_gross_total": str(processor_gross_total),
            "processor_fee_total": str(processor_fee_total),
            "bank_deposit_total": str(bank_deposit_total),
            "ledger_recorded_total": str(ledger_recorded_total),

        },
        "items": results,
        "notice": (
            "All proposed relationships require human review. "
            "Scores are rule-based indicators, not probabilities."
        ),
    }
