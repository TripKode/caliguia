export const PROFILE_VERSION = 1;

export type TourismInterestId =
  | "cultural_salsa"
  | "ecoturismo"
  | "comunitario"
  | "deportivo"
  | "bienestar"
  | "compras";

export type TravelStyle = "caminante" | "relajado";
export type CityVibe = "tranquilo" | "explorador" | "fiesta";
export type TravelGroup = "solo" | "pareja" | "familia" | "grupo";
export type Pace = "rapido" | "tranquilo";

export interface TravelProfile {
  interests: TourismInterestId[];
  tourismSegments: TourismInterestId[];
  style: TravelStyle;
  vibe: CityVibe;
  travelGroup: TravelGroup;
  pace: Pace;
  mustGo: string[];
  profileVersion: number;
}

export const TOURISM_INTERESTS: Record<TourismInterestId, {
  labelKey: string;
  profileKey: string;
  mustGo: string[];
  keywords: string[];
}> = {
  cultural_salsa: {
    labelKey: "interestCulturalSalsa",
    profileKey: "profileCulturalSalsa",
    mustGo: ["Bulevar del Río", "Museo Jairo Varela", "Barrio San Antonio", "La Topa Tolondra", "Museo de la Salsa"],
    keywords: ["salsa", "museo", "historia", "patrimonio", "cultura", "baile", "teatro", "iglesia", "arquitectura"],
  },
  ecoturismo: {
    labelKey: "interestEcoturismo",
    profileKey: "profileEcoturismo",
    mustGo: ["Río Pance", "Jardín Botánico de Cali", "Km 18", "Zoológico de Cali"],
    keywords: ["rio", "río", "pance", "parque", "naturaleza", "senderismo", "aves", "jardin", "jardín", "zoologico", "zoológico"],
  },
  comunitario: {
    labelKey: "interestComunitario",
    profileKey: "profileComunitario",
    mustGo: ["Comuna 20", "Siloé", "MIO Cable", "Museos comunitarios"],
    keywords: ["comuna", "siloe", "siloé", "mio cable", "mural", "comunitario", "resiliencia", "mirador"],
  },
  deportivo: {
    labelKey: "interestDeportivo",
    profileKey: "profileDeportivo",
    mustGo: ["Unidad Deportiva Jaime Aparicio", "Canchas Panamericanas", "Estadio Pascual Guerrero", "Ciclovía dominical"],
    keywords: ["deporte", "estadio", "pascual", "cancha", "ciclovia", "ciclovía", "entrenamiento", "atleta"],
  },
  bienestar: {
    labelKey: "interestBienestar",
    profileKey: "profileBienestar",
    mustGo: ["Clínica Imbanaco", "Fundación Valle del Lili", "Tequendama", "Ciudad Jardín", "Pance"],
    keywords: ["spa", "bienestar", "salud", "clinica", "clínica", "tranquilidad", "pance", "recuperacion", "recuperación"],
  },
  compras: {
    labelKey: "interestCompras",
    profileKey: "profileCompras",
    mustGo: ["Unicentro", "Chipichape", "Parque Artesanal Loma de la Cruz"],
    keywords: ["compras", "artesania", "artesanía", "diseño", "centro comercial", "unicentro", "chipichape", "marca"],
  },
};

const LEGACY_INTEREST_MAP: Record<string, TourismInterestId> = {
  salsa: "cultural_salsa",
  cultura: "cultural_salsa",
  patrimonio: "cultural_salsa",
  historia: "cultural_salsa",
  arte: "cultural_salsa",
  gastronomia: "cultural_salsa",
  bebidas: "cultural_salsa",
  naturaleza: "ecoturismo",
  ecoturismo: "ecoturismo",
  comunitario: "comunitario",
  deportivo: "deportivo",
  bienestar: "bienestar",
  compras: "compras",
};

const VALID_INTERESTS = new Set(Object.keys(TOURISM_INTERESTS));
const VALID_STYLES = new Set(["caminante", "relajado"]);
const VALID_VIBES = new Set(["tranquilo", "explorador", "fiesta"]);
const VALID_GROUPS = new Set(["solo", "pareja", "familia", "grupo"]);
const VALID_PACES = new Set(["rapido", "tranquilo"]);

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

export function normalizeInterests(raw: unknown): TourismInterestId[] {
  if (!Array.isArray(raw)) return [];
  return unique(
    raw
      .map(item => typeof item === "string" ? item : "")
      .map(item => LEGACY_INTEREST_MAP[item] || item)
      .filter((item): item is TourismInterestId => VALID_INTERESTS.has(item))
  );
}

export function getMustGoForInterests(interests: TourismInterestId[]) {
  return unique(interests.flatMap(interest => TOURISM_INTERESTS[interest]?.mustGo || []));
}

export function normalizeTravelProfile(raw: unknown): TravelProfile {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const interests = normalizeInterests(source.interests);
  const tourismSegments = normalizeInterests(source.tourismSegments);
  const normalizedSegments = tourismSegments.length > 0 ? tourismSegments : interests;
  const style = typeof source.style === "string" && VALID_STYLES.has(source.style) ? source.style as TravelStyle : "caminante";
  const vibe = typeof source.vibe === "string" && VALID_VIBES.has(source.vibe) ? source.vibe as CityVibe : "explorador";
  const travelGroup = typeof source.travelGroup === "string" && VALID_GROUPS.has(source.travelGroup) ? source.travelGroup as TravelGroup : "pareja";
  const pace = typeof source.pace === "string" && VALID_PACES.has(source.pace) ? source.pace as Pace : "tranquilo";
  const mustGo = getMustGoForInterests(normalizedSegments);

  return {
    interests: normalizedSegments,
    tourismSegments: normalizedSegments,
    style,
    vibe,
    travelGroup,
    pace,
    mustGo,
    profileVersion: PROFILE_VERSION,
  };
}

export function matchesTourismInterest(text: string, interests: TourismInterestId[]) {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return interests.some(interest =>
    TOURISM_INTERESTS[interest]?.keywords.some(keyword => normalized.includes(
      keyword.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    ))
  );
}
