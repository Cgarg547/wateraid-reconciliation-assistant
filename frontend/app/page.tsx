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
    processor_gross_total: string;
    processor_fee_total: string;
    bank_deposit_total: string;
    ledger_recorded_total: string;
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


function getInvestigationGuidance(classification: string) {
  const guidance: Record<string, { summary: string; checks: string[] }> = {
    exact_amount_match: {
      summary: "The matched records have the same transaction amount. Verify references and source coverage before closing the review.",
      checks: [
        "Confirm the donation or transaction reference matches across available records.",
        "Verify currency and transaction date across the source systems.",
        "Confirm all expected processor, bank, and ledger records are present.",
      ],
    },
    fee_adjusted_settlement: {
      summary: "The bank deposit may reflect processor fees deducted from the gross donation amount.",
      checks: [
        "Compare processor gross, recorded fees, and expected net settlement.",
        "Verify the bank deposit agrees with the expected net amount.",
        "Check the settlement reference and fee schedule before accepting the explanation.",
      ],
    },
    amount_mismatch: {
      summary: "The amounts differ across records. Establish which values are supported by source evidence.",
      checks: [
        "Compare the processor gross amount, fee, expected net, bank deposit, and ledger amount.",
        "Check for partial settlements, duplicate entries, refunds, or timing differences.",
        "Record the verified amounts and explain any unresolved difference.",
      ],
    },
    currency_mismatch: {
      summary: "The records indicate different currencies. Do not compare amounts directly until the currency difference is understood.",
      checks: [
        "Verify the currency recorded by each source system.",
        "Check whether a documented currency conversion or exchange rate applies.",
        "Confirm the converted amount and supporting transaction reference before deciding.",
      ],
    },
    missing_bank_record: {
      summary: "A corresponding bank record was not identified in the available data. This does not by itself prove that funds are missing.",
      checks: [
        "Search the bank statement using the transaction reference, amount, and settlement date.",
        "Check settlement timing, bank descriptions, and possible grouped deposits.",
        "Confirm the bank data covers the relevant period and document any remaining evidence gap.",
      ],
    },
    missing_processor_record: {
      summary: "A corresponding processor record was not identified in the available data.",
      checks: [
        "Search processor exports for the reference, amount, and transaction date.",
        "Check alternate references, refunds, reversals, and settlement batch records.",
        "Verify the processor export is complete for the relevant period.",
      ],
    },
    missing_ledger_record: {
      summary: "A corresponding ledger entry was not identified in the available data.",
      checks: [
        "Search the ledger using the donation reference, amount, and posting date.",
        "Check whether the transaction was posted in a different period or account.",
        "Confirm ledger coverage and document any entry that still requires follow-up.",
      ],
    },
    ambiguous_bank_candidate: {
      summary: "More than one bank record may match this transaction. A unique match has not been established.",
      checks: [
        "Compare each candidate's amount, date, reference, and description.",
        "Check whether any candidate has already been matched to another transaction.",
        "Document why a candidate is or is not a defensible match; avoid assuming based on amount alone.",
      ],
    },
    unreferenced_bank_record: {
      summary: "A bank record was not confidently linked to a processor or ledger transaction.",
      checks: [
        "Inspect the bank description, deposit date, amount, and settlement reference.",
        "Search processor and ledger records for related transactions or grouped settlements.",
        "Document the remaining uncertainty and request follow-up when the source evidence is insufficient.",
      ],
    },
  };

  return guidance[classification] ?? {
    summary: "Review the source records and supporting evidence before deciding how to classify this case.",
    checks: [
      "Compare the available processor, bank, and ledger records.",
      "Verify the transaction reference, amount, currency, and relevant dates.",
      "Document the evidence reviewed and explain any unresolved uncertainty.",
    ],
  };
}

