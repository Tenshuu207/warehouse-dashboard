import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { getDb, getJsonValue, listSnapshotsInRange } from "@/lib/server/db";

type SegmentType = "stable" | "likely_shift" | "mixed" | "uncovered_gap" | "low_confidence";
type SegmentCoverageState =
  | "uncovered"
  | "partially_covered"
  | "covered_by_override"
  | "covered_by_global_override";

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
  coverageState: SegmentCoverageState;
  appliedRole: string | null;
  appliedArea: string | null;
  appliedStartDate: string | null;
  appliedEndDate: string | null;
  appliedCoverageLabel: string;
};

export type SavedRangeOverride = {
  id: string;
  year: number;
  subjectKey: string;
  startDate: string;
  endDate: string;
  forcedRole: string | null;
  forcedArea: string | null;
  notes: string;
  source: string;
  updatedAt: string;
};

export type RangeCoverageDiagnostic = {
  id: string;
  source: string;
  sourceLabel: string;
  startDate: string;
  endDate: string;
  coveredWeeks: number;
  overlapsObservedWeeks: boolean;
  countsTowardCoverage: boolean;
};

export type RangeCoverageDiagnostics = {
  savedRangesExist: boolean;
  savedRangeCount: number;
  manualUiRangeCount: number;
  legacyOrImportedRangeCount: number;
  observedCoverageWeeksAvailable: boolean;
  observedWeekCount: number;
  coveredBySavedRanges: number;
  rangesCountTowardCoverage: boolean;
  rangesPartiallyCoverObservedWeeks: boolean;
  message: string;
  ranges: RangeCoverageDiagnostic[];
};

export type HistoricalRoleAlignmentRow = {
  year: number;
  userid: string;
  subjectKey: string;
  overrideSubjectKey: string | null;
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
  rangeOverrides: SavedRangeOverride[];
  effectiveRole: string | null;
  effectiveArea: string | null;
  alignmentStatus: string;
  anomalyFlag: boolean;
  coverageComplete: boolean;
  observedWeeks: number;
  coveredWeeks: number;
  uncoveredWeeks: number;
  reviewQueueReason: string;
  rangeCoverageDiagnostics: RangeCoverageDiagnostics;
  suggestedReviewExplanation: string;
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
  updated_at: string;
};

type DbGlobalOverrideRow = {
  subject_key: string;
  start_date: string | null;
  end_date: string | null;
  forced_role: string | null;
  forced_area: string | null;
  override_notes: string | null;
};

type DbRangeOverrideRow = {
  id: string;
  year: number;
  subject_key: string;
  start_date: string;
  end_date: string;
  forced_role: string | null;
  forced_area: string | null;
  override_notes: string | null;
  source: string;
  updated_at: string;
};

