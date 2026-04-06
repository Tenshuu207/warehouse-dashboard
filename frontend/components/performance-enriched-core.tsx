"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

export default function PerformanceEnrichedCore() {
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
          throw new Error(json.details || "Failed to load enriched performance data");
        }

        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load enriched performance data"
          );
          setLoading(false);
        }
      }
    }

    if (selectedWeek) load();

    return () => {
      cancelled = true;
    };
  }, [selectedWeek]);

  const performanceTeams = useMemo(
    () => (data?.teams || []).filter((team) => team.team !== "Receiving"),
    [data]
  );

  const totals = useMemo(() => {
    return performanceTeams.reduce(
      (acc, team) => {
        acc.teams += 1;
        acc.operators += team.operatorCount;
        acc.replPlates += team.replenishmentPlates;
        acc.replPieces += team.replenishmentPieces;
        return acc;
      },
      { teams: 0, operators: 0, replPlates: 0, replPieces: 0 }
    );
  }, [performanceTeams]);

  if (loading) {
    return (
      <section className="rounded-2xl bg-white border shadow-sm p-4">
        <h3 className="text-lg font-bold">Performance Core (Enriched)</h3>
        <p className="mt-1 text-sm text-slate-500">Loading enriched performance data…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl bg-white border shadow-sm p-4">
        <h3 className="text-lg font-bold">Performance Core (Enriched)</h3>
        <p className="mt-1 text-sm text-red-600">{error}</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-white border shadow-sm p-4 space-y-4">
      <div>
        <h3 className="text-lg font-bold">Performance Core (Enriched)</h3>
        <p className="mt-1 text-sm text-slate-500">
          Main performance snapshot from enriched team and observed role grouping.
        </p>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-slate-50 p-3 text-center">
          <div className="text-[11px] text-slate-500">Teams</div>
          <div className="mt-2 text-2xl font-semibold">{totals.teams}</div>
        </div>
        <div className="rounded-xl border bg-slate-50 p-3 text-center">
          <div className="text-[11px] text-slate-500">Operators</div>
          <div className="mt-2 text-2xl font-semibold">{totals.operators}</div>
        </div>
        <div className="rounded-xl border bg-slate-50 p-3 text-center">
          <div className="text-[11px] text-slate-500">Repl Plates</div>
          <div className="mt-2 text-2xl font-semibold">{fmt(totals.replPlates)}</div>
        </div>
        <div className="rounded-xl border bg-slate-50 p-3 text-center">
          <div className="text-[11px] text-slate-500">Repl Pieces</div>
          <div className="mt-2 text-2xl font-semibold">{fmt(totals.replPieces)}</div>
        </div>
      </div>

      <div className="space-y-4">
        {performanceTeams.map((team) => (
          <section key={team.team} className="rounded-2xl border bg-slate-50/60 p-4 space-y-4">
            <div>
              <h4 className="text-lg font-semibold">{team.team}</h4>
              <p className="mt-1 text-xs text-slate-500">
                {team.operatorCount} operators · {fmt(team.replenishmentPlates)} repl plates · {fmt(team.replenishmentPieces)} repl pieces
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
