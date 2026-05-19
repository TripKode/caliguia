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

export const RISK_LABELS: Record<RiskLevel, Record<"es" | "en" | "pt", string>> = {
  safe: { es: "Segura", en: "Safe", pt: "Segura" },
  low: { es: "Baja", en: "Low", pt: "Baixa" },
  medium: { es: "Moderada", en: "Moderate", pt: "Moderada" },
  high: { es: "Alta", en: "High", pt: "Alta" },
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
export const AR_ZOOM_LEVELS = [1, 2, 4] as const;

export const CALI_EVENTS_TODAY: CaliEvent[] = [
  {
    id: "e1",
    title: "Colombia BirdFair",
    organizer: "Calendario Oficial de Eventos Turísticos Cali 2026",
    category: "Naturaleza",
    time: "Febrero (mediados)",
    startDate: "2026-02-14",
    endDate: "2026-02-16",
    location: "Km 18 y Farallones",
    description: "El evento de avistamiento de aves más importante de Sudamérica. Ideal para activar rutas hacia el Km 18 y los Farallones.",
    icon: "",
  },
  {
    id: "e2",
    title: "Festival de Música Clásica",
    organizer: "Calendario Oficial de Eventos Turísticos Cali 2026",
    category: "Cultural / Histórico",
    time: "25 de marzo al 4 de abril",
    startDate: "2026-03-25",
    endDate: "2026-04-04",
    location: "Teatro Municipal La Ermita y centro de Cali",
    description: "Conciertos en iglesias y teatros históricos. Perfecto para recorridos por el centro.",
    icon: "",
  },
  {
    id: "e3",
    title: "Festival Int. de Poesía",
    organizer: "Calendario Oficial de Eventos Turísticos Cali 2026",
    category: "Cultural",
    time: "6 al 9 de mayo",
    startDate: "2026-05-06",
    endDate: "2026-05-09",
    location: "Bibliotecas y espacios públicos emblemáticos",
    description: "Encuentros literarios en bibliotecas y espacios públicos emblemáticos.",
    icon: "",
  },
  {
    id: "e4",
    title: "Festival Int. de Teatro",
    organizer: "Calendario Oficial de Eventos Turísticos Cali 2026",
    category: "Cultural",
    time: "4 al 14 de junio",
    startDate: "2026-06-04",
    endDate: "2026-06-14",
    location: "Salas y calles de Cali",
    description: "Toma cultural de salas y calles de la ciudad con compañías nacionales e internacionales.",
    icon: "",
  },
  {
    id: "e5",
    title: "Festival de Macetas",
    organizer: "Calendario Oficial de Eventos Turísticos Cali 2026",
    category: "Familiar / Cultural",
    time: "24 al 29 de junio",
    startDate: "2026-06-24",
    endDate: "2026-06-29",
    location: "Loma de la Cruz",
    description: "Celebración del Día de los Ahijados. Único en el mundo y reconocido como patrimonio inmaterial.",
    icon: "",
  },
  {
    id: "e6",
    title: "Sucursal Fest",
    organizer: "Calendario Oficial de Eventos Turísticos Cali 2026",
    category: "Cultura Urbana",
    time: "17 al 19 de julio",
    startDate: "2026-07-17",
    endDate: "2026-07-19",
    location: "Cali",
    description: "Festival de cultura urbana, diseño, música alternativa y artes visuales. Atrae a un público joven y creativo.",
    icon: "",
  },
  {
    id: "e7",
    title: "Festival Petronio Álvarez",
    organizer: "Calendario Oficial de Eventos Turísticos Cali 2026",
    category: "Cultural / Gastro",
    time: "14 al 19 de agosto",
    startDate: "2026-08-14",
    endDate: "2026-08-19",
    location: "Cali",
    description: "El festival afro más grande de Latinoamérica. Música de marimbas, gastronomía del Pacífico y bebidas ancestrales.",
    icon: "",
  },
  {
    id: "e8",
    title: "Festival Mundial de Salsa",
    organizer: "Calendario Oficial de Eventos Turísticos Cali 2026",
    category: "Salsa",
    time: "Septiembre / Octubre",
    startDate: "2026-09-01",
    endDate: "2026-10-31",
    location: "Cali",
    description: "Competencia élite con los mejores bailarines del mundo. Incluye la Gran Cumbre Mundial de la Salsa.",
    icon: "",
  },
  {
    id: "e9",
    title: "Feria de Cali",
    organizer: "Calendario Oficial de Eventos Turísticos Cali 2026",
    category: "Salsa / General",
    time: "25 al 30 de diciembre",
    startDate: "2026-12-25",
    endDate: "2026-12-30",
    location: "Salsódromo, Cali Viejo, Encuentro de Melómanos y Coleccionistas",
    description: "El evento máximo de fin de año en Cali.",
    icon: "",
  }
];
