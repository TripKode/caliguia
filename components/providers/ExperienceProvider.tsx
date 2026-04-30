"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export const LANGUAGES = {
  es: { label: "Español", instruction: "Respondes en español." },
  en: { label: "Inglés", instruction: "Respond in English." },
  pt: { label: "Portugués", instruction: "Responda em português." },
} as const;

export type LanguageCode = keyof typeof LANGUAGES;
export type ExperienceMode = "map" | "ar";

type ExperienceContextValue = {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  experienceMode: ExperienceMode;
  setExperienceMode: (mode: ExperienceMode) => void;
  toggleExperienceMode: () => void;
};

const ExperienceContext = createContext<ExperienceContextValue | null>(null);

export function ExperienceProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<LanguageCode>("es");
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>("map");

  const value = useMemo<ExperienceContextValue>(
    () => ({
      language,
      setLanguage,
      experienceMode,
      setExperienceMode,
      toggleExperienceMode: () => setExperienceMode(mode => (mode === "ar" ? "map" : "ar")),
    }),
    [experienceMode, language]
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
