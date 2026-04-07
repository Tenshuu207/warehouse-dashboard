"use client";

import { useEffect, useMemo, useState } from "react";
import type { StandardsPayload, StandardsRow } from "@/lib/standards/types";

type SaveState = "idle" | "saving" | "saved" | "error";

function fmtNumber(value: number, digits = 0) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function parseNumber(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function rowKey(row: StandardsRow) {
  return `${row.scopeType}::${row.scopeName}`;
}

function EditableCell({
  value,
  editing,
  digits = 0,
  onChange,
}: {
  value: number;
  editing: boolean;
  digits?: number;
  onChange: (next: number) => void;
}) {
  if (!editing) {
    return <span>{fmtNumber(value, digits)}</span>;
  }

  return (
    <input
      type="number"
      step={digits > 0 ? "0.001" : "1"}
      value={value}
      onChange={(e) => onChange(parseNumber(e.target.value))}
      className="w-28 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
    />
  );
}

function EditableTextCell({
  value,
  editing,
  onChange,
}: {
  value?: string;
  editing: boolean;
  onChange: (next: string) => void;
}) {
  if (!editing) {
    return <span className="text-slate-600">{value || "—"}</span>;
  }

  return (
    <input
      type="text"
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      className="w-64 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
    />
  );
}

function EditableStatusCell({
  value,
  editing,
  onChange,
}: {
  value: "ready" | "provisional";
  editing: boolean;
  onChange: (next: "ready" | "provisional") => void;
}) {
  if (!editing) {
    return (
      <span
        className={[
          "rounded-full px-2 py-1 text-xs font-medium",
          value === "ready"
            ? "bg-emerald-50 text-emerald-700"
            : "bg-amber-50 text-amber-700",
        ].join(" ")}
      >
        {value}
      </span>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as "ready" | "provisional")}
      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
    >
      <option value="ready">ready</option>
      <option value="provisional">provisional</option>
    </select>
  );
}

