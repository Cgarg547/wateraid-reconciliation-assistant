"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const API_URL = "http://localhost:8000";

type SourceRecord = {
  source: string;
  row_number: number;
  record: Record<string, string>;
};

type ReconciliationItem = {
  reference: string | null;
  classification: string;
  status: string;
  review_required: boolean;
  confidence_score: number;
  evidence: string[];
  source_records: {
    processor: SourceRecord[];
    bank: SourceRecord[];
    ledger: SourceRecord[];
  };
};

type ApiResult = {
  summary: {
    processor_records: number;
    bank_records: number;
    ledger_records: number;
    reconciliation_items: number;
    items_pending_review: number;
  };
  items: ReconciliationItem[];
  notice: string;
};

type UploadApiResult = ApiResult & { run_id: string };

type AIExplanationResponse = {
  advisory_only: boolean;
  explanation: {
    mode: string;
    summary: string;
    likely_cause: string;
    recommended_steps: string[];
    limitations: string;
    evidence_considered: string[];
  };
};

type Decision = {
  status: "approved" | "rejected";
  rationale: string;
  reviewer_id: string;
  created_at: string;
};

type ReviewEvent = {
  id: number;
  run_id: string;
  item_index: number;
  reviewer_id: string;
  decision: "approved" | "rejected";
  rationale: string;
  created_at: string;
};

type ReviewResponse = {
  run_id: string;
  decisions: Record<string, ReviewEvent>;
  history: ReviewEvent[];
};

function formatLabel(value: string) {
  return value.replaceAll("_", " ");
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium capitalize text-slate-700">
      {children}
    </span>
  );
}

