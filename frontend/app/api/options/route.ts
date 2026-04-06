import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

type OptionsData = {
  areas: string[];
  roles: string[];
  reviewStatuses: string[];
};

type ListChange = {
  added: string[];
  removed: string[];
  orderChanged: boolean;
};

type OptionsAuditEvent = {
  eventId: string;
  timestamp: string;
  eventType: "options.updated";
  source: "ui";
  actor: string | null;
  requestId: string;
  before: OptionsData;
  after: OptionsData;
  changes: {
    areas: ListChange;
    roles: ListChange;
    reviewStatuses: ListChange;
  };
};

function optionsFilePath() {
  return path.join(process.cwd(), "..", "ingest", "config", "options.json");
}

function optionsAuditFilePath() {
  return path.join(
    process.cwd(),
    "..",
    "ingest",
    "config",
    "audit",
    "options-events.ndjson"
  );
}

const DEFAULTS: OptionsData = {
  areas: [],
  roles: [],
  reviewStatuses: ["pending", "reviewed", "dismissed"],
};

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const out: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = item.trim();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }

  return out;
}

function normalizeOptions(value: unknown): OptionsData {
  const obj = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  const reviewStatuses = normalizeList(obj.reviewStatuses);
  return {
    areas: normalizeList(obj.areas),
    roles: normalizeList(obj.roles),
    reviewStatuses:
      reviewStatuses.length > 0 ? reviewStatuses : DEFAULTS.reviewStatuses,
  };
}

async function readOptions(): Promise<OptionsData> {
  try {
    const raw = await fs.readFile(optionsFilePath(), "utf-8");
    return normalizeOptions(JSON.parse(raw));
  } catch {
    return DEFAULTS;
  }
}

function diffList(before: string[], after: string[]): ListChange {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);

  const added = after.filter((item) => !beforeSet.has(item));
  const removed = before.filter((item) => !afterSet.has(item));
  const orderChanged =
    before.length === after.length &&
    before.some((item, index) => item !== after[index]);

  return {
    added,
    removed,
    orderChanged,
  };
}

function hasAnyChanges(change: ListChange): boolean {
  return change.added.length > 0 || change.removed.length > 0 || change.orderChanged;
}

function buildAuditEvent(before: OptionsData, after: OptionsData): OptionsAuditEvent {
  const timestamp = new Date().toISOString();
  const requestId = crypto.randomBytes(6).toString("hex");

  return {
    eventId: `${timestamp}__${requestId}`,
    timestamp,
    eventType: "options.updated",
    source: "ui",
    actor: null,
    requestId,
    before,
    after,
    changes: {
      areas: diffList(before.areas, after.areas),
      roles: diffList(before.roles, after.roles),
      reviewStatuses: diffList(before.reviewStatuses, after.reviewStatuses),
    },
  };
}

function eventHasChanges(event: OptionsAuditEvent): boolean {
  return (
    hasAnyChanges(event.changes.areas) ||
    hasAnyChanges(event.changes.roles) ||
    hasAnyChanges(event.changes.reviewStatuses)
  );
}

export async function GET() {
  try {
    const data = await readOptions();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(DEFAULTS);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const before = await readOptions();
    const after = normalizeOptions(body);
    const auditEvent = buildAuditEvent(before, after);

    await fs.mkdir(path.dirname(optionsFilePath()), { recursive: true });
    await fs.writeFile(optionsFilePath(), JSON.stringify(after, null, 2), "utf-8");

    if (eventHasChanges(auditEvent)) {
      await fs.mkdir(path.dirname(optionsAuditFilePath()), { recursive: true });
      await fs.appendFile(
        optionsAuditFilePath(),
        JSON.stringify(auditEvent) + "\n",
        "utf-8"
      );
    }

    return NextResponse.json({
      status: "saved",
      changed: eventHasChanges(auditEvent),
      ...after,
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
