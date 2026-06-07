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
import { useTheme } from "../../src/ThemeContext";
import { api, Wallet } from "../../src/api";
import { Field, Button } from "../../src/ui";
import { radius } from "../../src/theme";export default function ActionScreen() {
  const { state } = useAuth();
  if (state.status !== "authed") return null;
  if (state.user.role === "driver") return <DriverQR />;
  return <PassengerScan />;
}

function PassengerScan() {
  const router = useRouter();
  const { colors } = useTheme();
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]} testID="scan-screen">
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20 }}>
        <Text style={{ color: colors.text, fontSize: 24, fontWeight: "800" }}>Scan & Pay</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {!showManual && (
            <TouchableOpacity
              onPress={() => setTorch(t => !t)}
              testID="torch-btn"
              style={[
                { width: 40, height: 40, alignItems: "center", justifyContent: "center", backgroundColor: colors.cyanDim, borderRadius: 20, borderWidth: 1, borderColor: colors.cyan },
                torch && { backgroundColor: "#FFD60A33", borderColor: colors.yellow },
              ]}>
              <Ionicons name={torch ? "flashlight" : "flashlight-outline"} size={20} color={torch ? colors.yellow : colors.cyan} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => setShowManual(s => !s)}
            testID="toggle-manual-btn"
            style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", backgroundColor: colors.cyanDim, borderRadius: 20, borderWidth: 1, borderColor: colors.cyan }}>
            <Ionicons name={showManual ? "scan" : "keypad-outline"} size={22} color={colors.cyan} />
          </TouchableOpacity>
        </View>
      </View>

      {showManual ? (
        <View style={{ padding: 20 }} testID="manual-pay-box">
          <Text style={{ color: colors.textMuted, marginBottom: 12 }}>Enter the driver's TNR code manually</Text>
          <Field label="Driver Code" value={manualCode} onChangeText={t => setManualCode(t.toUpperCase())}
            placeholder="TNR0000000000000" testID="manual-driver-input" autoCapitalize="characters" />
          <Button label="Continue" onPress={submitManual} icon="arrow-forward" testID="manual-continue-btn" />
        </View>
      ) : (
        <View style={{ flex: 1, marginHorizontal: 20, marginBottom: 20, backgroundColor: "#000", borderRadius: radius.lg, overflow: "hidden", position: "relative" }}>
          {permission?.granted ? (
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              enableTorch={torch}
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={r => onScan(r.data)}
            />
          ) : (
            <View style={{ ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: 24 }}>
              <Ionicons name="camera-outline" size={56} color={colors.textDim} />
              <Text style={{ color: colors.text, fontWeight: "700", marginTop: 12, fontSize: 16 }}>Camera permission needed</Text>
              <Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 6, fontSize: 13 }}>
                Allow camera access to scan driver QR codes, or enter the driver code manually.
              </Text>
              <View style={{ height: 12 }} />
              <Button label="Allow camera" icon="camera" onPress={() => requestPermission()} testID="grant-camera-btn" />
              <View style={{ height: 8 }} />
              <Button label="Enter Driver Code manually" variant="secondary" icon="keypad-outline" onPress={() => setShowManual(true)} testID="fallback-manual-btn" />
            </View>
          )}

          {permission?.granted && (
            <View pointerEvents="none" style={{ ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" }}>
              <View style={{ width: 240, height: 240, borderRadius: 16 }}>
                <Corner pos="tl" color={colors.green} />
                <Corner pos="tr" color={colors.green} />
                <Corner pos="bl" color={colors.green} />
                <Corner pos="br" color={colors.green} />
              </View>
              <Text style={{ color: "#FFF", marginTop: 24, fontSize: 13, fontWeight: "600", backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 }}>
                Align QR code within the frame
              </Text>
            </View>
          )}

          {busy && (
            <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" }}>
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

  // Pre-encoded base64 of the TNR SVG logo — avoids btoa/Buffer unavailability in React Native
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

        {/* QR card — always white, theme-independent */}
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

          {wallet?.vehicle_plate && (
            <View style={{ marginTop: 12, paddingHorizontal: 20, paddingVertical: 6, backgroundColor: "#FFD60A", borderRadius: 8, borderWidth: 2, borderColor: "#111" }}>
              <Text style={{ color: "#111", fontWeight: "900", fontSize: 16, letterSpacing: 2 }}>{wallet.vehicle_plate}</Text>
            </View>
          )}

          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#EEF9FF", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, gap: 8, marginTop: 14, borderWidth: 1, borderColor: "#00D4FF33" }}>
            <Ionicons name="finger-print" size={14} color="#00D4FF" />
            <Text style={{ color: "#05050A", fontFamily: "monospace", fontSize: 13, fontWeight: "700", letterSpacing: 0.5 }}>{qrCode || "Loading..."}</Text>
          </View>

          <Text style={{ color: "#888", fontSize: 13, marginTop: 10, marginBottom: 4 }}>Scan to pay me instantly</Text>
        </View>

        {/* Action buttons */}
        <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
          {[
            { icon: "copy-outline", label: "Copy ID", onPress: handleCopy },
            { icon: "share-social-outline", label: "Share", onPress: handleShare },
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

        {/* Info card */}
        <View style={{ backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16 }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "800", marginBottom: 12 }}>Account Details</Text>
          {[
            { label: "Full Name", value: u.full_name, style: {} },
            { label: "Phone", value: u.phone_number, style: {} },
            { label: "TNR Code", value: qrCode || "—", style: { color: colors.cyan, fontFamily: "monospace" } },
            { label: "Status", value: wallet?.is_verified ? "✓ Verified" : "Pending Verification", style: { color: wallet?.is_verified ? colors.green : "#FFD60A" } },
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
const Corner: React.FC<{ pos: "tl" | "tr" | "bl" | "br"; color: string }> = ({ pos, color }) => {
  const map: any = {
    tl: { top: 0, left: 0, borderLeftWidth: 3, borderTopWidth: 3 },
    tr: { top: 0, right: 0, borderRightWidth: 3, borderTopWidth: 3 },
    bl: { bottom: 0, left: 0, borderLeftWidth: 3, borderBottomWidth: 3 },
    br: { bottom: 0, right: 0, borderRightWidth: 3, borderBottomWidth: 3 },
  };
  return <View style={{ position: "absolute", width: 28, height: 28, borderColor: color, ...map[pos] }} />;
};
