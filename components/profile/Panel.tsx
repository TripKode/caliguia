"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { 
    Landmark as LandmarkIcon, 
    Mic, 
    Flower, 
    AlertTriangle, 
    MapPin, 
    Star, 
    ChevronRight, 
    ChevronLeft,
    Clock,
    User,
    Calendar,
    Music,
    Utensils,
    Video,
    Search,
    History,
    ShieldAlert,
    Plus,
    Minus,
    Bed
} from "lucide-react";
import { getCategoryIcon, getCategoryLabel } from "@/components/map/category";
import {
    CALI_EVENTS_TODAY,
    RISK_CONFIG,
} from "@/components/map/data";
import { useMap } from "@/hooks/UseMap";
import { haversineDistance, getComunaCentroid } from "@/components/map/handlers";
import { type RiskLevel } from "@/components/map/types";

export function Panel() {
    const [currentPage, setCurrentPage] = useState(1);
    const [isPlacesExpanded, setIsPlacesExpanded] = useState(true);
    const [isHotelsExpanded, setIsHotelsExpanded] = useState(true);
    const [hotels, setHotels] = useState<any[]>([]);
    const [loadingHotels, setLoadingHotels] = useState(false);
    const [hotelsPage, setHotelsPage] = useState(1);
    const {
        activeTab,
        setActiveTab,
        experienceLog,
        currentComuna,
        loadingLandmarks,
        localLandmarks,
        expandedLandmark,
        setExpandedLandmark,
        coords,
        mapInstance,
        routePolylineRef,
        setCurrentImageIdx,
        loadingPlaces,
        places,
        status,
        narratorSpeaking,
        currentNarration,
        showZoneAlert,
        setShowZoneAlert,
        comunas: CALI_COMUNAS,
        setCurrentComuna,
        selectComuna
    } = useMap();

    useEffect(() => {
        setCurrentPage(1);
    }, [places]);

    useEffect(() => {
        if (activeTab === "places" && hotels.length === 0 && !loadingHotels) {
            setLoadingHotels(true);
            fetch(`/api/hotels?city=${currentComuna?.name || "Cali"}`)
                .then(res => res.json())
                .then(data => {
                    if (Array.isArray(data)) {
                        setHotels(data.filter(h => h.hotelId));
                    }
                })
                .catch(console.error)
                .finally(() => setLoadingHotels(false));
        }
    }, [activeTab, currentComuna]);

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Tabs + voice mute */}
            <div className="flex items-center gap-1 px-4 pt-2 pb-0 shrink-0">
                {(["local", "places", "zones", "experience"] as const).map(tab => (
                    <motion.button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        whileTap={{ scale: 0.97 }}
                        className={`relative px-1 py-1.5 rounded-lg text-[9px] font-bold transition-colors flex-1 flex items-center justify-center gap-1 ${activeTab === tab ? "text-blue-600" : "text-zinc-400 hover:text-zinc-600"
                            }`}
                    >
                        <span className="truncate">
                            {tab === "local" ? "Local" : tab === "places" ? "Negocios" : tab === "zones" ? "Zonas" : "Agenda"}
                        </span>
                        {tab === "experience" && experienceLog.length > 0 && (
                            <span className="shrink-0 inline-flex items-center justify-center w-3 h-3 rounded-full bg-blue-500 text-white text-[7px] font-black">
                                {experienceLog.length}
                            </span>
                        )}
                        {activeTab === tab && (
                            <motion.span
                                layoutId="panel-tab-active"
                                className="absolute inset-0 -z-10 rounded-lg bg-blue-500/9"
                                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                            />
                        )}
                    </motion.button>
                ))}
            </div>

            <AnimatePresence mode="wait" initial={false}>
                {activeTab === "local" && (
                    <motion.div
                        key="local"
                        className="flex min-h-0 flex-1 flex-col overflow-hidden"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                    >
                        <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-black/5 shrink-0">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Patrimonio</p>
                                <p className="text-[14px] font-semibold text-zinc-800 mt-0.5">
                                    {currentComuna ? currentComuna.name : "Explorando Cali"}
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-[9px] font-medium uppercase tracking-[0.07em] text-zinc-400">Radio</p>
                                <p className="text-[13px] font-semibold text-blue-500">1 km</p>
                            </div>
                        </div>

                        <div className="overflow-y-auto overscroll-contain flex-1 px-4 py-3">
                            <div className="flex flex-col gap-3">
                                {loadingLandmarks && localLandmarks.length === 0 && (
                                    <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
                                        <div className="w-8 h-8 border-3 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4" />
                                        <p className="text-[12px] font-bold">Escaneando historia...</p>
                                    </div>
                                )}
                                {localLandmarks.map((landmark, idx) => (
                                    <motion.div
                                        key={landmark.name}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                        className="bg-white rounded-2xl border border-black/5 p-4 shadow-sm"
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full uppercase tracking-wider border border-amber-100">
                                                        {landmark.description}
                                                    </span>
                                                </div>
                                                <p className="text-[15px] font-black text-zinc-800 leading-tight">{landmark.name}</p>
                                                <p className={`text-[11px] text-zinc-500 mt-2 leading-relaxed font-medium transition-all duration-300 ${expandedLandmark === landmark.name ? "" : "line-clamp-2"}`}>
                                                    {landmark.history}
                                                </p>

                                                <div className="flex items-center gap-2 mt-4">
                                                    <button
                                                        onClick={async () => {
                                                            if (!coords || !mapInstance.current) return;
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
                                                                        console.error("Route failed:", status);
                                                                        const url = `https://www.google.com/maps/dir/?api=1&origin=${coords.lat},${coords.lng}&destination=${landmark.lat},${landmark.lng}&travelmode=walking`;
                                                                        window.open(url, '_blank');
                                                                        if (status === "REQUEST_DENIED") {
                                                                            alert("¡Aviso! La 'Directions API' no está habilitada en tu clave de Google. He abierto la navegación en una nueva pestaña.");
                                                                        }
                                                                    }
                                                                }
                                                            );
                                                        }}
                                                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-blue-600 text-white text-[11px] font-bold hover:bg-blue-700 transition-all shadow-sm shadow-blue-500/20 active:scale-95"
                                                    >
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                                                        Ver Ruta
                                                    </button>

                                                    <button
                                                        onClick={() => {
                                                            setCurrentImageIdx(0);
                                                            setExpandedLandmark(landmark.name);
                                                        }}
                                                        className="px-4 py-2 rounded-xl bg-zinc-100 text-zinc-600 text-[11px] font-bold hover:bg-zinc-200 transition-all active:scale-95"
                                                    >
                                                        Expandir
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}

                                {!loadingLandmarks && localLandmarks.length === 0 && (
                                    <div className="flex flex-col items-center justify-center py-12 text-center">
                                        <div className="w-12 h-12 rounded-2xl bg-zinc-50 flex items-center justify-center mb-4 border border-black/5">
                                            <LandmarkIcon className="w-6 h-6 text-zinc-400" />
                                        </div>
                                        <p className="text-[14px] font-black text-zinc-800">Nada que ver por aquí</p>
                                        <p className="text-[11px] text-zinc-400 mt-1 max-w-[180px] leading-relaxed">
                                            No hemos encontrado monumentos históricos en tu ubicación actual.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
                {activeTab === "places" && (
                    <motion.div
                        key="places"
                        className="flex min-h-0 flex-1 flex-col"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                    >
                        <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-black/5 shrink-0">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Cercanos</p>
                                <p className="text-[14px] font-semibold text-zinc-800 mt-0.5">
                                    {loadingPlaces ? "Buscando..." : `${places.length} negocios`}
                                </p>
                            </div>
                            {coords && (
                                <div className="flex items-center gap-3">
                                    <div className="text-right">
                                        <p className="text-[9px] font-medium uppercase tracking-[0.07em] text-zinc-400">Radio</p>
                                        <p className="text-[13px] font-semibold text-blue-500">1 km</p>
                                    </div>
                                    <button 
                                        onClick={() => setIsPlacesExpanded(!isPlacesExpanded)}
                                        className="w-7 h-7 flex items-center justify-center bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-lg transition-colors active:scale-95 shrink-0"
                                    >
                                        {isPlacesExpanded ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                    </button>
                                </div>
                            )}
                        </div>

                        {isPlacesExpanded && (
                            <>
                                {loadingPlaces && places.length === 0 && (
                                    <div className="flex flex-col gap-3 px-5 py-4 shrink-0">
                                {[1, 2, 3].map(i => (
                                    <motion.div
                                        key={i}
                                        className="flex gap-3 items-center animate-pulse"
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.04 }}
                                    >
                                        <div className="w-9 h-9 rounded-xl bg-zinc-100 shrink-0" />
                                        <div className="flex flex-col gap-1.5 flex-1">
                                            <div className="h-3 bg-zinc-100 rounded-full w-2/3" />
                                            <div className="h-2.5 bg-zinc-100 rounded-full w-1/2" />
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}

                        {(!loadingPlaces || places.length > 0) && (
                            <div className="overflow-y-auto overscroll-contain flex-1 px-4 py-2">
                                {places.length === 0 && (
                                    <div className="text-[12px] text-zinc-400 text-center py-12 px-6">
                                        {status === "tracking" ? "Sin negocios en el área." : status === "loading" ? "Buscando tu ubicación en Cali..." : "Comparte tu ubicación para ver negocios cercanos."}
                                    </div>
                                )}
                                <motion.div className="flex flex-col gap-1" layout>
                                    {places.slice((currentPage - 1) * 20, currentPage * 20).map((place) => {
                                        const dist = coords
                                            ? Math.round(haversineDistance(coords.lat, coords.lng, place.geometry.location.lat(), place.geometry.location.lng()))
                                            : null;
                                        return (
                                            <motion.div
                                                key={place.place_id}
                                                layout
                                                initial={{ opacity: 0, y: 8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                whileTap={{ scale: 0.995 }}
                                                transition={{ duration: 0.16 }}
                                                className="flex items-start gap-3 px-3 py-2.5 rounded-xl transition-colors hover:bg-zinc-50 cursor-pointer"
                                            >
                                                <div className="w-9 h-9 rounded-xl bg-blue-500/[0.07] border border-blue-500/10 flex items-center justify-center text-base shrink-0">
                                                    {getCategoryIcon(place.types)}
                                                </div>
                                                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                                                    <p className="text-[13px] font-semibold text-zinc-800 truncate">{place.name}</p>
                                                    <p className="text-[11px] text-zinc-400 truncate">{place.vicinity}</p>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="text-[10px] font-medium text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded-md">
                                                            {getCategoryLabel(place.types)}
                                                        </span>
                                                        {place.rating != null && (
                                                            <>
                                                                <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                                                                <span className="text-[10px] font-medium text-amber-600">
                                                                    {place.rating.toFixed(1)}
                                                                    {place.user_ratings_total ? ` (${place.user_ratings_total > 999 ? (place.user_ratings_total / 1000).toFixed(1) + "k" : place.user_ratings_total})` : ""}
                                                                </span>
                                                            </>
                                                        )}
                                                        {place.business_status && place.business_status !== "OPERATIONAL" && (
                                                            <span className="text-[10px] font-medium text-red-400">Cerrado</span>
                                                        )}
                                                    </div>
                                                </div>
                                                {dist !== null && (
                                                    <div className="text-[11px] font-semibold text-zinc-400 shrink-0 pt-0.5">
                                                        {dist < 1000 ? `${dist}m` : `${(dist / 1000).toFixed(1)}km`}
                                                    </div>
                                                )}
                                            </motion.div>
                                        );
                                    })}
                                </motion.div>

                                {places.length > 20 && (
                                    <div className="flex items-center justify-between px-2 py-4 mt-2 border-t border-black/5 bg-white/50 sticky bottom-0">
                                        <button
                                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                            disabled={currentPage === 1}
                                            className="w-10 h-10 flex items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 disabled:opacity-30 active:scale-95 transition-all"
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                        </button>
                                        <div className="text-center">
                                            <p className="text-[9px] font-black text-zinc-400 uppercase tracking-tighter">Página</p>
                                            <p className="text-[13px] font-black text-blue-600 leading-none mt-0.5">{currentPage} / {Math.ceil(places.length / 20)}</p>
                                        </div>
                                        <button
                                            onClick={() => setCurrentPage(p => Math.min(Math.ceil(places.length / 20), p + 1))}
                                            disabled={currentPage === Math.ceil(places.length / 20)}
                                            className="w-10 h-10 flex items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 disabled:opacity-30 active:scale-95 transition-all"
                                        >
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                            </>
                        )}

                        <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-black/5 shrink-0">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Hoteles</p>
                                <p className="text-[14px] font-semibold text-zinc-800 mt-0.5">
                                    {loadingHotels ? "Buscando..." : `${hotels.length} hoteles`}
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <button 
                                    onClick={() => setIsHotelsExpanded(!isHotelsExpanded)}
                                    className="w-7 h-7 flex items-center justify-center bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-lg transition-colors active:scale-95 shrink-0"
                                >
                                    {isHotelsExpanded ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {isHotelsExpanded && (
                            <div className="overflow-y-auto overscroll-contain flex-1 px-4 py-2">
                                {loadingHotels && hotels.length === 0 && (
                                    <div className="flex flex-col gap-3 px-1 py-2">
                                        {[1, 2, 3].map(i => (
                                            <div key={`h-sk-${i}`} className="flex gap-3 items-center animate-pulse">
                                                <div className="w-9 h-9 rounded-xl bg-zinc-100 shrink-0" />
                                                <div className="flex flex-col gap-1.5 flex-1">
                                                    <div className="h-3 bg-zinc-100 rounded-full w-2/3" />
                                                    <div className="h-2.5 bg-zinc-100 rounded-full w-1/2" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {!loadingHotels && hotels.length === 0 && (
                                    <div className="text-[12px] text-zinc-400 text-center py-8">
                                        No se encontraron hoteles en la zona.
                                    </div>
                                )}

                                {hotels.length > 0 && (
                                    <div className="flex flex-col gap-2">
                                        {hotels.slice((hotelsPage - 1) * 10, hotelsPage * 10).map((hotel, idx) => (
                                            <div key={`hotel-${hotel.hotelId}-${idx}`} className="flex items-start gap-3 p-3 rounded-xl bg-white border border-zinc-100 shadow-sm transition-colors hover:bg-zinc-50 cursor-pointer">
                                                <div className="w-9 h-9 rounded-xl bg-purple-500/[0.07] border border-purple-500/10 flex items-center justify-center text-base shrink-0">
                                                    <Bed className="w-4 h-4 text-purple-600" />
                                                </div>
                                                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                                    <p className="text-[13px] font-bold text-zinc-800 truncate">{hotel.name}</p>
                                                    <p className="text-[11px] text-zinc-500 truncate">{hotel.vendor1}</p>
                                                    {hotel.reviews && (
                                                        <div className="flex items-center gap-1.5 mt-0.5">
                                                            <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                                                            <span className="text-[10px] font-medium text-amber-600">{hotel.reviews.rating}</span>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="shrink-0 text-right">
                                                    <p className="text-[13px] font-bold text-zinc-800">{hotel.price1}</p>
                                                    <p className="text-[9px] font-medium uppercase tracking-tighter text-zinc-400">Por noche</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {hotels.length > 10 && (
                                    <div className="flex items-center justify-between px-2 py-4 mt-2 border-t border-black/5 bg-white/50 sticky bottom-0">
                                        <button onClick={() => setHotelsPage(p => Math.max(1, p - 1))} disabled={hotelsPage === 1} className="w-10 h-10 flex items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 disabled:opacity-30 active:scale-95 transition-all">
                                            <ChevronLeft className="w-4 h-4" />
                                        </button>
                                        <div className="text-center">
                                            <p className="text-[9px] font-black text-zinc-400 uppercase tracking-tighter">Página</p>
                                            <p className="text-[13px] font-black text-purple-600 leading-none mt-0.5">{hotelsPage} / {Math.ceil(hotels.length / 10)}</p>
                                        </div>
                                        <button onClick={() => setHotelsPage(p => Math.min(Math.ceil(hotels.length / 10), p + 1))} disabled={hotelsPage === Math.ceil(hotels.length / 10)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 disabled:opacity-30 active:scale-95 transition-all">
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </motion.div>
                )}

                {activeTab === "experience" && (
                    <motion.div
                        key="experience"
                        className="flex h-full min-h-0 flex-col overflow-hidden"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-black/5 shrink-0">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Agenda Cali</p>
                                <p className="text-[14px] font-semibold text-zinc-800 mt-0.5">
                                    {CALI_EVENTS_TODAY.length} eventos para hoy
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-[9px] font-medium uppercase tracking-[0.07em] text-zinc-400">Fecha</p>
                                <p className="text-[12px] font-semibold text-zinc-800 mt-0.5">
                                    Abril 30, 2026
                                </p>
                            </div>
                        </div>

                        {/* Current narration banner */}
                        <AnimatePresence initial={false}>
                            {currentNarration && (
                                <motion.div
                                    key={currentNarration.id}
                                    className="mx-4 mt-3 shrink-0"
                                    initial={{ opacity: 0, y: -8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -8 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <div
                                        className="rounded-xl px-4 py-3 border"
                                        style={{
                                            background: currentNarration.type === "danger"
                                                ? "rgba(239,68,68,0.06)" : "rgba(59,130,246,0.06)",
                                            borderColor: currentNarration.type === "danger"
                                                ? "rgba(239,68,68,0.2)" : "rgba(59,130,246,0.15)",
                                        }}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            {currentNarration.type === "danger" ? (
                                                <ShieldAlert className="w-4 h-4 text-red-600" />
                                            ) : currentNarration.type === "welcome" ? (
                                                <Flower className="w-4 h-4 text-blue-600" />
                                            ) : (
                                                <Mic className="w-4 h-4 text-blue-600" />
                                            )}
                                            <p className="text-[11px] font-bold uppercase tracking-[0.07em]"
                                                style={{ color: currentNarration.type === "danger" ? "#dc2626" : "#2563eb" }}>
                                                {narratorSpeaking ? "Hablando ahora" : "Último mensaje"}
                                            </p>
                                            {narratorSpeaking && (
                                                <div className="flex items-center gap-0.5 ml-auto">
                                                    {[3, 5, 4, 6, 3].map((h, i) => (
                                                        <div key={i} className="w-0.5 rounded-full"
                                                            style={{
                                                                height: `${h}px`,
                                                                background: currentNarration.type === "danger" ? "#ef4444" : "#3b82f6",
                                                                animation: `pulse-bar ${0.4 + i * 0.1}s ease-in-out infinite alternate`,
                                                            }} />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-[12px] text-zinc-700 leading-relaxed">{currentNarration.text}</p>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Experience log / Events */}
                        <div className="overflow-y-auto overscroll-contain flex-1 px-4 py-3">
                            <div className="mb-6">
                                <div className="flex flex-col gap-2">
                                    {CALI_EVENTS_TODAY.map((event, idx) => (
                                        <motion.div
                                            key={event.id}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: idx * 0.05 }}
                                            className="group bg-white rounded-2xl border border-black/5 p-3.5 shadow-sm hover:shadow-md hover:border-blue-500/20 transition-all cursor-pointer"
                                        >
                                            <div className="flex items-start gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-blue-500/5 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                                                        {event.category.includes("Salsa") || event.category.includes("Música") ? (
                                                            <Music className="w-5 h-5 text-blue-500" />
                                                        ) : event.category.includes("Gastronomía") ? (
                                                            <Utensils className="w-5 h-5 text-blue-500" />
                                                        ) : event.category.includes("Cine") ? (
                                                            <Video className="w-5 h-5 text-blue-500" />
                                                        ) : (
                                                            <Calendar className="w-5 h-5 text-blue-500" />
                                                        )}
                                                    </div>
                                                <div className="flex flex-col gap-1 min-w-0 flex-1">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full uppercase tracking-tighter">
                                                            {event.category}
                                                        </span>
                                                        <span className="text-[10px] font-bold text-zinc-400">{event.time}</span>
                                                    </div>
                                                    <p className="text-[14px] font-black text-zinc-800 leading-tight">{event.title}</p>
                                                    <div className="flex items-center gap-1 mt-0.5">
                                                        <span className="text-[10px] font-bold text-zinc-400">Por:</span>
                                                        <span className="text-[10px] font-bold text-zinc-600 truncate">{event.organizer}</span>
                                                    </div>
                                                    <div className="flex items-start gap-1 mt-1 text-zinc-500">
                                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="shrink-0 mt-0.5"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                                                        <span className="text-[10px] font-medium leading-tight">{event.location}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            </div>

                            {experienceLog.length > 0 && (
                                <div className="flex flex-col gap-1 border-t border-black/5 pt-4">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400 mb-2">Recorrido reciente</p>
                                    {experienceLog.map((item, idx) => (
                                        <motion.div
                                            key={item.id}
                                            initial={{ opacity: 0, y: 6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: idx * 0.03, duration: 0.16 }}
                                            className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border ${item.type === "danger"
                                                ? "bg-red-50/60 border-red-100"
                                                : "bg-zinc-50 border-zinc-100"
                                                }`}
                                        >
                                            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                                                style={{
                                                    background: item.type === "danger" ? "rgba(239,68,68,0.08)" : "rgba(59,130,246,0.07)",
                                                    border: item.type === "danger" ? "1px solid rgba(239,68,68,0.15)" : "1px solid rgba(59,130,246,0.1)",
                                                }}>
                                                {item.type === "danger" ? (
                                                    <AlertTriangle className="w-4 h-4 text-red-500" />
                                                ) : (
                                                    <History className="w-4 h-4 text-blue-500" />
                                                )}
                                            </div>
                                            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                                                <p className="text-[12px] font-semibold text-zinc-800 truncate">{item.title ?? item.type}</p>
                                                <p className="text-[10px] text-zinc-500 leading-relaxed line-clamp-2">{item.text}</p>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}

                {activeTab === "zones" && (
                    <motion.div
                        key="zones"
                        className="flex h-full min-h-0 flex-col overflow-hidden"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                    >
                        {/* Legend - Compact Row */}
                        <div className="px-4 pt-4 pb-1 shrink-0">
                            <div className="flex items-center justify-between gap-1 overflow-x-auto no-scrollbar pb-2">
                                {(Object.entries(RISK_CONFIG) as [RiskLevel, typeof RISK_CONFIG[RiskLevel]][]).map(([level, cfg]) => (
                                    <div key={level} className="flex items-center gap-1.5 shrink-0 bg-white border border-black/5 px-2 py-1.5 rounded-lg shadow-sm">
                                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cfg.fill, border: `1px solid ${cfg.stroke}` }} />
                                        <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-tighter whitespace-nowrap">{cfg.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Comunas list */}
                        <div className="overflow-y-auto overscroll-contain flex-1 px-4 pb-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400 mb-2 mt-2">Las 22 Comunas</p>
                            <div className="flex flex-col gap-1">
                                {CALI_COMUNAS.map((c, index) => (
                                    <motion.div
                                        key={c.id}
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: Math.min(index * 0.012, 0.18), duration: 0.16 }}
                                        whileTap={{ scale: 0.995 }}
                                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors cursor-pointer ${currentComuna?.id === c.id ? "bg-blue-500/[0.07]" : "hover:bg-zinc-50"
                                            }`}
                                        onClick={() => selectComuna(c)}
                                    >
                                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: RISK_CONFIG[c.risk].color }} />
                                        <div className="flex flex-col flex-1 min-w-0">
                                            <p className="text-[12px] font-semibold text-zinc-700 truncate">{c.name}</p>
                                            <p className="text-[10px] text-zinc-400 truncate">{c.barrios.slice(0, 2).join(", ")}</p>
                                        </div>
                                        <span
                                            className="text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0"
                                            style={{ background: `${RISK_CONFIG[c.risk].fill}22`, color: RISK_CONFIG[c.risk].color }}
                                        >
                                            {RISK_CONFIG[c.risk].label.toUpperCase()}
                                        </span>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}

            </AnimatePresence>
            <style>{`
            @keyframes pulse-bar {
              from { transform: scaleY(0.5); opacity: 0.6; }
              to   { transform: scaleY(1.4); opacity: 1; }
            }
          `}</style>
        </div>
    );
}