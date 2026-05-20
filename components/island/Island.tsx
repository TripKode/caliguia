"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { signIn, signOut, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import {
  LANGUAGES,
  LANGUAGE_CONFIGURED_STORAGE_KEY,
  type LanguageCode,
  useExperience,
} from "../providers/ExperienceProvider";
import { useMap } from "@/hooks/UseMap";
import { saveActiveVoiceSample } from "@/components/providers/voiceSampleStore";
import { getVoiceReferenceText, VOICE_REFERENCE_VERSION } from "@/lib/voice-reference";
import {
  TOURISM_INTERESTS,
  normalizeTravelProfile,
  type CityVibe,
  type Pace,
  type TourismInterestId,
  type TravelGroup,
  type TravelProfile,
  type TravelStyle,
} from "@/lib/travel-profile";
import { Play, Mic, Trash2, MoreVertical, Check, RefreshCw, ChevronLeft, BadgeCheck, Plus, AlertTriangle, History, Route, MapPin } from "lucide-react";
import type { RouteHistoryEntry } from "@/components/map/types";

// ─── Types ─────────────────────────────────────────────────────────────────
interface Message {
  role: "user" | "assistant";
  content: string;
  id: string;
}

interface AIFloatingIslandProps {
  /** Context to inject into the system prompt (e.g. current location, zona, negocios) */
  context?: string;
  /** External mute state */
  isMuted?: boolean;
  /** Callback to toggle mute */
  onToggleMute?: () => void;
  /** Fuerza las ondas de audio activas cuando el AR está narrando un monumento */
  isScanningAR?: boolean;
}

// ─── Constants ─────────────────────────────────────────────────────────────
const BAR_COUNT = 5;
const VOICE_SAMPLE_SECONDS = 12;
const ACTIVE_PROVIDER_VOICE_STORAGE_KEY = "caliguia_active_provider_voice_id";
const FLOATING_ISLAND_CHAT_NAME = "floating_island";
const FLOATING_ISLAND_CHAT_STORAGE_KEY = "caliguia_chat_floating_island";
const RISK_CONTEXT_LABELS = {
  safe: "segura",
  low: "baja",
  medium: "moderada",
  high: "alta",
} as const;
const LANGUAGE_OPTIONS: Array<{ code: LanguageCode; label: string; flag: string; name: string }> = [
  { code: "es", label: "ES", flag: "co", name: "Español" },
  { code: "en", label: "EN", flag: "us", name: "Inglés" },
  { code: "pt", label: "PT", flag: "br", name: "Portugués" },
];
const PROFILE_INTEREST_IDS = Object.keys(TOURISM_INTERESTS) as TourismInterestId[];
const TRAVEL_GROUP_OPTIONS: Array<{ id: TravelGroup; labelKey: string }> = [
  { id: "solo", labelKey: "groupSolo" },
  { id: "pareja", labelKey: "groupPareja" },
  { id: "familia", labelKey: "groupFamilia" },
  { id: "grupo", labelKey: "groupGrupo" },
];
const PACE_OPTIONS: Array<{ id: Pace; labelKey: string }> = [
  { id: "tranquilo", labelKey: "paceTranquilo" },
  { id: "rapido", labelKey: "paceRapido" },
];
function getFallbackVoiceReading(language: LanguageCode) {
  return getVoiceReferenceText(language);
}

function getMessageLandmarkTags(content: string) {
  return Array.from(content.matchAll(/\[\[(.*?)\]\]/g))
    .map(match => match[1]?.trim())
    .filter((name): name is string => Boolean(name));
}

