import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getSnapshot } from "@/lib/server/db";

function dailyEnrichedPath(date: string) {
  return path.join(process.cwd(), "..", "ingest", "derived", "daily_enriched", `${date}.json`);
}

function isDateLike(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get("date")?.trim() || "";
    const userid = req.nextUrl.searchParams.get("userid")?.trim() || "";

    if (!isDateLike(date)) {
      return NextResponse.json({ error: "invalid_date" }, { status: 400 });
    }

    const fromDb = getSnapshot<Record<string, unknown>>("daily_enriched", date);
    const parsed = fromDb || JSON.parse(await fs.readFile(dailyEnrichedPath(date), "utf-8"));

    const operators = Array.isArray(parsed.operators) ? parsed.operators : [];
    const userlsOnlyUsers = Array.isArray(parsed.userlsOnlyUsers) ? parsed.userlsOnlyUsers : [];

    if (userid) {
      const operator = operators.find((row: { userid?: string }) => row.userid === userid) || null;
      const userlsOnlyUser =
        userlsOnlyUsers.find((row: { userid?: string }) => row.userid === userid) || null;

      return NextResponse.json({
        date,
        userid,
        userlsTrackingSummary: parsed.userlsTrackingSummary || null,
        operator,
        userlsOnlyUser,
        source: fromDb ? "sqlite" : "json",
      });
    }

    return NextResponse.json({
      ...parsed,
      source: fromDb ? "sqlite" : "json",
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
