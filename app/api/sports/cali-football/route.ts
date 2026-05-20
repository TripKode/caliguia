import { NextResponse } from "next/server";
import type { CaliEvent } from "@/components/map/types";

const API_KEY_ENV = "API_FOOTBALL";

const CALI_VENUE_HINTS = [
  "cali",
  "pascual guerrero",
  "estadio olimpico",
  "estadio olimpico pascual guerrero",
  "deportivo cali",
  "palmaseca",
  "coliseo evangelista mora",
];

const SPORTS = [
  {
    id: "football",
    name: "Fútbol",
    host: "https://v3.football.api-sports.io",
    dailyPath: (date: string) => `/fixtures?date=${date}&timezone=America/Bogota`,
    mapGame: mapFootballFixture,
  },
  {
    id: "baseball",
    name: "Béisbol",
    host: "https://v1.baseball.api-sports.io",
    dailyPath: (date: string) => `/games?date=${date}&timezone=America/Bogota`,
    mapGame: (game: ApiSportsGame) => mapGenericGame(game, "baseball", "Béisbol"),
  },
  {
    id: "basketball",
    name: "Baloncesto",
    host: "https://v1.basketball.api-sports.io",
    dailyPath: (date: string) => `/games?date=${date}&timezone=America/Bogota`,
    mapGame: (game: ApiSportsGame) => mapGenericGame(game, "basketball", "Baloncesto"),
  },
  {
    id: "volleyball",
    name: "Voleibol",
    host: "https://v1.volleyball.api-sports.io",
    dailyPath: (date: string) => `/games?date=${date}&timezone=America/Bogota`,
    mapGame: (game: ApiSportsGame) => mapGenericGame(game, "volleyball", "Voleibol"),
  },
  {
    id: "handball",
    name: "Balonmano",
    host: "https://v1.handball.api-sports.io",
    dailyPath: (date: string) => `/games?date=${date}&timezone=America/Bogota`,
    mapGame: (game: ApiSportsGame) => mapGenericGame(game, "handball", "Balonmano"),
  },
  {
    id: "hockey",
    name: "Hockey",
    host: "https://v1.hockey.api-sports.io",
    dailyPath: (date: string) => `/games?date=${date}&timezone=America/Bogota`,
    mapGame: (game: ApiSportsGame) => mapGenericGame(game, "hockey", "Hockey"),
  },
  {
    id: "rugby",
    name: "Rugby",
    host: "https://v1.rugby.api-sports.io",
    dailyPath: (date: string) => `/games?date=${date}&timezone=America/Bogota`,
    mapGame: (game: ApiSportsGame) => mapGenericGame(game, "rugby", "Rugby"),
  },
] as const;

type ApiSportsVenue = {
  id?: number;
  name?: string;
  city?: string;
  country?: string;
};

type ApiSportsFixture = {
  fixture?: {
    id?: number;
    date?: string;
    venue?: ApiSportsVenue;
  };
  league?: {
    name?: string;
    country?: string;
  };
  teams?: {
    home?: { name?: string };
    away?: { name?: string };
  };
};

type ApiSportsGame = {
  id?: number;
  date?: string;
  time?: string;
  timestamp?: number;
  timezone?: string;
  country?: { name?: string };
  league?: { id?: number; name?: string; country?: string };
  teams?: {
    home?: { name?: string };
    away?: { name?: string };
  };
  venue?: ApiSportsVenue | string | null;
};

function getBogotaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Bogota",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function todayKey() {
  return getBogotaDateKey();
}

function addDaysKey(days: number) {
  const next = new Date();
  next.setUTCDate(next.getUTCDate() + days);
  return getBogotaDateKey(next);
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isUpcomingDate(dateKey: string) {
  return dateKey >= todayKey();
}

function isCaliVenue(venue: ApiSportsVenue | string | null | undefined) {
  if (!venue) return false;
  if (typeof venue === "string") {
    const value = normalize(venue);
    return CALI_VENUE_HINTS.some(hint => value.includes(hint));
  }

  const city = normalize(venue.city || "");
  const country = normalize(venue.country || "");
  const name = normalize(venue.name || "");

  if (city.includes("cali") && (!country || country.includes("colombia"))) return true;
  return CALI_VENUE_HINTS.some(hint => name.includes(hint));
}

function getVenueName(venue: ApiSportsVenue | string | null | undefined) {
  if (!venue) return "Cali";
  if (typeof venue === "string") return venue;
  return venue.name || venue.city || "Cali";
}

function getGameDate(game: ApiSportsGame) {
  if (game.date) return new Date(game.date.includes("T") ? game.date : `${game.date}T${game.time || "12:00:00"}-05:00`);
  if (game.timestamp) return new Date(game.timestamp * 1000);
  return null;
}

function formatGameTime(date: Date) {
  return new Intl.DateTimeFormat("es-CO", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Bogota",
  }).format(date);
}

