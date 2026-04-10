"use client";

import Link from "next/link";

function SettingsCard({
  title,
  description,
  href,
  buttonLabel,
  legacy = false,
}: {
  title: string;
  description: string;
  href: string;
  buttonLabel: string;
  legacy?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-slate-50 p-4">
      <div className="flex items-center gap-2">
        <div className="text-sm font-semibold">{title}</div>
        {legacy && (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
            Legacy
          </span>
        )}
      </div>
      <div className="mt-1 text-xs text-slate-500">{description}</div>
      <div className="mt-3">
        <Link
          href={href}
          className="inline-flex rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-100"
        >
          {buttonLabel}
        </Link>
      </div>
    </div>
  );
}

export default function OptionsPage() {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-3 md:p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <section className="rounded-2xl bg-white border shadow-sm p-4">
          <h2 className="text-xl font-bold">Options</h2>
          <p className="mt-1 text-xs text-slate-600">
            Settings hub for employee identity, review workflows, and operational lists.
          </p>
        </section>

        <section className="rounded-2xl bg-white border shadow-sm p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Identity</h3>
            <p className="mt-1 text-xs text-slate-500">
              Configure canonical employees, RF username mappings, and identity review.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <SettingsCard
              title="Employees"
              description="Canonical names, status, and default team assignments."
              href="/options/employees"
              buttonLabel="Edit Employees"
            />
            <SettingsCard
              title="RF Username Mappings"
              description="Map raw RF usernames to canonical employees over time."
              href="/options/rf-mappings"
              buttonLabel="Edit RF Mappings"
            />
            <SettingsCard
              title="Identity Review"
              description="Resolve unmapped usernames and suspicious identity mismatches."
              href="/options/identity-review"
              buttonLabel="Open Identity Review"
            />
          </div>
        </section>

        <section className="rounded-2xl bg-white border shadow-sm p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Operational Lists</h3>
            <p className="mt-1 text-xs text-slate-500">
              Manage areas, roles, and review statuses used across the app.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <SettingsCard
              title="Areas"
              description="Valid team and area names used for assignments and reporting."
              href="/options/areas"
              buttonLabel="Edit Areas"
            />
            <SettingsCard
              title="Roles"
              description="Valid role names used in operator and review workflows."
              href="/options/roles"
              buttonLabel="Edit Roles"
            />
            <SettingsCard
              title="Review Statuses"
              description="Allowed review status values used on review screens."
              href="/options/review-statuses"
              buttonLabel="Edit Review Statuses"
            />
          </div>
        </section>

        <section className="rounded-2xl bg-white border shadow-sm p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Data & Ingestion</h3>
            <p className="mt-1 text-xs text-slate-500">
              Inspect raw upload coverage, derived snapshot readiness, and recent ingest activity.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <SettingsCard
              title="Ingestion"
              description="See which dates have ForkL2, ForkSTDL, UserLS, daily, and weekly coverage."
              href="/options/ingestion"
              buttonLabel="Open Ingestion Status"
            />
          </div>
        </section>

        <section className="rounded-2xl bg-white border shadow-sm p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Transitional Tools</h3>
            <p className="mt-1 text-xs text-slate-500">
              These tools are still available while employee-based defaults fully replace older workflows.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <SettingsCard
              title="Default Teams"
              description="Older RF-username-based team assignment tool. Prefer Employees for long-term defaults."
              href="/options/default-teams"
              buttonLabel="Open Default Teams"
              legacy
            />
          </div>
        </section>
      </div>
    </main>
  );
}
