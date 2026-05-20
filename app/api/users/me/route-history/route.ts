import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

const ROUTE_HISTORY_KEY = "__route_history__";
const MAX_ROUTES = 50;

function normalizeRouteEntry(entry: any) {
  if (!entry || typeof entry !== "object") return null;
  if (typeof entry.destinationName !== "string" || !entry.destinationName.trim()) return null;

  return {
    id: typeof entry.id === "string" ? entry.id : crypto.randomUUID(),
    destinationName: entry.destinationName.trim().slice(0, 160),
    destinationLat: typeof entry.destinationLat === "number" ? entry.destinationLat : undefined,
    destinationLng: typeof entry.destinationLng === "number" ? entry.destinationLng : undefined,
    originLat: typeof entry.originLat === "number" ? entry.originLat : undefined,
    originLng: typeof entry.originLng === "number" ? entry.originLng : undefined,
    mode: ["walking", "driving", "emergency"].includes(entry.mode) ? entry.mode : "walking",
    source: ["panel", "map", "emergency"].includes(entry.source) ? entry.source : "map",
    stops: Array.isArray(entry.stops)
      ? entry.stops.slice(0, 12).map((stop: any) => ({
          name: typeof stop?.name === "string" ? stop.name.slice(0, 160) : "Parada",
          lat: typeof stop?.lat === "number" ? stop.lat : undefined,
          lng: typeof stop?.lng === "number" ? stop.lng : undefined,
          description: typeof stop?.description === "string" ? stop.description.slice(0, 180) : undefined,
        }))
      : [],
    distanceText: typeof entry.distanceText === "string" ? entry.distanceText.slice(0, 40) : undefined,
    durationText: typeof entry.durationText === "string" ? entry.durationText.slice(0, 40) : undefined,
    createdAt: typeof entry.createdAt === "string" ? entry.createdAt : new Date().toISOString(),
  };
}

async function getUserLookup() {
  const session = await auth();
  const userId = session?.user?.id;
  const email = session?.user?.email;
  return userId || email ? (userId ? { id: userId } : { email }) : null;
}

export async function GET() {
  const where = await getUserLookup();
  if (!where) return NextResponse.json({ routes: [] }, { status: 401 });

  const user = await (prisma.user as any).findUnique({
    where,
    select: { chatHistory: true },
  });

  const history = Array.isArray(user?.chatHistory) ? user.chatHistory : [];
  const routeHistory = history.find((entry: any) => entry?.landmarkName === ROUTE_HISTORY_KEY);
  return NextResponse.json({ routes: Array.isArray(routeHistory?.routes) ? routeHistory.routes : [] });
}

export async function POST(req: NextRequest) {
  const where = await getUserLookup();
  if (!where) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const route = normalizeRouteEntry(await req.json().catch(() => null));
  if (!route) return NextResponse.json({ error: "Invalid route entry" }, { status: 400 });

  const user = await (prisma.user as any).findUnique({
    where,
    select: { chatHistory: true },
  });

  const history = Array.isArray(user?.chatHistory) ? [...user.chatHistory] : [];
  const idx = history.findIndex((entry: any) => entry?.landmarkName === ROUTE_HISTORY_KEY);
  const currentRoutes = idx >= 0 && Array.isArray(history[idx]?.routes) ? history[idx].routes : [];
  const routes = [route, ...currentRoutes.filter((item: any) => item?.id !== route.id)].slice(0, MAX_ROUTES);
  const routeEntry = {
    landmarkName: ROUTE_HISTORY_KEY,
    routes,
    updatedAt: new Date().toISOString(),
  };

  if (idx >= 0) history[idx] = routeEntry;
  else history.push(routeEntry);

  await (prisma.user as any).update({
    where,
    data: { chatHistory: history },
  });

  return NextResponse.json({ success: true, routes });
}