function Table({
  rows,
  title,
  description,
  editing,
  onRowChange,
}: {
  rows: StandardsRow[];
  title: string;
  description: string;
  editing: boolean;
  onRowChange: (key: string, patch: Partial<StandardsRow>) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1300px] w-full text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr className="border-b border-slate-200 text-left">
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">People</th>
              <th className="px-4 py-3 font-semibold">Active Days</th>
              <th className="px-4 py-3 font-semibold">Daily Plates</th>
              <th className="px-4 py-3 font-semibold">Daily Pieces</th>
              <th className="px-4 py-3 font-semibold">Pieces/Plate</th>
              <th className="px-4 py-3 font-semibold">
                {title.includes("Team Area") ? "Est Team Hrs/Day" : "Est Hrs/Day"}
              </th>
              <th className="px-4 py-3 font-semibold">Est Plates/Hr</th>
              <th className="px-4 py-3 font-semibold">Est Pieces/Hr</th>
              <th className="px-4 py-3 font-semibold">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = rowKey(row);

              return (
                <tr key={key} className="border-b border-slate-100 align-top last:border-b-0">
                  <td className="px-4 py-3 font-medium text-slate-900">{row.scopeName}</td>
                  <td className="px-4 py-3">
                    <EditableStatusCell
                      value={row.status}
                      editing={editing}
                      onChange={(next) => onRowChange(key, { status: next })}
                    />
                  </td>
                  <td className="px-4 py-3">{fmtNumber(row.distinctPeople)}</td>
                  <td className="px-4 py-3">{fmtNumber(row.activeDays)}</td>
                  <td className="px-4 py-3">
                    <EditableCell
                      value={row.dailyPlatesStandard}
                      editing={editing}
                      onChange={(next) => onRowChange(key, { dailyPlatesStandard: next })}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <EditableCell
                      value={row.dailyPiecesStandard}
                      editing={editing}
                      digits={1}
                      onChange={(next) => onRowChange(key, { dailyPiecesStandard: next })}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <EditableCell
                      value={row.dailyPiecesPerPlateStandard}
                      editing={editing}
                      digits={3}
                      onChange={(next) => onRowChange(key, { dailyPiecesPerPlateStandard: next })}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <EditableCell
                      value={row.estimatedHoursPerDayFrom2025Hours}
                      editing={editing}
                      digits={3}
                      onChange={(next) => onRowChange(key, { estimatedHoursPerDayFrom2025Hours: next })}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <EditableCell
                      value={row.platesPerHourEstimated}
                      editing={editing}
                      digits={3}
                      onChange={(next) => onRowChange(key, { platesPerHourEstimated: next })}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <EditableCell
                      value={row.piecesPerHourEstimated}
                      editing={editing}
                      digits={3}
                      onChange={(next) => onRowChange(key, { piecesPerHourEstimated: next })}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <EditableTextCell
                      value={row.notes}
                      editing={editing}
                      onChange={(next) => onRowChange(key, { notes: next })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Notes({ rows }: { rows: StandardsRow[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Method Notes</h2>
      <ul className="mt-3 space-y-2 text-sm text-slate-600">
        {rows.slice(0, 6).map((row) => (
          <li key={rowKey(row)}>
            <span className="font-medium text-slate-800">{row.scopeName}:</span>{" "}
            {row.notes || "No note"}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function StandardsPage() {
  const [data, setData] = useState<StandardsPayload | null>(null);
  const [draft, setDraft] = useState<StandardsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/standards/no-restock", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load standards");
      const json = (await res.json()) as StandardsPayload;
      setData(json);
      setDraft(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load standards");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const teamAreas = useMemo(
    () => [...(draft?.teamAreas || [])].sort((a, b) => a.scopeName.localeCompare(b.scopeName)),
    [draft]
  );

  const roles = useMemo(
    () => [...(draft?.roles || [])].sort((a, b) => a.scopeName.localeCompare(b.scopeName)),
    [draft]
  );

  function updateRow(collection: "teamAreas" | "roles", key: string, patch: Partial<StandardsRow>) {
    setDraft((current) => {
      if (!current) return current;

      return {
        ...current,
        [collection]: current[collection].map((row) =>
          rowKey(row) === key ? { ...row, ...patch } : row
        ),
      };
    });
  }

  function handleRowChange(key: string, patch: Partial<StandardsRow>) {
    if (!draft) return;

    const [scopeType] = key.split("::");
    if (scopeType === "team_area") {
      updateRow("teamAreas", key, patch);
    } else {
      updateRow("roles", key, patch);
    }
  }

  async function handleSave() {
    if (!draft) return;

    setSaveState("saving");
    setError(null);

    try {
      const res = await fetch("/api/standards/no-restock", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          teamAreas: draft.teamAreas,
          roles: draft.roles,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to save");
      }

      const payload = json.payload as StandardsPayload;
      setData(payload);
      setDraft(payload);
      setEditing(false);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1800);
    } catch (err) {
      setSaveState("error");
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  }

  function handleCancel() {
    setDraft(data);
    setEditing(false);
    setSaveState("idle");
    setError(null);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-sm text-slate-600">Loading standards...</div>
          </div>
        </div>
      </main>
    );
  }

  if (!draft) {
    return (
      <main className="min-h-screen bg-slate-100">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
            <div className="text-sm text-red-700">{error || "Failed to load standards."}</div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-950">Standards</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Standards based on historical letdown + putaway work only. Team areas are full-team
                monitoring standards. Roles are operator-level expectations.
              </p>
              <div className="mt-3 text-xs text-slate-500">
                Source: {draft.source} · Updated: {draft.updatedAt}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!editing ? (
                <button
                  onClick={() => setEditing(true)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Edit Standards
                </button>
              ) : (
                <>
                  <button
                    onClick={handleCancel}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saveState === "saving"}
                    className="rounded-lg border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    {saveState === "saving" ? "Saving..." : "Save Overrides"}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Team Areas</div>
              <div className="mt-2 text-3xl font-semibold text-slate-950">{teamAreas.length}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Roles</div>
              <div className="mt-2 text-3xl font-semibold text-slate-950">{roles.length}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Edit Mode</div>
              <div className="mt-2 text-3xl font-semibold text-slate-950">{editing ? "On" : "Off"}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Save Status</div>
              <div className="mt-2 text-3xl font-semibold text-slate-950">
                {saveState === "idle" ? "Ready" : saveState === "saving" ? "Saving" : saveState === "saved" ? "Saved" : "Error"}
              </div>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <div className="font-medium text-slate-900">Methodology</div>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {draft.methodology.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>

        <div className="mt-6 space-y-6">
          <Table
            rows={teamAreas}
            title="Team Area Standards"
            description="Use these for full-area monitoring: combined Cooler, Dry, and Freezer team output."
            editing={editing}
            onRowChange={handleRowChange}
          />

          <Table
            rows={roles}
            title="Role Standards"
            description="Use these for operator-level expectations by role."
            editing={editing}
            onRowChange={handleRowChange}
          />

          <Notes rows={[...teamAreas, ...roles]} />
        </div>
      </div>
    </main>
  );
}
