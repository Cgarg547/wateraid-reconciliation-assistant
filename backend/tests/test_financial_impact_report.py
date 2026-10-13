import importlib.util
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = PROJECT_ROOT / "scripts" / "evaluate_financial_impact.py"

SPEC = importlib.util.spec_from_file_location(
    "evaluate_financial_impact",
    SCRIPT_PATH,
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def test_financial_impact_report_runs_successfully(capsys):
    assert MODULE.main() == 0

    output = capsys.readouterr().out

    assert "Processor gross:       $490.00" in output
    assert "Processor fees:        $1.50" in output
    assert "Bank deposits:         $337.50" in output
    assert "Ledger recorded total: $450.00" in output
    assert "DON-104 duplicate:      $40.00" in output
    assert "DON-106 difference:     $1.00" in output
    assert "DON-107 ambiguous bank: $50.00" in output
    assert "All items require human review: True" in output
    assert "All items remain pending: True" in output
