import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { resolveNearestSnapshot } from "@/lib/server/db";

async function resolveNearestFile(dirPath: string, requestedKey: string): Promise<{ filePath: string; resolvedKey: string } | null> {
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
  const weekStart = req.nextUrl.searchParams.get("weekStart") || "2026-04-03";

  try {
    const resolvedDb = resolveNearestSnapshot<Record<string, unknown>>("weekly", weekStart);
    if (resolvedDb) {
      return NextResponse.json({
        ...resolvedDb.payload,
        requestedWeekStart: weekStart,
        resolvedWeekStart: resolvedDb.resolvedKey,
        usedFallback: resolvedDb.resolvedKey !== weekStart,
        source: "sqlite",
      });
    }

    const dirPath = path.join(process.cwd(), "..", "ingest", "derived", "weekly");

    const resolved = await resolveNearestFile(dirPath, weekStart);
    if (!resolved) {
      return NextResponse.json(
        {
          error: "weekly_dashboard_not_found",
          requestedWeekStart: weekStart,
          details: "No weekly dashboard files available",
        },
        { status: 404 }
      );
    }

    const raw = await fs.readFile(resolved.filePath, "utf-8");
    const data = JSON.parse(raw);

    return NextResponse.json({
      ...data,
      requestedWeekStart: weekStart,
      resolvedWeekStart: resolved.resolvedKey,
      usedFallback: resolved.resolvedKey !== weekStart,
      source: "json",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "weekly_dashboard_not_found",
        requestedWeekStart: weekStart,
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 404 }
    );
  }
}
