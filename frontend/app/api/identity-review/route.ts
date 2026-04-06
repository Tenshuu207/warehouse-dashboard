import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const VALID_REASONS = [
  "unmapped_rf_username",
  "name_mismatch",
  "inactive_employee_seen",
] as const;

const VALID_STATUSES = ["pending", "resolved", "ignored"] as const;

type IdentityReviewReason = (typeof VALID_REASONS)[number];
type IdentityReviewStatus = (typeof VALID_STATUSES)[number];

type IdentityReviewItem = {
  id: string;
  rfUsername: string;
  rawNamesSeen: string[];
  reason: IdentityReviewReason;
  status: IdentityReviewStatus;
  firstSeenDate: string;
  lastSeenDate: string;
  employeeId?: string;
  employeeDisplayName?: string;
  notes?: string;
};

type IdentityReviewQueue = {
  items: IdentityReviewItem[];
};

function queueFilePath() {
  return path.join(process.cwd(), "..", "ingest", "config", "identity_review_queue.json");
}

function isDateLike(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeQueue(input: unknown): IdentityReviewQueue {
  const raw =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};

  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const items: IdentityReviewItem[] = [];

  for (const item of rawItems) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;

    const id = typeof row.id === "string" ? row.id.trim() : "";
    const rfUsername = typeof row.rfUsername === "string" ? row.rfUsername.trim() : "";
    const rawNamesSeen = Array.isArray(row.rawNamesSeen)
      ? row.rawNamesSeen.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      : [];
    const reason = typeof row.reason === "string" ? row.reason.trim() : "";
    const status = typeof row.status === "string" ? row.status.trim() : "";
    const firstSeenDate = typeof row.firstSeenDate === "string" ? row.firstSeenDate.trim() : "";
    const lastSeenDate = typeof row.lastSeenDate === "string" ? row.lastSeenDate.trim() : "";
    const employeeId = typeof row.employeeId === "string" ? row.employeeId.trim() : "";
    const employeeDisplayName =
      typeof row.employeeDisplayName === "string" ? row.employeeDisplayName.trim() : "";
    const notes = typeof row.notes === "string" ? row.notes.trim() : "";

    if (!id || !rfUsername) continue;
    if (!VALID_REASONS.includes(reason as IdentityReviewReason)) continue;
    if (!VALID_STATUSES.includes(status as IdentityReviewStatus)) continue;
    if (!isDateLike(firstSeenDate) || !isDateLike(lastSeenDate)) continue;

    items.push({
      id,
      rfUsername,
      rawNamesSeen,
      reason: reason as IdentityReviewReason,
      status: status as IdentityReviewStatus,
      firstSeenDate,
      lastSeenDate,
      ...(employeeId ? { employeeId } : {}),
      ...(employeeDisplayName ? { employeeDisplayName } : {}),
      ...(notes ? { notes } : {}),
    });
  }

  items.sort((a, b) => {
    if (a.status !== b.status) {
      const order = { pending: 0, resolved: 1, ignored: 2 };
      return order[a.status] - order[b.status];
    }
    if (a.lastSeenDate !== b.lastSeenDate) return b.lastSeenDate.localeCompare(a.lastSeenDate);
    return a.rfUsername.localeCompare(b.rfUsername);
  });

  return { items };
}

async function readQueue(): Promise<IdentityReviewQueue> {
  try {
    const raw = await fs.readFile(queueFilePath(), "utf-8");
    return normalizeQueue(JSON.parse(raw));
  } catch {
    return { items: [] };
  }
}

export async function GET() {
  const data = await readQueue();

  return NextResponse.json({
    ...data,
    validReasons: VALID_REASONS,
    validStatuses: VALID_STATUSES,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = normalizeQueue(body);

    await fs.mkdir(path.dirname(queueFilePath()), { recursive: true });
    await fs.writeFile(queueFilePath(), JSON.stringify(data, null, 2), "utf-8");

    return NextResponse.json({
      status: "saved",
      ...data,
      validReasons: VALID_REASONS,
      validStatuses: VALID_STATUSES,
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
