type AreaIdentity = {
  key: string;
  label: string;
  aliases: string[];
};

const AREA_IDENTITIES: AreaIdentity[] = [
  {
    key: "1",
    label: "Dry",
    aliases: ["1", "dry", "dry floor", "dryflr", "drymix"],
  },
  {
    key: "2",
    label: "Chicken/Iced Product",
    aliases: ["2", "chicken iced product", "seafood chicken iced produce", "chicken"],
  },
  {
    key: "3",
    label: "Cooler",
    aliases: ["3", "cooler", "clrmeat", "clrdairy", "clrprdc"],
  },
  {
    key: "4",
    label: "Produce",
    aliases: ["4", "produce", "produce cooler", "clrprdc"],
  },
  {
    key: "5",
    label: "Dry PIR",
    aliases: ["5", "dry pir", "drypir"],
  },
  {
    key: "6",
    label: "Freezer",
    aliases: ["6", "freezer", "freezer floor", "frzlet", "frzmix", "frzput"],
  },
  {
    key: "7",
    label: "Freezer PIR",
    aliases: ["7", "freezer pir", "frzpir"],
  },
];

export type OperationalAreaGroup = {
  key: string;
  label: string;
  leafAreaCodes: string[];
  aliases: string[];
};

const OPERATIONAL_AREA_GROUP_NATIVE_ROLE_LABELS: Record<string, string[]> = {
  dry: ["DryFlr", "DryMix", "DryPIR"],
  cooler: ["ClrDairy", "ClrMeat", "Produce", "ClrPrdc"],
  freezer: ["FrzLet", "FrzMix", "FrzPIR", "FrzPut", "FrzFlr"],
};

const OPERATIONAL_AREA_GROUPS: OperationalAreaGroup[] = [
  {
    key: "dry",
    label: "Dry",
    leafAreaCodes: ["1", "5"],
    aliases: ["dry", "dry floor", "dryflr", "drymix", "dry pir"],
  },
  {
    key: "cooler",
    label: "Cooler",
    leafAreaCodes: ["2", "3", "4"],
    aliases: ["cooler", "chicken/iced product", "chicken iced product", "produce", "clrprdc"],
  },
  {
    key: "freezer",
    label: "Freezer",
    leafAreaCodes: ["6", "7"],
    aliases: ["freezer", "freezer floor", "freezer pir", "frzflr", "frzlet", "frzmix", "frzput"],
  },
];

export const CANONICAL_OBSERVED_WORK_ROLE_ORDER = [
  "Receiving",
  "FrzFlr",
  "FrzMix",
  "FrzPIR",
  "DryFlr",
  "DryMix",
  "DryPIR",
  "ClrPrdc",
  "ClrMeat",
  "ClrDairy",
  "Unclassified",
] as const;

export type CanonicalObservedWorkRole =
  (typeof CANONICAL_OBSERVED_WORK_ROLE_ORDER)[number];

export const AREA_DETAIL_OBSERVED_ROLE_ORDER = [
  "FrzPut",
  "FrzLet",
  "FrzMix",
  "FrzPIR",
  "DryFlr",
  "DryMix",
  "DryPIR",
  "ClrPrdc",
  "ClrMeat",
  "ClrDairy",
  "Unclassified",
] as const;

export type AreaDetailObservedRole =
  (typeof AREA_DETAIL_OBSERVED_ROLE_ORDER)[number];

function normalizeAreaToken(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value: unknown) {
  return String(value || "").trim();
}

function buildIdentity(identity: AreaIdentity, rawValue?: string): AreaIdentity {
  return {
    ...identity,
    aliases: rawValue ? [rawValue, ...identity.aliases] : identity.aliases,
  };
}

