#!/usr/bin/env python3
"""Compare manual and assisted reconciliation effort.

Default inputs are illustrative assumptions, not measured WaterAid results.
Replace them with timed observations before making claims about actual savings.
"""

import argparse


def calculate_effort(
    transactions: int,
    manual_prep_minutes: float,
    manual_review_minutes: float,
    assisted_prep_minutes: float,
    assisted_review_minutes: float,
    correction_minutes: float,
) -> dict[str, float]:
    manual_total = manual_prep_minutes + manual_review_minutes
    assisted_total = (
        assisted_prep_minutes + assisted_review_minutes + correction_minutes
    )
    time_released = manual_total - assisted_total

    return {
        "manual_total_minutes": manual_total,
        "assisted_total_minutes": assisted_total,
        "time_released_minutes": time_released,
        "time_released_percent": (
            time_released / manual_total * 100 if manual_total > 0 else 0.0
        ),
        "manual_minutes_per_transaction": (
            manual_total / transactions if transactions else 0.0
        ),
        "assisted_minutes_per_transaction": (
            assisted_total / transactions if transactions else 0.0
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Compare manual and assisted reconciliation effort."
    )
    parser.add_argument("--transactions", type=int, default=100)
    parser.add_argument("--manual-prep", type=float, default=180)
    parser.add_argument("--manual-review", type=float, default=120)
    parser.add_argument("--assisted-prep", type=float, default=60)
    parser.add_argument("--assisted-review", type=float, default=100)
    parser.add_argument("--correction", type=float, default=20)
    args = parser.parse_args()

    if args.transactions <= 0:
        parser.error("--transactions must be greater than zero")

    if any(value < 0 for value in (
        args.manual_prep,
        args.manual_review,
        args.assisted_prep,
        args.assisted_review,
        args.correction,
    )):
        parser.error("Time values cannot be negative")

    results = calculate_effort(
        args.transactions,
        args.manual_prep,
        args.manual_review,
        args.assisted_prep,
        args.assisted_review,
        args.correction,
    )

    print("WATERAID STAFF-EFFORT EVALUATION")
    print("=" * 48)
    print("ILLUSTRATIVE ASSUMPTIONS — NOT MEASURED RESULTS")
    print(f"Transactions evaluated: {args.transactions}")
    print()
    print(f"Manual preparation:      {args.manual_prep:.1f} min")
    print(f"Manual review:           {args.manual_review:.1f} min")
    print(f"Manual total:            {results['manual_total_minutes']:.1f} min")
    print()
    print(f"Assisted preparation:    {args.assisted_prep:.1f} min")
    print(f"Assisted review:         {args.assisted_review:.1f} min")
    print(f"Corrections:             {args.correction:.1f} min")
    print(f"Assisted total:          {results['assisted_total_minutes']:.1f} min")
    print()
    print(f"Time released:           {results['time_released_minutes']:.1f} min")
    print(f"Time released:           {results['time_released_percent']:.1f}%")
    print(
        "Manual min/transaction:  "
        f"{results['manual_minutes_per_transaction']:.2f}"
    )
    print(
        "Assisted min/transaction: "
        f"{results['assisted_minutes_per_transaction']:.2f}"
    )
    print()
    print("Time released is capacity, not automatically cash savings.")
    print("Use the same case volume when timing both workflows.")


if __name__ == "__main__":
    main()
