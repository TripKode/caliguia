"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { AIFloatingIsland } from "../components/island/Island";

declare global {
  interface Window {
    __googleMapsProxyLoading?: Promise<void>;
    gm_authFailure?: () => void;
  }
}

async function loadGoogleMapsViaProxy() {
  if (window.google?.maps) return;
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

      if (window.google?.maps) {
        resolve();
        return;
      }

      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(), { once: true });
        existingScript.addEventListener("error", () => reject(new Error("Failed to load Maps via proxy")), {
          once: true,
        });
        return;
      }

      const params = new URLSearchParams({
        internal_secret: internalSecret,
        libraries: "maps,places,marker,visualization",
        v: "weekly",
        language: "es",
        loading: "async",
      });

      const script = document.createElement("script");
      script.id = scriptId;
      script.src = `/api/maps-proxy?${params.toString()}`;
      script.async = true;
      script.defer = true;
      script.crossOrigin = "anonymous";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Maps via proxy"));
      document.head.appendChild(script);
    });
  })();

  return window.__googleMapsProxyLoading;
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
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const badgeRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const requestingLocationRef = useRef(false);
  const lastFetchPos = useRef<{ lat: number; lng: number } | null>(null);
  const serviceRef = useRef<google.maps.places.PlacesService | null>(null);
  const polygonsRef = useRef<google.maps.Polygon[]>([]);
  const heatmapRef = useRef<google.maps.visualization.HeatmapLayer | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const dragStartY = useRef<number>(0);
  const drawerStartH = useRef<number>(0);
  const isDragging = useRef(false);

  const [status, setStatus] = useState<Status>("idle");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationDebug, setLocationDebug] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const [drawerH, setDrawerH] = useState(280);
  const [isMobile, setIsMobile] = useState(false);
  const [layerMode, setLayerMode] = useState<LayerMode>("risk");
  const [currentComuna, setCurrentComuna] = useState<ComunaData | null>(null);
  const [activeTab, setActiveTab] = useState<"places" | "zones">("places");

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

    // Weight: high=1.0, medium=0.6, low=0.3, safe=0.1
    const weightMap: Record<RiskLevel, number> = { high: 1.0, medium: 0.6, low: 0.3, safe: 0.1 };

    const points = CALI_COMUNAS.map(c => {
      // Centroid of polygon
      const latSum = c.coords.reduce((s, [la]) => s + la, 0);
      const lngSum = c.coords.reduce((s, [, lo]) => s + lo, 0);
      const n = c.coords.length;
      return {
        location: new google.maps.LatLng(latSum / n, lngSum / n),
        weight: weightMap[c.risk],
      };
    });

    heatmapRef.current = new google.maps.visualization.HeatmapLayer({
      data: points,
      map,
      radius: 80,
      opacity: 0.65,
      gradient: [
        "rgba(34,197,94,0)",
        "rgba(34,197,94,0.6)",
        "rgba(132,204,22,0.7)",
        "rgba(245,158,11,0.75)",
        "rgba(239,68,68,0.8)",
        "rgba(220,38,38,0.9)",
      ],
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
  const fetchNearby = useCallback((lat: number, lng: number) => {
    if (!serviceRef.current) return;
    if (lastFetchPos.current) {
      const dist = haversineDistance(lastFetchPos.current.lat, lastFetchPos.current.lng, lat, lng);
      if (dist < 150) return;
    }
    lastFetchPos.current = { lat, lng };
    setLoadingPlaces(true);

    serviceRef.current.nearbySearch(
      { location: new google.maps.LatLng(lat, lng), radius: 1000, type: "establishment" },
      (results, st) => {
        if (st === google.maps.places.PlacesServiceStatus.OK && results) {
          const sorted = (results as NearbyPlace[])
            .filter(p => p.geometry?.location)
            .sort((a, b) => {
              const da = haversineDistance(lat, lng, a.geometry.location.lat(), a.geometry.location.lng());
              const db = haversineDistance(lat, lng, b.geometry.location.lat(), b.geometry.location.lng());
              return da - db;
            })
            .slice(0, 30);
          setPlaces(sorted);
        }
        setLoadingPlaces(false);
      }
    );
  }, []);

  // ── Init map ──────────────────────────────────────────────────────────────
  const initMap = async (lat: number, lng: number) => {
    if (!mapRef.current) return;

    await loadGoogleMapsViaProxy();

    const { Map } = await google.maps.importLibrary("maps") as google.maps.MapsLibrary;
    await google.maps.importLibrary("places");
    await google.maps.importLibrary("visualization");

    const center = { lat, lng };

    mapInstance.current = new Map(mapRef.current!, {
      center,
      zoom: 13,
      styles: MAP_STYLES,
      disableDefaultUI: true,
      gestureHandling: "greedy",
      mapId: "DEMO_MAP_ID",
    });

    serviceRef.current = new google.maps.places.PlacesService(mapInstance.current);
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

    const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary("marker") as google.maps.MarkerLibrary;

    const userPin = new PinElement({
      background: "#3b82f6",
      borderColor: "#ffffff",
      glyphColor: "#ffffff",
      scale: 0.8,
    });

    markerRef.current = new AdvancedMarkerElement({
      position: center,
      map: mapInstance.current,
      content: userPin.element,
      title: "Tu ubicación",
      zIndex: 999,
    });

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
      if (markerRef.current) markerRef.current.position = pos;
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

  const requestLocation = useCallback(() => {
    if (requestingLocationRef.current) return;
    setLocationError(null);
    setLocationDebug(
      `Origen: ${window.location.origin} | Seguro: ${window.isSecureContext ? "si" : "no"} | Geolocation: ${"geolocation" in navigator ? "si" : "no"
      }`
    );

    if (!window.isSecureContext) {
      setLocationError("El navegador solo permite pedir ubicación en HTTPS o localhost. Abre la app con HTTPS para probarla en el celular.");
      setStatus("error");
      return;
    }

    if (!navigator.geolocation) {
      setLocationError("Este navegador no soporta ubicación.");
      setStatus("error");
      return;
    }

    requestingLocationRef.current = true;
    setStatus("loading");

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
            handleError,
            { ...options, enableHighAccuracy: false }
          );
        } else {
          handleError(err);
        }
      },
      options
    );
  }, []);

  // Re-apply layer when mode changes
  useEffect(() => {
    if (mapInstance.current) applyLayer(layerMode, mapInstance.current);
  }, [layerMode, applyLayer]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  // ── Drawer ────────────────────────────────────────────────────────────────
  const onDragStart = (clientY: number) => {
    isDragging.current = true;
    dragStartY.current = clientY;
    drawerStartH.current = drawerH;
  };
  const onDragMove = (clientY: number) => {
    if (!isDragging.current) return;
    const delta = dragStartY.current - clientY;
    const next = Math.min(Math.max(drawerStartH.current + delta, 80), window.innerHeight * 0.85);
    setDrawerH(next);
  };
  const onDragEnd = () => {
    isDragging.current = false;
    if (drawerH < 160) setDrawerH(80);
    else if (drawerH > window.innerHeight * 0.6) setDrawerH(Math.floor(window.innerHeight * 0.82));
    else setDrawerH(280);
  };

  // ── Panel ─────────────────────────────────────────────────────────────────
  const PanelContent = () => (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Tabs */}
      <div className="flex items-center gap-1 px-5 pt-4 pb-0 shrink-0">
        {(["places", "zones"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${activeTab === tab
              ? "bg-blue-500/9 text-blue-600"
              : "text-zinc-400 hover:text-zinc-600"
              }`}
          >
            {tab === "places" ? "Negocios" : "Zonas de Riesgo"}
          </button>
        ))}
      </div>

      {/* ── TAB: Places ── */}
      {activeTab === "places" && (
        <>
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

          {loadingPlaces && (
            <div className="flex flex-col gap-3 px-5 py-4 shrink-0">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex gap-3 items-center animate-pulse">
                  <div className="w-9 h-9 rounded-xl bg-zinc-100 shrink-0" />
                  <div className="flex flex-col gap-1.5 flex-1">
                    <div className="h-3 bg-zinc-100 rounded-full w-2/3" />
                    <div className="h-2.5 bg-zinc-100 rounded-full w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loadingPlaces && (
            <div className="overflow-y-auto flex-1 px-4 py-2">
              {places.length === 0 && (
                <div className="text-[12px] text-zinc-400 text-center py-12 px-6">
                  {status === "tracking" ? "Sin negocios en el área." : status === "loading" ? "Buscando tu ubicación en Cali..." : "Comparte tu ubicación para ver negocios cercanos."}
                </div>
              )}
              <div className="flex flex-col gap-1">
                {places.map((place) => {
                  const dist = coords
                    ? Math.round(haversineDistance(coords.lat, coords.lng, place.geometry.location.lat(), place.geometry.location.lng()))
                    : null;
                  return (
                    <div key={place.place_id} className="flex items-start gap-3 px-3 py-2.5 rounded-xl transition-colors hover:bg-zinc-50 cursor-pointer">
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
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── TAB: Zones ── */}
      {activeTab === "zones" && (
        <div className="flex flex-col h-full overflow-hidden">

          {/* Layer toggle */}
          <div className="flex items-center gap-2 px-5 pt-3 pb-3 border-b border-black/5 shrink-0">
            {(["risk", "heatmap", "none"] as LayerMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setLayerMode(mode)}
                className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${layerMode === mode
                  ? "bg-blue-500 text-white"
                  : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                  }`}
              >
                {mode === "risk" ? "Comunas" : mode === "heatmap" ? "Heatmap" : "Oculto"}
              </button>
            ))}
          </div>

          {/* Current zone banner */}
          {currentComuna && (
            <div className="mx-4 mt-3 shrink-0">
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
            </div>
          )}

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
          <div className="overflow-y-auto flex-1 px-4 pb-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400 mb-2 mt-2">Las 22 Comunas</p>
            <div className="flex flex-col gap-1">
              {CALI_COMUNAS.map(c => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-50 transition-colors cursor-pointer"
                  onClick={() => {
                    if (mapInstance.current) {
                      const latSum = c.coords.reduce((s, [la]) => s + la, 0);
                      const lngSum = c.coords.reduce((s, [, lo]) => s + lo, 0);
                      const n = c.coords.length;
                      mapInstance.current.panTo({ lat: latSum / n, lng: lngSum / n });
                      mapInstance.current.setZoom(15);
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
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
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

      <div className="relative flex-1 h-full">
        <div ref={mapRef} className="w-full h-full" />
        <AIFloatingIsland context={aiContext} />
      </div>

      {/* Desktop sidebar */}
      <div className="hidden md:flex w-[340px] h-full bg-[#f7f6f3] border-l border-black/6 flex-col shrink-0 z-10">
        <PanelContent />
      </div>

      {/* Mobile drawer */}
      <div
        className="md:hidden absolute bottom-0 left-0 right-0 z-20 bg-[#f7f6f3] rounded-t-2xl border-t border-black/6"
        style={{ height: `${drawerH}px`, transition: isDragging.current ? "none" : "height 0.25s cubic-bezier(0.4,0,0.2,1)" }}
        onMouseMove={e => onDragMove(e.clientY)}
        onMouseUp={onDragEnd}
        onTouchMove={e => onDragMove(e.touches[0].clientY)}
        onTouchEnd={onDragEnd}
      >
        <div
          className="flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing shrink-0"
          onMouseDown={e => onDragStart(e.clientY)}
          onTouchStart={e => onDragStart(e.touches[0].clientY)}
        >
          <div className="w-9 h-1 rounded-full bg-zinc-300" />
        </div>
        <PanelContent />
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
            onClick={requestLocation}
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
            onClick={requestLocation}
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
    </div>
  );
}