function normalizeGroupToken(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildGroupIdentity(identity: OperationalAreaGroup, rawValue?: string): OperationalAreaGroup {
  return {
    ...identity,
    aliases: rawValue ? [rawValue, ...identity.aliases] : identity.aliases,
  };
}

export function resolveAreaIdentity(value: unknown): AreaIdentity | null {
  const raw = normalizeKey(value);
  const token = normalizeAreaToken(value);

  if (!raw && !token) return null;

  for (const identity of AREA_IDENTITIES) {
    if (raw === identity.key) {
      return buildIdentity(identity, raw);
    }

    if (identity.aliases.includes(token)) {
      return buildIdentity(identity, raw);
    }
  }

  if (!raw) return null;

  return {
    key: raw,
    label: raw,
    aliases: [raw],
  };
}

export function formatAreaLabel(value: unknown) {
  return resolveAreaIdentity(value)?.label || String(value || "").trim() || "Unknown";
}

export function areaMatches(value: unknown, areaKey: string) {
  const identity = resolveAreaIdentity(value);
  if (!identity) return false;
  return identity.key === areaKey;
}

export function resolveOperationalAreaGroup(value: unknown): OperationalAreaGroup | null {
  const raw = normalizeKey(value);
  const token = normalizeGroupToken(value);
  const leafIdentity = resolveAreaIdentity(value);

  if (!raw && !token) return null;

  for (const group of OPERATIONAL_AREA_GROUPS) {
    if (group.key === token || group.label.toLowerCase() === token) {
      return buildGroupIdentity(group, raw);
    }

    if (group.aliases.includes(token)) {
      return buildGroupIdentity(group, raw);
    }

    if (leafIdentity && group.leafAreaCodes.includes(leafIdentity.key)) {
      return buildGroupIdentity(group, raw);
    }

    if (raw === group.key) {
      return buildGroupIdentity(group, raw);
    }
  }

  return null;
}

export function formatOperationalAreaLabel(value: unknown) {
  return resolveOperationalAreaGroup(value)?.label || String(value || "").trim() || "Unknown";
}

export function operationalAreaGroupIncludesLeaf(groupKey: string, leafAreaCode: unknown) {
  const group = OPERATIONAL_AREA_GROUPS.find((item) => item.key === groupKey);
  if (!group) return false;
  const leafIdentity = resolveAreaIdentity(leafAreaCode);
  if (!leafIdentity) return false;
  return group.leafAreaCodes.includes(leafIdentity.key);
}

export function operationalAreaGroupNativeRoleLabels(groupKey: string) {
  return [...(OPERATIONAL_AREA_GROUP_NATIVE_ROLE_LABELS[groupKey] || [])];
}

export function operationalAreaGroupHasNativeRoleLabel(groupKey: string, roleLabel: unknown) {
  const normalized = String(roleLabel || "").trim();
  if (!normalized) return false;
  return operationalAreaGroupNativeRoleLabels(groupKey).includes(normalized);
}

export function resolveCanonicalObservedWorkRoleLabel(
  value: unknown
): CanonicalObservedWorkRole {
  const raw = String(value || "").trim();
  const compact = raw.toLowerCase().replace(/[^a-z0-9]+/g, "");

  if (
    !compact ||
    compact === "mixed" ||
    compact === "other" ||
    compact === "unknown" ||
    compact === "extra" ||
    compact === "unclassified"
  ) {
    return "Unclassified";
  }

  if (
    compact === "receiving" ||
    compact === "frzrcv" ||
    compact === "clrrcv" ||
    compact === "dryrcv" ||
    compact === "mixrcv" ||
    compact.includes("receiving")
  ) {
    return "Receiving";
  }

  if (
    compact === "frzflr" ||
    compact === "freezerfloor" ||
    compact === "freezerflr" ||
    compact === "frzput" ||
    compact === "frzlet" ||
    compact === "freezerput" ||
    compact === "freezerlet" ||
    compact === "freezerputaway" ||
    compact === "freezerletdown"
  ) {
    return "FrzFlr";
  }
  if (compact === "frzmix" || compact === "freezermix") return "FrzMix";
  if (compact === "frzpir" || compact === "freezerpir" || compact === "7") return "FrzPIR";

  if (compact === "dryflr" || compact === "dryfloor") return "DryFlr";
  if (compact === "drymix") return "DryMix";
  if (compact === "drypir" || compact === "5") return "DryPIR";

  if (
    compact === "clrprdc" ||
    compact === "coolerproduce" ||
    compact === "produce" ||
    compact === "producecooler" ||
    compact === "4"
  ) {
    return "ClrPrdc";
  }
  if (compact === "clrmeat" || compact === "coolermeat") return "ClrMeat";
  if (compact === "clrdairy" || compact === "coolerdairy") return "ClrDairy";

  return "Unclassified";
}

export function resolveAreaDetailObservedRoleLabel(value: unknown): AreaDetailObservedRole {
  const raw = String(value || "").trim();
  const compact = raw.toLowerCase().replace(/[^a-z0-9]+/g, "");

  if (
    !compact ||
    compact === "mixed" ||
    compact === "other" ||
    compact === "unknown" ||
    compact === "extra" ||
    compact === "unclassified" ||
    compact.includes("receiving")
  ) {
    return "Unclassified";
  }

  if (compact === "frzput" || compact === "freezerput" || compact === "freezerputaway") {
    return "FrzPut";
  }
  if (compact === "frzlet" || compact === "freezerlet" || compact === "freezerletdown") {
    return "FrzLet";
  }
  if (compact === "frzmix" || compact === "freezermix") return "FrzMix";
  if (compact === "frzpir" || compact === "freezerpir" || compact === "7") return "FrzPIR";

  if (compact === "dryflr" || compact === "dryfloor") return "DryFlr";
  if (compact === "drymix") return "DryMix";
  if (compact === "drypir" || compact === "5") return "DryPIR";

  if (
    compact === "clrprdc" ||
    compact === "coolerproduce" ||
    compact === "produce" ||
    compact === "producecooler" ||
    compact === "4"
  ) {
    return "ClrPrdc";
  }
  if (compact === "clrmeat" || compact === "coolermeat") return "ClrMeat";
  if (compact === "clrdairy" || compact === "coolerdairy") return "ClrDairy";

  return "Unclassified";
}

export function resolveAssignedAreaLabel(value: unknown): string | null {
  const raw = String(value || "").trim();
  const compact = raw.toLowerCase().replace(/[^a-z0-9]+/g, "");

  if (!compact) return null;

  if (
    compact === "receiving" ||
    compact === "frzrcv" ||
    compact === "clrrcv" ||
    compact === "dryrcv" ||
    compact === "mixrcv" ||
    compact.includes("receiving")
  ) {
    return "Receiving";
  }

  if (
    compact.startsWith("frzput") ||
    compact.startsWith("frzlet") ||
    compact.startsWith("frzmix") ||
    compact.startsWith("frzpir")
  ) {
    return "Freezer";
  }

  if (
    compact.startsWith("dryflr") ||
    compact.startsWith("drymix") ||
    compact.startsWith("drypir")
  ) {
    return "Dry";
  }

  if (
    compact.startsWith("clrmeat") ||
    compact.startsWith("clrdairy") ||
    compact === "produce" ||
    compact.startsWith("produce")
  ) {
    return "Cooler";
  }

  if (raw === "7" || compact.startsWith("7") || compact.includes("freezerpir")) {
    return "Freezer PIR";
  }
  if (raw === "5" || compact.startsWith("5")) {
    return "Dry PIR";
  }
  if (raw === "6" || compact.startsWith("6") || compact.startsWith("frz") || compact.includes("freezer")) {
    return "Freezer";
  }
  if (raw === "1" || compact.startsWith("1") || compact.startsWith("dry")) {
    return "Dry";
  }
  if (
    raw === "2" ||
    raw === "3" ||
    raw === "4" ||
    compact.startsWith("2") ||
    compact.startsWith("3") ||
    compact.startsWith("4") ||
    compact.startsWith("clr") ||
    compact.includes("cooler") ||
    compact.includes("produce") ||
    compact.includes("seafood") ||
    compact.includes("chicken") ||
    compact.includes("icedproduct")
  ) {
    return "Cooler";
  }
  if (compact === "other" || compact === "unknown" || compact === "mixed") {
    return null;
  }

  const group = resolveOperationalAreaGroup(raw);
  return group?.label || null;
}

const DISPLAY_ROLE_LABEL_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;

export function resolveDisplayRoleLabel(...values: unknown[]) {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (!normalized) continue;
    if (!DISPLAY_ROLE_LABEL_PATTERN.test(normalized)) continue;
    return normalized;
  }

  return null;
}

