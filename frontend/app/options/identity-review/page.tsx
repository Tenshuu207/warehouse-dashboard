"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppState } from "@/lib/app-state";
import { getWeekData, type ResolvedDashboardData } from "@/lib/data-resolver";
import type { IdentityReviewItem, IdentityReviewStatus } from "@/lib/identity-review";

type EmployeeOption = {
  employeeId: string;
  displayName: string;
  defaultTeam?: string;
};

type SuggestedEmployee = EmployeeOption & {
  score: number;
};

type SuggestedTeam = {
  team: string;
  sourceArea: string;
  confidence: "high" | "medium" | "low";
};

type QueueResponse = {
  items: IdentityReviewItem[];
};

type EmployeesResponse = {
  employees: Record<
    string,
    {
      displayName: string;
      defaultTeam?: string;
    }
  >;
  validTeams?: string[];
};

type DraftState = {
  selectedEmployeeId: string;
  newDisplayName: string;
  newDefaultTeam: string;
  notes: string;
};

function reasonLabel(reason: string): string {
  switch (reason) {
    case "unmapped_rf_username":
      return "Unmapped RF Username";
    case "name_mismatch":
      return "Name Mismatch";
    case "inactive_employee_seen":
      return "Inactive Employee Seen";
    default:
      return reason;
  }
}

function statusClasses(status: string): string {
  switch (status) {
    case "pending":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "resolved":
      return "bg-green-100 text-green-800 border-green-200";
    case "ignored":
      return "bg-slate-100 text-slate-700 border-slate-200";
    default:
      return "bg-slate-50 text-slate-500 border-slate-200";
  }
}

function preferredRawName(item: IdentityReviewItem): string {
  const names = (item.rawNamesSeen || [])
    .map((name) => name.trim())
    .filter(Boolean);

  if (!names.length) return item.rfUsername;

  const normalizedRf = item.rfUsername.trim().toLowerCase();

  const ranked = [...names].sort((a, b) => {
    function score(name: string): number {
      const normalized = name.toLowerCase();
      let total = 0;

      if (normalized !== normalizedRf) total += 20;
      if (name.includes(" ")) total += 15;
      if (!/^rf[a-z0-9]+$/i.test(name)) total += 10;
      total += Math.min(name.length, 30);

      return total;
    }

    return score(b) - score(a);
  });

  return ranked[0] || item.rfUsername;
}

function normalizeMatchValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/\(rf\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeMatchValue(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && token !== "rf");
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => 0)
  );

  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[m][n];
}

function scoreRawNameAgainstEmployee(rawName: string, employeeName: string): number {
  const rawNorm = normalizeMatchValue(rawName);
  const empNorm = normalizeMatchValue(employeeName);

  if (!rawNorm || !empNorm) return 0;

  let score = 0;

  if (rawNorm === empNorm) score += 100;
  if (empNorm.includes(rawNorm) && rawNorm.length >= 3) score += 30;
  if (rawNorm.includes(empNorm) && empNorm.length >= 3) score += 15;

  const rawTokens = tokenize(rawName);
  const empTokens = tokenize(employeeName);

  if (rawTokens.length > 0 && empTokens.length > 0 && rawTokens[0] === empTokens[0]) {
    score += 16;
  }

  if (
    rawTokens.length > 1 &&
    empTokens.length > 1 &&
    rawTokens[rawTokens.length - 1][0] === empTokens[empTokens.length - 1][0]
  ) {
    score += 8;
  }

  for (const rawToken of rawTokens) {
    if (rawToken.length === 1) {
      if (empTokens.some((token) => token.startsWith(rawToken))) {
        score += 8;
      }
      continue;
    }

    if (empTokens.includes(rawToken)) {
      score += 18;
      continue;
    }

    if (empTokens.some((token) => token.startsWith(rawToken))) {
      score += 10;
      continue;
    }

    const closeToken = empTokens.some((token) => {
      const dist = levenshtein(rawToken, token);
      return dist > 0 && dist <= 2;
    });

    if (closeToken) {
      score += 6;
    }
  }

  const dist = levenshtein(rawNorm, empNorm);
  if (dist === 1) score += 12;
  else if (dist === 2) score += 8;
  else if (dist === 3) score += 4;

  return score;
}

