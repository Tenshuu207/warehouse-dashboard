"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import ControlBar from "@/components/control-bar";
import AreaSheetView from "@/components/area-sheet-view";
import ContextBadge from "@/components/shared/ContextBadge";
import { useAppState } from "@/lib/app-state";
import {
  resolveAreaIdentity,
  resolveOperationalAreaGroup,
} from "@/lib/area-labels";
import { rangeHref, rangeLabel, resolveContextRange } from "@/lib/date-range";

export default function AreaDetailPage() {
  const { selectedWeek } = useAppState();
  const params = useParams<{ area: string }>();
  const searchParams = useSearchParams();
  const areaParam = decodeURIComponent(
    Array.isArray(params?.area) ? params.area[0] : params?.area || "Unknown"
  );
  const areaIdentity = resolveAreaIdentity(areaParam) || {
    key: areaParam,
    label: areaParam,
    aliases: [areaParam],
  };
  const areaGroup = resolveOperationalAreaGroup(areaParam) || {
    key: areaIdentity.key,
    label: areaIdentity.label,
    leafAreaCodes: [areaIdentity.key],
    aliases: [areaParam],
  };
  const range = resolveContextRange(selectedWeek, searchParams);

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-3 md:p-4">
      <div className="max-w-[1800px] xl:ml-0 xl:mr-auto space-y-4 min-w-0">
        <ControlBar />

        <section className="rounded-2xl bg-white border shadow-sm p-4">
          <div className="text-xs text-slate-500 mb-2">
            <Link href={rangeHref("/weekly-sheet", range)} className="hover:underline">
              ← Back to Weekly Sheet
            </Link>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">{areaGroup.label}</h2>
              <p className="mt-1 text-xs text-slate-600">
                Spreadsheet-style drill-down for the selected area and preserved date range.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-full border bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                {rangeLabel(range)}
              </div>
              {areaGroup.key && (
                <ContextBadge variant="neutral" className="px-2 py-1 text-[10px]">
                  Area {areaGroup.key}
                </ContextBadge>
              )}
            </div>
          </div>
        </section>

        <AreaSheetView areaKey={areaGroup.key} areaLabel={areaGroup.label} range={range} />
      </div>
    </main>
  );
}
