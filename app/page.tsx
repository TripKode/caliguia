"use client";

import { useEffect, useRef, useState, useCallback, type PointerEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Webcam from "react-webcam";
import { AIFloatingIsland } from "../components/island/Island";
import { useExperience, TOURISM_INTERESTS } from "../components/providers/ExperienceProvider";
import { useVoiceNarrator, fetchNarration, type NarrationType } from "../components/providers/VoiceNarrator";

declare global {
  interface Window {
    __googleMapsProxyLoading?: Promise<void>;
    __caliguiaGoogleMapsReady?: () => void;
    gm_authFailure?: () => void;
  }
}

function hasBaseGoogleMaps() {
  return Boolean(window.google?.maps?.Map || window.google?.maps?.importLibrary);
}

function waitForGoogleMapsBase(timeoutMs = 10000) {
  if (hasBaseGoogleMaps()) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      if (hasBaseGoogleMaps()) {
        window.clearInterval(interval);
        resolve();
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        window.clearInterval(interval);
        reject(new Error("Google Maps SDK did not become ready after script load"));
      }
    }, 50);
  });
}

async function loadGoogleMapsViaProxy() {
  if (hasBaseGoogleMaps()) return;
  if (window.__googleMapsProxyLoading) return window.__googleMapsProxyLoading;

  window.__googleMapsProxyLoading = (async () => {
    const keyRes = await fetch("/api/maps-key", { cache: "no-store" });
    if (!keyRes.ok) {
      throw new Error("Maps internal secret not configured");
    }

    const keyData = await keyRes.json();
    const internalSecret = keyData.secret || keyData.key || "";
    if (!internalSecret) {
      throw new Error("Maps internal secret not available");
    }

    await new Promise<void>((resolve, reject) => {
      const scriptId = "google-maps-proxy-script";
      const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;

      if (hasBaseGoogleMaps()) {
        resolve();
        return;
      }

      if (existingScript) {
        waitForGoogleMapsBase().then(resolve).catch(reject);
        existingScript.addEventListener("error", () => reject(new Error("Failed to load Maps via proxy")), {
          once: true,
        });
        return;
      }

      const params = new URLSearchParams({
        internal_secret: internalSecret,
        libraries: "maps,places,visualization",
        v: "weekly",
        language: "es",
        loading: "async",
        callback: "__caliguiaGoogleMapsReady",
      });

      const script = document.createElement("script");
      script.id = scriptId;
      script.src = `/api/maps-proxy?${params.toString()}`;
      script.async = true;
      script.defer = true;
      script.crossOrigin = "anonymous";
      window.__caliguiaGoogleMapsReady = () => {
        waitForGoogleMapsBase().then(resolve).catch(reject);
      };
      script.onload = () => {
        waitForGoogleMapsBase().then(resolve).catch(reject);
      };
      script.onerror = () => reject(new Error("Failed to load Maps via proxy"));
      document.head.appendChild(script);
    });
  })().catch((error) => {
    window.__googleMapsProxyLoading = undefined;
    throw error;
  });

  return window.__googleMapsProxyLoading;
}

async function ensureGoogleMapsLibraries() {
  if (typeof google.maps.importLibrary === "function") {
    const [{ Map }] = await Promise.all([
      google.maps.importLibrary("maps") as Promise<google.maps.MapsLibrary>,
      google.maps.importLibrary("places"),
      google.maps.importLibrary("visualization"),
    ]);

    return { Map };
  }

  if (!google.maps.Map || !google.maps.places?.Place || !google.maps.visualization?.HeatmapLayer) {
    throw new Error("Google Maps libraries were not available after script load");
  }

  return { Map: google.maps.Map };
}

// ─── Haversine distance in meters ─────────────────────────────────────────────
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Point-in-polygon (ray casting algorithm) ─────────────────────────────────
function pointInPolygon(lat: number, lng: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][1], yi = polygon[i][0];
    const xj = polygon[j][1], yj = polygon[j][0];
    const intersect = yi > lng !== yj > lng && lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// ─── Cali Landmarks for voice narration ──────────────────────────────────────
interface Landmark {
  name: string;
  lat: number;
  lng: number;
  type: NarrationType;
  icon: string;
  prompt: string;
  radiusM: number;
}

const CALI_LANDMARKS: Landmark[] = [
  {
    name: "La Ermita", lat: 3.4534, lng: -76.5383, type: "monument", icon: "⛪", radiusM: 250,
    prompt: "El usuario acaba de pasar cerca de la Iglesia La Ermita en Cali, un templo neogótico icónico del siglo XX a orillas del río Cali."
  },
  {
    name: "San Antonio", lat: 3.4480, lng: -76.5430, type: "monument", icon: "🏛️", radiusM: 300,
    prompt: "El usuario está en el barrio San Antonio de Cali, zona histórica con casas republicanas coloridas y una capilla colonial del siglo XVIII."
  },
  {
    name: "Cristo Rey", lat: 3.4309, lng: -76.5597, type: "monument", icon: "✝️", radiusM: 400,
    prompt: "El usuario puede ver el Cristo Rey, el monumento más icónico de Cali que corona el cerro Los Cristales a 1470 metros."
  },
  {
    name: "Museo de la Salsa", lat: 3.4502, lng: -76.5328, type: "monument", icon: "💃", radiusM: 200,
    prompt: "El usuario está cerca del Museo de la Salsa en Cali, el corazón musical de la ciudad y patrimonio inmaterial de Colombia."
  },
  {
    name: "Barrio Obrero", lat: 3.4491, lng: -76.5310, type: "monument", icon: "🎶", radiusM: 250,
    prompt: "El usuario está en el Barrio Obrero, la cuna de la salsa caleña, lleno de salsotecas y cultura popular desde los años 60."
  },
  {
    name: "La Topa Tolondra", lat: 3.4498, lng: -76.5335, type: "monument", icon: "🕺", radiusM: 200,
    prompt: "El usuario pasa por La Topa Tolondra, una de las salsotecas más legendarias e históricas de Cali."
  },
  {
    name: "Teatro Municipal", lat: 3.4521, lng: -76.5356, type: "monument", icon: "🎭", radiusM: 220,
    prompt: "El usuario está frente al Teatro Municipal Enrique Buenaventura, joya arquitectónica y cultural del centro de Cali."
  },
  {
    name: "Parque del Perro", lat: 3.4341, lng: -76.5398, type: "monument", icon: "🌳", radiusM: 220,
    prompt: "El usuario está en el Parque del Perro en el barrio Granada, el epicentro bohemio y gastronómico del sur de Cali."
  },
  {
    name: "Zoológico de Cali", lat: 3.4467, lng: -76.5262, type: "monument", icon: "🦁", radiusM: 300,
    prompt: "El usuario está cerca del Zoológico de Cali, uno de los mejores de América Latina con más de 200 especies."
  },
  {
    name: "Galería Alameda", lat: 3.4561, lng: -76.5358, type: "monument", icon: "🛍️", radiusM: 220,
    prompt: "El usuario está en la Galería Alameda, el mercado popular más emblemático de Cali con frutas exóticas, carnes y tradición."
  },
  {
    name: "Loma de la Cruz", lat: 3.4394, lng: -76.5495, type: "monument", icon: "🌄", radiusM: 280,
    prompt: "El usuario está en la Loma de la Cruz, mirador natural con una vista panorámica de toda la ciudad de Cali."
  },
  {
    name: "Río Pance", lat: 3.3850, lng: -76.5510, type: "monument", icon: "🏞️", radiusM: 350,
    prompt: "El usuario está cerca del Río Pance, el destino natural favorito de los caleños para refrescarse los fines de semana."
  },
  {
    name: "Unidad Deportiva", lat: 3.4294, lng: -76.5273, type: "monument", icon: "🏟️", radiusM: 350,
    prompt: "El usuario está cerca de la Unidad Deportiva Alberto Galindo, el complejo deportivo más importante de Cali."
  },
  {
    name: "Ciudad Jardín", lat: 3.3950, lng: -76.5350, type: "monument", icon: "🌿", radiusM: 300,
    prompt: "El usuario está en Ciudad Jardín, la zona residencial más tranquila y verde del sur de Cali."
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────
type RiskLevel = "high" | "medium" | "low" | "safe";
type LayerMode = "risk" | "heatmap" | "none";

interface NearbyPlace {
  place_id: string;
  name: string;
  vicinity: string;
  rating?: number;
  user_ratings_total?: number;
  types: string[];
  geometry: { location: { lat: () => number; lng: () => number } };
  business_status?: string;
  price_level?: number;
}

interface ComunaData {
  id: number;
  name: string;
  risk: RiskLevel;
  description: string;
  barrios: string[];
  coords: [number, number][]; // [lat, lng]
}

type Status = "idle" | "loading" | "tracking" | "denied" | "error";

type CachedLocation = {
  lat: number;
  lng: number;
  accuracy: number;
  savedAt: number;
};

const LOCATION_OPT_IN_KEY = "caliguia:location-opt-in";
const LEGACY_LOCATION_OPT_IN_KEY = "location_granted";
const LOCATION_CACHE_KEY = "caliguia:last-location";
const LOCATION_CACHE_MAX_AGE = 1000 * 60 * 60 * 12;
const CALI_CENTER = { lat: 3.4516, lng: -76.5320 };
const CALI_BOUNDS = {
  north: 3.56,
  south: 3.33,
  east: -76.43,
  west: -76.62,
};
const AR_ZOOM_LEVELS = [0.05, 1, 10] as const;
type ArZoomLevel = (typeof AR_ZOOM_LEVELS)[number];

function isInsideCaliBounds(lat: number, lng: number) {
  return lat <= CALI_BOUNDS.north && lat >= CALI_BOUNDS.south && lng <= CALI_BOUNDS.east && lng >= CALI_BOUNDS.west;
}

function getComunaCentroid(comuna: ComunaData) {
  const lat = comuna.coords.reduce((sum, [value]) => sum + value, 0) / comuna.coords.length;
  const lng = comuna.coords.reduce((sum, [, value]) => sum + value, 0) / comuna.coords.length;
  return { lat, lng };
}

function readCachedLocation(): CachedLocation | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(LOCATION_CACHE_KEY);
    if (!raw) return null;

    const cached = JSON.parse(raw) as Partial<CachedLocation>;
    if (
      typeof cached.lat !== "number" ||
      typeof cached.lng !== "number" ||
      typeof cached.accuracy !== "number" ||
      typeof cached.savedAt !== "number"
    ) {
      return null;
    }

    if (Date.now() - cached.savedAt > LOCATION_CACHE_MAX_AGE) {
      window.localStorage.removeItem(LOCATION_CACHE_KEY);
      return null;
    }

    return cached as CachedLocation;
  } catch {
    return null;
  }
}

