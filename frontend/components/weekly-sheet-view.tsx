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
  resolveOperatorIdentity,
  type EmployeeRecord,
  type OperatorDefault,
  type RfMapping,
} from "@/lib/employee-identity";

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

function normalizeWeeklyAreaLabel(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "Other";

  const key = raw.toLowerCase();

  if (key.includes("freezer pir") || key == "frzpir") return "Freezer PIR";
  if (key == "freezer" || key.startsWith("frz")) return "Freezer";
  if (key.includes("dry pir") || key == "drypir") return "Dry PIR";
  if (key == "dry" || key.startsWith("dry")) return "Dry";

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
  area: string;
  letdownPlates: number;
  letdownPieces: number;
  putawayPlates: number;
  putawayPieces: number;
  restockPlates: number;
  restockPieces: number;
  totalPlates: number;
  totalPieces: number;
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
  totalPlates: number;
  totalPieces: number;
  receivingPlates: number;
  receivingPieces: number;
  avgPcsPerPlate: number;
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
  const [data, setData] = useState<ResolvedDashboardData | null>(null);
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

        const [next, defaultsRes, employeesRes, mappingsRes] = await Promise.all([
          loadDashboard(selectedWeek),
          fetch("/api/operator-defaults", { cache: "no-store" }),
          fetch("/api/employees", { cache: "no-store" }),
          fetch("/api/rf-mappings", { cache: "no-store" }),
        ]);

        const defaultsJson = defaultsRes.ok ? await defaultsRes.json() : { operators: {} };
        const employeesJson = employeesRes.ok ? await employeesRes.json() : { employees: {} };
        const mappingsJson = mappingsRes.ok ? await mappingsRes.json() : { mappings: [] };

        if (!cancelled) {
          setData(next);
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
      const tracking =
        op.userlsTracking && typeof op.userlsTracking === "object"
          ? (op.userlsTracking as Record<string, unknown>)
          : null;

      const role = String(
        dataSource === "userls-overview"
          ? op.observedRole ||
              tracking?.observedRole ||
              op.primaryReplenishmentRole ||
              tracking?.primaryReplenishmentRole ||
              op.effectiveAssignedRole ||
              op.currentRole ||
              op.rawAssignedRole ||
              "—"
          : op.effectiveAssignedRole ||
              op.currentRole ||
              op.rawAssignedRole ||
              "—"
      );

      const area = String(
        dataSource === "userls-overview"
          ? op.observedArea ||
              tracking?.observedArea ||
              op.effectivePerformanceArea ||
              op.rawDominantArea ||
              op.effectiveAssignedArea ||
              op.area ||
              "Other"
          : op.effectivePerformanceArea ||
              op.rawDominantArea ||
              op.effectiveAssignedArea ||
              op.area ||
              "Other"
      );

      const letdownPlates = safeNum(op.letdownPlates);
      const letdownPieces = safeNum(op.letdownPieces);
      const putawayPlates = safeNum(op.putawayPlates);
      const putawayPieces = safeNum(op.putawayPieces);
      const restockPlates = safeNum(op.restockPlates);
      const restockPieces = safeNum(op.restockPieces);
      const receivingPlates = safeNum(op.receivingPlates);
      const receivingPieces = safeNum(op.receivingPieces);
      const totalPlates = letdownPlates + putawayPlates + restockPlates;
      const totalPieces = letdownPieces + putawayPieces + restockPieces;

      if (!grouped.has(rowKey)) {
        grouped.set(rowKey, {
          rowKey,
          employeeId,
          primaryUserid: userid,
          rfUsernames: [userid],
          name,
          role,
          area,
          letdownPlates,
          letdownPieces,
          putawayPlates,
          putawayPieces,
          restockPlates,
          restockPieces,
          totalPlates,
          totalPieces,
          receivingPlates,
          receivingPieces,
          avgPcsPerPlate: 0,
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
      existing.totalPlates += totalPlates;
      existing.totalPieces += totalPieces;
      existing.receivingPlates += receivingPlates;
      existing.receivingPieces += receivingPieces;

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
  }, [data, selectedWeek, employees, mappings, defaults, dataSource]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.letdownPlates += row.letdownPlates;
        acc.letdownPieces += row.letdownPieces;
        acc.putawayPlates += row.putawayPlates;
        acc.putawayPieces += row.putawayPieces;
        acc.restockPlates += row.restockPlates;
        acc.restockPieces += row.restockPieces;
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
        totalPlates: 0,
        totalPieces: 0,
        receivingPlates: 0,
        receivingPieces: 0,
      }
    );
  }, [rows]);

  const areaTotals = useMemo<AreaTotalRow[]>(() => {
    const ops = (data?.operators ?? []) as Array<Record<string, unknown>>;
    const grouped = new Map<string, AreaTotalRow>();

    function ensure(area: string): AreaTotalRow {
      const normalized = normalizeWeeklyAreaLabel(area);
      const existing = grouped.get(normalized);
      if (existing) return existing;

      const created: AreaTotalRow = {
        area: normalized,
        letdownPlates: 0,
        letdownPieces: 0,
        putawayPlates: 0,
        putawayPieces: 0,
        restockPlates: 0,
        restockPieces: 0,
        totalPlates: 0,
        totalPieces: 0,
      };
      grouped.set(normalized, created);
      return created;
    }

    for (const op of ops) {
      const buckets = getAreaBucketsFromOperator(op);

      if (buckets.length > 0) {
        for (const bucket of buckets) {
          const target = ensure(
            bucket.areaCode || bucket.area || bucket.label || bucket.name || "Other"
          );

          const letdownPlates = safeNum(bucket.letdownPlates);
          const letdownPieces = safeNum(bucket.letdownPieces);
          const putawayPlates = safeNum(bucket.putawayPlates);
          const putawayPieces = safeNum(bucket.putawayPieces);
          const restockPlates =
            dataSource === "userls-overview"
              ? safeNum(bucket.restockLikePlatesEstimated) || safeNum(bucket.restockPlatesRaw)
              : safeNum(bucket.restockPlates) ||
                safeNum(bucket.restockPlatesRaw) ||
                safeNum(bucket.restockLikePlatesEstimated);
          const restockPieces =
            dataSource === "userls-overview"
              ? safeNum(bucket.restockLikePiecesEstimated) || safeNum(bucket.restockPiecesRaw)
              : safeNum(bucket.restockPieces) ||
                safeNum(bucket.restockPiecesRaw) ||
                safeNum(bucket.restockLikePiecesEstimated);

          target.letdownPlates += letdownPlates;
          target.letdownPieces += letdownPieces;
          target.putawayPlates += putawayPlates;
          target.putawayPieces += putawayPieces;
          target.restockPlates += restockPlates;
          target.restockPieces += restockPieces;
          target.totalPlates += letdownPlates + putawayPlates + restockPlates;
          target.totalPieces += letdownPieces + putawayPieces + restockPieces;
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
      const target = ensure(fallbackArea);

      const letdownPlates = safeNum(op.letdownPlates);
      const letdownPieces = safeNum(op.letdownPieces);
      const putawayPlates = safeNum(op.putawayPlates);
      const putawayPieces = safeNum(op.putawayPieces);
      const restockPlates =
        dataSource === "userls-overview"
          ? safeNum(op.restockLikePlatesEstimated) || safeNum(op.restockPlates)
          : safeNum(op.restockPlates) || safeNum(op.restockLikePlatesEstimated);
      const restockPieces =
        dataSource === "userls-overview"
          ? safeNum(op.restockLikePiecesEstimated) || safeNum(op.restockPieces)
          : safeNum(op.restockPieces) || safeNum(op.restockLikePiecesEstimated);

      target.letdownPlates += letdownPlates;
      target.letdownPieces += letdownPieces;
      target.putawayPlates += putawayPlates;
      target.putawayPieces += putawayPieces;
      target.restockPlates += restockPlates;
      target.restockPieces += restockPieces;
      target.totalPlates += letdownPlates + putawayPlates + restockPlates;
      target.totalPieces += letdownPieces + putawayPieces + restockPieces;
    }

    return [...grouped.values()]
      .filter((row) => row.totalPlates > 0 || row.totalPieces > 0)
      .sort((a, b) => {
        const pieceDiff = b.totalPieces - a.totalPieces;
        if (pieceDiff !== 0) return pieceDiff;
        return a.area.localeCompare(b.area);
      });
  }, [data, dataSource]);

  const topReceiving = useMemo(
    () =>
      rows
        .filter((row) => row.receivingPlates > 0 || row.receivingPieces > 0)
        .sort((a, b) => b.receivingPieces - a.receivingPieces)
        .slice(0, 5),
    [rows]
  );

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
            <table className="w-full min-w-[980px] border-collapse text-sm">
              <thead>
                <tr className="bg-blue-700 text-white">
                  <th className="border border-slate-900 px-3 py-2 text-left">Operator</th>
                  <th className="border border-slate-900 px-3 py-2 text-left">Role</th>
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
                    </td>
                    <td className="border border-slate-900 px-3 py-1.5">{row.role}</td>
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
                  <td className="border border-slate-900 bg-yellow-200 px-3 py-2 text-right text-red-600">
                    {fmt(totals.totalPlates)}
                  </td>
                  <td className="border border-slate-900 bg-yellow-200 px-3 py-2 text-right text-red-600">
                    {fmt(totals.totalPieces)}
                  </td>
                  <td className="border border-slate-900 bg-yellow-100 px-3 py-2 text-right text-red-600">
                    {fmt(avgPcsPerPlate(totals.totalPieces, totals.totalPlates), 0)}
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
                    {fmt(totals.totalPlates)}
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

            <TopListBox title="Top 3 Total Plates" rows={topByPlates} />
            <TopListBox title="Top 3 Total Pieces" rows={topByPieces} />
            <TopListBox title="Top 3 Letdowns - PCS" rows={topLetdown} />
            <TopListBox title="Top 3 Putaways - PCS" rows={topPutaway} />
          </div>
        </div>
      </div>

      <div className="border-2 border-slate-900 bg-white overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-sm">
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
            </tr>
          </thead>
          <tbody>
            {areaTotals.map((row) => (
              <tr key={`area-total-${row.area}`}>
                <td className="border border-slate-900 px-3 py-1.5 font-medium">
                  <Link
                    href={`/areas/${encodeURIComponent(row.area)}`}
                    className="hover:underline"
                  >
                    {row.area}
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
                <td className="border border-slate-900 bg-yellow-200 px-3 py-1.5 text-right font-semibold text-red-600">
                  {fmt(row.totalPlates)}
                </td>
                <td className="border border-slate-900 bg-yellow-200 px-3 py-1.5 text-right font-semibold text-red-600">
                  {fmt(row.totalPieces)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
