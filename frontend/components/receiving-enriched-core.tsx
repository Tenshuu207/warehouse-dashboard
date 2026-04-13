"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAppState } from "@/lib/app-state";
import PageHeader from "./shared/PageHeader";
import StatCard from "./shared/StatCard";

type AreaBucket = {
  areaCode?: string | null;
  receivingPlates?: number;
  receivingPieces?: number;
};

type UserlsTracking = {
  present?: boolean;
  receivingPlates?: number;
  receivingPieces?: number;
  replenishmentNoRecvPlates?: number;
  replenishmentNoRecvPieces?: number;
  areaBuckets?: AreaBucket[];
};

type DailyEnrichedOperator = {
  userid: string;
  name?: string;
  effectiveAssignedArea?: string | null;
  assignedArea?: string | null;
  effectiveAssignedRole?: string | null;
  assignedRole?: string | null;
  receivingPlates?: number;
  receivingPieces?: number;
  totalPlatesNoRecv?: number;
  totalPiecesNoRecv?: number;
  userlsTracking?: UserlsTracking;
};

type DailyEnrichedResponse = {
  date: string;
  operators?: DailyEnrichedOperator[];
};

function fmt(value: number | null | undefined) {
  return Number(value || 0).toLocaleString();
}

function pct(part: number, total: number) {
  if (!total) return "—";
  return `${((part / total) * 100).toFixed(1)}%`;
}

function normalizeOfficialTeam(area?: string | null): string | null {
  const value = String(area || "").trim().toLowerCase();
  if (!value) return null;
  if (value.includes("receiv")) return "Receiving";
  if (value.includes("dry")) return "Dry";
  if (value.includes("cool")) return "Cooler";
  if (value.includes("freez")) return "Freezer";
  return null;
}

function isReceiver(op: DailyEnrichedOperator) {
  const officialTeam =
    normalizeOfficialTeam(op.effectiveAssignedArea) ||
    normalizeOfficialTeam(op.assignedArea);

  if (officialTeam === "Receiving") return true;

  const tracking = op.userlsTracking || {};
  const recv = Number(tracking.receivingPlates ?? op.receivingPlates ?? 0);
  const repl = Number(tracking.replenishmentNoRecvPlates ?? op.totalPlatesNoRecv ?? 0);

  return recv > 0 && recv >= repl;
}

