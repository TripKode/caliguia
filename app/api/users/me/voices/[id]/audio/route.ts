import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { downloadVoiceSample } from "@/lib/voice-storage";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: voiceId } = await params;
  console.log(`[voice-audio] Requesting audio for ID: ${voiceId}`);
  
  const session = await auth();
  if (!session?.user?.id) {
    console.warn("[voice-audio] Unauthorized access attempt");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const voice = await prisma.voiceClone.findFirst({
      where: { id: voiceId, userId: session.user.id },
    });

    if (!voice) {
      console.warn(`[voice-audio] No voice record found for ID: ${voiceId} and User: ${session.user.id}`);
      return NextResponse.json({ 
        error: "Voice not found", 
        debug: { voiceId, userId: session.user.id } 
      }, { status: 404 });
    }

    const metadata = voice.metadata as any;
    const objectName = metadata?.objectName;

    if (!objectName) {
      console.error(`[voice-audio] Object name missing in metadata for voice ${voiceId}`, metadata);
      return NextResponse.json({ error: "Audio sample path missing", voiceId }, { status: 404 });
    }

    console.log(`[voice-audio] Attempting to download from GCS bucket: ${process.env.CALIGUIA_VOICE_BUCKET}, object: ${objectName}`);
    
    try {
      const audioBytes = await downloadVoiceSample(objectName);
      
      if (!audioBytes || audioBytes.length === 0) {
        console.error(`[voice-audio] Downloaded empty file for ${objectName}`);
        return NextResponse.json({ error: "Audio file is empty" }, { status: 404 });
      }

      const mimeType = voice.sourceMimeType || "audio/webm";
      console.log(`[voice-audio] Serving audio: ${mimeType}, size: ${audioBytes.length} bytes`);

      return new Response(audioBytes, {
        headers: {
          "Content-Type": mimeType,
          "Content-Length": audioBytes.length.toString(),
          "Cache-Control": "private, max-age=3600",
        },
      });
    } catch (gcsError: any) {
      console.error("[voice-audio] GCS Download Error:", gcsError.message);
      return NextResponse.json({ 
        error: "GCS Download Error", 
        details: gcsError.message,
        path: objectName 
      }, { status: 502 });
    }
  } catch (error: any) {
    console.error("[voice-audio] Server Error:", error);
    return NextResponse.json({ error: "Internal server error", details: error.message }, { status: 500 });
  }
}
