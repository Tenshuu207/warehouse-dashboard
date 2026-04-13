import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);

function resolveRepoRoot(): string {
  const cwd = process.cwd();
  const candidates = [cwd, path.resolve(cwd, "..")];

  for (const candidate of candidates) {
    const scriptPath = path.join(
      candidate,
      "ingest",
      "scripts",
      "userls_history_import.py"
    );
    if (existsSync(scriptPath)) {
      return candidate;
    }
  }

  throw new Error(
    `Could not resolve repo root from process.cwd()=${cwd}`
  );
}

export function getRepoRoot(): string {
  return resolveRepoRoot();
}

export function getUserlsHistoryScriptPath(): string {
  return path.join(
    getRepoRoot(),
    "ingest",
    "scripts",
    "userls_history_import.py"
  );
}

export function getUserlsHistoryUploadDir(): string {
  return path.join(getRepoRoot(), "ingest", "inbox", "userls_history");
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_");
}

function parseJsonStdout(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("Python command returned empty stdout");
  }
  return JSON.parse(trimmed);
}

export async function runUserlsHistoryCommand(
  args: string[]
): Promise<unknown> {
  const repoRoot = getRepoRoot();
  const scriptPath = getUserlsHistoryScriptPath();
  const pythonBin = process.env.PYTHON_BIN || "python3";

  try {
    const { stdout } = await execFileAsync(
      pythonBin,
      [scriptPath, ...args],
      {
        cwd: repoRoot,
        maxBuffer: 50 * 1024 * 1024,
      }
    );
    return parseJsonStdout(stdout);
  } catch (error) {
    const err = error as {
      stdout?: string;
      stderr?: string;
      message?: string;
      code?: number;
    };

    const stderr = err.stderr?.trim() || "";
    const stdout = err.stdout?.trim() || "";

    if (stdout) {
      try {
        return parseJsonStdout(stdout);
      } catch {
        // fall through
      }
    }

    throw new Error(
      stderr || err.message || "userls_history_import.py failed"
    );
  }
}

export async function saveUploadedUserlsFile(file: File): Promise<{
  savedPath: string;
  savedName: string;
  size: number;
}> {
  const uploadDir = getUserlsHistoryUploadDir();
  await mkdir(uploadDir, { recursive: true });

  const stamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);

  const savedName = `${stamp}__${sanitizeFileName(file.name || "userls_upload.txt")}`;
  const savedPath = path.join(uploadDir, savedName);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(savedPath, buffer);

  return {
    savedPath,
    savedName,
    size: buffer.length,
  };
}
