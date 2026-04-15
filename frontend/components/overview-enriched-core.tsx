"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppState } from "@/lib/app-state";
import PageHeader from "./shared/PageHeader";

type Workload = {
  plates: number;
  pieces: number;
};

type AreaDistributionRow = Workload & {
  area: string;
  receivingPlates: number;
  receivingPieces: number;
  replenishmentPlates: number;
  replenishmentPieces: number;
  plateShare: number;
  pieceShare: number | null;
};

type OverviewSummaryResponse = {
  weekStart: string;
  weekEnd: string;
  resolvedWeekStart: string;
  resolvedWeekEnd: string;
  sourceDates: string[];
  totalWorkload: Workload & {
    operatorCount: number;
    avgPiecesPerPlate: number;
  };
  receivingShare: Workload & {
    plateShare: number;
    pieceShare: number | null;
  };
  replenishmentShare: Workload & {
    plateShare: number;
    pieceShare: number | null;
  };
  areaDistribution: AreaDistributionRow[];
  trendVsPreviousWeek: {
    previousWeekStart: string;
    previousWeekEnd: string;
    previousPlates: number | null;
    previousPieces: number | null;
    plateDelta: number | null;
    pieceDelta: number | null;
    plateDeltaPct: number | null;
    pieceDeltaPct: number | null;
    direction: "up" | "down" | "flat" | "unavailable";
  };
  supportingDetail: {
    topAreas: AreaDistributionRow[];
    includedOperatorCount: number;
    note: string;
  };
};

function fmt(value: number | null | undefined, digits = 0) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function pct(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function signedFmt(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${fmt(value)}`;
}

function trendLabel(direction: OverviewSummaryResponse["trendVsPreviousWeek"]["direction"]) {
  if (direction === "up") return "Heavier";
  if (direction === "down") return "Lighter";
  if (direction === "flat") return "Flat";
  return "No prior week";
}

function MetricBlock({
  title,
  value,
  label,
  children,
  className = "",
}: {
  title: string;
  value: string;
  label: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <div className="text-xs font-semibold uppercase tracking-normal text-slate-500">{title}</div>
      <div className="mt-2 text-3xl font-bold text-slate-950">{value}</div>
      <div className="mt-1 text-sm text-slate-600">{label}</div>
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

function ShareBar({ value, className = "bg-blue-700" }: { value: number; className?: string }) {
  const width = Math.max(0, Math.min(100, value * 100));

  return (
    <div className="h-2 rounded bg-slate-100">
      <div className={`h-2 rounded ${className}`} style={{ width: `${width}%` }} />
    </div>
  );
}

export default function OverviewEnrichedCore() {
  const { selectedWeek } = useAppState();
  const [data, setData] = useState<OverviewSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/dashboard/overview-summary?weekStart=${selectedWeek}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as OverviewSummaryResponse & { details?: string };

        if (!res.ok) {
          throw new Error(json.details || "Failed to load overview summary");
        }

        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load overview summary");
          setLoading(false);
        }
      }
    }

    if (selectedWeek) load();

    return () => {
      cancelled = true;
    };
  }, [selectedWeek]);

  const topAreas = useMemo(() => data?.areaDistribution.slice(0, 5) || [], [data]);
  const otherAreas = Math.max(0, (data?.areaDistribution.length || 0) - topAreas.length);

  if (loading) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-lg font-bold">Overview</h3>
        <p className="mt-1 text-sm text-slate-500">Loading command summary...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-lg font-bold">Overview</h3>
        <p className="mt-1 text-sm text-red-600">{error}</p>
      </section>
    );
  }

  if (!data) return null;

  const trend = data.trendVsPreviousWeek;
  const trendDetail =
    trend.previousPlates === null
      ? `Previous week ${trend.previousWeekStart} to ${trend.previousWeekEnd} is not loaded.`
      : `${signedFmt(trend.plateDelta)} plates, ${signedFmt(trend.pieceDelta)} pieces vs ${trend.previousWeekStart} to ${trend.previousWeekEnd}.`;

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <PageHeader
          title="Overview"
          subtitle={`UserLS command summary for ${data.resolvedWeekStart} to ${data.resolvedWeekEnd}.`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <MetricBlock
          title="Total Workload"
          value={fmt(data.totalWorkload.plates)}
          label={`${fmt(data.totalWorkload.pieces)} pieces across ${fmt(data.totalWorkload.operatorCount)} operators`}
          className="lg:col-span-2"
        >
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-slate-500">Pieces / plate</div>
              <div className="font-semibold text-slate-950">
                {fmt(data.totalWorkload.avgPiecesPerPlate, 2)}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Days loaded</div>
              <div className="font-semibold text-slate-950">{fmt(data.sourceDates.length)}</div>
            </div>
          </div>
        </MetricBlock>

        <MetricBlock
          title="Receiving Share"
          value={pct(data.receivingShare.plateShare)}
          label={`${fmt(data.receivingShare.plates)} plates, ${fmt(data.receivingShare.pieces)} pieces`}
        >
          <ShareBar value={data.receivingShare.plateShare} className="bg-emerald-700" />
        </MetricBlock>

        <MetricBlock
          title="Replenishment Share"
          value={pct(data.replenishmentShare.plateShare)}
          label={`${fmt(data.replenishmentShare.plates)} plates, ${fmt(data.replenishmentShare.pieces)} pieces`}
        >
          <ShareBar value={data.replenishmentShare.plateShare} className="bg-blue-700" />
        </MetricBlock>

        <MetricBlock
          title="Trend"
          value={trendLabel(trend.direction)}
          label={trendDetail}
        >
          <div className="text-sm font-semibold text-slate-950">
            {trend.plateDeltaPct === null ? "—" : `${signedFmt(trend.plateDeltaPct * 100)}%`}
          </div>
        </MetricBlock>
      </div>

      <MetricBlock
        title="Area Distribution"
        value={topAreas[0] ? `${topAreas[0].area} leads` : "No area work"}
        label={
          topAreas[0]
            ? `${pct(topAreas[0].plateShare)} of non-pick plates`
            : "No UserLS non-pick activity found"
        }
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
          {topAreas.map((row) => (
            <div key={row.area} className="min-w-0">
              <div className="flex items-center justify-between gap-2 text-sm">
                <div className="truncate font-semibold text-slate-900">{row.area}</div>
                <div className="text-slate-600">{pct(row.plateShare)}</div>
              </div>
              <ShareBar value={row.plateShare} />
              <div className="mt-1 text-xs text-slate-500">
                {fmt(row.plates)} plates · Rcv {fmt(row.receivingPlates)} · Repl{" "}
                {fmt(row.replenishmentPlates)}
              </div>
            </div>
          ))}
        </div>
        {otherAreas > 0 ? (
          <div className="mt-3 text-xs text-slate-500">
            {fmt(otherAreas)} smaller area{otherAreas === 1 ? "" : "s"} included in totals.
          </div>
        ) : null}
      </MetricBlock>

      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
        {data.supportingDetail.note} Extra remains the fallback for low-confidence or outside-defined
        work.
      </div>
    </section>
  );
}
