import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { providerVoiceId } = await req.json();
    
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        activeProviderVoiceId: providerVoiceId,
        activeVoiceProvider: "XTTS_LOCAL" as any,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to set active voice" }, { status: 500 });
  }
}
