import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { api } from "../../src/api";
import { formatZAR, radius } from "../../src/theme";
import { useTheme } from "../../src/ThemeContext";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

export function buildPassengerStatementPDF(d: any, reference: string): string {
  const genDate = new Date().toLocaleDateString("en-ZA");
  const tripsHtml = d.trips.length > 0
    ? `<div class="section">
  <div class="section-title">Trips (${d.trips.length})</div>
  ${d.trips.map((t: any) =>
    `<div class="trip-row"><span>${t.driver || "Driver"} &nbsp;·&nbsp; ${(t.date || "").slice(0, 10)}</span><span class="red">R ${parseFloat(t.amount).toFixed(2)}</span></div>`
  ).join("")}
</div>` : "";
  const topupsHtml = d.topups.length > 0
    ? `<div class="section">
  <div class="section-title">Top-Ups (${d.topups.length})</div>
  ${d.topups.map((t: any) =>
    `<div class="trip-row"><span>Wallet Top-Up &nbsp;·&nbsp; ${(t.date || "").slice(0, 10)}</span><span class="green">+R ${parseFloat(t.amount).toFixed(2)}</span></div>`
  ).join("")}
</div>` : "";
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
  .green { color: #22c55e; }
  .red { color: #e53e3e; }
  .trip-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e5e5e5; font-size: 11px; }
  .trip-row:last-child { border-bottom: none; }
  .footer { text-align: center; color: #aaa; font-size: 10px; border-top: 1px solid #e5e5e5; padding-top: 16px; margin-top: 8px; line-height: 1.8; }
</style>
</head>
<body>
<div class="header">
  <div class="brand">TAG N RIDE</div>
  <div class="doc-title">PASSENGER EXPENSE STATEMENT</div>
  <div class="doc-meta">${d.period_start} to ${d.period_end} &nbsp;·&nbsp; Generated ${genDate}</div>
  ${reference ? `<div class="doc-meta">Ref: ${reference}</div>` : ""}
</div>
<div class="section">
  <div class="section-title">Passenger Information</div>
  <div class="row"><span class="label">Name</span><span class="value">${d.passenger_name ?? ""}</span></div>
  <div class="row"><span class="label">Statement Period</span><span class="value">${d.period_start} to ${d.period_end}</span></div>
</div>
<div class="section">
  <div class="section-title">Summary</div>
  <div class="row"><span class="label">Total Rides</span><span class="value">${d.summary.total_trips}</span></div>
  <div class="row"><span class="label">Total Spent on Rides</span><span class="value red">R ${Number(d.summary.total_spent).toFixed(2)}</span></div>
  <div class="row"><span class="label">Total Wallet Top-Ups</span><span class="value green">R ${Number(d.summary.total_topups).toFixed(2)}</span></div>
  <div class="row"><span class="label">Average Trip Cost</span><span class="value">R ${Number(d.summary.average_trip).toFixed(2)}</span></div>
</div>
${tripsHtml}
${topupsHtml}
<div class="footer">
  <strong>Tag n Ride Pty Ltd</strong><br />
  Pretoria, Gauteng, South Africa &nbsp;·&nbsp; support@tagnride.com<br />
  This document is issued by Tag n Ride Pty Ltd for personal record keeping.
</div>
</body>
</html>`;
}

function Row({ label, value, bold, green, colors, s }: any) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, bold && { fontWeight: "800", color: colors.text }, green && { color: colors.green }]}>
        {value}
      </Text>
    </View>
  );
}

function formatR(val: number) {
  return `R ${val.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

export default function PassengerStatementScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const now = new Date();
  const [year, setYear]       = useState(now.getFullYear());
  const [month, setMonth]     = useState(now.getMonth());  // default = current month
  const [loading, setLoading] = useState(false);
  const [data, setData]       = useState<any>(null);
  const [stmtRef, setStmtRef] = useState("");
  const [charged, setCharged] = useState(0);
  const [generated, setGenerated] = useState(false);

  const [pricing, setPricing]           = useState<{ enabled: boolean; price: number } | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [loadingPricing, setLoadingPricing] = useState(true);
  const [downloadingPDF, setDownloadingPDF] = useState(false);

  const loadPricing = useCallback(async () => {
    setLoadingPricing(true);
    try {
      const [p, w] = await Promise.all([
        api.passengerStatementPricing().catch(() => null),
        api.wallet().catch(() => null),
      ]);
      if (p) setPricing(p);
      if (w) setWalletBalance(w.balance);
    } finally {
      setLoadingPricing(false);
    }
  }, []);

  useEffect(() => { loadPricing(); }, []);

  const periodStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const periodEnd = `${year}-${String(month + 1).padStart(2, "0")}-${lastDay}`;

  const handleGetStatement = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await api.requestPassengerStatement(periodStart, periodEnd);
      setData(res.data);
      setStmtRef(res.reference ?? "");
      setCharged(res.amount_charged ?? 0);
      setGenerated(true);
      setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 100);
    } catch (e: any) {
      const msg: string = e?.message || "Could not generate statement. Please try again.";
      if (msg.toLowerCase().includes("insufficient") || msg.toLowerCase().includes("balance")) {
        Alert.alert(
          "Insufficient Balance",
          `${msg}\n\nCurrent balance: ${formatR(walletBalance)}`,
          [
            { text: "Not Now", style: "cancel" },
            { text: "Top Up Wallet", onPress: () => router.push("/topup" as any) },
          ]
        );
      } else {
        Alert.alert("Could Not Generate", msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!data) return;
    setDownloadingPDF(true);
    try {
      const html = buildPassengerStatementPDF(data, stmtRef);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const safePeriod = `${data.period_start}-${data.period_end}`.replace(/[^a-zA-Z0-9-]/g, "-");
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: `TagNRide-Expense-Statement-${safePeriod}.pdf`,
        UTI: "com.adobe.pdf",
      });
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not generate PDF.");
    } finally {
      setDownloadingPDF(false);
    }
  };

  const resetForm = () => {
    setData(null);
    setGenerated(false);
    setStmtRef("");
    setCharged(0);
    loadPricing();
  };

  const s = makeStyles(colors);
  const d = data;
  const fee = pricing?.price ?? 0;
  const canAfford = walletBalance >= fee;  // used for inline top-up CTA

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 20, paddingBottom: 56 }}>

        {/* Header */}
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="chevron-back" size={20} color={colors.cyan} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.pageTitle}>Expense Statement</Text>
            <Text style={s.pageSub}>Monthly ride spending breakdown</Text>
          </View>
        </View>

        {/* ── Success banner ── */}
        {generated && (
          <View style={s.successBanner}>
            <View style={s.successIconWrap}>
              <Ionicons name="checkmark-circle" size={24} color="#22c55e" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.successTitle}>Statement Generated!</Text>
              <Text style={s.successSub}>Saved to your Documents</Text>
            </View>
            {charged > 0 && (
              <View style={s.chargedTag}>
                <Text style={s.chargedTagText}>−{formatR(charged)}</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Month selector (only when not yet generated) ── */}
        {!generated && (
          <View style={s.periodCard}>
            <Text style={s.sectionLabel}>SELECT MONTH</Text>
            <View style={s.monthRow}>
              <TouchableOpacity
                onPress={() => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }}
                style={s.arrow}>
                <Ionicons name="chevron-back" size={20} color={colors.cyan} />
              </TouchableOpacity>
              <Text style={s.monthText}>{MONTHS[month]} {year}</Text>
              <TouchableOpacity
                onPress={() => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }}
                style={s.arrow}>
                <Ionicons name="chevron-forward" size={20} color={colors.cyan} />
              </TouchableOpacity>
            </View>
            <Text style={s.periodRange}>{periodStart} → {periodEnd}</Text>

            {loadingPricing ? (
              <ActivityIndicator color={colors.cyan} style={{ marginVertical: 16 }} />
            ) : pricing && !pricing.enabled ? (
              <View style={s.disabledBox}>
                <Ionicons name="close-circle-outline" size={18} color={colors.textMuted} />
                <Text style={s.disabledText}>Expense statements are currently unavailable.</Text>
              </View>
            ) : (
              <>
                {/* Fee / balance summary */}
                <View style={s.feeBox}>
                  <View style={s.feeRow}>
                    <View style={s.feeRowLeft}>
                      <Ionicons name="receipt-outline" size={14} color={colors.textMuted} />
                      <Text style={s.feeLabel}>Statement Fee</Text>
                    </View>
                    <Text style={[s.feeValue, { color: fee === 0 ? colors.green : colors.cyan }]}>
                      {fee === 0 ? "Free" : formatR(fee)}
                    </Text>
                  </View>
                  <View style={[s.feeRow, { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 6, paddingTop: 10 }]}>
                    <View style={s.feeRowLeft}>
                      <Ionicons name="wallet-outline" size={14} color={colors.textMuted} />
                      <Text style={s.feeLabel}>Your Balance</Text>
                    </View>
                    <Text style={[s.feeValue, { color: canAfford ? colors.green : colors.red }]}>
                      {formatR(walletBalance)}
                    </Text>
                  </View>
                </View>

                {!canAfford && fee > 0 ? (
                  // Balance insufficient — show top-up CTA instead of a fake-disabled button
                  <View style={{ width: "100%", gap: 10 }}>
                    <View style={s.insufficientBox}>
                      <Ionicons name="warning-outline" size={14} color={colors.red} />
                      <Text style={s.insufficientText}>
                        You need {formatR(fee - walletBalance)} more to generate this statement.
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => router.push("/topup" as any)}
                      style={[s.getBtn, { backgroundColor: colors.green ?? "#22c55e" }]}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="add-circle-outline" size={20} color="#fff" />
                      <View style={s.getBtnTextWrap}>
                        <Text style={s.getBtnText}>Top Up Wallet</Text>
                        <Text style={s.getBtnSub}>Need {formatR(fee - walletBalance)} more</Text>
                      </View>
                      <Ionicons name="arrow-forward" size={18} color="rgba(255,255,255,0.7)" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  // Balance sufficient — show get statement button
                  <TouchableOpacity
                    style={s.getBtn}
                    onPress={handleGetStatement}
                    disabled={loading}
                    activeOpacity={0.8}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Ionicons name="document-text" size={20} color="#fff" />
                        <View style={s.getBtnTextWrap}>
                          <Text style={s.getBtnText}>Get Statement</Text>
                          {fee > 0 ? (
                            <Text style={s.getBtnSub}>{formatR(fee)} will be deducted</Text>
                          ) : (
                            <Text style={s.getBtnSub}>No charge · generates instantly</Text>
                          )}
                        </View>
                        <Ionicons name="arrow-forward" size={18} color="rgba(255,255,255,0.7)" />
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        )}

        {/* ── Statement data preview ── */}
        {d && generated && (
          <>
            {/* Period header */}
            <View style={s.stmtHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.stmtTitle}>{MONTHS[month]} {year}</Text>
                <Text style={s.stmtMeta}>{d.passenger_name}</Text>
                <Text style={s.stmtMeta}>{d.period_start} → {d.period_end}</Text>
                {stmtRef ? <Text style={s.stmtRef}>Ref: {stmtRef}</Text> : null}
              </View>
            </View>

            {/* Summary */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>SUMMARY</Text>
              <Row label="Total rides" value={String(d.summary.total_trips)} colors={colors} s={s} />
              <Row label="Total spent on rides" value={formatZAR(d.summary.total_spent)} bold colors={colors} s={s} />
              <Row label="Total wallet top-ups" value={formatZAR(d.summary.total_topups)} green colors={colors} s={s} />
              <Row label="Average trip cost" value={formatZAR(d.summary.average_trip)} colors={colors} s={s} />
            </View>

            {/* Trips */}
            {d.trips.length > 0 && (
              <View style={s.section}>
                <Text style={s.sectionLabel}>TRIPS ({d.trips.length})</Text>
                {d.trips.map((t: any, i: number) => (
                  <View key={i} style={[s.tripRow, i < d.trips.length - 1 && s.tripBorder]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.tripDriver}>{t.driver}</Text>
                      <Text style={s.tripDate}>{t.date?.slice(0, 10)}</Text>
                    </View>
                    <Text style={s.tripAmount}>{formatZAR(t.amount)}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Top-ups */}
            {d.topups.length > 0 && (
              <View style={s.section}>
                <Text style={s.sectionLabel}>TOP-UPS ({d.topups.length})</Text>
                {d.topups.map((t: any, i: number) => (
                  <View key={i} style={[s.tripRow, i < d.topups.length - 1 && s.tripBorder]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.tripDriver}>Wallet Top-up</Text>
                      <Text style={s.tripDate}>{t.date?.slice(0, 10)}</Text>
                    </View>
                    <Text style={[s.tripAmount, { color: colors.green }]}>+{formatZAR(t.amount)}</Text>
                  </View>
                ))}
              </View>
            )}

            {d.trips.length === 0 && d.topups.length === 0 && (
              <View style={s.emptyBox}>
                <Ionicons name="receipt-outline" size={36} color={colors.textMuted} />
                <Text style={s.emptyText}>No activity in this period</Text>
              </View>
            )}

            {/* Actions */}
            <View style={s.actionsWrap}>
              {/* Primary: Go to Documents */}
              <TouchableOpacity
                style={s.primaryBtn}
                onPress={() => router.push("/(app)/documents")}
                activeOpacity={0.85}
              >
                <Ionicons name="folder-open" size={20} color="#fff" />
                <Text style={s.primaryBtnText}>View in My Documents</Text>
              </TouchableOpacity>

              {/* Secondary: Download PDF */}
              <TouchableOpacity
                style={[s.secondaryBtn, downloadingPDF && { opacity: 0.6 }]}
                onPress={handleDownloadPDF}
                disabled={downloadingPDF}
                activeOpacity={0.8}
              >
                {downloadingPDF
                  ? <ActivityIndicator color={colors.cyan} size="small" />
                  : <Ionicons name="download-outline" size={18} color={colors.cyan} />}
                <Text style={s.secondaryBtnText}>Download PDF</Text>
              </TouchableOpacity>

              {/* Tertiary: Generate another */}
              <TouchableOpacity style={s.tertiaryBtn} onPress={resetForm}>
                <Text style={s.tertiaryBtnText}>Generate Another Statement</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 24 },
  backBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border },
  pageTitle: { color: colors.text, fontSize: 22, fontWeight: "800" },
  pageSub: { color: colors.textMuted, fontSize: 12, marginTop: 1 },

  successBanner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#22c55e15", borderWidth: 1, borderColor: "#22c55e40",
    borderRadius: radius.md, padding: 14, marginBottom: 20,
  },
  successIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#22c55e20", alignItems: "center", justifyContent: "center" },
  successTitle: { color: "#22c55e", fontWeight: "800", fontSize: 15 },
  successSub: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  chargedTag: { backgroundColor: colors.redDim ?? colors.red + "20", borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  chargedTagText: { color: colors.red, fontSize: 12, fontWeight: "700" },

  periodCard: {
    backgroundColor: colors.bg2, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: 20,
    alignItems: "center", marginBottom: 24,
  },
  sectionLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, marginBottom: 16 },
  monthRow: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 8 },
  arrow: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.cyanDim, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.cyan + "40" },
  monthText: { color: colors.text, fontSize: 22, fontWeight: "800", minWidth: 180, textAlign: "center" },
  periodRange: { color: colors.textMuted, fontSize: 12, marginBottom: 20 },

  feeBox: { width: "100%", backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 12 },
  feeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 2 },
  feeRowLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  feeLabel: { color: colors.textMuted, fontSize: 13 },
  feeValue: { fontSize: 14, fontWeight: "800" },

  insufficientBox: { flexDirection: "row", alignItems: "center", gap: 8, width: "100%", backgroundColor: colors.redDim ?? colors.red + "15", borderRadius: radius.sm, padding: 10, marginBottom: 12 },
  insufficientText: { color: colors.red, fontSize: 12, flex: 1, fontWeight: "600" },

  getBtn: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.cyan, borderRadius: radius.md,
    paddingVertical: 16, paddingHorizontal: 20,
    width: "100%", marginTop: 4,
    shadowColor: colors.cyan, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  getBtnDisabled: { backgroundColor: colors.textDim ?? "#555", shadowOpacity: 0 },
  getBtnTextWrap: { flex: 1 },
  getBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  getBtnSub: { color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: 1 },

  disabledBox: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, backgroundColor: colors.bg, borderRadius: radius.sm, marginBottom: 8 },
  disabledText: { color: colors.textMuted, fontSize: 13, flex: 1 },

  stmtHeader: { backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 20 },
  stmtTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  stmtMeta: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  stmtRef: { color: colors.cyan, fontSize: 11, fontWeight: "700", marginTop: 6 },

  section: { backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 14 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border + "55" },
  rowLabel: { color: colors.textMuted, fontSize: 13, flex: 1 },
  rowValue: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  tripRow: { paddingVertical: 10, flexDirection: "row", alignItems: "center" },
  tripBorder: { borderBottomWidth: 1, borderBottomColor: colors.border + "44" },
  tripDriver: { color: colors.text, fontWeight: "600", fontSize: 13 },
  tripDate: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
  tripAmount: { color: colors.red, fontWeight: "800", fontSize: 14 },
  emptyBox: { alignItems: "center", paddingVertical: 40, gap: 12 },
  emptyText: { color: colors.textMuted, fontSize: 14 },

  actionsWrap: { gap: 10, marginTop: 8 },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: colors.cyan, borderRadius: radius.md,
    paddingVertical: 16,
    shadowColor: colors.cyan, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  secondaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: colors.cyanDim, borderWidth: 1, borderColor: colors.cyan + "50",
    borderRadius: radius.md, paddingVertical: 14,
  },
  secondaryBtnText: { color: colors.cyan, fontWeight: "700", fontSize: 15 },
  tertiaryBtn: {
    alignItems: "center", paddingVertical: 14,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    backgroundColor: colors.bg2, marginTop: 8,
  },
  tertiaryBtnText: { color: colors.textMuted, fontWeight: "700", fontSize: 14 },
});
