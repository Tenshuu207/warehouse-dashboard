"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/operators", label: "Operators" },
  { href: "/performance", label: "Performance" },
  { href: "/areas", label: "Areas" },
  { href: "/receiving", label: "Receiving" },
  { href: "/assignment-review", label: "Assignment Review" },
  { href: "/review", label: "Review" },
  { href: "/options", label: "Options" },
];

export default function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 mb-2 rounded-2xl border bg-white/95 p-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Warehouse Operations Dashboard</h1>
          <p className="text-sm text-slate-600">Warehouse operations software prototype</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
                  active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
