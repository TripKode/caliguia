"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import type { LanguageCode } from "@/components/providers/ExperienceProvider";
import { getActiveVoiceSample } from "@/components/providers/voiceSampleStore";

export type NarrationType = "monument" | "route" | "danger" | "info" | "welcome" | "chat";

export interface NarrationEvent {
  id: string;
  type: NarrationType;
  text: string;
  title?: string;
  icon?: string;
  spokenAt?: number;
}

interface UseVoiceNarratorOptions {
  muted?: boolean;
  language?: LanguageCode;
}

const ACTIVE_PROVIDER_VOICE_STORAGE_KEY = "caliguia_active_provider_voice_id";
const RECENT_NARRATION_TTL_MS = 120_000;
const MAX_PENDING_NARRATIONS = 2;

// ── Real voice from the browser ────────────────────────────────────────────
export interface CaliVoice {
  id: string;        // voiceURI (unique identifier)
  name: string;      // display name shown in dropdown
  gender: "male" | "female" | "unknown";
  label: string;     // full label e.g. "Paulina · es-MX"
  lang: string;      // e.g. "es-CO"
  systemVoice: SpeechSynthesisVoice;
}

// Language → BCP47 prefix map
const LANG_TO_BCP47: Record<LanguageCode, string[]> = {
  es: ["es-CO", "es-MX", "es-US", "es-ES", "es-AR", "es-CL", "es-PE", "es-VE", "es"],
  en: ["en-US", "en-GB", "en-AU", "en-CA", "en"],
  pt: ["pt-BR", "pt-PT", "pt"],
};

// Spanish voice priority
const ES_PRIORITY: Record<string, number> = {
  "es-CO": 1, "es-MX": 2, "es-US": 3, "es-ES": 4,
  "es-AR": 5, "es-CL": 6, "es-PE": 7, "es-VE": 8,
};

// English voice priority
const EN_PRIORITY: Record<string, number> = {
  "en-US": 1, "en-GB": 2, "en-AU": 3, "en-CA": 4,
};

// PT voice priority
const PT_PRIORITY: Record<string, number> = {
  "pt-BR": 1, "pt-PT": 2,
};

const PRIORITY_MAP: Record<LanguageCode, Record<string, number>> = {
  es: ES_PRIORITY,
  en: EN_PRIORITY,
  pt: PT_PRIORITY,
};

const SILENT_WAV_DATA_URL =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQQAAAAAAA==";

function langScore(lang: string, language: LanguageCode): number {
  return PRIORITY_MAP[language][lang] ?? 99;
}

// Heuristics to guess gender from voice name
function guessGender(name: string): "male" | "female" | "unknown" {
  const lname = name.toLowerCase();
  const femaleKeywords = ["female", "mujer", "lupe", "sofia", "laura", "helena", "monica",
    "paulina", "sabina", "luciana", "camila", "valeria", "fernanda", "daniela",
    "isabel", "ximena", "karla", "rosa", "luz", "ana", "maria", "ines", "nuria",
    "conchita", "samantha", "victoria", "alice", "karen", "emma", "emily",
    "joanna", "siri", "cortana", "kate", "susan"];
  const maleKeywords = ["male", "hombre", "pablo", "raul", "jorge", "carlos", "andres",
    "miguel", "juan", "diego", "alejandro", "enrique", "javier", "sergio", "manuel",
    "antonio", "eduardo", "tomas", "rodrigo", "alberto", "lucas",
    "daniel", "david", "james", "alex", "tom", "mark", "oliver", "fred", "peter"];

  if (femaleKeywords.some(k => lname.includes(k))) return "female";
  if (maleKeywords.some(k => lname.includes(k))) return "male";
  return "unknown";
}

function buildVoicesForLanguage(systemVoices: SpeechSynthesisVoice[], language: LanguageCode): CaliVoice[] {
  const prefixes = LANG_TO_BCP47[language];
  const matched = systemVoices
    .filter(v => prefixes.some(p => v.lang.startsWith(p)))
    .sort((a, b) => langScore(a.lang, language) - langScore(b.lang, language));

  return matched.map(v => {
    const gender = guessGender(v.name);
    const friendlyLang = v.lang.replace("_", "-");
    return {
      id: v.voiceURI,
      name: v.name,
      gender,
      label: `${v.name} · ${friendlyLang}`,
      lang: friendlyLang,
      systemVoice: v,
    };
  });
}

