import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { noRestockStandardsSeed } from "@/lib/standards/no-restock-standards-seed";
import type { StandardsPayload, StandardsRow } from "@/lib/standards/types";

type StandardsOverridePayload = {
  teamAreas?: Partial<StandardsRow>[];
  roles?: Partial<StandardsRow>[];
};

const OVERRIDES_PATH = path.join(process.cwd(), "data", "standards", "no-restock-overrides.json");

function mergeRows(seedRows: StandardsRow[], overrideRows: Partial<StandardsRow>[] = []) {
  const overrideMap = new Map(
    overrideRows
      .filter((row): row is Partial<StandardsRow> & { scopeType: StandardsRow["scopeType"]; scopeName: string } =>
        Boolean(row && row.scopeType && row.scopeName)
      )
      .map((row) => [`${row.scopeType}::${row.scopeName}`, row])
  );

  return seedRows.map((seedRow) => {
    const key = `${seedRow.scopeType}::${seedRow.scopeName}`;
    const override = overrideMap.get(key);
    return override ? { ...seedRow, ...override } : seedRow;
  });
}

async function readOverrides(): Promise<StandardsOverridePayload> {
  try {
    const raw = await fs.readFile(OVERRIDES_PATH, "utf8");
    const parsed = JSON.parse(raw) as StandardsOverridePayload;
    return {
      teamAreas: Array.isArray(parsed.teamAreas) ? parsed.teamAreas : [],
      roles: Array.isArray(parsed.roles) ? parsed.roles : [],
    };
  } catch {
    return { teamAreas: [], roles: [] };
  }
}

async function writeOverrides(payload: StandardsOverridePayload) {
  await fs.mkdir(path.dirname(OVERRIDES_PATH), { recursive: true });
  await fs.writeFile(
    OVERRIDES_PATH,
    JSON.stringify(
      {
        teamAreas: Array.isArray(payload.teamAreas) ? payload.teamAreas : [],
        roles: Array.isArray(payload.roles) ? payload.roles : [],
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
}

function buildMergedPayload(overrides: StandardsOverridePayload): StandardsPayload {
  return {
    ...noRestockStandardsSeed,
    teamAreas: mergeRows(noRestockStandardsSeed.teamAreas, overrides.teamAreas || []),
    roles: mergeRows(noRestockStandardsSeed.roles, overrides.roles || []),
  };
}

export async function GET() {
  const overrides = await readOverrides();
  const merged = buildMergedPayload(overrides);

  return NextResponse.json(merged, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as StandardsOverridePayload;

    await writeOverrides({
      teamAreas: Array.isArray(body.teamAreas) ? body.teamAreas : [],
      roles: Array.isArray(body.roles) ? body.roles : [],
    });

    const merged = buildMergedPayload(await readOverrides());

    return NextResponse.json(
      {
        ok: true,
        savedAt: new Date().toISOString(),
        payload: merged,
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
        error: error instanceof Error ? error.message : "Failed to save overrides",
      },
      { status: 500 }
    );
  }
}
