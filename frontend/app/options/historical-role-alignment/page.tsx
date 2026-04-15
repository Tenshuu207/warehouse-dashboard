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
  notes?: string | null;
  alignmentStatus?: string | null;
};

type ApiPayload = {
  year: number;
  count: number;
  rows: AlignmentRow[];
};

type OptionsPayload = {
  areas: string[];
  roles: string[];
  reviewStatuses: string[];
};

type OverrideDraft = {
  forcedRole: string;
  forcedArea: string;
  notes: string;
};

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
    forcedRole: row.forcedRole || "",
    forcedArea: row.forcedArea || "",
    notes: row.notes || "",
  };
}

function effectiveRole(row: AlignmentRow, draft?: OverrideDraft) {
  return draft?.forcedRole || row.forcedRole || row.primaryRole || "";
}

function effectiveArea(row: AlignmentRow, draft?: OverrideDraft) {
  return draft?.forcedArea || row.forcedArea || row.primaryArea || "";
}

function alignmentStatus(row: AlignmentRow, draft?: OverrideDraft) {
  if (row.alignmentStatus) return row.alignmentStatus;
  if (draft?.forcedRole || draft?.forcedArea || row.forcedRole || row.forcedArea) {
    return "Override drafted";
  }
  return row.reviewFlag ? "Needs review" : "Aligned";
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
  const [loading, setLoading] = useState(true);
  const [savingUser, setSavingUser] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMessage(null);

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
      setOptions({
        areas: Array.isArray(optionsJson.areas) ? optionsJson.areas : [],
        roles: Array.isArray(optionsJson.roles) ? optionsJson.roles : [],
        reviewStatuses: Array.isArray(optionsJson.reviewStatuses)
          ? optionsJson.reviewStatuses
          : [],
      });
      setDrafts(nextDrafts);
      setSelectedKey((current) => {
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
      replPlates: rows.reduce((sum, row) => sum + row.yearlyReplPlates, 0),
      receivingPlates: rows.reduce((sum, row) => sum + row.yearlyReceivingPlates, 0),
      pickPlates: rows.reduce((sum, row) => sum + row.yearlyPickPlates, 0),
    };
  }, [payload]);

  const selectedRow = useMemo(() => {
    const rows = payload?.rows || [];
    return rows.find((row) => rowKey(row) === selectedKey) || rows[0] || null;
  }, [payload, selectedKey]);

  const selectedDraft = selectedRow ? drafts[rowKey(selectedRow)] : undefined;

  function updateDraft(key: string, patch: Partial<OverrideDraft>) {
    setDrafts((current) => ({
      ...current,
      [key]: {
        ...(current[key] || {
          forcedRole: "",
          forcedArea: "",
          notes: "",
        }),
        ...patch,
      },
    }));
  }

  async function saveOverride(row: AlignmentRow, draft: OverrideDraft) {
    setSavingUser(row.userid);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/historical-role-alignment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: row.year,
          userid: row.userid,
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

      setMessage(`Saved override for ${row.name || row.userid}.`);
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save historical override");
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
            <div className="text-xs text-slate-500">Review Flags</div>
            <div className="mt-1 text-xl font-semibold">{formatNumber(summary.reviewFlags)}</div>
          </div>
          <div className="rounded-xl border bg-white p-3 shadow-sm">
            <div className="text-xs text-slate-500">Repl Plates</div>
            <div className="mt-1 text-xl font-semibold">{formatNumber(summary.replPlates)}</div>
          </div>
          <div className="rounded-xl border bg-white p-3 shadow-sm">
            <div className="text-xs text-slate-500">Receiving Plates</div>
            <div className="mt-1 text-xl font-semibold">{formatNumber(summary.receivingPlates)}</div>
          </div>
          <div className="rounded-xl border bg-white p-3 shadow-sm">
            <div className="text-xs text-slate-500">Pick Plates</div>
            <div className="mt-1 text-xl font-semibold">{formatNumber(summary.pickPlates)}</div>
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
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Review Rows</h2>
              <p className="mt-1 text-xs text-slate-500">
                Click a row to edit overrides in the side panel. Sorted by review flag, role share, then replenishment plates.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[1320px] text-left text-sm">
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
                    <th className="whitespace-nowrap px-3 py-2">UserID</th>
                    <th className="whitespace-nowrap px-3 py-2">Role Share</th>
                    <th className="whitespace-nowrap px-3 py-2">Area Share</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">Repl Pieces</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">Receiving Plates</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">Pick Plates</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">Active Weeks</th>
                    <th className="whitespace-nowrap px-3 py-2">Role Confidence</th>
                    <th className="whitespace-nowrap px-3 py-2">Area Confidence</th>
                    <th className="whitespace-nowrap px-3 py-2">Review Flag</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loading ? (
                    <tr>
                      <td className="px-3 py-4 text-slate-500" colSpan={14}>
                        Loading alignment rows...
                      </td>
                    </tr>
                  ) : null}

                  {!loading && payload?.rows.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4 text-slate-500" colSpan={14}>
                        No historical role alignment rows found for {year}.
                      </td>
                    </tr>
                  ) : null}

                  {!loading
                    ? payload?.rows.map((row) => {
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
                              {row.userid}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2">
                              {formatPercent(row.primaryRoleShare)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2">
                              {formatPercent(row.primaryAreaShare)}
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
                    Save override
                  </button>
                  <button
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
                    disabled={savingUser === selectedRow.userid}
                    onClick={() => {
                      const cleared = { forcedRole: "", forcedArea: "", notes: "" };
                      updateDraft(rowKey(selectedRow), cleared);
                      void saveOverride(selectedRow, cleared);
                    }}
                  >
                    Clear override
                  </button>
                  <button
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
                    onClick={() =>
                      updateDraft(rowKey(selectedRow), {
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
