import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listOfficialVoices } from "@/lib/voice-storage";

export async function GET() {
  const session = await auth();

  try {
    const officialVoices = await listOfficialVoices();

    if (!session?.user?.id) {
      return NextResponse.json({
        voices: officialVoices,
        activeVoiceId: "system:jorge",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        voiceClones: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    // Combine system voices first, then user voices
    const allVoices = [...officialVoices, ...(user?.voiceClones || [])];

    return NextResponse.json({
      voices: allVoices,
      activeVoiceId: user?.activeProviderVoiceId || null,
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch voices" }, { status: 500 });
  }
}