function getIntelligenceMetrics(
  items: ReconciliationItem[],
  decisions: Record<string, Decision>,
) {
  const counts = items.reduce<Record<string, number>>((result, item) => {
    result[item.classification] = (result[item.classification] ?? 0) + 1;
    return result;
  }, {});

  const exactMatches = counts.exact_amount_match ?? 0;
  const feeAdjusted = counts.fee_adjusted_settlement ?? 0;
  const needsInvestigation = items.filter((item) =>
    [
      "amount_mismatch",
      "currency_mismatch",
      "missing_bank_record",
      "missing_processor_record",
      "missing_ledger_record",
      "ambiguous_bank_candidate",
      "unreferenced_bank_record",
    ].includes(item.classification),
  ).length;

  const pendingReview = items.filter((item, index) => {
    const decision = decisions[String(index)];
    return decision
      ? false
      : item.status === "pending_review";
  }).length;

  const reviewed = items.filter((item, index) =>
    Boolean(decisions[String(index)]) ||
    item.status === "approved" ||
    item.status === "rejected",
  ).length;

  return {
    total: items.length,
    exactMatches,
    feeAdjusted,
    needsInvestigation,
    pendingReview,
    reviewed,
    reviewCompletion: items.length
      ? Math.round((reviewed / items.length) * 100)
      : 0,
    counts,
  };
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium capitalize text-slate-700">
      {children}
    </span>
  );
}

function getRecordValue(
  records: SourceRecord[],
  field: string,
): string | null {
  const value = records[0]?.record[field];
  return value == null || value.trim() === "" ? null : value.trim();
}

