import importlib.util
from pathlib import Path

SCRIPT_PATH = (
    Path(__file__).resolve().parents[2]
    / "scripts"
    / "evaluate_staff_effort.py"
)

SPEC = importlib.util.spec_from_file_location(
    "evaluate_staff_effort", SCRIPT_PATH
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

calculate_effort = MODULE.calculate_effort


def test_effort_calculation_includes_review_and_corrections():
    result = calculate_effort(
        transactions=100,
        manual_prep_minutes=180,
        manual_review_minutes=120,
        assisted_prep_minutes=60,
        assisted_review_minutes=100,
        correction_minutes=20,
    )

    assert result["manual_total_minutes"] == 300
    assert result["assisted_total_minutes"] == 180
    assert result["time_released_minutes"] == 120
    assert result["time_released_percent"] == 40


def test_effort_can_show_more_time_spent_than_manual_workflow():
    result = calculate_effort(
        transactions=10,
        manual_prep_minutes=20,
        manual_review_minutes=20,
        assisted_prep_minutes=15,
        assisted_review_minutes=30,
        correction_minutes=10,
    )

    assert result["time_released_minutes"] == -15
    assert result["time_released_percent"] == -37.5


def test_effort_with_zero_manual_time_has_no_division_error():
    result = calculate_effort(
        transactions=10,
        manual_prep_minutes=0,
        manual_review_minutes=0,
        assisted_prep_minutes=5,
        assisted_review_minutes=5,
        correction_minutes=0,
    )

    assert result["time_released_minutes"] == -10
    assert result["time_released_percent"] == 0
