import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getJsonValue, upsertJsonValue } from "@/lib/server/db";

const VALID_STATUSES = ["active", "inactive"] as const;

type EmployeeStatus = (typeof VALID_STATUSES)[number];

type EmployeeRecord = {
  displayName: string;
  status: EmployeeStatus;
  defaultTeam: string;
  notes?: string;
};

type EmployeesData = {
  employees: Record<string, EmployeeRecord>;
};

type EmployeeRowInput = {
  employeeId?: string;
  displayName?: string;
  status?: string;
  defaultTeam?: string;
  notes?: string;
};

function employeesFilePath() {
  return path.join(process.cwd(), "..", "ingest", "config", "employees.json");
}

function optionsFilePath() {
  return path.join(process.cwd(), "..", "ingest", "config", "options.json");
}

async function readValidTeams(): Promise<string[]> {
  try {
    const raw = await fs.readFile(optionsFilePath(), "utf-8");
    const data = JSON.parse(raw);
    const areas = Array.isArray(data?.areas)
      ? data.areas.filter((v: unknown): v is string => typeof v === "string" && v.trim().length > 0)
      : [];
    return areas.length ? areas : ["Other"];
  } catch {
    return ["Other"];
  }
}

function normalizeExistingData(input: unknown, validTeams: string[]): EmployeesData {
  const raw =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};

  const rawEmployees =
    raw.employees && typeof raw.employees === "object" && !Array.isArray(raw.employees)
      ? (raw.employees as Record<string, unknown>)
      : {};

  const employees: Record<string, EmployeeRecord> = {};

  for (const [employeeId, value] of Object.entries(rawEmployees)) {
    const cleanId = employeeId.trim();
    if (!cleanId) continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;

    const row = value as Record<string, unknown>;
    const displayName = typeof row.displayName === "string" ? row.displayName.trim() : "";
    const status = typeof row.status === "string" ? row.status.trim() : "";
    const defaultTeam = typeof row.defaultTeam === "string" ? row.defaultTeam.trim() : "";
    const notes = typeof row.notes === "string" ? row.notes.trim() : "";

    if (!displayName) continue;
    if (!VALID_STATUSES.includes(status as EmployeeStatus)) continue;
    if (!defaultTeam || !validTeams.includes(defaultTeam)) continue;

    employees[cleanId] = {
      displayName,
      status: status as EmployeeStatus,
      defaultTeam,
      ...(notes ? { notes } : {}),
    };
  }

  return { employees };
}

async function readEmployees(validTeams: string[]): Promise<EmployeesData> {
  const fromDb = getJsonValue<EmployeesData>("config", "employees");
  if (fromDb) {
    return normalizeExistingData(fromDb, validTeams);
  }

  try {
    const raw = await fs.readFile(employeesFilePath(), "utf-8");
    return normalizeExistingData(JSON.parse(raw), validTeams);
  } catch {
    return { employees: {} };
  }
}

function nextEmployeeId(idsInUse: Set<string>): string {
  const numbers = [...idsInUse]
    .map((id) => {
      const match = /^EMP(\d+)$/i.exec(id.trim());
      return match ? Number(match[1]) : null;
    })
    .filter((value): value is number => value !== null && Number.isFinite(value));

  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  const employeeId = `EMP${String(next).padStart(4, "0")}`;
  idsInUse.add(employeeId);
  return employeeId;
}

function normalizeIncomingBody(input: unknown, validTeams: string[], existingIds: Set<string>): EmployeesData {
  const raw =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};

  const employees: Record<string, EmployeeRecord> = {};

  if (Array.isArray(raw.rows)) {
    const seenExplicitIds = new Set<string>();

    for (const entry of raw.rows as unknown[]) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const row = entry as EmployeeRowInput;

      const displayName = typeof row.displayName === "string" ? row.displayName.trim() : "";
      const status = typeof row.status === "string" ? row.status.trim() : "";
      const defaultTeam = typeof row.defaultTeam === "string" ? row.defaultTeam.trim() : "";
      const notes = typeof row.notes === "string" ? row.notes.trim() : "";
      const suppliedId = typeof row.employeeId === "string" ? row.employeeId.trim() : "";

      if (!displayName) continue;
      if (!VALID_STATUSES.includes(status as EmployeeStatus)) continue;
      if (!defaultTeam || !validTeams.includes(defaultTeam)) continue;

      let employeeId = suppliedId;

      if (employeeId) {
        if (seenExplicitIds.has(employeeId)) {
          throw new Error(`Duplicate employeeId in request: ${employeeId}`);
        }
        seenExplicitIds.add(employeeId);
        existingIds.add(employeeId);
      } else {
        employeeId = nextEmployeeId(existingIds);
      }

      employees[employeeId] = {
        displayName,
        status: status as EmployeeStatus,
        defaultTeam,
        ...(notes ? { notes } : {}),
      };
    }

    return { employees };
  }

  return normalizeExistingData(raw, validTeams);
}

export async function GET() {
  const validTeams = await readValidTeams();
  const data = await readEmployees(validTeams);

  return NextResponse.json({
    ...data,
    validTeams,
    validStatuses: VALID_STATUSES,
  });
}

export async function POST(req: NextRequest) {
  try {
    const validTeams = await readValidTeams();
    const current = await readEmployees(validTeams);
    const currentIds = new Set(Object.keys(current.employees || {}));

    const body = await req.json();
    const data = normalizeIncomingBody(body, validTeams, currentIds);

    await fs.mkdir(path.dirname(employeesFilePath()), { recursive: true });
    await fs.writeFile(employeesFilePath(), JSON.stringify(data, null, 2), "utf-8");
    upsertJsonValue("config", "employees", data, employeesFilePath());

    return NextResponse.json({
      status: "saved",
      ...data,
      validTeams,
      validStatuses: VALID_STATUSES,
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
