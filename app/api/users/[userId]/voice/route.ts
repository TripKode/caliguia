import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface RouteContext {
  params: Promise<{ userId: string }>;
}

export async function GET(_req: NextRequest, context: RouteContext) {
  const { userId } = await context.params;

  const user = await prisma.user.findUnique({
    where: { externalId: userId },
    select: {
      externalId: true,
      activeVoiceProvider: true,
      activeProviderVoiceId: true,
      voiceClones: {
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: {
          id: true,
          provider: true,
          providerVoiceId: true,
          providerVoiceName: true,
          status: true,
          requiresVerification: true,
          sourceFileName: true,
          sourceMimeType: true,
          sourceSizeBytes: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  const activeVoiceId = user?.activeProviderVoiceId || user?.voiceClones[0]?.providerVoiceId;

  if (!activeVoiceId) {
    return NextResponse.json({ voice: null }, { status: 404 });
  }

  return NextResponse.json({
    userId: user.externalId,
    activeVoiceProvider: user.activeVoiceProvider,
    activeProviderVoiceId: activeVoiceId,
    voices: user.voiceClones,
  });
}
