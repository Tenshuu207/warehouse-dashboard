"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type AlignmentRow = {
  year: number;
  userid: string;
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
  effectiveRole?: string | null;
  effectiveArea?: string | null;
  alignmentStatus?: string | null;
  suggestedReviewSegments?: SuggestedReviewSegment[];
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
  return `${row.year}-${row.userid}`;
}

function draftFromRow(row: AlignmentRow): OverrideDraft {
  return {
    startDate: row.overrideStartDate || "",
    endDate: row.overrideEndDate || "",
    forcedRole: row.forcedRole || "",
    forcedArea: row.forcedArea || "",
    notes: row.notes || "",
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
  return Boolean(row.forcedRole || row.forcedArea || row.overrideStartDate || row.overrideEndDate || row.notes?.trim());
}

function needsReview(row: AlignmentRow) {
  const status = String(row.alignmentStatus || "").toLowerCase();
  return row.reviewFlag || status.includes("review");
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
    } catch (err) {
      setPayload(null);
      setError(err instanceof Error ? err.message : "Failed to load historical role alignment");
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
      activeQueue: rows.filter((row) => needsReview(row) && !hasOverride(row)).length,
      processed: rows.filter((row) => hasOverride(row)).length,
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

  const activeRows = useMemo(
    () => (payload?.rows || []).filter((row) => needsReview(row) && !hasOverride(row)),
    [payload]
  );

  const processedRows = useMemo(
    () => (payload?.rows || []).filter((row) => hasOverride(row)),
    [payload]
  );

  const baseRows = mode === "active" ? activeRows : processedRows;

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return baseRows;

    return baseRows.filter((row) =>
      [
        row.userid,
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

    setSavingUser(row.userid);
    setError(null);
    setMessage(null);
    setEditorFeedback({
      tone: "info",
      text: "Saving override...",
    });

    try {
      const isClear =
        !draft.startDate.trim() &&
        !draft.endDate.trim() &&
        !draft.forcedRole.trim() &&
        !draft.forcedArea.trim() &&
        !draft.notes.trim();
      const nextRow =
        visibleRows.find((candidate) => rowKey(candidate) !== rowKey(row)) || null;

      const res = await fetch("/api/historical-role-alignment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: row.year,
          userid: row.userid,
          startDate: draft.startDate || null,
          endDate: draft.endDate || null,
          forcedRole: draft.forcedRole || null,
          forcedArea: draft.forcedArea || null,
          notes: draft.notes || "",
        }),
      });

      const json = (await res.json().catch(() => ({}))) as { error?: string; details?: string };

      if (!res.ok) {
        throw new Error(
          json.details || json.error || "Historical override save API is unavailable"
        );
      }

      const actionText = isClear ? "Cleared override" : "Saved override";
      setMessage(`${actionText} for ${row.name || row.userid}.`);
      setEditorFeedback({
        tone: "success",
        text: `${actionText}. ${nextRow ? `Moved to ${nextRow.name || nextRow.userid}.` : "No more rows in this list."}`,
      });
      await loadRows(nextRow ? rowKey(nextRow) : null, true);
    } catch (err) {
      setEditorFeedback({
        tone: "error",
        text: err instanceof Error ? err.message : "Failed to save historical override",
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
                      ? "Rows here still need review and have no saved override."
                      : "Rows here already have a saved forced role, forced area, or note."}
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
                          : "No processed override rows match the current filters."}
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
                              <span
                                className={[
                                  "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                                  hasOverride(row)
                                    ? "border-blue-200 bg-blue-50 text-blue-800"
                                    : row.reviewFlag
                                      ? "border-amber-200 bg-amber-50 text-amber-800"
                                      : "border-emerald-200 bg-emerald-50 text-emerald-800",
                                ].join(" ")}
                              >
                                {alignmentStatus(row)}
                              </span>
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

                <div className="grid grid-cols-1 gap-3">
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
                              segmentTone(segment.segmentType),
                            ].join(" ")}
                            onClick={() =>
                              updateDraft(rowKey(selectedRow), {
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
                              <span className="shrink-0 rounded-full border bg-white px-2 py-0.5 font-medium text-slate-700">
                                {segmentTypeLabel(segment.segmentType)}
                              </span>
                            </div>
                            <div className="mt-1 grid grid-cols-2 gap-2 text-slate-700">
                              <div>
                                <span className="text-slate-500">Area: </span>
                                <span className="font-medium">
                                  {segment.suggestedArea || "-"} ({formatPercent(segment.areaShare)})
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-500">Role: </span>
                                <span className="font-medium">
                                  {segment.suggestedRole || "-"} ({formatPercent(segment.roleShare)})
                                </span>
                              </div>
                            </div>
                            <div className="mt-1 text-slate-600">
                              Plates: {formatNumber(segment.replenishmentPlates)}
                            </div>
                            <div className="mt-1 text-slate-600">{segment.reason}</div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-md border border-dashed bg-white p-3 text-xs text-slate-500">
                        No monthly replenishment periods were available for this operator.
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
                  <button
                    className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    disabled={savingUser === selectedRow.userid}
                    onClick={() => void saveOverride(selectedRow, selectedDraft)}
                  >
                    {savingUser === selectedRow.userid ? "Saving..." : "Save override"}
                  </button>
                  <button
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
                    disabled={savingUser === selectedRow.userid}
                    onClick={() => {
                      const cleared = {
                        startDate: "",
                        endDate: "",
                        forcedRole: "",
                        forcedArea: "",
                        notes: "",
                      };
                      updateDraft(rowKey(selectedRow), cleared);
                      void saveOverride(selectedRow, cleared);
                    }}
                  >
                    {savingUser === selectedRow.userid ? "Clearing..." : "Clear override"}
                  </button>
                  <button
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
                    onClick={() =>
                      updateDraft(rowKey(selectedRow), {
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
