
import csv
import io
import os
import uuid
from pathlib import Path
from dotenv import load_dotenv

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.ai_explanations import explain_reconciliation_item

from app.reconciliation import (
    REQUIRED_COLUMNS,
    ReconciliationError,
    reconcile,
)
from app.review_store import (
    initialize_database,
    record_review,
    get_review_state,
)

initialize_database()

MAX_FILE_SIZE = 5 * 1024 * 1024
PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_ROOT / ".env")
UPLOAD_ROOT = Path(os.getenv("UPLOAD_ROOT", str(PROJECT_ROOT / "data" / "uploads")))


class ReviewRequest(BaseModel):
    reviewer_id: str = Field(min_length=1, max_length=100)
    decision: str
    rationale: str = Field(min_length=3, max_length=2000)


app = FastAPI(
    title="WaterAid Donation Reconciliation API",
    description="A human-supervised reconciliation assistant.",
    version="0.3.0",
)

cors_origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


def validate_review_request(request: ReviewRequest):
    if request.decision not in {"approved", "rejected"}:
        raise HTTPException(
            status_code=400,
            detail="Decision must be approved or rejected.",
        )

    if not request.reviewer_id.strip():
        raise HTTPException(
            status_code=400,
            detail="Reviewer ID cannot be blank.",
        )

    if len(request.rationale.strip()) < 3:
        raise HTTPException(
            status_code=400,
            detail="Please provide a meaningful review rationale.",
        )


async def read_csv_upload(
    upload: UploadFile,
    role: str,
) -> bytes:
    filename = upload.filename or ""

    if not filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=400,
            detail=f"The {role} file must have a .csv extension.",
        )

    content = await upload.read(MAX_FILE_SIZE + 1)
    await upload.close()

    if not content:
        raise HTTPException(
            status_code=400,
            detail=f"The {role} CSV is empty.",
        )

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"The {role} CSV exceeds the 5 MB limit.",
        )

    try:
        text = content.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))

        if not reader.fieldnames:
            raise HTTPException(
                status_code=400,
                detail=f"The {role} CSV has no header row.",
            )

        headers = set(reader.fieldnames)
        missing = REQUIRED_COLUMNS[role] - headers

        if missing:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"The {role} CSV is missing required columns: "
                    f"{', '.join(sorted(missing))}."
                ),
            )

        if not any(reader):
            raise HTTPException(
                status_code=400,
                detail=f"The {role} CSV has no data rows.",
            )

    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"The {role} CSV must use UTF-8 encoding.",
        ) from exc
    except csv.Error as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Could not parse the {role} CSV.",
        ) from exc

    return content


def run_directory(run_id: str) -> Path:
    """Resolve only valid UUID-based uploaded run directories."""
    try:
        normalized_id = str(uuid.UUID(run_id))
    except (ValueError, AttributeError) as exc:
        raise HTTPException(
            status_code=404,
            detail="Reconciliation run not found.",
        ) from exc

    directory = UPLOAD_ROOT / normalized_id

    if not directory.is_dir():
        raise HTTPException(
            status_code=404,
            detail="Reconciliation run not found.",
        )

    return directory


def reconcile_uploaded_run(run_id: str) -> dict:
    directory = run_directory(run_id)

    try:
        result = reconcile(
            directory / "processor.csv",
            directory / "bank.csv",
            directory / "ledger.csv",
        )
    except (ReconciliationError, OSError) as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    return result


@app.get("/")
def root():
    return {
        "application": "WaterAid Donation Reconciliation Assistant",
        "status": "running",
        "version": "0.3.0",
    }


@app.get("/api/health")
def health():
    return {
        "status": "healthy",
        "service": "reconciliation-api",
    }


@app.get("/api/demo-reconciliation")
def demo_reconciliation():
    data_dir = PROJECT_ROOT / "data" / "synthetic"

    try:
        return reconcile(
            data_dir / "processor.csv",
            data_dir / "bank.csv",
            data_dir / "ledger.csv",
        )
    except (ReconciliationError, OSError) as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc


