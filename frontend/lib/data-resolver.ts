export type ResolvedDashboardData = {
  weeklySummary: {
    totalPlates: number;
    totalPieces: number;
    avgPiecesPerPlate: number;
    receivingPlates: number;
    receivingPieces: number;
    replenishmentPlates: number;
    replenishmentPieces: number;
    replenishmentPcsPerPlate: number;
    weekLabel: string;
  };
  operators: Array<{
    userid: string;
    name: string;
    area: string;
    assignedArea: string | null;
    assignedRole: string | null;
    rawAssignedArea: string | null;
    rawAssignedRole: string | null;
    reviewAssignedAreaOverride: string | null;
    reviewAssignedRoleOverride: string | null;
    effectiveAssignedArea: string | null;
    effectiveAssignedRole: string | null;
    reviewNotes: string | null;
    reviewStatus: string | null;
    excludedFromLeaderboard: boolean;
    excludeReason: string | null;
    rawDominantArea: string | null;
    effectivePerformanceArea: string | null;

    letdownPlates: number;
    letdownPieces: number;
    putawayPlates: number;
    putawayPieces: number;
    restockPlates: number;
    restockPieces: number;
    restockPlatesRaw?: number;
    restockPiecesRaw?: number;
    restockLikePlatesEstimated?: number;
    restockLikePiecesEstimated?: number;
    totalPlatesNoRecv?: number;
    totalPiecesNoRecv?: number;
    replenishmentNoRecvPlates?: number;
    replenishmentNoRecvPieces?: number;

    receivingPlates: number;
    receivingPieces: number;
    totalPlates: number;
    totalPieces: number;

    replenishmentPlates: number;
    replenishmentPieces: number;

    avg: number;
    replenishmentPcsPerPlate: number;
    putawayPcsPerPlate: number;
    letdownPcsPerPlate: number;
    restockPcsPerPlate: number;

    actualMinutes: number;
    standardMinutes: number;
    performanceVsStandard: number;
    sourceDates: string[];
    daysWithReviewStatus: number;
    daysReviewed: number;
    daysWithNotes: number;
    daysExcludedFromLeaderboard: number;
    rawAssignedAreasSeen: string[];
    rawAssignedRolesSeen: string[];
    effectiveAssignedAreasSeen: string[];
    effectiveAssignedRolesSeen: string[];
    effectivePerformanceAreasSeen: string[];
    areaMix: Array<{
      areaCode: string;
      areaName: string;
      letdownMoves: number;
      putawayMoves: number;
      restockMoves: number;
      actualMinutes: number;
      standardMinutes?: number;
      totalMoves?: number;
    }>;
    auditFlags: string[];
  }>;
  areas: Array<{
    area: string;
    plates: number;
    pieces: number;
    avgPiecesPerPlate?: number;
    replenishmentPlates?: number;
    replenishmentPieces?: number;
    replenishmentPcsPerPlate?: number;
    userCount?: number;
  }>;
  observedAreas: Array<{
    areaCode: string;
    areaName: string;
    letdownMoves: number;
    putawayMoves: number;
    restockMoves: number;
    totalMoves: number;
    actualMinutes: number;
    standardMinutes: number;
    userCount: number;
  }>;
  receiving: Array<{
    userid: string;
    name: string;
    plates: number;
    pieces: number;
  }>;
  auditSummary: {
    usersWithMissingAreaMix: string[];
    usersWithMissingManualAssignment: string[];
    unknownAreaRows: number;
    negativeTransactions: number;
  };
};

type JsonObj = Record<string, unknown>;

function asObj(value: unknown): JsonObj {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObj)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asStringArray(value: unknown): string[] {
  return asArray(value).filter((v): v is string => typeof v === "string");
}

function ratio(pieces: number, plates: number): number {
  return plates ? Number((pieces / plates).toFixed(2)) : 0;
}

