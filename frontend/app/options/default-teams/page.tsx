"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import DashboardNav from "@/components/dashboard-nav";
import { useAppState } from "@/lib/app-state";
import { getWeekData } from "@/lib/data-resolver";

type OperatorDefault = {
  name?: string;
  defaultTeam: string;
};

type DefaultsResponse = {
  operators: Record<string, OperatorDefault>;
  validTeams?: string[];
};

type Row = {
  userid: string;
  name: string;
  defaultTeam: string;
};

function inferTeam(area: string | null | undefined, validTeams: string[]): string {
  if (area && validTeams.includes(area)) return area;
  return validTeams[0] || "Other";
}

export default function DefaultTeamsPage() {
  const { selectedWeek } = useAppState();

  const [rows, setRows] = useState<Row[]>([]);
  const [validTeams, setValidTeams] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [weekData, defaultsRes] = await Promise.all([
          getWeekData(selectedWeek),
          fetch("/api/operator-defaults", { cache: "no-store" }),
        ]);

        const defaultsJson: DefaultsResponse = defaultsRes.ok
          ? await defaultsRes.json()
          : { operators: {}, validTeams: ["Other"] };

        const defaults = defaultsJson.operators || {};
        const nextValidTeams = Array.isArray(defaultsJson.validTeams) && defaultsJson.validTeams.length
          ? defaultsJson.validTeams
          : ["Other"];

        const nextRows: Row[] = (weekData.operators || [])
          .map((op) => {
            const current = defaults[op.userid];
            return {
              userid: op.userid,
              name: op.name,
              defaultTeam:
                current?.defaultTeam ||
                inferTeam(op.rawAssignedArea || op.effectiveAssignedArea || op.assignedArea || op.area, nextValidTeams),
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));

        if (!cancelled) {
          setValidTeams(nextValidTeams);
          setRows(nextRows);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load default teams");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [selectedWeek]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        row.userid.toLowerCase().includes(q) ||
        row.defaultTeam.toLowerCase().includes(q)
    );
  }, [rows, search]);

  function updateRow(userid: string, defaultTeam: string) {
    setSaved(false);
    setRows((prev) =>
      prev.map((row) => (row.userid === userid ? { ...row, defaultTeam } : row))
    );
  }

  async function save() {
    try {
      setSaving(true);
      setError(null);
      setSaved(false);

      const payload = {
        operators: Object.fromEntries(
          rows.map((row) => [
            row.userid,
            {
              name: row.name,
              defaultTeam: row.defaultTeam,
            },
          ])
        ),
      };

      const res = await fetch("/api/operator-defaults", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || "Save failed");
      }

      const json: DefaultsResponse = await res.json();
      setValidTeams(Array.isArray(json.validTeams) && json.validTeams.length ? json.validTeams : validTeams);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-3 md:p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <DashboardNav />

        <section className="rounded-2xl bg-white border shadow-sm p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs text-slate-500 mb-2">
                <Link href="/options" className="hover:underline">
                  ← Back to Options
                </Link>
              </div>
              <div className="flex items-center gap-2"><h2 className="text-xl font-bold">Default Teams</h2><span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">Legacy</span></div>
              <p className="mt-1 text-xs text-slate-600">
                Older RF-username-based team assignment tool. Prefer Employees for long-term home team ownership and use this only while transitioning.
              </p>
            </div>

            <div className="text-right text-xs text-slate-500">
              <div>Source week: {selectedWeek}</div>
            </div>
          </div>
        </section>

        {loading && (
          <section className="rounded-2xl bg-white border shadow-sm p-4 text-sm text-slate-600">
            Loading default teams...
          </section>
        )}

        {!loading && (
          <section className="rounded-2xl bg-white border shadow-sm p-4 space-y-4">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search operator, userid, or team"
              className="w-full rounded-xl border px-3 py-2"
            />

            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-semibold">Name</th>
                    <th className="px-3 py-3 font-semibold">User ID</th>
                    <th className="px-3 py-3 font-semibold">Default Team</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.userid} className="border-b last:border-b-0">
                      <td className="px-4 py-3">{row.name}</td>
                      <td className="px-3 py-3 text-slate-500">{row.userid}</td>
                      <td className="px-3 py-3">
                        <select
                          value={row.defaultTeam}
                          onChange={(e) => updateRow(row.userid, e.target.value)}
                          className="rounded-lg border px-3 py-2 bg-white"
                        >
                          {validTeams.map((team) => (
                            <option key={team} value={team}>
                              {team}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-lg border bg-slate-900 text-white px-3 py-2 text-sm disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Default Teams"}
              </button>

              {saved && (
                <span className="text-xs rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-green-700">
                  Saved
                </span>
              )}

              {error && (
                <span className="text-xs rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-red-700">
                  {error}
                </span>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
