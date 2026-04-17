import fs from "fs/promises";
import path from "path";
import { listSnapshotsInRange } from "@/lib/server/db";
import {
  formatOperationalAreaLabel,
  operationalAreaGroupNativeRoleLabels,
  resolveOperationalAreaGroup,
} from "@/lib/area-labels";

type JsonObj = Record<string, unknown>;

type AreaBucket = {
  areaCode?: unknown;
  letdownPlates?: unknown;
  letdownPieces?: unknown;
  putawayPlates?: unknown;
  putawayPieces?: unknown;
  restockPlatesRaw?: unknown;
  restockPiecesRaw?: unknown;
  restockLikePlatesEstimated?: unknown;
  restockLikePiecesEstimated?: unknown;
  replenishmentNoRecvPlates?: unknown;
  replenishmentNoRecvPieces?: unknown;
  receivingPlates?: unknown;
  receivingPieces?: unknown;
};

type RoleBucket = AreaBucket & {
  role?: unknown;
};

type Operator = JsonObj & {
  userid?: unknown;
  name?: unknown;
  resolvedEmployeeId?: unknown;
  resolvedEmployeeName?: unknown;
  areaBuckets?: unknown;
  roleBuckets?: unknown;
  userlsTracking?: JsonObj;
};

type AreaMetrics = {
  letdownPlates: number;
  letdownPieces: number;
  putawayPlates: number;
  putawayPieces: number;
  restockPlates: number;
  restockPieces: number;
  bulkMovePlates: number;
  bulkMovePieces: number;
  totalPlates: number;
  totalPieces: number;
  avgPcsPerPlate: number;
};

type AreaEmployeeRow = AreaMetrics & {
  rowKey: string;
  employeeId: string | null;
  primaryUserid: string;
  rfUsernames: string[];
  name: string;
  role: string;
  area: string;
};

type AreaRoleRow = AreaMetrics & {
  label: string;
  employeeCount: number;
  contributors?: AreaEmployeeRow[];
};

type AreaReceivingRow = {
  rowKey: string;
  employeeId: string | null;
  primaryUserid: string;
  rfUsernames: string[];
  name: string;
  receivingPlates: number;
  receivingPieces: number;
};

export type AreaDetailPayload = {
  areaKey: string;
  areaLabel: string;
  rangeStart: string;
  rangeEnd: string;
  assignedEmployeeCount: number;
  receivingCount: number;
  roleCount: number;
  totals: AreaMetrics;
  assignedEmployees: AreaEmployeeRow[];
  receivingEmployees: AreaReceivingRow[];
  roles: AreaRoleRow[];
};

