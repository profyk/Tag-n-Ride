import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import QRCode from "react-native-qrcode-svg";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/AuthContext";
import { api, Wallet } from "../../src/api";
import { Field, Button } from "../../src/ui";
import { colors, radius } from "../../src/theme";

export default function ActionScreen() {
  const { state } = useAuth();
  if (state.status !== "authed") return null;
  if (state.user.role === "driver") return <DriverQR />;
  return <PassengerScan />;
}

function PassengerScan() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [manualCode, setManualCode] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [torch, setTorch] = useState(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  useFocusEffect(useCallback(() => { setScanning(true); }, []));

  const goPay = (qrCode: string) => {
    setScanning(false);
    router.push({ pathname: "/pay", params: { qr_code: qrCode } });
  };

  const onScan = (data: string) => {
    if (!scanning || busy) return;
    setBusy(true);
    // Support both new TNR format and old URL format
    let code = data.trim();
    const m = data.match(/driver_id=([^&]+)/);
    if (m) code = m[1];
    setTimeout(() => setBusy(false), 600);
    goPay(code);
  };

  const submitManual = () => {
    const code = manualCode.trim().toUpperCase();
    if (!code) return;
    if (!code.startsWith("TNR") || code.length !== 15) {
      Alert.alert("Invalid code", "Please enter a valid 15-character TNR driver code.");
      return;
    }
    goPay(code);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="scan-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Scan & Pay</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {!showManual && (
            <TouchableOpacity onPress={() => setTorch((t) => !t)} testID="torch-btn"
              style={[styles.iconBtn, torch && { backgroundColor: "#FFD60A33", borderColor: colors.yellow }]}>
              <Ionicons name={torch ? "flashlight" : "flashlight-outline"} size={20} color={torch ? colors.yellow : colors.cyan} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setShowManual((s) => !s)} testID="toggle-manual-btn" style={styles.iconBtn}>
            <Ionicons name={showManual ? "scan" : "keypad-outline"} size={22} color={colors.cyan} />
          </TouchableOpacity>
        </View>
      </View>

      {showManual ? (
        <View style={styles.manualBox} testID="manual-pay-box">
          <Text style={styles.manualHint}>Enter the driver's TNR code manually</Text>
          <Field
            label="Driver Code"
            value={manualCode}
            onChangeText={(t) => setManualCode(t.toUpperCase())}
            placeholder="TNR0000000000000"
            testID="manual-driver-input"
            autoCapitalize="characters"
          />
          <Button label="Continue" onPress={submitManual} icon="arrow-forward" testID="manual-continue-btn" />
        </View>
      ) : (
        <View style={styles.cameraWrap}>
          {permission?.granted ? (
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              enableTorch={torch}
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={(r) => onScan(r.data)}
            />
          ) : (
            <View style={styles.cameraFallback}>
              <Ionicons name="camera-outline" size={56} color={colors.textDim} />
              <Text style={styles.fallbackTitle}>Camera permission needed</Text>
              <Text style={styles.fallbackText}>Allow camera access to scan driver QR codes, or enter the driver code manually.</Text>
              <View style={{ height: 12 }} />
              <Button label="Allow camera" icon="camera" onPress={() => requestPermission()} testID="grant-camera-btn" />
              <View style={{ height: 8 }} />
              <Button label="Enter Driver Code manually" variant="secondary" icon="keypad-outline" onPress={() => setShowManual(true)} testID="fallback-manual-btn" />
            </View>
          )}

          {permission?.granted && (
            <View pointerEvents="none" style={styles.reticleWrap}>
              <View style={styles.reticle}>
                <Corner pos="tl" />
                <Corner pos="tr" />
                <Corner pos="bl" />
                <Corner pos="br" />
              </View>
              <Text style={styles.reticleText}>Align QR code within the frame</Text>
            </View>
          )}

          {busy && (
            <View style={styles.scanningOverlay}>
              <ActivityIndicator color={colors.cyan} size="large" />
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

function DriverQR() {
  const { state } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);

  useFocusEffect(useCallback(() => {
    api.wallet().then(setWallet).catch(() => {});
  }, []));

  if (state.status !== "authed") return null;

  const qrCode = wallet?.qr_code || "";

  const showCode = () => {
    Alert.alert("Your Driver Code", qrCode || "Loading...", [{ text: "OK" }]);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="driver-qr-screen">
      <View style={styles.header}>
        <Text style={styles.title}>My QR Code</Text>
      </View>

      <View style={styles.qrBox}>
        <View style={styles.qrFrame} testID="driver-qr-display">
          {qrCode ? (
            <QRCode value={qrCode} size={240} color="#000" backgroundColor="#fff" />
          ) : (
            <ActivityIndicator color={colors.cyan} size="large" style={{ width: 240, height: 240 }} />
          )}
        </View>

        <Text style={styles.driverName}>{state.user.full_name}</Text>
        <Text style={styles.driverPhone}>{state.user.phone_number}</Text>

        {wallet?.vehicle_plate ? (
          <View style={styles.plateBox} testID="driver-vehicle-plate">
            <Text style={styles.plateLabel}>VEHICLE</Text>
            <Text style={styles.plateValue}>{wallet.vehicle_plate}</Text>
          </View>
        ) : null}

        {/* TNR code chip */}
        <TouchableOpacity onPress={showCode} style={styles.idChip} testID="driver-id-chip">
          <Ionicons name="finger-print" size={14} color={colors.cyan} />
          <Text style={styles.idChipText}>{qrCode || "Loading..."}</Text>
        </TouchableOpacity>

        <Text style={styles.qrHint}>Show this code to a passenger to receive payment.</Text>
      </View>
    </SafeAreaView>
  );
}

const Corner: React.FC<{ pos: "tl" | "tr" | "bl" | "br" }> = ({ pos }) => {
  const base: any = { position: "absolute", width: 28, height: 28, borderColor: colors.green };
  const map: any = {
    tl: { top: 0, left: 0, borderLeftWidth: 3, borderTopWidth: 3 },
    tr: { top: 0, right: 0, borderRightWidth: 3, borderTopWidth: 3 },
    bl: { bottom: 0, left: 0, borderLeftWidth: 3, borderBottomWidth: 3 },
    br: { bottom: 0, right: 0, borderRightWidth: 3, borderBottomWidth: 3 },
  };
  return <View style={[base, map[pos]]} />;
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20 },
  title: { color: colors.text, fontSize: 24, fontWeight: "800" },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", backgroundColor: colors.cyanDim, borderRadius: 20, borderWidth: 1, borderColor: colors.cyan },
  manualBox: { padding: 20 },
  manualHint: { color: colors.textMuted, marginBottom: 12 },
  cameraWrap: { flex: 1, marginHorizontal: 20, marginBottom: 20, backgroundColor: "#000", borderRadius: radius.lg, overflow: "hidden", position: "relative" },
  cameraFallback: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: 24 },
  fallbackTitle: { color: colors.text, fontWeight: "700", marginTop: 12, fontSize: 16 },
  fallbackText: { color: colors.textMuted, textAlign: "center", marginTop: 6, fontSize: 13 },
  reticleWrap: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  reticle: { width: 240, height: 240, borderRadius: 16 },
  reticleText: { color: "#FFF", marginTop: 24, fontSize: 13, fontWeight: "600", letterSpacing: 0.5, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  scanningOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  qrBox: { alignItems: "center", padding: 20 },
  qrFrame: { padding: 20, backgroundColor: "#fff", borderRadius: radius.lg, borderWidth: 2, borderColor: colors.cyan, marginBottom: 20 },
  driverName: { color: colors.text, fontSize: 20, fontWeight: "800", marginTop: 4 },
  driverPhone: { color: colors.textMuted, marginTop: 4 },
  idChip: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.cyanDim, borderRadius: 999, marginTop: 14, borderWidth: 1, borderColor: colors.cyan },
  idChipText: { color: colors.cyan, fontWeight: "700", fontSize: 12, letterSpacing: 1 },
  qrHint: { color: colors.textMuted, fontSize: 13, marginTop: 18, textAlign: "center", paddingHorizontal: 32 },
  plateBox: { marginTop: 14, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: "#FFD60A", borderRadius: 8, borderWidth: 2, borderColor: "#0A0A0A" },
  plateLabel: { color: "#666", fontSize: 9, fontWeight: "800", letterSpacing: 1.4, textAlign: "center" },
  plateValue: { color: "#0A0A0A", fontSize: 22, fontWeight: "900", letterSpacing: 2, textAlign: "center", fontFamily: "monospace" },
});