export function resolveRolePerformanceLabel(value: unknown): string | null {
  const raw = String(value || "").trim();
  const compact = raw.toLowerCase().replace(/[^a-z0-9]+/g, "");

  if (!compact || compact === "mixed" || compact === "other" || compact === "unknown") {
    return null;
  }

  if (
    compact === "receiving" ||
    compact === "frzrcv" ||
    compact === "clrrcv" ||
    compact === "dryrcv" ||
    compact === "mixrcv" ||
    compact.includes("receiving")
  ) {
    return "Receiving";
  }

  if (compact.startsWith("frzput") || compact.includes("freezerputaway")) return "FrzPut";
  if (compact.startsWith("frzlet") || compact.includes("freezerletdown")) return "FrzLet";
  if (compact.startsWith("frzmix") || compact.includes("freezermix")) return "FrzMix";
  if (compact.startsWith("frzpir") || compact.includes("freezerpir")) return "FrzPIR";

  if (compact.startsWith("dryflr") || compact.startsWith("dryfloor") || compact.includes("dryfloor")) {
    return "DryFlr";
  }
  if (compact.startsWith("drymix") || compact.includes("drymix")) return "DryMix";
  if (compact.startsWith("drypir") || compact.includes("drypir")) return "DryPIR";

  if (compact.startsWith("clrmeat") || compact.includes("coolermeat")) return "ClrMeat";
  if (compact.startsWith("clrdairy") || compact.includes("coolerdairy")) return "ClrDairy";
  if (compact === "produce" || compact.startsWith("produce")) return "Produce";

  return resolveDisplayRoleLabel(raw);
}

