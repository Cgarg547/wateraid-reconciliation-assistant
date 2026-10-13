# WaterAid Donation Reconciliation Assistant

**An AI-assisted reconciliation and human-review tool for donation financial records.**

The WaterAid Donation Reconciliation Assistant helps finance and operations teams compare donation records across payment processors, bank statements, and internal ledgers. It identifies discrepancies, organizes supporting evidence, provides investigation guidance, and records human review decisions in an auditable workflow.

> **Project status:** Hackathon prototype. Uses synthetic data and local development services. It is not connected to WaterAid's production financial systems.

## Table of Contents

- [The Problem](#the-problem)
- [Our Solution](#our-solution)
- [Key Features](#key-features)
- [How It Works](#how-it-works)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Running the Application](#running-the-application)
- [Running Tests](#running-tests)
- [AI Investigation Assistant](#ai-investigation-assistant)
- [Human Review and Auditability](#human-review-and-auditability)
- [Sample Data](#sample-data)
- [Project Documentation](#project-documentation)
- [Limitations and Future Improvements](#limitations-and-future-improvements)
- [Responsible Use](#responsible-use)

## The Problem

Donation reconciliation requires organizations to compare records from multiple financial systems. Differences can arise from processing fees, delayed settlements, missing transactions, duplicate records, partial refunds, or inconsistent amounts.

Investigating these differences manually can be time-consuming and makes it harder to maintain a consistent review process.

For a nonprofit organization, efficient and traceable reconciliation can help finance teams investigate discrepancies, maintain accurate records, and document how review decisions were reached.

## Our Solution

The Donation Reconciliation Assistant provides a centralized interface for comparing three sources of financial data:

1. **Payment processor records** — donation and payment activity.
2. **Bank records** — deposits, settlements, and other bank transactions.
3. **Internal ledger records** — accounting entries associated with donations.

The application classifies reconciliation results, presents the available source evidence, and helps a human reviewer investigate discrepancies.

The system is designed to support financial review, not replace it. Reconciliation classifications and AI-generated guidance are advisory; reviewers remain responsible for their decisions.

## Key Features

### 1. Three-source reconciliation

Upload processor, bank, and ledger CSV files to generate a reconciliation run.

### 2. Discrepancy classification

Identify and review cases such as:

- Exact amount matches
- Fee-adjusted settlements
- Amount mismatches
- Missing bank records
- Duplicate processor records
- Donations with partial refunds
- Ambiguous bank candidates
- Unreferenced bank records

Classifications depend on the available data and implemented reconciliation rules.

### 3. Evidence-based investigation

Inspect the processor, bank, and ledger records associated with each reconciliation item. Reviewers can use the displayed evidence to investigate discrepancies.

### 4. AI investigation assistant

Generate an investigation summary, a possible cause, and recommended investigation steps.

The application supports a rules-based fallback and an optional OpenAI integration. The fallback provides investigation guidance without requiring a paid AI API.

### 5. Human approval and rejection

Reviewers can approve or reject a reconciliation item, provide a reviewer ID, and document the rationale for their decision.

The application does not automatically approve reconciliation items.

### 6. Decision correction and audit history

Correct an existing review decision when necessary. Corrections are recorded as additional review events so the earlier decision remains available in the audit history.

### 7. CSV export

Export reconciliation results with review statuses, classifications, scores, reviewer information, timestamps, rationales, and source identifiers for records without a donation reference.

### 8. Persistent review records

Review decisions and their history are stored in a local SQLite database.

## How It Works

```text
Processor CSV ──┐
                │
Bank CSV ───────┼──> Reconciliation Engine
                │           │
Ledger CSV ─────┘           ▼
                    Classified Results
                            │
                            ▼
                    Evidence Review Queue
                            │
                 ┌──────────┴──────────┐
                 ▼                     ▼
          AI Investigation       Human Review
             Guidance          Approve / Reject
                                      │
                                      ▼
                              Audit History
                                      │
                                      ▼
                                  CSV Export
```

The reconciliation engine identifies and classifies potential matches and discrepancies. The investigation assistant provides supporting guidance, while human reviewers make and document the final decisions.

## Technology Stack

| Component | Technology |
|---|---|
| Frontend | Next.js, React, TypeScript |
| Styling | Tailwind CSS |
| Backend API | Python, FastAPI |
| Data processing | pandas and Python decimal arithmetic |
| Review persistence | SQLite |
| AI integration | Optional OpenAI API with rules-based fallback |
| Testing | pytest and HTTPX |
| Data exchange | CSV and JSON |

## Project Structure

```text
wateraid-reconciliation/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── reconciliation.py
│   │   ├── review_store.py
│   │   └── ai_explanations.py
│   ├── tests/
│   │   ├── test_ai_explanations.py
│   │   ├── test_reconciliation.py
│   │   └── test_review_store.py
│   ├── requirements.txt
│   └── .env                 # Local configuration; do not commit
├── frontend/
│   ├── app/
│   ├── package.json
│   └── ...
├── data/
│   ├── synthetic/
│   │   ├── processor.csv
│   │   ├── bank.csv
│   │   └── ledger.csv
│   └── expected/
│       └── answer_key.json
└── README.md
```

## Getting Started

### Prerequisites

Install the following:

- Node.js and npm
- Python 3.14 or a compatible Python version supported by the project's dependencies
- Git

The commands below use macOS Terminal.

### 1. Clone or open the repository

If the repository is hosted remotely:

```bash
git clone YOUR_REPOSITORY_URL
cd wateraid-reconciliation
```

Replace `YOUR_REPOSITORY_URL` with the actual repository URL.

If the project is already on your computer, navigate to its existing directory instead.

### 2. Set up the backend

From the project root:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

If you have already created the virtual environment, activate the existing one instead of recreating it.

### 3. Configure the optional AI integration

The application can run in rules-based fallback mode without paid AI API calls.

Keep `OPENAI_ENABLED=false` in your local backend configuration to use the fallback.

If enabling OpenAI in the future, configure the required API credentials privately in the local environment. Never commit API keys to Git or include them in screenshots, logs, or public documentation.

### 4. Set up the frontend

Open a second Terminal window and navigate to the project root:

```bash
cd frontend
npm install
```

## Running the Application

### Start the backend

In the first Terminal window:

```bash
cd backend
source .venv/bin/activate
python -m uvicorn app.main:app --reload --port 8000
```

Backend API:

- Base URL: `http://localhost:8000`
- Interactive API documentation: `http://localhost:8000/docs`

### Start the frontend

In the second Terminal window:

```bash
cd frontend
npm run dev
```

Open the dashboard:

**http://localhost:3000**

Keep both development servers running while using the application.

## Running Tests

### Backend tests

From the project root:

```bash
cd backend
source .venv/bin/activate
python -m pytest -q tests
```

The test suite covers reconciliation logic, review storage, and AI explanation behavior.

**Latest verified result:** 48 backend tests passed in 0.68 seconds, including reconciliation, review storage and API validation, staff-effort calculations, and financial-impact checks.

### Frontend production build

Open another Terminal window or stop the frontend development server first, then run:

```bash
cd frontend
npm run build
```

**Last verified result:** The production build and TypeScript checks completed successfully.

Test results describe the last verified development state and should be reproduced against the version being submitted.


### Financial integrity and reconciliation evaluation

Run these commands from the project root with the project's Python environment activated:

```bash
python scripts/check_financial_integrity.py
python scripts/evaluate_reconciliation.py
```

The financial integrity check validates the expected record counts and source totals across the synthetic processor, bank, and ledger files.

The reconciliation evaluation compares the engine's classifications with the predefined synthetic answer key and checks review requirements and ambiguous bank exceptions.

**Latest verified results:**
- Financial integrity: 7/7 checks passed.
- Synthetic reconciliation evaluation: 8/8 expected cases passed.
- Actual reconciliation items: 10, including two unreferenced bank exceptions.

These results apply only to the included synthetic dataset. They do not establish accuracy on unseen transactions or production financial data.

## AI Investigation Assistant

The investigation assistant is designed to help reviewers understand why a reconciliation item may need further attention.

It can provide:

- A concise summary of the discrepancy
- A possible explanation
- Recommended investigation steps

### Rules-based fallback

The fallback uses implemented reconciliation classifications and predefined guidance. It does not require an OpenAI API call.

### Optional OpenAI integration

The backend contains an optional OpenAI integration. Live operation depends on valid API credentials, available API credits, and successful API requests.

Live OpenAI operation has not been verified for the current demonstration environment. The application should therefore be demonstrated in rules-based fallback mode unless the live integration is independently tested successfully.

AI output is advisory and must not be treated as independent verification of financial records.

## Human Review and Auditability

The application separates reconciliation analysis from final review decisions.

- Reviewers provide an identifier and rationale.
- Decisions can be approved or rejected.
- Existing decisions can be corrected through an additional review event.
- The audit history retains earlier review events.
- CSV exports include the latest saved review decision.

The SQLite database is intended for local prototype persistence. It is not a substitute for a production-grade financial audit system with appropriate access controls, backups, retention policies, and security monitoring.

## Sample Data

The project includes synthetic CSV files for processor, bank, and ledger records, together with an expected-results reference file.

The sample records demonstrate scenarios such as:

- Matching donation transactions
- Settlement amounts affected by processing fees
- Missing bank entries
- Partial refunds
- Duplicate processor entries
- Amount discrepancies
- Ambiguous or unreferenced bank entries

Use the included synthetic files for testing and demonstrations. Do not upload confidential donor information or real financial records to this prototype.

## Project Documentation

The following documents explain the prototype's architecture, operation, evaluation, and financial assumptions.

- [Architecture and Data Flow](docs/architecture-and-data-flow.md) — system components, data flow, and review controls.
- [Setup and Operating Guide](docs/setup-and-operating-guide.md) — instructions for running and demonstrating the prototype.
- [Cost Model](docs/cost-model.md) — illustrative staff-effort, operating-cost, and break-even assumptions.
- [Example Reconciliation Summary](docs/example-reconciliation-summary.md) — synthetic findings, exceptions, and required reviewer actions.

## Limitations and Future Improvements

This project is a hackathon prototype and has the following limitations:

- No production integration with WaterAid financial systems.
- No verified live OpenAI operation in the current demonstration environment.
- Local SQLite persistence rather than a production database.
- No claim of production-grade authentication, role-based access control, or deployment security.
- Reconciliation results depend on the quality, format, and completeness of uploaded records.
- Human review remains necessary for discrepancies and uncertain matches.

Potential future improvements include:

- Secure organizational authentication and reviewer permissions
- Production database and deployment infrastructure
- Stronger data validation and configurable reconciliation rules
- More comprehensive end-to-end testing
- Secure integrations with approved payment processor, bank, and accounting systems
- Improved reporting and operational monitoring

## Responsible Use

The application is intended to support financial reconciliation and investigation, not to make autonomous financial decisions.

Reviewers should verify source records, document their reasoning, and investigate unresolved discrepancies before relying on reconciliation outcomes.

All demonstrations should use synthetic or otherwise explicitly authorized data.

## Acknowledgements

Developed as a hackathon prototype addressing donation reconciliation and financial review workflows.

**Disclaimer:** This project is an independent prototype. It is not an official WaterAid production system and should not be represented as endorsed by WaterAid unless such endorsement has been explicitly granted.