function RecordGroup({
  title,
  records,
}: {
  title: string;
  records: SourceRecord[];
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-semibold capitalize text-slate-900">{title}</h4>
        <span className="text-xs text-slate-500">
          {records.length} record{records.length === 1 ? "" : "s"}
        </span>
      </div>

      {records.length === 0 ? (
        <p className="text-sm text-slate-500">No linked record found.</p>
      ) : (
        <div className="space-y-3">
          {records.map((item, index) => (
            <div
              key={`${item.source}-${item.row_number}-${index}`}
              className="rounded-lg bg-slate-50 p-3"
            >
              <p className="mb-2 text-xs text-slate-500">
                Source row {item.row_number}
              </p>

              <dl className="space-y-2">
                {Object.entries(item.record).map(([key, value]) => (
                  <div
                    key={key}
                    className="grid grid-cols-2 gap-2 text-sm"
                  >
                    <dt className="capitalize text-slate-500">
                      {formatLabel(key)}
                    </dt>
                    <dd className="break-words text-right font-medium text-slate-800">
                      {value || "—"}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function Home() {
  const [data, setData] = useState<ApiResult | null>(null);
  const [runId, setRunId] = useState("demo");

  const [processorFile, setProcessorFile] = useState<File | null>(null);
  const [bankFile, setBankFile] = useState<File | null>(null);
  const [ledgerFile, setLedgerFile] = useState<File | null>(null);

  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(0);

  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [history, setHistory] = useState<ReviewEvent[]>([]);
  const [rationale, setRationale] = useState("");
  const [reviewerId, setReviewerId] = useState("reviewer-01");
  const [editingDecision, setEditingDecision] = useState(false);
  const [aiExplanation, setAiExplanation] =
    useState<AIExplanationResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const reconciliationUrl =
        runId === "demo"
          ? `${API_URL}/api/demo-reconciliation`
          : `${API_URL}/api/reconciliation-runs/${runId}`;

      const reviewsUrl =
        runId === "demo"
          ? `${API_URL}/api/reconciliation-runs/demo/reviews`
          : `${API_URL}/api/reconciliation-runs/${runId}/reviews`;

      const [reconciliationResponse, reviewsResponse] = await Promise.all([
        fetch(reconciliationUrl),
        fetch(reviewsUrl),
      ]);

      if (!reconciliationResponse.ok) {
        throw new Error(
          `Reconciliation API returned HTTP ${reconciliationResponse.status}.`
        );
      }

      if (!reviewsResponse.ok) {
        throw new Error(
          `Review API returned HTTP ${reviewsResponse.status}.`
        );
      }

      const result = (await reconciliationResponse.json()) as ApiResult;
      const reviewData = (await reviewsResponse.json()) as ReviewResponse;

      const restored: Record<string, Decision> = {};

      for (const [index, event] of Object.entries(
        reviewData.decisions ?? {}
      )) {
        restored[index] = {
          status: event.decision,
          rationale: event.rationale,
          reviewer_id: event.reviewer_id,
          created_at: event.created_at,
        };
      }

      setData(result);
      setDecisions(restored);
      setHistory(reviewData.history ?? []);

      setSelected((current) =>
        Math.min(current, Math.max(0, result.items.length - 1))
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load reconciliation data."
      );
    } finally {
      setLoading(false);
    }
  }, [runId]);

  const [restorationComplete, setRestorationComplete] = useState(false);

  useEffect(() => {
    const savedRunId = window.localStorage.getItem(
      "wateraid-reconciliation-run-id"
    );

    if (savedRunId && savedRunId !== "demo") {
      setRunId(savedRunId);
    }

    setRestorationComplete(true);
  }, []);

  useEffect(() => {
    if (restorationComplete) {
      void loadData();
    }
  }, [loadData, restorationComplete]);

  const visibleItems = useMemo(() => {
    if (!data) return [];

    return data.items
      .map((item, index) => ({ item, index }))
      .filter(({ item, index }) => {
        const decision = decisions[String(index)];

        const matchesQuery = [
          item.reference ?? "",
          item.classification,
          ...item.evidence,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase());

        const status: string = decision ? decision.status : item.status;

        return (
          matchesQuery &&
          (filter === "all" ||
            (filter === "pending" && status === "pending_review") ||
            (filter === "approved" && status === "approved") ||
            (filter === "rejected" && status === "rejected"))
        );
      });
  }, [data, query, filter, decisions]);

  const current = data?.items[selected];
  const currentDecision = decisions[String(selected)];

const pendingCount = data
  ? data.items.filter((item, index) => {
      const decision = decisions[String(index)];

      return decision
        ? false
        : item.status === "pending_review";
    }).length
  : 0;


  const currentHistory = history.filter(
    (event) => event.item_index === selected
  );

  async function uploadFiles(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;

    if (!processorFile || !bankFile || !ledgerFile) {
      setError("Select all three CSV files before uploading.");
      return;
    }

    setUploading(true);
    setError("");

    try {
      const formData = new FormData();

      formData.append("processor_file", processorFile);
      formData.append("bank_file", bankFile);
      formData.append("ledger_file", ledgerFile);

      const response = await fetch(
        `${API_URL}/api/reconciliation-runs`,
        {
          method: "POST",
          body: formData,
        }
      );

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof payload.detail === "string"
            ? payload.detail
            : `Upload failed with HTTP ${response.status}. Check the CSV files and try again.`
        );
      }

      const uploaded = payload as UploadApiResult;

      if (!uploaded.run_id || !Array.isArray(uploaded.items)) {
        throw new Error(
          "The API returned an unexpected upload response."
        );
      }

      setData(uploaded);
      setDecisions({});
      setHistory([]);
      setSelected(0);
      setRationale("");
      setQuery("");
      setFilter("all");

      setProcessorFile(null);
      setBankFile(null);
      setLedgerFile(null);

      form.reset();

      // Store the run ID so the uploaded run can be restored after refresh.
      window.localStorage.setItem(
        "wateraid-reconciliation-run-id",
        uploaded.run_id
      );

      setRunId(uploaded.run_id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "CSV upload failed."
      );
    } finally {
      setUploading(false);
    }
  }

  async function generateAIExplanation() {
    if (runId === "demo") {
      setAiError("Upload the synthetic CSV files first.");
      return;
    }

    setAiLoading(true);
    setAiError("");
    setAiExplanation(null);

    try {
      const response = await fetch(
        `${API_URL}/api/reconciliation-runs/${runId}/items/${selected}/explanation`,
        { method: "POST" }
      );

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof payload.detail === "string"
            ? payload.detail
            : `Explanation request failed (${response.status}).`
        );
      }

      setAiExplanation(payload as AIExplanationResponse);
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : "Could not generate explanation."
      );
    } finally {
      setAiLoading(false);
    }
  }

  async function review(status: "approved" | "rejected") {
    if (!current || saving) return;

    if (!reviewerId.trim()) {
      setError("Enter a reviewer ID.");
      return;
    }

    if (!rationale.trim() || rationale.trim().length < 3) {
      setError("Enter a meaningful review rationale.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const reviewUrl =
        runId === "demo"
          ? `${API_URL}/api/reconciliation-runs/demo/reviews/${selected}`
          : `${API_URL}/api/reconciliation-runs/${runId}/reviews/${selected}`;

      const response = await fetch(reviewUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reviewer_id: reviewerId.trim(),
          decision: status,
          rationale: rationale.trim(),
        }),
      });

      const saved = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof saved.detail === "string"
            ? saved.detail
            : "Failed to save the review decision."
        );
      }

      const savedDecision: Decision = {
        status: saved.decision,
        rationale: saved.rationale,
        reviewer_id: saved.reviewer_id,
        created_at: saved.created_at,
      };

      setDecisions((previous) => ({
        ...previous,
        [String(selected)]: savedDecision,
      }));

      setHistory((previous) => [
        ...previous,
        saved as ReviewEvent,
      ]);

      setRationale("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to save the review decision."
      );
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    if (!data) return;

    const rows = [
      [
        "Reference",
        "Source Identifier",
        "Classification",
        "Status",
        "Score",
        "Reviewer",
        "Timestamp",
        "Rationale",
      ],
      ...data.items.map((item, index) => {
        const decision = decisions[String(index)];

        // Use the donation reference when available.
        // Otherwise identify the unreferenced bank entry by its
        // source row, without implying that it is a confirmed match.
        const bankRecord = item.source_records?.bank?.[0];
        const sourceIdentifier = item.reference
          ? ""
          : bankRecord?.row_number != null
            ? `BANK-ROW-${bankRecord.row_number}`
            : `ITEM-${index + 1}`;

        return [
          item.reference ?? "",
          sourceIdentifier,
          item.classification,
          decision?.status ?? item.status,
          String(item.confidence_score),
          decision?.reviewer_id ?? "",
          decision?.created_at ?? "",
          decision?.rationale ?? "",
        ];
      }),
    ];

    const csv = rows
      .map((row) =>
        row
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(",")
      )
      .join("\n");

    const url = URL.createObjectURL(
      new Blob(["\uFEFF", csv], {
        type: "text/csv;charset=utf-8;",
      })
    );

    const link = document.createElement("a");
    link.href = url;
    link.download = `wateraid-reconciliation-${runId}-review.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  function returnToDemo() {
    window.localStorage.removeItem(
      "wateraid-reconciliation-run-id"
    );

    setError("");
    setRationale("");
    setQuery("");
    setFilter("all");
    setSelected(0);
    setRunId("demo");
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-5 py-5 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-800 text-lg font-bold text-white">
              W
            </div>

            <div>
              <h1 className="text-lg font-bold tracking-tight">
                WaterAid Reconciliation
              </h1>
              <p className="text-sm text-slate-500">
                Donation integrity workspace
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
              Synthetic data · Human review required
            </span>

            <button
              onClick={() => void loadData()}
              disabled={loading || saving || uploading}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? "Refreshing…" : "Refresh data"}
            </button>

            <button
              onClick={exportCsv}
              disabled={!data}
              className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900 disabled:opacity-50"
            >
              Export CSV
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] space-y-7 px-5 py-8 lg:px-8">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-teal-800">
              Finance operations
            </p>

            <h2 className="text-3xl font-bold tracking-tight">
              Reconciliation overview
            </h2>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Inspect suggested relationships, investigate discrepancies and
              document review decisions with traceable source evidence.
            </p>
          </div>

          <div className="text-sm text-slate-500">
            {loading ? "Loading reconciliation…" : "Connected to local API"}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-lg font-bold">
              Import reconciliation files
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              Upload processor, bank, and ledger CSV files to start a new
              reconciliation run.
            </p>
          </div>

          <form
            onSubmit={uploadFiles}
            className="grid gap-4 md:grid-cols-3"
          >
            <label className="text-sm font-medium">
              Processor CSV
              <input
                type="file"
                accept=".csv,text/csv"
                required
                disabled={uploading || loading || saving}
                onChange={(event) =>
                  setProcessorFile(event.target.files?.[0] ?? null)
                }
                className="mt-2 block w-full text-sm"
              />
            </label>

            <label className="text-sm font-medium">
              Bank CSV
              <input
                type="file"
                accept=".csv,text/csv"
                required
                disabled={uploading || loading || saving}
                onChange={(event) =>
                  setBankFile(event.target.files?.[0] ?? null)
                }
                className="mt-2 block w-full text-sm"
              />
            </label>

            <label className="text-sm font-medium">
              Ledger CSV
              <input
                type="file"
                accept=".csv,text/csv"
                required
                disabled={uploading || loading || saving}
                onChange={(event) =>
                  setLedgerFile(event.target.files?.[0] ?? null)
                }
                className="mt-2 block w-full text-sm"
              />
            </label>

            <div className="flex flex-wrap items-center gap-3 md:col-span-3">
              <button
                type="submit"
                disabled={uploading || loading || saving}
                className="rounded-lg bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {uploading ? "Reconciling files…" : "Upload and reconcile"}
              </button>

              <button
                type="button"
                disabled={loading || uploading || saving || runId === "demo"}
                onClick={returnToDemo}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Return to demo data
              </button>

              <span className="break-all text-xs text-slate-500">
                {runId === "demo"
                  ? "Current dataset: demo"
                  : `Current run: ${runId}`}
              </span>
            </div>
          </form>
        </section>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
          >
            {error}
          </div>
        )}

        {loading && (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500">
            Loading reconciliation results…
          </div>
        )}

        {data && (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: "Processor records",
                  value: data.summary.processor_records,
                  note: "Payment transactions",
                },
                {
                  label: "Bank records",
                  value: data.summary.bank_records,
                  note: "Deposit entries",
                },
                {
                  label: "Ledger records",
                  value: data.summary.ledger_records,
                  note: "Accounting entries",
                },
                {
                  label: "Pending review",
                  value: pendingCount,
                  note: "Awaiting human decision",
                },
              ].map((metric) => (
                <article
                  key={metric.label}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <p className="text-sm text-slate-500">{metric.label}</p>
                  <p className="mt-3 text-3xl font-bold tabular-nums">
                    {metric.value}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    {metric.note}
                  </p>
                </article>
              ))}
            </section>

            <section className="grid items-start gap-6 xl:grid-cols-[0.95fr_1.35fr]">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 p-5">
                  <h3 className="text-lg font-bold">Review queue</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Select a case to inspect its supporting records.
                  </p>

                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search references or evidence…"
                    className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
                  />

                  <div className="mt-3 flex flex-wrap gap-2">
                    {["all", "pending", "approved", "rejected"].map(
                      (option) => (
                        <button
                          key={option}
                          onClick={() => setFilter(option)}
                          className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize ${
                            filter === option
                              ? "bg-teal-800 text-white"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          {option}
                        </button>
                      )
                    )}
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {visibleItems.map(({ item, index }) => {
                    const decision = decisions[String(index)];
                    const status: string = decision? decision.status : item.status;

                    return (
                      <button
                        key={`${item.reference}-${index}`}
                        onClick={() => {
                          setSelected(index);
                          setRationale("");
                          setError("");
                        }}
                        className={`block w-full p-4 text-left transition hover:bg-slate-50 ${
                          selected === index ? "bg-teal-50/70" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold">
                              {item.reference || "Unreferenced bank entry"}
                            </p>
                            <p className="mt-1 text-sm capitalize text-slate-500">
                              {formatLabel(item.classification)}
                            </p>
                          </div>

                          <span
                            className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${
                              status === "approved"
                                ? "bg-emerald-100 text-emerald-800"
                                : status === "rejected"
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {formatLabel(status)}
                          </span>
                        </div>
                      </button>
                    );
                  })}

                  {visibleItems.length === 0 && (
                    <p className="p-6 text-sm text-slate-500">
                      No cases match this search or filter.
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-5">
                {!current ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-500">
                    Select a case to inspect its evidence.
                  </div>
                ) : (
                  <>
                    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-teal-800">
                            Case details
                          </p>

                          <h3 className="mt-2 text-xl font-bold">
                            {current.reference || "Unreferenced bank entry"}
                          </h3>

                          <p className="mt-1 text-sm capitalize text-slate-500">
                            {formatLabel(current.classification)}
                          </p>
                        </div>

                        <Badge>
                          Score: {current.confidence_score}/100
                        </Badge>
                      </div>

                      <div className="mt-5 rounded-xl bg-slate-50 p-4">
                        <h4 className="text-sm font-semibold">
                          Supporting evidence
                        </h4>

                        <ul className="mt-3 space-y-2">
                          {current.evidence.map((evidence, index) => (
                            <li
                              key={index}
                              className="flex gap-2 text-sm leading-6 text-slate-700"
                            >
                              <span className="text-teal-800">•</span>
                              <span>{evidence}</span>
                            </li>
                          ))}
                        </ul>

                        <p className="mt-3 text-xs leading-5 text-slate-500">
                          Rule-based score, not a probability. Evidence must
                          be verified by a human reviewer.
                        </p>
                      </div>

                      {currentDecision && (
                        <div className="mt-4 rounded-lg border border-slate-200 p-3 text-sm">
                          <p className="font-semibold">
                            Saved decision:{" "}
                            {formatLabel(currentDecision.status)}
                          </p>
                          <p className="mt-1 text-slate-600">
                            {currentDecision.rationale}
                          </p>
                          <p className="mt-2 text-slate-500">
                            Reviewer: {currentDecision.reviewer_id}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Recorded: {currentDecision.created_at}
                          </p>
                        </div>
                      )}

                      {currentDecision && !editingDecision && (
                        <button
                          type="button"
                          onClick={() => {
                            setReviewerId(currentDecision.reviewer_id);
                            setRationale(currentDecision.rationale);
                            setEditingDecision(true);
                            setError("");
                          }}
                          className="mt-3 rounded-lg border border-teal-700 px-3 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50"
                        >
                          Edit saved decision
                        </button>
                      )}

                    </section>

                    <div className="grid gap-4 lg:grid-cols-3">
                      <RecordGroup
                        title="Processor"
                        records={current.source_records.processor}
                      />
                      <RecordGroup
                        title="Bank"
                        records={current.source_records.bank}
                      />
                      <RecordGroup
                        title="Ledger"
                        records={current.source_records.ledger}
                      />
                    </div>

                    <section className="rounded-2xl border border-teal-200 bg-teal-50/50 p-5 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-bold">AI investigation assistant</h3>
                          <p className="mt-1 text-sm text-slate-600">
                            Advisory only — a human reviewer makes the final decision.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void generateAIExplanation()}
                          disabled={aiLoading || runId === "demo"}
                          className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {aiLoading ? "Generating..." : "Generate AI explanation"}
                        </button>
                      </div>

                      {aiError && (
                        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                          {aiError}
                        </p>
                      )}

                      {aiExplanation && (
                        <div className="mt-4 space-y-4 border-t border-teal-200 pt-4">
                          <div className="flex flex-wrap gap-2">
                            <Badge>
                              {aiExplanation.explanation.mode === "openai"
                                ? "OpenAI explanation"
                                : "Rules-based fallback"}
                            </Badge>
                            <Badge>Advisory only</Badge>
                          </div>
                          <div>
                            <h4 className="font-semibold">Summary</h4>
                            <p className="mt-1 text-sm leading-6 text-slate-700">
                              {aiExplanation.explanation.summary}
                            </p>
                          </div>
                          <div>
                            <h4 className="font-semibold">Possible cause</h4>
                            <p className="mt-1 text-sm leading-6 text-slate-700">
                              {aiExplanation.explanation.likely_cause}
                            </p>
                          </div>
                          <div>
                            <h4 className="font-semibold">Recommended investigation steps</h4>
                            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-slate-700">
                              {aiExplanation.explanation.recommended_steps.map((step, index) => (
                                <li key={index}>{step}</li>
                              ))}
                            </ol>
                          </div>
                          {aiExplanation.explanation.evidence_considered.length > 0 && (
                            <div>
                              <h4 className="font-semibold">Evidence considered</h4>
                              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                                {aiExplanation.explanation.evidence_considered.map((entry, index) => (
                                  <li key={index}>{entry}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <p className="text-xs leading-5 text-slate-500">
                            Limitations: {aiExplanation.explanation.limitations}
                          </p>
                        </div>
                      )}
                    </section>

                    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <h3 className="text-lg font-bold">Reviewer decision</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-500">
                        Document the reason for your decision. This prototype
                        does not post accounting entries or move funds.
                      </p>

                      <label
                        htmlFor="reviewer-id"
                        className="mt-4 block text-sm font-medium"
                      >
                        Reviewer ID
                      </label>

                      <input
                        id="reviewer-id"
                        value={reviewerId}
                        onChange={(event) =>
                          setReviewerId(event.target.value)
                        }
                        maxLength={100}
                        placeholder="reviewer-01"
                        disabled={saving || (Boolean(currentDecision) && !editingDecision)}
                        className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-100"
                      />

                      <label
                        htmlFor="rationale"
                        className="mt-4 block text-sm font-medium"
                      >
                        Review rationale
                      </label>

                      <textarea
                        id="rationale"
                        value={rationale}
                        onChange={(event) =>
                          setRationale(event.target.value)
                        }
                        rows={3}
                        maxLength={2000}
                        disabled={saving || (Boolean(currentDecision) && !editingDecision)}
                        placeholder="Describe the evidence you verified…"
                        className="mt-2 w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-100"
                      />

                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          onClick={() => void review("approved")}
                          disabled={saving || (Boolean(currentDecision) && !editingDecision)}
                          className="rounded-lg bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {saving ? "Saving…" : "Accept suggestion"}
                        </button>

                        <button
                          onClick={() => void review("rejected")}
                          disabled={saving || (Boolean(currentDecision) && !editingDecision)}
                          className="rounded-lg border border-rose-300 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Reject suggestion
                        </button>
                      </div>

                      {currentDecision && (
                        <p className="mt-3 text-xs text-slate-500">
                          This case already has a saved decision. Its history
                          is retained in the backend.
                        </p>
                      )}
                    </section>

                    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <h3 className="text-lg font-bold">Audit history</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Saved review events for this reconciliation item.
                      </p>

                      {currentHistory.length === 0 ? (
                        <p className="mt-4 text-sm text-slate-500">
                          No review events recorded for this case.
                        </p>
                      ) : (
                        <div className="mt-4 space-y-3">
                          {currentHistory.map((event) => (
                            <div
                              key={event.id}
                              className="rounded-lg border border-slate-200 p-3"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <Badge>
                                  {formatLabel(event.decision)}
                                </Badge>
                                <span className="text-xs text-slate-500">
                                  {event.created_at}
                                </span>
                              </div>

                              <p className="mt-2 text-sm font-medium">
                                {event.reviewer_id}
                              </p>
                              <p className="mt-1 text-sm text-slate-600">
                                {event.rationale}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  </>
                )}
              </div>
            </section>

            <footer className="border-t border-slate-200 py-5 text-xs leading-5 text-slate-500">
              Demonstration prototype · Synthetic records only · Human review
              required · No production finance integrations.
            </footer>
          </>
        )}
      </div>
    </main>
  );
}