import { NextRequest, NextResponse } from "next/server";
import { buildAreaDetailRange, isDateLike } from "@/lib/server/area-detail";

function daysBetweenInclusive(start: string, end: string) {
  const startMs = new Date(`${start}T00:00:00Z`).getTime();
  const endMs = new Date(`${end}T00:00:00Z`).getTime();
  return Math.floor((endMs - startMs) / 86400000) + 1;
}

export async function GET(req: NextRequest) {
  const area = req.nextUrl.searchParams.get("area")?.trim() || "";
  const start = req.nextUrl.searchParams.get("start")?.trim() || "";
  const end = req.nextUrl.searchParams.get("end")?.trim() || start;

  if (!area) {
    return NextResponse.json(
      { error: "invalid_area", details: "Use area query param." },
      { status: 400 }
    );
  }

  if (!isDateLike(start) || !isDateLike(end)) {
    return NextResponse.json(
      { error: "invalid_date_range", details: "Use YYYY-MM-DD for start and end." },
      { status: 400 }
    );
  }

  if (end < start) {
    return NextResponse.json(
      { error: "invalid_date_range", details: "end must be on or after start." },
      { status: 400 }
    );
  }

  if (daysBetweenInclusive(start, end) > 31) {
    return NextResponse.json(
      { error: "range_too_large", details: "Area detail range queries are limited to 31 days." },
      { status: 400 }
    );
  }

  const payload = await buildAreaDetailRange(start, end, area);
  if (!payload) {
    return NextResponse.json(
      {
        error: "area_detail_not_found",
        requestedArea: area,
        requestedStart: start,
        requestedEnd: end,
        details: "No daily_enriched snapshots were found in that range.",
      },
      { status: 404 }
    );
  }

  return NextResponse.json(payload);
}
