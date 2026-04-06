"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import DashboardNav from "@/components/dashboard-nav";
import OperatorUserlsTracking from "@/components/operator-userls-tracking";
import ControlBar from "@/components/control-bar";
import { useAppState } from "@/lib/app-state";
import { getWeekData, type ResolvedDashboardData } from "@/lib/data-resolver";
import {
  resolveOperatorIdentity,
  type EmployeeRecord,
  type OperatorDefault,
  type RfMapping,
} from "@/lib/employee-identity";

function performanceColor(p: number): string {
  if (p >= 110) return "text-green-600";
  if (p >= 90) return "text-amber-600";
  return "text-red-600";
}

function reviewStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "reviewed":
      return "Reviewed";
    case "pending":
      return "Pending";
    case "dismissed":
      return "Dismissed";
    default:
      return "Unreviewed";
  }
}

function reviewStatusClasses(status: string | null | undefined): string {
  switch (status) {
    case "reviewed":
      return "bg-green-100 text-green-800 border-green-200";
    case "pending":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "dismissed":
      return "bg-slate-100 text-slate-700 border-slate-200";
    default:
      return "bg-slate-50 text-slate-500 border-slate-200";
  }
}

function flagLabel(flag: string): string {
  switch (flag) {
    case "missing_raw_manual_assignment":
      return "Missing Raw Assignment";
    case "missing_manual_assignment":
      return "Missing Assignment";
    case "missing_area_mix":
      return "Missing Area Mix";
    case "assigned_area_overridden":
      return "Assigned Area Override";
    case "assigned_role_overridden":
      return "Assigned Role Override";
    case "performance_area_overridden":
      return "Performance Area Override";
    case "invalid_raw_assigned_area":
      return "Invalid Raw Area";
    case "invalid_assigned_area":
      return "Invalid Assigned Area";
    case "invalid_raw_assigned_role":
      return "Invalid Raw Role";
    case "invalid_assigned_role":
      return "Invalid Assigned Role";
    case "invalid_force_area":
      return "Invalid Force Area";
    case "excluded_from_leaderboard":
      return "Excluded";
    default:
      return flag;
  }
}

