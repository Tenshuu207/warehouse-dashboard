"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { rangeHref, type DateRange } from "@/lib/date-range";

type AreaMetrics = {
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
  avgPcsPerPlate: number;
};

type AreaEmployeeRow = AreaMetrics & {
  rowKey: string;
  employeeId: string | null;
  primaryUserid: string;
  rfUsernames: string[];
  name: string;
  role: string;
  area: string;
};

type AreaRoleRow = AreaMetrics & {
  label: string;
  employeeCount: number;
  contributors?: AreaEmployeeRow[];
};

type AreaReceivingRow = {
  rowKey: string;
  employeeId: string | null;
  primaryUserid: string;
  rfUsernames: string[];
  name: string;
  receivingPlates: number;
  receivingPieces: number;
};

type AreaDetailPayload = {
  areaKey: string;
  areaLabel: string;
  rangeStart: string;
  rangeEnd: string;
  assignedEmployeeCount: number;
  receivingCount: number;
  roleCount: number;
  totals: AreaMetrics;
  assignedEmployees: AreaEmployeeRow[];
  receivingEmployees: AreaReceivingRow[];
  roles: AreaRoleRow[];
};

function fmt(value: number | null | undefined, digits = 0) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function emptyMetrics(): AreaMetrics {
  return {
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
    avgPcsPerPlate: 0,
  };
}

function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {right ? <div>{right}</div> : null}
    </div>
  );
}

