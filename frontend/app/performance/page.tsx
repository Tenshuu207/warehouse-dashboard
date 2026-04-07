import PerformanceEnrichedCore from "@/components/performance-enriched-core";
import PerformanceMobileSummary from "@/components/performance-mobile-summary";

export default function PerformancePage() {
  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-950">Performance</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Standards-first performance view. Team results and attention-needed operators come first.
            Full ranking detail stays available below when needed.
          </p>
        </section>

        <div className="mt-6">
          <PerformanceMobileSummary />
        </div>

        <details className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-slate-900">
            Full Performance Detail
          </summary>
          <div className="border-t border-slate-200 px-5 py-5">
            <PerformanceEnrichedCore />
          </div>
        </details>
      </div>
    </main>
  );
}
