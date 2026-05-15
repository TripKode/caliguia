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
      travelPreferences: true,
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
  const { preferredLanguage, activeProviderVoiceId, travelPreferences } = body || {};

  const data: any = {};
  if (preferredLanguage) {
    if (!isPreferredLanguage(preferredLanguage)) {
      return NextResponse.json({ error: "Invalid preferredLanguage" }, { status: 400 });
    }
    data.preferredLanguage = preferredLanguage;
    data.languageConfigured = true;
  }

  if (activeProviderVoiceId !== undefined) {
    data.activeProviderVoiceId = activeProviderVoiceId;
  }

  if (travelPreferences !== undefined && typeof travelPreferences === "object" && travelPreferences !== null) {
    data.travelPreferences = travelPreferences;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const user = await (prisma.user as any).update({
    where: userId ? { id: userId } : { email },
    data,
    select: {
      preferredLanguage: true,
      languageConfigured: true,
      activeVoiceProvider: true,
      activeProviderVoiceId: true,
      travelPreferences: true,
    },
  });

  return NextResponse.json(user);
}
