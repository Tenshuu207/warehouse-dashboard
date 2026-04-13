import { listSnapshotsInRange } from "@/lib/server/db";

type JsonObj = Record<string, unknown>;

type OperatorAgg = {
  userid: string;
  name: string;
  letdownPlates: number;
  letdownPieces: number;
  putawayPlates: number;
  putawayPieces: number;
  restockPlates: number;
  restockPieces: number;
  receivingPlates: number;
  receivingPieces: number;
  totalPlates: number;
  totalPieces: number;
  totalPlatesNoRecv: number;
  totalPiecesNoRecv: number;
  actualMinutes: number;
  standardMinutes: number;
  reviewNotes: string | null;
  reviewStatus: string | null;
  rawAssignedRole: string | null;
  rawAssignedArea: string | null;
  reviewAssignedRoleOverride: string | null;
  reviewAssignedAreaOverride: string | null;
  effectiveAssignedRole: string | null;
  effectiveAssignedArea: string | null;
  rawDominantArea: string | null;
  effectivePerformanceArea: string | null;
  excludedFromLeaderboard: boolean;
  excludeReason: string | null;
  auditOverrides: JsonObj;
  performanceOverrides: JsonObj;
  sourceDates: Set<string>;
  rawAssignedRolesSeen: Set<string>;
  rawAssignedAreasSeen: Set<string>;
  effectiveAssignedRolesSeen: Set<string>;
  effectiveAssignedAreasSeen: Set<string>;
  effectivePerformanceAreasSeen: Set<string>;
  auditFlags: Set<string>;
  daysWithReviewStatus: number;
  daysReviewed: number;
  daysWithNotes: number;
  daysExcludedFromLeaderboard: number;
  areaMix: Map<
    string,
    {
      areaCode: string;
      areaName: string;
      letdownMoves: number;
      putawayMoves: number;
      restockMoves: number;
      actualMinutes: number;
      standardMinutes: number;
      totalMoves: number;
    }
  >;
};

type ObservedAreaAgg = {
  areaCode: string;
  areaName: string;
  letdownMoves: number;
  putawayMoves: number;
  restockMoves: number;
  totalMoves: number;
  actualMinutes: number;
  standardMinutes: number;
  userIds: Set<string>;
};

function asObj(value: unknown): JsonObj {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObj)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNullableString(value: unknown): string | null {
  const next = asString(value).trim();
  return next || null;
}

function asStringArray(value: unknown): string[] {
  return asArray(value).filter((item): item is string => typeof item === "string");
}

function ratio(pieces: number, plates: number): number {
  return plates ? Number((pieces / plates).toFixed(2)) : 0;
}

