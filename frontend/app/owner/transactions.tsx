import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { colors, formatZAR, formatDate, radius } from "../../src/theme";

type FleetTxn = {
  id: string;
  reference: string;
  driver_name: string;
  vehicle_plate: string;
  passenger: string;
  gross_amount: number;
  driver_net: number;
  platform_fee: number;
  created_at: string;
};

export default function OwnerTransactions() {
  const [txns, setTxns] = useState<FleetTxn[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "today">("all");

  const load = useCallback(async () => {
    try {
      const res = await api.ownerTransactions();
      setTxns(res);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to load transactions");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const today = new Date().toDateString();
  const filtered = filter === "today"
    ? txns.filter((t) => new Date(t.created_at).toDateString() === today)
    : txns;

  const totalNet = filtered.reduce((s, t) => s + t.driver_net, 0);
  const totalGross = filtered.reduce((s, t) => s + t.gross_amount, 0);
  const totalFees = filtered.reduce((s, t) => s + t.platform_fee, 0);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={colors.cyan}
          />
        }>
        <Text style={styles.title}>Fleet Earnings</Text>

        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterBtn, filter === "all" && styles.filterBtnActive]}
            onPress={() => setFilter("all")}>
            <Text style={[styles.filterText, filter === "all" && styles.filterTextActive]}>
              All Time
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterBtn, filter === "today" && styles.filterBtnActive]}
            onPress={() => setFilter("today")}>
            <Text style={[styles.filterText, filter === "today" && styles.filterTextActive]}>
              Today
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>GROSS</Text>
            <Text style={styles.summaryVal}>{formatZAR(totalGross)}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>NET</Text>
            <Text style={[styles.summaryVal, { color: colors.green }]}>{formatZAR(totalNet)}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>FEES 3%</Text>
            <Text style={[styles.summaryVal, { color: colors.textMuted }]}>{formatZAR(totalFees)}</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.cyan} style={{ marginTop: 40 }} />
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={40} color={colors.textDim} />
            <Text style={styles.emptyText}>No transactions yet</Text>
          </View>
        ) : (
          filtered.map((t) => (
            <View key={t.id} style={styles.txnCard}>
              <View style={styles.txnHeader}>
                <View style={styles.txnIcon}>
                  <Ionicons name="car-sport" size={16} color={colors.cyan} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.driverName}>{t.driver_name}</Text>
                  <Text style={styles.txnMeta}>
                    {t.vehicle_plate} · {t.passenger}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.netAmount}>{formatZAR(t.driver_net)}</Text>
                  <Text style={styles.grossAmount}>Gross: {formatZAR(t.gross_amount)}</Text>
                </View>
              </View>
              <View style={styles.txnFooter}>
                <Text style={styles.txnRef}>{t.reference}</Text>
                <Text style={styles.txnDate}>{formatDate(t.created_at)}</Text>
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
  title: { color: colors.text, fontSize: 24, fontWeight: "800", marginBottom: 16 },
  filterRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  filterBtn: {
    paddingHorizontal: 20, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg2,
  },
  filterBtnActive: { backgroundColor: colors.cyanDim, borderColor: colors.cyan },
  filterText: { color: colors.textMuted, fontWeight: "700", fontSize: 13 },
  filterTextActive: { color: colors.cyan },
  summaryCard: {
    backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1,
    borderColor: colors.border, padding: 16, flexDirection: "row", marginBottom: 20,
  },
  summaryItem: { flex: 1, alignItems: "center" },
  summaryLabel: {
    color: colors.textMuted, fontSize: 9, fontWeight: "800",
    letterSpacing: 1, textTransform: "uppercase",
  },
  summaryVal: { color: colors.cyan, fontSize: 16, fontWeight: "800", marginTop: 4 },
  summaryDivider: { width: 1, backgroundColor: colors.border },
  txnCard: {
    backgroundColor: colors.bg2, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10,
  },
  txnHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  txnIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.cyanDim, alignItems: "center", justifyContent: "center",
  },
  driverName: { color: colors.text, fontWeight: "700", fontSize: 14 },
  txnMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  netAmount: { color: colors.green, fontWeight: "800", fontSize: 16 },
  grossAmount: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  txnFooter: {
    flexDirection: "row", justifyContent: "space-between",
    paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border,
  },
  txnRef: { color: colors.textDim, fontSize: 11, fontFamily: "monospace" },
  txnDate: { color: colors.textDim, fontSize: 11 },
  empty: { alignItems: "center", padding: 40 },
  emptyText: { color: colors.textMuted, marginTop: 12, fontWeight: "700" },
});
