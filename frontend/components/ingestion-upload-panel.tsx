"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  defaultDate?: string;
  onUploaded?: () => void | Promise<void>;
};

const REPORT_OPTIONS = [
  { value: "b_forkl2", label: "ForkL2" },
  { value: "rf2_forkstdl", label: "ForkSTDL" },
  { value: "rf2_userls", label: "UserLS" },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function IngestionUploadPanel({ defaultDate, onUploaded }: Props) {
  const initialDate = useMemo(() => defaultDate || todayIso(), [defaultDate]);
  const [date, setDate] = useState(initialDate);
  const [reportType, setReportType] = useState("b_forkl2");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);

  useEffect(() => {
    if (!date && defaultDate) {
      setDate(defaultDate);
    }
  }, [date, defaultDate]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    if (!date) {
      setError("Pick a business date.");
      return;
    }

    if (!file) {
      setError("Choose a file to upload.");
      return;
    }

    try {
      setUploading(true);

      const formData = new FormData();
      formData.append("date", date);
      formData.append("reportType", reportType);
      formData.append("file", file);

      const res = await fetch("/api/ingest/upload", {
        method: "POST",
        body: formData,
      });

      const json = (await res.json()) as {
        details?: string;
        registration?: { status?: string };
      };

      if (!res.ok) {
        throw new Error(json.details || "Upload failed");
      }

      const registrationStatus = json.registration?.status || "uploaded";
      setMessage(`${reportType} ${registrationStatus} for ${date}.`);
      setFile(null);
      setInputKey((value) => value + 1);

      if (onUploaded) {
        await onUploaded();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Upload Raw Report</h3>
        <p className="mt-1 text-xs text-slate-500">
          Save a raw report file, register it for the selected business date, and rebuild that
          date immediately.
        </p>
      </div>

      <form className="mt-4 grid gap-3 xl:grid-cols-[180px_180px_1fr_auto]" onSubmit={handleSubmit}>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-700">Business Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-700">Report Type</span>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
          >
            {REPORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-700">File</span>
          <input
            key={inputKey}
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full rounded-lg border bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm"
          />
        </label>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={uploading}
            className="inline-flex rounded-lg border bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? "Uploading..." : "Upload & Rebuild"}
          </button>
        </div>
      </form>

      {message ? <div className="mt-3 text-sm text-emerald-700">{message}</div> : null}
      {error ? <div className="mt-3 text-sm text-red-700">{error}</div> : null}
    </section>
  );
}