export function isDateLike(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function addDaysIso(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function observedAreaKey(areaCode: string, areaName: string) {
  return `${areaCode}::${areaName}`;
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
    receivingPlates: 0,
    receivingPieces: 0,
    totalPlates: 0,
    totalPieces: 0,
    totalPlatesNoRecv: 0,
    totalPiecesNoRecv: 0,
    actualMinutes: 0,
    standardMinutes: 0,
    reviewNotes: null,
    reviewStatus: null,
    rawAssignedRole: null,
    rawAssignedArea: null,
    reviewAssignedRoleOverride: null,
    reviewAssignedAreaOverride: null,
    effectiveAssignedRole: null,
    effectiveAssignedArea: null,
    rawDominantArea: null,
    effectivePerformanceArea: null,
    excludedFromLeaderboard: false,
    excludeReason: null,
    auditOverrides: {},
    performanceOverrides: {},
    sourceDates: new Set<string>(),
    rawAssignedRolesSeen: new Set<string>(),
    rawAssignedAreasSeen: new Set<string>(),
    effectiveAssignedRolesSeen: new Set<string>(),
    effectiveAssignedAreasSeen: new Set<string>(),
    effectivePerformanceAreasSeen: new Set<string>(),
    auditFlags: new Set<string>(),
    daysWithReviewStatus: 0,
    daysReviewed: 0,
    daysWithNotes: 0,
    daysExcludedFromLeaderboard: 0,
    areaMix: new Map(),
  };

  map.set(userid, created);
  return created;
}

function getObservedAreaAgg(
  map: Map<string, ObservedAreaAgg>,
  areaCode: string,
  areaName: string
): ObservedAreaAgg {
  const key = observedAreaKey(areaCode, areaName);
  const existing = map.get(key);
  if (existing) return existing;

  const created: ObservedAreaAgg = {
    areaCode,
    areaName,
    letdownMoves: 0,
    putawayMoves: 0,
    restockMoves: 0,
    totalMoves: 0,
    actualMinutes: 0,
    standardMinutes: 0,
    userIds: new Set<string>(),
  };

  map.set(key, created);
  return created;
}

function mergeObject(into: JsonObj, value: unknown) {
  const next = asObj(value);
  for (const [key, val] of Object.entries(next)) {
    into[key] = val;
  }
}

export function buildDashboardRangeFromDailySnapshots(startDate: string, endDate: string) {
  const rows = listSnapshotsInRange<JsonObj>("daily", startDate, endDate);
  if (!rows.length) {
    return null;
  }

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
  const observedAreas = new Map<string, ObservedAreaAgg>();

  const auditSummary = {
    usersWithMissingAreaMix: new Set<string>(),
    usersWithMissingManualAssignment: new Set<string>(),
    unknownAreaRows: 0,
    negativeTransactions: 0,
  };

  for (const row of rows) {
    const payload = asObj(row.payload);
    const daySummary = asObj(payload.summary);

    summary.totalPlates += asNumber(daySummary.totalPlates);
    summary.totalPieces += asNumber(daySummary.totalPieces);
    summary.receivingPlates += asNumber(daySummary.receivingPlates);
    summary.receivingPieces += asNumber(daySummary.receivingPieces);
    summary.totalPlatesNoRecv +=
      daySummary.totalPlatesNoRecv !== undefined
        ? asNumber(daySummary.totalPlatesNoRecv)
        : asNumber(daySummary.totalPlates) - asNumber(daySummary.receivingPlates);
    summary.totalPiecesNoRecv +=
      daySummary.totalPiecesNoRecv !== undefined
        ? asNumber(daySummary.totalPiecesNoRecv)
        : asNumber(daySummary.totalPieces) - asNumber(daySummary.receivingPieces);

    for (const item of asArray(payload.operators)) {
      const op = asObj(item);
      const userid = asNullableString(op.userid);
      if (!userid) continue;

      const agg = getOperatorAgg(operatorsByUser, userid);
      agg.sourceDates.add(row.dateKey);
      agg.name = asNullableString(op.name) || agg.name;

      const letdownPlates = asNumber(op.letdownPlates);
      const letdownPieces = asNumber(op.letdownPieces);
      const putawayPlates = asNumber(op.putawayPlates);
      const putawayPieces = asNumber(op.putawayPieces);
      const restockPlates = asNumber(op.restockPlates);
      const restockPieces = asNumber(op.restockPieces);
      const receivingPlates = asNumber(op.receivingPlates);
      const receivingPieces = asNumber(op.receivingPieces);

      const totalPlates =
        op.totalPlates !== undefined
          ? asNumber(op.totalPlates)
          : letdownPlates + putawayPlates + restockPlates + receivingPlates;
      const totalPieces =
        op.totalPieces !== undefined
          ? asNumber(op.totalPieces)
          : letdownPieces + putawayPieces + restockPieces + receivingPieces;

      const totalPlatesNoRecv =
        op.totalPlatesNoRecv !== undefined
          ? asNumber(op.totalPlatesNoRecv)
          : totalPlates - receivingPlates;
      const totalPiecesNoRecv =
        op.totalPiecesNoRecv !== undefined
          ? asNumber(op.totalPiecesNoRecv)
          : totalPieces - receivingPieces;

      agg.letdownPlates += letdownPlates;
      agg.letdownPieces += letdownPieces;
      agg.putawayPlates += putawayPlates;
      agg.putawayPieces += putawayPieces;
      agg.restockPlates += restockPlates;
      agg.restockPieces += restockPieces;
      agg.receivingPlates += receivingPlates;
      agg.receivingPieces += receivingPieces;
      agg.totalPlates += totalPlates;
      agg.totalPieces += totalPieces;
      agg.totalPlatesNoRecv += totalPlatesNoRecv;
      agg.totalPiecesNoRecv += totalPiecesNoRecv;
      agg.actualMinutes += asNumber(op.actualMinutes);
      agg.standardMinutes += asNumber(op.standardMinutes);

      const reviewNotes = asNullableString(op.reviewNotes);
      const reviewStatus = asNullableString(op.reviewStatus);
      const rawAssignedRole = asNullableString(op.rawAssignedRole);
      const rawAssignedArea = asNullableString(op.rawAssignedArea);
      const reviewAssignedRoleOverride = asNullableString(op.reviewAssignedRoleOverride);
      const reviewAssignedAreaOverride = asNullableString(op.reviewAssignedAreaOverride);
      const effectiveAssignedRole =
        asNullableString(op.effectiveAssignedRole) || asNullableString(op.assignedRole);
      const effectiveAssignedArea =
        asNullableString(op.effectiveAssignedArea) || asNullableString(op.assignedArea);
      const rawDominantArea = asNullableString(op.rawDominantArea);
      const effectivePerformanceArea = asNullableString(op.effectivePerformanceArea);
      const excludeReason = asNullableString(op.excludeReason);

      if (reviewNotes) {
        agg.reviewNotes = reviewNotes;
        agg.daysWithNotes += 1;
      }

      if (reviewStatus) {
        agg.reviewStatus = reviewStatus;
        agg.daysWithReviewStatus += 1;
        if (reviewStatus === "reviewed") {
          agg.daysReviewed += 1;
        }
      }

      if (rawAssignedRole) {
        agg.rawAssignedRole = rawAssignedRole;
        agg.rawAssignedRolesSeen.add(rawAssignedRole);
      }

      if (rawAssignedArea) {
        agg.rawAssignedArea = rawAssignedArea;
        agg.rawAssignedAreasSeen.add(rawAssignedArea);
      }

      if (reviewAssignedRoleOverride) {
        agg.reviewAssignedRoleOverride = reviewAssignedRoleOverride;
      }

      if (reviewAssignedAreaOverride) {
        agg.reviewAssignedAreaOverride = reviewAssignedAreaOverride;
      }

      if (effectiveAssignedRole) {
        agg.effectiveAssignedRole = effectiveAssignedRole;
        agg.effectiveAssignedRolesSeen.add(effectiveAssignedRole);
      }

      if (effectiveAssignedArea) {
        agg.effectiveAssignedArea = effectiveAssignedArea;
        agg.effectiveAssignedAreasSeen.add(effectiveAssignedArea);
      }

      if (rawDominantArea) {
        agg.rawDominantArea = rawDominantArea;
      }

      if (effectivePerformanceArea) {
        agg.effectivePerformanceArea = effectivePerformanceArea;
        agg.effectivePerformanceAreasSeen.add(effectivePerformanceArea);
      }

      if (excludeReason) {
        agg.excludeReason = excludeReason;
      }

      if (op.excludedFromLeaderboard === true) {
        agg.excludedFromLeaderboard = true;
        agg.daysExcludedFromLeaderboard += 1;
      }

      mergeObject(agg.auditOverrides, op.auditOverrides);
      mergeObject(agg.performanceOverrides, op.performanceOverrides);

      for (const flag of asStringArray(op.auditFlags)) {
        agg.auditFlags.add(flag);
      }

      for (const mixItem of asArray(op.areaMix)) {
        const mix = asObj(mixItem);
        const areaCode = asString(mix.areaCode);
        const areaName = asString(mix.areaName);
        const mixKey = observedAreaKey(areaCode, areaName);

        const letdownMoves = asNumber(mix.letdownMoves);
        const putawayMoves = asNumber(mix.putawayMoves);
        const restockMoves = asNumber(mix.restockMoves);
        const totalMoves =
          mix.totalMoves !== undefined
            ? asNumber(mix.totalMoves)
            : letdownMoves + putawayMoves + restockMoves;

        const current =
          agg.areaMix.get(mixKey) || {
            areaCode,
            areaName,
            letdownMoves: 0,
            putawayMoves: 0,
            restockMoves: 0,
            actualMinutes: 0,
            standardMinutes: 0,
            totalMoves: 0,
          };

        current.letdownMoves += letdownMoves;
        current.putawayMoves += putawayMoves;
        current.restockMoves += restockMoves;
        current.actualMinutes += asNumber(mix.actualMinutes);
        current.standardMinutes += asNumber(mix.standardMinutes);
        current.totalMoves += totalMoves;
        agg.areaMix.set(mixKey, current);

        const observed = getObservedAreaAgg(observedAreas, areaCode, areaName);
        observed.letdownMoves += letdownMoves;
        observed.putawayMoves += putawayMoves;
        observed.restockMoves += restockMoves;
        observed.actualMinutes += asNumber(mix.actualMinutes);
        observed.standardMinutes += asNumber(mix.standardMinutes);
        observed.totalMoves += totalMoves;
        observed.userIds.add(userid);
      }
    }

    for (const areaItem of asArray(payload.observedAreas)) {
      const area = asObj(areaItem);
      const areaCode = asString(area.areaCode);
      const areaName = asString(area.areaName);
      getObservedAreaAgg(observedAreas, areaCode, areaName);
    }

    const audit = asObj(payload.auditSummary);
    for (const userid of asStringArray(audit.usersWithMissingAreaMix)) {
      auditSummary.usersWithMissingAreaMix.add(userid);
    }
    for (const userid of asStringArray(audit.usersWithMissingManualAssignment)) {
      auditSummary.usersWithMissingManualAssignment.add(userid);
    }
    auditSummary.unknownAreaRows += asNumber(audit.unknownAreaRows);
    auditSummary.negativeTransactions += asNumber(audit.negativeTransactions);
  }

  summary.avgPiecesPerPlate = ratio(summary.totalPieces, summary.totalPlates);
  summary.avgPiecesPerPlateNoRecv = ratio(summary.totalPiecesNoRecv, summary.totalPlatesNoRecv);

  const operators = [...operatorsByUser.values()]
    .map((agg) => {
      const areaMix = [...agg.areaMix.values()].sort((a, b) => {
        if (b.totalMoves !== a.totalMoves) return b.totalMoves - a.totalMoves;
        return String(a.areaName).localeCompare(String(b.areaName));
      });

      const avgPiecesPerPlate = ratio(agg.totalPieces, agg.totalPlates);
      const avgPiecesPerPlateNoRecv = ratio(agg.totalPiecesNoRecv, agg.totalPlatesNoRecv);
      const performanceVsStandard = agg.actualMinutes
        ? Number(((agg.standardMinutes / agg.actualMinutes) * 100).toFixed(2))
        : 0;

      return {
        userid: agg.userid,
        name: agg.name,
        assignedRole: agg.effectiveAssignedRole,
        assignedArea: agg.effectiveAssignedArea,
        letdownPlates: agg.letdownPlates,
        letdownPieces: agg.letdownPieces,
        putawayPlates: agg.putawayPlates,
        putawayPieces: agg.putawayPieces,
        restockPlates: agg.restockPlates,
        restockPieces: agg.restockPieces,
        receivingPlates: agg.receivingPlates,
        receivingPieces: agg.receivingPieces,
        totalPlates: agg.totalPlates,
        totalPieces: agg.totalPieces,
        avgPiecesPerPlate,
        actualMinutes: agg.actualMinutes,
        standardMinutes: agg.standardMinutes,
        performanceVsStandard,
        reviewNotes: agg.reviewNotes,
        reviewStatus: agg.reviewStatus,
        auditOverrides: agg.auditOverrides,
        performanceOverrides: agg.performanceOverrides,
        excludedFromLeaderboard: agg.excludedFromLeaderboard,
        excludeReason: agg.excludeReason,
        rawDominantArea: agg.rawDominantArea,
        effectivePerformanceArea: agg.effectivePerformanceArea,
        areaMix,
        auditFlags: [...agg.auditFlags].sort(),

        rawAssignedRole: agg.rawAssignedRole,
        rawAssignedArea: agg.rawAssignedArea,
        reviewAssignedRoleOverride: agg.reviewAssignedRoleOverride,
        reviewAssignedAreaOverride: agg.reviewAssignedAreaOverride,
        effectiveAssignedRole: agg.effectiveAssignedRole,
        effectiveAssignedArea: agg.effectiveAssignedArea,

        totalPlatesNoRecv: agg.totalPlatesNoRecv,
        totalPiecesNoRecv: agg.totalPiecesNoRecv,
        avgPiecesPerPlateNoRecv,

        sourceDates: [...agg.sourceDates].sort(),
        rawAssignedRolesSeen: [...agg.rawAssignedRolesSeen].sort(),
        rawAssignedAreasSeen: [...agg.rawAssignedAreasSeen].sort(),
        effectiveAssignedRolesSeen: [...agg.effectiveAssignedRolesSeen].sort(),
        effectiveAssignedAreasSeen: [...agg.effectiveAssignedAreasSeen].sort(),
        effectivePerformanceAreasSeen: [...agg.effectivePerformanceAreasSeen].sort(),
        daysWithReviewStatus: agg.daysWithReviewStatus,
        daysReviewed: agg.daysReviewed,
        daysWithNotes: agg.daysWithNotes,
        daysExcludedFromLeaderboard: agg.daysExcludedFromLeaderboard,
      };
    })
    .sort((a, b) => b.totalPieces - a.totalPieces);

  const assignedAreaMap = new Map<
    string,
    {
      area: string;
      plates: number;
      pieces: number;
      platesNoRecv: number;
      piecesNoRecv: number;
      userIds: Set<string>;
    }
  >();

  for (const op of operators) {
    const area = op.effectiveAssignedArea || op.assignedArea;
    if (!area) continue;

    const current =
      assignedAreaMap.get(area) || {
        area,
        plates: 0,
        pieces: 0,
        platesNoRecv: 0,
        piecesNoRecv: 0,
        userIds: new Set<string>(),
      };

    current.plates += op.totalPlates;
    current.pieces += op.totalPieces;
    current.platesNoRecv += op.totalPlatesNoRecv;
    current.piecesNoRecv += op.totalPiecesNoRecv;
    current.userIds.add(op.userid);
    assignedAreaMap.set(area, current);
  }

  const assignedAreas = [...assignedAreaMap.values()].map((area) => ({
    area: area.area,
    plates: area.plates,
    pieces: area.pieces,
    avgPiecesPerPlate: ratio(area.pieces, area.plates),
    platesNoRecv: area.platesNoRecv,
    piecesNoRecv: area.piecesNoRecv,
    avgPiecesPerPlateNoRecv: ratio(area.piecesNoRecv, area.platesNoRecv),
    userCount: area.userIds.size,
  }));

  const observedAreasOut = [...observedAreas.values()]
    .map((area) => ({
      areaCode: area.areaCode,
      areaName: area.areaName,
      letdownMoves: area.letdownMoves,
      putawayMoves: area.putawayMoves,
      restockMoves: area.restockMoves,
      totalMoves: area.totalMoves,
      actualMinutes: area.actualMinutes,
      standardMinutes: area.standardMinutes,
      userCount: area.userIds.size,
    }))
    .sort((a, b) => {
      if (b.totalMoves !== a.totalMoves) return b.totalMoves - a.totalMoves;
      return `${a.areaName}|${a.areaCode}`.localeCompare(`${b.areaName}|${b.areaCode}`);
    });

  const receiving = operators
    .filter((op) => op.receivingPlates > 0 || op.receivingPieces > 0)
    .map((op) => ({
      userid: op.userid,
      name: op.name,
      plates: op.receivingPlates,
      pieces: op.receivingPieces,
    }))
    .sort((a, b) => b.pieces - a.pieces);

  const sourceDates = rows.map((row) => row.dateKey);
  const resolvedStart = sourceDates[0];
  const resolvedEnd = sourceDates[sourceDates.length - 1];

  return {
    weekStart: startDate,
    weekEnd: endDate,
    rangeStart: startDate,
    rangeEnd: endDate,
    requestedStart: startDate,
    requestedEnd: endDate,
    resolvedStart,
    resolvedEnd,
    sourceDates,
    summary,
    operators,
    operatorFacts: [],
    assignedAreas,
    observedAreas: observedAreasOut,
    receiving,
    auditSummary: {
      usersWithMissingAreaMix: [...auditSummary.usersWithMissingAreaMix].sort(),
      usersWithMissingManualAssignment: [...auditSummary.usersWithMissingManualAssignment].sort(),
      unknownAreaRows: auditSummary.unknownAreaRows,
      negativeTransactions: auditSummary.negativeTransactions,
    },
    source: "sqlite-range",
  };
}
