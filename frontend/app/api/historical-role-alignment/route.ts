import { NextRequest, NextResponse } from "next/server";
import { listHistoricalRoleAlignment } from "@/lib/server/historical-role-alignment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseYear(value: string | null): number {
  const year = Number(value || "2025");
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("Invalid year");
  }
  return year;
}

export async function GET(request: NextRequest) {
  try {
    const year = parseYear(request.nextUrl.searchParams.get("year"));
    const rows = listHistoricalRoleAlignment(year);

    return NextResponse.json({
      year,
      count: rows.length,
      rows,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 400 }
    );
  }
}
