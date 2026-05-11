import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

const LANGUAGES = ["es", "en", "pt"] as const;
type PreferredLanguage = (typeof LANGUAGES)[number];

function isPreferredLanguage(value: unknown): value is PreferredLanguage {
  return typeof value === "string" && LANGUAGES.includes(value as PreferredLanguage);
}

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  const email = session?.user?.email;

  if (!userId && !email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await (prisma.user as any).findUnique({
    where: userId ? { id: userId } : { email },
    select: {
      preferredLanguage: true,
      languageConfigured: true,
      activeVoiceProvider: true,
      activeProviderVoiceId: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json(user);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  const email = session?.user?.email;

  if (!userId && !email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const preferredLanguage = body?.preferredLanguage;

  if (!isPreferredLanguage(preferredLanguage)) {
    return NextResponse.json({ error: "Invalid preferredLanguage" }, { status: 400 });
  }

  const user = await (prisma.user as any).update({
    where: userId ? { id: userId } : { email },
    data: {
      preferredLanguage,
      languageConfigured: true,
    },
    select: {
      preferredLanguage: true,
      languageConfigured: true,
      activeVoiceProvider: true,
      activeProviderVoiceId: true,
    },
  });

  return NextResponse.json(user);
}