export function isDateLike(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function addDaysIso(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function enumerateDates(start: string, end: string) {
  const dates: string[] = [];
  for (let current = start; current <= end; current = addDaysIso(current, 1)) {
    dates.push(current);
  }
  return dates;
}

function asObj(value: unknown): JsonObj {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObj) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNum(value: unknown): number {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
}

function normalizeAreaCode(value: unknown) {
  return String(value || "").trim();
}

function normalizeNameKey(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function cleanDisplayName(op: Operator) {
  const candidates = [
    op.resolvedEmployeeName,
    op.employeeDisplayName,
    op.employeeName,
    op.linkedEmployeeName,
    op.displayName,
    op.resolvedName,
    op.name,
    op.userid,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .map((value) => value.replace(/\s*\(RF\)\s*$/i, "").trim());

  const human = candidates.find(
    (value) => value && !/^rf[a-z0-9]+$/i.test(value) && value !== "Unknown"
  );

  return human || candidates.find((value) => value !== "Unknown") || "Unknown";
}

function mergeKeyForEmployee(employeeId: string | null, resolvedName: string, userid: string) {
  if (employeeId) return `emp:${employeeId}`;

  const normalizedName = normalizeNameKey(resolvedName);
  if (normalizedName) return `name:${normalizedName}`;

  return `rf:${userid}`;
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function emptyMetrics(): AreaMetrics {
  return {
    letdownPlates: 0,
    letdownPieces: 0,
    putawayPlates: 0,
    putawayPieces: 0,
    restockPlates: 0,
    restockPieces: 0,
    bulkMovePlates: 0,
    bulkMovePieces: 0,
    totalPlates: 0,
    totalPieces: 0,
    avgPcsPerPlate: 0,
  };
}

function ratio(pieces: number, plates: number) {
  return plates ? Number((pieces / plates).toFixed(0)) : 0;
}

function addMetrics(target: AreaMetrics, source: Partial<AreaMetrics>) {
  target.letdownPlates += asNum(source.letdownPlates);
  target.letdownPieces += asNum(source.letdownPieces);
  target.putawayPlates += asNum(source.putawayPlates);
  target.putawayPieces += asNum(source.putawayPieces);
  target.restockPlates += asNum(source.restockPlates);
  target.restockPieces += asNum(source.restockPieces);
  target.bulkMovePlates += asNum(source.bulkMovePlates);
  target.bulkMovePieces += asNum(source.bulkMovePieces);
  target.totalPlates += asNum(source.totalPlates);
  target.totalPieces += asNum(source.totalPieces);
  target.avgPcsPerPlate = ratio(target.totalPieces, target.totalPlates);
}

function getAreaBuckets(operator: Operator, leafAreaCodes: string[]): AreaBucket[] {
  const topLevelBuckets = asArray(operator.areaBuckets).map(asObj);
  const buckets =
    topLevelBuckets.length > 0
      ? topLevelBuckets
      : asArray(operator.userlsTracking?.areaBuckets).map(asObj);

  return buckets.filter((bucket) => {
    const areaCode = normalizeAreaCode(bucket.areaCode);
    return leafAreaCodes.includes(areaCode);
  }) as AreaBucket[];
}

function getRoleBuckets(operator: Operator, leafAreaCodes: string[]): RoleBucket[] {
  const topLevelBuckets = asArray(operator.roleBuckets).map(asObj);
  const buckets =
    topLevelBuckets.length > 0
      ? topLevelBuckets
      : asArray(operator.userlsTracking?.roleBuckets).map(asObj);

  return buckets.filter((bucket) => {
    const areaCode = normalizeAreaCode(bucket.areaCode);
    return leafAreaCodes.includes(areaCode);
  }) as RoleBucket[];
}

function buildRoleWeights(
  roleBuckets: RoleBucket[],
  metricKey: keyof Pick<
    AreaBucket,
    | "letdownPlates"
    | "putawayPlates"
    | "restockPlatesRaw"
    | "restockLikePlatesEstimated"
    | "replenishmentNoRecvPlates"
  >,
  fallbackRole: string | null
) {
  const weighted = roleBuckets
    .map((bucket) => ({
      label: String(bucket.role || "").trim(),
      weight: asNum(bucket[metricKey]),
    }))
    .filter((bucket) => bucket.label && bucket.weight > 0);

  if (weighted.length > 0) return weighted;
  if (fallbackRole) return [{ label: fallbackRole, weight: 1 }];
  return [];
}

function allocateIntegerShares(total: number, weights: Array<{ label: string; weight: number }>) {
  const integerTotal = Math.max(0, Math.round(total));
  const positive = weights.filter((item) => item.label && item.weight > 0);

  if (!integerTotal || !positive.length) {
    return new Map<string, number>();
  }

  const totalWeight = positive.reduce((sum, item) => sum + item.weight, 0);
  const allocations = positive.map((item) => {
    const exact = (integerTotal * item.weight) / totalWeight;
    const base = Math.floor(exact);
    return {
      label: item.label,
      base,
      fraction: exact - base,
      weight: item.weight,
    };
  });

  let remainder = integerTotal - allocations.reduce((sum, item) => sum + item.base, 0);

  allocations.sort((left, right) => {
    if (right.fraction !== left.fraction) return right.fraction - left.fraction;
    if (right.weight !== left.weight) return right.weight - left.weight;
    return left.label.localeCompare(right.label);
  });

  for (let index = 0; remainder > 0; index += 1, remainder -= 1) {
    allocations[index % allocations.length].base += 1;
  }

  return new Map(allocations.map((item) => [item.label, item.base] as const));
}

function loadPayloadsFromDb(start: string, end: string) {
  return listSnapshotsInRange<JsonObj>("daily_enriched", start, end);
}

async function loadPayloadsFromFiles(start: string, end: string) {
  const dirPath = path.join(process.cwd(), "..", "ingest", "derived", "daily_enriched");
  const payloads: Array<{ dateKey: string; payload: JsonObj }> = [];

  for (const dateKey of enumerateDates(start, end)) {
    try {
      const raw = await fs.readFile(path.join(dirPath, `${dateKey}.json`), "utf-8");
      payloads.push({
        dateKey,
        payload: JSON.parse(raw) as JsonObj,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  return payloads;
}

function createEmployeeRow(
  rowKey: string,
  employeeId: string | null,
  userid: string,
  name: string,
  areaLabel: string
): AreaEmployeeRow & { roleTotals: Map<string, number> } {
  return {
    rowKey,
    employeeId,
    primaryUserid: userid,
    rfUsernames: [userid],
    name,
    role: "—",
    area: areaLabel,
    ...emptyMetrics(),
    roleTotals: new Map<string, number>(),
  };
}

function createReceivingRow(
  rowKey: string,
  employeeId: string | null,
  userid: string,
  name: string
): AreaReceivingRow {
  return {
    rowKey,
    employeeId,
    primaryUserid: userid,
    rfUsernames: [userid],
    name,
    receivingPlates: 0,
    receivingPieces: 0,
  };
}

function createRoleRow(
  label: string,
  synthetic = false
): AreaRoleRow & { employeeIds: Set<string>; synthetic: boolean } {
  return {
    label,
    employeeCount: 0,
    ...emptyMetrics(),
    employeeIds: new Set<string>(),
    synthetic,
  };
}

function chooseDominantRole(roleTotals: Map<string, number>) {
  let bestLabel = "—";
  let bestValue = -1;

  for (const [label, value] of roleTotals.entries()) {
    if (value > bestValue || (value === bestValue && label.localeCompare(bestLabel) < 0)) {
      bestLabel = label;
      bestValue = value;
    }
  }

  return bestValue > 0 ? bestLabel : "—";
}

export async function buildAreaDetailRange(start: string, end: string, areaKey: string) {
  const payloads = loadPayloadsFromDb(start, end);
  const snapshots = payloads.length > 0 ? payloads : await loadPayloadsFromFiles(start, end);

  if (!snapshots.length) {
    return null;
  }

  const areaGroup =
    resolveOperationalAreaGroup(areaKey) ||
    {
      key: areaKey,
      label: formatOperationalAreaLabel(areaKey),
      leafAreaCodes: [areaKey],
      aliases: [areaKey],
    };

  const assignedEmployees = new Map<
    string,
    AreaEmployeeRow & { roleTotals: Map<string, number> }
  >();
  const receivingEmployees = new Map<string, AreaReceivingRow>();
  const outsideHelpContributors = new Map<
    string,
    AreaEmployeeRow & { roleTotals: Map<string, number> }
  >();
  const roles = new Map<string, AreaRoleRow & { employeeIds: Set<string> }>();
  const totals = emptyMetrics();
  const areaLabel = areaGroup.label;
  const nativeRoleLabels = new Set(operationalAreaGroupNativeRoleLabels(areaGroup.key));

  for (const snapshot of snapshots) {
    const operators = asArray(asObj(snapshot.payload).operators);

    for (const item of operators) {
      const op = asObj(item) as Operator;
      const userid = asString(op.userid).trim();
      if (!userid) continue;

      const employeeId = asString(op.resolvedEmployeeId).trim() || null;
      const name = cleanDisplayName(op);
      const rowKey = mergeKeyForEmployee(employeeId, name, userid);
      const areaBuckets = getAreaBuckets(op, areaGroup.leafAreaCodes);
      const roleBuckets = getRoleBuckets(op, areaGroup.leafAreaCodes);
      const assignedAreaKey = resolveOperationalAreaGroup(
        op.effectiveAssignedArea || op.assignedArea || op.rawAssignedArea
      )?.key;
      const isAssignedToGroup = assignedAreaKey === areaGroup.key;
      const observedFallbackRole =
        asString(op.userlsTracking?.observedRole || op.userlsTracking?.primaryReplenishmentRole)
          .trim() || null;
      const assignedExisting = isAssignedToGroup
        ? assignedEmployees.get(rowKey) || createEmployeeRow(rowKey, employeeId, userid, name, areaLabel)
        : null;
      const outsideHelpExisting = isAssignedToGroup
        ? null
        : outsideHelpContributors.get(rowKey) ||
          createEmployeeRow(rowKey, employeeId, userid, name, areaLabel);

      const areaTotals = emptyMetrics();
      const receivingTotals = {
        receivingPlates: 0,
        receivingPieces: 0,
      };

      for (const bucket of areaBuckets) {
        const bucketLetdownPlates = asNum(bucket.letdownPlates);
        const bucketLetdownPieces = asNum(bucket.letdownPieces);
        const bucketPutawayPlates = asNum(bucket.putawayPlates);
        const bucketPutawayPieces = asNum(bucket.putawayPieces);
        const bucketRestockPlates = asNum(bucket.restockPlatesRaw);
        const bucketRestockPieces = asNum(bucket.restockPiecesRaw);
        const bucketBulkMovePlates = asNum(bucket.restockLikePlatesEstimated);
        const bucketBulkMovePieces = asNum(bucket.restockLikePiecesEstimated);
        const bucketTotalPlates =
          asNum(bucket.replenishmentNoRecvPlates) ||
          bucketLetdownPlates + bucketPutawayPlates + bucketBulkMovePlates;
        const bucketTotalPieces =
          asNum(bucket.replenishmentNoRecvPieces) ||
          bucketLetdownPieces + bucketPutawayPieces + bucketBulkMovePieces;
        const bucketReceivingPlates = asNum(bucket.receivingPlates);
        const bucketReceivingPieces = asNum(bucket.receivingPieces);

        areaTotals.letdownPlates += bucketLetdownPlates;
        areaTotals.letdownPieces += bucketLetdownPieces;
        areaTotals.putawayPlates += bucketPutawayPlates;
        areaTotals.putawayPieces += bucketPutawayPieces;
        areaTotals.restockPlates += bucketRestockPlates;
        areaTotals.restockPieces += bucketRestockPieces;
        areaTotals.bulkMovePlates += bucketBulkMovePlates;
        areaTotals.bulkMovePieces += bucketBulkMovePieces;
        areaTotals.totalPlates += bucketTotalPlates;
        areaTotals.totalPieces += bucketTotalPieces;
        receivingTotals.receivingPlates += bucketReceivingPlates;
        receivingTotals.receivingPieces += bucketReceivingPieces;

        const metricAllocations = [
          { label: "letdownPlates", total: bucketLetdownPlates, metricKey: "letdownPlates" as const },
          { label: "letdownPieces", total: bucketLetdownPieces, metricKey: "letdownPieces" as const },
          { label: "putawayPlates", total: bucketPutawayPlates, metricKey: "putawayPlates" as const },
          { label: "putawayPieces", total: bucketPutawayPieces, metricKey: "putawayPieces" as const },
          { label: "restockPlates", total: bucketRestockPlates, metricKey: "restockPlatesRaw" as const },
          { label: "restockPieces", total: bucketRestockPieces, metricKey: "restockPiecesRaw" as const },
          {
            label: "bulkMovePlates",
            total: bucketBulkMovePlates,
            metricKey: "restockLikePlatesEstimated" as const,
          },
          {
            label: "bulkMovePieces",
            total: bucketBulkMovePieces,
            metricKey: "restockLikePiecesEstimated" as const,
          },
          { label: "totalPlates", total: bucketTotalPlates, metricKey: "replenishmentNoRecvPlates" as const },
          { label: "totalPieces", total: bucketTotalPieces, metricKey: "replenishmentNoRecvPieces" as const },
        ] as const;

        if (isAssignedToGroup && assignedExisting) {
          const nativeRoleBuckets = roleBuckets.filter((bucket) =>
            nativeRoleLabels.has(String(bucket.role || "").trim())
          );
          const nativeFallbackRole =
            observedFallbackRole && nativeRoleLabels.has(observedFallbackRole)
              ? observedFallbackRole
              : null;
          const roleWeights = buildRoleWeights(
            nativeRoleBuckets,
            "replenishmentNoRecvPlates",
            nativeFallbackRole
          );
          const roleAllocations = allocateIntegerShares(bucketTotalPlates, roleWeights);

          for (const allocation of metricAllocations) {
            const metricSplit = allocateIntegerShares(allocation.total, roleWeights);

            for (const [label, value] of metricSplit.entries()) {
              if (!nativeRoleLabels.has(label)) continue;
              const roleRow = roles.get(label) || createRoleRow(label);
              if (allocation.label === "letdownPlates") roleRow.letdownPlates += value;
              if (allocation.label === "letdownPieces") roleRow.letdownPieces += value;
              if (allocation.label === "putawayPlates") roleRow.putawayPlates += value;
              if (allocation.label === "putawayPieces") roleRow.putawayPieces += value;
              if (allocation.label === "restockPlates") roleRow.restockPlates += value;
              if (allocation.label === "restockPieces") roleRow.restockPieces += value;
              if (allocation.label === "bulkMovePlates") roleRow.bulkMovePlates += value;
              if (allocation.label === "bulkMovePieces") roleRow.bulkMovePieces += value;
              if (allocation.label === "totalPlates") roleRow.totalPlates += value;
              if (allocation.label === "totalPieces") roleRow.totalPieces += value;
              roleRow.employeeIds.add(rowKey);
              roleRow.avgPcsPerPlate = ratio(roleRow.totalPieces, roleRow.totalPlates);
              roles.set(label, roleRow);
            }
          }

          if (roleWeights.length > 0) {
            for (const [label, value] of roleAllocations.entries()) {
              if (!nativeRoleLabels.has(label)) continue;
              assignedExisting.roleTotals.set(
                label,
                (assignedExisting.roleTotals.get(label) || 0) + value
              );
            }
          }
        }
      }

      if (assignedExisting) {
        if (areaTotals.totalPlates > 0 || areaTotals.totalPieces > 0) {
          assignedExisting.rfUsernames = uniqueSorted([...assignedExisting.rfUsernames, userid]);
          addMetrics(assignedExisting, areaTotals);
          assignedExisting.area = areaLabel;
          assignedEmployees.set(rowKey, assignedExisting);
        }
      } else if (areaTotals.totalPlates > 0 || areaTotals.totalPieces > 0) {
        const outsideHelpExistingRow = outsideHelpExisting || createEmployeeRow(rowKey, employeeId, userid, name, areaLabel);
        outsideHelpExistingRow.rfUsernames = uniqueSorted([...outsideHelpExistingRow.rfUsernames, userid]);
        addMetrics(outsideHelpExistingRow, areaTotals);
        outsideHelpExistingRow.area = areaLabel;
        outsideHelpContributors.set(rowKey, outsideHelpExistingRow);

        const outsideHelp = roles.get("Outside Help") || createRoleRow("Outside Help", true);
        addMetrics(outsideHelp, areaTotals);
        outsideHelp.employeeIds.add(rowKey);
        outsideHelp.avgPcsPerPlate = ratio(outsideHelp.totalPieces, outsideHelp.totalPlates);
        roles.set("Outside Help", outsideHelp);
      }

      if (receivingTotals.receivingPlates > 0 || receivingTotals.receivingPieces > 0) {
        const receivingExisting =
          receivingEmployees.get(rowKey) || createReceivingRow(rowKey, employeeId, userid, name);
        receivingExisting.rfUsernames = uniqueSorted([...receivingExisting.rfUsernames, userid]);
        receivingExisting.receivingPlates += receivingTotals.receivingPlates;
        receivingExisting.receivingPieces += receivingTotals.receivingPieces;
        receivingEmployees.set(rowKey, receivingExisting);
      }

      addMetrics(totals, areaTotals);
    }
  }

  const assignedEmployeeRows = [...assignedEmployees.values()]
    .map((row) => ({
      rowKey: row.rowKey,
      employeeId: row.employeeId,
      primaryUserid: row.primaryUserid,
      rfUsernames: row.rfUsernames,
      name: row.name,
      role: chooseDominantRole(row.roleTotals),
      area: row.area,
      letdownPlates: row.letdownPlates,
      letdownPieces: row.letdownPieces,
      putawayPlates: row.putawayPlates,
      putawayPieces: row.putawayPieces,
      restockPlates: row.restockPlates,
      restockPieces: row.restockPieces,
      bulkMovePlates: row.bulkMovePlates,
      bulkMovePieces: row.bulkMovePieces,
      totalPlates: row.totalPlates,
      totalPieces: row.totalPieces,
      avgPcsPerPlate: ratio(row.totalPieces, row.totalPlates),
    }))
    .sort((a, b) => {
      const diff = b.totalPieces - a.totalPieces;
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    });

  const receivingRows = [...receivingEmployees.values()]
    .filter((row) => row.receivingPlates > 0 || row.receivingPieces > 0)
    .sort((a, b) => {
      const diff = b.receivingPieces - a.receivingPieces;
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    });

  const roleRows = [...roles.values()]
    .map((row) => ({
      label: row.label,
      employeeCount: row.employeeIds.size,
      letdownPlates: row.letdownPlates,
      letdownPieces: row.letdownPieces,
      putawayPlates: row.putawayPlates,
      putawayPieces: row.putawayPieces,
      restockPlates: row.restockPlates,
      restockPieces: row.restockPieces,
      bulkMovePlates: row.bulkMovePlates,
      bulkMovePieces: row.bulkMovePieces,
      totalPlates: row.totalPlates,
      totalPieces: row.totalPieces,
      avgPcsPerPlate: ratio(row.totalPieces, row.totalPlates),
      contributors:
        row.label === "Outside Help"
          ? [...outsideHelpContributors.values()]
              .map((contributor) => ({
                rowKey: contributor.rowKey,
                employeeId: contributor.employeeId,
                primaryUserid: contributor.primaryUserid,
                rfUsernames: contributor.rfUsernames,
                name: contributor.name,
                role: contributor.role,
                area: contributor.area,
                letdownPlates: contributor.letdownPlates,
                letdownPieces: contributor.letdownPieces,
                putawayPlates: contributor.putawayPlates,
                putawayPieces: contributor.putawayPieces,
                restockPlates: contributor.restockPlates,
                restockPieces: contributor.restockPieces,
                bulkMovePlates: contributor.bulkMovePlates,
                bulkMovePieces: contributor.bulkMovePieces,
                totalPlates: contributor.totalPlates,
                totalPieces: contributor.totalPieces,
                avgPcsPerPlate: ratio(contributor.totalPieces, contributor.totalPlates),
              }))
              .sort((a, b) => {
                const diff = b.totalPieces - a.totalPieces;
                if (diff !== 0) return diff;
                return a.name.localeCompare(b.name);
              })
          : undefined,
    }))
    .sort((a, b) => {
      if (a.label === "Outside Help" && b.label !== "Outside Help") return 1;
      if (b.label === "Outside Help" && a.label !== "Outside Help") return -1;
      const diff = b.totalPieces - a.totalPieces;
      if (diff !== 0) return diff;
      return a.label.localeCompare(b.label);
    });

  totals.avgPcsPerPlate = ratio(totals.totalPieces, totals.totalPlates);

  return {
    areaKey,
    areaLabel,
    rangeStart: start,
    rangeEnd: end,
    assignedEmployeeCount: assignedEmployeeRows.length,
    receivingCount: receivingRows.length,
    roleCount: roleRows.length,
    totals,
    assignedEmployees: assignedEmployeeRows,
    receivingEmployees: receivingRows,
    roles: roleRows,
  } satisfies AreaDetailPayload;
}
