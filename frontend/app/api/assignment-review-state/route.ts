import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const VALID_STATUSES = ["pending", "resolved", "ignored"] as const;

type AssignmentReviewStatus = (typeof VALID_STATUSES)[number];

type AssignmentReviewState = {
  status: AssignmentReviewStatus;
  updatedAt: string;
  assignedArea?: string | null;
  note?: string | null;
};

type AssignmentReviewFile = {
  dates: Record<string, Record<string, AssignmentReviewState>>;
};

function stateFilePath() {
  return path.join(process.cwd(), "..", "ingest", "config", "assignment_review_state.json");
}

function isDateLike(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function readStateFile(): Promise<AssignmentReviewFile> {
  try {
    const raw = await fs.readFile(stateFilePath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<AssignmentReviewFile>;
    return {
      dates:
        parsed && parsed.dates && typeof parsed.dates === "object" && !Array.isArray(parsed.dates)
          ? parsed.dates
          : {},
    };
  } catch {
    return { dates: {} };
  }
}

async function writeStateFile(data: AssignmentReviewFile) {
  await fs.mkdir(path.dirname(stateFilePath()), { recursive: true });
  await fs.writeFile(stateFilePath(), JSON.stringify(data, null, 2), "utf-8");
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date")?.trim() || "";

  if (!isDateLike(date)) {
    return NextResponse.json(
      {
        error: "invalid_date",
        validStatuses: VALID_STATUSES,
      },
      { status: 400 }
    );
  }

  const data = await readStateFile();

  return NextResponse.json({
    date,
    states: data.dates[date] || {},
    validStatuses: VALID_STATUSES,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const date = typeof body?.date === "string" ? body.date.trim() : "";
    const userid = typeof body?.userid === "string" ? body.userid.trim() : "";
    const status = typeof body?.status === "string" ? body.status.trim() : "";
    const assignedArea =
      typeof body?.assignedArea === "string" ? body.assignedArea.trim() : undefined;
    const note = typeof body?.note === "string" ? body.note.trim() : undefined;

    if (!isDateLike(date)) {
      return NextResponse.json({ error: "invalid_date" }, { status: 400 });
    }

    if (!userid) {
      return NextResponse.json({ error: "missing_userid" }, { status: 400 });
    }

    if (!VALID_STATUSES.includes(status as AssignmentReviewStatus)) {
      return NextResponse.json(
        {
          error: "invalid_status",
          validStatuses: VALID_STATUSES,
        },
        { status: 400 }
      );
    }

    const data = await readStateFile();

    if (!data.dates[date]) {
      data.dates[date] = {};
    }

    data.dates[date][userid] = {
      status: status as AssignmentReviewStatus,
      updatedAt: new Date().toISOString(),
      ...(assignedArea !== undefined ? { assignedArea } : {}),
      ...(note !== undefined ? { note } : {}),
    };

    await writeStateFile(data);

    return NextResponse.json({
      status: "saved",
      date,
      userid,
      state: data.dates[date][userid],
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
