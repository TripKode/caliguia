"use client"

import { AnimatePresence, motion } from "framer-motion";
import Webcam from "react-webcam";
import { AIFloatingIsland } from "@/components/island/Island";
import { useMap } from "@/hooks/UseMap";
import { Panel } from "@/components/profile/Panel";
import { type LayerMode } from "@/components/map/types";

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
        expandedLandmark,
        setExpandedLandmark,
        localLandmarks,
        currentImageIdx,
        setCurrentImageIdx,
        mapInstance,
        routePolylineRef
    } = useMap();

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

            {/* ── Voice Permission Modal ── */}
            <AnimatePresence>
                {voicePreference === "unknown" && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-100 flex items-center justify-center bg-black/40 backdrop-blur-sm px-6"
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            className="w-full max-w-sm bg-white rounded-3xl p-8 shadow-2xl text-center"
                        >
                            <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round">
                                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                                    <line x1="12" y1="19" x2="12" y2="22" />
                                    <line x1="8" y1="22" x2="16" y2="22" />
                                </svg>
                            </div>
                            <h2 className="text-xl font-bold text-zinc-800 mb-3">¿Activar guía de voz?</h2>
                            <p className="text-[14px] text-zinc-500 leading-relaxed mb-8">
                                CaliGuía puede narrarte la historia y curiosidades de los lugares que visites. ¿Deseas activar el audio?
                            </p>
                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={() => unlockSpeech(true)}
                                    className="w-full py-4 bg-blue-500 text-white rounded-2xl font-bold text-[15px] shadow-lg shadow-blue-500/25 active:scale-[0.98] transition-transform"
                                >
                                    Sí, activar audio
                                </button>
                                <button
                                    onClick={() => {
                                        unlockSpeech(false);
                                        setVoiceMuted(true);
                                    }}
                                    className="w-full py-3 text-zinc-400 font-semibold text-[14px] hover:text-zinc-600"
                                >
                                    No, tal vez luego
                                </button>
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

                                            <div className="p-8 flex flex-col gap-8">
                                                <div className="flex flex-col gap-4">
                                                    <div className="flex items-center gap-2">
                                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
                                                        <p className="text-[12px] font-black uppercase tracking-widest text-blue-500">Dato Cultural</p>
                                                    </div>
                                                    <div className="bg-blue-50 rounded-2xl p-5 border border-blue-100">
                                                        <p className="text-[16px] text-zinc-800 font-bold leading-relaxed">
                                                            {landmark.history.split('.')[0]}. {landmark.history.split('.')[1] ? landmark.history.split('.')[1] + '.' : ''}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex flex-col gap-3">
                                                    <div className="flex items-center gap-2">
                                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" /><path d="M8 7h6" /><path d="M8 11h8" /></svg>
                                                        <p className="text-[11px] font-black uppercase tracking-widest text-zinc-400">Contexto Histórico</p>
                                                    </div>
                                                    <p className="text-[14px] text-zinc-500 leading-relaxed font-medium">
                                                        {landmark.history}
                                                    </p>
                                                </div>

                                                <div className="flex flex-col gap-3">
                                                    <button
                                                        onClick={async () => {
                                                            if (!coords || !mapInstance.current) return;
                                                            setExpandedLandmark(null);
                                                            const directionsService = new google.maps.DirectionsService();
                                                            directionsService.route(
                                                                {
                                                                    origin: { lat: coords.lat, lng: coords.lng },
                                                                    destination: { lat: landmark.lat, lng: landmark.lng },
                                                                    travelMode: google.maps.TravelMode.WALKING,
                                                                },
                                                                (result, status) => {
                                                                    if (status === "OK" && routePolylineRef.current && result) {
                                                                        routePolylineRef.current.setPath(result.routes[0].overview_path);
                                                                        routePolylineRef.current.setVisible(true);
                                                                        const bounds = result.routes[0].bounds;
                                                                        mapInstance.current?.fitBounds(bounds);
                                                                    } else {
                                                                        const url = `https://www.google.com/maps/dir/?api=1&origin=${coords.lat},${coords.lng}&destination=${landmark.lat},${landmark.lng}&travelmode=walking`;
                                                                        window.open(url, '_blank');
                                                                    }
                                                                }
                                                            );
                                                        }}
                                                        className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-blue-600 text-white font-bold text-[15px] shadow-lg shadow-blue-500/25 active:scale-[0.98] transition-transform"
                                                    >
                                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                                                        Cómo llegar caminando
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