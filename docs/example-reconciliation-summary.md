# Example Donation Reconciliation Summary

**Project:** WaterAid Donation Reconciliation Assistant  
**Dataset:** Synthetic demonstration data, version 1.0  
**Currency:** CAD  
**Status:** Demonstration only — all items require human review

## 1. Executive Summary

The prototype compared synthetic processor, bank, and general-ledger records. It produced 10 reconciliation items covering 8 donation references, including exact matches, fee-adjusted settlements, missing records, a refund, a potential duplicate, an amount discrepancy, and ambiguous bank deposits.

The evaluation matched all 8 expected donation-reference cases in the synthetic answer key. This is a result for the supplied test dataset, not evidence of production accuracy.

No item was automatically approved. All 10 items remain pending human review.

## 2. Independent Source Totals

| Source metric | Amount |
|---|---:|
| Processor gross | $490.00 |
| Processor fees | $1.50 |
| Bank deposits | $337.50 |
| Ledger recorded total | $450.00 |

These are independently calculated source totals. They are not directly interchangeable: payment timing, fees, refunds, missing records, and duplicate records may affect comparisons. Their differences must not be added together and described as confirmed losses.

## 3. Key Findings

| Reference | Finding | Amount or evidence | Required action |
|---|---|---|---|
| DON-100 | Exact-match candidate | $100.00 processor, bank, and ledger records | Verify source evidence and approve or reject |
| DON-101 | Fee-adjusted settlement | $50.00 gross less $1.50 fee equals $48.50 bank deposit | Verify fee and settlement evidence |
| DON-102 | Missing bank record | $75.00 processor record without a corresponding bank record | Investigate settlement timing and bank records |
| DON-103 | Donation and partial refund | $80.00 donation and -$20.00 refund | Verify both entries and their links |
| DON-104 | Duplicate processor records | Two records of $40.00; $40.00 potential duplicate exposure | Determine whether the duplicate is genuine |
| DON-105 | Missing bank record | $60.00 processor record without a corresponding bank record | Investigate settlement timing and bank records |
| DON-106 | Amount discrepancy | $40.00 expected net versus $39.00 bank deposit | Investigate the $1.00 difference |
| DON-107 | Ambiguous bank candidates | Two unreferenced deposits of $25.00 each | Establish whether either deposit belongs to this reference |

The $40.00 duplicate exposure is not a confirmed loss. The $50.00 of ambiguous deposits is not a confirmed match. The $1.00 difference is an investigation finding, not proof of missing funds.

## 4. Review and Audit Controls

- Every reconciliation item remains pending until a human reviewer decides.
- Review decisions must record a reviewer identifier, decision, rationale, and timestamp.
- Both approvals and rejections are retained in review history.
- Source CSV files remain the input evidence; the prototype does not post accounting entries or move money.
- Reviewers should consult the original source records before deciding.
- The demonstration uses synthetic data and is not connected to production donation or banking systems.

## 5. Evaluation Results

| Check | Result |
|---|---|
| Expected donation-reference cases | 8 |
| Expected cases agreed with | 8 of 8 |
| Answer-key mismatches | 0 |
| Actual reconciliation items | 10 |
| Items requiring human review | 10 of 10 |
| Items remaining pending | 10 of 10 |

The answer-key comparison is a small, fixed synthetic test. It does not establish general accuracy, recall, precision, or readiness for live financial operations.

## 6. Limitations and Next Steps

1. Expand the synthetic test suite with additional currencies, duplicate patterns, missing records, refunds, timing differences, and deliberately misleading candidate matches.
2. Measure actual reviewer preparation, investigation, correction, and approval time during a controlled usability test.
3. Have a finance subject-matter expert validate matching rules and exception handling.
4. Verify access control, audit retention, privacy, and deployment requirements before any real-data pilot.
5. Keep human approval mandatory and prohibit automatic accounting entries or movement of funds.

**Conclusion:** The prototype demonstrates a review-oriented workflow for identifying and explaining reconciliation exceptions. Financial decisions remain with authorized human reviewers.
