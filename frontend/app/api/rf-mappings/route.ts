import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getJsonValue, upsertJsonValue } from "@/lib/server/db";

type RfMapping = {
  rfUsername: string;
  employeeId: string;
  effectiveStartDate?: string;
  effectiveEndDate?: string;
  active: boolean;
  notes?: string;
};

type RfMappingsData = {
  mappings: RfMapping[];
};

function mappingsFilePath() {
  return path.join(process.cwd(), "..", "ingest", "config", "rf_username_mappings.json");
}

function employeesFilePath() {
  return path.join(process.cwd(), "..", "ingest", "config", "employees.json");
}

function isDateLike(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function readEmployeeIds(): Promise<Set<string>> {
  const fromDb = getJsonValue<{ employees?: Record<string, unknown> }>("config", "employees");
  if (fromDb?.employees && typeof fromDb.employees === "object") {
    return new Set(Object.keys(fromDb.employees));
  }

  try {
    const raw = await fs.readFile(employeesFilePath(), "utf-8");
    const data = JSON.parse(raw);
    const employees =
      data && typeof data === "object" && !Array.isArray(data) && data.employees && typeof data.employees === "object"
        ? (data.employees as Record<string, unknown>)
        : {};
    return new Set(Object.keys(employees));
  } catch {
    return new Set();
  }
}

function normalizeData(input: unknown, validEmployeeIds: Set<string>): RfMappingsData {
  const raw =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};

  const rawMappings = Array.isArray(raw.mappings) ? raw.mappings : [];

  const mappings: RfMapping[] = [];

  for (const item of rawMappings) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;

    const rfUsername = typeof row.rfUsername === "string" ? row.rfUsername.trim() : "";
    const employeeId = typeof row.employeeId === "string" ? row.employeeId.trim() : "";
    const active = row.active === true;
    const effectiveStartDate =
      typeof row.effectiveStartDate === "string" && row.effectiveStartDate.trim()
        ? row.effectiveStartDate.trim()
        : "";
    const effectiveEndDate =
      typeof row.effectiveEndDate === "string" && row.effectiveEndDate.trim()
        ? row.effectiveEndDate.trim()
        : "";
    const notes = typeof row.notes === "string" ? row.notes.trim() : "";

    if (!rfUsername || !employeeId) continue;
    if (!validEmployeeIds.has(employeeId)) continue;
    if (effectiveStartDate && !isDateLike(effectiveStartDate)) continue;
    if (effectiveEndDate && !isDateLike(effectiveEndDate)) continue;

    mappings.push({
      rfUsername,
      employeeId,
      ...(effectiveStartDate ? { effectiveStartDate } : {}),
      ...(effectiveEndDate ? { effectiveEndDate } : {}),
      active,
      ...(notes ? { notes } : {}),
    });
  }

  mappings.sort((a, b) => {
    if (a.rfUsername !== b.rfUsername) return a.rfUsername.localeCompare(b.rfUsername);
    return (a.effectiveStartDate || "").localeCompare(b.effectiveStartDate || "");
  });

  return { mappings };
}

async function readMappings(validEmployeeIds: Set<string>): Promise<RfMappingsData> {
  const fromDb = getJsonValue<RfMappingsData>("config", "rf-mappings");
  if (fromDb) {
    return normalizeData(fromDb, validEmployeeIds);
  }

  try {
    const raw = await fs.readFile(mappingsFilePath(), "utf-8");
    return normalizeData(JSON.parse(raw), validEmployeeIds);
  } catch {
    return { mappings: [] };
  }
}

export async function GET() {
  const validEmployeeIds = await readEmployeeIds();
  const data = await readMappings(validEmployeeIds);

  return NextResponse.json({
    ...data,
  });
}

export async function POST(req: NextRequest) {
  try {
    const validEmployeeIds = await readEmployeeIds();
    const body = await req.json();
    const data = normalizeData(body, validEmployeeIds);

    await fs.mkdir(path.dirname(mappingsFilePath()), { recursive: true });
    await fs.writeFile(mappingsFilePath(), JSON.stringify(data, null, 2), "utf-8");
    upsertJsonValue("config", "rf-mappings", data, mappingsFilePath());

    return NextResponse.json({
      status: "saved",
      ...data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "save_failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
