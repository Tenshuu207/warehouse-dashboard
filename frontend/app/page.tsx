"use client";

import Link from "next/link";
import { useState } from "react";
import DashboardNav from "@/components/dashboard-nav";
import ControlBar from "@/components/control-bar";
import OverviewEnrichedCore from "@/components/overview-enriched-core";
import WeeklySheetView from "@/components/weekly-sheet-view";

type OverviewMode = "sheet" | "detail";

export default function HomePage() {
  const [mode, setMode] = useState<OverviewMode>("sheet");

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-3 md:p-4">
      <div className="max-w-[1800px] xl:ml-0 xl:mr-auto space-y-4 min-w-0">
        <DashboardNav />
        <ControlBar />

        <section className="rounded-2xl bg-white border shadow-sm p-4 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">Overview</h2>
              <p className="mt-1 text-xs text-slate-600">
                Sheet-first operational command view with enriched detail still available.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMode("sheet")}
                className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                  mode === "sheet"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Sheet View
              </button>
              <button
                type="button"
                onClick={() => setMode("detail")}
                className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                  mode === "detail"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Detail View
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/weekly-sheet"
              className="rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Weekly Sheet
            </Link>
            <Link
              href="/daily-sheet"
              className="rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Daily Sheet
            </Link>
            <Link
              href="/areas"
              className="rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Areas
            </Link>
            <Link
              href="/operators"
              className="rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Operators
            </Link>
            <Link
              href="/assignment-review"
              className="rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Assignment Review
            </Link>
          </div>
        </section>

        {mode === "sheet" ? <WeeklySheetView /> : <OverviewEnrichedCore />}
      </div>
    </main>
  );
}
