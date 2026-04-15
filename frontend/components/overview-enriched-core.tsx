"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAppState } from "@/lib/app-state";
import PageHeader from "./shared/PageHeader";
import StatCard from "./shared/StatCard";

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

export default function OverviewEnrichedCore() {
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

        const res = await fetch(`/api/dashboard/team-groups?date=${selectedWeek}&source=userls`, {
          cache: "no-store",
        });
        const json = (await res.json()) as TeamGroupsResponse & { details?: string };

        if (!res.ok) {
          throw new Error(json.details || "Failed to load overview enriched data");
        }

        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load overview enriched data");
          setLoading(false);
        }
      }
    }

    if (selectedWeek) load();

    return () => {
      cancelled = true;
    };
  }, [selectedWeek]);

  const summary = useMemo(() => {
    const teams = data?.teams || [];

    return teams.reduce(
      (acc, team) => {
        acc.teams += 1;
        acc.operators += team.operatorCount;
        acc.replPlates += team.replenishmentPlates;
        acc.replPieces += team.replenishmentPieces;
        acc.recvPlates += team.receivingPlates;
        acc.recvPieces += team.receivingPieces;
        return acc;
      },
      {
        teams: 0,
        operators: 0,
        replPlates: 0,
        replPieces: 0,
        recvPlates: 0,
        recvPieces: 0,
      }
    );
  }, [data]);

  const flattenedRoles = useMemo(() => {
    const totals = new Map<
      string,
      {
        role: string;
        operatorCount: number;
        replenishmentPlates: number;
        replenishmentPieces: number;
        receivingPlates: number;
        receivingPieces: number;
      }
    >();

    for (const team of data?.teams || []) {
      for (const group of team.roleGroups || []) {
        const current = totals.get(group.role) || {
          role: group.role,
          operatorCount: 0,
          replenishmentPlates: 0,
          replenishmentPieces: 0,
          receivingPlates: 0,
          receivingPieces: 0,
        };

        current.operatorCount += Number(group.operatorCount || 0);
        current.replenishmentPlates += Number(group.replenishmentPlates || 0);
        current.replenishmentPieces += Number(group.replenishmentPieces || 0);
        current.receivingPlates += Number(group.receivingPlates || 0);
        current.receivingPieces += Number(group.receivingPieces || 0);

        totals.set(group.role, current);
      }
    }

    return [...totals.values()].sort((a, b) => {
      const replDiff = b.replenishmentPlates - a.replenishmentPlates;
      if (replDiff !== 0) return replDiff;
      return a.role.localeCompare(b.role);
    });
  }, [data]);

  const topOperators = useMemo(() => {
    const rows =
      data?.teams.flatMap((team) =>
        (team.operators || []).map((op) => ({
          ...op,
          team: team.team,
        }))
      ) || [];

    return rows
      .filter(
        (op) =>
          Number(op.replenishmentPlates || 0) > 0 ||
          Number(op.replenishmentPieces || 0) > 0
      )
      .sort((a, b) => {
        const replDiff = Number(b.replenishmentPlates || 0) - Number(a.replenishmentPlates || 0);
        if (replDiff !== 0) return replDiff;
        const recvDiff = Number(b.receivingPieces || 0) - Number(a.receivingPieces || 0);
        if (recvDiff !== 0) return recvDiff;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 15);
  }, [data]);

  if (loading) {
    return (
      <section className="rounded-2xl bg-white border shadow-sm p-4">
        <h3 className="text-lg font-bold">Overview Core (Enriched)</h3>
        <p className="mt-1 text-sm text-slate-500">Loading enriched overview data…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl bg-white border shadow-sm p-4">
        <h3 className="text-lg font-bold">Overview Core (Enriched)</h3>
        <p className="mt-1 text-sm text-red-600">{error}</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-white border shadow-sm p-4 space-y-4">
      <PageHeader
        title="Overview Core (Enriched)"
        subtitle="Main weekly snapshot from enriched team grouping, observed replenishment roles, and receiving destination context."
      />

      <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
        <StatCard label="Teams">{summary.teams}</StatCard>
        <StatCard label="Operators">{summary.operators}</StatCard>
        <StatCard label="Repl Plates">{fmt(summary.replPlates)}</StatCard>
        <StatCard label="Repl Pieces">{fmt(summary.replPieces)}</StatCard>
        <StatCard label="Receiving Plates">{fmt(summary.recvPlates)}</StatCard>
        <StatCard label="Receiving Pieces">{fmt(summary.recvPieces)}</StatCard>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-800">Team Snapshot</h4>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="bg-slate-50 border-b">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold">Team</th>
                <th className="px-3 py-2 font-semibold">Operators</th>
                <th className="px-3 py-2 font-semibold">Repl Plates</th>
                <th className="px-3 py-2 font-semibold">Repl Pieces</th>
                <th className="px-3 py-2 font-semibold">Recv Plates</th>
                <th className="px-3 py-2 font-semibold">Recv Pieces</th>
                <th className="px-3 py-2 font-semibold">Primary Groups</th>
              </tr>
            </thead>
            <tbody>
              {(data?.teams || []).map((team) => (
                <tr key={team.team} className="border-b last:border-b-0">
                  <td className="px-3 py-2 font-medium">{team.team}</td>
                  <td className="px-3 py-2">{fmt(team.operatorCount)}</td>
                  <td className="px-3 py-2">{fmt(team.replenishmentPlates)}</td>
                  <td className="px-3 py-2">{fmt(team.replenishmentPieces)}</td>
                  <td className="px-3 py-2">{fmt(team.receivingPlates)}</td>
                  <td className="px-3 py-2">{fmt(team.receivingPieces)}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {(team.roleGroups || [])
                      .slice(0, 3)
                      .map((group) => `${group.role} (${fmt(group.replenishmentPlates)})`)
                      .join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-800">Observed Role Snapshot</h4>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="bg-slate-50 border-b">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold">Role</th>
                <th className="px-3 py-2 font-semibold">Operators</th>
                <th className="px-3 py-2 font-semibold">Repl Plates</th>
                <th className="px-3 py-2 font-semibold">Repl Pieces</th>
                <th className="px-3 py-2 font-semibold">Recv Plates</th>
                <th className="px-3 py-2 font-semibold">Recv Pieces</th>
              </tr>
            </thead>
            <tbody>
              {flattenedRoles.slice(0, 12).map((role) => (
                <tr key={role.role} className="border-b last:border-b-0">
                  <td className="px-3 py-2 font-medium">{role.role}</td>
                  <td className="px-3 py-2">{fmt(role.operatorCount)}</td>
                  <td className="px-3 py-2">{fmt(role.replenishmentPlates)}</td>
                  <td className="px-3 py-2">{fmt(role.replenishmentPieces)}</td>
                  <td className="px-3 py-2">{fmt(role.receivingPlates)}</td>
                  <td className="px-3 py-2">{fmt(role.receivingPieces)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-800">Top Operators by Replenishment</h4>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[1200px] text-sm">
            <thead className="bg-slate-50 border-b">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold">Operator</th>
                <th className="px-3 py-2 font-semibold">Team</th>
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
              {topOperators.map((op) => (
                <tr key={op.userid} className="border-b last:border-b-0">
                  <td className="px-3 py-2">
                    <Link href={`/operators/${op.userid}`} className="font-medium hover:underline">
                      {op.name}
                    </Link>
                    <div className="text-[11px] text-slate-500">{op.userid}</div>
                  </td>
                  <td className="px-3 py-2">{op.team}</td>
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
      </div>
    </section>
  );
}
