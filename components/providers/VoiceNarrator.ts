"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type NarrationType = "monument" | "route" | "danger" | "info" | "welcome";

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
}

function pickSpanishVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const priority = [
    (v: SpeechSynthesisVoice) => v.lang === "es-CO",
    (v: SpeechSynthesisVoice) =>
      v.lang.startsWith("es-") && ["MX", "AR", "CO", "US"].some((c) => v.lang.includes(c)),
    (v: SpeechSynthesisVoice) => v.lang.startsWith("es"),
  ];
  for (const test of priority) {
    const match = voices.find(test);
    if (match) return match;
  }
  return null;
}

export interface CaliVoice {
  id: string;
  name: string;
  gender: "male" | "female";
  label: string;
}

const CALI_VOICES: CaliVoice[] = [
  { id: "male-1", name: "Juan", gender: "male", label: "Juan (Hombre Caleño)" },
  { id: "female-1", name: "Lina", gender: "female", label: "Lina (Mujer Caleña)" },
  { id: "male-2", name: "Andrés", gender: "male", label: "Andrés (Parce Caleño)" },
  { id: "female-2", name: "Sofi", gender: "female", label: "Sofi (Caleñita)" },
];

export function useVoiceNarrator({ muted = false }: UseVoiceNarratorOptions = {}) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentNarration, setCurrentNarration] = useState<NarrationEvent | null>(null);
  const [experienceLog, setExperienceLog] = useState<NarrationEvent[]>([]);
  const [speechUnlocked, setSpeechUnlocked] = useState(false);
  const [voicePreference, setVoicePreference] = useState<"granted" | "denied" | "unknown">("unknown");
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("male-1");

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const queueRef = useRef<NarrationEvent[]>([]);
  const isPlayingRef = useRef(false);
  const unlockedRef = useRef(false);

  // Load preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("caliguia_voice_preference") as any;
    if (saved) setVoicePreference(saved);
    const savedVoice = localStorage.getItem("caliguia_selected_voice");
    if (savedVoice) setSelectedVoiceId(savedVoice);
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    isPlayingRef.current = false;
    utteranceRef.current = null;
  }, []);

  const playNext = useCallback(() => {
    if (muted || !queueRef.current.length || isPlayingRef.current) return;
    if (!unlockedRef.current) return; 
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    const event = queueRef.current.shift()!;
    setCurrentNarration(event);
    isPlayingRef.current = true;
    setIsSpeaking(true);

    window.speechSynthesis.resume();

    const utterance = new SpeechSynthesisUtterance(event.text);
    utterance.lang = "es-CO";
    utterance.rate = 0.92;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const selectedCaliVoice = CALI_VOICES.find(v => v.id === selectedVoiceId) || CALI_VOICES[0];
    
    // Map our labels to the best system voices
    const isFemale = selectedCaliVoice.gender === "female";
    const spanishVoices = voices.filter(v => v.lang.startsWith("es"));
    
    let bestMatch = spanishVoices.find(v => v.lang === "es-CO");
    if (!bestMatch) {
        // Find by gender keywords in name if possible, or just pick one
        const genderMatch = spanishVoices.find(v => 
            isFemale ? (v.name.includes("Female") || v.name.includes("Mujer") || v.name.includes("Helena") || v.name.includes("Laura")) 
                     : (v.name.includes("Male") || v.name.includes("Hombre") || v.name.includes("Pablo") || v.name.includes("Raul"))
        );
        bestMatch = genderMatch || spanishVoices[0];
    }

    if (bestMatch) utterance.voice = bestMatch;

    utterance.onend = () => {
      isPlayingRef.current = false;
      setIsSpeaking(false);
      setTimeout(() => playNext(), 900);
    };
    utterance.onerror = () => {
      isPlayingRef.current = false;
      setIsSpeaking(false);
      setTimeout(() => playNext(), 900);
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [muted, selectedVoiceId]);

  const speak = useCallback(
    (event: Omit<NarrationEvent, "id">) => {
      const narration: NarrationEvent = {
        ...event,
        id: crypto.randomUUID(),
        spokenAt: Date.now(),
      };

      if (event.type === "danger") {
        queueRef.current = [narration, ...queueRef.current];
        stopSpeaking();
        setTimeout(() => playNext(), 120);
      } else {
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
    [playNext, stopSpeaking]
  );

  const unlockSpeech = useCallback((granted: boolean) => {
    const pref = granted ? "granted" : "denied";
    localStorage.setItem("caliguia_voice_preference", pref);
    setVoicePreference(pref);

    if (granted) {
      unlockedRef.current = true;
      setSpeechUnlocked(true);
      const silent = new SpeechSynthesisUtterance(" ");
      silent.volume = 0;
      window.speechSynthesis.speak(silent);
      setTimeout(() => playNext(), 100);
    }
  }, [playNext]);

  const setVoice = useCallback((id: string) => {
    setSelectedVoiceId(id);
    localStorage.setItem("caliguia_selected_voice", id);
    // Restart current speaking if any? Maybe not to avoid interruption
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
    availableVoices: CALI_VOICES,
    setVoice,
    speak,
    stopSpeaking,
    unlockSpeech,
    clearLog: () => setExperienceLog([]),
  };
}

export async function fetchNarration(prompt: string, type: NarrationType): Promise<string | null> {
  try {
    const res = await fetch("/api/narrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, type }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.text as string) || null;
  } catch {
    return null;
  }
}
