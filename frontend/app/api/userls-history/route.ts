import { NextRequest, NextResponse } from "next/server";
import {
  runUserlsHistoryCommand,
  saveUploadedUserlsFile,
} from "@/lib/server/userls-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json(
        { error: "Missing jobId" },
        { status: 400 }
      );
    }

    const result = await runUserlsHistoryCommand(["show", jobId]);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");

      if (!file || typeof (file as File).arrayBuffer !== "function") {
        return NextResponse.json(
          { error: "Missing upload file" },
          { status: 400 }
        );
      }

      const upload = await saveUploadedUserlsFile(file as File);
      const preview = await runUserlsHistoryCommand([
        "preview",
        upload.savedPath,
      ]);

      return NextResponse.json({
        upload,
        preview,
      });
    }

    const body = (await request.json()) as
      | {
          action?: "previewPath" | "apply";
          sourcePath?: string;
          jobId?: string;
          mode?: "fill-missing" | "replace-covered";
        }
      | undefined;

    if (body?.action === "previewPath") {
      if (!body.sourcePath) {
        return NextResponse.json(
          { error: "Missing sourcePath" },
          { status: 400 }
        );
      }

      const preview = await runUserlsHistoryCommand([
        "preview",
        body.sourcePath,
      ]);

      return NextResponse.json({ preview });
    }

    if (body?.action === "apply") {
      if (!body.jobId || !body.mode) {
        return NextResponse.json(
          { error: "Missing jobId or mode" },
          { status: 400 }
        );
      }

      const result = await runUserlsHistoryCommand([
        "apply",
        body.jobId,
        body.mode,
      ]);

      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: "Unsupported request" },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error) },
      { status: 500 }
    );
  }
}
