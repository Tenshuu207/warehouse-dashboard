import React, { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}

// Simple reusable page header component
export default function PageHeader({ title, subtitle, children }: PageHeaderProps) {
  return (
    <div>
      <h3 className="text-lg font-bold">{title}</h3>
      {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      {children}
    </div>
  );
}
