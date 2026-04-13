"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppState } from "@/lib/app-state";
import type { StandardsPayload, StandardsRow } from "@/lib/standards/types";

type JsonRecord = Record<string, unknown>;

type OperatorPerformanceRow = {
  name: string;
  role: string | null;
  teamArea: string | null;
  actualPlates: number;
  actualPieces: number;
  standardSource: "role" | "team_area" | "none";
  standardName: string | null;
  standardStatus: "ready" | "provisional" | null;
  standardDailyPlates: number;
  standardDailyPieces: number;
  platesPct: number | null;
  piecesPct: number | null;
  compositePct: number | null;
};

type TeamAreaPerformanceRow = {
  teamArea: string;
  actualPlates: number;
  actualPieces: number;
  standardDailyPlates: number;
  standardDailyPieces: number;
  platesPct: number | null;
  piecesPct: number | null;
  compositePct: number | null;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(obj: JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function getNumber(obj: JsonRecord, keys: string[]): number {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return 0;
}

function fmt(value: number | null, digits = 0) {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function pct(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function average(values: Array<number | null>) {
  const nums = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (!nums.length) return null;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function normalizeRole(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim();

  const direct = new Set([
    "ClrDairy",
    "ClrMeat",
    "Produce",
    "DryFlr",
    "DryMix",
    "DryPIR",
    "FrzLet",
    "FrzMix",
    "FrzPIR",
    "FrzPut",
  ]);

  if (direct.has(value)) return value;

  const lower = value.toLowerCase();

  if (lower.includes("dairy")) return "ClrDairy";
  if (lower.includes("meat")) return "ClrMeat";
  if (lower.includes("produce")) return "Produce";
  if (lower.includes("dryflr") || lower.includes("dry flr") || lower.includes("dry floor")) return "DryFlr";
  if (lower.includes("drymix") || lower.includes("dry mix")) return "DryMix";
  if (lower.includes("drypir") || lower.includes("dry pir")) return "DryPIR";
  if (lower.includes("frzlet") || lower.includes("frz let")) return "FrzLet";
  if (lower.includes("frzmix") || lower.includes("frz mix")) return "FrzMix";
  if (lower.includes("frzpir") || lower.includes("frz pir")) return "FrzPIR";
  if (lower.includes("frzput") || lower.includes("frz put")) return "FrzPut";

  return value;
}

function teamAreaFromRole(role: string | null): string | null {
  if (!role) return null;
  if (role === "ClrDairy" || role === "ClrMeat" || role === "Produce") return "Cooler";
  if (role === "DryFlr" || role === "DryMix" || role === "DryPIR") return "Dry";
  if (role === "FrzLet" || role === "FrzMix" || role === "FrzPIR" || role === "FrzPut") return "Freezer";
  return null;
}

function normalizeTeamArea(raw: string | null, fallbackRole: string | null): string | null {
  if (raw) {
    const value = raw.trim().toLowerCase();
    if (value.includes("cool")) return "Cooler";
    if (value.includes("freez")) return "Freezer";
    if (value.includes("dry")) return "Dry";
  }

  return teamAreaFromRole(fallbackRole);
}

function extractOperators(payload: unknown): JsonRecord[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }

  if (!isRecord(payload)) return [];

  const directCandidates = ["operators", "rows", "items", "data"];
  for (const key of directCandidates) {
    const value = payload[key];
    if (Array.isArray(value)) return value.filter(isRecord);
  }

  const nestedData = payload["data"];
  if (isRecord(nestedData)) {
    for (const key of directCandidates) {
      const value = nestedData[key];
      if (Array.isArray(value)) return value.filter(isRecord);
    }
  }

  return [];
}

function toneClasses(value: number | null) {
  if (value === null) return "bg-slate-100 text-slate-600";
  if (value >= 105) return "bg-emerald-50 text-emerald-700";
  if (value >= 95) return "bg-blue-50 text-blue-700";
  return "bg-amber-50 text-amber-800";
}

function statusClasses(status: "ready" | "provisional" | null) {
  if (status === "ready") return "bg-emerald-50 text-emerald-700";
  if (status === "provisional") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

function TeamCard({ row }: { row: TeamAreaPerformanceRow }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">{row.teamArea}</div>
          <div className="mt-1 text-xs text-slate-500">Combined team output vs standard</div>
        </div>
        <div className={`rounded-full px-3 py-1 text-sm font-semibold ${toneClasses(row.compositePct)}`}>
          {pct(row.compositePct)}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Plates</div>
          <div className="mt-1 font-semibold text-slate-900">
            {fmt(row.actualPlates, 1)} / {fmt(row.standardDailyPlates, 1)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Pieces</div>
          <div className="mt-1 font-semibold text-slate-900">
            {fmt(row.actualPieces, 1)} / {fmt(row.standardDailyPieces, 1)}
          </div>
        </div>
      </div>

      <div className="mt-3 flex gap-4 text-xs text-slate-600">
        <span>Plates {pct(row.platesPct)}</span>
        <span>Pieces {pct(row.piecesPct)}</span>
      </div>
    </div>
  );
}

function OperatorItem({ row }: { row: OperatorPerformanceRow }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">{row.name}</div>
          <div className="mt-1 text-xs text-slate-500">
            {(row.role || "Unknown Role")} · {(row.teamArea || "Unknown Area")}
          </div>
        </div>

        <div className={`rounded-full px-3 py-1 text-sm font-semibold ${toneClasses(row.compositePct)}`}>
          {pct(row.compositePct)}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${statusClasses(row.standardStatus)}`}>
          {row.standardStatus || "no status"}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700">
          Std: {row.standardName || "None"}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700">
          Source: {row.standardSource}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Plates</div>
          <div className="mt-1 font-semibold text-slate-900">
            {fmt(row.actualPlates)} / {fmt(row.standardDailyPlates)}
          </div>
          <div className="mt-1 text-xs text-slate-600">{pct(row.platesPct)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Pieces</div>
          <div className="mt-1 font-semibold text-slate-900">
            {fmt(row.actualPieces)} / {fmt(row.standardDailyPieces)}
          </div>
          <div className="mt-1 text-xs text-slate-600">{pct(row.piecesPct)}</div>
        </div>
      </div>
    </div>
  );
}

export default function PerformanceMobileSummary() {
  const { selectedWeek } = useAppState();

  const [standards, setStandards] = useState<StandardsPayload | null>(null);
  const [operators, setOperators] = useState<JsonRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [standardsRes, dashboardRes] = await Promise.all([
          fetch("/api/standards/no-restock", { cache: "no-store" }),
          fetch(`/api/dashboard/daily-enriched?date=${encodeURIComponent(selectedWeek)}`, {
            cache: "no-store",
          }),
        ]);

        if (!standardsRes.ok) throw new Error("Failed to load standards");
        if (!dashboardRes.ok) throw new Error("Failed to load daily dashboard data");

        const standardsJson = (await standardsRes.json()) as StandardsPayload;
        const dashboardJson = await dashboardRes.json();

        if (!cancelled) {
          setStandards(standardsJson);
          setOperators(extractOperators(dashboardJson));
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load performance summary");
          setLoading(false);
        }
      }
    }

    if (!selectedWeek) {
      setLoading(false);
      setError("Select a date to load performance");
      setOperators([]);
      setStandards(null);
      return () => {
        cancelled = true;
      };
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [selectedWeek]);

  const roleMap = useMemo(() => {
    const map = new Map<string, StandardsRow>();
    for (const row of standards?.roles || []) map.set(row.scopeName, row);
    return map;
  }, [standards]);

  const teamMap = useMemo(() => {
    const map = new Map<string, StandardsRow>();
    for (const row of standards?.teamAreas || []) map.set(row.scopeName, row);
    return map;
  }, [standards]);

  const operatorRows = useMemo(() => {
    return operators
      .map((op): OperatorPerformanceRow | null => {
        const role = normalizeRole(
          getString(op, [
            "primaryReplenishmentRole",
            "observedRole",
            "effectiveRole",
            "assignedRole",
            "role",
          ])
        );

        const teamArea = normalizeTeamArea(
          getString(op, [
            "effectivePerformanceArea",
            "rawDominantArea",
            "assignedArea",
            "teamArea",
            "area",
          ]),
          role
        );

        const actualPlates = getNumber(op, ["letdownPlates"]) + getNumber(op, ["putawayPlates"]);
        const actualPieces = getNumber(op, ["letdownPieces"]) + getNumber(op, ["putawayPieces"]);

        if (actualPlates <= 0 && actualPieces <= 0) return null;

        const roleStandard = role ? roleMap.get(role) || null : null;
        const teamStandard = teamArea ? teamMap.get(teamArea) || null : null;
        const standard = roleStandard || teamStandard;

        const standardSource: OperatorPerformanceRow["standardSource"] = roleStandard
          ? "role"
          : teamStandard
            ? "team_area"
            : "none";

        const platesPct =
          standard && standard.dailyPlatesStandard > 0
            ? (actualPlates / standard.dailyPlatesStandard) * 100
            : null;

        const piecesPct =
          standard && standard.dailyPiecesStandard > 0
            ? (actualPieces / standard.dailyPiecesStandard) * 100
            : null;

        return {
          name:
            getString(op, ["name", "employeeName", "fullName", "displayName", "userid"]) ||
            "Unknown",
          role,
          teamArea,
          actualPlates,
          actualPieces,
          standardSource,
          standardName: standard?.scopeName || null,
          standardStatus: standard?.status || null,
          standardDailyPlates: standard?.dailyPlatesStandard || 0,
          standardDailyPieces: standard?.dailyPiecesStandard || 0,
          platesPct,
          piecesPct,
          compositePct: average([platesPct, piecesPct]),
        };
      })
      .filter((row): row is OperatorPerformanceRow => Boolean(row))
      .sort((a, b) => (a.compositePct || -1) - (b.compositePct || -1));
  }, [operators, roleMap, teamMap]);

  const teamAreaRows = useMemo(() => {
    const grouped = new Map<string, { actualPlates: number; actualPieces: number }>();

    for (const row of operatorRows) {
      if (!row.teamArea) continue;
      const current = grouped.get(row.teamArea) || { actualPlates: 0, actualPieces: 0 };
      current.actualPlates += row.actualPlates;
      current.actualPieces += row.actualPieces;
      grouped.set(row.teamArea, current);
    }

    return ["Cooler", "Dry", "Freezer"]
      .map((teamArea): TeamAreaPerformanceRow | null => {
        const actual = grouped.get(teamArea);
        const standard = teamMap.get(teamArea);
        if (!actual || !standard) return null;

        const platesPct =
          standard.dailyPlatesStandard > 0
            ? (actual.actualPlates / standard.dailyPlatesStandard) * 100
            : null;
        const piecesPct =
          standard.dailyPiecesStandard > 0
            ? (actual.actualPieces / standard.dailyPiecesStandard) * 100
            : null;

        return {
          teamArea,
          actualPlates: actual.actualPlates,
          actualPieces: actual.actualPieces,
          standardDailyPlates: standard.dailyPlatesStandard,
          standardDailyPieces: standard.dailyPiecesStandard,
          platesPct,
          piecesPct,
          compositePct: average([platesPct, piecesPct]),
        };
      })
      .filter((row): row is TeamAreaPerformanceRow => Boolean(row));
  }, [operatorRows, teamMap]);

  const matchedOperators = useMemo(
    () => operatorRows.filter((row) => row.standardSource !== "none"),
    [operatorRows]
  );

  const needsAttention = useMemo(
    () => [...matchedOperators].sort((a, b) => (a.compositePct || 999) - (b.compositePct || 999)).slice(0, 6),
    [matchedOperators]
  );

  const topPerformers = useMemo(
    () => [...matchedOperators].sort((a, b) => (b.compositePct || -1) - (a.compositePct || -1)).slice(0, 6),
    [matchedOperators]
  );

  const unmatchedCount = useMemo(
    () => operatorRows.filter((row) => row.standardSource === "none").length,
    [operatorRows]
  );

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-sm text-slate-600">Loading standards-based performance summary...</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-red-200 bg-white p-5 shadow-sm">
        <div className="text-sm text-red-700">{error}</div>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Performance Command View</h2>
            <p className="mt-1 text-sm text-slate-600">
              Start with teams, then operators needing attention. Full rankings stay collapsed below.
            </p>
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
            Week: {selectedWeek}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
            Matched: {matchedOperators.length}
          </span>
          <span className="rounded-full bg-amber-50 px-3 py-1 font-medium text-amber-700">
            Unmatched: {unmatchedCount}
          </span>
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Team Performance</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {teamAreaRows.map((row) => (
            <TeamCard key={row.teamArea} row={row} />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Needs Attention</h3>
            <p className="mt-1 text-sm text-slate-600">
              Lowest operators against matched standards, using letdown + putaway only.
            </p>
          </div>
        </div>

        <div className="grid gap-4">
          {needsAttention.map((row) => (
            <OperatorItem key={`${row.name}-${row.role}-${row.teamArea}-attention`} row={row} />
          ))}
        </div>
      </section>

      <details className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-slate-900">
          Top Performers
        </summary>
        <div className="space-y-4 border-t border-slate-200 px-5 py-5">
          {topPerformers.map((row) => (
            <OperatorItem key={`${row.name}-${row.role}-${row.teamArea}-top`} row={row} />
          ))}
        </div>
      </details>
    </section>
  );
}
