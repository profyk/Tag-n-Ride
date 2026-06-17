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

// Remembered across mounts within the page session so re-opening the
// scanner (e.g. cancelling out of /pay back to the scan screen) jumps
// straight to the known-good camera instead of re-negotiating every time.
let cachedDeviceId: string | null = null;

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

  // Finds the rear/environment camera without paying for slow negotiation
  // on every open. `facingMode: "ideal"` is just a hint, so:
  //   1. Fast path — reuse the deviceId that worked last time (instant).
  //   2. Common path — ask for "environment" (ideal). Almost all browsers
  //      honour this promptly without throwing.
  //   3. Verify: if the browser handed back the front camera anyway, look
  //      for a device labelled "back"/"rear" and swap to it once.
  //   4. Last resort: whatever camera is available (e.g. a laptop webcam).
  const acquireStream = useCallback(async (): Promise<MediaStream> => {
    const videoBase = { width: { ideal: 1920 }, height: { ideal: 1080 } };

    if (cachedDeviceId) {
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: { ...videoBase, deviceId: { exact: cachedDeviceId } },
          audio: false,
        });
      } catch {
        cachedDeviceId = null; // device may have disappeared; renegotiate below
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { ...videoBase, facingMode: "environment" },
        audio: false,
      });
      const settings: any = stream.getVideoTracks()[0]?.getSettings?.() ?? {};
      if (settings.facingMode !== "user") {
        cachedDeviceId = settings.deviceId ?? null;
        return stream;
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      const rear = devices.find(
        d => d.kind === "videoinput" && d.deviceId !== settings.deviceId && /back|rear|environment/i.test(d.label)
      );
      if (!rear) return stream; // no better option — keep what we have
      stream.getTracks().forEach(t => t.stop());
      const swapped = await navigator.mediaDevices.getUserMedia({
        video: { ...videoBase, deviceId: { exact: rear.deviceId } },
        audio: false,
      });
      cachedDeviceId = rear.deviceId;
      return swapped;
    } catch {}

    return navigator.mediaDevices.getUserMedia({ video: videoBase, audio: false });
  }, []);

  const start = useCallback(async () => {
    stop();
    try {
      const stream = await acquireStream();
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
  }, [stop, tick, acquireStream, onTorchSupportChange, onError]);

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
