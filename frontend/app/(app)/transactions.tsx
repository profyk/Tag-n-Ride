import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, RefreshControl,
  TouchableOpacity, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, Txn } from "../../src/api";
import { useAuth } from "../../src/AuthContext";
import { Pill } from "../../src/ui";
import { colors, formatZAR, formatDate, radius } from "../../src/theme";

type Filter = "all" | "in" | "out" | "topup" | "withdrawal";
const HIDDEN_KEY = "tnr_hidden_transactions";

async function getHidden(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(HIDDEN_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function hideTransaction(id: string) {
  try {
    const hidden = await getHidden();
    if (!hidden.includes(id)) {
      await AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden, id]));
    }
  } catch {}
}

async function clearHidden() {
  try { await AsyncStorage.removeItem(HIDDEN_KEY); } catch {}
}export default function Transactions() {
  const { state } = useAuth();
  const [items, setItems] = useState<Txn[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [t, h] = await Promise.all([api.transactions(), getHidden()]);
      setItems(t);
      setHidden(h);
    } catch {}
    finally { setRefreshing(false); setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleHide = async (id: string) => {
    await hideTransaction(id);
    setHidden(prev => [...prev, id]);
  };

  const handleClearAll = () => {
    Alert.alert(
      "Clear transaction history?",
      "This only clears your view on this device. Your records are safely stored.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear", style: "destructive", onPress: async () => {
          const allIds = items.map(t => t.id);
          await AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify(allIds));
          setHidden(allIds);
        }},
      ]
    );
  };

  const handleRestore = async () => {
    await clearHidden();
    setHidden([]);
  };

  const filtered = items
    .filter(t => !hidden.includes(t.id))
    .filter(t => {
      if (filter === "all") return true;
      if (filter === "topup") return t.type === "topup";
      if (filter === "withdrawal") return t.type === "withdrawal";
      if (filter === "in") return t.direction === "in";
      if (filter === "out") return t.direction === "out";
      return true;
    });

  const isDriver = state.status === "authed" && state.user.role === "driver";
  const filters: Filter[] = isDriver ? ["all", "in", "withdrawal"] : ["all", "out", "topup"];
  const hiddenCount = hidden.length;

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="transactions-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Transactions</Text>
        <View style={styles.headerActions}>
          {hiddenCount > 0 && (
            <TouchableOpacity onPress={handleRestore} style={styles.restoreBtn}>
              <Ionicons name="eye-outline" size={14} color={colors.cyan} />
              <Text style={styles.restoreText}>Restore ({hiddenCount})</Text>
            </TouchableOpacity>
          )}
          {filtered.length > 0 && (
            <TouchableOpacity onPress={handleClearAll} style={styles.clearBtn}>
              <Ionicons name="trash-outline" size={14} color={colors.textMuted} />
              <Text style={styles.clearText}>Clear all</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.filterRow}>
        {filters.map((f) => (
          <TouchableOpacity key={f} onPress={() => setFilter(f)}
            style={[styles.filter, filter === f && styles.filterActive]} testID={`filter-${f}`}>
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === "all" ? "All" : f === "in" ? "Received" : f === "out" ? "Paid" : f === "topup" ? "Top-ups" : "Withdrawals"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.cyan} />}
        renderItem={({ item: t }) => {
          const isIn = t.direction === "in" || t.type === "topup";
          const isWithdraw = t.type === "withdrawal";
          const sign = isIn ? "+" : "-";
          const color = isIn ? colors.green : colors.text;
          const icon = t.type === "topup" ? "arrow-down" : isWithdraw ? "cash-outline" : isIn ? "arrow-down-circle" : "arrow-up-circle";
          const title = t.type === "topup" ? "Wallet top-up" : isWithdraw ? "Withdrawal" : t.counterparty_name || "Transfer";
          return (
            <View style={styles.rowWrap}>
              <View style={styles.row} testID={`txn-row-${t.id}`}>
                <View style={[styles.icon, { backgroundColor: isIn ? colors.greenDim : colors.cyanDim }]}>
                  <Ionicons name={icon as any} size={20} color={isIn ? colors.green : colors.cyan} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{title}</Text>
                  <Text style={styles.rowSub}>{formatDate(t.created_at)} · {t.reference}</Text>
                  {t.note ? <Text style={styles.note}>{t.note}</Text> : null}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[styles.amt, { color }]}>{sign}{formatZAR(t.amount)}</Text>
                  <View style={{ marginTop: 6 }}>
                    <Pill label={t.status} tone={t.status === "completed" ? "green" : t.status === "pending" ? "yellow" : "red"} />
                  </View>
                </View>
                <TouchableOpacity onPress={() => handleHide(t.id)} style={styles.hideBtn} testID={`hide-txn-${t.id}`}>
                  <Ionicons name="eye-off-outline" size={16} color={colors.textDim} />
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="receipt-outline" size={36} color={colors.textDim} />
              <Text style={styles.emptyTxt}>{hiddenCount > 0 ? "All transactions hidden" : "No transactions yet"}</Text>
              {hiddenCount > 0 && (
                <TouchableOpacity onPress={handleRestore} style={{ marginTop: 12 }}>
                  <Text style={{ color: colors.cyan, fontWeight: "700" }}>Restore all</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, paddingBottom: 8 },
  title: { color: colors.text, fontSize: 24, fontWeight: "800" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  restoreBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.cyanDim, borderWidth: 1, borderColor: colors.cyan + "40" },
  restoreText: { color: colors.cyan, fontSize: 11, fontWeight: "700" },
  clearBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border },
  clearText: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  filterRow: { flexDirection: "row", paddingHorizontal: 20, gap: 8, paddingVertical: 8 },
  filter: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg2 },
  filterActive: { borderColor: colors.cyan, backgroundColor: colors.cyanDim },
  filterText: { color: colors.textMuted, fontWeight: "700", fontSize: 12 },
  filterTextActive: { color: colors.cyan },
  rowWrap: { position: "relative" },
  row: { flexDirection: "row", alignItems: "center", padding: 14, paddingRight: 40, backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  rowTitle: { color: colors.text, fontWeight: "700", fontSize: 14 },
  rowSub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  note: { color: colors.textDim, fontSize: 11, marginTop: 4, fontStyle: "italic" },
  amt: { fontWeight: "800", fontSize: 15 },
  hideBtn: { position: "absolute", top: 14, right: 12, padding: 4 },
  empty: { padding: 40, alignItems: "center" },
  emptyTxt: { color: colors.textMuted, marginTop: 8, fontWeight: "600" },
});