function normalizeRaw(raw: JsonObj): ResolvedDashboardData {
  const summary = asObj(raw.summary);
  const weekStart = asString(raw.weekStart);
  const weekEnd = asString(raw.weekEnd);
  const date = asString(raw.date, "Unknown");

  const weekLabel =
    weekStart && weekEnd
      ? weekStart === weekEnd
        ? weekStart
        : `${weekStart} to ${weekEnd}`
      : date;

  const summaryReplPlates =
    summary.replenishmentPlates !== undefined
      ? asNumber(summary.replenishmentPlates)
      : summary.totalPlatesNoRecv !== undefined
        ? asNumber(summary.totalPlatesNoRecv)
        : asNumber(summary.totalPlates) - asNumber(summary.receivingPlates);

  const summaryReplPieces =
    summary.replenishmentPieces !== undefined
      ? asNumber(summary.replenishmentPieces)
      : summary.totalPiecesNoRecv !== undefined
        ? asNumber(summary.totalPiecesNoRecv)
        : asNumber(summary.totalPieces) - asNumber(summary.receivingPieces);

  return {
    weeklySummary: {
      totalPlates: asNumber(summary.totalPlates),
      totalPieces: asNumber(summary.totalPieces),
      avgPiecesPerPlate: asNumber(summary.avgPiecesPerPlate),
      receivingPlates: asNumber(summary.receivingPlates),
      receivingPieces: asNumber(summary.receivingPieces),
      replenishmentPlates: summaryReplPlates,
      replenishmentPieces: summaryReplPieces,
      replenishmentPcsPerPlate:
        summary.replenishmentPcsPerPlate !== undefined
          ? asNumber(summary.replenishmentPcsPerPlate)
          : summary.avgPiecesPerPlateNoRecv !== undefined
            ? asNumber(summary.avgPiecesPerPlateNoRecv)
            : ratio(summaryReplPieces, summaryReplPlates),
      weekLabel,
    },

    operators: asArray(raw.operators).map((item) => {
      const o = asObj(item);

      const letdownPlates = asNumber(o.letdownPlates);
      const letdownPieces = asNumber(o.letdownPieces);
      const putawayPlates = asNumber(o.putawayPlates);
      const putawayPieces = asNumber(o.putawayPieces);
      const restockPlates = asNumber(o.restockPlates);
      const restockPieces = asNumber(o.restockPieces);
      const restockPlatesRaw = asNumber(o.restockPlatesRaw);
      const restockPiecesRaw = asNumber(o.restockPiecesRaw);
      const restockLikePlatesEstimated = asNumber(o.restockLikePlatesEstimated);
      const restockLikePiecesEstimated = asNumber(o.restockLikePiecesEstimated);
      const totalPlatesNoRecv = asNumber(o.totalPlatesNoRecv);
      const totalPiecesNoRecv = asNumber(o.totalPiecesNoRecv);
      const replenishmentNoRecvPlates = asNumber(o.replenishmentNoRecvPlates);
      const replenishmentNoRecvPieces = asNumber(o.replenishmentNoRecvPieces);

      const replenishmentPlates =
        o.replenishmentPlates !== undefined
          ? asNumber(o.replenishmentPlates)
          : o.totalPlatesNoRecv !== undefined
            ? asNumber(o.totalPlatesNoRecv)
            : putawayPlates + letdownPlates + restockPlates;

      const replenishmentPieces =
        o.replenishmentPieces !== undefined
          ? asNumber(o.replenishmentPieces)
          : o.totalPiecesNoRecv !== undefined
            ? asNumber(o.totalPiecesNoRecv)
            : putawayPieces + letdownPieces + restockPieces;

      return {
        userid: asString(o.userid),
        name: asString(o.name, asString(o.userid)),
        area:
          asNullableString(o.effectiveAssignedArea) ??
          asNullableString(o.assignedArea) ??
          "Unassigned",
        assignedArea: asNullableString(o.assignedArea),
        assignedRole: asNullableString(o.assignedRole),
        rawAssignedArea: asNullableString(o.rawAssignedArea),
        rawAssignedRole: asNullableString(o.rawAssignedRole),
        reviewAssignedAreaOverride: asNullableString(o.reviewAssignedAreaOverride),
        reviewAssignedRoleOverride: asNullableString(o.reviewAssignedRoleOverride),
        effectiveAssignedArea:
          asNullableString(o.effectiveAssignedArea) ?? asNullableString(o.assignedArea),
        effectiveAssignedRole:
          asNullableString(o.effectiveAssignedRole) ?? asNullableString(o.assignedRole),
        reviewNotes: asNullableString(o.reviewNotes),
        reviewStatus: asNullableString(o.reviewStatus),
        excludedFromLeaderboard: asBoolean(o.excludedFromLeaderboard),
        excludeReason: asNullableString(o.excludeReason),
        rawDominantArea: asNullableString(o.rawDominantArea),
        effectivePerformanceArea: asNullableString(o.effectivePerformanceArea),

        letdownPlates,
        letdownPieces,
        putawayPlates,
        putawayPieces,
        restockPlates,
        restockPieces,
        restockPlatesRaw,
        restockPiecesRaw,
        restockLikePlatesEstimated,
        restockLikePiecesEstimated,
        totalPlatesNoRecv,
        totalPiecesNoRecv,
        replenishmentNoRecvPlates,
        replenishmentNoRecvPieces,

        receivingPlates: asNumber(o.receivingPlates),
        receivingPieces: asNumber(o.receivingPieces),
        totalPlates: asNumber(o.totalPlates),
        totalPieces: asNumber(o.totalPieces),

        replenishmentPlates,
        replenishmentPieces,

        avg: asNumber(o.avgPiecesPerPlate),
        replenishmentPcsPerPlate:
          o.replenishmentPcsPerPlate !== undefined
            ? asNumber(o.replenishmentPcsPerPlate)
            : o.avgPiecesPerPlateNoRecv !== undefined
              ? asNumber(o.avgPiecesPerPlateNoRecv)
              : ratio(replenishmentPieces, replenishmentPlates),
        putawayPcsPerPlate: ratio(putawayPieces, putawayPlates),
        letdownPcsPerPlate: ratio(letdownPieces, letdownPlates),
        restockPcsPerPlate: ratio(restockPieces, restockPlates),

        actualMinutes: asNumber(o.actualMinutes),
        standardMinutes: asNumber(o.standardMinutes),
        performanceVsStandard: asNumber(o.performanceVsStandard),
        sourceDates: asStringArray(o.sourceDates),
        daysWithReviewStatus: asNumber(o.daysWithReviewStatus),
        daysReviewed: asNumber(o.daysReviewed),
        daysWithNotes: asNumber(o.daysWithNotes),
        daysExcludedFromLeaderboard: asNumber(o.daysExcludedFromLeaderboard),
        rawAssignedAreasSeen: asStringArray(o.rawAssignedAreasSeen),
        rawAssignedRolesSeen: asStringArray(o.rawAssignedRolesSeen),
        effectiveAssignedAreasSeen: asStringArray(o.effectiveAssignedAreasSeen),
        effectiveAssignedRolesSeen: asStringArray(o.effectiveAssignedRolesSeen),
        effectivePerformanceAreasSeen: asStringArray(o.effectivePerformanceAreasSeen),
        areaMix: asArray(o.areaMix).map((mixItem) => {
          const mix = asObj(mixItem);
          return {
            areaCode: asString(mix.areaCode),
            areaName: asString(mix.areaName),
            letdownMoves: asNumber(mix.letdownMoves),
            putawayMoves: asNumber(mix.putawayMoves),
            restockMoves: asNumber(mix.restockMoves),
            actualMinutes: asNumber(mix.actualMinutes),
            standardMinutes:
              mix.standardMinutes !== undefined ? asNumber(mix.standardMinutes) : undefined,
            totalMoves: mix.totalMoves !== undefined ? asNumber(mix.totalMoves) : undefined,
          };
        }),
        auditFlags: asStringArray(o.auditFlags),
      };
    }),

    areas: asArray(raw.assignedAreas).map((item) => {
      const a = asObj(item);
      const replPlates =
        a.replenishmentPlates !== undefined
          ? asNumber(a.replenishmentPlates)
          : a.platesNoRecv !== undefined
            ? asNumber(a.platesNoRecv)
            : 0;
      const replPieces =
        a.replenishmentPieces !== undefined
          ? asNumber(a.replenishmentPieces)
          : a.piecesNoRecv !== undefined
            ? asNumber(a.piecesNoRecv)
            : 0;

      return {
        area: asString(a.area),
        plates: asNumber(a.plates),
        pieces: asNumber(a.pieces),
        avgPiecesPerPlate:
          a.avgPiecesPerPlate !== undefined ? asNumber(a.avgPiecesPerPlate) : undefined,
        replenishmentPlates: replPlates,
        replenishmentPieces: replPieces,
        replenishmentPcsPerPlate:
          a.replenishmentPcsPerPlate !== undefined
            ? asNumber(a.replenishmentPcsPerPlate)
            : a.avgPiecesPerPlateNoRecv !== undefined
              ? asNumber(a.avgPiecesPerPlateNoRecv)
              : ratio(replPieces, replPlates),
        userCount: a.userCount !== undefined ? asNumber(a.userCount) : undefined,
      };
    }),

    observedAreas: asArray(raw.observedAreas).map((item) => {
      const a = asObj(item);
      return {
        areaCode: asString(a.areaCode),
        areaName: asString(a.areaName),
        letdownMoves: asNumber(a.letdownMoves),
        putawayMoves: asNumber(a.putawayMoves),
        restockMoves: asNumber(a.restockMoves),
        totalMoves: asNumber(a.totalMoves),
        actualMinutes: asNumber(a.actualMinutes),
        standardMinutes: asNumber(a.standardMinutes),
        userCount: asNumber(a.userCount),
      };
    }),

    receiving: asArray(raw.receiving).map((item) => {
      const r = asObj(item);
      const userid = asString(r.userid);
      return {
        userid,
        name: asString(r.name, userid),
        plates: asNumber(r.plates),
        pieces: asNumber(r.pieces),
      };
    }),

    auditSummary: {
      usersWithMissingAreaMix: asStringArray(asObj(raw.auditSummary).usersWithMissingAreaMix),
      usersWithMissingManualAssignment: asStringArray(
        asObj(raw.auditSummary).usersWithMissingManualAssignment
      ),
      unknownAreaRows: asNumber(asObj(raw.auditSummary).unknownAreaRows),
      negativeTransactions: asNumber(asObj(raw.auditSummary).negativeTransactions),
    },
  };
}

