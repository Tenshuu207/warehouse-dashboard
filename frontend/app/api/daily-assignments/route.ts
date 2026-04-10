import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import type { HomeAssignmentSection, HomeAssignmentsPayload } from "@/lib/assignments/home-assignments-types";
import type {
  DailyAssignmentsPayload,
  DailyOperatorPlacement,
} from "@/lib/assignments/daily-assignments-types";

const DAILY_DIR = path.join(process.cwd(), "data", "assignments", "daily");
const HOME_PATH = path.join(process.cwd(), "data", "assignments", "home-assignments.json");

function cleanSection(input: Partial<HomeAssignmentSection>): HomeAssignmentSection {
  const team = typeof input.team === "string" && input.team.trim() ? input.team.trim() : "Unassigned";
  const role = typeof input.role === "string" && input.role.trim() ? input.role.trim() : "Float";
  const employees = Array.isArray(input.employees)
    ? input.employees.map((value) => (typeof value === "string" ? value.trim() : "")).slice(0, 100)
    : ["", "", "", ""];

  return {
    team,
    role,
    employees: employees.length > 0 ? employees : [""],
  };
}

function cleanPlacement(input: Partial<DailyOperatorPlacement> & { userid?: string }): DailyOperatorPlacement | null {
  const employeeId =
    typeof input.employeeId === "string" && input.employeeId.trim() ? input.employeeId.trim() : null;

  const legacyUserid =
    typeof input.userid === "string" && input.userid.trim() ? input.userid.trim() : "";

  const assignmentKey =
    typeof input.assignmentKey === "string" && input.assignmentKey.trim()
      ? input.assignmentKey.trim()
      : employeeId
        ? `emp:${employeeId}`
        : legacyUserid
          ? `rf:${legacyUserid}`
          : "";

  if (!assignmentKey) return null;

  const employeeName =
    typeof input.employeeName === "string" && input.employeeName.trim()
      ? input.employeeName.trim()
      : null;

  const assignedSection =
    typeof input.assignedSection === "string" && input.assignedSection.trim()
      ? input.assignedSection.trim()
      : null;

  const assignedRole =
    typeof input.assignedRole === "string" && input.assignedRole.trim()
      ? input.assignedRole.trim()
      : null;

  const positionLabel =
    typeof input.positionLabel === "string" && input.positionLabel.trim()
      ? input.positionLabel.trim()
      : null;

  const note =
    typeof input.note === "string" && input.note.trim() ? input.note.trim() : null;

  const rfUsernames = Array.isArray(input.rfUsernames)
    ? Array.from(
        new Set(
          input.rfUsernames
            .map((value) => (typeof value === "string" ? value.trim() : ""))
            .filter(Boolean)
        )
      )
    : legacyUserid
      ? [legacyUserid]
      : [];

  if (!assignedSection && !assignedRole && !positionLabel && !note) {
    return null;
  }

  return {
    assignmentKey,
    employeeId,
    employeeName,
    rfUsernames,
    assignedSection,
    assignedRole,
    positionLabel,
    note,
  };
}

function safeDateKey(date: string) {
  return date.replace(/[^0-9A-Za-z._-]/g, "_");
}

function dailyPathFor(date: string) {
  return path.join(DAILY_DIR, `${safeDateKey(date)}.json`);
}

async function readHomeAssignments(): Promise<HomeAssignmentsPayload> {
  try {
    const raw = await fs.readFile(HOME_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<HomeAssignmentsPayload>;

    return {
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
      sections: Array.isArray(parsed.sections) ? parsed.sections.map(cleanSection) : [],
    };
  } catch {
    return {
      updatedAt: null,
      sections: [],
    };
  }
}

async function readDailyAssignments(date: string): Promise<DailyAssignmentsPayload | null> {
  try {
    const raw = await fs.readFile(dailyPathFor(date), "utf8");
    const parsed = JSON.parse(raw) as Partial<DailyAssignmentsPayload> & {
      placements?: Array<Partial<DailyOperatorPlacement> & { userid?: string }>;
    };

    return {
      date,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
      sections: Array.isArray(parsed.sections) ? parsed.sections.map(cleanSection) : [],
      placements: Array.isArray(parsed.placements)
        ? parsed.placements
            .map((item) => cleanPlacement(item))
            .filter((item): item is DailyOperatorPlacement => !!item)
        : [],
    };
  } catch {
    return null;
  }
}

async function writeDailyAssignments(payload: DailyAssignmentsPayload) {
  await fs.mkdir(DAILY_DIR, { recursive: true });
  await fs.writeFile(
    dailyPathFor(payload.date),
    JSON.stringify(payload, null, 2) + "\n",
    "utf8"
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date")?.trim();

  if (!date) {
    return NextResponse.json(
      { ok: false, error: "Missing required ?date=YYYY-MM-DD" },
      { status: 400 }
    );
  }

  const existing = await readDailyAssignments(date);
  if (existing) {
    return NextResponse.json(existing, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  const homes = await readHomeAssignments();

  const prefilled: DailyAssignmentsPayload = {
    date,
    updatedAt: null,
    sections: homes.sections,
    placements: [],
  };

  return NextResponse.json(prefilled, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<DailyAssignmentsPayload> & {
      placements?: Array<Partial<DailyOperatorPlacement> & { userid?: string }>;
    };

    const date = typeof body.date === "string" && body.date.trim() ? body.date.trim() : "";

    if (!date) {
      return NextResponse.json(
        { ok: false, error: "Missing payload.date" },
        { status: 400 }
      );
    }

    const payload: DailyAssignmentsPayload = {
      date,
      updatedAt: new Date().toISOString(),
      sections: Array.isArray(body.sections) ? body.sections.map(cleanSection) : [],
      placements: Array.isArray(body.placements)
        ? body.placements
            .map((item) => cleanPlacement(item))
            .filter((item): item is DailyOperatorPlacement => !!item)
        : [],
    };

    await writeDailyAssignments(payload);

    return NextResponse.json(
      { ok: true, payload },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to save daily assignments",
      },
      { status: 500 }
    );
  }
}
