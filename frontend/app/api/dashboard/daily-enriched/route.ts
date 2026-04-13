import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { resolveNearestSnapshot } from "@/lib/server/db";

function dailyEnrichedDir() {
  return path.join(process.cwd(), "..", "ingest", "derived", "daily_enriched");
}

function dailyEnrichedPath(date: string) {
  return path.join(dailyEnrichedDir(), `${date}.json`);
}

function isDateLike(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function resolveNearestFile(
  dirPath: string,
  requestedKey: string
): Promise<{ filePath: string; resolvedKey: string } | null> {
  const entries = await fs.readdir(dirPath);
  const keys = entries
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/, ""))
    .sort();

  if (keys.length === 0) return null;

  if (keys.includes(requestedKey)) {
    return {
      filePath: path.join(dirPath, `${requestedKey}.json`),
      resolvedKey: requestedKey,
    };
  }

  const earlier = keys.filter((key) => key <= requestedKey);
  const resolvedKey = earlier.length > 0 ? earlier[earlier.length - 1] : keys[0];

  return {
    filePath: path.join(dirPath, `${resolvedKey}.json`),
    resolvedKey,
  };
}

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get("date")?.trim() || "";
    const userid = req.nextUrl.searchParams.get("userid")?.trim() || "";

    if (!isDateLike(date)) {
      return NextResponse.json({ error: "invalid_date" }, { status: 400 });
    }

    let parsed: Record<string, unknown>;
    let resolvedDate = date;
    let source: "sqlite" | "json" = "json";

    const resolvedDb = resolveNearestSnapshot<Record<string, unknown>>("daily_enriched", date);
    if (resolvedDb) {
      parsed = resolvedDb.payload;
      resolvedDate = resolvedDb.resolvedKey;
      source = "sqlite";
    } else {
      const resolved = await resolveNearestFile(dailyEnrichedDir(), date);
      if (!resolved) {
        return NextResponse.json(
          {
            error: "daily_enriched_not_found",
            requestedDate: date,
            details: "No daily_enriched files available",
          },
          { status: 404 }
        );
      }

      parsed = JSON.parse(await fs.readFile(resolved.filePath, "utf-8")) as Record<string, unknown>;
      resolvedDate = resolved.resolvedKey;
      source = "json";
    }

    const operators = Array.isArray(parsed.operators) ? parsed.operators : [];
    const userlsOnlyUsers = Array.isArray(parsed.userlsOnlyUsers) ? parsed.userlsOnlyUsers : [];

    if (userid) {
      const operator = operators.find((row: { userid?: string }) => row.userid === userid) || null;
      const userlsOnlyUser =
        userlsOnlyUsers.find((row: { userid?: string }) => row.userid === userid) || null;

      return NextResponse.json({
        date: resolvedDate,
        requestedDate: date,
        resolvedDate,
        usedFallback: resolvedDate !== date,
        userid,
        userlsTrackingSummary: parsed.userlsTrackingSummary || null,
        operator,
        userlsOnlyUser,
        source,
      });
    }

    return NextResponse.json({
      ...parsed,
      date: resolvedDate,
      requestedDate: date,
      resolvedDate,
      usedFallback: resolvedDate !== date,
      source,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "daily_enriched_read_failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
