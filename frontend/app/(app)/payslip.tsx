import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useTheme } from "../../src/ThemeContext";
import { api } from "../../src/api";
import { useAuth } from "../../src/AuthContext";
import { radius } from "../../src/theme";

const PERIOD_TYPES = [
  { key: "1month", label: "1 Month", months: 1 },
  { key: "3months", label: "3 Months", months: 3 },
  { key: "6months", label: "6 Months", months: 6 },
  { key: "12months", label: "12 Months", months: 12 },
] as const;

const MONTH_NAMES = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];
const MONTH_FULL = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function formatR(val: number) {
  return `R ${val.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function getPeriodRange(periodType: string, year: number, month: number) {
  const months = PERIOD_TYPES.find((p) => p.key === periodType)?.months ?? 1;
  let startM = month - (months - 1);
  let startY = year;
  while (startM <= 0) { startM += 12; startY -= 1; }
  if (months === 1) return `${MONTH_FULL[month - 1]} ${year}`;
  return `${MONTH_FULL[startM - 1]} ${startY} – ${MONTH_FULL[month - 1]} ${year}`;
}

function monthStr(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function buildPDF(p: any): string {
  const refUrl = `https://tagnride.com/verify?ref=${encodeURIComponent(p.reference_number)}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(refUrl)}`;
  const showOwner = (p.owner_payouts ?? 0) > 0;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #222; background: #fff; padding: 32px; }
  .header { text-align: center; padding-bottom: 20px; border-bottom: 3px solid #00D4FF; margin-bottom: 24px; }
  .brand { font-size: 28px; font-weight: 900; color: #00D4FF; letter-spacing: 2px; }
  .doc-title { font-size: 14px; font-weight: 700; color: #444; margin-top: 6px; letter-spacing: 1px; }
  .doc-meta { color: #888; font-size: 11px; margin-top: 6px; }
  .section { background: #f5f5f5; border-radius: 10px; padding: 16px; margin-bottom: 18px; }
  .section-title { font-size: 11px; font-weight: 800; letter-spacing: 1.2px; color: #888; text-transform: uppercase; margin-bottom: 10px; }
  .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e5e5e5; }
  .row:last-child { border-bottom: none; }
  .label { color: #555; }
  .value { font-weight: 700; }
  .red { color: #e53e3e; }
  .orange { color: #dd6b20; }
  .green { color: #38a169; }
  .cyan { color: #00D4FF; }
  .net-box { background: #e6faff; border: 2px solid #00D4FF; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 18px; }
  .net-label { font-size: 13px; font-weight: 800; color: #00D4FF; letter-spacing: 1px; text-transform: uppercase; }
  .net-amount { font-size: 36px; font-weight: 900; color: #00D4FF; margin-top: 6px; }
  .perf { display: flex; justify-content: space-around; background: #f5f5f5; border-radius: 10px; padding: 16px; margin-bottom: 18px; text-align: center; }
  .perf-val { font-size: 20px; font-weight: 800; color: #222; }
  .perf-lbl { font-size: 10px; color: #888; margin-top: 4px; }
  .verify { border: 2px solid #00D4FF; border-radius: 10px; padding: 16px; margin-bottom: 18px; display: flex; gap: 16px; align-items: flex-start; }
  .verify-info { flex: 1; }
  .ref { font-family: monospace; font-size: 12px; font-weight: 700; color: #222; }
  .verify-url { color: #00D4FF; font-size: 11px; margin-top: 4px; word-break: break-all; }
  .verify-note { color: #888; font-size: 10px; margin-top: 6px; }
  .footer { text-align: center; color: #aaa; font-size: 10px; border-top: 1px solid #e5e5e5; padding-top: 16px; margin-top: 8px; line-height: 1.8; }
</style>
</head>
<body>
<div class="header">
  <div class="brand">TAG N RIDE</div>
  <div class="doc-title">DRIVER EARNINGS STATEMENT</div>
  <div class="doc-meta">${p.period_label} &nbsp;·&nbsp; Generated ${new Date(p.created_at).toLocaleDateString("en-ZA")}</div>
</div>

<div class="section">
  <div class="section-title">Driver Information</div>
  <div class="row"><span class="label">Name</span><span class="value">${p.driver_name ?? ""}</span></div>
  <div class="row"><span class="label">Phone</span><span class="value">${p.driver_phone ?? ""}</span></div>
  ${p.vehicle_plate ? `<div class="row"><span class="label">Vehicle Plate</span><span class="value">${p.vehicle_plate}</span></div>` : ""}
  <div class="row"><span class="label">Statement Period</span><span class="value">${p.period_label}</span></div>
</div>

<div class="section">
  <div class="section-title">Earnings Breakdown</div>
  <div class="row"><span class="label">Gross Fare Collected</span><span class="value">${formatR(p.gross_earnings)}</span></div>
  <div class="row"><span class="label">Platform Fee (3%)</span><span class="value red">− ${formatR(p.platform_fee)}</span></div>
  <div class="row"><span class="label">Total Net</span><span class="value">${formatR(p.total_net)}</span></div>
  ${showOwner ? `<div class="row"><span class="label">Owner Payout</span><span class="value orange">− ${formatR(p.owner_payouts)}</span></div>` : ""}
</div>

<div class="net-box">
  <div class="net-label">Your Net Earnings</div>
  <div class="net-amount">${formatR(p.driver_net_earnings)}</div>
</div>

<div class="section">
  <div class="section-title">Wallet Activity</div>
  <div class="row"><span class="label">Total Cashed to Your Bank</span><span class="value">${formatR(p.driver_cashups_self)}</span></div>
  <div class="row"><span class="label">Remaining Wallet Balance</span><span class="value">${formatR(p.wallet_balance_at_generation)}</span></div>
</div>

<div class="perf">
  <div><div class="perf-val">${p.total_trips}</div><div class="perf-lbl">Total Trips</div></div>
  <div><div class="perf-val cyan">${(p.rating_avg ?? 0).toFixed(1)} ★</div><div class="perf-lbl">Avg Rating</div></div>
  <div><div class="perf-val">${p.rating_count}</div><div class="perf-lbl">Total Reviews</div></div>
</div>

<div class="verify">
  <img src="${qrUrl}" width="80" height="80" style="border-radius:6px;" />
  <div class="verify-info">
    <div class="section-title" style="margin-bottom:4px;">Verification</div>
    <div class="ref">${p.reference_number}</div>
    <div class="verify-url">tagnride.com/verify?ref=${p.reference_number}</div>
    <div class="verify-note">Scan QR code or visit URL to verify this document</div>
  </div>
</div>

<div class="footer">
  <strong>Tag n Ride Pty Ltd</strong><br />
  Pretoria, Gauteng, South Africa &nbsp;·&nbsp; support@tagnride.com<br />
  This document is digitally issued and verifiable by Tag n Ride Pty Ltd.<br />
  It serves as proof of earnings for credit and financial applications.
</div>
</body>
</html>`;
}

export default function PayslipScreen() {
  const { colors } = useTheme();
  const { state } = useAuth();
  const router = useRouter();
  const s = makeStyles(colors);

  const now = new Date();
  const [selectedPeriod, setSelectedPeriod] = useState<string>("1month");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [pricing, setPricing] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loadingPricing, setLoadingPricing] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);

  useEffect(() => {
    if (state.status === "authed" && state.user.role !== "driver") {
      router.replace("/(app)/home");
    }
  }, [state.status]);

  const loadPricing = useCallback(async () => {
    setLoadingPricing(true);
    try {
      const data = await api.payslipPricing();
      setPricing(data);
    } catch {} finally { setLoadingPricing(false); }
  }, []);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const rows = await api.payslipHistory();
      setHistory(rows);
    } catch {} finally { setLoadingHistory(false); }
  }, []);

  const loadBalance = useCallback(async () => {
    try {
      const w = await api.wallet();
      setWalletBalance(w.balance);
    } catch {}
  }, []);

  useEffect(() => {
    loadPricing();
    loadHistory();
    loadBalance();
  }, []);

  const getFee = () => {
    if (!pricing) return 0;
    const map: Record<string, number> = {
      "1month": pricing.fee_1month,
      "3months": pricing.fee_3months,
      "6months": pricing.fee_6months,
      "12months": pricing.fee_12months,
    };
    return map[selectedPeriod] ?? 0;
  };

  const handleGenerate = () => {
    const fee = getFee();
    if (walletBalance < fee) {
      Alert.alert(
        "Insufficient Balance",
        `You need ${formatR(fee)} to generate this statement but your wallet only has ${formatR(walletBalance)}. Please top up first.`,
        [{ text: "OK" }]
      );
      return;
    }
    doGenerate();
  };

  const doGenerate = async () => {
    setGenerating(true);
    try {
      const fresh = await api.payslipPricing();
      if (!fresh?.enabled) {
        Alert.alert("Unavailable", "Earnings statements are currently disabled. Please try again later.");
        return;
      }
      const newEntry = await api.payslipRequest({
        period_type: selectedPeriod,
        month: monthStr(year, month),
      });
      await loadHistory();
      await loadBalance();
      const idToFetch = newEntry?.id ?? newEntry?.payslip_id;
      if (idToFetch) {
        const data = await api.payslipGet(idToFetch);
        const html = buildPDF(data);
        const { uri } = await Print.printToFileAsync({ html, base64: false });
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "Your Earnings Statement",
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert("Generated ✓", "Your earnings statement is ready in My Statements below.");
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to generate statement.");
    } finally { setGenerating(false); }
  };

  const handleDownload = async (id: string) => {
    setDownloadingId(id);
    try {
      const data = await api.payslipGet(id);
      const html = buildPDF(data);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: "Share Earnings Statement",
        UTI: "com.adobe.pdf",
      });
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not generate PDF.");
    } finally { setDownloadingId(null); }
  };

  const handleShare = async (id: string) => {
    await handleDownload(id);
  };

  const handleDelete = (id: string, label: string) => {
    Alert.alert(
      "Remove Statement?",
      `This will remove the statement for ${label} from your library. The fee is non-refundable.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: async () => {
          try {
            await api.payslipDelete(id);
            setHistory((h) => h.filter((p) => p.id !== id));
          } catch (e: any) {
            Alert.alert("Error", e?.message || "Could not delete.");
          }
        }},
      ]
    );
  };

  const shiftMonth = (dir: number) => {
    let m = month + dir;
    let y = year;
    if (m > 12) { m = 1; y += 1; }
    if (m < 1) { m = 12; y -= 1; }
    setMonth(m);
    setYear(y);
  };

  const fee = getFee();
  const periodRange = getPeriodRange(selectedPeriod, year, month);

  if (state.status !== "authed") return null;

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>

        {/* Header */}
        <TouchableOpacity onPress={() => router.back()} style={s.backRow}>
          <Ionicons name="arrow-back" size={20} color={colors.cyan} />
          <Text style={s.backText}>Back</Text>
        </TouchableOpacity>

        <Text style={s.title}>Earnings Statements</Text>
        <Text style={s.subtitle}>Request and download your official earnings documents</Text>

        {/* Request card */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Ionicons name="document-text-outline" size={20} color={colors.cyan} />
            <Text style={s.cardTitle}>REQUEST NEW STATEMENT</Text>
          </View>

          {loadingPricing ? (
            <ActivityIndicator color={colors.cyan} style={{ marginVertical: 20 }} />
          ) : !pricing?.enabled ? (
            <View style={s.disabledBox}>
              <Ionicons name="close-circle-outline" size={20} color={colors.textMuted} />
              <Text style={s.disabledText}>Earnings statements are currently unavailable.</Text>
            </View>
          ) : (
            <>
              {/* Period buttons */}
              <Text style={s.sectionLabel}>STATEMENT PERIOD</Text>
              <View style={s.periodRow}>
                {PERIOD_TYPES.map((pt) => {
                  const active = selectedPeriod === pt.key;
                  const feeMap: Record<string, number> = {
                    "1month": pricing.fee_1month,
                    "3months": pricing.fee_3months,
                    "6months": pricing.fee_6months,
                    "12months": pricing.fee_12months,
                  };
                  return (
                    <TouchableOpacity
                      key={pt.key}
                      style={[s.periodBtn, active && s.periodBtnActive]}
                      onPress={() => setSelectedPeriod(pt.key)}
                    >
                      <Text style={[s.periodBtnLabel, active && s.periodBtnLabelActive]}>
                        {pt.label}
                      </Text>
                      <Text style={[s.periodBtnFee, active && { color: colors.cyan }]}>
                        {formatR(feeMap[pt.key])}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Month selector */}
              <Text style={s.sectionLabel}>SELECT MONTH</Text>
              <View style={s.monthRow}>
                <TouchableOpacity style={s.arrowBtn} onPress={() => shiftMonth(-1)}>
                  <Ionicons name="chevron-back" size={20} color={colors.cyan} />
                </TouchableOpacity>
                <View style={s.monthCenter}>
                  <Text style={s.monthMain}>{MONTH_FULL[month - 1]} {year}</Text>
                  {selectedPeriod !== "1month" && (
                    <Text style={s.monthRange}>{periodRange}</Text>
                  )}
                </View>
                <TouchableOpacity style={s.arrowBtn} onPress={() => shiftMonth(1)}>
                  <Ionicons name="chevron-forward" size={20} color={colors.cyan} />
                </TouchableOpacity>
              </View>

              {/* Balance & fee info */}
              <View style={s.feeInfo}>
                <View style={s.feeRow}>
                  <Text style={s.feeLabel}>Wallet Balance</Text>
                  <Text style={[s.feeValue, { color: walletBalance >= fee ? colors.green : colors.red }]}>
                    {formatR(walletBalance)}
                  </Text>
                </View>
                <View style={s.feeRow}>
                  <Text style={s.feeLabel}>Statement Fee</Text>
                  <Text style={[s.feeValue, { color: colors.cyan }]}>{formatR(fee)}</Text>
                </View>
              </View>

              {/* Generate button */}
              <TouchableOpacity
                style={[s.generateBtn, generating && { opacity: 0.6 }]}
                onPress={handleGenerate}
                disabled={generating}
              >
                {generating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="download-outline" size={18} color="#fff" />
                    <Text style={s.generateBtnText}>
                      Generate {PERIOD_TYPES.find((p) => p.key === selectedPeriod)?.label} — {formatR(fee)}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* History */}
        <Text style={s.section}>MY STATEMENTS</Text>

        {loadingHistory ? (
          <ActivityIndicator color={colors.cyan} style={{ marginVertical: 16 }} />
        ) : history.length === 0 ? (
          <View style={s.emptyBox}>
            <Ionicons name="document-outline" size={40} color={colors.textDim} />
            <Text style={s.emptyTitle}>No statements yet</Text>
            <Text style={s.emptyText}>Generate your first earnings statement above.</Text>
          </View>
        ) : (
          history.map((p) => (
            <View key={p.id} style={s.historyCard}>
              <View style={s.historyTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.historyPeriod}>{p.period_label}</Text>
                  <Text style={s.historyDate}>
                    Generated {new Date(p.created_at).toLocaleDateString("en-ZA")}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={s.historyNet}>{formatR(p.driver_net_earnings)}</Text>
                  <Text style={s.historyTrips}>{p.total_trips} trips</Text>
                </View>
              </View>
              <View style={s.historyActions}>
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: colors.cyanDim, borderColor: colors.cyan + "40" }]}
                  onPress={() => handleDownload(p.id)}
                  disabled={downloadingId === p.id}
                >
                  {downloadingId === p.id ? (
                    <ActivityIndicator color={colors.cyan} size="small" />
                  ) : (
                    <>
                      <Ionicons name="download-outline" size={14} color={colors.cyan} />
                      <Text style={[s.actionBtnText, { color: colors.cyan }]}>Download</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: colors.bg, borderColor: colors.border }]}
                  onPress={() => handleShare(p.id)}
                  disabled={downloadingId === p.id}
                >
                  <Ionicons name="share-outline" size={14} color={colors.textMuted} />
                  <Text style={[s.actionBtnText, { color: colors.textMuted }]}>Share</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: colors.red + "15", borderColor: colors.red + "40" }]}
                  onPress={() => handleDelete(p.id, p.period_label)}
                >
                  <Ionicons name="trash-outline" size={14} color={colors.red} />
                  <Text style={[s.actionBtnText, { color: colors.red }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  backRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  backText: { color: colors.cyan, fontSize: 15, fontWeight: "600" },
  title: { color: colors.text, fontSize: 24, fontWeight: "900", marginBottom: 6 },
  subtitle: { color: colors.textMuted, fontSize: 13, marginBottom: 20 },
  card: { backgroundColor: colors.bg2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 20, marginBottom: 8 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  cardTitle: { color: colors.textMuted, fontSize: 12, fontWeight: "800", letterSpacing: 1.4 },
  section: { color: colors.textMuted, fontSize: 12, fontWeight: "700", letterSpacing: 1.4, marginTop: 24, marginBottom: 12 },
  sectionLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 10 },
  periodRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  periodBtn: { flex: 1, backgroundColor: colors.bg, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingVertical: 10, alignItems: "center" },
  periodBtnActive: { backgroundColor: colors.cyanDim, borderColor: colors.cyan },
  periodBtnLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "800" },
  periodBtnLabelActive: { color: colors.cyan },
  periodBtnFee: { color: colors.textDim, fontSize: 10, marginTop: 3 },
  monthRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: 16, overflow: "hidden" },
  arrowBtn: { padding: 16 },
  monthCenter: { flex: 1, alignItems: "center", paddingVertical: 10 },
  monthMain: { color: colors.text, fontSize: 16, fontWeight: "800" },
  monthRange: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  feeInfo: { backgroundColor: colors.bg, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 16 },
  feeRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  feeLabel: { color: colors.textMuted, fontSize: 13 },
  feeValue: { fontSize: 13, fontWeight: "800" },
  generateBtn: { backgroundColor: colors.cyan, borderRadius: radius.md, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  generateBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  disabledBox: { flexDirection: "row", alignItems: "center", gap: 10, padding: 16, backgroundColor: colors.bg, borderRadius: radius.sm },
  disabledText: { color: colors.textMuted, fontSize: 13, flex: 1 },
  emptyBox: { alignItems: "center", padding: 40, backgroundColor: colors.bg2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "700", marginTop: 12 },
  emptyText: { color: colors.textMuted, fontSize: 13, marginTop: 4, textAlign: "center" },
  historyCard: { backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 12 },
  historyTop: { flexDirection: "row", alignItems: "flex-start", marginBottom: 14 },
  historyPeriod: { color: colors.text, fontSize: 15, fontWeight: "800" },
  historyDate: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
  historyNet: { color: "#22c55e", fontSize: 18, fontWeight: "900" },
  historyTrips: { color: colors.textMuted, fontSize: 11, marginTop: 2, textAlign: "right" },
  historyActions: { flexDirection: "row", gap: 8 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: radius.sm, borderWidth: 1 },
  actionBtnText: { fontSize: 12, fontWeight: "700" },
});
