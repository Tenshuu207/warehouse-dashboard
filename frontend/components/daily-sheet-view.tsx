"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAppState } from "@/lib/app-state";
import {
  resolveOperatorIdentity,
  type EmployeeRecord,
  type OperatorDefault,
  type RfMapping,
} from "@/lib/employee-identity";
import {
  resolveAssignedAreaLabel,
  resolveCanonicalAssignedDisplay,
  resolveDisplayRoleLabel,
} from "@/lib/area-labels";
import type {
  DailyAssignmentsPayload,
  DailyOperatorPlacement,
} from "@/lib/assignments/daily-assignments-types";

type DailyResponse = {
  date: string;
  operators?: Array<Record<string, unknown>>;
};

type Tracking = {
  primaryReplenishmentRole?: string | null;
  primaryReplenishmentAreaCode?: string | null;
};

type HomeTemplate = {
  section: string;
  role: string;
};


type Row = {
  assignmentKey: string;
  employeeId: string | null;
  primaryUserid: string;
  rfUsernames: string[];
  name: string;
  officialSection: string;
  officialRole: string;
  observedSectionLabel: string;
  observedRoleLabel: string;
  section: string;
  role: string;
  area: string;
  positionLabel: string;
  hasPlacementOverride: boolean;
  needsReview: boolean;
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
};

const SECTION_ORDER = [
  "Freezer",
  "Freezer PIR",
  "Dry",
  "Dry PIR",
  "Cooler",
  "Other",
] as const;

const SECTION_OPTIONS = [...SECTION_ORDER];

const BASE_ROLE_OPTIONS = [
  "FrzLet",
  "FrzPut",
  "FrzMix",
  "FrzPIR",
  "DryMix",
  "DryFlr",
  "DryPIR",
  "ClrMeat",
  "ClrDairy",
  "Produce",
  "Extra",
];