@app.post("/api/reconciliation-runs")
async def upload_reconciliation(
    processor_file: UploadFile = File(...),
    bank_file: UploadFile = File(...),
    ledger_file: UploadFile = File(...),
):
    processor_content = await read_csv_upload(
        processor_file, "processor"
    )
    bank_content = await read_csv_upload(bank_file, "bank")
    ledger_content = await read_csv_upload(ledger_file, "ledger")

    run_id = str(uuid.uuid4())
    directory = UPLOAD_ROOT / run_id

    try:
        directory.mkdir(parents=True, exist_ok=False)

        (directory / "processor.csv").write_bytes(processor_content)
        (directory / "bank.csv").write_bytes(bank_content)
        (directory / "ledger.csv").write_bytes(ledger_content)

        result = reconcile(
            directory / "processor.csv",
            directory / "bank.csv",
            directory / "ledger.csv",
        )

        return {
            "run_id": run_id,
            **result,
        }

    except (ReconciliationError, OSError) as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc


@app.get("/api/reconciliation-runs/demo/reviews")
def list_demo_reviews():
    return get_review_state("demo")


@app.post("/api/reconciliation-runs/demo/reviews/{item_index}")
def save_demo_review(
    item_index: int,
    request: ReviewRequest,
):
    validate_review_request(request)

    if item_index < 0:
        raise HTTPException(
            status_code=400,
            detail="Item index must be non-negative.",
        )

    data_dir = PROJECT_ROOT / "data" / "synthetic"

    try:
        result = reconcile(
            data_dir / "processor.csv",
            data_dir / "bank.csv",
            data_dir / "ledger.csv",
        )
    except (ReconciliationError, OSError) as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    if item_index >= len(result["items"]):
        raise HTTPException(
            status_code=404,
            detail="Reconciliation item not found.",
        )

    return record_review(
        run_id="demo",
        item_index=item_index,
        reviewer_id=request.reviewer_id.strip(),
        decision=request.decision,
        rationale=request.rationale.strip(),
    )


@app.get("/api/reconciliation-runs/{run_id}")
def get_uploaded_reconciliation(run_id: str):
    normalized_id = str(
        uuid.UUID(run_id)
    ) if run_id else ""

    result = reconcile_uploaded_run(normalized_id)

    return {
        "run_id": normalized_id,
        **result,
    }

@app.get("/api/reconciliation-runs/{run_id}/reviews")
def list_uploaded_reviews(run_id: str):
    run_directory(run_id)
    return get_review_state(str(uuid.UUID(run_id)))


@app.post("/api/reconciliation-runs/{run_id}/reviews/{item_index}")
def save_uploaded_review(
    run_id: str,
    item_index: int,
    request: ReviewRequest,
):
    validate_review_request(request)

    if item_index < 0:
        raise HTTPException(
            status_code=400,
            detail="Item index must be non-negative.",
        )

    normalized_id = str(uuid.UUID(run_id))
    result = reconcile_uploaded_run(normalized_id)

    if item_index >= len(result["items"]):
        raise HTTPException(
            status_code=404,
            detail="Reconciliation item not found.",
        )

    return record_review(
        run_id=normalized_id,
        item_index=item_index,
        reviewer_id=request.reviewer_id.strip(),
        decision=request.decision,
        rationale=request.rationale.strip(),
    )


@app.post("/api/reconciliation-runs/{run_id}/items/{item_index}/explanation")
def explain_uploaded_reconciliation_item(
    run_id: str,
    item_index: int,
):
    """Return an advisory explanation for one saved reconciliation item."""
    if item_index < 0:
        raise HTTPException(
            status_code=400,
            detail="Item index must be non-negative.",
        )

    result = reconcile_uploaded_run(run_id)

    if item_index >= len(result["items"]):
        raise HTTPException(
            status_code=404,
            detail="Reconciliation item not found.",
        )

    item = result["items"][item_index]
    explanation = explain_reconciliation_item(item)

    return {
        "run_id": str(uuid.UUID(run_id)),
        "item_index": item_index,
        "reference": item.get("reference"),
        "classification": item.get("classification"),
        "advisory_only": True,
        "explanation": explanation,
    }
