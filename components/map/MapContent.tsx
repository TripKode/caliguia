"use client"

import { useEffect, useState, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Webcam from "react-webcam";
import { AIFloatingIsland } from "@/components/island/Island";
import { useMap } from "@/hooks/UseMap";
import { Panel } from "@/components/profile/Panel";
import { type LayerMode } from "@/components/map/types";
import { useARVision } from "@/hooks/useARVision";
import { useExperience } from "@/components/providers/ExperienceProvider";
import { fetchNarration } from "@/components/providers/VoiceNarrator";

function MapContent() {
    const {
        experienceMode,
        webcamRef,
        arFacingMode,
        setArFacingMode,
        applyCameraZoom,
        arZoomLevel,
        setArCameraError,
        swapCameraZoom,
        arZoomSupported,
        arCameraError,
        mapRef,
        aiContext,
        voiceMuted,
        setVoiceMuted,
        layerMode,
        setLayerMode,
        drawerH,
        isDrawerDragging,
        onDrawerPointerDown,
        onDrawerPointerMove,
        onDrawerPointerEnd,
        status,
        coords,
        requestLocation,
        locationError,
        locationDebug,
        voicePreference,
        unlockSpeech,
        speechUnlocked,
        expandedLandmark,
        setExpandedLandmark,
        localLandmarks,
        currentImageIdx,
        setCurrentImageIdx,
        mapInstance,
        routePolylineRef,
        narratorSpeaking,
        currentNarration,
        speak,
        currentComuna,
        places,
        toggle3D
    } = useMap();

    const [is3DActive, setIs3DActive] = useState(true); // El mapa inicia en 3D por defecto
    const [conversation, setConversation] = useState<{ role: 'user' | 'ai', text: string }[]>([]);
    const [userQuestion, setUserQuestion] = useState("");
    const [isAsking, setIsAsking] = useState(false);
    const [routePins, setRoutePins] = useState<any[]>([]);
    const routeMarkersRef = useRef<any[]>([]);



    // Cargar conversación de la sesión al abrir un landmark
    useEffect(() => {
        if (expandedLandmark) {
            const saved = sessionStorage.getItem(`chat_${expandedLandmark}`);
            if (saved) {
                setConversation(JSON.parse(saved));
            } else {
                setConversation([]);
            }
        }
    }, [expandedLandmark]);

    const askAI = async (question: string, landmarkName: string) => {
        if (!question.trim() || isAsking) return;

        const newMsg: { role: 'user' | 'ai', text: string } = { role: 'user', text: question };
        const updatedChat = [...conversation, newMsg];
        setConversation(updatedChat);
        setUserQuestion("");
        setIsAsking(true);

        // ── Construir contexto dinámico ──
        let safetyContext = "";
        if (currentComuna) {
            safetyContext = `Contexto de seguridad: Estamos en ${currentComuna.name}. Nivel de riesgo: ${currentComuna.risk}. ${currentComuna.description}`;
        }

        const nearbyContext = places.length > 0
            ? `Lugares cercanos detectados: ${places.slice(0, 5).map(p => `${p.name} (${p.types?.join(', ') || 'negocio'})`).join(', ')}`
            : "";

        const userProfileRaw = sessionStorage.getItem("caliguia_user_profile");
        const userProfile = userProfileRaw ? JSON.parse(userProfileRaw) : null;
        const profileContext = userProfile
            ? `Perfil del usuario: Intereses: ${userProfile.interests.join(", ")}, Estilo: ${userProfile.style}.`
            : "";

        const prompt = `
            ${safetyContext}
            ${nearbyContext}
            ${profileContext}
            El usuario está viendo información sobre el monumento "${landmarkName}" y pregunta: "${question}".
            Responde como CaliGuía, el guía experto, amable y profesional. 
            Si te preguntan por seguridad, usa el contexto proporcionado con honestidad pero sin alarmar.
            Si te preguntan por recomendaciones (café, comida, etc.), usa la lista de lugares cercanos si es relevante, o recomienda sitios icónicos de este barrio específico.
            Personaliza tu respuesta basándote en los intereses del usuario si es posible.
            Sé breve, natural y fascinante. Máximo 50 palabras.
        `;

        try {
            const response = await fetchNarration(prompt, "info", language || "es");
            if (response) {
                const aiMsg: { role: 'user' | 'ai', text: string } = { role: 'ai', text: response };
                const finalChat = [...updatedChat, aiMsg];
                setConversation(finalChat);
                sessionStorage.setItem(`chat_${landmarkName}`, JSON.stringify(finalChat));
                if (speak) {
                    speak({ type: "info", text: response, title: landmarkName, icon: "💬" });
                }
            }
        } catch (err) {
            console.error("Error asking AI:", err);
        } finally {
            setIsAsking(false);
        }
    };

    const { captureAndAnalyze, isAnalyzing, startAnalysis, stopAnalysis, isReady } = useARVision(webcamRef as React.RefObject<any>);
    const { language } = useExperience();
    const [isARScanning, setIsARScanning] = useState(false);

    useEffect(() => {
        if (experienceMode === "ar" && isReady) {
            startAnalysis(async (detectedText) => {
                // D. Conectar con VoiceNarrator real (no window.speechSynthesis crudo)
                // Activar ondas de la AIFloatingIsland
                setIsARScanning(true);
                try {
                    // El texto ya viene de /api/vision con el geofencing de Cali
                    // Lo pasamos por /api/narrate para darle el tono caleño de CaliGuía
                    const response = await fetch("/api/narrate", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ prompt: detectedText, type: "monument", language }),
                    });
                    if (response.ok) {
                        const data = await response.json();
                        if (data.text) {
                            // Usar el speak() del VoiceNarrator con toda la lógica
                            // de cola de prioridad, voz caleña seleccionada y mute
                            speak({
                                type: "monument",
                                text: data.text,
                                title: detectedText.split(" ").slice(0, 4).join(" "),
                                icon: "🏛️",
                            });
                        }
                    }
                } catch (e) {
                    console.error("AR Narrate error:", e);
                } finally {
                    setIsARScanning(false);
                }
            });
        } else {
            stopAnalysis();
            setIsARScanning(false);
        }
        return () => {
            stopAnalysis();
            setIsARScanning(false);
        };
    }, [experienceMode, isReady, startAnalysis, stopAnalysis, speak, language]);

    return (
        <div className="relative w-full h-dvh overflow-hidden bg-[#f7f6f3] font-sans flex">
            <div className="relative flex-1 h-full overflow-hidden bg-zinc-950">
                <AnimatePresence>
                    {experienceMode === "ar" && (
                        <motion.div
                            key="ar-camera"
                            className="absolute inset-0 z-0 bg-zinc-950"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.24 }}
                        >
                            <Webcam
                                ref={webcamRef}
                                audio={false}
                                mirrored={arFacingMode === "user"}
                                playsInline
                                screenshotFormat="image/jpeg"
                                videoConstraints={{
                                    facingMode: { ideal: arFacingMode },
                                    width: { ideal: 1280 },
                                    height: { ideal: 720 },
                                }}
                                onUserMedia={() => {
                                    setArCameraError(null);
                                    window.setTimeout(() => applyCameraZoom(arZoomLevel), 250);
                                }}
                                onUserMediaError={() => setArCameraError("No pudimos acceder a la cámara. Revisa permisos del navegador.")}
                                className="h-full w-full object-cover"
                            />
                            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0,rgba(0,0,0,0.10)_58%,rgba(0,0,0,0.34)_100%)]" />
                            <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-linear-to-b from-black/30 to-transparent" />
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-linear-to-t from-black/35 to-transparent" />
                            <div className="pointer-events-none absolute left-4 top-24 rounded-full border border-white/20 bg-black/25 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/85 backdrop-blur-md md:left-6">
                                AR
                            </div>
                            <div className="absolute right-4 top-24 flex items-center gap-2 md:right-6">
                                <button
                                    type="button"
                                    onClick={() => setArFacingMode(mode => (mode === "environment" ? "user" : "environment"))}
                                    className="flex h-10 items-center gap-2 rounded-full border border-white/20 bg-black/25 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/90 shadow-lg shadow-black/20 backdrop-blur-md transition-colors hover:bg-black/35"
                                    title="Voltear cámara"
                                >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 12a9 9 0 0 1-15.5 6.2" />
                                        <path d="M3 12a9 9 0 0 1 15.5-6.2" />
                                        <path d="M16 6h3V3" />
                                        <path d="M8 18H5v3" />
                                    </svg>
                                    <span>Flip</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={swapCameraZoom}
                                    className="flex h-10 min-w-14 items-center justify-center rounded-full border border-white/20 bg-black/25 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/90 shadow-lg shadow-black/20 backdrop-blur-md transition-colors hover:bg-black/35 disabled:opacity-45"
                                    title="Cambiar zoom"
                                    disabled={!arZoomSupported}
                                >
                                    x{arZoomLevel === 0.05 ? "0.05" : arZoomLevel}
                                </button>
                            </div>
                            {arCameraError && (
                                <div className="absolute inset-0 flex items-center justify-center px-8 text-center">
                                    <div className="max-w-70 rounded-2xl border border-white/15 bg-black/45 px-4 py-3 text-[12px] font-medium leading-relaxed text-white backdrop-blur-xl">
                                        {arCameraError}
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>

                <div
                    ref={mapRef}
                    className={`absolute inset-0 z-0 h-full w-full transition-opacity duration-300 ${experienceMode === "ar" ? "pointer-events-none opacity-0" : "opacity-100"
                        }`}
                />
                <AIFloatingIsland
                    context={aiContext}
                    isMuted={voiceMuted}
                    onToggleMute={() => setVoiceMuted(m => !m)}
                    isScanningAR={isARScanning || narratorSpeaking}
                />

                {/* Floating Layer Toggles - Visible even with drawer open */}
                {experienceMode !== "ar" && (
                    <div className="absolute right-4 top-20 z-20 flex items-center gap-1 rounded-full bg-white/80 p-0.5 backdrop-blur-md border border-black/5 shadow-lg shadow-black/5 md:left-1/2 md:-translate-x-1/2 md:right-auto md:p-1">
                        {(["risk", "heatmap", "none"] as LayerMode[]).map(mode => (
                            <motion.button
                                key={mode}
                                onClick={() => setLayerMode(mode)}
                                whileTap={{ scale: 0.95 }}
                                className={`px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-tight transition-all md:px-3 md:py-1.5 md:text-[10px] md:tracking-wider ${layerMode === mode
                                    ? "bg-blue-500 text-white shadow-sm shadow-blue-500/20"
                                    : "text-zinc-500 hover:bg-black/5"
                                    }`}
                            >
                                {mode === "risk" ? "Comunas" : mode === "heatmap" ? "Heatmap" : "Oculto"}
                            </motion.button>
                        ))}
                        <div className="w-px h-3 bg-black/10 mx-1" />
                        <motion.button
                            onClick={() => {
                                toggle3D();
                                setIs3DActive(!is3DActive);
                            }}
                            whileTap={{ scale: 0.95 }}
                            className={`px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-tight transition-all md:px-3 md:py-1.5 md:text-[10px] md:tracking-wider ${is3DActive
                                ? "bg-zinc-900 text-white shadow-sm"
                                : "text-zinc-500 hover:bg-black/5"
                                }`}
                        >
                            3D
                        </motion.button>
                    </div>
                )}
            </div>

            {/* Desktop sidebar */}
            <div className="hidden md:flex w-85 h-full bg-[#f7f6f3] border-l border-black/6 flex-col shrink-0 z-10">
                <Panel />
            </div>

            <div
                className="md:hidden absolute bottom-0 left-0 right-0 z-20 flex flex-col bg-[#f7f6f3] rounded-t-2xl border-t border-black/6 shadow-[0_-18px_45px_rgba(15,23,42,0.08)] will-change-[height]"
                style={{
                    height: `${drawerH}px`,
                    paddingBottom: "env(safe-area-inset-bottom)",
                    transition: isDrawerDragging ? "none" : "height 0.25s cubic-bezier(0.4,0,0.2,1)",
                }}
            >
                <div
                    className="flex h-10 shrink-0 touch-none select-none items-center justify-center cursor-grab active:cursor-grabbing"
                    onPointerDown={onDrawerPointerDown}
                    onPointerMove={onDrawerPointerMove}
                    onPointerUp={onDrawerPointerEnd}
                    onPointerCancel={onDrawerPointerEnd}
                    onLostPointerCapture={onDrawerPointerEnd}
                >
                    <div className="w-9 h-1 rounded-full bg-zinc-300" />
                </div>
                <div className="min-h-0 flex-1 touch-pan-y overscroll-contain">
                    <Panel />
                </div>
            </div>


            {(status === "idle" || status === "loading" || status === "error") && !coords && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-[#f7f6f3]/95 px-8 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-500 text-2xl text-white shadow-lg shadow-blue-500/20">
                        📍
                    </div>
                    <div>
                        <p className="text-[16px] font-bold text-zinc-850">Activa tu ubicación</p>
                        <p className="mt-2 max-w-70 text-[13px] leading-relaxed text-zinc-500">
                            CaliGuía usa tu posición para mostrar negocios cercanos y tu zona actual.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => requestLocation()}
                        onPointerUp={() => requestLocation()}
                        onTouchEnd={() => requestLocation()}
                        disabled={status === "loading"}
                        className="touch-manipulation rounded-full bg-blue-500 px-5 py-3 text-[13px] font-bold text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-blue-600 disabled:cursor-wait disabled:bg-blue-400"
                    >
                        {status === "loading" ? "Solicitando permiso..." : "Usar mi ubicación"}
                    </button>
                    {locationError && (
                        <p className="max-w-70 text-[12px] leading-relaxed text-red-500">
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
                    <p className="text-[13px] text-red-500 font-medium text-center max-w-65 leading-relaxed">
                        {locationError ?? "Acceso denegado. Actívalo en la configuración de tu navegador y recarga la página."}
                    </p>
                    <button
                        type="button"
                        onClick={() => requestLocation()}
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

            {/* ── Immersive Splash Screen / Audio Unlocker ── */}
            <AnimatePresence>
                {(!speechUnlocked && !voiceMuted) && (
                    <motion.div
                        className="absolute inset-0 z-100 flex flex-col items-center justify-center bg-black/40 backdrop-blur-md px-6"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, backdropFilter: "blur(0px)", transition: { duration: 0.4 } }}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            className="w-full max-w-sm bg-white/95 rounded-[32px] p-8 shadow-2xl text-center border border-white/50 relative overflow-hidden"
                        >
                            {/* Decorative background glow */}
                            <div className="absolute -top-20 -left-20 w-40 h-40 bg-blue-400/20 rounded-full blur-3xl" />
                            <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-purple-400/20 rounded-full blur-3xl" />

                            <div className="relative">
                                <div className="w-20 h-20 bg-linear-to-tr from-blue-500 to-blue-400 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-blue-500/30 border border-blue-400/50">
                                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                                        <line x1="12" y1="19" x2="12" y2="22" />
                                        <line x1="8" y1="22" x2="16" y2="22" />
                                    </svg>
                                </div>

                                <h2 className="text-2xl font-black text-zinc-800 mb-2 tracking-tight">
                                    {voicePreference === "unknown" ? "Conoce a CaliGuía" : "¡Hola de nuevo!"}
                                </h2>

                                <p className="text-[14px] text-zinc-500 font-medium leading-relaxed mb-8">
                                    {voicePreference === "unknown"
                                        ? "Déjate llevar. Activa el audio para escuchar datos curiosos y la historia de los lugares que vas descubriendo por Cali."
                                        : "Toca para iniciar el recorrido y despertar a tu guía virtual."}
                                </p>

                                <div className="flex flex-col gap-3">
                                    <button
                                        onClick={() => unlockSpeech(true)}
                                        className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-[16px] shadow-lg shadow-blue-500/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 hover:bg-blue-700"
                                    >
                                        {voicePreference === "unknown" ? "Activar Guía de Voz" : "Empezar Recorrido"}
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                    </button>

                                    {voicePreference === "unknown" && (
                                        <button
                                            onClick={() => {
                                                unlockSpeech(false);
                                                setVoiceMuted(true);
                                            }}
                                            className="w-full py-3 text-zinc-400 font-semibold text-[14px] hover:text-zinc-600 active:scale-[0.98] transition-all"
                                        >
                                            No, explorar en silencio
                                        </button>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Landmark Details Modal ── */}
            <AnimatePresence>
                {expandedLandmark && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-110 flex items-center justify-center bg-black/60 backdrop-blur-md px-6"
                        onClick={() => setExpandedLandmark(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="w-full max-w-lg bg-white rounded-4xl max-h-[80vh] overflow-hidden flex flex-col shadow-2xl relative"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {(() => {
                                const landmark = localLandmarks.find(l => l.name === expandedLandmark);
                                if (!landmark) return null;

                                return (
                                    <>
                                        {/* Header with close button */}
                                        <div className="absolute top-4 right-4 z-20">
                                            <button
                                                onClick={() => setExpandedLandmark(null)}
                                                className="w-10 h-10 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/40 transition-colors"
                                            >
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                            </button>
                                        </div>

                                        <div className="overflow-y-auto flex-1">
                                            {/* Image Gallery */}
                                            {landmark.images.length > 0 && (
                                                <div className="relative group">
                                                    <div className="relative aspect-4/3 bg-zinc-100 overflow-hidden">
                                                        <motion.img
                                                            key={currentImageIdx}
                                                            initial={{ opacity: 0 }}
                                                            animate={{ opacity: 1 }}
                                                            src={landmark.images[currentImageIdx]}
                                                            alt={landmark.name}
                                                            className="w-full h-full object-cover"
                                                        />
                                                        <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent" />

                                                        <div className="absolute bottom-6 left-6 right-6 text-white">
                                                            <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 mb-1 block">Patrimonio de Cali</span>
                                                            <h2 className="text-2xl font-black leading-tight">{landmark.name}</h2>
                                                        </div>
                                                    </div>

                                                    {landmark.images.length > 1 && (
                                                        <>
                                                            <button
                                                                onClick={() => setCurrentImageIdx(prev => (prev > 0 ? prev - 1 : landmark.images.length - 1))}
                                                                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/40 transition-all opacity-0 group-hover:opacity-100 z-10"
                                                            >
                                                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m15 18-6-6 6-6" /></svg>
                                                            </button>
                                                            <button
                                                                onClick={() => setCurrentImageIdx(prev => (prev < landmark.images.length - 1 ? prev + 1 : 0))}
                                                                className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/40 transition-all opacity-0 group-hover:opacity-100 z-10"
                                                            >
                                                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m9 18 6-6-6-6" /></svg>
                                                            </button>
                                                            <div className="absolute bottom-4 right-6 flex gap-1">
                                                                {landmark.images.map((_, i) => (
                                                                    <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all ${i === currentImageIdx ? "bg-white w-4" : "bg-white/40"}`} />
                                                                ))}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            )}

                                            <div className="p-8 flex flex-col gap-6">
                                                {/* AI Monologue (Dynamic text) */}
                                                <div className="flex flex-col gap-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                                        <p className="text-[11px] font-black uppercase tracking-widest text-zinc-400">Escuchando a CaliGuía</p>
                                                    </div>

                                                    <div className="min-h-[60px] flex flex-col justify-center">
                                                        <AnimatePresence mode="wait">
                                                            <motion.p
                                                                key={currentNarration?.text || "default"}
                                                                initial={{ opacity: 0, y: 10 }}
                                                                animate={{ opacity: 1, y: 0 }}
                                                                exit={{ opacity: 0, y: -10 }}
                                                                className="text-[15px] text-zinc-800 font-medium leading-relaxed italic"
                                                            >
                                                                {currentNarration?.text || "Toca 'Expandir' para que te cuente un secreto sobre este lugar..."}
                                                            </motion.p>
                                                        </AnimatePresence>
                                                    </div>
                                                </div>

                                                {/* Chat History (Mini version) */}
                                                {conversation.length > 0 && (
                                                    <div className="flex flex-col gap-3 max-h-[150px] overflow-y-auto pr-2 no-scrollbar border-t border-zinc-100 pt-4">
                                                        {conversation.map((msg, i) => (
                                                            <motion.div
                                                                key={i}
                                                                initial={{ opacity: 0, x: msg.role === 'user' ? 10 : -10 }}
                                                                animate={{ opacity: 1, x: 0 }}
                                                                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                                                            >
                                                                <p className={`text-[11px] px-3 py-1.5 rounded-2xl ${msg.role === 'user' ? 'bg-zinc-100 text-zinc-600' : 'bg-blue-50 text-blue-700 font-medium'}`}>
                                                                    {msg.text}
                                                                </p>
                                                            </motion.div>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Recommended Questions */}
                                                <div className="flex flex-wrap gap-2">
                                                    {["¿Cuál es su historia?", "¿Qué hay cerca?", "¿A qué hora cierran?"].map((q) => (
                                                        <button
                                                            key={q}
                                                            onClick={() => askAI(q, landmark.name)}
                                                            className="px-3 py-1.5 rounded-full bg-zinc-50 border border-zinc-100 text-[11px] font-bold text-zinc-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-100 transition-all active:scale-95"
                                                        >
                                                            {q}
                                                        </button>
                                                    ))}
                                                </div>

                                                {/* Input Field */}
                                                <div className="relative mt-2">
                                                    <input
                                                        type="text"
                                                        value={userQuestion}
                                                        onChange={(e) => setUserQuestion(e.target.value)}
                                                        onKeyDown={(e) => e.key === 'Enter' && askAI(userQuestion, landmark.name)}
                                                        placeholder="Pregúntale lo que quieras..."
                                                        className="w-full bg-zinc-100 border-none rounded-2xl px-5 py-4 text-[14px] font-medium focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-zinc-400"
                                                    />
                                                    <button
                                                        onClick={() => askAI(userQuestion, landmark.name)}
                                                        disabled={!userQuestion.trim() || isAsking}
                                                        className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-500/30 active:scale-90 transition-all disabled:opacity-50 disabled:shadow-none"
                                                    >
                                                        {isAsking ? (
                                                            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                                        ) : (
                                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m5 12 7-7 7 7M12 5v14" /></svg>
                                                        )}
                                                    </button>
                                                </div>

                                                <div className="flex flex-col gap-3 mt-4">
                                                    <button
                                                        onClick={async () => {
                                                            if (!coords || !mapInstance.current || !google.maps.importLibrary) return;
                                                            setExpandedLandmark(null);

                                                            // --- Clases de Overlays Dinámicos ---
                                                            class InterestOverlay extends google.maps.OverlayView {
                                                                private div: HTMLDivElement | null = null;
                                                                private isExpanded = false;
                                                                constructor(private pos: { lat: number, lng: number }, private map: google.maps.Map, private name: string, private type: string) {
                                                                    super();
                                                                    this.setMap(map);
                                                                }
                                                                onAdd() {
                                                                    this.div = document.createElement("div");
                                                                    this.div.style.position = "absolute";
                                                                    this.div.style.cursor = "pointer";
                                                                    this.div.style.zIndex = "997";
                                                                    this.render();
                                                                    this.div.onclick = () => {
                                                                        this.isExpanded = !this.isExpanded;
                                                                        this.render();
                                                                    };
                                                                    this.getPanes()!.floatPane.appendChild(this.div);
                                                                }
                                                                render() {
                                                                    if (!this.div) return;
                                                                    const icon = this.type.includes('Parque') ? '🌿' : this.type.includes('Museo') ? '🏛️' : this.type.includes('Salsa') ? '💃' : '📍';

                                                                    if (this.isExpanded) {
                                                                        this.div.innerHTML = `
                                                                            <div style="display:flex;align-items:center;gap:6px;padding:4px 10px 4px 4px;background:white;border-radius:40px;border:2px solid #3b82f6;box-shadow:0 4px 12px rgba(0,0,0,0.15);transform:translateY(-10px);white-space:nowrap">
                                                                                <div style="width:24px;height:24px;border-radius:50%;background:#eff6ff;display:flex;align-items:center;justify-content:center;font-size:12px;">${icon}</div>
                                                                                <span style="font-family:-apple-system,sans-serif;font-size:12px;font-weight:700;color:#1e3a5f">${this.name}</span>
                                                                            </div>
                                                                        `;
                                                                    } else {
                                                                        this.div.innerHTML = `
                                                                            <div style="width:32px;height:32px;background:white;border-radius:50%;border:2px solid #3b82f6;box-shadow:0 2px 8px rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;font-size:16px;">
                                                                                ${icon}
                                                                            </div>
                                                                        `;
                                                                    }
                                                                }
                                                                draw() {
                                                                    const projection = this.getProjection();
                                                                    if (!projection || !this.div) return;
                                                                    const p = projection.fromLatLngToDivPixel(new google.maps.LatLng(this.pos.lat, this.pos.lng));
                                                                    if (p) {
                                                                        this.div.style.left = p.x + "px";
                                                                        this.div.style.top = p.y + "px";
                                                                        this.div.style.transform = "translateX(-50%) translateY(-50%)";
                                                                    }
                                                                }
                                                                onRemove() { this.div?.parentNode?.removeChild(this.div); this.div = null; }
                                                            }

                                                            class DestinationOverlay extends google.maps.OverlayView {
                                                                private div: HTMLDivElement | null = null;
                                                                constructor(private pos: { lat: number, lng: number }, private map: google.maps.Map) {
                                                                    super();
                                                                    this.setMap(map);
                                                                }
                                                                onAdd() {
                                                                    this.div = document.createElement("div");
                                                                    this.div.style.position = "absolute";
                                                                    this.div.style.zIndex = "998";
                                                                    this.div.innerHTML = `
                                                                        <div style="display:flex;align-items:center;gap:6px;padding:5px 12px 5px 5px;background:white;border-radius:40px;border:3px solid #10b981;box-shadow:0 6px 16px rgba(16,185,129,0.3);transform:translateY(-40px);white-space:nowrap">
                                                                            <div style="width:28px;height:28px;border-radius:50%;background:#ecfdf5;border:2px solid #10b981;display:flex;align-items:center;justify-content:center;font-size:14px;">🏁</div>
                                                                            <span style="font-family:-apple-system,sans-serif;font-size:14px;font-weight:900;color:#064e3b">Destino</span>
                                                                        </div>
                                                                        <div style="width:14px;height:14px;background:#10b981;border:3px solid white;border-radius:50%;position:absolute;bottom:0;left:50%;transform:translate(-50%, 50%);"></div>
                                                                    `;
                                                                    this.getPanes()!.floatPane.appendChild(this.div);
                                                                }
                                                                draw() {
                                                                    const projection = this.getProjection();
                                                                    if (!projection || !this.div) return;
                                                                    const p = projection.fromLatLngToDivPixel(new google.maps.LatLng(this.pos.lat, this.pos.lng));
                                                                    if (p) {
                                                                        this.div.style.left = p.x + "px";
                                                                        this.div.style.top = p.y + "px";
                                                                        this.div.style.transform = "translateX(-50%) translateY(-100%)";
                                                                    }
                                                                }
                                                                onRemove() { this.div?.parentNode?.removeChild(this.div); this.div = null; }
                                                            }

                                                            // 1. Obtener perfil del usuario
                                                            const userProfileRaw = sessionStorage.getItem("caliguia_user_profile");
                                                            const userProfile = userProfileRaw ? JSON.parse(userProfileRaw) : { interests: [], style: 'caminante' };

                                                            // 2. Limpiar pines de ruta anteriores
                                                            routeMarkersRef.current.forEach(m => m.setMap(null));
                                                            routeMarkersRef.current = [];

                                                            // 3. Buscar lugares de interés en el camino
                                                            const waypoints: google.maps.DirectionsWaypoint[] = [];
                                                            const interestPoints: any[] = [];

                                                            // Bounding box expandido para encontrar lugares en el trayecto
                                                            const minLat = Math.min(coords.lat, landmark.lat) - 0.002;
                                                            const maxLat = Math.max(coords.lat, landmark.lat) + 0.002;
                                                            const minLng = Math.min(coords.lng, landmark.lng) - 0.002;
                                                            const maxLng = Math.max(coords.lng, landmark.lng) + 0.002;

                                                            // Filtrar landmarks que coincidan con intereses y estén en el área del trayecto
                                                            const relevantLandmarks = localLandmarks.filter(l => {
                                                                const inBox = l.lat >= minLat && l.lat <= maxLat && l.lng >= minLng && l.lng <= maxLng;
                                                                if (!inBox) return false;

                                                                const interests = userProfile.interests;
                                                                const name = l.name.toLowerCase();
                                                                const desc = (l.description || "").toLowerCase();

                                                                return (
                                                                    (interests.includes('cultura') && (desc.includes('heritage') || desc.includes('architecture') || desc.includes('theatre') || desc.includes('patrimonio'))) ||
                                                                    (interests.includes('naturaleza') && (desc.includes('park') || desc.includes('nature') || desc.includes('river') || desc.includes('parque') || desc.includes('río'))) ||
                                                                    (interests.includes('salsa') && (name.includes('salsa') || name.includes('dance') || name.includes('baile'))) ||
                                                                    (interests.includes('arte') && (desc.includes('art') || desc.includes('gallery') || desc.includes('mural') || desc.includes('design'))) ||
                                                                    (interests.includes('historia') && (desc.includes('history') || desc.includes('museum') || desc.includes('colonia') || desc.includes('histórico'))) ||
                                                                    (interests.includes('bebidas') && (desc.includes('drink') || desc.includes('gastronomy') || desc.includes('market') || desc.includes('lulada')))
                                                                );
                                                            });

                                                            // Tomar hasta 5 puntos interesantes para la ruta
                                                            relevantLandmarks.slice(0, 5).forEach(l => {
                                                                waypoints.push({ location: { lat: l.lat, lng: l.lng }, stopover: true });
                                                                interestPoints.push(l);
                                                            });

                                                            const directionsService = new google.maps.DirectionsService();
                                                            directionsService.route(
                                                                {
                                                                    origin: { lat: coords.lat, lng: coords.lng },
                                                                    destination: { lat: landmark.lat, lng: landmark.lng },
                                                                    waypoints: waypoints,
                                                                    optimizeWaypoints: true,
                                                                    travelMode: google.maps.TravelMode.WALKING,
                                                                },
                                                                async (result, status) => {
                                                                    if (status === "OK" && routePolylineRef.current && result && mapInstance.current) {
                                                                        // Configurar estilo según perfil
                                                                        if (userProfile.style === 'caminante') {
                                                                            routePolylineRef.current.setOptions({
                                                                                strokeColor: "#3b82f6",
                                                                                strokeOpacity: 0, // Totalmente invisible la línea base
                                                                                icons: [{
                                                                                    icon: {
                                                                                        path: google.maps.SymbolPath.CIRCLE,
                                                                                        fillOpacity: 1,
                                                                                        scale: 2.2,
                                                                                        fillColor: "#3b82f6",
                                                                                        strokeColor: "#ffffff",
                                                                                        strokeWeight: 0.5
                                                                                    },
                                                                                    offset: '0',
                                                                                    repeat: '12px'
                                                                                }]
                                                                            });
                                                                        } else {
                                                                            routePolylineRef.current.setOptions({
                                                                                strokeColor: "#1e293b",
                                                                                strokeOpacity: 1,
                                                                                strokeWeight: 5,
                                                                                icons: []
                                                                            });
                                                                        }

                                                                        routePolylineRef.current.setPath(result.routes[0].overview_path);
                                                                        routePolylineRef.current.setVisible(true);
                                                                        const bounds = result.routes[0].bounds;
                                                                        mapInstance.current.fitBounds(bounds);

                                                                        // Añadir pines de interés usando el nuevo Overlay premium interactivo
                                                                        interestPoints.forEach(ip => {
                                                                            const overlay = new InterestOverlay({ lat: ip.lat, lng: ip.lng }, mapInstance.current!, ip.name, ip.description || "");
                                                                            routeMarkersRef.current.push(overlay);
                                                                        });

                                                                        // Añadir pin de DESTINO
                                                                        const destOverlay = new DestinationOverlay({ lat: landmark.lat, lng: landmark.lng }, mapInstance.current!);
                                                                        routeMarkersRef.current.push(destOverlay);

                                                                        if (speak) {
                                                                            speak({
                                                                                type: "info",
                                                                                text: `He trazado una ruta especial para ti pasando por ${interestPoints.length > 0 ? interestPoints.map(p => p.name).join(' y ') : 'los puntos más bonitos de la ciudad'}. ¡Disfruta el camino!`,
                                                                                title: "Ruta Personalizada",
                                                                                icon: "✨"
                                                                            });
                                                                        }
                                                                    } else {
                                                                        const url = `https://www.google.com/maps/dir/?api=1&origin=${coords.lat},${coords.lng}&destination=${landmark.lat},${landmark.lng}&travelmode=walking`;
                                                                        window.open(url, '_blank');
                                                                    }
                                                                }
                                                            );
                                                        }}
                                                        className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-zinc-900 text-white font-bold text-[15px] shadow-lg active:scale-[0.98] transition-transform"
                                                    >
                                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M9 18V5l12-2v13l-12 2zm-3.5 3c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5z" /></svg>
                                                        Trazar Ruta Personalizada
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                );
                            })()}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default MapContent