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

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function mapRow(row: DbRow): HistoricalRoleAlignmentRow {
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
    updatedAt: row.updated_at,
  };
}

export function listHistoricalRoleAlignment(
  year: number
): HistoricalRoleAlignmentRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT *
      FROM historical_role_alignment
      WHERE year = ?
      ORDER BY
        review_flag DESC,
        COALESCE(primary_role_share, -1) ASC,
        yearly_repl_plates DESC,
        userid ASC
      `
    )
    .all(year) as DbRow[];

  return rows.map(mapRow);
}
