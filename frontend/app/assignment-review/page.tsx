"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardNav from "@/components/dashboard-nav";
import ControlBar from "@/components/control-bar";
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

function confidenceClasses(confidence: string): string {
  switch (confidence) {
    case "high":
      return "bg-green-100 text-green-800 border-green-200";
    case "medium":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "low":
      return "bg-amber-100 text-amber-800 border-amber-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${(Number(value) * 100).toFixed(1)}%`;
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

    return {
      total: rows.length,
      active,
      resolved,
      ignored,
      clear,
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

        <section className="rounded-2xl bg-white border shadow-sm p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">Assignment Review</h2>
              <p className="mt-1 text-xs text-slate-600">
                Compare home team against observed team for the selected period. UserLS observed role and receiving destination mix are shown as context, not automatic override truth.
              </p>
            </div>
            <div className="text-right text-xs text-slate-500">
              <div>{selectedWeek}</div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 xl:grid-cols-5 gap-3">
            <div className="rounded-xl border bg-slate-50 p-3 text-center">
              <div className="text-[11px] text-slate-500">Operators</div>
              <div className="mt-2 text-2xl font-semibold">{stats.total}</div>
            </div>
            <div className="rounded-xl border bg-slate-50 p-3 text-center">
              <div className="text-[11px] text-slate-500">Active Review</div>
              <div className="mt-2 text-2xl font-semibold">{stats.active}</div>
            </div>
            <div className="rounded-xl border bg-slate-50 p-3 text-center">
              <div className="text-[11px] text-slate-500">Resolved</div>
              <div className="mt-2 text-2xl font-semibold">{stats.resolved}</div>
            </div>
            <div className="rounded-xl border bg-slate-50 p-3 text-center">
              <div className="text-[11px] text-slate-500">Ignored</div>
              <div className="mt-2 text-2xl font-semibold">{stats.ignored}</div>
            </div>
            <div className="rounded-xl border bg-slate-50 p-3 text-center">
              <div className="text-[11px] text-slate-500">System Clear</div>
              <div className="mt-2 text-2xl font-semibold">{stats.clear}</div>
            </div>
          </div>
        </section>

        {loading && (
          <section className="rounded-2xl bg-white border shadow-sm p-4 text-sm text-slate-600">
            Loading assignment review...
          </section>
        )}

        {!loading && (
          <section className="rounded-2xl bg-white border shadow-sm p-4 space-y-4">
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

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1560px] text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-semibold">Observed</th>
                    <th className="px-3 py-3 font-semibold">Linked Employee</th>
                    <th className="px-3 py-3 font-semibold">Current Context</th>
                    <th className="px-3 py-3 font-semibold">Observed Signal</th>
                    <th className="px-3 py-3 font-semibold">Why Flagged</th>
                    <th className="px-3 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const receivingMix = buildReceivingMixSummary(row.userlsTracking);

                    return (
                      <tr key={row.userid} className="border-b last:border-b-0 align-top">
                        <td className="px-4 py-3">
                          <div className="font-medium">{row.observedName || row.resolvedName}</div>
                          <div className="text-[11px] text-slate-500">{row.userid}</div>
                        </td>

                        <td className="px-3 py-3">
                          {row.employeeDisplayName ? (
                            <div>
                              <div>{row.employeeDisplayName}</div>
                              {row.employeeId && (
                                <div className="text-[11px] text-slate-500">{row.employeeId}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">Unresolved</span>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          <div className="space-y-1">
                            <div>
                              <span className="text-[11px] text-slate-500">Current role: </span>
                              <span>{row.currentRole || "—"}</span>
                            </div>
                            <div>
                              <span className="text-[11px] text-slate-500">Home team: </span>
                              <span>{row.employeeDefaultTeam || "—"}</span>
                            </div>
                            <div>
                              <span className="text-[11px] text-slate-500">Current day area: </span>
                              <span>{row.currentAssignedArea || "—"}</span>
                            </div>
                            {row.userlsTracking?.primaryReplenishmentRole && (
                              <div>
                                <span className="text-[11px] text-slate-500">Observed repl role: </span>
                                <span>
                                  {row.userlsTracking.primaryReplenishmentRole}{" "}
                                  <span className="text-[11px] text-slate-500">
                                    ({pct(row.userlsTracking.primaryReplenishmentRoleShare)})
                                  </span>
                                </span>
                              </div>
                            )}
                            {receivingMix && (
                              <div className="text-[11px] text-slate-500">
                                Receiving mix: {receivingMix}
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="px-3 py-3">
                          {row.suggestedArea ? (
                            <div className="space-y-1">
                              <div className="font-medium">{row.suggestedArea}</div>
                              {row.suggestedSourceArea && (
                                <div className="text-[11px] text-slate-500">
                                  {row.suggestedSourceArea}
                                </div>
                              )}
                              {row.userlsTracking?.primaryReplenishmentAreaCode && (
                                <div className="text-[11px] text-slate-500">
                                  UserLS repl area: {row.userlsTracking.primaryReplenishmentAreaCode}
                                  {" · "}
                                  {pct(row.userlsTracking.primaryReplenishmentShare)}
                                </div>
                              )}
                              {row.userlsTracking?.primaryReplenishmentRole && (
                                <div className="text-[11px] text-slate-500">
                                  UserLS repl role: {row.userlsTracking.primaryReplenishmentRole}
                                </div>
                              )}
                              <span
                                className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${confidenceClasses(
                                  row.confidence
                                )}`}
                              >
                                {row.confidence}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400">No signal</span>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          <div>{row.reviewReason}</div>
                          {row.assignmentStatus === "resolved" && row.reviewedArea && (
                            <div className="mt-1 text-[11px] text-green-700">
                              resolved to {row.reviewedArea}
                            </div>
                          )}
                          {row.assignmentStatus === "ignored" && (
                            <div className="mt-1 text-[11px] text-slate-500">ignored</div>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-2">
                            {!row.identityResolved && (
                              <Link
                                href="/options/identity-review"
                                className="rounded-lg border bg-white px-3 py-2 text-xs hover:bg-slate-50"
                              >
                                Identity Review
                              </Link>
                            )}

                            {row.identityResolved &&
                              row.suggestedArea &&
                              row.currentAssignedArea !== row.suggestedArea &&
                              row.assignmentStatus === "pending" && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    applyAssignedArea(row.userid, row.suggestedArea as string, "Observed team")
                                  }
                                  disabled={savingUser === row.userid}
                                  className="rounded-lg border bg-white px-3 py-2 text-xs hover:bg-slate-50 disabled:opacity-60"
                                >
                                  Set Day to Observed Team
                                </button>
                              )}

                            {row.identityResolved &&
                              row.employeeDefaultTeam &&
                              row.currentAssignedArea !== row.employeeDefaultTeam &&
                              row.assignmentStatus === "pending" && (
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
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
