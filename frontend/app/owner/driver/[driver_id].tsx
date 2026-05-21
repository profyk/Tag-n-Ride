import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView,
  ActivityIndicator, TouchableOpacity, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../../src/api";
import { colors, formatZAR, formatDate, radius } from "../../../src/theme";

export default function OwnerDriverDetail() {
  const { driver_id } = useLocalSearchParams<{ driver_id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!driver_id) return;
    api.ownerDriverEarnings(driver_id)
      .then(setData)
      .catch((e: any) => Alert.alert("Error", e?.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, [driver_id]);

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <ActivityIndicator color={colors.cyan} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (!data) return null;

  const { driver, today_total, today_trip_count, today_trips, all_trips } = data;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.driverCard}>
          <View style={styles.driverAvatar}>
            <Ionicons name="car-sport" size={32} color={colors.cyan} />
          </View>
          <Text style={styles.driverName}>{driver.full_name}</Text>
          <Text style={styles.driverPhone}>{driver.phone_number}</Text>
          {driver.vehicle_plate ? (
            <View style={styles.plateBadge}>
              <Text style={styles.plateText}>{driver.vehicle_plate}</Text>
            </View>
          ) : null}
          <View style={styles.driverStats}>
            <View style={styles.driverStat}>
              <Text style={styles.driverStatVal}>{formatZAR(driver.total_earnings)}</Text>
              <Text style={styles.driverStatLabel}>Total Earned</Text>
            </View>
            <View style={[styles.driverStat, { borderLeftWidth: 1, borderLeftColor: colors.border }]}>
              <Text style={[styles.driverStatVal, { color: colors.green }]}>
                {formatZAR(today_total)}
              </Text>
              <Text style={styles.driverStatLabel}>Today</Text>
            </View>
            <View style={[styles.driverStat, { borderLeftWidth: 1, borderLeftColor: colors.border }]}>
              <Text style={[styles.driverStatVal, { color: "#A064FF" }]}>
                {today_trip_count}
              </Text>
              <Text style={styles.driverStatLabel}>Trips Today</Text>
            </View>
          </View>
        </View>

        {today_trips.length > 0 && (
          <>
            <Text style={styles.section}>TODAY'S TRIPS</Text>
            {today_trips.map((t: any, i: number) => (
              <View key={i} style={styles.tripRow}>
                <View style={styles.tripIcon}>
                  <Ionicons name="checkmark" size={14} color={colors.green} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tripPassenger}>{t.passenger}</Text>
                  <Text style={styles.tripTime}>{formatDate(t.created_at)}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.tripNet}>{formatZAR(t.driver_net)}</Text>
                  <Text style={styles.tripGross}>Gross: {formatZAR(t.amount)}</Text>
                </View>
              </View>
            ))}
            <View style={styles.dayTotal}>
              <Text style={styles.dayTotalLabel}>TODAY'S TOTAL</Text>
              <Text style={styles.dayTotalVal}>{formatZAR(today_total)}</Text>
            </View>
          </>
        )}

        <Text style={[styles.section, { marginTop: 24 }]}>ALL TRIPS</Text>
        {all_trips.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No trips yet</Text>
          </View>
        ) : (
          all_trips.map((t: any, i: number) => (
            <View key={i} style={styles.tripRow}>
              <View style={[styles.tripIcon, { backgroundColor: colors.cyanDim }]}>
                <Ionicons name="arrow-down" size={14} color={colors.cyan} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.tripPassenger}>{t.passenger}</Text>
                <Text style={styles.tripRef}>{t.reference}</Text>
                <Text style={styles.tripTime}>{formatDate(t.created_at)}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.tripNet}>{formatZAR(t.driver_net)}</Text>
                <Text style={styles.tripGross}>Gross: {formatZAR(t.amount)}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: "#FFD60A", borderRadius: 6,
    paddingHorizontal: 12, paddingVertical: 4,
    marginTop: 10, borderWidth: 2, borderColor: "#111",
  },
  plateText: { color: "#111", fontWeight: "900", fontSize: 14, fontFamily: "monospace" },
  driverStats: { flexDirection: "row", marginTop: 20, width: "100%" },
  driverStat: { flex: 1, alignItems: "center" },
  driverStatVal: { color: colors.cyan, fontSize: 18, fontWeight: "800" },
  driverStatLabel: {
    color: colors.textMuted, fontSize: 10, marginTop: 4,
    textTransform: "uppercase", letterSpacing: 1,
  },
  section: {
    color: colors.textMuted, fontSize: 11, fontWeight: "700",
    letterSpacing: 1.4, marginBottom: 10,
  },
  tripRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: colors.bg2, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 8,
  },
  tripIcon: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.greenDim,
    alignItems: "center", justifyContent: "center",
  },
  tripPassenger: { color: colors.text, fontWeight: "700", fontSize: 14 },
  tripRef: { color: colors.textDim, fontSize: 10, fontFamily: "monospace", marginTop: 1 },
  tripTime: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  tripNet: { color: colors.green, fontWeight: "800", fontSize: 15 },
  tripGross: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  dayTotal: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: colors.greenDim, borderRadius: radius.md, padding: 14,
    borderWidth: 1, borderColor: colors.green, marginTop: 4,
  },
  dayTotalLabel: { color: colors.green, fontWeight: "800", fontSize: 12, letterSpacing: 1 },
  dayTotalVal: { color: colors.green, fontWeight: "800", fontSize: 20 },
  empty: { alignItems: "center", padding: 24 },
  emptyText: { color: colors.textMuted, fontWeight: "700" },
});
