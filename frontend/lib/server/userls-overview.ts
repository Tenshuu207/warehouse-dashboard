import { promises as fs } from "fs";
import path from "path";
import { getSnapshot } from "@/lib/server/db";
import {
  buildUserlsObservedAssignments,
  type UserlsObservedAssignment,
  type UserlsParsedPayloadLike,
} from "@/lib/server/userls-role-inference";

type JsonObj = Record<string, unknown>;

type UserlsAreaBucket = {
  areaCode?: string | null;
  letdownPlates?: number;
  letdownPieces?: number;
  putawayPlates?: number;
  putawayPieces?: number;
  restockPlatesRaw?: number;
  restockPiecesRaw?: number;
  moveFromPlates?: number;
  moveFromPieces?: number;
  moveToPlates?: number;
  moveToPieces?: number;
  restockLikePlatesEstimated?: number;
  restockLikePiecesEstimated?: number;
  replenishmentNoRecvPlates?: number;
  replenishmentNoRecvPieces?: number;
  receivingPlates?: number;
  receivingPieces?: number;
  nonPickAllPlates?: number;
  nonPickAllPieces?: number;
};

type UserlsRoleBucket = UserlsAreaBucket & {
  role?: string | null;
};

type UserlsUser = {
  userid?: string | null;
  name?: string | null;
  pickPlates?: number;
  pickPieces?: number;
  receivingPlates?: number;
  receivingPieces?: number;
  letdownPlates?: number;
  letdownPieces?: number;
  putawayPlates?: number;
  putawayPieces?: number;
  restockPlatesRaw?: number;
  restockPiecesRaw?: number;
  moveFromPlates?: number;
  moveFromPieces?: number;
  moveToPlates?: number;
  moveToPieces?: number;
  restockLikePlatesEstimated?: number;
  restockLikePiecesEstimated?: number;
  replenishmentNoRecvPlates?: number;
  replenishmentNoRecvPieces?: number;
  primaryReplenishmentAreaCode?: string | null;
  primaryReplenishmentShare?: number | null;
  primaryActivityAreaCode?: string | null;
  primaryActivityShare?: number | null;
  primaryReplenishmentRole?: string | null;
  primaryReplenishmentRoleShare?: number | null;
  areaBuckets?: UserlsAreaBucket[];
  roleBuckets?: UserlsRoleBucket[];
};

type UserlsDaily = {
  reportDate?: string;
  sourceFile?: string;
  summary?: JsonObj;
  users?: UserlsUser[];
};

type UserlsParsed = UserlsParsedPayloadLike;

type OperatorAgg = {
  userid: string;
  name: string;
  letdownPlates: number;
  letdownPieces: number;
  putawayPlates: number;
  putawayPieces: number;
  restockPlates: number;
  restockPieces: number;
  restockLikePlates: number;
  restockLikePieces: number;
  moveFromPlates: number;
  moveFromPieces: number;
  moveToPlates: number;
  moveToPieces: number;
  receivingPlates: number;
  receivingPieces: number;
  totalPlates: number;
  totalPieces: number;
  totalPlatesNoRecv: number;
  totalPiecesNoRecv: number;
  rawDominantArea: string | null;
  effectivePerformanceArea: string | null;
  primaryReplenishmentAreaCode: string | null;
  primaryReplenishmentShare: number | null;
  primaryActivityAreaCode: string | null;
  primaryActivityShare: number | null;
  primaryReplenishmentRole: string | null;
  primaryReplenishmentRoleShare: number | null;
  observedArea: string | null;
  observedAreaConfidence: number | null;
  observedRole: string | null;
  observedRoleConfidence: number | null;
  mixedWorkFlag: boolean;
  roleInference: UserlsObservedAssignment | null;
  sourceDates: Set<string>;
  areaBuckets: Map<string, UserlsAreaBucket>;
  roleBuckets: Map<string, UserlsRoleBucket>;
};

function userlsDailyDir() {
  return path.join(process.cwd(), "..", "ingest", "derived", "userls_daily");
}

function parsedDir() {
  return path.join(process.cwd(), "..", "ingest", "parsed");
}

