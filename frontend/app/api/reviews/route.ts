import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

function reviewFilePath(date: string) {
  return path.join(
    process.cwd(),
    "..",
    "ingest",
    "config",
    "reviews",
    `${date}.json`
  );
}

function optionsFilePath() {
  return path.join(
    process.cwd(),
    "..",
    "ingest",
    "config",
    "options.json"
  );
}

async function readReviewFile(date: string) {
  const filePath = reviewFilePath(date);

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {
      date,
      operators: {},
    };
  }
}

async function readOptions() {
  try {
    const raw = await fs.readFile(optionsFilePath(), "utf-8");
    const data = JSON.parse(raw);
    return {
      areas: Array.isArray(data.areas) ? data.areas : [],
      roles: Array.isArray(data.roles) ? data.roles : [],
      reviewStatuses: Array.isArray(data.reviewStatuses) ? data.reviewStatuses : [],
    };
  } catch {
    return {
      areas: [],
      roles: [],
      reviewStatuses: [],
    };
  }
}

async function triggerRebuild(date: string) {
  const repoRoot = path.join(process.cwd(), "..");
  const pythonBin = process.env.PYTHON_BIN || "python3";

  const dailyArgs = [
    "ingest/scripts/rebuild_from_manifest.py",
    "ingest/index",
    date,
    "ingest/config/area_map.json",
    "ingest/config/manual_roles.json",
    "ingest/config/reviews",
    "ingest/config/options.json",
    "ingest/parsed",
    "ingest/derived/daily",
  ];

  const daily = await execFileAsync(pythonBin, dailyArgs, { cwd: repoRoot });

  const weeklyArgs = [
    "ingest/scripts/build_weekly_dashboard.py",
    "ingest/derived/daily",
    date,
    `ingest/derived/weekly/${date}.json`,
  ];

  const weekly = await execFileAsync(pythonBin, weeklyArgs, { cwd: repoRoot });

  return {
    daily: {
      status: "rebuilt",
      stdout: daily.stdout,
      stderr: daily.stderr,
    },
    weekly: {
      status: "rebuilt",
      stdout: weekly.stdout,
      stderr: weekly.stderr,
    },
  };
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  if (!date) {
    return NextResponse.json(
      { error: "missing_date" },
      { status: 400 }
    );
  }

  const data = await readReviewFile(date);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const date = body?.date;
    const userid = body?.userid;

    if (!date || !userid) {
      return NextResponse.json(
        { error: "missing_date_or_userid" },
        { status: 400 }
      );
    }

    const options = await readOptions();

    if (body.assignedRole && !options.roles.includes(body.assignedRole)) {
      return NextResponse.json(
        { error: "invalid_assigned_role", assignedRole: body.assignedRole },
        { status: 400 }
      );
    }

    if (body.assignedArea && !options.areas.includes(body.assignedArea)) {
      return NextResponse.json(
        { error: "invalid_assigned_area", assignedArea: body.assignedArea },
        { status: 400 }
      );
    }

    if (body.reviewStatus && !options.reviewStatuses.includes(body.reviewStatus)) {
      return NextResponse.json(
        { error: "invalid_review_status", reviewStatus: body.reviewStatus },
        { status: 400 }
      );
    }

    const current = await readReviewFile(date);
    current.operators ||= {};
    current.operators[userid] ||= {};

    const existing = current.operators[userid];

    const mergedPerformanceOverrides = {
      ...(existing.performanceOverrides || {}),
      ...(body.performanceOverrides || {}),
    };

    if (mergedPerformanceOverrides.forceArea && !options.areas.includes(mergedPerformanceOverrides.forceArea)) {
      return NextResponse.json(
        { error: "invalid_force_area", forceArea: mergedPerformanceOverrides.forceArea },
        { status: 400 }
      );
    }

    current.operators[userid] = {
      ...existing,
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.assignedRole !== undefined ? { assignedRole: body.assignedRole } : {}),
      ...(body.assignedArea !== undefined ? { assignedArea: body.assignedArea } : {}),
      ...(body.reviewNotes !== undefined ? { reviewNotes: body.reviewNotes } : {}),
      ...(body.reviewStatus !== undefined ? { reviewStatus: body.reviewStatus } : {}),
      auditOverrides: {
        ...(existing.auditOverrides || {}),
        ...(body.auditOverrides || {}),
      },
      performanceOverrides: mergedPerformanceOverrides,
    };

    const filePath = reviewFilePath(date);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(current, null, 2), "utf-8");

    const rebuild = await triggerRebuild(date);

    return NextResponse.json({
      status: "saved",
      date,
      userid,
      operator: current.operators[userid],
      rebuild,
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
