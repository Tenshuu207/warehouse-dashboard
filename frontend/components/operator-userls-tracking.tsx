"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useAppState } from "@/lib/app-state";
import ContextBadge from "@/components/shared/ContextBadge";
import DetailDisclosure from "@/components/shared/DetailDisclosure";
import SectionBlock from "@/components/shared/SectionBlock";
import StatCard from "@/components/shared/StatCard";

type AreaBucket = {
  areaCode?: string | null;
  totalLines?: number;
  totalPieces?: number;
  pickPlates?: number;
  pickPieces?: number;
  receivingPlates?: number;
  receivingPieces?: number;
  letdownPlates?: number;
  letdownPieces?: number;
  putawayPlates?: number;
  putawayPieces?: number;
  restockPlatesRaw?: number;
  restockPiecesRaw?: number;
  moveFromPlates?: number;
  moveFromPieces?: number;
  moveToPlates?: number;
  moveToPieces?: number;
  pairedMoveActions?: number;
  pairedMovePieces?: number;
  restockLikePlatesEstimated?: number;
  restockLikePiecesEstimated?: number;
  replenishmentNoRecvPlates?: number;
  replenishmentNoRecvPieces?: number;
  nonPickAllPlates?: number;
  nonPickAllPieces?: number;
  otherNonPickPlates?: number;
  otherNonPickPieces?: number;
  transferPlates?: number;
  transferPieces?: number;
};

type RoleBucket = {
  role?: string | null;
  totalLines?: number;
  totalPieces?: number;
  pickPlates?: number;
  pickPieces?: number;
  letdownPlates?: number;
  letdownPieces?: number;
  putawayPlates?: number;
  putawayPieces?: number;
  restockPlatesRaw?: number;
  restockPiecesRaw?: number;
  moveFromPlates?: number;
  moveFromPieces?: number;
  moveToPlates?: number;
  moveToPieces?: number;
  pairedMoveActions?: number;
  pairedMovePieces?: number;
  restockLikePlatesEstimated?: number;
  restockLikePiecesEstimated?: number;
  replenishmentNoRecvPlates?: number;
  replenishmentNoRecvPieces?: number;
  nonPickAllPlates?: number;
  nonPickAllPieces?: number;
  otherNonPickPlates?: number;
  otherNonPickPieces?: number;
  transferPlates?: number;
  transferPieces?: number;
};

type Tracking = {
  present?: boolean;
  pickPlates?: number;
  pickPieces?: number;
  pickRouteCount?: number;
  pickMinutes?: number;
  pickPiecesFromRouteTotals?: number;
  pickRateReportedAverage?: number | null;
  pickRateReportedWeighted?: number | null;
  pickRateDerivedPiecesPerMinute?: number | null;
  receivingPlates?: number;
  receivingPieces?: number;
  letdownPlates?: number;
  letdownPieces?: number;
  putawayPlates?: number;
  putawayPieces?: number;
  restockLikePlatesEstimated?: number;
  restockLikePiecesEstimated?: number;
  replenishmentNoRecvPlates?: number;
  replenishmentNoRecvPieces?: number;
  otherNonPickPlates?: number;
  otherNonPickPieces?: number;
  primaryReplenishmentAreaCode?: string | null;
  primaryReplenishmentShare?: number | null;
  primaryActivityAreaCode?: string | null;
  primaryActivityShare?: number | null;
  primaryReplenishmentRole?: string | null;
  primaryReplenishmentRoleShare?: number | null;
  areaBuckets?: AreaBucket[];
  roleBuckets?: RoleBucket[];
  deltas?: {
    receivingPlates?: number | null;
    receivingPieces?: number | null;
    replenishmentNoRecvPlates?: number | null;
    replenishmentNoRecvPieces?: number | null;
    letdownPlates?: number | null;
    putawayPlates?: number | null;
    restockLikeEstimatedPlates?: number | null;
  };
};

type OperatorPayload = {
  userid?: string;
  name?: string;
  userlsTracking?: Tracking;
};

