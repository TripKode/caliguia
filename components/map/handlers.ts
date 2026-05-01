import {
    CALI_BOUNDS,
    LOCATION_CACHE_KEY,
    LOCATION_CACHE_MAX_AGE,
    LOCATION_OPT_IN_KEY,
    LEGACY_LOCATION_OPT_IN_KEY,
} from "@/components/map/data";
import { ComunaData, CachedLocation } from "./types";


function hasBaseGoogleMaps() {
    return Boolean(window.google?.maps?.Map || window.google?.maps?.importLibrary);
}

function waitForGoogleMapsBase(timeoutMs = 10000) {
    if (hasBaseGoogleMaps()) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
        const startedAt = Date.now();
        const interval = window.setInterval(() => {
            if (hasBaseGoogleMaps()) {
                window.clearInterval(interval);
                resolve();
                return;
            }

            if (Date.now() - startedAt > timeoutMs) {
                window.clearInterval(interval);
                reject(new Error("Google Maps SDK did not become ready after script load"));
            }
        }, 50);
    });
}

export async function loadGoogleMapsViaProxy() {
    if (hasBaseGoogleMaps()) return;
    if (window.__googleMapsProxyLoading) return window.__googleMapsProxyLoading;

    window.__googleMapsProxyLoading = (async () => {
        const keyRes = await fetch("/api/maps-key", { cache: "no-store" });
        if (!keyRes.ok) {
            throw new Error("Maps internal secret not configured");
        }

        const keyData = await keyRes.json();
        const internalSecret = keyData.secret || keyData.key || "";
        if (!internalSecret) {
            throw new Error("Maps internal secret not available");
        }

        await new Promise<void>((resolve, reject) => {
            const scriptId = "google-maps-proxy-script";
            const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;

            if (hasBaseGoogleMaps()) {
                resolve();
                return;
            }

            if (existingScript) {
                waitForGoogleMapsBase().then(resolve).catch(reject);
                existingScript.addEventListener("error", () => reject(new Error("Failed to load Maps via proxy")), {
                    once: true,
                });
                return;
            }

            const params = new URLSearchParams({
                internal_secret: internalSecret,
                libraries: "maps,places,visualization",
                v: "weekly",
                language: "es",
                loading: "async",
                callback: "__caliguiaGoogleMapsReady",
            });

            const script = document.createElement("script");
            script.id = scriptId;
            script.src = `/api/maps-proxy?${params.toString()}`;
            script.async = true;
            script.defer = true;
            script.crossOrigin = "anonymous";
            window.__caliguiaGoogleMapsReady = () => {
                waitForGoogleMapsBase().then(resolve).catch(reject);
            };
            script.onload = () => {
                waitForGoogleMapsBase().then(resolve).catch(reject);
            };
            script.onerror = () => reject(new Error("Failed to load Maps via proxy"));
            document.head.appendChild(script);
        });
    })().catch((error) => {
        window.__googleMapsProxyLoading = undefined;
        throw error;
    });

    return window.__googleMapsProxyLoading;
}

export async function ensureGoogleMapsLibraries() {
    if (typeof google.maps.importLibrary === "function") {
        const [{ Map }] = await Promise.all([
            google.maps.importLibrary("maps") as Promise<google.maps.MapsLibrary>,
            google.maps.importLibrary("places"),
            google.maps.importLibrary("visualization"),
        ]);

        return { Map };
    }

    if (!google.maps.Map || !google.maps.places?.Place || !google.maps.visualization?.HeatmapLayer) {
        throw new Error("Google Maps libraries were not available after script load");
    }

    return { Map: google.maps.Map };
}


export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function pointInPolygon(lat: number, lng: number, polygon: [number, number][]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][1], yi = polygon[i][0];
        const xj = polygon[j][1], yj = polygon[j][0];
        const intersect = yi > lng !== yj > lng && lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
}

export function isInsideCaliBounds(lat: number, lng: number) {
    return lat <= CALI_BOUNDS.north && lat >= CALI_BOUNDS.south && lng <= CALI_BOUNDS.east && lng >= CALI_BOUNDS.west;
}

export function getComunaCentroid(comuna: ComunaData) {
    const lat = comuna.coords.reduce((sum, [value]) => sum + value, 0) / comuna.coords.length;
    const lng = comuna.coords.reduce((sum, [, value]) => sum + value, 0) / comuna.coords.length;
    return { lat, lng };
}

export function readCachedLocation(): CachedLocation | null {
    if (typeof window === "undefined") return null;

    try {
        const raw = window.localStorage.getItem(LOCATION_CACHE_KEY);
        if (!raw) return null;

        const cached = JSON.parse(raw) as Partial<CachedLocation>;
        if (
            typeof cached.lat !== "number" ||
            typeof cached.lng !== "number" ||
            typeof cached.accuracy !== "number" ||
            typeof cached.savedAt !== "number"
        ) {
            return null;
        }

        if (Date.now() - cached.savedAt > LOCATION_CACHE_MAX_AGE) {
            window.localStorage.removeItem(LOCATION_CACHE_KEY);
            return null;
        }

        return cached as CachedLocation;
    } catch {
        return null;
    }
}

export function writeCachedLocation(location: Omit<CachedLocation, "savedAt">) {
    try {
        window.localStorage.setItem(LOCATION_OPT_IN_KEY, "true");
        window.localStorage.setItem(LEGACY_LOCATION_OPT_IN_KEY, "true");
        window.localStorage.setItem(
            LOCATION_CACHE_KEY,
            JSON.stringify({ ...location, savedAt: Date.now() })
        );
    } catch {
        // Storage can be unavailable in private browsing; location still works for the session.
    }
}

export function hasLocationOptIn() {
    try {
        return (
            window.localStorage.getItem(LOCATION_OPT_IN_KEY) === "true" ||
            window.localStorage.getItem(LEGACY_LOCATION_OPT_IN_KEY) === "true"
        );
    } catch {
        return false;
    }
}