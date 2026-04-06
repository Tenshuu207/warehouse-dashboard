"use client";

import DashboardNav from "@/components/dashboard-nav";
import ControlBar from "@/components/control-bar";
import ReceivingEnrichedCore from "@/components/receiving-enriched-core";

export default function ReceivingPage() {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-3 md:p-4">
      <div className="max-w-[1800px] xl:ml-0 xl:mr-auto space-y-4 min-w-0">
        <DashboardNav />
        <ControlBar />

        <section className="rounded-2xl bg-white border shadow-sm p-4">
          <h2 className="text-xl font-bold">Receiving</h2>
          <p className="mt-1 text-xs text-slate-600">
            Main receiving view from enriched daily data, including resolved operator names and destination mix.
          </p>
        </section>

        <ReceivingEnrichedCore />
      </div>
    </main>
  );
}
