import { NextRequest, NextResponse } from "next/server";
import {
  listHistoricalRoleAlignment,
  saveHistoricalRoleAlignmentOverride,
} from "@/lib/server/historical-role-alignment";

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
      saveSupported: true,
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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      year?: unknown;
      userid?: unknown;
      forcedRole?: unknown;
      forcedArea?: unknown;
      notes?: unknown;
    };

    const result = saveHistoricalRoleAlignmentOverride({
      year: parseYear(String(body.year || "")),
      userid: typeof body.userid === "string" ? body.userid : "",
      forcedRole: typeof body.forcedRole === "string" ? body.forcedRole : null,
      forcedArea: typeof body.forcedArea === "string" ? body.forcedArea : null,
      notes: typeof body.notes === "string" ? body.notes : "",
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: "historical_role_alignment_override_save_failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 400 }
    );
  }
}
