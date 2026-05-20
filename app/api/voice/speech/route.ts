import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createLocalXttsSpeech } from "@/lib/xtts-local";
import { prisma } from "@/lib/prisma";
import { downloadVoiceSample } from "@/lib/voice-storage";

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const MAX_TTS_CHARS = 1000;
const TARGET_TTS_CHARS = 900;
const RECENT_TTS_TTL_MS = 90_000;
const SUPPORTED_LANGUAGES = new Set(["es", "en", "pt"]);

type SpeechResult = {
  audio: ArrayBuffer;
  contentType: string;
  duration: number;
};

const inFlightTts = new Map<string, Promise<SpeechResult>>();
const recentTts = new Map<string, { expiresAt: number; result: SpeechResult }>();
let workerQueue: Promise<void> = Promise.resolve();

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

  const sentenceMatch = clean.match(/^.{1,800}?[.!?…](?:\s|$)/);
  if (sentenceMatch?.[0]) return sentenceMatch[0].trim();

  const clipped = clean.slice(0, TARGET_TTS_CHARS);
  const lastSpace = clipped.lastIndexOf(" ");
  const safeClip = clipped.slice(0, lastSpace > 600 ? lastSpace : TARGET_TTS_CHARS).replace(/[,;:]$/, "");
  return `${safeClip}.`;
}

async function getActiveProviderVoiceId(requestedVoiceId?: string | null): Promise<string | null> {
  if (requestedVoiceId?.startsWith("system:")) return requestedVoiceId;

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

function getOfficialVoiceReferenceText(voiceId?: string | null) {
  if (!voiceId?.startsWith("system:")) return undefined;
  return OFFICIAL_VOICE_TEXTS[voiceId as keyof typeof OFFICIAL_VOICE_TEXTS] || OFFICIAL_VOICE_REFERENCE_TEXT;
}

function getRecentTts(cacheKey: string) {
  const cached = recentTts.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    recentTts.delete(cacheKey);
    return null;
  }
  return cached.result;
}

async function runWorkerTtsExclusive<T>(task: () => Promise<T>) {
  const previous = workerQueue;
  let release!: () => void;
  workerQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
  }
}

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
  const activeProviderVoiceId = form?.get("activeProviderVoiceId");
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
    const selectedVoiceId = await getActiveProviderVoiceId(
      typeof activeProviderVoiceId === "string" ? activeProviderVoiceId : null
    );
    console.log(`[voice/speech] Starting TTS for text: "${ttsText.slice(0, 50)}...", chars=${ttsText.length}, voiceId: ${selectedVoiceId}`);
    
    const savedSample = file instanceof File ? null : await getSavedVoiceSample(selectedVoiceId);
    const speakerFile = file instanceof File ? file : savedSample?.blob;
    const speakerFileName = file instanceof File ? file.name : savedSample?.fileName;
    const voiceId = selectedVoiceId || savedSample?.voiceId;
    const savedReferenceText = savedSample?.referenceText;

    if (!speakerFile) {
      console.error("[voice/speech] No speaker reference audio found");
      return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
    }

    if (voiceId?.startsWith("xtts-local:") && !savedReferenceText) {
      console.warn(`[voice/speech] User voice ${voiceId} has no stored referenceText; refusing unsafe F5 synthesis`);
      return NextResponse.json(
        {
          error: "Voice reference text missing",
          code: "VOICE_REFERENCE_TEXT_MISSING",
          message: "Esta voz fue grabada antes de la validación nueva. Vuelve a grabarla para que F5-TTS pueda alinear audio y texto correctamente.",
        },
        { status: 409 }
      );
    }

    console.log(`[voice/speech] Using speaker file: ${speakerFileName}, size: ${speakerFile.size} bytes`);

    const resolvedReferenceText = savedReferenceText || getOfficialVoiceReferenceText(voiceId) || reference_text;
    if (voiceId?.startsWith("system:") && resolvedReferenceText !== OFFICIAL_VOICE_REFERENCE_TEXT) {
      console.warn(`[voice/speech] System voice ${voiceId} is not using the official reference text`);
    }

    const cacheKey = [
      voiceId || "unknown",
      voiceLanguage,
      speakerFileName || "speaker",
      ttsText,
      resolvedReferenceText,
    ].join("|");
    const recent = getRecentTts(cacheKey);

    let result: SpeechResult;
    if (recent) {
      result = recent;
      console.log(`[voice/speech] Reusing recent TTS result for duplicated text. bytes=${result.audio.byteLength}`);
    } else {
      let pending = inFlightTts.get(cacheKey);
      if (pending) {
        console.log(`[voice/speech] Awaiting in-flight duplicate TTS for text: "${ttsText.slice(0, 50)}..."`);
      } else {
        pending = (async () => {
          const speech = await runWorkerTtsExclusive(() => {
            console.log(`[voice/speech] Sending queued TTS to worker: chars=${ttsText.length}, voiceId=${voiceId}`);
            return createLocalXttsSpeech({
              file: speakerFile,
              fileName: speakerFileName,
              voiceId,
              text: ttsText,
              language: voiceLanguage,
              reference_text: resolvedReferenceText,
            });
          });

          if (!speech.ok) {
            const errorMsg = await speech.text().catch(() => "Unknown error");
            console.error(`[voice/speech] Worker failed with status ${speech.status}: ${errorMsg}`);
            throw new Error(errorMsg || "TTS Worker failed");
          }

          const audio = await speech.arrayBuffer();
          const duration = (Date.now() - startTime) / 1000;
          const contentType = speech.headers.get("content-type") ?? "audio/wav";
          return { audio, contentType, duration };
        })();
        inFlightTts.set(cacheKey, pending);
        pending.finally(() => inFlightTts.delete(cacheKey)).catch(() => undefined);
      }

      result = await pending;
      recentTts.set(cacheKey, {
        expiresAt: Date.now() + RECENT_TTS_TTL_MS,
        result,
      });
    }

    console.log(`[voice/speech] TTS completed in ${result.duration.toFixed(2)}s. Received ${result.audio.byteLength} bytes of ${result.contentType}`);

    return new NextResponse(result.audio.slice(0), {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
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
