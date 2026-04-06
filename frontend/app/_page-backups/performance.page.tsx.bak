"use client";

import { useEffect, useMemo, useState } from "react";
import DashboardNav from "@/components/dashboard-nav";
import PerformanceEnrichedCore from "@/components/performance-enriched-core";
import ControlBar from "@/components/control-bar";
import { useAppState } from "@/lib/app-state";
import { getWeekData, type ResolvedDashboardData } from "@/lib/data-resolver";

function performanceColor(p: number): string {
  if (p >= 110) return "text-green-600";
  if (p >= 90) return "text-amber-600";
  return "text-red-600";
}

export default function PerformancePage() {
  const { selectedWeek, scoringMode } = useAppState();
  const [data, setData] = useState<ResolvedDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const nextData = await getWeekData(selectedWeek);
        if (!cancelled) setData(nextData);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load performance");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [selectedWeek]);

  const operators = useMemo(() => data?.operators ?? [], [data]);

  const operatorPool = useMemo(() => {
    return [...operators]
      .filter((o) => (o.actualMinutes || 0) > 0)
      .sort((a, b) => (b.performanceVsStandard || 0) - (a.performanceVsStandard || 0));
  }, [operators]);

  const scoredOperators = useMemo(() => {
    if (scoringMode === "operational") {
      return operatorPool;
    }

    return operatorPool.filter((o) => !o.excludedFromLeaderboard);
  }, [operatorPool, scoringMode]);

  const excludedOperators = useMemo(() => {
    return [...operators]
      .filter((o) => o.excludedFromLeaderboard)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [operators]);

  const areaPerformance = useMemo(() => {
    const grouped = new Map<
      string,
      {
        area: string;
        operatorCount: number;
        actualMinutes: number;
        standardMinutes: number;
        performance: number;
      }
    >();

    for (const op of scoredOperators) {
      const key =
        scoringMode === "operational"
          ? op.rawDominantArea || op.assignedArea || op.effectivePerformanceArea || "Unassigned"
          : op.effectivePerformanceArea || op.rawDominantArea || op.assignedArea || "Unassigned";

      if (!grouped.has(key)) {
        grouped.set(key, {
          area: key,
          operatorCount: 0,
          actualMinutes: 0,
          standardMinutes: 0,
          performance: 0,
        });
      }

      const row = grouped.get(key)!;
      row.operatorCount += 1;
      row.actualMinutes += op.actualMinutes || 0;
      row.standardMinutes += op.standardMinutes || 0;
    }

    return [...grouped.values()]
      .map((row) => ({
        ...row,
        performance: row.actualMinutes
          ? Number(((row.standardMinutes / row.actualMinutes) * 100).toFixed(2))
          : 0,
      }))
      .sort((a, b) => b.performance - a.performance);
  }, [scoredOperators, scoringMode]);

  const lowestOperators = useMemo(() => {
    return [...scoredOperators]
      .sort((a, b) => (a.performanceVsStandard || 0) - (b.performanceVsStandard || 0));
  }, [scoredOperators]);

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-3 md:p-4">
      <div className="mx-auto max-w-7xl space-y-4 min-w-0 overflow-x-hidden">
        <DashboardNav />
        <ControlBar />

        <section className="rounded-2xl bg-white border shadow-sm p-4 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">Performance</h2>
              <p className="mt-1 text-xs text-slate-600">
                Rankings and area comparisons using the selected scoring mode
              </p>
            </div>

            <div className="text-right text-xs text-slate-500">
              <div>{new Date(selectedWeek + "T00:00:00").toLocaleDateString()}</div>
              <div className="mt-1">
                Mode: <span className="font-medium capitalize">{scoringMode}</span>
              </div>
            </div>
          </div>
        </section>

        {loading && (
          <section className="rounded-2xl bg-white border shadow-sm p-4 text-sm text-slate-600">
            Loading performance...
          </section>
        )}

        {error && (
          <section className="rounded-2xl bg-white border shadow-sm p-4 text-sm text-red-600">
            {error}
          </section>
        )}

        {!loading && !error && (
          <>
            <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              <div className="rounded-2xl bg-white border shadow-sm p-4">
                <div className="text-xs text-slate-500">Operators With Work</div>
                <div className="mt-2 text-2xl font-semibold">{operatorPool.length.toLocaleString()}</div>
              </div>

              <div className="rounded-2xl bg-white border shadow-sm p-4">
                <div className="text-xs text-slate-500">Scored Operators</div>
                <div className="mt-2 text-2xl font-semibold">{scoredOperators.length.toLocaleString()}</div>
              </div>

              <div className="rounded-2xl bg-white border shadow-sm p-4">
                <div className="text-xs text-slate-500">Excluded Operators</div>
                <div className="mt-2 text-2xl font-semibold">{excludedOperators.length.toLocaleString()}</div>
              </div>

              <div className="rounded-2xl bg-white border shadow-sm p-4">
                <div className="text-xs text-slate-500">Area Groups</div>
                <div className="mt-2 text-2xl font-semibold">{areaPerformance.length.toLocaleString()}</div>
              </div>
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white border shadow-sm p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h3 className="text-sm font-semibold">Top Performance</h3>
                  <div className="text-xs text-slate-500">
                    {scoringMode === "performance" ? "Exclusions honored" : "All worked operators"}
                  </div>
                </div>

                <div className="space-y-2">
                  {scoredOperators.slice(0, 10).map((o, idx) => (
                    <div key={`top-${o.userid}`} className="rounded-xl border p-3">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="text-sm font-medium">#{idx + 1} {o.name}</div>
                          <div className="text-xs text-slate-500">
                            {(scoringMode === "performance"
                              ? o.effectivePerformanceArea || o.rawDominantArea || o.assignedArea || "Unassigned"
                              : o.rawDominantArea || o.assignedArea || o.effectivePerformanceArea || "Unassigned")}
                            {o.assignedRole ? ` • ${o.assignedRole}` : ""}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-lg font-semibold ${performanceColor(o.performanceVsStandard || 0)}`}>
                            {(o.performanceVsStandard || 0).toFixed(1)}%
                          </div>
                          <div className="text-xs text-slate-500">{(o.actualMinutes || 0).toFixed(0)} min</div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {scoredOperators.length === 0 && (
                    <div className="text-sm text-slate-500">No scored operators in this mode.</div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-white border shadow-sm p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h3 className="text-sm font-semibold">Lowest Performance</h3>
                  <div className="text-xs text-slate-500">
                    {scoringMode === "performance" ? "Exclusions honored" : "All worked operators"}
                  </div>
                </div>

                <div className="space-y-2">
                  {lowestOperators.slice(0, 10).map((o, idx) => (
                    <div key={`low-${o.userid}`} className="rounded-xl border p-3">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="text-sm font-medium">#{idx + 1} {o.name}</div>
                          <div className="text-xs text-slate-500">
                            {(scoringMode === "performance"
                              ? o.effectivePerformanceArea || o.rawDominantArea || o.assignedArea || "Unassigned"
                              : o.rawDominantArea || o.assignedArea || o.effectivePerformanceArea || "Unassigned")}
                            {o.assignedRole ? ` • ${o.assignedRole}` : ""}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-lg font-semibold ${performanceColor(o.performanceVsStandard || 0)}`}>
                            {(o.performanceVsStandard || 0).toFixed(1)}%
                          </div>
                          <div className="text-xs text-slate-500">{(o.actualMinutes || 0).toFixed(0)} min</div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {lowestOperators.length === 0 && (
                    <div className="text-sm text-slate-500">No scored operators in this mode.</div>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-2xl bg-white border shadow-sm p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="text-sm font-semibold">Area Ranking</h3>
                <div className="text-xs text-slate-500">
                  {scoringMode === "performance" ? "Effective performance area" : "Observed / raw dominant area"}
                </div>
              </div>

              <div className="space-y-2">
                {areaPerformance.map((a, idx) => (
                  <div key={a.area} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium">#{idx + 1} {a.area}</div>
                        <div className="text-xs text-slate-500">{a.operatorCount} operators</div>
                      </div>
                      <div className="text-right">
                        <div className={`text-lg font-semibold ${performanceColor(a.performance)}`}>
                          {a.performance.toFixed(1)}%
                        </div>
                        <div className="text-xs text-slate-500">
                          {a.actualMinutes.toFixed(0)} min
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {areaPerformance.length === 0 && (
                  <div className="text-sm text-slate-500">No area ranking available in this mode.</div>
                )}
              </div>
            </section>

            <section className="rounded-2xl bg-white border shadow-sm p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="text-sm font-semibold">Excluded from Leaderboard</h3>
                <div className="text-xs text-slate-500">
                  {scoringMode === "performance" ? "Excluded from scoring in this mode" : "Visible reference list"}
                </div>
              </div>

              <div className="space-y-2">
                {excludedOperators.length === 0 && (
                  <div className="text-sm text-slate-500">No excluded operators.</div>
                )}

                {excludedOperators.map((o) => (
                  <div key={`excluded-${o.userid}`} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium">{o.name}</div>
                        <div className="text-xs text-slate-500">
                          {o.excludeReason || "Excluded"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-purple-700">Excluded</div>
                        <div className="text-xs text-slate-500">
                          {(o.effectivePerformanceArea || o.rawDominantArea || o.assignedArea || "Unassigned")}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        <PerformanceEnrichedCore />
      </div>
    </main>
  );
}
