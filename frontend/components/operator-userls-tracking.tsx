"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useAppState } from "@/lib/app-state";

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

function fmt(value: number | null | undefined, digits = 2) {
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

function MetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="rounded-xl border bg-slate-50 p-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {helper && <div className="mt-1 text-[11px] text-slate-500">{helper}</div>}
    </div>
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
      <section className="rounded-2xl bg-white border shadow-sm p-4">
        <h3 className="text-lg font-bold">UserLS Tracking</h3>
        <p className="mt-1 text-sm text-slate-500">Loading supplemental transaction tracking…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl bg-white border shadow-sm p-4">
        <h3 className="text-lg font-bold">UserLS Tracking</h3>
        <p className="mt-1 text-sm text-red-600">{error}</p>
      </section>
    );
  }

  const operator = data?.operator;
  const tracking = operator?.userlsTracking;

  if (!tracking?.present) {
    return (
      <section className="rounded-2xl bg-white border shadow-sm p-4">
        <h3 className="text-lg font-bold">UserLS Tracking</h3>
        <p className="mt-1 text-sm text-slate-500">
          No supplemental UserLS tracking is available for this operator on {selectedWeek}.
        </p>
      </section>
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

  return (
    <section className="rounded-2xl bg-white border shadow-sm p-4 space-y-4">
      <div>
        <h3 className="text-lg font-bold">UserLS Tracking</h3>
        <p className="mt-1 text-sm text-slate-500">
          Supplemental operator activity from RF2 USERLS. Pick stays separate from receiving and replenishment.
        </p>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-800">Pick Activity</h4>
        <div className="mt-2 grid grid-cols-2 xl:grid-cols-5 gap-3">
          <MetricCard label="Pick Plates" value={fmt(tracking.pickPlates ?? 0, 0)} />
          <MetricCard label="Pick Pieces" value={fmt(tracking.pickPieces ?? 0, 0)} />
          <MetricCard label="Pick Routes" value={fmt(tracking.pickRouteCount ?? 0, 0)} />
          <MetricCard label="Pick Minutes" value={fmt(tracking.pickMinutes ?? 0, 0)} />
          <MetricCard
            label="Pick Pieces from Route Totals"
            value={fmt(tracking.pickPiecesFromRouteTotals ?? 0, 0)}
          />
        </div>

        <div className="mt-3 grid grid-cols-1 xl:grid-cols-3 gap-3">
          <MetricCard
            label="Reported Pick Rate (pieces/hour)"
            value={fmt(tracking.pickRateReportedAverage, 2)}
            helper="Average of route-reported rates from the source report"
          />
          <MetricCard
            label="Weighted Pick Rate (pieces/hour)"
            value={fmt(tracking.pickRateReportedWeighted, 2)}
            helper="Minutes-weighted route-reported rate"
          />
          <MetricCard
            label="Derived Pick Pace (pieces/min)"
            value={fmt(tracking.pickRateDerivedPiecesPerMinute, 4)}
            helper={`Overall benchmark: ${fmt(
              data?.userlsTrackingSummary?.summary?.pickRateDerivedPiecesPerMinuteOverall,
              4
            )} pieces/min`}
          />
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-800">Receiving and Replenishment</h4>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-slate-50 border-b">
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
                <td className="px-3 py-2">{fmt(tracking.receivingPlates ?? 0, 0)}</td>
                <td className="px-3 py-2">{fmt(tracking.receivingPieces ?? 0, 0)}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-2 flex-wrap">
                    {deltaBadge(tracking.deltas?.receivingPlates)}
                    {deltaBadge(tracking.deltas?.receivingPieces)}
                  </div>
                </td>
                <td className="px-3 py-2 text-slate-500">Compared against current daily receiving totals</td>
              </tr>
              <tr className="border-b">
                <td className="px-3 py-2 font-medium">Replenishment No-Recv</td>
                <td className="px-3 py-2">{fmt(tracking.replenishmentNoRecvPlates ?? 0, 0)}</td>
                <td className="px-3 py-2">{fmt(tracking.replenishmentNoRecvPieces ?? 0, 0)}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-2 flex-wrap">
                    {deltaBadge(tracking.deltas?.replenishmentNoRecvPlates)}
                    {deltaBadge(tracking.deltas?.replenishmentNoRecvPieces)}
                  </div>
                </td>
                <td className="px-3 py-2 text-slate-500">Letdown + putaway + restock-like estimated</td>
              </tr>
              <tr className="border-b">
                <td className="px-3 py-2 font-medium">Letdown</td>
                <td className="px-3 py-2">{fmt(tracking.letdownPlates ?? 0, 0)}</td>
                <td className="px-3 py-2">{fmt(tracking.letdownPieces ?? 0, 0)}</td>
                <td className="px-3 py-2">{deltaBadge(tracking.deltas?.letdownPlates)}</td>
                <td className="px-3 py-2 text-slate-500">Compared against current daily letdown plates</td>
              </tr>
              <tr className="border-b">
                <td className="px-3 py-2 font-medium">Putaway</td>
                <td className="px-3 py-2">{fmt(tracking.putawayPlates ?? 0, 0)}</td>
                <td className="px-3 py-2">{fmt(tracking.putawayPieces ?? 0, 0)}</td>
                <td className="px-3 py-2">{deltaBadge(tracking.deltas?.putawayPlates)}</td>
                <td className="px-3 py-2 text-slate-500">Compared against current daily putaway plates</td>
              </tr>
              <tr className="border-b">
                <td className="px-3 py-2 font-medium">Restock-Like Estimated</td>
                <td className="px-3 py-2">{fmt(tracking.restockLikePlatesEstimated ?? 0, 0)}</td>
                <td className="px-3 py-2">{fmt(tracking.restockLikePiecesEstimated ?? 0, 0)}</td>
                <td className="px-3 py-2">{deltaBadge(tracking.deltas?.restockLikeEstimatedPlates)}</td>
                <td className="px-3 py-2 text-slate-500">Restock + paired MoveFrom/MoveTo estimate</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-medium">Other Non-Pick</td>
                <td className="px-3 py-2">{fmt(tracking.otherNonPickPlates ?? 0, 0)}</td>
                <td className="px-3 py-2">{fmt(tracking.otherNonPickPieces ?? 0, 0)}</td>
                <td className="px-3 py-2 text-slate-400">—</td>
                <td className="px-3 py-2 text-slate-500">Residual non-pick activity not classified into main buckets</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-800">Observed Role and Area</h4>
        <div className="mt-2 grid grid-cols-1 xl:grid-cols-4 gap-3">
          <MetricCard
            label="Primary Replenishment Role"
            value={tracking.primaryReplenishmentRole || "—"}
            helper={`Share of replenishment plates: ${pct(tracking.primaryReplenishmentRoleShare)}`}
          />
          <MetricCard
            label="Primary Replenishment Area"
            value={tracking.primaryReplenishmentAreaCode || "—"}
            helper={`Share of replenishment plates: ${pct(tracking.primaryReplenishmentShare)}`}
          />
          <MetricCard
            label="Primary Activity Area"
            value={tracking.primaryActivityAreaCode || "—"}
            helper={`Share of non-pick activity: ${pct(tracking.primaryActivityShare)}`}
          />
          <MetricCard
            label="Receiving Pieces"
            value={fmt(tracking.receivingPieces ?? 0, 0)}
            helper="Use area mix below as destination context, not automatic home team"
          />
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-800">Role Mix</h4>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-slate-50 border-b">
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
                    <td className="px-3 py-2">{fmt(bucket.replenishmentNoRecvPlates ?? 0, 0)}</td>
                    <td className="px-3 py-2">{fmt(bucket.replenishmentNoRecvPieces ?? 0, 0)}</td>
                    <td className="px-3 py-2">{pct(bucket.replenishmentPlateShare)}</td>
                    <td className="px-3 py-2">{fmt(bucket.letdownPlates ?? 0, 0)}</td>
                    <td className="px-3 py-2">{fmt(bucket.putawayPlates ?? 0, 0)}</td>
                    <td className="px-3 py-2">{fmt(bucket.restockLikePlatesEstimated ?? 0, 0)}</td>
                    <td className="px-3 py-2">{fmt(bucket.pickPlates ?? 0, 0)}</td>
                    <td className="px-3 py-2">{fmt(bucket.otherNonPickPlates ?? 0, 0)}</td>
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
            <thead className="bg-slate-50 border-b">
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
              {areaBuckets.map((bucket) => (
                <tr key={`area-${bucket.areaCode}`} className="border-b last:border-b-0">
                  <td className="px-3 py-2 font-medium">{bucket.areaCode || "—"}</td>
                  <td className="px-3 py-2">{fmt(bucket.receivingPlates ?? 0, 0)}</td>
                  <td className="px-3 py-2">{fmt(bucket.receivingPieces ?? 0, 0)}</td>
                  <td className="px-3 py-2">{pct(bucket.receivingPieceShare)}</td>
                  <td className="px-3 py-2">{fmt(bucket.replenishmentNoRecvPlates ?? 0, 0)}</td>
                  <td className="px-3 py-2">{fmt(bucket.replenishmentNoRecvPieces ?? 0, 0)}</td>
                  <td className="px-3 py-2">{pct(bucket.replenishmentPlateShare)}</td>
                  <td className="px-3 py-2">{fmt(bucket.pickPlates ?? 0, 0)}</td>
                  <td className="px-3 py-2">{fmt(bucket.pickPieces ?? 0, 0)}</td>
                  <td className="px-3 py-2">{fmt(bucket.otherNonPickPlates ?? 0, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
