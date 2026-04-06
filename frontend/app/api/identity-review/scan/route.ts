import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import type { ResolvedDashboardData } from "@/lib/data-resolver";
import type {
  EmployeeRecord,
  OperatorDefault,
  RfMapping,
} from "@/lib/employee-identity";
import {
  scanIdentityReviewItems,
  mergeIdentityReviewItems,
  type IdentityReviewItem,
} from "@/lib/identity-review";

type QueueFile = {
  items: IdentityReviewItem[];
};

type EmployeesFile = {
  employees?: Record<string, EmployeeRecord>;
};

type DefaultsFile = {
  operators?: Record<string, OperatorDefault>;
};

type MappingsFile = {
  mappings?: RfMapping[];
};

function weeklyPath(selectedDate: string) {
  return path.join(process.cwd(), "..", "ingest", "derived", "weekly", `${selectedDate}.json`);
}

function dailyPath(selectedDate: string) {
  return path.join(process.cwd(), "..", "ingest", "derived", "daily", `${selectedDate}.json`);
}

function defaultsPath() {
  return path.join(process.cwd(), "..", "ingest", "config", "operator_defaults.json");
}

function employeesPath() {
  return path.join(process.cwd(), "..", "ingest", "config", "employees.json");
}

function mappingsPath() {
  return path.join(process.cwd(), "..", "ingest", "config", "rf_username_mappings.json");
}

function queuePath() {
  return path.join(process.cwd(), "..", "ingest", "config", "identity_review_queue.json");
}

function isDateLike(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf-8");
}

function summarize(items: IdentityReviewItem[]) {
  const byReason: Record<string, number> = {};
  const byStatus: Record<string, number> = {};

  for (const item of items) {
    byReason[item.reason] = (byReason[item.reason] || 0) + 1;
    byStatus[item.status] = (byStatus[item.status] || 0) + 1;
  }

  return { byReason, byStatus };
}

function detectSourceKind(source: Record<string, unknown>) {
  if (typeof source.weekStart === "string") return "weekly";
  if (typeof source.date === "string") return "daily";
  return "unknown";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const selectedDate =
      typeof body?.selectedDate === "string" ? body.selectedDate.trim() : "";

    if (!isDateLike(selectedDate)) {
      return NextResponse.json({ error: "invalid_selected_date" }, { status: 400 });
    }

    const weekly = await readJson<Record<string, unknown> | null>(
      weeklyPath(selectedDate),
      null
    );

    const daily =
      weekly ||
      (await readJson<Record<string, unknown> | null>(
        dailyPath(selectedDate),
        null
      ));

    const source = weekly || daily;

    if (!source || !Array.isArray(source.operators)) {
      return NextResponse.json(
        {
          error: "derived_data_not_found",
          selectedDate,
          lookedFor: {
            weekly: weeklyPath(selectedDate),
            daily: dailyPath(selectedDate),
          },
        },
        { status: 404 }
      );
    }

    const defaultsJson = await readJson<DefaultsFile>(defaultsPath(), { operators: {} });
    const employeesJson = await readJson<EmployeesFile>(employeesPath(), { employees: {} });
    const mappingsJson = await readJson<MappingsFile>(mappingsPath(), { mappings: [] });
    const queueJson = await readJson<QueueFile>(queuePath(), { items: [] });

    const existingItems = Array.isArray(queueJson.items) ? queueJson.items : [];

    const scanned = scanIdentityReviewItems({
      selectedDate,
      weekData: source as unknown as ResolvedDashboardData,
      employees: employeesJson.employees || {},
      mappings: Array.isArray(mappingsJson.mappings) ? mappingsJson.mappings : [],
      defaultTeams: defaultsJson.operators || {},
    });

    const merged = mergeIdentityReviewItems(existingItems, scanned);

    await writeJson(queuePath(), { items: merged });

    return NextResponse.json({
      status: "scanned",
      selectedDate,
      sourceKind: detectSourceKind(source),
      scannedCount: scanned.length,
      totalItems: merged.length,
      scannedSummary: summarize(scanned),
      queueSummary: summarize(merged),
      items: merged,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "scan_failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
