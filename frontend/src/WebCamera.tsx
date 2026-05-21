import React, { useRef, useState, useEffect } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  Platform, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "./theme";

type Props = {
  visible: boolean;
  onCapture: (base64: string, uri: string) => void;
  onClose: () => void;
  title?: string;
  aspectRatio?: "1:1" | "4:3";
};

export function WebCamera({ visible, onCapture, onClose, title = "Take Photo", aspectRatio = "1:1" }: Props) {
  const videoRef = useRef<any>(null);
  const canvasRef = useRef<any>(null);
  const streamRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [flashOn, setFlashOn] = useState(false);
  const [flashSupported, setFlashSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible && Platform.OS === "web") {
      startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [visible, facingMode]);

  const startCamera = async () => {
    setReady(false);
    setError(null);
    stopCamera();
    try {
      const constraints: any = {
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };
      const stream = await (navigator as any).mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setReady(true);
      }

      // Check torch/flash support
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities?.();
      if (capabilities?.torch) {
        setFlashSupported(true);
      } else {
        setFlashSupported(false);
        setFlashOn(false);
      }
    } catch (e: any) {
      setError("Camera access denied. Please allow camera in browser settings.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t: any) => t.stop());
      streamRef.current = null;
    }
    setReady(false);
    setFlashOn(false);
  };

  const toggleFlash = async () => {
    if (!streamRef.current || !flashSupported) return;
    const track = streamRef.current.getVideoTracks()[0];
    const newFlash = !flashOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: newFlash }] });
      setFlashOn(newFlash);
    } catch {
      // Flash toggle failed silently
    }
  };

  const flipCamera = () => {
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  };

  const capture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const isSquare = aspectRatio === "1:1";
    const size = Math.min(video.videoWidth, video.videoHeight);
    canvas.width = isSquare ? size : video.videoWidth;
    canvas.height = isSquare ? size : video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (isSquare) {
      const offsetX = (video.videoWidth - size) / 2;
      const offsetY = (video.videoHeight - size) / 2;
      ctx.drawImage(video, offsetX, offsetY, size, size, 0, 0, size, size);
    } else {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    const base64 = dataUrl.split(",")[1];
    stopCamera();
    onCapture(base64, dataUrl);
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  if (Platform.OS !== "web") return null;
  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.container}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.headerBtn}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{title}</Text>
          <View style={styles.headerRight}>
            {flashSupported && (
              <TouchableOpacity onPress={toggleFlash} style={styles.headerBtn}>
                <Ionicons
                  name={flashOn ? "flash" : "flash-off"}
                  size={22}
                  color={flashOn ? colors.yellow : colors.textMuted}
                />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={flipCamera} style={styles.headerBtn}>
              <Ionicons name="camera-reverse-outline" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Camera view */}
        <View style={[styles.cameraWrap, aspectRatio === "1:1" ? styles.square : styles.landscape]}>
          {error ? (
            <View style={styles.errorWrap}>
              <Ionicons name="camera-off-outline" size={48} color={colors.red} />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={startCamera} style={styles.retryBtn}>
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* @ts-ignore */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  transform: facingMode === "user" ? "scaleX(-1)" : "scaleX(1)",
                  borderRadius: 12,
                }}
              />
              {!ready && (
                <View style={styles.loadingOverlay}>
                  <ActivityIndicator color={colors.cyan} size="large" />
                  <Text style={styles.loadingText}>Starting camera...</Text>
                </View>
              )}
              {/* Focus corners */}
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </>
          )}
        </View>

        {/* Hidden canvas for capture */}
        {/* @ts-ignore */}
        <canvas ref={canvasRef} style={{ display: "none" }} />

        {/* Capture button */}
        {!error && (
          <View style={styles.captureRow}>
            <TouchableOpacity
              onPress={capture}
              disabled={!ready}
              style={[styles.captureBtn, !ready && { opacity: 0.4 }]}>
              <View style={styles.captureBtnInner} />
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.hint}>
          {aspectRatio === "1:1"
            ? "Centre your face in the frame"
            : "Ensure all licence text is readable"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute" as any,
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.95)",
    zIndex: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    width: "100%",
    maxWidth: 480,
    padding: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  headerBtn: {
    width: 40, height: 40,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.bg2,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  headerRight: {
    flexDirection: "row",
    gap: 8,
  },
  cameraWrap: {
    width: "100%",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: colors.bg3,
    position: "relative",
  },
  square: { aspectRatio: 1 },
  landscape: { aspectRatio: 4 / 3 },
  loadingOverlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg3,
    gap: 12,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  errorWrap: {
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  errorText: {
    color: colors.red,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.bg2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  retryText: { color: colors.cyan, fontWeight: "700" },
  corner: {
    position: "absolute",
    width: 24, height: 24,
    borderColor: colors.cyan,
  },
  cornerTL: { top: 12, left: 12, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 4 },
  cornerTR: { top: 12, right: 12, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 4 },
  cornerBL: { bottom: 12, left: 12, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 4 },
  cornerBR: { bottom: 12, right: 12, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 4 },
  captureRow: {
    alignItems: "center",
    marginTop: 24,
    marginBottom: 8,
  },
  captureBtn: {
    width: 72, height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: colors.cyan,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  captureBtnInner: {
    width: 54, height: 54,
    borderRadius: 27,
    backgroundColor: colors.cyan,
  },
  hint: {
    color: colors.textDim,
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
  },
});
