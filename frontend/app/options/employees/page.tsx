"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import DashboardNav from "@/components/dashboard-nav";

type EmployeeRow = {
  rowKey: string;
  employeeId: string;
  displayName: string;
  status: string;
  defaultTeam: string;
  notes: string;
};

type EmployeesResponse = {
  employees: Record<
    string,
    {
      displayName: string;
      status: string;
      defaultTeam: string;
      notes?: string;
    }
  >;
  validTeams?: string[];
  validStatuses?: string[];
};

function makeRow(partial?: Partial<EmployeeRow>): EmployeeRow {
  return {
    rowKey: partial?.rowKey || `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    employeeId: partial?.employeeId || "",
    displayName: partial?.displayName || "",
    status: partial?.status || "active",
    defaultTeam: partial?.defaultTeam || "",
    notes: partial?.notes || "",
  };
}

export default function EmployeesPage() {
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [validTeams, setValidTeams] = useState<string[]>(["Other"]);
  const [validStatuses, setValidStatuses] = useState<string[]>(["active", "inactive"]);
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

        const res = await fetch("/api/employees", { cache: "no-store" });
        const json: EmployeesResponse = res.ok
          ? await res.json()
          : { employees: {}, validTeams: ["Other"], validStatuses: ["active", "inactive"] };

        const nextRows = Object.entries(json.employees || {})
          .map(([employeeId, value]) =>
            makeRow({
              employeeId,
              displayName: value.displayName,
              status: value.status,
              defaultTeam: value.defaultTeam,
              notes: value.notes || "",
            })
          )
          .sort((a, b) => a.displayName.localeCompare(b.displayName));

        if (!cancelled) {
          setRows(nextRows);
          setValidTeams(Array.isArray(json.validTeams) && json.validTeams.length ? json.validTeams : ["Other"]);
          setValidStatuses(
            Array.isArray(json.validStatuses) && json.validStatuses.length
              ? json.validStatuses
              : ["active", "inactive"]
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load employees");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.employeeId.toLowerCase().includes(q) ||
        row.displayName.toLowerCase().includes(q) ||
        row.defaultTeam.toLowerCase().includes(q) ||
        row.status.toLowerCase().includes(q)
    );
  }, [rows, search]);

  function updateRow(rowKey: string, field: keyof EmployeeRow, value: string) {
    setSaved(false);
    setRows((prev) =>
      prev.map((row) => (row.rowKey === rowKey ? { ...row, [field]: value } : row))
    );
  }

  function addRow() {
    setSaved(false);
    setRows((prev) => [...prev, makeRow({ defaultTeam: validTeams[0] || "Other" })]);
  }

  function removeRow(rowKey: string) {
    setSaved(false);
    setRows((prev) => prev.filter((row) => row.rowKey !== rowKey));
  }

  async function save() {
    try {
      setSaving(true);
      setError(null);
      setSaved(false);

      const cleanedRows = rows
        .map((row) => ({
          employeeId: row.employeeId.trim(),
          displayName: row.displayName.trim(),
          status: row.status.trim(),
          defaultTeam: row.defaultTeam.trim(),
          notes: row.notes.trim(),
        }))
        .filter((row) => row.displayName);

      const explicitIds = cleanedRows.map((row) => row.employeeId).filter(Boolean);
      const duplicate = explicitIds.find((id, idx) => explicitIds.indexOf(id) !== idx);
      if (duplicate) {
        throw new Error(`Duplicate employeeId: ${duplicate}`);
      }

      const res = await fetch("/api/employees", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rows: cleanedRows,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || "Save failed");
      }

      const json: EmployeesResponse = await res.json();

      const nextRows = Object.entries(json.employees || {})
        .map(([employeeId, value]) =>
          makeRow({
            employeeId,
            displayName: value.displayName,
            status: value.status,
            defaultTeam: value.defaultTeam,
            notes: value.notes || "",
          })
        )
        .sort((a, b) => a.displayName.localeCompare(b.displayName));

      setRows(nextRows);
      setValidTeams(Array.isArray(json.validTeams) && json.validTeams.length ? json.validTeams : validTeams);
      setValidStatuses(
        Array.isArray(json.validStatuses) && json.validStatuses.length
          ? json.validStatuses
          : validStatuses
      );
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-3 md:p-4">
      <div className="mx-auto max-w-7xl space-y-4">
        <DashboardNav />

        <section className="rounded-2xl bg-white border shadow-sm p-4">
          <div className="text-xs text-slate-500 mb-2">
            <Link href="/options" className="hover:underline">
              ← Back to Options
            </Link>
          </div>
          <h2 className="text-xl font-bold">Employees</h2>
          <p className="mt-1 text-xs text-slate-600">
            Canonical employee registry. Employee IDs are internal and auto-generated for new rows.
          </p>
        </section>

        {loading && (
          <section className="rounded-2xl bg-white border shadow-sm p-4 text-sm text-slate-600">
            Loading employees...
          </section>
        )}

        {!loading && (
          <section className="rounded-2xl bg-white border shadow-sm p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search employee id, name, team, or status"
                className="min-w-[280px] flex-1 rounded-xl border px-3 py-2"
              />
              <button
                type="button"
                onClick={addRow}
                className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50"
              >
                Add Employee
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-semibold">Employee ID</th>
                    <th className="px-3 py-3 font-semibold">Display Name</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 font-semibold">Default Team</th>
                    <th className="px-3 py-3 font-semibold">Notes</th>
                    <th className="px-3 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.rowKey} className="border-b last:border-b-0">
                      <td className="px-4 py-3">
                        {row.employeeId ? (
                          <div className="font-mono text-sm">{row.employeeId}</div>
                        ) : (
                          <div className="text-xs text-slate-400">Auto on save</div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <input
                          value={row.displayName}
                          onChange={(e) => updateRow(row.rowKey, "displayName", e.target.value)}
                          className="w-full rounded-lg border px-3 py-2"
                          placeholder="Finley"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={row.status}
                          onChange={(e) => updateRow(row.rowKey, "status", e.target.value)}
                          className="w-full rounded-lg border px-3 py-2 bg-white"
                        >
                          {validStatuses.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={row.defaultTeam}
                          onChange={(e) => updateRow(row.rowKey, "defaultTeam", e.target.value)}
                          className="w-full rounded-lg border px-3 py-2 bg-white"
                        >
                          {validTeams.map((team) => (
                            <option key={team} value={team}>
                              {team}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <input
                          value={row.notes}
                          onChange={(e) => updateRow(row.rowKey, "notes", e.target.value)}
                          className="w-full rounded-lg border px-3 py-2"
                          placeholder="Optional notes"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => removeRow(row.rowKey)}
                          className="rounded-lg border bg-white px-3 py-2 text-xs hover:bg-slate-50"
                        >
                          Remove
                        </button>
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
                {saving ? "Saving..." : "Save Employees"}
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