function asNumber(value: unknown): number {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function ratio(pieces: number, plates: number): number {
  return plates ? Number((pieces / plates).toFixed(2)) : 0;
}

function isDateLike(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function addDaysIso(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function isUserlsDateLike(value: string): boolean {
  return isDateLike(value);
}

async function readUserlsDaily(date: string): Promise<UserlsDaily | null> {
  try {
    const snapshot = getSnapshot<UserlsDaily>("userls_daily", date);
    if (snapshot) return snapshot;
  } catch {
    // Fall back to the UserLS-derived JSON file if sqlite is unavailable.
  }

  const filePath = path.join(userlsDailyDir(), `${date}.json`);
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8")) as UserlsDaily;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function readUserlsParsed(date: string): Promise<UserlsParsed | null> {
  try {
    const snapshot = getSnapshot<UserlsParsed>("rf2_userls_parsed", date);
    if (snapshot) return snapshot;
  } catch {
    // Fall back to the canonical parsed JSON file if sqlite is unavailable.
  }

  const filePath = path.join(parsedDir(), `rf2_userls_${date}.json`);
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8")) as UserlsParsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function addToBucket<T extends UserlsAreaBucket | UserlsRoleBucket>(
  map: Map<string, T>,
  key: string,
  bucket: T
) {
  const current = map.get(key) || ({ ...bucket } as T);

  current.letdownPlates = asNumber(current.letdownPlates) + asNumber(bucket.letdownPlates);
  current.letdownPieces = asNumber(current.letdownPieces) + asNumber(bucket.letdownPieces);
  current.putawayPlates = asNumber(current.putawayPlates) + asNumber(bucket.putawayPlates);
  current.putawayPieces = asNumber(current.putawayPieces) + asNumber(bucket.putawayPieces);
  current.restockPlatesRaw =
    asNumber(current.restockPlatesRaw) + asNumber(bucket.restockPlatesRaw);
  current.restockPiecesRaw =
    asNumber(current.restockPiecesRaw) + asNumber(bucket.restockPiecesRaw);
  current.moveFromPlates = asNumber(current.moveFromPlates) + asNumber(bucket.moveFromPlates);
  current.moveFromPieces = asNumber(current.moveFromPieces) + asNumber(bucket.moveFromPieces);
  current.moveToPlates = asNumber(current.moveToPlates) + asNumber(bucket.moveToPlates);
  current.moveToPieces = asNumber(current.moveToPieces) + asNumber(bucket.moveToPieces);
  current.restockLikePlatesEstimated =
    asNumber(current.restockLikePlatesEstimated) + asNumber(bucket.restockLikePlatesEstimated);
  current.restockLikePiecesEstimated =
    asNumber(current.restockLikePiecesEstimated) + asNumber(bucket.restockLikePiecesEstimated);
  current.replenishmentNoRecvPlates =
    asNumber(current.replenishmentNoRecvPlates) + asNumber(bucket.replenishmentNoRecvPlates);
  current.replenishmentNoRecvPieces =
    asNumber(current.replenishmentNoRecvPieces) + asNumber(bucket.replenishmentNoRecvPieces);
  current.receivingPlates = asNumber(current.receivingPlates) + asNumber(bucket.receivingPlates);
  current.receivingPieces = asNumber(current.receivingPieces) + asNumber(bucket.receivingPieces);
  current.nonPickAllPlates =
    asNumber(current.nonPickAllPlates) + asNumber(bucket.nonPickAllPlates);
  current.nonPickAllPieces =
    asNumber(current.nonPickAllPieces) + asNumber(bucket.nonPickAllPieces);

  map.set(key, current);
}

function chooseLargestBucket<T extends UserlsAreaBucket | UserlsRoleBucket>(
  buckets: Map<string, T>,
  valueKey: keyof T
): { key: string | null; share: number | null } {
  const rows = [...buckets.entries()].filter(([, bucket]) => asNumber(bucket[valueKey]) > 0);
  if (!rows.length) return { key: null, share: null };

  rows.sort((a, b) => asNumber(b[1][valueKey]) - asNumber(a[1][valueKey]));
  const total = rows.reduce((sum, [, bucket]) => sum + asNumber(bucket[valueKey]), 0);
  return {
    key: rows[0][0],
    share: total ? Number((asNumber(rows[0][1][valueKey]) / total).toFixed(4)) : null,
  };
}

function getOperatorAgg(map: Map<string, OperatorAgg>, userid: string): OperatorAgg {
  const existing = map.get(userid);
  if (existing) return existing;

  const created: OperatorAgg = {
    userid,
    name: userid,
    letdownPlates: 0,
    letdownPieces: 0,
    putawayPlates: 0,
    putawayPieces: 0,
    restockPlates: 0,
    restockPieces: 0,
    restockLikePlates: 0,
    restockLikePieces: 0,
    moveFromPlates: 0,
    moveFromPieces: 0,
    moveToPlates: 0,
    moveToPieces: 0,
    receivingPlates: 0,
    receivingPieces: 0,
    totalPlates: 0,
    totalPieces: 0,
    totalPlatesNoRecv: 0,
    totalPiecesNoRecv: 0,
    rawDominantArea: null,
    effectivePerformanceArea: null,
    primaryReplenishmentAreaCode: null,
    primaryReplenishmentShare: null,
    primaryActivityAreaCode: null,
    primaryActivityShare: null,
    primaryReplenishmentRole: null,
    primaryReplenishmentRoleShare: null,
    observedArea: null,
    observedAreaConfidence: null,
    observedRole: null,
    observedRoleConfidence: null,
    mixedWorkFlag: false,
    roleInference: null,
    sourceDates: new Set<string>(),
    areaBuckets: new Map(),
    roleBuckets: new Map(),
  };

  map.set(userid, created);
  return created;
}

export async function buildUserlsOverviewWeek(weekStart: string) {
  const weekEnd = addDaysIso(weekStart, 6);
  const dailyPayloads: Array<{ date: string; payload: UserlsDaily }> = [];
  const parsedPayloads: Array<{ date: string; payload: UserlsParsed }> = [];

  for (let offset = 0; offset < 7; offset += 1) {
    const date = addDaysIso(weekStart, offset);
    const payload = await readUserlsDaily(date);
    if (payload) {
      dailyPayloads.push({ date, payload });
    }

    const parsed = await readUserlsParsed(date);
    if (parsed) {
      parsedPayloads.push({ date, payload: parsed });
    }
  }

  if (!dailyPayloads.length) return null;

  const summary = {
    totalPlates: 0,
    totalPieces: 0,
    receivingPlates: 0,
    receivingPieces: 0,
    totalPlatesNoRecv: 0,
    totalPiecesNoRecv: 0,
    avgPiecesPerPlate: 0,
    avgPiecesPerPlateNoRecv: 0,
  };
  const operatorsByUser = new Map<string, OperatorAgg>();
  const observedAssignments = buildUserlsObservedAssignments(parsedPayloads);

  for (const { date, payload } of dailyPayloads) {
    const users = Array.isArray(payload.users) ? payload.users : [];

    for (const user of users) {
      const userid = asString(user.userid).trim();
      if (!userid) continue;

      const agg = getOperatorAgg(operatorsByUser, userid);
      agg.name = asString(user.name).trim() || agg.name;
      agg.sourceDates.add(date);

      const letdownPlates = asNumber(user.letdownPlates);
      const letdownPieces = asNumber(user.letdownPieces);
      const putawayPlates = asNumber(user.putawayPlates);
      const putawayPieces = asNumber(user.putawayPieces);
      const restockPlates = asNumber(user.restockPlatesRaw);
      const restockPieces = asNumber(user.restockPiecesRaw);
      const restockLikePlates = asNumber(user.restockLikePlatesEstimated);
      const restockLikePieces = asNumber(user.restockLikePiecesEstimated);
      const moveFromPlates = asNumber(user.moveFromPlates);
      const moveFromPieces = asNumber(user.moveFromPieces);
      const moveToPlates = asNumber(user.moveToPlates);
      const moveToPieces = asNumber(user.moveToPieces);
      const receivingPlates = asNumber(user.receivingPlates);
      const receivingPieces = asNumber(user.receivingPieces);
      const totalPlatesNoRecv = letdownPlates + putawayPlates + restockLikePlates;
      const totalPiecesNoRecv = letdownPieces + putawayPieces + restockLikePieces;

      agg.letdownPlates += letdownPlates;
      agg.letdownPieces += letdownPieces;
      agg.putawayPlates += putawayPlates;
      agg.putawayPieces += putawayPieces;
      agg.restockPlates += restockPlates;
      agg.restockPieces += restockPieces;
      agg.restockLikePlates += restockLikePlates;
      agg.restockLikePieces += restockLikePieces;
      agg.moveFromPlates += moveFromPlates;
      agg.moveFromPieces += moveFromPieces;
      agg.moveToPlates += moveToPlates;
      agg.moveToPieces += moveToPieces;
      agg.receivingPlates += receivingPlates;
      agg.receivingPieces += receivingPieces;
      agg.totalPlatesNoRecv += totalPlatesNoRecv;
      agg.totalPiecesNoRecv += totalPiecesNoRecv;
      agg.totalPlates += totalPlatesNoRecv + receivingPlates;
      agg.totalPieces += totalPiecesNoRecv + receivingPieces;

      for (const bucket of user.areaBuckets || []) {
        const key = asString(bucket.areaCode).trim() || "Other";
        addToBucket(agg.areaBuckets, key, { ...bucket, areaCode: key });
      }

      for (const bucket of user.roleBuckets || []) {
        const key = asString(bucket.role).trim() || "Unclassified";
        addToBucket(agg.roleBuckets, key, { ...bucket, role: key });
      }
    }
  }

  const operators = [...operatorsByUser.values()]
    .filter((agg) => agg.totalPlatesNoRecv > 0 || agg.receivingPlates > 0)
    .map((agg) => {
      const primaryArea = chooseLargestBucket(agg.areaBuckets, "replenishmentNoRecvPlates");
      const primaryActivityArea = chooseLargestBucket(agg.areaBuckets, "nonPickAllPlates");
      const primaryRole = chooseLargestBucket(agg.roleBuckets, "replenishmentNoRecvPlates");
      const areaBuckets = [...agg.areaBuckets.values()];
      const roleBuckets = [...agg.roleBuckets.values()];
      const observed = observedAssignments.get(agg.userid) || null;

      const effectivePerformanceArea = primaryArea.key || primaryActivityArea.key;
      const observedArea = observed?.observedArea || null;
      const observedRole = observed?.observedRole || null;

      summary.totalPlates += agg.totalPlates;
      summary.totalPieces += agg.totalPieces;
      summary.receivingPlates += agg.receivingPlates;
      summary.receivingPieces += agg.receivingPieces;
      summary.totalPlatesNoRecv += agg.totalPlatesNoRecv;
      summary.totalPiecesNoRecv += agg.totalPiecesNoRecv;

      return {
        userid: agg.userid,
        name: agg.name,
        assignedRole: null,
        assignedArea: null,
        rawAssignedRole: null,
        rawAssignedArea: null,
        effectiveAssignedRole: null,
        effectiveAssignedArea: null,
        rawDominantArea: observedArea || effectivePerformanceArea,
        effectivePerformanceArea: observedArea || effectivePerformanceArea,
        observedArea,
        observedAreaConfidence: observed?.observedAreaConfidence ?? null,
        observedRole,
        observedRoleConfidence: observed?.observedRoleConfidence ?? null,
        mixedWorkFlag: observed?.mixedWorkFlag ?? false,
        roleInference: observed,
        letdownPlates: agg.letdownPlates,
        letdownPieces: agg.letdownPieces,
        putawayPlates: agg.putawayPlates,
        putawayPieces: agg.putawayPieces,
        restockPlates: agg.restockLikePlates,
        restockPieces: agg.restockLikePieces,
        restockPlatesRaw: agg.restockPlates,
        restockPiecesRaw: agg.restockPieces,
        restockLikePlatesEstimated: agg.restockLikePlates,
        restockLikePiecesEstimated: agg.restockLikePieces,
        moveFromPlates: agg.moveFromPlates,
        moveFromPieces: agg.moveFromPieces,
        moveToPlates: agg.moveToPlates,
        moveToPieces: agg.moveToPieces,
        receivingPlates: agg.receivingPlates,
        receivingPieces: agg.receivingPieces,
        totalPlates: agg.totalPlates,
        totalPieces: agg.totalPieces,
        totalPlatesNoRecv: agg.totalPlatesNoRecv,
        totalPiecesNoRecv: agg.totalPiecesNoRecv,
        avgPiecesPerPlate: ratio(agg.totalPieces, agg.totalPlates),
        avgPiecesPerPlateNoRecv: ratio(agg.totalPiecesNoRecv, agg.totalPlatesNoRecv),
        replenishmentPlates: agg.totalPlatesNoRecv,
        replenishmentPieces: agg.totalPiecesNoRecv,
        replenishmentPcsPerPlate: ratio(agg.totalPiecesNoRecv, agg.totalPlatesNoRecv),
        sourceDates: [...agg.sourceDates].sort(),
        areaBuckets,
        roleBuckets,
        userlsTracking: {
          present: true,
          receivingPlates: agg.receivingPlates,
          receivingPieces: agg.receivingPieces,
          letdownPlates: agg.letdownPlates,
          letdownPieces: agg.letdownPieces,
          putawayPlates: agg.putawayPlates,
          putawayPieces: agg.putawayPieces,
          restockPlatesRaw: agg.restockPlates,
          restockPiecesRaw: agg.restockPieces,
          restockLikePlatesEstimated: agg.restockLikePlates,
          restockLikePiecesEstimated: agg.restockLikePieces,
          moveFromPlates: agg.moveFromPlates,
          moveFromPieces: agg.moveFromPieces,
          moveToPlates: agg.moveToPlates,
          moveToPieces: agg.moveToPieces,
          replenishmentNoRecvPlates: agg.totalPlatesNoRecv,
          replenishmentNoRecvPieces: agg.totalPiecesNoRecv,
          primaryReplenishmentAreaCode: primaryArea.key,
          primaryReplenishmentShare: primaryArea.share,
          primaryActivityAreaCode: primaryActivityArea.key,
          primaryActivityShare: primaryActivityArea.share,
          primaryReplenishmentRole: observedRole || primaryRole.key,
          primaryReplenishmentRoleShare:
            observed?.observedRoleConfidence ?? primaryRole.share,
          observedArea,
          observedAreaConfidence: observed?.observedAreaConfidence ?? null,
          observedRole,
          observedRoleConfidence: observed?.observedRoleConfidence ?? null,
          mixedWorkFlag: observed?.mixedWorkFlag ?? false,
          roleBreakdown: observed?.roleBreakdown || [],
          handledWorkRoleBreakdown: observed?.handledWorkRoleBreakdown || [],
          areaBreakdown: observed?.areaBreakdown || [],
          receivingInference: observed?.receivingInference || null,
          areaBuckets,
          roleBuckets,
        },
      };
    })
    .sort((a, b) => b.totalPiecesNoRecv - a.totalPiecesNoRecv);

  summary.avgPiecesPerPlate = ratio(summary.totalPieces, summary.totalPlates);
  summary.avgPiecesPerPlateNoRecv = ratio(
    summary.totalPiecesNoRecv,
    summary.totalPlatesNoRecv
  );

  const sourceDates = dailyPayloads.map((row) => row.date);

  return {
    weekStart,
    weekEnd,
    requestedWeekStart: weekStart,
    requestedWeekEnd: weekEnd,
    resolvedWeekStart: sourceDates[0],
    resolvedWeekEnd: sourceDates[sourceDates.length - 1],
    sourceDates,
    summary,
    operators,
    assignedAreas: [],
    observedAreas: [],
    receiving: operators
      .filter((op) => op.receivingPlates > 0 || op.receivingPieces > 0)
      .map((op) => ({
        userid: op.userid,
        name: op.name,
        plates: op.receivingPlates,
        pieces: op.receivingPieces,
      }))
      .sort((a, b) => b.pieces - a.pieces),
    auditSummary: {
      usersWithMissingAreaMix: [],
      usersWithMissingManualAssignment: [],
      unknownAreaRows: 0,
      negativeTransactions: 0,
    },
    source: "userls_daily",
  };
}