function writeCachedLocation(location: Omit<CachedLocation, "savedAt">) {
  try {
    window.localStorage.setItem(LOCATION_OPT_IN_KEY, "true");
    window.localStorage.setItem(LEGACY_LOCATION_OPT_IN_KEY, "true");
    window.localStorage.setItem(
      LOCATION_CACHE_KEY,
      JSON.stringify({ ...location, savedAt: Date.now() })
    );
  } catch {
    // Storage can be unavailable in private browsing; location still works for the session.
  }
}

function hasLocationOptIn() {
  try {
    return (
      window.localStorage.getItem(LOCATION_OPT_IN_KEY) === "true" ||
      window.localStorage.getItem(LEGACY_LOCATION_OPT_IN_KEY) === "true"
    );
  } catch {
    return false;
  }
}

// ─── Cali Comunas — polígonos aproximados basados en geografía real ───────────
// Coordenadas [lat, lng] de cada comuna. Centro de Cali: 3.4516, -76.5320
const CALI_COMUNAS: ComunaData[] = [
  {
    id: 1, name: "Comuna 1 — Sucre", risk: "high",
    description: "Zona occidental, ladera. Alto índice de inseguridad.",
    barrios: ["Terrón Colorado", "Bello Horizonte", "Vista Hermosa", "Aguacatal"],
    coords: [
      [3.490, -76.560], [3.500, -76.548], [3.510, -76.540], [3.505, -76.528],
      [3.495, -76.525], [3.480, -76.535], [3.475, -76.550], [3.482, -76.562],
    ],
  },
  {
    id: 2, name: "Comuna 2 — Santa Mónica", risk: "safe",
    description: "Zona norte, estrato alto. Granada, Juanambú, Versalles.",
    barrios: ["Granada", "Juanambú", "Santa Mónica", "Normandía", "Versalles"],
    coords: [
      [3.460, -76.548], [3.475, -76.548], [3.480, -76.535], [3.495, -76.525],
      [3.490, -76.510], [3.475, -76.508], [3.460, -76.515], [3.450, -76.530],
    ],
  },
  {
    id: 3, name: "Comuna 3 — Santa Rosa", risk: "medium",
    description: "Centro histórico. Comercio activo, zona mixta.",
    barrios: ["San Pedro", "San Nicolás", "Alameda", "Bretaña", "Junín"],
    coords: [
      [3.448, -76.540], [3.460, -76.548], [3.450, -76.530], [3.445, -76.520],
      [3.438, -76.518], [3.435, -76.528], [3.440, -76.540],
    ],
  },
  {
    id: 4, name: "Comuna 4 — Fátima", risk: "medium",
    description: "Norte centro. Barrios residenciales y comerciales.",
    barrios: ["Fátima", "San Francisco", "Jorge Isaacs", "Santander"],
    coords: [
      [3.460, -76.515], [3.475, -76.508], [3.480, -76.495], [3.468, -76.492],
      [3.455, -76.498], [3.448, -76.510], [3.450, -76.520],
    ],
  },
  {
    id: 5, name: "Comuna 5 — Guabal", risk: "medium",
    description: "Zona norte-oriental. Industrial y residencial.",
    barrios: ["Guabal", "El Sena", "Salomia", "Ignacio Rengifo"],
    coords: [
      [3.475, -76.508], [3.490, -76.510], [3.495, -76.495], [3.485, -76.485],
      [3.472, -76.488], [3.462, -76.492], [3.468, -76.492],
    ],
  },
  {
    id: 6, name: "Comuna 6 — Flores", risk: "high",
    description: "Nororiente. Vulnerabilidad social media-alta.",
    barrios: ["Flores", "Petecuy", "El Poblado", "Andrés Sanín"],
    coords: [
      [3.490, -76.510], [3.505, -76.508], [3.510, -76.492], [3.500, -76.480],
      [3.488, -76.478], [3.480, -76.485], [3.485, -76.485],
    ],
  },
  {
    id: 7, name: "Comuna 7 — Urb. Calimío", risk: "high",
    description: "Nororiente. Zona con problemáticas de seguridad.",
    barrios: ["Calimío", "Desepaz", "Villa del Lago"],
    coords: [
      [3.505, -76.508], [3.520, -76.505], [3.525, -76.488], [3.512, -76.478],
      [3.500, -76.480], [3.510, -76.492],
    ],
  },
  {
    id: 8, name: "Comuna 8 — Villanueva", risk: "medium",
    description: "Centro-oriente. Zona mixta residencial-comercial.",
    barrios: ["Villanueva", "La Base", "El Troncal", "San Cayetano"],
    coords: [
      [3.448, -76.518], [3.455, -76.498], [3.448, -76.490], [3.438, -76.488],
      [3.430, -76.498], [3.432, -76.510], [3.438, -76.518],
    ],
  },
  {
    id: 9, name: "Comuna 9 — Pedro Claver", risk: "low",
    description: "Centro. Zona comercial densa, relativamente segura.",
    barrios: ["Alameda", "San Pedro Claver", "San Carlos", "La Merced"],
    coords: [
      [3.438, -76.518], [3.448, -76.518], [3.440, -76.540], [3.435, -76.528],
      [3.428, -76.530], [3.430, -76.518],
    ],
  },
  {
    id: 10, name: "Comuna 10 — El Centro", risk: "medium",
    description: "Centro histórico de Cali. Alto tráfico peatonal.",
    barrios: ["El Centro", "San Bosco", "San Judas", "Obrero"],
    coords: [
      [3.448, -76.518], [3.455, -76.498], [3.445, -76.495], [3.438, -76.500],
      [3.430, -76.505], [3.428, -76.518], [3.438, -76.518],
    ],
  },
  {
    id: 11, name: "Comuna 11 — San Cristóbal", risk: "low",
    description: "Centro-occidente. Residencial con buena convivencia.",
    barrios: ["San Cristóbal", "San Cayetano", "San Benito"],
    coords: [
      [3.435, -76.540], [3.448, -76.540], [3.448, -76.518], [3.438, -76.518],
      [3.428, -76.518], [3.425, -76.530], [3.428, -76.540],
    ],
  },
  {
    id: 12, name: "Comuna 12 — Bel. Caicedo", risk: "medium",
    description: "Sur-oriente. Zona de estrato medio-bajo.",
    barrios: ["Belisario Caicedo", "Benjamín Herrera", "Municipal"],
    coords: [
      [3.430, -76.498], [3.438, -76.488], [3.430, -76.480], [3.420, -76.480],
      [3.418, -76.492], [3.422, -76.500],
    ],
  },
  {
    id: 13, name: "Comuna 13 — El Poblado", risk: "high",
    description: "Oriente. Distrito de Aguablanca, alta vulnerabilidad.",
    barrios: ["El Poblado", "Marroquín I", "Marroquín II", "Urbanización Cali"],
    coords: [
      [3.440, -76.488], [3.448, -76.490], [3.455, -76.498], [3.455, -76.480],
      [3.442, -76.472], [3.432, -76.475], [3.430, -76.480],
    ],
  },
  {
    id: 14, name: "Comuna 14 — Ladera", risk: "high",
    description: "Oriente. Comuneros, alta tasa de inseguridad.",
    barrios: ["Comuneros I", "Comuneros II", "Vallado", "Mojica"],
    coords: [
      [3.420, -76.480], [3.430, -76.480], [3.432, -76.475], [3.428, -76.462],
      [3.415, -76.462], [3.412, -76.472],
    ],
  },
  {
    id: 15, name: "Comuna 15 — Quint. Lame", risk: "high",
    description: "Oriente Distrito Aguablanca. Zona crítica.",
    barrios: ["Mojica", "El Vallado", "Laureano Gómez", "Ciudad Córdoba"],
    coords: [
      [3.432, -76.475], [3.442, -76.472], [3.445, -76.460], [3.435, -76.452],
      [3.422, -76.455], [3.415, -76.462], [3.428, -76.462],
    ],
  },
  {
    id: 16, name: "Comuna 16 — Tequendama", risk: "medium",
    description: "Sur. Zona residencial de estrato medio.",
    barrios: ["Tequendama", "La Republica", "Alborada", "Álvarez"],
    coords: [
      [3.418, -76.492], [3.420, -76.480], [3.412, -76.472], [3.405, -76.478],
      [3.405, -76.492], [3.410, -76.498],
    ],
  },
  {
    id: 17, name: "Comuna 17 — Meléndez", risk: "low",
    description: "Sur. Estrato medio-alto. Unicentro, Valle del Lili.",
    barrios: ["Los Sauces", "Caney", "Ciudad Jardín", "Unicentro"],
    coords: [
      [3.400, -76.560], [3.415, -76.548], [3.418, -76.530], [3.410, -76.515],
      [3.400, -76.510], [3.390, -76.518], [3.388, -76.540], [3.395, -76.558],
    ],
  },
  {
    id: 18, name: "Comuna 18 — El Cañaveral", risk: "medium",
    description: "Sur-occidente. Ladera sur, estrato mixto.",
    barrios: ["Meléndez", "El Jordán", "Nápoles", "Santa Isabel"],
    coords: [
      [3.415, -76.548], [3.425, -76.540], [3.428, -76.540], [3.425, -76.530],
      [3.418, -76.530], [3.410, -76.515], [3.400, -76.510],
      [3.400, -76.530], [3.408, -76.545],
    ],
  },
  {
    id: 19, name: "Comuna 19 — Cristóbal Colón", risk: "safe",
    description: "Centro-sur. Zona segura, estratos altos. El Peñón, San Fernando.",
    barrios: ["San Fernando", "El Peñón", "Camilo Torres", "Miraflores"],
    coords: [
      [3.428, -76.540], [3.435, -76.540], [3.428, -76.530], [3.425, -76.520],
      [3.418, -76.515], [3.410, -76.515], [3.418, -76.530], [3.425, -76.540],
    ],
  },
  {
    id: 20, name: "Comuna 20 — Siloé", risk: "high",
    description: "Ladera occidental. Zona crítica de seguridad.",
    barrios: ["Siloé", "El Cortijo", "Brisas de Mayo", "Lleras Camargo"],
    coords: [
      [3.450, -76.570], [3.462, -76.562], [3.460, -76.548], [3.448, -76.540],
      [3.440, -76.548], [3.438, -76.558], [3.442, -76.568],
    ],
  },
  {
    id: 21, name: "Comuna 21 — Las Orquídeas", risk: "high",
    description: "Nororiente extremo. Alta vulnerabilidad social.",
    barrios: ["Las Orquídeas", "El Vergel", "Potrero Grande", "Desepaz"],
    coords: [
      [3.520, -76.505], [3.535, -76.500], [3.538, -76.480], [3.525, -76.472],
      [3.512, -76.478], [3.525, -76.488],
    ],
  },
  {
    id: 22, name: "Comuna 22 — Ciudad Jardín", risk: "safe",
    description: "Sur extremo. Zona más segura y exclusiva de Cali.",
    barrios: ["Ciudad Jardín", "Pance", "La Hacienda", "Jockey Club"],
    coords: [
      [3.388, -76.540], [3.390, -76.518], [3.380, -76.512], [3.370, -76.520],
      [3.368, -76.542], [3.375, -76.558], [3.382, -76.558],
    ],
  },
];

