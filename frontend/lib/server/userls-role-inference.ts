export const USERLS_ROLE_CONFIDENCE_THRESHOLD = 0.7;

export type UserlsObservedArea =
  | "Freezer"
  | "Dry PIR"
  | "Freezer PIR"
  | "FrzMix"
  | "DryMix"
  | "DryFlr"
  | "ClrDairy"
  | "ClrMeat"
  | "Produce"
  | "Receiving"
  | "Mixed"
  | "Extra";

export type UserlsObservedRole =
  | "FrzLet"
  | "FrzPut"
  | "FrzMix"
  | "DryMix"
  | "DryFlr"
  | "Dry PIR"
  | "Freezer PIR"
  | "ClrDairy"
  | "ClrMeat"
  | "Produce"
  | "Receiving"
  | "Mixed"
  | "Extra";

export type UserlsTransactionLike = {
  transDate?: string | null;
  time?: string | null;
  item?: string | null;
  itemNumber?: string | null;
  palletDate?: string | null;
  transType?: string | null;
  bin?: string | null;
  qty?: number | string | null;
  plateCount?: number | string | null;
};

export type UserlsParsedUserLike = {
  userid?: string | null;
  name?: string | null;
  transactions?: UserlsTransactionLike[];
};

export type UserlsParsedPayloadLike = {
  reportDate?: string | null;
  users?: UserlsParsedUserLike[];
};

export type WorkloadBreakdownRow = {
  label: string;
  plates: number;
  pieces: number;
  plateShare: number;
  pieceShare: number | null;
};

export type ReceivingInferenceSummary = {
  receivedPlates: number;
  inferredPlates: number;
  unmatchedPlates: number;
  inferredShare: number | null;
  method: "same-week-item-putaway";
  note: string;
};

export type UserlsObservedAssignment = {
  userid: string;
  name: string | null;
  observedArea: UserlsObservedArea;
  observedAreaConfidence: number | null;
  observedRole: UserlsObservedRole;
  observedRoleConfidence: number | null;
  mixedWorkFlag: boolean;
  roleInferenceSource: "userls_transactions";
  roleInferenceThreshold: number;
  roleBreakdown: WorkloadBreakdownRow[];
  areaBreakdown: WorkloadBreakdownRow[];
  receivingInference: ReceivingInferenceSummary;
};

type WorkloadCounter = {
  plates: number;
  pieces: number;
};

type UserAccumulator = {
  userid: string;
  name: string | null;
  roleCounts: Map<UserlsObservedRole, WorkloadCounter>;
  areaCounts: Map<UserlsObservedArea, WorkloadCounter>;
  familyCounts: Map<UserlsObservedArea, WorkloadCounter>;
  familyRoleCounts: Map<UserlsObservedArea, Map<UserlsObservedRole, WorkloadCounter>>;
  receivedPlates: number;
  inferredReceivingPlates: number;
};

type PutawayCandidate = {
  item: string;
  palletDate: string;
  timestamp: number;
  area: UserlsObservedArea;
};

const DRY_MIX_ZONES = new Set(["1-a", "1-n", "1-p", "1-q", "1-r", "1-s", "1-t"]);
const DRY_FLR_ZONES = new Set([
  "1-b",
  "1-c",
  "1-d",
  "1-e",
  "1-f",
  "1-g",
  "1-h",
  "1-j",
  "1-k",
  "1-l",
]);
const FRZ_MIX_ZONES = new Set(["6-c", "6-d", "6-w"]);
const CLR_DAIRY_ZONES = new Set(["3-a", "3-b"]);
const CLR_MEAT_ZONES = new Set(["2-d", "3-c", "3-d", "3-s"]);
const PRODUCE_ZONES = new Set(["2-e", "2-f"]);

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
}

function txItem(tx: UserlsTransactionLike): string {
  return asString(tx.itemNumber) || asString(tx.item);
}

function txPieces(tx: UserlsTransactionLike): number {
  return Math.abs(asNumber(tx.qty));
}

function txPlates(tx: UserlsTransactionLike): number {
  const plates = Math.abs(asNumber(tx.plateCount));
  return plates > 0 ? plates : 1;
}

