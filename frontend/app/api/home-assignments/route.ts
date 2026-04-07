import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import type { HomeAssignmentsPayload, HomeAssignmentSection } from "@/lib/assignments/home-assignments-types";

const DATA_PATH = path.join(process.cwd(), "data", "assignments", "home-assignments.json");

function cleanSection(input: Partial<HomeAssignmentSection>): HomeAssignmentSection {
  const team = typeof input.team === "string" && input.team.trim() ? input.team.trim() : "Unassigned";
  const role = typeof input.role === "string" && input.role.trim() ? input.role.trim() : "Float";
  const employees = Array.isArray(input.employees)
    ? input.employees.map((value) => (typeof value === "string" ? value.trim() : "")).slice(0, 50)
    : ["", "", "", ""];

  return {
    team,
    role,
    employees: employees.length > 0 ? employees : [""],
  };
}

async function readPayload(): Promise<HomeAssignmentsPayload> {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf8");
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

async function writePayload(payload: HomeAssignmentsPayload) {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

export async function GET() {
  const payload = await readPayload();

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<HomeAssignmentsPayload>;

    const payload: HomeAssignmentsPayload = {
      updatedAt: new Date().toISOString(),
      sections: Array.isArray(body.sections) ? body.sections.map(cleanSection) : [],
    };

    await writePayload(payload);

    return NextResponse.json(
      {
        ok: true,
        payload,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to save home assignments",
      },
      { status: 500 }
    );
  }
}
