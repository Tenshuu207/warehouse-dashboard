import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { resolveNearestSnapshot } from "@/lib/server/db";
import { buildUserlsOverviewWeek } from "@/lib/server/userls-overview";

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
  observedArea?: string | null;
  observedAreaConfidence?: number | null;
  observedRole?: string | null;
  observedRoleConfidence?: number | null;
  mixedWorkFlag?: boolean;
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

function dailyEnrichedDir() {
  return path.join(process.cwd(), "..", "ingest", "derived", "daily_enriched");
}

function isDateLike(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function resolveNearestFile(
  dirPath: string,
  requestedKey: string
): Promise<{ filePath: string; resolvedKey: string } | null> {
  const entries = await fs.readdir(dirPath);
  const keys = entries
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/, ""))
    .sort();

  if (keys.length === 0) return null;

  if (keys.includes(requestedKey)) {
    return {
      filePath: path.join(dirPath, `${requestedKey}.json`),
      resolvedKey: requestedKey,
    };
  }

  const earlier = keys.filter((key) => key <= requestedKey);
  const resolvedKey = earlier.length > 0 ? earlier[earlier.length - 1] : keys[0];

  return {
    filePath: path.join(dirPath, `${resolvedKey}.json`),
    resolvedKey,
  };
}

function inferTeamFromRole(role?: string | null): string | null {
  if (!role) return null;
  if (role.startsWith("Dry")) return "Dry";
  if (role === "Dry PIR") return "Dry";
  if (role.startsWith("Clr") || role === "Produce") return "Cooler";
  if (role.startsWith("Frz")) return "Freezer";
  if (role === "Freezer PIR") return "Freezer";
  if (role === "Receiving") return "Receiving";
  if (role === "Mixed" || role === "Extra") return role;
  return null;
}

function inferTeamFromAreaCode(area?: string | null): string | null {
  if (!area) return null;
  if (area === "Dry PIR" || area === "DryMix" || area === "DryFlr") return "Dry";
  if (area === "ClrDairy" || area === "ClrMeat" || area === "Produce") return "Cooler";
  if (area === "Freezer PIR" || area === "FrzMix") return "Freezer";
  if (area === "Mixed" || area === "Extra") return area;
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
  const observedRoleTeam = inferTeamFromRole(
    tracking?.observedRole || tracking?.primaryReplenishmentRole
  );
  if (observedRoleTeam) return observedRoleTeam;

  const observedAreaTeam =
    inferTeamFromAreaCode(tracking?.observedArea) ||
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
  const observedRole = tracking?.observedRole || tracking?.primaryReplenishmentRole || null;
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

    let parsed: Record<string, unknown>;
    let resolvedDate = date;
    let source: "sqlite" | "json" | "userls_daily" = "json";
    const sourceMode = req.nextUrl.searchParams.get("source")?.trim() || "";

    if (sourceMode === "userls") {
      const userlsOverview = await buildUserlsOverviewWeek(date);
      if (!userlsOverview) {
        return NextResponse.json(
          {
            error: "team_groups_not_found",
            requestedDate: date,
            details: "No UserLS daily summaries were found for Overview team groups",
          },
          { status: 404 }
        );
      }

      parsed = userlsOverview as Record<string, unknown>;
      resolvedDate = String(userlsOverview.resolvedWeekStart || date);
      source = "userls_daily";
    } else {
      const resolvedDb = resolveNearestSnapshot<Record<string, unknown>>("daily_enriched", date);
      if (resolvedDb) {
        parsed = resolvedDb.payload;
        resolvedDate = resolvedDb.resolvedKey;
        source = "sqlite";
      } else {
        const resolved = await resolveNearestFile(dailyEnrichedDir(), date);
        if (!resolved) {
          return NextResponse.json(
            {
              error: "team_groups_not_found",
              requestedDate: date,
              details: "No daily_enriched files available",
            },
            { status: 404 }
          );
        }

        parsed = JSON.parse(await fs.readFile(resolved.filePath, "utf-8")) as Record<string, unknown>;
        resolvedDate = resolved.resolvedKey;
        source = "json";
      }
    }

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
        observedRole: tracking.observedRole || tracking.primaryReplenishmentRole || null,
        observedRoleShare:
          tracking.observedRoleConfidence ?? tracking.primaryReplenishmentRoleShare ?? null,
        observedArea:
          tracking.observedArea ||
          tracking.primaryReplenishmentAreaCode ||
          tracking.primaryActivityAreaCode ||
          null,
        replenishmentPlates: replPlates,
        replenishmentPieces: replPieces,
        receivingPlates: recvPlates,
        receivingPieces: recvPieces,
        receivingMix: buildReceivingMixSummary(tracking),
      });
    }

    const payload = {
      date: resolvedDate,
      requestedDate: date,
      resolvedDate,
      usedFallback: resolvedDate !== date,
      teams: Object.values(teams)
        .map((team) => ({
          ...team,
          roleGroups: Object.values(team.roleGroups).sort((a, b) => b.replenishmentPlates - a.replenishmentPlates),
          operators: [...team.operators].sort((a, b) => b.replenishmentPlates - a.replenishmentPlates),
        }))
        .sort((a, b) => b.replenishmentPlates - a.replenishmentPlates),
      source,
    };

    return NextResponse.json(payload);
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
