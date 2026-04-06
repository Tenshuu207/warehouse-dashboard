import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import type { EmployeeRecord, RfMapping } from "@/lib/employee-identity";
import type { IdentityReviewItem } from "@/lib/identity-review";

type QueueFile = {
  items: IdentityReviewItem[];
};

type EmployeesFile = {
  employees: Record<string, EmployeeRecord>;
};

type MappingsFile = {
  mappings: RfMapping[];
};

function queuePath() {
  return path.join(process.cwd(), "..", "ingest", "config", "identity_review_queue.json");
}

function employeesPath() {
  return path.join(process.cwd(), "..", "ingest", "config", "employees.json");
}

function mappingsPath() {
  return path.join(process.cwd(), "..", "ingest", "config", "rf_username_mappings.json");
}

function optionsPath() {
  return path.join(process.cwd(), "..", "ingest", "config", "options.json");
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf-8");
}

async function readValidTeams(): Promise<string[]> {
  const options = await readJson<{ areas?: string[] }>(optionsPath(), { areas: ["Other"] });
  return Array.isArray(options.areas) && options.areas.length ? options.areas : ["Other"];
}

function nextEmployeeId(existingIds: string[]): string {
  const numbers = existingIds
    .map((id) => {
      const m = /^EMP(\d+)$/i.exec(id.trim());
      return m ? Number(m[1]) : null;
    })
    .filter((v): v is number => v !== null && Number.isFinite(v));

  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `EMP${String(next).padStart(4, "0")}`;
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\(rf\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findExactNameMatches(
  employees: Record<string, EmployeeRecord>,
  displayName: string
): Array<{ employeeId: string; employee: EmployeeRecord }> {
  const target = normalizeName(displayName);
  if (!target) return [];

  return Object.entries(employees)
    .filter(([, employee]) => normalizeName(employee.displayName || "") === target)
    .map(([employeeId, employee]) => ({ employeeId, employee }));
}

function ensureMapping(
  mappings: RfMapping[],
  rfUsername: string,
  employeeId: string,
  firstSeenDate: string
) {
  const exists = mappings.some(
    (m) =>
      m.rfUsername === rfUsername &&
      m.employeeId === employeeId &&
      (m.effectiveStartDate || "") === firstSeenDate
  );

  if (!exists) {
    mappings.push({
      rfUsername,
      employeeId,
      effectiveStartDate: firstSeenDate,
      active: true,
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = typeof body?.action === "string" ? body.action.trim() : "";
    const itemId = typeof body?.itemId === "string" ? body.itemId.trim() : "";

    if (!itemId) {
      return NextResponse.json({ error: "missing_item_id" }, { status: 400 });
    }

    const validTeams = await readValidTeams();
    const queue = await readJson<QueueFile>(queuePath(), { items: [] });
    const employees = await readJson<EmployeesFile>(employeesPath(), { employees: {} });
    const mappings = await readJson<MappingsFile>(mappingsPath(), { mappings: [] });

    const item = queue.items.find((q) => q.id === itemId);
    if (!item) {
      return NextResponse.json({ error: "item_not_found" }, { status: 404 });
    }

    if (action === "set_status") {
      const status = typeof body?.status === "string" ? body.status.trim() : "";
      const notes = typeof body?.notes === "string" ? body.notes.trim() : "";

      if (!["pending", "resolved", "ignored"].includes(status)) {
        return NextResponse.json({ error: "invalid_status" }, { status: 400 });
      }

      queue.items = queue.items.map((q) =>
        q.id === itemId
          ? {
              ...q,
              status: status as "pending" | "resolved" | "ignored",
              ...(notes ? { notes } : q.notes ? { notes: q.notes } : {}),
            }
          : q
      );

      await writeJson(queuePath(), queue);
      return NextResponse.json({ status: "saved", itemId });
    }

    if (action === "create_employee_and_mapping") {
      const displayName =
        typeof body?.displayName === "string" ? body.displayName.trim() : "";
      const defaultTeam =
        typeof body?.defaultTeam === "string" ? body.defaultTeam.trim() : "";
      const notes = typeof body?.notes === "string" ? body.notes.trim() : "";

      if (!displayName || !defaultTeam) {
        return NextResponse.json({ error: "missing_employee_fields" }, { status: 400 });
      }

      if (!validTeams.includes(defaultTeam)) {
        return NextResponse.json({ error: "invalid_default_team" }, { status: 400 });
      }

      const exactMatches = findExactNameMatches(employees.employees || {}, displayName);

      if (exactMatches.length === 1) {
        const existing = exactMatches[0];
        ensureMapping(mappings.mappings, item.rfUsername, existing.employeeId, item.firstSeenDate);

        queue.items = queue.items.map((q) =>
          q.id === itemId
            ? {
                ...q,
                status: "resolved",
                employeeId: existing.employeeId,
                employeeDisplayName: existing.employee.displayName,
                ...(notes ? { notes } : q.notes ? { notes: q.notes } : {}),
              }
            : q
        );

        await writeJson(mappingsPath(), {
          mappings: [...mappings.mappings].sort((a, b) => {
            if (a.rfUsername !== b.rfUsername) return a.rfUsername.localeCompare(b.rfUsername);
            return (a.effectiveStartDate || "").localeCompare(b.effectiveStartDate || "");
          }),
        });
        await writeJson(queuePath(), queue);

        return NextResponse.json({
          status: "linked_existing_by_name_match",
          action,
          employeeId: existing.employeeId,
        });
      }

      if (exactMatches.length > 1) {
        return NextResponse.json(
          {
            error: "duplicate_display_name_conflict",
            displayName,
            matches: exactMatches.map((m) => ({
              employeeId: m.employeeId,
              displayName: m.employee.displayName,
              defaultTeam: m.employee.defaultTeam,
            })),
          },
          { status: 409 }
        );
      }

      const employeeId = nextEmployeeId(Object.keys(employees.employees || {}));

      employees.employees[employeeId] = {
        displayName,
        status: "active",
        defaultTeam,
      };

      ensureMapping(mappings.mappings, item.rfUsername, employeeId, item.firstSeenDate);

      queue.items = queue.items.map((q) =>
        q.id === itemId
          ? {
              ...q,
              status: "resolved",
              employeeId,
              employeeDisplayName: displayName,
              ...(notes ? { notes } : q.notes ? { notes: q.notes } : {}),
            }
          : q
      );

      await writeJson(employeesPath(), employees);
      await writeJson(mappingsPath(), {
        mappings: [...mappings.mappings].sort((a, b) => {
          if (a.rfUsername !== b.rfUsername) return a.rfUsername.localeCompare(b.rfUsername);
          return (a.effectiveStartDate || "").localeCompare(b.effectiveStartDate || "");
        }),
      });
      await writeJson(queuePath(), queue);

      return NextResponse.json({
        status: "applied",
        action,
        employeeId,
      });
    }

    if (action === "link_existing_employee") {
      const employeeId =
        typeof body?.employeeId === "string" ? body.employeeId.trim() : "";
      const notes = typeof body?.notes === "string" ? body.notes.trim() : "";

      if (!employeeId) {
        return NextResponse.json({ error: "missing_employee_id" }, { status: 400 });
      }

      const employee = employees.employees[employeeId];
      if (!employee) {
        return NextResponse.json({ error: "employee_not_found" }, { status: 404 });
      }

      ensureMapping(mappings.mappings, item.rfUsername, employeeId, item.firstSeenDate);

      queue.items = queue.items.map((q) =>
        q.id === itemId
          ? {
              ...q,
              status: "resolved",
              employeeId,
              employeeDisplayName: employee.displayName,
              ...(notes ? { notes } : q.notes ? { notes: q.notes } : {}),
            }
          : q
      );

      await writeJson(mappingsPath(), {
        mappings: [...mappings.mappings].sort((a, b) => {
          if (a.rfUsername !== b.rfUsername) return a.rfUsername.localeCompare(b.rfUsername);
          return (a.effectiveStartDate || "").localeCompare(b.effectiveStartDate || "");
        }),
      });
      await writeJson(queuePath(), queue);

      return NextResponse.json({
        status: "applied",
        action,
        employeeId,
      });
    }

    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "apply_failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