function MetricTable({
  rows,
  title,
  subtitle,
  rowLabel,
}: {
  rows: Array<{
    label: string;
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
    avgPcsPerPlate: number;
    meta?: string;
  }>;
  title: string;
  subtitle?: string;
  rowLabel: string;
}) {
  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm">
      <SectionHeader title={title} subtitle={subtitle} />
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[1180px] border-collapse text-sm">
          <thead>
            <tr className="bg-blue-700 text-white">
              <th className="border border-slate-900 px-3 py-2 text-left">{rowLabel}</th>
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
              <th className="border border-slate-900 px-3 py-2 text-center">Avg PCS/Plate</th>
            </tr>
            <tr className="bg-slate-100 text-slate-900">
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
            {rows.length === 0 ? (
              <tr>
                <td className="border border-slate-900 px-3 py-4 text-slate-500" colSpan={12}>
                  No rows found for this area and range.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.label} className="bg-white">
                  <td className="border border-slate-900 px-3 py-1.5 font-medium">
                    <div>{row.label}</div>
                    {row.meta ? <div className="text-[11px] text-slate-500">{row.meta}</div> : null}
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReceivingTable({
  rows,
  title,
  subtitle,
  range,
}: {
  rows: Array<{
    rowKey: string;
    name: string;
    primaryUserid: string;
    rfUsernames: string[];
    receivingPlates: number;
    receivingPieces: number;
  }>;
  title: string;
  subtitle?: string;
  range: DateRange;
}) {
  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm">
      <SectionHeader title={title} subtitle={subtitle} />
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="bg-blue-700 text-white">
              <th className="border border-slate-900 px-3 py-2 text-left">Receiver</th>
              <th className="border border-slate-900 px-3 py-2 text-right">Plates</th>
              <th className="border border-slate-900 px-3 py-2 text-right">Pieces</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="border border-slate-900 px-3 py-4 text-slate-500" colSpan={3}>
                  No receiving rows found for this area and range.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.rowKey} className="bg-white">
                  <td className="border border-slate-900 px-3 py-1.5 font-medium">
                    <Link
                      href={rangeHref(`/operators/${encodeURIComponent(row.primaryUserid)}`, range)}
                      className="hover:underline"
                    >
                      {row.name}
                    </Link>
                    <div className="text-[11px] text-slate-500">{row.rfUsernames.join(", ")}</div>
                  </td>
                  <td className="border border-slate-900 px-3 py-1.5 text-right">
                    {fmt(row.receivingPlates)}
                  </td>
                  <td className="border border-slate-900 px-3 py-1.5 text-right">
                    {fmt(row.receivingPieces)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RoleTable({
  rows,
  title,
  subtitle,
  range,
}: {
  rows: AreaRoleRow[];
  title: string;
  subtitle?: string;
  range: DateRange;
}) {
  const [outsideHelpOpen, setOutsideHelpOpen] = useState(false);

  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm">
      <SectionHeader title={title} subtitle={subtitle} />
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[1180px] border-collapse text-sm">
          <thead>
            <tr className="bg-blue-700 text-white">
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
                Bulk Move
              </th>
              <th className="border border-slate-900 px-3 py-2 text-center" colSpan={2}>
                Total Handled
              </th>
              <th className="border border-slate-900 px-3 py-2 text-center">Avg PCS/Plate</th>
            </tr>
            <tr className="bg-slate-100 text-slate-900">
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
            {rows.length === 0 ? (
              <tr>
                <td className="border border-slate-900 px-3 py-4 text-slate-500" colSpan={12}>
                  No rows found for this area and range.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const isOutsideHelp = row.label === "Outside Help";
                const contributors = row.contributors || [];
                const contributorCount = contributors.length || row.employeeCount;
                const open = isOutsideHelp && outsideHelpOpen;

                return (
                  <Fragment key={row.label}>
                    <tr className="bg-white">
                      <td className="border border-slate-900 px-3 py-1.5 font-medium">
                        {isOutsideHelp ? (
                          <button
                            type="button"
                            onClick={() => setOutsideHelpOpen((value) => !value)}
                            className="flex w-full items-center gap-2 text-left hover:underline"
                            aria-expanded={open}
                          >
                            <span className="text-slate-500">{open ? "▾" : "▸"}</span>
                            <span>
                              Outside Help ({fmt(contributorCount)} Employees)
                            </span>
                          </button>
                        ) : (
                          <div>{row.label}</div>
                        )}
                        {isOutsideHelp ? (
                          <div className="mt-1 text-[11px] text-slate-500">
                            Grouped-area work from employees not assigned to this area.
                          </div>
                        ) : null}
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

                    {isOutsideHelp && open ? (
                      <tr>
                        <td className="border border-slate-900 bg-slate-50 px-3 py-3" colSpan={12}>
                          <div className="rounded-xl border bg-white p-3">
                            <div className="text-sm font-semibold text-slate-900">
                              Outside Help Contributors
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              Same grouped-area slice, broken out by contributing employee.
                            </div>
                            <div className="mt-3 overflow-x-auto">
                              <table className="w-full min-w-[1180px] border-collapse text-sm">
                                <thead>
                                  <tr className="bg-slate-100 text-slate-900">
                                    <th className="border border-slate-900 px-3 py-2 text-left">
                                      Employee
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
                                  <tr className="bg-slate-50 text-slate-900">
                                    <th className="border border-slate-900 px-3 py-1.5 text-left"></th>
                                    <th className="border border-slate-900 px-3 py-1.5 text-center">
                                      Plates
                                    </th>
                                    <th className="border border-slate-900 px-3 py-1.5 text-center">
                                      Pieces
                                    </th>
                                    <th className="border border-slate-900 px-3 py-1.5 text-center">
                                      Plates
                                    </th>
                                    <th className="border border-slate-900 px-3 py-1.5 text-center">
                                      Pieces
                                    </th>
                                    <th className="border border-slate-900 px-3 py-1.5 text-center">
                                      Plates
                                    </th>
                                    <th className="border border-slate-900 px-3 py-1.5 text-center">
                                      Pieces
                                    </th>
                                    <th className="border border-slate-900 px-3 py-1.5 text-center">
                                      Plates
                                    </th>
                                    <th className="border border-slate-900 px-3 py-1.5 text-center">
                                      Pieces
                                    </th>
                                    <th className="border border-slate-900 px-3 py-1.5 text-center">
                                      Plates
                                    </th>
                                    <th className="border border-slate-900 px-3 py-1.5 text-center">
                                      Pieces
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {contributors.length === 0 ? (
                                    <tr>
                                      <td
                                        className="border border-slate-900 px-3 py-3 text-slate-500"
                                        colSpan={11}
                                      >
                                        No contributing employees found.
                                      </td>
                                    </tr>
                                  ) : (
                                    contributors.map((contributor) => (
                                      <tr key={contributor.rowKey} className="bg-white">
                                        <td className="border border-slate-900 px-3 py-1.5 font-medium">
                                          <Link
                                            href={rangeHref(
                                              `/operators/${encodeURIComponent(contributor.primaryUserid)}`,
                                              range
                                            )}
                                            className="hover:underline"
                                          >
                                            {contributor.name}
                                          </Link>
                                          <div className="text-[11px] text-slate-500">
                                            {contributor.rfUsernames.join(", ")}
                                          </div>
                                        </td>
                                        <td className="border border-slate-900 bg-blue-50 px-3 py-1.5 text-right">
                                          {fmt(contributor.letdownPlates)}
                                        </td>
                                        <td className="border border-slate-900 bg-green-50 px-3 py-1.5 text-right">
                                          {fmt(contributor.letdownPieces)}
                                        </td>
                                        <td className="border border-slate-900 bg-blue-50 px-3 py-1.5 text-right">
                                          {fmt(contributor.putawayPlates)}
                                        </td>
                                        <td className="border border-slate-900 bg-green-50 px-3 py-1.5 text-right">
                                          {fmt(contributor.putawayPieces)}
                                        </td>
                                        <td className="border border-slate-900 bg-blue-50 px-3 py-1.5 text-right">
                                          {fmt(contributor.restockPlates)}
                                        </td>
                                        <td className="border border-slate-900 bg-green-50 px-3 py-1.5 text-right">
                                          {fmt(contributor.restockPieces)}
                                        </td>
                                        <td className="border border-slate-900 bg-blue-50 px-3 py-1.5 text-right">
                                          {fmt(contributor.bulkMovePlates)}
                                        </td>
                                        <td className="border border-slate-900 bg-green-50 px-3 py-1.5 text-right">
                                          {fmt(contributor.bulkMovePieces)}
                                        </td>
                                        <td className="border border-slate-900 bg-yellow-200 px-3 py-1.5 text-right font-semibold">
                                          {fmt(contributor.totalPlates)}
                                        </td>
                                        <td className="border border-slate-900 bg-yellow-200 px-3 py-1.5 text-right font-semibold">
                                          {fmt(contributor.totalPieces)}
                                        </td>
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function AreaSheetView({
  areaKey,
  areaLabel,
  range,
}: {
  areaKey: string;
  areaLabel: string;
  range: DateRange;
}) {
  const [data, setData] = useState<AreaDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          `/api/dashboard/area-detail?area=${encodeURIComponent(areaKey)}&start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`,
          { cache: "no-store" }
        );

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.details || payload?.error || "Failed to load area detail");
        }

        if (!cancelled) {
          setData(payload as AreaDetailPayload);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load area detail");
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [areaKey, range.end, range.start]);

  if (loading) {
    return (
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm text-slate-600">Loading area sheet...</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm text-red-600">{error}</div>
      </section>
    );
  }

  const payload = data || {
    areaKey,
    areaLabel,
    rangeStart: range.start,
    rangeEnd: range.end,
    assignedEmployeeCount: 0,
    receivingCount: 0,
    roleCount: 0,
    totals: emptyMetrics(),
    assignedEmployees: [],
    receivingEmployees: [],
    roles: [],
  };

  const areaSummaryRows = [
    { label: "Letdowns", plates: payload.totals.letdownPlates, pieces: payload.totals.letdownPieces },
    { label: "Putaways", plates: payload.totals.putawayPlates, pieces: payload.totals.putawayPieces },
    { label: "Restocks", plates: payload.totals.restockPlates, pieces: payload.totals.restockPieces },
    {
      label: "Bulk Move",
      plates: payload.totals.bulkMovePlates,
      pieces: payload.totals.bulkMovePieces,
    },
    { label: "Total", plates: payload.totals.totalPlates, pieces: payload.totals.totalPieces },
  ];

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <SectionHeader
          title="Area Totals"
          subtitle={`Scoped to ${payload.areaLabel} for ${payload.rangeStart} through ${payload.rangeEnd}`}
          right={
            <div className="text-right text-xs text-slate-500">
              <div>{payload.assignedEmployeeCount} assigned employees</div>
              <div>{payload.receivingCount} receiving rows</div>
              <div>{payload.roleCount} roles</div>
            </div>
          }
        />

        <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-5">
          <div className="rounded-xl border bg-slate-50 p-3 text-center">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Total Plates</div>
            <div className="mt-2 text-2xl font-semibold">{fmt(payload.totals.totalPlates)}</div>
          </div>
          <div className="rounded-xl border bg-slate-50 p-3 text-center">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Total Pieces</div>
            <div className="mt-2 text-2xl font-semibold">{fmt(payload.totals.totalPieces)}</div>
          </div>
          <div className="rounded-xl border bg-slate-50 p-3 text-center">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">
              Assigned Employees
            </div>
            <div className="mt-2 text-2xl font-semibold">{fmt(payload.assignedEmployeeCount)}</div>
          </div>
          <div className="rounded-xl border bg-slate-50 p-3 text-center">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">
              Receiving Rows
            </div>
            <div className="mt-2 text-2xl font-semibold">{fmt(payload.receivingCount)}</div>
          </div>
          <div className="rounded-xl border bg-slate-50 p-3 text-center">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Roles</div>
            <div className="mt-2 text-2xl font-semibold">{fmt(payload.roleCount)}</div>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse text-sm">
            <thead className="bg-slate-100 text-slate-900">
              <tr>
                <th className="border border-slate-900 px-3 py-2 text-left">Metric</th>
                <th className="border border-slate-900 px-3 py-2 text-right">Plates</th>
                <th className="border border-slate-900 px-3 py-2 text-right">Pieces</th>
              </tr>
            </thead>
            <tbody>
              {areaSummaryRows.map((row) => (
                <tr key={row.label} className={row.label === "Total" ? "font-bold" : ""}>
                  <td className="border border-slate-900 px-3 py-1.5">{row.label}</td>
                  <td className="border border-slate-900 px-3 py-1.5 text-right">
                    {fmt(row.plates)}
                  </td>
                  <td className="border border-slate-900 px-3 py-1.5 text-right">
                    {fmt(row.pieces)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <MetricTable
        title={`${payload.areaLabel} Assigned Employees`}
        subtitle="Assigned employees with grouped-area replenishment totals only."
        rowLabel="Employee"
        rows={payload.assignedEmployees.map((row) => ({
          label: row.name,
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
          avgPcsPerPlate: row.avgPcsPerPlate,
          meta: row.rfUsernames.join(", "),
        }))}
      />

      <ReceivingTable
        range={range} title={`${payload.areaLabel} Receiving by Destination`}
        subtitle="Receivers with product received into this grouped destination area only."
        rows={payload.receivingEmployees.map((row) => ({
          rowKey: row.rowKey,
          name: row.name,
          primaryUserid: row.primaryUserid,
          rfUsernames: row.rfUsernames,
          receivingPlates: row.receivingPlates,
          receivingPieces: row.receivingPieces,
        }))}
      />

      <RoleTable
        title={`${payload.areaLabel} Observed Roles`}
        subtitle="Observed grouped-area role buckets only."
        range={range}
        rows={payload.roles}
      />
    </div>
  );
}