export async function getWeekData(selectedDate: string): Promise<ResolvedDashboardData> {
  const weeklyRes = await fetch(`/api/dashboard/weekly?weekStart=${selectedDate}`, {
    cache: "no-store",
  });

  if (weeklyRes.ok) {
    const raw = asObj(await weeklyRes.json());
    return normalizeRaw(raw);
  }

  const dailyRes = await fetch(`/api/dashboard?date=${selectedDate}`, {
    cache: "no-store",
  });

  if (!dailyRes.ok) {
    throw new Error(`Failed to load dashboard data for ${selectedDate}`);
  }

  const raw = asObj(await dailyRes.json());
  return normalizeRaw(raw);
}

export async function getOverviewWeekData(selectedDate: string): Promise<ResolvedDashboardData> {
  const res = await fetch(`/api/dashboard/overview-weekly?weekStart=${selectedDate}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Failed to load UserLS overview data for ${selectedDate}`);
  }

  return (await res.json()) as ResolvedDashboardData;
}

export async function getRangeData(
  startDate: string,
  endDate: string
): Promise<ResolvedDashboardData> {
  const res = await fetch(`/api/dashboard/range?start=${startDate}&end=${endDate}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Failed to load dashboard range data for ${startDate} to ${endDate}`);
  }

  const raw = asObj(await res.json());
  return normalizeRaw(raw);
}
