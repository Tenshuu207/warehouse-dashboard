"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAppState } from "@/lib/app-state";
import { rangeHref, resolveContextRange } from "@/lib/date-range";
import {
  resolveDisplayRoleLabel,
  resolveOperationalAreaGroup,
} from "@/lib/area-labels";
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
    letdownPlates?: number;
    letdownPieces?: number;
    putawayPlates?: number;
    putawayPieces?: number;
    restockPlates?: number;
    restockPieces?: number;
    restockPlatesRaw?: number;
    restockPiecesRaw?: number;
    restockLikePlatesEstimated?: number;
    restockLikePiecesEstimated?: number;
    bulkMovePlates?: number;
    bulkMovePieces?: number;
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
      letdownPlates?: number;
      letdownPieces?: number;
      putawayPlates?: number;
      putawayPieces?: number;
      restockPlates?: number;
      restockPieces?: number;
      restockPlatesRaw?: number;
      restockPiecesRaw?: number;
      restockLikePlatesEstimated?: number;
      restockLikePiecesEstimated?: number;
      bulkMovePlates?: number;
      bulkMovePieces?: number;
    }>;
  }>;
};

type Metric = "Plates" | "Pieces";

const CHART_COLORS = ["#2563eb", "#0f766e", "#f97316", "#7c3aed", "#0891b2", "#475569"];

function fmt(value: number | null | undefined) {
  return Number(value || 0).toLocaleString();
}

function num(value: unknown) {
  return Number(value || 0);
}

function firstNum(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return num(record[key]);
    }
  }

  return 0;
}

function chartFmt(value: unknown) {
  return fmt(Number(value || 0));
}

function metricValue(record: { Plates: number; Pieces: number }, metric: Metric) {
  return metric === "Plates" ? record.Plates : record.Pieces;
}

