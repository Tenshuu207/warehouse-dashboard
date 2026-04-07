"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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

type ReviewOverride = {
  assignedArea?: string;
  assignedRole?: string;
  reviewNotes?: string;
  reviewStatus?: string;
};

type ReviewsResponse = {
  operators?: Record<string, ReviewOverride>;
};

type OptionsData = {
  areas: string[];
  roles: string[];
  reviewStatuses: string[];
};

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

type ReviewDraft = {
  assignedArea: string;
  assignedRole: string;
  reviewStatus: string;
  reviewNotes: string;
};

type ReviewRow = ReturnType<typeof buildAssignmentReviewRow> & {
  currentReviewStatus: string;
  currentReviewNotes: string;
  currentAssignedRoleFromData: string | null;
};

function rowChanged(base: ReviewDraft, draft: ReviewDraft): boolean {
  return (
    base.assignedArea !== draft.assignedArea ||
    base.assignedRole !== draft.assignedRole ||
    base.reviewStatus !== draft.reviewStatus ||
    base.reviewNotes !== draft.reviewNotes
  );
}

export default function ReviewPage() {
  const { selectedWeek } = useAppState();

  const [data, setData] = useState<ResolvedDashboardData | null>(null);
  const [reviewOverrides, setReviewOverrides] = useState<Record<string, ReviewOverride>>({});
  const [employees, setEmployees] = useState<Record<string, EmployeeRecord>>({});
  const [defaults, setDefaults] = useState<Record<string, OperatorDefault>>({});
  const [mappings, setMappings] = useState<RfMapping[]>([]);
  const [options, setOptions] = useState<OptionsData>({
    areas: [],
    roles: [],
    reviewStatuses: [],
  });
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({});
  const [baseDrafts, setBaseDrafts] = useState<Record<string, ReviewDraft>>({});
  const [loading, setLoading] = useState(true);
  const [savingUser, setSavingUser] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(false);

  const refresh = useCallback(async () => {
    const [weekData, reviewsRes, optionsRes, employeesRes, defaultsRes, mappingsRes] =
      await Promise.all([
        getWeekData(selectedWeek),
        fetch(`/api/reviews?date=${selectedWeek}`, { cache: "no-store" }),
        fetch("/api/options", { cache: "no-store" }),
        fetch("/api/employees", { cache: "no-store" }),
        fetch("/api/operator-defaults", { cache: "no-store" }),
        fetch("/api/rf-mappings", { cache: "no-store" }),
      ]);

    const reviewsJson: ReviewsResponse = reviewsRes.ok
      ? await reviewsRes.json()
      : { operators: {} };

    const optionsJson = optionsRes.ok
      ? await optionsRes.json()
      : { areas: [], roles: [], reviewStatuses: [] };

    const employeesJson: EmployeesResponse = employeesRes.ok
      ? await employeesRes.json()
      : { employees: {}, validTeams: [] };

    const defaultsJson: DefaultsResponse = defaultsRes.ok
      ? await defaultsRes.json()
      : { operators: {} };

    const mappingsJson: MappingsResponse = mappingsRes.ok
      ? await mappingsRes.json()
      : { mappings: [] };

    const nextOverrides = reviewsJson?.operators || {};

    setData(weekData);
    setReviewOverrides(nextOverrides);
    setEmployees(employeesJson.employees || {});
    setDefaults(defaultsJson.operators || {});
    setMappings(Array.isArray(mappingsJson.mappings) ? mappingsJson.mappings : []);
    setOptions({
      areas: Array.isArray(optionsJson.areas) ? optionsJson.areas : [],
      roles: Array.isArray(optionsJson.roles) ? optionsJson.roles : [],
      reviewStatuses: Array.isArray(optionsJson.reviewStatuses) ? optionsJson.reviewStatuses : [],
    });

    const operators = ((weekData?.operators ?? []) as unknown as AssignmentOperator[]) || [];
    const nextDrafts: Record<string, ReviewDraft> = {};

    for (const operator of operators) {
      const override = nextOverrides[operator.userid] || {};

      const assignedArea =
        override.assignedArea ??
        operator.effectiveAssignedArea ??
        operator.assignedArea ??
        operator.rawAssignedArea ??
        "";

      const assignedRole =
        override.assignedRole ??
        operator.effectiveAssignedRole ??
        operator.assignedRole ??
        operator.rawAssignedRole ??
        "";

      const reviewStatus =
        override.reviewStatus ??
        // @ts-expect-error legacy dashboard shape may carry this
        operator.reviewStatus ??
        "";

      const reviewNotes =
        override.reviewNotes ??
        // @ts-expect-error legacy dashboard shape may carry this
        operator.reviewNotes ??
        "";

      nextDrafts[operator.userid] = {
        assignedArea,
        assignedRole,
        reviewStatus,
        reviewNotes,
      };
    }

    setDrafts(nextDrafts);
    setBaseDrafts(nextDrafts);
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
          setError(err instanceof Error ? err.message : "Failed to load review workspace");
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

  const rows = useMemo<ReviewRow[]>(() => {
    return operators
      .map((operator) => {
        const assignment = buildAssignmentReviewRow({
          operator,
          selectedDate: selectedWeek,
          validTeams: options.areas,
          employees,
          mappings,
          defaultTeams: defaults,
        });

        const override = reviewOverrides[operator.userid] || {};

        return {
          ...assignment,
          currentReviewStatus:
            override.reviewStatus ??
            // @ts-expect-error legacy dashboard shape may carry this
            operator.reviewStatus ??
            "",
          currentReviewNotes:
            override.reviewNotes ??
            // @ts-expect-error legacy dashboard shape may carry this
            operator.reviewNotes ??
            "",
          currentAssignedRoleFromData:
            override.assignedRole ??
            operator.effectiveAssignedRole ??
            operator.assignedRole ??
            operator.rawAssignedRole ??
            null,
        };
      })
      .sort((a, b) => a.resolvedName.localeCompare(b.resolvedName));
  }, [operators, selectedWeek, options.areas, employees, mappings, defaults, reviewOverrides]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rows.filter((row) => {
      const draft = drafts[row.userid];
      const base = baseDrafts[row.userid];

      if (onlyChanged && draft && base && !rowChanged(base, draft)) {
        return false;
      }

      if (!q) return true;

      return (
        row.observedName.toLowerCase().includes(q) ||
        row.resolvedName.toLowerCase().includes(q) ||
        row.userid.toLowerCase().includes(q) ||
        (row.employeeDisplayName || "").toLowerCase().includes(q) ||
        (row.employeeId || "").toLowerCase().includes(q) ||
        (row.employeeDefaultTeam || "").toLowerCase().includes(q) ||
        (row.suggestedArea || "").toLowerCase().includes(q) ||
        (row.currentRole || "").toLowerCase().includes(q) ||
        row.reviewReason.toLowerCase().includes(q) ||
        (draft?.reviewNotes || "").toLowerCase().includes(q) ||
        (draft?.reviewStatus || "").toLowerCase().includes(q)
      );
    });
  }, [rows, drafts, baseDrafts, search, onlyChanged]);

  const stats = useMemo(() => {
    const changed = rows.filter((row) => {
      const draft = drafts[row.userid];
      const base = baseDrafts[row.userid];
      return draft && base ? rowChanged(base, draft) : false;
    }).length;

    const reviewed = rows.filter((row) => {
      const draft = drafts[row.userid];
      return !!draft?.reviewStatus;
    }).length;

    const unresolvedIdentity = rows.filter((row) => !row.identityResolved).length;

    return {
      total: rows.length,
      changed,
      reviewed,
      unresolvedIdentity,
    };
  }, [rows, drafts, baseDrafts]);

  function updateDraft(userid: string, patch: Partial<ReviewDraft>) {
    setMessage(null);
    setDrafts((prev) => ({
      ...prev,
      [userid]: {
        ...(prev[userid] || {
          assignedArea: "",
          assignedRole: "",
          reviewStatus: "",
          reviewNotes: "",
        }),
        ...patch,
      },
    }));
  }

  async function saveRow(userid: string) {
    try {
      setSavingUser(userid);
      setError(null);
      setMessage(null);

      const draft = drafts[userid];
      if (!draft) {
        throw new Error("Draft not found");
      }

      const payload = {
        date: selectedWeek,
        userid,
        assignedArea: draft.assignedArea,
        assignedRole: draft.assignedRole,
        reviewStatus: draft.reviewStatus,
        reviewNotes: draft.reviewNotes,
      };

      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(body?.error || body?.details || "Save failed");
      }

      const savedDraft = { ...draft };

      setBaseDrafts((prev) => ({
        ...prev,
        [userid]: savedDraft,
      }));

      setReviewOverrides((prev) => {
        const next = { ...prev };
        const nextOverride: ReviewOverride = {};

        if (savedDraft.assignedArea) nextOverride.assignedArea = savedDraft.assignedArea;
        if (savedDraft.assignedRole) nextOverride.assignedRole = savedDraft.assignedRole;
        if (savedDraft.reviewStatus) nextOverride.reviewStatus = savedDraft.reviewStatus;
        if (savedDraft.reviewNotes) nextOverride.reviewNotes = savedDraft.reviewNotes;

        if (Object.keys(nextOverride).length > 0) {
          next[userid] = nextOverride;
        } else {
          delete next[userid];
        }

        return next;
      });

      setMessage(`Saved review overrides for ${userid}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingUser(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-3 md:p-4">
      <div className="max-w-[1700px] xl:ml-0 xl:mr-auto space-y-4 min-w-0">
        <ControlBar />

        <section className="rounded-2xl bg-white border shadow-sm p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">Review Workspace</h2>
              <p className="mt-1 text-xs text-slate-600">
                Day-level override workspace for assigned area, assigned role, review status, and notes.
              </p>
            </div>
            <div className="text-right text-xs text-slate-500">
              <div>{selectedWeek}</div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="rounded-xl border bg-slate-50 p-3 text-center">
              <div className="text-[11px] text-slate-500">Operators</div>
              <div className="mt-2 text-2xl font-semibold">{stats.total}</div>
            </div>
            <div className="rounded-xl border bg-slate-50 p-3 text-center">
              <div className="text-[11px] text-slate-500">Unsaved Changes</div>
              <div className="mt-2 text-2xl font-semibold">{stats.changed}</div>
            </div>
            <div className="rounded-xl border bg-slate-50 p-3 text-center">
              <div className="text-[11px] text-slate-500">With Review Status</div>
              <div className="mt-2 text-2xl font-semibold">{stats.reviewed}</div>
            </div>
            <div className="rounded-xl border bg-slate-50 p-3 text-center">
              <div className="text-[11px] text-slate-500">Identity Unresolved</div>
              <div className="mt-2 text-2xl font-semibold">{stats.unresolvedIdentity}</div>
            </div>
          </div>
        </section>

        {loading && (
          <section className="rounded-2xl bg-white border shadow-sm p-4 text-sm text-slate-600">
            Loading review workspace...
          </section>
        )}

        {!loading && (
          <section className="rounded-2xl bg-white border shadow-sm p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search observed name, employee, RF username, role, team, notes, or reason"
                className="min-w-[280px] flex-1 rounded-xl border px-3 py-2"
              />
              <label className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={onlyChanged}
                  onChange={(e) => setOnlyChanged(e.target.checked)}
                />
                <span>Only show unsaved changes</span>
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
              <table className="w-full min-w-[1900px] text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-semibold">Observed</th>
                    <th className="px-3 py-3 font-semibold">Linked Employee</th>
                    <th className="px-3 py-3 font-semibold">Context</th>
                    <th className="px-3 py-3 font-semibold">Assigned Area</th>
                    <th className="px-3 py-3 font-semibold">Assigned Role</th>
                    <th className="px-3 py-3 font-semibold">Review Status</th>
                    <th className="px-3 py-3 font-semibold">Review Notes</th>
                    <th className="px-3 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const draft = drafts[row.userid] || {
                      assignedArea: "",
                      assignedRole: "",
                      reviewStatus: "",
                      reviewNotes: "",
                    };

                    const base = baseDrafts[row.userid] || draft;
                    const changed = rowChanged(base, draft);

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
                            <div className="space-y-1">
                              <div className="text-slate-400">Unresolved</div>
                              <Link
                                href="/options/identity-review"
                                className="inline-flex rounded-lg border bg-white px-2.5 py-1.5 text-xs hover:bg-slate-50"
                              >
                                Identity Review
                              </Link>
                            </div>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          <div className="space-y-1">
                            <div>
                              <span className="text-[11px] text-slate-500">Role: </span>
                              <span>{row.currentRole || "—"}</span>
                            </div>
                            <div>
                              <span className="text-[11px] text-slate-500">Home: </span>
                              <span>{row.employeeDefaultTeam || "—"}</span>
                            </div>
                            <div>
                              <span className="text-[11px] text-slate-500">Observed: </span>
                              <span>{row.suggestedArea || "—"}</span>
                            </div>
                            {row.suggestedSourceArea && (
                              <div className="text-[11px] text-slate-500">{row.suggestedSourceArea}</div>
                            )}
                            <div className="text-[11px] text-slate-500">{row.reviewReason}</div>
                          </div>
                        </td>

                        <td className="px-3 py-3">
                          <div className="space-y-2 min-w-[220px]">
                            <select
                              value={draft.assignedArea}
                              onChange={(e) =>
                                updateDraft(row.userid, { assignedArea: e.target.value })
                              }
                              className="w-full rounded-lg border px-3 py-2 bg-white"
                            >
                              <option value="">No assigned area</option>
                              {options.areas.map((area) => (
                                <option key={area} value={area}>
                                  {area}
                                </option>
                              ))}
                            </select>

                            <div className="flex flex-wrap gap-2">
                              {row.suggestedArea && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateDraft(row.userid, { assignedArea: row.suggestedArea || "" })
                                  }
                                  className="rounded-lg border bg-white px-2.5 py-1.5 text-xs hover:bg-slate-50"
                                >
                                  Use Observed
                                </button>
                              )}

                              {row.employeeDefaultTeam && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateDraft(row.userid, {
                                      assignedArea: row.employeeDefaultTeam || "",
                                    })
                                  }
                                  className="rounded-lg border bg-white px-2.5 py-1.5 text-xs hover:bg-slate-50"
                                >
                                  Use Home Team
                                </button>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="px-3 py-3">
                          <select
                            value={draft.assignedRole}
                            onChange={(e) =>
                              updateDraft(row.userid, { assignedRole: e.target.value })
                            }
                            className="min-w-[180px] rounded-lg border px-3 py-2 bg-white"
                          >
                            <option value="">No assigned role</option>
                            {options.roles.map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="px-3 py-3">
                          <select
                            value={draft.reviewStatus}
                            onChange={(e) =>
                              updateDraft(row.userid, { reviewStatus: e.target.value })
                            }
                            className="min-w-[180px] rounded-lg border px-3 py-2 bg-white"
                          >
                            <option value="">No review status</option>
                            {options.reviewStatuses.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="px-3 py-3">
                          <textarea
                            value={draft.reviewNotes}
                            onChange={(e) =>
                              updateDraft(row.userid, { reviewNotes: e.target.value })
                            }
                            className="min-h-[90px] min-w-[260px] rounded-lg border px-3 py-2"
                            placeholder="Add notes for this day..."
                          />
                        </td>

                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-2 min-w-[180px]">
                            {changed ? (
                              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                                Unsaved changes
                              </span>
                            ) : (
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                                Saved
                              </span>
                            )}

                            <button
                              type="button"
                              onClick={() => saveRow(row.userid)}
                              disabled={savingUser === row.userid || !changed}
                              className="rounded-lg border bg-slate-900 text-white px-3 py-2 text-sm disabled:opacity-60"
                            >
                              {savingUser === row.userid ? "Saving..." : "Save Row"}
                            </button>

                            <Link
                              href={`/operators/${row.userid}`}
                              className="rounded-lg border bg-white px-3 py-2 text-xs hover:bg-slate-50 text-center"
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
