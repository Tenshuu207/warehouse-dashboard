"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAppState } from "@/lib/app-state";
import {
  getOverviewWeekData,
  getWeekData,
  type ResolvedDashboardData,
} from "@/lib/data-resolver";
import {
  resolveDisplayRoleLabel,
  resolveAssignedAreaLabel,
  resolveCanonicalAssignedDisplay,
  resolveOperationalAreaGroup,
} from "@/lib/area-labels";
import { rangeHref, resolveContextRange } from "@/lib/date-range";
import {
  resolveOperatorIdentity,
  type EmployeeRecord,
  type OperatorDefault,
  type RfMapping,
} from "@/lib/employee-identity";
import type {
  DailyAssignmentsPayload,
  DailyOperatorPlacement,
} from "@/lib/assignments/daily-assignments-types";
import type { HomeAssignmentsPayload } from "@/lib/assignments/home-assignments-types";

function fmt(value: number | null | undefined, digits = 0) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function safeNum(value: unknown) {
  return Number(value || 0);
}

function firstDefinedNum(...values: unknown[]) {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return safeNum(value);
    }
  }

  return 0;
}

function avgPcsPerPlate(pieces: number, plates: number) {
  if (!plates) return 0;
  return pieces / plates;
}

function cleanDisplayName(op: Record<string, unknown>) {
  const candidates = [
    op.employeeDisplayName,
    op.resolvedEmployeeName,
    op.employeeName,
    op.linkedEmployeeName,
    op.displayName,
    op.resolvedName,
    op.name,
    op.userid,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .map((value) => value.replace(/\s*\(RF\)\s*$/i, "").trim());

  const human = candidates.find(
    (value) => value && !/^rf[a-z0-9]+$/i.test(value) && value !== "Unknown"
  );

  return human || candidates.find((value) => value !== "Unknown") || "Unknown";
}

function normalizeNameKey(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function mergeKeyForEmployee(employeeId: string | null, resolvedName: string, userid: string) {
  if (employeeId) return `emp:${employeeId}`;

  const normalizedName = normalizeNameKey(resolvedName);
  if (normalizedName) return `name:${normalizedName}`;

  return `rf:${userid}`;
}

type AreaBucketLike = {
  areaCode?: string | null;
  area?: string | null;
  label?: string | null;
  name?: string | null;
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
  replenishmentNoRecvPlates?: number;
  replenishmentNoRecvPieces?: number;
};

type AreaTotalRow = {
  areaKey: string;
  areaLabel: string;
  letdownPlates: number;
  letdownPieces: number;
  putawayPlates: number;
  putawayPieces: number;
  restockPlates: number;
  restockPieces: number;
  bulkMovePlates: number;
  bulkMovePieces: number;
  totalPlates: number;
  totalPieces: number;
};

type ReceivingAreaRow = {
  areaKey: string;
  areaLabel: string;
  plates: number;
  pieces: number;
};

type ReceivingMixShare = {
  areaLabel: string;
  weight: number;
};

type HomeTemplate = {
  section: string;
  role: string;
};

function getAreaBucketsFromOperator(op: Record<string, unknown>): AreaBucketLike[] {
  const tracking =
    op.userlsTracking && typeof op.userlsTracking === "object"
      ? (op.userlsTracking as Record<string, unknown>)
      : null;

  const direct = Array.isArray(op.areaBuckets) ? op.areaBuckets : null;
  const nested = tracking && Array.isArray(tracking.areaBuckets) ? tracking.areaBuckets : null;

  return (direct || nested || []) as AreaBucketLike[];
}

type Row = {
  rowKey: string;
  employeeId: string | null;
  primaryUserid: string;
  rfUsernames: string[];
  name: string;
  role: string;
  area: string;
  letdownPlates: number;
  letdownPieces: number;
  putawayPlates: number;
  putawayPieces: number;
  restockPlates: number;
  restockPieces: number;
  bulkMovePlates: number;
  bulkMovePieces: number;
  totalPlates: number;
  totalPieces: number;
  receivingPlates: number;
  receivingPieces: number;
  avgPcsPerPlate: number;
  assignedAreaSource: string;
  assignedAreaDebugLabels: string[];
};

function SummaryBox({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`border-2 border-slate-900 bg-white ${className}`}>
      <div className="bg-blue-700 px-3 py-1.5 text-center text-sm font-bold text-white">
        {title}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function classifyAssignedArea(value: unknown): string | null {
  return resolveAssignedAreaLabel(value);
}

const RECEIVING_AREA_ORDER = [
  "Freezer",
  "Freezer PIR",
  "Dry",
  "Dry PIR",
  "Cooler",
  "Produce",
] as const;

const GROUPED_AREA_ORDER = ["Dry", "Cooler", "Freezer"] as const;

type GroupedAreaLabel = (typeof GROUPED_AREA_ORDER)[number];

type ActivityBucketName = "letdown" | "putaway" | "restock" | "bulkMove";

function resolveGroupedAreaLabel(areaValue: unknown): GroupedAreaLabel | null {
  const raw = String(areaValue || "").trim();
  const token = raw.toLowerCase().replace(/[^a-z0-9]+/g, "");

  if (!token) return null;
  if (
    raw === "1" ||
    raw === "5" ||
    token.startsWith("1") ||
    token.startsWith("5") ||
    token.includes("dry")
  ) {
    return "Dry";
  }
  if (
    raw === "2" ||
    raw === "3" ||
    raw === "4" ||
    token.startsWith("2") ||
    token.startsWith("3") ||
    token.startsWith("4") ||
    token.includes("cooler") ||
    token.startsWith("clr") ||
    token.includes("produce") ||
    token.includes("chicken") ||
    token.includes("icedproduct")
  ) {
    return "Cooler";
  }
  if (
    raw === "6" ||
    raw === "7" ||
    token.startsWith("6") ||
    token.startsWith("7") ||
    token.startsWith("frz") ||
    token.includes("freezer")
  ) {
    return "Freezer";
  }

  const group = resolveOperationalAreaGroup(raw);
  if (group?.label === "Dry" || group?.label === "Cooler" || group?.label === "Freezer") {
    return group.label;
  }

  return null;
}

function resolveAreaBucketValue(bucket: AreaBucketLike, activity: ActivityBucketName, unit: "plates" | "pieces") {
  if (activity === "letdown") {
    return safeNum(unit === "plates" ? bucket.letdownPlates : bucket.letdownPieces);
  }
  if (activity === "putaway") {
    return safeNum(unit === "plates" ? bucket.putawayPlates : bucket.putawayPieces);
  }
  if (activity === "restock") {
    return firstDefinedNum(
      unit === "plates" ? bucket.restockPlatesRaw : bucket.restockPiecesRaw,
      unit === "plates" ? bucket.restockPlates : bucket.restockPieces
    );
  }

  return safeNum(
    unit === "plates" ? bucket.restockLikePlatesEstimated : bucket.restockLikePiecesEstimated
  );
}

function resolveOperatorActivityValue(
  op: Record<string, unknown>,
  activity: ActivityBucketName,
  unit: "plates" | "pieces"
) {
  if (activity === "letdown") {
    return safeNum(unit === "plates" ? op.letdownPlates : op.letdownPieces);
  }
  if (activity === "putaway") {
    return safeNum(unit === "plates" ? op.putawayPlates : op.putawayPieces);
  }
  if (activity === "restock") {
    return firstDefinedNum(
      unit === "plates" ? op.restockPlatesRaw : op.restockPiecesRaw,
      unit === "plates" ? op.restockPlates : op.restockPieces
    );
  }

  return safeNum(
    unit === "plates" ? op.restockLikePlatesEstimated : op.restockLikePiecesEstimated
  );
}

function collectGroupedAreaMix(
  buckets: AreaBucketLike[],
  activity: ActivityBucketName,
  unit: "plates" | "pieces"
): ReceivingMixShare[] {
  const grouped = new Map<GroupedAreaLabel, number>();

  for (const bucket of buckets) {
    const areaLabel = resolveGroupedAreaLabel(
      bucket.areaCode || bucket.area || bucket.label || bucket.name
    );
    if (!areaLabel) continue;

    const weight = resolveAreaBucketValue(bucket, activity, unit);
    if (weight <= 0) continue;

    grouped.set(areaLabel, (grouped.get(areaLabel) || 0) + weight);
  }

  return GROUPED_AREA_ORDER.map((areaLabel) => ({
    areaLabel,
    weight: grouped.get(areaLabel) || 0,
  })).filter((item) => item.weight > 0);
}

function resolveDominantGroupedArea(op: Record<string, unknown>, buckets: AreaBucketLike[]) {
  const bucketCandidates = buckets
    .map((bucket) => {
      const areaLabel = resolveGroupedAreaLabel(
        bucket.areaCode || bucket.area || bucket.label || bucket.name
      );
      const weight =
        resolveAreaBucketValue(bucket, "letdown", "pieces") +
        resolveAreaBucketValue(bucket, "putaway", "pieces") +
        resolveAreaBucketValue(bucket, "restock", "pieces") +
        resolveAreaBucketValue(bucket, "bulkMove", "pieces");

      return { areaLabel, weight };
    })
    .filter((candidate): candidate is { areaLabel: GroupedAreaLabel; weight: number } => {
      return Boolean(candidate.areaLabel) && candidate.weight > 0;
    })
    .sort((a, b) => b.weight - a.weight);

  if (bucketCandidates[0]) return bucketCandidates[0].areaLabel;

  const areaCandidates = [
    op.effectivePerformanceArea,
    op.rawDominantArea,
    op.effectiveAssignedArea,
    op.assignedArea,
    op.rawAssignedArea,
    op.area,
  ];

  for (const value of areaCandidates) {
    const areaLabel = resolveGroupedAreaLabel(value);
    if (areaLabel) return areaLabel;
  }

  return "Dry";
}

function resolveReceivingAreaLabel(areaValue: unknown) {
  const raw = String(areaValue || "").trim();
  const token = raw.toLowerCase().replace(/[^a-z0-9]+/g, "");

  if (!token) return null;
  if (
    raw === "7" ||
    token.startsWith("7") ||
    token.startsWith("frzpir") ||
    token.includes("freezerpir")
  ) {
    return "Freezer PIR";
  }
  if (
    raw === "6" ||
    token.startsWith("6") ||
    token.startsWith("frz") ||
    token.includes("freezer")
  ) {
    return "Freezer";
  }
  if (raw === "5" || token.startsWith("5") || token.startsWith("drypir")) return "Dry PIR";
  if (raw === "1" || token.startsWith("1") || token.startsWith("dry")) return "Dry";
  if (
    raw === "2" ||
    raw === "3" ||
    token.startsWith("2") ||
    token.startsWith("3") ||
    token.startsWith("clr") ||
    token.includes("chicken") ||
    token.includes("icedproduct")
  ) {
    return "Cooler";
  }
  if (raw === "4" || token.startsWith("4") || token.includes("produce")) return "Produce";

  return null;
}

function addReceivingMixShare(
  grouped: Map<string, ReceivingMixShare>,
  areaValue: unknown,
  weightValue: unknown = 1
) {
  const areaLabel = resolveReceivingAreaLabel(areaValue);
  if (!areaLabel) return;

  const parsedWeight =
    typeof weightValue === "number"
      ? weightValue
      : Number(String(weightValue || "").replace(/[%\s,]+/g, ""));
  const weight = Number.isFinite(parsedWeight) && parsedWeight > 0 ? parsedWeight : 1;
  const current = grouped.get(areaLabel) || { areaLabel, weight: 0 };
  current.weight += weight;
  grouped.set(areaLabel, current);
}

function hasPositiveMixWeight(value: unknown) {
  const parsed =
    typeof value === "number" ? value : Number(String(value || "").replace(/[%\s,]+/g, ""));
  return Number.isFinite(parsed) && parsed > 0;
}

function addReceivingMixObject(
  grouped: Map<string, ReceivingMixShare>,
  value: Record<string, unknown>,
  fallbackArea?: unknown
) {
  const areaKeys = [
    "areaCode",
    "area",
    "areaName",
    "areaLabel",
    "destinationArea",
    "destinationAreaCode",
    "destination",
    "destinationCode",
    "label",
    "name",
    "code",
  ];
  const weightKeys = [
    "weight",
    "share",
    "ratio",
    "percent",
    "percentage",
    "plates",
    "pieces",
    "receivingPlates",
    "receivingPieces",
    "count",
    "value",
  ];

  const areaValue = areaKeys.map((key) => value[key]).find((candidate) => {
    return resolveReceivingAreaLabel(candidate);
  });
  const weightValue = weightKeys.map((key) => value[key]).find((candidate) => {
    return hasPositiveMixWeight(candidate);
  });

  addReceivingMixShare(grouped, areaValue || fallbackArea, weightValue);
}

function parseReceivingMix(value: unknown): ReceivingMixShare[] {
  const grouped = new Map<string, ReceivingMixShare>();

  if (Array.isArray(value)) {
    for (const item of value) {
      for (const share of parseReceivingMix(item)) {
        addReceivingMixShare(grouped, share.areaLabel, share.weight);
      }
    }
    return [...grouped.values()];
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const directArea = [
      record.areaCode,
      record.area,
      record.areaName,
      record.areaLabel,
      record.destinationArea,
      record.destinationAreaCode,
      record.destination,
      record.destinationCode,
      record.label,
      record.name,
      record.code,
    ].some((candidate) => resolveReceivingAreaLabel(candidate));

    if (directArea) {
      addReceivingMixObject(grouped, record);
      return [...grouped.values()];
    }

    for (const [areaValue, weightValue] of Object.entries(record)) {
      if (weightValue && typeof weightValue === "object") {
        addReceivingMixObject(grouped, weightValue as Record<string, unknown>, areaValue);
      } else {
        addReceivingMixShare(grouped, areaValue, weightValue);
      }
    }

    return [...grouped.values()];
  }

  const raw = String(value || "").trim();
  if (!raw) return [];

  if (raw.startsWith("{") || raw.startsWith("[")) {
    try {
      return parseReceivingMix(JSON.parse(raw));
    } catch {
      // Fall through to the loose text parser.
    }
  }

  for (const segment of raw.split(/[,;|]+/)) {
    const text = segment.trim();
    if (!text) continue;

    const pairMatch =
      text.match(/^(.+?)\s*[:=]\s*(\d+(?:\.\d+)?%?)$/) ||
      text.match(/^(.+?)\s*\((\d+(?:\.\d+)?)%\)$/) ||
      text.match(/^(.+?)\s+(\d+(?:\.\d+)?)%$/);

    if (pairMatch) {
      addReceivingMixShare(grouped, pairMatch[1], pairMatch[2]);
      continue;
    }

    addReceivingMixShare(grouped, text, 1);
  }

  return [...grouped.values()];
}

function splitTotalByMix(total: number, mix: ReceivingMixShare[]) {
  const roundedTotal = Math.round(total);
  if (!roundedTotal || mix.length === 0) return new Map<string, number>();

  const weightTotal = mix.reduce((sum, item) => sum + item.weight, 0);
  if (weightTotal <= 0) return new Map<string, number>();

  const allocations = mix.map((item) => {
    const exact = (roundedTotal * item.weight) / weightTotal;
    const whole = Math.floor(exact);
    return {
      areaLabel: item.areaLabel,
      whole,
      remainder: exact - whole,
    };
  });

  let remaining = roundedTotal - allocations.reduce((sum, item) => sum + item.whole, 0);
  allocations
    .sort((a, b) => {
      const remainderDiff = b.remainder - a.remainder;
      if (remainderDiff !== 0) return remainderDiff;
      return a.areaLabel.localeCompare(b.areaLabel);
    })
    .forEach((item) => {
      if (remaining <= 0) return;
      item.whole += 1;
      remaining -= 1;
    });

  return allocations.reduce((map, item) => {
    map.set(item.areaLabel, item.whole);
    return map;
  }, new Map<string, number>());
}

function resolveDominantReceivingArea(op: Record<string, unknown>) {
  const receivingMix = String(op.receivingMix || "").trim();
  const mixMatch = receivingMix.match(/^([A-Za-z0-9]+)\b/);
  const mixArea = mixMatch ? resolveReceivingAreaLabel(mixMatch[1]) : null;
  if (mixArea) return mixArea;

  const buckets = getAreaBucketsFromOperator(op)
    .filter((bucket) => safeNum(bucket.receivingPlates) > 0 || safeNum(bucket.receivingPieces) > 0)
    .sort((a, b) => safeNum(b.receivingPieces) - safeNum(a.receivingPieces));

  for (const bucket of buckets) {
    const label = resolveReceivingAreaLabel(
      bucket.areaCode || bucket.area || bucket.label || bucket.name
    );
    if (label) return label;
  }

  const areaCandidates = [
    op.effectivePerformanceArea,
    op.rawDominantArea,
    op.effectiveAssignedArea,
    op.assignedArea,
    op.rawAssignedArea,
    op.area,
  ];

  for (const value of areaCandidates) {
    const label = resolveReceivingAreaLabel(value);
    if (label) return label;
  }

  return null;
}

function buildReceivingAreaSplits(op: Record<string, unknown>) {
  const plates = safeNum(op.receivingPlates);
  const pieces = safeNum(op.receivingPieces);
  if (!plates && !pieces) return [];

  const mix = parseReceivingMix(op.receivingMix);

  if (mix.length > 0) {
    const plateSplits = splitTotalByMix(plates, mix);
    const pieceSplits = splitTotalByMix(pieces, mix);

    return RECEIVING_AREA_ORDER.map((areaLabel) => ({
      areaLabel,
      plates: plateSplits.get(areaLabel) || 0,
      pieces: pieceSplits.get(areaLabel) || 0,
    })).filter((row) => row.plates > 0 || row.pieces > 0);
  }

  const areaLabel = resolveDominantReceivingArea(op);
  return areaLabel ? [{ areaLabel, plates, pieces }] : [];
}

function TopListBox({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: string }>;
}) {
  return (
    <SummaryBox title={title}>
      <div className="space-y-1 text-sm">
        {rows.length === 0 ? (
          <div className="text-slate-500">None</div>
        ) : (
          rows.map((row, idx) => (
            <div
              key={`${title}-${idx}-${row.label}`}
              className="grid grid-cols-[28px_1fr_auto] gap-2 border-b border-slate-200 py-1 last:border-b-0"
            >
              <div className="font-semibold text-slate-600">{idx + 1}</div>
              <div className="font-medium">{row.label}</div>
              <div className="font-bold text-slate-900">{row.value}</div>
            </div>
          ))
        )}
      </div>
    </SummaryBox>
  );
}

export default function WeeklySheetView({
  dataSource = "dashboard",
}: {
  dataSource?: "dashboard" | "userls-overview";
}) {
  const { selectedWeek } = useAppState();
  const range = resolveContextRange(selectedWeek, null);
  const [data, setData] = useState<ResolvedDashboardData | null>(null);
  const [assignments, setAssignments] = useState<DailyAssignmentsPayload | null>(null);
  const [homeAssignments, setHomeAssignments] = useState<HomeAssignmentsPayload | null>(null);
  const [defaults, setDefaults] = useState<Record<string, OperatorDefault>>({});
  const [employees, setEmployees] = useState<Record<string, EmployeeRecord>>({});
  const [mappings, setMappings] = useState<RfMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectedWeekError = selectedWeek ? null : "Select a date to load the weekly sheet";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const loadDashboard =
          dataSource === "userls-overview" ? getOverviewWeekData : getWeekData;

        const [next, assignmentsRes, homeAssignmentsRes, defaultsRes, employeesRes, mappingsRes] =
          await Promise.all([
          loadDashboard(selectedWeek),
          fetch(`/api/daily-assignments?date=${selectedWeek}`, { cache: "no-store" }),
          fetch("/api/home-assignments", { cache: "no-store" }),
          fetch("/api/operator-defaults", { cache: "no-store" }),
          fetch("/api/employees", { cache: "no-store" }),
          fetch("/api/rf-mappings", { cache: "no-store" }),
        ]);

        const assignmentsJson: DailyAssignmentsPayload & { error?: string } = assignmentsRes.ok
          ? await assignmentsRes.json()
          : { date: selectedWeek, updatedAt: null, sections: [], placements: [] };
        const homeAssignmentsJson: HomeAssignmentsPayload & { error?: string } = homeAssignmentsRes.ok
          ? await homeAssignmentsRes.json()
          : { updatedAt: null, sections: [] };
        const defaultsJson = defaultsRes.ok ? await defaultsRes.json() : { operators: {} };
        const employeesJson = employeesRes.ok ? await employeesRes.json() : { employees: {} };
        const mappingsJson = mappingsRes.ok ? await mappingsRes.json() : { mappings: [] };

        if (!cancelled) {
          setData(next);
          setAssignments(assignmentsJson);
          setHomeAssignments(homeAssignmentsJson);
          setDefaults(defaultsJson.operators || {});
          setEmployees(employeesJson.employees || {});
          setMappings(Array.isArray(mappingsJson.mappings) ? mappingsJson.mappings : []);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load weekly sheet");
          setLoading(false);
        }
      }
    }

    if (!selectedWeek) return;

    void load();

    return () => {
      cancelled = true;
    };
  }, [selectedWeek, dataSource]);

  const placementDrafts = useMemo(() => {
    const next: Record<string, DailyOperatorPlacement> = {};
    for (const placement of assignments?.placements || []) {
      if (!placement) continue;

      if (placement.assignmentKey) {
        next[placement.assignmentKey] = placement;
      }

      if (placement.employeeId) {
        next[`emp:${placement.employeeId}`] = placement;
      }

      if (placement.employeeName) {
        next[`name:${normalizeNameKey(placement.employeeName)}`] = placement;
      }

      for (const rfUsername of placement.rfUsernames || []) {
        next[`rf:${String(rfUsername || "").trim()}`] = placement;
      }
    }
    return next;
  }, [assignments]);

  const homeTemplates = useMemo(() => {
    const map = new Map<string, HomeTemplate>();

    for (const section of assignments?.sections || homeAssignments?.sections || []) {
      const resolvedSection = classifyAssignedArea(section.team) || section.team || "Other";
      const resolvedRole = resolveDisplayRoleLabel(section.role) || "—";

      for (const employeeName of section.employees || []) {
        const key = normalizeNameKey(employeeName);
        if (!key || map.has(key)) continue;

        map.set(key, {
          section: resolvedSection,
          role: resolvedRole,
        });
      }
    }

    return map;
  }, [assignments, homeAssignments]);

  const rows = useMemo<Row[]>(() => {
    const ops = (data?.operators ?? []) as Array<Record<string, unknown>>;
    const grouped = new Map<Row["rowKey"], Row>();

    for (const op of ops) {
      const userid = String(op.userid || "").trim();
      if (!userid) continue;

      const fallbackName = cleanDisplayName(op);
      const fallbackTeam = String(
        op.rawAssignedArea ||
          op.effectiveAssignedArea ||
          op.assignedArea ||
          op.area ||
          ""
      );

      const resolved = resolveOperatorIdentity({
        rfUsername: userid,
        fallbackName,
        fallbackTeam,
        selectedDate: selectedWeek,
        employees,
        mappings,
        defaultTeams: defaults,
      });

      const name =
        String(resolved.displayName || "")
          .replace(/\s*\(RF\)\s*$/i, "")
          .trim() || fallbackName;

      const employeeId = resolved.employeeId || null;
      const rowKey = mergeKeyForEmployee(employeeId, name || fallbackName, userid);
      const placement = placementDrafts[rowKey];
      const homeTemplate =
        homeTemplates.get(normalizeNameKey(name)) || homeTemplates.get(normalizeNameKey(fallbackName)) || null;

      const assignedDisplay = resolveCanonicalAssignedDisplay({
        savedDaily: {
          area: placement?.assignedSection,
          role: placement?.assignedRole,
        },
        observedInferred: {
          area: [op.effectiveAssignedArea, op.assignedArea, op.rawAssignedArea],
          role: [op.effectiveAssignedRole, op.assignedRole, op.rawAssignedRole, op.currentRole],
        },
        homeDefault: {
          area: [homeTemplate?.section, resolved.defaultTeam],
          role: homeTemplate?.role,
        },
      });
      const role = assignedDisplay.role;
      const assignedArea = assignedDisplay.area;
      const assignedAreaDebugLabels = [
        placement?.assignedSection,
        placement?.assignedRole,
        op.effectiveAssignedArea,
        op.assignedArea,
        op.rawAssignedArea,
        op.effectiveAssignedRole,
        op.assignedRole,
        op.rawAssignedRole,
        op.currentRole,
        homeTemplate?.section,
        homeTemplate?.role,
        resolved.defaultTeam,
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean);

      const letdownPlates = safeNum(op.letdownPlates);
      const letdownPieces = safeNum(op.letdownPieces);
      const putawayPlates = safeNum(op.putawayPlates);
      const putawayPieces = safeNum(op.putawayPieces);
      const restockPlates = firstDefinedNum(op.restockPlatesRaw, op.restockPlates);
      const restockPieces = firstDefinedNum(op.restockPiecesRaw, op.restockPieces);
      const bulkMovePlates = safeNum(op.restockLikePlatesEstimated);
      const bulkMovePieces = safeNum(op.restockLikePiecesEstimated);
      const receivingPlates = safeNum(op.receivingPlates);
      const receivingPieces = safeNum(op.receivingPieces);
      const totalPlates = letdownPlates + putawayPlates + restockPlates + bulkMovePlates;
      const totalPieces = letdownPieces + putawayPieces + restockPieces + bulkMovePieces;

      if (!grouped.has(rowKey)) {
        grouped.set(rowKey, {
          rowKey,
          employeeId,
          primaryUserid: userid,
          rfUsernames: [userid],
          name,
          role,
          area: assignedArea,
          letdownPlates,
          letdownPieces,
          putawayPlates,
          putawayPieces,
          restockPlates,
          restockPieces,
          bulkMovePlates,
          bulkMovePieces,
          totalPlates,
          totalPieces,
          receivingPlates,
          receivingPieces,
          avgPcsPerPlate: 0,
          assignedAreaSource: assignedDisplay.areaSource,
          assignedAreaDebugLabels,
        });
        continue;
      }

      const existing = grouped.get(rowKey)!;
      existing.rfUsernames = uniqueSorted([...existing.rfUsernames, userid]);
      existing.letdownPlates += letdownPlates;
      existing.letdownPieces += letdownPieces;
      existing.putawayPlates += putawayPlates;
      existing.putawayPieces += putawayPieces;
      existing.restockPlates += restockPlates;
      existing.restockPieces += restockPieces;
      existing.bulkMovePlates += bulkMovePlates;
      existing.bulkMovePieces += bulkMovePieces;
      existing.totalPlates += totalPlates;
      existing.totalPieces += totalPieces;
      existing.receivingPlates += receivingPlates;
      existing.receivingPieces += receivingPieces;
      existing.assignedAreaDebugLabels = uniqueSorted([
        ...existing.assignedAreaDebugLabels,
        ...assignedAreaDebugLabels,
      ]);

      if (
        existing.role === "—" &&
        role !== "—"
      ) {
        existing.role = role;
      }

      if (
        (existing.area === "Other" || !existing.area) &&
        area &&
        area !== "Other"
      ) {
        existing.area = area;
      }

      if (totalPieces > existing.totalPieces) {
        existing.primaryUserid = userid;
      }
    }

    return Array.from(grouped.values())
      .map((row) => ({
        ...row,
        avgPcsPerPlate: avgPcsPerPlate(row.totalPieces, row.totalPlates),
      }))
      .filter((row) => row.totalPlates > 0 || row.receivingPlates > 0)
      .sort((a, b) => b.totalPieces - a.totalPieces);
  }, [data, selectedWeek, employees, mappings, defaults, placementDrafts, homeTemplates]);

  const assignedAreaOtherDiagnostics = useMemo(
    () =>
      rows
        .filter((row) => row.area === "Other")
        .map((row) => ({
          operator: row.name,
          rfUsernames: row.rfUsernames.join(", "),
          source: row.assignedAreaSource,
          labels: row.assignedAreaDebugLabels.join(" | ") || "(none)",
        })),
    [rows]
  );

  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || assignedAreaOtherDiagnostics.length === 0) {
      return;
    }

    console.info(
      "[warehouse-dashboard] Assigned Area = Other diagnostics",
      assignedAreaOtherDiagnostics
    );
  }, [assignedAreaOtherDiagnostics]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.letdownPlates += row.letdownPlates;
        acc.letdownPieces += row.letdownPieces;
        acc.putawayPlates += row.putawayPlates;
        acc.putawayPieces += row.putawayPieces;
        acc.restockPlates += row.restockPlates;
        acc.restockPieces += row.restockPieces;
        acc.bulkMovePlates += row.bulkMovePlates;
        acc.bulkMovePieces += row.bulkMovePieces;
        acc.totalPlates += row.totalPlates;
        acc.totalPieces += row.totalPieces;
        acc.receivingPlates += row.receivingPlates;
        acc.receivingPieces += row.receivingPieces;
        return acc;
      },
      {
        letdownPlates: 0,
        letdownPieces: 0,
        putawayPlates: 0,
        putawayPieces: 0,
        restockPlates: 0,
        restockPieces: 0,
        bulkMovePlates: 0,
        bulkMovePieces: 0,
        totalPlates: 0,
        totalPieces: 0,
        receivingPlates: 0,
        receivingPieces: 0,
      }
    );
  }, [rows]);

  const handledTotals = useMemo(
    () => ({
      plates: totals.totalPlates + totals.receivingPlates,
      pieces: totals.totalPieces + totals.receivingPieces,
    }),
    [totals]
  );

  const areaTotals = useMemo<AreaTotalRow[]>(() => {
    const ops = (data?.operators ?? []) as Array<Record<string, unknown>>;
    const grouped = new Map<string, AreaTotalRow>();

    function ensure(areaLabel: GroupedAreaLabel): AreaTotalRow {
      const areaKey = areaLabel.toLowerCase();
      const existing = grouped.get(areaKey);
      if (existing) return existing;

      const created: AreaTotalRow = {
        areaKey,
        areaLabel,
        letdownPlates: 0,
        letdownPieces: 0,
        putawayPlates: 0,
        putawayPieces: 0,
        restockPlates: 0,
        restockPieces: 0,
        bulkMovePlates: 0,
        bulkMovePieces: 0,
        totalPlates: 0,
        totalPieces: 0,
      };
      grouped.set(areaKey, created);
      return created;
    }

    function addAllocation(
      areaLabel: GroupedAreaLabel,
      activity: ActivityBucketName,
      plates: number,
      pieces: number
    ) {
      const target = ensure(areaLabel);

      if (activity === "letdown") {
        target.letdownPlates += plates;
        target.letdownPieces += pieces;
      } else if (activity === "putaway") {
        target.putawayPlates += plates;
        target.putawayPieces += pieces;
      } else if (activity === "restock") {
        target.restockPlates += plates;
        target.restockPieces += pieces;
      } else {
        target.bulkMovePlates += plates;
        target.bulkMovePieces += pieces;
      }

      target.totalPlates += plates;
      target.totalPieces += pieces;
    }

    function allocateActivity(
      op: Record<string, unknown>,
      buckets: AreaBucketLike[],
      activity: ActivityBucketName
    ) {
      const plates = resolveOperatorActivityValue(op, activity, "plates");
      const pieces = resolveOperatorActivityValue(op, activity, "pieces");
      if (!plates && !pieces) return;

      let plateMix = collectGroupedAreaMix(buckets, activity, "plates");
      let pieceMix = collectGroupedAreaMix(buckets, activity, "pieces");

      if (plateMix.length === 0 && pieceMix.length > 0) {
        plateMix = pieceMix;
      }
      if (pieceMix.length === 0 && plateMix.length > 0) {
        pieceMix = plateMix;
      }

      if (plateMix.length > 0 || pieceMix.length > 0) {
        const plateSplits = splitTotalByMix(plates, plateMix);
        const pieceSplits = splitTotalByMix(pieces, pieceMix);

        for (const areaLabel of GROUPED_AREA_ORDER) {
          const splitPlates = plateSplits.get(areaLabel) || 0;
          const splitPieces = pieceSplits.get(areaLabel) || 0;
          if (!splitPlates && !splitPieces) continue;
          addAllocation(areaLabel, activity, splitPlates, splitPieces);
        }

        return;
      }

      addAllocation(resolveDominantGroupedArea(op, buckets), activity, plates, pieces);
    }

    for (const op of ops) {
      if (!String(op.userid || "").trim()) continue;

      const buckets = getAreaBucketsFromOperator(op);
      allocateActivity(op, buckets, "letdown");
      allocateActivity(op, buckets, "putaway");
      allocateActivity(op, buckets, "restock");
      allocateActivity(op, buckets, "bulkMove");
    }

    return GROUPED_AREA_ORDER.map((areaLabel) => grouped.get(areaLabel.toLowerCase()))
      .filter((row): row is AreaTotalRow => Boolean(row))
      .filter((row) => row.totalPlates > 0 || row.totalPieces > 0)
      .map((row) => row);
  }, [data]);

  const topReceiving = useMemo(
    () =>
      rows
        .filter((row) => row.receivingPlates > 0 || row.receivingPieces > 0)
        .sort((a, b) => b.receivingPieces - a.receivingPieces)
        .slice(0, 5),
    [rows]
  );

  const receivingByArea = useMemo<ReceivingAreaRow[]>(() => {
    const ops = (data?.operators ?? []) as Array<Record<string, unknown>>;
    const grouped = new Map<string, ReceivingAreaRow>();

    for (const op of ops) {
      if (!String(op.userid || "").trim()) continue;

      for (const split of buildReceivingAreaSplits(op)) {
        const existing =
          grouped.get(split.areaLabel) ||
          ({
            areaKey: split.areaLabel,
            areaLabel: split.areaLabel,
            plates: 0,
            pieces: 0,
          } as ReceivingAreaRow);

        existing.plates += split.plates;
        existing.pieces += split.pieces;
        grouped.set(split.areaLabel, existing);
      }
    }

    return RECEIVING_AREA_ORDER.map((label) => grouped.get(label))
      .filter((row): row is ReceivingAreaRow => Boolean(row))
      .filter((row) => row.plates > 0 || row.pieces > 0);
  }, [data]);

  const topByPlates = useMemo(
    () =>
      [...rows]
        .sort((a, b) => b.totalPlates - a.totalPlates)
        .slice(0, 3)
        .map((row) => ({
          label: row.name,
          value: fmt(row.totalPlates),
        })),
    [rows]
  );

  const topByPieces = useMemo(
    () =>
      [...rows]
        .sort((a, b) => b.totalPieces - a.totalPieces)
        .slice(0, 3)
        .map((row) => ({
          label: row.name,
          value: fmt(row.totalPieces),
        })),
    [rows]
  );

  const topLetdown = useMemo(
    () =>
      [...rows]
        .sort((a, b) => b.letdownPieces - a.letdownPieces)
        .slice(0, 3)
        .map((row) => ({
          label: row.name,
          value: fmt(row.letdownPieces),
        })),
    [rows]
  );

  const topPutaway = useMemo(
    () =>
      [...rows]
        .sort((a, b) => b.putawayPieces - a.putawayPieces)
        .slice(0, 3)
        .map((row) => ({
          label: row.name,
          value: fmt(row.putawayPieces),
        })),
    [rows]
  );

  if (selectedWeekError) {
    return (
      <div className="border-2 border-slate-900 bg-white p-4 text-sm text-red-600">
        {selectedWeekError}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="border-2 border-slate-900 bg-white p-4 text-sm text-slate-600">
        Loading weekly sheet…
      </div>
    );
  }

  if (error) {
    return (
      <div className="border-2 border-slate-900 bg-white p-4 text-sm text-red-600">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border-2 border-slate-900 bg-white">
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] border-collapse text-sm">
              <thead>
                <tr className="bg-blue-700 text-white">
                  <th className="border border-slate-900 px-3 py-2 text-left">Operator</th>
                  <th className="border border-slate-900 px-3 py-2 text-left">Assigned Area</th>
                  <th className="border border-slate-900 px-3 py-2 text-center" colSpan={2}>
                    Letdowns
                  </th>
                  <th className="border border-slate-900 px-3 py-2 text-center" colSpan={2}>
                    Putaways
                  </th>
                  <th className="border border-slate-900 px-3 py-2 text-center" colSpan={2}>
                    Restocks
                  </th>
                  <th className="border border-slate-900 px-3 py-2 text-center" colSpan={2}>
                    Bulk Move
                  </th>
                  <th className="border border-slate-900 px-3 py-2 text-center" colSpan={2}>
                    Total Handled
                  </th>
                  <th className="border border-slate-900 px-3 py-2 text-center">
                    Avg PCS/Plate
                  </th>
                </tr>
                <tr className="bg-slate-100 text-slate-900">
                  <th className="border border-slate-900 px-3 py-1.5 text-left"></th>
                  <th className="border border-slate-900 px-3 py-1.5 text-left"></th>
                  <th className="border border-slate-900 px-3 py-1.5 text-center">Plates</th>
                  <th className="border border-slate-900 px-3 py-1.5 text-center">Pieces</th>
                  <th className="border border-slate-900 px-3 py-1.5 text-center">Plates</th>
                  <th className="border border-slate-900 px-3 py-1.5 text-center">Pieces</th>
                  <th className="border border-slate-900 px-3 py-1.5 text-center">Plates</th>
                  <th className="border border-slate-900 px-3 py-1.5 text-center">Pieces</th>
                  <th className="border border-slate-900 px-3 py-1.5 text-center">Plates</th>
                  <th className="border border-slate-900 px-3 py-1.5 text-center">Pieces</th>
                  <th className="border border-slate-900 px-3 py-1.5 text-center">Plates</th>
                  <th className="border border-slate-900 px-3 py-1.5 text-center">Pieces</th>
                  <th className="border border-slate-900 px-3 py-1.5 text-center"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.rowKey} className="bg-white">
                    <td className="border border-slate-900 px-3 py-1.5 font-medium">
                      <Link
                        href={`/operators/${encodeURIComponent(row.primaryUserid)}`}
                        className="hover:underline"
                      >
                        {row.name}
                      </Link>
                      <div className="text-[11px] text-slate-500">
                        RF IDs: {row.rfUsernames.join(", ")}
                      </div>
                      {row.role && row.role !== "—" ? (
                        <div className="text-[11px] text-slate-500">{row.role}</div>
                      ) : null}
                    </td>
                    <td className="border border-slate-900 px-3 py-1.5">{row.area}</td>
                    <td className="border border-slate-900 bg-blue-50 px-3 py-1.5 text-right">
                      {fmt(row.letdownPlates)}
                    </td>
                    <td className="border border-slate-900 bg-green-50 px-3 py-1.5 text-right">
                      {fmt(row.letdownPieces)}
                    </td>
                    <td className="border border-slate-900 bg-blue-50 px-3 py-1.5 text-right">
                      {fmt(row.putawayPlates)}
                    </td>
                    <td className="border border-slate-900 bg-green-50 px-3 py-1.5 text-right">
                      {fmt(row.putawayPieces)}
                    </td>
                    <td className="border border-slate-900 bg-blue-50 px-3 py-1.5 text-right">
                      {fmt(row.restockPlates)}
                    </td>
                    <td className="border border-slate-900 bg-green-50 px-3 py-1.5 text-right">
                      {fmt(row.restockPieces)}
                    </td>
                    <td className="border border-slate-900 bg-blue-50 px-3 py-1.5 text-right">
                      {fmt(row.bulkMovePlates)}
                    </td>
                    <td className="border border-slate-900 bg-green-50 px-3 py-1.5 text-right">
                      {fmt(row.bulkMovePieces)}
                    </td>
                    <td className="border border-slate-900 bg-yellow-200 px-3 py-1.5 text-right font-semibold">
                      {fmt(row.totalPlates)}
                    </td>
                    <td className="border border-slate-900 bg-yellow-200 px-3 py-1.5 text-right font-semibold">
                      {fmt(row.totalPieces)}
                    </td>
                    <td className="border border-slate-900 bg-yellow-100 px-3 py-1.5 text-right">
                      {fmt(row.avgPcsPerPlate, 0)}
                    </td>
                  </tr>
                ))}

                <tr className="font-bold">
                  <td className="border border-slate-900 bg-slate-100 px-3 py-2" colSpan={2}>
                    Week Total
                  </td>
                  <td className="border border-slate-900 bg-blue-50 px-3 py-2 text-right text-red-600">
                    {fmt(totals.letdownPlates)}
                  </td>
                  <td className="border border-slate-900 bg-green-50 px-3 py-2 text-right text-red-600">
                    {fmt(totals.letdownPieces)}
                  </td>
                  <td className="border border-slate-900 bg-blue-50 px-3 py-2 text-right text-red-600">
                    {fmt(totals.putawayPlates)}
                  </td>
                  <td className="border border-slate-900 bg-green-50 px-3 py-2 text-right text-red-600">
                    {fmt(totals.putawayPieces)}
                  </td>
                  <td className="border border-slate-900 bg-blue-50 px-3 py-2 text-right text-red-600">
                    {fmt(totals.restockPlates)}
                  </td>
                  <td className="border border-slate-900 bg-green-50 px-3 py-2 text-right text-red-600">
                    {fmt(totals.restockPieces)}
                  </td>
                  <td className="border border-slate-900 bg-blue-50 px-3 py-2 text-right text-red-600">
                    {fmt(totals.bulkMovePlates)}
                  </td>
                  <td className="border border-slate-900 bg-green-50 px-3 py-2 text-right text-red-600">
                    {fmt(totals.bulkMovePieces)}
                  </td>
                  <td className="border border-slate-900 bg-yellow-200 px-3 py-2 text-right text-red-600">
                    {fmt(handledTotals.plates)}
                  </td>
                  <td className="border border-slate-900 bg-yellow-200 px-3 py-2 text-right text-red-600">
                    {fmt(handledTotals.pieces)}
                  </td>
                  <td className="border border-slate-900 bg-yellow-100 px-3 py-2 text-right text-red-600">
                    {fmt(avgPcsPerPlate(handledTotals.pieces, handledTotals.plates), 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="border-l-2 border-slate-900 bg-slate-50 p-3 space-y-3">
            <SummaryBox title={`Week ${selectedWeek}`}>
              <div className="space-y-3">
                <div className="border border-slate-900 bg-yellow-200 px-3 py-4 text-center">
                  <div className="text-sm font-medium text-slate-700">
                    Total Handled License Plates
                  </div>
                  <div className="mt-2 text-4xl font-bold text-red-600">
                    {fmt(handledTotals.plates)}
                  </div>
                </div>

                <div className="border border-slate-900">
                  <div className="bg-green-700 px-3 py-1.5 text-center text-sm font-bold text-white">
                    Week Total
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100 text-slate-900">
                      <tr>
                        <th className="border border-slate-900 px-3 py-1.5 text-left">Type</th>
                        <th className="border border-slate-900 px-3 py-1.5 text-right">Plates</th>
                        <th className="border border-slate-900 px-3 py-1.5 text-right">Pieces</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-slate-900 px-3 py-1.5 font-medium">Letdowns</td>
                        <td className="border border-slate-900 px-3 py-1.5 text-right">
                          {fmt(totals.letdownPlates)}
                        </td>
                        <td className="border border-slate-900 px-3 py-1.5 text-right">
                          {fmt(totals.letdownPieces)}
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-slate-900 px-3 py-1.5 font-medium">Putaways</td>
                        <td className="border border-slate-900 px-3 py-1.5 text-right">
                          {fmt(totals.putawayPlates)}
                        </td>
                        <td className="border border-slate-900 px-3 py-1.5 text-right">
                          {fmt(totals.putawayPieces)}
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-slate-900 px-3 py-1.5 font-medium">Restocks</td>
                        <td className="border border-slate-900 px-3 py-1.5 text-right">
                          {fmt(totals.restockPlates)}
                        </td>
                        <td className="border border-slate-900 px-3 py-1.5 text-right">
                          {fmt(totals.restockPieces)}
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-slate-900 px-3 py-1.5 font-medium">Bulk Move</td>
                        <td className="border border-slate-900 px-3 py-1.5 text-right">
                          {fmt(totals.bulkMovePlates)}
                        </td>
                        <td className="border border-slate-900 px-3 py-1.5 text-right">
                          {fmt(totals.bulkMovePieces)}
                        </td>
                      </tr>
                      <tr className="font-semibold">
                        <td className="border border-slate-900 bg-yellow-200 px-3 py-1.5 font-medium">
                          Total
                        </td>
                        <td className="border border-slate-900 bg-yellow-200 px-3 py-1.5 text-right text-red-600">
                          {fmt(totals.totalPlates)}
                        </td>
                        <td className="border border-slate-900 bg-yellow-200 px-3 py-1.5 text-right text-red-600">
                          {fmt(totals.totalPieces)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </SummaryBox>

            <SummaryBox title="Receiving Total">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-slate-900">
                  <tr>
                    <th className="border border-slate-900 px-3 py-1.5 text-left">Employee</th>
                    <th className="border border-slate-900 px-3 py-1.5 text-right">Plates</th>
                    <th className="border border-slate-900 px-3 py-1.5 text-right">Pieces</th>
                  </tr>
                </thead>
                <tbody>
                  {topReceiving.map((row) => (
                    <tr key={`recv-${row.rowKey}`}>
                      <td className="border border-slate-900 px-3 py-1.5 font-medium">
                        <Link
                          href={`/operators/${encodeURIComponent(row.primaryUserid)}`}
                          className="hover:underline"
                        >
                          {row.name}
                        </Link>
                      </td>
                      <td className="border border-slate-900 px-3 py-1.5 text-right">
                        {fmt(row.receivingPlates)}
                      </td>
                      <td className="border border-slate-900 px-3 py-1.5 text-right">
                        {fmt(row.receivingPieces)}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td className="border border-slate-900 bg-yellow-200 px-3 py-1.5">Total</td>
                    <td className="border border-slate-900 bg-yellow-200 px-3 py-1.5 text-right text-red-600">
                      {fmt(totals.receivingPlates)}
                    </td>
                    <td className="border border-slate-900 bg-yellow-200 px-3 py-1.5 text-right text-red-600">
                      {fmt(totals.receivingPieces)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </SummaryBox>

            <SummaryBox title="Receiving by Area">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-slate-900">
                  <tr>
                    <th className="border border-slate-900 px-3 py-1.5 text-left">Area</th>
                    <th className="border border-slate-900 px-3 py-1.5 text-right">Plates</th>
                    <th className="border border-slate-900 px-3 py-1.5 text-right">Pieces</th>
                  </tr>
                </thead>
                <tbody>
                  {receivingByArea.map((row) => (
                    <tr key={`recv-area-${row.areaKey}`}>
                      <td className="border border-slate-900 px-3 py-1.5 font-medium">
                        {row.areaLabel}
                      </td>
                      <td className="border border-slate-900 px-3 py-1.5 text-right">
                        {fmt(row.plates)}
                      </td>
                      <td className="border border-slate-900 px-3 py-1.5 text-right">
                        {fmt(row.pieces)}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td className="border border-slate-900 bg-yellow-200 px-3 py-1.5 font-medium">
                      Total
                    </td>
                    <td className="border border-slate-900 bg-yellow-200 px-3 py-1.5 text-right text-red-600">
                      {fmt(receivingByArea.reduce((sum, row) => sum + row.plates, 0))}
                    </td>
                    <td className="border border-slate-900 bg-yellow-200 px-3 py-1.5 text-right text-red-600">
                      {fmt(receivingByArea.reduce((sum, row) => sum + row.pieces, 0))}
                    </td>
                  </tr>
                  {receivingByArea.length === 0 ? (
                    <tr>
                      <td
                        className="border border-slate-900 px-3 py-1.5 text-slate-500"
                        colSpan={3}
                      >
                        No receiving rows found for these destination areas.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </SummaryBox>

          </div>
        </div>
      </div>

      <div className="space-y-4">
        <SummaryBox title="Grouped Area Totals" className="overflow-x-auto p-0">
          <table className="w-full min-w-[1080px] border-collapse text-sm">
            <thead>
              <tr className="bg-blue-700 text-white">
                <th className="border border-slate-900 px-3 py-2 text-left" colSpan={1}>
                  Total Handled by Area
                </th>
                <th className="border border-slate-900 px-3 py-2 text-center" colSpan={2}>
                  Letdowns
                </th>
                <th className="border border-slate-900 px-3 py-2 text-center" colSpan={2}>
                  Putaways
                </th>
                <th className="border border-slate-900 px-3 py-2 text-center" colSpan={2}>
                  Restocks
                </th>
                <th className="border border-slate-900 px-3 py-2 text-center" colSpan={2}>
                  Bulk Move
                </th>
                <th className="border border-slate-900 px-3 py-2 text-center" colSpan={2}>
                  Total Handled
                </th>
              </tr>
              <tr className="bg-slate-100 text-slate-900">
                <th className="border border-slate-900 px-3 py-1.5 text-left">Area</th>
                <th className="border border-slate-900 px-3 py-1.5 text-center">Plates</th>
                <th className="border border-slate-900 px-3 py-1.5 text-center">Pieces</th>
                <th className="border border-slate-900 px-3 py-1.5 text-center">Plates</th>
                <th className="border border-slate-900 px-3 py-1.5 text-center">Pieces</th>
                <th className="border border-slate-900 px-3 py-1.5 text-center">Plates</th>
                <th className="border border-slate-900 px-3 py-1.5 text-center">Pieces</th>
                <th className="border border-slate-900 px-3 py-1.5 text-center">Plates</th>
                <th className="border border-slate-900 px-3 py-1.5 text-center">Pieces</th>
                <th className="border border-slate-900 px-3 py-1.5 text-center">Plates</th>
                <th className="border border-slate-900 px-3 py-1.5 text-center">Pieces</th>
              </tr>
            </thead>
            <tbody>
              {areaTotals.map((row) => (
                <tr key={`area-total-${row.areaKey}`}>
                  <td className="border border-slate-900 px-3 py-1.5 font-medium">
                    <Link
                      href={rangeHref(`/areas/${encodeURIComponent(row.areaKey)}`, range)}
                      className="hover:underline"
                    >
                      {row.areaLabel}
                    </Link>
                  </td>
                  <td className="border border-slate-900 bg-blue-50 px-3 py-1.5 text-right">
                    {fmt(row.letdownPlates)}
                  </td>
                  <td className="border border-slate-900 bg-green-50 px-3 py-1.5 text-right">
                    {fmt(row.letdownPieces)}
                  </td>
                  <td className="border border-slate-900 bg-blue-50 px-3 py-1.5 text-right">
                    {fmt(row.putawayPlates)}
                  </td>
                  <td className="border border-slate-900 bg-green-50 px-3 py-1.5 text-right">
                    {fmt(row.putawayPieces)}
                  </td>
                  <td className="border border-slate-900 bg-blue-50 px-3 py-1.5 text-right">
                    {fmt(row.restockPlates)}
                  </td>
                  <td className="border border-slate-900 bg-green-50 px-3 py-1.5 text-right">
                    {fmt(row.restockPieces)}
                  </td>
                  <td className="border border-slate-900 bg-blue-50 px-3 py-1.5 text-right">
                    {fmt(row.bulkMovePlates)}
                  </td>
                  <td className="border border-slate-900 bg-green-50 px-3 py-1.5 text-right">
                    {fmt(row.bulkMovePieces)}
                  </td>
                  <td className="border border-slate-900 bg-yellow-200 px-3 py-1.5 text-right font-semibold text-red-600">
                    {fmt(row.totalPlates)}
                  </td>
                  <td className="border border-slate-900 bg-yellow-200 px-3 py-1.5 text-right font-semibold text-red-600">
                    {fmt(row.totalPieces)}
                  </td>
                </tr>
              ))}
              <tr className="font-bold">
                <td className="border border-slate-900 bg-slate-100 px-3 py-1.5 font-medium">
                  Total
                </td>
                <td className="border border-slate-900 bg-blue-50 px-3 py-1.5 text-right text-red-600">
                  {fmt(areaTotals.reduce((sum, row) => sum + row.letdownPlates, 0))}
                </td>
                <td className="border border-slate-900 bg-green-50 px-3 py-1.5 text-right text-red-600">
                  {fmt(areaTotals.reduce((sum, row) => sum + row.letdownPieces, 0))}
                </td>
                <td className="border border-slate-900 bg-blue-50 px-3 py-1.5 text-right text-red-600">
                  {fmt(areaTotals.reduce((sum, row) => sum + row.putawayPlates, 0))}
                </td>
                <td className="border border-slate-900 bg-green-50 px-3 py-1.5 text-right text-red-600">
                  {fmt(areaTotals.reduce((sum, row) => sum + row.putawayPieces, 0))}
                </td>
                <td className="border border-slate-900 bg-blue-50 px-3 py-1.5 text-right text-red-600">
                  {fmt(areaTotals.reduce((sum, row) => sum + row.restockPlates, 0))}
                </td>
                <td className="border border-slate-900 bg-green-50 px-3 py-1.5 text-right text-red-600">
                  {fmt(areaTotals.reduce((sum, row) => sum + row.restockPieces, 0))}
                </td>
                <td className="border border-slate-900 bg-blue-50 px-3 py-1.5 text-right text-red-600">
                  {fmt(areaTotals.reduce((sum, row) => sum + row.bulkMovePlates, 0))}
                </td>
                <td className="border border-slate-900 bg-green-50 px-3 py-1.5 text-right text-red-600">
                  {fmt(areaTotals.reduce((sum, row) => sum + row.bulkMovePieces, 0))}
                </td>
                <td className="border border-slate-900 bg-yellow-200 px-3 py-1.5 text-right font-semibold text-red-600">
                  {fmt(areaTotals.reduce((sum, row) => sum + row.totalPlates, 0))}
                </td>
                <td className="border border-slate-900 bg-yellow-200 px-3 py-1.5 text-right font-semibold text-red-600">
                  {fmt(areaTotals.reduce((sum, row) => sum + row.totalPieces, 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </SummaryBox>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <TopListBox title="Top 3 Total Plates" rows={topByPlates} />
          <TopListBox title="Top 3 Total Pieces" rows={topByPieces} />
          <TopListBox title="Top 3 Letdowns - PCS" rows={topLetdown} />
          <TopListBox title="Top 3 Putaways - PCS" rows={topPutaway} />
        </div>
      </div>
    </div>
  );
}
