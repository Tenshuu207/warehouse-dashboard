"use client";

type BadgeVariant =
  | "home-team"
  | "observed-team"
  | "observed-role"
  | "review-status"
  | "confidence"
  | "context"
  | "neutral";

type Props = {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
};

const variantClasses: Record<BadgeVariant, string> = {
  "home-team": "bg-slate-900 text-white border-slate-900",
  "observed-team": "bg-slate-100 text-slate-800 border-slate-300",
  "observed-role": "bg-blue-50 text-blue-800 border-blue-200",
  "review-status": "bg-amber-50 text-amber-800 border-amber-200",
  "confidence": "bg-emerald-50 text-emerald-800 border-emerald-200",
  "context": "bg-violet-50 text-violet-800 border-violet-200",
  "neutral": "bg-slate-50 text-slate-700 border-slate-200",
};

export default function ContextBadge({
  children,
  variant = "neutral",
  className = "",
}: Props) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium whitespace-nowrap",
        variantClasses[variant],
        className,
      ].join(" ")}
    >
      {children}
    </span>
  );
}
