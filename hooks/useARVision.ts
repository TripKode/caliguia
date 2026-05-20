"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type Webcam from "react-webcam";

interface VisionState {
  isReady: boolean;
  isAnalyzing: boolean;
  error: string | null;
  statusText: string;
  lastLandmarkName: string | null;
}

interface ARVisionContext {
  language?: "es" | "en" | "pt";
  coords?: { lat: number; lng: number; accuracy: number } | null;
  landmarks?: Array<{ name: string; lat?: number; lng?: number; description?: string }>;
  currentComuna?: { name: string; risk?: string } | null;
}

interface VisionApiResult {
  recognized?: boolean;
  landmarkName?: string | null;
  text?: string;
}

const MAX_FRAME_WIDTH = 960;
const MAX_FRAME_HEIGHT = 720;
const ANALYSIS_INTERVAL_MS = 6500;

// react-webcam exposes the inner <video> element at .video
function getVideoElement(webcamRef: React.RefObject<Webcam | null>): HTMLVideoElement | null {
  const webcam = webcamRef.current;
  if (!webcam) return null;
  // react-webcam stores the <video> at .video
  const video = (webcam as any).video as HTMLVideoElement | null;
  if (!video || video.readyState < 2) return null;
  return video;
}

export function useARVision(webcamRef: React.RefObject<Webcam | null>) {
  const [visionState, setVisionState] = useState<VisionState>({
    isReady: true, // Ready immediately, no MediaPipe required
    isAnalyzing: false,
    error: null,
    statusText: "Apunta la cámara hacia un lugar icónico.",
    lastLandmarkName: null,
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const initialTimeoutRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isProcessingAPIRef = useRef(false);
  const lastRecognizedRef = useRef<string | null>(null);

  const normalizeLandmarkKey = useCallback((value: string) => {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\b(el|la|los|las|del|de|parque|plaza|monumento|museo|iglesia)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }, []);

  // Initialize canvas only once
  useEffect(() => {
    canvasRef.current = document.createElement("canvas");
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (initialTimeoutRef.current) window.clearTimeout(initialTimeoutRef.current);
    };
  }, []);

  // Extract a JPEG base64 frame from the actual <video> element inside react-webcam
  const captureFrameEfficiently = useCallback((): string | null => {
    const video = getVideoElement(webcamRef);
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;

    const sourceW = video.videoWidth;
    const sourceH = video.videoHeight;
    if (!sourceW || !sourceH) return null;

    const scale = Math.min(1, MAX_FRAME_WIDTH / sourceW, MAX_FRAME_HEIGHT / sourceH);
    const w = Math.max(1, Math.round(sourceW * scale));
    const h = Math.max(1, Math.round(sourceH * scale));

    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.68);
  }, [webcamRef]);

  const processVisionAPI = useCallback(async (
    base64Image: string,
    context: ARVisionContext,
    onResult: (result: { text: string; landmarkName: string }) => void
  ) => {
    if (isProcessingAPIRef.current) return;
    
    isProcessingAPIRef.current = true;
    setVisionState((prev) => ({ ...prev, statusText: "Analizando vista...", error: null }));
    try {
      const res = await fetch("/api/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: base64Image,
          language: context.language || "es",
          coords: context.coords,
          landmarks: context.landmarks || [],
          currentComuna: context.currentComuna,
        }),
      });
      if (res.ok) {
        const data = await res.json() as VisionApiResult;
        
        if (data.recognized && data.text && data.landmarkName) {
          const monumentKey = normalizeLandmarkKey(data.landmarkName);
          
          if (lastRecognizedRef.current !== monumentKey) {
            lastRecognizedRef.current = monumentKey;
            setVisionState((prev) => ({
              ...prev,
              statusText: `Reconocido: ${data.landmarkName}`,
              lastLandmarkName: data.landmarkName || null,
            }));
            onResult({ text: data.text, landmarkName: data.landmarkName });
          } else {
            setVisionState((prev) => ({
              ...prev,
              statusText: `Ya narrado: ${data.landmarkName}`,
              lastLandmarkName: data.landmarkName || null,
            }));
            console.log("Monumento ya narrado, ignorando para no repetir:", monumentKey);
          }
        } else {
          setVisionState((prev) => ({
            ...prev,
            statusText: "No reconozco un lugar icónico todavía. Prueba apuntar al frente del monumento.",
            lastLandmarkName: null,
          }));
        }
      } else {
        setVisionState((prev) => ({ ...prev, statusText: "No pude analizar la vista ahora.", error: `Vision API ${res.status}` }));
      }
    } catch (err) {
      console.error("Vision API Call Failed", err);
      setVisionState((prev) => ({ ...prev, statusText: "No pude analizar la vista ahora.", error: "Vision API failed" }));
    } finally {
      isProcessingAPIRef.current = false;
    }
  }, [normalizeLandmarkKey]);

  const startAnalysis = useCallback(
    (context: ARVisionContext, onDetected: (result: { text: string; landmarkName: string }) => void) => {
      setVisionState((prev) => ({
        ...prev,
        isAnalyzing: true,
        statusText: "Analizando vista...",
        lastLandmarkName: null,
      }));
      lastRecognizedRef.current = null; // Reiniciar estado al entrar

      if (intervalRef.current) clearInterval(intervalRef.current);

      const analyzeOnce = () => {
        if (!isProcessingAPIRef.current) {
          const frameBase64 = captureFrameEfficiently();
          if (frameBase64) {
            processVisionAPI(frameBase64, context, onDetected);
          }
        }
      };

      if (initialTimeoutRef.current) window.clearTimeout(initialTimeoutRef.current);
      initialTimeoutRef.current = window.setTimeout(analyzeOnce, 300);
      intervalRef.current = setInterval(analyzeOnce, ANALYSIS_INTERVAL_MS);
    },
    [captureFrameEfficiently, processVisionAPI]
  );

  const stopAnalysis = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (initialTimeoutRef.current) {
      window.clearTimeout(initialTimeoutRef.current);
      initialTimeoutRef.current = null;
    }
    setVisionState((prev) => {
      const nextStatusText = "Apunta la cámara hacia un lugar icónico.";
      if (!prev.isAnalyzing && prev.statusText === nextStatusText) return prev;
      return {
        ...prev,
        isAnalyzing: false,
        statusText: nextStatusText,
      };
    });
  }, []);

  const captureAndAnalyze = useCallback(async (
    context: ARVisionContext,
    onDetected: (result: { text: string; landmarkName: string }) => void
  ) => {
    if (isProcessingAPIRef.current) return;
    const frameBase64 = captureFrameEfficiently();
    if (frameBase64) {
      await processVisionAPI(frameBase64, context, onDetected);
    }
  }, [captureFrameEfficiently, processVisionAPI]);

  return {
    ...visionState,
    startAnalysis,
    stopAnalysis,
    captureAndAnalyze, // Mantenemos la firma por compatibilidad, aunque ya no se use el botón
  };
}
