import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import QRCode from "react-native-qrcode-svg";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/AuthContext";
import { api, Wallet } from "../../src/api";
import { Field, Button } from "../../src/ui";
import { colors, formatNGN, radius } from "../../src/theme";

// Single screen that morphs based on role: passenger -> Scan & Pay, driver -> show QR
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
  const [manualId, setManualId] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  useFocusEffect(useCallback(() => { setScanning(true); }, []));

  const goPay = (driverId: string) => {
    setScanning(false);
    router.push({ pathname: "/pay", params: { driver_id: driverId } });
  };

  const onScan = (data: string) => {
    if (!scanning || busy) return;
    setBusy(true);
    let id = data;
    const m = data.match(/driver_id=([^&]+)/);
    if (m) id = m[1];
    setTimeout(() => setBusy(false), 600);
    goPay(id);
  };

  const submitManual = () => {
    if (!manualId.trim()) return;
    goPay(manualId.trim());
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="scan-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Scan & Pay</Text>
        <TouchableOpacity onPress={() => setShowManual((s) => !s)} testID="toggle-manual-btn" style={styles.iconBtn}>
          <Ionicons name={showManual ? "scan" : "keypad-outline"} size={22} color={colors.cyan} />
        </TouchableOpacity>
      </View>

      {showManual ? (
        <View style={styles.manualBox} testID="manual-pay-box">
          <Text style={styles.manualHint}>Enter driver ID manually</Text>
          <Field label="Driver ID" value={manualId} onChangeText={setManualId} placeholder="Driver UUID" testID="manual-driver-input" autoCapitalize="none" />
          <Button label="Continue" onPress={submitManual} icon="arrow-forward" testID="manual-continue-btn" />
        </View>
      ) : (
        <View style={styles.cameraWrap}>
          {permission?.granted && Platform.OS !== "web" ? (
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={(r) => onScan(r.data)}
            />
          ) : (
            <View style={styles.cameraFallback}>
              <Ionicons name="camera-outline" size={56} color={colors.textDim} />
              <Text style={styles.fallbackTitle}>Camera not available</Text>
              <Text style={styles.fallbackText}>{Platform.OS === "web" ? "QR scanning needs the mobile app." : "Camera permission denied."}</Text>
              <View style={{ height: 12 }} />
              <Button label="Enter Driver ID manually" variant="secondary" icon="keypad-outline" onPress={() => setShowManual(true)} testID="fallback-manual-btn" />
            </View>
          )}

          {/* Reticle */}
          <View pointerEvents="none" style={styles.reticleWrap}>
            <View style={styles.reticle}>
              <Corner pos="tl" />
              <Corner pos="tr" />
              <Corner pos="bl" />
              <Corner pos="br" />
            </View>
            <Text style={styles.reticleText}>Align QR code within the frame</Text>
          </View>

          {busy ? (
            <View style={styles.scanningOverlay}>
              <ActivityIndicator color={colors.cyan} size="large" />
            </View>
          ) : null}
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
  const data = wallet?.qr_code || `app://pay?driver_id=${state.user.id}`;

  const copyId = () => {
    Alert.alert("Driver ID", state.user.id, [{ text: "OK" }]);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="driver-qr-screen">
      <View style={styles.header}>
        <Text style={styles.title}>My QR Code</Text>
      </View>

      <View style={styles.qrBox}>
        <View style={styles.qrFrame} testID="driver-qr-display">
          <QRCode value={data} size={240} color="#000" backgroundColor="#fff" />
        </View>
        <Text style={styles.driverName}>{state.user.full_name}</Text>
        <Text style={styles.driverPhone}>{state.user.phone_number}</Text>

        <TouchableOpacity onPress={copyId} style={styles.idChip} testID="driver-id-chip">
          <Ionicons name="finger-print" size={14} color={colors.cyan} />
          <Text style={styles.idChipText}>{state.user.id.slice(0, 8)}…{state.user.id.slice(-4)}</Text>
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
  idChipText: { color: colors.cyan, fontWeight: "700", fontSize: 12 },
  qrHint: { color: colors.textMuted, fontSize: 13, marginTop: 18, textAlign: "center", paddingHorizontal: 32 },
});
