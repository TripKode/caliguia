"use client";

import {
    useEffect,
    useRef,
    useState,
    useCallback,
    createContext,
    useContext,
    type PointerEvent,
} from "react";
import Webcam from "react-webcam";
import { useVoiceNarrator, fetchNarration } from "../components/providers/VoiceNarrator";
import { useExperience } from "../components/providers/ExperienceProvider";
import { MAP_STYLES, PIN_SVG } from "@/components/map/data";
import {
    CALI_BOUNDS,
    CALI_CENTER,
    RISK_CONFIG,
    AR_ZOOM_LEVELS,
} from "@/components/map/data";
import {
    haversineDistance,
    pointInPolygon,
    isInsideCaliBounds,
    getComunaCentroid,
    loadGoogleMapsViaProxy,
    ensureGoogleMapsLibraries,
    readCachedLocation,
    writeCachedLocation,
    hasLocationOptIn
} from "@/components/map/handlers";
import {
    type ComunaData,
    type Status,
    type NearbyPlace,
    type Landmark,
    type LayerMode,
    type ActiveTab,
    type ArZoomLevel,
    type MapContextType,
    type NarrationEvent,
    RiskLevel,
    VerbosityLevel
} from "@/components/map/types";


const COMUNA_RISK_MAP: Record<number, { risk: any; description: string }> = {
    1: { risk: "high", description: "Zona occidental, ladera. Precaución en zonas altas." },
    2: { risk: "safe", description: "Zona norte, residencial y gastronómica de alto nivel." },
    3: { risk: "medium", description: "Centro histórico y cultural. Comercio activo." },
    4: { risk: "medium", description: "Zona norte-centro, residencial tradicional." },
    5: { risk: "medium", description: "Zona norte-oriental, mezcla industrial y residencial." },
    6: { risk: "high", description: "Nororiente. Se recomienda transitar por vías principales." },
    7: { risk: "high", description: "Nororiente. Zona con alta densidad poblacional." },
    8: { risk: "medium", description: "Centro-oriente, comercial y base aérea." },
    9: { risk: "low", description: "Centro comercial denso y barrios tradicionales." },
    10: { risk: "medium", description: "Corazón comercial de la ciudad." },
    11: { risk: "low", description: "Zona residencial del sur-oriente." },
    12: { risk: "medium", description: "Sur-oriente, zona residencial estrato medio-bajo." },
    13: { risk: "high", description: "Distrito de Aguablanca. Alta precaución." },
    14: { risk: "high", description: "Distrito de Aguablanca. Alta precaución." },
    15: { risk: "high", description: "Distrito de Aguablanca. Zona crítica." },
    16: { risk: "medium", description: "Sur, zona de clínicas y barrios residenciales." },
    17: { risk: "low", description: "Sur, zona universitaria y residencial de nivel alto." },
    18: { risk: "medium", description: "Ladera sur, zona mixta." },
    19: { risk: "safe", description: "Zona sur-occidental, deportiva y residencial segura." },
    20: { risk: "high", description: "Siloé y ladera occidental. Alta precaución." },
    21: { risk: "high", description: "Extremo nororiente. Zona vulnerable." },
    22: { risk: "safe", description: "Pance y Ciudad Jardín. La zona más exclusiva y segura." },
};

const fetchWikipediaSummary = async (title: string): Promise<{ extract: string; images: string[] } | null> => {
    try {
        const searchUrl = `https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(title + " Cali")}&format=json&origin=*`;
        const searchResp = await fetch(searchUrl);
        const searchData = await searchResp.json();

        if (!searchData.query?.search?.length) return null;

        const bestTitle = searchData.query.search[0].title;
        const summaryUrl = `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(bestTitle)}`;
        const mediaUrl = `https://es.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(bestTitle)}`;

        const [summaryResp, mediaResp] = await Promise.all([
            fetch(summaryUrl),
            fetch(mediaUrl).catch(() => null)
        ]);

        if (!summaryResp.ok) return null;
        const summaryData = await summaryResp.json();

        let images: string[] = [];
        if (summaryData.originalimage?.source) images.push(summaryData.originalimage.source);

        if (mediaResp?.ok) {
            const mediaData = await mediaResp.json();
            const extraImages = mediaData.items
                ?.filter((item: any) => item.type === "image")
                ?.map((item: any) => item.srcset?.[0]?.src || item.src)
                ?.filter((src: string) => src && !images.includes(src))
                ?.slice(0, 5) || [];
            images = [...images, ...extraImages];
        }

        return { extract: summaryData.extract, images };
    } catch {
        return null;
    }
};

