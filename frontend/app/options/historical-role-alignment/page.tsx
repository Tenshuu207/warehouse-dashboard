"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type AlignmentRow = {
  year: number;
  userid: string;
  subjectKey?: string | null;
  overrideSubjectKey?: string | null;
  name: string | null;
  primaryRole: string | null;
  primaryRoleShare: number | null;
  primaryArea: string | null;
  primaryAreaShare: number | null;
  primaryActivityArea?: string | null;
  yearlyReplPlates: number;
  yearlyReplPieces: number;
  yearlyReceivingPlates: number;
  yearlyReceivingPieces?: number;
  yearlyPickPlates: number;
  yearlyPickPieces?: number;
  activeDays?: number;
  activeWeeks: number;
  roleConfidence: string;
  areaConfidence: string;
  reviewFlag: boolean;
  forcedRole?: string | null;
  forcedArea?: string | null;
  overrideStartDate?: string | null;
  overrideEndDate?: string | null;
  notes?: string | null;
  rangeOverrides?: SavedRangeOverride[];
  effectiveRole?: string | null;
  effectiveArea?: string | null;
  alignmentStatus?: string | null;
  coverageComplete?: boolean;
  observedWeeks?: number;
  coveredWeeks?: number;
  uncoveredWeeks?: number;
  reviewQueueReason?: string;
  suggestedReviewExplanation?: string;
  suggestedReviewSegments?: SuggestedReviewSegment[];
};

type SavedRangeOverride = {
  id: string;
  year: number;
  subjectKey: string;
  startDate: string;
  endDate: string;
  forcedRole: string | null;
  forcedArea: string | null;
  notes: string;
  source: string;
  updatedAt: string;
};

type SuggestedReviewSegment = {
  startDate: string;
  endDate: string;
  suggestedArea: string | null;
  suggestedRole: string | null;
  areaShare: number | null;
  roleShare: number | null;
  replenishmentPlates: number;
  segmentType: "stable" | "likely_shift" | "mixed" | "uncovered_gap" | "low_confidence";
  reason: string;
  coverageState?: "uncovered" | "partially_covered" | "covered_by_override" | "covered_by_global_override";
  appliedRole?: string | null;
  appliedArea?: string | null;
  appliedStartDate?: string | null;
  appliedEndDate?: string | null;
  appliedCoverageLabel?: string;
};

type ApiPayload = {
  year: number;
  count: number;
  saveSupported?: boolean;
  rows: AlignmentRow[];
};

type OptionsPayload = {
  areas: string[];
  roles: string[];
  reviewStatuses: string[];
};

type OverrideDraft = {
  rangeId: string;
  startDate: string;
  endDate: string;
  forcedRole: string;
  forcedArea: string;
  notes: string;
};

type ReviewMode = "active" | "processed";

type EditorFeedback = {
  tone: "success" | "error" | "info";
  text: string;
} | null;

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return value.toLocaleString();
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return `${Math.round(value * 100)}%`;
}

function flagClasses(flag: boolean) {
  return flag
    ? "border-amber-200 bg-amber-50 text-amber-800"
    : "border-emerald-200 bg-emerald-50 text-emerald-800";
}

function confidenceClasses(value: string) {
  switch (value) {
    case "high":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "medium":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "low":
    default:
      return "border-amber-200 bg-amber-50 text-amber-800";
  }
}

function rowKey(row: AlignmentRow) {
  return `${row.year}-${row.subjectKey || row.userid}-${row.userid}`;
}

function overrideKey(row: AlignmentRow) {
  return row.subjectKey || row.userid;
}

function draftFromRow(row: AlignmentRow): OverrideDraft {
  return {
    rangeId: "",
    startDate: row.overrideStartDate || "",
    endDate: row.overrideEndDate || "",
    forcedRole: row.forcedRole || "",
    forcedArea: row.forcedArea || "",
    notes: row.notes || "",
  };
}

function draftFromRange(range: SavedRangeOverride): OverrideDraft {
  return {
    rangeId: range.id,
    startDate: range.startDate,
    endDate: range.endDate,
    forcedRole: range.forcedRole || "",
    forcedArea: range.forcedArea || "",
    notes: range.notes || "",
  };
}

function effectiveRole(row: AlignmentRow, draft?: OverrideDraft) {
  return draft?.forcedRole || row.effectiveRole || row.forcedRole || row.primaryRole || "";
}

function effectiveArea(row: AlignmentRow, draft?: OverrideDraft) {
  return draft?.forcedArea || row.effectiveArea || row.forcedArea || row.primaryArea || "";
}

function alignmentStatus(row: AlignmentRow, draft?: OverrideDraft) {
  if (row.alignmentStatus) return row.alignmentStatus;
  if (draft?.forcedRole || draft?.forcedArea || row.forcedRole || row.forcedArea) {
    return "Override drafted";
  }
  return row.reviewFlag ? "Needs review" : "Aligned";
}

