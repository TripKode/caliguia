"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export interface BalancedARPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  kind?: "bot" | "stop" | "destination" | "nearby";
}

interface BalancedAROverlayProps {
  userCoords: { lat: number; lng: number; accuracy?: number } | null;
  points: BalancedARPoint[];
  language?: "es" | "en" | "pt";
}

const TEXT = {
  es: {
    enableCompass: "Activar brújula",
    lookForGuide: "Gira el teléfono para encontrar la guía",
    noRoute: "Crea una ruta para ver veletas de navegación.",
    guide: "Guía",
    destination: "Destino",
  },
  en: {
    enableCompass: "Enable compass",
    lookForGuide: "Turn your phone to find the guide",
    noRoute: "Create a route to see navigation markers.",
    guide: "Guide",
    destination: "Destination",
  },
  pt: {
    enableCompass: "Ativar bússola",
    lookForGuide: "Gire o telefone para encontrar o guia",
    noRoute: "Crie uma rota para ver marcadores de navegação.",
    guide: "Guia",
    destination: "Destino",
  },
};

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

function getDistanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const radius = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function getBearingDegrees(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function normalizeAngle(value: number) {
  return ((value + 540) % 360) - 180;
}

function formatDistance(distance: number) {
  if (distance >= 1000) return `${(distance / 1000).toFixed(1)} km`;
  return `${Math.max(1, Math.round(distance))} m`;
}

function getHeadingFromEvent(event: DeviceOrientationEvent) {
  const webkitHeading = (event as any).webkitCompassHeading;
  if (typeof webkitHeading === "number" && Number.isFinite(webkitHeading)) {
    return webkitHeading;
  }
  if (typeof event.alpha === "number" && Number.isFinite(event.alpha)) {
    return (360 - event.alpha) % 360;
  }
  return null;
}

export function BalancedAROverlay({ userCoords, points, language = "es" }: BalancedAROverlayProps) {
  const copy = TEXT[language] ?? TEXT.es;
  const [heading, setHeading] = useState(0);
  const [hasCompass, setHasCompass] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [screenSize, setScreenSize] = useState({ width: 1024, height: 768 });

  const handleOrientation = useCallback((event: DeviceOrientationEvent) => {
    const nextHeading = getHeadingFromEvent(event);
    if (nextHeading === null) return;
    setHasCompass(true);
    setHeading((prev) => {
      const delta = normalizeAngle(nextHeading - prev);
      return (prev + delta * 0.25 + 360) % 360;
    });
  }, []);

  useEffect(() => {
    const updateSize = () => setScreenSize({ width: window.innerWidth, height: window.innerHeight });
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof DeviceOrientationEvent === "undefined") return;
    setNeedsPermission(typeof (DeviceOrientationEvent as any).requestPermission === "function");

    if (typeof (DeviceOrientationEvent as any).requestPermission !== "function") {
      window.addEventListener("deviceorientation", handleOrientation, true);
      return () => window.removeEventListener("deviceorientation", handleOrientation, true);
    }
    return () => window.removeEventListener("deviceorientation", handleOrientation, true);
  }, [handleOrientation]);

  const requestCompass = async () => {
    if (typeof DeviceOrientationEvent === "undefined") return;
    try {
      const requestPermission = (DeviceOrientationEvent as any).requestPermission;
      if (typeof requestPermission === "function") {
        const permission = await requestPermission();
        if (permission !== "granted") return;
      }
      window.addEventListener("deviceorientation", handleOrientation, true);
      setNeedsPermission(false);
    } catch {
      setNeedsPermission(true);
    }
  };

  const rendered = useMemo(() => {
    if (!userCoords) return [];
    const fov = 68;

    return points
      .map((point, index) => {
        const distance = getDistanceMeters(userCoords, point);
        const bearing = getBearingDegrees(userCoords, point);
        const diffAngle = normalizeAngle(bearing - heading);
        const isVisible = Math.abs(diffAngle) <= fov / 2 && distance <= 1600;
        const normalizedX = diffAngle / (fov / 2);
        const screenX = (screenSize.width / 2) + normalizedX * (screenSize.width * 0.46);
        const scale = Math.max(0.42, Math.min(1.85, 20 / (distance + 8)));
        const laneOffset = Math.min(index, 5) * 18;
        const screenY = screenSize.height * 0.58 - scale * 42 - laneOffset;

        return {
          ...point,
          distance,
          diffAngle,
          isVisible,
          screenX,
          screenY,
          scale,
          zIndex: Math.round(scale * 100) + (point.kind === "bot" ? 20 : 0),
        };
      })
      .sort((a, b) => b.distance - a.distance);
  }, [heading, points, screenSize, userCoords]);

  const bot = rendered.find(point => point.kind === "bot") || rendered[0];
  const offscreenDirection = bot && !bot.isVisible ? (bot.diffAngle < 0 ? "left" : "right") : null;

  if (!userCoords) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
      {rendered.length === 0 && (
        <div className="absolute bottom-[18%] left-1/2 max-w-72 -translate-x-1/2 rounded-2xl border border-white/15 bg-black/45 px-4 py-3 text-center text-[12px] font-bold text-white/85 backdrop-blur-md">
          {copy.noRoute}
        </div>
      )}

      {rendered.map((point) => {
        if (!point.isVisible) return null;
        const isBot = point.kind === "bot";
        if (isBot) return null;
        const isDestination = point.kind === "destination";
        const color = isDestination ? "#10b981" : isBot ? "#3b82f6" : "#22d3ee";
        const label = isBot ? copy.guide : isDestination ? copy.destination : point.name;

        return (
          <div
            key={point.id}
            className="absolute flex flex-col items-center transition-transform duration-75 ease-linear"
            style={{
              left: point.screenX,
              top: point.screenY,
              transform: `translate(-50%, -50%) scale(${point.scale})`,
              zIndex: point.zIndex,
            }}
          >
            <div className="mb-2 h-0 w-0 animate-[caliguia-ar-bounce_900ms_ease-in-out_infinite_alternate] border-l-[9px] border-r-[9px] border-b-[18px] border-l-transparent border-r-transparent" style={{ borderBottomColor: color }} />
            <div
              className={`flex items-center justify-center border-2 border-white/80 text-white shadow-[0_0_22px_rgba(59,130,246,0.45)] ${isBot ? "h-16 w-12 rounded-2xl" : "h-9 w-9 rounded-full"}`}
              style={{ backgroundColor: color }}
            >
              {isBot ? (
                <span className="text-[10px] font-black tracking-tight">BOT</span>
              ) : (
                <span className="text-[15px] font-black leading-none">v</span>
              )}
            </div>
            <div className="mt-2 whitespace-nowrap rounded-full border border-white/15 bg-black/65 px-3 py-1 text-[11px] font-black text-white shadow-lg backdrop-blur-md">
              {label} · {formatDistance(point.distance)}
            </div>
          </div>
        );
      })}

      {offscreenDirection && (
        <div className="absolute bottom-[16%] left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-cyan-300/40 bg-black/65 px-4 py-2 text-[12px] font-black text-cyan-100 shadow-lg backdrop-blur-md">
          <span className="text-lg leading-none">{offscreenDirection === "left" ? "<" : ">"}</span>
          {copy.lookForGuide}
        </div>
      )}

      {(needsPermission || !hasCompass) && (
        <button
          type="button"
          onClick={requestCompass}
          className="pointer-events-auto absolute bottom-[26%] left-1/2 -translate-x-1/2 rounded-full border border-white/20 bg-white/95 px-4 py-2 text-[12px] font-black text-zinc-800 shadow-xl"
        >
          {copy.enableCompass}
        </button>
      )}

      <style>{`
        @keyframes caliguia-ar-bounce {
          from { transform: translateY(0); }
          to { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  );
}
