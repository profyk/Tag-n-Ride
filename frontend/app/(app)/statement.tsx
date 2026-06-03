import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { formatZAR, radius } from "../../src/theme";
import { useTheme } from "../../src/ThemeContext";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

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

export default function PassengerStatementScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() === 0 ? 11 : now.getMonth() - 1);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [stmtRef, setStmtRef] = useState("");
  const [charged, setCharged] = useState(0);

  const periodStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const periodEnd = `${year}-${String(month + 1).padStart(2, "0")}-${lastDay}`;

  const request = async () => {
    Alert.alert(
      "Monthly Expense Statement",
      `Generate your ride spending breakdown for ${MONTHS[month]} ${year}.\nA small fee will be deducted from your wallet.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Get Statement",
          onPress: async () => {
            setLoading(true);
            try {
              const res = await api.requestPassengerStatement(periodStart, periodEnd);
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

  const s = makeStyles(colors);
  const d = data;

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
          <Text style={s.backText}>Back</Text>
        </TouchableOpacity>

        <Text style={s.pageTitle}>Expense Statement</Text>
        <Text style={s.pageSub}>Monthly breakdown of your ride spending and wallet activity</Text>

        {!d && (
          <View style={s.periodCard}>
            <Text style={s.periodLabel}>SELECT MONTH</Text>
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

            <TouchableOpacity style={s.dlBtn} onPress={request} disabled={loading}>
              {loading
                ? <ActivityIndicator color={colors.bg} />
                : <>
                    <Ionicons name="document-text-outline" size={18} color={colors.bg} />
                    <Text style={s.dlBtnText}>Get Statement</Text>
                  </>
              }
            </TouchableOpacity>
            <Text style={s.feeNote}>A small fee is deducted from your wallet on generation</Text>
          </View>
        )}

        {d && (
          <>
            {/* Header */}
            <View style={s.stmtHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.stmtTitle}>Expense Statement</Text>
                <Text style={s.stmtMeta}>{d.passenger_name}</Text>
                <Text style={s.stmtMeta}>{d.period_start} to {d.period_end}</Text>
                <Text style={s.stmtRef}>Ref: {stmtRef}</Text>
              </View>
              <View style={s.feeTag}>
                <Text style={s.feeTagText}>Fee: {formatZAR(charged)}</Text>
              </View>
            </View>

            {/* Summary */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>SUMMARY</Text>
              <Row label="Total rides" value={String(d.summary.total_trips)} colors={colors} s={s} />
              <Row label="Total spent on rides" value={formatZAR(d.summary.total_spent)} bold colors={colors} s={s} />
              <Row label="Total wallet top-ups" value={formatZAR(d.summary.total_topups)} green colors={colors} s={s} />
              <Row label="Average trip cost" value={formatZAR(d.summary.average_trip)} colors={colors} s={s} />
            </View>

            {/* Trips */}
            {d.trips.length > 0 && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>TRIPS ({d.trips.length})</Text>
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
                <Text style={s.sectionTitle}>TOP-UPS ({d.topups.length})</Text>
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

            <TouchableOpacity style={s.newBtn} onPress={() => setData(null)}>
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
  periodRange: { color: colors.textMuted, fontSize: 12, marginBottom: 20 },
  dlBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.cyan, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: 28 },
  dlBtnText: { color: colors.bg, fontWeight: "800", fontSize: 16 },
  feeNote: { color: colors.textDim, fontSize: 11, marginTop: 12 },
  stmtHeader: { flexDirection: "row", alignItems: "flex-start", backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 20 },
  stmtTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  stmtMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  stmtRef: { color: colors.cyan, fontSize: 11, fontWeight: "700", marginTop: 6 },
  feeTag: { backgroundColor: colors.redDim, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 4 },
  feeTagText: { color: colors.red, fontSize: 12, fontWeight: "700" },
  section: { marginBottom: 20 },
  sectionTitle: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, marginBottom: 10 },
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
  newBtn: { marginTop: 24, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 14, alignItems: "center" },
  newBtnText: { color: colors.textMuted, fontWeight: "700", fontSize: 14 },
});
