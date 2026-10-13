# WaterAid Donation Reconciliation Assistant

## Setup and Operating Guide

**Project:** Hackathon prototype  
**Environment:** Local development  
**Data:** Synthetic records only  
**Version:** 1.0

## 1. Prerequisites

Install the following tools:

- Git
- Node.js and npm
- Python 3
- A terminal and code editor

Use a Python version compatible with the project's dependencies. The repository's existing environment is the preferred starting point.

## 2. Project Structure

Important directories and files:

- `backend/` — FastAPI API, reconciliation logic, tests and SQLite review database
- `frontend/` — Next.js dashboard
- `data/synthetic/` — sample processor, bank and ledger CSV files
- `data/expected/answer_key.json` — expected synthetic reconciliation outcomes
- `data/uploads/` — uploaded source files organized by run
- `scripts/` — financial integrity and reconciliation evaluation scripts
- `docs/` — project documentation

## 3. Install and Start the Backend

Open a terminal at the project root.

Create a virtual environment if one does not already exist:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

If the backend virtual environment already exists, activate it instead of creating another one.

Start the API:

```bash
python -m uvicorn app.main:app --reload --port 8000
```

Keep this terminal running.

Useful addresses:

- API health endpoint: `http://localhost:8000/api/health`
- Interactive API documentation: `http://localhost:8000/docs`

## 4. Install and Start the Frontend

Open a second terminal at the project root:

```bash
cd frontend
npm install
npm run dev
```

Keep this terminal running.

Open the dashboard at:

`http://localhost:3000`

The frontend communicates with the local FastAPI backend. If the dashboard cannot load results, verify that both servers are running.

## 5. Run a Demonstration

### Step 1 — Load the demonstration

Open the dashboard and use its demonstration or reconciliation workflow.

For repeatable results, use the supplied synthetic CSV files in `data/synthetic/`.

### Step 2 — Upload source files

When using the upload workflow, provide the processor, bank and ledger CSV files.

The files must:

- Use the `.csv` extension.
- Contain UTF-8 encoded text.
- Include the required column headers.
- Contain data rows.
- Be no larger than 5 MB per file.

Use the supplied synthetic files as templates. Do not assume arbitrary CSV files will have compatible columns.

### Step 3 — Review the reconciliation results

Inspect the reconciliation items, source records, financial totals, classifications and investigation guidance.

Examples of synthetic exceptions include missing bank records, amount mismatches, duplicate processor records, partial refunds and ambiguous bank candidates.

A classification is a proposed result, not proof that a financial transaction is correct.

### Step 4 — Record a review decision

For an item requiring review:

1. Examine the supporting evidence.
2. Enter the reviewer identifier.
3. Select approval or rejection.
4. Provide a meaningful rationale.
5. Submit the decision.
6. Inspect the review history to verify that the event was recorded.

A later decision may change the latest status while earlier review events remain in the history.

### Step 5 — Export the report

Use the dashboard's CSV export function.

Open the exported file in a spreadsheet application to inspect the reconciliation findings, financial summary and review information included in the export.

Exporting a report does not post accounting entries or move funds.

## 6. Storage

The local application uses:

- `data/uploads/<run-uuid>/` for uploaded source files.
- `backend/reconciliation.db` for persistent review events.
- `data/synthetic/` for demonstration inputs.
- `data/expected/answer_key.json` for expected synthetic outcomes.

Keep the original synthetic inputs and expected results unchanged when running the standard evaluation.

## 7. Validation Commands

Run these commands from the project root.

### Backend tests

```bash
PYTHONPATH=backend python -m pytest backend/tests -q
```

The latest recorded result was **31 tests passed**.

### Financial integrity checks

```bash
python scripts/check_financial_integrity.py
```

The latest recorded result was **7 of 7 checks passed**.

### Reconciliation evaluation

```bash
python scripts/evaluate_reconciliation.py
```

The latest recorded result was **8 of 8 expected synthetic cases passed**.

This evaluates agreement with the predefined synthetic cases. It does not establish performance on unseen or production financial records.

### Frontend production build

```bash
cd frontend
npm run build
```

Stop the development server first if the build encounters a conflict with a running Next.js process.

## 8. Troubleshooting

### The dashboard cannot connect to the API

- Confirm the backend is running on port 8000.
- Confirm the frontend is running on port 3000.
- Check the backend terminal for error messages.
- Refresh the dashboard after the API starts.

### A port is already in use

Stop the existing process using the port or configure the application to use an available port. Ensure the frontend's API configuration matches the backend address.

### Python dependencies fail to install

- Confirm the virtual environment is activated.
- Check that the Python version is compatible with the project's dependencies.
- Run the installation command from the backend directory.

### CSV upload fails

- Check the file extension and UTF-8 encoding.
- Confirm the file is not empty.
- Check the required headers against the supplied synthetic CSV files.
- Ensure each file is below the 5 MB limit.

### Investigation guidance does not use a live AI service

The live OpenAI integration has not been verified for the current demonstration environment. Use the implemented rules-based fallback unless live operation has been independently tested.

## 9. Safety and Scope

This is a local hackathon prototype. Use synthetic data only.

Do not upload real donor records, payment-card information, passwords, API keys or confidential financial information.

The application does not move money, post accounting entries, issue tax receipts or connect to WaterAid production finance systems. Reviewers remain responsible for checking source evidence and making appropriate decisions.

## 10. Demonstration Readiness Checklist

- [ ] Backend starts successfully.
- [ ] Frontend starts successfully.
- [ ] Dashboard loads reconciliation results.
- [ ] Synthetic records and financial totals are visible.
- [ ] At least one exception can be investigated.
- [ ] A review decision and rationale can be submitted.
- [ ] Review history persists after refreshing.
- [ ] CSV export works.
- [ ] Backend tests pass.
- [ ] Financial integrity checks pass.
- [ ] Reconciliation evaluation passes.
- [ ] No production or confidential data is used.