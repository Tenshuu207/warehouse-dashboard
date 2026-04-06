import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

type AreaBucket = {
  areaCode?: string | null;
  receivingPlates?: number;
  receivingPieces?: number;
  replenishmentNoRecvPlates?: number;
  replenishmentNoRecvPieces?: number;
};

type UserlsTracking = {
  present?: boolean;
  receivingPlates?: number;
  receivingPieces?: number;
  replenishmentNoRecvPlates?: number;
  replenishmentNoRecvPieces?: number;
  primaryReplenishmentAreaCode?: string | null;
  primaryReplenishmentShare?: number | null;
  primaryActivityAreaCode?: string | null;
  primaryActivityShare?: number | null;
  primaryReplenishmentRole?: string | null;
  primaryReplenishmentRoleShare?: number | null;
  areaBuckets?: AreaBucket[];
};

type OperatorRow = {
  userid: string;
  name?: string;
  effectiveAssignedArea?: string | null;
  assignedArea?: string | null;
  effectiveAssignedRole?: string | null;
  assignedRole?: string | null;
  receivingPlates?: number;
  receivingPieces?: number;
  totalPlatesNoRecv?: number;
  totalPiecesNoRecv?: number;
  userlsTracking?: UserlsTracking;
};

type TeamOperator = {
  userid: string;
  name: string;
  roleGroup: string;
  officialTeam: string | null;
  currentRole: string | null;
  observedRole: string | null;
  observedRoleShare: number | null;
  observedArea: string | null;
  replenishmentPlates: number;
  replenishmentPieces: number;
  receivingPlates: number;
  receivingPieces: number;
  receivingMix: string | null;
};

type TeamRoleGroup = {
  role: string;
  operatorCount: number;
  replenishmentPlates: number;
  replenishmentPieces: number;
  receivingPlates: number;
  receivingPieces: number;
};

type TeamAccumulator = {
  team: string;
  operatorCount: number;
  replenishmentPlates: number;
  replenishmentPieces: number;
  receivingPlates: number;
  receivingPieces: number;
  roleGroups: Record<string, TeamRoleGroup>;
  operators: TeamOperator[];
};

function dailyEnrichedPath(date: string) {
  return path.join(process.cwd(), "..", "ingest", "derived", "daily_enriched", `${date}.json`);
}