async function fetchApiSports(host: string, path: string, apiKey: string) {
  const response = await fetch(`${host}${path}`, {
    headers: {
      "x-apisports-key": apiKey,
    },
    next: { revalidate: 60 * 60 * 6 },
  });

  if (!response.ok) {
    throw new Error(`${host} ${response.status}`);
  }

  return response.json();
}

function mapFootballFixture(match: ApiSportsFixture): CaliEvent | null {
  const fixtureId = match.fixture?.id;
  const date = match.fixture?.date;
  const venue = match.fixture?.venue;
  const home = match.teams?.home?.name || "Equipo local";
  const away = match.teams?.away?.name || "Equipo visitante";

  if (!date || !isCaliVenue(venue)) return null;

  const dateObj = new Date(date);
  const eventDate = getBogotaDateKey(dateObj);
  if (!isUpcomingDate(eventDate)) return null;

  return {
    id: `football-${fixtureId || `${home}-${away}-${date}`}`,
    title: `${home} vs ${away}`,
    organizer: match.league?.name || "API-SPORTS Football",
    category: "Fútbol",
    time: formatGameTime(dateObj),
    startDate: eventDate,
    endDate: eventDate,
    location: getVenueName(venue),
    description: "Partido de fútbol programado en Cali. La ruta estará disponible solo el día del evento.",
    icon: "",
  };
}

function mapGenericGame(game: ApiSportsGame, sportId: string, sportName: string): CaliEvent | null {
  if (!isCaliVenue(game.venue)) return null;

  const dateObj = getGameDate(game);
  if (!dateObj) return null;

  const eventDate = getBogotaDateKey(dateObj);
  if (!isUpcomingDate(eventDate)) return null;

  const home = game.teams?.home?.name || "Equipo local";
  const away = game.teams?.away?.name || "Equipo visitante";

  return {
    id: `${sportId}-${game.id || `${home}-${away}-${eventDate}`}`,
    title: `${home} vs ${away}`,
    organizer: game.league?.name || `API-SPORTS ${sportName}`,
    category: sportName,
    time: formatGameTime(dateObj),
    startDate: eventDate,
    endDate: eventDate,
    location: getVenueName(game.venue),
    description: `Evento de ${sportName.toLowerCase()} programado en Cali. La ruta estará disponible solo el día del evento.`,
    icon: "",
  };
}

async function getSportEvents(sport: (typeof SPORTS)[number], apiKey: string) {
  const allowedFreePlanDates = [todayKey(), addDaysKey(1)];

  const groups = await Promise.all(
    allowedFreePlanDates.map(date =>
      fetchApiSports(sport.host, sport.dailyPath(date), apiKey).catch(() => ({ response: [] }))
    )
  );

  return groups
    .flatMap(group => group?.response || [])
    .map(game => sport.mapGame(game as never))
    .filter((event): event is CaliEvent => Boolean(event));
}

export async function GET() {
  const apiKey = process.env.API_SPORTS_KEY || process.env[API_KEY_ENV];

  if (!apiKey) {
    return NextResponse.json({ events: [], error: `${API_KEY_ENV} not configured` }, { status: 200 });
  }

  try {
    const eventGroups = await Promise.all(
      SPORTS.map(sport =>
        getSportEvents(sport, apiKey).catch(error => {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`[sports/cali] ${sport.id} skipped:`, message);
          return [];
        })
      )
    );

    const seen = new Set<string>();
    const events = eventGroups
      .flat()
      .filter(event => {
        if (seen.has(event.id)) return false;
        seen.add(event.id);
        return true;
      })
      .sort((a, b) => `${a.startDate} ${a.time}`.localeCompare(`${b.startDate} ${b.time}`))
      .slice(0, 20);

    return NextResponse.json({ events });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown API-SPORTS error";
    console.error("[sports/cali]", message);
    return NextResponse.json({ events: [], error: message }, { status: 200 });
  }
}
