import {
  resolveOperatorIdentity,
  type EmployeeRecord,
  type OperatorDefault,
  type RfMapping,
} from "@/lib/employee-identity";

export type AssignmentAreaMixRow = {
  areaCode?: string | null;
  areaName?: string | null;
  actualMinutes?: number;
  standardMinutes?: number;
  totalMoves?: number;
};

export type AssignmentOperator = {
  userid: string;
  name: string;
  assignedArea?: string | null;
  effectiveAssignedArea?: string | null;
  rawAssignedArea?: string | null;
  assignedRole?: string | null;
  effectiveAssignedRole?: string | null;
  rawAssignedRole?: string | null;
  effectivePerformanceArea?: string | null;
  area?: string | null;
  areaMix?: AssignmentAreaMixRow[] | null;
  receivingPlates?: number | null;
  receivingPieces?: number | null;
  totalPlatesNoRecv?: number | null;
  totalPiecesNoRecv?: number | null;
};

export type AssignmentConfidence = "high" | "medium" | "low" | "unknown";

export type AssignmentReviewRow = {
  userid: string;
  observedName: string;
  resolvedName: string;
  employeeDisplayName: string | null;
  employeeId: string | null;
  identityResolved: boolean;
  employeeDefaultTeam: string | null;
  currentAssignedArea: string | null;
  currentRole: string | null;
  suggestedArea: string | null;
  suggestedSourceArea: string | null;
  confidence: AssignmentConfidence;
  reviewReason: string;
  needsReview: boolean;
};

type SuggestedArea = {
  team: string;
  sourceArea: string;
  confidence: AssignmentConfidence;
};

function firstMatchingTeam(validTeams: string[], pattern: (value: string) => boolean): string | null {
  const match = validTeams.find((team) => pattern(team.toLowerCase()));
  return match || null;
}

export function inferTeamFromArea(area: string, validTeams: string[]): SuggestedArea | null {
  const clean = area.trim();
  if (!clean) return null;

  if (validTeams.includes(clean)) {
    return {
      team: clean,
      sourceArea: clean,
      confidence: "high",
    };
  }

  const lower = clean.toLowerCase();

  if (lower.includes("inventory")) {
    const team = firstMatchingTeam(validTeams, (v) => v.includes("inventory"));
    if (team) return { team, sourceArea: clean, confidence: "high" };
  }

  if (lower.includes("night")) {
    const team = firstMatchingTeam(validTeams, (v) => v.includes("night"));
    if (team) return { team, sourceArea: clean, confidence: "high" };
  }

  if (lower.includes("delivery")) {
    const team = firstMatchingTeam(validTeams, (v) => v.includes("delivery"));
    if (team) return { team, sourceArea: clean, confidence: "high" };
  }

  if (lower.includes("receiv")) {
    const team = firstMatchingTeam(validTeams, (v) => v.includes("receiv"));
    if (team) return { team, sourceArea: clean, confidence: "medium" };
  }

  if (lower.includes("freez")) {
    const team = firstMatchingTeam(validTeams, (v) => v.includes("freez"));
    if (team) return { team, sourceArea: clean, confidence: "medium" };
  }

  if (
    lower.includes("cool") ||
    lower.includes("produce") ||
    lower.includes("seafood") ||
    lower.includes("chicken") ||
    lower.includes("iced")
  ) {
    const team =
      firstMatchingTeam(validTeams, (v) => v.includes("cool")) ||
      firstMatchingTeam(validTeams, (v) => v.includes("produce"));
    if (team) return { team, sourceArea: clean, confidence: "medium" };
  }

  if (lower.includes("dry")) {
    const team = firstMatchingTeam(validTeams, (v) => v.includes("dry"));
    if (team) return { team, sourceArea: clean, confidence: "medium" };
  }

  return null;
}

function getTopAreaMix(
  areaMix: AssignmentAreaMixRow[] | null | undefined
): { areaName: string; share: number } | null {
  const rows = (areaMix || [])
    .filter((row) => (row.areaName || "").trim().length > 0)
    .map((row) => ({
      areaName: (row.areaName || "").trim(),
      actualMinutes: Number(row.actualMinutes || 0),
      totalMoves: Number(row.totalMoves || 0),
    }));

  if (!rows.length) return null;

  const totalMinutes = rows.reduce((sum, row) => sum + row.actualMinutes, 0);

  rows.sort((a, b) => {
    if (b.actualMinutes !== a.actualMinutes) return b.actualMinutes - a.actualMinutes;
    return b.totalMoves - a.totalMoves;
  });

  const top = rows[0];
  const share = totalMinutes > 0 ? top.actualMinutes / totalMinutes : 0;

  return {
    areaName: top.areaName,
    share,
  };
}

function confidenceFromShare(share: number): AssignmentConfidence {
  if (share >= 0.7) return "high";
  if (share >= 0.55) return "medium";
  if (share > 0) return "low";
  return "unknown";
}

