"use client";

import { createContext, useContext, useState } from "react";

type MetricMode = "plates" | "pieces";
type ScoringMode = "operational" | "performance";

type AppState = {
  metricMode: MetricMode;
  setMetricMode: (mode: MetricMode) => void;
  scoringMode: ScoringMode;
  setScoringMode: (mode: ScoringMode) => void;
  selectedWeek: string;
  setSelectedWeek: (week: string) => void;
};

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [metricMode, setMetricMode] = useState<MetricMode>("plates");
  const [scoringMode, setScoringMode] = useState<ScoringMode>("performance");
  const [selectedWeek, setSelectedWeek] = useState("2026-04-03");

  return (
    <AppContext.Provider
      value={{
        metricMode,
        setMetricMode,
        scoringMode,
        setScoringMode,
        selectedWeek,
        setSelectedWeek,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppState must be used inside AppProvider");
  return ctx;
}
