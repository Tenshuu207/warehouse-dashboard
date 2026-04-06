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

export default function ReceivingDestinationSummary() {
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
          throw new Error(json.details || "Failed to load receiving destination summary");
        }

        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load receiving destination summary"
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

  if (loading) {
    return (
      <section className="rounded-2xl bg-white border shadow-sm p-4">
        <h3 className="text-lg font-bold">Receiving Destination Summary</h3>
        <p className="mt-1 text-sm text-slate-500">Loading receiving destination mix…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl bg-white border shadow-sm p-4">
        <h3 className="text-lg font-bold">Receiving Destination Summary</h3>
        <p className="mt-1 text-sm text-red-600">{error}</p>
      </section>
    );
  }

  const receivingTeam = data?.teams.find((team) => team.team === "Receiving") || null;

  if (!receivingTeam) {
    return (
      <section className="rounded-2xl bg-white border shadow-sm p-4">
        <h3 className="text-lg font-bold">Receiving Destination Summary</h3>
        <p className="mt-1 text-sm text-slate-500">
          No receiving group data is available for {selectedWeek}.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-white border shadow-sm p-4 space-y-4">
      <div>
        <h3 className="text-lg font-bold">Receiving Destination Summary</h3>
        <p className="mt-1 text-sm text-slate-500">
          Receiver totals with destination-area mix from UserLS-enriched data.
        </p>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-slate-50 p-3 text-center">
          <div className="text-[11px] text-slate-500">Receivers</div>
          <div className="mt-2 text-2xl font-semibold">{receivingTeam.operatorCount}</div>
        </div>
        <div className="rounded-xl border bg-slate-50 p-3 text-center">
          <div className="text-[11px] text-slate-500">Receiving Plates</div>
          <div className="mt-2 text-2xl font-semibold">{fmt(receivingTeam.receivingPlates)}</div>
        </div>
        <div className="rounded-xl border bg-slate-50 p-3 text-center">
          <div className="text-[11px] text-slate-500">Receiving Pieces</div>
          <div className="mt-2 text-2xl font-semibold">{fmt(receivingTeam.receivingPieces)}</div>
        </div>
        <div className="rounded-xl border bg-slate-50 p-3 text-center">
          <div className="text-[11px] text-slate-500">Repl Touches</div>
          <div className="mt-2 text-2xl font-semibold">{fmt(receivingTeam.replenishmentPlates)}</div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-slate-50 border-b">
            <tr className="text-left">
              <th className="px-3 py-2 font-semibold">Receiver</th>
              <th className="px-3 py-2 font-semibold">Role Group</th>
              <th className="px-3 py-2 font-semibold">Recv Plates</th>
              <th className="px-3 py-2 font-semibold">Recv Pieces</th>
              <th className="px-3 py-2 font-semibold">Destination Mix</th>
              <th className="px-3 py-2 font-semibold">Repl Touches</th>
              <th className="px-3 py-2 font-semibold">Observed Area</th>
            </tr>
          </thead>
          <tbody>
            {receivingTeam.operators.map((op) => (
              <tr key={op.userid} className="border-b last:border-b-0">
                <td className="px-3 py-2">
                  <Link href={`/operators/${op.userid}`} className="font-medium hover:underline">
                    {op.name}
                  </Link>
                  <div className="text-[11px] text-slate-500">{op.userid}</div>
                </td>
                <td className="px-3 py-2">{op.roleGroup}</td>
                <td className="px-3 py-2">{fmt(op.receivingPlates)}</td>
                <td className="px-3 py-2">{fmt(op.receivingPieces)}</td>
                <td className="px-3 py-2 text-slate-600">{op.receivingMix || "—"}</td>
                <td className="px-3 py-2">{fmt(op.replenishmentPlates)}</td>
                <td className="px-3 py-2">{op.observedArea || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