function getMessageTextWithoutTags(content: string) {
  return content
    .replace(/\[\[.*?\]\]/g, "")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function loadFloatingIslandGuestChat(): Message[] {
  try {
    const raw = localStorage.getItem(FLOATING_ISLAND_CHAT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveFloatingIslandGuestChat(messages: Message[]) {
  localStorage.setItem(FLOATING_ISLAND_CHAT_STORAGE_KEY, JSON.stringify(messages));
}

function getSafetyAlertText(currentComuna: any) {
  if (!currentComuna || !["medium", "high"].includes(currentComuna.risk)) return "";
  if (currentComuna.risk === "high") {
    return `Estás en ${currentComuna.name}, una zona de riesgo alto. Mantente en vías principales y cuida tus pertenencias.`;
  }
  return `Estás en ${currentComuna.name}, una zona de riesgo moderado. Muévete con atención y prefiere áreas concurridas.`;
}

// ─── Component ─────────────────────────────────────────────────────────────
export function AIFloatingIsland({ context, isMuted: externalMuted, onToggleMute, isScanningAR = false }: AIFloatingIslandProps) {
  const t = useTranslations("Island");
  const { data: session, status, update } = useSession();
  const { language, setLanguage } = useExperience();
  const {
    experienceMode,
    setExperienceMode,
    verbosity,
    setVerbosity,
    narratorSpeaking,
    coords,
    currentComuna,
    comunas,
    places,
  } = useMap();

  const toggleExperienceMode = () => setExperienceMode(experienceMode === "ar" ? "map" : "ar");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [showVoiceDropdown, setShowVoiceDropdown] = useState(false);
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState<LanguageCode | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [barHeights, setBarHeights] = useState<number[]>(Array(BAR_COUNT).fill(4));
  const [showMenu, setShowMenu] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showLanguageSetupModal, setShowLanguageSetupModal] = useState(false);
  const [languageSetupSaving, setLanguageSetupSaving] = useState(false);
  const [languageSetupError, setLanguageSetupError] = useState("");
  const [showVoiceSetupModal, setShowVoiceSetupModal] = useState(false);
  const [userProfile, setUserProfile] = useState<TravelProfile | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaveStatus, setProfileSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [voiceCloneStatus, setVoiceCloneStatus] = useState<"idle" | "recording" | "uploading" | "generating" | "ready" | "error">("idle");
  const [voiceCloneMessage, setVoiceCloneMessage] = useState("");
  const [voiceReadingText, setVoiceReadingText] = useState("");
  const [isGeneratingVoiceText, setIsGeneratingVoiceText] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [userVoices, setUserVoices] = useState<any[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(true);
  const [activeVoiceId, setActiveVoiceId] = useState<string | null>(null);
  const [openVoiceMenuId, setOpenVoiceMenuId] = useState<string | null>(null);
  const [voiceIdToReplace, setVoiceIdToReplace] = useState<string | null>(null);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [profileView, setProfileView] = useState<"profile" | "history">("profile");
  const [routeHistory, setRouteHistory] = useState<RouteHistoryEntry[]>([]);
  const [isLoadingRouteHistory, setIsLoadingRouteHistory] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const isAuthenticated = status === "authenticated";
  const isAuthLoading = status === "loading";
  const userName = session?.user?.name || session?.user?.email || "Usuario";
  const userInitial = userName.trim().charAt(0).toUpperCase() || "U";
  const activeLanguage = LANGUAGE_OPTIONS.find(option => option.code === language) || LANGUAGE_OPTIONS[0];
  const sessionPreferencesRef = useRef({
    preferredLanguage: session?.preferredLanguage,
    languageConfigured: session?.languageConfigured,
  });
  const updateSessionRef = useRef(update);

  // Load profile from DB (authenticated) or sessionStorage (guest)
  useEffect(() => {
    if (status === "authenticated") {
      // Preferences already fetched in the language check effect below
      // We load from sessionStorage as fast fallback until DB responds
      const cached = sessionStorage.getItem("caliguia_user_profile");
      if (cached) setUserProfile(normalizeTravelProfile(JSON.parse(cached)));
    } else if (status === "unauthenticated") {
      const saved = sessionStorage.getItem("caliguia_user_profile");
      if (saved) setUserProfile(normalizeTravelProfile(JSON.parse(saved)));
    }
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated" && profileView === "history") {
      setProfileView("profile");
    }
  }, [profileView, status]);

  useEffect(() => {
    sessionPreferencesRef.current = {
      preferredLanguage: session?.preferredLanguage,
      languageConfigured: session?.languageConfigured,
    };
    updateSessionRef.current = update;

    // Initialize voice reading text with the correct language
    if (!voiceReadingText) {
      setVoiceReadingText(getFallbackVoiceReading(language));
    }

    // Check if we arrived at the target language
    const changingTo = sessionStorage.getItem("caliguia_changing_language") as LanguageCode | null;
    if (changingTo) {
      if (language === changingTo) {
        sessionStorage.removeItem("caliguia_changing_language");
        setTimeout(() => setTargetLanguage(null), 300); // give it a tiny bit of time to settle
      } else if (!targetLanguage) {
        setTargetLanguage(changingTo);
      }
    }
  }, [session?.languageConfigured, session?.preferredLanguage, update, language, voiceReadingText, targetLanguage]);

  useEffect(() => {
    let cancelled = false;

    if (status === "unauthenticated") {
      const hasGuestLanguage = sessionStorage.getItem(LANGUAGE_CONFIGURED_STORAGE_KEY) === "true";
      setShowLanguageSetupModal(!hasGuestLanguage);
      setShowProfileModal(hasGuestLanguage);
      return;
    }

    if (status === "authenticated") {
      setShowProfileModal(false);
      fetch("/api/users/me/preferences")
        .then(response => response.ok ? response.json() : null)
        .then(preferences => {
          if (cancelled) return;

          if (preferences) {
            setShowLanguageSetupModal(preferences.languageConfigured === false);
            const sessionPreferences = sessionPreferencesRef.current;
            if (
              sessionPreferences.preferredLanguage !== preferences.preferredLanguage ||
              sessionPreferences.languageConfigured !== preferences.languageConfigured
            ) {
              updateSessionRef.current({
                preferredLanguage: preferences.preferredLanguage,
                languageConfigured: preferences.languageConfigured,
              });
            }
            // Load travel preferences from DB
            if (preferences.travelPreferences) {
              const profile = normalizeTravelProfile(preferences.travelPreferences);
              setUserProfile(profile);
              sessionStorage.setItem("caliguia_user_profile", JSON.stringify(profile));
            }
            return;
          }

          setShowLanguageSetupModal(sessionPreferencesRef.current.languageConfigured === false);
        })
        .catch(() => {
          if (!cancelled) setShowLanguageSetupModal(sessionPreferencesRef.current.languageConfigured === false);
        });
    }

    return () => { cancelled = true; };
  }, [status]);

  useEffect(() => {
    const onVoicePlaybackError = () => {
      setVoiceCloneStatus("error");
      setVoiceCloneMessage("No pude generar la voz ahora. Revisa que F5-TTS local esté activo y vuelve a intentar.");
    };
    const onVoiceStatusChange = (e: any) => {
      if (e.detail?.status) setVoiceCloneStatus(e.detail.status);
      if (e.detail?.message !== undefined) setVoiceCloneMessage(e.detail.message);
    };
    const onOpenProfile = () => setShowProfileModal(true);
    window.addEventListener("caliguia:voice-playback-error", onVoicePlaybackError);
    window.addEventListener("caliguia:voice-status", onVoiceStatusChange);
    window.addEventListener("caliguia:open-profile", onOpenProfile);
    return () => {
      window.removeEventListener("caliguia:voice-playback-error", onVoicePlaybackError);
      window.removeEventListener("caliguia:voice-status", onVoiceStatusChange);
    };
  }, []);

  const fetchVoices = useCallback(async () => {
    setIsLoadingVoices(true);
    try {
      const res = await fetch("/api/users/me/voices");
      const data = await res.json();
      if (data.voices) {
        setUserVoices(data.voices);
        const savedGuestVoiceId = localStorage.getItem(ACTIVE_PROVIDER_VOICE_STORAGE_KEY);
        setActiveVoiceId(data.activeVoiceId || savedGuestVoiceId || data.voices[0]?.id || null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingVoices(false);
    }
  }, [status]);

  const loadRouteHistory = useCallback(async () => {
    setIsLoadingRouteHistory(true);
    try {
      const localRaw = localStorage.getItem("caliguia_route_history");
      const localRoutes = localRaw ? JSON.parse(localRaw) : [];
      if (Array.isArray(localRoutes)) setRouteHistory(localRoutes);

      if (status === "authenticated") {
        const res = await fetch("/api/users/me/route-history");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.routes)) setRouteHistory(data.routes);
        }
      }
    } catch {
      setRouteHistory([]);
    } finally {
      setIsLoadingRouteHistory(false);
    }
  }, [status]);

  const selectVoice = useCallback(async (voiceId: string) => {
    setActiveVoiceId(voiceId);
    localStorage.setItem(ACTIVE_PROVIDER_VOICE_STORAGE_KEY, voiceId);

    // Clear local cache for voice samples to avoid the "2620 bytes" conflict
    await saveActiveVoiceSample(null as any);

    if (status === "authenticated") {
      try {
        await fetch("/api/users/me/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activeProviderVoiceId: voiceId }),
        });
        // Dispatch event for components that listen to voice changes (like VoiceNarrator)
        window.dispatchEvent(new CustomEvent("caliguia:voice-cloned"));
      } catch (e) {
        console.error("[Island] Failed to save voice preference:", e);
      }
    }
  }, [status]);

  useEffect(() => {
    if (showVoiceDropdown) {
      fetchVoices();
    }
  }, [showVoiceDropdown, fetchVoices]);

  // Load chat history if authenticated
  useEffect(() => {
    if (!showInput || messages.length > 0) return;

    if (status === "authenticated") {
      const guestMessages = loadFloatingIslandGuestChat();
      if (guestMessages.length > 0) {
        setMessages(guestMessages);
        fetch("/api/users/me/chat-history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ landmarkName: FLOATING_ISLAND_CHAT_NAME, messages: guestMessages }),
        })
          .then(res => {
            if (res.ok) localStorage.removeItem(FLOATING_ISLAND_CHAT_STORAGE_KEY);
          })
          .catch(err => console.error("Error migrating floating island chat:", err));
        return;
      }

      fetch(`/api/users/me/chat-history?landmarkName=${encodeURIComponent(FLOATING_ISLAND_CHAT_NAME)}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.messages) setMessages(data.messages);
        })
        .catch(err => console.error("Error loading chat history:", err));
      return;
    }

    if (status === "unauthenticated") {
      setMessages(loadFloatingIslandGuestChat());
    }
  }, [status, showInput, messages.length]);

  useEffect(() => {
    if (status !== "authenticated") return;

    const guestMessages = loadFloatingIslandGuestChat();
    if (guestMessages.length === 0) return;

    fetch("/api/users/me/chat-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ landmarkName: FLOATING_ISLAND_CHAT_NAME, messages: guestMessages }),
    })
      .then(res => {
        if (res.ok) {
          localStorage.removeItem(FLOATING_ISLAND_CHAT_STORAGE_KEY);
          if (messages.length === 0) setMessages(guestMessages);
        }
      })
      .catch(err => console.error("Error migrating floating island chat:", err));
  }, [status, messages.length]);

  const handleLandmarkClick = (name: string) => {
    window.dispatchEvent(new CustomEvent("caliguia:show-landmark-route", { detail: { name } }));
    setShowInput(false);
  };

  useEffect(() => {
    setVoiceReadingText(getFallbackVoiceReading(language));
  }, [language]);

  const saveProfile = async (profile: TravelProfile) => {
    const normalizedProfile = normalizeTravelProfile(profile);
    setUserProfile(normalizedProfile);
    sessionStorage.setItem("caliguia_user_profile", JSON.stringify(normalizedProfile));

    if (status === "authenticated") {
      setIsSavingProfile(true);
      setProfileSaveStatus("idle");
      try {
        const res = await fetch("/api/users/me/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ travelPreferences: normalizedProfile }),
        });
        setProfileSaveStatus(res.ok ? "saved" : "error");
        if (res.ok) {
          setTimeout(() => {
            setShowProfileModal(false);
            setProfileSaveStatus("idle");
          }, 900);
        }
      } catch {
        setProfileSaveStatus("error");
      } finally {
        setIsSavingProfile(false);
      }
    } else {
      setShowProfileModal(false);
    }
  };

  const generateVoiceReadingText = useCallback(async () => {
    setIsGeneratingVoiceText(true);
    setVoiceReadingText(getFallbackVoiceReading(language));
    setIsGeneratingVoiceText(false);
  }, [language]);

  const chooseSetupLanguage = useCallback(async (nextLanguage: LanguageCode) => {
    setLanguageSetupSaving(true);
    setLanguageSetupError("");

    try {
      const saved = await setLanguage(nextLanguage);
      if (!saved) {
        setLanguageSetupError("No pudimos guardar el idioma. Intenta de nuevo.");
        return;
      }

      setShowLanguageSetupModal(false);
      if (status === "unauthenticated") {
        setShowProfileModal(true);
      }
    } catch {
      setLanguageSetupError("No pudimos guardar el idioma. Intenta de nuevo.");
    } finally {
      setLanguageSetupSaving(false);
    }
  }, [setLanguage, status]);

  const playVoiceSample = useCallback((voiceId: string) => {
    if (playingVoiceId === voiceId) {
      audioRef.current?.pause();
      setPlayingVoiceId(null);
      return;
    }

    // Cleanup previous instance
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.src = "";
      audioRef.current.load(); // Force release
    }

    console.log(`[Island] Playing voice sample: ${voiceId}`);
    const audio = new Audio();

    audio.onended = () => {
      console.log("[Island] Audio playback finished");
      setPlayingVoiceId(null);
    };
    audio.onerror = () => {
      // Only handle error if this is the current active audio
      if (audioRef.current === audio) {
        setPlayingVoiceId(null);
        console.error("[Island] Audio playback error:", audio.error);
      }
    };

    audio.src = `/api/users/me/voices/${voiceId}/audio?t=${Date.now()}`;
    audioRef.current = audio;
    setPlayingVoiceId(voiceId);

    audio.play().catch(e => {
      if (audioRef.current === audio) {
        console.error("[Island] Play failed:", e);
        setPlayingVoiceId(null);
      }
    });
  }, [playingVoiceId]);

  // Sync internal state with external prop or fallback to local
  const [localMuted, setLocalMuted] = useState(false);
  const isMuted = externalMuted !== undefined ? externalMuted : localMuted;
  const toggleMute = onToggleMute || (() => setLocalMuted(m => !m));

  const inputRef = useRef<HTMLInputElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const voiceBtnRef = useRef<HTMLDivElement>(null);
  const languageBtnRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);

  const getOrCreateUserId = useCallback(() => {
    const existing = localStorage.getItem("caliguia_user_id") || sessionStorage.getItem("caliguia_user_id");
    if (existing) {
      sessionStorage.setItem("caliguia_user_id", existing);
      return existing;
    }

    const next = crypto.randomUUID();
    localStorage.setItem("caliguia_user_id", next);
    sessionStorage.setItem("caliguia_user_id", next);
    return next;
  }, []);

  const saveVoiceSample = useCallback(async (audioBlob: Blob) => {
    setVoiceCloneStatus("uploading");
    setVoiceCloneMessage("Validando lectura...");

    const userId = getOrCreateUserId();
    const voiceFile = new File([audioBlob], "caliguia-reference-voice.webm", { type: audioBlob.type || "audio/webm" });
    const validationForm = new FormData();
    validationForm.append("file", voiceFile);
    validationForm.append("referenceText", voiceReadingText);
    validationForm.append("language", language);

    const validationResponse = await fetch("/api/voice/validate-reference", {
      method: "POST",
      body: validationForm,
    });
    const validation = await validationResponse.json().catch(() => null);

    if (!validationResponse.ok || validation?.accepted === false) {
      const score = typeof validation?.match_score === "number"
        ? ` (${Math.round(validation.match_score * 100)}% de coincidencia)`
        : "";
      throw new Error(`Lee el texto tal como aparece y vuelve a grabar${score}.`);
    }

    setVoiceCloneMessage(t("voiceSaving"));
    await saveActiveVoiceSample(audioBlob);

    // If we are re-recording, delete the old voice just before creating the new one
    if (voiceIdToReplace) {
      try {
        await fetch(`/api/users/me/voices/${voiceIdToReplace}`, { method: "DELETE" });
        setVoiceIdToReplace(null); // Clear after deletion
      } catch (err) {
        console.error("Failed to delete voice during replacement", err);
      }
    }

    const formData = new FormData();
    formData.append("file", voiceFile);
    formData.append("userId", session?.user?.id || userId);
    formData.append("displayName", userName);
    formData.append("referenceText", voiceReadingText);
    formData.append("referenceTextVersion", VOICE_REFERENCE_VERSION);

    const response = await fetch("/api/clone-voice", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error("Voice profile save failed");
    }

    sessionStorage.setItem("caliguia_user_id", session?.user?.id || userId);
    window.dispatchEvent(new Event("caliguia:voice-cloned"));
    setVoiceCloneStatus("ready");
    setVoiceCloneMessage(t("voiceReady"));
    setShowVoiceSetupModal(false);
    fetchVoices();
  }, [getOrCreateUserId, session?.user?.id, userName, fetchVoices, voiceIdToReplace, voiceReadingText]);

  const stopVoiceRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    recordingStreamRef.current?.getTracks().forEach(track => track.stop());
    recordingStreamRef.current = null;
    analyserRef.current = null;
  }, []);

  const startVoiceRecording = useCallback(async () => {
    if (voiceCloneStatus === "recording") {
      stopVoiceRecording();
      return;
    }

    try {
      setRecordingSeconds(0);
      setVoiceCloneStatus("recording");
      setVoiceCloneMessage("Grabando...");
      audioChunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      recordingStreamRef.current = stream;

      // --- Setup Visualizer and Recording Destination ---
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 48000 });
      const source = audioCtx.createMediaStreamSource(stream);

      // Create a destination for recording (this ensures we record what we hear)
      const destination = audioCtx.createMediaStreamDestination();

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;

      // Connect: Mic -> Analyser -> Destination
      source.connect(analyser);
      source.connect(destination);

      analyserRef.current = analyser;

      const draw = () => {
        if (!canvasRef.current || !analyserRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyserRef.current.getByteFrequencyData(dataArray);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const barWidth = (canvas.width / bufferLength) * 2.5;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * canvas.height;
          ctx.fillStyle = `rgba(59, 130, 246, ${0.3 + barHeight / canvas.height})`;
          ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
          x += barWidth + 1;
        }
        animationRef.current = requestAnimationFrame(draw);
      };
      draw();
      // --------------------------------------------------

      // Use the stream from the destination, not the raw mic stream
      const recorderStream = destination.stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";

      const recorder = new MediaRecorder(recorderStream, mimeType ? { mimeType } : {});
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = event => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          console.log("[Island] Data available:", event.data.size, "total chunks:", audioChunksRef.current.length);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
        console.log("[Island] Recording stopped. Final blob size:", audioBlob.size, "Mime:", recorder.mimeType);
        audioChunksRef.current = [];

        if (audioBlob.size < 5000) {
          console.error("[Island] Recorded audio is too small:", audioBlob.size);
          setVoiceCloneStatus("error");
          setVoiceCloneMessage("Error: No se capturó audio. Revisa los permisos del micrófono.");
          return;
        }

        saveVoiceSample(audioBlob).catch((error) => {
          setVoiceCloneStatus("error");
          setVoiceCloneMessage(error instanceof Error ? error.message : t("voiceError"));
        });
      };

      recorder.start(1000);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds(prev => {
          const next = prev + 1;
          if (next >= VOICE_SAMPLE_SECONDS) stopVoiceRecording();
          return next;
        });
      }, 1000);
    } catch {
      setVoiceCloneStatus("error");
      setVoiceCloneMessage(t("voiceMicError"));
    }
  }, [stopVoiceRecording, saveVoiceSample, voiceCloneStatus]);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
      recordingStreamRef.current?.getTracks().forEach(track => track.stop());
    };
  }, []);

  // ── Bar animation ─────────────────────────────────────────────────────────
  // Si el AR está escaneando/narrando, o la voz principal está hablando, forzar las ondas
  const isActivelyNarrating = isScanningAR || isSpeaking || narratorSpeaking;

  useEffect(() => {
    if (isMuted || !isActivelyNarrating) {
      setBarHeights(Array(BAR_COUNT).fill(3));
      return;
    }

    const animate = () => {
      setBarHeights(
        Array.from({ length: BAR_COUNT }, (_, i) => {
          const base = 4;
          const amplitude = i === 2 ? 18 : i === 1 || i === 3 ? 14 : 9;
          return base + Math.abs(Math.sin(Date.now() / (120 + i * 30))) * amplitude;
        })
      );
      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [isActivelyNarrating, isMuted]);

  // ── Show input → focus ────────────────────────────────────────────────────
  useEffect(() => {
    if (showInput) setTimeout(() => inputRef.current?.focus(), 80);
  }, [showInput]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setShowMenu(false);
      }
      if (!voiceBtnRef.current?.contains(event.target as Node)) {
        setShowVoiceDropdown(false);
      }
      if (!languageBtnRef.current?.contains(event.target as Node)) {
        setShowLanguageDropdown(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, []);

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { role: "user", content: text, id: crypto.randomUUID() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    if (status !== "authenticated") {
      saveFloatingIslandGuestChat(newMessages);
    }
    setInputValue("");
    setIsLoading(true);
    setIsSpeaking(false);

    const currentRiskLabel = currentComuna
      ? RISK_CONTEXT_LABELS[currentComuna.risk as keyof typeof RISK_CONTEXT_LABELS] || currentComuna.risk
      : "desconocida";
    const highRiskComunas = comunas
      .filter(comuna => comuna.risk === "high")
      .slice(0, 8)
      .map(comuna => `${comuna.name}: ${comuna.description}`)
      .join(" | ");
    const nearbyPlaces = places.slice(0, 6).map(place => place.name).join(", ");
    const safetyContext = `
      Contexto de seguridad y ubicación actual:
      ${coords ? `Coordenadas actuales: lat ${coords.lat.toFixed(5)}, lng ${coords.lng.toFixed(5)}, precisión ${Math.round(coords.accuracy)}m.` : "El usuario aún no compartió coordenadas precisas."}
      ${currentComuna ? `Comuna actual: ${currentComuna.name}. Riesgo: ${currentRiskLabel}. Descripción de seguridad: ${currentComuna.description}. Barrios conocidos: ${currentComuna.barrios?.slice?.(0, 8).join(", ") || "sin barrios cargados"}.` : "No se detectó comuna actual."}
      Mapa de calor y comunas: las comunas con riesgo alto pesan más en el heatmap de seguridad. Comunas de alta precaución: ${highRiskComunas || "sin datos de alta precaución cargados"}.
      Lugares/negocios cercanos detectados: ${nearbyPlaces || "sin lugares cercanos cargados"}.
      Instrucción de seguridad: si el usuario está en riesgo alto o moderado, incluye una alerta breve, amable y no alarmista antes de recomendar rutas o lugares. Recomienda vías principales, zonas concurridas, cuidar pertenencias y evitar caminar solo de noche cuando aplique.
    `;

    try {
      const response = await fetch("/api/narrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "chat",
          language,
          messages: newMessages.map(m => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content
          })),
          prompt: `
            ${userProfile ? `Perfil del usuario: Segmentos turísticos: ${userProfile.tourismSegments.join(", ")}. Intereses: ${userProfile.interests.join(", ")}. Estilo: ${userProfile.style}. Vibe: ${userProfile.vibe}. Grupo: ${userProfile.travelGroup}. Ritmo: ${userProfile.pace}. Must-go sugeridos: ${userProfile.mustGo.join(", ")}.` : ""}
            Contexto de ubicación/entorno: ${context || "Explorando la ciudad de Cali"}
            ${safetyContext}
            Responde con tono amable, cercano y natural, como si estuvieras acompañando a la persona con calma.
            Si vas a recomendar lugares, no integres sus nombres dentro de la frase principal. Escribe primero un mensaje humano sin nombres de lugares, y al final agrega solo las recomendaciones en formato [[Nombre exacto del lugar]].
          `
        }),
      });

      if (!response.ok) {
        throw new Error("Chat request failed");
      }

      const data = await response.json();
      const reply = data.text || "Sin respuesta.";

      const assistantMsg: Message = { role: "assistant", content: reply, id: crypto.randomUUID() };
      const finalMessages = [...newMessages, assistantMsg];
      setMessages(finalMessages);
      if (status !== "authenticated") {
        saveFloatingIslandGuestChat(finalMessages);
      }
      setIsSpeaking(true);

      // Persist to DB if authenticated
      if (status === "authenticated") {
        fetch("/api/users/me/chat-history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ landmarkName: FLOATING_ISLAND_CHAT_NAME, messages: finalMessages })
        }).catch(err => console.error("Error persisting general chat:", err));
      }

      const speakMs = Math.min(Math.max(reply.length * 55, 2000), 8000);
      setTimeout(() => setIsSpeaking(false), speakMs);
    } catch (error) {
      console.error("Chat error:", error);
      const assistantMsg: Message = {
        role: "assistant",
        content: "Error de conexión. Intenta de nuevo.",
        id: crypto.randomUUID(),
      };
      setMessages(prev => {
        const next = [...prev, assistantMsg];
        if (status !== "authenticated") saveFloatingIslandGuestChat(next);
        return next;
      });
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, messages, isLoading, context, language, status, userProfile, coords, currentComuna, comunas, places]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") sendMessage();
    if (e.key === "Escape") setShowInput(false);
  };

  const clearChat = useCallback(() => {
    setMessages([]);
    if (status === "authenticated") {
      fetch(`/api/users/me/chat-history?landmarkName=${encodeURIComponent(FLOATING_ISLAND_CHAT_NAME)}`, { method: "DELETE" })
        .catch(err => console.error("Error clearing chat history:", err));
    } else {
      localStorage.removeItem(FLOATING_ISLAND_CHAT_STORAGE_KEY);
    }
  }, [status]);


  const LANGUAGE_CHANGING_TEXT: Record<LanguageCode, string> = {
    es: "Cambiando idioma a Español...",
    en: "Changing language to English...",
    pt: "Mudando idioma para Português...",
  };

  return (
    <>{/* Root Fragment */}
      <AnimatePresence>
        {targetLanguage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-9999 flex flex-col items-center justify-center bg-white/80 backdrop-blur-md pointer-events-auto"
          >
            <div className="w-12 h-12 rounded-full border-4 border-blue-500/30 border-t-blue-600 animate-spin mb-4" />
            <h2 className="text-xl font-black text-zinc-800 tracking-tight">
              {LANGUAGE_CHANGING_TEXT[targetLanguage]}
            </h2>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute left-1/2 top-2 -translate-x-1/2 z-30 flex flex-col items-center gap-2 pointer-events-none sm:top-3"
        style={{ width: "min(420px, calc(100vw - 32px))" }}
      >
        <div
          className="pointer-events-auto w-full"
          style={{
            background: "rgba(255,255,255,0.82)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(0,0,0,0.07)",
            borderRadius: "20px",
            padding: "10px 12px",
          }}
        >
          <div className="flex items-center gap-3">
            <img
              src="https://res.cloudinary.com/dqluumk10/image/upload/v1768316985/TripCode/Logos/luc79qy6rewoqovhxwrz.png"
              alt="Escudo de Santiago de Cali"
              className="w-7 h-7 object-contain shrink-0 opacity-90 drop-shadow-sm"
            />
            <div ref={voiceBtnRef} className="relative">
              <button
                type="button"
                onClick={() => setShowVoiceDropdown(!showVoiceDropdown)}
                className="shrink-0 flex items-center justify-center rounded-[14px] transition-all duration-300 active:scale-95"
                style={{
                  width: 40, height: 40,
                  background: isActivelyNarrating && !isMuted
                    ? "linear-gradient(135deg, #f8fafc 0%, #f0f9ff 100%)"
                    : "rgba(248,250,252,1)",
                  border: `1.5px solid ${isActivelyNarrating && !isMuted ? "rgba(59,130,246,0.15)" : "rgba(0,0,0,0.04)"}`,
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ transform: "translateY(1px)" }}>
                  <line x1="12" y1="3" x2="12" y2="6" stroke={isActivelyNarrating && !isMuted ? "#3b82f6" : "#94a3b8"} strokeWidth="1.8" strokeLinecap="round" />
                  <circle cx="12" cy="3" r="1.2" fill={isActivelyNarrating && !isMuted ? "#3b82f6" : "#94a3b8"} />
                  <rect x="4" y="6" width="16" height="12" rx="3.5" fill={isActivelyNarrating && !isMuted ? "#3b82f6" : "#94a3b8"} fillOpacity="0.1" />
                  <rect x="4" y="6" width="16" height="12" rx="3.5" stroke={isActivelyNarrating && !isMuted ? "#3b82f6" : "#94a3b8"} strokeWidth="1.6" />
                  <circle cx="9" cy="12" r="1.8" fill={isActivelyNarrating && !isMuted ? "#3b82f6" : "#94a3b8"} />
                  <circle cx="15" cy="12" r="1.8" fill={isActivelyNarrating && !isMuted ? "#3b82f6" : "#94a3b8"} />
                  <path d="M9 15.5 Q12 17 15 15.5" stroke={isActivelyNarrating && !isMuted ? "#3b82f6" : "#94a3b8"} strokeWidth="1.4" strokeLinecap="round" fill="none" />
                  <rect x="9" y="18" width="6" height="2" rx="1" fill={isActivelyNarrating && !isMuted ? "#3b82f6" : "#94a3b8"} fillOpacity="0.4" />
                </svg>
              </button>

              <AnimatePresence>
                {showVoiceDropdown && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 8 }}
                    className="absolute left-0 top-[calc(100%+8px)] z-50 w-64 bg-white/97 backdrop-blur-xl border border-black/5 rounded-2xl p-2 shadow-2xl pointer-events-auto"
                    style={{ maxHeight: "320px", overflowY: "auto" }}
                  >
                    <div className="flex items-center justify-between px-1.5 py-1">
                      <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
                        {t("aiVoice")}
                      </p>
                      <p className="text-[9px] font-black text-zinc-300">
                        ({userVoices.filter(v => !v.isSystem).length}/3)
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowVoiceDropdown(false);
                        setShowVoiceSetupModal(true);
                      }}
                      disabled={status !== "authenticated" || voiceCloneStatus === "uploading" || voiceCloneStatus === "recording" || voiceCloneStatus === "generating" || userVoices.filter(v => !v.isSystem).length >= 3}
                      className={`mt-1 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-3 text-[12px] font-black transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 ${voiceCloneStatus === "recording"
                        ? "bg-red-500 text-white shadow-lg shadow-red-500/20"
                        : status !== "authenticated"
                          ? "bg-zinc-200 text-zinc-500"
                          : userVoices.filter(v => !v.isSystem).length >= 3
                          ? "bg-zinc-200 text-zinc-500"
                          : "bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                        }`}
                    >
                      {voiceCloneStatus === "uploading" || voiceCloneStatus === "generating" ? (
                        <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                      ) : (
                        <Mic className="w-3.5 h-3.5" />
                      )}
                      {voiceCloneStatus === "recording"
                        ? t("recording", { time: `${Math.floor(recordingSeconds / 60)}:${String(recordingSeconds % 60).padStart(2, "0")}` })
                        : voiceCloneStatus === "generating"
                          ? "Generando voz..."
                          : userVoices.filter(v => !v.isSystem).length >= 3
                            ? "Límite de 3 voces clonadas"
                            : t("recordVoice")}
                    </button>
                    {isLoadingVoices ? (
                      <div className="mt-2 space-y-2 px-1">
                        <div className="h-10 w-full animate-pulse rounded-xl bg-zinc-100" />
                        <div className="h-20 w-full animate-pulse rounded-xl bg-zinc-50" />
                      </div>
                    ) : userVoices.length > 0 ? (
                      <div className="mt-2 rounded-xl border border-black/5 bg-zinc-50 p-2">
                        <AnimatePresence mode="wait">
                          {openVoiceMenuId ? (
                            <motion.div
                              key="options"
                              initial={{ opacity: 0, x: 10 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: -10 }}
                              className="flex flex-col"
                            >
                              <div className="flex items-center justify-between mb-3">
                                <button
                                  onClick={() => setOpenVoiceMenuId(null)}
                                  className="flex items-center gap-1 text-[10px] font-black text-blue-600 hover:text-blue-700"
                                >
                                  <ChevronLeft className="w-3 h-3" /> VOLVER
                                </button>
                                <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Opciones de voz</span>
                              </div>

                              <div className="grid grid-cols-1 gap-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    playVoiceSample(openVoiceMenuId);
                                  }}
                                  className="flex items-center gap-2 rounded-lg bg-white border border-black/5 px-3 py-2.5 text-[11px] font-bold text-zinc-600 shadow-sm hover:bg-zinc-50"
                                >
                                  {playingVoiceId === openVoiceMenuId ? (
                                    <div className="w-3.5 h-3.5 flex items-center justify-center gap-px">
                                      <motion.div animate={{ height: [4, 10, 4] }} transition={{ repeat: Infinity, duration: 0.5 }} className="w-[2px] bg-blue-500" />
                                      <motion.div animate={{ height: [10, 4, 10] }} transition={{ repeat: Infinity, duration: 0.5, delay: 0.1 }} className="w-[2px] bg-blue-500" />
                                      <motion.div animate={{ height: [4, 10, 4] }} transition={{ repeat: Infinity, duration: 0.5, delay: 0.2 }} className="w-[2px] bg-blue-500" />
                                    </div>
                                  ) : (
                                    <Play className="w-3.5 h-3.5 text-blue-500" />
                                  )}
                                  {playingVoiceId === openVoiceMenuId ? "Detener" : "Reproducir"}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const idToReplace = openVoiceMenuId;
                                    setVoiceIdToReplace(idToReplace);
                                    setShowVoiceDropdown(false);
                                    setShowVoiceSetupModal(true);
                                    setOpenVoiceMenuId(null);
                                  }}
                                  className="flex items-center gap-2 rounded-lg bg-white border border-black/5 px-3 py-2.5 text-[11px] font-bold text-zinc-600 shadow-sm hover:bg-zinc-50"
                                >
                                  <RefreshCw className="w-3.5 h-3.5 text-emerald-500" /> Regrabar
                                </button>
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const idToDelete = openVoiceMenuId;
                                    setOpenVoiceMenuId(null);
                                    await fetch(`/api/users/me/voices/${idToDelete}`, { method: "DELETE" });
                                    fetchVoices();
                                  }}
                                  className="flex items-center gap-2 rounded-lg bg-white border border-black/5 px-3 py-2.5 text-[11px] font-bold text-red-600 shadow-sm hover:bg-red-50"
                                >
                                  <Trash2 className="w-3.5 h-3.5" /> Eliminar
                                </button>
                                <div className="h-px bg-black/5 my-1" />
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const voice = userVoices.find(v => v.id === openVoiceMenuId);
                                    if (voice) {
                                      await selectVoice(voice.providerVoiceId);
                                      setOpenVoiceMenuId(null);
                                    }
                                  }}
                                  className="flex items-center justify-between rounded-lg bg-white border border-black/5 px-3 py-2.5 text-[11px] font-bold text-zinc-600 shadow-sm hover:bg-zinc-50"
                                >
                                  <div className="flex items-center gap-2">
                                    <Check className={`w-3.5 h-3.5 ${activeVoiceId === userVoices.find(v => v.id === openVoiceMenuId)?.providerVoiceId ? "text-blue-500" : "text-zinc-300"}`} />
                                    <span>Voz Principal</span>
                                  </div>
                                  <div className={`w-6 h-3.5 rounded-full flex items-center transition-colors px-0.5 ${activeVoiceId === userVoices.find(v => v.id === openVoiceMenuId)?.providerVoiceId ? "bg-blue-500" : "bg-zinc-300"}`}>
                                    <div className={`w-2.5 h-2.5 rounded-full bg-white transition-transform ${activeVoiceId === userVoices.find(v => v.id === openVoiceMenuId)?.providerVoiceId ? "translate-x-2.5" : "translate-x-0"}`} />
                                  </div>
                                </button>
                              </div>
                            </motion.div>
                          ) : (
                            <motion.div
                              key="list"
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: 10 }}
                              className="flex flex-col gap-1"
                            >
                              {/* --- Oficial Voices Section --- */}
                              {userVoices.some(v => v.isSystem) && (
                                <>
                                  <p className="mb-1 px-1.5 text-[9px] font-black uppercase tracking-widest text-blue-500">Voces de la Casa</p>
                                  {userVoices.filter(v => v.isSystem).map(voice => (
                                    <div
                                      key={voice.id}
                                      onClick={() => selectVoice(voice.id)}
                                      className={`cursor-pointer relative flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[11px] font-bold transition-all ${activeVoiceId === voice.id ? "bg-blue-100 text-blue-700" : "text-zinc-600 hover:bg-zinc-200/50"
                                        }`}
                                    >
                                      <span className="flex items-center truncate pr-2">
                                        <BadgeCheck className="w-3.5 h-3.5 mr-2 text-blue-600" />
                                        {voice.name}
                                      </span>
                                      {activeVoiceId === voice.id && <Check className="w-3.5 h-3.5" />}
                                    </div>
                                  ))}
                                  <div className="my-1 h-px bg-zinc-100" />
                                </>
                              )}

                              {/* --- Custom Voices Section --- */}
                              {status === "authenticated" && (
                                <>
                                  <p className="mb-1 px-1.5 text-[9px] font-black uppercase tracking-widest text-zinc-400">Tus Voces Clonadas</p>
                                  {userVoices.filter(v => !v.isSystem).map(voice => (
                                    <div
                                      key={voice.id}
                                      onClick={() => selectVoice(voice.providerVoiceId)}
                                      className={`cursor-pointer relative flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[11px] font-bold transition-all ${activeVoiceId === voice.providerVoiceId ? "bg-blue-100 text-blue-700" : "text-zinc-600 hover:bg-zinc-200/50"
                                        }`}
                                    >
                                      <span className="truncate pr-2">
                                        {new Date(voice.createdAt).toLocaleDateString()} - {voice.providerVoiceId?.slice(-4) || "Voz"}
                                      </span>

                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setOpenVoiceMenuId(voice.id);
                                        }}
                                        className="p-1 rounded-md hover:bg-black/10 transition-colors"
                                      >
                                        <MoreVertical className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  ))}
                                </>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ) : (
                      <div className="mt-2 min-h-9 rounded-xl bg-zinc-50 px-3 py-2 text-center">
                        <p className={`text-[11px] font-bold ${voiceCloneStatus === "ready" ? "text-emerald-600" :
                          voiceCloneStatus === "error" ? "text-red-500" :
                            voiceCloneStatus === "generating" ? "text-blue-600" :
                              "text-zinc-500"
                          }`}>
                          {voiceCloneStatus === "recording"
                            ? `Grabando ${Math.floor(recordingSeconds / 60)}:${String(recordingSeconds % 60).padStart(2, "0")}`
                            : voiceCloneStatus === "generating"
                              ? voiceCloneMessage || "Generando voz..."
                              : voiceCloneMessage || t("voiceHint")}
                        </p>
                      </div>
                    )}

                    {/* Selector de frecuencia de charla (Verbosidad) */}
                    <div className="mt-2 border-t border-black/5 pt-2 pb-1 px-1">
                      <p className="mb-2 px-1.5 text-[9px] font-black uppercase tracking-widest text-zinc-400">
                        {t("talkFrequency")}
                      </p>
                      <div className="flex bg-zinc-100/80 rounded-[10px] p-1 shadow-inner border border-black/5">
                        <button
                          onClick={(e) => { e.stopPropagation(); setVerbosity("mucho"); }}
                          className={`flex-1 text-[10px] font-bold py-1.5 rounded-md transition-all ${verbosity === 'mucho' ? 'bg-white text-blue-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                          title="Habla muy seguido (cada 2 min)"
                        >
                          {t("much")}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setVerbosity("normal"); }}
                          className={`flex-1 text-[10px] font-bold py-1.5 rounded-md transition-all ${verbosity === 'normal' ? 'bg-white text-blue-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                          title="Habla normal (cada 4 min)"
                        >
                          {t("normal")}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setVerbosity("poco"); }}
                          className={`flex-1 text-[10px] font-bold py-1.5 rounded-md transition-all ${verbosity === 'poco' ? 'bg-white text-blue-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                          title="Solo lo básico (cada 8 min)"
                        >
                          {t("little")}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center justify-center gap-[3px] flex-1" style={{ height: 28 }}>
              {barHeights.map((h, i) => (
                <div
                  key={i}
                  className="rounded-full transition-none"
                  style={{
                    width: 3,
                    height: `${h}px`,
                    background: isMuted ? "#e2e8f0" : isActivelyNarrating ? `rgba(59,130,246,${0.4 + (i === 2 ? 0.5 : i === 1 || i === 3 ? 0.35 : 0.2)})` : "#e2e8f0",
                    transition: "height 60ms linear, background 300ms ease",
                    alignSelf: "center",
                  }}
                />
              ))}
            </div>

            <div ref={menuRef} className="relative flex items-center gap-1.5 shrink-0">

              {/* Mute button — Mobile & Desktop */}
              <button
                onClick={toggleMute}
                className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors border ${isMuted ? "bg-red-50 border-red-200" : "bg-black/4 border-black/6 hover:bg-black/6"
                  }`}
                title={isMuted ? "Activar sonido" : "Silenciar"}
              >
                {isMuted ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="1" y1="1" x2="23" y2="23" />
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  </svg>
                )}
              </button>

              {/* Chat toggle button — All devices */}
              <button
                onClick={() => setShowInput(s => !s)}
                className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors border ${showInput ? "bg-blue-500/10 border-blue-500/20" : "bg-black/4 border-black/6 hover:bg-black/6"
                  }`}
                title="Hablar con el agente"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={showInput ? "#3b82f6" : "#6b7280"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </button>

              {/* Desktop-only Direct Action Buttons */}
              <div className="hidden md:flex items-center gap-1.5">
                <div className="w-px h-4 bg-black/5 mx-0.5" />

                {/* AR Button */}
                <button
                  onClick={toggleExperienceMode}
                  className={`h-8 min-w-10 rounded-xl flex items-center justify-center gap-1 px-2 transition-colors border ${experienceMode === "ar" ? "bg-blue-500 text-white border-blue-600 shadow-sm" : "bg-black/4 border-black/6 hover:bg-black/6 text-zinc-500"
                    }`}
                  title={t("arMode")}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 8.5a2.5 2.5 0 0 1 2.5-2.5h11A2.5 2.5 0 0 1 20 8.5v7a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 15.5v-7Z" />
                    <path d="M8 12h8" />
                    <path d="M12 8v8" />
                  </svg>
                  <span className="text-[10px] font-black tracking-wide">AR</span>
                </button>

                {/* Language Selector */}
                <div ref={languageBtnRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setShowLanguageDropdown(open => !open)}
                    className="flex h-8 min-w-[54px] items-center justify-center gap-1.5 rounded-xl border border-black/6 bg-black/4 px-2 text-[10px] font-black text-zinc-600 transition-colors hover:bg-black/6"
                    title={t("language")}
                  >
                    <span className={`fi fi-${activeLanguage.flag} rounded-[2px] text-[12px]`} />
                    <span>{activeLanguage.label}</span>
                  </button>
                  <AnimatePresence>
                    {showLanguageDropdown && (
                      <motion.div
                        initial={{ opacity: 0, y: -4, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.98 }}
                        transition={{ duration: 0.16, ease: "easeOut" }}
                        className="absolute right-0 top-[calc(100%+8px)] z-50 w-36 rounded-2xl border border-black/[0.07] bg-white/95 p-1.5 shadow-xl shadow-zinc-900/10 backdrop-blur-xl"
                      >
                        {LANGUAGE_OPTIONS.map(option => (
                          <button
                            key={option.code}
                            type="button"
                            onClick={() => {
                              setTargetLanguage(option.code);
                              sessionStorage.setItem("caliguia_changing_language", option.code);
                              setLanguage(option.code);
                            }}
                            className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[12px] font-bold transition-colors ${language === option.code ? "bg-blue-50 text-blue-600" : "text-zinc-600 hover:bg-zinc-50"
                              }`}
                          >
                            <span className={`fi fi-${option.flag} rounded-[2px] text-[13px]`} />
                            <span>{option.name}</span>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Login/Profile Button */}
                <button
                  onClick={() => {
                    setProfileView("profile");
                    setShowProfileModal(true);
                  }}
                  title={t("travelProfile")}
                  className="w-8 h-8 overflow-hidden rounded-full bg-linear-to-tr from-blue-500 to-blue-400 flex items-center justify-center shadow-sm border border-white/20 hover:shadow-md transition-all active:scale-95"
                >
                  {session?.user?.image ? (
                    <img src={session.user.image} alt={userName} className="h-full w-full object-cover" />
                  ) : isAuthenticated ? (
                    <span className="text-[11px] font-black text-white">{userInitial}</span>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  )}
                </button>
              </div>

              {/* Mobile-only Menu Toggle */}
              <button
                type="button"
                onClick={() => setShowMenu(open => !open)}
                className="flex h-8 w-8 md:hidden items-center justify-center rounded-xl border border-black/6 bg-black/4 transition-colors hover:bg-black/6"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={showMenu ? "#3b82f6" : "#6b7280"} strokeWidth="2.2" strokeLinecap="round">
                  <line x1="4" y1="7" x2="20" y2="7" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="4" y1="17" x2="20" y2="17" />
                </svg>
              </button>

              {/* Mobile-only Dropdown */}
              <AnimatePresence>
                {showMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.98 }}
                    transition={{ duration: 0.16, ease: "easeOut" }}
                    className="md:hidden absolute right-0 top-[calc(100%+12px)] z-50 w-56 rounded-2xl border border-black/[0.07] bg-white/95 p-3 shadow-xl shadow-zinc-900/10 backdrop-blur-xl"
                  >
                    <div className="flex items-center justify-between mb-4 px-1">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setProfileView("profile"); setShowProfileModal(true); setShowMenu(false); }}
                          className="w-8 h-8 overflow-hidden rounded-full bg-linear-to-tr from-blue-500 to-blue-400 flex items-center justify-center shadow-sm border border-white/20"
                        >
                          {session?.user?.image ? (
                            <img src={session.user.image} alt={userName} className="h-full w-full object-cover" />
                          ) : isAuthenticated ? (
                            <span className="text-[11px] font-black text-white">{userInitial}</span>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                              <circle cx="12" cy="7" r="4" />
                            </svg>
                          )}
                        </button>
                      </div>
                      {isAuthenticated && (
                        <button
                          type="button"
                          onClick={() => {
                            setProfileView("history");
                            loadRouteHistory();
                            setShowProfileModal(true);
                            setShowMenu(false);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-zinc-600 transition-colors hover:bg-zinc-50"
                        >
                          <History className="h-3.5 w-3.5" />
                          <span>Historial</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (isAuthenticated) {
                            signOut();
                          } else {
                            signIn("google");
                          }
                          setShowMenu(false);
                        }}
                        disabled={isAuthLoading}
                        className="inline-flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-1.5 text-[11px] font-black text-blue-600 transition-colors hover:bg-blue-100 disabled:cursor-wait disabled:opacity-60"
                      >
                        {!isAuthenticated && (
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" aria-hidden="true">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38z" />
                          </svg>
                        )}
                        <span>{isAuthenticated ? t("signOut") : t("google")}</span>
                      </button>
                    </div>
                    <div className="h-px bg-black/5 mx-[-12px] mb-4" />
                    <button
                      type="button"
                      onClick={() => { toggleExperienceMode(); setShowMenu(false); }}
                      className={`mb-3 flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition-colors ${experienceMode === "ar" ? "border-blue-500/20 bg-blue-500/8 text-blue-600" : "border-black/[0.07] bg-zinc-50 text-zinc-700"}`}
                    >
                      <span className="text-[12px] font-semibold">Realidad Aumentada</span>
                      <span className={`relative h-5 w-9 rounded-full transition-colors ${experienceMode === "ar" ? "bg-blue-500" : "bg-zinc-300"}`}>
                        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${experienceMode === "ar" ? "translate-x-[18px]" : "translate-x-0.5"}`} />
                      </span>
                    </button>
                    <div className="flex items-center justify-end px-1">
                      <div className="flex rounded-xl border border-black/[0.07] bg-zinc-50 p-1">
                        {LANGUAGE_OPTIONS.map(option => (
                          <button
                            key={option.code}
                            type="button"
                            onClick={() => {
                              setTargetLanguage(option.code);
                              sessionStorage.setItem("caliguia_changing_language", option.code);
                              setLanguage(option.code);
                            }}
                            className={`flex h-7 items-center gap-1.5 rounded-lg px-2 text-[10px] font-black transition-colors ${language === option.code ? "bg-white text-blue-600 shadow-sm" : "text-zinc-500"
                              }`}
                            title={option.name}
                          >
                            <span className={`fi fi-${option.flag} rounded-[2px] text-[11px]`} />
                            <span>{option.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div style={{ overflow: "hidden", maxHeight: showInput ? "300px" : "0px", opacity: showInput ? 1 : 0, transition: "max-height 0.28s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease" }}>
            {showInput && getSafetyAlertText(currentComuna) && (
              <div className={`mt-3 flex items-start gap-2 rounded-2xl border px-3 py-2 ${currentComuna?.risk === "high" ? "border-red-100 bg-red-50 text-red-700" : "border-amber-100 bg-amber-50 text-amber-700"}`}>
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.6} />
                <p className="text-[11px] font-bold leading-relaxed">
                  {getSafetyAlertText(currentComuna)}
                </p>
              </div>
            )}
            {messages.length > 0 && (
              <div className="mt-3 flex flex-col gap-1.5 max-h-[160px] overflow-y-auto px-0.5 no-scrollbar">
                {messages.map(m => {
                  const landmarkTags = m.role === "assistant" ? getMessageLandmarkTags(m.content) : [];
                  const displayText = m.role === "assistant" ? getMessageTextWithoutTags(m.content) : m.content;
                  return (
                    <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className="flex max-w-[90%] flex-col gap-1.5">
                        {displayText && (
                          <div className="px-3 py-1.5 rounded-2xl text-[11px] font-medium leading-relaxed" style={{ background: m.role === "user" ? "#3b82f6" : "rgba(0,0,0,0.05)", color: m.role === "user" ? "white" : "#374151", borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px" }}>
                            {displayText}
                          </div>
                        )}
                        {landmarkTags.length > 0 && (
                          <div className="flex flex-col gap-1 pl-1">
                            {landmarkTags.map((name, idx) => (
                              <div
                                key={`${name}-${idx}`}
                                className="flex items-center justify-between gap-2 rounded-xl border border-blue-100 bg-blue-50 px-2 py-1.5 text-blue-700 shadow-sm"
                              >
                                <span className="min-w-0 truncate text-[11px] font-black">{name}</span>
                                <button
                                  type="button"
                                  onClick={() => handleLandmarkClick(name)}
                                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-700"
                                  title="Ver patrimonio"
                                >
                                  <Plus className="h-3.5 w-3.5" strokeWidth={3} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex items-center gap-2 mt-3" style={{ background: "rgba(0,0,0,0.04)", borderRadius: "12px", border: "1px solid rgba(0,0,0,0.07)", padding: "4px 4px 4px 12px" }}>
              <input ref={inputRef} type="text" value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyDown={handleKey} placeholder={t("askAgent")} className="flex-1 text-base bg-transparent text-[12px] text-zinc-700 outline-none font-medium" />
              {messages.length > 0 && (
                <button onClick={clearChat} title="Limpiar chat" className="w-7 h-7 rounded-[9px] flex items-center justify-center shrink-0 hover:bg-black/5 transition-colors">
                  <Trash2 className="w-3.5 h-3.5 text-zinc-400 hover:text-red-500 transition-colors" />
                </button>
              )}
              <button onClick={sendMessage} disabled={!inputValue.trim() || isLoading} className="w-7 h-7 rounded-[9px] flex items-center justify-center shrink-0" style={{ background: inputValue.trim() && !isLoading ? "#3b82f6" : "rgba(0,0,0,0.07)" }}>
                {isLoading ? <div className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={inputValue.trim() ? "white" : "#9ca3af"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>}
              </button>
            </div>
          </div>
        </div>

        <style jsx>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
      `}</style>
      </div>

      <AnimatePresence>
        {showLanguageSetupModal && (
          <div className="fixed inset-0 z-115 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
            />
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 18 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 18 }}
              className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl pointer-events-auto"
            >
              <h3 className="text-xl font-black text-zinc-800">{t("chooseLanguageTitle")}</h3>
              <p className="mt-1 text-[13px] font-medium leading-relaxed text-zinc-500">
                {t("chooseLanguageBody")}
              </p>
              <div className="mt-5 grid grid-cols-1 gap-2">
                {LANGUAGE_OPTIONS.map(option => (
                  <button
                    key={option.code}
                    type="button"
                    onClick={() => chooseSetupLanguage(option.code)}
                    disabled={languageSetupSaving}
                    className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all ${language === option.code ? "border-blue-200 bg-blue-50 text-blue-700" : "border-zinc-100 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
                      } disabled:cursor-wait disabled:opacity-70`}
                  >
                    <span className={`fi fi-${option.flag} rounded-[3px] text-[18px]`} />
                    <span className="text-[13px] font-black">{option.name}</span>
                    {languageSetupSaving && language === option.code && (
                      <span className="ml-auto h-4 w-4 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
                    )}
                  </button>
                ))}
              </div>
              {languageSetupError && (
                <p className="mt-3 text-center text-[12px] font-bold text-red-500">
                  {languageSetupError}
                </p>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showVoiceSetupModal && (
          <div className="fixed inset-0 z-115 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowVoiceSetupModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
            />
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 18 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 18 }}
              className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl pointer-events-auto"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-black text-zinc-800">{t("voiceTitle")}</h3>
                  <p className="mt-1 text-[13px] font-medium leading-relaxed text-zinc-500">
                    {t("voiceBody")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowVoiceSetupModal(false)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 transition-colors hover:text-zinc-600"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <div className="mt-5 relative overflow-hidden rounded-2xl border border-blue-100 bg-blue-50/50">
                {voiceCloneStatus === "recording" && (
                  <canvas
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full opacity-20 pointer-events-none"
                    width={400}
                    height={120}
                  />
                )}
                <div className="relative px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-400">{t("readForTen")}</p>
                    <button
                      type="button"
                      onClick={generateVoiceReadingText}
                      disabled={isGeneratingVoiceText || voiceCloneStatus === "recording" || voiceCloneStatus === "uploading"}
                      className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-white px-2.5 text-[10px] font-black text-blue-600 shadow-sm transition-colors hover:bg-blue-100 disabled:cursor-wait disabled:opacity-60"
                    >
                      {isGeneratingVoiceText ? (
                        <span className="h-3 w-3 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 3v3" />
                          <path d="M12 18v3" />
                          <path d="M3 12h3" />
                          <path d="M18 12h3" />
                          <path d="m5.6 5.6 2.1 2.1" />
                          <path d="m16.3 16.3 2.1 2.1" />
                          <path d="m18.4 5.6-2.1 2.1" />
                          <path d="m7.7 16.3-2.1 2.1" />
                        </svg>
                      )}
                      <span>{t("newVoiceText")}</span>
                    </button>
                  </div>
                  <p className="mt-3 text-[14px] font-bold leading-relaxed text-blue-950">
                    {voiceReadingText}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={startVoiceRecording}
                disabled={voiceCloneStatus === "uploading" || isGeneratingVoiceText}
                className={`mt-5 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-4 text-[14px] font-black text-white shadow-lg transition-all active:scale-[0.98] disabled:cursor-wait disabled:opacity-70 ${voiceCloneStatus === "recording" ? "bg-red-500 shadow-red-500/20" : "bg-blue-600 shadow-blue-500/20 hover:bg-blue-700"
                  }`}
              >
                {voiceCloneStatus === "uploading" ? (
                  <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                ) : voiceCloneStatus === "recording" ? (
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-white animate-pulse" />
                    <span>{t("finishRecording")} ({VOICE_SAMPLE_SECONDS - recordingSeconds}s)</span>
                  </div>
                ) : (
                  <>
                    <Mic className="w-4 h-4" />
                    <span>{t("recordVoice")}</span>
                  </>
                )}
              </button>

              <p className={`mt-3 min-h-5 text-center text-[12px] font-bold ${voiceCloneStatus === "ready" ? "text-emerald-600" :
                voiceCloneStatus === "error" ? "text-red-500" :
                  "text-zinc-400"
                }`}>
                {voiceCloneStatus === "recording"
                  ? t("voiceRecordingHint", { time: String(Math.max(VOICE_SAMPLE_SECONDS - recordingSeconds, 0)) })
                  : voiceCloneMessage || t("voiceHint")}
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Profiling Modal - Outside transformed parent for perfect centering */}
      <AnimatePresence>
        {showProfileModal && (
          <div className="fixed inset-0 z-110 flex items-center justify-center overflow-hidden p-3 sm:p-5">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowProfileModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative flex max-h-[calc(100dvh-24px)] w-full max-w-[min(440px,calc(100vw-24px))] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl pointer-events-auto sm:max-h-[min(760px,calc(100dvh-40px))]"
            >
              <div className="shrink-0 border-b border-zinc-100 bg-white/95 px-5 pb-4 pt-5 backdrop-blur sm:px-6 sm:pt-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 shadow-sm">
                      {session?.user?.image ? (
                        <img
                          src={session.user.image}
                          alt={userName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-linear-to-tr from-blue-500 to-blue-400 text-sm font-black text-white">
                          {userInitial}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-black text-zinc-700">
                        {isAuthenticated ? userName : t("guest")}
                      </p>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        {isAuthenticated ? t("activeSession") : t("signIn")}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setShowProfileModal(false)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 transition-colors hover:text-zinc-600">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-xl font-black text-zinc-800">{t("profileTitle")}</h3>
                    <p className="text-[12px] font-medium text-zinc-400">{t("profileSubtitle")}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {isAuthenticated && (
                      <button
                        type="button"
                        onClick={() => {
                          setProfileView(view => view === "history" ? "profile" : "history");
                          loadRouteHistory();
                        }}
                        className={`inline-flex h-10 items-center justify-center gap-2 rounded-full border px-4 text-[12px] font-black transition-colors ${profileView === "history" ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"}`}
                      >
                        <History className="h-3.5 w-3.5" />
                        <span>Historial</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (isAuthenticated) {
                          signOut();
                        } else {
                          signIn("google");
                        }
                      }}
                      disabled={isAuthLoading}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 text-[12px] font-black text-blue-600 transition-colors hover:bg-blue-100 disabled:cursor-wait disabled:opacity-60"
                    >
                      {!isAuthenticated && (
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" aria-hidden="true">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                          <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38z" />
                        </svg>
                      )}
                      <span>{isAuthenticated ? t("signOut") : t("google")}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                {profileView === "history" ? (
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Rutas recorridas</p>
                      <p className="mt-1 text-[12px] font-medium leading-snug text-zinc-500">
                        Aqui aparecen las rutas que has creado, con su destino, paradas y duracion estimada.
                      </p>
                    </div>
                    {isLoadingRouteHistory ? (
                      <div className="space-y-2">
                        <div className="h-20 animate-pulse rounded-2xl bg-zinc-100" />
                        <div className="h-20 animate-pulse rounded-2xl bg-zinc-100" />
                      </div>
                    ) : routeHistory.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-zinc-200 px-4 py-8 text-center">
                        <Route className="mx-auto h-6 w-6 text-zinc-300" />
                        <p className="mt-3 text-[13px] font-black text-zinc-700">Aun no hay rutas guardadas</p>
                        <p className="mt-1 text-[11px] font-medium text-zinc-400">Crea una ruta a un lugar o emergencia para verla aqui.</p>
                      </div>
                    ) : (
                      routeHistory.map(route => (
                        <div key={route.id} className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-[14px] font-black text-zinc-800">{route.destinationName}</p>
                              <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                                {new Date(route.createdAt).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}
                              </p>
                            </div>
                            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${route.mode === "emergency" ? "bg-red-50 text-red-600" : route.mode === "driving" ? "bg-zinc-100 text-zinc-600" : "bg-blue-50 text-blue-600"}`}>
                              {route.mode === "emergency" ? "Emergencia" : route.mode === "driving" ? "Auto" : "Caminando"}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {route.distanceText && <span className="rounded-full bg-zinc-50 px-2.5 py-1 text-[10px] font-bold text-zinc-500">{route.distanceText}</span>}
                            {route.durationText && <span className="rounded-full bg-zinc-50 px-2.5 py-1 text-[10px] font-bold text-zinc-500">{route.durationText}</span>}
                            <span className="rounded-full bg-zinc-50 px-2.5 py-1 text-[10px] font-bold text-zinc-500">{route.stops.length} paradas</span>
                          </div>
                          <div className="mt-3 border-l-2 border-blue-100 pl-3">
                            {route.stops.length > 0 ? route.stops.map((stop, index) => (
                              <div key={`${route.id}-${stop.name}-${index}`} className="relative pb-2 last:pb-0">
                                <span className="absolute -left-[18px] top-1 h-2.5 w-2.5 rounded-full bg-blue-400 ring-2 ring-white" />
                                <p className="text-[11px] font-bold text-zinc-700">{stop.name}</p>
                                {stop.description && <p className="text-[9px] font-medium uppercase tracking-tight text-zinc-400">{stop.description}</p>}
                              </div>
                            )) : (
                              <div className="flex items-center gap-2 text-[11px] font-bold text-zinc-500">
                                <MapPin className="h-3.5 w-3.5" />
                                Ruta directa al destino.
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                <div className="space-y-5">
                  {/* Interests */}
                  <div>
                    <label className="mb-3 flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-widest text-zinc-400">
                      <span>{t("interests")}</span>
                      {!isAuthenticated && (
                        <span className="shrink-0 text-right normal-case tracking-normal text-blue-500">
                          {t("signInToChoose")}
                        </span>
                      )}
                    </label>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {PROFILE_INTEREST_IDS.map(id => {
                        const item = TOURISM_INTERESTS[id];
                        const isSelected = userProfile?.interests.includes(id);
                        return (
                          <button
                            key={id}
                            disabled={!isAuthenticated}
                            onClick={() => {
                              const current = userProfile?.interests || [];
                              const next = isSelected ? current.filter(i => i !== id) : [...current, id];
                              setUserProfile(prev => normalizeTravelProfile({ ...(prev || {}), interests: next, tourismSegments: next }));
                            }}
                            className={`rounded-2xl border p-3 text-left transition-all ${isSelected ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/20' : 'bg-zinc-50 border-zinc-100 text-zinc-600 hover:bg-zinc-100'
                              } disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-zinc-50`}
                          >
                            <span className="block text-[12px] font-black leading-tight">{t(item.labelKey)}</span>
                            <span className={`mt-1 block text-[10px] font-medium leading-snug ${isSelected ? "text-blue-100" : "text-zinc-400"}`}>
                              {t(item.profileKey)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Travel Style */}
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-3">{t("travelStyle")}</label>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { id: 'caminante', labelKey: 'styleCaminante', descKey: 'styleCaminanteDesc' },
                        { id: 'relajado', labelKey: 'styleRelajado', descKey: 'styleRelajadoDesc' }
                      ] as const).map(item => {
                        const isSelected = userProfile?.style === item.id;
                        return (
                          <button
                            key={item.id}
                            disabled={!isAuthenticated}
                            onClick={() => setUserProfile(prev => normalizeTravelProfile({ ...(prev || {}), style: item.id as TravelStyle }))}
                            className={`p-3 rounded-2xl text-left transition-all border ${isSelected ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-zinc-50 border-zinc-100 text-zinc-600 hover:bg-zinc-100'
                              } disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-zinc-50`}
                          >
                            <div className="text-[13px] font-bold">{t(item.labelKey)}</div>
                            <div className={`text-[10px] font-medium ${isSelected ? 'text-blue-500' : 'text-zinc-400'}`}>{t(item.descKey)}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Vibe */}
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-3">{t("cityMood")}</label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { id: 'tranquilo', emoji: '🧘', titleKey: 'vibeTranquilo' },
                        { id: 'explorador', emoji: '🕵️', titleKey: 'vibeExplorador' },
                        { id: 'fiesta', emoji: '🎉', titleKey: 'vibeFiesta' }
                      ] as const).map(item => {
                        const isSelected = userProfile?.vibe === item.id;
                        return (
                          <button
                            key={item.id}
                            disabled={!isAuthenticated}
                            onClick={() => setUserProfile(prev => normalizeTravelProfile({ ...(prev || {}), vibe: item.id as CityVibe }))}
                            className={`flex flex-col items-center justify-center p-3 rounded-2xl transition-all border ${isSelected ? 'bg-zinc-900 border-zinc-900 text-white shadow-lg' : 'bg-zinc-50 border-zinc-100 text-zinc-400'
                              } disabled:cursor-not-allowed disabled:opacity-45`}
                          >
                            <span className="text-xl mb-1">{item.emoji}</span>
                            <span className="text-[10px] font-bold uppercase tracking-tight">{t(item.titleKey)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Trip shape */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-3">{t("travelGroup")}</label>
                      <div className="grid grid-cols-2 gap-2">
                        {TRAVEL_GROUP_OPTIONS.map(item => {
                          const isSelected = userProfile?.travelGroup === item.id;
                          return (
                            <button
                              key={item.id}
                              disabled={!isAuthenticated}
                              onClick={() => setUserProfile(prev => normalizeTravelProfile({ ...(prev || {}), travelGroup: item.id }))}
                              className={`px-3 py-2 rounded-xl text-[11px] font-black transition-all border ${isSelected ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-zinc-50 border-zinc-100 text-zinc-500 hover:bg-zinc-100'
                                } disabled:cursor-not-allowed disabled:opacity-45`}
                            >
                              {t(item.labelKey)}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-3">{t("pace")}</label>
                      <div className="grid grid-cols-2 gap-2">
                        {PACE_OPTIONS.map(item => {
                          const isSelected = userProfile?.pace === item.id;
                          return (
                            <button
                              key={item.id}
                              disabled={!isAuthenticated}
                              onClick={() => setUserProfile(prev => normalizeTravelProfile({ ...(prev || {}), pace: item.id }))}
                              className={`px-3 py-2 rounded-xl text-[11px] font-black transition-all border ${isSelected ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-zinc-50 border-zinc-100 text-zinc-500 hover:bg-zinc-100'
                                } disabled:cursor-not-allowed disabled:opacity-45`}
                            >
                              {t(item.labelKey)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                </div>
                )}
              </div>
              {/* Save button with status feedback */}
              {profileView === "profile" && <div className="shrink-0 border-t border-zinc-100 bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
                <button
                  onClick={() => saveProfile(userProfile || normalizeTravelProfile({}))}
                  disabled={!isAuthenticated || isSavingProfile}
                  className={`w-full rounded-2xl py-3.5 text-[14px] font-bold shadow-lg transition-all active:scale-95 disabled:cursor-not-allowed disabled:active:scale-100 ${profileSaveStatus === "saved"
                      ? "bg-emerald-500 text-white shadow-emerald-500/20"
                      : profileSaveStatus === "error"
                        ? "bg-red-500 text-white shadow-red-500/20"
                        : "bg-blue-600 text-white shadow-blue-500/20 disabled:bg-zinc-300 disabled:shadow-none"
                    }`}
                >
                  {isSavingProfile
                    ? t("savingPreferences")
                    : profileSaveStatus === "saved"
                      ? t("preferencesSaved")
                      : profileSaveStatus === "error"
                        ? t("preferencesError")
                        : t("savePreferences")
                  }
                </button>
              </div>}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
