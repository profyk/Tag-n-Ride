import React, { useEffect, useState, useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  Share, Alert, ActivityIndicator, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import * as Clipboard from "expo-clipboard";
import { useAuth } from "../../src/AuthContext";
import { api } from "../../src/api";
import { colors, radius } from "../../src/theme";

export default function MyQRScreen() {
  const router = useRouter();
  const { state } = useAuth();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const qrRef = useRef<any>(null);

  useEffect(() => {
    api.wallet()
      .then((w) => setQrCode(w.qr_code || null))
      .catch(() => setQrCode(null))
      .finally(() => setLoading(false));
  }, []);

  if (state.status !== "authed") return null;
  const u = state.user;

  const handleCopy = async () => {
    if (!qrCode) return;
    await Clipboard.setStringAsync(qrCode);
    Alert.alert("Copied", "Your TNR code has been copied to clipboard.");
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

  // TNR logo as SVG string for QR center
  const logoSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60">
      <circle cx="30" cy="30" r="30" fill="#00D4FF"/>
      <text x="50%" y="54%" text-anchor="middle"
        font-family="Arial Black, Arial" font-weight="900"
        font-size="18" fill="#050A0A" dy=".1em">TNR</text>
    </svg>
  `;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My QR Code</Text>
        <TouchableOpacity onPress={handleShare} style={styles.shareBtn}>
          <Ionicons name="share-social-outline" size={22} color={colors.cyan} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {/* QR Card */}
        <View style={styles.qrCard}>
          {/* Brand header */}
          <View style={styles.brandRow}>
            <View style={styles.brandIcon}>
              <Text style={styles.brandIconText}>TR</Text>
            </View>
            <View>
              <Text style={styles.brandName}>Tag n Ride</Text>
              <Text style={styles.brandSub}>Payment QR Code</Text>
            </View>
          </View>

          {/* QR Code */}
          <View style={styles.qrWrap}>
            {loading ? (
              <View style={styles.qrPlaceholder}>
                <ActivityIndicator color={colors.cyan} size="large" />
              </View>
            ) : qrCode ? (
              <QRCode
                value={qrCode}
                size={220}
                color="#05050A"
                backgroundColor="#FFFFFF"
                logo={{
                  uri: `data:image/svg+xml;base64,${btoa(logoSvg)}`,
                }}
                logoSize={52}
                logoBackgroundColor="#FFFFFF"
                logoMargin={4}
                logoBorderRadius={26}
                quietZone={12}
                getRef={qrRef}
                ecl="H"
              />
            ) : (
              <View style={styles.qrPlaceholder}>
                <Ionicons name="qr-code-outline" size={80} color={colors.textDim} />
                <Text style={styles.qrPlaceholderText}>QR code not available</Text>
              </View>
            )}
          </View>

          {/* Name and code */}
          <Text style={styles.driverName}>{u.full_name}</Text>
          <View style={styles.codePill}>
            <Text style={styles.codePillPrefix}>TNR</Text>
            <Text style={styles.codePillText}>{qrCode || "—"}</Text>
          </View>
          <Text style={styles.scanHint}>Scan to pay me instantly</Text>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleCopy}>
            <View style={styles.actionIcon}>
              <Ionicons name="copy-outline" size={22} color={colors.cyan} />
            </View>
            <Text style={styles.actionLabel}>Copy ID</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
            <View style={styles.actionIcon}>
              <Ionicons name="share-social-outline" size={22} color={colors.cyan} />
            </View>
            <Text style={styles.actionLabel}>Share</Text>
          </TouchableOpacity>
        </View>

        {/* Info card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Account Details</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Full Name</Text>
            <Text style={styles.infoValue}>{u.full_name}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Phone</Text>
            <Text style={styles.infoValue}>{u.phone_number}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>TNR Code</Text>
            <Text style={[styles.infoValue, { color: colors.cyan, fontFamily: "monospace" }]}>
              {qrCode || "—"}
            </Text>
          </View>
          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.infoLabel}>Role</Text>
            <Text style={styles.infoValue}>{u.role.toUpperCase()}</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  shareBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.cyanDim, borderWidth: 1, borderColor: colors.cyan,
    alignItems: "center", justifyContent: "center",
  },
  content: { flex: 1, padding: 20 },
  // QR Card — white background like BukkaPay
  qrCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24, padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
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
  qrPlaceholder: {
    width: 220, height: 220,
    alignItems: "center", justifyContent: "center", gap: 12,
  },
  qrPlaceholderText: { color: "#999", fontSize: 13 },
  driverName: {
    color: "#05050A", fontSize: 20,
    fontWeight: "800", marginBottom: 10,
  },
  codePill: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#EEF4FF", borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 6, gap: 8, marginBottom: 10,
  },
  codePillPrefix: {
    color: "#00D4FF", fontWeight: "900",
    fontSize: 12, letterSpacing: 1,
  },
  codePillText: {
    color: "#05050A", fontFamily: "monospace",
    fontSize: 13, fontWeight: "700", letterSpacing: 0.5,
  },
  scanHint: { color: "#888", fontSize: 13 },
  // Actions
  actions: {
    flexDirection: "row", gap: 12, marginBottom: 16,
  },
  actionBtn: {
    flex: 1, backgroundColor: colors.bg2,
    borderRadius: radius.md, borderWidth: 1,
    borderColor: colors.border, padding: 16,
    alignItems: "center", gap: 8,
  },
  actionIcon: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.cyanDim,
    alignItems: "center", justifyContent: "center",
  },
  actionLabel: { color: colors.text, fontSize: 13, fontWeight: "700" },
  // Info card
  infoCard: {
    backgroundColor: colors.bg2, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: 16,
  },
  infoTitle: {
    color: colors.text, fontSize: 15, fontWeight: "800",
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  infoLabel: { color: colors.textMuted, fontSize: 13 },
  infoValue: { color: colors.text, fontSize: 13, fontWeight: "600" },
});