function txTimestamp(tx: UserlsTransactionLike): number {
  const date = asString(tx.transDate);
  const time = asString(tx.time) || "00:00:00";
  const parsed = Date.parse(`${date}T${time}Z`);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeZone(bin: string | null | undefined): string | null {
  const cleaned = asString(bin).toLowerCase().replace(/_/g, "-").replace(/\s+/g, "");
  const match = cleaned.match(/^(\d+)[-/]?([a-z])/);
  if (!match) return null;
  return `${match[1]}-${match[2]}`;
}

function leadingArea(bin: string | null | undefined): string | null {
  const match = asString(bin).match(/^(\d+)/);
  return match ? match[1] : null;
}

export function inferAreaFromBin(bin: string | null | undefined): UserlsObservedArea {
  const area = leadingArea(bin);
  const zone = normalizeZone(bin);

  if (area === "7") return "Freezer PIR";
  if (area === "5") return "Dry PIR";
  if (zone && FRZ_MIX_ZONES.has(zone)) return "FrzMix";
  if (zone && DRY_MIX_ZONES.has(zone)) return "DryMix";
  if (zone && DRY_FLR_ZONES.has(zone)) return "DryFlr";
  if (zone && CLR_DAIRY_ZONES.has(zone)) return "ClrDairy";
  if (zone && CLR_MEAT_ZONES.has(zone)) return "ClrMeat";
  if (area === "4" || (zone && PRODUCE_ZONES.has(zone))) return "Produce";

  return "Extra";
}

function inferFamilyFromTransaction(
  tx: UserlsTransactionLike,
  receivingArea: UserlsObservedArea | null
): UserlsObservedArea {
  const type = asString(tx.transType);
  const area = leadingArea(tx.bin);
  const zone = normalizeZone(tx.bin);

  if (type === "Receive") return "Receiving";
  if (zone && FRZ_MIX_ZONES.has(zone)) return "FrzMix";
  if (area === "6") return "Freezer";

  return receivingArea || inferAreaFromBin(tx.bin);
}

function inferRoleFromTransaction(
  tx: UserlsTransactionLike,
  receivingArea: UserlsObservedArea | null
): UserlsObservedRole {
  const type = asString(tx.transType);
  const bin = asString(tx.bin);
  const zone = normalizeZone(bin);
  const area = leadingArea(bin);
  const observedArea = receivingArea || inferAreaFromBin(bin);

  if (type === "Receive") return "Receiving";
  if (observedArea === "FrzMix") return "FrzMix";
  if (observedArea === "DryMix") return "DryMix";
  if (observedArea === "DryFlr") return "DryFlr";
  if (observedArea === "Dry PIR") return "Dry PIR";
  if (observedArea === "Freezer PIR") return "Freezer PIR";
  if (observedArea === "ClrDairy") return "ClrDairy";
  if (observedArea === "ClrMeat") return "ClrMeat";
  if (observedArea === "Produce") return "Produce";

  if (area === "6" && !(zone && FRZ_MIX_ZONES.has(zone))) {
    if (type === "Letdown") return "FrzLet";
    if (type === "Putaway") return "FrzPut";
  }

  return "Extra";
}

function inferFamilyRoleFromTransaction(
  tx: UserlsTransactionLike,
  family: UserlsObservedArea
): UserlsObservedRole | null {
  const type = asString(tx.transType);

  if (family === "Receiving") return "Receiving";
  if (family === "FrzMix") return "FrzMix";
  if (family === "Freezer") {
    if (type === "Putaway") return "FrzPut";
    if (type === "Letdown") return "FrzLet";
    return null;
  }
  if (family === "DryMix") return "DryMix";
  if (family === "DryFlr") return "DryFlr";
  if (family === "Dry PIR") return "Dry PIR";
  if (family === "Freezer PIR") return "Freezer PIR";
  if (family === "ClrDairy") return "ClrDairy";
  if (family === "ClrMeat") return "ClrMeat";
  if (family === "Produce") return "Produce";

  return "Extra";
}

function addWorkload<T extends string>(
  map: Map<T, WorkloadCounter>,
  label: T,
  plates: number,
  pieces: number
) {
  const current = map.get(label) || { plates: 0, pieces: 0 };
  current.plates += plates;
  current.pieces += pieces;
  map.set(label, current);
}

function addFamilyRoleWorkload(
  map: Map<UserlsObservedArea, Map<UserlsObservedRole, WorkloadCounter>>,
  family: UserlsObservedArea,
  role: UserlsObservedRole,
  plates: number,
  pieces: number
) {
  let roleMap = map.get(family);
  if (!roleMap) {
    roleMap = new Map();
    map.set(family, roleMap);
  }

  addWorkload(roleMap, role, plates, pieces);
}

function buildBreakdown<T extends string>(map: Map<T, WorkloadCounter>): WorkloadBreakdownRow[] {
  const totalPlates = [...map.values()].reduce((sum, row) => sum + row.plates, 0);
  const totalPieces = [...map.values()].reduce((sum, row) => sum + row.pieces, 0);

  return [...map.entries()]
    .map(([label, row]) => ({
      label,
      plates: row.plates,
      pieces: row.pieces,
      plateShare: totalPlates ? Number((row.plates / totalPlates).toFixed(4)) : 0,
      pieceShare: totalPieces ? Number((row.pieces / totalPieces).toFixed(4)) : null,
    }))
    .sort((a, b) => b.plates - a.plates || b.pieces - a.pieces || a.label.localeCompare(b.label));
}

function chooseObservedLabel<T extends string>(
  breakdown: WorkloadBreakdownRow[],
  mixedLabel: T,
  extraLabel: T
): { label: T; confidence: number | null; mixed: boolean } {
  if (!breakdown.length) {
    return { label: extraLabel, confidence: null, mixed: false };
  }

  const top = breakdown[0];
  if (top.plateShare >= USERLS_ROLE_CONFIDENCE_THRESHOLD) {
    return {
      label: top.label as T,
      confidence: top.plateShare,
      mixed: false,
    };
  }

  return {
    label: mixedLabel,
    confidence: top.plateShare,
    mixed: true,
  };
}

function chooseFamilyLabel(
  breakdown: WorkloadBreakdownRow[]
): { label: UserlsObservedArea; confidence: number | null; mixed: boolean } {
  if (!breakdown.length) {
    return { label: "Extra", confidence: null, mixed: false };
  }

  const top = breakdown[0];
  if (top.label === "Extra" && top.plateShare >= USERLS_ROLE_CONFIDENCE_THRESHOLD) {
    return { label: "Extra", confidence: top.plateShare, mixed: false };
  }

  const knownRows = breakdown.filter((row) => row.label !== "Extra");
  const knownPlates = knownRows.reduce((sum, row) => sum + row.plates, 0);
  if (!knownRows.length || knownPlates <= 0) {
    return { label: "Extra", confidence: top.plateShare, mixed: false };
  }

  const knownTop = knownRows[0];
  const knownShare = Number((knownTop.plates / knownPlates).toFixed(4));
  if (knownShare >= USERLS_ROLE_CONFIDENCE_THRESHOLD) {
    return {
      label: knownTop.label as UserlsObservedArea,
      confidence: knownShare,
      mixed: false,
    };
  }

  return { label: "Mixed", confidence: knownShare, mixed: true };
}

function collectPutawayCandidates(
  dailyPayloads: Array<{ date: string; payload: UserlsParsedPayloadLike }>
): PutawayCandidate[] {
  const candidates: PutawayCandidate[] = [];

  for (const { payload } of dailyPayloads) {
    for (const user of payload.users || []) {
      for (const tx of user.transactions || []) {
        if (asString(tx.transType) !== "Putaway") continue;

        const item = txItem(tx);
        if (!item || !asString(tx.bin)) continue;

        const area = inferAreaFromBin(tx.bin);
        if (area === "Extra") continue;

        candidates.push({
          item,
          palletDate: asString(tx.palletDate),
          timestamp: txTimestamp(tx),
          area,
        });
      }
    }
  }

  return candidates.sort((a, b) => a.timestamp - b.timestamp);
}

function findReceivingArea(
  tx: UserlsTransactionLike,
  putawayCandidates: PutawayCandidate[]
): UserlsObservedArea | null {
  const item = txItem(tx);
  if (!item) return null;

  const palletDate = asString(tx.palletDate);
  const timestamp = txTimestamp(tx);
  const sameItem = putawayCandidates.filter((candidate) => candidate.item === item);
  if (!sameItem.length) return null;

  const samePalletLater = sameItem.find(
    (candidate) =>
      candidate.palletDate &&
      candidate.palletDate === palletDate &&
      candidate.timestamp >= timestamp
  );
  if (samePalletLater) return samePalletLater.area;

  const later = sameItem.find((candidate) => candidate.timestamp >= timestamp);
  if (later) return later.area;

  const samePalletAnyTime = sameItem.find(
    (candidate) => candidate.palletDate && candidate.palletDate === palletDate
  );
  if (samePalletAnyTime) return samePalletAnyTime.area;

  return sameItem[0]?.area || null;
}

function getAccumulator(
  map: Map<string, UserAccumulator>,
  userid: string,
  name: string | null
): UserAccumulator {
  const existing = map.get(userid);
  if (existing) {
    if (name) existing.name = name;
    return existing;
  }

  const created: UserAccumulator = {
    userid,
    name,
    roleCounts: new Map(),
    areaCounts: new Map(),
    familyCounts: new Map(),
    familyRoleCounts: new Map(),
    receivedPlates: 0,
    inferredReceivingPlates: 0,
  };
  map.set(userid, created);
  return created;
}

export function buildUserlsObservedAssignments(
  dailyPayloads: Array<{ date: string; payload: UserlsParsedPayloadLike }>
): Map<string, UserlsObservedAssignment> {
  const putawayCandidates = collectPutawayCandidates(dailyPayloads);
  const users = new Map<string, UserAccumulator>();

  for (const { payload } of dailyPayloads) {
    for (const user of payload.users || []) {
      const userid = asString(user.userid);
      if (!userid) continue;

      const acc = getAccumulator(users, userid, asString(user.name) || null);
      for (const tx of user.transactions || []) {
        const type = asString(tx.transType);
        if (type === "Pick") continue;

        const plates = txPlates(tx);
        const pieces = txPieces(tx);

        let area: UserlsObservedArea = inferAreaFromBin(tx.bin);
        let receivingArea: UserlsObservedArea | null = null;

        if (type === "Receive") {
          acc.receivedPlates += plates;
          receivingArea = findReceivingArea(tx, putawayCandidates);
          if (receivingArea) {
            area = receivingArea;
            acc.inferredReceivingPlates += plates;
          } else {
            area = "Extra";
          }
        }

        const family = inferFamilyFromTransaction(tx, receivingArea);
        const role = inferRoleFromTransaction(tx, receivingArea);
        const familyRole = inferFamilyRoleFromTransaction(tx, family);
        addWorkload(acc.areaCounts, area, plates, pieces);
        addWorkload(acc.roleCounts, role, plates, pieces);
        addWorkload(acc.familyCounts, family, plates, pieces);
        if (familyRole) {
          addFamilyRoleWorkload(acc.familyRoleCounts, family, familyRole, plates, pieces);
        }
      }
    }
  }

  const out = new Map<string, UserlsObservedAssignment>();
  for (const acc of users.values()) {
    const areaBreakdown = buildBreakdown(acc.areaCounts);
    const roleBreakdown = buildBreakdown(acc.roleCounts);
    const familyBreakdown = buildBreakdown(acc.familyCounts);
    const familyChoice = chooseFamilyLabel(familyBreakdown);
    const familyRoleBreakdown =
      familyChoice.label !== "Mixed"
        ? buildBreakdown(acc.familyRoleCounts.get(familyChoice.label) || new Map())
        : [];
    const roleChoice =
      familyChoice.label === "Mixed"
        ? { label: "Mixed" as UserlsObservedRole, confidence: familyChoice.confidence, mixed: true }
        : chooseObservedLabel<UserlsObservedRole>(familyRoleBreakdown, "Mixed", "Extra");
    const inferredShare = acc.receivedPlates
      ? Number((acc.inferredReceivingPlates / acc.receivedPlates).toFixed(4))
      : null;

    out.set(acc.userid, {
      userid: acc.userid,
      name: acc.name,
      observedArea: familyChoice.label,
      observedAreaConfidence: familyChoice.confidence,
      observedRole: roleChoice.label,
      observedRoleConfidence: roleChoice.confidence,
      mixedWorkFlag: familyChoice.mixed || roleChoice.mixed,
      roleInferenceSource: "userls_transactions",
      roleInferenceThreshold: USERLS_ROLE_CONFIDENCE_THRESHOLD,
      roleBreakdown: familyRoleBreakdown.length ? familyRoleBreakdown : roleBreakdown,
      areaBreakdown: familyBreakdown.length ? familyBreakdown : areaBreakdown,
      receivingInference: {
        receivedPlates: acc.receivedPlates,
        inferredPlates: acc.inferredReceivingPlates,
        unmatchedPlates: acc.receivedPlates - acc.inferredReceivingPlates,
        inferredShare,
        method: "same-week-item-putaway",
        note:
          "Receive rows are matched to same-week Putaway rows by item number, preferring matching pallet date and later timestamp.",
      },
    });
  }

  return out;
}
