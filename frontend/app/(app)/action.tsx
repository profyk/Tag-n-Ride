import React, { useCallback, useEffect, useState, useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Easing,
  ActivityIndicator, Alert, Share, ScrollView, TextInput, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import QRCode from "react-native-qrcode-svg";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "../../src/AuthContext";
import { useTheme } from "../../src/ThemeContext";
import { api, Wallet } from "../../src/api";
import { Button } from "../../src/ui";
import { radius } from "../../src/theme";
import { WebQrScanner } from "../../src/WebQrScanner";

// ── Constants ────────────────────────────────────────────────
const FRAME   = 260;   // viewport cutout size
const CORNER  = 34;   // corner bracket arm length
const BW      = 4;    // bracket line width
const LASER_H = 46;   // scan line height
const CYAN    = "#00D4FF";
const GREEN   = "#00FF88";
const OVERLAY = "rgba(5,5,10,0.84)";
const RECENT_KEY = "tnr_recent_pays";

type RecentPay = { code: string; name: string; phone: string; ts: number };

// ── Corner bracket ────────────────────────────────────────────
const Corner: React.FC<{ pos: "tl" | "tr" | "bl" | "br"; color: string }> = ({ pos, color }) => {
  const top  = pos[0] === "t";
  const left = pos[1] === "l";
  const base: object = {
    position: "absolute",
    ...(top  ? { top: 0 }    : { bottom: 0 }),
    ...(left ? { left: 0 }   : { right: 0 }),
  };
  return (
    <View style={{ ...base, width: CORNER, height: CORNER }}>
      {/* Horizontal arm */}
      <View style={{
        ...base, width: CORNER, height: BW,
        backgroundColor: color, borderRadius: BW / 2,
      }} />
      {/* Vertical arm */}
      <View style={{
        ...base, width: BW, height: CORNER,
        backgroundColor: color, borderRadius: BW / 2,
      }} />
    </View>
  );
};

// ── Root ─────────────────────────────────────────────────────
export default function ActionScreen() {
  const { state } = useAuth();
  if (state.status !== "authed") return null;
  if (state.user.role === "driver") return <DriverQR />;
  return <PassengerScan />;
}

// ═══════════════════════════════════════════════════════════════
//  WORLD-CLASS PASSENGER QR SCANNER
// ═══════════════════════════════════════════════════════════════
function PassengerScan() {
  const router  = useRouter();
  const { colors } = useTheme();

  const [permission, requestPermission] = useCameraPermissions();
  const [scanning,   setScanning]   = useState(true);
  const [manualCode, setManualCode] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [busy,       setBusy]       = useState(false);
  const [torch,      setTorch]      = useState(false);
  const [torchSupported, setTorchSupported] = useState(Platform.OS !== "web");
  const [webCamError, setWebCamError] = useState<string | null>(null);
  const [detected,   setDetected]   = useState(false);
  const [recent,     setRecent]     = useState<RecentPay[]>([]);

  // ── Animation values ──────────────────────────────────────
  const laserY       = useRef(new Animated.Value(0)).current;
  const frameScale   = useRef(new Animated.Value(0.84)).current;
  const frameOpacity = useRef(new Animated.Value(0)).current;
  const glowAnim     = useRef(new Animated.Value(0)).current;   // corner breathing
  const detectAnim   = useRef(new Animated.Value(0)).current;   // 0=cyan 1=green
  const flashAnim    = useRef(new Animated.Value(0)).current;   // success flash

  const laserLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  // ── Recent payments ───────────────────────────────────────
  const loadRecent = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(RECENT_KEY);
      if (raw) setRecent(JSON.parse(raw).slice(0, 4));
    } catch {}
  }, []);

  // ── Frame mount spring ────────────────────────────────────
  const mountFrame = useCallback(() => {
    frameScale.setValue(0.84);
    frameOpacity.setValue(0);
    detectAnim.setValue(0);
    Animated.parallel([
      Animated.spring(frameScale, {
        toValue: 1, useNativeDriver: true,
        tension: 68, friction: 8,
      }),
      Animated.timing(frameOpacity, {
        toValue: 1, duration: 360,
        useNativeDriver: true,
        easing: Easing.out(Easing.ease),
      }),
    ]).start();
  }, [detectAnim, frameOpacity, frameScale]);

  // ── Laser sweep loop ──────────────────────────────────────
  const startLaser = useCallback(() => {
    laserLoopRef.current?.stop();
    laserY.setValue(0);
    laserLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(laserY, {
          toValue: FRAME - LASER_H,
          duration: 2700, useNativeDriver: true,
          easing: Easing.inOut(Easing.quad),
        }),
        Animated.delay(280),
        Animated.timing(laserY, {
          toValue: 0,
          duration: 2700, useNativeDriver: true,
          easing: Easing.inOut(Easing.quad),
        }),
        Animated.delay(280),
      ])
    );
    laserLoopRef.current.start();
  }, [laserY]);

  // ── Corner breathing glow ─────────────────────────────────
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1, duration: 1700, useNativeDriver: true,
          easing: Easing.inOut(Easing.sin),
        }),
        Animated.timing(glowAnim, {
          toValue: 0, duration: 1700, useNativeDriver: true,
          easing: Easing.inOut(Easing.sin),
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [glowAnim]);

  // ── Focus lifecycle ───────────────────────────────────────
  useFocusEffect(useCallback(() => {
    setScanning(true);
    setDetected(false);
    setBusy(false);
    setWebCamError(null);
    mountFrame();
    startLaser();
    loadRecent();
    return () => { laserLoopRef.current?.stop(); };
  }, [mountFrame, startLaser, loadRecent]));

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  // ── QR detect animations ──────────────────────────────────
  const playDetect = () => {
    laserLoopRef.current?.stop();
    Animated.parallel([
      Animated.sequence([
        Animated.timing(flashAnim, { toValue: 0.42, duration: 55,  useNativeDriver: true }),
        Animated.timing(flashAnim, { toValue: 0,    duration: 460, useNativeDriver: true,
          easing: Easing.out(Easing.ease) }),
      ]),
      Animated.timing(detectAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  };

  // ── Scan handler ──────────────────────────────────────────
  const onScan = (data: string) => {
    if (!scanning || busy) return;
    setBusy(true);
    setDetected(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    playDetect();

    let code = data.trim();
    const m = data.match(/driver_id=([^&]+)/);
    if (m) code = decodeURIComponent(m[1].trim());

    if (!code) {
      setBusy(false);
      setDetected(false);
      setScanning(true);
      return;
    }

    setTimeout(() => {
      setBusy(false);
      setScanning(false);
      router.push({ pathname: "/pay", params: { qr_code: code } });
    }, 440);
  };

  // ── Manual submit ─────────────────────────────────────────
  const submitManual = () => {
    const code = manualCode.trim().toUpperCase();
    if (!code) return;
    if (!code.startsWith("TNR") || code.length !== 16) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert("Invalid code", "Enter a valid 16-character TNR code (e.g. TNR1234567890123).");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setScanning(false);
    router.push({ pathname: "/pay", params: { qr_code: code } });
  };

  // ── Derived animation values ──────────────────────────────
  const cornerBrightness   = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.70, 1] });
  const cyanCornersOpacity = detectAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const greenCornersOpacity = detectAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  // ── Quick-pay a recent driver ─────────────────────────────
  const quickPay = (code: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setScanning(false);
    router.push({ pathname: "/pay", params: { qr_code: code } });
  };

  // ════════════════════════════════════════════════════════
  //  PERMISSION SCREEN
  // ════════════════════════════════════════════════════════
  if (!permission?.granted) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]} testID="scan-screen">
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <View style={{
            width: 100, height: 100, borderRadius: 50,
            backgroundColor: colors.cyanDim,
            borderWidth: 2, borderColor: colors.cyan,
            alignItems: "center", justifyContent: "center",
            marginBottom: 28,
          }}>
            <Ionicons name="camera" size={46} color={colors.cyan} />
          </View>
          <Text style={{ color: colors.text, fontSize: 24, fontWeight: "800", textAlign: "center", marginBottom: 10 }}>
            Camera access needed
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 15, textAlign: "center", lineHeight: 22, marginBottom: 36 }}>
            Tag n Ride uses your camera to scan driver QR codes and process payments instantly.
          </Text>
          <Button label="Allow Camera Access" icon="camera"
            onPress={() => requestPermission()} testID="grant-camera-btn" />
          <View style={{ height: 10 }} />
          <Button label="Enter Code Manually" variant="secondary" icon="keypad-outline"
            onPress={() => setShowManual(true)} testID="fallback-manual-btn" />
        </View>
      </SafeAreaView>
    );
  }

  // ════════════════════════════════════════════════════════
  //  MANUAL CODE ENTRY
  // ════════════════════════════════════════════════════════
  if (showManual) {
    const hasPrefix = manualCode.startsWith("TNR");
    const fullLen   = manualCode.length === 16;
    const isValid   = hasPrefix && fullLen;
    const badPrefix = manualCode.length >= 3 && !hasPrefix;

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top", "bottom"]} testID="scan-screen">
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <TouchableOpacity
            onPress={() => { setShowManual(false); setManualCode(""); }}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <View>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>Enter Driver Code</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>Type or paste the 16-character TNR code</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
          {/* Format visual */}
          <View style={{ backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 18, marginBottom: 28, alignItems: "center" }}>
            <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 1.6, marginBottom: 12 }}>CODE FORMAT</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              {["T", "N", "R"].map((c, i) => (
                <View key={i} style={{ width: 26, height: 34, borderRadius: 6, backgroundColor: colors.cyanDim, borderWidth: 1.5, borderColor: colors.cyan, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: colors.cyan, fontWeight: "900", fontSize: 14, fontFamily: "monospace" }}>{c}</Text>
                </View>
              ))}
              <View style={{ width: 6 }} />
              {Array.from({ length: 13 }).map((_, i) => (
                <View key={i} style={{ width: 16, height: 34, borderRadius: 4, backgroundColor: colors.bg3, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: colors.textDim, fontSize: 10, fontFamily: "monospace" }}>0</Text>
                </View>
              ))}
            </View>
            <Text style={{ color: colors.textDim, fontSize: 11, marginTop: 10 }}>3 letters + 13 digits · 16 characters total</Text>
          </View>

          {/* Code input */}
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, marginBottom: 8 }}>DRIVER CODE</Text>
          <View style={{
            flexDirection: "row", alignItems: "center",
            backgroundColor: colors.bg2,
            borderRadius: radius.md,
            borderWidth: 1.5,
            borderColor: isValid ? colors.green : badPrefix ? colors.red : colors.border,
            paddingHorizontal: 14,
            marginBottom: 8,
          }}>
            <Ionicons
              name="finger-print"
              size={18}
              color={isValid ? colors.green : badPrefix ? colors.red : colors.textMuted}
              style={{ marginRight: 10 }}
            />
            <TextInput
              value={manualCode}
              onChangeText={t => setManualCode(t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16))}
              placeholder="TNR0000000000000"
              placeholderTextColor={colors.textDim}
              autoCapitalize="characters"
              autoFocus
              style={{
                flex: 1, color: colors.text,
                fontSize: 19, fontFamily: "monospace",
                fontWeight: "700", letterSpacing: 2,
                paddingVertical: 16,
              }}
              testID="manual-driver-input"
            />
            {manualCode.length > 0 && (
              <TouchableOpacity onPress={() => setManualCode("")} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close-circle" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Validation feedback */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 24, minHeight: 18 }}>
            {manualCode.length > 0 && (
              <>
                <Ionicons
                  name={isValid ? "checkmark-circle" : badPrefix ? "close-circle-outline" : "ellipse-outline"}
                  size={13}
                  color={isValid ? colors.green : badPrefix ? colors.red : colors.textDim}
                />
                <Text style={{ fontSize: 12, fontWeight: "600", color: isValid ? colors.green : badPrefix ? colors.red : colors.textDim }}>
                  {isValid ? "Valid TNR code" : badPrefix ? "Code must start with TNR" : `${manualCode.length} / 16 characters`}
                </Text>
              </>
            )}
          </View>

          <Button label="Continue to Pay" onPress={submitManual} icon="arrow-forward"
            disabled={!isValid} testID="manual-continue-btn" />

          {/* Recent payments */}
          {recent.length > 0 && (
            <View style={{ marginTop: 36 }}>
              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, marginBottom: 12 }}>RECENT PAYMENTS</Text>
              {recent.map((r) => (
                <TouchableOpacity
                  key={r.code}
                  onPress={() => quickPay(r.code)}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 12,
                    backgroundColor: colors.bg2, borderRadius: radius.md,
                    borderWidth: 1, borderColor: colors.border,
                    padding: 14, marginBottom: 8,
                  }}>
                  <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.cyanDim, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.cyan + "44" }}>
                    <Ionicons name="person" size={18} color={colors.cyan} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: "700", fontSize: 14 }}>{r.name}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{r.phone}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 3 }}>
                    <Text style={{ color: colors.cyan, fontFamily: "monospace", fontSize: 10, fontWeight: "700" }}>{r.code}</Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ════════════════════════════════════════════════════════
  //  IMMERSIVE CAMERA SCANNER
  // ════════════════════════════════════════════════════════
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }} testID="scan-screen">

      {/* ── Live camera (fills entire screen) ── */}
      {Platform.OS === "web" ? (
        <WebQrScanner
          active={scanning}
          torch={torch}
          onScan={onScan}
          onTorchSupportChange={setTorchSupported}
          onError={setWebCamError}
        />
      ) : (
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={r => onScan(r.data)}
        />
      )}

      {/* ── Web camera error ── */}
      {webCamError && (
        <View style={[StyleSheet.absoluteFillObject, { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.7)", padding: 32 }]}>
          <Ionicons name="camera-outline" size={40} color="#FF5C5C" style={{ marginBottom: 14 }} />
          <Text style={{ color: "#FFF", fontSize: 15, fontWeight: "700", textAlign: "center", marginBottom: 8 }}>
            Camera unavailable
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, textAlign: "center", marginBottom: 20 }}>
            {webCamError}
          </Text>
          <Button label="Enter Code Manually" variant="secondary" icon="keypad-outline"
            onPress={() => setShowManual(true)} />
        </View>
      )}

      {/* ── Dark overlay with viewport cutout (4-bar method) ── */}
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        <View style={{ flex: 1, backgroundColor: OVERLAY }} />
        <View style={{ flexDirection: "row", height: FRAME }}>
          <View style={{ flex: 1, backgroundColor: OVERLAY }} />
          <View style={{ width: FRAME }} />{/* transparent viewport */}
          <View style={{ flex: 1, backgroundColor: OVERLAY }} />
        </View>
        <View style={{ flex: 1, backgroundColor: OVERLAY }} />
      </View>

      {/* ── Animated scan frame ── */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { alignItems: "center", justifyContent: "center" }]}>

        <Animated.View style={{ transform: [{ scale: frameScale }], opacity: frameOpacity }}>
          <View style={{ width: FRAME, height: FRAME }}>

            {/* Laser sweep */}
            {!detected && (
              <Animated.View style={{
                position: "absolute", left: 0, right: 0,
                height: LASER_H,
                transform: [{ translateY: laserY }],
              }}>
                <LinearGradient
                  colors={[
                    "rgba(0,212,255,0)",
                    "rgba(0,212,255,0.05)",
                    "rgba(0,212,255,0.52)",
                    "rgba(0,212,255,1)",
                    "rgba(0,212,255,0.52)",
                    "rgba(0,212,255,0.05)",
                    "rgba(0,212,255,0)",
                  ]}
                  locations={[0, 0.06, 0.28, 0.5, 0.72, 0.94, 1]}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={{ flex: 1 }}
                />
              </Animated.View>
            )}

            {/* Corner brackets — cyan layer (breathing, fades on detect) */}
            <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: cornerBrightness }]}>
              <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: cyanCornersOpacity }]}>
                <Corner pos="tl" color={CYAN} />
                <Corner pos="tr" color={CYAN} />
                <Corner pos="bl" color={CYAN} />
                <Corner pos="br" color={CYAN} />
              </Animated.View>
            </Animated.View>

            {/* Corner brackets — green layer (fades in on detect) */}
            <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: greenCornersOpacity }]}>
              <Corner pos="tl" color={GREEN} />
              <Corner pos="tr" color={GREEN} />
              <Corner pos="bl" color={GREEN} />
              <Corner pos="br" color={GREEN} />
            </Animated.View>

          </View>
        </Animated.View>

        {/* Status pill below frame */}
        <View style={{ marginTop: 30 }}>
          {detected ? (
            <View style={{
              flexDirection: "row", alignItems: "center", gap: 8,
              backgroundColor: "rgba(0,255,136,0.13)",
              borderRadius: 999, paddingHorizontal: 20, paddingVertical: 11,
              borderWidth: 1, borderColor: "rgba(0,255,136,0.42)",
            }}>
              <Ionicons name="checkmark-circle" size={17} color={GREEN} />
              <Text style={{ color: GREEN, fontSize: 14, fontWeight: "700" }}>QR detected · Processing…</Text>
            </View>
          ) : (
            <View style={{
              flexDirection: "row", alignItems: "center", gap: 8,
              backgroundColor: "rgba(0,0,0,0.48)",
              borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10,
            }}>
              <Ionicons name="scan-outline" size={16} color="rgba(255,255,255,0.6)" />
              <Text style={{ color: "rgba(255,255,255,0.78)", fontSize: 13, fontWeight: "600" }}>
                Aim camera at driver or owner QR code
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Top controls ── */}
      <SafeAreaView edges={["top"]} style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
        <View style={{
          flexDirection: "row", alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16,
        }}>
          <View>
            <Text style={{ color: "#FFF", fontSize: 23, fontWeight: "800", letterSpacing: -0.4 }}>
              Scan & Pay
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.44)", fontSize: 12, marginTop: 1 }}>
              Point at any TNR driver or owner QR code
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            {/* Torch toggle */}
            {torchSupported && (
              <TouchableOpacity
                onPress={() => {
                  setTorch(t => !t);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                }}
                testID="torch-btn"
                style={{
                  width: 46, height: 46, borderRadius: 23,
                  alignItems: "center", justifyContent: "center",
                  backgroundColor: torch ? "rgba(255,214,10,0.2)" : "rgba(255,255,255,0.1)",
                  borderWidth: 1,
                  borderColor: torch ? "rgba(255,214,10,0.55)" : "rgba(255,255,255,0.18)",
                }}>
                <Ionicons
                  name={torch ? "flashlight" : "flashlight-outline"}
                  size={22}
                  color={torch ? "#FFD60A" : "#FFF"}
                />
              </TouchableOpacity>
            )}
            {/* Manual entry */}
            <TouchableOpacity
              onPress={() => {
                setShowManual(true);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              }}
              testID="toggle-manual-btn"
              style={{
                width: 46, height: 46, borderRadius: 23,
                alignItems: "center", justifyContent: "center",
                backgroundColor: "rgba(255,255,255,0.1)",
                borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
              }}>
              <Ionicons name="keypad-outline" size={22} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      {/* ── Bottom controls ── */}
      <SafeAreaView edges={["bottom"]} style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}>
        <View style={{ paddingHorizontal: 20, paddingBottom: 12, paddingTop: 0, gap: 14 }}>

          {/* Recently paid — quick-pay cards */}
          {recent.length > 0 && (
            <View>
              <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: "700", letterSpacing: 1.8, marginBottom: 10 }}>
                RECENTLY PAID
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  {recent.map((r) => (
                    <TouchableOpacity
                      key={r.code}
                      onPress={() => quickPay(r.code)}
                      activeOpacity={0.75}
                      style={{
                        alignItems: "center", gap: 6,
                        backgroundColor: "rgba(255,255,255,0.08)",
                        borderRadius: 16, borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.14)",
                        paddingVertical: 12, paddingHorizontal: 14, minWidth: 80,
                      }}>
                      <View style={{
                        width: 36, height: 36, borderRadius: 18,
                        backgroundColor: "rgba(0,212,255,0.18)",
                        alignItems: "center", justifyContent: "center",
                        borderWidth: 1, borderColor: "rgba(0,212,255,0.35)",
                      }}>
                        <Ionicons name="person" size={16} color={CYAN} />
                      </View>
                      <Text style={{ color: "#FFF", fontSize: 11, fontWeight: "700", textAlign: "center" }} numberOfLines={1}>
                        {r.name.split(" ")[0]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}

          {/* Manual entry CTA */}
          <TouchableOpacity
            onPress={() => {
              setShowManual(true);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            }}
            activeOpacity={0.75}
            style={{
              flexDirection: "row", alignItems: "center",
              justifyContent: "center", gap: 8,
              backgroundColor: "rgba(255,255,255,0.07)",
              borderRadius: 16, borderWidth: 1,
              borderColor: "rgba(255,255,255,0.14)",
              paddingVertical: 15,
            }}>
            <Ionicons name="keypad-outline" size={18} color="rgba(255,255,255,0.6)" />
            <Text style={{ color: "rgba(255,255,255,0.6)", fontWeight: "600", fontSize: 14 }}>
              Enter TNR code manually
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* ── Cyan flash on scan ── */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { backgroundColor: CYAN, opacity: flashAnim }]}
      />

      {/* ── Processing overlay ── */}
      {busy && (
        <View style={[StyleSheet.absoluteFillObject, { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.22)" }]}>
          <View style={{
            backgroundColor: "rgba(5,5,10,0.94)",
            borderRadius: 22, padding: 26,
            alignItems: "center", gap: 12,
            borderWidth: 1, borderColor: "rgba(0,212,255,0.28)",
          }}>
            <ActivityIndicator color={CYAN} size="large" />
            <Text style={{ color: "#FFF", fontSize: 14, fontWeight: "600" }}>Looking up recipient…</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
//  DRIVER QR DISPLAY
// ═══════════════════════════════════════════════════════════════
function DriverQR() {
  const { state } = useAuth();
  const { colors } = useTheme();
  const [wallet, setWallet] = useState<Wallet | null>(null);

  useFocusEffect(useCallback(() => {
    api.wallet().then(setWallet).catch(() => {});
  }, []));

  if (state.status !== "authed") return null;
  const u = state.user;
  const qrCode = wallet?.qr_code || "";

  const handleCopy = async () => {
    if (!qrCode) return;
    try { await Clipboard.setStringAsync(qrCode); Alert.alert("Copied", "Your TNR code has been copied to clipboard."); }
    catch { Alert.alert("TNR Code", qrCode); }
  };

  const handleShare = async () => {
    if (!qrCode) return;
    try {
      await Share.share({
        message: `Pay me instantly on Tag n Ride!\nMy TNR code: ${qrCode}\nScan my QR or enter my code in the app.`,
        title: "My Tag n Ride Payment Code",
      });
    } catch {}
  };

  const logoUri = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2MCA2MCI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMzAiIGZpbGw9IiMwMEQ0RkYiLz48dGV4dCB4PSI1MCUiIHk9IjU2JSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsIEJsYWNrLEFyaWFsIiBmb250LXdlaWdodD0iOTAwIiBmb250LXNpemU9IjE2IiBmaWxsPSIjMDUwNTBBIiBkeT0iLjFlbSI+VE5SPC90ZXh0Pjwvc3ZnPg==";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]} testID="driver-qr-screen">
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <Text style={{ color: colors.text, fontSize: 24, fontWeight: "800" }}>My QR Code</Text>
          <TouchableOpacity onPress={handleShare}
            style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", backgroundColor: colors.cyanDim, borderRadius: 20, borderWidth: 1, borderColor: colors.cyan }}>
            <Ionicons name="share-social-outline" size={20} color={colors.cyan} />
          </TouchableOpacity>
        </View>

        <View style={{ backgroundColor: "#FFFFFF", borderRadius: 24, padding: 24, alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 12, marginBottom: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 20, alignSelf: "flex-start" }}>
            <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: "#00D4FF", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#05050A", fontWeight: "900", fontSize: 14 }}>TR</Text>
            </View>
            <View>
              <Text style={{ color: "#05050A", fontSize: 16, fontWeight: "800" }}>Tag n Ride</Text>
              <Text style={{ color: "#666", fontSize: 12, marginTop: 1 }}>Payment QR Code</Text>
            </View>
          </View>

          <View style={{ padding: 12, backgroundColor: "#FFFFFF", borderRadius: 16, borderWidth: 1, borderColor: "#E8E8E8", marginBottom: 20 }}>
            {qrCode ? (
              <QRCode value={qrCode} size={220} color="#05050A" backgroundColor="#FFFFFF"
                logo={{ uri: logoUri }} logoSize={52} logoBackgroundColor="#FFFFFF"
                logoMargin={4} logoBorderRadius={26} quietZone={10} ecl="H" />
            ) : (
              <View style={{ width: 220, height: 220, alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator color={colors.cyan} size="large" />
              </View>
            )}
          </View>

          <Text style={{ color: "#05050A", fontSize: 22, fontWeight: "800", marginTop: 4 }}>{u.full_name}</Text>
          <Text style={{ color: "#666", fontSize: 14, marginTop: 4 }}>{u.phone_number}</Text>

          {wallet?.vehicle_plate ? (
            <View style={{ marginTop: 12, paddingHorizontal: 20, paddingVertical: 6, backgroundColor: "#FFD60A", borderRadius: 8, borderWidth: 2, borderColor: "#111" }}>
              <Text style={{ color: "#111", fontWeight: "900", fontSize: 16, letterSpacing: 2 }}>{wallet.vehicle_plate}</Text>
            </View>
          ) : null}

          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#EEF9FF", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, gap: 8, marginTop: 14, borderWidth: 1, borderColor: "#00D4FF33" }}>
            <Ionicons name="finger-print" size={14} color="#00D4FF" />
            <Text style={{ color: "#05050A", fontFamily: "monospace", fontSize: 13, fontWeight: "700", letterSpacing: 0.5 }}>{qrCode || "Loading..."}</Text>
          </View>

          <Text style={{ color: "#888", fontSize: 13, marginTop: 10, marginBottom: 4 }}>Scan to pay me instantly</Text>
        </View>

        <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
          {[
            { icon: "copy-outline",         label: "Copy ID",  onPress: handleCopy },
            { icon: "share-social-outline", label: "Share",    onPress: handleShare },
          ].map(btn => (
            <TouchableOpacity key={btn.label}
              style={{ flex: 1, backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16, alignItems: "center", gap: 8 }}
              onPress={btn.onPress}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.cyanDim, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={btn.icon as any} size={22} color={colors.cyan} />
              </View>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>{btn.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16 }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "800", marginBottom: 12 }}>Account Details</Text>
          {[
            { label: "Full Name", value: u.full_name, style: {} },
            { label: "Phone",    value: u.phone_number, style: {} },
            { label: "TNR Code", value: qrCode || "—", style: { color: colors.cyan, fontFamily: "monospace" } },
            { label: "Status",   value: wallet?.is_verified ? "✓ Verified" : "Pending Verification",
              style: { color: wallet?.is_verified ? colors.green : "#FFD60A" } },
          ].map((row, i, arr) => (
            <View key={row.label} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{row.label}</Text>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600", ...row.style }}>{row.value}</Text>
            </View>
          ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
