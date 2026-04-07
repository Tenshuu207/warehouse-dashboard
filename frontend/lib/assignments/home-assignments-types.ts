export type HomeAssignmentSection = {
  team: string;
  role: string;
  employees: string[];
};

export type HomeAssignmentsPayload = {
  updatedAt: string | null;
  sections: HomeAssignmentSection[];
};