function getTopSuggestions(
  rawNamesSeen: string[],
  employeeOptions: EmployeeOption[],
  limit = 5
): SuggestedEmployee[] {
  const scored = employeeOptions
    .map((employee) => {
      const score = Math.max(
        ...rawNamesSeen.map((rawName) =>
          scoreRawNameAgainstEmployee(rawName, employee.displayName)
        ),
        0
      );

      return {
        ...employee,
        score,
      };
    })
    .filter((employee) => employee.score >= 18)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.displayName.localeCompare(b.displayName);
    });

  return scored.slice(0, limit);
}

function firstMatchingTeam(validTeams: string[], pattern: (value: string) => boolean): string | null {
  const match = validTeams.find((team) => pattern(team.toLowerCase()));
  return match || null;
}

function inferTeamFromArea(area: string, validTeams: string[]): SuggestedTeam | null {
  const clean = area.trim();
  if (!clean) return null;

  if (validTeams.includes(clean)) {
    return {
      team: clean,
      sourceArea: clean,
      confidence: "high",
    };
  }

  const lower = clean.toLowerCase();

  if (lower.includes("inventory")) {
    const team = firstMatchingTeam(validTeams, (v) => v.includes("inventory"));
    if (team) return { team, sourceArea: clean, confidence: "high" };
  }

  if (lower.includes("night")) {
    const team = firstMatchingTeam(validTeams, (v) => v.includes("night"));
    if (team) return { team, sourceArea: clean, confidence: "high" };
  }

  if (lower.includes("delivery")) {
    const team = firstMatchingTeam(validTeams, (v) => v.includes("delivery"));
    if (team) return { team, sourceArea: clean, confidence: "high" };
  }

  if (lower.includes("receiv")) {
    const team = firstMatchingTeam(validTeams, (v) => v.includes("receiv"));
    if (team) return { team, sourceArea: clean, confidence: "medium" };
  }

  if (lower.includes("freez")) {
    const team = firstMatchingTeam(validTeams, (v) => v.includes("freez"));
    if (team) return { team, sourceArea: clean, confidence: "medium" };
  }

  if (
    lower.includes("cool") ||
    lower.includes("produce") ||
    lower.includes("seafood") ||
    lower.includes("chicken") ||
    lower.includes("iced")
  ) {
    const team =
      firstMatchingTeam(validTeams, (v) => v.includes("cool")) ||
      firstMatchingTeam(validTeams, (v) => v.includes("produce"));
    if (team) return { team, sourceArea: clean, confidence: "medium" };
  }

  if (lower.includes("dry")) {
    const team = firstMatchingTeam(validTeams, (v) => v.includes("dry"));
    if (team) return { team, sourceArea: clean, confidence: "medium" };
  }

  return null;
}

function suggestTeamForItem(
  item: IdentityReviewItem,
  weekData: ResolvedDashboardData | null,
  validTeams: string[]
): SuggestedTeam | null {
  if (!weekData?.operators?.length) return null;

  const op = weekData.operators.find((row) => row.userid === item.rfUsername);
  if (!op) return null;

  const candidates = [
    op.effectiveAssignedArea,
    op.rawAssignedArea,
    op.assignedArea,
    op.area,
    op.effectivePerformanceArea,
  ]
    .map((value) => (value || "").trim())
    .filter(Boolean);

  for (const area of candidates) {
    const suggestion = inferTeamFromArea(area, validTeams);
    if (suggestion) return suggestion;
  }

  return null;
}

