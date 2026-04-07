"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppState } from "@/lib/app-state";
import type { HomeAssignmentSection } from "@/lib/assignments/home-assignments-types";
import type { DailyAssignmentsPayload } from "@/lib/assignments/daily-assignments-types";

type SaveState = "idle" | "saving" | "saved" | "error";
type JsonRecord = Record<string, unknown>;
type MoveState = {
  sectionIndex: number;
  employeeIndex: number;
  employeeName: string;
} | null;

const TEAM_ORDER = ["Freezer", "Freezer PIR", "Dry", "Dry PIR", "Cooler", "Receiving", "Unassigned"];

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function groupSections(sections: HomeAssignmentSection[]) {
  const grouped = new Map<string, HomeAssignmentSection[]>();

  for (const team of TEAM_ORDER) grouped.set(team, []);

  for (const section of sections) {
    const existing = grouped.get(section.team) || [];
    existing.push(section);
    grouped.set(section.team, existing);
  }

  for (const [team, list] of grouped.entries()) {
    list.sort((a, b) => a.role.localeCompare(b.role));
    grouped.set(team, list);
  }

  return grouped;
}

function countDuplicates(sections: HomeAssignmentSection[]) {
  const counts = new Map<string, number>();

  for (const section of sections) {
    for (const employee of section.employees) {
      const key = normalizeName(employee);
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([name]) => name)
    .sort();
}

function totalAssigned(sections: HomeAssignmentSection[]) {
  return sections.reduce(
    (sum, section) => sum + section.employees.filter((name) => name.trim()).length,
    0
  );
}

function uniqueAssigned(sections: HomeAssignmentSection[]) {
  const set = new Set<string>();

  for (const section of sections) {
    for (const employee of section.employees) {
      const key = normalizeName(employee);
      if (key) set.add(key);
    }
  }

  return set.size;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickString(obj: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function extractEmployeeNames(payload: unknown): string[] {
  const out = new Set<string>();

  function addName(value: unknown) {
    if (typeof value === "string" && value.trim()) out.add(value.trim());
  }

  function scanArray(arr: unknown[]) {
    for (const item of arr) {
      if (typeof item === "string") {
        addName(item);
        continue;
      }

      if (isRecord(item)) {
        addName(
          pickString(item, [
            "name",
            "fullName",
            "employeeName",
            "displayName",
            "label",
            "userid",
          ])
        );
      }
    }
  }

  if (Array.isArray(payload)) {
    scanArray(payload);
  } else if (isRecord(payload)) {
    const directKeys = ["employees", "rows", "items", "data"];

    for (const key of directKeys) {
      const value = payload[key];
      if (Array.isArray(value)) scanArray(value);
    }

    const nestedData = payload["data"];
    if (isRecord(nestedData)) {
      for (const key of directKeys) {
        const value = nestedData[key];
        if (Array.isArray(value)) scanArray(value);
      }
    }
  }

  return [...out].sort((a, b) => a.localeCompare(b));
}

function unknownNames(sections: HomeAssignmentSection[], employeeNames: string[]) {
  const valid = new Set(employeeNames.map(normalizeName));
  const unknown = new Set<string>();

  for (const section of sections) {
    for (const employee of section.employees) {
      const raw = employee.trim();
      if (!raw) continue;
      if (!valid.has(normalizeName(raw))) unknown.add(raw);
    }
  }

  return [...unknown].sort((a, b) => a.localeCompare(b));
}

function subsequenceScore(query: string, target: string) {
  let qi = 0;
  let score = 0;

  for (let i = 0; i < target.length && qi < query.length; i++) {
    if (target[i] === query[qi]) {
      score += i === qi ? 3 : 1;
      qi += 1;
    }
  }

  return qi === query.length ? score : -1;
}

function bestMatches(input: string, employeeNames: string[]) {
  const query = normalizeName(input);
  if (!query) return employeeNames.slice(0, 8);

  const scored = employeeNames
    .map((name) => {
      const normalized = normalizeName(name);
      const words = normalized.split(/\s+/);
      let score = -1;

      if (normalized === query) score = 1000;
      else if (normalized.startsWith(query)) score = 900 - Math.max(0, normalized.length - query.length);
      else if (words.some((word) => word.startsWith(query))) score = 800;
      else if (normalized.includes(query)) score = 700 - normalized.indexOf(query);
      else {
        const subseq = subsequenceScore(query, normalized);
        if (subseq >= 0) score = 500 + subseq;
      }

      return { name, score };
    })
    .filter((row) => row.score >= 0)
    .sort((a, b) => (b.score - a.score) || a.name.localeCompare(b.name))
    .slice(0, 6);

  return scored.map((row) => row.name);
}

function availableNamesForSlot(
  sections: HomeAssignmentSection[],
  employeeNames: string[],
  sectionIndex: number,
  employeeIndex: number
) {
  const blocked = new Set<string>();
  const current = sections[sectionIndex]?.employees[employeeIndex] || "";
  const currentNorm = normalizeName(current);

  sections.forEach((section, sIdx) => {
    section.employees.forEach((employee, eIdx) => {
      if (sIdx === sectionIndex && eIdx === employeeIndex) return;
      const key = normalizeName(employee);
      if (key) blocked.add(key);
    });
  });

  return employeeNames.filter((name) => {
    const key = normalizeName(name);
    return key === currentNorm || !blocked.has(key);
  });
}

function EmployeeSlot({
  value,
  availableEmployeeNames,
  onChange,
  moving,
  isSource,
  canMoveHere,
  onStartMove,
  onMoveHere,
}: {
  value: string;
  availableEmployeeNames: string[];
  onChange: (next: string) => void;
  moving: boolean;
  isSource: boolean;
  canMoveHere: boolean;
  onStartMove: () => void;
  onMoveHere: () => void;
}) {
  const suggestions = useMemo(
    () => bestMatches(value, availableEmployeeNames),
    [value, availableEmployeeNames]
  );

  return (
    <div
      className={[
        "space-y-2 rounded-xl border p-3 transition",
        isSource
          ? "border-slate-900 bg-slate-50"
          : moving && canMoveHere
            ? "border-blue-300 bg-blue-50"
            : "border-slate-200 bg-white",
      ].join(" ")}
    >
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type employee name"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
      />

      {suggestions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => onChange(name)}
              className={[
                "rounded-full border px-3 py-1 text-xs font-medium transition",
                normalizeName(value) === normalizeName(name)
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
              ].join(" ")}
            >
              {name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {value.trim() ? (
          <button
            type="button"
            onClick={onStartMove}
            className={[
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
              isSource
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
            ].join(" ")}
          >
            {isSource ? "Moving" : "Move"}
          </button>
        ) : null}

        {moving && canMoveHere ? (
          <button
            type="button"
            onClick={onMoveHere}
            className="rounded-lg border border-blue-300 bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            {value.trim() ? "Swap Here" : "Move Here"}
          </button>
        ) : null}
      </div>

      <div className="text-[11px] text-slate-500">
        Already-assigned employees are excluded from suggestions for this slot.
      </div>
    </div>
  );
}

function SectionBlock({
  section,
  sectionIndex,
  allSections,
  employeeNames,
  moveState,
  onEmployeeChange,
  onAddSlot,
  onRemoveLastEmptySlot,
  onStartMove,
  onMoveHere,
}: {
  section: HomeAssignmentSection;
  sectionIndex: number;
  allSections: HomeAssignmentSection[];
  employeeNames: string[];
  moveState: MoveState;
  onEmployeeChange: (sectionIndex: number, employeeIndex: number, value: string) => void;
  onAddSlot: (sectionIndex: number) => void;
  onRemoveLastEmptySlot: (sectionIndex: number) => void;
  onStartMove: (sectionIndex: number, employeeIndex: number, employeeName: string) => void;
  onMoveHere: (targetSectionIndex: number, targetEmployeeIndex: number) => void;
}) {
  const filled = section.employees.filter((name) => name.trim()).length;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">{section.role}</div>
            <div className="mt-1 text-xs text-slate-500">{section.team}</div>
          </div>

          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
            {filled} assigned
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        {section.employees.map((employee, employeeIndex) => {
          const availableEmployeeNames = availableNamesForSlot(
            allSections,
            employeeNames,
            sectionIndex,
            employeeIndex
          );

          const isSource =
            moveState?.sectionIndex === sectionIndex &&
            moveState?.employeeIndex === employeeIndex;

          const canMoveHere = Boolean(moveState) && !isSource;

          return (
            <div key={`${section.team}-${section.role}-${employeeIndex}`}>
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Slot {employeeIndex + 1}
              </div>

              <EmployeeSlot
                value={employee}
                availableEmployeeNames={availableEmployeeNames}
                onChange={(next) => onEmployeeChange(sectionIndex, employeeIndex, next)}
                moving={Boolean(moveState)}
                isSource={isSource}
                canMoveHere={canMoveHere}
                onStartMove={() => onStartMove(sectionIndex, employeeIndex, employee)}
                onMoveHere={() => onMoveHere(sectionIndex, employeeIndex)}
              />
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-slate-200 px-4 py-4">
        <button
          type="button"
          onClick={() => onAddSlot(sectionIndex)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Add Slot
        </button>
        <button
          type="button"
          onClick={() => onRemoveLastEmptySlot(sectionIndex)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Remove Last Empty
        </button>
      </div>
    </div>
  );
}

export default function DailyAssignmentsPage() {
  const { selectedWeek } = useAppState();

  const [data, setData] = useState<DailyAssignmentsPayload | null>(null);
  const [draft, setDraft] = useState<DailyAssignmentsPayload | null>(null);
  const [employeeNames, setEmployeeNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [moveState, setMoveState] = useState<MoveState>(null);

  async function load() {
    if (!selectedWeek) {
      setLoading(false);
      setError("No selected date found.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [dailyRes, employeesRes] = await Promise.all([
        fetch(`/api/daily-assignments?date=${encodeURIComponent(selectedWeek)}`, { cache: "no-store" }),
        fetch("/api/employees", { cache: "no-store" }),
      ]);

      if (!dailyRes.ok) throw new Error("Failed to load daily assignments");

      const dailyJson = (await dailyRes.json()) as DailyAssignmentsPayload;
      let employeeList: string[] = [];

      if (employeesRes.ok) {
        const employeesJson = await employeesRes.json();
        employeeList = extractEmployeeNames(employeesJson);
      }

      const assignedNames = new Set<string>();
      for (const section of dailyJson.sections) {
        for (const employee of section.employees) {
          if (employee.trim()) assignedNames.add(employee.trim());
        }
      }

      const mergedEmployeeNames = [...new Set([...employeeList, ...assignedNames])].sort((a, b) =>
        a.localeCompare(b)
      );

      setData(dailyJson);
      setDraft(dailyJson);
      setEmployeeNames(mergedEmployeeNames);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load daily assignments");
    } finally {
      setLoading(false);
    }
  }

  async function loadHomeDefaults() {
    if (!selectedWeek) return;

    try {
      const res = await fetch("/api/home-assignments", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load home defaults");

      const json = await res.json();
      const sections = Array.isArray(json.sections) ? json.sections : [];

      setDraft({
        date: selectedWeek,
        updatedAt: null,
        sections,
      });
      setMoveState(null);
      setSaveState("idle");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load home defaults");
    }
  }

  useEffect(() => {
    void load();
    // selectedWeek is the real trigger here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWeek]);

  const grouped = useMemo(() => groupSections(draft?.sections || []), [draft]);
  const duplicateNames = useMemo(() => countDuplicates(draft?.sections || []), [draft]);
  const unknownEmployeeNames = useMemo(
    () => unknownNames(draft?.sections || [], employeeNames),
    [draft, employeeNames]
  );
  const assignedCount = useMemo(() => totalAssigned(draft?.sections || []), [draft]);
  const uniqueCount = useMemo(() => uniqueAssigned(draft?.sections || []), [draft]);

  function updateEmployee(sectionIndex: number, employeeIndex: number, value: string) {
    setMoveState(null);

    setDraft((current) => {
      if (!current) return current;

      return {
        ...current,
        sections: current.sections.map((section, idx) =>
          idx === sectionIndex
            ? {
                ...section,
                employees: section.employees.map((employee, eIdx) =>
                  eIdx === employeeIndex ? value : employee
                ),
              }
            : section
        ),
      };
    });
  }

  function addSlot(sectionIndex: number) {
    setDraft((current) => {
      if (!current) return current;

      return {
        ...current,
        sections: current.sections.map((section, idx) =>
          idx === sectionIndex ? { ...section, employees: [...section.employees, ""] } : section
        ),
      };
    });
  }

  function removeLastEmptySlot(sectionIndex: number) {
    setDraft((current) => {
      if (!current) return current;

      return {
        ...current,
        sections: current.sections.map((section, idx) => {
          if (idx !== sectionIndex) return section;
          if (section.employees.length <= 1) return section;

          const last = section.employees[section.employees.length - 1];
          if (last.trim()) return section;

          return { ...section, employees: section.employees.slice(0, -1) };
        }),
      };
    });
  }

  function startMove(sectionIndex: number, employeeIndex: number, employeeName: string) {
    if (!employeeName.trim()) return;
    setMoveState({ sectionIndex, employeeIndex, employeeName });
  }

  function moveHere(targetSectionIndex: number, targetEmployeeIndex: number) {
    if (!moveState) return;

    setDraft((current) => {
      if (!current) return current;

      const nextSections = current.sections.map((section) => ({
        ...section,
        employees: [...section.employees],
      }));

      const sourceValue =
        nextSections[moveState.sectionIndex]?.employees[moveState.employeeIndex] || "";
      const targetValue =
        nextSections[targetSectionIndex]?.employees[targetEmployeeIndex] || "";

      nextSections[moveState.sectionIndex].employees[moveState.employeeIndex] = targetValue;
      nextSections[targetSectionIndex].employees[targetEmployeeIndex] = sourceValue;

      return {
        ...current,
        sections: nextSections,
      };
    });

    setMoveState(null);
  }

  async function handleSave() {
    if (!draft) return;

    if (duplicateNames.length > 0) {
      setSaveState("error");
      setError("Resolve duplicate employee assignments before saving.");
      return;
    }

    setSaveState("saving");
    setError(null);

    try {
      const res = await fetch("/api/daily-assignments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draft),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to save daily assignments");
      }

      const payload = json.payload as DailyAssignmentsPayload;
      setData(payload);
      setDraft(payload);
      setMoveState(null);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1800);
    } catch (err) {
      setSaveState("error");
      setError(err instanceof Error ? err.message : "Failed to save daily assignments");
    }
  }

  function handleReset() {
    setDraft(data);
    setMoveState(null);
    setSaveState("idle");
    setError(null);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-sm text-slate-600">Loading daily assignments...</div>
          </div>
        </div>
      </main>
    );
  }

  if (!draft) {
    return (
      <main className="min-h-screen bg-slate-100">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
            <div className="text-sm text-red-700">{error || "Failed to load daily assignments."}</div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-950">Daily Assignments</h1>
              <p className="mt-2 text-sm text-slate-600">
                Set performance team and role for the selected date. First load prefills from Homes.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
                  Date: {draft.date}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
                  Employee List: {employeeNames.length}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
                  Assigned: {assignedCount}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
                  Unique: {uniqueCount}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
                  Updated: {draft.updatedAt || "Not saved yet"}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {moveState ? (
                <button
                  onClick={() => setMoveState(null)}
                  className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
                >
                  Cancel Move: {moveState.employeeName}
                </button>
              ) : null}
              <button
                onClick={loadHomeDefaults}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Reload Homes
              </button>
              <button
                onClick={handleReset}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Reset
              </button>
              <button
                onClick={handleSave}
                disabled={saveState === "saving" || duplicateNames.length > 0}
                className="rounded-lg border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {saveState === "saving" ? "Saving..." : "Save Day"}
              </button>
            </div>
          </div>

          {duplicateNames.length > 0 ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Duplicate names across roles: {duplicateNames.join(", ")}. Save is blocked until duplicates are fixed.
            </div>
          ) : null}

          {unknownEmployeeNames.length > 0 ? (
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              Names not found in employee list: {unknownEmployeeNames.join(", ")}
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </section>

        <div className="mt-6 space-y-6">
          {TEAM_ORDER.map((team) => {
            const sections = grouped.get(team) || [];
            if (sections.length === 0) return null;

            return (
              <section key={team} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-5 py-4">
                  <h2 className="text-lg font-semibold text-slate-900">{team}</h2>
                </div>

                <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
                  {sections.map((section) => {
                    const sectionIndex = draft.sections.findIndex(
                      (row) => row.team === section.team && row.role === section.role
                    );

                    return (
                      <SectionBlock
                        key={`${section.team}-${section.role}`}
                        section={section}
                        sectionIndex={sectionIndex}
                        allSections={draft.sections}
                        employeeNames={employeeNames}
                        moveState={moveState}
                        onEmployeeChange={updateEmployee}
                        onAddSlot={addSlot}
                        onRemoveLastEmptySlot={removeLastEmptySlot}
                        onStartMove={startMove}
                        onMoveHere={moveHere}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
