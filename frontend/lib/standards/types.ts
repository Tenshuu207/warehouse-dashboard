export type StandardsScopeType = "role" | "team_area";

export type StandardsRow = {
  scopeType: StandardsScopeType;
  scopeName: string;
  activeDays: number;
  distinctPeople: number;
  dailyPlatesStandard: number;
  dailyPiecesStandard: number;
  dailyPiecesPerPlateStandard: number;
  estimatedHoursPerDayFrom2025Hours: number;
  platesPerHourEstimated: number;
  piecesPerHourEstimated: number;
  status: "ready" | "provisional";
  notes?: string;
};

export type StandardsPayload = {
  source: string;
  methodology: string[];
  updatedAt: string;
  teamAreas: StandardsRow[];
  roles: StandardsRow[];
};
