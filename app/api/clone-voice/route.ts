import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

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
    const providerVoiceId = `xtts-local:${userId}`;
    const voiceName = `CALIGUIA_UID_${userId}`;

    const user = await (prisma.user as any).update({
      where: { id: userId },
      data: {
        displayName: typeof displayName === "string" && displayName.trim() ? displayName.trim() : undefined,
        activeVoiceProvider: "XTTS_LOCAL" as any,
        activeProviderVoiceId: providerVoiceId,
      },
    });

    const savedVoice = await prisma.voiceClone.upsert({
      where: { providerVoiceId },
      update: {
        providerVoiceName: voiceName,
        sourceFileName: file.name || null,
        sourceMimeType: file.type || null,
        sourceSizeBytes: file.size,
        status: "READY",
        requiresVerification: false,
        metadata: {
          storage: "browser-indexeddb",
          note: "XTTS local reuses the browser audio sample; no remote voice_id is generated.",
        },
      },
      create: {
        userId: user.id,
        provider: "XTTS_LOCAL" as any,
        providerVoiceId,
        providerVoiceName: voiceName,
        status: "READY",
        sourceFileName: file.name || null,
        sourceMimeType: file.type || null,
        sourceSizeBytes: file.size,
        requiresVerification: false,
        metadata: {
          storage: "browser-indexeddb",
          note: "XTTS local reuses the browser audio sample; no remote voice_id is generated.",
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
