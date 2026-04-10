"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import ControlBar from "@/components/control-bar";
import WeeklySheetView from "@/components/weekly-sheet-view";
import { useAppState } from "@/lib/app-state";

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
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

type CustomRange = {
  start: string;
  end: string;
};

export default function WeeklySheetPage() {
  const { selectedWeek } = useAppState();

  const selectedWeekStart = useMemo(() => startOfWeek(selectedWeek), [selectedWeek]);
  const selectedWeekEnd = useMemo(() => endOfWeek(selectedWeek), [selectedWeek]);
  const selectedDayOnlyEnd = selectedWeek;
  const selectedRollingStart = useMemo(() => addDays(selectedWeek, -6), [selectedWeek]);

  const [customRange, setCustomRange] = useState<CustomRange | null>(null);

  const rangeStart = customRange?.start ?? selectedWeekStart;
  const rangeEnd = customRange?.end ?? selectedWeekEnd;

  const customRangeValid =
    isIsoDate(rangeStart) &&
    isIsoDate(rangeEnd) &&
    rangeStart <= rangeEnd;

  const customHref = customRangeValid
    ? `/range-sheet?start=${rangeStart}&end=${rangeEnd}`
    : "/range-sheet";

  return (
    <main className="min-h-screen bg-slate-100 p-3 text-slate-900 md:p-4">
      <div className="max-w-[1800px] min-w-0 space-y-4 xl:ml-0 xl:mr-auto">
        <ControlBar />

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">Weekly Sheet View</h2>
              <p className="mt-1 text-xs text-slate-600">
                Spreadsheet-style operational scoreboard using current enriched weekly data.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href={`/range-sheet?start=${selectedWeekStart}&end=${selectedWeekEnd}`}
                className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Open selected week as range
              </Link>
              <Link
                href={`/range-sheet?start=${selectedDayOnlyEnd}&end=${selectedDayOnlyEnd}`}
                className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Selected day only
              </Link>
              <Link
                href={`/range-sheet?start=${selectedRollingStart}&end=${selectedDayOnlyEnd}`}
                className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Last 7 days ending selected day
              </Link>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              Range bridge
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Start
                </span>
                <input
                  type="date"
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                  value={rangeStart}
                  onChange={(e) =>
                    setCustomRange((prev) => ({
                      start: e.target.value,
                      end: prev?.end ?? selectedWeekEnd,
                    }))
                  }
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  End
                </span>
                <input
                  type="date"
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                  value={rangeEnd}
                  onChange={(e) =>
                    setCustomRange((prev) => ({
                      start: prev?.start ?? selectedWeekStart,
                      end: e.target.value,
                    }))
                  }
                />
              </label>

              <Link
                href={customHref}
                className={[
                  "rounded-full px-4 py-2 text-sm font-medium transition",
                  customRangeValid
                    ? "bg-slate-900 text-white hover:bg-slate-800"
                    : "pointer-events-none cursor-not-allowed bg-slate-300 text-slate-600",
                ].join(" ")}
              >
                Open custom range sheet
              </Link>

              <button
                type="button"
                onClick={() => setCustomRange(null)}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Reset to selected week
              </button>
            </div>

            <div className="mt-3 text-xs text-slate-500">
              Selected day from control bar:{" "}
              <span className="font-medium text-slate-700">{selectedWeek}</span>
              {" · "}
              Current selected week:{" "}
              <span className="font-medium text-slate-700">
                {selectedWeekStart} to {selectedWeekEnd}
              </span>
              {customRange ? (
                <>
                  {" · "}
                  Custom draft range:{" "}
                  <span className="font-medium text-slate-700">
                    {rangeStart} to {rangeEnd}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </section>

        <WeeklySheetView />
      </div>
    </main>
  );
}
