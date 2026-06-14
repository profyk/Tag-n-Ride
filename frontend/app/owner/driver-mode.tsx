import React, { useCallback, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, Switch,
  ActivityIndicator, Alert, Share, StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import * as Clipboard from "expo-clipboard";
import { useAuth } from "../../src/AuthContext";
import { useTheme } from "../../src/ThemeContext";
import { api, Wallet } from "../../src/api";
import { radius } from "../../src/theme";

export default function OwnerDriveMode() {
  const { state } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [toggling, setToggling] = useState(false);

  const loadWallet = useCallback(() => {
    api.wallet().then(setWallet).catch(() => {});
  }, []);

  useFocusEffect(useCallback(() => { loadWallet(); }, [loadWallet]));

  if (state.status !== "authed") return null;
  const u = state.user;
  const driverModeActive = wallet?.driver_mode_active ?? false;
  const qrCode = wallet?.qr_code ?? "";

  const handleToggle = async (val: boolean) => {
    setToggling(true);
    try {
      const res = await api.ownerToggleDriverMode(val);
      setWallet(prev => prev ? { ...prev, driver_mode_active: res.driver_mode_active } : prev);
      if (res.driver_mode_active) {
        // Reload wallet so QR code appears
        loadWallet();
        // Warn if KYC not yet approved
        if (res.kyc_status && res.kyc_status !== "approved") {
          const msg = res.kyc_status === "pending"
            ? "Driver mode is ON. Your identity verification is pending admin review — you can start receiving payments once approved."
            : "Driver mode is ON. Please complete your Identity Verification so passengers can pay you. Tap the button below to submit your documents.";
          Alert.alert(
            "Driver Mode Active",
            msg,
            res.kyc_status === "not_submitted"
              ? [
                  { text: "Later", style: "cancel" },
                  { text: "Verify Now", onPress: () => router.push("/owner/documents") },
                ]
              : [{ text: "OK" }]
          );
        }
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not update driver mode.");
    } finally {
      setToggling(false);
    }
  };

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

  const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60"><circle cx="30" cy="30" r="30" fill="#00D4FF"/><text x="50%" y="56%" text-anchor="middle" font-family="Arial Black,Arial" font-weight="900" font-size="16" fill="#05050A" dy=".1em">TNR</text></svg>`;
  const logoUri = `data:image/svg+xml;base64,${typeof btoa !== "undefined" ? btoa(logoSvg) : Buffer.from(logoSvg).toString("base64")}`;

  return (
    <SafeAreaView style={[s.root, { backgroundColor: colors.bg }]} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>

        {/* Header */}
        <View style={s.headerRow}>
          <Text style={[s.title, { color: colors.text }]}>Drive Mode</Text>
          {driverModeActive && (
            <TouchableOpacity onPress={handleShare} style={[s.shareBtn, { backgroundColor: colors.cyanDim, borderColor: colors.cyan }]}>
              <Ionicons name="share-social-outline" size={20} color={colors.cyan} />
            </TouchableOpacity>
          )}
        </View>

        {/* Toggle card */}
        <View style={[s.toggleCard, { backgroundColor: colors.bg2, borderColor: driverModeActive ? colors.cyan : colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[s.toggleTitle, { color: colors.text }]}>
              {driverModeActive ? "Driver Mode Active" : "Driver Mode Off"}
            </Text>
            <Text style={[s.toggleSub, { color: colors.textMuted }]}>
              {driverModeActive
                ? "Passengers can scan your QR and pay you directly."
                : "Enable to accept passenger payments with your QR code."}
            </Text>
          </View>
          {toggling ? (
            <ActivityIndicator color={colors.cyan} />
          ) : (
            <Switch
              value={driverModeActive}
              onValueChange={handleToggle}
              trackColor={{ false: colors.border, true: colors.cyan }}
              thumbColor={driverModeActive ? "#fff" : colors.textMuted}
            />
          )}
        </View>

        {/* QR card — always white background, theme-independent */}
        <View style={s.qrCard}>
          <View style={s.qrCardHeader}>
            <View style={s.qrBrandIcon}>
              <Text style={s.qrBrandText}>TR</Text>
            </View>
            <View>
              <Text style={s.qrBrandName}>Tag n Ride</Text>
              <Text style={s.qrBrandSub}>Payment QR Code</Text>
            </View>
          </View>

          <View style={s.qrBox}>
            {!wallet ? (
              <View style={s.qrLoader}>
                <ActivityIndicator color="#00D4FF" size="large" />
              </View>
            ) : driverModeActive && qrCode ? (
              <QRCode
                value={qrCode} size={220} color="#05050A" backgroundColor="#FFFFFF"
                logo={{ uri: logoUri }} logoSize={52} logoBackgroundColor="#FFFFFF"
                logoMargin={4} logoBorderRadius={26} quietZone={10} ecl="H"
              />
            ) : (
              <View style={s.qrLoader}>
                <Ionicons name="car-sport-outline" size={48} color={driverModeActive ? "#00D4FF" : "#CCC"} />
                <Text style={{ color: "#333", fontWeight: "700", fontSize: 15, marginTop: 12, textAlign: "center" }}>
                  {driverModeActive ? "Loading QR…" : "Driver mode is off"}
                </Text>
                <Text style={{ color: "#888", fontSize: 13, marginTop: 6, textAlign: "center", paddingHorizontal: 12 }}>
                  {driverModeActive
                    ? "Your QR code is being generated."
                    : "Toggle driver mode above to reveal your QR code."}
                </Text>
              </View>
            )}
          </View>

          <Text style={s.qrName}>{u.full_name}</Text>
          <Text style={s.qrPhone}>{u.phone_number}</Text>

          {driverModeActive && qrCode && <>
            <View style={s.qrCodePill}>
              <Ionicons name="finger-print" size={14} color="#00D4FF" />
              <Text style={s.qrCodeText}>{qrCode}</Text>
            </View>
            <Text style={s.qrHint}>Scan to pay me instantly</Text>
          </>}
        </View>

        {/* Action buttons — only shown when driver mode is active */}
        {driverModeActive && qrCode && (
          <View style={s.actionRow}>
            {[
              { icon: "copy-outline", label: "Copy ID", onPress: handleCopy },
              { icon: "share-social-outline", label: "Share", onPress: handleShare },
            ].map(btn => (
              <TouchableOpacity key={btn.label} onPress={btn.onPress}
                style={[s.actionBtn, { backgroundColor: colors.bg2, borderColor: colors.border }]}>
                <View style={[s.actionBtnIcon, { backgroundColor: colors.cyanDim }]}>
                  <Ionicons name={btn.icon as any} size={22} color={colors.cyan} />
                </View>
                <Text style={[s.actionBtnLabel, { color: colors.text }]}>{btn.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Trip Centre shortcut */}
        <TouchableOpacity
          style={[s.tripCentreBtn, { backgroundColor: colors.bg2, borderColor: driverModeActive ? colors.green : colors.border }]}
          onPress={() => router.push("/owner/trip-centre")}
          activeOpacity={0.8}>
          <View style={[s.tripCentreBtnIcon, { backgroundColor: driverModeActive ? colors.greenDim : colors.bg2 }]}>
            <Ionicons name="shield-checkmark-outline" size={22} color={driverModeActive ? colors.green : colors.textMuted} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.tripCentreBtnTitle, { color: colors.text }]}>Trip Centre</Text>
            <Text style={[s.tripCentreBtnSub, { color: colors.textMuted }]}>
              {driverModeActive ? "Start a SafeRide trip & manage passengers" : "Enable driver mode above to start trips"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Account details */}
        <View style={[s.detailCard, { backgroundColor: colors.bg2, borderColor: colors.border }]}>
          <Text style={[s.detailTitle, { color: colors.text }]}>Account Details</Text>
          {[
            { label: "Full Name", value: u.full_name, style: {} },
            { label: "Phone", value: u.phone_number, style: {} },
            { label: "TNR Code", value: qrCode || "—", style: { color: colors.cyan, fontFamily: "monospace" } },
            {
              label: "KYC Status",
              value: wallet?.is_verified ? "✓ Verified" : "Pending Verification",
              style: { color: wallet?.is_verified ? colors.green : "#FFD60A" },
            },
          ].map((row, i, arr) => (
            <View key={row.label} style={[s.detailRow, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
              <Text style={[s.detailLabel, { color: colors.textMuted }]}>{row.label}</Text>
              <Text style={[s.detailVal, { color: colors.text }, row.style]}>{row.value}</Text>
            </View>
          ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  title: { fontSize: 22, fontWeight: "800" },
  shareBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  toggleCard: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: radius.md, borderWidth: 1.5, padding: 16, marginBottom: 16 },
  toggleTitle: { fontSize: 15, fontWeight: "800", marginBottom: 2 },
  toggleSub: { fontSize: 12, lineHeight: 16 },
  qrCard: { backgroundColor: "#FFFFFF", borderRadius: 24, padding: 24, alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 12, marginBottom: 16 },
  qrCardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 20, alignSelf: "flex-start" },
  qrBrandIcon: { width: 44, height: 44, borderRadius: 10, backgroundColor: "#00D4FF", alignItems: "center", justifyContent: "center" },
  qrBrandText: { color: "#05050A", fontWeight: "900", fontSize: 14 },
  qrBrandName: { color: "#05050A", fontSize: 16, fontWeight: "800" },
  qrBrandSub: { color: "#666", fontSize: 12, marginTop: 1 },
  qrBox: { padding: 12, backgroundColor: "#FFFFFF", borderRadius: 16, borderWidth: 1, borderColor: "#E8E8E8", marginBottom: 20 },
  qrLoader: { width: 220, height: 220, alignItems: "center", justifyContent: "center" },
  qrName: { color: "#05050A", fontSize: 22, fontWeight: "800", marginTop: 4 },
  qrPhone: { color: "#666", fontSize: 14, marginTop: 4 },
  qrCodePill: { flexDirection: "row", alignItems: "center", backgroundColor: "#EEF9FF", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, gap: 8, marginTop: 14, borderWidth: 1, borderColor: "#00D4FF33" },
  qrCodeText: { color: "#05050A", fontFamily: "monospace", fontSize: 13, fontWeight: "700", letterSpacing: 0.5 },
  qrHint: { color: "#888", fontSize: 13, marginTop: 10, marginBottom: 4 },
  actionRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  actionBtn: { flex: 1, borderRadius: radius.md, borderWidth: 1, padding: 16, alignItems: "center", gap: 8 },
  actionBtnIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  actionBtnLabel: { fontSize: 13, fontWeight: "700" },
  tripCentreBtn: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: radius.md, borderWidth: 1.5, padding: 16, marginBottom: 16 },
  tripCentreBtnIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  tripCentreBtnTitle: { fontSize: 15, fontWeight: "800", marginBottom: 2 },
  tripCentreBtnSub: { fontSize: 12, lineHeight: 16 },
  detailCard: { borderRadius: radius.md, borderWidth: 1, padding: 16 },
  detailTitle: { fontSize: 15, fontWeight: "800", marginBottom: 12 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10 },
  detailLabel: { fontSize: 13 },
  detailVal: { fontSize: 13, fontWeight: "600" },
});
