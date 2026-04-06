"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import DashboardNav from "@/components/dashboard-nav";
import ControlBar from "@/components/control-bar";
import AreaSheetView from "@/components/area-sheet-view";

export default function AreaDetailPage() {
  const params = useParams<{ area: string }>();
  const area = decodeURIComponent(
    Array.isArray(params?.area) ? params.area[0] : params?.area || "Unknown"
  );

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-3 md:p-4">
      <div className="max-w-[1800px] xl:ml-0 xl:mr-auto space-y-4 min-w-0">
        <DashboardNav />
        <ControlBar />

        <section className="rounded-2xl bg-white border shadow-sm p-4">
          <div className="text-xs text-slate-500 mb-2">
            <Link href="/weekly-sheet" className="hover:underline">
              ← Back to Weekly Sheet
            </Link>
          </div>
          <h2 className="text-xl font-bold">{area} Area Sheet View</h2>
          <p className="mt-1 text-xs text-slate-600">
            Spreadsheet-style weekly drill-down for this area.
          </p>
        </section>

        <AreaSheetView area={area} />
      </div>
    </main>
  );
}
