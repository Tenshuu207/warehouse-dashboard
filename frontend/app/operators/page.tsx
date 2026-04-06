"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import DashboardNav from "@/components/dashboard-nav";
import ControlBar from "@/components/control-bar";
import { useAppState } from "@/lib/app-state";
import { getWeekData, type ResolvedDashboardData } from "@/lib/data-resolver";
import {
  resolveOperatorIdentity,
  type EmployeeRecord,
  type OperatorDefault,
  type RfMapping,
} from "@/lib/employee-identity";

type DefaultsResponse = {
  operators: Record<string, OperatorDefault>;
};

type EmployeesResponse = {
  employees: Record<string, EmployeeRecord>;
  validTeams?: string[];
};

type MappingsResponse = {
  mappings: RfMapping[];
};

function fallbackTeam(area: string | null | undefined, validTeams: string[]): string {
  if (area && validTeams.includes(area)) return area;
  return validTeams[0] || "Other";
}

export default function OperatorsPage() {
  const { selectedWeek } = useAppState();
  const [search, setSearch] = useState("");
  const [data, setData] = useState<ResolvedDashboardData | null>(null);
  const [defaults, setDefaults] = useState<Record<string, OperatorDefault>>({});
  const [employees, setEmployees] = useState<Record<string, EmployeeRecord>>({});
  const [mappings, setMappings] = useState<RfMapping[]>([]);
  const [validTeams, setValidTeams] = useState<string[]>(["Other"]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [weekData, defaultsRes, employeesRes, mappingsRes] = await Promise.all([
          getWeekData(selectedWeek),
          fetch("/api/operator-defaults", { cache: "no-store" }),
          fetch("/api/employees", { cache: "no-store" }),
          fetch("/api/rf-mappings", { cache: "no-store" }),
        ]);

        const defaultsJson: DefaultsResponse = defaultsRes.ok
          ? await defaultsRes.json()
          : { operators: {} };

        const employeesJson: EmployeesResponse = employeesRes.ok
          ? await employeesRes.json()
          : { employees: {}, validTeams: ["Other"] };

        const mappingsJson: MappingsResponse = mappingsRes.ok
          ? await mappingsRes.json()
          : { mappings: [] };

        if (!cancelled) {
          setData(weekData);
          setDefaults(defaultsJson.operators || {});
          setEmployees(employeesJson.employees || {});
          setMappings(Array.isArray(mappingsJson.mappings) ? mappingsJson.mappings : []);
          setValidTeams(
            Array.isArray(employeesJson.validTeams) && employeesJson.validTeams.length
              ? employeesJson.validTeams
              : ["Other"]
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load operators");
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

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();

    const groups: Record<string, Array<typeof operators[number] & { resolvedName: string }>> =
      Object.fromEntries(validTeams.map((team) => [team, []]));

    for (const op of operators) {
      const resolved = resolveOperatorIdentity({
        rfUsername: op.userid,
        fallbackName: op.name,
        fallbackTeam: fallbackTeam(
          op.rawAssignedArea || op.effectiveAssignedArea || op.assignedArea || op.area,
          validTeams
        ),
        selectedDate: selectedWeek,
        employees,
        mappings,
        defaultTeams: defaults,
      });

      const bucket = resolved.defaultTeam || validTeams[0] || "Other";

      const matches =
        !q ||
        resolved.displayName.toLowerCase().includes(q) ||
        op.userid.toLowerCase().includes(q) ||
        (op.effectiveAssignedRole || "").toLowerCase().includes(q) ||
        (op.rawAssignedRole || "").toLowerCase().includes(q) ||
        bucket.toLowerCase().includes(q);

      if (!matches) continue;

      if (!groups[bucket]) groups[bucket] = [];
      groups[bucket].push({
        ...op,
        resolvedName: resolved.displayName,
      });
    }

    for (const team of Object.keys(groups)) {
      groups[team].sort((a, b) => a.resolvedName.localeCompare(b.resolvedName));
    }

    return groups;
  }, [operators, defaults, employees, mappings, validTeams, search, selectedWeek]);

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-3 md:p-4">
      <div className="max-w-[1400px] xl:ml-0 xl:mr-auto space-y-4 min-w-0">
        <DashboardNav />
        <ControlBar />

        <section className="rounded-2xl bg-white border shadow-sm p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">Operators</h2>
              <p className="mt-1 text-xs text-slate-600">
                Grouped by default team. Canonical names come from employee identity mappings.
              </p>
            </div>

            <div className="text-right text-xs text-slate-500">
              <div>{selectedWeek}</div>
            </div>
          </div>

          <div className="mt-4">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search operator, RF username, role, or team"
              className="w-full rounded-xl border px-3 py-2"
            />
          </div>
        </section>

        {loading && (
          <section className="rounded-2xl bg-white border shadow-sm p-4 text-sm text-slate-600">
            Loading operators...
          </section>
        )}

        {error && (
          <section className="rounded-2xl bg-white border shadow-sm p-4 text-sm text-red-600">
            {error}
          </section>
        )}

        {!loading && !error && (
          <section className="space-y-4">
            {validTeams.map((team) => {
              const items = grouped[team] || [];
              if (!items.length) return null;

              return (
                <div key={team} className="rounded-2xl bg-white border shadow-sm p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold">{team}</h3>
                      <div className="mt-1 text-xs text-slate-500">
                        {items.length} operator{items.length === 1 ? "" : "s"}
                      </div>
                    </div>

                    <Link
                      href={`/areas?team=${encodeURIComponent(team)}`}
                      className="rounded-full border px-3 py-1.5 text-sm hover:bg-slate-50"
                    >
                      View {team}
                    </Link>
                  </div>

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                    {items.map((op) => (
                      <Link
                        key={op.userid}
                        href={`/operators/${op.userid}`}
                        className="rounded-xl border bg-slate-50 px-3 py-2 hover:bg-slate-100 transition-colors"
                      >
                        <div className="font-medium">{op.resolvedName}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {op.effectiveAssignedRole || op.rawAssignedRole || op.userid}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-400">
                          RF: {op.userid}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
