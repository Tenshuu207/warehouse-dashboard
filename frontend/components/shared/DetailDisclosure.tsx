"use client";

import { useState } from "react";

type Props = {
  title: string;
  meta?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

export default function DetailDisclosure({
  title,
  meta,
  defaultOpen = false,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border bg-slate-50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          {meta ? <div className="mt-0.5 text-xs text-slate-500">{meta}</div> : null}
        </div>
        <div className="text-xs font-medium text-slate-500">{open ? "Hide" : "Show"}</div>
      </button>

      {open ? (
        <div className="rounded-b-xl border-t bg-white px-4 py-4">
          {children}
        </div>
      ) : null}
    </div>
  );
}
