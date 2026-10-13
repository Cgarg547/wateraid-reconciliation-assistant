import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = PROJECT_ROOT / "backend"

sys.path.insert(0, str(BACKEND_DIR))

from app.reconciliation import reconcile  # noqa: E402


DATA_DIR = PROJECT_ROOT / "data" / "synthetic"
ANSWER_KEY_PATH = PROJECT_ROOT / "data" / "expected" / "answer_key.json"

# These labels have the same meaning in the current answer key and engine.
CLASSIFICATION_ALIASES = {
    "exact_match": "exact_amount_match",
}


def normalize_classification(value: str) -> str:
    return CLASSIFICATION_ALIASES.get(value, value)


def main() -> int:
    with ANSWER_KEY_PATH.open(encoding="utf-8") as file:
        answer_key = json.load(file)

    result = reconcile(
        DATA_DIR / "processor.csv",
        DATA_DIR / "bank.csv",
        DATA_DIR / "ledger.csv",
    )

    expected_cases = answer_key["cases"]
    actual_items = result["items"]

    # Match referenced cases to the engine's actual classifications.
    actual_by_reference = {}
    for item in actual_items:
        reference = item.get("reference")
        if reference:
            actual_by_reference.setdefault(reference, []).append(item)

    correct = 0
    mismatches = []
    missing_cases = []

    print("WATERAID RECONCILIATION EVALUATION")
    print("=" * 48)
    print(f"Dataset version: {answer_key.get('dataset_version', 'unknown')}")
    print(f"Synthetic data only: {answer_key.get('synthetic_data_only')}")
    print(f"Expected cases: {len(expected_cases)}")
    print(f"Actual reconciliation items: {len(actual_items)}")
    print()

    for case in expected_cases:
        case_id = case["case_id"]
        expected = case["expected"]
        candidates = actual_by_reference.get(case_id, [])

        if not candidates:
            missing_cases.append(case_id)
            print(f"FAIL  {case_id}: no result found; expected {expected}")
            continue

        # Multiple results for one reference are ambiguous for case scoring.
        if len(candidates) != 1:
            actual_labels = ", ".join(
                item["classification"] for item in candidates
            )
            mismatches.append(case_id)
            print(
                f"FAIL  {case_id}: expected one result ({expected}); "
                f"found {len(candidates)}: {actual_labels}"
            )
            continue

        item = candidates[0]
        actual = item["classification"]
        is_correct = (
            normalize_classification(actual)
            == normalize_classification(expected)
        )

        if is_correct:
            correct += 1
            label = "PASS"
        else:
            mismatches.append(case_id)
            label = "FAIL"

        print(
            f"{label}  {case_id}: expected={expected}; actual={actual}"
        )

    scored_cases = len(expected_cases)
    accuracy = (correct / scored_cases * 100) if scored_cases else 0

    review_required_cases = [
        case for case in expected_cases if case.get("review_required") is True
    ]
    review_compliant = all(
        item.get("review_required") is True
        and item.get("status") == "pending_review"
        for item in actual_items
    )

    unreferenced_items = [
        item for item in actual_items if not item.get("reference")
    ]
    extra_references = sorted(
        set(actual_by_reference)
        - {case["case_id"] for case in expected_cases}
    )

    
    # Validate the expected unreferenced-bank exception workflow.
    don_107_expected = next(
        (
            case for case in expected_cases
            if case["case_id"] == "DON-107"
        ),
        None,
    )
    related = (
        don_107_expected.get("related_exceptions", {})
        if don_107_expected else {}
    )

    expected_ambiguous_bank_cases = related.get("count", 0)
    ambiguous_bank_items = [
        item for item in actual_items
        if item["classification"] == related.get("classification")
    ]

    ambiguous_bank_valid = (
        len(ambiguous_bank_items) == expected_ambiguous_bank_cases
        and all(
            item.get("review_required") is True
            and item.get("status") == "pending_review"
            and not item["source_records"]["processor"]
            for item in ambiguous_bank_items
        )
        and related.get("review_required") is True
        and related.get("auto_match_allowed") is False
    )

    don_107_item = next(
        (
            item for item in actual_items
            if item.get("reference") == "DON-107"
        ),
        None,
    )
    don_107_valid = (
        don_107_expected is not None
        and don_107_item is not None
        and normalize_classification(don_107_item["classification"])
        == normalize_classification(don_107_expected["expected"])
        and ambiguous_bank_valid
    )

    print()
    print("-" * 48)
    print(f"Classification accuracy: {correct}/{scored_cases} ({accuracy:.1f}%)")
    print(f"Classification mismatches: {len(mismatches)}")
    print(f"Missing expected cases: {len(missing_cases)}")
    print(f"Cases requiring review in answer key: {len(review_required_cases)}")
    print(f"All actual items require human review: {review_compliant}")
    print(f"Unreferenced bank exception items: {len(unreferenced_items)}")
    print(f"Unexpected referenced cases: {extra_references or 'None'}")
    print(f"Unreferenced bank exceptions valid: {ambiguous_bank_valid}")
    print(f"DON-107 workflow valid: {don_107_valid}")

    if unreferenced_items:
        print("\nUnreferenced exception classifications:")
        for item in unreferenced_items:
            print(f"  - {item['classification']}")

    print("\nImportant: scores are evaluation results, not proof of production accuracy.")
    print("The alias exact_match -> exact_amount_match is explicit and does not")
    print("change the reconciliation engine or the original answer key.")

    return 0 if (
        correct == scored_cases
        and not missing_cases
        and not mismatches
        and review_compliant
        and ambiguous_bank_valid
        and don_107_valid
    ) else 1


if __name__ == "__main__":
    raise SystemExit(main())
