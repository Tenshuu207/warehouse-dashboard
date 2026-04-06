export type EmployeeRecord = {
  displayName: string;
  status: "active" | "inactive";
  defaultTeam: string;
  notes?: string;
};

export type RfMapping = {
  rfUsername: string;
  employeeId: string;
  effectiveStartDate?: string;
  effectiveEndDate?: string;
  active: boolean;
  notes?: string;
};

export type OperatorDefault = {
  name?: string;
  defaultTeam: string;
};

function appliesToDate(mapping: RfMapping, date: string): boolean {
  if (!mapping.active) return false;

  const start = mapping.effectiveStartDate || "";
  const end = mapping.effectiveEndDate || "";

  if (start && start > date) return false;
  if (end && end < date) return false;

  return true;
}

export function resolveOperatorIdentity({
  rfUsername,
  fallbackName,
  fallbackTeam,
  selectedDate,
  employees,
  mappings,
  defaultTeams,
}: {
  rfUsername: string;
  fallbackName: string;
  fallbackTeam: string;
  selectedDate: string;
  employees: Record<string, EmployeeRecord>;
  mappings: RfMapping[];
  defaultTeams?: Record<string, OperatorDefault>;
}) {
  const matches = mappings
    .filter((m) => m.rfUsername === rfUsername && appliesToDate(m, selectedDate))
    .sort((a, b) => (b.effectiveStartDate || "").localeCompare(a.effectiveStartDate || ""));

  const chosenMapping = matches[0];
  const employee = chosenMapping ? employees[chosenMapping.employeeId] : undefined;

  return {
    employeeId: chosenMapping?.employeeId || null,
    displayName: employee?.displayName || fallbackName,
    status: employee?.status || null,
    defaultTeam:
      employee?.defaultTeam ||
      defaultTeams?.[rfUsername]?.defaultTeam ||
      fallbackTeam,
    mapped: !!employee,
  };
}
