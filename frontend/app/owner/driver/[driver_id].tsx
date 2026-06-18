import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView,
  ActivityIndicator, TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../../src/api";
import { formatZAR, formatDate, radius, useColors } from "../../../src/theme";
import { useTheme } from "../../../src/ThemeContext";

function MiniBar({ progress, color }: { progress: number; color: string }) {
  const pct = Math.min(100, Math.max(0, progress * 100));
  return (
    <View style={{ height: 5, borderRadius: 3, backgroundColor: color + "22", marginTop: 6, overflow: "hidden" }}>
      <View style={{ height: 5, width: `${pct}%` as any, borderRadius: 3, backgroundColor: color }} />
    </View>
  );
}

export default function OwnerDriverDetail() {
  const { driver_id } = useLocalSearchParams<{ driver_id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!driver_id) return;
    setLoading(true);
    setError(null);
    api.ownerDriverEarnings(driver_id)
      .then(setData)
      .catch((e: any) => setError(e?.message || "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(load, [driver_id]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
        <ActivityIndicator color={colors.cyan} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }
  if (error || !data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
        <TouchableOpacity onPress={() => router.back()} style={{
          width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bg2,
          borderWidth: 1, borderColor: colors.border,
          alignItems: "center", justifyContent: "center", margin: 20,
        }}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={{ alignItems: "center", padding: 32, gap: 8 }}>
          <Ionicons name="alert-circle-outline" size={36} color={colors.textDim} />
          <Text style={{ color: colors.textMuted, fontWeight: "700", fontSize: 14, textAlign: "center" }}>
            {error || "Failed to load"}
          </Text>
          <TouchableOpacity onPress={load} style={{ marginTop: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.cyanDim, borderWidth: 1, borderColor: colors.cyan + "55" }}>
            <Text style={{ color: colors.cyan, fontWeight: "700" }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const {
    driver, today_total, today_trip_count, avg_per_trip_today,
    avg_per_trip_all, all_trip_count, owner_total_received,
    last_cashup, today_trips, all_trips,
  } = data;

  const isCommission = driver.payment_mode === "commission_split";
  const targetProgress = driver.daily_target > 0 ? today_total / driver.daily_target : 0;
  const s = makeStyles(colors);

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>

        {/* Driver card */}
        <View style={s.driverCard}>
          <View style={s.driverAvatar}>
            <Ionicons name="car-sport" size={32} color={colors.cyan} />
          </View>
          <Text style={s.driverName}>{driver.full_name}</Text>
          <Text style={s.driverPhone}>{driver.phone_number}</Text>
          {driver.vehicle_plate ? (
            <View style={s.plateBadge}>
              <Text style={s.plateText}>{driver.vehicle_plate}</Text>
            </View>
          ) : null}
          <View style={s.modePill}>
            <Ionicons name={isCommission ? "pie-chart-outline" : "flag-outline"} size={11} color={colors.cyan} />
            <Text style={s.modePillText}>
              {isCommission ? `${driver.commission_pct}% Commission Split` : `Daily Target R${driver.daily_target.toFixed(0)}`}
            </Text>
          </View>
          {driver.rating_count > 0 && (
            <View style={s.ratingRow}>
              <Ionicons name="star" size={13} color="#FFD60A" />
              <Text style={s.ratingText}>{driver.rating_avg.toFixed(1)} ({driver.rating_count} ratings)</Text>
            </View>
          )}
        </View>

        {/* Today's revenue stats */}
        <Text style={s.section}>TODAY'S PERFORMANCE</Text>
        <View style={s.statsGrid}>
          <View style={[s.statBox, { borderColor: colors.green + "40" }]}>
            <Ionicons name="trending-up-outline" size={16} color={colors.green} />
            <Text style={[s.statVal, { color: colors.green }]}>{formatZAR(today_total)}</Text>
            <Text style={s.statLabel}>Revenue Today</Text>
          </View>
          <View style={[s.statBox, { borderColor: "#A064FF40" }]}>
            <Ionicons name="repeat-outline" size={16} color="#A064FF" />
            <Text style={[s.statVal, { color: "#A064FF" }]}>{today_trip_count}</Text>
            <Text style={s.statLabel}>Trips Today</Text>
          </View>
          <View style={[s.statBox, { borderColor: colors.cyan + "40" }]}>
            <Ionicons name="receipt-outline" size={16} color={colors.cyan} />
            <Text style={[s.statVal, { color: colors.cyan }]}>{formatZAR(avg_per_trip_today)}</Text>
            <Text style={s.statLabel}>Avg / Trip</Text>
          </View>
        </View>

        {/* Daily target progress (non-commission) */}
        {!isCommission && driver.daily_target > 0 && (
          <View style={s.targetCard}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={s.targetLabel}>DAILY TARGET PROGRESS</Text>
              <Text style={[s.targetPct, { color: targetProgress >= 1 ? colors.green : colors.cyan }]}>
                {Math.round(targetProgress * 100)}%
              </Text>
            </View>
            <MiniBar progress={targetProgress} color={targetProgress >= 1 ? colors.green : colors.cyan} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
              <Text style={s.targetSub}>{formatZAR(today_total)} collected</Text>
              <Text style={s.targetSub}>Target: {formatZAR(driver.daily_target)}</Text>
            </View>
          </View>
        )}

        {/* All-time summary */}
        <Text style={s.section}>ALL-TIME SUMMARY</Text>
        <View style={s.summaryCard}>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Total trips completed</Text>
            <Text style={s.summaryVal}>{all_trip_count}</Text>
          </View>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Avg. fare per trip</Text>
            <Text style={s.summaryVal}>{formatZAR(avg_per_trip_all)}</Text>
          </View>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Total driver earnings</Text>
            <Text style={[s.summaryVal, { color: colors.cyan }]}>{formatZAR(driver.total_earnings)}</Text>
          </View>
          <View style={[s.summaryRow, { borderBottomWidth: 0 }]}>
            <Text style={s.summaryLabel}>Your total cashup received</Text>
            <Text style={[s.summaryVal, { color: colors.green, fontWeight: "800" }]}>{formatZAR(owner_total_received)}</Text>
          </View>
        </View>

        {/* Last cashup */}
        {last_cashup && (
          <>
            <Text style={s.section}>LAST CASHUP</Text>
            <View style={s.cashupCard}>
              <View style={[s.cashupIconWrap, { backgroundColor: colors.greenDim }]}>
                <Ionicons name="cash-outline" size={20} color={colors.green} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.cashupDate}>{formatDate(last_cashup.date)}</Text>
                <View style={{ flexDirection: "row", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
                  <View>
                    <Text style={s.cashupMiniLabel}>You Received</Text>
                    <Text style={[s.cashupMiniVal, { color: colors.green }]}>{formatZAR(last_cashup.owner_received)}</Text>
                  </View>
                  <View>
                    <Text style={s.cashupMiniLabel}>Fuel</Text>
                    <Text style={[s.cashupMiniVal, { color: colors.red }]}>−{formatZAR(last_cashup.fuel_deducted)}</Text>
                  </View>
                  <View>
                    <Text style={s.cashupMiniLabel}>Driver Profit</Text>
                    <Text style={[s.cashupMiniVal, { color: "#A064FF" }]}>{formatZAR(last_cashup.driver_profit)}</Text>
                  </View>
                </View>
              </View>
            </View>
          </>
        )}

        {/* Today's trips */}
        {today_trips.length > 0 && (
          <>
            <Text style={s.section}>TODAY'S TRIPS</Text>
            {today_trips.map((t: any, i: number) => (
              <View key={i} style={s.tripRow}>
                <View style={s.tripIcon}>
                  <Ionicons name="checkmark" size={14} color={colors.green} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.tripPassenger}>{t.passenger}</Text>
                  <Text style={s.tripTime}>{formatDate(t.created_at)}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={s.tripFare}>{formatZAR(t.amount)}</Text>
                  <Text style={s.tripNet}>net {formatZAR(t.driver_net)}</Text>
                </View>
              </View>
            ))}
            <View style={s.dayTotalRow}>
              <Text style={s.dayTotalLabel}>TODAY'S TOTAL · {today_trip_count} TRIPS</Text>
              <Text style={s.dayTotalVal}>{formatZAR(today_total)}</Text>
            </View>
          </>
        )}

        {/* All trips */}
        <Text style={[s.section, { marginTop: 24 }]}>RECENT TRIPS ({all_trip_count})</Text>
        {all_trips.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="car-outline" size={36} color={colors.textDim} />
            <Text style={s.emptyText}>No trips yet</Text>
          </View>
        ) : (
          all_trips.map((t: any, i: number) => (
            <View key={i} style={[s.tripRow, { backgroundColor: colors.bg }]}>
              <View style={[s.tripIcon, { backgroundColor: colors.cyanDim }]}>
                <Ionicons name="arrow-down" size={14} color={colors.cyan} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.tripPassenger}>{t.passenger}</Text>
                <Text style={s.tripRef}>{t.reference}</Text>
                <Text style={s.tripTime}>{formatDate(t.created_at)}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={s.tripFare}>{formatZAR(t.amount)}</Text>
                <Text style={s.tripNet}>net {formatZAR(t.driver_net)}</Text>
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
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bg2,
    borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center", marginBottom: 20,
  },
  driverCard: {
    backgroundColor: colors.bg2, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, padding: 24, alignItems: "center", marginBottom: 24,
  },
  driverAvatar: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: colors.cyanDim,
    borderWidth: 1, borderColor: colors.cyan,
    alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  driverName: { color: colors.text, fontSize: 22, fontWeight: "800" },
  driverPhone: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
  plateBadge: {
    backgroundColor: "#FFD60A", borderRadius: 6, paddingHorizontal: 12, paddingVertical: 4,
    marginTop: 10, borderWidth: 2, borderColor: "#111",
  },
  plateText: { color: "#111", fontWeight: "900", fontSize: 14, fontFamily: "monospace" },
  modePill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: colors.cyanDim, borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 4, marginTop: 10,
    borderWidth: 1, borderColor: colors.cyan + "40",
  },
  modePillText: { color: colors.cyan, fontSize: 11, fontWeight: "700" },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  ratingText: { color: colors.textMuted, fontSize: 12 },
  section: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, marginBottom: 10 },
  statsGrid: { flexDirection: "row", gap: 8, marginBottom: 16 },
  statBox: {
    flex: 1, backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1,
    padding: 12, alignItems: "center", gap: 4,
  },
  statVal: { color: colors.text, fontSize: 16, fontWeight: "900", marginTop: 4 },
  statLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "700", textAlign: "center" },
  targetCard: {
    backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1,
    borderColor: colors.border, padding: 14, marginBottom: 16,
  },
  targetLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 1.2 },
  targetPct: { fontSize: 14, fontWeight: "900" },
  targetSub: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  summaryCard: {
    backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1,
    borderColor: colors.border, padding: 14, marginBottom: 16,
  },
  summaryRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border + "55",
  },
  summaryLabel: { color: colors.textMuted, fontSize: 13 },
  summaryVal: { color: colors.text, fontSize: 13, fontWeight: "700" },
  cashupCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1,
    borderColor: colors.green + "30", padding: 14, marginBottom: 16,
  },
  cashupIconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  cashupDate: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  cashupMiniLabel: { color: colors.textDim, fontSize: 10, fontWeight: "700", marginBottom: 2 },
  cashupMiniVal: { fontSize: 14, fontWeight: "800" },
  tripRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: colors.bg2, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 8,
  },
  tripIcon: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.greenDim,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  tripPassenger: { color: colors.text, fontWeight: "700", fontSize: 14 },
  tripRef: { color: colors.textDim, fontSize: 10, fontFamily: "monospace", marginTop: 1 },
  tripTime: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  tripFare: { color: colors.text, fontWeight: "800", fontSize: 15 },
  tripNet: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  dayTotalRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: colors.greenDim, borderRadius: radius.md, padding: 14,
    borderWidth: 1, borderColor: colors.green, marginTop: 4,
  },
  dayTotalLabel: { color: colors.green, fontWeight: "800", fontSize: 11, letterSpacing: 1 },
  dayTotalVal: { color: colors.green, fontWeight: "900", fontSize: 20 },
  empty: { alignItems: "center", padding: 32, gap: 8 },
  emptyText: { color: colors.textMuted, fontWeight: "700", fontSize: 14 },
});
