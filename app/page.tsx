"use client";

import { MapProvider } from "../hooks/UseMap";
import MapContent from "@/components/map/MapContent";
import PWAManager from "@/components/PWAManager";

declare global {
  interface Window {
    __googleMapsProxyLoading?: Promise<void>;
    __caliguiaGoogleMapsReady?: () => void;
    gm_authFailure?: () => void;
  }
}

export default function Home() {
  return (
    <MapProvider>
      <MapContent />
      <PWAManager />
    </MapProvider>
  );
}