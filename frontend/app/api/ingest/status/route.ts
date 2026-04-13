import { NextRequest, NextResponse } from "next/server";
import { listDatasetComponentsInRange, listRecentUploads } from "@/lib/server/db";

const COMPONENT_TYPES = [
  "b_forkl2",
  "rf2_forkstdl",
  "rf2_userls",
  "daily",
  "daily_enriched",
  "weekly",
] as const;

type ComponentType = (typeof COMPONENT_TYPES)[number];
type ComponentRow = ReturnType<typeof listDatasetComponentsInRange>[number];

function isDateLike(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function buildDateList(start: string, end: string) {
  const dates: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    dates.push(cursor);
    cursor = addDaysIso(cursor, 1);
  }
  return dates.reverse();
}

function isReady(component: ComponentRow | null | undefined) {
  if (!component) return false;
  return component.status !== "failed" && component.status !== "missing";
}

export async function GET(req: NextRequest) {
  const startParam = req.nextUrl.searchParams.get("start")?.trim() || "";
  const endParam = req.nextUrl.searchParams.get("end")?.trim() || "";
  const daysParam = Number(req.nextUrl.searchParams.get("days") || "14");
  const safeDays =
    Number.isFinite(daysParam) && daysParam > 0 ? Math.min(Math.trunc(daysParam), 60) : 14;

  let start = startParam;
  let end = endParam;

  if (!start && !end) {
    end = todayIso();
    start = addDaysIso(end, -(safeDays - 1));
  } else if (start && !end) {
    end = start;
  } else if (!start && end) {
    start = addDaysIso(end, -(safeDays - 1));
  }

  if (!isDateLike(start) || !isDateLike(end)) {
    return NextResponse.json(
      { error: "invalid_date_range", details: "Use YYYY-MM-DD for start and end." },
      { status: 400 }
    );
  }

  if (end < start) {
    return NextResponse.json(
      { error: "invalid_date_range", details: "end must be on or after start." },
      { status: 400 }
    );
  }

  const componentRows = listDatasetComponentsInRange(start, end);
  const recentUploads = listRecentUploads({
    startDate: start,
    endDate: end,
    limit: Math.max(50, safeDays * 12),
  });

  const byDate = new Map<string, Partial<Record<ComponentType, ComponentRow>>>();

  for (const row of componentRows) {
    const componentType = row.componentType as ComponentType;
    if (!COMPONENT_TYPES.includes(componentType)) continue;

    if (!byDate.has(row.businessDate)) {
      byDate.set(row.businessDate, {});
    }

    const bucket = byDate.get(row.businessDate)!;
    bucket[componentType] = row;
  }

  const days = buildDateList(start, end).map((date) => {
    const bucket = byDate.get(date) || {};

    const components = {
      b_forkl2: bucket.b_forkl2 ?? null,
      rf2_forkstdl: bucket.rf2_forkstdl ?? null,
      rf2_userls: bucket.rf2_userls ?? null,
      daily: bucket.daily ?? null,
      daily_enriched: bucket.daily_enriched ?? null,
      weekly: bucket.weekly ?? null,
    };

    const rawCoreReady = isReady(components.b_forkl2) && isReady(components.rf2_forkstdl);
    const enrichedInputsReady = rawCoreReady && isReady(components.rf2_userls);
    const dailyReady = isReady(components.daily);
    const dailyEnrichedReady = isReady(components.daily_enriched);
    const weeklyReady = isReady(components.weekly);

    return {
      date,
      rawCoreReady,
      enrichedInputsReady,
      dailyReady,
      dailyEnrichedReady,
      weeklyReady,
      missing: COMPONENT_TYPES.filter((key) => !isReady(components[key])),
      components,
    };
  });

  return NextResponse.json({
    start,
    end,
    summary: {
      daysInRange: days.length,
      rawCoreReadyDays: days.filter((day) => day.rawCoreReady).length,
      enrichedInputsReadyDays: days.filter((day) => day.enrichedInputsReady).length,
      dailyReadyDays: days.filter((day) => day.dailyReady).length,
      dailyEnrichedReadyDays: days.filter((day) => day.dailyEnrichedReady).length,
      weeklyReadyDays: days.filter((day) => day.weeklyReady).length,
      uploadsInRange: recentUploads.length,
    },
    days,
    recentUploads,
  });
}
