import { getDb, listSnapshotsInRange } from "@/lib/server/db";

type SegmentType = "stable" | "likely_shift" | "mixed" | "uncovered_gap" | "low_confidence";

export type SuggestedReviewSegment = {
  startDate: string;
  endDate: string;
  suggestedArea: string | null;
  suggestedRole: string | null;
  areaShare: number | null;
  roleShare: number | null;
  replenishmentPlates: number;
  segmentType: SegmentType;
  reason: string;
};

export type HistoricalRoleAlignmentRow = {
  year: number;
  userid: string;
  name: string | null;
  primaryRole: string | null;
  primaryRoleShare: number | null;
  primaryArea: string | null;
  primaryAreaShare: number | null;
  primaryActivityArea: string | null;
  yearlyReplPlates: number;
  yearlyReplPieces: number;
  yearlyReceivingPlates: number;
  yearlyReceivingPieces: number;
  yearlyPickPlates: number;
  yearlyPickPieces: number;
  activeDays: number;
  activeWeeks: number;
  roleConfidence: string;
  areaConfidence: string;
  reviewFlag: boolean;
  roleMix: unknown[];
  areaMix: unknown[];
  sourceSummary: Record<string, unknown>;
  forcedRole: string | null;
  forcedArea: string | null;
  overrideStartDate: string | null;
  overrideEndDate: string | null;
  notes: string;
  effectiveRole: string | null;
  effectiveArea: string | null;
  alignmentStatus: string;
  anomalyFlag: boolean;
  suggestedReviewSegments: SuggestedReviewSegment[];
  updatedAt: string;
};

type DbRow = {
  year: number;
  userid: string;
  name: string | null;
  primary_role: string | null;
  primary_role_share: number | null;
  primary_area: string | null;
  primary_area_share: number | null;
  primary_activity_area: string | null;
  yearly_repl_plates: number;
  yearly_repl_pieces: number;
  yearly_receiving_plates: number;
  yearly_receiving_pieces: number;
  yearly_pick_plates: number;
  yearly_pick_pieces: number;
  active_days: number;
  active_weeks: number;
  role_confidence: string;
  area_confidence: string;
  review_flag: number;
  role_mix_json: string;
  area_mix_json: string;
  source_summary_json: string;
  forced_role: string | null;
  forced_area: string | null;
  start_date: string | null;
  end_date: string | null;
  override_notes: string | null;
  updated_at: string;
};

export type HistoricalRoleAlignmentOverrideInput = {
  year: number;
  userid: string;
  startDate?: string | null;
  endDate?: string | null;
  forcedRole?: string | null;
  forcedArea?: string | null;
  notes?: string | null;
};

type BucketInput = {
  role?: unknown;
  areaCode?: unknown;
  replenishmentNoRecvPlates?: unknown;
};

type UserlsDailyUser = {
  userid?: unknown;
  replenishmentNoRecvPlates?: unknown;
  roleBuckets?: BucketInput[];
  areaBuckets?: BucketInput[];
};

type UserlsDailyPayload = {
  users?: UserlsDailyUser[];
};

