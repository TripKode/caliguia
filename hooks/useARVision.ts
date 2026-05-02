"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type Webcam from "react-webcam";

interface VisionState {
  isReady: boolean;
  isAnalyzing: boolean;
  error: string | null;
}

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
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isProcessingAPIRef = useRef(false);
  const lastRecognizedRef = useRef<string | null>(null);

  // Initialize canvas only once
  useEffect(() => {
    canvasRef.current = document.createElement("canvas");
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Extract a JPEG base64 frame from the actual <video> element inside react-webcam
  const captureFrameEfficiently = useCallback((): string | null => {
    const video = getVideoElement(webcamRef);
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;

    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.6); // 60% quality — fast & light enough for vision API
  }, [webcamRef]);

  const processVisionAPI = useCallback(async (base64Image: string, onResult: (text: string) => void) => {
    if (isProcessingAPIRef.current) return;
    
    isProcessingAPIRef.current = true;
    try {
      const res = await fetch("/api/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64Image }),
      });
      if (res.ok) {
        const data = await res.json();
        
        if (data.recognized && data.text) {
          // Extraemos las primeras palabras del nombre del monumento para compararlo con el último hablado
          const monumentKey = data.text.split(" ").slice(0, 4).join(" ").toLowerCase();
          
          if (lastRecognizedRef.current !== monumentKey) {
            lastRecognizedRef.current = monumentKey;
            onResult(data.text);
          } else {
            console.log("📍 Monumento ya narrado, ignorando para no repetir:", monumentKey);
          }
        }
      }
    } catch (err) {
      console.error("Vision API Call Failed", err);
    } finally {
      isProcessingAPIRef.current = false;
    }
  }, []);

  const startAnalysis = useCallback(
    (onDetected: (description: string) => void) => {
      setVisionState((prev) => ({ ...prev, isAnalyzing: true }));
      lastRecognizedRef.current = null; // Reiniciar estado al entrar

      if (intervalRef.current) clearInterval(intervalRef.current);

      // Latido constante de Groq Vision (1 frame cada 10 segundos)
      intervalRef.current = setInterval(() => {
        if (!isProcessingAPIRef.current) {
          const frameBase64 = captureFrameEfficiently();
          if (frameBase64) {
            processVisionAPI(frameBase64, onDetected);
          }
        }
      }, 10000); // 10 segundos: asegura <= 6 requests por minuto, perfectamente dentro del rate limit gratuito.
    },
    [captureFrameEfficiently, processVisionAPI]
  );

  const stopAnalysis = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setVisionState((prev) => ({ ...prev, isAnalyzing: false }));
  }, []);

  const captureAndAnalyze = useCallback(async (onDetected: (text: string) => void) => {
    if (isProcessingAPIRef.current) return;
    const frameBase64 = captureFrameEfficiently();
    if (frameBase64) {
      await processVisionAPI(frameBase64, onDetected);
    }
  }, [captureFrameEfficiently, processVisionAPI]);

  return {
    ...visionState,
    startAnalysis,
    stopAnalysis,
    captureAndAnalyze, // Mantenemos la firma por compatibilidad, aunque ya no se use el botón
  };
}
