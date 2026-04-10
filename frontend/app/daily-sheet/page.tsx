"use client";

import ControlBar from "@/components/control-bar";
import DailySheetView from "@/components/daily-sheet-view";

export default function DailySheetPage() {
  return (
    <main className="min-h-screen bg-slate-100 p-3 text-slate-900 md:p-4">
      <div className="min-w-0 max-w-[1800px] space-y-4 xl:ml-0 xl:mr-auto">
        <ControlBar />

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="text-xl font-bold">Daily Sheet View</h2>
          <p className="mt-1 text-xs text-slate-600">
            Official placement board with inline daily overrides, position mapping, and observed-work review context.
          </p>
        </section>

        <DailySheetView />
      </div>
    </main>
  );
}
