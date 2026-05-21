import React, { useCallback, useEffect, useState, useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Share, ScrollView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import QRCode from "react-native-qrcode-svg";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
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

// ── Passenger Scan & Pay ─────────────────────────────────────
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
    let code = data.trim();
    const m = data.match(/driver_id=([^&]+)/);
    if (m) code = m[1];
    setTimeout(() => setBusy(false), 600);
    goPay(code);
  };

  const submitManual = () => {
    const code = manualCode.trim().toUpperCase();
    if (!code) return;
    if (!code.startsWith("TNR") || code.length !== 16) {
      Alert.alert("Invalid code", "Please enter a valid 16-character TNR driver code.");
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
            <TouchableOpacity
              onPress={() => setTorch((t) => !t)}
              testID="torch-btn"
              style={[styles.iconBtn, torch && {
                backgroundColor: "#FFD60A33", borderColor: colors.yellow
              }]}>
              <Ionicons
                name={torch ? "flashlight" : "flashlight-outline"}
                size={20}
                color={torch ? colors.yellow : colors.cyan}
              />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => setShowManual((s) => !s)}
            testID="toggle-manual-btn"
            style={styles.iconBtn}>
            <Ionicons
              name={showManual ? "scan" : "keypad-outline"}
              size={22}
              color={colors.cyan}
            />
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
          <Button
            label="Continue"
            onPress={submitManual}
            icon="arrow-forward"
            testID="manual-continue-btn"
          />
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
              <Text style={styles.fallbackText}>
                Allow camera access to scan driver QR codes, or enter the driver code manually.
              </Text>
              <View style={{ height: 12 }} />
              <Button
                label="Allow camera"
                icon="camera"
                onPress={() => requestPermission()}
                testID="grant-camera-btn"
              />
              <View style={{ height: 8 }} />
              <Button
                label="Enter Driver Code manually"
                variant="secondary"
                icon="keypad-outline"
                onPress={() => setShowManual(true)}
                testID="fallback-manual-btn"
              />
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

// ── Driver QR — High Quality ──────────────────────────────────
function DriverQR() {
  const { state } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);

  useFocusEffect(useCallback(() => {
    api.wallet().then(setWallet).catch(() => {});
  }, []));

  if (state.status !== "authed") return null;
  const u = state.user;
  const qrCode = wallet?.qr_code || "";

  const handleCopy = async () => {
    if (!qrCode) return;
    try {
      await Clipboard.setStringAsync(qrCode);
      Alert.alert("Copied", "Your TNR code has been copied to clipboard.");
    } catch {
      Alert.alert("TNR Code", qrCode);
    }
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

  // TNR logo SVG for QR center
  const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60"><circle cx="30" cy="30" r="30" fill="#00D4FF"/><text x="50%" y="56%" text-anchor="middle" font-family="Arial Black,Arial" font-weight="900" font-size="16" fill="#05050A" dy=".1em">TNR</text></svg>`;

  const logoUri = `data:image/svg+xml;base64,${
    typeof btoa !== "undefined"
      ? btoa(logoSvg)
      : Buffer.from(logoSvg).toString("base64")
  }`;

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="driver-qr-screen">
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>My QR Code</Text>
          <TouchableOpacity onPress={handleShare} style={styles.iconBtn}>
            <Ionicons name="share-social-outline" size={20} color={colors.cyan} />
          </TouchableOpacity>
        </View>

        {/* White QR Card */}
        <View style={qrStyles.card}>
          {/* Brand header */}
          <View style={qrStyles.brandRow}>
            <View style={qrStyles.brandIcon}>
              <Text style={qrStyles.brandIconText}>TR</Text>
            </View>
            <View>
              <Text style={qrStyles.brandName}>Tag n Ride</Text>
              <Text style={qrStyles.brandSub}>Payment QR Code</Text>
            </View>
          </View>

          {/* QR Code */}
          <View style={qrStyles.qrWrap}>
            {qrCode ? (
              <QRCode
                value={qrCode}
                size={220}
                color="#05050A"
                backgroundColor="#FFFFFF"
                logo={{ uri: logoUri }}
                logoSize={52}
                logoBackgroundColor="#FFFFFF"
                logoMargin={4}
                logoBorderRadius={26}
                quietZone={10}
                ecl="H"
              />
            ) : (
              <View style={qrStyles.qrLoading}>
                <ActivityIndicator color={colors.cyan} size="large" />
              </View>
            )}
          </View>

          {/* Name */}
          <Text style={qrStyles.name}>{u.full_name}</Text>
          <Text style={qrStyles.phone}>{u.phone_number}</Text>

          {/* Vehicle plate */}
          {wallet?.vehicle_plate ? (
            <View style={qrStyles.plateBadge}>
              <Text style={qrStyles.plateText}>{wallet.vehicle_plate}</Text>
            </View>
          ) : null}

          {/* TNR code chip */}
          <View style={qrStyles.codePill}>
            <Ionicons name="finger-print" size={14} color="#00D4FF" />
            <Text style={qrStyles.codePillText}>{qrCode || "Loading..."}</Text>
          </View>

          <Text style={qrStyles.hint}>Scan to pay me instantly</Text>
        </View>

        {/* Action buttons */}
        <View style={qrStyles.actions}>
          <TouchableOpacity style={qrStyles.actionBtn} onPress={handleCopy}>
            <View style={qrStyles.actionIcon}>
              <Ionicons name="copy-outline" size={22} color={colors.cyan} />
            </View>
            <Text style={qrStyles.actionLabel}>Copy ID</Text>
          </TouchableOpacity>

          <TouchableOpacity style={qrStyles.actionBtn} onPress={handleShare}>
            <View style={qrStyles.actionIcon}>
              <Ionicons name="share-social-outline" size={22} color={colors.cyan} />
            </View>
            <Text style={qrStyles.actionLabel}>Share</Text>
          </TouchableOpacity>
        </View>

        {/* Info card */}
        <View style={qrStyles.infoCard}>
          <Text style={qrStyles.infoTitle}>Account Details</Text>
          <InfoRow label="Full Name" value={u.full_name} />
          <InfoRow label="Phone" value={u.phone_number} />
          <InfoRow
            label="TNR Code"
            value={qrCode || "—"}
            valueStyle={{ color: colors.cyan, fontFamily: "monospace" }}
          />
          <InfoRow
            label="Status"
            value={wallet?.is_verified ? "✓ Verified" : "Pending Verification"}
            valueStyle={{ color: wallet?.is_verified ? colors.green : "#FFD60A" }}
            last
          />
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Info Row helper ───────────────────────────────────────────
const InfoRow: React.FC<{
  label: string;
  value: string;
  valueStyle?: any;
  last?: boolean;
}> = ({ label, value, valueStyle, last }) => (
  <View style={[qrStyles.infoRow, last && { borderBottomWidth: 0 }]}>
    <Text style={qrStyles.infoLabel}>{label}</Text>
    <Text style={[qrStyles.infoValue, valueStyle]}>{value}</Text>
  </View>
);

// ── Corner helper ─────────────────────────────────────────────
const Corner: React.FC<{ pos: "tl" | "tr" | "bl" | "br" }> = ({ pos }) => {
  const base: any = {
    position: "absolute", width: 28, height: 28, borderColor: colors.green,
  };
  const map: any = {
    tl: { top: 0, left: 0, borderLeftWidth: 3, borderTopWidth: 3 },
    tr: { top: 0, right: 0, borderRightWidth: 3, borderTopWidth: 3 },
    bl: { bottom: 0, left: 0, borderLeftWidth: 3, borderBottomWidth: 3 },
    br: { bottom: 0, right: 0, borderRightWidth: 3, borderBottomWidth: 3 },
  };
  return <View style={[base, map[pos]]} />;
};

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", padding: 20,
  },
  title: { color: colors.text, fontSize: 24, fontWeight: "800" },
  iconBtn: {
    width: 40, height: 40, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.cyanDim, borderRadius: 20,
    borderWidth: 1, borderColor: colors.cyan,
  },
  manualBox: { padding: 20 },
  manualHint: { color: colors.textMuted, marginBottom: 12 },
  cameraWrap: {
    flex: 1, marginHorizontal: 20, marginBottom: 20,
    backgroundColor: "#000", borderRadius: radius.lg,
    overflow: "hidden", position: "relative",
  },
  cameraFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center", justifyContent: "center", padding: 24,
  },
  fallbackTitle: { color: colors.text, fontWeight: "700", marginTop: 12, fontSize: 16 },
  fallbackText: { color: colors.textMuted, textAlign: "center", marginTop: 6, fontSize: 13 },
  reticleWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center", justifyContent: "center",
  },
  reticle: { width: 240, height: 240, borderRadius: 16 },
  reticleText: {
    color: "#FFF", marginTop: 24, fontSize: 13, fontWeight: "600",
    letterSpacing: 0.5, backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
  },
  scanningOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center", justifyContent: "center",
  },
});

