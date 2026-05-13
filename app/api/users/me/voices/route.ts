import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        voiceClones: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    return NextResponse.json({
      voices: user?.voiceClones || [],
      activeVoiceId: user?.activeProviderVoiceId || null,
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch voices" }, { status: 500 });
  }
}
