import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createLocalXttsSpeech } from "@/lib/xtts-local";
import { prisma } from "@/lib/prisma";
import { downloadVoiceSample } from "@/lib/voice-storage";

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const MAX_TTS_CHARS = 900;
const SUPPORTED_LANGUAGES = new Set(["es", "en", "pt"]);

function isAudioFile(file: File) {
  return file.type.startsWith("audio/");
}

type SavedVoiceSample = {
  blob: Blob;
  fileName: string;
  voiceId: string;
};

async function getActiveProviderVoiceId(): Promise<string | null> {
  const session = await auth();
  const userId = session?.user?.id;
  const email = session?.user?.email;

  if (!userId && !email) return null;

  const user = await (prisma.user as any).findUnique({
    where: userId ? { id: userId } : { email },
    select: {
      activeProviderVoiceId: true,
    },
  });

  return user?.activeProviderVoiceId || null;
}

async function getSavedVoiceSample(activeProviderVoiceId: string | null): Promise<SavedVoiceSample | null> {
  if (!activeProviderVoiceId) return null;

  const voice = await prisma.voiceClone.findUnique({
    where: { providerVoiceId: activeProviderVoiceId },
    select: {
      metadata: true,
      sourceFileName: true,
      sourceMimeType: true,
    },
  });

  const metadata = voice?.metadata as {
    objectName?: unknown;
  } | null;

  if (typeof metadata?.objectName !== "string") return null;

  const mimeType = voice?.sourceMimeType || "audio/webm";
  const fileName = voice?.sourceFileName || "caliguia-reference-voice.webm";
  const bytes = await downloadVoiceSample(metadata.objectName);
  const body = new Uint8Array(bytes);

  return {
    blob: new Blob([body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)], { type: mimeType }),
    fileName,
    voiceId: activeProviderVoiceId,
  };
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const text = form?.get("text");
  const language = form?.get("language");
  const reference_text = form?.get("reference_text") as string || "Hola, soy tu guía de Cali. Hoy caminaremos con calma, curiosidad y mucho sabor local.";

  if (file instanceof File && !isAudioFile(file)) {
    return NextResponse.json({ error: "File must be audio" }, { status: 415 });
  }

  if (file instanceof File && file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "Audio file is too large" }, { status: 413 });
  }

  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  if (text.length > MAX_TTS_CHARS) {
    return NextResponse.json({ error: "Text is too long" }, { status: 413 });
  }

  const voiceLanguage = typeof language === "string" && SUPPORTED_LANGUAGES.has(language)
    ? language
    : "es";

  try {
    const activeProviderVoiceId = await getActiveProviderVoiceId();
    const savedSample = file instanceof File ? null : await getSavedVoiceSample(activeProviderVoiceId);
    const speakerFile = file instanceof File ? file : savedSample?.blob;
    const speakerFileName = file instanceof File ? file.name : savedSample?.fileName;
    const voiceId = activeProviderVoiceId || savedSample?.voiceId;

    if (!speakerFile) {
      return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
    }

    const speech = await createLocalXttsSpeech({
      file: speakerFile,
      fileName: speakerFileName,
      voiceId,
      text: text.trim(),
      language: voiceLanguage,
      reference_text,
    });
    const audio = await speech.arrayBuffer();

    return new NextResponse(audio, {
      status: 200,
      headers: {
        "Content-Type": speech.headers.get("content-type") ?? "audio/wav",
        "Cache-Control": "no-store",
        "X-Voice-Provider": "xtts-local",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[voice/speech]", message);
    return NextResponse.json({ error: "XTTS generation failed", message }, { status: 502 });
  }
}