export default function ReceivingEnrichedCore() {
  const { selectedWeek } = useAppState();
  const [data, setData] = useState<DailyEnrichedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/dashboard/daily-enriched?date=${selectedWeek}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as DailyEnrichedResponse & { details?: string };

        if (!res.ok) {
          throw new Error(json.details || "Failed to load enriched receiving data");
        }

        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load enriched receiving data");
          setLoading(false);
        }
      }
    }

    if (selectedWeek) load();

    return () => {
      cancelled = true;
    };
  }, [selectedWeek]);

  const receiverRows = useMemo(() => {
    const operators = data?.operators || [];

    return operators
      .filter(isReceiver)
      .map((op) => {
        const tracking = op.userlsTracking || {};
        const recvPlates = Number(tracking.receivingPlates ?? op.receivingPlates ?? 0);
        const recvPieces = Number(tracking.receivingPieces ?? op.receivingPieces ?? 0);
        const replPlates = Number(tracking.replenishmentNoRecvPlates ?? op.totalPlatesNoRecv ?? 0);
        const replPieces = Number(tracking.replenishmentNoRecvPieces ?? op.totalPiecesNoRecv ?? 0);

        const areaMix = [...(tracking.areaBuckets || [])]
          .filter(
            (bucket) =>
              Number(bucket.receivingPieces || 0) > 0 || Number(bucket.receivingPlates || 0) > 0
          )
          .sort((a, b) => Number(b.receivingPieces || 0) - Number(a.receivingPieces || 0));

        const mixSummary = areaMix
          .slice(0, 3)
          .map((bucket) => {
            const pieces = Number(bucket.receivingPieces || 0);
            return `${bucket.areaCode || "?"} (${pct(pieces, recvPieces)})`;
          })
          .join(", ");

        return {
          userid: op.userid,
          name: op.name || op.userid,
          recvPlates,
          recvPieces,
          replPlates,
          replPieces,
          mixSummary: mixSummary || "—",
          areaMix,
        };
      })
      .filter((row) => row.recvPlates > 0 || row.recvPieces > 0)
      .sort((a, b) => b.recvPieces - a.recvPieces);
  }, [data]);

  const destinationTotals = useMemo(() => {
    const totals = new Map<string, { areaCode: string; plates: number; pieces: number }>();

    for (const row of receiverRows) {
      for (const bucket of row.areaMix) {
        const areaCode = bucket.areaCode || "?";
        const current = totals.get(areaCode) || { areaCode, plates: 0, pieces: 0 };
        current.plates += Number(bucket.receivingPlates || 0);
        current.pieces += Number(bucket.receivingPieces || 0);
        totals.set(areaCode, current);
      }
    }

    return [...totals.values()].sort((a, b) => b.pieces - a.pieces);
  }, [receiverRows]);

  const totals = useMemo(() => {
    return receiverRows.reduce(
      (acc, row) => {
        acc.receivers += 1;
        acc.recvPlates += row.recvPlates;
        acc.recvPieces += row.recvPieces;
        acc.replPlates += row.replPlates;
        acc.replPieces += row.replPieces;
        return acc;
      },
      { receivers: 0, recvPlates: 0, recvPieces: 0, replPlates: 0, replPieces: 0 }
    );
  }, [receiverRows]);

  if (loading) {
    return (
      <section className="rounded-2xl bg-white border shadow-sm p-4">
        <h3 className="text-lg font-bold">Receiving Core (Enriched)</h3>
        <p className="mt-1 text-sm text-slate-500">Loading enriched receiving data…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl bg-white border shadow-sm p-4">
        <h3 className="text-lg font-bold">Receiving Core (Enriched)</h3>
        <p className="mt-1 text-sm text-red-600">{error}</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-white border shadow-sm p-4 space-y-4">
      <PageHeader
        title="Receiving Core (Enriched)"
        subtitle="Main receiving view from enriched daily data. Destination areas come from UserLS area inference."
      />

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <StatCard label="Receivers">{totals.receivers}</StatCard>
        <StatCard label="Receiving Plates">{fmt(totals.recvPlates)}</StatCard>
        <StatCard label="Receiving Pieces">{fmt(totals.recvPieces)}</StatCard>
        <StatCard label="Repl Touch Plates">{fmt(totals.replPlates)}</StatCard>
        <StatCard label="Repl Touch Pieces">{fmt(totals.replPieces)}</StatCard>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-800">Destination Areas</h4>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-slate-50 border-b">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold">Area</th>
                <th className="px-3 py-2 font-semibold">Receiving Plates</th>
                <th className="px-3 py-2 font-semibold">Receiving Pieces</th>
                <th className="px-3 py-2 font-semibold">Piece Share</th>
              </tr>
            </thead>
            <tbody>
              {destinationTotals.map((row) => (
                <tr key={row.areaCode} className="border-b last:border-b-0">
                  <td className="px-3 py-2 font-medium">{row.areaCode}</td>
                  <td className="px-3 py-2">{fmt(row.plates)}</td>
                  <td className="px-3 py-2">{fmt(row.pieces)}</td>
                  <td className="px-3 py-2">{pct(row.pieces, totals.recvPieces)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-800">Receiver Roster</h4>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-slate-50 border-b">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold">Receiver</th>
                <th className="px-3 py-2 font-semibold">Recv Plates</th>
                <th className="px-3 py-2 font-semibold">Recv Pieces</th>
                <th className="px-3 py-2 font-semibold">Destination Mix</th>
                <th className="px-3 py-2 font-semibold">Repl Touch Plates</th>
                <th className="px-3 py-2 font-semibold">Repl Touch Pieces</th>
              </tr>
            </thead>
            <tbody>
              {receiverRows.map((row) => (
                <tr key={row.userid} className="border-b last:border-b-0">
                  <td className="px-3 py-2">
                    <Link href={`/operators/${row.userid}`} className="font-medium hover:underline">
                      {row.name}
                    </Link>
                    <div className="text-[11px] text-slate-500">{row.userid}</div>
                  </td>
                  <td className="px-3 py-2">{fmt(row.recvPlates)}</td>
                  <td className="px-3 py-2">{fmt(row.recvPieces)}</td>
                  <td className="px-3 py-2 text-slate-600">{row.mixSummary}</td>
                  <td className="px-3 py-2">{fmt(row.replPlates)}</td>
                  <td className="px-3 py-2">{fmt(row.replPieces)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
