import { NextResponse } from "next/server";

export async function GET() {
  const secret = process.env.MAPS_API_INTERNAL_SECRET || process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY;

  if (!secret) {
    return NextResponse.json(
      { error: "Maps internal secret not configured on server" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { secret },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