export default function IdentityReviewPage() {
  const { selectedWeek } = useAppState();

  const [items, setItems] = useState<IdentityReviewItem[]>([]);
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>([]);
  const [validTeams, setValidTeams] = useState<string[]>(["Other"]);
  const [weekData, setWeekData] = useState<ResolvedDashboardData | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const suggestionsByItem = useMemo(() => {
    const result: Record<string, SuggestedEmployee[]> = {};

    for (const item of items) {
      result[item.id] = getTopSuggestions(item.rawNamesSeen || [], employeeOptions);
    }

    return result;
  }, [items, employeeOptions]);

  const teamSuggestionsByItem = useMemo(() => {
    const result: Record<string, SuggestedTeam | null> = {};

    for (const item of items) {
      result[item.id] = suggestTeamForItem(item, weekData, validTeams);
    }

    return result;
  }, [items, weekData, validTeams]);

  const refresh = useCallback(async () => {
    const [queueRes, employeesRes, nextWeekData] = await Promise.all([
      fetch("/api/identity-review", { cache: "no-store" }),
      fetch("/api/employees", { cache: "no-store" }),
      getWeekData(selectedWeek),
    ]);

    const queueJson: QueueResponse = queueRes.ok ? await queueRes.json() : { items: [] };
    const employeesJson: EmployeesResponse = employeesRes.ok
      ? await employeesRes.json()
      : { employees: {}, validTeams: ["Other"] };

    const employeeList = Object.entries(employeesJson.employees || {})
      .map(([employeeId, value]) => ({
        employeeId,
        displayName: value.displayName,
        defaultTeam: value.defaultTeam,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    const nextItems = Array.isArray(queueJson.items) ? queueJson.items : [];
    const nextValidTeams =
      Array.isArray(employeesJson.validTeams) && employeesJson.validTeams.length
        ? employeesJson.validTeams
        : ["Other"];

    setItems(nextItems);
    setEmployeeOptions(employeeList);
    setValidTeams(nextValidTeams);
    setWeekData(nextWeekData);

    setDrafts((prev) => {
      const next = { ...prev };

      for (const item of nextItems) {
        if (!next[item.id]) {
          const suggestedName = preferredRawName(item);
          const suggestions = getTopSuggestions(item.rawNamesSeen || [], employeeList);
          const bestEmployee = suggestions[0];
          const bestTeam = suggestTeamForItem(item, nextWeekData, nextValidTeams);

          next[item.id] = {
            selectedEmployeeId: bestEmployee && bestEmployee.score >= 30 ? bestEmployee.employeeId : item.employeeId || "",
            newDisplayName: suggestedName,
            newDefaultTeam: bestTeam?.team || (nextValidTeams[0] || "Other"),
            notes: item.notes || "",
          };
        }
      }

      return next;
    });
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
          setError(err instanceof Error ? err.message : "Failed to load identity review");
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;

    return items.filter((item) => {
      const names = (item.rawNamesSeen || []).join(" ").toLowerCase();
      return (
        item.rfUsername.toLowerCase().includes(q) ||
        item.reason.toLowerCase().includes(q) ||
        item.status.toLowerCase().includes(q) ||
        (item.employeeId || "").toLowerCase().includes(q) ||
        (item.employeeDisplayName || "").toLowerCase().includes(q) ||
        names.includes(q) ||
        (item.notes || "").toLowerCase().includes(q)
      );
    });
  }, [items, search]);

  function updateDraft(itemId: string, patch: Partial<DraftState>) {
    setDrafts((prev) => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || {
          selectedEmployeeId: "",
          newDisplayName: "",
          newDefaultTeam: validTeams[0] || "Other",
          notes: "",
        }),
        ...patch,
      },
    }));
  }

  async function scanSelectedWeek() {
    try {
      setScanning(true);
      setError(null);
      setMessage(null);

      const res = await fetch("/api/identity-review/scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ selectedDate: selectedWeek }),
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body?.details || body?.error || "Scan failed");
      }

      await refresh();
      setMessage(
        `Scanned ${selectedWeek}. Found ${body.scannedCount} current-week issue${body.scannedCount === 1 ? "" : "s"}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function applyStatus(itemId: string, status: IdentityReviewStatus) {
    try {
      setSaving(itemId);
      setError(null);
      setMessage(null);

      const draft = drafts[itemId];

      const res = await fetch("/api/identity-review/apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "set_status",
          itemId,
          status,
          notes: draft?.notes || "",
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.details || body?.error || "Status update failed");
      }

      await refresh();
      setMessage(`Updated review item status to ${status}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status update failed");
    } finally {
      setSaving(null);
    }
  }

  async function createEmployeeAndLink(itemId: string) {
    try {
      setSaving(itemId);
      setError(null);
      setMessage(null);

      const draft = drafts[itemId];
      if (!draft?.newDisplayName || !draft?.newDefaultTeam) {
        throw new Error("Display name and default team are required.");
      }

      const res = await fetch("/api/identity-review/apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "create_employee_and_mapping",
          itemId,
          displayName: draft.newDisplayName.trim(),
          defaultTeam: draft.newDefaultTeam,
          notes: draft.notes || "",
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.details || body?.error || "Create + link failed");
      }

      await refresh();
      setMessage(`Created employee ${draft.newDisplayName} as ${body.employeeId} and linked RF username.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create + link failed");
    } finally {
      setSaving(null);
    }
  }

  async function linkExisting(itemId: string) {
    try {
      setSaving(itemId);
      setError(null);
      setMessage(null);

      const draft = drafts[itemId];
      if (!draft?.selectedEmployeeId) {
        throw new Error("Select an employee first.");
      }

      const res = await fetch("/api/identity-review/apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "link_existing_employee",
          itemId,
          employeeId: draft.selectedEmployeeId,
          notes: draft.notes || "",
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.details || body?.error || "Link existing failed");
      }

      await refresh();
      setMessage(`Linked RF username to existing employee.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Link existing failed");
    } finally {
      setSaving(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-3 md:p-4">
      <div className="mx-auto max-w-7xl space-y-4">

        <section className="rounded-2xl bg-white border shadow-sm p-4">
          <div className="text-xs text-slate-500 mb-2">
            <Link href="/options" className="hover:underline">
              ← Back to Options
            </Link>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">Identity Review</h2>
              <p className="mt-1 text-xs text-slate-600">
                Review unmapped RF usernames and suspicious identity mismatches. Scan the selected week, then resolve items by creating or linking employees.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/options/employees"
                className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50"
              >
                Employees
              </Link>
              <Link
                href="/options/rf-mappings"
                className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50"
              >
                RF Mappings
              </Link>
              <button
                type="button"
                onClick={scanSelectedWeek}
                disabled={scanning}
                className="rounded-lg border bg-slate-900 text-white px-3 py-2 text-sm disabled:opacity-60"
              >
                {scanning ? "Scanning..." : `Scan ${selectedWeek}`}
              </button>
            </div>
          </div>
        </section>

        {loading && (
          <section className="rounded-2xl bg-white border shadow-sm p-4 text-sm text-slate-600">
            Loading identity review...
          </section>
        )}

        {!loading && (
          <section className="rounded-2xl bg-white border shadow-sm p-4 space-y-4">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search RF username, name, reason, employee, or notes"
              className="w-full rounded-xl border px-3 py-2"
            />

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
              <table className="w-full min-w-[1850px] text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-semibold">RF Username</th>
                    <th className="px-3 py-3 font-semibold">Raw Names Seen</th>
                    <th className="px-3 py-3 font-semibold">Reason</th>
                    <th className="px-3 py-3 font-semibold">Mapped Employee</th>
                    <th className="px-3 py-3 font-semibold">First Seen</th>
                    <th className="px-3 py-3 font-semibold">Last Seen</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 font-semibold">Actions</th>
                    <th className="px-3 py-3 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => {
                    const draft = drafts[item.id] || {
                      selectedEmployeeId: "",
                      newDisplayName: preferredRawName(item),
                      newDefaultTeam: validTeams[0] || "Other",
                      notes: item.notes || "",
                    };

                    const suggestions = suggestionsByItem[item.id] || [];
                    const teamSuggestion = teamSuggestionsByItem[item.id];

                    return (
                      <tr key={item.id} className="border-b last:border-b-0 align-top">
                        <td className="px-4 py-3 font-medium">{item.rfUsername}</td>
                        <td className="px-3 py-3 text-slate-700">
                          {(item.rawNamesSeen || []).length ? item.rawNamesSeen.join(", ") : "—"}
                        </td>
                        <td className="px-3 py-3">{reasonLabel(item.reason)}</td>
                        <td className="px-3 py-3">
                          {item.employeeDisplayName || item.employeeId ? (
                            <div>
                              <div>{item.employeeDisplayName || "Unknown"}</div>
                              {item.employeeId && (
                                <div className="text-xs text-slate-500">{item.employeeId}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">Unmapped</span>
                          )}
                        </td>
                        <td className="px-3 py-3">{item.firstSeenDate}</td>
                        <td className="px-3 py-3">{item.lastSeenDate}</td>
                        <td className="px-3 py-3">
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusClasses(item.status)}`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="space-y-2 min-w-[520px]">
                            {!item.employeeId && item.reason === "unmapped_rf_username" && (
                              <>
                                <div className="rounded-xl border bg-slate-50 p-3 space-y-2">
                                  <div className="text-xs font-medium text-slate-600">Link Existing Employee</div>

                                  {suggestions.length > 0 && (
                                    <div className="space-y-1">
                                      <div className="text-[11px] text-slate-500">Suggested matches</div>
                                      <div className="flex flex-wrap gap-2">
                                        {suggestions.map((suggestion) => (
                                          <button
                                            key={suggestion.employeeId}
                                            type="button"
                                            onClick={() =>
                                              updateDraft(item.id, {
                                                selectedEmployeeId: suggestion.employeeId,
                                              })
                                            }
                                            className={`rounded-full border px-2.5 py-1 text-xs ${
                                              draft.selectedEmployeeId === suggestion.employeeId
                                                ? "bg-slate-900 text-white border-slate-900"
                                                : "bg-white hover:bg-slate-100"
                                            }`}
                                          >
                                            {suggestion.displayName}
                                            {suggestion.defaultTeam ? ` · ${suggestion.defaultTeam}` : ""}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  <div className="flex gap-2">
                                    <select
                                      value={draft.selectedEmployeeId}
                                      onChange={(e) =>
                                        updateDraft(item.id, { selectedEmployeeId: e.target.value })
                                      }
                                      className="flex-1 rounded-lg border px-3 py-2 bg-white"
                                    >
                                      <option value="">Select employee</option>
                                      {employeeOptions.map((employee) => (
                                        <option key={employee.employeeId} value={employee.employeeId}>
                                          {employee.displayName} ({employee.employeeId})
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() => linkExisting(item.id)}
                                      disabled={saving === item.id}
                                      className="rounded-lg border bg-white px-3 py-2 text-xs hover:bg-slate-100 disabled:opacity-60"
                                    >
                                      Link
                                    </button>
                                  </div>
                                </div>

                                <div className="rounded-xl border bg-slate-50 p-3 space-y-2">
                                  <div className="text-xs font-medium text-slate-600">Create Employee + Link</div>
                                  <div className="text-[11px] text-slate-500">
                                    Employee ID is auto-generated on save.
                                  </div>
                                  {teamSuggestion && (
                                    <div className="text-[11px] text-blue-700 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5">
                                      Suggested team: <span className="font-medium">{teamSuggestion.team}</span>{" "}
                                      <span className="text-blue-600">
                                        (from {teamSuggestion.sourceArea})
                                      </span>
                                    </div>
                                  )}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    <input
                                      value={draft.newDisplayName}
                                      onChange={(e) =>
                                        updateDraft(item.id, { newDisplayName: e.target.value })
                                      }
                                      className="rounded-lg border px-3 py-2"
                                      placeholder={preferredRawName(item)}
                                    />
                                    <select
                                      value={draft.newDefaultTeam}
                                      onChange={(e) =>
                                        updateDraft(item.id, { newDefaultTeam: e.target.value })
                                      }
                                      className="rounded-lg border px-3 py-2 bg-white"
                                    >
                                      {validTeams.map((team) => (
                                        <option key={team} value={team}>
                                          {team}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  {draft.selectedEmployeeId ? (
                                    <div className="text-[11px] rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-amber-800">
                                      Existing employee selected above. Use Link instead of Create + Link to avoid duplicates.
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => createEmployeeAndLink(item.id)}
                                      disabled={saving === item.id}
                                      className="rounded-lg border bg-slate-900 text-white px-3 py-2 text-xs disabled:opacity-60"
                                    >
                                      Create + Link
                                    </button>
                                  )}
                                </div>
                              </>
                            )}

                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => applyStatus(item.id, "resolved")}
                                disabled={saving === item.id}
                                className="rounded-lg border bg-green-50 border-green-200 px-3 py-2 text-xs text-green-800 hover:bg-green-100 disabled:opacity-60"
                              >
                                Mark Resolved
                              </button>
                              <button
                                type="button"
                                onClick={() => applyStatus(item.id, "ignored")}
                                disabled={saving === item.id}
                                className="rounded-lg border bg-slate-50 border-slate-200 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                              >
                                Ignore
                              </button>
                              <button
                                type="button"
                                onClick={() => applyStatus(item.id, "pending")}
                                disabled={saving === item.id}
                                className="rounded-lg border bg-amber-50 border-amber-200 px-3 py-2 text-xs text-amber-800 hover:bg-amber-100 disabled:opacity-60"
                              >
                                Set Pending
                              </button>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <textarea
                            value={draft.notes}
                            onChange={(e) => updateDraft(item.id, { notes: e.target.value })}
                            className="min-h-[84px] w-full rounded-lg border px-3 py-2"
                            placeholder="Resolution notes"
                          />
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