export type HistoricalRoleAlignmentOverrideInput = {
  year: number;
  userid: string;
  subjectKey?: string | null;
  rangeId?: string | null;
  deleteRangeId?: string | null;
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

type RfMapping = {
  rfUsername?: string;
  employeeId?: string;
  effectiveStartDate?: string;
  effectiveEndDate?: string;
  active?: boolean;
};

type RfMappingsData = {
  mappings?: RfMapping[];
};

type RawMonthlyPeriod = Omit<
  SuggestedReviewSegment,
  | "coverageState"
  | "appliedRole"
  | "appliedArea"
  | "appliedStartDate"
  | "appliedEndDate"
  | "appliedCoverageLabel"
> & {
  subjectKey: string;
};

type CoverageSummary = {
  observedWeekKeys: Set<string>;
  firstObservedDate: string | null;
  lastObservedDate: string | null;
};

type SuggestedReviewData = {
  segmentsBySubjectKey: Map<string, SuggestedReviewSegment[]>;
  coverageBySubjectKey: Map<string, CoverageSummary>;
};

type OverrideFields = Pick<
  DbGlobalOverrideRow,
  "start_date" | "end_date" | "forced_role" | "forced_area" | "override_notes"
>;

type OverrideContext = OverrideFields & {
  primary_role: string | null;
  primary_area: string | null;
};

function mapRangeOverride(row: DbRangeOverrideRow): SavedRangeOverride {
  return {
    id: row.id,
    year: row.year,
    subjectKey: row.subject_key,
    startDate: row.start_date,
    endDate: row.end_date,
    forcedRole: normalizeOptionalString(row.forced_role),
    forcedArea: normalizeOptionalString(row.forced_area),
    notes: row.override_notes || "",
    source: row.source,
    updatedAt: row.updated_at,
  };
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function mapRow(
  row: DbRow,
  subjectKey: string,
  globalOverride: DbGlobalOverrideRow | undefined,
  rangeOverrides: SavedRangeOverride[],
  suggestedReviewSegments: SuggestedReviewSegment[],
  coverage: CoverageSummary | undefined
): HistoricalRoleAlignmentRow {
  const forcedRole = normalizeOptionalString(globalOverride?.forced_role);
  const forcedArea = normalizeOptionalString(globalOverride?.forced_area);
  const overrideStartDate = normalizeDate(globalOverride?.start_date);
  const overrideEndDate = normalizeDate(globalOverride?.end_date);
  const notes = globalOverride?.override_notes || "";
  const effectiveRole = forcedRole || row.primary_role;
  const effectiveArea = forcedArea || row.primary_area;
  const hasOverride = Boolean(
    forcedRole ||
      forcedArea ||
      overrideStartDate ||
      overrideEndDate ||
      notes.trim() ||
      rangeOverrides.length > 0
  );
  const observedWeekKeys = coverage?.observedWeekKeys || new Set<string>();
  const observedWeeks = observedWeekKeys.size || row.active_weeks || 0;
  const hasGlobalOverride = Boolean(globalOverride);
  const coveredWeeks =
    observedWeekKeys.size === 0 && hasGlobalOverride
      ? observedWeeks
      : countCoveredWeeks(observedWeekKeys, globalOverride, rangeOverrides);
  const rangeCoveredWeeks = countCoveredWeeks(observedWeekKeys, undefined, rangeOverrides);
  const uncoveredWeeks = Math.max(observedWeeks - coveredWeeks, 0);
  const rangeUncoveredWeeks = Math.max(observedWeeks - rangeCoveredWeeks, 0);
  const coverageComplete = hasGlobalOverride || (observedWeeks > 0 && uncoveredWeeks === 0);
  const reviewQueueReason = coverageComplete
    ? hasGlobalOverride
        ? "A global override covers the full review period."
        : "All observed meaningful weeks are covered by the saved override."
    : !row.review_flag
      ? "No review flag is currently raised."
      : rangeOverrides.length > 0
        ? `${uncoveredWeeks} observed week${uncoveredWeeks === 1 ? "" : "s"} remain outside saved range overrides.`
        : hasOverride
        ? `${uncoveredWeeks} observed week${uncoveredWeeks === 1 ? "" : "s"} remain outside the saved override.`
        : "Review is still open because no saved override covers the observed weeks.";

  return {
    year: row.year,
    userid: row.userid,
    subjectKey,
    overrideSubjectKey: globalOverride?.subject_key || null,
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
    rangeOverrides,
    effectiveRole,
    effectiveArea,
    alignmentStatus: hasOverride ? "Override saved" : row.review_flag === 1 ? "Needs review" : "Aligned",
    anomalyFlag: row.review_flag === 1,
    coverageComplete,
    observedWeeks,
    coveredWeeks,
    uncoveredWeeks,
    reviewQueueReason,
    rangeCoverageDiagnostics: buildRangeCoverageDiagnostics(
      rangeOverrides,
      observedWeekKeys,
      observedWeeks,
      rangeCoveredWeeks,
      rangeUncoveredWeeks
    ),
    suggestedReviewExplanation: buildSuggestionExplanation(row, suggestedReviewSegments, coverage),
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

function normalizeRfUsername(value: unknown): string | null {
  const trimmed = normalizeOptionalString(value);
  return trimmed ? trimmed.toLowerCase() : null;
}

function asInt(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function safeShare(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 10000) / 10000;
}

function mappingsFilePath() {
  return path.join(process.cwd(), "..", "ingest", "config", "rf_username_mappings.json");
}

function normalizeMappings(input: unknown): RfMapping[] {
  const raw =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const mappings = Array.isArray(raw.mappings) ? raw.mappings : [];

  const normalized: RfMapping[] = [];

  for (const item of mappings) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const rfUsername = normalizeOptionalString(row.rfUsername);
    const employeeId = normalizeOptionalString(row.employeeId);
    if (!rfUsername || !employeeId) continue;

    normalized.push({
      rfUsername,
      employeeId,
      effectiveStartDate: normalizeDate(row.effectiveStartDate) || undefined,
      effectiveEndDate: normalizeDate(row.effectiveEndDate) || undefined,
      active: row.active === true,
    });
  }

  return normalized;
}

function readRfMappings(): RfMapping[] {
  const fromDb = getJsonValue<RfMappingsData>("config", "rf-mappings");
  if (fromDb) return normalizeMappings(fromDb);

  try {
    return normalizeMappings(JSON.parse(fs.readFileSync(mappingsFilePath(), "utf-8")));
  } catch {
    return [];
  }
}

function mappingOverlapsYear(mapping: RfMapping, year: number) {
  const start = mapping.effectiveStartDate || `${year}-01-01`;
  const end = mapping.effectiveEndDate || `${year}-12-31`;
  return start <= `${year}-12-31` && end >= `${year}-01-01`;
}

function buildSubjectKeyResolver(year: number) {
  const mappingsByRfUsername = new Map<string, RfMapping[]>();

  for (const mapping of readRfMappings()) {
    if (mapping.active !== true) continue;
    const rfUsername = normalizeRfUsername(mapping.rfUsername);
    if (!rfUsername || !mapping.employeeId || !mappingOverlapsYear(mapping, year)) continue;
    const rows = mappingsByRfUsername.get(rfUsername) || [];
    rows.push(mapping);
    mappingsByRfUsername.set(rfUsername, rows);
  }

  for (const rows of mappingsByRfUsername.values()) {
    rows.sort((left, right) =>
      (right.effectiveStartDate || "").localeCompare(left.effectiveStartDate || "")
    );
  }

  return (userid: string) => {
    const rfUsername = normalizeRfUsername(userid);
    if (!rfUsername) return userid;
    const mapping = mappingsByRfUsername.get(rfUsername)?.[0];
    return mapping?.employeeId ? `employee:${mapping.employeeId}` : userid;
  };
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

function weekKey(dateKey: string) {
  const parsed = new Date(`${dateKey}T00:00:00.000Z`);
  const day = parsed.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  parsed.setUTCDate(parsed.getUTCDate() + mondayOffset);
  return parsed.toISOString().slice(0, 10);
}

function areAdjacent(left: SuggestedReviewSegment, right: SuggestedReviewSegment) {
  return nextDay(left.endDate) === right.startDate;
}

function classifyPeriod(
  period: Pick<
    SuggestedReviewSegment,
    "startDate" | "endDate" | "suggestedArea" | "suggestedRole" | "areaShare" | "roleShare" | "replenishmentPlates"
  >,
  previous: Pick<SuggestedReviewSegment, "suggestedArea" | "suggestedRole"> | null
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

function getSegmentOverrideCoverage(
  segment: SuggestedReviewSegment,
  globalOverride: OverrideContext | null,
  rangeOverrides: SavedRangeOverride[],
  fallback: Pick<DbRow, "primary_role" | "primary_area">
) {
  if (globalOverride) {
    const appliedRole = normalizeOptionalString(globalOverride.forced_role) || fallback.primary_role || null;
    const appliedArea = normalizeOptionalString(globalOverride.forced_area) || fallback.primary_area || null;
    return {
      coverageState: "covered_by_global_override" as const,
      appliedRole,
      appliedArea,
      appliedStartDate: null,
      appliedEndDate: null,
      appliedCoverageLabel: "Covered by global override",
    };
  }

  const overlapping = rangeOverrides
    .filter((range) => range.startDate <= segment.endDate && range.endDate >= segment.startDate)
    .sort((left, right) => left.startDate.localeCompare(right.startDate));

  if (overlapping.length === 0) {
    return {
      coverageState: "uncovered" as const,
      appliedRole: null,
      appliedArea: null,
      appliedStartDate: null,
      appliedEndDate: null,
      appliedCoverageLabel: "Uncovered",
    };
  }

  const fullyCovered = rangesCoverPeriod(overlapping, segment.startDate, segment.endDate);
  const displayRange =
    overlapping.find((range) => range.startDate <= segment.startDate && range.endDate >= segment.endDate) ||
    overlapping[0];
  const appliedStartDate =
    displayRange.startDate > segment.startDate ? displayRange.startDate : segment.startDate;
  const appliedEndDate = displayRange.endDate < segment.endDate ? displayRange.endDate : segment.endDate;
  const appliedRole = displayRange.forcedRole || fallback.primary_role || null;
  const appliedArea = displayRange.forcedArea || fallback.primary_area || null;

  return {
    coverageState: fullyCovered ? ("covered_by_override" as const) : ("partially_covered" as const),
    appliedRole,
    appliedArea,
    appliedStartDate,
    appliedEndDate,
    appliedCoverageLabel: fullyCovered
      ? overlapping.length > 1
        ? `Covered by ${overlapping.length} saved ranges`
        : "Covered by saved range"
      : overlapping.length > 1
        ? `Partially covered by ${overlapping.length} saved ranges`
        : `Partially covered ${appliedStartDate} to ${appliedEndDate}`,
  };
}

function weekEndDate(observedWeekKey: string) {
  return nextDay(nextDay(nextDay(nextDay(nextDay(nextDay(observedWeekKey))))));
}

function rangeOverlapsObservedWeek(
  range: Pick<SavedRangeOverride, "startDate" | "endDate">,
  observedWeekKey: string
) {
  return range.startDate <= weekEndDate(observedWeekKey) && range.endDate >= observedWeekKey;
}

function countWeeksCoveredByRange(
  observedWeekKeys: Set<string>,
  range: Pick<SavedRangeOverride, "startDate" | "endDate">
) {
  let covered = 0;

  for (const observedWeekKey of observedWeekKeys) {
    if (rangeOverlapsObservedWeek(range, observedWeekKey)) {
      covered += 1;
    }
  }

  return covered;
}

function sourceLabel(source: string) {
  if (source === "manual") return "manual_ui";
  if (source.startsWith("legacy")) return "legacy/imported";
  return source || "imported";
}

function buildRangeCoverageDiagnostics(
  rangeOverrides: SavedRangeOverride[],
  observedWeekKeys: Set<string>,
  observedWeeks: number,
  coveredWeeks: number,
  uncoveredWeeks: number
): RangeCoverageDiagnostics {
  const ranges = rangeOverrides.map((range) => {
    const rangeCoveredWeeks = countWeeksCoveredByRange(observedWeekKeys, range);

    return {
      id: range.id,
      source: range.source,
      sourceLabel: sourceLabel(range.source),
      startDate: range.startDate,
      endDate: range.endDate,
      coveredWeeks: rangeCoveredWeeks,
      overlapsObservedWeeks: rangeCoveredWeeks > 0,
      countsTowardCoverage: rangeCoveredWeeks > 0,
    };
  });
  const savedRangeCount = rangeOverrides.length;
  const manualUiRangeCount = ranges.filter((range) => range.sourceLabel === "manual_ui").length;
  const legacyOrImportedRangeCount = savedRangeCount - manualUiRangeCount;
  const observedCoverageWeeksAvailable = observedWeekKeys.size > 0;
  const rangesCountTowardCoverage = ranges.some((range) => range.countsTowardCoverage);
  const rangesPartiallyCoverObservedWeeks = coveredWeeks > 0 && uncoveredWeeks > 0;
  const message =
    savedRangeCount === 0
      ? "No saved date-range overrides exist for this operator."
      : !observedCoverageWeeksAvailable
        ? "Saved ranges exist, but daily observed week keys were not found for this coverage check."
        : !rangesCountTowardCoverage
          ? "Saved ranges exist, but none overlap the observed weeks used for coverage."
          : rangesPartiallyCoverObservedWeeks
            ? `${coveredWeeks} observed week${coveredWeeks === 1 ? "" : "s"} are covered by saved ranges, but ${uncoveredWeeks} remain outside them.`
            : "Saved ranges overlap all observed weeks used for coverage.";

  return {
    savedRangesExist: savedRangeCount > 0,
    savedRangeCount,
    manualUiRangeCount,
    legacyOrImportedRangeCount,
    observedCoverageWeeksAvailable,
    observedWeekCount: observedWeekKeys.size || observedWeeks,
    coveredBySavedRanges: coveredWeeks,
    rangesCountTowardCoverage,
    rangesPartiallyCoverObservedWeeks,
    message,
    ranges,
  };
}

function countCoveredWeeks(
  observedWeekKeys: Set<string>,
  globalOverride: OverrideFields | undefined,
  rangeOverrides: SavedRangeOverride[]
) {
  if (observedWeekKeys.size === 0) return 0;
  if (globalOverride) return observedWeekKeys.size;
  if (rangeOverrides.length === 0) return 0;

  let covered = 0;

  for (const observedWeekKey of observedWeekKeys) {
    if (rangeOverrides.some((range) => rangeOverlapsObservedWeek(range, observedWeekKey))) {
      covered += 1;
    }
  }

  return covered;
}

function buildSuggestionExplanation(
  row: DbRow,
  suggestedReviewSegments: SuggestedReviewSegment[],
  coverage: CoverageSummary | undefined
) {
  if (suggestedReviewSegments.length > 0) return "";

  const observedWeeks = coverage?.observedWeekKeys.size || 0;
  if (row.yearly_repl_plates <= 0 || observedWeeks === 0) {
    return "No meaningful monthly replenishment periods were found in the daily snapshots.";
  }

  if (row.yearly_repl_plates < 50) {
    return "Monthly replenishment volume is below the suggestion threshold.";
  }

  const roleShare = row.primary_role_share || 0;
  const areaShare = row.primary_area_share || 0;
  if (!row.primary_role || !row.primary_area) {
    return "No strong dominant area or role was found for the observed replenishment work.";
  }

  if (roleShare < 0.55 || areaShare < 0.5) {
    return "Meaningful months appear mixed or unclear, so no confident clickable segment was generated.";
  }

  return "Daily monthly snapshots did not produce date-specific suggested segments for this operator.";
}

function markUncoveredSegments(
  segments: SuggestedReviewSegment[],
  globalOverride: OverrideContext | null,
  rangeOverrides: SavedRangeOverride[],
  fallback: Pick<DbRow, "primary_role" | "primary_area">
) {
  return segments.map((segment) => {
    const coverage = getSegmentOverrideCoverage(segment, globalOverride, rangeOverrides, fallback);
    const segmentWithCoverage = {
      ...segment,
      ...coverage,
    };

    if (coverage.coverageState !== "uncovered") return segmentWithCoverage;
    if (segment.segmentType === "stable") return segmentWithCoverage;

    return {
      ...segmentWithCoverage,
      segmentType: "uncovered_gap" as const,
      reason: `${segment.reason} No saved override covers this date range.`,
    };
  });
}

function rangesCoverPeriod(
  ranges: Array<Pick<SavedRangeOverride, "startDate" | "endDate">>,
  startDate: string,
  endDate: string
) {
  let coveredThrough = "";

  for (const range of ranges) {
    if (range.endDate < startDate) continue;
    if (range.startDate > endDate) break;

    if (!coveredThrough) {
      if (range.startDate > startDate) return false;
      coveredThrough = range.endDate;
      continue;
    }

    if (range.startDate > nextDay(coveredThrough)) return false;
    if (range.endDate > coveredThrough) coveredThrough = range.endDate;
  }

  return Boolean(coveredThrough && coveredThrough >= endDate);
}

function buildSuggestedReviewData(
  year: number,
  resolveSubjectKey: (userid: string) => string
): SuggestedReviewData {
  const snapshots = listSnapshotsInRange<UserlsDailyPayload>(
    "userls_daily",
    `${year}-01-01`,
    `${year}-12-31`
  );
  const periods = new Map<
    string,
    {
      subjectKey: string;
      monthKey: string;
      startDate: string;
      endDate: string;
      replenishmentPlates: number;
      roleBuckets: Map<string, number>;
      areaBuckets: Map<string, number>;
    }
  >();
  const coverageBySubjectKey = new Map<string, CoverageSummary>();

  for (const snapshot of snapshots) {
    const monthKey = snapshot.dateKey.slice(0, 7);
    for (const user of snapshot.payload.users || []) {
      const userid = normalizeOptionalString(user.userid);
      if (!userid) continue;
      const subjectKey = resolveSubjectKey(userid);

      const replPlates = asInt(user.replenishmentNoRecvPlates);
      if (replPlates <= 0) continue;

      const coverage =
        coverageBySubjectKey.get(subjectKey) ||
        {
          observedWeekKeys: new Set<string>(),
          firstObservedDate: null,
          lastObservedDate: null,
        };
      coverage.observedWeekKeys.add(weekKey(snapshot.dateKey));
      coverage.firstObservedDate =
        !coverage.firstObservedDate || snapshot.dateKey < coverage.firstObservedDate
          ? snapshot.dateKey
          : coverage.firstObservedDate;
      coverage.lastObservedDate =
        !coverage.lastObservedDate || snapshot.dateKey > coverage.lastObservedDate
          ? snapshot.dateKey
          : coverage.lastObservedDate;
      coverageBySubjectKey.set(subjectKey, coverage);

      const periodKey = `${subjectKey}:${monthKey}`;
      const period =
        periods.get(periodKey) ||
        {
          subjectKey,
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

  const periodsBySubjectKey = new Map<string, RawMonthlyPeriod[]>();
  for (const period of periods.values()) {
    const role = chooseDominant(period.roleBuckets, period.replenishmentPlates);
    const area = chooseDominant(period.areaBuckets, period.replenishmentPlates);
    const subjectPeriods = periodsBySubjectKey.get(period.subjectKey) || [];
    const previous = subjectPeriods[subjectPeriods.length - 1] || null;
    const basePeriod = {
      startDate: period.startDate,
      endDate: period.endDate,
      suggestedArea: area.label,
      suggestedRole: role.label,
      areaShare: area.share,
      roleShare: role.share,
      replenishmentPlates: period.replenishmentPlates,
    };
    subjectPeriods.push({
      subjectKey: period.subjectKey,
      ...basePeriod,
      ...classifyPeriod(basePeriod, previous),
    });
    periodsBySubjectKey.set(period.subjectKey, subjectPeriods);
  }

  const segmentsBySubjectKey = new Map<string, SuggestedReviewSegment[]>();
  for (const [subjectKey, subjectPeriods] of periodsBySubjectKey.entries()) {
    const orderedPeriods = subjectPeriods.sort((left, right) =>
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
        coverageState: "uncovered",
        appliedRole: null,
        appliedArea: null,
        appliedStartDate: null,
        appliedEndDate: null,
        appliedCoverageLabel: "Uncovered",
      };
      const previous = segments[segments.length - 1];
      if (previous && canMergeSegments(previous, segment)) {
        segments[segments.length - 1] = mergeSegment(previous, segment);
      } else {
        segments.push(segment);
      }
    }

    segmentsBySubjectKey.set(subjectKey, segments);
  }

  return {
    segmentsBySubjectKey,
    coverageBySubjectKey,
  };
}

export function listHistoricalRoleAlignment(
  year: number
): HistoricalRoleAlignmentRow[] {
  const db = getDb();
  const resolveSubjectKey = buildSubjectKeyResolver(year);
  const { segmentsBySubjectKey, coverageBySubjectKey } = buildSuggestedReviewData(
    year,
    resolveSubjectKey
  );
  const rows = db
    .prepare(
      `
      SELECT
        alignment.*
      FROM historical_role_alignment AS alignment
      WHERE alignment.year = ?
      ORDER BY
        alignment.review_flag DESC,
        COALESCE(alignment.primary_role_share, -1) ASC,
        alignment.yearly_repl_plates DESC,
        alignment.userid ASC
      `
    )
    .all(year) as DbRow[];

  const overrideRows = db
    .prepare(
      `
      SELECT
        subject_key,
        start_date,
        end_date,
        forced_role,
        forced_area,
        notes AS override_notes
      FROM historical_role_alignment_overrides
      WHERE year = ?
      `
    )
    .all(year) as DbGlobalOverrideRow[];
  const rangeRows = db
    .prepare(
      `
      SELECT
        id,
        year,
        subject_key,
        start_date,
        end_date,
        forced_role,
        forced_area,
        notes AS override_notes,
        source,
        updated_at
      FROM historical_role_alignment_range_overrides
      WHERE year = ?
      ORDER BY start_date ASC, end_date ASC, updated_at ASC
      `
    )
    .all(year) as DbRangeOverrideRow[];
  return buildHistoricalRoleAlignmentRows(
    year,
    rows,
    overrideRows,
    rangeRows,
    { segmentsBySubjectKey, coverageBySubjectKey },
    resolveSubjectKey
  );
}

function buildHistoricalRoleAlignmentRows(
  year: number,
  rows: DbRow[],
  overrideRows: DbGlobalOverrideRow[],
  rangeRows: DbRangeOverrideRow[],
  suggestedReviewData: SuggestedReviewData,
  resolveSubjectKey: (userid: string) => string
) {
  const overridesBySubjectKey = new Map(
    overrideRows.map((overrideRow) => [overrideRow.subject_key, overrideRow])
  );
  const rangesBySubjectKey = new Map<string, SavedRangeOverride[]>();

  for (const rangeRow of rangeRows) {
    const mapped = mapRangeOverride(rangeRow);
    const ranges = rangesBySubjectKey.get(mapped.subjectKey) || [];
    ranges.push(mapped);
    rangesBySubjectKey.set(mapped.subjectKey, ranges);
  }

  return rows.map((row) => {
    const subjectKey = resolveSubjectKey(row.userid);
    const globalOverride = overridesBySubjectKey.get(subjectKey) || overridesBySubjectKey.get(row.userid);
    const canonicalRanges = rangesBySubjectKey.get(subjectKey) || [];
    const legacyRanges = subjectKey !== row.userid ? rangesBySubjectKey.get(row.userid) || [] : [];
    const rangeOverrides = [...canonicalRanges, ...legacyRanges].sort((left, right) =>
      left.startDate.localeCompare(right.startDate) ||
      left.endDate.localeCompare(right.endDate) ||
      left.id.localeCompare(right.id)
    );
    const globalOverrideContext = globalOverride
      ? {
          start_date: globalOverride.start_date,
          end_date: globalOverride.end_date,
          forced_role: globalOverride.forced_role,
          forced_area: globalOverride.forced_area,
          override_notes: globalOverride.override_notes,
          primary_role: row.primary_role,
          primary_area: row.primary_area,
        }
      : null;
    const fallback = {
      primary_role: row.primary_role,
      primary_area: row.primary_area,
    };
    const suggestedReviewSegments =
      suggestedReviewData.segmentsBySubjectKey.get(subjectKey) ||
      suggestedReviewData.segmentsBySubjectKey.get(row.userid) ||
      [];
    const coverage =
      suggestedReviewData.coverageBySubjectKey.get(subjectKey) ||
      suggestedReviewData.coverageBySubjectKey.get(row.userid);

    return mapRow(
      row,
      subjectKey,
      globalOverride,
      rangeOverrides,
      markUncoveredSegments(
        suggestedReviewSegments,
        globalOverrideContext,
        rangeOverrides,
        fallback
      ),
      coverage
    );
  });
}

export const historicalRoleAlignmentTestInternals = {
  buildHistoricalRoleAlignmentRows,
};

export function saveHistoricalRoleAlignmentOverride(
  input: HistoricalRoleAlignmentOverrideInput
) {
  const year = input.year;
  const userid = normalizeOptionalString(input.userid);
  const inputSubjectKey = normalizeOptionalString(input.subjectKey);
  const rangeId = normalizeOptionalString(input.rangeId);
  const deleteRangeId = normalizeOptionalString(input.deleteRangeId);
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

  const resolvedSubjectKey = buildSubjectKeyResolver(year)(userid);
  const subjectKey = inputSubjectKey && inputSubjectKey === resolvedSubjectKey ? inputSubjectKey : resolvedSubjectKey;

  if ((input.startDate && !startDate) || (input.endDate && !endDate)) {
    throw new Error("Invalid override date range");
  }

  if (startDate && endDate && startDate > endDate) {
    throw new Error("Override start date must be before end date");
  }

  const db = getDb();
  const updatedAt = new Date().toISOString();

  if (deleteRangeId) {
    const result = db.prepare(
      `
      DELETE FROM historical_role_alignment_range_overrides
      WHERE id = ?
        AND year = ?
        AND subject_key IN (?, ?)
      `
    ).run(deleteRangeId, year, subjectKey, userid);

    return {
      status: result.changes > 0 ? "range_cleared" : "range_not_found",
      year,
      userid,
      subjectKey,
      rangeId: deleteRangeId,
    };
  }

  if (startDate || endDate) {
    const effectiveStartDate = startDate || `${year}-01-01`;
    const effectiveEndDate = endDate || `${year}-12-31`;

    if (effectiveStartDate > effectiveEndDate) {
      throw new Error("Override start date must be before end date");
    }

    const existingRange = rangeId
      ? (db
          .prepare(
            `
            SELECT id
            FROM historical_role_alignment_range_overrides
            WHERE id = ?
              AND year = ?
              AND subject_key IN (?, ?)
            `
          )
          .get(rangeId, year, subjectKey, userid) as { id: string } | undefined)
      : (db
          .prepare(
            `
            SELECT id
            FROM historical_role_alignment_range_overrides
            WHERE year = ?
              AND subject_key = ?
              AND start_date = ?
              AND end_date = ?
              AND source = 'manual'
            ORDER BY updated_at DESC
            LIMIT 1
            `
          )
          .get(year, subjectKey, effectiveStartDate, effectiveEndDate) as
          | { id: string }
          | undefined);
    const nextRangeId =
      existingRange?.id || `manual:${year}:${subjectKey}:${randomUUID()}`;

    db.prepare(
      `
      INSERT INTO historical_role_alignment_range_overrides (
        id,
        year,
        subject_key,
        start_date,
        end_date,
        forced_role,
        forced_area,
        notes,
        source,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?)
      ON CONFLICT(id) DO UPDATE SET
        year = excluded.year,
        subject_key = excluded.subject_key,
        start_date = excluded.start_date,
        end_date = excluded.end_date,
        forced_role = excluded.forced_role,
        forced_area = excluded.forced_area,
        notes = excluded.notes,
        source = excluded.source,
        updated_at = excluded.updated_at
      `
    ).run(
      nextRangeId,
      year,
      subjectKey,
      effectiveStartDate,
      effectiveEndDate,
      forcedRole,
      forcedArea,
      notes,
      updatedAt
    );

    return {
      status: existingRange ? "range_updated" : "range_saved",
      year,
      userid,
      subjectKey,
      rangeId: nextRangeId,
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
      forcedRole,
      forcedArea,
      notes,
      updatedAt,
    };
  }

  if (!startDate && !endDate && !forcedRole && !forcedArea && !notes) {
    db.prepare(
      `
      DELETE FROM historical_role_alignment_overrides
      WHERE year = ? AND subject_key IN (?, ?)
      `
    ).run(year, subjectKey, userid);

    return {
      status: "cleared",
      year,
      userid,
      subjectKey,
    };
  }

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
  ).run(year, subjectKey, null, null, forcedRole, forcedArea, notes, updatedAt);

  if (subjectKey !== userid) {
    db.prepare(
      `
      DELETE FROM historical_role_alignment_overrides
      WHERE year = ? AND subject_key = ?
      `
    ).run(year, userid);
  }

  return {
    status: "saved",
    year,
    userid,
    subjectKey,
    startDate,
    endDate,
    forcedRole,
    forcedArea,
    notes,
    updatedAt,
  };
}
