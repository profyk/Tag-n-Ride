import React, { useRef, useCallback, useEffect } from "react";
import { View, StyleSheet, Platform } from "react-native";
import jsQR from "jsqr";

type Props = {
  active: boolean;
  torch: boolean;
  onScan: (data: string) => void;
  onTorchSupportChange?: (supported: boolean) => void;
  onError?: (message: string) => void;
};

const MAX_SCAN_DIM = 720; // downscale capture for fast per-frame decode

// Decodes QR codes directly in the browser via a bundled jsQR — no CDN
// dependency (expo-camera's web barcode path fetches jsQR from a CDN at
// runtime, which silently fails to scan when that request is blocked).
export function WebQrScanner({ active, torch, onScan, onTorchSupportChange, onError }: Props) {
  const videoRef  = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef    = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
      const vw = video.videoWidth, vh = video.videoHeight;
      if (vw && vh) {
        const scale = Math.min(1, MAX_SCAN_DIM / Math.max(vw, vh));
        const w = Math.max(1, Math.round(vw * scale));
        const h = Math.max(1, Math.round(vh * scale));
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | null;
        if (ctx) {
          ctx.drawImage(video, 0, 0, w, h);
          const frame = ctx.getImageData(0, 0, w, h);
          const result = jsQR(frame.data, w, h, { inversionAttempts: "attemptBoth" });
          if (result?.data) onScan(result.data);
        }
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [onScan]);

  const start = useCallback(async () => {
    stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const track = stream.getVideoTracks()[0];
      const caps: any = track.getCapabilities?.();
      onTorchSupportChange?.(!!caps?.torch);
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      onError?.("Camera access denied. Please allow camera access in your browser settings.");
    }
  }, [stop, tick, onTorchSupportChange, onError]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (active) start();
    else stop();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    const track = streamRef.current?.getVideoTracks()[0];
    const caps: any = track?.getCapabilities?.();
    if (track && caps?.torch) {
      track.applyConstraints({ advanced: [{ torch }] } as any).catch(() => {});
    }
  }, [torch]);

  if (Platform.OS !== "web") return null;

  return (
    <View style={StyleSheet.absoluteFillObject}>
      {/* @ts-ignore — web-only DOM element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
      {/* @ts-ignore — web-only DOM element, hidden capture buffer */}
      <canvas ref={canvasRef} style={{ display: "none" }} />
    </View>
  );
}
