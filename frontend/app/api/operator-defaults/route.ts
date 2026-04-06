import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

type OperatorDefault = {
  name?: string;
  defaultTeam: string;
};

type OperatorDefaultsData = {
  operators: Record<string, OperatorDefault>;
};

function defaultsFilePath() {
  return path.join(process.cwd(), "..", "ingest", "config", "operator_defaults.json");
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

function normalizeData(input: unknown, validTeams: string[]): OperatorDefaultsData {
  const raw =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};

  const rawOperators =
    raw.operators && typeof raw.operators === "object" && !Array.isArray(raw.operators)
      ? (raw.operators as Record<string, unknown>)
      : {};

  const operators: Record<string, OperatorDefault> = {};

  for (const [userid, value] of Object.entries(rawOperators)) {
    if (!userid.trim()) continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;

    const row = value as Record<string, unknown>;
    const defaultTeam = typeof row.defaultTeam === "string" ? row.defaultTeam.trim() : "";

    if (!defaultTeam || !validTeams.includes(defaultTeam)) continue;

    const name = typeof row.name === "string" ? row.name.trim() : "";

    operators[userid] = {
      ...(name ? { name } : {}),
      defaultTeam,
    };
  }

  return { operators };
}

async function readDefaults(validTeams: string[]): Promise<OperatorDefaultsData> {
  try {
    const raw = await fs.readFile(defaultsFilePath(), "utf-8");
    return normalizeData(JSON.parse(raw), validTeams);
  } catch {
    return { operators: {} };
  }
}

export async function GET() {
  const validTeams = await readValidTeams();
  const data = await readDefaults(validTeams);

  return NextResponse.json({
    ...data,
    validTeams,
  });
}

export async function POST(req: NextRequest) {
  try {
    const validTeams = await readValidTeams();
    const body = await req.json();
    const data = normalizeData(body, validTeams);

    await fs.mkdir(path.dirname(defaultsFilePath()), { recursive: true });
    await fs.writeFile(defaultsFilePath(), JSON.stringify(data, null, 2), "utf-8");

    return NextResponse.json({
      status: "saved",
      ...data,
      validTeams,
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