function parseMoney(value: string | null): number | null {
  if (value == null || !/^-?\d+(?:\.\d{1,2})?$/.test(value)) {
    return null;
  }

  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function formatMoney(amount: number | null, currency: string | null): string {
  if (amount == null) return "Not available";

  return `${currency ? `${currency} ` : ""}${amount.toLocaleString("en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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
      <div className="mb-3 flex items-center justify-between gap-2">
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
              className="rounded-lg border border-slate-200 bg-slate-50 p-3"
            >
              <p className="mb-3 text-xs font-medium text-slate-500">
                Source row {item.row_number}
              </p>

              <dl className="space-y-2">
                {Object.entries(item.record).map(([key, value]) => {
                  const isAmount =
                    /amount|total|gross|net|fee|deposit|balance/i.test(key);

                  return (
                    <div
                      key={key}
                      className={`grid grid-cols-2 gap-2 rounded-md text-sm ${
                        isAmount ? "border border-teal-200 bg-teal-50 px-2 py-2" : ""
                      }`}
                    >
                      <dt className="capitalize text-slate-500">
                        {formatLabel(key)}
                      </dt>
                      <dd
                        className={`break-words text-right font-semibold ${
                          isAmount ? "text-teal-900" : "text-slate-800"
                        }`}
                      >
                        {value || "—"}
                      </dd>
                    </div>
                  );
                })}
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

  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("wateraid-theme");
    const initialTheme =
      savedTheme === "light" || savedTheme === "dark"
        ? savedTheme
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";

    setTheme(initialTheme);
    document.documentElement.dataset.theme = initialTheme;
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "light" ? "dark" : "light";

    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("wateraid-theme", nextTheme);
  }

  const [processorFile, setProcessorFile] = useState<File | null>(null);
  const [bankFile, setBankFile] = useState<File | null>(null);
  const [ledgerFile, setLedgerFile] = useState<File | null>(null);

  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [classificationFilter, setClassificationFilter] = useState("all");
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
  const [checklistProgress, setChecklistProgress] = useState<Record<string, boolean[]>>({});

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(
        "wateraid-investigation-checklists"
      );
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, boolean[]>;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          setChecklistProgress(parsed);
        }
      }
    } catch {
      // Ignore invalid or unavailable saved checklist data.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "wateraid-investigation-checklists",
        JSON.stringify(checklistProgress)
      );
    } catch {
      // Checklist progress remains usable for the current session.
    }
  }, [checklistProgress]);

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

        const matchesStatus =
          filter === "all" ||
          (filter === "pending" && status === "pending_review") ||
          (filter === "approved" && status === "approved") ||
          (filter === "rejected" && status === "rejected");

        const matchesClassification =
          classificationFilter === "all" ||
          item.classification === classificationFilter;

        return matchesQuery && matchesStatus && matchesClassification;
      });
  }, [data, query, filter, classificationFilter, decisions]);

  const current = data?.items[selected];
  const currentDecision = decisions[String(selected)];
  const investigationGuidance = current
    ? getInvestigationGuidance(current.classification)
    : null;
  const intelligence = useMemo(
    () => (data ? getIntelligenceMetrics(data.items, decisions) : null),
    [data, decisions],
  );


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

    const summaryRows = [
      ["WaterAid Donation Reconciliation Report"],
      ["Run ID", runId],
      ["Generated at", new Date().toISOString()],
      ["Processor records", String(data.summary.processor_records)],
      ["Bank records", String(data.summary.bank_records)],
      ["Ledger records", String(data.summary.ledger_records)],
      ["Reconciliation items", String(data.summary.reconciliation_items)],
      ["Items pending review", String(data.summary.items_pending_review)],
      ["Processor gross total", data.summary.processor_gross_total],
      ["Processor fees", data.summary.processor_fee_total],
      ["Bank deposit total", data.summary.bank_deposit_total],
      ["Ledger recorded total", data.summary.ledger_recorded_total],
      ["Exact amount matches", String(intelligence?.exactMatches ?? 0)],
      ["Fee-adjusted settlements", String(intelligence?.feeAdjusted ?? 0)],
      ["Items needing investigation", String(intelligence?.needsInvestigation ?? 0)],
      ["Review completion", `${intelligence?.reviewCompletion ?? 0}%`],
      [],
      ["Case-level findings"],
    ];

    const rows = [
      [
        "Reference",
        "Source Identifier",
        "Classification",
        "Status",
        "Review Required",
        "Score",
        "Reviewer",
        "Timestamp",
        "Rationale",
        "Processor Evidence",
        "Bank Evidence",
        "Ledger Evidence",
        "Investigation Checks Completed",
        "Investigation Checks Total",
      ],
      ...data.items.map((item, index) => {
        const decision = decisions[String(index)];

        // Use the donation reference when available.
        // Otherwise identify an unreferenced bank entry without implying a confirmed match.
        const bankRecord = item.source_records?.bank?.[0];
        const sourceIdentifier = item.reference
          ? ""
          : bankRecord?.row_number != null
            ? `BANK-ROW-${bankRecord.row_number}`
            : `ITEM-${index + 1}`;

        const checklistKey = `${runId}:${index}:${item.classification}`;
        const completedChecks = checklistProgress[checklistKey] ?? [];
        const guidance = getInvestigationGuidance(item.classification);
        const completedCount = guidance.checks.filter(
          (_, checkIndex) => completedChecks[checkIndex] === true
        ).length;

        const describeRecords = (records: SourceRecord[]) =>
          records.map((record) =>
            `Row ${record.row_number}: ${JSON.stringify(record.record)}`
          ).join(" | ");

        return [
          item.reference ?? "",
          sourceIdentifier,
          item.classification,
          decision?.status ?? item.status,
          item.review_required ? "Yes" : "No",
          String(item.confidence_score),
          decision?.reviewer_id ?? "",
          decision?.created_at ?? "",
          decision?.rationale ?? "",
          describeRecords(item.source_records?.processor ?? []),
          describeRecords(item.source_records?.bank ?? []),
          describeRecords(item.source_records?.ledger ?? []),
          String(completedCount),
          String(guidance.checks.length),
        ];
      }),
    ];

    const csv = [...summaryRows, ...rows]
      .map((row) =>
        row
          .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
          .join(",")
      )
      .join("\r\n");

    const url = URL.createObjectURL(
      new Blob(["\uFEFF", csv], {
        type: "text/csv;charset=utf-8;",
      })
    );

    const link = document.createElement("a");
    link.href = url;
    link.download = `wateraid-reconciliation-${runId}-review.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
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
    <main id="main-content" className="app-shell min-h-screen bg-slate-50 text-slate-900">
      <a className="skip-link" href="#dashboard-content">
        Skip to main content
      </a>
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
              type="button"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
              aria-pressed={theme === "dark"}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {theme === "light" ? "◐ Dark mode" : "☀ Light mode"}
            </button>

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

      <div id="dashboard-content" className="mx-auto max-w-[1500px] space-y-7 px-5 py-8 lg:px-8">
        <section className="relative isolate overflow-hidden rounded-3xl border border-teal-900/10 bg-gradient-to-br from-teal-950 via-teal-800 to-emerald-700 p-6 text-white shadow-xl sm:p-9 lg:p-10">
          <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-emerald-300/15 blur-3xl" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-24 right-1/4 h-56 w-56 rounded-full bg-cyan-300/10 blur-3xl" aria-hidden="true" />

          <div className="relative grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_200px]">
            <div className="max-w-3xl">
              <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">
                <span className="h-2 w-2 rounded-full bg-emerald-300" aria-hidden="true" />
                Donation integrity workspace
              </p>

              <h2 className="max-w-2xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
                Every donation deserves to be accounted for.
              </h2>

              <p className="mt-4 max-w-2xl text-sm leading-7 text-teal-50 sm:text-base">
                Bring processor, bank, and ledger records together. Investigate
                discrepancies, review evidence, and document decisions with a
                traceable human-led workflow.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-teal-50">
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">Evidence-led review</span>
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">Human oversight</span>
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">Auditable decisions</span>
              </div>
            </div>

            <div className="orb-stage relative mx-auto hidden h-48 w-48 md:flex" aria-hidden="true">
              <div className="orb-ring" />
              <div className="orb-ring orb-ring-two" />
              <div className="water-orb" />
            </div>
          </div>
        </section>

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
            
            <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: "Processor Gross Total",
                  value: `$${Number(data.summary.processor_gross_total).toFixed(2)}`,
                  note: "Gross donation amounts",
                },
                {
                  label: "Processor Fees",
                  value: `$${Number(data.summary.processor_fee_total).toFixed(2)}`,
                  note: "Recorded processing fees",
                },
                {
                  label: "Bank Deposit Total",
                  value: `$${Number(data.summary.bank_deposit_total).toFixed(2)}`,
                  note: "Total recorded deposits",
                },
                {
                  label: "Ledger Recorded Total",
                  value: `$${Number(data.summary.ledger_recorded_total).toFixed(2)}`,
                  note: "Total accounting entries",
                },
              ].map((metric) => (
                <article
                  key={metric.label}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <p className="text-sm text-slate-500">{metric.label}</p>
                  <p className="mt-3 text-2xl font-bold tabular-nums">
                    {metric.value}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    {metric.note}
                  </p>
                </article>
              ))}
            </section>

            {intelligence && (
              <section
                aria-labelledby="intelligence-heading"
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
                      Reconciliation insights
                    </p>
                    <h3 id="intelligence-heading" className="mt-2 text-xl font-bold">
                      Intelligence Center
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      A live overview of the current reconciliation run.
                    </p>
                  </div>
                  <Badge>Backend classifications</Badge>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  {[
                    {
                      label: "Exact matches",
                      value: intelligence.exactMatches,
                      note: "Amounts match across sources",
                      tone: "text-emerald-700",
                    },
                    {
                      label: "Fee-adjusted",
                      value: intelligence.feeAdjusted,
                      note: "Settlements explained by fees",
                      tone: "text-teal-700",
                    },
                    {
                      label: "Needs investigation",
                      value: intelligence.needsInvestigation,
                      note: "Mismatches, missing, or ambiguous records",
                      tone: "text-amber-700",
                    },
                    {
                      label: "Pending review",
                      value: intelligence.pendingReview,
                      note: "Awaiting a human decision",
                      tone: "text-amber-700",
                    },
                    {
                      label: "Review completion",
                      value: `${intelligence.reviewCompletion}%`,
                      note: `${intelligence.reviewed} of ${intelligence.total} cases reviewed`,
                      tone: "text-slate-900",
                    },
                  ].map((metric) => (
                    <article
                      key={metric.label}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <p className="text-sm text-slate-500">{metric.label}</p>
                      <p className={`mt-3 text-3xl font-bold tabular-nums ${metric.tone}`}>
                        {metric.value}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">{metric.note}</p>
                    </article>
                  ))}
                </div>

                <div className="mt-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="font-semibold">Classification breakdown</h4>
                    <span className="text-xs text-slate-500">
                      {intelligence.total} reconciliation items
                    </span>
                  </div>

                  {Object.keys(intelligence.counts).length === 0 ? (
                    <p className="mt-3 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                      No reconciliation items are available for this run yet.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {Object.entries(intelligence.counts)
                        .sort((a, b) => b[1] - a[1])
                        .map(([classification, count]) => {
                          const percentage = intelligence.total
                            ? (count / intelligence.total) * 100
                            : 0;

                          return (
                            <div key={classification}>
                              <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                                <span className="capitalize text-slate-600">
                                  {formatLabel(classification)}
                                </span>
                                <span className="font-semibold tabular-nums">
                                  {count}
                                </span>
                              </div>
                              <div
                                className="h-2 overflow-hidden rounded-full bg-slate-100"
                                role="img"
                                aria-label={`${formatLabel(classification)}: ${count} of ${intelligence.total} items`}
                              >
                                <div
                                  className="h-full rounded-full bg-teal-600 transition-all"
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>

                <p className="mt-5 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500">
                  Investigation counts are triage indicators, not confirmed losses.
                  Review completion tracks recorded review decisions; it does not mean
                  the underlying accounting records have been corrected.
                </p>
              </section>
            )}

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

                  <label
                    htmlFor="classification-filter"
                    className="mt-4 block text-xs font-semibold text-slate-600"
                  >
                    Filter by classification
                  </label>
                  <select
                    id="classification-filter"
                    value={classificationFilter}
                    onChange={(event) => setClassificationFilter(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
                  >
                    <option value="all">All classifications</option>
                    {Array.from(
                      new Set(data?.items.map((item) => item.classification) ?? [])
                    )
                      .sort()
                      .map((classification) => (
                        <option key={classification} value={classification}>
                          {formatLabel(classification)}
                        </option>
                      ))}
                  </select>
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
                        className={`review-queue-item block w-full p-4 text-left transition hover:bg-slate-50 ${
                          selected === index ? "review-queue-item-selected" : ""
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
              {intelligence && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">
                        Workflow overview
                      </p>
                      <h3 className="mt-1 text-lg font-bold">
                        Reconciliation Operations
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Keep review work moving and identify the next case to investigate.
                      </p>
                    </div>
                    <Badge>{intelligence.pendingReview} pending</Badge>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Reviewed</p>
                      <p className="mt-1 text-2xl font-bold tabular-nums">
                        {intelligence.reviewed}
                        <span className="text-sm font-medium text-slate-500"> / {intelligence.total}</span>
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Need investigation</p>
                      <p className="mt-1 text-2xl font-bold tabular-nums text-amber-700">
                        {intelligence.needsInvestigation}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-slate-700">Review completion</span>
                      <span className="font-semibold tabular-nums">{intelligence.reviewCompletion}%</span>
                    </div>
                    <div
                      className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"
                      role="progressbar"
                      aria-label="Overall review completion"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={intelligence.reviewCompletion}
                    >
                      <div
                        className="h-full rounded-full bg-teal-600 transition-all"
                        style={{ width: `${intelligence.reviewCompletion}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-5 rounded-xl border border-teal-200 bg-teal-50/60 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-teal-800">
                      Suggested next step
                    </p>
                    {(() => {
                      const nextCase = data?.items
                        .map((item, index) => ({ item, index }))
                        .find(({ item, index }) =>
                          !decisions[String(index)] &&
                          item.status === "pending_review"
                        );

                      return nextCase ? (
                        <>
                          <p className="mt-2 font-semibold text-slate-900">
                            {nextCase.item.reference || "Unreferenced bank entry"}
                          </p>
                          <p className="mt-1 text-sm capitalize text-slate-600">
                            {formatLabel(nextCase.item.classification)}
                          </p>
                          <p className="mt-2 text-sm leading-5 text-slate-600">
                            {getInvestigationGuidance(nextCase.item.classification).summary}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setSelected(nextCase.index);
                              setRationale("");
                              setError("");
                            }}
                            className="mt-3 w-full rounded-lg bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-900"
                          >
                            Open next pending case
                          </button>
                        </>
                      ) : (
                        <p className="mt-2 text-sm text-slate-600">
                          No undecided cases remain. Confirm that all review decisions are supported by evidence.
                        </p>
                      );
                    })()}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setFilter("pending");
                        setClassificationFilter("all");
                        setQuery("");
                      }}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Show pending cases
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFilter("all");
                        setClassificationFilter("all");
                        setQuery("");
                      }}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Clear all filters
                    </button>
                  </div>

                  <p className="mt-4 border-t border-slate-200 pt-3 text-xs leading-5 text-slate-500">
                    Investigation counts are triage indicators, not confirmed losses. Review completion reflects recorded decisions, not accounting corrections.
                  </p>
                </section>
              )}

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

                    {(() => {
                      const processorRecords = current.source_records.processor;
                      const bankRecords = current.source_records.bank;
                      const ledgerRecords = current.source_records.ledger;

                      const gross = parseMoney(getRecordValue(processorRecords, "gross_amount"));
                      const fee = parseMoney(getRecordValue(processorRecords, "fee"));
                      const deposit = parseMoney(getRecordValue(bankRecords, "deposit_amount"));
                      const ledgerAmount = parseMoney(getRecordValue(ledgerRecords, "recorded_amount"));

                      const currency =
                        getRecordValue(processorRecords, "currency") ??
                        getRecordValue(bankRecords, "currency") ??
                        getRecordValue(ledgerRecords, "currency");

                      const expectedNet =
                        gross !== null && fee !== null ? gross - fee : null;

                      const depositDifference =
                        deposit !== null && expectedNet !== null
                          ? Math.round((deposit - expectedNet) * 100) / 100
                          : null;

                      const hasAllRecords =
                        processorRecords.length > 0 &&
                        bankRecords.length > 0 &&
                        ledgerRecords.length > 0;

                      const currencyValues = [
                        getRecordValue(processorRecords, "currency"),
                        getRecordValue(bankRecords, "currency"),
                        getRecordValue(ledgerRecords, "currency"),
                      ].filter((value): value is string => value !== null);

                      const currencyMismatch =
                        new Set(currencyValues).size > 1;

                      const amountMismatch =
                        gross !== null &&
                        ledgerAmount !== null &&
                        Math.round(gross * 100) !== Math.round(ledgerAmount * 100);

                      const settlementMismatch =
                        depositDifference !== null &&
                        Math.abs(depositDifference) >= 0.01;

                      const classificationLabels: Record<string, string> = {
                        exact_amount_match: "Exact amount match",
                        fee_adjusted_settlement: "Fee-adjusted settlement",
                        amount_mismatch: "Amount mismatch",
                        currency_mismatch: "Currency mismatch",
                        missing_bank_record: "Missing bank record",
                        missing_processor_record: "Missing processor record",
                        missing_ledger_record: "Missing ledger record",
                        ambiguous_bank_candidate: "Ambiguous bank candidate",
                        unreferenced_bank_record: "Unreferenced bank record",
                      };

                      const summaryStatus = !hasAllRecords
                        ? "Missing source record"
                        : classificationLabels[current.classification] ??
                          current.classification
                            .replaceAll("_", " ")
                            .replace(/^./, (character) => character.toUpperCase());

                      const summaryStatusStyle =
                        summaryStatus === "Amounts aligned" ||
                        summaryStatus === "Fee-adjusted settlement"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-amber-200 bg-amber-50 text-amber-900";

                      const metrics = [
                        { label: "Processor gross", amount: gross },
                        { label: "Processor fee", amount: fee },
                        { label: "Expected net", amount: expectedNet },
                        { label: "Bank deposit", amount: deposit },
                        { label: "Ledger recorded", amount: ledgerAmount },
                        { label: "Deposit difference", amount: depositDifference },
                      ];

                      return (
                        <section
                          aria-label="Reconciliation summary"
                          className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h3 className="text-lg font-bold text-slate-900">
                                Reconciliation summary
                              </h3>
                              <p className="mt-1 text-sm text-slate-500">
                                Financial overview calculated from the selected source records.
                              </p>
                            </div>
                            <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${summaryStatusStyle}`}>
                              {summaryStatus}
                            </span>
                          </div>

                          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {metrics.map((metric) => (
                              <div
                                key={metric.label}
                                className={`rounded-xl border p-4 ${
                                  metric.label === "Deposit difference" &&
                                  depositDifference !== null &&
                                  Math.abs(depositDifference) >= 0.01
                                    ? "border-amber-200 bg-amber-50"
                                    : "border-slate-200 bg-slate-50"
                                }`}
                              >
                                <p className="text-sm text-slate-500">{metric.label}</p>
                                <p className="mt-2 break-words text-xl font-bold text-slate-900">
                                  {formatMoney(metric.amount, currency)}
                                </p>
                              </div>
                            ))}
                          </div>

                          <p className="mt-4 text-xs leading-5 text-slate-500">
                            Expected net is processor gross minus the recorded fee.
                            Deposit difference is bank deposit minus expected net.
                            A difference signals a case for review; it is not by itself
                            proof of an accounting error. Classification and source evidence
                            remain available below.
                          </p>
                        </section>
                      );
                    })()}

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
                          <h3 className="text-lg font-bold">Investigation Brief</h3>
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

                      {investigationGuidance && (
                        <div className="mt-4 space-y-4 border-t border-teal-200 pt-4">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="font-semibold">Guided investigation</h4>
                              <span className="rounded-full bg-teal-100 px-2.5 py-1 text-xs font-semibold text-teal-800">
                                Rules-based
                              </span>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-slate-700">
                              {investigationGuidance.summary}
                            </p>
                          </div>

                          <div>
                            {(() => {
                              const checklistKey = `${runId}:${selected}:${current?.classification ?? "unknown"}`;
                              const completedChecks = checklistProgress[checklistKey] ?? [];
                              const completedCount = investigationGuidance.checks.filter(
                                (_, index) => completedChecks[index] === true
                              ).length;
                              const totalChecks = investigationGuidance.checks.length;

                              return (
                                <>
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <h4 className="font-semibold">Investigation checklist</h4>
                                    <span className="text-xs font-semibold text-slate-600">
                                      {completedCount} of {totalChecks} completed
                                    </span>
                                  </div>

                                  <div
                                    className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"
                                    role="progressbar"
                                    aria-label="Investigation checklist progress"
                                    aria-valuemin={0}
                                    aria-valuemax={totalChecks}
                                    aria-valuenow={completedCount}
                                  >
                                    <div
                                      className="h-full rounded-full bg-teal-600 transition-all"
                                      style={{
                                        width: `${totalChecks ? (completedCount / totalChecks) * 100 : 0}%`,
                                      }}
                                    />
                                  </div>

                                  <div className="mt-3 space-y-3">
                                    {investigationGuidance.checks.map((check, index) => (
                                      <label
                                        key={check}
                                        className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-700"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={completedChecks[index] === true}
                                          onChange={(event) => {
                                            const next = [...completedChecks];
                                            next[index] = event.target.checked;
                                            setChecklistProgress((previous) => ({
                                              ...previous,
                                              [checklistKey]: next,
                                            }));
                                          }}
                                          className="mt-1 size-4 shrink-0 accent-teal-700"
                                        />
                                        <span className={completedChecks[index] ? "text-slate-500 line-through" : ""}>
                                          {check}
                                        </span>
                                      </label>
                                    ))}
                                  </div>
                                </>
                              );
                            })()}
                          </div>

                          <p className="text-xs leading-5 text-slate-500">
                            Use these checks as guidance, not proof. Verify each conclusion against
                            the source records and document unresolved differences before deciding.
                          </p>
                        </div>
                      )}

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
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-bold text-slate-900">Audit history</h3>
                          <p className="mt-1 text-sm text-slate-500">
                            A traceable record of review decisions for this case.
                          </p>
                        </div>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                          {currentHistory.length} event{currentHistory.length === 1 ? "" : "s"}
                        </span>
                      </div>

                      {currentHistory.length === 0 ? (
                        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
                          <p className="text-sm font-medium text-slate-700">
                            No review events recorded yet
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            Saved decisions will appear here with the reviewer, timestamp, and rationale.
                          </p>
                        </div>
                      ) : (
                        <ol className="mt-5 space-y-4">
                          {currentHistory.map((event, index) => {
                            const decisionStyle =
                              event.decision === "approved"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                : event.decision === "rejected"
                                  ? "border-rose-200 bg-rose-50 text-rose-800"
                                  : "border-amber-200 bg-amber-50 text-amber-900";

                            return (
                              <li key={event.id} className="relative pl-7">
                                {index < currentHistory.length - 1 && (
                                  <span
                                    className="absolute bottom-[-18px] left-[9px] top-5 w-px bg-slate-200"
                                    aria-hidden="true"
                                  />
                                )}

                                <span
                                  className="absolute left-0 top-1.5 h-[19px] w-[19px] rounded-full border-4 border-white bg-teal-700 shadow-sm"
                                  aria-hidden="true"
                                />

                                <div className="rounded-xl border border-slate-200 bg-white p-4">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${decisionStyle}`}>
                                      {formatLabel(event.decision)}
                                    </span>
                                    <time className="text-xs text-slate-500">
                                      {event.created_at}
                                    </time>
                                  </div>

                                  <div className="mt-3">
                                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                      Reviewer
                                    </p>
                                    <p className="mt-1 text-sm font-semibold text-slate-900">
                                      {event.reviewer_id}
                                    </p>
                                  </div>

                                  <div className="mt-3 rounded-lg bg-slate-50 p-3">
                                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                      Rationale
                                    </p>
                                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                                      {event.rationale || "No rationale provided."}
                                    </p>
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ol>
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
