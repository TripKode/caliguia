import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const internalSecret =
    process.env.MAPS_API_INTERNAL_SECRET || process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY;
  const secret = request.nextUrl.searchParams.get("internal_secret");

  if (!internalSecret || secret !== internalSecret) {
    console.error("Maps API Proxy Error: Secret mismatch");
    return new NextResponse("Forbidden: Internal access only", {
      status: 403,
      statusText: "Forbidden",
    });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY;

  if (!apiKey) {
    return new NextResponse("API key not configured", { status: 500 });
  }

  const searchParams = request.nextUrl.searchParams;
  const libraries = searchParams.get("libraries") || "maps,marker,places";
  const v = searchParams.get("v") || "weekly";
  const language = searchParams.get("language") || "es";
  const loading = searchParams.get("loading");
  const callback = searchParams.get("callback");

  const params = new URLSearchParams();
  params.set("key", apiKey);
  params.set("libraries", libraries);
  params.set("v", v);
  params.set("language", language);
  if (loading) params.set("loading", loading);
  if (callback) params.set("callback", callback);

  const googleUrl = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;

  try {
    const response = await fetch(googleUrl, { cache: "no-store" });

    if (!response.ok) {
      return new NextResponse(`Google API error: ${response.status}`, {
        status: 502,
        statusText: "Bad Gateway",
      });
    }

    const content = await response.text();

    return new NextResponse(content, {
      headers: {
        "Content-Type": "application/javascript",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Maps API Proxy Error:", error);
    return new NextResponse("Error fetching Google Maps API", { status: 500 });
  }
}
