import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  const email = session?.user?.email;

  if (!userId && !email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { landmarkName, messages } = await req.json();

  if (!landmarkName || !messages) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    // We store the chat history in a dedicated collection or as part of the user document
    // For now, let's store it in a generic 'UserChat' model if we have it, 
    // or just update a Json field in User if we prefer simplicity.
    // Let's check if we can update the user document with a new chat entry.
    
    // As we don't have a specific model, we'll use a dynamic approach with Prisma/Mongo
    const chatEntry = {
      landmarkName,
      messages,
      updatedAt: new Date().toISOString()
    };

    const user = await (prisma.user as any).findUnique({
      where: userId ? { id: userId } : { email },
      select: { chatHistory: true }
    });

    let history = user?.chatHistory || [];
    if (!Array.isArray(history)) history = [];

    // Replace or add the chat for this landmark
    const existingIdx = history.findIndex((h: any) => h.landmarkName === landmarkName);
    if (existingIdx >= 0) {
      history[existingIdx] = chatEntry;
    } else {
      history.push(chatEntry);
    }

    await (prisma.user as any).update({
      where: userId ? { id: userId } : { email },
      data: { chatHistory: history }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[ChatHistory] Error saving chat:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
    const session = await auth();
    const userId = session?.user?.id;
    const email = session?.user?.email;
  
    if (!userId && !email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const landmarkName = searchParams.get("landmarkName");

    try {
        const user = await (prisma.user as any).findUnique({
            where: userId ? { id: userId } : { email },
            select: { chatHistory: true }
        });

        if (!user?.chatHistory || !Array.isArray(user.chatHistory)) {
            return NextResponse.json({ messages: [] });
        }

        if (landmarkName) {
            const entry = user.chatHistory.find((h: any) => h.landmarkName === landmarkName);
            return NextResponse.json({ messages: entry?.messages || [] });
        }

        return NextResponse.json({ history: user.chatHistory });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
