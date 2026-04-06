"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardNav from "@/components/dashboard-nav";
import ControlBar from "@/components/control-bar";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import ContextBadge from "@/components/shared/ContextBadge";
import DetailDisclosure from "@/components/shared/DetailDisclosure";
import SectionBlock from "@/components/shared/SectionBlock";
import { useAppState } from "@/lib/app-state";
import { getWeekData, type ResolvedDashboardData } from "@/lib/data-resolver";
import type {
  EmployeeRecord,
  OperatorDefault,
  RfMapping,
} from "@/lib/employee-identity";
import {
  buildAssignmentReviewRow,
  type AssignmentOperator,
} from "@/lib/assignment-confidence";

type EmployeesResponse = {
  employees: Record<string, EmployeeRecord>;
  validTeams?: string[];
};

type DefaultsResponse = {
  operators: Record<string, OperatorDefault>;
};

type MappingsResponse = {
  mappings: RfMapping[];
};

type AssignmentReviewState = {
  status: "pending" | "resolved" | "ignored";
  updatedAt: string;
  assignedArea?: string | null;
  note?: string | null;
};

type AssignmentReviewStateResponse = {
  date: string;
  states: Record<string, AssignmentReviewState>;
};

type TrackingAreaBucket = {
  areaCode?: string | null;
  receivingPlates?: number;
  receivingPieces?: number;
  replenishmentNoRecvPlates?: number;
  replenishmentNoRecvPieces?: number;
};

type UserlsTracking = {
  present?: boolean;
  receivingPlates?: number;
  receivingPieces?: number;
  replenishmentNoRecvPlates?: number;
  replenishmentNoRecvPieces?: number;
  primaryReplenishmentAreaCode?: string | null;
  primaryReplenishmentShare?: number | null;
  primaryReplenishmentRole?: string | null;
  primaryReplenishmentRoleShare?: number | null;
  areaBuckets?: TrackingAreaBucket[];
};

type DailyEnrichedResponse = {
  operators?: Array<{
    userid: string;
    userlsTracking?: UserlsTracking;
  }>;
};

