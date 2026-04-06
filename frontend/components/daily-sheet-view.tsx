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

type DailyResponse = {
  date: string;
  operators?: Array<Record<string, unknown>>;
};

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

function resolvedSheetName(
  op: Record<string, unknown>,
  selectedWeek: string,
  employees: Record<string, EmployeeRecord>,
  mappings: RfMapping[],
  defaults: Record<string, OperatorDefault>
) {
  const resolved = resolveOperatorIdentity({
    rfUsername: String(op.userid || ""),
    fallbackName: cleanDisplayName(op),
    fallbackTeam: String(
      op.rawAssignedArea ||
        op.effectiveAssignedArea ||
        op.assignedArea ||
        op.area ||
        ""
    ),
    selectedDate: selectedWeek,
    employees,
    mappings,
    defaultTeams: defaults,
  });

  const display = String(resolved.displayName || "")
    .replace(/\s*\(RF\)\s*$/i, "")
    .trim();

  return display || cleanDisplayName(op);
}

function sectionLabel(area: string) {
  const value = (area || "").trim();

  if (/^frzpir$/i.test(value)) return "Freezer PIR";
  if (/^frz/i.test(value)) return "Freezer";
  if (/^drypir$/i.test(value)) return "Dry PIR";
  if (/^dry/i.test(value)) return "Dry";
  if (/^clr/i.test(value) || /^produce$/i.test(value)) return "Cooler";

  return "Other";
}

function sectionOrderIndex(section: string) {
  const order = ["Freezer", "Freezer PIR", "Dry", "Dry PIR", "Cooler", "Other"];
  const idx = order.indexOf(section);
  return idx === -1 ? 999 : idx;
}

type Row = {
  userid: string;
  name: string;
  role: string;
  area: string;
  section: string;
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

export default function DailySheetView() {
  const { selectedWeek } = useAppState();
  const [data, setData] = useState<DailyResponse | null>(null);
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

        const [dailyRes, defaultsRes, employeesRes, mappingsRes] = await Promise.all([
          fetch(`/api/dashboard/daily-enriched?date=${selectedWeek}`, { cache: "no-store" }),
          fetch("/api/operator-defaults", { cache: "no-store" }),
          fetch("/api/employees", { cache: "no-store" }),
          fetch("/api/rf-mappings", { cache: "no-store" }),
        ]);

        const dailyJson: DailyResponse & { details?: string } = await dailyRes.json();

        if (!dailyRes.ok) {
          throw new Error(dailyJson.details || "Failed to load daily sheet");
        }

        const defaultsJson = defaultsRes.ok ? await defaultsRes.json() : { operators: {} };
        const employeesJson = employeesRes.ok ? await employeesRes.json() : { employees: {} };
        const mappingsJson = mappingsRes.ok ? await mappingsRes.json() : { mappings: [] };

        if (!cancelled) {
          setData(dailyJson);
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

    if (selectedWeek) load();

    return () => {
      cancelled = true;
    };
  }, [selectedWeek]);

  const rows = useMemo<Row[]>(() => {
    const ops = (data?.operators ?? []) as Array<Record<string, unknown>>;

    return ops
      .map((op) => {
        const letdownPlates = safeNum(op.letdownPlates);
        const letdownPieces = safeNum(op.letdownPieces);
        const putawayPlates = safeNum(op.putawayPlates);
        const putawayPieces = safeNum(op.putawayPieces);
        const restockPlates =
          safeNum(op.restockPlates) ||
          safeNum(op.restockLikePlatesEstimated) ||
          safeNum(op.restockPlatesRaw);
        const restockPieces =
          safeNum(op.restockPieces) ||
          safeNum(op.restockLikePiecesEstimated) ||
          safeNum(op.restockPiecesRaw);
        const receivingPlates = safeNum(op.receivingPlates);
        const receivingPieces = safeNum(op.receivingPieces);

        const totalPlates = letdownPlates + putawayPlates + restockPlates;
        const totalPieces = letdownPieces + putawayPieces + restockPieces;

        const area = String(
          op.effectivePerformanceArea ||
            op.rawDominantArea ||
            op.effectiveAssignedArea ||
            op.assignedArea ||
            op.area ||
            "Other"
        );

        return {
          userid: String(op.userid || ""),
          name: resolvedSheetName(op, selectedWeek, employees, mappings, defaults),
          role: String(
            op.effectiveAssignedRole ||
              op.currentRole ||
              op.rawAssignedRole ||
              "—"
          ),
          area,
          section: sectionLabel(area),
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
        };
      })
      .filter(
        (row) =>
          row.totalPlates > 0 ||
          row.receivingPlates > 0 ||
          row.receivingPieces > 0
      )
      .sort((a, b) => {
        const sectionDiff = sectionOrderIndex(a.section) - sectionOrderIndex(b.section);
        if (sectionDiff !== 0) return sectionDiff;
        return b.totalPieces - a.totalPieces;
      });
  }, [data, selectedWeek, employees, mappings, defaults]);

  const sections = useMemo(() => {
    const grouped = new Map<string, Row[]>();

    for (const row of rows) {
      if (!grouped.has(row.section)) grouped.set(row.section, []);
      grouped.get(row.section)!.push(row);
    }

    return [...grouped.entries()]
      .sort((a, b) => sectionOrderIndex(a[0]) - sectionOrderIndex(b[0]))
      .map(([section, sectionRows]) => ({
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
      }));
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
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
      <div className="space-y-4">
        {sections.map((section) => (
          <div key={section.section} className="border-2 border-slate-900 bg-white overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-sm">
              <thead>
                <tr className="bg-blue-700 text-white">
                  <th className="border border-slate-900 px-3 py-2 text-left" colSpan={2}>
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
                  <th className="border border-slate-900 px-3 py-1.5 text-left">Role</th>
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
                {section.rows.map((row) => (
                  <tr key={row.userid}>
                    <td className="border border-slate-900 px-3 py-1.5 font-medium">
                      <Link
                        href={`/operators/${encodeURIComponent(row.userid)}`}
                        className="hover:underline"
                      >
                        {row.name}
                      </Link>
                      <div className="text-[11px] text-slate-500">{row.userid}</div>
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
                    {section.section} Total
                  </td>
                  <td className="border border-slate-900 bg-blue-50 px-3 py-2 text-right text-red-600">
                    {fmt(section.totals.letdownPlates)}
                  </td>
                  <td className="border border-slate-900 bg-green-50 px-3 py-2 text-right text-red-600">
                    {fmt(section.totals.letdownPieces)}
                  </td>
                  <td className="border border-slate-900 bg-blue-50 px-3 py-2 text-right text-red-600">
                    {fmt(section.totals.putawayPlates)}
                  </td>
                  <td className="border border-slate-900 bg-green-50 px-3 py-2 text-right text-red-600">
                    {fmt(section.totals.putawayPieces)}
                  </td>
                  <td className="border border-slate-900 bg-blue-50 px-3 py-2 text-right text-red-600">
                    {fmt(section.totals.restockPlates)}
                  </td>
                  <td className="border border-slate-900 bg-green-50 px-3 py-2 text-right text-red-600">
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
                    <tr key={`recv-${row.userid}`}>
                      <td className="border border-slate-900 px-3 py-1.5 font-medium">
                        <Link
                          href={`/operators/${encodeURIComponent(row.userid)}`}
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
      </div>
    </div>
  );
}
