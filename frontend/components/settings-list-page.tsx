"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import DashboardNav from "@/components/dashboard-nav";

type OptionsData = {
  areas: string[];
  roles: string[];
  reviewStatuses: string[];
};

type FieldName = keyof OptionsData;

export default function SettingsListPage({
  title,
  description,
  fieldName,
  fieldLabel,
  saveLabel,
}: {
  title: string;
  description: string;
  fieldName: FieldName;
  fieldLabel: string;
  saveLabel: string;
}) {
  const [data, setData] = useState<OptionsData>({
    areas: [],
    roles: [],
    reviewStatuses: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = data[fieldName];

  const refresh = useCallback(async () => {
    const res = await fetch("/api/options", { cache: "no-store" });
    const json = await res.json();

    setData({
      areas: Array.isArray(json.areas) ? json.areas : [],
      roles: Array.isArray(json.roles) ? json.roles : [],
      reviewStatuses: Array.isArray(json.reviewStatuses) ? json.reviewStatuses : [],
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        await refresh();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load settings");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  function updateItem(index: number, value: string) {
    const next = [...items];
    next[index] = value;
    setSaved(false);
    setData((prev) => ({ ...prev, [fieldName]: next }));
  }

  function addItem() {
    setSaved(false);
    setData((prev) => ({ ...prev, [fieldName]: [...prev[fieldName], ""] }));
  }

  function removeItem(index: number) {
    setSaved(false);
    setData((prev) => ({
      ...prev,
      [fieldName]: prev[fieldName].filter((_, i) => i !== index),
    }));
  }

  async function save() {
    try {
      setSaving(true);
      setError(null);
      setSaved(false);

      const cleaned: OptionsData = {
        areas: data.areas.map((v) => v.trim()).filter(Boolean),
        roles: data.roles.map((v) => v.trim()).filter(Boolean),
        reviewStatuses: data.reviewStatuses.map((v) => v.trim()).filter(Boolean),
      };

      const res = await fetch("/api/options", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(cleaned),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || "Save failed");
      }

      setData(cleaned);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-3 md:p-4">
      <div className="mx-auto max-w-5xl space-y-4">
        <DashboardNav />

        <section className="rounded-2xl bg-white border shadow-sm p-4">
          <div className="text-xs text-slate-500 mb-2">
            <Link href="/options" className="hover:underline">
              ← Back to Options
            </Link>
          </div>
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="mt-1 text-xs text-slate-600">{description}</p>
        </section>

        {loading && (
          <section className="rounded-2xl bg-white border shadow-sm p-4 text-sm text-slate-600">
            Loading {fieldLabel.toLowerCase()}...
          </section>
        )}

        {!loading && (
          <section className="rounded-2xl bg-white border shadow-sm p-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <label className="block text-xs text-slate-500">{fieldLabel}</label>
              <button
                type="button"
                onClick={addItem}
                className="rounded-lg border px-2.5 py-1 text-xs bg-white hover:bg-slate-50"
              >
                Add
              </button>
            </div>

            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={`${fieldName}-${idx}`} className="flex items-center gap-2">
                  <input
                    value={item}
                    onChange={(e) => updateItem(idx, e.target.value)}
                    className="w-full rounded-xl border px-3 py-2"
                    placeholder={`Enter ${fieldLabel.toLowerCase()} value`}
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="rounded-lg border px-2.5 py-2 text-xs bg-white hover:bg-slate-50"
                  >
                    Remove
                  </button>
                </div>
              ))}

              {items.length === 0 && (
                <div className="text-xs text-slate-400">No values yet.</div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-lg border bg-slate-900 text-white px-3 py-2 text-sm disabled:opacity-60"
              >
                {saving ? "Saving..." : saveLabel}
              </button>

              {saved && (
                <span className="text-xs rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-green-700">
                  Saved
                </span>
              )}

              {error && (
                <span className="text-xs rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-red-700">
                  {error}
                </span>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
