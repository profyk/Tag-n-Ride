import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { ConfirmDialog } from "../../src/ConfirmDialog";
import { formatZAR, formatDate, radius, darkColors as colors } from "../../src/theme";

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
  const [confirmTarget, setConfirmTarget] = useState<{ type: "one"; id: string } | { type: "all" } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.ownerTransactions();
      setTxns(res);
    } catch (e: any) {
      setError(e?.message || "Failed to load transactions");
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

  const clearOne = (id: string) => setConfirmTarget({ type: "one", id });
  const clearAll = () => {
    if (filtered.length === 0) return;
    setConfirmTarget({ type: "all" });
  };

  const confirmClear = async () => {
    if (!confirmTarget) return;
    setError(null);
    if (confirmTarget.type === "one") {
      const id = confirmTarget.id;
      setConfirmTarget(null);
      try {
        await api.hideTransactions([id]);
        setTxns((prev) => prev.filter((t) => t.id !== id));
      } catch (e: any) {
        setError(e?.message || "Failed to clear transaction");
      }
      return;
    }
    const ids = filtered.map((t) => t.id);
    setConfirmTarget(null);
    try {
      await api.hideTransactions(ids);
      const idSet = new Set(ids);
      setTxns((prev) => prev.filter((t) => !idSet.has(t.id)));
    } catch (e: any) {
      setError(e?.message || "Failed to clear transactions");
    }
  };

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
        <View style={styles.headerRow}>
          <Text style={styles.title}>Fleet Earnings</Text>
          {filtered.length > 0 && (
            <TouchableOpacity style={styles.clearAllBtn} onPress={clearAll}>
              <Ionicons name="trash-outline" size={14} color={colors.red} />
              <Text style={styles.clearAllText}>Clear All</Text>
            </TouchableOpacity>
          )}
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={14} color={colors.red} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

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
                <TouchableOpacity style={styles.clearBtn} onPress={() => clearOne(t.id)}>
                  <Ionicons name="close-circle-outline" size={16} color={colors.textDim} />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <ConfirmDialog
        visible={!!confirmTarget}
        title={confirmTarget?.type === "all" ? "Clear all transactions?" : "Clear transaction?"}
        message={
          confirmTarget?.type === "all"
            ? `This will remove all ${filtered.length} transaction${filtered.length === 1 ? "" : "s"} shown from your Fleet Earnings list. It won't affect driver payouts or statements.`
            : "This will remove it from your Fleet Earnings list. It won't affect driver payouts or statements."
        }
        confirmLabel={confirmTarget?.type === "all" ? "Clear All" : "Clear"}
        destructive
        onConfirm={confirmClear}
        onCancel={() => setConfirmTarget(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  headerRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 16,
  },
  title: { color: colors.text, fontSize: 24, fontWeight: "800" },
  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: colors.redDim, borderWidth: 1, borderColor: colors.red,
    borderRadius: radius.md, padding: 12, marginBottom: 16,
  },
  errorText: { color: colors.red, fontSize: 12, fontWeight: "600", flex: 1 },
  clearAllBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    borderWidth: 1, borderColor: colors.red, backgroundColor: colors.redDim,
  },
  clearAllText: { color: colors.red, fontWeight: "700", fontSize: 12 },
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
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, gap: 8,
  },
  txnRef: { color: colors.textDim, fontSize: 11, fontFamily: "monospace" },
  txnDate: { color: colors.textDim, fontSize: 11, flex: 1, textAlign: "right", marginRight: 4 },
  clearBtn: { padding: 2 },
  empty: { alignItems: "center", padding: 40 },
  emptyText: { color: colors.textMuted, marginTop: 12, fontWeight: "700" },
});
