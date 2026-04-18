"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PieLabelRenderProps } from "recharts";
import { useAppState } from "@/lib/app-state";
import { rangeHref, resolveContextRange } from "@/lib/date-range";
import PageHeader from "./shared/PageHeader";
import StatCard from "./shared/StatCard";

type TeamGroupsResponse = {
  date: string;
  observedWorkRoleBuckets: Array<{
    role: string;
    operatorCount: number;
    plates: number;
    pieces: number;
    replenishmentPlates: number;
    replenishmentPieces: number;
    receivingPlates: number;
    receivingPieces: number;
  }>;
  observedWorkRoleDiagnostics?: {
    unclassified?: Array<{
      sourceLabel: string;
      operatorCount: number;
      plates: number;
      pieces: number;
      sampleOperators: string[];
    }>;
    sourceBreakdown?: Array<{
      role: string;
      sourceLabel: string;
      operatorCount: number;
      plates: number;
      pieces: number;
    }>;
  };
  groupedAreaWorkBuckets?: Array<{
    area: string;
    replenishmentPlates: number;
    replenishmentPieces: number;
    receivingPlates: number;
    receivingPieces: number;
  }>;
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
      assignedRole?: string | null;
      rawAssignedRole?: string | null;
      reviewAssignedRoleOverride?: string | null;
      effectiveAssignedRole?: string | null;
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

type DailyTrendRow = {
  date: string;
  hasData: boolean;
  replenishmentPlates: number;
  replenishmentPieces: number;
  receivingPlates: number;
  receivingPieces: number;
};

type OverviewWeeklyResponse = {
  weekStart: string;
  weekEnd: string;
  dailyTrends?: DailyTrendRow[];
};

type ValueMode = "plates" | "pieces" | "both";
type ValueKey = "plates" | "pieces";
type GroupedAreaWorkFamily = "replenishment" | "receiving" | "totalHandled";

type GroupedAreaWorkFamilyConfig = {
  key: GroupedAreaWorkFamily;
  label: string;
  description: string;
};

const CHART_COLORS = ["#2563eb", "#0f766e", "#f97316", "#7c3aed", "#0891b2", "#475569"];
const GROUPED_AREA_ORDER = ["Dry", "Cooler", "Freezer", "Unclassified"] as const;
type GroupedAreaName = (typeof GROUPED_AREA_ORDER)[number];

type GroupedAreaTotalsRow = {
  area: GroupedAreaName;
  replenishmentPlates: number;
  replenishmentPieces: number;
  receivingPlates: number;
  receivingPieces: number;
};

type GroupedAreaChartRow = {
  area: GroupedAreaName;
  plates: number;
  pieces: number;
  workFamily: GroupedAreaWorkFamily;
  valueMode: ValueMode;
};

type WorkFamilyValues = {
  plates: number;
  pieces: number;
};

const GROUPED_AREA_WORK_FAMILIES: GroupedAreaWorkFamilyConfig[] = [
  {
    key: "replenishment",
    label: "Replenishment",
    description: "Replenishment work by observed grouped area.",
  },
  {
    key: "receiving",
    label: "Receiving",
    description: "Receiving work by destination grouped area.",
  },
  {
    key: "totalHandled",
    label: "Total Handled",
    description: "Replenishment plus receiving work by grouped area.",
  },
];

const VALUE_MODE_OPTIONS: Array<{ key: ValueMode; label: string; description: string }> = [
  {
    key: "plates",
    label: "Plates",
    description: "Show plate counts only.",
  },
  {
    key: "pieces",
    label: "Pieces",
    description: "Show piece counts only.",
  },
  {
    key: "both",
    label: "Both",
    description: "Show plates and pieces in the same section.",
  },
];

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

function formatDayLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "numeric",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function shortChartFmt(value: unknown) {
  const numeric = Number(value || 0);
  if (Math.abs(numeric) >= 1000000) return `${(numeric / 1000000).toFixed(1)}M`;
  if (Math.abs(numeric) >= 10000) return `${Math.round(numeric / 1000)}k`;
  return fmt(numeric);
}

function selectedValueKeys(valueMode: ValueMode): ValueKey[] {
  return valueMode === "both" ? ["plates", "pieces"] : [valueMode];
}

function valueModeLabel(valueMode: ValueMode) {
  if (valueMode === "plates") return "plates";
  if (valueMode === "pieces") return "pieces";
  return "plates and pieces";
}

function valueKeyLabel(valueKey: ValueKey) {
  return valueKey === "plates" ? "Plates" : "Pieces";
}

function hasSelectedValues(row: WorkFamilyValues, valueMode: ValueMode) {
  return selectedValueKeys(valueMode).some((key) => row[key] > 0);
}

function compareByValueMode(a: WorkFamilyValues, b: WorkFamilyValues, valueMode: ValueMode) {
  if (valueMode === "plates") return b.plates - a.plates;
  if (valueMode === "pieces") return b.pieces - a.pieces;
  return b.pieces - a.pieces || b.plates - a.plates;
}

function workFamilyValues(
  row: {
    replenishmentPlates: number;
    replenishmentPieces: number;
    receivingPlates: number;
    receivingPieces: number;
  },
  family: GroupedAreaWorkFamily,
): WorkFamilyValues {
  if (family === "replenishment") {
    return {
      plates: row.replenishmentPlates,
      pieces: row.replenishmentPieces,
    };
  }
  if (family === "receiving") {
    return {
      plates: row.receivingPlates,
      pieces: row.receivingPieces,
    };
  }

  return {
    plates: row.replenishmentPlates + row.receivingPlates,
    pieces: row.replenishmentPieces + row.receivingPieces,
  };
}

function renderValuePair(values: WorkFamilyValues, valueMode: ValueMode) {
  if (valueMode === "plates") return shortChartFmt(values.plates);
  if (valueMode === "pieces") return shortChartFmt(values.pieces);
  return `${shortChartFmt(values.plates)} / ${shortChartFmt(values.pieces)}`;
}

function sharePercent(value: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
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

function renderGroupedAreaShareLabel(props: PieLabelRenderProps) {
  const cx = Number(props.cx || 0);
  const cy = Number(props.cy || 0);
  const outerRadius = Number(props.outerRadius || 0);
  const midAngle = Number(props.midAngle || 0);
  const value = Number(props.value || 0);
  const name = String(props.name || "");

  if (!value) return null;

  const radius = outerRadius + 18;
  const radians = (-midAngle * Math.PI) / 180;
  const x = cx + radius * Math.cos(radians);
  const y = cy + radius * Math.sin(radians);
  const textAnchor = x >= cx ? "start" : "end";

  return (
    <text
      x={x}
      y={y}
      textAnchor={textAnchor}
      dominantBaseline="central"
      className="fill-slate-700 text-[11px] font-semibold"
    >
      <tspan x={x} dy="-0.35em">
        {name}
      </tspan>
      <tspan x={x} dy="1.2em">
        {shortChartFmt(value)}
      </tspan>
    </text>
  );
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

function ValueModeToggle({
  valueMode,
  onChange,
}: {
  valueMode: ValueMode;
  onChange: (valueMode: ValueMode) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
      {VALUE_MODE_OPTIONS.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          title={option.description}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            valueMode === option.key
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-600 hover:bg-white hover:text-slate-900"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function GroupedAreaFamilyToggle({
  value,
  onChange,
}: {
  value: GroupedAreaWorkFamily;
  onChange: (family: GroupedAreaWorkFamily) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
      {GROUPED_AREA_WORK_FAMILIES.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            value === option.key
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-600 hover:bg-white hover:text-slate-900"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default function OverviewEnrichedCore() {
  const { selectedWeek } = useAppState();
  const [data, setData] = useState<TeamGroupsResponse | null>(null);
  const [weeklyData, setWeeklyData] = useState<OverviewWeeklyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [valueMode, setValueMode] = useState<ValueMode>("both");
  const [groupedAreaFamily, setGroupedAreaFamily] =
    useState<GroupedAreaWorkFamily>("totalHandled");
  const range = resolveContextRange(selectedWeek, null);
  const weekStart = range.start;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [teamGroupsRes, weeklyRes] = await Promise.all([
          fetch(`/api/dashboard/team-groups?date=${weekStart}&source=userls`, {
            cache: "no-store",
          }),
          fetch(`/api/dashboard/overview-weekly?weekStart=${weekStart}`, {
            cache: "no-store",
          }),
        ]);
        const json = (await teamGroupsRes.json()) as TeamGroupsResponse & { details?: string };
        const weeklyJson = (await weeklyRes.json()) as OverviewWeeklyResponse & { details?: string };

        if (!teamGroupsRes.ok) {
          throw new Error(json.details || "Failed to load overview enriched data");
        }
        if (!weeklyRes.ok) {
          throw new Error(weeklyJson.details || "Failed to load weekly trend data");
        }

        if (!cancelled) {
          setData(json);
          setWeeklyData(weeklyJson);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load overview enriched data");
          setLoading(false);
        }
      }
    }

    if (weekStart) load();

    return () => {
      cancelled = true;
    };
  }, [weekStart]);

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

  const selectedSummaryValues = workFamilyValues(
    {
      replenishmentPlates: summary.replPlates,
      replenishmentPieces: summary.replPieces,
      receivingPlates: summary.recvPlates,
      receivingPieces: summary.recvPieces,
    },
    groupedAreaFamily
  );

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
          plates: row.Plates,
          pieces: row.Pieces,
        }))
        .filter((row) => hasSelectedValues(row, valueMode))
        .sort((a, b) => compareByValueMode(a, b, valueMode)),
    [activityMix, valueMode]
  );

  const dailyTrendRows = useMemo(
    () =>
      (weeklyData?.dailyTrends || []).map((row) => {
        const values = workFamilyValues(row, groupedAreaFamily);
        return {
          ...row,
          ...values,
          day: formatDayLabel(row.date),
        };
      }),
    [groupedAreaFamily, weeklyData]
  );

  const groupedAreaTotals = useMemo(() => {
    const grouped = new Map<GroupedAreaName, GroupedAreaTotalsRow>(
      GROUPED_AREA_ORDER.map((area) => [
        area,
        {
          area,
          replenishmentPlates: 0,
          replenishmentPieces: 0,
          receivingPlates: 0,
          receivingPieces: 0,
        },
      ])
    );

    for (const row of data?.groupedAreaWorkBuckets || []) {
      const area = GROUPED_AREA_ORDER.includes(row.area as GroupedAreaName)
        ? (row.area as GroupedAreaName)
        : "Unclassified";
      grouped.set(area, {
        area,
        replenishmentPlates: Number(row.replenishmentPlates || 0),
        replenishmentPieces: Number(row.replenishmentPieces || 0),
        receivingPlates: Number(row.receivingPlates || 0),
        receivingPieces: Number(row.receivingPieces || 0),
      });
    }

    return GROUPED_AREA_ORDER.map((area) => grouped.get(area)!).filter((row) => {
      return (
        row.area !== "Unclassified" ||
        row.replenishmentPlates > 0 ||
        row.replenishmentPieces > 0 ||
        row.receivingPlates > 0 ||
        row.receivingPieces > 0
      );
    });
  }, [data]);

  const groupedAreaFamilyConfig = useMemo(
    () =>
      GROUPED_AREA_WORK_FAMILIES.find((option) => option.key === groupedAreaFamily) ||
      GROUPED_AREA_WORK_FAMILIES[0],
    [groupedAreaFamily]
  );

  const groupedAreaChartRows = useMemo<GroupedAreaChartRow[]>(
    () =>
      groupedAreaTotals.map((row) => {
        const values = workFamilyValues(row, groupedAreaFamily);
        return {
          area: row.area,
          ...values,
          workFamily: groupedAreaFamily,
          valueMode,
        };
      }),
    [groupedAreaFamily, groupedAreaTotals, valueMode]
  );

  const groupedAreaShare = useMemo(
    () =>
      groupedAreaChartRows
        .map((row) => ({
          name: row.area,
          value: valueMode === "pieces" ? row.pieces : row.plates,
          plates: row.plates,
          pieces: row.pieces,
          workFamily: row.workFamily,
          valueMode: row.valueMode,
        }))
        .filter((row) => row.value > 0),
    [groupedAreaChartRows, valueMode]
  );

  const groupedAreaShareTotals = useMemo(
    () =>
      groupedAreaChartRows.reduce(
        (acc, row) => {
          acc.plates += row.plates;
          acc.pieces += row.pieces;
          return acc;
        },
        { plates: 0, pieces: 0 }
      ),
    [groupedAreaChartRows]
  );

  const hasGroupedAreaChartRows = groupedAreaChartRows.some((row) =>
    hasSelectedValues(row, valueMode)
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
          plates: row.Plates,
          pieces: row.Pieces,
        }))
        .filter((row) => hasSelectedValues(row, valueMode))
        .sort((a, b) => compareByValueMode(a, b, valueMode)),
    [receivingByDestination, valueMode]
  );

  const rolePerformance = useMemo(() => {
    return [...(data?.observedWorkRoleBuckets || [])]
      .map((row) => ({
        role: row.role,
        ...workFamilyValues(row, groupedAreaFamily),
      }))
      .filter((row) => hasSelectedValues(row, valueMode))
      .sort((a, b) => {
        const valueDiff = compareByValueMode(a, b, valueMode);
        if (valueDiff !== 0) return valueDiff;
        return a.role.localeCompare(b.role);
      })
      .slice(0, 12);
  }, [data, groupedAreaFamily, valueMode]);

  const observedWorkUnclassifiedDiagnostics = useMemo(() => {
    return [...(data?.observedWorkRoleDiagnostics?.unclassified || [])].filter((row) => {
      return hasSelectedValues({ plates: Number(row.plates || 0), pieces: Number(row.pieces || 0) }, valueMode);
    });
  }, [data, valueMode]);

  const observedWorkSourceDiagnostics = useMemo(() => {
    return [...(data?.observedWorkRoleDiagnostics?.sourceBreakdown || [])].filter((row) => {
      return (
        row.role === "FrzFlr" ||
        row.role === "ClrPrdc" ||
        row.role === "Unclassified"
      );
    });
  }, [data]);

  useEffect(() => {
    if (
      process.env.NODE_ENV !== "development" ||
      observedWorkUnclassifiedDiagnostics.length === 0
    ) {
      return;
    }

    console.info(
      "[warehouse-dashboard] Observed-work Unclassified diagnostics",
      observedWorkUnclassifiedDiagnostics
    );
  }, [observedWorkUnclassifiedDiagnostics]);

  useEffect(() => {
    if (
      process.env.NODE_ENV !== "development" ||
      observedWorkSourceDiagnostics.length === 0
    ) {
      return;
    }

    console.info(
      "[warehouse-dashboard] Observed-work canonical source diagnostics",
      observedWorkSourceDiagnostics
    );
  }, [observedWorkSourceDiagnostics]);

  if (loading) {
    return (
      <section className="rounded-2xl bg-white border shadow-sm p-4">
        <h3 className="text-lg font-bold">Weekly Overview</h3>
        <p className="mt-1 text-sm text-slate-500">Loading weekly overview data...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl bg-white border shadow-sm p-4">
        <h3 className="text-lg font-bold">Weekly Overview</h3>
        <p className="mt-1 text-sm text-red-600">{error}</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-white border shadow-sm p-4 space-y-4">
      <PageHeader
        title="Weekly Overview"
        subtitle="Chart-first weekly snapshot for grouped areas, handled-work roles, and day-level drilldown."
      />

      <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
        <StatCard label="Teams">{summary.teams}</StatCard>
        <StatCard label="Operators">{summary.operators}</StatCard>
        <StatCard label={`${groupedAreaFamilyConfig.label} Plates`}>
          {fmt(selectedSummaryValues.plates)}
        </StatCard>
        <StatCard label={`${groupedAreaFamilyConfig.label} Pieces`}>
          {fmt(selectedSummaryValues.pieces)}
        </StatCard>
        <StatCard label="Work Family">{groupedAreaFamilyConfig.label}</StatCard>
        <StatCard label="Value Mode">
          {VALUE_MODE_OPTIONS.find((option) => option.key === valueMode)?.label || "Both"}
        </StatCard>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Work Family</div>
          <p className="mt-1 text-xs text-slate-500">
            Every weekly section uses this work basis.
          </p>
        </div>
        <GroupedAreaFamilyToggle value={groupedAreaFamily} onChange={setGroupedAreaFamily} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Value Mode</div>
          <p className="mt-1 text-xs text-slate-500">
            Plates, pieces, or both metrics shown inside each selected section.
          </p>
        </div>
        <ValueModeToggle valueMode={valueMode} onChange={setValueMode} />
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
        {groupedAreaFamily === "replenishment" && activityMixChart.length > 0 ? (
          <ChartPanel
            title="Replenishment Activity Mix"
            description={`Replenishment ${valueModeLabel(valueMode)} across displayed activity buckets.`}
          >
            <ChartFrame height={320}>
              {({ width, height }) => (
                <BarChart
                  width={width}
                  height={height}
                  data={activityMixChart}
                  margin={{ top: 28, right: 12, bottom: 8, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={chartFmt} tickLine={false} axisLine={false} width={72} />
                  <Tooltip formatter={(value: unknown) => chartFmt(value)} />
                  <Legend />
                  {selectedValueKeys(valueMode).map((key, index) => (
                    <Bar
                      key={`activity-${key}`}
                      dataKey={key}
                      name={valueKeyLabel(key)}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                      radius={[6, 6, 0, 0]}
                    >
                      <LabelList
                        dataKey={key}
                        position="top"
                        formatter={(value: unknown) => shortChartFmt(value)}
                        className="fill-slate-700 text-[11px] font-semibold"
                      />
                    </Bar>
                  ))}
                </BarChart>
              )}
            </ChartFrame>
          </ChartPanel>
        ) : null}

        {valueMode === "both" && hasGroupedAreaChartRows ? (
          <ChartPanel
            title="Grouped Area Share"
            description={`${groupedAreaFamilyConfig.label} plates and pieces share across grouped operational areas.`}
          >
            <div className="space-y-3">
              {groupedAreaChartRows
                .filter((row) => hasSelectedValues(row, valueMode))
                .map((row) => (
                  <div key={`area-share-both-${row.area}`} className="rounded-lg border border-slate-200 p-3">
                    <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                      <div className="font-semibold text-slate-900">{row.area}</div>
                      <div className="text-xs font-medium text-slate-500">
                        {renderValuePair(row, valueMode)}
                      </div>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="grid grid-cols-[56px_1fr_auto] items-center gap-2">
                        <div className="font-medium text-slate-600">Plates</div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-blue-600"
                            style={{
                              width: sharePercent(row.plates, groupedAreaShareTotals.plates),
                            }}
                          />
                        </div>
                        <div className="font-semibold text-slate-700">
                          {sharePercent(row.plates, groupedAreaShareTotals.plates)}
                        </div>
                      </div>
                      <div className="grid grid-cols-[56px_1fr_auto] items-center gap-2">
                        <div className="font-medium text-slate-600">Pieces</div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-violet-600"
                            style={{
                              width: sharePercent(row.pieces, groupedAreaShareTotals.pieces),
                            }}
                          />
                        </div>
                        <div className="font-semibold text-slate-700">
                          {sharePercent(row.pieces, groupedAreaShareTotals.pieces)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </ChartPanel>
        ) : groupedAreaShare.length > 0 ? (
          <ChartPanel
            title="Grouped Area Share"
            description={`${groupedAreaFamilyConfig.label} ${valueModeLabel(valueMode)} share across grouped operational areas.`}
          >
            <ChartFrame height={320}>
              {({ width, height }) => (
                <PieChart width={width} height={height} margin={{ top: 20, right: 28, bottom: 20, left: 28 }}>
                  <Tooltip formatter={(value: unknown) => chartFmt(value)} />
                  <Legend />
                  <Pie
                    data={groupedAreaShare}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={Math.min(width, height) * 0.22}
                    outerRadius={Math.min(width, height) * 0.32}
                    paddingAngle={2}
                    label={renderGroupedAreaShareLabel}
                    labelLine={{ stroke: "#94a3b8", strokeWidth: 1 }}
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

        {hasGroupedAreaChartRows ? (
          <ChartPanel
            title="Grouped Area Totals"
            description={`${groupedAreaFamilyConfig.label} ${valueModeLabel(valueMode)} totals using the same basis as Grouped Area Share.`}
            footer={
              <div className="flex flex-wrap gap-2">
                {groupedAreaChartRows.map((row) => (
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
                  data={groupedAreaChartRows}
                  margin={{ top: 28, right: 12, bottom: 8, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="area" tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={chartFmt} tickLine={false} axisLine={false} width={72} />
                  <Tooltip formatter={(value: unknown) => chartFmt(value)} />
                  <Legend />
                  {selectedValueKeys(valueMode).map((key, index) => (
                    <Bar
                      key={`grouped-area-total-${key}`}
                      dataKey={key}
                      name={`${groupedAreaFamilyConfig.label} ${valueKeyLabel(key)}`}
                      fill={index === 0 ? "#0f766e" : "#7c3aed"}
                      radius={[6, 6, 0, 0]}
                    >
                      <LabelList
                        dataKey={key}
                        position="top"
                        formatter={(value: unknown) => shortChartFmt(value)}
                        className="fill-slate-700 text-[11px] font-semibold"
                      />
                    </Bar>
                  ))}
                </BarChart>
              )}
            </ChartFrame>
          </ChartPanel>
        ) : null}

        {groupedAreaFamily === "receiving" && receivingByDestinationChart.length > 0 ? (
          <ChartPanel
            title="Receiving by Destination"
            description={`Receiving ${valueModeLabel(valueMode)} split by destination mix.`}
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
                  {selectedValueKeys(valueMode).map((key, index) => (
                    <Bar
                      key={`receiving-destination-${key}`}
                      dataKey={key}
                      name={valueKeyLabel(key)}
                      fill={index === 0 ? "#7c3aed" : "#f97316"}
                      radius={[0, 6, 6, 0]}
                    />
                  ))}
                </BarChart>
              )}
            </ChartFrame>
          </ChartPanel>
        ) : null}

        {rolePerformance.length > 0 ? (
          <ChartPanel
            title="Work by Role"
            description={`${groupedAreaFamilyConfig.label} ${valueModeLabel(valueMode)} by canonical observed-work role buckets.`}
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
                  {selectedValueKeys(valueMode).map((key, index) => (
                    <Bar
                      key={`role-performance-${key}`}
                      dataKey={key}
                      name={valueKeyLabel(key)}
                      fill={index === 0 ? "#334155" : "#0891b2"}
                      radius={[0, 6, 6, 0]}
                    />
                  ))}
                </BarChart>
              )}
            </ChartFrame>
          </ChartPanel>
        ) : null}
      </div>

      {dailyTrendRows.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Daily Trend Inside Week</h3>
              <p className="mt-1 text-xs text-slate-500">
                {groupedAreaFamilyConfig.label} {valueModeLabel(valueMode)} by day. Select a day for Daily Overview.
              </p>
            </div>
            <div className="text-xs font-medium text-slate-500">
              {range.start} to {range.end}
            </div>
          </div>

          <ChartFrame height={300}>
            {({ width, height }) => (
              <BarChart
                width={width}
                height={height}
                data={dailyTrendRows}
                margin={{ top: 28, right: 12, bottom: 8, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} />
                <YAxis tickFormatter={chartFmt} tickLine={false} axisLine={false} width={72} />
                <Tooltip formatter={(value: unknown) => chartFmt(value)} />
                <Legend />
                {selectedValueKeys(valueMode).map((key, index) => (
                  <Bar
                    key={`daily-trend-${key}`}
                    dataKey={key}
                    name={`${groupedAreaFamilyConfig.label} ${valueKeyLabel(key)}`}
                    fill={index === 0 ? "#2563eb" : "#7c3aed"}
                    radius={[6, 6, 0, 0]}
                  >
                    <LabelList
                      dataKey={key}
                      position="top"
                      formatter={(value: unknown) => shortChartFmt(value)}
                      className="fill-slate-700 text-[11px] font-semibold"
                    />
                  </Bar>
                ))}
              </BarChart>
            )}
          </ChartFrame>

          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
            {dailyTrendRows.map((row) => (
              <Link
                key={row.date}
                href={rangeHref(`/days/${row.date}`, range)}
                className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm transition hover:border-slate-300 hover:bg-white"
              >
                <div className="font-semibold text-slate-900">{row.day}</div>
                <div className="mt-1 text-xs text-slate-500">{row.date}</div>
                <div className="mt-3 text-xs">
                  <div className="text-slate-500">{groupedAreaFamilyConfig.label}</div>
                  <div className="font-semibold text-slate-900">
                    {renderValuePair(row, valueMode)}
                  </div>
                </div>
                {!row.hasData ? (
                  <div className="mt-2 text-[11px] font-medium text-slate-500">No daily source</div>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