function getReceivingSuggestion(
  operator: AssignmentOperator,
  validTeams: string[],
  topMix: { areaName: string; share: number } | null
): SuggestedArea | null {
  const receivingTeam = firstMatchingTeam(validTeams, (v) => v.includes("receiv"));
  if (!receivingTeam) return null;

  const receivingPlates = Number(operator.receivingPlates || 0);
  const receivingPieces = Number(operator.receivingPieces || 0);
  const nonRecvPlates = Number(operator.totalPlatesNoRecv || 0);
  const nonRecvPieces = Number(operator.totalPiecesNoRecv || 0);

  const hasReceiving = receivingPlates > 0 || receivingPieces > 0;
  if (!hasReceiving) return null;

  const hasNonReceiving = nonRecvPlates > 0 || nonRecvPieces > 0;

  if (!hasNonReceiving) {
    return {
      team: receivingTeam,
      sourceArea: "Receiving activity",
      confidence: "high",
    };
  }

  const plateShare =
    receivingPlates + nonRecvPlates > 0
      ? receivingPlates / (receivingPlates + nonRecvPlates)
      : 0;

  const pieceShare =
    receivingPieces + nonRecvPieces > 0
      ? receivingPieces / (receivingPieces + nonRecvPieces)
      : 0;

  const receivingShare = Math.max(plateShare, pieceShare);

  if (receivingShare >= 0.6) {
    return {
      team: receivingTeam,
      sourceArea: "Receiving activity",
      confidence: "medium",
    };
  }

  if (receivingShare >= 0.4 && (!topMix || topMix.share < 0.7)) {
    return {
      team: receivingTeam,
      sourceArea: "Receiving activity",
      confidence: "low",
    };
  }

  return null;
}

export function buildAssignmentReviewRow(args: {
  operator: AssignmentOperator;
  selectedDate: string;
  validTeams: string[];
  employees: Record<string, EmployeeRecord>;
  mappings: RfMapping[];
  defaultTeams: Record<string, OperatorDefault>;
}): AssignmentReviewRow {
  const { operator, selectedDate, validTeams, employees, mappings, defaultTeams } = args;

  const identity = resolveOperatorIdentity({
    rfUsername: operator.userid,
    fallbackName: operator.name,
    fallbackTeam:
      operator.rawAssignedArea ||
      operator.effectiveAssignedArea ||
      operator.assignedArea ||
      operator.area ||
      "",
    selectedDate,
    employees,
    mappings,
    defaultTeams,
  });

  const topMix = getTopAreaMix(operator.areaMix);
  const receivingSuggestion = getReceivingSuggestion(operator, validTeams, topMix);

  const candidateAreas = [
    topMix?.areaName || "",
    operator.effectivePerformanceArea || "",
    operator.effectiveAssignedArea || "",
    operator.rawAssignedArea || "",
    operator.assignedArea || "",
    operator.area || "",
  ]
    .map((value) => value.trim())
    .filter(Boolean);

  let suggested: SuggestedArea | null = receivingSuggestion;

  if (!suggested) {
    for (const area of candidateAreas) {
      suggested = inferTeamFromArea(area, validTeams);
      if (suggested) break;
    }
  }

  let confidence: AssignmentConfidence = "unknown";
  if (receivingSuggestion) {
    confidence = receivingSuggestion.confidence;
  } else if (topMix) {
    confidence = confidenceFromShare(topMix.share);
  } else if (suggested) {
    confidence = suggested.confidence;
  }

  const currentAssignedArea =
    operator.effectiveAssignedArea ||
    operator.assignedArea ||
    operator.rawAssignedArea ||
    null;

  const currentRole =
    operator.effectiveAssignedRole ||
    operator.assignedRole ||
    operator.rawAssignedRole ||
    null;

  const employeeDefaultTeam = identity.defaultTeam || null;

  let reviewReason = "No action needed";
  let needsReview = false;

  if (!identity.employeeId) {
    reviewReason = "Resolve identity first";
    needsReview = true;
  } else if (!employeeDefaultTeam) {
    reviewReason = "Employee default team missing";
    needsReview = true;
  } else if (!suggested?.team) {
    if (currentAssignedArea && currentAssignedArea === employeeDefaultTeam) {
      reviewReason = "No observed area signal, but current assignment matches home team";
      needsReview = false;
    } else {
      reviewReason = "No observed area signal";
      needsReview = true;
    }
  } else if (
    currentAssignedArea &&
    currentAssignedArea === employeeDefaultTeam &&
    currentAssignedArea === suggested.team
  ) {
    reviewReason =
      confidence === "low"
        ? "Assignment already aligns with home and observed team; low confidence only"
        : "Assignment aligns with home and observed team";
    needsReview = false;
  } else if (employeeDefaultTeam !== suggested.team) {
    reviewReason = `Employee home team ${employeeDefaultTeam} differs from observed ${suggested.team}`;
    needsReview = true;
  } else if (confidence === "low") {
    reviewReason = "Observed area confidence is low";
    needsReview = true;
  }

  return {
    userid: operator.userid,
    observedName: operator.name,
    resolvedName: identity.displayName,
    employeeDisplayName: identity.employeeId ? identity.displayName : null,
    employeeId: identity.employeeId,
    identityResolved: !!identity.employeeId,
    employeeDefaultTeam,
    currentAssignedArea,
    currentRole,
    suggestedArea: suggested?.team || null,
    suggestedSourceArea: suggested?.sourceArea || null,
    confidence,
    reviewReason,
    needsReview,
  };
}
