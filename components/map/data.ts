import { RiskLevel, CaliEvent } from "./types";

export const MAP_STYLES: google.maps.MapTypeStyle[] = [
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

export const PIN_SVG = `
  <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="10" r="9" fill="#3b82f6" fill-opacity="0.12"/>
    <circle cx="10" cy="10" r="5" fill="#3b82f6" stroke="#ffffff" stroke-width="2.5"/>
  </svg>
`;

export const RISK_CONFIG: Record<RiskLevel, { fill: string; stroke: string; fillOpacity: number; label: string; color: string }> = {
  safe: { fill: "#22c55e", stroke: "#16a34a", fillOpacity: 0.12, label: "Segura", color: "#16a34a" },
  low: { fill: "#84cc16", stroke: "#65a30d", fillOpacity: 0.14, label: "Baja", color: "#65a30d" },
  medium: { fill: "#f59e0b", stroke: "#d97706", fillOpacity: 0.15, label: "Moderada", color: "#d97706" },
  high: { fill: "#ef4444", stroke: "#dc2626", fillOpacity: 0.18, label: "Alta", color: "#dc2626" },
};

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

export const LOCATION_OPT_IN_KEY = "caliguia:location-opt-in";
export const LEGACY_LOCATION_OPT_IN_KEY = "location_granted";
export const LOCATION_CACHE_KEY = "caliguia:last-location";
export const LOCATION_CACHE_MAX_AGE = 1000 * 60 * 60 * 12;
export const CALI_CENTER = { lat: 3.4516, lng: -76.5320 };
export const CALI_BOUNDS = {
  north: 3.56,
  south: 3.33,
  east: -76.43,
  west: -76.62,
};
export const AR_ZOOM_LEVELS = [0.05, 1, 10] as const;

export const CALI_EVENTS_TODAY: CaliEvent[] = [
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