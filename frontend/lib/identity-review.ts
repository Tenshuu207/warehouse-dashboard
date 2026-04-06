import {
  resolveOperatorIdentity,
  type EmployeeRecord,
  type OperatorDefault,
  type RfMapping,
} from "@/lib/employee-identity";
import type { ResolvedDashboardData } from "@/lib/data-resolver";

export type IdentityReviewReason =
  | "unmapped_rf_username"
  | "name_mismatch"
  | "inactive_employee_seen";

export type IdentityReviewStatus = "pending" | "resolved" | "ignored";

export type IdentityReviewItem = {
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

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function queueKey(item: Pick<IdentityReviewItem, "rfUsername" | "reason" | "employeeId">): string {
  return `${item.rfUsername}::${item.reason}::${item.employeeId || ""}`;
}

function makeId(rfUsername: string, reason: string): string {
  return `${Date.now()}_${rfUsername}_${reason}_${Math.random().toString(36).slice(2, 8)}`;
}

function upsertDraft(
  bucket: Map<string, IdentityReviewItem>,
  incoming: Omit<IdentityReviewItem, "id">
) {
  const key = queueKey(incoming);
  const existing = bucket.get(key);

  if (!existing) {
    bucket.set(key, {
      ...incoming,
      id: makeId(incoming.rfUsername, incoming.reason),
    });
    return;
  }

  const rawNames = [...new Set([...existing.rawNamesSeen, ...incoming.rawNamesSeen])].sort();

  bucket.set(key, {
    ...existing,
    rawNamesSeen: rawNames,
    firstSeenDate:
      existing.firstSeenDate < incoming.firstSeenDate
        ? existing.firstSeenDate
        : incoming.firstSeenDate,
    lastSeenDate:
      existing.lastSeenDate > incoming.lastSeenDate
        ? existing.lastSeenDate
        : incoming.lastSeenDate,
    employeeId: existing.employeeId || incoming.employeeId,
    employeeDisplayName: existing.employeeDisplayName || incoming.employeeDisplayName,
  });
}

export function scanIdentityReviewItems({
  selectedDate,
  weekData,
  employees,
  mappings,
  defaultTeams,
}: {
  selectedDate: string;
  weekData: ResolvedDashboardData;
  employees: Record<string, EmployeeRecord>;
  mappings: RfMapping[];
  defaultTeams: Record<string, OperatorDefault>;
}): IdentityReviewItem[] {
  const drafts = new Map<string, IdentityReviewItem>();

  for (const op of weekData.operators || []) {
    const rawName = (op.name || "").trim();

    const resolved = resolveOperatorIdentity({
      rfUsername: op.userid,
      fallbackName: op.name,
      fallbackTeam: op.rawAssignedArea || op.effectiveAssignedArea || op.assignedArea || op.area,
      selectedDate,
      employees,
      mappings,
      defaultTeams,
    });

    if (!resolved.employeeId) {
      upsertDraft(drafts, {
        rfUsername: op.userid,
        rawNamesSeen: rawName ? [rawName] : [],
        reason: "unmapped_rf_username",
        status: "pending",
        firstSeenDate: selectedDate,
        lastSeenDate: selectedDate,
      });
      continue;
    }

    const employee = employees[resolved.employeeId];

    if (employee?.status === "inactive") {
      upsertDraft(drafts, {
        rfUsername: op.userid,
        rawNamesSeen: rawName ? [rawName] : [],
        reason: "inactive_employee_seen",
        status: "pending",
        firstSeenDate: selectedDate,
        lastSeenDate: selectedDate,
        employeeId: resolved.employeeId,
        employeeDisplayName: employee.displayName,
      });
    }

    if (
      rawName &&
      employee?.displayName &&
      rawName.length >= 3 &&
      normalizeName(rawName) !== normalizeName(employee.displayName)
    ) {
      upsertDraft(drafts, {
        rfUsername: op.userid,
        rawNamesSeen: [rawName],
        reason: "name_mismatch",
        status: "pending",
        firstSeenDate: selectedDate,
        lastSeenDate: selectedDate,
        employeeId: resolved.employeeId,
        employeeDisplayName: employee.displayName,
      });
    }
  }

  return [...drafts.values()].sort((a, b) => a.rfUsername.localeCompare(b.rfUsername));
}

export function mergeIdentityReviewItems(
  existing: IdentityReviewItem[],
  incoming: IdentityReviewItem[]
): IdentityReviewItem[] {
  const bucket = new Map<string, IdentityReviewItem>();

  for (const item of existing) {
    bucket.set(queueKey(item), item);
  }

  for (const item of incoming) {
    const key = queueKey(item);
    const current = bucket.get(key);

    if (!current) {
      bucket.set(key, item);
      continue;
    }

    bucket.set(key, {
      ...current,
      rawNamesSeen: [...new Set([...(current.rawNamesSeen || []), ...(item.rawNamesSeen || [])])].sort(),
      firstSeenDate:
        current.firstSeenDate < item.firstSeenDate ? current.firstSeenDate : item.firstSeenDate,
      lastSeenDate:
        current.lastSeenDate > item.lastSeenDate ? current.lastSeenDate : item.lastSeenDate,
      employeeId: current.employeeId || item.employeeId,
      employeeDisplayName: current.employeeDisplayName || item.employeeDisplayName,
    });
  }

  return [...bucket.values()].sort((a, b) => {
    if (a.status !== b.status) {
      const order = { pending: 0, resolved: 1, ignored: 2 };
      return order[a.status] - order[b.status];
    }
    if (a.lastSeenDate !== b.lastSeenDate) return b.lastSeenDate.localeCompare(a.lastSeenDate);
    return a.rfUsername.localeCompare(b.rfUsername);
  });
}
