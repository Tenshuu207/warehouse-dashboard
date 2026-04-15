import {
  addDaysIso,
  buildUserlsOverviewWeek,
} from "@/lib/server/userls-overview";

type UserlsOverviewPayload = NonNullable<
  Awaited<ReturnType<typeof buildUserlsOverviewWeek>>
>;

type JsonObj = Record<string, unknown>;

type AreaBucketLike = {
  areaCode?: string | null;
  area?: string | null;
  label?: string | null;
  name?: string | null;
  receivingPlates?: number;
  receivingPieces?: number;
  replenishmentNoRecvPlates?: number;
  replenishmentNoRecvPieces?: number;
  nonPickAllPlates?: number;
  nonPickAllPieces?: number;
  letdownPlates?: number;
  letdownPieces?: number;
  putawayPlates?: number;
  putawayPieces?: number;
  restockLikePlatesEstimated?: number;
  restockLikePiecesEstimated?: number;
  restockPlatesRaw?: number;
  restockPiecesRaw?: number;
};

type OperatorLike = {
  userid?: string;
  name?: string;
  effectivePerformanceArea?: string | null;
  rawDominantArea?: string | null;
  observedArea?: string | null;
  receivingPlates?: number;
  receivingPieces?: number;
  replenishmentPlates?: number;
  replenishmentPieces?: number;
  totalPlatesNoRecv?: number;
  totalPiecesNoRecv?: number;
  areaBuckets?: AreaBucketLike[];
  userlsTracking?: {
    areaBuckets?: AreaBucketLike[];
  };
};

type Workload = {
  plates: number;
  pieces: number;
};

export type OverviewSummaryArea = Workload & {
  area: string;
  receivingPlates: number;
  receivingPieces: number;
  replenishmentPlates: number;
  replenishmentPieces: number;
  plateShare: number;
  pieceShare: number | null;
};

export type OverviewSummaryPayload = {
  weekStart: string;
  weekEnd: string;
  requestedWeekStart: string;
  resolvedWeekStart: string;
  resolvedWeekEnd: string;
  sourceDates: string[];
  source: "userls_daily";
  totalWorkload: Workload & {
    operatorCount: number;
    avgPiecesPerPlate: number;
  };
  receivingShare: Workload & {
    plateShare: number;
    pieceShare: number | null;
  };
  replenishmentShare: Workload & {
    plateShare: number;
    pieceShare: number | null;
  };
  areaDistribution: OverviewSummaryArea[];
  trendVsPreviousWeek: {
    previousWeekStart: string;
    previousWeekEnd: string;
    previousPlates: number | null;
    previousPieces: number | null;
    plateDelta: number | null;
    pieceDelta: number | null;
    plateDeltaPct: number | null;
    pieceDeltaPct: number | null;
    direction: "up" | "down" | "flat" | "unavailable";
  };
  supportingDetail: {
    topAreas: OverviewSummaryArea[];
    includedOperatorCount: number;
    note: string;
  };
};

function asObj(value: unknown): JsonObj {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObj)
    : {};
}