const getComunaInfoWindowContent = (comuna: ComunaData) => {
    const cfg = RISK_CONFIG[comuna.risk];
    return `
    <div style="font-family:-apple-system,sans-serif;padding:10px 4px 4px 4px;min-width:200px;margin-top:-10px">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:2px">
        <div style="font-size:14px;font-weight:900;color:#18181b;line-height:1.1">${comuna.name}</div>
        <div style="width:28px;height:22px;shrink:0"></div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
        <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${cfg.color}"></span>
        <span style="font-size:10px;font-weight:800;color:${cfg.color};text-transform:uppercase;letter-spacing:0.04em">Riesgo ${cfg.label}</span>
      </div>
      <div style="font-size:11px;color:#4b5563;line-height:1.4;margin-bottom:10px;font-weight:500">${comuna.description}</div>
      <div style="font-size:10px;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:8px">${comuna.barrios.join(", ")}</div>
    </div>
  `;
};

export function UseHome() {
    // ── 1. STATE ──
    const [comunas, setComunas] = useState<ComunaData[]>([]);
    const [status, setStatus] = useState<Status>("idle");
    const [locationError, setLocationError] = useState<string | null>(null);
    const [locationDebug, setLocationDebug] = useState<string | null>(null);
    const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
    const [places, setPlaces] = useState<NearbyPlace[]>([]);
    const [localLandmarks, setLocalLandmarks] = useState<Landmark[]>([]);
    const [loadingPlaces, setLoadingPlaces] = useState(false);
    const [loadingLandmarks, setLoadingLandmarks] = useState(false);
    const [drawerH, setDrawerH] = useState(280);
    const [isDrawerDragging, setIsDrawerDragging] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [layerMode, setLayerMode] = useState<LayerMode>("none");
    const [currentComuna, setCurrentComuna] = useState<ComunaData | null>(null);
    const [activeTab, setActiveTab] = useState<ActiveTab>("local");
    const [expandedLandmark, setExpandedLandmark] = useState<string | null>(null);
    const [currentImageIdx, setCurrentImageIdx] = useState(0);
    const [arCameraError, setArCameraError] = useState<string | null>(null);
    const [arFacingMode, setArFacingMode] = useState<"environment" | "user">("environment");
    const [arZoomLevel, setArZoomLevel] = useState<ArZoomLevel>(0.05);
    const [arZoomSupported, setArZoomSupported] = useState(false);
    const [voiceMuted, setVoiceMuted] = useState(false);
    const [verbosity, setVerbosity] = useState<VerbosityLevel>("normal");
    const [showZoneAlert, setShowZoneAlert] = useState(true);
    const [experienceMode, setExperienceMode] = useState<"map" | "ar">("map");

    // ── 2. REFS ──
    const webcamRef = useRef<Webcam>(null);
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<google.maps.Map | null>(null);
    const markerRef = useRef<{ setPosition: (pos: google.maps.LatLngLiteral) => void } | null>(null);
    const circleRef = useRef<google.maps.Circle | null>(null);
    const badgeRef = useRef<any>(null);
    const watchIdRef = useRef<number | null>(null);
    const requestingLocationRef = useRef(false);
    const lastFetchPos = useRef<{ lat: number; lng: number } | null>(null);
    const polygonsRef = useRef<google.maps.Polygon[]>([]);
    const heatmapRef = useRef<google.maps.visualization.HeatmapLayer | null>(null);
    const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
    const routePolylineRef = useRef<google.maps.Polyline | null>(null);
    const lastZoneId = useRef<number | null>(null);
    const spokenLandmarks = useRef<Set<string>>(new Set());
    const lastDangerNarration = useRef<number>(0);
    const lastZoneFactNarration = useRef<number>(Date.now()); // Empezar con el tiempo actual para que no hable el dato apenas entra (choca con la bienvenida)
    const lastNarratedPos = useRef<{ lat: number; lng: number } | null>(null);
    const dragStartY = useRef<number>(0);
    const drawerStartH = useRef<number>(0);
    const isDragging = useRef(false);
    const drawerCurrentH = useRef(280);
    const hasWelcomed = useRef(false);

    // ── 3. CUSTOM HOOKS ──
    const { language } = useExperience();
    const {
        isSpeaking: narratorSpeaking,
        currentNarration,
        experienceLog,
        speak,
        unlockSpeech,
        speechUnlocked,
        voicePreference,
        selectedVoiceId,
        availableVoices,
        setVoice,
        previewVoice
    } = useVoiceNarrator({ muted: voiceMuted, language });

    const speakRef = useRef(speak);
    useEffect(() => { speakRef.current = speak; }, [speak]);

    // ── 4. CALLBACKS ──

    const detectComuna = useCallback((lat: number, lng: number) => {
        for (const comuna of comunas) {
            if (pointInPolygon(lat, lng, comuna.coords)) {
                setCurrentComuna(comuna);
                return;
            }
        }
        setCurrentComuna(null);
    }, [comunas]);

    const drawRiskLayer = useCallback((map: google.maps.Map) => {
        polygonsRef.current.forEach(p => p.setMap(null));
        polygonsRef.current = [];

        comunas.forEach(comuna => {
            const cfg = RISK_CONFIG[comuna.risk];
            const paths = comuna.coords.map(([lat, lng]) => ({ lat, lng }));

            const polygon = new google.maps.Polygon({
                paths,
                map,
                fillColor: cfg.fill,
                fillOpacity: cfg.fillOpacity,
                strokeColor: cfg.stroke,
                strokeOpacity: 0.5,
                strokeWeight: 1.2,
                clickable: true,
            });

            polygon.addListener("click", (e: google.maps.PolyMouseEvent) => {
                if (infoWindowRef.current) infoWindowRef.current.close();
                const iw = new google.maps.InfoWindow({
                    content: getComunaInfoWindowContent(comuna),
                    position: e.latLng,
                });
                iw.open(map);
                infoWindowRef.current = iw;
            });

            polygonsRef.current.push(polygon);
        });
    }, [comunas]);

    const drawHeatmapLayer = useCallback((map: google.maps.Map) => {
        if (heatmapRef.current) { heatmapRef.current.setMap(null); }

        const weightMap: Record<RiskLevel, number> = { high: 1.0, medium: 0.65, low: 0.34, safe: 0.14 };
        const points: google.maps.visualization.WeightedLocation[] = [];

        comunas.forEach(comuna => {
            const centroid = getComunaCentroid(comuna);
            const baseWeight = weightMap[comuna.risk];

            points.push({
                location: new google.maps.LatLng(centroid.lat, centroid.lng),
                weight: baseWeight * 1.35,
            });

            comuna.coords.forEach(([lat, lng], index) => {
                points.push({
                    location: new google.maps.LatLng(lat, lng),
                    weight: baseWeight * 0.68,
                });

                const next = comuna.coords[(index + 1) % comuna.coords.length];
                points.push({
                    location: new google.maps.LatLng((lat + next[0]) / 2, (lng + next[1]) / 2),
                    weight: baseWeight * 0.48,
                });
            });
        });

        heatmapRef.current = new google.maps.visualization.HeatmapLayer({
            data: points,
            map,
            radius: Math.max(42, Math.min(92, 118 - (map.getZoom() ?? 13) * 4)),
            opacity: 0.58,
            gradient: [
                "rgba(34,197,94,0)",
                "rgba(34,197,94,0.42)",
                "rgba(132,204,22,0.55)",
                "rgba(245,158,11,0.68)",
                "rgba(239,68,68,0.78)",
                "rgba(153,27,27,0.86)",
            ],
        });

        const zoomListener = map.addListener("zoom_changed", () => {
            if (!heatmapRef.current) return;
            const zoom = map.getZoom() ?? 13;
            heatmapRef.current.set("radius", Math.max(38, Math.min(94, 122 - zoom * 4)));
        });

        heatmapRef.current.addListener("map_changed", () => {
            if (!heatmapRef.current?.getMap()) google.maps.event.removeListener(zoomListener);
        });
    }, [comunas]);

    const applyLayer = useCallback((mode: LayerMode, map: google.maps.Map) => {
        polygonsRef.current.forEach(p => p.setMap(null));
        polygonsRef.current = [];
        if (heatmapRef.current) { heatmapRef.current.setMap(null); heatmapRef.current = null; }

        if (mode === "risk") drawRiskLayer(map);
        else if (mode === "heatmap") drawHeatmapLayer(map);
    }, [drawRiskLayer, drawHeatmapLayer]);

    const selectComuna = useCallback((comuna: ComunaData) => {
        if (!mapInstance.current) return;

        setLayerMode("risk");
        const centroid = getComunaCentroid(comuna);
        mapInstance.current.panTo(centroid);
        mapInstance.current.setZoom(15);
        setCurrentComuna(comuna);

        if (infoWindowRef.current) infoWindowRef.current.close();

        const iw = new google.maps.InfoWindow({
            content: getComunaInfoWindowContent(comuna),
            position: centroid,
        });
        iw.open(mapInstance.current);
        infoWindowRef.current = iw;
    }, [setLayerMode]);

    const fetchNearby = useCallback(async (lat: number, lng: number) => {
        if (!mapInstance.current || !google.maps.places) return;
        if (!isInsideCaliBounds(lat, lng)) return;
        if (lastFetchPos.current) {
            const dist = haversineDistance(lastFetchPos.current.lat, lastFetchPos.current.lng, lat, lng);
            if (dist < 150) return;
        }
        lastFetchPos.current = { lat, lng };
        setLoadingPlaces(true);

        try {
            const { Place } = await google.maps.importLibrary("places") as google.maps.PlacesLibrary;

            const request = {
                fields: ["id", "displayName", "location", "types", "rating", "userRatingCount", "formattedAddress", "businessStatus"],
                locationRestriction: {
                    center: { lat, lng },
                    radius: 1000,
                },
                maxResultCount: 20
            };

            const { places } = await Place.searchNearby(request);

            if (places && places.length > 0) {
                const mapped = places.map((p: any): NearbyPlace => ({
                    place_id: p.id,
                    name: p.displayName,
                    vicinity: p.formattedAddress || "Dirección no disponible",
                    rating: p.rating,
                    user_ratings_total: p.userRatingCount,
                    types: p.types || [],
                    geometry: { location: p.location },
                    business_status: p.businessStatus as any,
                }));

                const sorted = mapped.sort((a, b) => {
                    const da = haversineDistance(lat, lng, a.geometry.location.lat(), a.geometry.location.lng());
                    const db = haversineDistance(lat, lng, b.geometry.location.lat(), b.geometry.location.lng());
                    return da - db;
                });
                setPlaces(sorted);
            } else {
                setPlaces([]);
            }
        } catch (e) {
            console.error("Place API search error:", e);
        } finally {
            setLoadingPlaces(false);
        }
    }, []);

    const fetchLocalLandmarks = useCallback(async (lat: number, lng: number) => {
        if (!mapInstance.current || !google.maps.places) return;
        if (!isInsideCaliBounds(lat, lng)) return;

        setLoadingLandmarks(true);
        try {
            const { Place } = await google.maps.importLibrary("places") as google.maps.PlacesLibrary;

            const request = {
                fields: ["id", "displayName", "location", "types"],
                includedTypes: ["tourist_attraction", "museum", "church", "historical_landmark"],
                locationRestriction: {
                    center: { lat, lng },
                    radius: 1000,
                },
                maxResultCount: 15
            };

            const { places } = await Place.searchNearby(request);

            if (places && places.length > 0) {
                const newLandmarks: Landmark[] = await Promise.all(places.map(async (p: any): Promise<Landmark> => {
                    const name = p.displayName ?? "Lugar Histórico";
                    const typeLabel = p.types?.includes("museum") ? "Museo" : p.types?.includes("church") ? "Patrimonio Religioso" : "Sitio Histórico";

                    let history = "";
                    let images: string[] = [];

                    const wikiData = await fetchWikipediaSummary(name);
                    if (wikiData) {
                        history = wikiData.extract;
                        images = wikiData.images;
                    }

                    if (!history) {
                        history = `${typeLabel} representativo de la zona de ${currentComuna?.name || "Cali"}, fundamental para la identidad y el patrimonio de la capital del Valle.`;
                    }

                    return {
                        name,
                        lat: p.location!.lat(),
                        lng: p.location!.lng(),
                        type: "monument",
                        icon: "",
                        description: typeLabel,
                        history: history.length > 500 ? history.substring(0, 497) + "..." : history,
                        radiusM: 200,
                        place_id: p.id,
                        images,
                        prompt: `Háblale al usuario sobre ${name} y su relevancia histórica en Cali.`,
                    };
                }));

                setLocalLandmarks(newLandmarks);
            } else {
                setLocalLandmarks([]);
            }
        } catch (e) {
            console.error("Place API landmarks error:", e);
        } finally {
            setLoadingLandmarks(false);
        }
    }, [currentComuna]);

    const applyCameraZoom = useCallback((zoomLevel: ArZoomLevel) => {
        const stream = webcamRef.current?.video?.srcObject as MediaStream | null;
        const track = stream?.getVideoTracks()[0];
        if (!track) return;

        const capabilities = track.getCapabilities?.() as MediaTrackCapabilities & {
            zoom?: { min?: number; max?: number; step?: number };
        };

        const minZoom = capabilities?.zoom?.min;
        const maxZoom = capabilities?.zoom?.max;
        if (typeof minZoom !== "number" || typeof maxZoom !== "number") {
            setArZoomSupported(false);
            return;
        }

        setArZoomSupported(true);
        const requestedZoom = Math.min(Math.max(zoomLevel, minZoom), maxZoom);
        track.applyConstraints({ advanced: [{ zoom: requestedZoom } as MediaTrackConstraintSet] })
            .catch(() => setArZoomSupported(false));
    }, []);

    const swapCameraZoom = useCallback(() => {
        setArZoomLevel(current => {
            const currentIndex = AR_ZOOM_LEVELS.indexOf(current);
            const next = AR_ZOOM_LEVELS[(currentIndex + 1) % AR_ZOOM_LEVELS.length];
            applyCameraZoom(next);
            return next;
        });
    }, [applyCameraZoom]);

    const initMap = useCallback(async (lat: number, lng: number) => {
        if (!mapRef.current) return;
        await loadGoogleMapsViaProxy();
        const { Map } = await ensureGoogleMapsLibraries();
        const center = isInsideCaliBounds(lat, lng) ? { lat, lng } : CALI_CENTER;

        mapInstance.current = new Map(mapRef.current!, {
            center,
            zoom: 13,
            styles: MAP_STYLES,
            disableDefaultUI: true,
            gestureHandling: "greedy",
            minZoom: 11,
            maxZoom: 18,
            restriction: { latLngBounds: CALI_BOUNDS, strictBounds: true },
        });

        infoWindowRef.current = new google.maps.InfoWindow();
        routePolylineRef.current = new google.maps.Polyline({
            map: mapInstance.current,
            strokeColor: "#3b82f6",
            strokeWeight: 6,
            strokeOpacity: 0.8,
            visible: false,
        });

        circleRef.current = new google.maps.Circle({
            map: mapInstance.current,
            center,
            fillColor: "#3b82f6",
            fillOpacity: 0.06,
            strokeColor: "#3b82f6",
            strokeOpacity: 0.18,
            strokeWeight: 1,
            radius: 40,
        });

        class UserDotOverlay extends google.maps.OverlayView {
            private div: HTMLDivElement | null = null;
            constructor(private pos: google.maps.LatLngLiteral, private map: google.maps.Map) { super(); this.setMap(map); }
            onAdd() {
                this.div = document.createElement("div");
                this.div.style.position = "absolute";
                this.div.style.width = "20px";
                this.div.style.height = "20px";
                this.div.style.zIndex = "998";
                this.div.style.pointerEvents = "none";
                this.div.innerHTML = PIN_SVG;
                this.getPanes()!.overlayMouseTarget.appendChild(this.div);
            }
            draw() {
                const projection = this.getProjection();
                if (!projection || !this.div) return;
                const point = projection.fromLatLngToDivPixel(new google.maps.LatLng(this.pos.lat, this.pos.lng));
                if (!point) return;
                this.div.style.left = `${point.x}px`;
                this.div.style.top = `${point.y}px`;
                this.div.style.transform = "translate(-50%, -50%)";
            }
            setPosition(pos: google.maps.LatLngLiteral) { this.pos = pos; this.draw(); }
            onRemove() { this.div?.parentNode?.removeChild(this.div); this.div = null; }
        }

        markerRef.current = new UserDotOverlay(center, mapInstance.current);

        class BadgeOverlay extends google.maps.OverlayView {
            private div: HTMLDivElement | null = null;
            constructor(private pos: google.maps.LatLng, private map: google.maps.Map) { super(); this.setMap(map); }
            onAdd() {
                this.div = document.createElement("div");
                this.div.style.position = "absolute";
                this.div.style.cursor = "default";
                this.div.style.zIndex = "999";
                this.div.innerHTML = `
          <div style="display:flex;align-items:center;gap:6px;padding:3px 10px 3px 3px;background:white;border-radius:40px;border:1px solid rgba(0,0,0,0.08);transform:translateY(-48px);white-space:nowrap">
            <div style="width:22px;height:22px;border-radius:50%;background:#eff6ff;border:2px solid #3b82f6;display:flex;align-items:center;justify-content:center;font-size:10px;">📍</div>
            <span style="font-family:-apple-system,sans-serif;font-size:12px;font-weight:700;color:#1e3a5f">Tú</span>
          </div>`;
                this.getPanes()!.floatPane.appendChild(this.div);
            }
            draw() {
                const projection = this.getProjection();
                if (!projection) return;
                const p = projection.fromLatLngToDivPixel(this.pos);
                if (this.div && p) {
                    this.div.style.left = p.x + "px";
                    this.div.style.top = p.y + "px";
                    this.div.style.transform = "translateX(-50%)";
                }
            }
            setPosition(pos: google.maps.LatLng) { this.pos = pos; this.draw(); }
            onRemove() { this.div?.parentNode?.removeChild(this.div); }
        }

        badgeRef.current = new BadgeOverlay(new google.maps.LatLng(center.lat, center.lng), mapInstance.current);

        const caliBounds = new google.maps.LatLngBounds(
            { lat: CALI_BOUNDS.south, lng: CALI_BOUNDS.west },
            { lat: CALI_BOUNDS.north, lng: CALI_BOUNDS.east }
        );
        mapInstance.current.fitBounds(caliBounds, isMobile ? 44 : 72);
        applyLayer(layerMode, mapInstance.current);
        fetchNearby(center.lat, center.lng);
        detectComuna(center.lat, center.lng);
    }, [isMobile, layerMode, applyLayer, fetchNearby, detectComuna]);

    const handlePosition = useCallback(async (position: GeolocationPosition) => {
        requestingLocationRef.current = false;
        setLocationError(null);
        setLocationDebug(null);
        const { latitude: lat, longitude: lng, accuracy } = position.coords;
        writeCachedLocation({ lat, lng, accuracy });
        setCoords({ lat, lng, accuracy });
        setStatus("tracking");

        if (!mapInstance.current) {
            try {
                await initMap(lat, lng);
            } catch (error) {
                console.error("Map initialization error:", error);
                setLocationError("No pudimos cargar Google Maps. Revisa la configuración de la API key.");
                setStatus("error");
            }
        } else {
            const pos = { lat, lng };
            mapInstance.current.panTo(pos);
            markerRef.current?.setPosition(pos);
            badgeRef.current?.setPosition(new google.maps.LatLng(lat, lng));
            circleRef.current?.setCenter(pos);
            circleRef.current?.setRadius(Math.min(accuracy, 200));
            fetchNearby(lat, lng);
            detectComuna(lat, lng);
        }
    }, [initMap, fetchNearby, detectComuna]);

    const handleError = useCallback((err: GeolocationPositionError) => {
        requestingLocationRef.current = false;
        setLocationDebug(`Error ${err.code}: ${err.message || "sin mensaje"}`);
        if (err.code === err.PERMISSION_DENIED) {
            setLocationError("Permiso de ubicación denegado. Actívalo en tu navegador.");
            setStatus("denied");
            return;
        }
        setLocationError(err.code === err.TIMEOUT ? "La ubicación tardó demasiado." : "No pudimos obtener tu ubicación.");
        setStatus("error");
    }, []);

    const requestLocation = useCallback((requestOptions?: { silent?: boolean }) => {
        if (requestingLocationRef.current) return;
        const silent = requestOptions?.silent ?? false;
        setLocationError(null);
        if (!silent) setLocationDebug(`Origen: ${window.location.origin} | Seguro: ${window.isSecureContext ? "si" : "no"}`);

        if (!window.isSecureContext) {
            if (!silent) { setLocationError("Se requiere HTTPS para la ubicación."); setStatus("error"); }
            return;
        }
        if (!navigator.geolocation) {
            if (!silent) { setLocationError("Tu navegador no soporta ubicación."); setStatus("error"); }
            return;
        }

        requestingLocationRef.current = true;
        if (!silent) setStatus("loading");

        const options = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };
        navigator.geolocation.getCurrentPosition(
            pos => {
                handlePosition(pos);
                if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = navigator.geolocation.watchPosition(handlePosition, handleError, options);
            },
            err => {
                if (err.code === err.TIMEOUT || err.code === err.POSITION_UNAVAILABLE) {
                    navigator.geolocation.getCurrentPosition(pos => {
                        handlePosition(pos);
                        if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
                        watchIdRef.current = navigator.geolocation.watchPosition(handlePosition, handleError, { ...options, enableHighAccuracy: false });
                    }, silent ? () => { requestingLocationRef.current = false; } : handleError, { ...options, enableHighAccuracy: false });
                } else {
                    if (silent) requestingLocationRef.current = false; else handleError(err);
                }
            },
            options
        );
    }, [handlePosition, handleError]);

    // ── 5. EFFECTS ──

    useEffect(() => {
        const fetchComunas = async () => {
            const CACHE_KEY = "caliguia_comunas_data";
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) { try { setComunas(JSON.parse(cached)); return; } catch (e) { console.error("Cache error", e); } }

            try {
                const res = await fetch("/api/comunas");
                if (!res.ok) return;
                const data = await res.json();
                const transformed: ComunaData[] = data.features.map((f: any) => {
                    const id = parseInt(f.properties.comuna);
                    const riskInfo = COMUNA_RISK_MAP[id] || { risk: "medium", description: "Información en proceso." };
                    const name = f.properties.nombre ? (f.properties.nombre.includes("Comuna") ? f.properties.nombre : `Comuna ${id} — ${f.properties.nombre}`) : `Comuna ${id}`;
                    let coords: [number, number][] = [];
                    if (f.geometry.type === "Polygon") coords = f.geometry.coordinates[0].map((c: any) => [c[1], c[0]]);
                    else if (f.geometry.type === "MultiPolygon") coords = f.geometry.coordinates[0][0].map((c: any) => [c[1], c[0]]);
                    return { id, name, risk: riskInfo.risk, description: riskInfo.description, barrios: [], coords };
                });
                setComunas(transformed);
                localStorage.setItem(CACHE_KEY, JSON.stringify(transformed));
            } catch (err) { console.error("Fetch Comunas failed:", err); }
        };
        fetchComunas();
    }, []);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener("resize", check);
        return () => window.removeEventListener("resize", check);
    }, []);

    useEffect(() => {
        const oldAuthFailure = window.gm_authFailure;
        window.gm_authFailure = () => {
            setLocationError("Conexión rechazada por Google Maps. Verifica tu API Key.");
            setStatus("error");
            requestingLocationRef.current = false;
            if (oldAuthFailure) oldAuthFailure();
        };
        return () => { window.gm_authFailure = oldAuthFailure; };
    }, []);

    useEffect(() => { if (mapInstance.current) applyLayer(layerMode, mapInstance.current); }, [layerMode, applyLayer]);

    useEffect(() => {
        if (coords) {
            detectComuna(coords.lat, coords.lng);
            fetchLocalLandmarks(coords.lat, coords.lng);
            if (mapInstance.current) mapInstance.current.panTo({ lat: coords.lat, lng: coords.lng });
        }
    }, [coords, detectComuna, fetchLocalLandmarks]);

    useEffect(() => {
        if (currentComuna && currentComuna.id !== lastZoneId.current) { lastZoneId.current = currentComuna.id; setShowZoneAlert(true); }
        else if (!currentComuna) { lastZoneId.current = null; }
    }, [currentComuna]);

    useEffect(() => {
        let isMounted = true;
        const restoreLocation = async () => {
            const cached = readCachedLocation();
            if (cached) {
                setCoords({ lat: cached.lat, lng: cached.lng, accuracy: cached.accuracy });
                setStatus("tracking");
                detectComuna(cached.lat, cached.lng);
                if (!mapInstance.current) { try { await initMap(cached.lat, cached.lng); } catch (e) { if (isMounted) { setLocationError("No pudimos cargar Google Maps."); setStatus("error"); } } }
            }
            try {
                if (navigator.permissions && navigator.permissions.query) {
                    const result = await navigator.permissions.query({ name: "geolocation" });
                    if (!isMounted) return;
                    if (result.state === "granted") requestLocation({ silent: Boolean(cached) });
                    result.onchange = () => { if (result.state === "granted") requestLocation({ silent: Boolean(readCachedLocation()) }); };
                }
            } catch { if (!cached && hasLocationOptIn()) setStatus("idle"); }
        };
        restoreLocation();
        return () => { isMounted = false; };
    }, [detectComuna, requestLocation, initMap]);

    useEffect(() => { return () => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current); }; }, []);

    useEffect(() => {
        if (!coords || voiceMuted) return;
        const { lat, lng } = coords;

        // ── Bienvenida Inteligente por Zona (Memoria de sesión) ──
        if (!hasWelcomed.current && localLandmarks.length > 0 && !loadingLandmarks) {
            hasWelcomed.current = true;

            const lastSessionLat = sessionStorage.getItem("caliguia_last_welcome_lat");
            const lastSessionLng = sessionStorage.getItem("caliguia_last_welcome_lng");

            let skipWelcome = false;
            if (lastSessionLat && lastSessionLng) {
                const dist = haversineDistance(lat, lng, parseFloat(lastSessionLat), parseFloat(lastSessionLng));
                if (dist < 500) skipWelcome = true; // Si recarga a menos de 500m del último saludo, no repite
            }

            if (!skipWelcome) {
                sessionStorage.setItem("caliguia_last_welcome_lat", lat.toString());
                sessionStorage.setItem("caliguia_last_welcome_lng", lng.toString());

                const nearbyNames = localLandmarks.slice(0, 3).map(l => l.name).join(", ");
                const prompt = `El turista acaba de abrir la app y se encuentra en Cali. Está muy cerca de: ${nearbyNames || "lugares icónicos"}. Dale una bienvenida muy cálida y suelta un dato MUY curioso o atractivo sobre esta zona específica para motivarlo a explorar. Máximo 40 palabras.`;

                fetchNarration(prompt, "welcome", language).then(text => {
                    if (text) speakRef.current({ type: "welcome", text, title: "Explorando Cali", icon: "🌺" });
                }).catch(() => null);
            }
        }
        const movedEnough = !lastNarratedPos.current || haversineDistance(lastNarratedPos.current.lat, lastNarratedPos.current.lng, lat, lng) > 80;
        if (!movedEnough) return;
        lastNarratedPos.current = { lat, lng };

        if (!voiceMuted) {
            const dangerComuna = comunas.find(c => c.risk === "high" && pointInPolygon(lat, lng, c.coords));
            if (dangerComuna) {
                const now = Date.now();
                if (now - lastDangerNarration.current > 3 * 60 * 1000) {
                    lastDangerNarration.current = now;
                    const fallbackDanger = `Ojo, parce. Estás entrando a ${dangerComuna.name}. Mantente atento y por favor cuídate.`;
                    speakRef.current({ type: "danger", text: fallbackDanger, title: `⚠️ ${dangerComuna.name}`, icon: "⚠️" });
                    fetchNarration(`El usuario está ingresando a ${dangerComuna.name}. ${dangerComuna.description}`, "danger", language).then(text => {
                        if (text) speakRef.current({ type: "danger", text, title: `⚠️ ${dangerComuna.name}`, icon: "⚠️" });
                    }).catch(() => null);
                }
            }
        }

        // ── Datos Curiosos y Planes por Zona (Latido Geográfico ajustado por Verbosidad) ──
        if (!voiceMuted && currentComuna && currentComuna.risk !== "high") {
            const now = Date.now();
            const intervalMs = verbosity === "mucho" ? 2 * 60 * 1000 : verbosity === "poco" ? 8 * 60 * 1000 : 4 * 60 * 1000;

            if (now - lastZoneFactNarration.current > intervalMs) {
                lastZoneFactNarration.current = now;
                const promptFact = `El usuario se encuentra paseando por ${currentComuna.name}. Cuéntale un dato cultural muy curioso, histórico corto o recomiéndale un "parche" (plan/evento típico) cerca de esta zona. Máximo 40 palabras, tono caleño amigable.`;
                fetchNarration(promptFact, "info", language).then(text => {
                    if (text) speakRef.current({ type: "info", text, title: `💡 ${currentComuna.name}`, icon: "💡" });
                }).catch(() => null);
            }
        }

        const currentViewLandmarks = localLandmarks;
        for (const landmark of currentViewLandmarks) {
            if (spokenLandmarks.current.has(landmark.name)) continue;
            if (haversineDistance(lat, lng, landmark.lat, landmark.lng) <= landmark.radiusM) {
                spokenLandmarks.current.add(landmark.name);
                fetchNarration(landmark.prompt, "monument", language).then(text => {
                    if (text) speakRef.current({ type: "monument", text, title: landmark.name, icon: landmark.icon });
                }).catch(() => null);
                break;
            }
        }
    }, [coords, voiceMuted, comunas, localLandmarks, currentComuna, language, loadingLandmarks]);

    // ── 6. RENDER HELPERS ──
    const getDrawerBounds = () => ({ min: 92, middle: 340, max: window.innerHeight - 130 });
    const clampDrawerHeight = (height: number) => { const { min, max } = getDrawerBounds(); return Math.min(Math.max(height, min), max); };
    const onDragStart = (clientY: number) => { isDragging.current = true; setIsDrawerDragging(true); dragStartY.current = clientY; drawerStartH.current = drawerCurrentH.current; };
    const onDragMove = (clientY: number) => { if (!isDragging.current) return; const delta = dragStartY.current - clientY; const next = clampDrawerHeight(drawerStartH.current + delta); drawerCurrentH.current = next; setDrawerH(next); };
    const onDragEnd = () => { isDragging.current = false; setIsDrawerDragging(false); const { min, middle, max } = getDrawerBounds(); const current = drawerCurrentH.current; const snap = current < 170 ? min : current > window.innerHeight * 0.58 ? max : middle; drawerCurrentH.current = snap; setDrawerH(snap); };
    const onDrawerPointerDown = (event: PointerEvent<HTMLDivElement>) => { event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); onDragStart(event.clientY); };
    const onDrawerPointerMove = (event: PointerEvent<HTMLDivElement>) => { if (!isDragging.current) return; event.preventDefault(); event.stopPropagation(); onDragMove(event.clientY); };
    const onDrawerPointerEnd = (event: PointerEvent<HTMLDivElement>) => { if (!isDragging.current) return; event.preventDefault(); event.stopPropagation(); if (event.currentTarget.hasPointerCapture(event.pointerId)) { event.currentTarget.releasePointerCapture(event.pointerId); } onDragEnd(); };

    const aiContext = coords ? `El usuario está en lat ${coords.lat.toFixed(5)}, lng ${coords.lng.toFixed(5)}. 
       ${currentComuna ? `Zona: ${currentComuna.name} — Riesgo ${RISK_CONFIG[currentComuna.risk].label}. ${currentComuna.description}` : ""}
       Negocios cercanos: ${places.slice(0, 5).map(p => p.name).join(", ")}.` : "El usuario aún no ha compartido su ubicación.";

    return {
        comunas, status, locationError, locationDebug, coords, places, localLandmarks, loadingPlaces, loadingLandmarks,
        drawerH, isDrawerDragging, isMobile, layerMode, setLayerMode, currentComuna, setCurrentComuna, activeTab, setActiveTab,
        expandedLandmark, setExpandedLandmark, currentImageIdx, setCurrentImageIdx, arCameraError, setArCameraError,
        arFacingMode, setArFacingMode, arZoomLevel, setArZoomLevel, arZoomSupported, voiceMuted, setVoiceMuted, showZoneAlert, setShowZoneAlert,
        experienceMode, setExperienceMode,
        webcamRef, mapRef, mapInstance, routePolylineRef,
        requestLocation, swapCameraZoom, applyCameraZoom, onDrawerPointerDown, onDrawerPointerMove, onDrawerPointerEnd,
        toggle3D: () => {
            if (mapInstance.current) {
                const currentTilt = mapInstance.current.getTilt();
                mapInstance.current.setTilt(currentTilt === 45 ? 0 : 45);
            }
        },
        narratorSpeaking, currentNarration, experienceLog, unlockSpeech, speechUnlocked, voicePreference, aiContext, selectComuna,
        selectedVoiceId, availableVoices, setVoice, verbosity, setVerbosity,
        previewVoice,
        speak
    };
}

const MapContext = createContext<MapContextType | null>(null);

export function MapProvider({ children }: { children: React.ReactNode }) {
    const value = UseHome();
    return <MapContext.Provider value={value}>{children}</MapContext.Provider>;
}

export function useMap() {
    const context = useContext(MapContext);
    if (!context) {
        throw new Error("useMap must be used within a MapProvider");
    }
    return context;
}
