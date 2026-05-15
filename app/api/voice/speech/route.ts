import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createLocalXttsSpeech } from "@/lib/xtts-local";
import { prisma } from "@/lib/prisma";
import { downloadVoiceSample } from "@/lib/voice-storage";

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const MAX_TTS_CHARS = 360;
const TARGET_TTS_CHARS = 220;
const SUPPORTED_LANGUAGES = new Set(["es", "en", "pt"]);

function isAudioFile(file: File) {
  return file.type.startsWith("audio/");
}

type SavedVoiceSample = {
  blob: Blob;
  fileName: string;
  voiceId: string;
  referenceText?: string;
};

function compactTtsText(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= TARGET_TTS_CHARS) return clean;

  const sentenceMatch = clean.match(/^.{1,300}?[.!?…](?:\s|$)/);
  if (sentenceMatch?.[0]) return sentenceMatch[0].trim();

  const clipped = clean.slice(0, TARGET_TTS_CHARS);
  const lastSpace = clipped.lastIndexOf(" ");
  const safeClip = clipped.slice(0, lastSpace > 180 ? lastSpace : TARGET_TTS_CHARS).replace(/[,;:]$/, "");
  return `${safeClip}.`;
}

async function getActiveProviderVoiceId(): Promise<string | null> {
  const session = await auth();
  const userId = session?.user?.id;
  const email = session?.user?.email;

  if (!userId && !email) return "system:jorge"; // Default for non-authenticated

  const user = await (prisma.user as any).findUnique({
    where: userId ? { id: userId } : { email },
    select: {
      activeProviderVoiceId: true,
    },
  });

  return user?.activeProviderVoiceId || "system:jorge"; // Default if not set
}

const OFFICIAL_VOICE_REFERENCE_TEXT = "Hola, bienvenido a CaliGuia. Soy tu guía en este recorrido por la hermosa ciudad de Cali. Juntos descubriremos la historia, el ritmo y el sabor que hacen de la sucursal del cielo un lugar único en el mundo.";

const OFFICIAL_VOICE_TEXTS = {
  "system:jorge": OFFICIAL_VOICE_REFERENCE_TEXT,
  "system:ovidio": OFFICIAL_VOICE_REFERENCE_TEXT,
};

async function getSavedVoiceSample(activeProviderVoiceId: string | null): Promise<SavedVoiceSample | null> {
  if (!activeProviderVoiceId) return null;

  // --- Handle System Voices ---
  if (activeProviderVoiceId.startsWith("system:")) {
    const name = activeProviderVoiceId.replace("system:", "");
    const objectName = `official_voices/${name}-voice.wav`;
    const mimeType = "audio/wav";
    const fileName = `${name}-reference.audio`; // Change name to avoid FFmpeg conflict in worker
    
    console.log(`[voice/speech] Fetching system voice: ${objectName}`);
    const bytes = await downloadVoiceSample(objectName);
    const body = new Uint8Array(bytes);

    return {
      blob: new Blob([body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)], { type: mimeType }),
      fileName,
      voiceId: activeProviderVoiceId,
    };
  }
  // ----------------------------

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
    referenceText?: unknown;
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
    referenceText: typeof metadata.referenceText === "string" ? metadata.referenceText : undefined,
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

  const ttsText = compactTtsText(text);

  const voiceLanguage = typeof language === "string" && SUPPORTED_LANGUAGES.has(language)
    ? language
    : "es";

  const startTime = Date.now();
  try {
    const activeProviderVoiceId = await getActiveProviderVoiceId();
    console.log(`[voice/speech] Starting TTS for text: "${ttsText.slice(0, 50)}...", chars=${ttsText.length}, voiceId: ${activeProviderVoiceId}`);
    
    const savedSample = file instanceof File ? null : await getSavedVoiceSample(activeProviderVoiceId);
    const speakerFile = file instanceof File ? file : savedSample?.blob;
    const speakerFileName = file instanceof File ? file.name : savedSample?.fileName;
    const voiceId = activeProviderVoiceId || savedSample?.voiceId;
    const savedReferenceText = savedSample?.referenceText;

    if (!speakerFile) {
      console.error("[voice/speech] No speaker reference audio found");
      return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
    }

    console.log(`[voice/speech] Using speaker file: ${speakerFileName}, size: ${speakerFile.size} bytes`);

    const speech = await createLocalXttsSpeech({
      file: speakerFile,
      fileName: speakerFileName,
      voiceId,
      text: ttsText,
      language: voiceLanguage,
      reference_text: savedReferenceText || (voiceId && OFFICIAL_VOICE_TEXTS[voiceId as keyof typeof OFFICIAL_VOICE_TEXTS]) || reference_text,
    });

    if (!speech.ok) {
      const errorMsg = await speech.text().catch(() => "Unknown error");
      console.error(`[voice/speech] Worker failed with status ${speech.status}: ${errorMsg}`);
      return NextResponse.json({ error: "TTS Worker failed", details: errorMsg }, { status: 502 });
    }

    const audio = await speech.arrayBuffer();
    const duration = (Date.now() - startTime) / 1000;
    const contentType = speech.headers.get("content-type") ?? "audio/wav";
    console.log(`[voice/speech] TTS completed in ${duration.toFixed(2)}s. Received ${audio.byteLength} bytes of ${contentType}`);

    return new NextResponse(audio, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
        "X-Voice-Provider": "xtts-local",
      },
    });
  } catch (error: any) {
    const duration = (Date.now() - startTime) / 1000;
    console.error(`[voice/speech] Server Error after ${duration.toFixed(2)}s:`, error.message);
    return NextResponse.json({ error: "F5-TTS generation failed", message: error.message }, { status: 502 });
  }
}
