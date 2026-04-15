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
  yearlyReplPlates: number;
  yearlyReplPieces: number;
  yearlyReceivingPlates: number;
  yearlyPickPlates: number;
  activeWeeks: number;
  roleConfidence: string;
  areaConfidence: string;
  reviewFlag: boolean;
};

type ApiPayload = {
  year: number;
  count: number;
  rows: AlignmentRow[];
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

export default function HistoricalRoleAlignmentPage() {
  const [year, setYear] = useState("2025");
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/historical-role-alignment?year=${encodeURIComponent(year)}`,
        { cache: "no-store" }
      );
      const json = (await res.json()) as ApiPayload | { error?: string };

      if (!res.ok) {
        throw new Error(
          typeof (json as { error?: string }).error === "string"
            ? (json as { error?: string }).error
            : "Failed to load historical role alignment"
        );
      }

      setPayload(json as ApiPayload);
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

  return (
    <main className="min-h-screen bg-slate-100 p-3 text-slate-900 md:p-4">
      <div className="mx-auto max-w-7xl space-y-4">
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

        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Review Rows</h2>
            <p className="mt-1 text-xs text-slate-500">
              Sorted by review flag, role share, then replenishment plates.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2">Operator</th>
                  <th className="whitespace-nowrap px-3 py-2">UserID</th>
                  <th className="whitespace-nowrap px-3 py-2">Primary Role</th>
                  <th className="whitespace-nowrap px-3 py-2">Role Share</th>
                  <th className="whitespace-nowrap px-3 py-2">Primary Area</th>
                  <th className="whitespace-nowrap px-3 py-2">Area Share</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Repl Plates</th>
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
                  ? payload?.rows.map((row) => (
                      <tr key={`${row.year}-${row.userid}`} className="hover:bg-slate-50">
                        <td className="whitespace-nowrap px-3 py-2 font-medium">
                          {row.name || row.userid}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                          {row.userid}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {row.primaryRole || "-"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {formatPercent(row.primaryRoleShare)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {row.primaryArea || "-"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {formatPercent(row.primaryAreaShare)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          {formatNumber(row.yearlyReplPlates)}
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
                    ))
                  : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
