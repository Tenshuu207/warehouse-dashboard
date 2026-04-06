"use client";

import DashboardNav from "@/components/dashboard-nav";
import ControlBar from "@/components/control-bar";
import WeeklySheetView from "@/components/weekly-sheet-view";

export default function WeeklySheetPage() {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-3 md:p-4">
      <div className="max-w-[1800px] xl:ml-0 xl:mr-auto space-y-4 min-w-0">
        <DashboardNav />
        <ControlBar />

        <section className="rounded-2xl bg-white border shadow-sm p-4">
          <h2 className="text-xl font-bold">Weekly Sheet View</h2>
          <p className="mt-1 text-xs text-slate-600">
            Spreadsheet-style operational scoreboard using current enriched weekly data.
          </p>
        </section>

        <WeeklySheetView />
      </div>
    </main>
  );
}