function fmt(value: number | null | undefined, digits = 0) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function safeNum(value: unknown) {
  return Number(value || 0);
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

function normalizeToken(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function normalizeNameKey(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function classifyFromRole(value: unknown): string | null {
  const v = normalizeToken(value);
  if (!v) return null;

  if (v.startsWith("FRZPIR")) return "Freezer PIR";
  if (v.startsWith("DRYPIR")) return "Dry PIR";
  if (v.startsWith("FRZ")) return "Freezer";
  if (v.startsWith("DRY")) return "Dry";
  if (v.startsWith("CLR") || v === "PRODUCE") return "Cooler";

  return null;
}

function classifyFromArea(value: unknown): string | null {
  return resolveAssignedAreaLabel(value);
}

function classifyFromTeam(value: unknown): string | null {
  return resolveAssignedAreaLabel(value) || classifyFromRole(value);
}

function sectionOrderIndex(section: string) {
  const idx = SECTION_ORDER.indexOf(section as (typeof SECTION_ORDER)[number]);
  return idx === -1 ? 999 : idx;
}

function badgeTone(kind: "home" | "observed" | "override" | "review") {
  switch (kind) {
    case "home":
      return "border-slate-200 bg-slate-50 text-slate-700";
    case "observed":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "override":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "review":
      return "border-amber-200 bg-amber-50 text-amber-700";
  }
}

function SummaryBox({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-2 border-slate-900 bg-white">
      <div className="bg-blue-700 px-3 py-1.5 text-center text-sm font-bold text-white">
        {title}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
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

function inferObservedSection(op: Record<string, unknown>) {
  const tracking = (op.userlsTracking || {}) as Tracking;

  const roleCandidates = [tracking.primaryReplenishmentRole, op.observedRole];
  for (const value of roleCandidates) {
    const section = classifyFromRole(value);
    if (section) return section;
  }

  const areaCandidates = [
    tracking.primaryReplenishmentAreaCode,
    op.observedArea,
    op.effectivePerformanceArea,
    op.rawDominantArea,
  ];

  for (const value of areaCandidates) {
    const section = classifyFromArea(value) || classifyFromTeam(value);
    if (section) return section;
  }

  return "Other";
}

function inferObservedRole(op: Record<string, unknown>) {
  const tracking = (op.userlsTracking || {}) as Tracking;

  return (
    resolveDisplayRoleLabel(
      tracking.primaryReplenishmentRole,
      op.observedRole,
      op.currentRole
    ) || "—"
  );
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

function normalizeDailyAreaLabel(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "Other";

  const classified = classifyFromArea(raw) || classifyFromTeam(raw);
  if (classified) return classified;

  const key = raw.toLowerCase();

  if (
    key.includes("cooler") ||
    key.includes("produce") ||
    key.includes("seafood") ||
    key.includes("chicken") ||
    key.includes("clr")
  ) {
    return "Cooler";
  }

  return raw;
}

type DailyAreaBucketLike = {
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
};

type DailyAreaRollupRow = {
  area: string;
  plates: number;
  pieces: number;
};

function getDailyAreaBucketsFromOperator(op: Record<string, unknown>): DailyAreaBucketLike[] {
  const tracking =
    op.userlsTracking && typeof op.userlsTracking === "object"
      ? (op.userlsTracking as Record<string, unknown>)
      : null;

  const direct = Array.isArray(op.areaBuckets) ? op.areaBuckets : null;
  const nested = tracking && Array.isArray(tracking.areaBuckets) ? tracking.areaBuckets : null;

  return (direct || nested || []) as DailyAreaBucketLike[];
}

export default function DailySheetView() {
  const { selectedWeek } = useAppState();
  const [data, setData] = useState<DailyResponse | null>(null);
  const [assignments, setAssignments] = useState<DailyAssignmentsPayload | null>(null);
  const [placementDrafts, setPlacementDrafts] = useState<Record<string, DailyOperatorPlacement>>({});
  const [defaults, setDefaults] = useState<Record<string, OperatorDefault>>({});
  const [employees, setEmployees] = useState<Record<string, EmployeeRecord>>({});
  const [mappings, setMappings] = useState<RfMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignmentMode, setAssignmentMode] = useState(false);
  const [savingAssignments, setSavingAssignments] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        setSaveMessage(null);

        const [dailyRes, assignmentsRes, defaultsRes, employeesRes, mappingsRes] = await Promise.all([
          fetch(`/api/dashboard/daily-enriched?date=${selectedWeek}`, { cache: "no-store" }),
          fetch(`/api/daily-assignments?date=${selectedWeek}`, { cache: "no-store" }),
          fetch("/api/operator-defaults", { cache: "no-store" }),
          fetch("/api/employees", { cache: "no-store" }),
          fetch("/api/rf-mappings", { cache: "no-store" }),
        ]);

        const dailyJson: DailyResponse & { details?: string } = await dailyRes.json();

        if (!dailyRes.ok) {
          throw new Error(dailyJson.details || "Failed to load daily sheet");
        }

        const assignmentsJson: DailyAssignmentsPayload = assignmentsRes.ok
          ? await assignmentsRes.json()
          : { date: selectedWeek, updatedAt: null, sections: [], placements: [] };

        const defaultsJson = defaultsRes.ok ? await defaultsRes.json() : { operators: {} };
        const employeesJson = employeesRes.ok ? await employeesRes.json() : { employees: {} };
        const mappingsJson = mappingsRes.ok ? await mappingsRes.json() : { mappings: [] };

        if (!cancelled) {
          setData(dailyJson);
          setAssignments(assignmentsJson);
          setDefaults(defaultsJson.operators || {});
          setEmployees(employeesJson.employees || {});
          setMappings(Array.isArray(mappingsJson.mappings) ? mappingsJson.mappings : []);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load daily sheet");
          setLoading(false);
        }
      }
    }

    if (!selectedWeek) {
      setLoading(false);
      setError("Select a date to load the daily sheet");
      setData(null);
      return () => {
        cancelled = true;
      };
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [selectedWeek]);

  useEffect(() => {
    const next: Record<string, DailyOperatorPlacement> = {};
    for (const placement of assignments?.placements || []) {
      if (placement?.assignmentKey) {
        next[placement.assignmentKey] = placement;
      }
    }
    setPlacementDrafts(next);
  }, [assignments]);

  const homeTemplates = useMemo(() => {
    const map = new Map<string, HomeTemplate>();

    for (const section of assignments?.sections || []) {
      const resolvedSection = classifyFromTeam(section.team) || section.team || "Other";
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
  }, [assignments]);

  const roleOptions = useMemo(() => {
    const labels = new Map<string, string>();

    function add(value: unknown) {
      const label = resolveDisplayRoleLabel(value);
      if (!label) return;
      const key = normalizeToken(label);
      if (!labels.has(key)) labels.set(key, label);
    }

    BASE_ROLE_OPTIONS.forEach(add);

    for (const section of assignments?.sections || []) {
      add(section.role);
    }

    for (const op of (data?.operators || []) as Array<Record<string, unknown>>) {
      add(op.effectiveAssignedRole);
      add(op.currentRole);
      add(op.rawAssignedRole);
      add(op.observedRole);
      add((op.userlsTracking as Tracking | undefined)?.primaryReplenishmentRole);
    }

    return Array.from(labels.values()).sort((a, b) => a.localeCompare(b));
  }, [assignments, data]);

  const rows = useMemo<Row[]>(() => {
    const ops = (data?.operators ?? []) as Array<Record<string, unknown>>;
    const grouped = new Map<string, Row & { observedSections: string[]; observedRoles: string[] }>();

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

      const name = String(resolved.displayName || fallbackName)
        .replace(/\s*\(RF\)\s*$/i, "")
        .trim() || fallbackName;

      const homeTemplate =
        homeTemplates.get(normalizeNameKey(name)) ||
        homeTemplates.get(normalizeNameKey(fallbackName)) ||
        null;

      const employeeId = resolved.employeeId || null;
      const assignmentKey = mergeKeyForEmployee(employeeId, name || fallbackName, userid);
      const placement = placementDrafts[assignmentKey];

      const baseAssignedDisplay = resolveCanonicalAssignedDisplay({
        observedInferred: {
          area: [op.effectiveAssignedArea, op.assignedArea, op.rawAssignedArea],
          role: [op.effectiveAssignedRole, op.assignedRole, op.rawAssignedRole],
        },
        homeDefault: {
          area: [homeTemplate?.section, resolved.defaultTeam],
          role: homeTemplate?.role,
        },
      });

      const sectionOverride = String(placement?.assignedSection || "").trim();
      const roleOverride = String(placement?.assignedRole || "").trim();
      const positionLabel = String(placement?.positionLabel || "").trim();

      const effectiveAssignedDisplay = resolveCanonicalAssignedDisplay({
        manualDaily: {
          area: placement?.assignedSection,
          role: placement?.assignedRole,
        },
        observedInferred: {
          area: [op.effectiveAssignedArea, op.assignedArea, op.rawAssignedArea],
          role: [op.effectiveAssignedRole, op.assignedRole, op.rawAssignedRole],
        },
        homeDefault: {
          area: [homeTemplate?.section, resolved.defaultTeam],
          role: homeTemplate?.role,
        },
      });

      const officialSectionBase = baseAssignedDisplay.area;
      const officialRoleBase = baseAssignedDisplay.role;
      const effectiveSection = effectiveAssignedDisplay.area;
      const effectiveRole = effectiveAssignedDisplay.role;

      const observedSection = inferObservedSection(op);
      const observedRole = inferObservedRole(op);

      const letdownPlates = safeNum(op.letdownPlates);
      const letdownPieces = safeNum(op.letdownPieces);
      const putawayPlates = safeNum(op.putawayPlates);
      const putawayPieces = safeNum(op.putawayPieces);
      const restockPlates = safeNum(op.restockPlatesRaw) || safeNum(op.restockPlates);
      const restockPieces = safeNum(op.restockPiecesRaw) || safeNum(op.restockPieces);
      const bulkMovePlates = safeNum(op.restockLikePlatesEstimated);
      const bulkMovePieces = safeNum(op.restockLikePiecesEstimated);
      const receivingPlates = safeNum(op.receivingPlates);
      const receivingPieces = safeNum(op.receivingPieces);
      const totalPlates = letdownPlates + putawayPlates + restockPlates + bulkMovePlates;
      const totalPieces = letdownPieces + putawayPieces + restockPieces + bulkMovePieces;
      const area = effectiveSection;

      if (!grouped.has(assignmentKey)) {
        grouped.set(assignmentKey, {
          assignmentKey,
          employeeId,
          primaryUserid: userid,
          rfUsernames: [userid],
          name,
          officialSection: officialSectionBase || "Other",
          officialRole: officialRoleBase || "—",
          observedSectionLabel: "",
          observedRoleLabel: "",
          section: effectiveSection,
          role: effectiveRole,
          area,
          positionLabel,
          hasPlacementOverride: !!sectionOverride || !!roleOverride || !!positionLabel,
          needsReview: false,
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
          observedSections: observedSection !== "Other" ? [observedSection] : [],
          observedRoles: observedRole !== "—" ? [observedRole] : [],
        });
        continue;
      }

      const existing = grouped.get(assignmentKey)!;
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

      if (observedSection !== "Other") {
        existing.observedSections = uniqueSorted([...existing.observedSections, observedSection]);
      }

      if (observedRole !== "—") {
        existing.observedRoles = uniqueSorted([...existing.observedRoles, observedRole]);
      }

      if (totalPieces > existing.totalPieces) {
        existing.primaryUserid = userid;
      }
    }

    return Array.from(grouped.values())
      .map((row) => {
        const observedSections = uniqueSorted(row.observedSections);
        const observedRoles = uniqueSorted(row.observedRoles);

        const sectionMismatch =
          row.officialSection !== "Other" &&
          observedSections.length > 0 &&
          observedSections.some((value) => value !== row.officialSection);

        const roleMismatch =
          row.officialRole !== "—" &&
          observedRoles.length > 0 &&
          observedRoles.every((value) => value !== row.officialRole);

        return {
          assignmentKey: row.assignmentKey,
          employeeId: row.employeeId,
          primaryUserid: row.primaryUserid,
          rfUsernames: row.rfUsernames,
          name: row.name,
          officialSection: row.officialSection,
          officialRole: row.officialRole,
          observedSectionLabel: observedSections.length ? observedSections.join(", ") : "—",
          observedRoleLabel: observedRoles.length ? observedRoles.join(", ") : "—",
          section: row.section,
          role: row.role,
          area: row.area,
          positionLabel: row.positionLabel,
          hasPlacementOverride: row.hasPlacementOverride,
          needsReview: sectionMismatch || roleMismatch,
          letdownPlates: row.letdownPlates,
          letdownPieces: row.letdownPieces,
          putawayPlates: row.putawayPlates,
          putawayPieces: row.putawayPieces,
          restockPlates: row.restockPlates,
          restockPieces: row.restockPieces,
          bulkMovePlates: row.bulkMovePlates,
          bulkMovePieces: row.bulkMovePieces,
          totalPlates: row.totalPlates,
          totalPieces: row.totalPieces,
          receivingPlates: row.receivingPlates,
          receivingPieces: row.receivingPieces,
          avgPcsPerPlate: avgPcsPerPlate(row.totalPieces, row.totalPlates),
        };
      })
      .filter(
        (row) => row.totalPlates > 0 || row.receivingPlates > 0 || row.receivingPieces > 0
      )
      .sort((a, b) => {
        const sectionDiff = sectionOrderIndex(a.section) - sectionOrderIndex(b.section);
        if (sectionDiff !== 0) return sectionDiff;
        return b.totalPieces - a.totalPieces;
      });
  }, [data, selectedWeek, employees, mappings, defaults, homeTemplates, placementDrafts]);

  const sections = useMemo(() => {
    return SECTION_ORDER.map((section) => {
      const sectionRows = rows.filter((row) => row.section === section);

      return {
        section,
        rows: sectionRows,
        totals: sectionRows.reduce(
          (acc, row) => {
            acc.letdownPlates += row.letdownPlates;
            acc.letdownPieces += row.letdownPieces;
            acc.putawayPlates += row.putawayPlates;
            acc.putawayPieces += row.putawayPieces;
            acc.restockPlates += row.restockPlates;
            acc.restockPieces += row.restockPieces;
            acc.totalPlates += row.totalPlates;
            acc.totalPieces += row.totalPieces;
            return acc;
          },
          {
            letdownPlates: 0,
            letdownPieces: 0,
            putawayPlates: 0,
            putawayPieces: 0,
            restockPlates: 0,
            restockPieces: 0,
            totalPlates: 0,
            totalPieces: 0,
          }
        ),
      };
    });
  }, [rows]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.totalPlates += row.totalPlates;
        acc.totalPieces += row.totalPieces;
        acc.receivingPlates += row.receivingPlates;
        acc.receivingPieces += row.receivingPieces;
        return acc;
      },
      {
        totalPlates: 0,
        totalPieces: 0,
        receivingPlates: 0,
        receivingPieces: 0,
      }
    );
  }, [rows]);

  const topByPieces = useMemo(
    () =>
      [...rows]
        .sort((a, b) => b.totalPieces - a.totalPieces)
        .slice(0, 3)
        .map((row) => ({ label: row.name, value: fmt(row.totalPieces) })),
    [rows]
  );

  const topByPlates = useMemo(
    () =>
      [...rows]
        .sort((a, b) => b.totalPlates - a.totalPlates)
        .slice(0, 3)
        .map((row) => ({ label: row.name, value: fmt(row.totalPlates) })),
    [rows]
  );

  const topReceiving = useMemo(
    () =>
      [...rows]
        .filter((row) => row.receivingPlates > 0 || row.receivingPieces > 0)
        .sort((a, b) => b.receivingPieces - a.receivingPieces)
        .slice(0, 5),
    [rows]
  );

  const needsReviewCount = useMemo(
    () => rows.filter((row) => row.needsReview).length,
    [rows]
  );

  function updatePlacement(
    row: Row,
    patch: Partial<DailyOperatorPlacement>
  ) {
    setPlacementDrafts((prev) => {
      const next: Record<string, DailyOperatorPlacement> = { ...prev };
      const current = next[row.assignmentKey];
      const currentWithoutAssignmentKey = current ? { ...current } : null;

      if (currentWithoutAssignmentKey) {
        delete currentWithoutAssignmentKey.assignmentKey;
      }

      const merged: DailyOperatorPlacement = {
        assignmentKey: row.assignmentKey,
        employeeId: row.employeeId,
        employeeName: row.name,
        rfUsernames: row.rfUsernames,
        ...currentWithoutAssignmentKey,
        ...patch,
      };

      const assignedSection = String(merged.assignedSection || "").trim();
      const assignedRole = String(merged.assignedRole || "").trim();
      const positionLabel = String(merged.positionLabel || "").trim();
      const note = String(merged.note || "").trim();

      if (!assignedSection && !assignedRole && !positionLabel && !note) {
        delete next[row.assignmentKey];
      } else {
        next[row.assignmentKey] = {
          assignmentKey: row.assignmentKey,
          employeeId: row.employeeId,
          employeeName: row.name,
          rfUsernames: row.rfUsernames,
          assignedSection: assignedSection || null,
          assignedRole: assignedRole || null,
          positionLabel: positionLabel || null,
          note: note || null,
        };
      }

      return next;
    });
  }

  async function savePlacements() {
    try {
      setSavingAssignments(true);
      setSaveMessage(null);
      setError(null);

      const placements = Object.values(placementDrafts)
        .map((placement) => ({
          assignmentKey: placement.assignmentKey,
          employeeId: placement.employeeId || null,
          employeeName: placement.employeeName || null,
          rfUsernames: Array.isArray(placement.rfUsernames) ? placement.rfUsernames : [],
          assignedSection: placement.assignedSection || null,
          assignedRole: placement.assignedRole || null,
          positionLabel: placement.positionLabel || null,
          note: placement.note || null,
        }))
        .filter(
          (placement) =>
            placement.assignmentKey &&
            (placement.assignedSection || placement.assignedRole || placement.positionLabel || placement.note)
        );

      const res = await fetch("/api/daily-assignments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: selectedWeek,
          sections: assignments?.sections || [],
          placements,
        }),
      });

      const json = (await res.json()) as {
        error?: string;
        payload?: DailyAssignmentsPayload;
      };

      if (!res.ok || !json.payload) {
        throw new Error(json.error || "Failed to save daily placements");
      }

      setAssignments(json.payload);
      setSaveMessage("Daily placement changes saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save daily placements");
    } finally {
      setSavingAssignments(false);
    }
  }


  const dailyAreaTotals = useMemo<DailyAreaRollupRow[]>(() => {
    const ops = (data?.operators ?? []) as Array<Record<string, unknown>>;
    const grouped = new Map<string, DailyAreaRollupRow>();

    function add(area: string, plates: number, pieces: number) {
      const normalized = normalizeDailyAreaLabel(area);
      const current = grouped.get(normalized) || {
        area: normalized,
        plates: 0,
        pieces: 0,
      };

      current.plates += plates;
      current.pieces += pieces;
      grouped.set(normalized, current);
    }

    for (const op of ops) {
      const buckets = getDailyAreaBucketsFromOperator(op);

      if (buckets.length > 0) {
        for (const bucket of buckets) {
          const letdownPlates = safeNum(bucket.letdownPlates);
          const letdownPieces = safeNum(bucket.letdownPieces);
          const putawayPlates = safeNum(bucket.putawayPlates);
          const putawayPieces = safeNum(bucket.putawayPieces);
          const restockPlates = safeNum(bucket.restockPlatesRaw) || safeNum(bucket.restockPlates);
          const restockPieces = safeNum(bucket.restockPiecesRaw) || safeNum(bucket.restockPieces);
          const bulkMovePlates = safeNum(bucket.restockLikePlatesEstimated);
          const bulkMovePieces = safeNum(bucket.restockLikePiecesEstimated);

          add(
            String(bucket.areaCode || bucket.area || bucket.label || bucket.name || "Other"),
            letdownPlates + putawayPlates + restockPlates + bulkMovePlates,
            letdownPieces + putawayPieces + restockPieces + bulkMovePieces
          );
        }
        continue;
      }

      const fallbackArea = String(
        op.effectivePerformanceArea ||
          op.rawDominantArea ||
          op.effectiveAssignedArea ||
          op.area ||
          "Other"
      );

      const letdownPlates = safeNum(op.letdownPlates);
      const letdownPieces = safeNum(op.letdownPieces);
      const putawayPlates = safeNum(op.putawayPlates);
      const putawayPieces = safeNum(op.putawayPieces);
      const restockPlates = safeNum(op.restockPlatesRaw) || safeNum(op.restockPlates);
      const restockPieces = safeNum(op.restockPiecesRaw) || safeNum(op.restockPieces);
      const bulkMovePlates = safeNum(op.restockLikePlatesEstimated);
      const bulkMovePieces = safeNum(op.restockLikePiecesEstimated);

      add(
        fallbackArea,
        letdownPlates + putawayPlates + restockPlates + bulkMovePlates,
        letdownPieces + putawayPieces + restockPieces + bulkMovePieces
      );
    }

    return [...grouped.values()]
      .filter((row) => row.plates > 0 || row.pieces > 0)
      .sort((a, b) => {
        const pieceDiff = b.pieces - a.pieces;
        if (pieceDiff !== 0) return pieceDiff;
        return a.area.localeCompare(b.area);
      });
  }, [data]);

  if (loading) {
    return (
      <div className="border-2 border-slate-900 bg-white p-4 text-sm text-slate-600">
        Loading daily sheet…
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
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Daily Assignment Board</div>
            <div className="mt-1 text-xs text-slate-500">
              Official area and role drive placement. Observed work stays visible as context and review signal.
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
              <span className={`inline-flex rounded-full border px-2 py-0.5 font-medium ${badgeTone("home")}`}>
                Home placement drives section
              </span>
              <span className={`inline-flex rounded-full border px-2 py-0.5 font-medium ${badgeTone("observed")}`}>
                Observed work = context
              </span>
              <span className={`inline-flex rounded-full border px-2 py-0.5 font-medium ${badgeTone("review")}`}>
                {needsReviewCount} mismatch{needsReviewCount === 1 ? "" : "es"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {assignments?.updatedAt ? (
              <div className="text-[11px] text-slate-500">
                Updated {new Date(assignments.updatedAt).toLocaleString()}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => setAssignmentMode((value) => !value)}
              className={[
                "rounded-lg border px-3 py-2 text-sm font-medium",
                assignmentMode
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "bg-white text-slate-700 hover:bg-slate-50",
              ].join(" ")}
            >
              {assignmentMode ? "Exit Assignment Mode" : "Assignment Mode"}
            </button>
            {assignmentMode ? (
              <button
                type="button"
                onClick={() => void savePlacements()}
                disabled={savingAssignments}
                className="rounded-lg border border-emerald-700 bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingAssignments ? "Saving…" : "Save Daily Changes"}
              </button>
            ) : null}
          </div>
        </div>

        {saveMessage ? <div className="mt-3 text-sm text-emerald-700">{saveMessage}</div> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {sections.map((section) => (
            <div key={section.section} className="overflow-x-auto border-2 border-slate-900 bg-white">
              <table className="w-full min-w-[1360px] border-collapse text-sm">
                <thead>
                  <tr className="bg-blue-700 text-white">
                    <th className="border border-slate-900 px-3 py-2 text-left" colSpan={4}>
                      {section.section}
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
                      Total Handled
                    </th>
                    <th className="border border-slate-900 px-3 py-2 text-center">
                      Avg PCS/Plate
                    </th>
                  </tr>
                  <tr className="bg-slate-100 text-slate-900">
                    <th className="border border-slate-900 px-3 py-1.5 text-left">Operator</th>
                    <th className="border border-slate-900 px-3 py-1.5 text-left">Assignment</th>
                    <th className="border border-slate-900 px-3 py-1.5 text-left">Role</th>
                    <th className="border border-slate-900 px-3 py-1.5 text-left">Position</th>
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
                  {section.rows.length === 0 ? (
                    <tr>
                      <td className="border border-slate-900 px-3 py-3 text-sm text-slate-500" colSpan={13}>
                        No rows in this section for {selectedWeek}.
                      </td>
                    </tr>
                  ) : (
                    section.rows.map((row) => (
                      <tr key={row.assignmentKey}>
                        <td className="border border-slate-900 px-3 py-1.5 align-top font-medium">
                          <Link
                            href={`/operators/${encodeURIComponent(row.primaryUserid)}`}
                            className="hover:underline"
                          >
                            {row.name}
                          </Link>
                          <div className="text-[11px] text-slate-500">
                            RF IDs: {row.rfUsernames.join(", ")}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 font-medium ${badgeTone("home")}`}>
                              Home: {row.officialSection}
                            </span>
                            <span className={`inline-flex rounded-full border px-2 py-0.5 font-medium ${badgeTone("home")}`}>
                              Role: {row.officialRole}
                            </span>
                            {row.observedSectionLabel !== "—" ? (
                              <span className={`inline-flex rounded-full border px-2 py-0.5 font-medium ${badgeTone("observed")}`}>
                                Observed: {row.observedSectionLabel}
                              </span>
                            ) : null}
                            {row.observedRoleLabel !== "—" ? (
                              <span className={`inline-flex rounded-full border px-2 py-0.5 font-medium ${badgeTone("observed")}`}>
                                Obs Role: {row.observedRoleLabel}
                              </span>
                            ) : null}
                            {row.hasPlacementOverride ? (
                              <span className={`inline-flex rounded-full border px-2 py-0.5 font-medium ${badgeTone("override")}`}>
                                Daily override
                              </span>
                            ) : null}
                            {row.needsReview ? (
                              <span className={`inline-flex rounded-full border px-2 py-0.5 font-medium ${badgeTone("review")}`}>
                                Review mismatch
                              </span>
                            ) : null}
                          </div>
                        </td>

                        <td className="border border-slate-900 px-3 py-1.5 align-top">
                          {assignmentMode ? (
                            <select
                              value={String(placementDrafts[row.assignmentKey]?.assignedSection || "")}
                              onChange={(event) =>
                                updatePlacement(row, {
                                  assignedSection: event.target.value || null,
                                })
                              }
                              className="w-full rounded border bg-white px-2 py-1 text-sm"
                            >
                              <option value="">Use Home ({row.officialSection})</option>
                              {SECTION_OPTIONS.map((option) => (
                                <option key={`${row.assignmentKey}-section-${option}`} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div>
                              <div className="font-medium text-slate-900">{row.section}</div>
                              <div className="text-[11px] text-slate-500">Area: {row.area}</div>
                            </div>
                          )}
                        </td>

                        <td className="border border-slate-900 px-3 py-1.5 align-top">
                          {assignmentMode ? (
                            <select
                              value={String(placementDrafts[row.assignmentKey]?.assignedRole || "")}
                              onChange={(event) =>
                                updatePlacement(row, {
                                  assignedRole: event.target.value || null,
                                })
                              }
                              className="w-full rounded border bg-white px-2 py-1 text-sm"
                            >
                              <option value="">Use Home ({row.officialRole})</option>
                              {roleOptions.map((option) => (
                                <option key={`${row.assignmentKey}-role-${option}`} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div>
                              <div className="font-medium text-slate-900">{row.role}</div>
                              <div className="text-[11px] text-slate-500">
                                Observed: {row.observedRoleLabel}
                              </div>
                            </div>
                          )}
                        </td>

                        <td className="border border-slate-900 px-3 py-1.5 align-top">
                          {assignmentMode ? (
                            <input
                              type="text"
                              value={String(placementDrafts[row.assignmentKey]?.positionLabel || "")}
                              onChange={(event) =>
                                updatePlacement(row, {
                                  positionLabel: event.target.value,
                                })
                              }
                              placeholder="Position / slot"
                              className="w-full rounded border bg-white px-2 py-1 text-sm"
                            />
                          ) : row.positionLabel ? (
                            <span className="font-medium text-slate-900">{row.positionLabel}</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        <td className="border border-slate-900 bg-blue-50 px-3 py-1.5 text-right">
                          {fmt(row.letdownPlates)}
                        </td>
                        <td className="border border-slate-900 bg-blue-50 px-3 py-1.5 text-right">
                          {fmt(row.letdownPieces)}
                        </td>
                        <td className="border border-slate-900 bg-orange-50 px-3 py-1.5 text-right">
                          {fmt(row.putawayPlates)}
                        </td>
                        <td className="border border-slate-900 bg-orange-50 px-3 py-1.5 text-right">
                          {fmt(row.putawayPieces)}
                        </td>
                        <td className="border border-slate-900 bg-green-50 px-3 py-1.5 text-right">
                          {fmt(row.restockPlates)}
                        </td>
                        <td className="border border-slate-900 bg-green-50 px-3 py-1.5 text-right">
                          {fmt(row.restockPieces)}
                        </td>
                        <td className="border border-slate-900 bg-yellow-100 px-3 py-1.5 text-right font-semibold">
                          {fmt(row.totalPlates)}
                        </td>
                        <td className="border border-slate-900 bg-yellow-100 px-3 py-1.5 text-right font-semibold">
                          {fmt(row.totalPieces)}
                        </td>
                        <td className="border border-slate-900 bg-yellow-50 px-3 py-1.5 text-right">
                          {fmt(row.avgPcsPerPlate, 0)}
                        </td>
                      </tr>
                    ))
                  )}
                  <tr className="font-bold">
                    <td className="border border-slate-900 bg-yellow-200 px-3 py-2" colSpan={4}>
                      Total
                    </td>
                    <td className="border border-slate-900 bg-yellow-200 px-3 py-2 text-right text-red-600">
                      {fmt(section.totals.letdownPlates)}
                    </td>
                    <td className="border border-slate-900 bg-yellow-200 px-3 py-2 text-right text-red-600">
                      {fmt(section.totals.letdownPieces)}
                    </td>
                    <td className="border border-slate-900 bg-yellow-200 px-3 py-2 text-right text-red-600">
                      {fmt(section.totals.putawayPlates)}
                    </td>
                    <td className="border border-slate-900 bg-yellow-200 px-3 py-2 text-right text-red-600">
                      {fmt(section.totals.putawayPieces)}
                    </td>
                    <td className="border border-slate-900 bg-yellow-200 px-3 py-2 text-right text-red-600">
                      {fmt(section.totals.restockPlates)}
                    </td>
                    <td className="border border-slate-900 bg-yellow-200 px-3 py-2 text-right text-red-600">
                      {fmt(section.totals.restockPieces)}
                    </td>
                    <td className="border border-slate-900 bg-yellow-200 px-3 py-2 text-right text-red-600">
                      {fmt(section.totals.totalPlates)}
                    </td>
                    <td className="border border-slate-900 bg-yellow-200 px-3 py-2 text-right text-red-600">
                      {fmt(section.totals.totalPieces)}
                    </td>
                    <td className="border border-slate-900 bg-yellow-100 px-3 py-2 text-right text-red-600">
                      {fmt(avgPcsPerPlate(section.totals.totalPieces, section.totals.totalPlates), 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <SummaryBox title={`Daily ${selectedWeek}`}>
            <div className="space-y-3">
              <div className="border border-slate-900 bg-yellow-200 px-3 py-4 text-center">
                <div className="text-sm font-medium text-slate-700">
                  Daily Total Handled License Plates
                </div>
                <div className="mt-2 text-4xl font-bold text-red-600">
                  {fmt(totals.totalPlates)}
                </div>
              </div>

              <div className="border border-slate-900">
                <div className="bg-green-700 px-3 py-1.5 text-center text-sm font-bold text-white">
                  Receiving Total
                </div>
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
                      <tr key={`recv-${row.assignmentKey}`}>
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
              </div>
            </div>
          </SummaryBox>

          <TopListBox title="Most Pieces" rows={topByPieces} />
          <TopListBox title="Most Plates" rows={topByPlates} />

            <SummaryBox title="Area Rollup">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-slate-900">
                  <tr>
                    <th className="border border-slate-900 px-3 py-1.5 text-left">Area</th>
                    <th className="border border-slate-900 px-3 py-1.5 text-right">Plates</th>
                    <th className="border border-slate-900 px-3 py-1.5 text-right">Pieces</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyAreaTotals.length === 0 ? (
                    <tr>
                      <td className="border border-slate-900 px-3 py-3 text-slate-400" colSpan={3}>
                        No area activity found
                      </td>
                    </tr>
                  ) : (
                    dailyAreaTotals.map((row) => (
                      <tr key={`daily-area-${row.area}`}>
                        <td className="border border-slate-900 px-3 py-1.5">{row.area}</td>
                        <td className="border border-slate-900 px-3 py-1.5 text-right">
                          {fmt(row.plates)}
                        </td>
                        <td className="border border-slate-900 px-3 py-1.5 text-right">
                          {fmt(row.pieces)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </SummaryBox>
        </div>
      </div>
    </div>
  );
}
