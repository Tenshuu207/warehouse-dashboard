import { getDb } from "@/lib/server/db";

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
  notes: string;
  effectiveRole: string | null;
  effectiveArea: string | null;
  alignmentStatus: string;
  anomalyFlag: boolean;
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
  override_notes: string | null;
  updated_at: string;
};

export type HistoricalRoleAlignmentOverrideInput = {
  year: number;
  userid: string;
  forcedRole?: string | null;
  forcedArea?: string | null;
  notes?: string | null;
};

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function mapRow(row: DbRow): HistoricalRoleAlignmentRow {
  const forcedRole = normalizeOptionalString(row.forced_role);
  const forcedArea = normalizeOptionalString(row.forced_area);
  const notes = row.override_notes || "";
  const effectiveRole = forcedRole || row.primary_role;
  const effectiveArea = forcedArea || row.primary_area;
  const hasOverride = Boolean(forcedRole || forcedArea || notes.trim());

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
    notes,
    effectiveRole,
    effectiveArea,
    alignmentStatus: hasOverride ? "Override saved" : row.review_flag === 1 ? "Needs review" : "Aligned",
    anomalyFlag: row.review_flag === 1,
    updatedAt: row.updated_at,
  };
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeNotes(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

export function listHistoricalRoleAlignment(
  year: number
): HistoricalRoleAlignmentRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT
        alignment.*,
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

  return rows.map(mapRow);
}

export function saveHistoricalRoleAlignmentOverride(
  input: HistoricalRoleAlignmentOverrideInput
) {
  const year = input.year;
  const userid = normalizeOptionalString(input.userid);
  const forcedRole = normalizeOptionalString(input.forcedRole);
  const forcedArea = normalizeOptionalString(input.forcedArea);
  const notes = normalizeNotes(input.notes);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("Invalid year");
  }

  if (!userid) {
    throw new Error("Missing userid");
  }

  const db = getDb();

  if (!forcedRole && !forcedArea && !notes) {
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
      forced_role,
      forced_area,
      notes,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(year, subject_key) DO UPDATE SET
      forced_role = excluded.forced_role,
      forced_area = excluded.forced_area,
      notes = excluded.notes,
      updated_at = excluded.updated_at
    `
  ).run(year, userid, forcedRole, forcedArea, notes, updatedAt);

  return {
    status: "saved",
    year,
    userid,
    forcedRole,
    forcedArea,
    notes,
    updatedAt,
  };
}
