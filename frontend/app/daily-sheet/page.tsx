"use client";

import ControlBar from "@/components/control-bar";
import DailySheetView from "@/components/daily-sheet-view";

export default function DailySheetPage() {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-3 md:p-4">
      <div className="max-w-[1800px] xl:ml-0 xl:mr-auto space-y-4 min-w-0">
        <ControlBar />

        <section className="rounded-2xl bg-white border shadow-sm p-4">
          <h2 className="text-xl font-bold">Daily Sheet View</h2>
          <p className="mt-1 text-xs text-slate-600">
            Spreadsheet-style daily operational scoreboard using current enriched daily data.
          </p>
        </section>

        <DailySheetView />
      </div>
    </main>
  );
}
