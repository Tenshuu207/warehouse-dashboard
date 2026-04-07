"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAppState } from "@/lib/app-state";
import ContextBadge from "@/components/shared/ContextBadge";
import DetailDisclosure from "@/components/shared/DetailDisclosure";
import SectionBlock from "@/components/shared/SectionBlock";
import StatCard from "@/components/shared/StatCard";

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

  const totals = useMemo(() => {
    const teams = data?.teams || [];

    return {
      teams: teams.length,
      operators: teams.reduce((sum, team) => sum + Number(team.operatorCount || 0), 0),
      replenishmentPlates: teams.reduce(
        (sum, team) => sum + Number(team.replenishmentPlates || 0),
        0
      ),
      replenishmentPieces: teams.reduce(
        (sum, team) => sum + Number(team.replenishmentPieces || 0),
        0
      ),
      receivingPlates: teams.reduce((sum, team) => sum + Number(team.receivingPlates || 0), 0),
      receivingPieces: teams.reduce((sum, team) => sum + Number(team.receivingPieces || 0), 0),
    };
  }, [data]);

  if (loading) {
    return (
      <SectionBlock
        title="Observed Team Groups"
        subtitle="Team grouping built from official assignment plus UserLS observed replenishment roles. Receiving mix is shown as destination context."
      >
        <div className="text-sm text-slate-500">Loading team grouping…</div>
      </SectionBlock>
    );
  }

  if (error) {
    return (
      <SectionBlock
        title="Observed Team Groups"
        subtitle="Team grouping built from official assignment plus UserLS observed replenishment roles. Receiving mix is shown as destination context."
      >
        <div className="text-sm text-red-600">{error}</div>
      </SectionBlock>
    );
  }

  return (
    <SectionBlock
      title="Observed Team Groups"
      subtitle="Team grouping built from official assignment plus UserLS observed replenishment roles. Receiving mix is shown as destination context."
    >
      <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
        <StatCard label="Teams">{totals.teams}</StatCard>
        <StatCard label="Operators">{totals.operators}</StatCard>
        <StatCard label="Repl Plates">{fmt(totals.replenishmentPlates)}</StatCard>
        <StatCard label="Repl Pieces">{fmt(totals.replenishmentPieces)}</StatCard>
        <StatCard label="Receiving Plates">{fmt(totals.receivingPlates)}</StatCard>
        <StatCard label="Receiving Pieces">{fmt(totals.receivingPieces)}</StatCard>
      </div>

      <div className="space-y-4">
        {(data?.teams || []).map((team) => {
          const receivingContextCount = team.operators.filter((op) => !!op.receivingMix).length;

          return (
            <div key={team.team} className="rounded-2xl border bg-slate-50/60 p-4 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-lg font-semibold text-slate-900">{team.team}</div>
                  <div className="mt-1 text-sm text-slate-500">
                    {team.operatorCount} operators grouped under official team context
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <ContextBadge variant="home-team">Official Team: {team.team}</ContextBadge>
                  <ContextBadge variant="context">
                    Role Groups: {team.roleGroups.length}
                  </ContextBadge>
                  <ContextBadge variant="context">
                    Receiving Context: {receivingContextCount}
                  </ContextBadge>
                </div>
              </div>

              <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
                <StatCard label="Operators">{team.operatorCount}</StatCard>
                <StatCard label="Repl Plates">{fmt(team.replenishmentPlates)}</StatCard>
                <StatCard label="Repl Pieces">{fmt(team.replenishmentPieces)}</StatCard>
                <StatCard label="Receiving Plates">{fmt(team.receivingPlates)}</StatCard>
                <StatCard label="Receiving Pieces">{fmt(team.receivingPieces)}</StatCard>
              </div>

              <div className="flex flex-wrap gap-2">
                {team.roleGroups.length === 0 ? (
                  <ContextBadge variant="neutral">No observed role groups</ContextBadge>
                ) : (
                  team.roleGroups.map((group) => (
                    <ContextBadge
                      key={`${team.team}-${group.role}`}
                      variant="observed-role"
                    >
                      {group.role} · {group.operatorCount} ops · {fmt(group.replenishmentPlates)} repl
                    </ContextBadge>
                  ))
                )}
              </div>

              <DetailDisclosure
                title="Operator Roster"
                meta={`${team.operators.length} operators · receiving mix remains context, not automatic team truth`}
              >
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1250px] text-sm">
                    <thead className="border-b bg-white">
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
                        <tr key={op.userid} className="border-b last:border-b-0 bg-white">
                          <td className="px-3 py-2 align-top">
                            <Link
                              href={`/operators/${op.userid}`}
                              className="font-medium hover:underline"
                            >
                              {op.name}
                            </Link>
                            <div className="mt-1 text-[11px] text-slate-500">{op.userid}</div>
                          </td>

                          <td className="px-3 py-2 align-top">
                            <ContextBadge variant="home-team">{op.roleGroup}</ContextBadge>
                          </td>

                          <td className="px-3 py-2 align-top">
                            {op.observedRole ? (
                              <div className="space-y-1">
                                <ContextBadge variant="observed-role">
                                  {op.observedRole}
                                </ContextBadge>
                                <div className="text-[11px] text-slate-500">
                                  {pct(op.observedRoleShare)}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          <td className="px-3 py-2 align-top">
                            {op.observedArea ? (
                              <ContextBadge variant="observed-team">
                                {op.observedArea}
                              </ContextBadge>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          <td className="px-3 py-2 align-top">{fmt(op.replenishmentPlates)}</td>
                          <td className="px-3 py-2 align-top">{fmt(op.replenishmentPieces)}</td>
                          <td className="px-3 py-2 align-top">{fmt(op.receivingPlates)}</td>
                          <td className="px-3 py-2 align-top">{fmt(op.receivingPieces)}</td>

                          <td className="px-3 py-2 align-top text-slate-600">
                            {op.receivingMix ? (
                              <div className="max-w-[280px] whitespace-normal">
                                {op.receivingMix}
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </DetailDisclosure>
            </div>
          );
        })}
      </div>
    </SectionBlock>
  );
}
