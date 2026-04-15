"use client";

import { useEffect, useState } from "react";
import ControlBar from "@/components/control-bar";
import OverviewEnrichedCore from "@/components/overview-enriched-core";
import WeeklySheetView from "@/components/weekly-sheet-view";

type OverviewMode = "summary" | "sheet";

const STORAGE_KEY = "warehouse-dashboard-overview-mode";

export default function HomePage() {
  const [mode, setMode] = useState<OverviewMode>("summary");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "summary" || saved === "sheet") {
        setMode(saved);
      } else if (saved === "detail") {
        setMode("sheet");
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

        <section className="rounded-2xl bg-white border shadow-sm p-4 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">Overview</h2>
              <p className="mt-1 text-xs text-slate-600">
                Five-metric command summary with sheet detail still available.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMode("summary")}
                className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                  mode === "summary"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Summary
              </button>
              <button
                type="button"
                onClick={() => setMode("sheet")}
                className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                  mode === "sheet"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Sheet Detail
              </button>
            </div>
          </div>
        </section>

        {mode === "summary" ? (
          <OverviewEnrichedCore />
        ) : (
          <WeeklySheetView dataSource="userls-overview" />
        )}
      </div>
    </main>
  );
}
