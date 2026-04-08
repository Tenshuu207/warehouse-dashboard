"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAppState } from "@/lib/app-state";
import type { DailyAssignmentsPayload } from "@/lib/assignments/daily-assignments-types";
import { getWeekData, type ResolvedDashboardData } from "@/lib/data-resolver";
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

export default function AreaSheetView({ area }: { area: string }) {
  const { selectedWeek } = useAppState();
  const [data, setData] = useState<ResolvedDashboardData | null>(null);
  const [assignments, setAssignments] = useState<DailyAssignmentsPayload | null>(null);
  const [defaults, setDefaults] = useState<Record<string, OperatorDefault>>({});
  const [employees, setEmployees] = useState<Record<string, EmployeeRecord>>({});
  const [mappings, setMappings] = useState<RfMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [next, assignmentsRes, defaultsRes, employeesRes, mappingsRes] = await Promise.all([
          getWeekData(selectedWeek),
          fetch(`/api/daily-assignments?date=${selectedWeek}`, { cache: "no-store" }),
          fetch("/api/operator-defaults", { cache: "no-store" }),
          fetch("/api/employees", { cache: "no-store" }),
          fetch("/api/rf-mappings", { cache: "no-store" }),
        ]);

        const assignmentsJson: DailyAssignmentsPayload = assignmentsRes.ok
          ? await assignmentsRes.json()
          : { date: selectedWeek, updatedAt: null, sections: [], placements: [] };

        const defaultsJson = defaultsRes.ok ? await defaultsRes.json() : { operators: {} };
        const employeesJson = employeesRes.ok ? await employeesRes.json() : { employees: {} };
        const mappingsJson = mappingsRes.ok ? await mappingsRes.json() : { mappings: [] };

        if (!cancelled) {
          setData(next);
          setAssignments(assignmentsJson);
          setDefaults(defaultsJson.operators || {});
          setEmployees(employeesJson.employees || {});
          setMappings(Array.isArray(mappingsJson.mappings) ? mappingsJson.mappings : []);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load area sheet");
          setLoading(false);
        }
      }
    }

    if (selectedWeek) load();

    return () => {
      cancelled = true;
    };
  }, [selectedWeek]);

  const placementsByKey = useMemo(() => {
    const map = new Map<string, { role?: string; section?: string }>();

    for (const placement of assignments?.placements || []) {
      if (placement?.assignmentKey) {
        map.set(placement.assignmentKey, {
          role: placement.role,
          section: placement.section,
        });
      }
    }

    return map;
  }, [assignments]);

  const homeTemplates = useMemo(() => {
    const map = new Map<string, { role?: string; section?: string }>();

    for (const section of assignments?.sections || []) {
      const resolvedRole = String(section.role || "").trim() || "—";
      const resolvedSection = String(section.team || "").trim() || "Other";

      for (const employeeName of section.employees || []) {
        const key = normalizeNameKey(employeeName);
        if (!key || map.has(key)) continue;
        map.set(key, {
          role: resolvedRole,
          section: resolvedSection,
        });
      }
    }

    return map;
  }, [assignments]);

  const rows = useMemo<Row[]>(() => {
    const ops = (data?.operators ?? []) as Array<Record<string, unknown>>;
    const grouped = new Map<string, Row>();

    for (const op of ops) {
      const userid = String(op.userid || "").trim();
      if (!userid) continue;

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

      const rowArea = String(
        op.effectivePerformanceArea ||
          op.rawDominantArea ||
          op.effectiveAssignedArea ||
          op.area ||
          "Other"
      );

      if (!(rowArea === area && (totalPlates > 0 || receivingPlates > 0))) {
        continue;
      }

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
      const placement = placementsByKey.get(rowKey);
      const homeTemplate = homeTemplates.get(normalizeNameKey(name));

      const role = String(
        placement?.role ||
          op.effectiveAssignedRole ||
          homeTemplate?.role ||
          op.currentRole ||
          op.rawAssignedRole ||
          "—"
      );

      const existing = grouped.get(rowKey);
      if (!existing) {
        grouped.set(rowKey, {
          rowKey,
          employeeId,
          primaryUserid: userid,
          rfUsernames: [userid],
          name,
          role,
          area: rowArea,
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
          avgPcsPerPlate: avgPcsPerPlate(totalPieces, totalPlates),
        });
        continue;
      }

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
      existing.avgPcsPerPlate = avgPcsPerPlate(existing.totalPieces, existing.totalPlates);

      if (employeeId && !existing.employeeId) {
        existing.employeeId = employeeId;
        existing.name = name;
        existing.role = role;
        existing.primaryUserid = userid;
      }
    }

    return [...grouped.values()].sort((a, b) => {
      const pieceDiff = b.totalPieces - a.totalPieces;
      if (pieceDiff !== 0) return pieceDiff;
      return a.name.localeCompare(b.name);
    });
  }, [data, area, selectedWeek, employees, mappings, defaults, placementsByKey, homeTemplates]);

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

  const roleTotals = useMemo(() => {
    const grouped = new Map<
      string,
      {
        role: string;
        letdownPlates: number;
        letdownPieces: number;
        putawayPlates: number;
        putawayPieces: number;
        restockPlates: number;
        restockPieces: number;
        totalPlates: number;
        totalPieces: number;
      }
    >();

    for (const row of rows) {
      const key = row.role || "—";
      const current = grouped.get(key) || {
        role: key,
        letdownPlates: 0,
        letdownPieces: 0,
        putawayPlates: 0,
        putawayPieces: 0,
        restockPlates: 0,
        restockPieces: 0,
        totalPlates: 0,
        totalPieces: 0,
      };

      current.letdownPlates += row.letdownPlates;
      current.letdownPieces += row.letdownPieces;
      current.putawayPlates += row.putawayPlates;
      current.putawayPieces += row.putawayPieces;
      current.restockPlates += row.restockPlates;
      current.restockPieces += row.restockPieces;
      current.totalPlates += row.totalPlates;
      current.totalPieces += row.totalPieces;

      grouped.set(key, current);
    }

    return [...grouped.values()].sort((a, b) => b.totalPieces - a.totalPieces);
  }, [rows]);

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

  if (loading) {
    return (
      <div className="border-2 border-slate-900 bg-white p-4 text-sm text-slate-600">
        Loading area sheet…
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
                        {row.rfUsernames.join(", ")}
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
                    {area} Total
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
            <SummaryBox title={`${area} · ${selectedWeek}`}>
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
                    Area Total
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
          </div>
        </div>
      </div>

      <div className="border-2 border-slate-900 bg-white overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead>
            <tr className="bg-blue-700 text-white">
              <th className="border border-slate-900 px-3 py-2 text-left" colSpan={1}>
                Total Handled by Role
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
              <th className="border border-slate-900 px-3 py-1.5 text-left">Role</th>
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
            {roleTotals.map((row) => (
              <tr key={`role-total-${row.role}`}>
                <td className="border border-slate-900 px-3 py-1.5 font-medium">{row.role}</td>
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
