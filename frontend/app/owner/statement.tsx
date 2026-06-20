import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { formatZAR, radius } from "../../src/theme";
import { useTheme } from "../../src/ThemeContext";

export function buildOwnerStatementPDF(d: any, reference: string): string {
  const genDate = new Date().toLocaleDateString("en-ZA");
  const driversHtml = (d.drivers ?? []).length > 0
    ? `<div class="section"><div class="section-title">Fleet (${d.drivers.length} Drivers)</div>
      ${d.drivers.map((dr: any) =>
        `<div class="row"><span class="label">${dr.name} · ${dr.vehicle_plate || "No plate"}</span><span class="value green">R ${Number(dr.total_earnings).toFixed(2)}</span></div>`
      ).join("")}</div>` : "";
  const cashupHtml = (d.cashup_records ?? []).length > 0
    ? `<div class="section"><div class="section-title">Cashup Records</div>
      ${d.cashup_records.map((r: any) =>
        `<div class="row"><span class="label">${r.driver} · ${(r.date || "").slice(0, 10)}</span><span class="value green">R ${Number(r.owner_received).toFixed(2)}</span></div>`
      ).join("")}</div>` : "";
  const sm = d.summary ?? {};
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>* { margin:0;padding:0;box-sizing:border-box; } body { font-family:Arial,sans-serif;font-size:12px;color:#222;padding:32px; }
.header { text-align:center;padding-bottom:20px;border-bottom:3px solid #00D4FF;margin-bottom:24px; }
.brand { font-size:28px;font-weight:900;color:#00D4FF;letter-spacing:2px; }
.doc-title { font-size:14px;font-weight:700;color:#444;margin-top:6px; }
.doc-meta { color:#888;font-size:11px;margin-top:4px; }
.section { background:#f5f5f5;border-radius:10px;padding:16px;margin-bottom:18px; }
.section-title { font-size:11px;font-weight:800;letter-spacing:1.2px;color:#888;text-transform:uppercase;margin-bottom:10px; }
.row { display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e5e5e5; }
.row:last-child { border-bottom:none; } .label { color:#555; } .value { font-weight:700; }
.green { color:#22c55e; } .red { color:#e53e3e; }
.footer { text-align:center;color:#aaa;font-size:10px;border-top:1px solid #e5e5e5;padding-top:16px;margin-top:8px; }
</style></head><body>
<div class="header"><div class="brand">TAG N RIDE</div>
<div class="doc-title">FLEET EARNINGS STATEMENT</div>
<div class="doc-meta">${d.business_name || d.owner_name || "Owner"}</div>
<div class="doc-meta">${d.period_start ?? ""} to ${d.period_end ?? ""} · Generated ${genDate}</div>
${reference ? `<div class="doc-meta">Ref: ${reference}</div>` : ""}
</div>
<div class="section"><div class="section-title">Earnings Summary</div>
<div class="row"><span class="label">Cashup received from drivers</span><span class="value green">R ${Number(sm.total_cashup_received ?? 0).toFixed(2)}</span></div>
<div class="row"><span class="label">Subscription fees</span><span class="value red">- R ${Number(sm.subscription_fees_paid ?? 0).toFixed(2)}</span></div>
<div class="row"><span class="label">Withdrawals / payouts</span><span class="value red">- R ${Number(sm.total_payouts ?? 0).toFixed(2)}</span></div>
<div class="row"><span class="label" style="font-weight:700">Net earnings</span><span class="value ${(sm.net_earnings ?? 0) >= 0 ? "green" : "red"}">R ${Number(sm.net_earnings ?? 0).toFixed(2)}</span></div>
</div>
<div class="section"><div class="section-title">Fuel &amp; Driver Profit (Info Only)</div>
<div class="row"><span class="label">Fuel deducted by drivers before cashup</span><span class="value">R ${Number(sm.total_fuel_deducted ?? 0).toFixed(2)}</span></div>
<div class="row"><span class="label">Driver profit kept before cashup</span><span class="value">R ${Number(sm.total_driver_profit ?? 0).toFixed(2)}</span></div>
<div class="doc-meta" style="text-align:left;margin-top:8px">Cashup received above is already net of these — they don't subtract again from your net earnings.</div>
</div>
${driversHtml}${cashupHtml}
<div class="footer">Tag n Ride · Verified fleet statement · ${reference}</div>
</body></html>`;
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function formatR(val: number) {
  return `R ${val.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function Section({ title, children, colors }: { title: string; children: React.ReactNode; colors: any }) {
  const s = sectionStyles(colors);
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value, bold, green, red, colors }: any) {
  const s = sectionStyles(colors);
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, bold && { fontWeight: "800", color: colors.text }, green && { color: colors.green }, red && { color: colors.red }]}>
        {value}
      </Text>
    </View>
  );
}

const sectionStyles = (colors: any) => StyleSheet.create({
  section: { marginBottom: 20 },
  sectionTitle: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, marginBottom: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border + "55" },
  rowLabel: { color: colors.textMuted, fontSize: 13, flex: 1 },
  rowValue: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
});

export default function OwnerStatementScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const now = new Date();
  const [year, setYear]       = useState(now.getFullYear());
  const [month, setMonth]     = useState(now.getMonth());
  const [loading, setLoading] = useState(false);
  const [data, setData]       = useState<any>(null);
  const [stmtRef, setStmtRef] = useState("");
  const [charged, setCharged] = useState(0);

  // Pricing + wallet state
  const [pricing, setPricing]             = useState<{ enabled: boolean; price: number } | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [loadingPricing, setLoadingPricing] = useState(true);

  const loadPricing = useCallback(async () => {
    setLoadingPricing(true);
    try {
      const [p, w] = await Promise.all([
        api.ownerStatementPricing().catch(() => null),
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

  const request = async () => {
    // Re-fetch fresh pricing + wallet at request time
    let freshPricing = pricing;
    let freshBalance = walletBalance;
    try {
      const [p, w] = await Promise.all([
        api.ownerStatementPricing().catch(() => null),
        api.wallet().catch(() => null),
      ]);
      if (p) { freshPricing = p; setPricing(p); }
      if (w) { freshBalance = w.balance; setWalletBalance(w.balance); }
    } catch {}

    if (freshPricing && !freshPricing.enabled) {
      Alert.alert("Unavailable", "Fleet statements are currently disabled. Please try again later.");
      return;
    }

    const fee = freshPricing?.price ?? 0;
    if (fee > 0 && freshBalance < fee) {
      Alert.alert(
        "Insufficient Balance",
        `You need ${formatR(fee)} to generate this statement.\n\nYour balance: ${formatR(freshBalance)}\n\nPlease top up your wallet first.`
      );
      return;
    }

    const feeLabel = fee > 0
      ? `${formatR(fee)} will be deducted from your wallet.`
      : "This statement is free.";

    Alert.alert(
      "Download Fleet Statement",
      `Generate a full fleet breakdown for ${MONTHS[month]} ${year}.\n\n${feeLabel}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm & Download",
          onPress: async () => {
            setLoading(true);
            try {
              const res = await api.requestOwnerStatement(periodStart, periodEnd);
              setData(res.data);
              setStmtRef(res.reference);
              setCharged(res.amount_charged);
            } catch (e: any) {
              Alert.alert("Failed", e?.message || "Could not generate statement.");
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const d = data;
  const s = makeStyles(colors);

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
          <Text style={s.backText}>Back</Text>
        </TouchableOpacity>

        <Text style={s.pageTitle}>Fleet Statement</Text>
        <Text style={s.pageSub}>Detailed breakdown of your fleet earnings, cashups, and fees</Text>

        {!d && (
          <View style={s.periodCard}>
            <Text style={s.periodLabel}>SELECT PERIOD</Text>
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

            {/* Pricing info */}
            {loadingPricing ? (
              <ActivityIndicator color={colors.cyan} style={{ marginBottom: 16 }} />
            ) : pricing && !pricing.enabled ? (
              <View style={s.disabledBox}>
                <Ionicons name="close-circle-outline" size={18} color={colors.textMuted} />
                <Text style={s.disabledText}>Fleet statements are currently unavailable.</Text>
              </View>
            ) : (
              <>
                <View style={s.feeBox}>
                  <View style={s.feeRow}>
                    <Text style={s.feeLabel}>Statement Fee</Text>
                    <Text style={[s.feeValue, { color: colors.cyan }]}>
                      {pricing ? formatR(pricing.price) : "—"}
                    </Text>
                  </View>
                  <View style={s.feeRow}>
                    <Text style={s.feeLabel}>Your Balance</Text>
                    <Text style={[s.feeValue, {
                      color: pricing && walletBalance >= pricing.price ? colors.green : colors.red,
                    }]}>
                      {formatR(walletBalance)}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity style={s.dlBtn} onPress={request} disabled={loading}>
                  {loading
                    ? <ActivityIndicator color={colors.bg} />
                    : <>
                        <Ionicons name="document-text-outline" size={18} color={colors.bg} />
                        <Text style={s.dlBtnText}>
                          Generate Statement{pricing && pricing.price > 0 ? ` — ${formatR(pricing.price)}` : ""}
                        </Text>
                      </>
                  }
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {d && (
          <>
            {/* Header */}
            <View style={s.stmtHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.stmtTitle}>Fleet Statement</Text>
                <Text style={s.stmtMeta}>{d.business_name || d.owner_name}</Text>
                <Text style={s.stmtMeta}>{d.period_start} to {d.period_end}</Text>
                <Text style={s.stmtRef}>Ref: {stmtRef}</Text>
              </View>
              <View style={s.stmtFeeTag}>
                <Text style={s.stmtFeeText}>Fee: {formatZAR(charged)}</Text>
              </View>
            </View>

            {/* Summary */}
            <Section title="EARNINGS SUMMARY" colors={colors}>
              <Row label="Total cashup received from drivers" value={formatZAR(d.summary.total_cashup_received)} green colors={colors} />
              <Row label="Subscription fees paid" value={`- ${formatZAR(d.summary.subscription_fees_paid)}`} red colors={colors} />
              <Row label="Withdrawals / payouts" value={`- ${formatZAR(d.summary.total_payouts)}`} colors={colors} />
              <View style={s.divider} />
              <Row label="Net earnings" value={formatZAR(d.summary.net_earnings)} bold green={d.summary.net_earnings >= 0} red={d.summary.net_earnings < 0} colors={colors} />
            </Section>

            <Section title="FUEL & DRIVER PROFIT (INFO ONLY)" colors={colors}>
              <Row label="Fuel deducted by drivers before cashup" value={formatZAR(d.summary.total_fuel_deducted)} colors={colors} />
              <Row label="Driver profit kept before cashup" value={formatZAR(d.summary.total_driver_profit)} colors={colors} />
              <Text style={{ color: colors.textDim, fontSize: 11, marginTop: 8, lineHeight: 15 }}>
                Cashup received above is already net of these — they don't subtract again from your net earnings.
              </Text>
            </Section>

            {/* Fleet */}
            {d.drivers.length > 0 && (
              <Section title={`FLEET (${d.drivers.length} DRIVERS)`} colors={colors}>
                {d.drivers.map((dr: any, i: number) => (
                  <View key={i} style={s.driverRow}>
                    <View style={s.driverInfo}>
                      <Text style={s.driverName}>{dr.name}</Text>
                      <Text style={s.driverSub}>
                        {dr.vehicle_plate || "No plate"} · {dr.payment_mode === "commission_split" ? `${dr.commission_pct}% comm.` : "Daily target"}
                      </Text>
                    </View>
                    <Text style={s.driverEarnings}>{formatZAR(dr.total_earnings)}</Text>
                  </View>
                ))}
              </Section>
            )}

            {/* Cashup records */}
            {d.cashup_records.length > 0 && (
              <Section title="CASHUP RECORDS" colors={colors}>
                {d.cashup_records.map((r: any, i: number) => (
                  <View key={i} style={[s.cashupRow, i < d.cashup_records.length - 1 && s.cashupBorder]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.cashupDriver}>{r.driver}</Text>
                      <Text style={s.cashupDate}>{r.date?.slice(0, 10)}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={s.cashupAmount}>{formatZAR(r.owner_received)}</Text>
                      <Text style={s.cashupSub}>earned {formatZAR(r.earned)} · fuel -{formatZAR(r.fuel_deducted)}</Text>
                    </View>
                  </View>
                ))}
              </Section>
            )}

            {/* Subscription fees */}
            {d.subscription_fees.length > 0 && (
              <Section title="SUBSCRIPTION FEES" colors={colors}>
                {d.subscription_fees.map((f: any, i: number) => (
                  <Row key={i} label={`${f.period} · ${f.taxis} taxis`} value={`- ${formatZAR(f.amount)}`} red colors={colors} />
                ))}
              </Section>
            )}

            <TouchableOpacity style={s.newBtn} onPress={() => { setData(null); loadPricing(); }}>
              <Text style={s.newBtnText}>Generate Another Statement</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  back: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 16 },
  backText: { color: colors.text, fontSize: 16 },
  pageTitle: { color: colors.text, fontSize: 26, fontWeight: "800" },
  pageSub: { color: colors.textMuted, fontSize: 13, marginTop: 4, marginBottom: 24 },
  periodCard: { backgroundColor: colors.bg2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 20, alignItems: "center" },
  periodLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, marginBottom: 16 },
  monthRow: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 8 },
  arrow: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.cyanDim, alignItems: "center", justifyContent: "center" },
  monthText: { color: colors.text, fontSize: 20, fontWeight: "800", minWidth: 180, textAlign: "center" },
  periodRange: { color: colors.textMuted, fontSize: 12, marginBottom: 16 },
  feeBox: { width: "100%", backgroundColor: colors.bg, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 16 },
  feeRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  feeLabel: { color: colors.textMuted, fontSize: 13 },
  feeValue: { fontSize: 13, fontWeight: "800" },
  dlBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.cyan, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: 28 },
  dlBtnText: { color: colors.bg, fontWeight: "800", fontSize: 16 },
  disabledBox: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, backgroundColor: colors.bg, borderRadius: radius.sm, marginBottom: 8 },
  disabledText: { color: colors.textMuted, fontSize: 13, flex: 1 },
  stmtHeader: { flexDirection: "row", alignItems: "flex-start", backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 16 },
  stmtTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  stmtMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  stmtRef: { color: colors.cyan, fontSize: 11, fontWeight: "700", marginTop: 6 },
  stmtFeeTag: { backgroundColor: colors.redDim ?? colors.red + "20", borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 4 },
  stmtFeeText: { color: colors.red, fontSize: 12, fontWeight: "700" },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  driverRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border + "44" },
  driverInfo: { flex: 1 },
  driverName: { color: colors.text, fontWeight: "700", fontSize: 14 },
  driverSub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  driverEarnings: { color: colors.green, fontWeight: "800", fontSize: 14 },
  cashupRow: { paddingVertical: 10, flexDirection: "row", alignItems: "center" },
  cashupBorder: { borderBottomWidth: 1, borderBottomColor: colors.border + "44" },
  cashupDriver: { color: colors.text, fontWeight: "700", fontSize: 13 },
  cashupDate: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
  cashupAmount: { color: colors.cyan, fontWeight: "800", fontSize: 14 },
  cashupSub: { color: colors.textDim, fontSize: 10, marginTop: 1 },
  newBtn: { marginTop: 24, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 14, alignItems: "center" },
  newBtnText: { color: colors.textMuted, fontWeight: "700", fontSize: 14 },
});