// ─── Risk colors ──────────────────────────────────────────────────────────────
const RISK_CONFIG: Record<RiskLevel, { fill: string; stroke: string; fillOpacity: number; label: string; color: string }> = {
  safe: { fill: "#22c55e", stroke: "#16a34a", fillOpacity: 0.12, label: "Segura", color: "#16a34a" },
  low: { fill: "#84cc16", stroke: "#65a30d", fillOpacity: 0.14, label: "Baja", color: "#65a30d" },
  medium: { fill: "#f59e0b", stroke: "#d97706", fillOpacity: 0.15, label: "Moderada", color: "#d97706" },
  high: { fill: "#ef4444", stroke: "#dc2626", fillOpacity: 0.18, label: "Alta", color: "#dc2626" },
};

// ─── Map styles ───────────────────────────────────────────────────────────────
const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#f0ede8" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9ca3af" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f7f6f3" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#e5e2db" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#f5f2ec" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#d6d1c8" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#dde8f4" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#93b8d4" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#e8e4de" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#d8e8d0" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#e8e4de" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#d6d1c8" }] },
  { featureType: "administrative.land_parcel", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "road.local", elementType: "labels", stylers: [{ visibility: "off" }] },
];

const PIN_SVG = `
  <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="10" r="9" fill="#3b82f6" fill-opacity="0.12"/>
    <circle cx="10" cy="10" r="5" fill="#3b82f6" stroke="#ffffff" stroke-width="2.5"/>
  </svg>
`;

function getCategoryIcon(types: string[]): string {
  if (types.some(t => ["restaurant", "food", "meal_takeaway", "cafe", "bakery", "bar"].includes(t))) return "🍽️";
  if (types.some(t => ["supermarket", "grocery_or_supermarket", "convenience_store"].includes(t))) return "🛒";
  if (types.some(t => ["pharmacy", "drugstore", "hospital", "doctor"].includes(t))) return "💊";
  if (types.some(t => ["gym", "spa", "beauty_salon", "hair_care"].includes(t))) return "💆";
  if (types.some(t => ["bank", "atm", "finance"].includes(t))) return "🏦";
  if (types.some(t => ["gas_station", "car_repair", "car_wash"].includes(t))) return "⛽";
  if (types.some(t => ["school", "university", "library"].includes(t))) return "📚";
  if (types.some(t => ["lodging", "hotel"].includes(t))) return "🏨";
  if (types.some(t => ["park", "tourist_attraction", "museum"].includes(t))) return "🌿";
  if (types.some(t => ["clothing_store", "shopping_mall", "store"].includes(t))) return "🛍️";
  return "📍";
}

