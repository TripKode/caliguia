"use client";

import { useEffect, useRef, useState, useCallback, type PointerEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Webcam from "react-webcam";
import { AIFloatingIsland } from "../components/island/Island";
import { useExperience } from "../components/providers/ExperienceProvider";
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
  description: string;
  history: string;
  radiusM: number;
  place_id?: string;
  images: string[];
}

// CALI_LANDMARKS now starts empty and populates dynamically
const INITIAL_LANDMARKS: Landmark[] = [];

interface CaliEvent {
  id: string;
  title: string;
  organizer: string;
  category: string;
  time: string;
  location: string;
  description: string;
  icon: string;
}

const CALI_EVENTS_TODAY: CaliEvent[] = [
  {
    id: "e1",
    title: "Festival de Salsa en el Obrero",
    organizer: "Secretaría de Cultura de Cali",
    category: "Música / Salsa",
    time: "18:00 - 22:00",
    location: "Parque del Barrio Obrero",
    description: "Orquestas en vivo y exhibición de baile estilo caleño. ¡Entrada libre!",
    icon: "",
  },
  {
    id: "e2",
    title: "Tarde de Jazz en el Bulevar",
    organizer: "Teatro Municipal Enrique Buenaventura",
    category: "Música / Jazz",
    time: "16:30 - 19:00",
    location: "Bulevar del Río (Cerca a la Ermita)",
    description: "Sesiones de improvisación con artistas locales e invitados internacionales.",
    icon: "",
  },
  {
    id: "e3",
    title: "Ruta del Sabor: Galería Alameda",
    organizer: "Asociación de Cocineras Tradicionales",
    category: "Gastronomía",
    time: "11:00 - 15:00",
    location: "Galería Alameda - Pasillo Central",
    description: "Degustación de platos típicos del Pacífico: Arroz de Mariscos y Lulada.",
    icon: "",
  },
  {
    id: "e4",
    title: "Cine bajo las Estrellas",
    organizer: "Museo La Tertulia",
    category: "Cine",
    time: "19:30 - 21:30",
    location: "Jardines de La Tertulia",
    description: "Proyección de cortos colombianos premiados en finales internacionales.",
    icon: "",
  }
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
type ActiveTab = "local" | "places" | "zones" | "experience";

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

// Mapeo de riesgo basado en el número oficial de comuna
const COMUNA_RISK_MAP: Record<number, { risk: "safe" | "medium" | "high" | "low"; description: string }> = {
  1: { risk: "high", description: "Zona occidental, ladera. Precaución en zonas altas." },
  2: { risk: "safe", description: "Zona norte, residencial y gastronómica de alto nivel." },
  3: { risk: "medium", description: "Centro histórico y cultural. Comercio activo." },
  4: { risk: "medium", description: "Zona norte-centro, residencial tradicional." },
  5: { risk: "medium", description: "Zona norte-oriental, mezcla industrial y residencial." },
  6: { risk: "high", description: "Nororiente. Se recomienda transitar por vías principales." },
  7: { risk: "high", description: "Nororiente. Zona con alta densidad poblacional." },
  8: { risk: "medium", description: "Centro-oriente, comercial y base aérea." },
  9: { risk: "low", description: "Centro comercial denso y barrios tradicionales." },
  10: { risk: "medium", description: "Corazón comercial de la ciudad." },
  11: { risk: "low", description: "Zona residencial del sur-oriente." },
  12: { risk: "medium", description: "Sur-oriente, zona residencial estrato medio-bajo." },
  13: { risk: "high", description: "Distrito de Aguablanca. Alta precaución." },
  14: { risk: "high", description: "Distrito de Aguablanca. Alta precaución." },
  15: { risk: "high", description: "Distrito de Aguablanca. Zona crítica." },
  16: { risk: "medium", description: "Sur, zona de clínicas y barrios residenciales." },
  17: { risk: "low", description: "Sur, zona universitaria y residencial de nivel alto." },
  18: { risk: "medium", description: "Ladera sur, zona mixta." },
  19: { risk: "safe", description: "Zona sur-occidental, deportiva y residencial segura." },
  20: { risk: "high", description: "Siloé y ladera occidental. Alta precaución." },
  21: { risk: "high", description: "Extremo nororiente. Zona vulnerable." },
  22: { risk: "safe", description: "Pance y Ciudad Jardín. La zona más exclusiva y segura." },
};

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

export default function Home() {
  const { experienceMode, selectedInterests, travelGroup } = useExperience();
  const [comunas, setComunas] = useState<ComunaData[]>([]);

  // Fetch Comunas from IDESC
  useEffect(() => {
    const fetchComunas = async () => {
      const CACHE_KEY = "caliguia_comunas_data";
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          setComunas(JSON.parse(cached));
          return;
        } catch (e) {
          console.error("Cache error", e);
        }
      }

      try {
        const res = await fetch("/api/comunas");
        if (!res.ok) return;
        const data = await res.json();

        const transformed: ComunaData[] = data.features.map((f: any) => {
          const id = parseInt(f.properties.comuna);
          const riskInfo = COMUNA_RISK_MAP[id] || { risk: "medium", description: "Información en proceso." };
          const name = f.properties.nombre ? (f.properties.nombre.includes("Comuna") ? f.properties.nombre : `Comuna ${id} — ${f.properties.nombre}`) : `Comuna ${id}`;

          let coords: [number, number][] = [];
          if (f.geometry.type === "Polygon") {
            coords = f.geometry.coordinates[0].map((c: any) => [c[1], c[0]]);
          } else if (f.geometry.type === "MultiPolygon") {
            // Flatten first polygon of multipolygon for simplicity in this view
            coords = f.geometry.coordinates[0][0].map((c: any) => [c[1], c[0]]);
          }

          return { id, name, risk: riskInfo.risk, description: riskInfo.description, barrios: [], coords };
        });

        setComunas(transformed);
        localStorage.setItem(CACHE_KEY, JSON.stringify(transformed));
      } catch (err) {
        console.error("Fetch Comunas failed:", err);
      }
    };
    fetchComunas();
  }, []);

  const CALI_COMUNAS = comunas;
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
  const routePolylineRef = useRef<google.maps.Polyline | null>(null);

  const dragStartY = useRef<number>(0);
  const drawerStartH = useRef<number>(0);
  const isDragging = useRef(false);
  const drawerCurrentH = useRef(280);

  const [status, setStatus] = useState<Status>("idle");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationDebug, setLocationDebug] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [localLandmarks, setLocalLandmarks] = useState<Landmark[]>([]);
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const [loadingLandmarks, setLoadingLandmarks] = useState(false);
  const [drawerH, setDrawerH] = useState(280);
  const [isDrawerDragging, setIsDrawerDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [layerMode, setLayerMode] = useState<LayerMode>("none");
  const [currentComuna, setCurrentComuna] = useState<ComunaData | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("local");
  const [expandedLandmark, setExpandedLandmark] = useState<string | null>(null);
  const [currentImageIdx, setCurrentImageIdx] = useState(0);
  const [arCameraError, setArCameraError] = useState<string | null>(null);
  const [arFacingMode, setArFacingMode] = useState<"environment" | "user">("environment");
  const [arZoomLevel, setArZoomLevel] = useState<ArZoomLevel>(0.05);
  const [arZoomSupported, setArZoomSupported] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [showZoneAlert, setShowZoneAlert] = useState(true);
  const lastZoneId = useRef<number | null>(null);

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
  }, [CALI_COMUNAS]);

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
  }, [CALI_COMUNAS]);

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
  }, [CALI_COMUNAS]);

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

  // ── Dynamic Landmark Discovery ─────────────────────────────────────────────
  const fetchWikipediaSummary = async (title: string): Promise<{ extract: string; images: string[] } | null> => {
    try {
      const searchUrl = `https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(title + " Cali")}&format=json&origin=*`;
      const searchResp = await fetch(searchUrl);
      const searchData = await searchResp.json();

      if (!searchData.query?.search?.length) return null;

      const bestTitle = searchData.query.search[0].title;
      const summaryUrl = `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(bestTitle)}`;
      const mediaUrl = `https://es.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(bestTitle)}`;

      const [summaryResp, mediaResp] = await Promise.all([
        fetch(summaryUrl),
        fetch(mediaUrl).catch(() => null)
      ]);

      if (!summaryResp.ok) return null;
      const summaryData = await summaryResp.json();

      let images: string[] = [];
      if (summaryData.originalimage?.source) images.push(summaryData.originalimage.source);

      if (mediaResp?.ok) {
        const mediaData = await mediaResp.json();
        const extraImages = mediaData.items
          ?.filter((item: any) => item.type === "image")
          ?.map((item: any) => item.srcset?.[0]?.src || item.src)
          ?.filter((src: string) => src && !images.includes(src))
          ?.slice(0, 5) || [];
        images = [...images, ...extraImages];
      }

      return {
        extract: summaryData.extract,
        images,
      };
    } catch {
      return null;
    }
  };

  const fetchLocalLandmarks = useCallback(async (lat: number, lng: number) => {
    if (typeof google === "undefined" || !google.maps.places?.Place?.searchNearby) return;
    if (!isInsideCaliBounds(lat, lng)) return;

    setLoadingLandmarks(true);
    try {
      const { places: foundPlaces } = await google.maps.places.Place.searchNearby({
        fields: ["id", "displayName", "location", "types", "editorialSummary"],
        locationRestriction: { center: { lat, lng }, radius: 1000 },
        includedPrimaryTypes: ["tourist_attraction", "museum", "church", "art_gallery", "historical_landmark"],
        maxResultCount: 15,
        language: "es",
        region: "CO",
      });

      const newLandmarks: Landmark[] = await Promise.all(foundPlaces.map(async (p): Promise<Landmark> => {
        const name = p.displayName ?? "Lugar Histórico";
        const typeLabel = p.types?.includes("museum") ? "Museo" : p.types?.includes("church") ? "Patrimonio Religioso" : "Sitio Histórico";

        let history = p.editorialSummary;
        let images: string[] = [];

        const wikiData = await fetchWikipediaSummary(name);
        if (wikiData) {
          history = wikiData.extract;
          images = wikiData.images;
        }

        if (!history) {
          history = `${typeLabel} representativo de la zona de ${currentComuna?.name || "Cali"}, fundamental para la identidad y el patrimonio de la capital del Valle.`;
        }

        return {
          name,
          lat: p.location!.lat(),
          lng: p.location!.lng(),
          type: "monument",
          icon: "",
          description: typeLabel,
          history: history.length > 500 ? history.substring(0, 497) + "..." : history,
          radiusM: 200,
          place_id: p.id,
          images,
          prompt: `Háblale al usuario sobre ${name} y su relevancia histórica en Cali.`,
        };
      }));

      setLocalLandmarks(newLandmarks);
    } catch (error) {
      console.error("Landmark discovery error:", error);
    } finally {
      setLoadingLandmarks(false);
    }
  }, [currentComuna]);

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

    // Route Polyline (Modern way)
    routePolylineRef.current = new google.maps.Polyline({
      map: mapInstance.current,
      strokeColor: "#3b82f6",
      strokeWeight: 6,
      strokeOpacity: 0.8,
      visible: false,
    });

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

  // Re-detect comuna, landmarks and AUTO-CENTER map when position updates
  useEffect(() => {
    if (coords) {
      detectComuna(coords.lat, coords.lng);
      fetchLocalLandmarks(coords.lat, coords.lng);

      // Auto-center map on user location
      if (mapInstance.current) {
        mapInstance.current.panTo({ lat: coords.lat, lng: coords.lng });
      }
    }
  }, [coords, CALI_COMUNAS, detectComuna, fetchLocalLandmarks]);

  // Show alert again when entering a NEW zone
  useEffect(() => {
    if (currentComuna && currentComuna.id !== lastZoneId.current) {
      lastZoneId.current = currentComuna.id;
      setShowZoneAlert(true);
    } else if (!currentComuna) {
      lastZoneId.current = null;
    }
  }, [currentComuna]);

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
    // Combine dynamic landmarks with any static ones we might add
    const currentViewLandmarks = localLandmarks;
    for (const landmark of currentViewLandmarks) {
      if (spokenLandmarks.current.has(landmark.name)) continue;
      const dist = haversineDistance(lat, lng, landmark.lat, landmark.lng);
      if (dist <= landmark.radiusM) {
        spokenLandmarks.current.add(landmark.name);
        fetchNarration(landmark.prompt, "monument").then(text => {
          if (text) speakRef.current({ type: "monument", text, title: landmark.name, icon: landmark.icon });
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
        {(["local", "places", "zones", "experience"] as const).map(tab => (
          <motion.button
            key={tab}
            onClick={() => setActiveTab(tab)}
            whileTap={{ scale: 0.97 }}
            className={`relative px-1 py-1.5 rounded-lg text-[9px] font-bold transition-colors flex-1 flex items-center justify-center gap-1 ${activeTab === tab ? "text-blue-600" : "text-zinc-400 hover:text-zinc-600"
              }`}
          >
            <span className="truncate">
              {tab === "local" ? "Local" : tab === "places" ? "Negocios" : tab === "zones" ? "Zonas" : "Agenda"}
            </span>
            {tab === "experience" && experienceLog.length > 0 && (
              <span className="shrink-0 inline-flex items-center justify-center w-3 h-3 rounded-full bg-blue-500 text-white text-[7px] font-black">
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
        {activeTab === "local" && (
          <motion.div
            key="local"
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-black/5 shrink-0 bg-amber-50/30">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.15em] text-amber-600">Patrimonio</p>
                <p className="text-[14px] font-black text-zinc-800 mt-0.5">
                  {currentComuna ? currentComuna.name : "Explorando Cali"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-medium uppercase tracking-[0.07em] text-zinc-400">Escaneo</p>
                <p className="text-[13px] font-black text-blue-500">1 km</p>
              </div>
            </div>

            <div className="overflow-y-auto overscroll-contain flex-1 px-4 py-3">
              <div className="flex flex-col gap-3">
                {loadingLandmarks && localLandmarks.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
                    <div className="w-8 h-8 border-3 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4" />
                    <p className="text-[12px] font-bold">Escaneando historia...</p>
                  </div>
                )}
                {localLandmarks.map((landmark, idx) => (
                  <motion.div
                    key={landmark.name}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="bg-white rounded-2xl border border-black/5 p-4 shadow-sm"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full uppercase tracking-wider border border-amber-100">
                            {landmark.description}
                          </span>
                        </div>
                        <p className="text-[15px] font-black text-zinc-800 leading-tight">{landmark.name}</p>
                        <p className={`text-[11px] text-zinc-500 mt-2 leading-relaxed font-medium transition-all duration-300 ${expandedLandmark === landmark.name ? "" : "line-clamp-2"}`}>
                          {landmark.history}
                        </p>

                        <div className="flex items-center gap-2 mt-4">
                          <button
                            onClick={async () => {
                              if (!coords || !mapInstance.current) return;
                              const directionsService = new google.maps.DirectionsService();
                              directionsService.route(
                                {
                                  origin: { lat: coords.lat, lng: coords.lng },
                                  destination: { lat: landmark.lat, lng: landmark.lng },
                                  travelMode: google.maps.TravelMode.WALKING,
                                },
                                (result, status) => {
                                  if (status === "OK" && routePolylineRef.current && result) {
                                    routePolylineRef.current.setPath(result.routes[0].overview_path);
                                    routePolylineRef.current.setVisible(true);
                                    const bounds = result.routes[0].bounds;
                                    mapInstance.current?.fitBounds(bounds);
                                  } else {
                                    console.error("Route failed:", status);
                                    const url = `https://www.google.com/maps/dir/?api=1&origin=${coords.lat},${coords.lng}&destination=${landmark.lat},${landmark.lng}&travelmode=walking`;
                                    window.open(url, '_blank');
                                    if (status === "REQUEST_DENIED") {
                                      alert("¡Aviso! La 'Directions API' no está habilitada en tu clave de Google. He abierto la navegación en una nueva pestaña.");
                                    }
                                  }
                                }
                              );
                            }}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-blue-600 text-white text-[11px] font-bold hover:bg-blue-700 transition-all shadow-sm shadow-blue-500/20 active:scale-95"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                            Ver Ruta
                          </button>

                          <button
                            onClick={() => {
                              setCurrentImageIdx(0);
                              setExpandedLandmark(landmark.name);
                            }}
                            className="px-4 py-2 rounded-xl bg-zinc-100 text-zinc-600 text-[11px] font-bold hover:bg-zinc-200 transition-all active:scale-95"
                          >
                            Expandir
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
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
                <p className="text-[11px] font-black uppercase tracking-[0.12em] text-blue-500">Agenda Cali</p>
                <p className="text-[14px] font-black text-zinc-800 mt-0.5">
                  {CALI_EVENTS_TODAY.length} eventos para hoy
                </p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-medium uppercase tracking-[0.07em] text-zinc-400">Fecha</p>
                <p className="text-[12px] font-black text-zinc-800">
                  Abril 30, 2026
                </p>
              </div>
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

            {/* Experience log / Events */}
            <div className="overflow-y-auto overscroll-contain flex-1 px-4 py-3">
              <div className="mb-6">
                <div className="flex flex-col gap-2">
                  {CALI_EVENTS_TODAY.map((event, idx) => (
                    <motion.div
                      key={event.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="group bg-white rounded-2xl border border-black/5 p-3.5 shadow-sm hover:shadow-md hover:border-blue-500/20 transition-all cursor-pointer"
                    >
                      <div className="flex items-start gap-3">
                        {event.icon && (
                          <div className="w-10 h-10 rounded-xl bg-blue-500/5 flex items-center justify-center text-xl shrink-0 group-hover:scale-110 transition-transform">
                            {event.icon}
                          </div>
                        )}
                        <div className="flex flex-col gap-1 min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full uppercase tracking-tighter">
                              {event.category}
                            </span>
                            <span className="text-[10px] font-bold text-zinc-400">{event.time}</span>
                          </div>
                          <p className="text-[14px] font-black text-zinc-800 leading-tight">{event.title}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-[10px] font-bold text-zinc-400">Por:</span>
                            <span className="text-[10px] font-bold text-zinc-600 truncate">{event.organizer}</span>
                          </div>
                          <div className="flex items-start gap-1 mt-1 text-zinc-500">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="shrink-0 mt-0.5"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                            <span className="text-[10px] font-medium leading-tight">{event.location}</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>



              {experienceLog.length > 0 && (
                <div className="flex flex-col gap-1 border-t border-black/5 pt-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400 mb-2">Recorrido reciente</p>
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
              {currentComuna && showZoneAlert && (
                <motion.div
                  className="mx-4 mt-3 shrink-0"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.18 }}
                >
                  <div
                    className="relative rounded-xl px-4 py-3 border overflow-hidden"
                    style={{
                      background: `${RISK_CONFIG[currentComuna.risk].fill}18`,
                      borderColor: `${RISK_CONFIG[currentComuna.risk].stroke}30`,
                    }}
                  >
                    <button
                      onClick={() => setShowZoneAlert(false)}
                      className="absolute top-2 right-2 p-1 rounded-full hover:bg-black/5 text-zinc-400"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>

                    <div className="flex flex-col gap-1 pr-6">
                      <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-zinc-400">Tu zona actual</p>
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[15px] font-black text-zinc-800 leading-tight">{currentComuna.name}</p>
                        <span
                          className="text-[9px] font-black px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap"
                          style={{ background: `${RISK_CONFIG[currentComuna.risk].fill}25`, color: RISK_CONFIG[currentComuna.risk].color }}
                        >
                          RIESGO {RISK_CONFIG[currentComuna.risk].label.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed line-clamp-2">{currentComuna.description}</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Legend - Compact Row */}
            <div className="px-4 pt-4 pb-1 shrink-0">
              <div className="flex items-center justify-between gap-1 overflow-x-auto no-scrollbar pb-2">
                {(Object.entries(RISK_CONFIG) as [RiskLevel, typeof RISK_CONFIG[RiskLevel]][]).map(([level, cfg]) => (
                  <div key={level} className="flex items-center gap-1.5 shrink-0 bg-white border border-black/5 px-2 py-1.5 rounded-lg shadow-sm">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cfg.fill, border: `1px solid ${cfg.stroke}` }} />
                    <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-tighter whitespace-nowrap">{cfg.label}</span>
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
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
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

      {/* ── Landmark Details Modal ── */}
      <AnimatePresence>
        {expandedLandmark && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-110 flex items-center justify-center bg-black/60 backdrop-blur-md px-6"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="w-full max-w-lg bg-white rounded-[32px] max-h-[80vh] overflow-hidden flex flex-col shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              {(() => {
                const landmark = localLandmarks.find(l => l.name === expandedLandmark);
                if (!landmark) return null;

                return (
                  <>
                    {/* Header with close button */}
                    <div className="absolute top-4 right-4 z-20">
                      <button
                        onClick={() => setExpandedLandmark(null)}
                        className="w-10 h-10 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/40 transition-colors"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                      </button>
                    </div>

                    <div className="overflow-y-auto flex-1">
                      {/* Image Gallery */}
                      {landmark.images.length > 0 && (
                        <div className="relative group">
                          <div className="relative aspect-4/3 bg-zinc-100 overflow-hidden">
                            <motion.img
                              key={currentImageIdx}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              src={landmark.images[currentImageIdx]}
                              alt={landmark.name}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent" />

                            <div className="absolute bottom-6 left-6 right-6 text-white">
                              <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 mb-1 block">Patrimonio de Cali</span>
                              <h2 className="text-2xl font-black leading-tight">{landmark.name}</h2>
                            </div>
                          </div>

                          {landmark.images.length > 1 && (
                            <>
                              <button
                                onClick={() => setCurrentImageIdx(prev => (prev > 0 ? prev - 1 : landmark.images.length - 1))}
                                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/40 transition-all opacity-0 group-hover:opacity-100 z-10"
                              >
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m15 18-6-6 6-6" /></svg>
                              </button>
                              <button
                                onClick={() => setCurrentImageIdx(prev => (prev < landmark.images.length - 1 ? prev + 1 : 0))}
                                className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/40 transition-all opacity-0 group-hover:opacity-100 z-10"
                              >
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m9 18 6-6-6-6" /></svg>
                              </button>
                              <div className="absolute bottom-4 right-6 flex gap-1">
                                {landmark.images.map((_, i) => (
                                  <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all ${i === currentImageIdx ? "bg-white w-4" : "bg-white/40"}`} />
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      <div className="p-8 flex flex-col gap-8">
                        <div className="flex flex-col gap-4">
                          <div className="flex items-center gap-2">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
                            <p className="text-[12px] font-black uppercase tracking-widest text-blue-500">Dato Cultural</p>
                          </div>
                          <div className="bg-blue-50 rounded-2xl p-5 border border-blue-100">
                            <p className="text-[16px] text-zinc-800 font-bold leading-relaxed">
                              {landmark.history.split('.')[0]}. {landmark.history.split('.')[1] ? landmark.history.split('.')[1] + '.' : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col gap-3">
                          <div className="flex items-center gap-2">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" /><path d="M8 7h6" /><path d="M8 11h8" /></svg>
                            <p className="text-[11px] font-black uppercase tracking-widest text-zinc-400">Contexto Histórico</p>
                          </div>
                          <p className="text-[14px] text-zinc-500 leading-relaxed font-medium">
                            {landmark.history}
                          </p>
                        </div>

                        <div className="flex flex-col gap-3">
                          <button
                            onClick={async () => {
                              if (!coords || !mapInstance.current) return;
                              setExpandedLandmark(null);
                              const directionsService = new google.maps.DirectionsService();
                              directionsService.route(
                                {
                                  origin: { lat: coords.lat, lng: coords.lng },
                                  destination: { lat: landmark.lat, lng: landmark.lng },
                                  travelMode: google.maps.TravelMode.WALKING,
                                },
                                (result, status) => {
                                  if (status === "OK" && routePolylineRef.current && result) {
                                    routePolylineRef.current.setPath(result.routes[0].overview_path);
                                    routePolylineRef.current.setVisible(true);
                                    const bounds = result.routes[0].bounds;
                                    mapInstance.current?.fitBounds(bounds);
                                  } else {
                                    const url = `https://www.google.com/maps/dir/?api=1&origin=${coords.lat},${coords.lng}&destination=${landmark.lat},${landmark.lng}&travelmode=walking`;
                                    window.open(url, '_blank');
                                  }
                                }
                              );
                            }}
                            className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-blue-600 text-white font-bold text-[15px] shadow-lg shadow-blue-500/25 active:scale-[0.98] transition-transform"
                          >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                            Cómo llegar caminando
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
