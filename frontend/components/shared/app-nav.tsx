"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PRIMARY_ITEMS = [
  { href: "/", label: "Overview" },
  { href: "/performance", label: "Performance" },
  { href: "/receiving", label: "Receiving" },
  { href: "/areas", label: "Areas" },
  { href: "/operators", label: "Operators" },
  { href: "/assignment-review", label: "Review" },
  { href: "/standards", label: "Standards" },
];

const SECONDARY_ITEMS = [
  { href: "/weekly-sheet", label: "Weekly Sheet" },
  { href: "/daily-sheet", label: "Daily Sheet" },
  { href: "/range-sheet", label: "Range Sheet" },
  { href: "/options/userls-history", label: "UserLS Import" },
  { href: "/options", label: "Options" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppNav() {
  const pathname = usePathname();

  return (
    <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {PRIMARY_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "rounded-full px-3 py-1.5 text-sm font-medium transition",
                  active
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {SECONDARY_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "rounded-full px-3 py-1.5 text-xs font-medium transition",
                  active
                    ? "bg-slate-200 text-slate-900"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-700",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
