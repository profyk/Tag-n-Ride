import React, { useCallback, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Share, StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import * as Clipboard from "expo-clipboard";
import { useAuth } from "../../src/AuthContext";
import { useTheme } from "../../src/ThemeContext";
import { api, Wallet } from "../../src/api";
import { radius } from "../../src/theme";

export default function OwnerDriveMode() {
  const router = useRouter();
  const { state } = useAuth();
  const { colors } = useTheme();
  const [wallet, setWallet] = useState<Wallet | null>(null);

  useFocusEffect(useCallback(() => {
    api.wallet().then(setWallet).catch(() => {});
  }, []));

  if (state.status !== "authed") return null;
  const u = state.user;
  const qrCode = wallet?.qr_code ?? "";

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
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>

        {/* Header */}
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={[s.backBtn, { backgroundColor: colors.bg2, borderColor: colors.border }]}>
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={[s.title, { color: colors.text }]}>Drive Mode</Text>
          <TouchableOpacity onPress={handleShare} style={[s.shareBtn, { backgroundColor: colors.cyanDim, borderColor: colors.cyan }]}>
            <Ionicons name="share-social-outline" size={20} color={colors.cyan} />
          </TouchableOpacity>
        </View>

        {/* Info banner */}
        <View style={[s.infoBanner, { backgroundColor: colors.cyanDim, borderColor: colors.cyan + "44" }]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.cyan} />
          <Text style={[s.infoBannerText, { color: colors.text }]}>
            Show this QR code to passengers when you drive. Payments go directly to your wallet.
          </Text>
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
            {qrCode ? (
              <QRCode
                value={qrCode} size={220} color="#05050A" backgroundColor="#FFFFFF"
                logo={{ uri: logoUri }} logoSize={52} logoBackgroundColor="#FFFFFF"
                logoMargin={4} logoBorderRadius={26} quietZone={10} ecl="H"
              />
            ) : (
              <View style={s.qrLoader}>
                <ActivityIndicator color="#00D4FF" size="large" />
              </View>
            )}
          </View>

          <Text style={s.qrName}>{u.full_name}</Text>
          <Text style={s.qrPhone}>{u.phone_number}</Text>

          <View style={s.qrCodePill}>
            <Ionicons name="finger-print" size={14} color="#00D4FF" />
            <Text style={s.qrCodeText}>{qrCode || "Loading..."}</Text>
          </View>

          <Text style={s.qrHint}>Scan to pay me instantly</Text>
        </View>

        {/* Action buttons */}
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
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  title: { fontSize: 22, fontWeight: "800" },
  shareBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  infoBanner: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: radius.md, borderWidth: 1, padding: 12, marginBottom: 16 },
  infoBannerText: { flex: 1, fontSize: 13, lineHeight: 18 },
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
  detailCard: { borderRadius: radius.md, borderWidth: 1, padding: 16 },
  detailTitle: { fontSize: 15, fontWeight: "800", marginBottom: 12 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10 },
  detailLabel: { fontSize: 13 },
  detailVal: { fontSize: 13, fontWeight: "600" },
});
