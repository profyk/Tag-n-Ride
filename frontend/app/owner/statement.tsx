import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { colors, formatZAR, radius } from "../../src/theme";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value, bold, green, red }: any) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, bold && { fontWeight: "800", color: colors.text }, green && { color: colors.green }, red && { color: colors.red }]}>
        {value}
      </Text>
    </View>
  );
}

export default function OwnerStatementScreen() {
  const router = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [stmtRef, setStmtRef] = useState("");
  const [charged, setCharged] = useState(0);

  const periodStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const periodEnd = `${year}-${String(month + 1).padStart(2, "0")}-${lastDay}`;

  const request = async () => {
    Alert.alert(
      "Download Statement",
      `This will generate a fleet breakdown for ${MONTHS[month]} ${year}.\nA fee will be deducted from your wallet.`,
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
              <TouchableOpacity onPress={() => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }} style={s.arrow}>
                <Ionicons name="chevron-back" size={20} color={colors.cyan} />
              </TouchableOpacity>
              <Text style={s.monthText}>{MONTHS[month]} {year}</Text>
              <TouchableOpacity onPress={() => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }} style={s.arrow}>
                <Ionicons name="chevron-forward" size={20} color={colors.cyan} />
              </TouchableOpacity>
            </View>
            <Text style={s.periodRange}>{periodStart} → {periodEnd}</Text>
            <TouchableOpacity style={s.dlBtn} onPress={request} disabled={loading}>
              {loading
                ? <ActivityIndicator color={colors.bg} />
                : <>
                    <Ionicons name="document-text-outline" size={18} color={colors.bg} />
                    <Text style={s.dlBtnText}>Generate Statement</Text>
                  </>
              }
            </TouchableOpacity>
            <Text style={s.feeNote}>A statement fee will be deducted from your wallet</Text>
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
            <Section title="EARNINGS SUMMARY">
              <Row label="Total cashup received from drivers" value={formatZAR(d.summary.total_cashup_received)} green />
              <Row label="Total fuel deducted" value={`- ${formatZAR(d.summary.total_fuel_deducted)}`} red />
              <Row label="Total driver profit paid out" value={`- ${formatZAR(d.summary.total_driver_profit)}`} />
              <Row label="Subscription fees paid" value={`- ${formatZAR(d.summary.subscription_fees_paid)}`} red />
              <Row label="Withdrawals / payouts" value={`- ${formatZAR(d.summary.total_payouts)}`} />
              <View style={s.divider} />
              <Row label="Net earnings" value={formatZAR(d.summary.net_earnings)} bold green={d.summary.net_earnings >= 0} red={d.summary.net_earnings < 0} />
            </Section>

            {/* Fleet */}
            {d.drivers.length > 0 && (
              <Section title={`FLEET (${d.drivers.length} DRIVERS)`}>
                {d.drivers.map((dr: any, i: number) => (
                  <View key={i} style={s.driverRow}>
                    <View style={s.driverInfo}>
                      <Text style={s.driverName}>{dr.name}</Text>
                      <Text style={s.driverSub}>{dr.vehicle_plate || "No plate"} · {dr.payment_mode === "commission_split" ? `${dr.commission_pct}% comm.` : "Daily target"}</Text>
                    </View>
                    <Text style={s.driverEarnings}>{formatZAR(dr.total_earnings)}</Text>
                  </View>
                ))}
              </Section>
            )}

            {/* Cashup records */}
            {d.cashup_records.length > 0 && (
              <Section title="CASHUP RECORDS">
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
              <Section title="SUBSCRIPTION FEES">
                {d.subscription_fees.map((f: any, i: number) => (
                  <Row key={i} label={`${f.period} · ${f.taxis} taxis`} value={`- ${formatZAR(f.amount)}`} red />
                ))}
              </Section>
            )}

            {/* New statement button */}
            <TouchableOpacity style={s.newBtn} onPress={() => setData(null)}>
              <Text style={s.newBtnText}>Generate Another Statement</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
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
  periodRange: { color: colors.textMuted, fontSize: 12, marginBottom: 20 },
  dlBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.cyan, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: 28 },
  dlBtnText: { color: colors.bg, fontWeight: "800", fontSize: 16 },
  feeNote: { color: colors.textDim, fontSize: 11, marginTop: 12 },
  stmtHeader: { flexDirection: "row", alignItems: "flex-start", backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 16 },
  stmtTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  stmtMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  stmtRef: { color: colors.cyan, fontSize: 11, fontWeight: "700", marginTop: 6 },
  stmtFeeTag: { backgroundColor: colors.redDim, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 4 },
  stmtFeeText: { color: colors.red, fontSize: 12, fontWeight: "700" },
  section: { marginBottom: 20 },
  sectionTitle: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, marginBottom: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border + "55" },
  rowLabel: { color: colors.textMuted, fontSize: 13, flex: 1 },
  rowValue: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
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