function flagClasses(flag: string): string {
  switch (flag) {
    case "missing_raw_manual_assignment":
    case "missing_manual_assignment":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "missing_area_mix":
      return "bg-red-100 text-red-800 border-red-200";
    case "assigned_area_overridden":
    case "assigned_role_overridden":
    case "performance_area_overridden":
      return "bg-purple-100 text-purple-800 border-purple-200";
    case "excluded_from_leaderboard":
      return "bg-blue-100 text-blue-800 border-blue-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

function SeenList({
  title,
  values,
}: {
  title: string;
  values: string[];
}) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-xs text-slate-500">{title}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {values.length === 0 ? (
          <span className="text-sm text-slate-400">None</span>
        ) : (
          values.map((value) => (
            <span
              key={value}
              className="rounded-full border bg-slate-50 px-2 py-0.5 text-xs text-slate-700"
            >
              {value}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function StatCell({
  label,
  value,
  subtext,
  valueClassName = "",
}: {
  label: string;
  value: string;
  subtext?: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border bg-white p-4 text-center">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${valueClassName}`}>{value}</div>
      {subtext ? <div className="mt-1 text-[11px] text-slate-500">{subtext}</div> : null}
    </div>
  );
}

export default function OperatorDetailPage() {
  const { selectedWeek } = useAppState();
  const params = useParams<{ userid: string }>();
  const userid = Array.isArray(params?.userid) ? params.userid[0] : params?.userid;

  const [data, setData] = useState<ResolvedDashboardData | null>(null);
  const [defaults, setDefaults] = useState<Record<string, OperatorDefault>>({});
  const [employees, setEmployees] = useState<Record<string, EmployeeRecord>>({});
  const [mappings, setMappings] = useState<RfMapping[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const [nextData, defaultsRes, employeesRes, mappingsRes] = await Promise.all([
          getWeekData(selectedWeek),
          fetch("/api/operator-defaults", { cache: "no-store" }),
          fetch("/api/employees", { cache: "no-store" }),
          fetch("/api/rf-mappings", { cache: "no-store" }),
        ]);

        const defaultsJson = defaultsRes.ok ? await defaultsRes.json() : { operators: {} };
        const employeesJson = employeesRes.ok ? await employeesRes.json() : { employees: {} };
        const mappingsJson = mappingsRes.ok ? await mappingsRes.json() : { mappings: [] };

        if (!cancelled) {
          setData(nextData);
          setDefaults(defaultsJson.operators || {});
          setEmployees(employeesJson.employees || {});
          setMappings(Array.isArray(mappingsJson.mappings) ? mappingsJson.mappings : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load operator detail");
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

  const operator = useMemo(() => {
    if (!data || !userid) return null;
    const base = (data.operators || []).find((o) => o.userid === userid) || null;
    if (!base) return null;

    const resolved = resolveOperatorIdentity({
      rfUsername: base.userid,
      fallbackName: base.name,
      fallbackTeam: base.rawAssignedArea || base.effectiveAssignedArea || base.assignedArea || base.area,
      selectedDate: selectedWeek,
      employees,
      mappings,
      defaultTeams: defaults,
    });

    return {
      ...base,
      resolvedName: resolved.displayName,
    };
  }, [data, userid, selectedWeek, employees, mappings, defaults]);

  const rawDiffers = operator
    ? (operator.rawAssignedArea || "") !== (operator.effectiveAssignedArea || "") ||
      (operator.rawAssignedRole || "") !== (operator.effectiveAssignedRole || "")
    : false;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-3 md:p-4">
      <div className="max-w-[1500px] xl:ml-0 xl:mr-auto space-y-4 min-w-0 overflow-x-hidden">
        <DashboardNav />
        <ControlBar />

        <section className="rounded-2xl bg-white border shadow-sm p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs text-slate-500 mb-2">
                <Link href="/operators" className="hover:underline">
                  ← Back to Operators
                </Link>
              </div>
              <h2 className="text-xl font-bold">Operator Detail</h2>
              <p className="mt-1 text-xs text-slate-600">
                Replenishment first, assignment and review context below it.
              </p>
            </div>

            <div className="text-xs text-slate-500">{selectedWeek}</div>
          </div>
        </section>

        {loading && (
          <section className="rounded-2xl bg-white border shadow-sm p-4 text-sm text-slate-600">
            Loading operator detail...
          </section>
        )}

        {error && (
          <section className="rounded-2xl bg-white border shadow-sm p-4 text-sm text-red-600">
            {error}
          </section>
        )}

        {!loading && !error && !operator && (
          <section className="rounded-2xl bg-white border shadow-sm p-4 text-sm text-slate-600">
            Operator not found for userid: {userid}
          </section>
        )}

        {!loading && !error && operator && (
          <>
            <section className="rounded-2xl bg-white border shadow-sm p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <div>
                    <div className="text-2xl font-semibold">{operator.resolvedName}</div>
                    <div className="mt-1 text-sm text-slate-500">{operator.userid}</div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${reviewStatusClasses(operator.reviewStatus)}`}>
                      {reviewStatusLabel(operator.reviewStatus)}
                    </span>

                    {operator.excludedFromLeaderboard && (
                      <span className="rounded-full border px-2.5 py-1 text-xs font-medium bg-purple-100 text-purple-800 border-purple-200">
                        Excluded
                      </span>
                    )}

                    {operator.auditFlags.map((flag) => (
                      <span
                        key={flag}
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium ${flagClasses(flag)}`}
                      >
                        {flagLabel(flag)}
                      </span>
                    ))}
                  </div>

                  <div className="text-sm">
                    <span className="text-slate-500">Effective:</span>{" "}
                    <span className="font-semibold">
                      {operator.effectiveAssignedArea || "Unassigned"} · {operator.effectiveAssignedRole || "Unassigned"}
                    </span>
                  </div>

                  <div className="text-xs text-slate-500">
                    Performance area: {operator.effectivePerformanceArea || operator.rawDominantArea || "None"}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs text-slate-500">Performance</div>
                  <div className={`text-3xl font-semibold ${performanceColor(operator.performanceVsStandard || 0)}`}>
                    {(operator.performanceVsStandard || 0).toFixed(1)}%
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {operator.actualMinutes.toFixed(0)} actual min · {operator.standardMinutes.toFixed(0)} standard min
                  </div>
                </div>
              </div>

              {operator.reviewNotes && (
                <div className="mt-4 rounded-xl border bg-slate-50 p-3">
                  <div className="text-xs font-medium text-slate-500 mb-1">Review Notes</div>
                  <div className="text-sm text-slate-700">{operator.reviewNotes}</div>
                </div>
              )}

              {operator.excludedFromLeaderboard && (
                <div className="mt-3 rounded-xl border border-purple-200 bg-purple-50 p-3">
                  <div className="text-xs font-medium text-purple-700 mb-1">Leaderboard Exclusion</div>
                  <div className="text-sm text-purple-800">
                    {operator.excludeReason || "Excluded from leaderboard"}
                  </div>
                </div>
              )}
            </section>

            <section className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <StatCell label="Replenishment Plates" value={operator.replenishmentPlates.toLocaleString()} />
                <StatCell label="Replenishment Pieces" value={operator.replenishmentPieces.toLocaleString()} />
                <StatCell label="Replenishment PCs/Plate" value={operator.replenishmentPcsPerPlate.toFixed(2)} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <StatCell label="Receiving Plates" value={operator.receivingPlates.toLocaleString()} />
                <StatCell label="Receiving Pieces" value={operator.receivingPieces.toLocaleString()} />
              </div>
            </section>

            <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-2xl bg-white border shadow-sm p-4">
                <h3 className="text-sm font-semibold">Putaway</h3>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <StatCell label="Plates" value={operator.putawayPlates.toLocaleString()} />
                  <StatCell label="Pieces" value={operator.putawayPieces.toLocaleString()} />
                  <StatCell label="PCs/Plate" value={operator.putawayPcsPerPlate.toFixed(2)} />
                </div>
              </div>

              <div className="rounded-2xl bg-white border shadow-sm p-4">
                <h3 className="text-sm font-semibold">Letdown</h3>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <StatCell label="Plates" value={operator.letdownPlates.toLocaleString()} />
                  <StatCell label="Pieces" value={operator.letdownPieces.toLocaleString()} />
                  <StatCell label="PCs/Plate" value={operator.letdownPcsPerPlate.toFixed(2)} />
                </div>
              </div>

              <div className="rounded-2xl bg-white border shadow-sm p-4">
                <h3 className="text-sm font-semibold">Restock</h3>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <StatCell label="Plates" value={operator.restockPlates.toLocaleString()} />
                  <StatCell label="Pieces" value={operator.restockPieces.toLocaleString()} />
                  <StatCell label="PCs/Plate" value={operator.restockPcsPerPlate.toFixed(2)} />
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white border shadow-sm p-4">
                <h3 className="text-sm font-semibold">Assignment</h3>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl border bg-slate-50 px-3 py-2.5">
                    <div className="text-xs text-slate-500">Effective Assignment</div>
                    <div className="mt-1 text-center text-sm font-semibold">
                      {operator.effectiveAssignedArea || "Unassigned"} · {operator.effectiveAssignedRole || "Unassigned"}
                    </div>
                  </div>

                  <div className="rounded-xl border bg-slate-50 px-3 py-2.5">
                    <div className="text-xs text-slate-500">Performance Area</div>
                    <div className="mt-1 text-center text-sm font-semibold">
                      {operator.effectivePerformanceArea || operator.rawDominantArea || "None"}
                    </div>
                  </div>

                  <div className="rounded-xl border bg-slate-50 px-3 py-2.5">
                    <div className="text-xs text-slate-500">Raw Assignment</div>
                    <div className="mt-1 text-center text-sm font-semibold">
                      {operator.rawAssignedArea || "None"} · {operator.rawAssignedRole || "None"}
                    </div>
                  </div>

                  <div className="rounded-xl border bg-slate-50 px-3 py-2.5">
                    <div className="text-xs text-slate-500">Overrides</div>
                    <div className="mt-1 text-center text-sm font-semibold">
                      {operator.reviewAssignedAreaOverride || "None"} · {operator.reviewAssignedRoleOverride || "None"}
                    </div>
                  </div>
                </div>

                {rawDiffers && (
                  <div className="mt-3 text-xs text-slate-500">
                    Effective assignment differs from raw assignment this week.
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-white border shadow-sm p-4">
                <h3 className="text-sm font-semibold">Review Activity</h3>

                <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCell label="Source Dates" value={String(operator.sourceDates.length)} />
                  <StatCell label="Days Reviewed" value={String(operator.daysReviewed)} />
                  <StatCell label="Days With Status" value={String(operator.daysWithReviewStatus)} />
                  <StatCell label="Days With Notes" value={String(operator.daysWithNotes)} />
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl border bg-slate-50 px-3 py-2.5">
                    <div className="text-xs text-slate-500">Review Status</div>
                    <div className="mt-1 text-center text-sm font-semibold">{reviewStatusLabel(operator.reviewStatus)}</div>
                  </div>
                  <div className="rounded-xl border bg-slate-50 px-3 py-2.5">
                    <div className="text-xs text-slate-500">Days Excluded</div>
                    <div className="mt-1 text-center text-sm font-semibold">{operator.daysExcludedFromLeaderboard}</div>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl bg-white border shadow-sm p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="text-sm font-semibold">Observed Area Mix</h3>
                <div className="text-xs text-slate-500">{operator.areaMix.length} rows</div>
              </div>

              <div className="space-y-2">
                {operator.areaMix.length === 0 && (
                  <div className="text-sm text-slate-500">No observed area mix for this operator.</div>
                )}

                {operator.areaMix.map((mix) => (
                  <div
                    key={`${operator.userid}-${mix.areaCode}-${mix.areaName}`}
                    className="rounded-xl border p-3"
                  >
                    <div className="text-sm font-medium">{mix.areaName}</div>
                    <div className="mt-2 grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                      <div>
                        <div className="text-xs text-slate-500">Letdown</div>
                        <div className="font-semibold">{mix.letdownMoves.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Putaway</div>
                        <div className="font-semibold">{mix.putawayMoves.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Restock</div>
                        <div className="font-semibold">{mix.restockMoves.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Actual Min</div>
                        <div className="font-semibold">{mix.actualMinutes.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Total Moves</div>
                        <div className="font-semibold">
                          {(mix.totalMoves || (mix.letdownMoves + mix.putawayMoves + mix.restockMoves)).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-3 gap-3">
              <SeenList title="Raw Areas Seen" values={operator.rawAssignedAreasSeen} />
              <SeenList title="Effective Areas Seen" values={operator.effectiveAssignedAreasSeen} />
              <SeenList title="Performance Areas Seen" values={operator.effectivePerformanceAreasSeen} />
              <SeenList title="Raw Roles Seen" values={operator.rawAssignedRolesSeen} />
              <SeenList title="Effective Roles Seen" values={operator.effectiveAssignedRolesSeen} />
              <div className="rounded-xl border p-3">
                <div className="text-xs text-slate-500">Source Dates</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {operator.sourceDates.length === 0 ? (
                    <span className="text-sm text-slate-400">None</span>
                  ) : (
                    operator.sourceDates.map((date) => (
                      <span
                        key={date}
                        className="rounded-full border bg-slate-50 px-2 py-0.5 text-xs text-slate-700"
                      >
                        {date}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </section>
          </>
        )}

        <OperatorUserlsTracking />
      </div>
    </main>
  );
}