function isDateLike(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function inferTeamFromRole(role?: string | null): string | null {
  if (!role) return null;
  if (role.startsWith("Dry")) return "Dry";
  if (role.startsWith("Clr") || role === "Produce") return "Cooler";
  if (role.startsWith("Frz")) return "Freezer";
  if (role === "Receiving") return "Receiving";
  return null;
}

function inferTeamFromAreaCode(area?: string | null): string | null {
  if (!area) return null;
  if (area === "1" || area === "5") return "Dry";
  if (area === "2" || area === "3" || area === "4") return "Cooler";
  if (area === "6" || area === "7") return "Freezer";
  return null;
}

function normalizeOfficialTeam(area?: string | null): string | null {
  const value = String(area || "").trim().toLowerCase();
  if (!value) return null;
  if (value.includes("receiv")) return "Receiving";
  if (value.includes("dry")) return "Dry";
  if (value.includes("cool")) return "Cooler";
  if (value.includes("freez")) return "Freezer";
  return null;
}

function buildReceivingMixSummary(tracking?: UserlsTracking): string | null {
  const buckets = [...(tracking?.areaBuckets || [])]
    .filter((bucket) => Number(bucket.receivingPieces || 0) > 0 || Number(bucket.receivingPlates || 0) > 0)
    .sort((a, b) => Number(b.receivingPieces || 0) - Number(a.receivingPieces || 0))
    .slice(0, 3);

  const totalPieces = Number(tracking?.receivingPieces || 0);
  const totalPlates = Number(tracking?.receivingPlates || 0);

  if (!buckets.length) return null;

  return buckets
    .map((bucket) => {
      const area = bucket.areaCode || "?";
      if (totalPieces > 0) {
        const share = (Number(bucket.receivingPieces || 0) / totalPieces) * 100;
        return `${area} (${share.toFixed(0)}%)`;
      }
      if (totalPlates > 0) {
        const share = (Number(bucket.receivingPlates || 0) / totalPlates) * 100;
        return `${area} (${share.toFixed(0)}%)`;
      }
      return area;
    })
    .join(", ");
}

function chooseTeam(op: OperatorRow): string {
  const officialTeam =
    normalizeOfficialTeam(op.effectiveAssignedArea) ||
    normalizeOfficialTeam(op.assignedArea);

  if (officialTeam) return officialTeam;

  const tracking = op.userlsTracking;
  const observedRoleTeam = inferTeamFromRole(tracking?.primaryReplenishmentRole);
  if (observedRoleTeam) return observedRoleTeam;

  const observedAreaTeam =
    inferTeamFromAreaCode(tracking?.primaryReplenishmentAreaCode) ||
    inferTeamFromAreaCode(tracking?.primaryActivityAreaCode);
  if (observedAreaTeam) return observedAreaTeam;

  if (Number(op.receivingPlates || 0) > 0 || Number(tracking?.receivingPlates || 0) > 0) {
    return "Receiving";
  }

  return "Unassigned";
}

function chooseRoleGroup(op: OperatorRow, team: string): string {
  const tracking = op.userlsTracking;
  const observedRole = tracking?.primaryReplenishmentRole || null;
  const currentRole = op.effectiveAssignedRole || op.assignedRole || null;

  if (team === "Receiving") {
    return "Receiving";
  }

  if (observedRole && inferTeamFromRole(observedRole) === team) {
    return observedRole;
  }

  if (currentRole && inferTeamFromRole(currentRole) === team) {
    return currentRole;
  }

  if (team === "Dry" && tracking?.primaryReplenishmentAreaCode === "5") {
    return "DryPIR";
  }

  if (team === "Freezer" && tracking?.primaryReplenishmentAreaCode === "7") {
    return "FrzPIR";
  }

  return "Unclassified";
}

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get("date")?.trim() || "";

    if (!isDateLike(date)) {
      return NextResponse.json({ error: "invalid_date" }, { status: 400 });
    }

    const raw = await fs.readFile(dailyEnrichedPath(date), "utf-8");
    const parsed = JSON.parse(raw);
    const operators: OperatorRow[] = Array.isArray(parsed.operators) ? parsed.operators : [];

    const teams: Record<string, TeamAccumulator> = {};

    for (const op of operators) {
      const team = chooseTeam(op);
      const roleGroup = chooseRoleGroup(op, team);
      const tracking = op.userlsTracking || {};
      const name = op.name || op.userid;

      if (!teams[team]) {
        teams[team] = {
          team,
          operatorCount: 0,
          replenishmentPlates: 0,
          replenishmentPieces: 0,
          receivingPlates: 0,
          receivingPieces: 0,
          roleGroups: {},
          operators: [],
        };
      }

      if (!teams[team].roleGroups[roleGroup]) {
        teams[team].roleGroups[roleGroup] = {
          role: roleGroup,
          operatorCount: 0,
          replenishmentPlates: 0,
          replenishmentPieces: 0,
          receivingPlates: 0,
          receivingPieces: 0,
        };
      }

      const replPlates = Number(tracking.replenishmentNoRecvPlates ?? op.totalPlatesNoRecv ?? 0);
      const replPieces = Number(tracking.replenishmentNoRecvPieces ?? op.totalPiecesNoRecv ?? 0);
      const recvPlates = Number(tracking.receivingPlates ?? op.receivingPlates ?? 0);
      const recvPieces = Number(tracking.receivingPieces ?? op.receivingPieces ?? 0);

      teams[team].operatorCount += 1;
      teams[team].replenishmentPlates += replPlates;
      teams[team].replenishmentPieces += replPieces;
      teams[team].receivingPlates += recvPlates;
      teams[team].receivingPieces += recvPieces;

      teams[team].roleGroups[roleGroup].operatorCount += 1;
      teams[team].roleGroups[roleGroup].replenishmentPlates += replPlates;
      teams[team].roleGroups[roleGroup].replenishmentPieces += replPieces;
      teams[team].roleGroups[roleGroup].receivingPlates += recvPlates;
      teams[team].roleGroups[roleGroup].receivingPieces += recvPieces;

      teams[team].operators.push({
        userid: op.userid,
        name,
        roleGroup,
        officialTeam:
          normalizeOfficialTeam(op.effectiveAssignedArea) ||
          normalizeOfficialTeam(op.assignedArea),
        currentRole: op.effectiveAssignedRole || op.assignedRole || null,
        observedRole: tracking.primaryReplenishmentRole || null,
        observedRoleShare:
          tracking.primaryReplenishmentRoleShare === null ||
          tracking.primaryReplenishmentRoleShare === undefined
            ? null
            : Number(tracking.primaryReplenishmentRoleShare),
        observedArea: tracking.primaryReplenishmentAreaCode || tracking.primaryActivityAreaCode || null,
        replenishmentPlates: replPlates,
        replenishmentPieces: replPieces,
        receivingPlates: recvPlates,
        receivingPieces: recvPieces,
        receivingMix: buildReceivingMixSummary(tracking),
      });
    }

    const teamOrder = ["Receiving", "Dry", "Cooler", "Freezer", "Unassigned"];

    const teamList = Object.values(teams)
      .map((team) => ({
        ...team,
        roleGroups: Object.values(team.roleGroups).sort((a, b) => {
          const replDiff = b.replenishmentPlates - a.replenishmentPlates;
          if (replDiff !== 0) return replDiff;
          return a.role.localeCompare(b.role);
        }),
        operators: team.operators.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => {
        const aIndex = teamOrder.indexOf(a.team);
        const bIndex = teamOrder.indexOf(b.team);
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
      });

    return NextResponse.json({
      date,
      teams: teamList,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "team_groups_read_failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
