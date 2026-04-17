import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createJiti } = require("jiti");

const tempDir = mkdtempSync(path.join(tmpdir(), "historical-role-alignment-"));
process.env.WAREHOUSE_DB_PATH = path.join(tempDir, "warehouse-dashboard-test.db");

const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.resolve("."),
  },
});

const { getDb } = jiti("@/lib/server/db.ts");
const { listHistoricalRoleAlignment, historicalRoleAlignmentTestInternals } = jiti(
  "@/lib/server/historical-role-alignment.ts"
);

const YEAR = 2026;
const NOW = "2026-04-17T12:00:00.000Z";

function db() {
  return getDb();
}

function resetDb() {
  db().exec(`
    DELETE FROM historical_role_alignment_range_overrides;
    DELETE FROM historical_role_alignment_overrides;
    DELETE FROM historical_role_alignment;
    DELETE FROM snapshots;
    DELETE FROM key_value_store;
  `);
}

function setRfMappings(mappings) {
  db()
    .prepare(
      `
      INSERT INTO key_value_store (namespace, key, payload_json, source_path, updated_at)
      VALUES ('config', 'rf-mappings', ?, NULL, ?)
      `
    )
    .run(JSON.stringify({ mappings }), NOW);
}

function insertAlignment(overrides = {}) {
  const row = {
    year: YEAR,
    userid: "raw-op",
    name: "Raw Operator",
    primary_role: "Replenishment",
    primary_role_share: 0.9,
    primary_area: "A1",
    primary_area_share: 0.9,
    primary_activity_area: "A1",
    yearly_repl_plates: 100,
    yearly_repl_pieces: 100,
    yearly_receiving_plates: 0,
    yearly_receiving_pieces: 0,
    yearly_pick_plates: 0,
    yearly_pick_pieces: 0,
    active_days: 1,
    active_weeks: 1,
    role_confidence: "high",
    area_confidence: "high",
    review_flag: 1,
    role_mix_json: "[]",
    area_mix_json: "[]",
    source_summary_json: "{}",
    updated_at: NOW,
    ...overrides,
  };

  db()
    .prepare(
      `
      INSERT INTO historical_role_alignment (
        year,
        userid,
        name,
        primary_role,
        primary_role_share,
        primary_area,
        primary_area_share,
        primary_activity_area,
        yearly_repl_plates,
        yearly_repl_pieces,
        yearly_receiving_plates,
        yearly_receiving_pieces,
        yearly_pick_plates,
        yearly_pick_pieces,
        active_days,
        active_weeks,
        role_confidence,
        area_confidence,
        review_flag,
        role_mix_json,
        area_mix_json,
        source_summary_json,
        updated_at
      )
      VALUES (
        @year,
        @userid,
        @name,
        @primary_role,
        @primary_role_share,
        @primary_area,
        @primary_area_share,
        @primary_activity_area,
        @yearly_repl_plates,
        @yearly_repl_pieces,
        @yearly_receiving_plates,
        @yearly_receiving_pieces,
        @yearly_pick_plates,
        @yearly_pick_pieces,
        @active_days,
        @active_weeks,
        @role_confidence,
        @area_confidence,
        @review_flag,
        @role_mix_json,
        @area_mix_json,
        @source_summary_json,
        @updated_at
      )
      `
    )
    .run(row);

  return row;
}

function insertDailySnapshot(dateKey, userid = "raw-op", replenishmentNoRecvPlates = 100) {
  const payload = {
    users: [
      {
        userid,
        replenishmentNoRecvPlates,
        roleBuckets: [
          {
            role: "Replenishment",
            replenishmentNoRecvPlates,
          },
        ],
        areaBuckets: [
          {
            areaCode: "A1",
            replenishmentNoRecvPlates,
          },
        ],
      },
    ],
  };

  db()
    .prepare(
      `
      INSERT INTO snapshots (
        snapshot_type,
        date_key,
        payload_json,
        source_path,
        source_mtime,
        updated_at
      )
      VALUES ('userls_daily', ?, ?, NULL, NULL, ?)
      `
    )
    .run(dateKey, JSON.stringify(payload), NOW);
}

