"use client";

import { useEffect, useState } from "react";
import ControlBar from "@/components/control-bar";
import OverviewEnrichedCore from "@/components/overview-enriched-core";
import WeeklySheetView from "@/components/weekly-sheet-view";
import { useAppState } from "@/lib/app-state";
import { rangeLabel, resolveContextRange } from "@/lib/date-range";

type OverviewMode = "sheet" | "detail";

const STORAGE_KEY = "warehouse-dashboard-overview-mode";

export default function HomePage() {
  const { selectedWeek } = useAppState();
  const [mode, setMode] = useState<OverviewMode>("sheet");
  const [ready, setReady] = useState(false);
  const range = resolveContextRange(selectedWeek, null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "sheet" || saved === "detail") {
        setMode(saved);
      }
    } catch {
      // ignore localStorage issues
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore localStorage issues
    }
  }, [mode, ready]);

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-3 md:p-4">
      <div className="max-w-[1800px] xl:ml-0 xl:mr-auto space-y-4 min-w-0">
        <ControlBar />

        <section className="rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                Operational front door
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                Overview
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Quick access to the active week, primary area drilldowns, receiving snapshot, and operator activity.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Active range
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{rangeLabel(range)}</div>
              </div>

              <button
                type="button"
                onClick={() => setMode("sheet")}
                className={`rounded-xl border px-3 py-2 text-sm font-medium shadow-sm transition ${
                  mode === "sheet"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                Sheet View
              </button>
              <button
                type="button"
                onClick={() => setMode("detail")}
                className={`rounded-xl border px-3 py-2 text-sm font-medium shadow-sm transition ${
                  mode === "detail"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                Summary View
              </button>
            </div>
          </div>
        </section>

        {mode === "sheet" ? (
          <WeeklySheetView dataSource="userls-overview" />
        ) : (
          <OverviewEnrichedCore />
        )}
      </div>
    </main>
  );
}
