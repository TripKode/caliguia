import { NextRequest, NextResponse } from "next/server";
import { createOpenVoiceSpeech } from "@/lib/gradio-openvoice";

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const MAX_TTS_CHARS = 900;

function isAudioFile(file: File) {
  return file.type.startsWith("audio/");
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const text = form?.get("text");
  const style = form?.get("style");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
  }

  if (!isAudioFile(file)) {
    return NextResponse.json({ error: "File must be audio" }, { status: 415 });
  }

  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "Audio file is too large" }, { status: 413 });
  }

  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  if (text.length > MAX_TTS_CHARS) {
    return NextResponse.json({ error: "Text is too long" }, { status: 413 });
  }

  try {
    const speech = await createOpenVoiceSpeech({
      file,
      text: text.trim(),
      style: typeof style === "string" ? style : undefined,
    });
    const audio = await speech.audioResponse.arrayBuffer();

    return new NextResponse(audio, {
      status: 200,
      headers: {
        "Content-Type": speech.audioResponse.headers.get("content-type") ?? "audio/wav",
        "Cache-Control": "no-store",
        "X-Voice-Provider": "gradio-openvoice",
        "X-OpenVoice-Audio-Url": speech.audioUrl,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[gradio/speech]", message);
    return NextResponse.json({ error: "OpenVoice generation failed" }, { status: 502 });
  }
}
