"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import DashboardNav from "@/components/dashboard-nav";
import { useAppState } from "@/lib/app-state";
import { getWeekData } from "@/lib/data-resolver";

type EmployeeOption = {
  employeeId: string;
  displayName: string;
};

type MappingRow = {
  rowKey: string;
  rfUsername: string;
  employeeId: string;
  effectiveStartDate: string;
  effectiveEndDate: string;
  active: boolean;
  notes: string;
};

type EmployeesResponse = {
  employees: Record<
    string,
    {
      displayName: string;
    }
  >;
};

type MappingsResponse = {
  mappings: Array<{
    rfUsername: string;
    employeeId: string;
    effectiveStartDate?: string;
    effectiveEndDate?: string;
    active: boolean;
    notes?: string;
  }>;
};

function makeRow(partial?: Partial<MappingRow>): MappingRow {
  return {
    rowKey: partial?.rowKey || `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    rfUsername: partial?.rfUsername || "",
    employeeId: partial?.employeeId || "",
    effectiveStartDate: partial?.effectiveStartDate || "",
    effectiveEndDate: partial?.effectiveEndDate || "",
    active: partial?.active ?? true,
    notes: partial?.notes || "",
  };
}

export default function RfMappingsPage() {
  const { selectedWeek } = useAppState();

  const [rows, setRows] = useState<MappingRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
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

        const [weekData, employeesRes, mappingsRes] = await Promise.all([
          getWeekData(selectedWeek),
          fetch("/api/employees", { cache: "no-store" }),
          fetch("/api/rf-mappings", { cache: "no-store" }),
        ]);

        const employeesJson: EmployeesResponse = employeesRes.ok
          ? await employeesRes.json()
          : { employees: {} };

        const mappingsJson: MappingsResponse = mappingsRes.ok
          ? await mappingsRes.json()
          : { mappings: [] };

        const employeeOptions = Object.entries(employeesJson.employees || {})
          .map(([employeeId, value]) => ({
            employeeId,
            displayName: value.displayName,
          }))
          .sort((a, b) => a.displayName.localeCompare(b.displayName));

        const existingRows = (mappingsJson.mappings || []).map((mapping) =>
          makeRow({
            rfUsername: mapping.rfUsername,
            employeeId: mapping.employeeId,
            effectiveStartDate: mapping.effectiveStartDate || "",
            effectiveEndDate: mapping.effectiveEndDate || "",
            active: mapping.active,
            notes: mapping.notes || "",
          })
        );

        const existingUsernames = new Set(existingRows.map((row) => row.rfUsername));
        const bootstrapRows = (weekData.operators || [])
          .filter((op) => !existingUsernames.has(op.userid))
          .map((op) =>
            makeRow({
              rfUsername: op.userid,
              active: true,
            })
          );

        const nextRows = [...existingRows, ...bootstrapRows].sort((a, b) =>
          a.rfUsername.localeCompare(b.rfUsername)
        );

        if (!cancelled) {
          setEmployees(employeeOptions);
          setRows(nextRows);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load RF mappings");
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

    return rows.filter((row) => {
      const employeeLabel =
        employees.find((emp) => emp.employeeId === row.employeeId)?.displayName || "";
      return (
        row.rfUsername.toLowerCase().includes(q) ||
        row.employeeId.toLowerCase().includes(q) ||
        employeeLabel.toLowerCase().includes(q)
      );
    });
  }, [rows, employees, search]);

  function updateRow(rowKey: string, field: keyof MappingRow, value: string | boolean) {
    setSaved(false);
    setRows((prev) =>
      prev.map((row) => (row.rowKey === rowKey ? { ...row, [field]: value } : row))
    );
  }

  function addRow() {
    setSaved(false);
    setRows((prev) => [...prev, makeRow()]);
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

      const payload = {
        mappings: rows
          .map((row) => ({
            rfUsername: row.rfUsername.trim(),
            employeeId: row.employeeId.trim(),
            effectiveStartDate: row.effectiveStartDate.trim(),
            effectiveEndDate: row.effectiveEndDate.trim(),
            active: row.active,
            notes: row.notes.trim(),
          }))
          .filter((row) => row.rfUsername && row.employeeId),
      };

      const res = await fetch("/api/rf-mappings", {
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
          <h2 className="text-xl font-bold">RF Username Mappings</h2>
          <p className="mt-1 text-xs text-slate-600">
            Map raw RF usernames to canonical employees over time. This is what prevents reused usernames from merging history.
          </p>
        </section>

        {loading && (
          <section className="rounded-2xl bg-white border shadow-sm p-4 text-sm text-slate-600">
            Loading RF mappings...
          </section>
        )}

        {!loading && (
          <section className="rounded-2xl bg-white border shadow-sm p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search RF username or employee"
                className="min-w-[280px] flex-1 rounded-xl border px-3 py-2"
              />
              <button
                type="button"
                onClick={addRow}
                className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50"
              >
                Add Mapping
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px] text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-semibold">RF Username</th>
                    <th className="px-3 py-3 font-semibold">Employee</th>
                    <th className="px-3 py-3 font-semibold">Effective Start</th>
                    <th className="px-3 py-3 font-semibold">Effective End</th>
                    <th className="px-3 py-3 font-semibold">Active</th>
                    <th className="px-3 py-3 font-semibold">Notes</th>
                    <th className="px-3 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.rowKey} className="border-b last:border-b-0">
                      <td className="px-4 py-3">
                        <input
                          value={row.rfUsername}
                          onChange={(e) => updateRow(row.rowKey, "rfUsername", e.target.value)}
                          className="w-full rounded-lg border px-3 py-2"
                          placeholder="rfsmf"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={row.employeeId}
                          onChange={(e) => updateRow(row.rowKey, "employeeId", e.target.value)}
                          className="w-full rounded-lg border px-3 py-2 bg-white"
                        >
                          <option value="">Select employee</option>
                          {employees.map((employee) => (
                            <option key={employee.employeeId} value={employee.employeeId}>
                              {employee.displayName} ({employee.employeeId})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="date"
                          value={row.effectiveStartDate}
                          onChange={(e) => updateRow(row.rowKey, "effectiveStartDate", e.target.value)}
                          className="w-full rounded-lg border px-3 py-2"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="date"
                          value={row.effectiveEndDate}
                          onChange={(e) => updateRow(row.rowKey, "effectiveEndDate", e.target.value)}
                          className="w-full rounded-lg border px-3 py-2"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={row.active}
                            onChange={(e) => updateRow(row.rowKey, "active", e.target.checked)}
                          />
                          <span>{row.active ? "Yes" : "No"}</span>
                        </label>
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
                {saving ? "Saving..." : "Save RF Mappings"}
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
