# WaterAid Donation Reconciliation Assistant — Cost Model

## 1. Purpose and limitations

This model estimates the potential operating economics of the proposed
reconciliation workflow. It is a planning scenario, not a WaterAid budget,
vendor quotation, or measured pilot result.

All amounts are in Canadian dollars (CAD). The transaction volume, time
estimates, wage rates, and software costs below are illustrative assumptions
to be replaced with WaterAid-approved figures.

The prototype uses synthetic data. It is not connected to WaterAid production
systems and does not post accounting entries, move money, or issue tax receipts.

## 2. Illustrative operating assumptions

| Input | Illustrative assumption | Notes |
|---|---:|---|
| Transactions per monthly close | 100 | Planning scenario, not WaterAid's actual volume |
| Monthly reconciliation cycles | 1 | Year-end and campaign spikes excluded |
| Fully loaded staff cost | $40/hour | Assumed planning rate, not a quoted wage |
| Manual preparation | 180 minutes/month | Assumed baseline |
| Manual review | 120 minutes/month | Assumed baseline |
| Assisted preparation | 60 minutes/month | Unmeasured target scenario |
| Assisted review | 100 minutes/month | Unmeasured target scenario |
| Assisted corrections | 20 minutes/month | Unmeasured target scenario |
| Prototype setup effort | 40 staff hours | Assumed one-time implementation effort |
| Ongoing maintenance | 4 staff hours/month | Assumed support and upkeep |
| Software and hosting | $25/month | Illustrative allowance; actual deployment may cost more |
| API or AI processing | $0/month in this scenario | Rules-based fallback; no live AI usage assumed |

These time assumptions are examples for testing the model. They must not be
presented as measured savings or as observations from WaterAid staff.

## 3. Monthly staff-effort comparison

Manual workflow:

- Preparation: 180 minutes
- Review: 120 minutes
- Total: 300 minutes, or 5 hours

Assisted workflow:

- Preparation: 60 minutes
- Review: 100 minutes
- Corrections: 20 minutes
- Total: 180 minutes, or 3 hours

Illustrative time released: 120 minutes (2 hours) per monthly close.

Illustrative percentage reduction in reconciliation effort:

(300 - 180) / 300 × 100 = 40%

This is an assumed scenario, not measured performance. The assisted workflow
must include reviewer verification and correction time to make the comparison
fair.

Time released represents staff capacity for other work. It is not automatically
a cash saving: payroll may remain unchanged.

## 4. Illustrative monthly operating costs

Assume the same $40 fully loaded hourly staff rate.

| Cost component | Manual workflow | Assisted workflow |
|---|---:|---:|
| Preparation and review | 5.0 hours × $40 = $200 | 3.0 hours × $40 = $120 |
| Maintenance | Not separately modelled | 4.0 hours × $40 = $160 |
| Software/hosting allowance | Not separately modelled | $25 |
| AI/API processing | Not separately modelled | $0 in this scenario |
| Total modelled monthly cost | $200 | $305 |

Under these assumptions, the assisted workflow costs $105 more per month
when maintenance and hosting are included. The example therefore does not
establish a positive cash return.

The potential benefit is 2 hours of staff capacity released per month before
maintenance is counted. Whether that capacity creates operational value needs
to be assessed separately.

## 5. Setup cost

Assumed setup effort: 40 hours × $40/hour = $1,600.

This is an illustrative internal labour cost. It excludes procurement, security
review, training, migration, Microsoft licensing changes, and production
integration. Those items require separate estimates before deployment.

## 6. Break-even interpretation

With the current assumptions, the workflow does not break even on direct
monthly labour and hosting costs:

- Manual workflow: $200/month.
- Assisted workflow including maintenance and hosting: $305/month.
- Difference: $105/month higher for the assisted scenario.

This comparison excludes the setup cost of $1,600, which would further delay
financial break-even.

If future measurements show that assisted review and correction time fall
substantially, maintenance is lower, or the workflow supports materially
higher volumes, recalculate the model. Do not claim a break-even point until
the relevant assumptions produce one.

For any revised scenario:

Monthly manual cost =
(manual preparation hours + manual review hours) × loaded hourly rate

Monthly assisted cost =
(assisted preparation hours + assisted review hours + correction hours
 + maintenance hours) × loaded hourly rate
+ monthly hosting/software costs
+ monthly processing costs

Monthly cash benefit =
manual cost − assisted cost

If monthly cash benefit is positive, a simplified setup payback estimate is:

Setup cost ÷ monthly cash benefit

This payback calculation should only be reported when monthly cash benefit
is positive and all relevant costs are included.

## 7. Costs that scale with volume

Potentially volume-sensitive costs:

- Staff review and correction time.
- Usage-based AI/API calls, if enabled in a future deployment.
- Storage, monitoring, and compute if a hosted deployment scales with usage.
- Additional exception investigation during campaign peaks.

Relatively fixed or stepwise costs:

- Initial setup and workflow design.
- Security and governance review.
- Baseline hosting or platform subscriptions, depending on provider.
- Staff training and documentation maintenance.

The prototype's current rules-based fallback has no live AI/API processing cost
in this scenario. A future AI-enabled version would need a measured or quoted
usage estimate and additional governance review.

## 8. Pilot measurement plan

Before making a savings claim, run a controlled comparison using equivalent
synthetic cases and, if authorized, a later approved pilot with appropriate
privacy safeguards.

Record:

1. Number of transactions and source files.
2. Manual preparation minutes.
3. Assisted preparation minutes.
4. Reviewer verification minutes.
5. Correction and rework minutes.
6. Number of exceptions and unresolved items.
7. Incorrect matches and missed matches.
8. Financial impact of errors on processor, bank, and ledger totals.
9. Setup, maintenance, hosting, and processing costs.

Use the same transaction volume and equivalent case difficulty for both
workflows. Report time released separately from cash savings. Include negative
results if the assisted workflow takes longer.

## 9. Decision

The current prototype demonstrates a reviewable workflow on synthetic data.
It does not yet demonstrate measured productivity improvement, production
readiness, or positive financial return. A decision to pilot should depend on
validated reconciliation results, measured end-to-end effort, security and
privacy review, and confirmation of the actual operating requirements.
