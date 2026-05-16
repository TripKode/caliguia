"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";

export const LANGUAGES = {
  es: { label: "Español", instruction: "Respondes en español." },
  en: { label: "Inglés", instruction: "Respond in English." },
  pt: { label: "Portugués", instruction: "Responda em português." },
} as const;

export type LanguageCode = keyof typeof LANGUAGES;
export const LANGUAGE_STORAGE_KEY = "caliguia_preferred_language";
export const LANGUAGE_CONFIGURED_STORAGE_KEY = "caliguia_language_configured";
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
  setLanguage: (language: LanguageCode) => Promise<boolean>;
  selectedInterests: InterestId[];
  toggleInterest: (interest: InterestId) => void;
  travelGroup: TravelGroup;
  setTravelGroup: (group: TravelGroup) => void;
  pace: Pace;
  setPace: (pace: Pace) => void;
};

const ExperienceContext = createContext<ExperienceContextValue | null>(null);

export function ExperienceProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale() as LanguageCode;
  const { data: session, status, update } = useSession();
  const [language, setLanguageState] = useState<LanguageCode>(
    LANGUAGES[locale] ? locale : "es"
  );
  const [selectedInterests, setSelectedInterests] = useState<InterestId[]>(["salsa", "patrimonio"]);
  const [travelGroup, setTravelGroup] = useState<TravelGroup>("pareja");
  const [pace, setPace] = useState<Pace>("tranquilo");

  useEffect(() => {
    if (LANGUAGES[locale]) {
      setLanguageState(locale);
      document.cookie = `caliguia_locale=${locale}; path=/; max-age=31536000; samesite=lax`;
    }
  }, [locale]);

  useEffect(() => {
    const preferred = session?.preferredLanguage;
    const localPreferred = sessionStorage.getItem(LANGUAGE_STORAGE_KEY) as LanguageCode | null;
    
    // We only force a redirect from the session if the user hasn't explicitly set a local preference
    if (preferred && LANGUAGES[preferred] && preferred !== locale && !localPreferred) {
      setLanguageState(preferred);
      document.cookie = `caliguia_locale=${preferred}; path=/; max-age=31536000; samesite=lax`;
      router.replace(pathname, { locale: preferred });
    }
  }, [locale, pathname, router, session?.preferredLanguage]);

  useEffect(() => {
    if (status !== "authenticated") return;

    const pendingLanguage = sessionStorage.getItem(LANGUAGE_STORAGE_KEY) as LanguageCode | null;
    const hasPendingLanguage = pendingLanguage && LANGUAGES[pendingLanguage];
    const languageToSync = hasPendingLanguage ? pendingLanguage : session?.preferredLanguage;

    if (!languageToSync || !LANGUAGES[languageToSync]) return;
    if (session?.languageConfigured && session.preferredLanguage === languageToSync) return;

    fetch("/api/users/me/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferredLanguage: languageToSync }),
    })
      .then(response => response.ok ? response.json() : null)
      .then(preferences => {
        if (!preferences) return;

        sessionStorage.setItem(LANGUAGE_STORAGE_KEY, preferences.preferredLanguage);
        sessionStorage.setItem(LANGUAGE_CONFIGURED_STORAGE_KEY, "true");
        update({
          preferredLanguage: preferences.preferredLanguage,
          languageConfigured: preferences.languageConfigured,
        });
      })
      .catch(() => null);
  }, [session?.languageConfigured, session?.preferredLanguage, status, update]);

  const setLanguage = useCallback(async (nextLanguage: LanguageCode) => {
    setLanguageState(nextLanguage);
    document.cookie = `caliguia_locale=${nextLanguage}; path=/; max-age=31536000; samesite=lax`;
    sessionStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    sessionStorage.setItem(LANGUAGE_CONFIGURED_STORAGE_KEY, "true");

    if (status !== "authenticated" || (!session?.user?.id && !session?.user?.email)) {
      router.replace(pathname, { locale: nextLanguage });
      return true;
    }

    const response = await fetch("/api/users/me/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferredLanguage: nextLanguage }),
    });

    if (!response.ok) {
      return false;
    }

    const preferences = await response.json();
    sessionStorage.setItem(LANGUAGE_STORAGE_KEY, preferences.preferredLanguage);
    sessionStorage.setItem(LANGUAGE_CONFIGURED_STORAGE_KEY, "true");
    await update({
      preferredLanguage: preferences.preferredLanguage,
      languageConfigured: preferences.languageConfigured,
    });

    router.replace(pathname, { locale: nextLanguage });
    return true;
  }, [pathname, router, session?.user?.email, session?.user?.id, status, update]);

  const value = useMemo<ExperienceContextValue>(
    () => ({
      language,
      setLanguage,
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
    [language, pace, selectedInterests, travelGroup]
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
