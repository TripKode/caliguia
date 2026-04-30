"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export const LANGUAGES = {
  es: { label: "Español", instruction: "Respondes en español." },
  en: { label: "Inglés", instruction: "Respond in English." },
  pt: { label: "Portugués", instruction: "Responda em português." },
} as const;

export type LanguageCode = keyof typeof LANGUAGES;
export type ExperienceMode = "map" | "ar";
export type InterestId = "salsa" | "naturaleza" | "patrimonio" | "gastronomia" | "deportivo" | "bienestar" | "compras";
export type TravelGroup = "solo" | "pareja" | "familia" | "grupo";
export type Pace = "rapido" | "tranquilo";

export const TOURISM_INTERESTS: Record<InterestId, { label: string; profile: string; mustGo: string[] }> = {
  salsa: {
    label: "Salsa",
    profile: "Baile, museos y vida nocturna.",
    mustGo: ["Museo de la Salsa", "La Topa Tolondra", "Barrio Obrero"],
  },
  naturaleza: {
    label: "Naturaleza",
    profile: "Aves, río y senderismo.",
    mustGo: ["Río Pance", "Km 18", "Zoológico de Cali"],
  },
  patrimonio: {
    label: "Patrimonio",
    profile: "Historia, miradores y centro.",
    mustGo: ["La Ermita", "Cristo Rey", "San Antonio"],
  },
  gastronomia: {
    label: "Gastronomía",
    profile: "Sabores locales y Pacífico.",
    mustGo: ["Galería Alameda", "Parque del Perro", "Granada"],
  },
  deportivo: {
    label: "Deportivo",
    profile: "Eventos, rutas y entrenamiento.",
    mustGo: ["Unidad Deportiva", "Pascual Guerrero", "Ciclovía"],
  },
  bienestar: {
    label: "Bienestar",
    profile: "Salud, spa y calma.",
    mustGo: ["Ciudad Jardín", "Tequendama", "Pance"],
  },
  compras: {
    label: "Compras",
    profile: "Diseño local y centros comerciales.",
    mustGo: ["Unicentro", "Chipichape", "Loma de la Cruz"],
  },
};

type ExperienceContextValue = {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  experienceMode: ExperienceMode;
  setExperienceMode: (mode: ExperienceMode) => void;
  toggleExperienceMode: () => void;
  selectedInterests: InterestId[];
  toggleInterest: (interest: InterestId) => void;
  travelGroup: TravelGroup;
  setTravelGroup: (group: TravelGroup) => void;
  pace: Pace;
  setPace: (pace: Pace) => void;
};

const ExperienceContext = createContext<ExperienceContextValue | null>(null);

export function ExperienceProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<LanguageCode>("es");
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>("map");
  const [selectedInterests, setSelectedInterests] = useState<InterestId[]>(["salsa", "patrimonio"]);
  const [travelGroup, setTravelGroup] = useState<TravelGroup>("pareja");
  const [pace, setPace] = useState<Pace>("tranquilo");

  const value = useMemo<ExperienceContextValue>(
    () => ({
      language,
      setLanguage,
      experienceMode,
      setExperienceMode,
      toggleExperienceMode: () => setExperienceMode(mode => (mode === "ar" ? "map" : "ar")),
      selectedInterests,
      toggleInterest: (interest) =>
        setSelectedInterests(current =>
          current.includes(interest)
            ? current.filter(item => item !== interest)
            : [...current, interest]
        ),
      travelGroup,
      setTravelGroup,
      pace,
      setPace,
    }),
    [experienceMode, language, pace, selectedInterests, travelGroup]
  );

  return <ExperienceContext.Provider value={value}>{children}</ExperienceContext.Provider>;
}

export function useExperience() {
  const context = useContext(ExperienceContext);
  if (!context) {
    throw new Error("useExperience must be used within ExperienceProvider");
  }
  return context;
}
