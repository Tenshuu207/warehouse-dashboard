"use client";

import ControlBar from "@/components/control-bar";
import TeamGroupSummary from "@/components/team-group-summary";

export default function AreasPage() {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-3 md:p-4">
      <div className="max-w-[1800px] xl:ml-0 xl:mr-auto space-y-4 min-w-0">
        <ControlBar />

        <section className="rounded-2xl bg-white border shadow-sm p-4">
          <h2 className="text-xl font-bold">Areas</h2>
          <p className="mt-1 text-xs text-slate-600">
            Main area view from enriched daily data, grouped by official team plus observed replenishment role inference.
          </p>
        </section>

        <TeamGroupSummary />
      </div>
    </main>
  );
}
