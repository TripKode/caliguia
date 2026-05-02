export type Status = "idle" | "loading" | "tracking" | "denied" | "error";
export type LayerMode = "risk" | "heatmap" | "none";
export type ActiveTab = "local" | "places" | "zones" | "experience";
export type RiskLevel = "low" | "medium" | "high" | "safe";
export type ArZoomLevel = 1 | 10 | 0.05;
export type VerbosityLevel = "mucho" | "normal" | "poco";

export interface ComunaData {
    id: number;
    name: string;
    risk: RiskLevel;
    description: string;
    barrios: string[];
    coords: [number, number][];
}

export interface NearbyPlace extends google.maps.places.PlaceResult {
    place_id: string;
    name: string;
    vicinity: string;
    types: string[];
    geometry: {
        location: google.maps.LatLng;
    };
    rating?: number;
    user_ratings_total?: number;
    business_status?: "CLOSED_PERMANENTLY" | "CLOSED_TEMPORARILY" | "OPERATIONAL";
}

export interface Landmark {
    name: string;
    lat: number;
    lng: number;
    radiusM: number;
    icon: string;
    description: string;
    history: string;
    images: string[];
    prompt: string;
    type: string;
    place_id?: string;
}

export interface NarrationEvent {
    id: string;
    type: "monument" | "route" | "danger" | "info" | "welcome";
    text: string;
    title?: string;
    icon?: string;
    spokenAt?: number;
}

export interface MapContextType {
    comunas: ComunaData[];
    status: Status;
    locationError: string | null;
    locationDebug: string | null;
    coords: { lat: number; lng: number; accuracy: number } | null;
    places: NearbyPlace[];
    localLandmarks: Landmark[];
    loadingPlaces: boolean;
    loadingLandmarks: boolean;
    drawerH: number;
    isDrawerDragging: boolean;
    isMobile: boolean;
    layerMode: LayerMode;
    setLayerMode: (mode: LayerMode) => void;
    currentComuna: ComunaData | null;
    setCurrentComuna: (comuna: ComunaData | null) => void;
    activeTab: ActiveTab;
    setActiveTab: (tab: ActiveTab) => void;
    expandedLandmark: string | null;
    setExpandedLandmark: (name: string | null) => void;
    currentImageIdx: number;
    setCurrentImageIdx: (idx: number | ((prev: number) => number)) => void;
    arCameraError: string | null;
    setArCameraError: (err: string | null) => void;
    arFacingMode: "environment" | "user";
    setArFacingMode: (mode: "environment" | "user" | ((prev: "environment" | "user") => "environment" | "user")) => void;
    arZoomLevel: ArZoomLevel;
    setArZoomLevel: (zoom: ArZoomLevel | ((prev: ArZoomLevel) => ArZoomLevel)) => void;
    arZoomSupported: boolean;
    voiceMuted: boolean;
    setVoiceMuted: (muted: boolean | ((prev: boolean) => boolean)) => void;
    showZoneAlert: boolean;
    setShowZoneAlert: (show: boolean) => void;
    experienceMode: "map" | "ar";
    setExperienceMode: (mode: "map" | "ar") => void;
    webcamRef: React.RefObject<any>;
    mapRef: React.RefObject<HTMLDivElement | null>;
    mapInstance: React.MutableRefObject<google.maps.Map | null>;
    routePolylineRef: React.MutableRefObject<google.maps.Polyline | null>;
    requestLocation: (options?: { silent?: boolean }) => void;
    swapCameraZoom: () => void;
    applyCameraZoom: (zoom: ArZoomLevel) => void;
    onDrawerPointerDown: (event: any) => void;
    onDrawerPointerMove: (event: any) => void;
    onDrawerPointerEnd: (event: any) => void;
    narratorSpeaking: boolean;
    currentNarration: NarrationEvent | null;
    experienceLog: NarrationEvent[];
    unlockSpeech: (granted: boolean) => void;
    speechUnlocked: boolean;
    voicePreference: string;
    aiContext: string;
    selectComuna: (comuna: ComunaData) => void;
    selectedVoiceId: string;
    availableVoices: any[];
    setVoice: (id: string) => void;
    previewVoice: (id: string) => void;
    speak: (event: Omit<NarrationEvent, "id">) => void;
    verbosity: VerbosityLevel;
    setVerbosity: (v: VerbosityLevel) => void;
    toggle3D: () => void;
}

export interface CaliEvent {
    id: string;
    title: string;
    organizer: string;
    category: string;
    time: string;
    location: string;
    description: string;
    icon: string;
}

export interface CachedLocation {
    lat: number;
    lng: number;
    accuracy: number;
    savedAt: number;
}