type MonthlyPeriod = SuggestedReviewSegment & {
  userid: string;
};

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function mapRow(
  row: DbRow,
  suggestedReviewSegments: SuggestedReviewSegment[]
): HistoricalRoleAlignmentRow {
  const forcedRole = normalizeOptionalString(row.forced_role);
  const forcedArea = normalizeOptionalString(row.forced_area);
  const overrideStartDate = normalizeDate(row.start_date);
  const overrideEndDate = normalizeDate(row.end_date);
  const notes = row.override_notes || "";
  const effectiveRole = forcedRole || row.primary_role;
  const effectiveArea = forcedArea || row.primary_area;
  const hasOverride = Boolean(
    forcedRole || forcedArea || overrideStartDate || overrideEndDate || notes.trim()
  );

  return {
    year: row.year,
    userid: row.userid,
    name: row.name,
    primaryRole: row.primary_role,
    primaryRoleShare: row.primary_role_share,
    primaryArea: row.primary_area,
    primaryAreaShare: row.primary_area_share,
    primaryActivityArea: row.primary_activity_area,
    yearlyReplPlates: row.yearly_repl_plates,
    yearlyReplPieces: row.yearly_repl_pieces,
    yearlyReceivingPlates: row.yearly_receiving_plates,
    yearlyReceivingPieces: row.yearly_receiving_pieces,
    yearlyPickPlates: row.yearly_pick_plates,
    yearlyPickPieces: row.yearly_pick_pieces,
    activeDays: row.active_days,
    activeWeeks: row.active_weeks,
    roleConfidence: row.role_confidence,
    areaConfidence: row.area_confidence,
    reviewFlag: row.review_flag === 1,
    roleMix: parseJson<unknown[]>(row.role_mix_json, []),
    areaMix: parseJson<unknown[]>(row.area_mix_json, []),
    sourceSummary: parseJson<Record<string, unknown>>(row.source_summary_json, {}),
    forcedRole,
    forcedArea,
    overrideStartDate,
    overrideEndDate,
    notes,
    effectiveRole,
    effectiveArea,
    alignmentStatus: hasOverride ? "Override saved" : row.review_flag === 1 ? "Needs review" : "Aligned",
    anomalyFlag: row.review_flag === 1,
    suggestedReviewSegments,
    updatedAt: row.updated_at,
  };
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeDate(value: unknown): string | null {
  const trimmed = normalizeOptionalString(value);
  if (!trimmed || !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

function normalizeNotes(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function asInt(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function safeShare(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 10000) / 10000;
}

function addBucket(buckets: Map<string, number>, label: unknown, plates: unknown) {
  if (typeof label !== "string" || !label.trim()) return;
  const plateCount = asInt(plates);
  if (plateCount <= 0) return;
  buckets.set(label.trim(), (buckets.get(label.trim()) || 0) + plateCount);
}

function chooseDominant(buckets: Map<string, number>, total: number) {
  const rows = Array.from(buckets.entries()).sort(
    ([leftLabel, leftPlates], [rightLabel, rightPlates]) =>
      rightPlates - leftPlates || leftLabel.localeCompare(rightLabel)
  );
  const top = rows[0];
  if (!top) return { label: null, share: null };
  return { label: top[0], share: safeShare(top[1], total) };
}

function monthEnd(monthKey: string) {
  const [yearValue, monthValue] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(yearValue, monthValue, 0)).toISOString().slice(0, 10);
}

function nextDay(dateKey: string) {
  const parsed = new Date(`${dateKey}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

function areAdjacent(left: SuggestedReviewSegment, right: SuggestedReviewSegment) {
  return nextDay(left.endDate) === right.startDate;
}

function classifyPeriod(
  period: Omit<SuggestedReviewSegment, "segmentType" | "reason">,
  previous: SuggestedReviewSegment | null
): Pick<SuggestedReviewSegment, "segmentType" | "reason"> {
  if (period.replenishmentPlates < 50) {
    return {
      segmentType: "low_confidence",
      reason: "Low monthly replenishment volume; review before applying a date-range override.",
    };
  }

  if (!period.suggestedArea || !period.suggestedRole) {
    return {
      segmentType: "low_confidence",
      reason: "Missing a clear dominant area or role for this period.",
    };
  }

  const areaShare = period.areaShare || 0;
  const roleShare = period.roleShare || 0;

  if (areaShare < 0.5 || roleShare < 0.55) {
    return {
      segmentType: "mixed",
      reason: "No single area and role dominate strongly enough to merge confidently.",
    };
  }

  if (
    previous?.suggestedArea &&
    previous?.suggestedRole &&
    (previous.suggestedArea !== period.suggestedArea ||
      previous.suggestedRole !== period.suggestedRole)
  ) {
    return {
      segmentType: "likely_shift",
      reason: "Dominant area or role changed from the prior period.",
    };
  }

  return {
    segmentType: "stable",
    reason: "Dominant area and role are stable for this period.",
  };
}

function canMergeSegments(left: SuggestedReviewSegment, right: SuggestedReviewSegment) {
  if (!areAdjacent(left, right)) return false;
  if (left.suggestedArea !== right.suggestedArea) return false;
  if (left.suggestedRole !== right.suggestedRole) return false;
  if (!left.suggestedArea || !left.suggestedRole) return false;
  if (left.segmentType === "mixed" || right.segmentType === "mixed") return false;
  if (left.segmentType === "low_confidence" || right.segmentType === "low_confidence") {
    return false;
  }

  const areaDiff = Math.abs((left.areaShare || 0) - (right.areaShare || 0));
  const roleDiff = Math.abs((left.roleShare || 0) - (right.roleShare || 0));
  return areaDiff <= 0.15 && roleDiff <= 0.15;
}

function mergeSegment(left: SuggestedReviewSegment, right: SuggestedReviewSegment) {
  const totalPlates = left.replenishmentPlates + right.replenishmentPlates;
  const weightedShare = (leftShare: number | null, rightShare: number | null) => {
    if (leftShare === null || rightShare === null || totalPlates <= 0) return null;
    return (
      Math.round(
        ((leftShare * left.replenishmentPlates + rightShare * right.replenishmentPlates) /
          totalPlates) *
          10000
      ) / 10000
    );
  };

  return {
    ...left,
    endDate: right.endDate,
    areaShare: weightedShare(left.areaShare, right.areaShare),
    roleShare: weightedShare(left.roleShare, right.roleShare),
    replenishmentPlates: totalPlates,
    segmentType:
      left.segmentType === "likely_shift" || right.segmentType === "likely_shift"
        ? "likely_shift"
        : "stable",
    reason:
      left.segmentType === "likely_shift" || right.segmentType === "likely_shift"
        ? "Adjacent months share the same dominant area and role after a likely shift."
        : "Adjacent months share the same dominant area, role, and similar confidence.",
  } satisfies SuggestedReviewSegment;
}

function overlapsOverride(
  segment: SuggestedReviewSegment,
  row: Pick<DbRow, "start_date" | "end_date" | "forced_role" | "forced_area" | "override_notes">
) {
  const hasOverride = Boolean(
    normalizeOptionalString(row.forced_role) ||
      normalizeOptionalString(row.forced_area) ||
      normalizeDate(row.start_date) ||
      normalizeDate(row.end_date) ||
      normalizeOptionalString(row.override_notes)
  );
  if (!hasOverride) return false;

  const startDate = normalizeDate(row.start_date);
  const endDate = normalizeDate(row.end_date);
  if (!startDate && !endDate) return true;

  const effectiveStart = startDate || "0000-01-01";
  const effectiveEnd = endDate || "9999-12-31";
  return effectiveStart <= segment.endDate && effectiveEnd >= segment.startDate;
}

function markUncoveredSegments(
  segments: SuggestedReviewSegment[],
  row: Pick<DbRow, "start_date" | "end_date" | "forced_role" | "forced_area" | "override_notes">
) {
  return segments.map((segment) => {
    if (overlapsOverride(segment, row)) return segment;
    if (segment.segmentType === "stable") return segment;

    return {
      ...segment,
      segmentType: "uncovered_gap" as const,
      reason: `${segment.reason} No saved override covers this date range.`,
    };
  });
}

function buildSuggestedSegmentsByUser(year: number) {
  const snapshots = listSnapshotsInRange<UserlsDailyPayload>(
    "userls_daily",
    `${year}-01-01`,
    `${year}-12-31`
  );
  const periods = new Map<
    string,
    {
      userid: string;
      monthKey: string;
      startDate: string;
      endDate: string;
      replenishmentPlates: number;
      roleBuckets: Map<string, number>;
      areaBuckets: Map<string, number>;
    }
  >();

  for (const snapshot of snapshots) {
    const monthKey = snapshot.dateKey.slice(0, 7);
    for (const user of snapshot.payload.users || []) {
      const userid = normalizeOptionalString(user.userid);
      if (!userid) continue;

      const replPlates = asInt(user.replenishmentNoRecvPlates);
      if (replPlates <= 0) continue;

      const periodKey = `${userid}:${monthKey}`;
      const period =
        periods.get(periodKey) ||
        {
          userid,
          monthKey,
          startDate: `${monthKey}-01`,
          endDate: monthEnd(monthKey),
          replenishmentPlates: 0,
          roleBuckets: new Map<string, number>(),
          areaBuckets: new Map<string, number>(),
        };

      period.replenishmentPlates += replPlates;
      for (const bucket of user.roleBuckets || []) {
        addBucket(period.roleBuckets, bucket.role, bucket.replenishmentNoRecvPlates);
      }
      for (const bucket of user.areaBuckets || []) {
        addBucket(period.areaBuckets, bucket.areaCode, bucket.replenishmentNoRecvPlates);
      }
      periods.set(periodKey, period);
    }
  }

  const periodsByUser = new Map<string, MonthlyPeriod[]>();
  for (const period of periods.values()) {
    const role = chooseDominant(period.roleBuckets, period.replenishmentPlates);
    const area = chooseDominant(period.areaBuckets, period.replenishmentPlates);
    const userPeriods = periodsByUser.get(period.userid) || [];
    const previous = userPeriods[userPeriods.length - 1] || null;
    const basePeriod = {
      startDate: period.startDate,
      endDate: period.endDate,
      suggestedArea: area.label,
      suggestedRole: role.label,
      areaShare: area.share,
      roleShare: role.share,
      replenishmentPlates: period.replenishmentPlates,
    };
    userPeriods.push({
      userid: period.userid,
      ...basePeriod,
      ...classifyPeriod(basePeriod, previous),
    });
    periodsByUser.set(period.userid, userPeriods);
  }

  const segmentsByUser = new Map<string, SuggestedReviewSegment[]>();
  for (const [userid, userPeriods] of periodsByUser.entries()) {
    const orderedPeriods = userPeriods.sort((left, right) =>
      left.startDate.localeCompare(right.startDate)
    );
    const segments: SuggestedReviewSegment[] = [];

    for (const period of orderedPeriods) {
      const segment: SuggestedReviewSegment = {
        startDate: period.startDate,
        endDate: period.endDate,
        suggestedArea: period.suggestedArea,
        suggestedRole: period.suggestedRole,
        areaShare: period.areaShare,
        roleShare: period.roleShare,
        replenishmentPlates: period.replenishmentPlates,
        segmentType: period.segmentType,
        reason: period.reason,
      };
      const previous = segments[segments.length - 1];
      if (previous && canMergeSegments(previous, segment)) {
        segments[segments.length - 1] = mergeSegment(previous, segment);
      } else {
        segments.push(segment);
      }
    }

    segmentsByUser.set(userid, segments);
  }

  return segmentsByUser;
}

export function listHistoricalRoleAlignment(
  year: number
): HistoricalRoleAlignmentRow[] {
  const db = getDb();
  const segmentsByUser = buildSuggestedSegmentsByUser(year);
  const rows = db
    .prepare(
      `
      SELECT
        alignment.*,
        overrides.start_date,
        overrides.end_date,
        overrides.forced_role,
        overrides.forced_area,
        overrides.notes AS override_notes
      FROM historical_role_alignment AS alignment
      LEFT JOIN historical_role_alignment_overrides AS overrides
        ON overrides.year = alignment.year
       AND overrides.subject_key = alignment.userid
      WHERE alignment.year = ?
      ORDER BY
        alignment.review_flag DESC,
        COALESCE(alignment.primary_role_share, -1) ASC,
        alignment.yearly_repl_plates DESC,
        alignment.userid ASC
      `
    )
    .all(year) as DbRow[];

  return rows.map((row) =>
    mapRow(row, markUncoveredSegments(segmentsByUser.get(row.userid) || [], row))
  );
}

export function saveHistoricalRoleAlignmentOverride(
  input: HistoricalRoleAlignmentOverrideInput
) {
  const year = input.year;
  const userid = normalizeOptionalString(input.userid);
  const startDate = normalizeDate(input.startDate);
  const endDate = normalizeDate(input.endDate);
  const forcedRole = normalizeOptionalString(input.forcedRole);
  const forcedArea = normalizeOptionalString(input.forcedArea);
  const notes = normalizeNotes(input.notes);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("Invalid year");
  }

  if (!userid) {
    throw new Error("Missing userid");
  }

  if ((input.startDate && !startDate) || (input.endDate && !endDate)) {
    throw new Error("Invalid override date range");
  }

  if (startDate && endDate && startDate > endDate) {
    throw new Error("Override start date must be before end date");
  }

  const db = getDb();

  if (!startDate && !endDate && !forcedRole && !forcedArea && !notes) {
    db.prepare(
      `
      DELETE FROM historical_role_alignment_overrides
      WHERE year = ? AND subject_key = ?
      `
    ).run(year, userid);

    return {
      status: "cleared",
      year,
      userid,
    };
  }

  const updatedAt = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO historical_role_alignment_overrides (
      year,
      subject_key,
      start_date,
      end_date,
      forced_role,
      forced_area,
      notes,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(year, subject_key) DO UPDATE SET
      start_date = excluded.start_date,
      end_date = excluded.end_date,
      forced_role = excluded.forced_role,
      forced_area = excluded.forced_area,
      notes = excluded.notes,
      updated_at = excluded.updated_at
    `
  ).run(year, userid, startDate, endDate, forcedRole, forcedArea, notes, updatedAt);

  return {
    status: "saved",
    year,
    userid,
    startDate,
    endDate,
    forcedRole,
    forcedArea,
    notes,
    updatedAt,
  };
}
