import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { deleteVoiceSample } from "@/lib/voice-storage";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: voiceId } = await params;
  const session = await auth();
  
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Get voice details to find the objectName in metadata
    const voice = await prisma.voiceClone.findUnique({
      where: { id: voiceId, userId: session.user.id },
    });

    if (!voice) {
      return NextResponse.json({ error: "Voice not found" }, { status: 404 });
    }

    const metadata = voice.metadata as any;
    const objectName = metadata?.objectName;

    // 2. Delete from GCS if objectName exists
    if (objectName) {
      await deleteVoiceSample(objectName);
    }

    // 3. Delete from Database
    await prisma.voiceClone.delete({
      where: { id: voiceId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[delete-voice]", error);
    return NextResponse.json({ error: "Failed to delete voice" }, { status: 500 });
  }
}