function hasOverride(row: AlignmentRow) {
  return Boolean(
    row.forcedRole ||
      row.forcedArea ||
      row.overrideStartDate ||
      row.overrideEndDate ||
      row.notes?.trim() ||
      (row.rangeOverrides?.length || 0) > 0
  );
}

function hasGlobalOverride(row: AlignmentRow) {
  return hasOverride(row) && !row.overrideStartDate && !row.overrideEndDate;
}

function needsReview(row: AlignmentRow) {
  const status = String(row.alignmentStatus || "").toLowerCase();
  return row.reviewFlag || status.includes("review");
}

function coverageComplete(row: AlignmentRow) {
  return row.coverageComplete === true;
}

function isActiveReviewRow(row: AlignmentRow) {
  return needsReview(row) && !coverageComplete(row) && !hasGlobalOverride(row);
}

function isProcessedRow(row: AlignmentRow) {
  return coverageComplete(row) || !needsReview(row) || hasGlobalOverride(row);
}

function queueLabel(row: AlignmentRow) {
  return isActiveReviewRow(row) ? "Active Review" : "Processed";
}

function queueReason(row: AlignmentRow) {
  if (row.reviewQueueReason) return row.reviewQueueReason;
  if (!needsReview(row)) return "No review flag is currently raised.";
  if (coverageComplete(row)) return "All observed meaningful weeks are covered.";
  if (hasGlobalOverride(row)) return "A global override covers the full review period.";
  return "Review is still open because observed weeks remain uncovered.";
}

function coverageBadgeLabel(row: AlignmentRow) {
  if (!needsReview(row)) return "No review needed";
  return coverageComplete(row) ? "Coverage complete" : "Coverage incomplete";
}

function segmentTypeLabel(type: SuggestedReviewSegment["segmentType"]) {
  switch (type) {
    case "likely_shift":
      return "Likely shift";
    case "uncovered_gap":
      return "Uncovered";
    case "low_confidence":
      return "Low confidence";
    case "mixed":
      return "Mixed";
    case "stable":
    default:
      return "Stable";
  }
}

function segmentTone(type: SuggestedReviewSegment["segmentType"]) {
  switch (type) {
    case "uncovered_gap":
      return "border-amber-300 bg-amber-50 hover:bg-amber-100";
    case "likely_shift":
      return "border-sky-300 bg-sky-50 hover:bg-sky-100";
    case "mixed":
    case "low_confidence":
      return "border-orange-300 bg-orange-50 hover:bg-orange-100";
    case "stable":
    default:
      return "border-slate-200 bg-white hover:bg-slate-50";
  }
}

function segmentCoverageState(segment: SuggestedReviewSegment) {
  return segment.coverageState || "uncovered";
}

function segmentCoverageLabel(segment: SuggestedReviewSegment) {
  switch (segmentCoverageState(segment)) {
    case "covered_by_global_override":
      return "Global override";
    case "covered_by_override":
      return "Covered";
    case "partially_covered":
      return "Partial";
    case "uncovered":
    default:
      return "Uncovered";
  }
}

function segmentCoverageTone(segment: SuggestedReviewSegment) {
  switch (segmentCoverageState(segment)) {
    case "covered_by_global_override":
    case "covered_by_override":
      return "border-emerald-300 bg-emerald-50 text-emerald-800";
    case "partially_covered":
      return "border-amber-300 bg-amber-50 text-amber-800";
    case "uncovered":
    default:
      return "border-slate-300 bg-white text-slate-700";
  }
}

function segmentCardTone(segment: SuggestedReviewSegment) {
  switch (segmentCoverageState(segment)) {
    case "covered_by_global_override":
    case "covered_by_override":
      return "border-emerald-300 bg-emerald-50 hover:bg-emerald-100";
    case "partially_covered":
      return "border-amber-300 bg-amber-50 hover:bg-amber-100";
    case "uncovered":
    default:
      return segmentTone(segment.segmentType);
  }
}

function hasAppliedOverride(segment: SuggestedReviewSegment) {
  return segmentCoverageState(segment) !== "uncovered";
}

