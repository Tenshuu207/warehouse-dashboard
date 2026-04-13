import type { HomeAssignmentSection } from "@/lib/assignments/home-assignments-types";

export type DailyOperatorPlacement = {
  assignmentKey: string;
  employeeId?: string | null;
  employeeName?: string | null;
  rfUsernames?: string[];
  assignedSection?: string | null;
  assignedRole?: string | null;
  positionLabel?: string | null;
  note?: string | null;
};

export type DailyAssignmentsPayload = {
  date: string;
  updatedAt: string | null;
  sections: HomeAssignmentSection[];
  placements: DailyOperatorPlacement[];
};
