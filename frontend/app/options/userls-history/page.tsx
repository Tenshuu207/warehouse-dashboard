"use client";

import { useMemo, useState } from "react";

type PreviewDateRow = {
  businessDate: string;
  status: string;
  action: string | null;
  parsedPath?: string;
  userlsDailyPath?: string;
  dailyEnrichedPath?: string;
  details?: {
    userCount?: number;
    transactionCount?: number;
    hasActiveRawUserls?: boolean;
    activeRawSourcePath?: string | null;
    hasExistingParsed?: boolean;
    hasExistingUserlsDaily?: boolean;
    hasExistingDaily?: boolean;
    hasExistingDailyEnriched?: boolean;
    coverageExists?: boolean;
    dailyExists?: boolean;
    reason?: string;
  };
};

type JobResponse = {
  jobId: string;
  sourcePath?: string;
  sourceName?: string;
  status?: string;
  mode?: string | null;
  createdAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  summary?: {
    totalDates?: number;
    coveredDates?: number;
    missingDates?: number;
    totalUsersAcrossDates?: number;
    totalTransactionsAcrossDates?: number;
    appliedDates?: number;
    skippedDates?: number;
    failedDates?: number;
  };
  dates?: PreviewDateRow[];
  errorText?: string | null;
};

function prettyBool(value: boolean | undefined) {
  if (value === undefined) return "—";
  return value ? "Yes" : "No";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

export default function UserlsHistoryPage() {
  const [serverPath, setServerPath] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [job, setJob] = useState<JobResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>("");

  const sortedDates = useMemo(
    () => [...(job?.dates || [])].sort((a, b) => a.businessDate.localeCompare(b.businessDate)),
    [job]
  );

  async function previewServerPath() {
    if (!serverPath.trim()) {
      setMessage("Enter a server file path first.");
      return;
    }

    try {
      setBusy(true);
      setMessage("");

      const res = await fetch("/api/userls-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "previewPath",
          sourcePath: serverPath.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Preview failed");
      }

      setJob(json.preview as JobResponse);
      setMessage("Preview created from server path.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function previewUpload() {
    if (!uploadFile) {
      setMessage("Choose a file first.");
      return;
    }

    try {
      setBusy(true);
      setMessage("");

      const formData = new FormData();
      formData.append("file", uploadFile);

      const res = await fetch("/api/userls-history", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Upload preview failed");
      }

      setJob(json.preview as JobResponse);
      setMessage(
        `Uploaded to ${json.upload?.savedPath || "server staging"} and created preview.`
      );
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function applyMode(mode: "fill-missing" | "replace-covered") {
    if (!job?.jobId) {
      setMessage("Create a preview first.");
      return;
    }

    try {
      setBusy(true);
      setMessage("");

      const res = await fetch("/api/userls-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply",
          jobId: job.jobId,
          mode,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Apply failed");
      }

      setJob(json as JobResponse);
      setMessage(`Apply finished with mode: ${mode}`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function refreshJob() {
    if (!job?.jobId) {
      setMessage("No job loaded.");
      return;
    }

    try {
      setBusy(true);
      setMessage("");

      const res = await fetch(`/api/userls-history?jobId=${encodeURIComponent(job.jobId)}`, {
        cache: "no-store",
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Refresh failed");
      }

      setJob(json as JobResponse);
      setMessage("Job refreshed.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Historical UserLS Import</h1>
        <p className="text-sm text-slate-600">
          Preview multi-day or full-history RF2 UserLS imports, then apply with
          Fill Missing or Replace Covered.
        </p>
        <p className="text-xs text-slate-500">
          For very large files, the safer path right now is: copy the file onto
          the VM under <code>ingest/inbox/userls_history</code>, then use server-path preview.
        </p>
      </div>

      <div className="rounded-xl border bg-white p-4 space-y-4">
        <h2 className="text-lg font-medium">Preview from server file path</h2>
        <input
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="/home/tenshuu/homelab-stacks/warehouse-dashboard/ingest/inbox/userls_history/your-file.txt"
          value={serverPath}
          onChange={(e) => setServerPath(e.target.value)}
        />
        <button
          className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          disabled={busy}
          onClick={previewServerPath}
        >
          Preview server path
        </button>
      </div>

      <div className="rounded-xl border bg-white p-4 space-y-4">
        <h2 className="text-lg font-medium">Preview from browser upload</h2>
        <input
          type="file"
          className="block w-full text-sm"
          onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
        />
        <button
          className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          disabled={busy || !uploadFile}
          onClick={previewUpload}
        >
          Upload and preview
        </button>
      </div>

      {message ? (
        <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {message}
        </div>
      ) : null}

      {job ? (
        <div className="space-y-4">
          <div className="rounded-xl border bg-white p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-medium">Job {job.jobId}</h2>
              <span className="rounded-full border px-2 py-1 text-xs">
                {job.status || "unknown"}
              </span>
              {job.mode ? (
                <span className="rounded-full border px-2 py-1 text-xs">
                  mode: {job.mode}
                </span>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-slate-500">Total dates</div>
                <div className="text-lg font-semibold">{job.summary?.totalDates ?? "—"}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-slate-500">Covered dates</div>
                <div className="text-lg font-semibold">{job.summary?.coveredDates ?? "—"}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-slate-500">Missing dates</div>
                <div className="text-lg font-semibold">{job.summary?.missingDates ?? "—"}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-slate-500">Transactions</div>
                <div className="text-lg font-semibold">
                  {job.summary?.totalTransactionsAcrossDates ?? "—"}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
                disabled={busy}
                onClick={() => applyMode("fill-missing")}
              >
                Apply Fill Missing
              </button>
              <button
                className="rounded-md bg-amber-700 px-4 py-2 text-sm text-white disabled:opacity-50"
                disabled={busy}
                onClick={() => applyMode("replace-covered")}
              >
                Apply Replace Covered
              </button>
              <button
                className="rounded-md border px-4 py-2 text-sm disabled:opacity-50"
                disabled={busy}
                onClick={refreshJob}
              >
                Refresh job
              </button>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4">
            <h2 className="mb-3 text-lg font-medium">Date preview</h2>
            <div className="overflow-x-auto">
              <table className="min-w-[1000px] w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr className="text-left">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Users</th>
                    <th className="px-3 py-2">Transactions</th>
                    <th className="px-3 py-2">Covered</th>
                    <th className="px-3 py-2">Existing parsed</th>
                    <th className="px-3 py-2">Existing userls_daily</th>
                    <th className="px-3 py-2">Existing daily</th>
                    <th className="px-3 py-2">Existing enriched</th>
                    <th className="px-3 py-2">Action</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDates.map((row) => (
                    <tr key={row.businessDate} className="border-b last:border-b-0">
                      <td className="px-3 py-2 font-medium">{row.businessDate}</td>
                      <td className="px-3 py-2">{row.details?.userCount ?? "—"}</td>
                      <td className="px-3 py-2">{row.details?.transactionCount ?? "—"}</td>
                      <td className="px-3 py-2">{prettyBool(row.details?.coverageExists)}</td>
                      <td className="px-3 py-2">{prettyBool(row.details?.hasExistingParsed)}</td>
                      <td className="px-3 py-2">{prettyBool(row.details?.hasExistingUserlsDaily)}</td>
                      <td className="px-3 py-2">{prettyBool(row.details?.hasExistingDaily)}</td>
                      <td className="px-3 py-2">{prettyBool(row.details?.hasExistingDailyEnriched)}</td>
                      <td className="px-3 py-2">{row.action || "—"}</td>
                      <td className="px-3 py-2">{row.status}</td>
                    </tr>
                  ))}
                  {sortedDates.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-3 py-6 text-center text-slate-500">
                        No preview loaded yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