export function useVoiceNarrator({ muted = false, language = "es" }: UseVoiceNarratorOptions = {}) {
  const { status } = useSession();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentNarration, setCurrentNarration] = useState<NarrationEvent | null>(null);
  const [experienceLog, setExperienceLog] = useState<NarrationEvent[]>([]);
  const [speechUnlocked, setSpeechUnlocked] = useState(false);
  const [voicePreference, setVoicePreference] = useState<"granted" | "denied" | "unknown">("unknown");

  // All voices grouped by current language
  const [availableVoices, setAvailableVoices] = useState<CaliVoice[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("");

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const queueRef = useRef<NarrationEvent[]>([]);
  const recentNarrationKeysRef = useRef(new Map<string, number>());
  const isPlayingRef = useRef(false);
  const unlockedRef = useRef(false);
  const languageRef = useRef<LanguageCode>(language);
  const availableVoicesRef = useRef<CaliVoice[]>([]);
  const selectedVoiceIdRef = useRef<string>("");
  const [gradioVoiceReady, setGradioVoiceReady] = useState(true);
  const gradioVoiceReadyRef = useRef(true);

  useEffect(() => { languageRef.current = language; }, [language]);
  useEffect(() => { availableVoicesRef.current = availableVoices; }, [availableVoices]);
  useEffect(() => { selectedVoiceIdRef.current = selectedVoiceId; }, [selectedVoiceId]);
  useEffect(() => { gradioVoiceReadyRef.current = gradioVoiceReady; }, [gradioVoiceReady]);

  const ensureAudioElement = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    const audio = new Audio();
    audio.preload = "auto";
    audio.setAttribute("playsinline", "true");
    audioRef.current = audio;
    return audio;
  }, []);

  useEffect(() => {
    const loadGradioVoice = async () => {
      // With default voices enabled in the backend, we can assume it's always ready
      setGradioVoiceReady(true);
    };

    const onVoiceChanged = () => loadGradioVoice();
    loadGradioVoice();
    window.addEventListener("caliguia:voice-cloned", onVoiceChanged);
    return () => window.removeEventListener("caliguia:voice-cloned", onVoiceChanged);
  }, [status]);

  // ── Load real browser voices + filter by current language ─────────────────
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    const loadVoices = () => {
      const sysVoices = window.speechSynthesis.getVoices();
      if (!sysVoices.length) return;

      const caliVoices = buildVoicesForLanguage(sysVoices, language);
      setAvailableVoices(caliVoices);

      // Restore saved selection for this language or pick best default
      const savedId = localStorage.getItem(`caliguia_voice_${language}`);
      if (savedId && caliVoices.find(v => v.id === savedId)) {
        setSelectedVoiceId(savedId);
      } else if (caliVoices.length > 0) {
        setSelectedVoiceId(caliVoices[0].id);
      } else {
        setSelectedVoiceId("");
      }
    };

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, [language]); // Re-runs when language changes → shows correct voices

  // ── Load voice preference ─────────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem("caliguia_voice_preference") as any;
    if (saved) setVoicePreference(saved);
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window === "undefined") return;
    window.speechSynthesis?.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setIsSpeaking(false);
    isPlayingRef.current = false;
    utteranceRef.current = null;
  }, []);

  const getNarrationKey = useCallback((event: Pick<NarrationEvent, "type" | "title" | "text">) => {
    const semanticTitle = event.title?.trim().toLowerCase();
    if (semanticTitle && event.type !== "chat") return `${event.type}:${semanticTitle}`;
    return `${event.type}:${event.text.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 140)}`;
  }, []);

  const notifyVoicePlaybackError = useCallback((event: NarrationEvent, error?: unknown) => {
    const message = error instanceof Error ? error.message : "Voice generation failed";
    console.warn("[VoiceNarrator]", message);
    window.dispatchEvent(new CustomEvent("caliguia:voice-playback-error", {
      detail: { reason: "voice-generation-failed", narration: event, message },
    }));
  }, []);

  const playNext = useCallback(() => {
    if (muted || !queueRef.current.length || isPlayingRef.current) return;
    if (!unlockedRef.current) return;
    if (typeof window === "undefined") return;

    const event = queueRef.current.shift()!;
    const eventKey = getNarrationKey(event);
    setCurrentNarration(event);
    isPlayingRef.current = true;
    setIsSpeaking(true);

    const finishAndContinue = () => {
      isPlayingRef.current = false;
      setIsSpeaking(false);
      recentNarrationKeysRef.current.set(eventKey, Date.now());
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
      setTimeout(() => playNext(), 900);
    };

    const audio = ensureAudioElement();
    audio.muted = true;
    audio.src = SILENT_WAV_DATA_URL;
    audio.play().catch(() => { /* ignore */ });
    
    window.dispatchEvent(new CustomEvent("caliguia:voice-status", { 
      detail: { status: "generating", message: "Generando voz..." } 
    }));

    const formData = new FormData();
    formData.append("text", event.text);
    formData.append("language", languageRef.current);
    const activeProviderVoiceId = localStorage.getItem(ACTIVE_PROVIDER_VOICE_STORAGE_KEY);
    if (status !== "authenticated" && activeProviderVoiceId?.startsWith("system:")) {
      formData.append("activeProviderVoiceId", activeProviderVoiceId);
    }

    fetch("/api/voice/speech", {
      method: "POST",
      body: formData,
    })
      .then(async res => {
        // Clear "Generating..." status
        window.dispatchEvent(new CustomEvent("caliguia:voice-status", { 
          detail: { status: "ready", message: "" } 
        }));
        if (!res.ok) {
          const errorBody = await res.json().catch(() => null);
          throw new Error(errorBody?.message || errorBody?.error || `Voice generation failed (${res.status})`);
        }
        
        const audioBlob = await res.blob();
        if (!audioBlob.size) {
          throw new Error("F5-TTS devolvió un audio vacío");
        }

        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current);
        }

        const audioUrl = URL.createObjectURL(audioBlob);
        audioUrlRef.current = audioUrl;
        audio.pause();
        audio.muted = false;
        audio.src = audioUrl;
        audio.onended = finishAndContinue;
        audio.onerror = () => {
          notifyVoicePlaybackError(event, audio.error || new Error("No se pudo reproducir el audio generado"));
          finishAndContinue();
        };

        return audio.play();
      })
      .catch(error => {
        if (!isPlayingRef.current) return;
        notifyVoicePlaybackError(event, error);
        finishAndContinue();
      });
  }, [muted, status, gradioVoiceReady, ensureAudioElement, notifyVoicePlaybackError, getNarrationKey]); // Uses refs for selected language/current voice sample

  const speak = useCallback(
    (event: Omit<NarrationEvent, "id">) => {
      const now = Date.now();
      const narrationKey = getNarrationKey(event);
      for (const [key, timestamp] of recentNarrationKeysRef.current) {
        if (now - timestamp > RECENT_NARRATION_TTL_MS) {
          recentNarrationKeysRef.current.delete(key);
        }
      }

      if (event.type !== "danger") {
        const isAlreadyQueued = queueRef.current.some((queued) => getNarrationKey(queued) === narrationKey);
        const recentTimestamp = recentNarrationKeysRef.current.get(narrationKey);
        if (isAlreadyQueued || (recentTimestamp && now - recentTimestamp < RECENT_NARRATION_TTL_MS)) {
          return;
        }
      }

      const narration: NarrationEvent = {
        ...event,
        id: crypto.randomUUID(),
        spokenAt: now,
      };

      if (event.type === "danger") {
        queueRef.current = [narration, ...queueRef.current];
        stopSpeaking();
        setTimeout(() => playNext(), 120);
      } else {
        recentNarrationKeysRef.current.set(narrationKey, now);
        queueRef.current = queueRef.current.slice(-Math.max(0, MAX_PENDING_NARRATIONS - 1));
        queueRef.current.push(narration);
        playNext();
      }

      if (event.title) {
        setExperienceLog((prev) => {
          const recent = prev.find(
            (e) => e.title === event.title && Date.now() - (e.spokenAt ?? 0) < 60_000
          );
          if (recent) return prev;
          return [narration, ...prev].slice(0, 20);
        });
      }
    },
    [getNarrationKey, playNext, stopSpeaking]
  );

  const unlockSpeech = useCallback((granted: boolean) => {
    const pref = granted ? "granted" : "denied";
    localStorage.setItem("caliguia_voice_preference", pref);
    setVoicePreference(pref);

    if (granted) {
      unlockedRef.current = true;
      setSpeechUnlocked(true);
      const audio = ensureAudioElement();
      audio.muted = true;
      audio.src = SILENT_WAV_DATA_URL;
      audio.play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
          audio.removeAttribute("src");
          audio.load();
        })
        .catch(() => {
          audio.muted = false;
        });
      const silent = new SpeechSynthesisUtterance(" ");
      silent.volume = 0;
      window.speechSynthesis.speak(silent);
      setTimeout(() => playNext(), 100);
    }
  }, [ensureAudioElement, playNext]);

  const setVoice = useCallback((id: string) => {
    setSelectedVoiceId(id);
    localStorage.setItem(`caliguia_voice_${languageRef.current}`, id);
  }, []);

  const previewVoice = useCallback((id: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const voice = availableVoicesRef.current.find(v => v.id === id);
    if (!voice) return;
    const previews: Record<LanguageCode, string> = {
      es: "Hola, soy tu guía en Cali.",
      en: "Hello, I am your guide in Cali.",
      pt: "Olá, sou o seu guia em Cali.",
    };
    const u = new SpeechSynthesisUtterance(previews[languageRef.current] ?? previews.es);
    u.voice = voice.systemVoice;
    u.lang = voice.lang;
    u.rate = 0.92;
    window.speechSynthesis.speak(u);
  }, []);

  useEffect(() => {
    if (muted) stopSpeaking();
  }, [muted, stopSpeaking]);

  return {
    isSpeaking,
    currentNarration,
    experienceLog,
    speechUnlocked,
    voicePreference,
    selectedVoiceId,
    availableVoices,
    setVoice,
    previewVoice,
    speak,
    stopSpeaking,
    unlockSpeech,
    clearLog: () => setExperienceLog([]),
    voiceReady: gradioVoiceReady,
  };
}

export async function fetchNarration(
  prompt: string,
  type: NarrationType,
  language: LanguageCode = "es",
  messages?: { role: "user" | "assistant" | "system"; content: string }[]
): Promise<string | null> {
  try {
    const res = await fetch("/api/narrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, type, language, messages }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.text as string) || null;
  } catch {
    return null;
  }
}