function insertRange({
  id,
  subjectKey = "employee:123",
  startDate = "2026-01-01",
  endDate = "2026-01-31",
  source = "manual",
  forcedRole = "Replenishment",
  forcedArea = "A1",
}) {
  db()
    .prepare(
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
      VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, ?)
      `
    )
    .run(id, YEAR, subjectKey, startDate, endDate, forcedRole, forcedArea, source, NOW);
}

function insertGlobalOverride(subjectKey = "employee:123") {
  db()
    .prepare(
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
      VALUES (?, ?, NULL, NULL, 'Replenishment', 'A1', 'global override', ?)
      `
    )
    .run(YEAR, subjectKey, NOW);
}

function canonicalMapping() {
  return [
    {
      rfUsername: "raw-op",
      employeeId: "123",
      effectiveStartDate: "2026-01-01",
      effectiveEndDate: "2026-12-31",
      active: true,
    },
  ];
}

function listSingleRow() {
  const rows = listHistoricalRoleAlignment(YEAR);
  assert.equal(rows.length, 1);
  return rows[0];
}

function dbRow(overrides = {}) {
  return {
    year: YEAR,
    userid: "raw-op",
    name: "Raw Operator",
    primary_role: "Replenishment",
    primary_role_share: 0.9,
    primary_area: "A1",
    primary_area_share: 0.9,
    primary_activity_area: "A1",
    yearly_repl_plates: 100,
    yearly_repl_pieces: 100,
    yearly_receiving_plates: 0,
    yearly_receiving_pieces: 0,
    yearly_pick_plates: 0,
    yearly_pick_pieces: 0,
    active_days: 1,
    active_weeks: 1,
    role_confidence: "high",
    area_confidence: "high",
    review_flag: 1,
    role_mix_json: "[]",
    area_mix_json: "[]",
    source_summary_json: "{}",
    updated_at: NOW,
    ...overrides,
  };
}

function suggestedSegment(overrides = {}) {
  return {
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    suggestedArea: "A1",
    suggestedRole: "Replenishment",
    areaShare: 1,
    roleShare: 1,
    replenishmentPlates: 100,
    segmentType: "stable",
    reason: "Dominant area and role are stable for this period.",
    coverageState: "uncovered",
    appliedRole: null,
    appliedArea: null,
    appliedStartDate: null,
    appliedEndDate: null,
    appliedCoverageLabel: "Uncovered",
    ...overrides,
  };
}

beforeEach(() => {
  resetDb();
});

after(() => {
  global.__warehouseDashboardDb?.close();
  global.__warehouseDashboardDb = undefined;
  rmSync(tempDir, { recursive: true, force: true });
});

test("canonical subjectKey coverage and suggested segments load for mapped userls_daily userid", () => {
  setRfMappings(canonicalMapping());
  insertAlignment();
  insertDailySnapshot("2026-01-06");
  insertRange({ id: "canonical-range" });

  const row = listSingleRow();

  assert.equal(row.userid, "raw-op");
  assert.equal(row.subjectKey, "employee:123");
  assert.equal(row.observedWeeks, 1);
  assert.equal(row.coveredWeeks, 1);
  assert.equal(row.uncoveredWeeks, 0);
  assert.equal(row.coverageComplete, true);
  assert.equal(row.rangeCoverageDiagnostics.observedCoverageWeeksAvailable, true);
  assert.equal(row.rangeCoverageDiagnostics.coveredBySavedRanges, 1);
  assert.equal(row.suggestedReviewSegments.length, 1);
  assert.equal(row.suggestedReviewSegments[0].suggestedRole, "Replenishment");
  assert.equal(row.suggestedReviewSegments[0].suggestedArea, "A1");
  assert.equal(row.suggestedReviewSegments[0].coverageState, "covered_by_override");
});

test("raw userid coverage and segments remain a fallback when canonical maps are empty", () => {
  const rows = historicalRoleAlignmentTestInternals.buildHistoricalRoleAlignmentRows(
    YEAR,
    [dbRow()],
    [],
    [
      {
        id: "raw-range",
        year: YEAR,
        subject_key: "raw-op",
        start_date: "2026-01-01",
        end_date: "2026-01-31",
        forced_role: "Replenishment",
        forced_area: "A1",
        override_notes: "",
        source: "manual",
        updated_at: NOW,
      },
    ],
    {
      segmentsBySubjectKey: new Map([["raw-op", [suggestedSegment()]]]),
      coverageBySubjectKey: new Map([
        [
          "raw-op",
          {
            observedWeekKeys: new Set(["2026-01-05"]),
            firstObservedDate: "2026-01-06",
            lastObservedDate: "2026-01-06",
          },
        ],
      ]),
    },
    () => "employee:123"
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].subjectKey, "employee:123");
  assert.equal(rows[0].coveredWeeks, 1);
  assert.equal(rows[0].rangeOverrides.length, 1);
  assert.equal(rows[0].rangeOverrides[0].subjectKey, "raw-op");
  assert.equal(rows[0].suggestedReviewSegments.length, 1);
  assert.equal(rows[0].suggestedReviewSegments[0].coverageState, "covered_by_override");
});