type ApiResponse = {
  date: string;
  userid: string;
  userlsTrackingSummary?: {
    summary?: {
      pickRateDerivedPiecesPerMinuteOverall?: number | null;
    };
  } | null;
  operator?: OperatorPayload | null;
  userlsOnlyUser?: (Tracking & {
    userid?: string;
    name?: string;
  }) | null;
};

function fmt(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined) return "—";
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtPrecise(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined) return "—";
  return Number(value).toFixed(digits);
}

function pct(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function share(part: number | null | undefined, total: number | null | undefined) {
  if (part === null || part === undefined || total === null || total === undefined || total === 0) {
    return null;
  }
  return Number(part) / Number(total);
}

function confidenceLabel(value: number | null | undefined) {
  if (value === null || value === undefined) return "Unknown";
  if (value >= 0.75) return "High";
  if (value >= 0.5) return "Medium";
  if (value > 0) return "Low";
  return "Unknown";
}

function deltaBadge(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return <span className="text-[11px] text-slate-400">Δ —</span>;
  }

  const color =
    value === 0
      ? "border-slate-200 bg-slate-50 text-slate-700"
      : value > 0
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-blue-200 bg-blue-50 text-blue-800";

  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${color}`}>
      Δ {value}
    </span>
  );
}

export default function OperatorUserlsTracking() {
  const pathname = usePathname();
  const { selectedWeek } = useAppState();

  const userid = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] || "");
  }, [pathname]);

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(
          `/api/dashboard/daily-enriched?date=${selectedWeek}&userid=${encodeURIComponent(userid)}`,
          { cache: "no-store" }
        );

        const json = (await res.json()) as ApiResponse;

        if (!res.ok) {
          throw new Error(
            typeof (json as { details?: string }).details === "string"
              ? (json as { details?: string }).details
              : "Failed to load UserLS tracking"
          );
        }

        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load UserLS tracking");
          setLoading(false);
        }
      }
    }

    if (userid && selectedWeek) {
      load();
    }

    return () => {
      cancelled = true;
    };
  }, [userid, selectedWeek]);

  if (loading) {
    return (
      <SectionBlock
        title="Observed Work Summary"
        subtitle="UserLS-derived activity, observed area context, and role inference."
      >
        <div className="text-sm text-slate-500">Loading supplemental transaction tracking...</div>
      </SectionBlock>
    );
  }

  if (error) {
    return (
      <SectionBlock
        title="Observed Work Summary"
        subtitle="UserLS-derived activity, observed area context, and role inference."
      >
        <div className="text-sm text-red-600">{error}</div>
      </SectionBlock>
    );
  }

  const operator = data?.operator;
  const tracking = operator?.userlsTracking;

  if (!tracking?.present) {
    return (
      <SectionBlock
        title="Observed Work Summary"
        subtitle="UserLS-derived activity, observed area context, and role inference."
      >
        <div className="text-sm text-slate-500">
          No supplemental UserLS tracking is available for this operator on {selectedWeek}.
        </div>
      </SectionBlock>
    );
  }

  const totalReceivingPieces = Number(tracking.receivingPieces || 0);
  const totalReplPlates = Number(tracking.replenishmentNoRecvPlates || 0);

  const areaBuckets = [...(tracking.areaBuckets || [])]
    .map((bucket) => ({
      ...bucket,
      receivingPieceShare: share(bucket.receivingPieces, totalReceivingPieces),
      replenishmentPlateShare: share(bucket.replenishmentNoRecvPlates, totalReplPlates),
    }))
    .sort((a, b) => {
      if (totalReceivingPieces > 0) {
        const recvDiff = Number(b.receivingPieces || 0) - Number(a.receivingPieces || 0);
        if (recvDiff !== 0) return recvDiff;
      }

      const replDiff =
        Number(b.replenishmentNoRecvPlates || 0) - Number(a.replenishmentNoRecvPlates || 0);
      if (replDiff !== 0) return replDiff;

      return Number(a.areaCode || 999) - Number(b.areaCode || 999);
    });

  const roleBuckets = [...(tracking.roleBuckets || [])]
    .map((bucket) => ({
      ...bucket,
      replenishmentPlateShare: share(bucket.replenishmentNoRecvPlates, totalReplPlates),
    }))
    .sort(
      (a, b) =>
        Number(b.replenishmentNoRecvPlates || 0) - Number(a.replenishmentNoRecvPlates || 0)
    );

  const inferredConfidence = confidenceLabel(
    tracking.primaryReplenishmentRoleShare ?? tracking.primaryReplenishmentShare
  );

  return (
    <SectionBlock
      title="Observed Work Summary"
      subtitle="UserLS-derived activity, observed area context, and role inference. Pick stays separate from receiving and replenishment."
    >
      <div className="flex flex-wrap gap-2">
        {tracking.primaryReplenishmentAreaCode ? (
          <ContextBadge variant="observed-team">
            Observed Repl Area: {tracking.primaryReplenishmentAreaCode}
          </ContextBadge>
        ) : null}

        {tracking.primaryReplenishmentRole ? (
          <ContextBadge variant="observed-role">
            Observed Role: {tracking.primaryReplenishmentRole}
          </ContextBadge>
        ) : null}

        {tracking.primaryActivityAreaCode ? (
          <ContextBadge variant="context">
            Primary Activity Area: {tracking.primaryActivityAreaCode}
          </ContextBadge>
        ) : null}

        <ContextBadge variant="confidence">
          Confidence: {inferredConfidence}
        </ContextBadge>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard label="Repl Plates">{fmt(tracking.replenishmentNoRecvPlates)}</StatCard>
        <StatCard label="Repl Pieces">{fmt(tracking.replenishmentNoRecvPieces)}</StatCard>
        <StatCard label="Receiving Plates">{fmt(tracking.receivingPlates)}</StatCard>
        <StatCard label="Receiving Pieces">{fmt(tracking.receivingPieces)}</StatCard>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard label="Letdown Plates">{fmt(tracking.letdownPlates)}</StatCard>
        <StatCard label="Putaway Plates">{fmt(tracking.putawayPlates)}</StatCard>
        <StatCard label="Restock-Like">{fmt(tracking.restockLikePlatesEstimated)}</StatCard>
        <StatCard label="Pick Plates">{fmt(tracking.pickPlates)}</StatCard>
      </div>

      <div className="rounded-xl border bg-slate-50 p-3 text-sm text-slate-700">
        Receiving destination mix and area distribution are supporting context. Use the observed replenishment role and primary activity patterns as operational signals, not blind permanent assignment truth.
      </div>

      <DetailDisclosure
        title="Supporting Activity Detail"
        meta={`${areaBuckets.length} area buckets · ${roleBuckets.length} role buckets`}
      >
        <div className="space-y-6">
          <div>
            <h4 className="text-sm font-semibold text-slate-800">Pick Activity</h4>
            <div className="mt-2 grid grid-cols-2 xl:grid-cols-5 gap-3">
              <StatCard label="Pick Plates">{fmt(tracking.pickPlates)}</StatCard>
              <StatCard label="Pick Pieces">{fmt(tracking.pickPieces)}</StatCard>
              <StatCard label="Pick Routes">{fmt(tracking.pickRouteCount)}</StatCard>
              <StatCard label="Pick Minutes">{fmt(tracking.pickMinutes)}</StatCard>
              <StatCard label="Route Total Pieces">{fmt(tracking.pickPiecesFromRouteTotals)}</StatCard>
            </div>

            <div className="mt-3 grid grid-cols-1 xl:grid-cols-3 gap-3">
              <StatCard label="Reported Pick Rate">
                {fmtPrecise(tracking.pickRateReportedAverage, 2)}
              </StatCard>
              <StatCard label="Weighted Pick Rate">
                {fmtPrecise(tracking.pickRateReportedWeighted, 2)}
              </StatCard>
              <StatCard label="Derived Pick Pace">
                {fmtPrecise(tracking.pickRateDerivedPiecesPerMinute, 4)}
              </StatCard>
            </div>

            <div className="mt-2 text-xs text-slate-500">
              Overall benchmark:{" "}
              {fmtPrecise(
                data?.userlsTrackingSummary?.summary?.pickRateDerivedPiecesPerMinuteOverall,
                4
              )}{" "}
              pieces/min
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-800">Daily Match Check</h4>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="border-b bg-slate-50">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-semibold">Bucket</th>
                    <th className="px-3 py-2 font-semibold">Plates</th>
                    <th className="px-3 py-2 font-semibold">Pieces</th>
                    <th className="px-3 py-2 font-semibold">Delta</th>
                    <th className="px-3 py-2 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="px-3 py-2 font-medium">Receiving</td>
                    <td className="px-3 py-2">{fmt(tracking.receivingPlates)}</td>
                    <td className="px-3 py-2">{fmt(tracking.receivingPieces)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        {deltaBadge(tracking.deltas?.receivingPlates)}
                        {deltaBadge(tracking.deltas?.receivingPieces)}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      Compared against current daily receiving totals
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-3 py-2 font-medium">Replenishment No-Recv</td>
                    <td className="px-3 py-2">{fmt(tracking.replenishmentNoRecvPlates)}</td>
                    <td className="px-3 py-2">{fmt(tracking.replenishmentNoRecvPieces)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        {deltaBadge(tracking.deltas?.replenishmentNoRecvPlates)}
                        {deltaBadge(tracking.deltas?.replenishmentNoRecvPieces)}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      Letdown + putaway + restock-like estimated
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-3 py-2 font-medium">Letdown</td>
                    <td className="px-3 py-2">{fmt(tracking.letdownPlates)}</td>
                    <td className="px-3 py-2">{fmt(tracking.letdownPieces)}</td>
                    <td className="px-3 py-2">{deltaBadge(tracking.deltas?.letdownPlates)}</td>
                    <td className="px-3 py-2 text-slate-500">
                      Compared against current daily letdown plates
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-3 py-2 font-medium">Putaway</td>
                    <td className="px-3 py-2">{fmt(tracking.putawayPlates)}</td>
                    <td className="px-3 py-2">{fmt(tracking.putawayPieces)}</td>
                    <td className="px-3 py-2">{deltaBadge(tracking.deltas?.putawayPlates)}</td>
                    <td className="px-3 py-2 text-slate-500">
                      Compared against current daily putaway plates
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-3 py-2 font-medium">Restock-Like Estimated</td>
                    <td className="px-3 py-2">{fmt(tracking.restockLikePlatesEstimated)}</td>
                    <td className="px-3 py-2">{fmt(tracking.restockLikePiecesEstimated)}</td>
                    <td className="px-3 py-2">
                      {deltaBadge(tracking.deltas?.restockLikeEstimatedPlates)}
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      Restock + paired MoveFrom/MoveTo estimate
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-medium">Other Non-Pick</td>
                    <td className="px-3 py-2">{fmt(tracking.otherNonPickPlates)}</td>
                    <td className="px-3 py-2">{fmt(tracking.otherNonPickPieces)}</td>
                    <td className="px-3 py-2 text-slate-400">—</td>
                    <td className="px-3 py-2 text-slate-500">
                      Residual non-pick activity not classified into main buckets
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-800">Observed Role and Area</h4>
            <div className="mt-2 grid grid-cols-1 xl:grid-cols-4 gap-3">
              <StatCard label="Primary Repl Role">
                {tracking.primaryReplenishmentRole || "—"}
              </StatCard>
              <StatCard label="Role Share">
                {pct(tracking.primaryReplenishmentRoleShare)}
              </StatCard>
              <StatCard label="Primary Repl Area">
                {tracking.primaryReplenishmentAreaCode || "—"}
              </StatCard>
              <StatCard label="Primary Activity Area">
                {tracking.primaryActivityAreaCode || "—"}
              </StatCard>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-800">Role Mix</h4>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="border-b bg-slate-50">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-semibold">Role</th>
                    <th className="px-3 py-2 font-semibold">Repl Plates</th>
                    <th className="px-3 py-2 font-semibold">Repl Pieces</th>
                    <th className="px-3 py-2 font-semibold">Repl Share</th>
                    <th className="px-3 py-2 font-semibold">Letdown</th>
                    <th className="px-3 py-2 font-semibold">Putaway</th>
                    <th className="px-3 py-2 font-semibold">Restock-Like</th>
                    <th className="px-3 py-2 font-semibold">Pick Plates</th>
                    <th className="px-3 py-2 font-semibold">Other Non-Pick</th>
                  </tr>
                </thead>
                <tbody>
                  {roleBuckets.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-slate-500" colSpan={9}>
                        No observed role-zone mix available from mapped bins for this operator.
                      </td>
                    </tr>
                  ) : (
                    roleBuckets.map((bucket) => (
                      <tr key={`role-${bucket.role}`} className="border-b last:border-b-0">
                        <td className="px-3 py-2 font-medium">{bucket.role || "—"}</td>
                        <td className="px-3 py-2">{fmt(bucket.replenishmentNoRecvPlates)}</td>
                        <td className="px-3 py-2">{fmt(bucket.replenishmentNoRecvPieces)}</td>
                        <td className="px-3 py-2">{pct(bucket.replenishmentPlateShare)}</td>
                        <td className="px-3 py-2">{fmt(bucket.letdownPlates)}</td>
                        <td className="px-3 py-2">{fmt(bucket.putawayPlates)}</td>
                        <td className="px-3 py-2">{fmt(bucket.restockLikePlatesEstimated)}</td>
                        <td className="px-3 py-2">{fmt(bucket.pickPlates)}</td>
                        <td className="px-3 py-2">{fmt(bucket.otherNonPickPlates)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-800">Area Mix</h4>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[1200px] text-sm">
                <thead className="border-b bg-slate-50">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-semibold">Area</th>
                    <th className="px-3 py-2 font-semibold">Recv Plates</th>
                    <th className="px-3 py-2 font-semibold">Recv Pieces</th>
                    <th className="px-3 py-2 font-semibold">Recv Piece Share</th>
                    <th className="px-3 py-2 font-semibold">Repl Plates</th>
                    <th className="px-3 py-2 font-semibold">Repl Pieces</th>
                    <th className="px-3 py-2 font-semibold">Repl Share</th>
                    <th className="px-3 py-2 font-semibold">Pick Plates</th>
                    <th className="px-3 py-2 font-semibold">Pick Pieces</th>
                    <th className="px-3 py-2 font-semibold">Other Non-Pick</th>
                  </tr>
                </thead>
                <tbody>
                  {areaBuckets.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-slate-500" colSpan={10}>
                        No area mix is available for this operator.
                      </td>
                    </tr>
                  ) : (
                    areaBuckets.map((bucket) => (
                      <tr key={`area-${bucket.areaCode}`} className="border-b last:border-b-0">
                        <td className="px-3 py-2 font-medium">{bucket.areaCode || "—"}</td>
                        <td className="px-3 py-2">{fmt(bucket.receivingPlates)}</td>
                        <td className="px-3 py-2">{fmt(bucket.receivingPieces)}</td>
                        <td className="px-3 py-2">{pct(bucket.receivingPieceShare)}</td>
                        <td className="px-3 py-2">{fmt(bucket.replenishmentNoRecvPlates)}</td>
                        <td className="px-3 py-2">{fmt(bucket.replenishmentNoRecvPieces)}</td>
                        <td className="px-3 py-2">{pct(bucket.replenishmentPlateShare)}</td>
                        <td className="px-3 py-2">{fmt(bucket.pickPlates)}</td>
                        <td className="px-3 py-2">{fmt(bucket.pickPieces)}</td>
                        <td className="px-3 py-2">{fmt(bucket.otherNonPickPlates)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </DetailDisclosure>
    </SectionBlock>
  );
}
