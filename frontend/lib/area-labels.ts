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
    aliases: ["3", "cooler", "clrmeat", "clrdairy"],
  },
  {
    key: "4",
    label: "Produce",
    aliases: ["4", "produce", "produce cooler"],
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
  cooler: ["ClrDairy", "ClrMeat", "Produce"],
  freezer: ["FrzLet", "FrzMix", "FrzPIR", "FrzPut"],
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
    aliases: ["cooler", "chicken/iced product", "chicken iced product", "produce"],
  },
  {
    key: "freezer",
    label: "Freezer",
    leafAreaCodes: ["6", "7"],
    aliases: ["freezer", "freezer floor", "freezer pir", "frzlet", "frzmix", "frzput"],
  },
];

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