test("canonical and legacy saved range overrides both count toward coverage", () => {
  setRfMappings(canonicalMapping());
  insertAlignment({ active_days: 2, active_weeks: 2, yearly_repl_plates: 200 });
  insertDailySnapshot("2026-01-06");
  insertDailySnapshot("2026-01-13");
  insertRange({
    id: "canonical-week",
    subjectKey: "employee:123",
    startDate: "2026-01-05",
    endDate: "2026-01-11",
    source: "manual",
  });
  insertRange({
    id: "legacy-week",
    subjectKey: "raw-op",
    startDate: "2026-01-12",
    endDate: "2026-01-18",
    source: "legacy-range-import",
  });

  const row = listSingleRow();

  assert.equal(row.subjectKey, "employee:123");
  assert.equal(row.observedWeeks, 2);
  assert.equal(row.coveredWeeks, 2);
  assert.equal(row.coverageComplete, true);
  assert.deepEqual(
    row.rangeOverrides.map((range) => range.id),
    ["canonical-week", "legacy-week"]
  );
  assert.equal(row.rangeCoverageDiagnostics.savedRangeCount, 2);
  assert.equal(row.rangeCoverageDiagnostics.manualUiRangeCount, 1);
  assert.equal(row.rangeCoverageDiagnostics.legacyOrImportedRangeCount, 1);
  assert.deepEqual(
    row.rangeCoverageDiagnostics.ranges.map((range) => range.coveredWeeks),
    [1, 1]
  );
});

test("saved ranges do not cover rows when daily observed week keys are unavailable", () => {
  setRfMappings(canonicalMapping());
  insertAlignment({ active_weeks: 2, yearly_repl_plates: 100 });
  insertRange({ id: "canonical-range" });

  const row = listSingleRow();

  assert.equal(row.observedWeeks, 2);
  assert.equal(row.coveredWeeks, 0);
  assert.equal(row.uncoveredWeeks, 2);
  assert.equal(row.coverageComplete, false);
  assert.equal(row.rangeCoverageDiagnostics.observedCoverageWeeksAvailable, false);
  assert.equal(
    row.rangeCoverageDiagnostics.message,
    "Saved ranges exist, but daily observed week keys were not found for this coverage check."
  );
  assert.deepEqual(row.suggestedReviewSegments, []);
  assert.equal(
    row.suggestedReviewExplanation,
    "No meaningful monthly replenishment periods were found in the daily snapshots."
  );
});

test("global override still completes coverage when observed week keys are unavailable", () => {
  setRfMappings(canonicalMapping());
  insertAlignment({ active_weeks: 2, yearly_repl_plates: 100 });
  insertGlobalOverride();

  const row = listSingleRow();

  assert.equal(row.observedWeeks, 2);
  assert.equal(row.coveredWeeks, 2);
  assert.equal(row.uncoveredWeeks, 0);
  assert.equal(row.coverageComplete, true);
  assert.equal(row.reviewQueueReason, "A global override covers the full review period.");
  assert.equal(row.rangeCoverageDiagnostics.observedCoverageWeeksAvailable, false);
});

test("empty suggested segments are valid when there are no meaningful observed weeks", () => {
  setRfMappings(canonicalMapping());
  insertAlignment({
    active_days: 1,
    active_weeks: 1,
    yearly_repl_plates: 0,
    yearly_repl_pieces: 0,
  });
  insertDailySnapshot("2026-01-06", "raw-op", 0);

  const row = listSingleRow();

  assert.equal(row.subjectKey, "employee:123");
  assert.equal(row.observedWeeks, 1);
  assert.equal(row.coveredWeeks, 0);
  assert.deepEqual(row.suggestedReviewSegments, []);
  assert.equal(
    row.suggestedReviewExplanation,
    "No meaningful monthly replenishment periods were found in the daily snapshots."
  );
});
