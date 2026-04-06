"use client";

import DashboardNav from "@/components/dashboard-nav";
import ControlBar from "@/components/control-bar";
import OverviewEnrichedCore from "@/components/overview-enriched-core";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-3 md:p-4">
      <div className="max-w-[1800px] xl:ml-0 xl:mr-auto space-y-4 min-w-0">
        <DashboardNav />
        <ControlBar />

        <section className="rounded-2xl bg-white border shadow-sm p-4">
          <h2 className="text-xl font-bold">Overview</h2>
          <p className="mt-1 text-xs text-slate-600">
            Main overview from enriched daily data, grouped teams, observed replenishment roles, and receiving destination context.
          </p>
        </section>

        <OverviewEnrichedCore />
      </div>
    </main>
  );
}
