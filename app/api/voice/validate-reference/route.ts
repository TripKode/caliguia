import { NextRequest, NextResponse } from "next/server";
import { validateLocalXttsReference } from "@/lib/xtts-local";

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

function isAudioFile(file: File) {
  return file.type.startsWith("audio/");
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const referenceText = form?.get("referenceText");
  const language = form?.get("language");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
  }

  if (!isAudioFile(file)) {
    return NextResponse.json({ error: "File must be audio" }, { status: 415 });
  }

  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "Audio file is too large" }, { status: 413 });
  }

  if (typeof referenceText !== "string" || !referenceText.trim()) {
    return NextResponse.json({ error: "Missing reference text" }, { status: 400 });
  }

  try {
    const validation = await validateLocalXttsReference({
      file,
      fileName: file.name,
      referenceText,
      language: typeof language === "string" ? language : "es",
    });
    const body = await validation.json().catch(() => null);

    if (!validation.ok) {
      return NextResponse.json(
        { error: "Voice validation failed", details: body },
        { status: validation.status }
      );
    }

    return NextResponse.json(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Voice validation failed";
    return NextResponse.json({ error: "Voice validation failed", message }, { status: 502 });
  }
}