type AssignmentReviewDisplayRow = ReturnType<typeof buildAssignmentReviewRow> & {
  assignmentStatus: "pending" | "resolved" | "ignored";
  reviewedArea?: string | null;
  reviewedAt?: string | null;
  userlsTracking?: UserlsTracking | null;
};

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function fmt(value: number | null | undefined): string {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function buildReceivingMixSummary(tracking?: UserlsTracking | null): string | null {
  if (!tracking?.areaBuckets?.length) return null;

  const totalPieces = Number(tracking.receivingPieces || 0);
  const totalPlates = Number(tracking.receivingPlates || 0);

  const ranked = [...tracking.areaBuckets]
    .filter(
      (bucket) =>
        Number(bucket.receivingPieces || 0) > 0 || Number(bucket.receivingPlates || 0) > 0
    )
    .sort((a, b) => {
      const pieceDiff = Number(b.receivingPieces || 0) - Number(a.receivingPieces || 0);
      if (pieceDiff !== 0) return pieceDiff;
      return Number(b.receivingPlates || 0) - Number(a.receivingPlates || 0);
    })
    .slice(0, 3);

  if (!ranked.length) return null;

  return ranked
    .map((bucket) => {
      const area = bucket.areaCode || "?";
      if (totalPieces > 0) {
        const share = (Number(bucket.receivingPieces || 0) / totalPieces) * 100;
        return `${area} (${share.toFixed(0)}%)`;
      }
      if (totalPlates > 0) {
        const share = (Number(bucket.receivingPlates || 0) / totalPlates) * 100;
        return `${area} (${share.toFixed(0)}%)`;
      }
      return area;
    })
    .join(", ");
}

function statusTone(status: "pending" | "resolved" | "ignored"): string {
  switch (status) {
    case "resolved":
      return "text-green-700";
    case "ignored":
      return "text-slate-500";
    default:
      return "text-amber-700";
  }
}

function statusLabel(status: "pending" | "resolved" | "ignored"): string {
  switch (status) {
    case "resolved":
      return "Resolved";
    case "ignored":
      return "Ignored";
    default:
      return "Pending";
  }
}

export default function AssignmentReviewPage() {
  const { selectedWeek } = useAppState();

  const [data, setData] = useState<ResolvedDashboardData | null>(null);
  const [employees, setEmployees] = useState<Record<string, EmployeeRecord>>({});
  const [defaults, setDefaults] = useState<Record<string, OperatorDefault>>({});
  const [mappings, setMappings] = useState<RfMapping[]>([]);
  const [validTeams, setValidTeams] = useState<string[]>(["Other"]);
  const [reviewStates, setReviewStates] = useState<Record<string, AssignmentReviewState>>({});
  const [userlsByUser, setUserlsByUser] = useState<Record<string, UserlsTracking>>({});
  const [loading, setLoading] = useState(true);
  const [savingUser, setSavingUser] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [onlyNeedsReview, setOnlyNeedsReview] = useState(true);

  const refresh = useCallback(async () => {
    const [
      weekData,
      employeesRes,
      defaultsRes,
      mappingsRes,
      stateRes,
      enrichedRes,
    ] = await Promise.all([
      getWeekData(selectedWeek),
      fetch("/api/employees", { cache: "no-store" }),
      fetch("/api/operator-defaults", { cache: "no-store" }),
      fetch("/api/rf-mappings", { cache: "no-store" }),
      fetch(`/api/assignment-review-state?date=${selectedWeek}`, { cache: "no-store" }),
      fetch(`/api/dashboard/daily-enriched?date=${selectedWeek}`, { cache: "no-store" }),
    ]);

    const employeesJson: EmployeesResponse = employeesRes.ok
      ? await employeesRes.json()
      : { employees: {}, validTeams: ["Other"] };

    const defaultsJson: DefaultsResponse = defaultsRes.ok
      ? await defaultsRes.json()
      : { operators: {} };

    const mappingsJson: MappingsResponse = mappingsRes.ok
      ? await mappingsRes.json()
      : { mappings: [] };

    const stateJson: AssignmentReviewStateResponse = stateRes.ok
      ? await stateRes.json()
      : { date: selectedWeek, states: {} };

    const enrichedJson: DailyEnrichedResponse = enrichedRes.ok
      ? await enrichedRes.json()
      : { operators: [] };

    const nextUserlsByUser: Record<string, UserlsTracking> = {};
    for (const op of enrichedJson.operators || []) {
      if (op?.userid) {
        nextUserlsByUser[op.userid] = op.userlsTracking || {};
      }
    }

    setData(weekData);
    setEmployees(employeesJson.employees || {});
    setDefaults(defaultsJson.operators || {});
    setMappings(Array.isArray(mappingsJson.mappings) ? mappingsJson.mappings : []);
    setReviewStates(stateJson.states || {});
    setUserlsByUser(nextUserlsByUser);
    setValidTeams(
      Array.isArray(employeesJson.validTeams) && employeesJson.validTeams.length
        ? employeesJson.validTeams
        : ["Other"]
    );
  }, [selectedWeek]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        setMessage(null);
        await refresh();
        if (!cancelled) setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load assignment review");
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const operators = useMemo(
    () => ((data?.operators ?? []) as unknown as AssignmentOperator[]),
    [data]
  );

  const rows = useMemo<AssignmentReviewDisplayRow[]>(() => {
    return operators
      .map((operator) => {
        const base = buildAssignmentReviewRow({
          operator,
          selectedDate: selectedWeek,
          validTeams,
          employees,
          mappings,
          defaultTeams: defaults,
        });

        const state = reviewStates[base.userid];

        return {
          ...base,
          assignmentStatus: state?.status || "pending",
          reviewedArea: state?.assignedArea || null,
          reviewedAt: state?.updatedAt || null,
          userlsTracking: userlsByUser[base.userid] || null,
        };
      })
      .sort((a, b) => a.resolvedName.localeCompare(b.resolvedName));
  }, [operators, selectedWeek, validTeams, employees, mappings, defaults, reviewStates, userlsByUser]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (onlyNeedsReview && (!row.needsReview || row.assignmentStatus !== "pending")) {
        return false;
      }

      if (!q) return true;

      const receivingMix = buildReceivingMixSummary(row.userlsTracking);

      return (
        row.observedName.toLowerCase().includes(q) ||
        row.resolvedName.toLowerCase().includes(q) ||
        row.userid.toLowerCase().includes(q) ||
        (row.employeeId || "").toLowerCase().includes(q) ||
        (row.employeeDefaultTeam || "").toLowerCase().includes(q) ||
        (row.suggestedArea || "").toLowerCase().includes(q) ||
        (row.currentRole || "").toLowerCase().includes(q) ||
        row.reviewReason.toLowerCase().includes(q) ||
        (row.userlsTracking?.primaryReplenishmentRole || "").toLowerCase().includes(q) ||
        (row.userlsTracking?.primaryReplenishmentAreaCode || "").toLowerCase().includes(q) ||
        (receivingMix || "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, onlyNeedsReview]);

  const stats = useMemo(() => {
    const active = rows.filter((row) => row.needsReview && row.assignmentStatus === "pending").length;
    const resolved = rows.filter((row) => row.assignmentStatus === "resolved").length;
    const ignored = rows.filter((row) => row.assignmentStatus === "ignored").length;
    const clear = rows.length - active - resolved - ignored;
    const observedMismatch = rows.filter(
      (row) => row.suggestedArea && row.currentAssignedArea !== row.suggestedArea
    ).length;
    const receivingContext = rows.filter((row) => buildReceivingMixSummary(row.userlsTracking)).length;

    return {
      total: rows.length,
      active,
      resolved,
      ignored,
      clear,
      observedMismatch,
      receivingContext,
    };
  }, [rows]);

  async function saveState(
    userid: string,
    status: "pending" | "resolved" | "ignored",
    assignedArea?: string
  ) {
    const res = await fetch("/api/assignment-review-state", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        date: selectedWeek,
        userid,
        status,
        ...(assignedArea !== undefined ? { assignedArea } : {}),
      }),
    });

    const body = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(body?.error || body?.details || "Assignment review state save failed");
    }
  }

  async function applyAssignedArea(userid: string, assignedArea: string, label: string) {
    try {
      setSavingUser(userid);
      setError(null);
      setMessage(null);

      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: selectedWeek,
          userid,
          assignedArea,
        }),
      });

      const body = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(body?.error || body?.details || "Save failed");
      }

      await saveState(userid, "resolved", assignedArea);
      await refresh();
      setMessage(`${label} applied for ${userid}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingUser(null);
    }
  }

  async function markStatus(userid: string, status: "pending" | "ignored") {
    try {
      setSavingUser(userid);
      setError(null);
      setMessage(null);

      await saveState(userid, status);
      await refresh();
      setMessage(`Assignment review status set to ${status} for ${userid}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingUser(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-3 md:p-4">
      <div className="max-w-[1800px] xl:ml-0 xl:mr-auto space-y-4 min-w-0">
        <DashboardNav />
        <ControlBar />

        <SectionBlock
          title=""
          right={<div className="text-right text-xs text-slate-500">{selectedWeek}</div>}
        >
          <PageHeader
            title="Assignment Review"
            subtitle="Workflow-first review queue using home team, observed team, observed role, and receiving destination context."
          />

          <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
            <StatCard label="Operators">{stats.total}</StatCard>
            <StatCard label="Active Review">{stats.active}</StatCard>
            <StatCard label="Observed Mismatch">{stats.observedMismatch}</StatCard>
            <StatCard label="Receiving Context">{stats.receivingContext}</StatCard>
            <StatCard label="Resolved / Ignored">
              {stats.resolved + stats.ignored}
            </StatCard>
          </div>
        </SectionBlock>

        {loading && (
          <SectionBlock title="Assignment Review Queue">
            <div className="text-sm text-slate-600">Loading assignment review...</div>
          </SectionBlock>
        )}

        {!loading && (
          <SectionBlock
            title="Review Queue"
            subtitle="Resolve mismatches using assignment context first. Receiving mix is shown as supporting context, not automatic home team truth."
          >
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search observed name, employee, RF username, role, team, observed role, or receiving mix"
                className="min-w-[320px] flex-1 rounded-xl border px-3 py-2"
              />
              <label className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={onlyNeedsReview}
                  onChange={(e) => setOnlyNeedsReview(e.target.checked)}
                />
                <span>Only show active review</span>
              </label>
            </div>

            {message && (
              <div className="text-xs rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-green-700">
                {message}
              </div>
            )}

            {error && (
              <div className="text-xs rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-red-700">
                {error}
              </div>
            )}

            <div className="space-y-4">
              {filtered.map((row) => {
                const receivingMix = buildReceivingMixSummary(row.userlsTracking);
                const canApplyObserved =
                  row.identityResolved &&
                  row.suggestedArea &&
                  row.currentAssignedArea !== row.suggestedArea &&
                  row.assignmentStatus === "pending";

                const canApplyHome =
                  row.identityResolved &&
                  row.employeeDefaultTeam &&
                  row.currentAssignedArea !== row.employeeDefaultTeam &&
                  row.assignmentStatus === "pending";

                return (
                  <div key={row.userid} className="rounded-2xl border bg-white p-4 shadow-sm space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-base font-bold text-slate-900">
                          {row.employeeDisplayName || row.resolvedName || row.observedName || row.userid}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {row.userid}
                          {row.employeeId ? ` · ${row.employeeId}` : ""}
                        </div>
                        {row.observedName &&
                        row.employeeDisplayName &&
                        row.observedName !== row.employeeDisplayName ? (
                          <div className="mt-1 text-sm text-slate-600">
                            Observed as: {row.observedName}
                          </div>
                        ) : null}
                      </div>

                      <div className={`text-xs font-medium ${statusTone(row.assignmentStatus)}`}>
                        {statusLabel(row.assignmentStatus)}
                        {row.reviewedAt ? ` · ${row.reviewedAt}` : ""}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <ContextBadge variant="home-team">
                        Home Team: {row.employeeDefaultTeam || "—"}
                      </ContextBadge>
                      <ContextBadge variant="observed-team">
                        Observed Team: {row.suggestedArea || "—"}
                      </ContextBadge>
                      {row.userlsTracking?.primaryReplenishmentRole ? (
                        <ContextBadge variant="observed-role">
                          Observed Role: {row.userlsTracking.primaryReplenishmentRole}
                        </ContextBadge>
                      ) : null}
                      <ContextBadge variant="review-status">
                        Status: {statusLabel(row.assignmentStatus)}
                      </ContextBadge>
                      <ContextBadge variant="confidence">
                        Confidence: {row.confidence}
                      </ContextBadge>
                    </div>

                    <div className="rounded-xl border bg-slate-50 px-3 py-3">
                      <div className="text-sm font-medium text-slate-900">{row.reviewReason}</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                        <span>Current Role: {row.currentRole || "—"}</span>
                        <span>Current Day Area: {row.currentAssignedArea || "—"}</span>
                        {row.suggestedSourceArea ? <span>Signal Source: {row.suggestedSourceArea}</span> : null}
                      </div>
                      {row.assignmentStatus === "resolved" && row.reviewedArea ? (
                        <div className="mt-2 text-xs text-green-700">
                          Resolved to {row.reviewedArea}
                        </div>
                      ) : null}
                      {row.assignmentStatus === "ignored" ? (
                        <div className="mt-2 text-xs text-slate-500">This item is currently ignored.</div>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {row.userlsTracking?.primaryReplenishmentAreaCode ? (
                        <ContextBadge variant="context">
                          UserLS Repl Area: {row.userlsTracking.primaryReplenishmentAreaCode} · {pct(row.userlsTracking.primaryReplenishmentShare)}
                        </ContextBadge>
                      ) : null}
                      {row.userlsTracking?.primaryReplenishmentRole ? (
                        <ContextBadge variant="context">
                          Role Share: {pct(row.userlsTracking.primaryReplenishmentRoleShare)}
                        </ContextBadge>
                      ) : null}
                      {receivingMix ? (
                        <ContextBadge variant="context">
                          Receiving Mix: {receivingMix}
                        </ContextBadge>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {!row.identityResolved && (
                        <Link
                          href="/options/identity-review"
                          className="rounded-lg border bg-white px-3 py-2 text-xs hover:bg-slate-50"
                        >
                          Identity Review
                        </Link>
                      )}

                      {canApplyObserved && (
                        <button
                          type="button"
                          onClick={() =>
                            applyAssignedArea(row.userid, row.suggestedArea as string, "Observed team")
                          }
                          disabled={savingUser === row.userid}
                          className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                        >
                          Set Day to Observed Team
                        </button>
                      )}

                      {canApplyHome && (
                        <button
                          type="button"
                          onClick={() =>
                            applyAssignedArea(
                              row.userid,
                              row.employeeDefaultTeam as string,
                              "Employee home team"
                            )
                          }
                          disabled={savingUser === row.userid}
                          className="rounded-lg border bg-white px-3 py-2 text-xs hover:bg-slate-50 disabled:opacity-60"
                        >
                          Set Day to Home Team
                        </button>
                      )}

                      {row.currentAssignedArea === row.suggestedArea && row.suggestedArea && (
                        <span className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
                          Already on observed team
                        </span>
                      )}

                      {row.currentAssignedArea === row.employeeDefaultTeam && row.employeeDefaultTeam && (
                        <span className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                          Already on home team
                        </span>
                      )}

                      {row.assignmentStatus === "pending" && row.needsReview && (
                        <button
                          type="button"
                          onClick={() => markStatus(row.userid, "ignored")}
                          disabled={savingUser === row.userid}
                          className="rounded-lg border bg-white px-3 py-2 text-xs hover:bg-slate-50 disabled:opacity-60"
                        >
                          Ignore
                        </button>
                      )}

                      {row.assignmentStatus !== "pending" && (
                        <button
                          type="button"
                          onClick={() => markStatus(row.userid, "pending")}
                          disabled={savingUser === row.userid}
                          className="rounded-lg border bg-white px-3 py-2 text-xs hover:bg-slate-50 disabled:opacity-60"
                        >
                          Reopen
                        </button>
                      )}

                      <Link
                        href={`/operators/${row.userid}`}
                        className="rounded-lg border bg-white px-3 py-2 text-xs hover:bg-slate-50"
                      >
                        Operator Detail
                      </Link>
                    </div>

                    <DetailDisclosure
                      title="Audit Detail"
                      meta={[
                        row.employeeDisplayName ? `employee ${row.employeeDisplayName}` : "unresolved identity",
                        row.userlsTracking?.primaryReplenishmentRole
                          ? `role ${row.userlsTracking.primaryReplenishmentRole}`
                          : null,
                        receivingMix ? "receiving context present" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    >
                      <div className="grid gap-4 xl:grid-cols-2">
                        <div className="space-y-2 text-sm">
                          <div>
                            <span className="text-slate-500">Observed Name: </span>
                            <span>{row.observedName || "—"}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Resolved Name: </span>
                            <span>{row.resolvedName || "—"}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Employee Display: </span>
                            <span>{row.employeeDisplayName || "—"}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Employee ID: </span>
                            <span>{row.employeeId || "—"}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Identity Resolved: </span>
                            <span>{row.identityResolved ? "Yes" : "No"}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Review Reason: </span>
                            <span>{row.reviewReason}</span>
                          </div>
                        </div>

                        <div className="space-y-2 text-sm">
                          <div>
                            <span className="text-slate-500">Current Role: </span>
                            <span>{row.currentRole || "—"}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Home Team: </span>
                            <span>{row.employeeDefaultTeam || "—"}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Current Assigned Area: </span>
                            <span>{row.currentAssignedArea || "—"}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Suggested Area: </span>
                            <span>{row.suggestedArea || "—"}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Suggested Source Area: </span>
                            <span>{row.suggestedSourceArea || "—"}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Confidence: </span>
                            <span>{row.confidence}</span>
                          </div>
                        </div>
                      </div>

                      {(row.userlsTracking?.present || receivingMix) && (
                        <div className="mt-4 rounded-xl border bg-slate-50 p-3 text-sm space-y-2">
                          <div className="font-medium text-slate-900">UserLS Context</div>
                          <div>
                            <span className="text-slate-500">Receiving Plates: </span>
                            <span>{fmt(row.userlsTracking?.receivingPlates)}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Receiving Pieces: </span>
                            <span>{fmt(row.userlsTracking?.receivingPieces)}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Repl Plates: </span>
                            <span>{fmt(row.userlsTracking?.replenishmentNoRecvPlates)}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Repl Pieces: </span>
                            <span>{fmt(row.userlsTracking?.replenishmentNoRecvPieces)}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Primary Repl Area: </span>
                            <span>{row.userlsTracking?.primaryReplenishmentAreaCode || "—"}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Primary Repl Role: </span>
                            <span>{row.userlsTracking?.primaryReplenishmentRole || "—"}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Receiving Mix: </span>
                            <span>{receivingMix || "—"}</span>
                          </div>
                        </div>
                      )}
                    </DetailDisclosure>
                  </div>
                );
              })}

              {!filtered.length && (
                <div className="rounded-2xl border bg-white p-6 text-sm text-slate-500 shadow-sm">
                  No assignment review rows match the current filters.
                </div>
              )}
            </div>
          </SectionBlock>
        )}
      </div>
    </main>
  );
}
