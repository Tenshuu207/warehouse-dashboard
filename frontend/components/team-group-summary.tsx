"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAppState } from "@/lib/app-state";

type TeamResponse = {
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

export default function TeamGroupSummary() {
  const { selectedWeek } = useAppState();
  const [data, setData] = useState<TeamResponse | null>(null);
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
        const json = (await res.json()) as TeamResponse & { details?: string };

        if (!res.ok) {
          throw new Error(json.details || "Failed to load team groups");
        }

        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load team groups");
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
        <h3 className="text-lg font-bold">Observed Team Groups</h3>
        <p className="mt-1 text-sm text-slate-500">Loading team grouping…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl bg-white border shadow-sm p-4">
        <h3 className="text-lg font-bold">Observed Team Groups</h3>
        <p className="mt-1 text-sm text-red-600">{error}</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-white border shadow-sm p-4 space-y-4">
      <div>
        <h3 className="text-lg font-bold">Observed Team Groups</h3>
        <p className="mt-1 text-sm text-slate-500">
          Team grouping built from official assignment plus UserLS observed replenishment roles. Receiving mix is shown as destination context.
        </p>
      </div>

      <div className="space-y-4">
        {(data?.teams || []).map((team) => (
          <section key={team.team} className="rounded-2xl border bg-slate-50/60 p-4 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="text-lg font-semibold">{team.team}</h4>
                <p className="mt-1 text-xs text-slate-500">
                  {team.operatorCount} operators · {fmt(team.replenishmentPlates)} repl plates · {fmt(team.receivingPlates)} receiving plates
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {team.roleGroups.map((group) => (
                <div
                  key={`${team.team}-${group.role}`}
                  className="rounded-full border bg-white px-3 py-1.5 text-xs"
                >
                  <span className="font-medium">{group.role}</span>
                  <span className="text-slate-500">
                    {" · "}
                    {group.operatorCount} ops
                    {" · "}
                    {fmt(group.replenishmentPlates)} repl
                  </span>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px] text-sm">
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
                    <th className="px-3 py-2 font-semibold">Receiving Mix</th>
                  </tr>
                </thead>
                <tbody>
                  {team.operators.map((op) => (
                    <tr key={op.userid} className="border-b last:border-b-0">
                      <td className="px-3 py-2">
                        <Link
                          href={`/operators/${op.userid}`}
                          className="font-medium hover:underline"
                        >
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
                      <td className="px-3 py-2 text-slate-600">{op.receivingMix || "—"}</td>
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