function normalizeToken(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function activityValue(record: Record<string, unknown>, activity: string, unit: "Plates" | "Pieces") {
  if (activity === "Letdowns") return num(record[`letdown${unit}`]);
  if (activity === "Putaways") return num(record[`putaway${unit}`]);
  if (activity === "Restocks") {
    return firstNum(record, `restock${unit}Raw`, `restock${unit}`);
  }

  return firstNum(
    record,
    `bulkMove${unit}`,
    `restockLike${unit}Estimated`,
    `restockLike${unit}`
  );
}

function groupedAreaLabel(value: unknown) {
  const group = resolveOperationalAreaGroup(value);
  if (group?.label === "Dry" || group?.label === "Cooler" || group?.label === "Freezer") {
    return group.label;
  }

  const token = normalizeToken(value);
  if (!token) return null;
  if (token.startsWith("1") || token.startsWith("5") || token.includes("dry")) return "Dry";
  if (
    token.startsWith("2") ||
    token.startsWith("3") ||
    token.startsWith("4") ||
    token.includes("cooler") ||
    token.includes("produce") ||
    token.includes("chicken") ||
    token.includes("icedproduct")
  ) {
    return "Cooler";
  }
  if (token.startsWith("6") || token.startsWith("7") || token.startsWith("frz") || token.includes("freezer")) {
    return "Freezer";
  }

  return null;
}

function receivingDestinationLabel(value: unknown) {
  const raw = String(value || "").trim();
  const token = normalizeToken(raw);

  if (!token) return null;
  if (raw === "7" || token.startsWith("7") || token.startsWith("frzpir") || token.includes("freezerpir")) {
    return "Freezer PIR";
  }
  if (raw === "6" || token.startsWith("6") || token.startsWith("frz") || token.includes("freezer")) {
    return "Freezer";
  }
  if (raw === "5" || token.startsWith("5") || token.startsWith("drypir")) return "Dry PIR";
  if (raw === "1" || token.startsWith("1") || token.startsWith("dry")) return "Dry";
  if (
    raw === "2" ||
    raw === "3" ||
    token.startsWith("2") ||
    token.startsWith("3") ||
    token.includes("cooler") ||
    token.startsWith("clr") ||
    token.includes("chicken") ||
    token.includes("icedproduct")
  ) {
    return "Cooler";
  }
  if (raw === "4" || token.startsWith("4") || token.includes("produce")) return "Produce";

  return null;
}

function groupedDestinationLabel(value: unknown) {
  const destination = receivingDestinationLabel(value);
  return groupedAreaLabel(destination || value);
}

function cleanedRolePerformanceLabel(value: unknown) {
  return resolveDisplayRoleLabel(value) || "Mixed/Other";
}

function addMixShare(grouped: Map<string, number>, areaValue: unknown, weightValue: unknown = 1) {
  const label = receivingDestinationLabel(areaValue);
  if (!label) return;

  const parsedWeight =
    typeof weightValue === "number"
      ? weightValue
      : Number(String(weightValue || "").replace(/[%\s,]+/g, ""));
  const weight = Number.isFinite(parsedWeight) && parsedWeight > 0 ? parsedWeight : 1;
  grouped.set(label, (grouped.get(label) || 0) + weight);
}

function parseReceivingMix(value: unknown) {
  const raw = String(value || "").trim();
  const grouped = new Map<string, number>();

  if (!raw) return [];

  for (const segment of raw.split(/[,;|]+/)) {
    const text = segment.trim();
    if (!text) continue;

    const pairMatch =
      text.match(/^(.+?)\s*[:=]\s*(\d+(?:\.\d+)?%?)$/) ||
      text.match(/^(.+?)\s*\((\d+(?:\.\d+)?)%\)$/) ||
      text.match(/^(.+?)\s+(\d+(?:\.\d+)?)%$/);

    if (pairMatch) {
      addMixShare(grouped, pairMatch[1], pairMatch[2]);
    } else {
      addMixShare(grouped, text, 1);
    }
  }

  return [...grouped.entries()].map(([label, weight]) => ({ label, weight }));
}

function splitByMix(total: number, mix: Array<{ label: string; weight: number }>) {
  const roundedTotal = Math.round(total);
  if (!roundedTotal || mix.length === 0) return new Map<string, number>();

  const weightTotal = mix.reduce((sum, item) => sum + item.weight, 0);
  if (weightTotal <= 0) return new Map<string, number>();

  const allocations = mix.map((item) => {
    const exact = (roundedTotal * item.weight) / weightTotal;
    const whole = Math.floor(exact);
    return {
      label: item.label,
      whole,
      remainder: exact - whole,
    };
  });

  let remaining = roundedTotal - allocations.reduce((sum, item) => sum + item.whole, 0);
  allocations
    .sort((a, b) => {
      const diff = b.remainder - a.remainder;
      if (diff !== 0) return diff;
      return a.label.localeCompare(b.label);
    })
    .forEach((item) => {
      if (remaining <= 0) return;
      item.whole += 1;
      remaining -= 1;
    });

  return allocations.reduce((map, item) => {
    map.set(item.label, item.whole);
    return map;
  }, new Map<string, number>());
}

function ChartPanel({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </div>
      {children}
      {footer ? <div className="mt-3 text-xs text-slate-500">{footer}</div> : null}
    </section>
  );
}

function ChartFrame({
  height = 320,
  children,
}: {
  height?: number;
  children: (size: { width: number; height: number }) => React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const updateWidth = () => {
      setWidth(Math.max(0, Math.floor(element.getBoundingClientRect().width)));
    };

    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      setWidth(Math.max(0, Math.floor(entry?.contentRect.width || 0)));
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="min-w-0 w-full"
      style={{ height, minHeight: height }}
    >
      {width > 0 ? (
        children({ width, height })
      ) : (
        <div className="h-full rounded-xl bg-slate-50" aria-hidden="true" />
      )}
    </div>
  );
}

function MetricToggle({
  metric,
  onChange,
}: {
  metric: Metric;
  onChange: (metric: Metric) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
      {(["Plates", "Pieces"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            metric === option
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-600 hover:bg-white hover:text-slate-900"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export default function OverviewEnrichedCore() {
  const { selectedWeek } = useAppState();
  const [data, setData] = useState<TeamGroupsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>("Plates");
  const range = resolveContextRange(selectedWeek, null);

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

  const activityMix = useMemo(() => {
    const activities = ["Letdowns", "Putaways", "Restocks", "Bulk Move"];
    const teamRecords = (data?.teams || []) as Array<Record<string, unknown>>;
    const operatorRecords = (data?.teams || []).flatMap((team) => team.operators || []) as Array<
      Record<string, unknown>
    >;

    return activities.map((activity) => {
      const teamHasActivity = teamRecords.some((record) => {
        return activityValue(record, activity, "Plates") > 0 || activityValue(record, activity, "Pieces") > 0;
      });
      const records = teamHasActivity ? teamRecords : operatorRecords;

      return {
        activity,
        Plates: records.reduce((sum, record) => sum + activityValue(record, activity, "Plates"), 0),
        Pieces: records.reduce((sum, record) => sum + activityValue(record, activity, "Pieces"), 0),
      };
    });
  }, [data]);

  const activityMixChart = useMemo(
    () =>
      activityMix
        .map((row) => ({
          name: row.activity,
          value: metricValue(row, metric),
        }))
        .filter((row) => row.value > 0),
    [activityMix, metric]
  );

  const groupedAreaTotals = useMemo(() => {
    const grouped = new Map<
      string,
      {
        area: string;
        ReplenishmentPlates: number;
        ReplenishmentPieces: number;
        ReceivingPlates: number;
        ReceivingPieces: number;
        Plates: number;
        Pieces: number;
      }
    >();

    for (const label of ["Dry", "Cooler", "Freezer"]) {
      grouped.set(label, {
        area: label,
        ReplenishmentPlates: 0,
        ReplenishmentPieces: 0,
        ReceivingPlates: 0,
        ReceivingPieces: 0,
        Plates: 0,
        Pieces: 0,
      });
    }

    for (const team of data?.teams || []) {
      for (const op of team.operators || []) {
        const fallbackArea =
          groupedAreaLabel(op.observedArea) ||
          groupedAreaLabel(op.officialTeam) ||
          groupedAreaLabel(team.team);

        if (fallbackArea) {
          const row = grouped.get(fallbackArea)!;
          row.ReplenishmentPlates += Number(op.replenishmentPlates || 0);
          row.ReplenishmentPieces += Number(op.replenishmentPieces || 0);
          row.Plates += Number(op.replenishmentPlates || 0);
          row.Pieces += Number(op.replenishmentPieces || 0);
        }

        const receivingPlates = Number(op.receivingPlates || 0);
        const receivingPieces = Number(op.receivingPieces || 0);
        if (!receivingPlates && !receivingPieces) continue;

        const mix = parseReceivingMix(op.receivingMix);

        if (mix.length > 0) {
          const plateSplits = splitByMix(receivingPlates, mix);
          const pieceSplits = splitByMix(receivingPieces, mix);

          for (const [destination, plates] of plateSplits) {
            const area = groupedDestinationLabel(destination);
            if (!area) continue;

            const row = grouped.get(area)!;
            row.ReceivingPlates += plates;
            row.Plates += plates;
          }

          for (const [destination, pieces] of pieceSplits) {
            const area = groupedDestinationLabel(destination);
            if (!area) continue;

            const row = grouped.get(area)!;
            row.ReceivingPieces += pieces;
            row.Pieces += pieces;
          }

          continue;
        }

        if (!fallbackArea) continue;

        const row = grouped.get(fallbackArea)!;
        row.ReceivingPlates += receivingPlates;
        row.ReceivingPieces += receivingPieces;
        row.Plates += receivingPlates;
        row.Pieces += receivingPieces;
      }
    }

    return [...grouped.values()];
  }, [data]);

  const groupedAreaComparison = useMemo(
    () =>
      groupedAreaTotals.map((row) => ({
        area: row.area,
        Replenishment: metric === "Plates" ? row.ReplenishmentPlates : row.ReplenishmentPieces,
        Receiving: metric === "Plates" ? row.ReceivingPlates : row.ReceivingPieces,
      })),
    [groupedAreaTotals, metric]
  );

  const groupedAreaShare = useMemo(
    () =>
      groupedAreaTotals
        .map((row) => ({
          name: row.area,
          value: metricValue(row, metric),
        }))
        .filter((row) => row.value > 0),
    [groupedAreaTotals, metric]
  );

  const hasGroupedAreaComparison = groupedAreaComparison.some(
    (row) => row.Replenishment > 0 || row.Receiving > 0
  );

  const receivingByDestination = useMemo(() => {
    const destinations = ["Freezer", "Freezer PIR", "Dry", "Dry PIR", "Cooler", "Produce"];
    const grouped = new Map(
      destinations.map((destination) => [
        destination,
        {
          destination,
          Plates: 0,
          Pieces: 0,
        },
      ])
    );

    for (const team of data?.teams || []) {
      for (const op of team.operators || []) {
        const receivingPlates = Number(op.receivingPlates || 0);
        if (!receivingPlates) continue;

        const mix = parseReceivingMix(op.receivingMix);

        if (mix.length > 0) {
          const plateSplits = splitByMix(receivingPlates, mix);
          const pieceSplits = splitByMix(Number(op.receivingPieces || 0), mix);

          for (const destination of destinations) {
            const row = grouped.get(destination)!;
            row.Plates += plateSplits.get(destination) || 0;
            row.Pieces += pieceSplits.get(destination) || 0;
          }
          continue;
        }

        const fallbackDestination =
          receivingDestinationLabel(op.observedArea) ||
          receivingDestinationLabel(op.officialTeam) ||
          receivingDestinationLabel(team.team);

        if (!fallbackDestination) continue;

        const row = grouped.get(fallbackDestination)!;
        row.Plates += receivingPlates;
        row.Pieces += Number(op.receivingPieces || 0);
      }
    }

    return destinations
      .map((destination) => grouped.get(destination)!)
      .filter((row) => row.Plates > 0 || row.Pieces > 0);
  }, [data]);

  const receivingByDestinationChart = useMemo(
    () =>
      receivingByDestination
        .map((row) => ({
          destination: row.destination,
          value: metricValue(row, metric),
        }))
        .filter((row) => row.value > 0),
    [receivingByDestination, metric]
  );

  const rolePerformance = useMemo(() => {
    const grouped = new Map<
      string,
      {
        role: string;
        Plates: number;
        Pieces: number;
      }
    >();

    for (const team of data?.teams || []) {
      for (const group of team.roleGroups || []) {
        const label = cleanedRolePerformanceLabel(group.role);
        const row = grouped.get(label) || {
          role: label,
          Plates: 0,
          Pieces: 0,
        };

        row.Plates += Number(group.replenishmentPlates || 0);
        row.Pieces += Number(group.replenishmentPieces || 0);
        grouped.set(label, row);
      }
    }

    const sorted = [...grouped.values()].sort((a, b) => {
      const metricDiff = metricValue(b, metric) - metricValue(a, metric);
      if (metricDiff !== 0) return metricDiff;
      return a.role.localeCompare(b.role);
    });
    const top = sorted.slice(0, 7);
    const rest = sorted.slice(7);

    if (rest.length > 0) {
      const mixedOther = top.find((row) => row.role === "Mixed/Other");
      const restTotal = rest.reduce(
        (acc, row) => {
          acc.Plates += row.Plates;
          acc.Pieces += row.Pieces;
          return acc;
        },
        { role: "Mixed/Other", Plates: 0, Pieces: 0 }
      );

      if (mixedOther) {
        mixedOther.Plates += restTotal.Plates;
        mixedOther.Pieces += restTotal.Pieces;
      } else {
        top.push(restTotal);
      }
    }

    return top
      .map((row) => ({
        role: row.role,
        value: metricValue(row, metric),
      }))
      .filter((row) => row.value > 0);
  }, [data, metric]);

  if (loading) {
    return (
      <section className="rounded-2xl bg-white border shadow-sm p-4">
        <h3 className="text-lg font-bold">Summary View</h3>
        <p className="mt-1 text-sm text-slate-500">Loading summary data...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl bg-white border shadow-sm p-4">
        <h3 className="text-lg font-bold">Summary View</h3>
        <p className="mt-1 text-sm text-red-600">{error}</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-white border shadow-sm p-4 space-y-4">
      <PageHeader
        title="Summary View"
        subtitle="Chart-first weekly snapshot for activity mix, grouped areas, receiving destinations, and role performance."
      />

      <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
        <StatCard label="Teams">{summary.teams}</StatCard>
        <StatCard label="Operators">{summary.operators}</StatCard>
        <StatCard label="Repl Plates">{fmt(summary.replPlates)}</StatCard>
        <StatCard label="Repl Pieces">{fmt(summary.replPieces)}</StatCard>
        <StatCard label="Receiving Plates">{fmt(summary.recvPlates)}</StatCard>
        <StatCard label="Receiving Pieces">{fmt(summary.recvPieces)}</StatCard>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Metric</div>
          <p className="mt-1 text-xs text-slate-500">
            Applies to activity, area, receiving, and role performance charts.
          </p>
        </div>
        <MetricToggle metric={metric} onChange={setMetric} />
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
        {activityMixChart.length > 0 ? (
          <ChartPanel
            title="Activity Mix"
            description={`${metric} composition across displayed activity buckets.`}
          >
            <ChartFrame height={320}>
              {({ width, height }) => (
                <PieChart
                  width={width}
                  height={height}
                >
                  <Tooltip formatter={(value: unknown) => chartFmt(value)} />
                  <Legend />
                  <Pie
                    data={activityMixChart}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={Math.min(width, height) * 0.22}
                    outerRadius={Math.min(width, height) * 0.36}
                    paddingAngle={2}
                  >
                    {activityMixChart.map((entry, index) => (
                      <Cell
                        key={`activity-${entry.name}`}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                </PieChart>
              )}
            </ChartFrame>
          </ChartPanel>
        ) : null}

        {groupedAreaShare.length > 0 ? (
          <ChartPanel
            title="Grouped Area Share"
            description={`${metric} share across Dry, Cooler, and Freezer including replenishment and receiving.`}
          >
            <ChartFrame height={320}>
              {({ width, height }) => (
                <PieChart width={width} height={height}>
                  <Tooltip formatter={(value: unknown) => chartFmt(value)} />
                  <Legend />
                  <Pie
                    data={groupedAreaShare}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={Math.min(width, height) * 0.22}
                    outerRadius={Math.min(width, height) * 0.36}
                    paddingAngle={2}
                  >
                    {groupedAreaShare.map((entry, index) => (
                      <Cell
                        key={`area-share-${entry.name}`}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                </PieChart>
              )}
            </ChartFrame>
          </ChartPanel>
        ) : null}

        {hasGroupedAreaComparison ? (
          <ChartPanel
            title="Grouped Area Totals"
            description={`Dry, Cooler, and Freezer ${metric.toLowerCase()} by replenishment vs receiving.`}
            footer={
              <div className="flex flex-wrap gap-2">
                {groupedAreaComparison.map((row) => (
                  <Link
                    key={row.area}
                    href={rangeHref(`/areas/${encodeURIComponent(row.area.toLowerCase())}`, range)}
                    className="rounded-full border border-slate-200 px-2 py-1 font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  >
                    Open {row.area}
                  </Link>
                ))}
              </div>
            }
          >
            <ChartFrame height={320}>
              {({ width, height }) => (
                <BarChart
                  width={width}
                  height={height}
                  data={groupedAreaComparison}
                  margin={{ top: 8, right: 12, bottom: 8, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="area" tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={chartFmt} tickLine={false} axisLine={false} width={72} />
                  <Tooltip formatter={(value: unknown) => chartFmt(value)} />
                  <Legend />
                  <Bar dataKey="Replenishment" fill="#0f766e" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Receiving" fill="#f97316" radius={[6, 6, 0, 0]} />
                </BarChart>
              )}
            </ChartFrame>
          </ChartPanel>
        ) : null}

        {receivingByDestinationChart.length > 0 ? (
          <ChartPanel
            title="Receiving by Destination"
            description={`Receiving ${metric.toLowerCase()} split by destination mix.`}
          >
            <ChartFrame height={360}>
              {({ width, height }) => (
                <BarChart
                  width={width}
                  height={height}
                  data={receivingByDestinationChart}
                  layout="vertical"
                  margin={{ top: 8, right: 12, bottom: 8, left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={chartFmt} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="destination"
                    tickLine={false}
                    axisLine={false}
                    width={92}
                  />
                  <Tooltip formatter={(value: unknown) => chartFmt(value)} />
                  <Legend />
                  <Bar dataKey="value" name={metric} fill="#7c3aed" radius={[0, 6, 6, 0]} />
                </BarChart>
              )}
            </ChartFrame>
          </ChartPanel>
        ) : null}

        {rolePerformance.length > 0 ? (
          <ChartPanel
            title="Role Performance"
            description={`Top cleaned role buckets by replenishment ${metric.toLowerCase()}. Unclassified roles are grouped into Mixed/Other.`}
          >
            <ChartFrame height={360}>
              {({ width, height }) => (
                <BarChart
                  width={width}
                  height={height}
                  data={rolePerformance}
                  layout="vertical"
                  margin={{ top: 8, right: 12, bottom: 8, left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={chartFmt} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="role" tickLine={false} axisLine={false} width={120} />
                  <Tooltip formatter={(value: unknown) => chartFmt(value)} />
                  <Legend />
                  <Bar dataKey="value" name={`Replenishment ${metric}`} fill="#334155" radius={[0, 6, 6, 0]} />
                </BarChart>
              )}
            </ChartFrame>
          </ChartPanel>
        ) : null}
      </div>
    </section>
  );
}
