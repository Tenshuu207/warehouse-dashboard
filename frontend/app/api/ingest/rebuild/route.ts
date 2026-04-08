import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { spawnSync } from "child_process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isDateLike(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { date?: string };
    const businessDate = (body.date || "").trim();

    if (!isDateLike(businessDate)) {
      return NextResponse.json(
        { error: "invalid_date", details: "Use YYYY-MM-DD." },
        { status: 400 }
      );
    }

    const frontendRoot = process.cwd();
    const repoRoot = path.resolve(frontendRoot, "..");
    const pythonBin = process.env.PYTHON || "python3";

    const args = [
      path.join(repoRoot, "ingest/scripts/refresh_date_pipeline.py"),
      path.join(repoRoot, "ingest/index"),
      businessDate,
      path.join(repoRoot, "ingest/config/area_map.json"),
      path.join(repoRoot, "ingest/config/manual_roles.json"),
      path.join(repoRoot, "ingest/config/reviews"),
      path.join(repoRoot, "ingest/config/options.json"),
      path.join(repoRoot, "ingest/parsed"),
      path.join(repoRoot, "ingest/derived/daily"),
      path.join(repoRoot, "ingest/derived/weekly"),
    ];

    const result = spawnSync(pythonBin, args, {
      cwd: repoRoot,
      encoding: "utf-8",
    });

    if (result.error) {
      return NextResponse.json(
        {
          error: "spawn_failed",
          details: result.error.message,
        },
        { status: 500 }
      );
    }

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(result.stdout || "{}");
    } catch {
      parsed = {
        rawStdout: result.stdout,
        rawStderr: result.stderr,
      };
    }

    if (result.status !== 0) {
      return NextResponse.json(
        {
          error: "rebuild_failed",
          details: result.stderr || "refresh_date_pipeline.py failed",
          result: parsed,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      date: businessDate,
      result: parsed,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "unexpected_error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