// QR Card specific styles (white background)
const qrStyles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24, padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
    marginBottom: 16,
  },
  brandRow: {
    flexDirection: "row", alignItems: "center",
    gap: 10, marginBottom: 20, alignSelf: "flex-start",
  },
  brandIcon: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: "#00D4FF",
    alignItems: "center", justifyContent: "center",
  },
  brandIconText: { color: "#05050A", fontWeight: "900", fontSize: 14 },
  brandName: { color: "#05050A", fontSize: 16, fontWeight: "800" },
  brandSub: { color: "#666", fontSize: 12, marginTop: 1 },
  qrWrap: {
    padding: 12, backgroundColor: "#FFFFFF",
    borderRadius: 16, borderWidth: 1, borderColor: "#E8E8E8",
    marginBottom: 20,
  },
  qrLoading: {
    width: 220, height: 220,
    alignItems: "center", justifyContent: "center",
  },
  name: { color: "#05050A", fontSize: 22, fontWeight: "800", marginTop: 4 },
  phone: { color: "#666", fontSize: 14, marginTop: 4 },
  plateBadge: {
    marginTop: 12, paddingHorizontal: 20, paddingVertical: 6,
    backgroundColor: "#FFD60A", borderRadius: 8,
    borderWidth: 2, borderColor: "#111",
  },
  plateText: {
    color: "#111", fontWeight: "900", fontSize: 16,
    fontFamily: "monospace", letterSpacing: 2,
  },
  codePill: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#EEF9FF", borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 7,
    gap: 8, marginTop: 14, borderWidth: 1, borderColor: "#00D4FF33",
  },
  codePillText: {
    color: "#05050A", fontFamily: "monospace",
    fontSize: 13, fontWeight: "700", letterSpacing: 0.5,
  },
  hint: { color: "#888", fontSize: 13, marginTop: 10, marginBottom: 4 },
  actions: { flexDirection: "row", gap: 12, marginBottom: 16 },
  actionBtn: {
    flex: 1, backgroundColor: colors.bg2,
    borderRadius: radius.md, borderWidth: 1,
    borderColor: colors.border, padding: 16, alignItems: "center", gap: 8,
  },
  actionIcon: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.cyanDim,
    alignItems: "center", justifyContent: "center",
  },
  actionLabel: { color: colors.text, fontSize: 13, fontWeight: "700" },
  infoCard: {
    backgroundColor: colors.bg2, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: 16,
  },
  infoTitle: {
    color: colors.text, fontSize: 15,
    fontWeight: "800", marginBottom: 12,
  },
  infoRow: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  infoLabel: { color: colors.textMuted, fontSize: 13 },
  infoValue: { color: colors.text, fontSize: 13, fontWeight: "600" },
});
