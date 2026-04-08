"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/shared/PageHeader";
import SectionBlock from "@/components/shared/SectionBlock";
import StatCard from "@/components/shared/StatCard";
import IngestionUploadPanel from "@/components/ingestion-upload-panel";

type ComponentRow = {
  businessDate: string;
  componentType: string;
  status: string;
  sourcePath: string | null;
  updatedAt: string;
  details: unknown | null;
} | null;

type DayStatus = {
  date: string;
  rawCoreReady: boolean;
  enrichedInputsReady: boolean;
  dailyReady: boolean;
  dailyEnrichedReady: boolean;
  weeklyReady: boolean;
  missing: string[];
  components: {
    b_forkl2: ComponentRow;
    rf2_forkstdl: ComponentRow;
    rf2_userls: ComponentRow;
    daily: ComponentRow;
    daily_enriched: ComponentRow;
    weekly: ComponentRow;
  };
};

type UploadRow = {
  businessDate: string;
  reportType: string;
  sourcePath: string;
  checksum: string | null;
  sizeBytes: number | null;
  status: string;
  runId: string | null;
  duplicateOfRunId: string | null;
  manifestPath: string | null;
  createdAt: string;
  details: unknown | null;
};

type ApiPayload = {
  start: string;
  end: string;
  summary: {
    daysInRange: number;
    rawCoreReadyDays: number;
    enrichedInputsReadyDays: number;
    dailyReadyDays: number;
    dailyEnrichedReadyDays: number;
    weeklyReadyDays: number;
    uploadsInRange: number;
  };
  days: DayStatus[];
  recentUploads: UploadRow[];
};