function getCategoryLabel(types: string[]): string {
  const map: Record<string, string> = {
    restaurant: "Restaurant", cafe: "Café", bar: "Bar", bakery: "Bakery",
    supermarket: "Supermercado", grocery_or_supermarket: "Tienda",
    pharmacy: "Farmacia", hospital: "Hospital", gym: "Gym",
    bank: "Banco", atm: "ATM", gas_station: "Gasolinera",
    school: "Colegio", park: "Parque", lodging: "Hotel",
    clothing_store: "Ropa", shopping_mall: "Centro Com.", store: "Tienda",
    beauty_salon: "Salón", hair_care: "Peluquería", spa: "Spa",
  };
  for (const t of types) if (map[t]) return map[t];
  return "Negocio";
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Home() {
  const { experienceMode, selectedInterests, travelGroup } = useExperience();
  const webcamRef = useRef<Webcam>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<{ setPosition: (pos: google.maps.LatLngLiteral) => void } | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const badgeRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const requestingLocationRef = useRef(false);
  const lastFetchPos = useRef<{ lat: number; lng: number } | null>(null);
  const polygonsRef = useRef<google.maps.Polygon[]>([]);
  const heatmapRef = useRef<google.maps.visualization.HeatmapLayer | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const dragStartY = useRef<number>(0);
  const drawerStartH = useRef<number>(0);
  const isDragging = useRef(false);
  const drawerCurrentH = useRef(280);

  const [status, setStatus] = useState<Status>("idle");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationDebug, setLocationDebug] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const [drawerH, setDrawerH] = useState(280);
  const [isDrawerDragging, setIsDrawerDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [layerMode, setLayerMode] = useState<LayerMode>("none");
  const [currentComuna, setCurrentComuna] = useState<ComunaData | null>(null);
  const [activeTab, setActiveTab] = useState<"places" | "zones" | "experience">("places");
  const [arCameraError, setArCameraError] = useState<string | null>(null);
  const [arFacingMode, setArFacingMode] = useState<"environment" | "user">("environment");
  const [arZoomLevel, setArZoomLevel] = useState<ArZoomLevel>(0.05);
  const [arZoomSupported, setArZoomSupported] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);

  // Voice narrator
  const { isSpeaking: narratorSpeaking, currentNarration, experienceLog, speak, unlockSpeech, speechUnlocked, voicePreference } = useVoiceNarrator({ muted: voiceMuted });

  // Track which landmarks we've already narrated (by name) to avoid repetition
  const spokenLandmarks = useRef<Set<string>>(new Set());
  // Track last danger narration to avoid flooding
  const lastDangerNarration = useRef<number>(0);
  // Track last position for movement detection
  const lastNarratedPos = useRef<{ lat: number; lng: number } | null>(null);

  const applyCameraZoom = useCallback((zoomLevel: ArZoomLevel) => {
    const stream = webcamRef.current?.video?.srcObject as MediaStream | null;
    const track = stream?.getVideoTracks()[0];
    if (!track) return;

    const capabilities = track.getCapabilities?.() as MediaTrackCapabilities & {
      zoom?: { min?: number; max?: number; step?: number };
    };

    const minZoom = capabilities?.zoom?.min;
    const maxZoom = capabilities?.zoom?.max;
    if (typeof minZoom !== "number" || typeof maxZoom !== "number") {
      setArZoomSupported(false);
      return;
    }

    setArZoomSupported(true);
    const requestedZoom = Math.min(Math.max(zoomLevel, minZoom), maxZoom);
    track
      .applyConstraints({ advanced: [{ zoom: requestedZoom } as MediaTrackConstraintSet] })
      .catch(() => setArZoomSupported(false));
  }, []);

  const swapCameraZoom = useCallback(() => {
    setArZoomLevel(current => {
      const currentIndex = AR_ZOOM_LEVELS.indexOf(current);
      const next = AR_ZOOM_LEVELS[(currentIndex + 1) % AR_ZOOM_LEVELS.length];
      applyCameraZoom(next);
      return next;
    });
  }, [applyCameraZoom]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const oldAuthFailure = window.gm_authFailure;
    window.gm_authFailure = () => {
      setLocationError(
        "Conexión rechazada por Google Maps. Verifica que la API esté habilitada en Google Cloud y que las restricciones de la llave permitan este despliegue."
      );
      setStatus("error");
      requestingLocationRef.current = false;
      if (oldAuthFailure) oldAuthFailure();
    };

    return () => {
      window.gm_authFailure = oldAuthFailure;
    };
  }, []);

  // ── Detect which comuna the user is in ───────────────────────────────────
  const detectComuna = useCallback((lat: number, lng: number) => {
    for (const comuna of CALI_COMUNAS) {
      if (pointInPolygon(lat, lng, comuna.coords)) {
        setCurrentComuna(comuna);
        return;
      }
    }
    setCurrentComuna(null);
  }, []);

  // ── Draw risk layer polygons ───────────────────────────────────────────────
  const drawRiskLayer = useCallback((map: google.maps.Map) => {
    // Clear existing
    polygonsRef.current.forEach(p => p.setMap(null));
    polygonsRef.current = [];

    CALI_COMUNAS.forEach(comuna => {
      const cfg = RISK_CONFIG[comuna.risk];
      const paths = comuna.coords.map(([lat, lng]) => ({ lat, lng }));

      const polygon = new google.maps.Polygon({
        paths,
        map,
        fillColor: cfg.fill,
        fillOpacity: cfg.fillOpacity,
        strokeColor: cfg.stroke,
        strokeOpacity: 0.5,
        strokeWeight: 1.2,
        clickable: true,
      });

      // Info window on click
      polygon.addListener("click", (e: google.maps.PolyMouseEvent) => {
        if (infoWindowRef.current) infoWindowRef.current.close();
        const iw = new google.maps.InfoWindow({
          content: `
            <div style="font-family:-apple-system,sans-serif;padding:4px 2px;min-width:180px">
              <div style="font-size:12px;font-weight:700;color:#18181b;margin-bottom:4px">${comuna.name}</div>
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${cfg.color}"></span>
                <span style="font-size:11px;font-weight:600;color:${cfg.color}">Riesgo ${cfg.label}</span>
              </div>
              <div style="font-size:11px;color:#6b7280;line-height:1.5;margin-bottom:6px">${comuna.description}</div>
              <div style="font-size:10px;color:#9ca3af">${comuna.barrios.join(", ")}</div>
            </div>
          `,
          position: e.latLng,
        });
        iw.open(map);
        infoWindowRef.current = iw;
      });

      polygonsRef.current.push(polygon);
    });
  }, []);

  // ── Draw heatmap layer ────────────────────────────────────────────────────
  const drawHeatmapLayer = useCallback((map: google.maps.Map) => {
    if (heatmapRef.current) { heatmapRef.current.setMap(null); }

    const weightMap: Record<RiskLevel, number> = { high: 1.0, medium: 0.65, low: 0.34, safe: 0.14 };
    const points: google.maps.visualization.WeightedLocation[] = [];

    CALI_COMUNAS.forEach(comuna => {
      const centroid = getComunaCentroid(comuna);
      const baseWeight = weightMap[comuna.risk];

      points.push({
        location: new google.maps.LatLng(centroid.lat, centroid.lng),
        weight: baseWeight * 1.35,
      });

      comuna.coords.forEach(([lat, lng], index) => {
        points.push({
          location: new google.maps.LatLng(lat, lng),
          weight: baseWeight * 0.68,
        });

        const next = comuna.coords[(index + 1) % comuna.coords.length];
        points.push({
          location: new google.maps.LatLng((lat + next[0]) / 2, (lng + next[1]) / 2),
          weight: baseWeight * 0.48,
        });
      });
    });

    heatmapRef.current = new google.maps.visualization.HeatmapLayer({
      data: points,
      map,
      radius: Math.max(42, Math.min(92, 118 - map.getZoom()! * 4)),
      opacity: 0.58,
      gradient: [
        "rgba(34,197,94,0)",
        "rgba(34,197,94,0.42)",
        "rgba(132,204,22,0.55)",
        "rgba(245,158,11,0.68)",
        "rgba(239,68,68,0.78)",
        "rgba(153,27,27,0.86)",
      ],
    });

    const zoomListener = map.addListener("zoom_changed", () => {
      if (!heatmapRef.current) return;
      const zoom = map.getZoom() ?? 13;
      heatmapRef.current.set("radius", Math.max(38, Math.min(94, 122 - zoom * 4)));
    });

    heatmapRef.current.addListener("map_changed", () => {
      if (!heatmapRef.current?.getMap()) google.maps.event.removeListener(zoomListener);
    });
  }, []);

  // ── Toggle layers ──────────────────────────────────────────────────────────
  const applyLayer = useCallback((mode: LayerMode, map: google.maps.Map) => {
    // Clear all
    polygonsRef.current.forEach(p => p.setMap(null));
    polygonsRef.current = [];
    if (heatmapRef.current) { heatmapRef.current.setMap(null); heatmapRef.current = null; }

    if (mode === "risk") drawRiskLayer(map);
    else if (mode === "heatmap") drawHeatmapLayer(map);
  }, [drawRiskLayer, drawHeatmapLayer]);

  // ── Fetch nearby businesses ───────────────────────────────────────────────
  const fetchNearby = useCallback(async (lat: number, lng: number) => {
    if (!google.maps.places?.Place?.searchNearby) return;
    if (!isInsideCaliBounds(lat, lng)) return;
    if (lastFetchPos.current) {
      const dist = haversineDistance(lastFetchPos.current.lat, lastFetchPos.current.lng, lat, lng);
      if (dist < 150) return;
    }
    lastFetchPos.current = { lat, lng };
    setLoadingPlaces(true);

    try {
      const { places: nearbyPlaces } = await google.maps.places.Place.searchNearby({
        fields: [
          "id",
          "displayName",
          "formattedAddress",
          "location",
          "rating",
          "userRatingCount",
          "types",
          "businessStatus",
          "priceLevel",
        ],
        locationRestriction: {
          center: { lat, lng },
          radius: 1000,
        },
        maxResultCount: 20,
        rankPreference: google.maps.places.SearchNearbyRankPreference.DISTANCE,
        language: "es",
        region: "CO",
      });

      const sorted = nearbyPlaces
        .filter(place => place.location)
        .map((place): NearbyPlace => ({
          place_id: place.id,
          name: place.displayName ?? "Negocio",
          vicinity: place.formattedAddress ?? place.shortFormattedAddress ?? "Dirección no disponible",
          rating: place.rating ?? undefined,
          user_ratings_total: place.userRatingCount ?? undefined,
          types: place.types ?? [],
          geometry: { location: place.location! },
          business_status: place.businessStatus ?? undefined,
        }))
        .sort((a, b) => {
          const da = haversineDistance(lat, lng, a.geometry.location.lat(), a.geometry.location.lng());
          const db = haversineDistance(lat, lng, b.geometry.location.lat(), b.geometry.location.lng());
          return da - db;
        });

      setPlaces(sorted);
    } catch (error) {
      console.error("Nearby places search error:", error);
    } finally {
      setLoadingPlaces(false);
    }
  }, []);

  // ── Init map ──────────────────────────────────────────────────────────────
  const initMap = async (lat: number, lng: number) => {
    if (!mapRef.current) return;

    await loadGoogleMapsViaProxy();

    const { Map } = await ensureGoogleMapsLibraries();

    const center = isInsideCaliBounds(lat, lng) ? { lat, lng } : CALI_CENTER;

    mapInstance.current = new Map(mapRef.current!, {
      center,
      zoom: 13,
      styles: MAP_STYLES,
      disableDefaultUI: true,
      gestureHandling: "greedy",
      minZoom: 11,
      maxZoom: 18,
      restriction: {
        latLngBounds: CALI_BOUNDS,
        strictBounds: true,
      },
    });

    infoWindowRef.current = new google.maps.InfoWindow();

    circleRef.current = new google.maps.Circle({
      map: mapInstance.current,
      center,
      fillColor: "#3b82f6",
      fillOpacity: 0.06,
      strokeColor: "#3b82f6",
      strokeOpacity: 0.18,
      strokeWeight: 1,
      radius: 40,
    });

    class UserDotOverlay extends google.maps.OverlayView {
      private div: HTMLDivElement | null = null;

      constructor(private pos: google.maps.LatLngLiteral, private map: google.maps.Map) {
        super();
        this.setMap(map);
      }

      onAdd() {
        this.div = document.createElement("div");
        this.div.style.position = "absolute";
        this.div.style.width = "20px";
        this.div.style.height = "20px";
        this.div.style.zIndex = "998";
        this.div.style.pointerEvents = "none";
        this.div.innerHTML = PIN_SVG;
        this.getPanes()!.overlayMouseTarget.appendChild(this.div);
      }

      draw() {
        const projection = this.getProjection();
        if (!projection || !this.div) return;

        const point = projection.fromLatLngToDivPixel(new google.maps.LatLng(this.pos.lat, this.pos.lng));
        if (!point) return;

        this.div.style.left = `${point.x}px`;
        this.div.style.top = `${point.y}px`;
        this.div.style.transform = "translate(-50%, -50%)";
      }

      setPosition(pos: google.maps.LatLngLiteral) {
        this.pos = pos;
        this.draw();
      }

      onRemove() {
        this.div?.parentNode?.removeChild(this.div);
        this.div = null;
      }
    }

    markerRef.current = new UserDotOverlay(center, mapInstance.current);

    // Badge overlay
    class BadgeOverlay extends google.maps.OverlayView {
      private div: HTMLDivElement | null = null;
      constructor(private pos: google.maps.LatLng, private map: google.maps.Map) {
        super();
        this.setMap(map);
      }
      onAdd() {
        this.div = document.createElement("div");
        this.div.style.position = "absolute";
        this.div.style.cursor = "default";
        this.div.style.zIndex = "999";
        this.div.innerHTML = `
          <div style="display:flex;align-items:center;gap:6px;padding:3px 10px 3px 3px;background:white;border-radius:40px;border:1px solid rgba(0,0,0,0.08);transform:translateY(-48px);white-space:nowrap">
            <div style="width:22px;height:22px;border-radius:50%;background:#eff6ff;border:2px solid #3b82f6;display:flex;align-items:center;justify-content:center;font-size:10px;">📍</div>
            <span style="font-family:-apple-system,sans-serif;font-size:12px;font-weight:700;color:#1e3a5f">Tú</span>
          </div>`;
        this.getPanes()!.floatPane.appendChild(this.div);
      }
      draw() {
        const projection = this.getProjection();
        if (!projection) return;
        const p = projection.fromLatLngToDivPixel(this.pos);
        if (this.div && p) {
          this.div.style.left = p.x + "px";
          this.div.style.top = p.y + "px";
          this.div.style.transform = "translateX(-50%)";
        }
      }
      setPosition(pos: google.maps.LatLng) { this.pos = pos; this.draw(); }
      onRemove() { this.div?.parentNode?.removeChild(this.div); }
    }

    badgeRef.current = new BadgeOverlay(new google.maps.LatLng(lat, lng), mapInstance.current);

    const caliBounds = new google.maps.LatLngBounds(
      { lat: CALI_BOUNDS.south, lng: CALI_BOUNDS.west },
      { lat: CALI_BOUNDS.north, lng: CALI_BOUNDS.east }
    );
    mapInstance.current.fitBounds(caliBounds, isMobile ? 44 : 72);

    // Draw initial layer
    applyLayer(layerMode, mapInstance.current);
    fetchNearby(lat, lng);
    detectComuna(lat, lng);
  };

  // ── Handle position ───────────────────────────────────────────────────────
  const handlePosition = async (position: GeolocationPosition) => {
    requestingLocationRef.current = false;
    setLocationError(null);
    setLocationDebug(null);
    const { latitude: lat, longitude: lng, accuracy } = position.coords;
    writeCachedLocation({ lat, lng, accuracy });
    setCoords({ lat, lng, accuracy });
    setStatus("tracking");

    if (!mapInstance.current) {
      try {
        await initMap(lat, lng);
      } catch (error) {
        console.error("Map initialization error:", error);
        requestingLocationRef.current = false;
        setLocationError("No pudimos cargar Google Maps. Revisa la configuración de la API key en el servidor.");
        setStatus("error");
      }
    } else {
      const pos = { lat, lng };
      mapInstance.current.panTo(pos);
      markerRef.current?.setPosition(pos);
      badgeRef.current?.setPosition(new google.maps.LatLng(lat, lng));
      circleRef.current?.setCenter(pos);
      circleRef.current?.setRadius(Math.min(accuracy, 200));
      fetchNearby(lat, lng);
      detectComuna(lat, lng);
    }
  };

  const handleError = (err: GeolocationPositionError) => {
    requestingLocationRef.current = false;
    setLocationDebug(`Error ${err.code}: ${err.message || "sin mensaje del navegador"}`);
    if (err.code === err.PERMISSION_DENIED) {
      setLocationError("Permiso de ubicación denegado. Actívalo en la configuración del navegador.");
      setStatus("denied");
      return;
    }

    if (err.code === err.TIMEOUT) {
      setLocationError("La ubicación tardó demasiado. Revisa que el GPS esté activo e inténtalo de nuevo.");
    } else {
      setLocationError("No pudimos obtener tu ubicación. Revisa que el GPS esté activo e inténtalo de nuevo.");
    }
    setStatus("error");
  };

  const requestLocation = useCallback((requestOptions?: { silent?: boolean }) => {
    if (requestingLocationRef.current) return;
    const silent = requestOptions?.silent ?? false;
    setLocationError(null);
    if (!silent) {
      setLocationDebug(
        `Origen: ${window.location.origin} | Seguro: ${window.isSecureContext ? "si" : "no"} | Geolocation: ${"geolocation" in navigator ? "si" : "no"
        }`
      );
    }

    if (!window.isSecureContext) {
      if (!silent) {
        setLocationError("El navegador solo permite pedir ubicación en HTTPS o localhost. Abre la app con HTTPS para probarla en el celular.");
        setStatus("error");
      }
      return;
    }

    if (!navigator.geolocation) {
      if (!silent) {
        setLocationError("Este navegador no soporta ubicación.");
        setStatus("error");
      }
      return;
    }

    requestingLocationRef.current = true;
    if (!silent) setStatus("loading");

    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
      pos => {
        handlePosition(pos);
        if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = navigator.geolocation.watchPosition(handlePosition, handleError, options);
      },
      err => {
        // If high accuracy failed/timeout, try once more with low accuracy
        if (err.code === err.TIMEOUT || err.code === err.POSITION_UNAVAILABLE) {
          navigator.geolocation.getCurrentPosition(
            pos => {
              handlePosition(pos);
              if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
              watchIdRef.current = navigator.geolocation.watchPosition(handlePosition, handleError, {
                ...options,
                enableHighAccuracy: false,
              });
            },
            silent ? () => {
              requestingLocationRef.current = false;
            } : handleError,
            { ...options, enableHighAccuracy: false }
          );
        } else {
          if (silent) {
            requestingLocationRef.current = false;
          } else {
            handleError(err);
          }
        }
      },
      options
    );
  }, []);

  // Re-apply layer when mode changes
  useEffect(() => {
    if (mapInstance.current) applyLayer(layerMode, mapInstance.current);
  }, [layerMode, applyLayer]);

  // Restore the last accepted location first, then refresh silently only when permission is already granted.
  useEffect(() => {
    let isMounted = true;

    const restoreLocation = async () => {
      const cached = readCachedLocation();

      if (cached) {
        setCoords({ lat: cached.lat, lng: cached.lng, accuracy: cached.accuracy });
        setStatus("tracking");
        detectComuna(cached.lat, cached.lng);

        if (!mapInstance.current) {
          try {
            await initMap(cached.lat, cached.lng);
          } catch (error) {
            console.error("Cached map initialization error:", error);
            if (isMounted) {
              setLocationError("No pudimos cargar Google Maps. Revisa la configuración de la API key en el servidor.");
              setStatus("error");
            }
          }
        }
      }

      try {
        if (navigator.permissions && navigator.permissions.query) {
          const result = await navigator.permissions.query({ name: "geolocation" });

          if (!isMounted) return;

          if (result.state === "granted") {
            requestLocation({ silent: Boolean(cached) });
          } else if (result.state === "denied" && !cached) {
            setStatus("denied");
            setLocationError("Permiso de ubicación denegado. Actívalo en la configuración de tu navegador.");
          }

          result.onchange = () => {
            if (result.state === "granted") {
              requestLocation({ silent: Boolean(readCachedLocation()) });
            } else if (result.state === "denied" && !readCachedLocation()) {
              setStatus("denied");
              setLocationError("Permiso de ubicación denegado. Actívalo en la configuración de tu navegador.");
            }
          };
        }
      } catch (error) {
        if (!cached && hasLocationOptIn()) {
          setStatus("idle");
        }
      }
    };

    restoreLocation();

    return () => {
      isMounted = false;
    };
  }, [detectComuna, requestLocation]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  // ── Voice narration — reacts to every coords update ───────────────────────
  // Using refs for speak/muted to avoid stale closure in the effect callback
  const speakRef = useRef(speak);
  useEffect(() => { speakRef.current = speak; }, [speak]);

  const hasWelcomed = useRef(false);

  useEffect(() => {
    if (!coords || voiceMuted) return;
    const { lat, lng } = coords;

    // 1. Welcome on very first GPS fix (immediate fallback + async AI version)
    if (!hasWelcomed.current) {
      hasWelcomed.current = true;

      // Immediate fallback — speaks right away without waiting for the API
      const fallbackWelcome = "Bienvenido a Cali, la sucursal del cielo. Voy a acompañarte por la ciudad, parce.";
      speakRef.current({ type: "welcome", text: fallbackWelcome, title: "Bienvenida a Cali", icon: "🌺" });

      // Async AI version — if it returns, queues after the fallback
      fetchNarration(
        "El visitante acaba de activar CaliGuía y está comenzando a explorar la ciudad de Cali.",
        "welcome"
      ).then(text => {
        if (text && text !== fallbackWelcome) {
          speakRef.current({ type: "welcome", text, title: "Cali te espera", icon: "🌺" });
        }
      }).catch(() => null);
    }

    // 2. Movement threshold — skip if not moved enough
    const movedEnough = !lastNarratedPos.current ||
      haversineDistance(lastNarratedPos.current.lat, lastNarratedPos.current.lng, lat, lng) > 80;
    if (!movedEnough) return;
    lastNarratedPos.current = { lat, lng };

    // 3. Danger zone check (cooldown: 3 min)
    if (!voiceMuted) {
      const dangerComuna = CALI_COMUNAS.find(c => c.risk === "high" && pointInPolygon(lat, lng, c.coords));
      if (dangerComuna) {
        const now = Date.now();
        if (now - lastDangerNarration.current > 3 * 60 * 1000) {
          lastDangerNarration.current = now;
          const fallbackDanger = `Ojo, parce. Estás entrando a ${dangerComuna.name}. Mantente atento y por favor cuídate.`;
          speakRef.current({ type: "danger", text: fallbackDanger, title: `⚠️ ${dangerComuna.name}`, icon: "⚠️" });
          fetchNarration(
            `El usuario está ingresando a ${dangerComuna.name}, una zona de alto riesgo en Cali. ${dangerComuna.description}`,
            "danger"
          ).then(text => {
            if (text) speakRef.current({ type: "danger", text, title: `⚠️ ${dangerComuna.name}`, icon: "⚠️" });
          }).catch(() => null);
        }
      }
    }

    // 4. Landmark proximity (narrated once per session)
    for (const landmark of CALI_LANDMARKS) {
      if (spokenLandmarks.current.has(landmark.name)) continue;
      const dist = haversineDistance(lat, lng, landmark.lat, landmark.lng);
      if (dist <= landmark.radiusM) {
        spokenLandmarks.current.add(landmark.name);
        fetchNarration(landmark.prompt, landmark.type).then(text => {
          if (text) speakRef.current({ type: landmark.type, text, title: landmark.name, icon: landmark.icon });
        }).catch(() => null);
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, voiceMuted]);

  // ── Drawer ────────────────────────────────────────────────────────────────
  const getDrawerBounds = () => ({
    min: 92,
    middle: 340,
    max: window.innerHeight - 130, // Permite subir casi hasta el tope, deteniéndose antes de los controles superiores
  });

  const clampDrawerHeight = (height: number) => {
    const { min, max } = getDrawerBounds();
    return Math.min(Math.max(height, min), max);
  };

  const onDragStart = (clientY: number) => {
    isDragging.current = true;
    setIsDrawerDragging(true);
    dragStartY.current = clientY;
    drawerStartH.current = drawerCurrentH.current;
  };

  const onDragMove = (clientY: number) => {
    if (!isDragging.current) return;
    const delta = dragStartY.current - clientY;
    const next = clampDrawerHeight(drawerStartH.current + delta);
    drawerCurrentH.current = next;
    setDrawerH(next);
  };

  const onDragEnd = () => {
    isDragging.current = false;
    setIsDrawerDragging(false);

    const { min, middle, max } = getDrawerBounds();
    const current = drawerCurrentH.current;
    const snap = current < 170 ? min : current > window.innerHeight * 0.58 ? max : middle;
    drawerCurrentH.current = snap;
    setDrawerH(snap);
  };

  const onDrawerPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onDragStart(event.clientY);
  };

  const onDrawerPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    event.preventDefault();
    event.stopPropagation();
    onDragMove(event.clientY);
  };

  const onDrawerPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onDragEnd();
  };

  // ── Panel ─────────────────────────────────────────────────────────────────
  const renderPanelContent = () => (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tabs + voice mute */}
      <div className="flex items-center gap-1 px-4 pt-2 pb-0 shrink-0">
        {(["places", "zones", "experience"] as const).map(tab => (
          <motion.button
            key={tab}
            onClick={() => setActiveTab(tab)}
            whileTap={{ scale: 0.97 }}
            className={`relative px-2 py-1.5 rounded-lg text-[10px] font-bold transition-colors flex-1 flex items-center justify-center gap-1 ${activeTab === tab ? "text-blue-600" : "text-zinc-400 hover:text-zinc-600"
              }`}
          >
            <span className="truncate">{tab === "places" ? "Negocios" : tab === "zones" ? "Zonas" : "Experiencia"}</span>
            {tab === "experience" && experienceLog.length > 0 && (
              <span className="shrink-0 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-blue-500 text-white text-[8px] font-black">
                {experienceLog.length}
              </span>
            )}
            {activeTab === tab && (
              <motion.span
                layoutId="panel-tab-active"
                className="absolute inset-0 -z-10 rounded-lg bg-blue-500/9"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
          </motion.button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {activeTab === "places" && (
          <motion.div
            key="places"
            className="flex min-h-0 flex-1 flex-col"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-black/5 shrink-0">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Cercanos</p>
                <p className="text-[14px] font-semibold text-zinc-800 mt-0.5">
                  {loadingPlaces ? "Buscando..." : `${places.length} negocios`}
                </p>
              </div>
              {coords && (
                <div className="text-right">
                  <p className="text-[9px] font-medium uppercase tracking-[0.07em] text-zinc-400">Radio</p>
                  <p className="text-[13px] font-semibold text-blue-500">1 km</p>
                </div>
              )}
            </div>

            {loadingPlaces && places.length === 0 && (
              <div className="flex flex-col gap-3 px-5 py-4 shrink-0">
                {[1, 2, 3].map(i => (
                  <motion.div
                    key={i}
                    className="flex gap-3 items-center animate-pulse"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                  >
                    <div className="w-9 h-9 rounded-xl bg-zinc-100 shrink-0" />
                    <div className="flex flex-col gap-1.5 flex-1">
                      <div className="h-3 bg-zinc-100 rounded-full w-2/3" />
                      <div className="h-2.5 bg-zinc-100 rounded-full w-1/2" />
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {(!loadingPlaces || places.length > 0) && (
              <div className="overflow-y-auto overscroll-contain flex-1 px-4 py-2">
                {places.length === 0 && (
                  <div className="text-[12px] text-zinc-400 text-center py-12 px-6">
                    {status === "tracking" ? "Sin negocios en el área." : status === "loading" ? "Buscando tu ubicación en Cali..." : "Comparte tu ubicación para ver negocios cercanos."}
                  </div>
                )}
                <motion.div className="flex flex-col gap-1" layout>
                  {places.map((place) => {
                    const dist = coords
                      ? Math.round(haversineDistance(coords.lat, coords.lng, place.geometry.location.lat(), place.geometry.location.lng()))
                      : null;
                    return (
                      <motion.div
                        key={place.place_id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        whileTap={{ scale: 0.995 }}
                        transition={{ duration: 0.16 }}
                        className="flex items-start gap-3 px-3 py-2.5 rounded-xl transition-colors hover:bg-zinc-50 cursor-pointer"
                      >
                        <div className="w-9 h-9 rounded-xl bg-blue-500/[0.07] border border-blue-500/10 flex items-center justify-center text-base shrink-0">
                          {getCategoryIcon(place.types)}
                        </div>
                        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-zinc-800 truncate">{place.name}</p>
                          <p className="text-[11px] text-zinc-400 truncate">{place.vicinity}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-medium text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded-md">
                              {getCategoryLabel(place.types)}
                            </span>
                            {place.rating && (
                              <span className="text-[10px] font-medium text-amber-600">
                                ★ {place.rating.toFixed(1)}
                                {place.user_ratings_total ? ` (${place.user_ratings_total > 999 ? (place.user_ratings_total / 1000).toFixed(1) + "k" : place.user_ratings_total})` : ""}
                              </span>
                            )}
                            {place.business_status && place.business_status !== "OPERATIONAL" && (
                              <span className="text-[10px] font-medium text-red-400">Cerrado</span>
                            )}
                          </div>
                        </div>
                        {dist !== null && (
                          <div className="text-[11px] font-semibold text-zinc-400 shrink-0 pt-0.5">
                            {dist < 1000 ? `${dist}m` : `${(dist / 1000).toFixed(1)}km`}
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </motion.div>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === "experience" && (
          <motion.div
            key="experience"
            className="flex h-full min-h-0 flex-col overflow-hidden"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-black/5 shrink-0">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Tu experiencia</p>
                <p className="text-[14px] font-semibold text-zinc-800 mt-0.5">
                  {experienceLog.length > 0
                    ? `${experienceLog.length} ${experienceLog.length === 1 ? "lugar visitado" : "lugares visitados"}`
                    : "Explorando Cali"}
                </p>
              </div>
              {experienceLog.length > 0 && (
                <div className="text-right">
                  <p className="text-[9px] font-medium uppercase tracking-[0.07em] text-zinc-400">Intereses</p>
                  <p className="text-[12px] font-semibold text-blue-500">
                    {selectedInterests.map(i => TOURISM_INTERESTS[i]?.label).filter(Boolean).join(" · ")}
                  </p>
                </div>
              )}
            </div>

            {/* Current narration banner */}
            <AnimatePresence initial={false}>
              {currentNarration && (
                <motion.div
                  key={currentNarration.id}
                  className="mx-4 mt-3 shrink-0"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  <div
                    className="rounded-xl px-4 py-3 border"
                    style={{
                      background: currentNarration.type === "danger"
                        ? "rgba(239,68,68,0.06)" : "rgba(59,130,246,0.06)",
                      borderColor: currentNarration.type === "danger"
                        ? "rgba(239,68,68,0.2)" : "rgba(59,130,246,0.15)",
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">{currentNarration.icon ?? "🎙️"}</span>
                      <p className="text-[11px] font-bold uppercase tracking-[0.07em]"
                        style={{ color: currentNarration.type === "danger" ? "#dc2626" : "#2563eb" }}>
                        {narratorSpeaking ? "Hablando ahora" : "Último mensaje"}
                      </p>
                      {narratorSpeaking && (
                        <div className="flex items-center gap-[2px] ml-auto">
                          {[3, 5, 4, 6, 3].map((h, i) => (
                            <div key={i} className="w-[2px] rounded-full"
                              style={{
                                height: `${h}px`,
                                background: currentNarration.type === "danger" ? "#ef4444" : "#3b82f6",
                                animation: `pulse-bar ${0.4 + i * 0.1}s ease-in-out infinite alternate`,
                              }} />
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-[12px] text-zinc-700 leading-relaxed">{currentNarration.text}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Experience log */}
            <div className="overflow-y-auto overscroll-contain flex-1 px-4 py-3">
              {experienceLog.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/8 border border-blue-500/10 flex items-center justify-center text-2xl">
                    🗺️
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-zinc-600">Comienza a explorar</p>
                    <p className="text-[11px] text-zinc-400 mt-1 max-w-[200px] leading-relaxed">
                      A medida que te muevas por Cali, CaliGuía te irá narrando los lugares que vayas encontrando.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 justify-center mt-1">
                    {selectedInterests.map(id => (
                      <span key={id} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/8 text-blue-600 border border-blue-500/12">
                        {TOURISM_INTERESTS[id]?.label}
                      </span>
                    ))}
                  </div>
                  {travelGroup && (
                    <p className="text-[10px] text-zinc-400">
                      {travelGroup === "solo" ? "Solo" : travelGroup === "pareja" ? "En pareja" : travelGroup === "familia" ? "En familia" : "En grupo"}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400 mb-2">
                    {selectedInterests.map(i => TOURISM_INTERESTS[i]?.label).filter(Boolean).join(" · ")} · {travelGroup === "solo" ? "Solo" : travelGroup === "pareja" ? "En pareja" : travelGroup === "familia" ? "En familia" : "En grupo"}
                  </p>
                  {experienceLog.map((item, idx) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.03, duration: 0.16 }}
                      className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border ${item.type === "danger"
                        ? "bg-red-50/60 border-red-100"
                        : "bg-zinc-50 border-zinc-100"
                        }`}
                    >
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0"
                        style={{
                          background: item.type === "danger" ? "rgba(239,68,68,0.08)" : "rgba(59,130,246,0.07)",
                          border: item.type === "danger" ? "1px solid rgba(239,68,68,0.15)" : "1px solid rgba(59,130,246,0.1)",
                        }}>
                        {item.icon ?? "📍"}
                      </div>
                      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-zinc-800 truncate">{item.title ?? item.type}</p>
                        <p className="text-[10px] text-zinc-500 leading-relaxed line-clamp-2">{item.text}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === "zones" && (
          <motion.div
            key="zones"
            className="flex h-full min-h-0 flex-col overflow-hidden"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {/* Current zone banner */}
            <AnimatePresence initial={false}>
              {currentComuna && (
                <motion.div
                  className="mx-4 mt-3 shrink-0"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                >
                  <div
                    className="rounded-xl px-4 py-3 border"
                    style={{
                      background: `${RISK_CONFIG[currentComuna.risk].fill}18`,
                      borderColor: `${RISK_CONFIG[currentComuna.risk].stroke}30`,
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-zinc-500">Tu zona actual</p>
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: `${RISK_CONFIG[currentComuna.risk].fill}25`, color: RISK_CONFIG[currentComuna.risk].color }}
                      >
                        Riesgo {RISK_CONFIG[currentComuna.risk].label}
                      </span>
                    </div>
                    <p className="text-[14px] font-bold text-zinc-800">{currentComuna.name}</p>
                    <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">{currentComuna.description}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Legend */}
            <div className="px-5 pt-4 pb-2 shrink-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400 mb-3">Leyenda</p>
              <div className="grid grid-cols-2 gap-2">
                {(Object.entries(RISK_CONFIG) as [RiskLevel, typeof RISK_CONFIG[RiskLevel]][]).map(([level, cfg]) => (
                  <div key={level} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: cfg.fill, border: `1px solid ${cfg.stroke}` }} />
                    <span className="text-[11px] font-medium text-zinc-600">Riesgo {cfg.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Comunas list */}
            <div className="overflow-y-auto overscroll-contain flex-1 px-4 pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400 mb-2 mt-2">Las 22 Comunas</p>
              <div className="flex flex-col gap-1">
                {CALI_COMUNAS.map((c, index) => (
                  <motion.div
                    key={c.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index * 0.012, 0.18), duration: 0.16 }}
                    whileTap={{ scale: 0.995 }}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors cursor-pointer ${currentComuna?.id === c.id ? "bg-blue-500/[0.07]" : "hover:bg-zinc-50"
                      }`}
                    onClick={() => {
                      if (mapInstance.current) {
                        const centroid = getComunaCentroid(c);
                        mapInstance.current.panTo(centroid);
                        mapInstance.current.setZoom(15);
                        setCurrentComuna(c);
                      }
                    }}
                  >
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: RISK_CONFIG[c.risk].color }} />
                    <div className="flex flex-col flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-zinc-700 truncate">{c.name}</p>
                      <p className="text-[10px] text-zinc-400 truncate">{c.barrios.slice(0, 2).join(", ")}</p>
                    </div>
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0"
                      style={{ background: `${RISK_CONFIG[c.risk].fill}22`, color: RISK_CONFIG[c.risk].color }}
                    >
                      {RISK_CONFIG[c.risk].label.toUpperCase()}
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
      <style>{`
        @keyframes pulse-bar {
          from { transform: scaleY(0.5); opacity: 0.6; }
          to   { transform: scaleY(1.4); opacity: 1; }
        }
      `}</style>
    </div>
  );

  const aiContext = coords
    ? `El usuario está en lat ${coords.lat.toFixed(5)}, lng ${coords.lng.toFixed(5)}. 
       ${currentComuna ? `Zona: ${currentComuna.name} — Riesgo ${RISK_CONFIG[currentComuna.risk].label}. ${currentComuna.description}` : ""}
       Negocios cercanos: ${places.slice(0, 5).map(p => p.name).join(", ")}.`
    : "El usuario aún no ha compartido su ubicación.";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative w-full h-dvh overflow-hidden bg-[#f7f6f3] font-sans flex">

      <div className="relative flex-1 h-full overflow-hidden bg-zinc-950">
        <AnimatePresence>
          {experienceMode === "ar" && (
            <motion.div
              key="ar-camera"
              className="absolute inset-0 z-0 bg-zinc-950"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.24 }}
            >
              <Webcam
                ref={webcamRef}
                audio={false}
                mirrored={arFacingMode === "user"}
                playsInline
                screenshotFormat="image/jpeg"
                videoConstraints={{
                  facingMode: { ideal: arFacingMode },
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                }}
                onUserMedia={() => {
                  setArCameraError(null);
                  window.setTimeout(() => applyCameraZoom(arZoomLevel), 250);
                }}
                onUserMediaError={() => setArCameraError("No pudimos acceder a la cámara. Revisa permisos del navegador.")}
                className="h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0,rgba(0,0,0,0.10)_58%,rgba(0,0,0,0.34)_100%)]" />
              <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-linear-to-b from-black/30 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-linear-to-t from-black/35 to-transparent" />
              <div className="pointer-events-none absolute left-4 top-24 rounded-full border border-white/20 bg-black/25 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/85 backdrop-blur-md md:left-6">
                AR
              </div>
              <div className="absolute right-4 top-24 flex items-center gap-2 md:right-6">
                <button
                  type="button"
                  onClick={() => setArFacingMode(mode => (mode === "environment" ? "user" : "environment"))}
                  className="flex h-10 items-center gap-2 rounded-full border border-white/20 bg-black/25 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/90 shadow-lg shadow-black/20 backdrop-blur-md transition-colors hover:bg-black/35"
                  title="Voltear cámara"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12a9 9 0 0 1-15.5 6.2" />
                    <path d="M3 12a9 9 0 0 1 15.5-6.2" />
                    <path d="M16 6h3V3" />
                    <path d="M8 18H5v3" />
                  </svg>
                  <span>Flip</span>
                </button>
                <button
                  type="button"
                  onClick={swapCameraZoom}
                  className="flex h-10 min-w-14 items-center justify-center rounded-full border border-white/20 bg-black/25 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/90 shadow-lg shadow-black/20 backdrop-blur-md transition-colors hover:bg-black/35 disabled:opacity-45"
                  title="Cambiar zoom"
                  disabled={!arZoomSupported}
                >
                  x{arZoomLevel === 0.05 ? "0.05" : arZoomLevel}
                </button>
              </div>
              {arCameraError && (
                <div className="absolute inset-0 flex items-center justify-center px-8 text-center">
                  <div className="max-w-[280px] rounded-2xl border border-white/15 bg-black/45 px-4 py-3 text-[12px] font-medium leading-relaxed text-white backdrop-blur-xl">
                    {arCameraError}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div
          ref={mapRef}
          className={`absolute inset-0 z-0 h-full w-full transition-opacity duration-300 ${experienceMode === "ar" ? "pointer-events-none opacity-0" : "opacity-100"
            }`}
        />
        <AIFloatingIsland
          context={aiContext}
          isMuted={voiceMuted}
          onToggleMute={() => setVoiceMuted(m => !m)}
        />

        {/* Floating Layer Toggles - Visible even with drawer open */}
        {experienceMode !== "ar" && (
          <div className="absolute right-4 top-20 z-20 flex items-center gap-1 rounded-full bg-white/80 p-0.5 backdrop-blur-md border border-black/5 shadow-lg shadow-black/5 md:left-1/2 md:-translate-x-1/2 md:right-auto md:p-1">
            {(["risk", "heatmap", "none"] as LayerMode[]).map(mode => (
              <motion.button
                key={mode}
                onClick={() => setLayerMode(mode)}
                whileTap={{ scale: 0.95 }}
                className={`px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-tight transition-all md:px-3 md:py-1.5 md:text-[10px] md:tracking-wider ${layerMode === mode
                  ? "bg-blue-500 text-white shadow-sm shadow-blue-500/20"
                  : "text-zinc-500 hover:bg-black/5"
                  }`}
              >
                {mode === "risk" ? "Comunas" : mode === "heatmap" ? "Heatmap" : "Oculto"}
              </motion.button>
            ))}
          </div>
        )}
      </div>

      {/* Desktop sidebar */}
      <div className="hidden md:flex w-[340px] h-full bg-[#f7f6f3] border-l border-black/6 flex-col shrink-0 z-10">
        {renderPanelContent()}
      </div>

      {/* Mobile drawer */}
      <div
        className="md:hidden absolute bottom-0 left-0 right-0 z-20 flex flex-col bg-[#f7f6f3] rounded-t-2xl border-t border-black/6 shadow-[0_-18px_45px_rgba(15,23,42,0.08)] will-change-[height]"
        style={{
          height: `${drawerH}px`,
          paddingBottom: "env(safe-area-inset-bottom)",
          transition: isDrawerDragging ? "none" : "height 0.25s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        <div
          className="flex h-10 shrink-0 touch-none select-none items-center justify-center cursor-grab active:cursor-grabbing"
          onPointerDown={onDrawerPointerDown}
          onPointerMove={onDrawerPointerMove}
          onPointerUp={onDrawerPointerEnd}
          onPointerCancel={onDrawerPointerEnd}
          onLostPointerCapture={() => {
            if (isDragging.current) onDragEnd();
          }}
        >
          <div className="w-9 h-1 rounded-full bg-zinc-300" />
        </div>
        <div className="min-h-0 flex-1 touch-pan-y overscroll-contain">
          {renderPanelContent()}
        </div>
      </div>


      {(status === "idle" || status === "loading" || status === "error") && !coords && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-[#f7f6f3]/95 px-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-500 text-2xl text-white shadow-lg shadow-blue-500/20">
            📍
          </div>
          <div>
            <p className="text-[16px] font-bold text-zinc-850">Activa tu ubicación</p>
            <p className="mt-2 max-w-[280px] text-[13px] leading-relaxed text-zinc-500">
              CaliGuía usa tu posición para mostrar negocios cercanos y tu zona actual.
            </p>
          </div>
          <button
            type="button"
            onClick={() => requestLocation()}
            onPointerUp={() => requestLocation()}
            onTouchEnd={() => requestLocation()}
            disabled={status === "loading"}
            className="touch-manipulation rounded-full bg-blue-500 px-5 py-3 text-[13px] font-bold text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-blue-600 disabled:cursor-wait disabled:bg-blue-400"
          >
            {status === "loading" ? "Solicitando permiso..." : "Usar mi ubicación"}
          </button>
          {locationError && (
            <p className="max-w-[280px] text-[12px] leading-relaxed text-red-500">
              {locationError}
            </p>
          )}
          {locationDebug && (
            <p className="max-w-[320px] wrap-break-word rounded-xl bg-white/70 px-3 py-2 text-[10px] leading-relaxed text-zinc-500">
              {locationDebug}
            </p>
          )}
        </div>
      )}

      {status === "denied" && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-[#f7f6f3]">
          <p className="text-[13px] text-red-500 font-medium text-center max-w-[260px] leading-relaxed">
            {locationError ?? "Acceso denegado. Actívalo en la configuración de tu navegador y recarga la página."}
          </p>
          <button
            type="button"
            onClick={() => requestLocation()}
            onPointerUp={() => requestLocation()}
            onTouchEnd={() => requestLocation()}
            className="touch-manipulation rounded-full bg-blue-500 px-5 py-3 text-[13px] font-bold text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-blue-600"
          >
            Intentar de nuevo
          </button>
          {locationDebug && (
            <p className="max-w-[320px] wrap-break-word rounded-xl bg-white/70 px-3 py-2 text-[10px] leading-relaxed text-zinc-500">
              {locationDebug}
            </p>
          )}
        </div>
      )}
      {/* ── Voice Permission Modal ── */}
      <AnimatePresence>
        {voicePreference === "unknown" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-100 flex items-center justify-center bg-black/40 backdrop-blur-sm px-6"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="w-full max-w-sm bg-white rounded-3xl p-8 shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                  <line x1="8" y1="22" x2="16" y2="22" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-zinc-800 mb-3">¿Activar guía de voz?</h2>
              <p className="text-[14px] text-zinc-500 leading-relaxed mb-8">
                CaliGuía puede narrarte la historia y curiosidades de los lugares que visites. ¿Deseas activar el audio?
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => unlockSpeech(true)}
                  className="w-full py-4 bg-blue-500 text-white rounded-2xl font-bold text-[15px] shadow-lg shadow-blue-500/25 active:scale-[0.98] transition-transform"
                >
                  Sí, activar audio
                </button>
                <button
                  onClick={() => {
                    unlockSpeech(false);
                    setVoiceMuted(true);
                  }}
                  className="w-full py-3 text-zinc-400 font-semibold text-[14px] hover:text-zinc-600"
                >
                  No, tal vez luego
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
