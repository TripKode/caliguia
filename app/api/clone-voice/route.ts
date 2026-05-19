import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildVoiceObjectName, uploadVoiceSample } from "@/lib/voice-storage";

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

function isAudioFile(file: File) {
  return file.type.startsWith("audio/");
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const formUserId = form?.get("userId");
  const displayName = form?.get("displayName");
  const referenceText = form?.get("referenceText");
  const referenceTextVersion = form?.get("referenceTextVersion");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
  }

  const userId = session?.user?.id || (typeof formUserId === "string" ? formUserId.trim() : "");

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  if (!isAudioFile(file)) {
    return NextResponse.json({ error: "File must be audio" }, { status: 415 });
  }

  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "Audio file is too large" }, { status: 413 });
  }

  try {
    const voiceCount = await prisma.voiceClone.count({
      where: { userId },
    });

    if (voiceCount >= 3) {
      return NextResponse.json({ error: "Límite máximo de 3 voces alcanzado" }, { status: 403 });
    }

    const voiceKey = crypto.randomUUID();
    const providerVoiceId = `xtts-local:${userId}:${voiceKey}`;
    const voiceName = `CALIGUIA_UID_${userId}_${voiceKey.slice(0, 8)}`;
    const sampleMimeType = file.type || "audio/webm";
    const sampleFileName = file.name || "caliguia-reference-voice.webm";
    const cleanReferenceText = typeof referenceText === "string" ? referenceText.replace(/\s+/g, " ").trim() : "";
    const objectName = buildVoiceObjectName({
      userId,
      voiceId: voiceKey,
      fileName: sampleFileName,
      mimeType: sampleMimeType,
    });
    const sampleBytes = Buffer.from(await file.arrayBuffer());

    await uploadVoiceSample({
      objectName,
      bytes: sampleBytes,
      mimeType: sampleMimeType,
      originalFileName: sampleFileName,
      userId,
      voiceId: voiceKey,
    });

    const user = await (prisma.user as any).update({
      where: { id: userId },
      data: {
        displayName: typeof displayName === "string" && displayName.trim() ? displayName.trim() : undefined,
        activeVoiceProvider: "XTTS_LOCAL" as any,
        activeProviderVoiceId: providerVoiceId,
      },
    });

    const savedVoice = await prisma.voiceClone.create({
      data: {
        userId: user.id,
        provider: "XTTS_LOCAL" as any,
        providerVoiceId,
        providerVoiceName: voiceName,
        status: "READY",
        sourceFileName: sampleFileName,
        sourceMimeType: sampleMimeType,
        sourceSizeBytes: file.size,
        requiresVerification: false,
        metadata: {
          storage: "gcs",
          bucketEnv: "CALIGUIA_VOICE_BUCKET",
          objectName,
          voiceKey,
          referenceText: cleanReferenceText || null,
          referenceTextVersion: typeof referenceTextVersion === "string" ? referenceTextVersion : null,
          accent: "caleño neutro humano natural",
          note: "F5-TTS local uses this saved GCS voice sample and reference text; no remote voice_id is generated.",
        },
      },
    });

    return NextResponse.json({
      userId: user.id,
      voiceCloneId: savedVoice.id,
      voice_id: providerVoiceId,
      provider: "XTTS_LOCAL",
      voiceName,
      requiresVerification: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[clone-voice]", message);
    return NextResponse.json({ error: "Voice clone failed" }, { status: 502 });
  }
}
