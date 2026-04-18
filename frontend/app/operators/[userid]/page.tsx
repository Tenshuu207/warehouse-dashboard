"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import OperatorUserlsTracking from "@/components/operator-userls-tracking";
import ControlBar from "@/components/control-bar";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import ContextBadge from "@/components/shared/ContextBadge";
import SectionBlock from "@/components/shared/SectionBlock";
import DetailDisclosure from "@/components/shared/DetailDisclosure";
import { useAppState } from "@/lib/app-state";
import { rangeHref, rangeLabel, resolveContextRange } from "@/lib/date-range";
import { getWeekData, type ResolvedDashboardData } from "@/lib/data-resolver";
import {
  resolveOperatorIdentity,
  type EmployeeRecord,
  type OperatorDefault,
  type RfMapping,
} from "@/lib/employee-identity";
import { resolveCanonicalAssignedDisplay } from "@/lib/area-labels";

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

function reviewStatusVariant(
  status: string | null | undefined
): "review-status" | "neutral" {
  switch (status) {
    case "reviewed":
    case "pending":
    case "dismissed":
      return "review-status";
    default:
      return "neutral";
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

function flagTone(flag: string): "context" | "review-status" | "neutral" {
  switch (flag) {
    case "missing_raw_manual_assignment":
    case "missing_manual_assignment":
    case "missing_area_mix":
    case "invalid_raw_assigned_area":
    case "invalid_assigned_area":
    case "invalid_raw_assigned_role":
    case "invalid_assigned_role":
    case "invalid_force_area":
      return "review-status";
    case "assigned_area_overridden":
    case "assigned_role_overridden":
    case "performance_area_overridden":
    case "excluded_from_leaderboard":
      return "context";
    default:
      return "neutral";
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

function fmt(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return "—";
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export default function OperatorDetailPage() {
  const { selectedWeek } = useAppState();
  const params = useParams<{ userid: string }>();
  const searchParams = useSearchParams();
  const userid = Array.isArray(params?.userid) ? params.userid[0] : params?.userid;
  const range = resolveContextRange(selectedWeek, searchParams);
  const scopeDate = range.start;

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
          getWeekData(scopeDate),
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
  }, [scopeDate]);

  const operator = useMemo(() => {
    if (!data || !userid) return null;

    const base = (data.operators || []).find((o) => o.userid === userid) || null;
    if (!base) return null;

    const resolved = resolveOperatorIdentity({
      rfUsername: base.userid,
      fallbackName: base.name,
      fallbackTeam:
        base.rawAssignedArea ||
        base.effectiveAssignedArea ||
        base.assignedArea ||
        base.area,
      selectedDate: scopeDate,
      employees,
      mappings,
      defaultTeams: defaults,
    });

    const assignedDisplay = resolveCanonicalAssignedDisplay({
      observedInferred: {
        area: [base.effectiveAssignedArea, base.assignedArea, base.rawAssignedArea],
        role: [base.effectiveAssignedRole, base.assignedRole, base.rawAssignedRole],
      },
      homeDefault: {
        area: resolved.defaultTeam,
      },
    });

    return {
      ...base,
      resolvedName: resolved.displayName,
      assignedDisplay,
    };
  }, [data, userid, scopeDate, employees, mappings, defaults]);

  const rawDiffers = operator
    ? (operator.rawAssignedArea || "") !== (operator.effectiveAssignedArea || "") ||
      (operator.rawAssignedRole || "") !== (operator.effectiveAssignedRole || "")
    : false;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-3 md:p-4">
      <div className="max-w-[1500px] xl:ml-0 xl:mr-auto space-y-4 min-w-0 overflow-x-hidden">
        <ControlBar />

        <SectionBlock
          title=""
          right={<div className="text-right text-xs text-slate-500">{rangeLabel(range)}</div>}
        >
          <div className="text-xs text-slate-500">
            <Link href={rangeHref("/operators", range)} className="hover:underline">
              ← Back to Operators
            </Link>
          </div>

          <PageHeader
            title="Operator Detail"
            subtitle="Replenishment first, assignment and review context below it."
          />
        </SectionBlock>

        {loading && (
          <SectionBlock title="Operator Detail">
            <div className="text-sm text-slate-600">Loading operator detail...</div>
          </SectionBlock>
        )}

        {error && (
          <SectionBlock title="Operator Detail">
            <div className="text-sm text-red-600">{error}</div>
          </SectionBlock>
        )}

        {!loading && !error && !operator && (
          <SectionBlock title="Operator Detail">
            <div className="text-sm text-slate-600">
              Operator not found for userid: {userid}
            </div>
          </SectionBlock>
        )}

        {!loading && !error && operator && (
          <>
            <SectionBlock
              title={operator.resolvedName}
              subtitle={operator.userid}
              right={
                <div className="text-right">
                  <div className="text-xs text-slate-500">Performance</div>
                  <div
                    className={`text-3xl font-semibold ${performanceColor(
                      operator.performanceVsStandard || 0
                    )}`}
                  >
                    {(operator.performanceVsStandard || 0).toFixed(1)}%
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {operator.actualMinutes.toFixed(0)} actual min ·{" "}
                    {operator.standardMinutes.toFixed(0)} standard min
                  </div>
                </div>
              }
            >
              <div className="flex flex-wrap gap-2">
                <ContextBadge variant={reviewStatusVariant(operator.reviewStatus)}>
                  Status: {reviewStatusLabel(operator.reviewStatus)}
                </ContextBadge>

                <ContextBadge variant="home-team">
                  Effective Area: {operator.assignedDisplay.area || "Unassigned"}
                </ContextBadge>

                <ContextBadge variant="observed-role">
                  Effective Role: {operator.assignedDisplay.role || "Unassigned"}
                </ContextBadge>

                <ContextBadge variant="context">
                  Performance Area:{" "}
                  {operator.effectivePerformanceArea || operator.rawDominantArea || "None"}
                </ContextBadge>

                {operator.excludedFromLeaderboard && (
                  <ContextBadge variant="context">Excluded</ContextBadge>
                )}

                {operator.auditFlags.map((flag) => (
                  <ContextBadge key={flag} variant={flagTone(flag)}>
                    {flagLabel(flag)}
                  </ContextBadge>
                ))}
              </div>

              <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
                <StatCard label="Repl Plates">{fmt(operator.replenishmentPlates)}</StatCard>
                <StatCard label="Repl Pieces">{fmt(operator.replenishmentPieces)}</StatCard>
                <StatCard label="Repl PCs/Plate">
                  {fmt(operator.replenishmentPcsPerPlate, 2)}
                </StatCard>
                <StatCard label="Receiving Plates">{fmt(operator.receivingPlates)}</StatCard>
                <StatCard label="Receiving Pieces">{fmt(operator.receivingPieces)}</StatCard>
              </div>

              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                <StatCard label="Putaway Plates">{fmt(operator.putawayPlates)}</StatCard>
                <StatCard label="Letdown Plates">{fmt(operator.letdownPlates)}</StatCard>
                <StatCard label="Restock Plates">{fmt(operator.restockPlates)}</StatCard>
                <StatCard label="Days Reviewed">{fmt(operator.daysReviewed)}</StatCard>
              </div>

              {operator.reviewNotes && (
                <div className="rounded-xl border bg-slate-50 p-3">
                  <div className="mb-1 text-xs font-medium text-slate-500">Review Notes</div>
                  <div className="text-sm text-slate-700">{operator.reviewNotes}</div>
                </div>
              )}

              {operator.excludedFromLeaderboard && (
                <div className="rounded-xl border border-purple-200 bg-purple-50 p-3">
                  <div className="mb-1 text-xs font-medium text-purple-700">
                    Leaderboard Exclusion
                  </div>
                  <div className="text-sm text-purple-800">
                    {operator.excludeReason || "Excluded from leaderboard"}
                  </div>
                </div>
              )}
            </SectionBlock>

            <SectionBlock
              title="Assignment and Review Summary"
              subtitle="Current effective assignment, raw assignment, override context, and review activity."
            >
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <StatCard label="Effective Assignment">
                      {operator.assignedDisplay.area || "Unassigned"} ·{" "}
                      {operator.assignedDisplay.role || "Unassigned"}
                    </StatCard>
                    <StatCard label="Performance Area">
                      {operator.effectivePerformanceArea || operator.rawDominantArea || "None"}
                    </StatCard>
                    <StatCard label="Raw Assignment">
                      {operator.rawAssignedArea || "None"} ·{" "}
                      {operator.rawAssignedRole || "None"}
                    </StatCard>
                    <StatCard label="Overrides">
                      {operator.reviewAssignedAreaOverride || "None"} ·{" "}
                      {operator.reviewAssignedRoleOverride || "None"}
                    </StatCard>
                  </div>

                  {rawDiffers && (
                    <div className="rounded-xl border bg-slate-50 px-3 py-3 text-xs text-slate-600">
                      Effective assignment differs from raw assignment this week.
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatCard label="Source Dates">{String(operator.sourceDates.length)}</StatCard>
                    <StatCard label="Days Reviewed">{String(operator.daysReviewed)}</StatCard>
                    <StatCard label="Days With Status">
                      {String(operator.daysWithReviewStatus)}
                    </StatCard>
                    <StatCard label="Days With Notes">{String(operator.daysWithNotes)}</StatCard>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <StatCard label="Review Status">
                      {reviewStatusLabel(operator.reviewStatus)}
                    </StatCard>
                    <StatCard label="Days Excluded">
                      {String(operator.daysExcludedFromLeaderboard)}
                    </StatCard>
                  </div>
                </div>
              </div>
            </SectionBlock>

            <OperatorUserlsTracking />

            <SectionBlock
              title="Observed Area Mix"
              subtitle="Observed movement context grouped by area."
              right={<div className="text-xs text-slate-500">{operator.areaMix.length} rows</div>}
            >
              <div className="space-y-3">
                {operator.areaMix.length === 0 && (
                  <div className="text-sm text-slate-500">
                    No observed area mix for this operator.
                  </div>
                )}

                {operator.areaMix.map((mix) => (
                  <div
                    key={`${operator.userid}-${mix.areaCode}-${mix.areaName}`}
                    className="rounded-xl border p-3"
                  >
                    <div className="text-sm font-medium">{mix.areaName}</div>
                    <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-3">
                      <StatCard label="Letdown">{fmt(mix.letdownMoves)}</StatCard>
                      <StatCard label="Putaway">{fmt(mix.putawayMoves)}</StatCard>
                      <StatCard label="Restock">{fmt(mix.restockMoves)}</StatCard>
                      <StatCard label="Actual Min">{fmt(mix.actualMinutes)}</StatCard>
                      <StatCard label="Total Moves">
                        {fmt(
                          mix.totalMoves ||
                            mix.letdownMoves + mix.putawayMoves + mix.restockMoves
                        )}
                      </StatCard>
                    </div>
                  </div>
                ))}
              </div>
            </SectionBlock>

            <DetailDisclosure
              title="Supporting Audit Detail"
              meta={`${operator.sourceDates.length} source dates · ${operator.auditFlags.length} flags`}
            >
              <div className="space-y-4">
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                  <SeenList title="Raw Areas Seen" values={operator.rawAssignedAreasSeen} />
                  <SeenList
                    title="Effective Areas Seen"
                    values={operator.effectiveAssignedAreasSeen}
                  />
                  <SeenList
                    title="Performance Areas Seen"
                    values={operator.effectivePerformanceAreasSeen}
                  />
                  <SeenList title="Raw Roles Seen" values={operator.rawAssignedRolesSeen} />
                  <SeenList
                    title="Effective Roles Seen"
                    values={operator.effectiveAssignedRolesSeen}
                  />

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
                </div>
              </div>
            </DetailDisclosure>
          </>
        )}
      </div>
    </main>
  );
}
