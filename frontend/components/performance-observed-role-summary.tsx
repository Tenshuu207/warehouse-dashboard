"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAppState } from "@/lib/app-state";

type TeamGroupsResponse = {
  date: string;
  teams: Array<{
    team: string;
    operatorCount: number;
    replenishmentPlates: number;
    replenishmentPieces: number;
    receivingPlates: number;
    receivingPieces: number;
    roleGroups: Array<{
      role: string;
      operatorCount: number;
      replenishmentPlates: number;
      replenishmentPieces: number;
      receivingPlates: number;
      receivingPieces: number;
    }>;
    operators: Array<{
      userid: string;
      name: string;
      roleGroup: string;
      officialTeam: string | null;
      currentRole: string | null;
      observedRole: string | null;
      observedRoleShare: number | null;
      observedArea: string | null;
      replenishmentPlates: number;
      replenishmentPieces: number;
      receivingPlates: number;
      receivingPieces: number;
      receivingMix: string | null;
    }>;
  }>;
};

function fmt(value: number | null | undefined) {
  return Number(value || 0).toLocaleString();
}

function pct(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${(Number(value) * 100).toFixed(1)}%`;
}

export default function PerformanceObservedRoleSummary() {
  const { selectedWeek } = useAppState();
  const [data, setData] = useState<TeamGroupsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/dashboard/team-groups?date=${selectedWeek}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as TeamGroupsResponse & { details?: string };

        if (!res.ok) {
          throw new Error(json.details || "Failed to load observed role summary");
        }

        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load observed role summary");
          setLoading(false);
        }
      }
    }

    if (selectedWeek) load();

    return () => {
      cancelled = true;
    };
  }, [selectedWeek]);

  if (loading) {
    return (
      <section className="rounded-2xl bg-white border shadow-sm p-4">
        <h3 className="text-lg font-bold">Observed Role Performance Snapshot</h3>
        <p className="mt-1 text-sm text-slate-500">Loading observed role summary…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl bg-white border shadow-sm p-4">
        <h3 className="text-lg font-bold">Observed Role Performance Snapshot</h3>
        <p className="mt-1 text-sm text-red-600">{error}</p>
      </section>
    );
  }

  const performanceTeams = (data?.teams || []).filter((team) => team.team !== "Receiving");

  return (
    <section className="rounded-2xl bg-white border shadow-sm p-4 space-y-4">
      <div>
        <h3 className="text-lg font-bold">Observed Role Performance Snapshot</h3>
        <p className="mt-1 text-sm text-slate-500">
          Replenishment-heavy grouping by inferred role zones from UserLS-enriched data.
        </p>
      </div>

      <div className="space-y-4">
        {performanceTeams.map((team) => (
          <section key={team.team} className="rounded-2xl border bg-slate-50/60 p-4 space-y-4">
            <div>
              <h4 className="text-lg font-semibold">{team.team}</h4>
              <p className="mt-1 text-xs text-slate-500">
                {team.operatorCount} operators · {fmt(team.replenishmentPlates)} replenishment plates · {fmt(team.replenishmentPieces)} replenishment pieces
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-sm">
                <thead className="bg-white border-b">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-semibold">Role Group</th>
                    <th className="px-3 py-2 font-semibold">Operators</th>
                    <th className="px-3 py-2 font-semibold">Repl Plates</th>
                    <th className="px-3 py-2 font-semibold">Repl Pieces</th>
                    <th className="px-3 py-2 font-semibold">Recv Plates</th>
                    <th className="px-3 py-2 font-semibold">Recv Pieces</th>
                  </tr>
                </thead>
                <tbody>
                  {team.roleGroups.map((group) => (
                    <tr key={`${team.team}-${group.role}`} className="border-b last:border-b-0">
                      <td className="px-3 py-2 font-medium">{group.role}</td>
                      <td className="px-3 py-2">{fmt(group.operatorCount)}</td>
                      <td className="px-3 py-2">{fmt(group.replenishmentPlates)}</td>
                      <td className="px-3 py-2">{fmt(group.replenishmentPieces)}</td>
                      <td className="px-3 py-2">{fmt(group.receivingPlates)}</td>
                      <td className="px-3 py-2">{fmt(group.receivingPieces)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1250px] text-sm">
                <thead className="bg-white border-b">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-semibold">Operator</th>
                    <th className="px-3 py-2 font-semibold">Group</th>
                    <th className="px-3 py-2 font-semibold">Observed Role</th>
                    <th className="px-3 py-2 font-semibold">Observed Area</th>
                    <th className="px-3 py-2 font-semibold">Repl Plates</th>
                    <th className="px-3 py-2 font-semibold">Repl Pieces</th>
                    <th className="px-3 py-2 font-semibold">Recv Plates</th>
                    <th className="px-3 py-2 font-semibold">Recv Pieces</th>
                  </tr>
                </thead>
                <tbody>
                  {team.operators.map((op) => (
                    <tr key={op.userid} className="border-b last:border-b-0">
                      <td className="px-3 py-2">
                        <Link href={`/operators/${op.userid}`} className="font-medium hover:underline">
                          {op.name}
                        </Link>
                        <div className="text-[11px] text-slate-500">{op.userid}</div>
                      </td>
                      <td className="px-3 py-2">{op.roleGroup}</td>
                      <td className="px-3 py-2">
                        {op.observedRole ? (
                          <div>
                            <div>{op.observedRole}</div>
                            <div className="text-[11px] text-slate-500">
                              {pct(op.observedRoleShare)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">{op.observedArea || "—"}</td>
                      <td className="px-3 py-2">{fmt(op.replenishmentPlates)}</td>
                      <td className="px-3 py-2">{fmt(op.replenishmentPieces)}</td>
                      <td className="px-3 py-2">{fmt(op.receivingPlates)}</td>
                      <td className="px-3 py-2">{fmt(op.receivingPieces)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