function statusClasses(status: string | null | undefined) {
  switch (status) {
    case "ready":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "failed":
      return "border-red-200 bg-red-50 text-red-700";
    case "missing":
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function coverageClasses(ready: boolean) {
  return ready
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : "border-slate-200 bg-slate-50 text-slate-600";
}

function formatComponentLabel(value: string) {
  switch (value) {
    case "b_forkl2":
      return "ForkL2";
    case "rf2_forkstdl":
      return "ForkSTDL";
    case "rf2_userls":
      return "UserLS";
    case "daily":
      return "Daily";
    case "daily_enriched":
      return "Daily Enriched";
    case "weekly":
      return "Weekly";
    default:
      return value;
  }
}

function fmtBytes(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const digits = size >= 10 || unit === 0 ? 0 : 1;
  return `${size.toFixed(digits)} ${units[unit]}`;
}

function fmtTs(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function renderComponent(component: ComponentRow) {
  const status = component?.status ?? "missing";
  const filename = component?.sourcePath ? component.sourcePath.split("/").pop() : null;

  return (
    <div className="space-y-1">
      <span
        className={[
          "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
          statusClasses(status),
        ].join(" ")}
      >
        {status}
      </span>
      {filename ? (
        <div className="max-w-[160px] truncate text-[11px] text-slate-500">{filename}</div>
      ) : null}
    </div>
  );
}

export default function IngestionStatusPage() {
  const [windowDays, setWindowDays] = useState(14);
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rebuildingDate, setRebuildingDate] = useState<string | null>(null);

  const loadStatus = useCallback(async (days = windowDays) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/ingest/status?days=${days}`, {
        cache: "no-store",
      });

      const json = (await res.json()) as ApiPayload | { details?: string };

      if (!res.ok) {
        throw new Error(
          typeof (json as { details?: string }).details === "string"
            ? (json as { details?: string }).details
            : "Failed to load ingestion status"
        );
      }

      setPayload(json as ApiPayload);
    } catch (err) {
      setPayload(null);
      setError(err instanceof Error ? err.message : "Failed to load ingestion status");
    } finally {
      setLoading(false);
    }
  }, [windowDays]);

  useEffect(() => {
    void loadStatus(windowDays);
  }, [loadStatus, windowDays]);

  async function rebuildDate(date: string) {
    try {
      setRebuildingDate(date);

      const res = await fetch("/api/ingest/rebuild", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ date }),
      });

      const json = (await res.json()) as { details?: string };

      if (!res.ok) {
        throw new Error(json.details || "Rebuild failed");
      }

      await loadStatus(windowDays);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rebuild failed");
    } finally {
      setRebuildingDate(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-3 text-slate-900 md:p-4">
      <div className="mx-auto max-w-7xl space-y-4">
        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <PageHeader
            title="Ingestion Status"
            subtitle="Raw uploads stay on disk. SQLite tracks upload history, component coverage, and derived snapshot readiness."
          />
          <div className="mt-3 text-xs text-slate-500">
            Weekly snapshot status is keyed to the selected date key. Daily Enriched reflects the
            merged daily + UserLS artifact.
          </div>
        </section>

        <IngestionUploadPanel
          defaultDate={payload?.end}
          onUploaded={() => loadStatus(windowDays)}
        />

        {loading ? (
          <section className="rounded-2xl border bg-white p-6 text-sm text-slate-500 shadow-sm">
            Loading ingestion status...
          </section>
        ) : error ? (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
            {error}
          </section>
        ) : payload ? (
          <>
            <SectionBlock
              title="Coverage window"
              subtitle={`${payload.start} to ${payload.end}`}
              right={
                <div className="flex flex-wrap gap-2">
                  {[7, 14, 30].map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setWindowDays(days)}
                      className={[
                        "rounded-full px-3 py-1.5 text-xs font-medium transition",
                        windowDays === days
                          ? "bg-slate-900 text-white"
                          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                      ].join(" ")}
                    >
                      {days}d
                    </button>
                  ))}
                </div>
              }
            >
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
                <StatCard label="Raw Core Ready">{payload.summary.rawCoreReadyDays}</StatCard>
                <StatCard label="Enriched Inputs">{payload.summary.enrichedInputsReadyDays}</StatCard>
                <StatCard label="Daily">{payload.summary.dailyReadyDays}</StatCard>
                <StatCard label="Daily Enriched">{payload.summary.dailyEnrichedReadyDays}</StatCard>
                <StatCard label="Weekly">{payload.summary.weeklyReadyDays}</StatCard>
                <StatCard label="Uploads">{payload.summary.uploadsInRange}</StatCard>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1400px] text-sm">
                  <thead className="border-b bg-slate-50">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-semibold">Date</th>
                      <th className="px-3 py-2 font-semibold">ForkL2</th>
                      <th className="px-3 py-2 font-semibold">ForkSTDL</th>
                      <th className="px-3 py-2 font-semibold">UserLS</th>
                      <th className="px-3 py-2 font-semibold">Daily</th>
                      <th className="px-3 py-2 font-semibold">Daily Enriched</th>
                      <th className="px-3 py-2 font-semibold">Weekly</th>
                      <th className="px-3 py-2 font-semibold">Coverage</th>
                      <th className="px-3 py-2 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payload.days.map((day) => (
                      <tr key={day.date} className="border-b last:border-b-0">
                        <td className="px-3 py-2 font-medium">{day.date}</td>
                        <td className="px-3 py-2">{renderComponent(day.components.b_forkl2)}</td>
                        <td className="px-3 py-2">{renderComponent(day.components.rf2_forkstdl)}</td>
                        <td className="px-3 py-2">{renderComponent(day.components.rf2_userls)}</td>
                        <td className="px-3 py-2">{renderComponent(day.components.daily)}</td>
                        <td className="px-3 py-2">{renderComponent(day.components.daily_enriched)}</td>
                        <td className="px-3 py-2">{renderComponent(day.components.weekly)}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            <span
                              className={[
                                "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
                                coverageClasses(day.rawCoreReady),
                              ].join(" ")}
                            >
                              core
                            </span>
                            <span
                              className={[
                                "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
                                coverageClasses(day.enrichedInputsReady),
                              ].join(" ")}
                            >
                              enriched inputs
                            </span>
                            <span
                              className={[
                                "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
                                coverageClasses(day.dailyReady),
                              ].join(" ")}
                            >
                              daily
                            </span>
                            <span
                              className={[
                                "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
                                coverageClasses(day.dailyEnrichedReady),
                              ].join(" ")}
                            >
                              daily enriched
                            </span>
                            <span
                              className={[
                                "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
                                coverageClasses(day.weeklyReady),
                              ].join(" ")}
                            >
                              weekly
                            </span>
                          </div>
                          {day.missing.length ? (
                            <div className="mt-1 text-[11px] text-slate-500">
                              Missing: {day.missing.map(formatComponentLabel).join(", ")}
                            </div>
                          ) : (
                            <div className="mt-1 text-[11px] text-slate-500">
                              All tracked components present
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => rebuildDate(day.date)}
                            disabled={rebuildingDate === day.date}
                            className="inline-flex rounded-lg border bg-white px-3 py-2 text-xs font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {rebuildingDate === day.date ? "Rebuilding..." : "Rebuild"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionBlock>

            <SectionBlock
              title="Recent uploads"
              subtitle="Registered and duplicate raw files in the selected window."
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-sm">
                  <thead className="border-b bg-slate-50">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-semibold">Created</th>
                      <th className="px-3 py-2 font-semibold">Business Date</th>
                      <th className="px-3 py-2 font-semibold">Report</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                      <th className="px-3 py-2 font-semibold">Run</th>
                      <th className="px-3 py-2 font-semibold">Size</th>
                      <th className="px-3 py-2 font-semibold">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payload.recentUploads.length === 0 ? (
                      <tr>
                        <td className="px-3 py-3 text-slate-500" colSpan={7}>
                          No uploads recorded in this window.
                        </td>
                      </tr>
                    ) : (
                      payload.recentUploads.map((row, index) => (
                        <tr key={`${row.createdAt}-${row.reportType}-${index}`} className="border-b last:border-b-0">
                          <td className="px-3 py-2">{fmtTs(row.createdAt)}</td>
                          <td className="px-3 py-2">{row.businessDate}</td>
                          <td className="px-3 py-2 font-medium">{formatComponentLabel(row.reportType)}</td>
                          <td className="px-3 py-2">
                            <span
                              className={[
                                "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
                                statusClasses(row.status),
                              ].join(" ")}
                            >
                              {row.status}
                            </span>
                          </td>
                          <td className="px-3 py-2">{row.runId ?? "—"}</td>
                          <td className="px-3 py-2">{fmtBytes(row.sizeBytes)}</td>
                          <td className="px-3 py-2">
                            <div className="max-w-[320px] truncate text-slate-600">
                              {row.sourcePath}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </SectionBlock>
          </>
        ) : null}
      </div>
    </main>
  );
}
