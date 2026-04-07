import React, { ReactNode } from "react";

interface StatCardProps {
  label: string;
  children: ReactNode;
}

// Compact reusable stat card component with label and children for value
export default function StatCard({ label, children }: StatCardProps) {
  return (
    <div className="rounded-xl border bg-slate-50 p-3 text-center">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{children}</div>
    </div>
  );
}