export default function HistoricalRoleAlignmentPage() {
  const [year, setYear] = useState("2025");
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [options, setOptions] = useState<OptionsPayload>({
    areas: [],
    roles: [],
    reviewStatuses: [],
  });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, OverrideDraft>>({});
  const [mode, setMode] = useState<ReviewMode>("active");
  const [search, setSearch] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingUser, setSavingUser] = useState<string | null>(null);
  const [saveSupported, setSaveSupported] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editorFeedback, setEditorFeedback] = useState<EditorFeedback>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRows = useCallback(async (nextSelection?: string | null, keepFeedback = false) => {
    setLoading(true);
    setError(null);
    if (!keepFeedback) {
      setMessage(null);
      setEditorFeedback(null);
    }

    try {
      const [res, optionsRes] = await Promise.all([
        fetch(`/api/historical-role-alignment?year=${encodeURIComponent(year)}`, {
          cache: "no-store",
        }),
        fetch("/api/options", { cache: "no-store" }),
      ]);
      const json = (await res.json()) as ApiPayload | { error?: string };
      const optionsJson = optionsRes.ok
        ? ((await optionsRes.json()) as Partial<OptionsPayload>)
        : {};

      if (!res.ok) {
        throw new Error(
          typeof (json as { error?: string }).error === "string"
            ? (json as { error?: string }).error
            : "Failed to load historical role alignment"
        );
      }

      const nextPayload = json as ApiPayload;
      const nextDrafts: Record<string, OverrideDraft> = {};

      for (const row of nextPayload.rows) {
        nextDrafts[rowKey(row)] = draftFromRow(row);
      }

      setPayload(nextPayload);
      setSaveSupported(nextPayload.saveSupported === true);
      setOptions({
        areas: Array.isArray(optionsJson.areas) ? optionsJson.areas : [],
        roles: Array.isArray(optionsJson.roles) ? optionsJson.roles : [],
        reviewStatuses: Array.isArray(optionsJson.reviewStatuses)
          ? optionsJson.reviewStatuses
          : [],
      });
      setDrafts(nextDrafts);
      setSelectedKey((current) => {
        if (nextSelection !== undefined) {
          return nextSelection;
        }
        if (current && nextPayload.rows.some((row) => rowKey(row) === current)) {
          return current;
        }
        return nextPayload.rows[0] ? rowKey(nextPayload.rows[0]) : null;
      });
      return nextPayload;
    } catch (err) {
      setPayload(null);
      setError(err instanceof Error ? err.message : "Failed to load historical role alignment");
      return null;
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const summary = useMemo(() => {
    const rows = payload?.rows || [];
    return {
      operators: rows.length,
      reviewFlags: rows.filter((row) => row.reviewFlag).length,
      activeQueue: rows.filter(isActiveReviewRow).length,
      processed: rows.filter(isProcessedRow).length,
      replPlates: rows.reduce((sum, row) => sum + row.yearlyReplPlates, 0),
      receivingPlates: rows.reduce((sum, row) => sum + row.yearlyReceivingPlates, 0),
      pickPlates: rows.reduce((sum, row) => sum + row.yearlyPickPlates, 0),
    };
  }, [payload]);

  const selectedRow = useMemo(() => {
    if (!selectedKey) return null;
    const rows = payload?.rows || [];
    return rows.find((row) => rowKey(row) === selectedKey) || null;
  }, [payload, selectedKey]);

  const selectedDraft = selectedRow ? drafts[rowKey(selectedRow)] : undefined;
  const selectedSegments = selectedRow?.suggestedReviewSegments || [];
  const selectedSuggestionExplanation =
    selectedRow?.suggestedReviewExplanation ||
    "No suggested date-range segments were generated for this operator.";

  const activeRows = useMemo(
    () => (payload?.rows || []).filter(isActiveReviewRow),
    [payload]
  );

  const processedRows = useMemo(
    () => (payload?.rows || []).filter(isProcessedRow),
    [payload]
  );

  const baseRows = mode === "active" ? activeRows : processedRows;

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return baseRows;

    return baseRows.filter((row) =>
      [
        row.userid,
        row.subjectKey,
        row.overrideSubjectKey,
        row.name,
        row.primaryRole,
        row.primaryArea,
        row.effectiveRole,
        row.effectiveArea,
        row.forcedRole,
        row.forcedArea,
        row.notes,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [baseRows, search]);

  useEffect(() => {
    if (loading) return;
    if (visibleRows.length === 0) {
      setSelectedKey(null);
      return;
    }
    if (!selectedKey || !visibleRows.some((row) => rowKey(row) === selectedKey)) {
      setSelectedKey(rowKey(visibleRows[0]));
    }
  }, [loading, selectedKey, visibleRows]);

  function updateDraft(key: string, patch: Partial<OverrideDraft>) {
    setDrafts((current) => ({
      ...current,
      [key]: {
        ...(current[key] || {
          rangeId: "",
          startDate: "",
          endDate: "",
          forcedRole: "",
          forcedArea: "",
          notes: "",
        }),
        ...patch,
      },
    }));
  }

  async function saveOverride(row: AlignmentRow, draft: OverrideDraft) {
    if (!saveSupported) {
      setEditorFeedback({
        tone: "error",
        text: "Historical override save API is unavailable.",
      });
      return;
    }

    setSavingUser(rowKey(row));
    setError(null);
    setMessage(null);
    setEditorFeedback({
      tone: "info",
      text: "Saving override...",
    });

    try {
      if (draft.rangeId && (!draft.startDate.trim() || !draft.endDate.trim())) {
        throw new Error("Saved range overrides need both a start date and an end date.");
      }

      const isClear =
        !draft.startDate.trim() &&
        !draft.endDate.trim() &&
        !draft.forcedRole.trim() &&
        !draft.forcedArea.trim() &&
        !draft.notes.trim();
      const res = await fetch("/api/historical-role-alignment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: row.year,
          userid: row.userid,
          subjectKey: overrideKey(row),
          rangeId: draft.rangeId || null,
          startDate: draft.startDate || null,
          endDate: draft.endDate || null,
          forcedRole: draft.forcedRole || null,
          forcedArea: draft.forcedArea || null,
          notes: draft.notes || "",
        }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        details?: string;
        rangeId?: string;
      };

      if (!res.ok) {
        throw new Error(
          json.details || json.error || "Historical override save API is unavailable"
        );
      }

      const actionText = isClear ? "Cleared override" : "Saved override";
      setMessage(`${actionText} for ${row.name || row.userid}.`);
      setEditorFeedback({
        tone: "success",
        text: `${actionText}. Refreshed coverage and queue status.`,
      });
      const refreshedPayload = await loadRows(rowKey(row), true);
      const refreshedRow = refreshedPayload?.rows.find((candidate) => rowKey(candidate) === rowKey(row));
      if (refreshedRow) {
        setMode(isActiveReviewRow(refreshedRow) ? "active" : "processed");
        if (json.rangeId) {
          const refreshedRange = refreshedRow.rangeOverrides?.find((range) => range.id === json.rangeId);
          if (refreshedRange) {
            setDrafts((current) => ({
              ...current,
              [rowKey(refreshedRow)]: draftFromRange(refreshedRange),
            }));
          }
        }
      }
    } catch (err) {
      setEditorFeedback({
        tone: "error",
        text: err instanceof Error ? err.message : "Failed to save historical override",
      });
    } finally {
      setSavingUser(null);
    }
  }

  async function deleteRangeOverride(row: AlignmentRow, range: SavedRangeOverride) {
    if (!saveSupported) {
      setEditorFeedback({
        tone: "error",
        text: "Historical override save API is unavailable.",
      });
      return;
    }

    setSavingUser(rowKey(row));
    setError(null);
    setMessage(null);
    setEditorFeedback({
      tone: "info",
      text: "Deleting range override...",
    });

    try {
      const res = await fetch("/api/historical-role-alignment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: row.year,
          userid: row.userid,
          subjectKey: overrideKey(row),
          deleteRangeId: range.id,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; details?: string };

      if (!res.ok) {
        throw new Error(
          json.details || json.error || "Historical override save API is unavailable"
        );
      }

      setMessage(`Deleted range override for ${row.name || row.userid}.`);
      setEditorFeedback({
        tone: "success",
        text: "Deleted range override. Refreshed coverage and queue status.",
      });
      const refreshedPayload = await loadRows(rowKey(row), true);
      const refreshedRow = refreshedPayload?.rows.find((candidate) => rowKey(candidate) === rowKey(row));
      if (refreshedRow) {
        setMode(isActiveReviewRow(refreshedRow) ? "active" : "processed");
      }
    } catch (err) {
      setEditorFeedback({
        tone: "error",
        text: err instanceof Error ? err.message : "Failed to delete range override",
      });
    } finally {
      setSavingUser(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-3 text-slate-900 md:p-4">
      <div className="mx-auto max-w-[1800px] space-y-4">
        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Historical Role Alignment</h1>
              <p className="mt-1 text-sm text-slate-600">
                Yearly operator role and area alignment from imported UserLS replenishment activity.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium" htmlFor="alignment-year">
                Year
              </label>
              <input
                id="alignment-year"
                className="w-24 rounded-md border px-3 py-2 text-sm"
                value={year}
                onChange={(event) => setYear(event.target.value)}
              />
              <button
                className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
                disabled={loading}
                onClick={() => void loadRows()}
              >
                Refresh
              </button>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <div className="rounded-xl border bg-white p-3 shadow-sm">
            <div className="text-xs text-slate-500">Operators</div>
            <div className="mt-1 text-xl font-semibold">{formatNumber(summary.operators)}</div>
          </div>
          <div className="rounded-xl border bg-white p-3 shadow-sm">
            <div className="text-xs text-slate-500">Active Queue</div>
            <div className="mt-1 text-xl font-semibold">{formatNumber(summary.activeQueue)}</div>
          </div>
          <div className="rounded-xl border bg-white p-3 shadow-sm">
            <div className="text-xs text-slate-500">Processed</div>
            <div className="mt-1 text-xl font-semibold">{formatNumber(summary.processed)}</div>
          </div>
          <div className="rounded-xl border bg-white p-3 shadow-sm">
            <div className="text-xs text-slate-500">Repl Plates</div>
            <div className="mt-1 text-xl font-semibold">{formatNumber(summary.replPlates)}</div>
          </div>
          <div className="rounded-xl border bg-white p-3 shadow-sm">
            <div className="text-xs text-slate-500">Review Flags</div>
            <div className="mt-1 text-xl font-semibold">{formatNumber(summary.reviewFlags)}</div>
          </div>
        </section>

        {error ? (
          <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </section>
        ) : null}

        {message ? (
          <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            {message}
          </section>
        ) : null}

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="space-y-3 border-b px-4 py-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-sm font-semibold">
                    {mode === "active" ? "Active Review" : "Processed / Overridden"}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {mode === "active"
                      ? "Rows here still need review because observed meaningful weeks remain uncovered."
                      : "Rows here are coverage-complete, globally overridden, or do not need review."}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    className={[
                      "rounded-md border px-3 py-2 text-sm font-medium",
                      mode === "active"
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
                    ].join(" ")}
                    onClick={() => setMode("active")}
                    type="button"
                  >
                    Active Review ({formatNumber(activeRows.length)})
                  </button>
                  <button
                    className={[
                      "rounded-md border px-3 py-2 text-sm font-medium",
                      mode === "processed"
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
                    ].join(" ")}
                    onClick={() => setMode("processed")}
                    type="button"
                  >
                    Processed / Overridden ({formatNumber(processedRows.length)})
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <input
                  className="w-full rounded-md border px-3 py-2 text-sm md:max-w-sm"
                  placeholder="Search operator, role, area, note..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <button
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  onClick={() => setShowDetails((current) => !current)}
                  type="button"
                >
                  {showDetails ? "Hide details" : "Show details"}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className={`${showDetails ? "min-w-[1280px]" : "min-w-[860px]"} text-left text-sm`}>
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="sticky left-0 z-30 w-56 whitespace-nowrap border-r bg-slate-50 px-3 py-2">
                      Operator
                    </th>
                    <th className="sticky left-56 z-30 w-36 whitespace-nowrap border-r bg-slate-50 px-3 py-2">
                      Inferred Role
                    </th>
                    <th className="sticky left-[368px] z-30 w-36 whitespace-nowrap border-r bg-slate-50 px-3 py-2">
                      Inferred Area
                    </th>
                    <th className="sticky left-[512px] z-30 w-28 whitespace-nowrap border-r bg-slate-50 px-3 py-2 text-right">
                      Repl Plates
                    </th>
                    <th className="whitespace-nowrap px-3 py-2">Role Share</th>
                    <th className="whitespace-nowrap px-3 py-2">Area Share</th>
                    <th className="whitespace-nowrap px-3 py-2">Anomaly</th>
                    <th className="whitespace-nowrap px-3 py-2">Status</th>
                    {showDetails ? (
                      <>
                        <th className="whitespace-nowrap px-3 py-2">UserID</th>
                        <th className="whitespace-nowrap px-3 py-2 text-right">Repl Pieces</th>
                        <th className="whitespace-nowrap px-3 py-2 text-right">Receiving Plates</th>
                        <th className="whitespace-nowrap px-3 py-2 text-right">Pick Plates</th>
                        <th className="whitespace-nowrap px-3 py-2 text-right">Active Weeks</th>
                        <th className="whitespace-nowrap px-3 py-2">Role Confidence</th>
                        <th className="whitespace-nowrap px-3 py-2">Area Confidence</th>
                      </>
                    ) : null}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loading ? (
                    <tr>
                      <td className="px-3 py-4 text-slate-500" colSpan={showDetails ? 15 : 8}>
                        Loading alignment rows...
                      </td>
                    </tr>
                  ) : null}

                  {!loading && visibleRows.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4 text-slate-500" colSpan={showDetails ? 15 : 8}>
                        {mode === "active"
                          ? "No active review rows match the current filters."
                          : "No processed rows match the current filters."}
                      </td>
                    </tr>
                  ) : null}

                  {!loading
                    ? visibleRows.map((row) => {
                        const key = rowKey(row);
                        const selected = key === selectedKey;
                        const stickyBg = selected ? "bg-blue-50" : "bg-white";

                        return (
                          <tr
                            key={key}
                            className={[
                              "cursor-pointer",
                              selected
                                ? "bg-blue-50 ring-2 ring-inset ring-blue-500"
                                : "hover:bg-slate-50",
                            ].join(" ")}
                            onClick={() => setSelectedKey(key)}
                          >
                            <td
                              className={[
                                "sticky left-0 z-20 w-56 whitespace-nowrap border-r px-3 py-2 font-medium",
                                stickyBg,
                              ].join(" ")}
                            >
                              {row.name || row.userid}
                              <div className="text-xs font-normal text-slate-500">
                                {row.userid}
                              </div>
                              {row.subjectKey && row.subjectKey !== row.userid ? (
                                <div className="text-[11px] font-normal text-slate-400">
                                  Subject {row.subjectKey}
                                </div>
                              ) : null}
                            </td>
                            <td
                              className={[
                                "sticky left-56 z-20 w-36 whitespace-nowrap border-r px-3 py-2",
                                stickyBg,
                              ].join(" ")}
                            >
                              {row.primaryRole || "-"}
                            </td>
                            <td
                              className={[
                                "sticky left-[368px] z-20 w-36 whitespace-nowrap border-r px-3 py-2",
                                stickyBg,
                              ].join(" ")}
                            >
                              {row.primaryArea || "-"}
                            </td>
                            <td
                              className={[
                                "sticky left-[512px] z-20 w-28 whitespace-nowrap border-r px-3 py-2 text-right font-semibold",
                                stickyBg,
                              ].join(" ")}
                            >
                              {formatNumber(row.yearlyReplPlates)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                              {formatPercent(row.primaryRoleShare)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2">
                              {formatPercent(row.primaryAreaShare)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2">
                              <span
                                className={[
                                  "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                                  flagClasses(row.reviewFlag),
                                ].join(" ")}
                              >
                                {row.reviewFlag ? "Review" : "OK"}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2">
                              <div className="space-y-1">
                                <span
                                  className={[
                                    "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                                    isActiveReviewRow(row)
                                      ? "border-amber-200 bg-amber-50 text-amber-800"
                                      : hasOverride(row)
                                        ? "border-blue-200 bg-blue-50 text-blue-800"
                                        : "border-emerald-200 bg-emerald-50 text-emerald-800",
                                  ].join(" ")}
                                >
                                  {queueLabel(row)}
                                </span>
                                <div className="text-xs text-slate-500">
                                  {alignmentStatus(row)}
                                </div>
                              </div>
                            </td>
                            {showDetails ? (
                              <>
                                <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                                  {row.userid}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2 text-right">
                                  {formatNumber(row.yearlyReplPieces)}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2 text-right">
                                  {formatNumber(row.yearlyReceivingPlates)}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2 text-right">
                                  {formatNumber(row.yearlyPickPlates)}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2 text-right">
                                  {formatNumber(row.activeWeeks)}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2">
                                  <span
                                    className={[
                                      "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
                                      confidenceClasses(row.roleConfidence),
                                    ].join(" ")}
                                  >
                                    {row.roleConfidence}
                                  </span>
                                </td>
                                <td className="whitespace-nowrap px-3 py-2">
                                  <span
                                    className={[
                                      "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
                                      confidenceClasses(row.areaConfidence),
                                    ].join(" ")}
                                  >
                                    {row.areaConfidence}
                                  </span>
                                </td>
                              </>
                            ) : null}
                          </tr>
                        );
                      })
                    : null}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="rounded-2xl border bg-white shadow-sm xl:sticky xl:top-4 xl:self-start">
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Override Editor</h2>
              <p className="mt-1 text-xs text-slate-500">
                Edit the selected row without scrolling to the far side of the table.
              </p>
            </div>

            {selectedRow && selectedDraft ? (
              <div className="space-y-4 p-4">
                {editorFeedback ? (
                  <div
                    className={[
                      "rounded-lg border p-3 text-sm font-medium",
                      editorFeedback.tone === "success"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : editorFeedback.tone === "error"
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-sky-200 bg-sky-50 text-sky-800",
                    ].join(" ")}
                  >
                    {editorFeedback.text}
                  </div>
                ) : null}

                <div>
                  <div className="text-lg font-semibold">{selectedRow.name || selectedRow.userid}</div>
                  <div className="text-xs text-slate-500">{selectedRow.userid}</div>
                  {selectedRow.subjectKey && selectedRow.subjectKey !== selectedRow.userid ? (
                    <div className="text-xs text-slate-500">Subject {selectedRow.subjectKey}</div>
                  ) : null}
                  {selectedRow.overrideSubjectKey &&
                  selectedRow.overrideSubjectKey !== (selectedRow.subjectKey || selectedRow.userid) ? (
                    <div className="text-xs text-amber-700">
                      Loaded legacy override key {selectedRow.overrideSubjectKey}
                    </div>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs font-medium text-slate-500">Inferred role</div>
                    <div className="mt-1 font-semibold">{selectedRow.primaryRole || "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-500">Inferred area</div>
                    <div className="mt-1 font-semibold">{selectedRow.primaryArea || "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-500">Effective role</div>
                    <div className="mt-1 font-semibold">{effectiveRole(selectedRow, selectedDraft) || "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-500">Effective area</div>
                    <div className="mt-1 font-semibold">{effectiveArea(selectedRow, selectedDraft) || "-"}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs font-medium text-slate-500">Anomaly flag</div>
                    <span
                      className={[
                        "mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                        flagClasses(selectedRow.reviewFlag),
                      ].join(" ")}
                    >
                      {selectedRow.reviewFlag ? "Review" : "OK"}
                    </span>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-500">Alignment status</div>
                    <div className="mt-1 font-semibold">{alignmentStatus(selectedRow, selectedDraft)}</div>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-medium text-slate-500">Queue status</div>
                      <div className="mt-1 font-semibold">{queueLabel(selectedRow)}</div>
                    </div>
                    <span
                      className={[
                        "rounded-full border px-2 py-0.5 text-xs font-medium",
                        coverageComplete(selectedRow) || !needsReview(selectedRow)
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-amber-200 bg-amber-50 text-amber-800",
                      ].join(" ")}
                    >
                      {coverageBadgeLabel(selectedRow)}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-slate-500">Observed weeks</div>
                      <div className="mt-1 font-semibold text-slate-900">
                        {formatNumber(selectedRow.observedWeeks ?? selectedRow.activeWeeks)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Covered weeks</div>
                      <div className="mt-1 font-semibold text-slate-900">
                        {formatNumber(selectedRow.coveredWeeks)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Uncovered weeks</div>
                      <div className="mt-1 font-semibold text-slate-900">
                        {formatNumber(selectedRow.uncoveredWeeks)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-slate-600">{queueReason(selectedRow)}</div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold">Saved Range Overrides</h3>
                        <p className="mt-1 text-xs text-slate-500">
                          Date-range overrides are saved independently for this operator.
                        </p>
                      </div>
                      <span className="rounded-full border bg-white px-2 py-0.5 text-xs font-medium text-slate-600">
                        {formatNumber(selectedRow.rangeOverrides?.length || 0)}
                      </span>
                    </div>

                    {selectedRow.rangeOverrides?.length ? (
                      <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                        {selectedRow.rangeOverrides.map((range) => {
                          const selectedRange = selectedDraft.rangeId === range.id;
                          return (
                            <div
                              key={range.id}
                              className={[
                                "rounded-md border bg-white p-2 text-xs",
                                selectedRange ? "border-blue-300 ring-1 ring-blue-300" : "border-slate-200",
                              ].join(" ")}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <button
                                  className="min-w-0 text-left"
                                  onClick={() => updateDraft(rowKey(selectedRow), draftFromRange(range))}
                                  type="button"
                                >
                                  <div className="font-semibold text-slate-900">
                                    {range.startDate} to {range.endDate}
                                  </div>
                                  <div className="mt-1 text-slate-600">
                                    {range.forcedArea || "-"} / {range.forcedRole || "-"}
                                  </div>
                                  {range.notes ? (
                                    <div className="mt-1 truncate text-slate-500">{range.notes}</div>
                                  ) : null}
                                </button>
                                <button
                                  className="shrink-0 rounded-md border border-red-200 px-2 py-1 font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                                  disabled={savingUser === rowKey(selectedRow)}
                                  onClick={() => void deleteRangeOverride(selectedRow, range)}
                                  type="button"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-md border border-dashed bg-white p-3 text-xs text-slate-500">
                        No saved date-range overrides for this operator.
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold">Suggested Review Segments</h3>
                        <p className="mt-1 text-xs text-slate-500">
                          Click a segment to prefill the date range, role, and area.
                        </p>
                      </div>
                      <span className="rounded-full border bg-white px-2 py-0.5 text-xs font-medium text-slate-600">
                        {formatNumber(selectedSegments.length)}
                      </span>
                    </div>

                    {selectedSegments.length > 0 ? (
                      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                        {selectedSegments.map((segment) => (
                          <button
                            key={`${segment.startDate}-${segment.endDate}-${segment.suggestedArea || "area"}-${segment.suggestedRole || "role"}`}
                            className={[
                              "w-full rounded-md border p-2 text-left text-xs transition",
                              segmentCardTone(segment),
                            ].join(" ")}
                            onClick={() =>
                              updateDraft(rowKey(selectedRow), {
                                rangeId: "",
                                startDate: segment.startDate,
                                endDate: segment.endDate,
                                forcedRole: segment.suggestedRole || "",
                                forcedArea: segment.suggestedArea || "",
                              })
                            }
                            type="button"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="font-semibold text-slate-900">
                                {segment.startDate} to {segment.endDate}
                              </div>
                              <div className="flex shrink-0 flex-wrap justify-end gap-1">
                                <span className="rounded-full border bg-white px-2 py-0.5 font-medium text-slate-700">
                                  {segmentTypeLabel(segment.segmentType)}
                                </span>
                                <span
                                  className={[
                                    "rounded-full border px-2 py-0.5 font-medium",
                                    segmentCoverageTone(segment),
                                  ].join(" ")}
                                >
                                  {segmentCoverageLabel(segment)}
                                </span>
                              </div>
                            </div>
                            <div className="mt-1 grid grid-cols-2 gap-2 text-slate-700">
                              <div>
                                <span className="text-slate-500">Inferred area: </span>
                                <span className="font-medium">
                                  {segment.suggestedArea || "-"} ({formatPercent(segment.areaShare)})
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-500">Inferred role: </span>
                                <span className="font-medium">
                                  {segment.suggestedRole || "-"} ({formatPercent(segment.roleShare)})
                                </span>
                              </div>
                            </div>
                            {hasAppliedOverride(segment) ? (
                              <div className="mt-2 rounded-md border border-white/80 bg-white/70 p-2 text-slate-700">
                                <div className="font-medium text-slate-900">
                                  Applied: {segment.appliedArea || "-"} / {segment.appliedRole || "-"}
                                </div>
                                <div className="mt-1 text-slate-600">
                                  {segment.appliedCoverageLabel ||
                                    (segment.appliedStartDate && segment.appliedEndDate
                                      ? `${segment.appliedStartDate} to ${segment.appliedEndDate}`
                                      : "Saved override applies to this segment.")}
                                </div>
                              </div>
                            ) : null}
                            <div className="mt-1 text-slate-600">
                              Plates: {formatNumber(segment.replenishmentPlates)}
                            </div>
                            <div className="mt-1 text-slate-600">{segment.reason}</div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-md border border-dashed bg-white p-3 text-xs text-slate-500">
                        {selectedSuggestionExplanation}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-slate-500">Override start date</span>
                      <input
                        className="w-full rounded-md border px-3 py-2 text-sm"
                        type="date"
                        value={selectedDraft.startDate}
                        onChange={(event) =>
                          updateDraft(rowKey(selectedRow), { startDate: event.target.value })
                        }
                      />
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs font-medium text-slate-500">Override end date</span>
                      <input
                        className="w-full rounded-md border px-3 py-2 text-sm"
                        type="date"
                        value={selectedDraft.endDate}
                        onChange={(event) =>
                          updateDraft(rowKey(selectedRow), { endDate: event.target.value })
                        }
                      />
                    </label>
                  </div>

                  <label className="space-y-1">
                    <span className="text-xs font-medium text-slate-500">Forced role</span>
                    <select
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      value={selectedDraft.forcedRole}
                      onChange={(event) =>
                        updateDraft(rowKey(selectedRow), { forcedRole: event.target.value })
                      }
                    >
                      <option value="">No forced role</option>
                      {options.roles.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs font-medium text-slate-500">Forced area</span>
                    <select
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      value={selectedDraft.forcedArea}
                      onChange={(event) =>
                        updateDraft(rowKey(selectedRow), { forcedArea: event.target.value })
                      }
                    >
                      <option value="">No forced area</option>
                      {options.areas.map((area) => (
                        <option key={area} value={area}>
                          {area}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs font-medium text-slate-500">Notes</span>
                    <textarea
                      className="min-h-24 w-full rounded-md border px-3 py-2 text-sm"
                      value={selectedDraft.notes}
                      onChange={(event) =>
                        updateDraft(rowKey(selectedRow), { notes: event.target.value })
                      }
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  <div className="text-xs text-slate-500">
                    {selectedDraft.rangeId
                      ? "Editing saved date-range override."
                      : selectedDraft.startDate || selectedDraft.endDate
                        ? "Saving will add or update this date-range override."
                        : "Saving without dates updates the global override."}
                  </div>
                  <button
                    className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    disabled={savingUser === rowKey(selectedRow)}
                    onClick={() => void saveOverride(selectedRow, selectedDraft)}
                  >
                    {savingUser === rowKey(selectedRow)
                      ? "Saving..."
                      : selectedDraft.rangeId
                        ? "Save range override"
                        : selectedDraft.startDate || selectedDraft.endDate
                          ? "Save new range override"
                          : "Save global override"}
                  </button>
                  <button
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
                    disabled={savingUser === rowKey(selectedRow)}
                    onClick={() => {
                      const cleared = {
                        rangeId: "",
                        startDate: "",
                        endDate: "",
                        forcedRole: "",
                        forcedArea: "",
                        notes: "",
                      };
                      if (selectedDraft.rangeId) {
                        const range = selectedRow.rangeOverrides?.find(
                          (candidate) => candidate.id === selectedDraft.rangeId
                        );
                        if (range) {
                          void deleteRangeOverride(selectedRow, range);
                          return;
                        }
                      }
                      if (selectedDraft.startDate || selectedDraft.endDate) {
                        updateDraft(rowKey(selectedRow), draftFromRow(selectedRow));
                        return;
                      }
                      updateDraft(rowKey(selectedRow), cleared);
                      void saveOverride(selectedRow, cleared);
                    }}
                  >
                    {savingUser === rowKey(selectedRow)
                      ? "Clearing..."
                      : selectedDraft.rangeId
                        ? "Delete selected range"
                        : selectedDraft.startDate || selectedDraft.endDate
                          ? "Discard range draft"
                          : "Clear global override"}
                  </button>
                  <button
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
                    onClick={() =>
                      updateDraft(rowKey(selectedRow), {
                        rangeId: "",
                        startDate: "",
                        endDate: "",
                        forcedRole: selectedRow.primaryRole || "",
                        forcedArea: selectedRow.primaryArea || "",
                      })
                    }
                  >
                    Use inferred
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 text-sm text-slate-500">Select a row to edit overrides.</div>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}
