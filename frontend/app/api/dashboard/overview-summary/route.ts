import { NextRequest, NextResponse } from "next/server";
import { buildOverviewSummary } from "@/lib/server/overview-summary";
import { isUserlsDateLike } from "@/lib/server/userls-overview";

export async function GET(req: NextRequest) {
  const weekStart = req.nextUrl.searchParams.get("weekStart") || "2026-04-03";

  if (!isUserlsDateLike(weekStart)) {
    return NextResponse.json(
      { error: "invalid_week_start", details: "Use YYYY-MM-DD for weekStart." },
      { status: 400 }
    );
  }

  try {
    const payload = await buildOverviewSummary(weekStart);

    if (!payload) {
      return NextResponse.json(
        {
          error: "overview_summary_not_found",
          requestedWeekStart: weekStart,
          details: "No UserLS daily summaries were found in that overview week.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error: "overview_summary_read_failed",
        requestedWeekStart: weekStart,
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
