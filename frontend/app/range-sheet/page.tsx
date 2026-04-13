"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getRangeData } from "@/lib/data-resolver";

type DashboardData = Awaited<ReturnType<typeof getRangeData>>;

function fmt(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined) return "—";
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function isIsoDate(value: string | null | undefined) {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeIsoDate(value: string | null | undefined) {
  return isIsoDate(value) ? value! : null;
}

function isoToday() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const dayNum = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayNum}`;
}

function endOfWeek(dateStr: string) {
  return addDays(startOfWeek(dateStr), 6);
}

function StatCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      {sublabel ? <div className="mt-1 text-xs text-slate-500">{sublabel}</div> : null}
    </div>
  );
}

function RangeSheetInner() {
  const searchParams = useSearchParams();

  const queryStart = normalizeIsoDate(searchParams.get("start"));
  const queryEnd = normalizeIsoDate(searchParams.get("end"));

  const defaultEnd = useMemo(() => {
    if (queryEnd) return queryEnd;
    if (queryStart) return queryStart;
    return isoToday();
  }, [queryEnd, queryStart]);

  const defaultStart = useMemo(() => {
    if (queryStart) return queryStart;
    return addDays(defaultEnd, -6);
  }, [queryStart, defaultEnd]);

  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStart(defaultStart);
    setEnd(defaultEnd);
  }, [defaultStart, defaultEnd]);

  async function load(nextStart: string, nextEnd: string) {
    try {
      setLoading(true);
      setError(null);
      const result = await getRangeData(nextStart, nextEnd);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load range data");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(start, end);
  }, [start, end]);

  const operators = data?.operators ?? [];
  const summary = data?.weeklySummary;
  const sourceDates = (data as { sourceDates?: string[] } | null)?.sourceDates ?? [];

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-slate-500">Range Sheet</div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Custom date range
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Review a custom range using the DB-backed aggregation path.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/weekly-sheet"
            className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Weekly Sheet
          </Link>
          <Link
            href={`/range-sheet?start=${startOfWeek(start)}&end=${endOfWeek(start)}`}
            className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Open this week
          </Link>
          <Link
            href="/daily-sheet"
            className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Daily Sheet
          </Link>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Start
            </span>
            <input
              type="date"
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              End
            </span>
            <input
              type="date"
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => {
                const today = isoToday();
                setStart(today);
                setEnd(today);
              }}
            >
              Today
            </button>

            <button
              className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => {
                const today = isoToday();
                setStart(addDays(today, -6));
                setEnd(today);
              }}
            >
              Last 7 days
            </button>

            <button
              className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => {
                const today = isoToday();
                setStart(startOfWeek(today));
                setEnd(endOfWeek(today));
              }}
            >
              This week
            </button>
          </div>
        </div>

        <div className="mt-3 text-xs text-slate-500">
          Current range: <span className="font-medium text-slate-700">{start}</span> to{" "}
          <span className="font-medium text-slate-700">{end}</span>
          {sourceDates.length ? (
            <>
              {" "}
              · Source dates:{" "}
              <span className="font-medium text-slate-700">{sourceDates.join(", ")}</span>
            </>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
          Loading range data...
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          {error}
        </div>
      ) : data && summary ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
            <StatCard label="Total Plates" value={fmt(summary.totalPlates)} />
            <StatCard label="Total Pieces" value={fmt(summary.totalPieces)} />
            <StatCard label="Repl Plates" value={fmt(summary.replenishmentPlates)} />
            <StatCard label="Repl Pieces" value={fmt(summary.replenishmentPieces)} />
            <StatCard
              label="Receiving"
              value={fmt(summary.receivingPlates)}
              sublabel={`${fmt(summary.receivingPieces)} pieces`}
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Top operators</h2>
                <p className="text-sm text-slate-500">
                  Aggregated across the selected range.
                </p>
              </div>
              <div className="text-xs text-slate-500">{operators.length} operators</div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="border-b bg-slate-50">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-semibold">Operator</th>
                    <th className="px-3 py-2 font-semibold">Area</th>
                    <th className="px-3 py-2 font-semibold">Role</th>
                    <th className="px-3 py-2 font-semibold">Total Plates</th>
                    <th className="px-3 py-2 font-semibold">Total Pieces</th>
                    <th className="px-3 py-2 font-semibold">Repl Plates</th>
                    <th className="px-3 py-2 font-semibold">Receiving Plates</th>
                    <th className="px-3 py-2 font-semibold">Actual Min</th>
                    <th className="px-3 py-2 font-semibold">Std Min</th>
                    <th className="px-3 py-2 font-semibold">Perf %</th>
                  </tr>
                </thead>
                <tbody>
                  {operators.map((op) => (
                    <tr key={op.userid} className="border-b last:border-b-0">
                      <td className="px-3 py-2 font-medium text-slate-900">{op.name}</td>
                      <td className="px-3 py-2">{op.assignedArea || "—"}</td>
                      <td className="px-3 py-2">{op.assignedRole || "—"}</td>
                      <td className="px-3 py-2">{fmt(op.totalPlates)}</td>
                      <td className="px-3 py-2">{fmt(op.totalPieces)}</td>
                      <td className="px-3 py-2">{fmt(op.replenishmentPlates)}</td>
                      <td className="px-3 py-2">{fmt(op.receivingPlates)}</td>
                      <td className="px-3 py-2">{fmt(op.actualMinutes)}</td>
                      <td className="px-3 py-2">{fmt(op.standardMinutes)}</td>
                      <td className="px-3 py-2">{fmt(op.performanceVsStandard, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            Weekly Sheet is still the current enriched weekly workflow. Range Sheet is now the bridge for
            custom windows and future weekly/date-range unification.
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
          No range data found.
        </div>
      )}
    </main>
  );
}

export default function RangeSheetPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
            Loading range sheet...
          </div>
        </main>
      }
    >
      <RangeSheetInner />
    </Suspense>
  );
}
