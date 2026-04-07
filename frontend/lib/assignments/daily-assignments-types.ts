import type { HomeAssignmentSection } from "@/lib/assignments/home-assignments-types";

export type DailyAssignmentsPayload = {
  date: string;
  updatedAt: string | null;
  sections: HomeAssignmentSection[];
};
