from decimal import Decimal


def test_duplicate_match_can_overstate_reconciled_amount():
    original_donation = Decimal("100.00")
    duplicated_match = Decimal("100.00")

    correct_total = original_donation
    incorrectly_reconciled_total = original_donation + duplicated_match

    assert correct_total == Decimal("100.00")
    assert incorrectly_reconciled_total == Decimal("200.00")
    assert incorrectly_reconciled_total - correct_total == Decimal("100.00")


def test_missed_bank_deposit_remains_a_reconciliation_difference():
    processor_net = Decimal("98.50")
    bank_deposits_found = Decimal("0.00")

    difference = processor_net - bank_deposits_found

    assert difference == Decimal("98.50")
    assert difference != Decimal("0.00")


def test_processing_fee_explains_gross_to_net_difference():
    gross_donation = Decimal("100.00")
    processing_fee = Decimal("1.50")
    bank_deposit = Decimal("98.50")

    expected_net = gross_donation - processing_fee

    assert expected_net == bank_deposit
    assert gross_donation - bank_deposit == processing_fee


def test_partial_refund_must_be_accounted_for_separately():
    gross_donation = Decimal("100.00")
    partial_refund = Decimal("25.00")

    expected_net_before_fees = gross_donation - partial_refund

    assert expected_net_before_fees == Decimal("75.00")
    assert expected_net_before_fees != gross_donation