export type AssignedDisplaySource =
  | "manual-daily"
  | "saved-daily"
  | "observed-inferred"
  | "home-default"
  | "unknown";

type AssignmentValue = unknown | unknown[];

type AssignedDisplayCandidate = {
  area?: AssignmentValue;
  role?: AssignmentValue;
  assignedArea?: AssignmentValue;
  assignedRole?: AssignmentValue;
  section?: AssignmentValue;
  team?: AssignmentValue;
};

export type CanonicalAssignedDisplayInput = {
  manualDaily?: AssignedDisplayCandidate | null;
  savedDaily?: AssignedDisplayCandidate | null;
  observedInferred?: AssignedDisplayCandidate | null;
  homeDefault?: AssignedDisplayCandidate | null;
  unknownAreaLabel?: string;
  unknownRoleLabel?: string;
};

export type CanonicalAssignedDisplay = {
  area: string;
  role: string;
  areaSource: AssignedDisplaySource;
  roleSource: AssignedDisplaySource;
};

function asCandidateValues(value: AssignmentValue | undefined): unknown[] {
  if (Array.isArray(value)) return value;
  return value === undefined ? [] : [value];
}

function candidateAreaValues(candidate: AssignedDisplayCandidate) {
  return [
    ...asCandidateValues(candidate.assignedArea),
    ...asCandidateValues(candidate.area),
    ...asCandidateValues(candidate.section),
    ...asCandidateValues(candidate.team),
  ];
}

function candidateRoleValues(candidate: AssignedDisplayCandidate) {
  return [
    ...asCandidateValues(candidate.assignedRole),
    ...asCandidateValues(candidate.role),
  ];
}

export function resolveCanonicalAssignedDisplay(
  input: CanonicalAssignedDisplayInput
): CanonicalAssignedDisplay {
  const orderedCandidates: Array<{
    source: Exclude<AssignedDisplaySource, "unknown">;
    candidate?: AssignedDisplayCandidate | null;
  }> = [
    { source: "manual-daily", candidate: input.manualDaily },
    { source: "saved-daily", candidate: input.savedDaily },
    { source: "observed-inferred", candidate: input.observedInferred },
    { source: "home-default", candidate: input.homeDefault },
  ];

  let area = input.unknownAreaLabel || "Other";
  let role = input.unknownRoleLabel || "—";
  let areaSource: AssignedDisplaySource = "unknown";
  let roleSource: AssignedDisplaySource = "unknown";

  for (const { source, candidate } of orderedCandidates) {
    if (!candidate || areaSource !== "unknown") continue;

    for (const value of [...candidateAreaValues(candidate), ...candidateRoleValues(candidate)]) {
      const label = resolveAssignedAreaLabel(value);
      if (!label) continue;
      area = label;
      areaSource = source;
      break;
    }
  }

  for (const { source, candidate } of orderedCandidates) {
    if (!candidate || roleSource !== "unknown") continue;

    for (const value of candidateRoleValues(candidate)) {
      const label = resolveDisplayRoleLabel(value);
      if (!label) continue;
      role = label;
      roleSource = source;
      break;
    }
  }

  return {
    area,
    role,
    areaSource,
    roleSource,
  };
}
