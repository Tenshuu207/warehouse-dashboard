"use client";

import { useAppState } from "@/lib/app-state";

function pillClasses(active: boolean): string {
  return active
    ? "rounded-lg border border-slate-900 bg-slate-900 px-3 py-2 text-xs font-medium text-white"
    : "rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700";
}

export default function ControlBar() {
  const {
    selectedWeek,
    setSelectedWeek,
    scoringMode,
    setScoringMode,
  } = useAppState();

  return (
    <section className="rounded-2xl bg-white border shadow-sm p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Date / Week Start</label>
            <input
              type="date"
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 bg-white"
            />
          </div>

          <div>
            <div className="block text-xs text-slate-500 mb-1">Scoring Mode</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setScoringMode("operational")}
                className={pillClasses(scoringMode === "operational")}
              >
                Operational
              </button>
              <button
                type="button"
                onClick={() => setScoringMode("performance")}
                className={pillClasses(scoringMode === "performance")}
              >
                Performance
              </button>
            </div>
          </div>
        </div>

        <div className="text-xs text-slate-500">
          <div>
            Operational = all activity shown as worked.
          </div>
          <div className="mt-1">
            Performance = honors exclusions and performance overrides.
          </div>
        </div>
      </div>
    </section>
  );
}