function asNumber(value: unknown): number {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function ratio(pieces: number, plates: number): number {
  return plates ? Number((pieces / plates).toFixed(2)) : 0;
}

function share(value: number, total: number): number {
  return total ? Number((value / total).toFixed(4)) : 0;
}

function nullableShare(value: number, total: number): number | null {
  return total ? Number((value / total).toFixed(4)) : null;
}

function percentDelta(current: number, previous: number): number | null {
  if (!previous) return null;
  return Number(((current - previous) / previous).toFixed(4));
}

function normalizeAreaLabel(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "Extra";

  const key = raw.toLowerCase().replace(/\s+/g, "");
  if (key === "other" || key === "unknown" || key === "unclassified") return "Extra";
  if (key === "drypir" || key === "5") return "Dry PIR";
  if (key === "freezerpir" || key === "frzpir" || key === "7") return "Freezer PIR";
  if (key === "frzmix" || key === "6") return "Freezer";
  if (key === "drymix" || key === "dryflr" || key === "1") return "Dry";
  if (
    key === "clrdairy" ||
    key === "clrmeat" ||
    key === "produce" ||
    key === "2" ||
    key === "3" ||
    key === "4"
  ) {
    return "Cooler";
  }

  return raw;
}

function readOperators(payload: UserlsOverviewPayload): OperatorLike[] {
  return Array.isArray(payload.operators) ? (payload.operators as OperatorLike[]) : [];
}

function summarizeTotals(payload: UserlsOverviewPayload) {
  const summary = asObj(payload.summary);
  const operators = readOperators(payload);
  const replenishmentPlates =
    summary.totalPlatesNoRecv !== undefined
      ? asNumber(summary.totalPlatesNoRecv)
      : operators.reduce(
          (sum, op) =>
            sum + asNumber(op.replenishmentPlates ?? op.totalPlatesNoRecv),
          0
        );
  const replenishmentPieces =
    summary.totalPiecesNoRecv !== undefined
      ? asNumber(summary.totalPiecesNoRecv)
      : operators.reduce(
          (sum, op) =>
            sum + asNumber(op.replenishmentPieces ?? op.totalPiecesNoRecv),
          0
        );
  const receivingPlates =
    summary.receivingPlates !== undefined
      ? asNumber(summary.receivingPlates)
      : operators.reduce((sum, op) => sum + asNumber(op.receivingPlates), 0);
  const receivingPieces =
    summary.receivingPieces !== undefined
      ? asNumber(summary.receivingPieces)
      : operators.reduce((sum, op) => sum + asNumber(op.receivingPieces), 0);

  return {
    operatorCount: operators.length,
    receivingPlates,
    receivingPieces,
    replenishmentPlates,
    replenishmentPieces,
    totalPlates: replenishmentPlates + receivingPlates,
    totalPieces: replenishmentPieces + receivingPieces,
  };
}

function bucketReplenishmentPlates(bucket: AreaBucketLike): number {
  return (
    asNumber(bucket.replenishmentNoRecvPlates) ||
    asNumber(bucket.letdownPlates) +
      asNumber(bucket.putawayPlates) +
      (asNumber(bucket.restockLikePlatesEstimated) || asNumber(bucket.restockPlatesRaw))
  );
}

function bucketReplenishmentPieces(bucket: AreaBucketLike): number {
  return (
    asNumber(bucket.replenishmentNoRecvPieces) ||
    asNumber(bucket.letdownPieces) +
      asNumber(bucket.putawayPieces) +
      (asNumber(bucket.restockLikePiecesEstimated) || asNumber(bucket.restockPiecesRaw))
  );
}

function buildAreaDistribution(payload: UserlsOverviewPayload): OverviewSummaryArea[] {
  const grouped = new Map<string, Omit<OverviewSummaryArea, "plateShare" | "pieceShare">>();
  const operators = readOperators(payload);

  function add(area: string, repl: Workload, recv: Workload, total: Workload) {
    const key = normalizeAreaLabel(area);
    const current =
      grouped.get(key) || {
        area: key,
        plates: 0,
        pieces: 0,
        receivingPlates: 0,
        receivingPieces: 0,
        replenishmentPlates: 0,
        replenishmentPieces: 0,
      };

    current.plates += total.plates;
    current.pieces += total.pieces;
    current.receivingPlates += recv.plates;
    current.receivingPieces += recv.pieces;
    current.replenishmentPlates += repl.plates;
    current.replenishmentPieces += repl.pieces;
    grouped.set(key, current);
  }

  for (const op of operators) {
    const buckets = op.areaBuckets || op.userlsTracking?.areaBuckets || [];

    if (buckets.length) {
      for (const bucket of buckets) {
        const repl = {
          plates: bucketReplenishmentPlates(bucket),
          pieces: bucketReplenishmentPieces(bucket),
        };
        const recv = {
          plates: asNumber(bucket.receivingPlates),
          pieces: asNumber(bucket.receivingPieces),
        };
        const total = {
          plates: asNumber(bucket.nonPickAllPlates) || repl.plates + recv.plates,
          pieces: asNumber(bucket.nonPickAllPieces) || repl.pieces + recv.pieces,
        };

        if (total.plates > 0 || total.pieces > 0) {
          add(
            bucket.areaCode || bucket.area || bucket.label || bucket.name || "Extra",
            repl,
            recv,
            total
          );
        }
      }
      continue;
    }

    const repl = {
      plates: asNumber(op.replenishmentPlates ?? op.totalPlatesNoRecv),
      pieces: asNumber(op.replenishmentPieces ?? op.totalPiecesNoRecv),
    };
    const recv = {
      plates: asNumber(op.receivingPlates),
      pieces: asNumber(op.receivingPieces),
    };
    const total = {
      plates: repl.plates + recv.plates,
      pieces: repl.pieces + recv.pieces,
    };

    if (total.plates > 0 || total.pieces > 0) {
      add(
        op.effectivePerformanceArea || op.observedArea || op.rawDominantArea || "Extra",
        repl,
        recv,
        total
      );
    }
  }

  const totalPlates = [...grouped.values()].reduce((sum, row) => sum + row.plates, 0);
  const totalPieces = [...grouped.values()].reduce((sum, row) => sum + row.pieces, 0);

  return [...grouped.values()]
    .map((row) => ({
      ...row,
      plateShare: share(row.plates, totalPlates),
      pieceShare: nullableShare(row.pieces, totalPieces),
    }))
    .sort((a, b) => b.plates - a.plates || b.pieces - a.pieces || a.area.localeCompare(b.area));
}

export async function buildOverviewSummary(
  weekStart: string
): Promise<OverviewSummaryPayload | null> {
  const current = await buildUserlsOverviewWeek(weekStart);
  if (!current) return null;

  const previousWeekStart = addDaysIso(weekStart, -7);
  const previous = await buildUserlsOverviewWeek(previousWeekStart);
  const currentTotals = summarizeTotals(current);
  const previousTotals = previous ? summarizeTotals(previous) : null;
  const areaDistribution = buildAreaDistribution(current);
  const weekEnd = addDaysIso(weekStart, 6);
  const previousWeekEnd = addDaysIso(previousWeekStart, 6);
  const plateDelta =
    previousTotals === null ? null : currentTotals.totalPlates - previousTotals.totalPlates;
  const pieceDelta =
    previousTotals === null ? null : currentTotals.totalPieces - previousTotals.totalPieces;
  const direction =
    plateDelta === null
      ? "unavailable"
      : plateDelta > 0
        ? "up"
        : plateDelta < 0
          ? "down"
          : "flat";

  return {
    weekStart,
    weekEnd,
    requestedWeekStart: weekStart,
    resolvedWeekStart: asString(current.resolvedWeekStart) || weekStart,
    resolvedWeekEnd: asString(current.resolvedWeekEnd) || weekEnd,
    sourceDates: Array.isArray(current.sourceDates) ? current.sourceDates : [],
    source: "userls_daily",
    totalWorkload: {
      plates: currentTotals.totalPlates,
      pieces: currentTotals.totalPieces,
      operatorCount: currentTotals.operatorCount,
      avgPiecesPerPlate: ratio(currentTotals.totalPieces, currentTotals.totalPlates),
    },
    receivingShare: {
      plates: currentTotals.receivingPlates,
      pieces: currentTotals.receivingPieces,
      plateShare: share(currentTotals.receivingPlates, currentTotals.totalPlates),
      pieceShare: nullableShare(currentTotals.receivingPieces, currentTotals.totalPieces),
    },
    replenishmentShare: {
      plates: currentTotals.replenishmentPlates,
      pieces: currentTotals.replenishmentPieces,
      plateShare: share(currentTotals.replenishmentPlates, currentTotals.totalPlates),
      pieceShare: nullableShare(currentTotals.replenishmentPieces, currentTotals.totalPieces),
    },
    areaDistribution,
    trendVsPreviousWeek: {
      previousWeekStart,
      previousWeekEnd,
      previousPlates: previousTotals?.totalPlates ?? null,
      previousPieces: previousTotals?.totalPieces ?? null,
      plateDelta,
      pieceDelta,
      plateDeltaPct:
        previousTotals === null
          ? null
          : percentDelta(currentTotals.totalPlates, previousTotals.totalPlates),
      pieceDeltaPct:
        previousTotals === null
          ? null
          : percentDelta(currentTotals.totalPieces, previousTotals.totalPieces),
      direction,
    },
    supportingDetail: {
      topAreas: areaDistribution.slice(0, 5),
      includedOperatorCount: currentTotals.operatorCount,
      note: "Extra is the fallback for low-confidence or outside-defined work.",
    },
  };
}
