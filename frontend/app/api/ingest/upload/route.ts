import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";
import { spawnSync } from "child_process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPORT_TYPES = new Set(["b_forkl2", "rf2_forkstdl", "rf2_userls"]);

function isDateLike(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function runPython(repoRoot: string, scriptPath: string, args: string[]) {
  const pythonBin = process.env.PYTHON || "python3";
  const result = spawnSync(pythonBin, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: "utf-8",
  });

  if (result.error) {
    return {
      ok: false,
      error: result.error.message,
      stdout: result.stdout,
      stderr: result.stderr,
      status: result.status,
    };
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(result.stdout || "{}");
  } catch {
    parsed = {
      rawStdout: result.stdout,
      rawStderr: result.stderr,
    };
  }

  return {
    ok: result.status === 0,
    status: result.status,
    parsed,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

export async function POST(req: NextRequest) {
  let savedPath: string | null = null;

  try {
    const form = await req.formData();

    const businessDate = String(form.get("date") || "").trim();
    const reportType = String(form.get("reportType") || "").trim();
    const fileValue = form.get("file");

    if (!isDateLike(businessDate)) {
      return NextResponse.json(
        { error: "invalid_date", details: "Use YYYY-MM-DD." },
        { status: 400 }
      );
    }

    if (!REPORT_TYPES.has(reportType)) {
      return NextResponse.json(
        { error: "invalid_report_type", details: "Unsupported report type." },
        { status: 400 }
      );
    }

    if (
      !fileValue ||
      typeof fileValue === "string" ||
      typeof (fileValue as File).arrayBuffer !== "function"
    ) {
      return NextResponse.json(
        { error: "missing_file", details: "A file upload is required." },
        { status: 400 }
      );
    }

    const uploadedFile = fileValue as File;
    const originalName = sanitizeFilename(uploadedFile.name || "upload.dat");

    const frontendRoot = process.cwd();
    const repoRoot = path.resolve(frontendRoot, "..");
    const rawDir = path.join(repoRoot, "ingest", "raw", "uploads", businessDate);

    await fs.mkdir(rawDir, { recursive: true });

    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
    const finalName = `${reportType}__${stamp}__${originalName}`;
    savedPath = path.join(rawDir, finalName);

    const buffer = Buffer.from(await uploadedFile.arrayBuffer());
    await fs.writeFile(savedPath, buffer);

    const manifestScript = path.join(repoRoot, "ingest", "scripts", "ingest_manifest.py");
    const manifestResult = runPython(repoRoot, manifestScript, [
      path.join(repoRoot, "ingest", "index"),
      businessDate,
      reportType,
      savedPath,
    ]);

    if (!manifestResult.ok) {
      return NextResponse.json(
        {
          error: "register_failed",
          details: manifestResult.stderr || "ingest_manifest.py failed",
          result: manifestResult.parsed,
        },
        { status: 500 }
      );
    }

    const registration = manifestResult.parsed as
      | { status?: string; [key: string]: unknown }
      | null;

    if (registration?.status === "duplicate" && savedPath) {
      await fs.unlink(savedPath).catch(() => {});
    }

    let refresh: unknown = {
      status: "skipped",
      reason: "duplicate_ingest",
    };

    if (registration?.status !== "duplicate") {
      const refreshScript = path.join(repoRoot, "ingest", "scripts", "refresh_date_pipeline.py");
      const refreshResult = runPython(repoRoot, refreshScript, [
        path.join(repoRoot, "ingest", "index"),
        businessDate,
        path.join(repoRoot, "ingest", "config", "area_map.json"),
        path.join(repoRoot, "ingest", "config", "manual_roles.json"),
        path.join(repoRoot, "ingest", "config", "reviews"),
        path.join(repoRoot, "ingest", "config", "options.json"),
        path.join(repoRoot, "ingest", "parsed"),
        path.join(repoRoot, "ingest", "derived", "daily"),
        path.join(repoRoot, "ingest", "derived", "weekly"),
      ]);

      if (!refreshResult.ok) {
        return NextResponse.json(
          {
            error: "refresh_failed",
            details: refreshResult.stderr || "refresh_date_pipeline.py failed",
            registration,
            result: refreshResult.parsed,
          },
          { status: 500 }
        );
      }

      refresh = refreshResult.parsed;
    }

    return NextResponse.json({
      ok: true,
      date: businessDate,
      reportType,
      savedPath:
        registration?.status === "duplicate" ? null : path.relative(repoRoot, savedPath || ""),
      registration,
      refresh,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "upload_failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
