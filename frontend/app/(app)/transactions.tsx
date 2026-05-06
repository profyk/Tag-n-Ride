import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Txn } from "../../src/api";
import { useAuth } from "../../src/AuthContext";
import { Pill } from "../../src/ui";
import { colors, formatZAR, formatDate, radius } from "../../src/theme";

type Filter = "all" | "in" | "out" | "topup" | "withdrawal";

export default function Transactions() {
  const { state } = useAuth();
  const [items, setItems] = useState<Txn[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const t = await api.transactions();
      setItems(t);
    } catch {}
    finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = items.filter((t) => {
    if (filter === "all") return true;
    if (filter === "topup") return t.type === "topup";
    if (filter === "withdrawal") return t.type === "withdrawal";
    if (filter === "in") return t.direction === "in";
    if (filter === "out") return t.direction === "out";
    return true;
  });

  const isDriver = state.status === "authed" && state.user.role === "driver";
  const filters: Filter[] = isDriver ? ["all", "in", "withdrawal"] : ["all", "out", "topup"];

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="transactions-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Transactions</Text>
      </View>

      <View style={styles.filterRow}>
        {filters.map((f) => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            style={[styles.filter, filter === f && styles.filterActive]}
            testID={`filter-${f}`}
          >
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
          const sign = isIn ? "+" : "-";
          const color = isIn ? colors.green : colors.text;
          const icon = t.type === "topup" ? "arrow-down" : t.type === "withdrawal" ? "cash-outline" : isIn ? "arrow-down-circle" : "arrow-up-circle";
          const title = t.type === "topup" ? "Wallet top-up" : t.type === "withdrawal" ? "Withdrawal" : t.counterparty_name || "Transfer";
          return (
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
            </View>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="receipt-outline" size={36} color={colors.textDim} />
              <Text style={styles.emptyTxt}>No transactions yet</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { padding: 20, paddingBottom: 8 },
  title: { color: colors.text, fontSize: 24, fontWeight: "800" },
  filterRow: { flexDirection: "row", paddingHorizontal: 20, gap: 8, paddingVertical: 8 },
  filter: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg2 },
  filterActive: { borderColor: colors.cyan, backgroundColor: colors.cyanDim },
  filterText: { color: colors.textMuted, fontWeight: "700", fontSize: 12 },
  filterTextActive: { color: colors.cyan },
  row: { flexDirection: "row", alignItems: "center", padding: 14, backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  rowTitle: { color: colors.text, fontWeight: "700", fontSize: 14 },
  rowSub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  note: { color: colors.textDim, fontSize: 11, marginTop: 4, fontStyle: "italic" },
  amt: { fontWeight: "800", fontSize: 15 },
  empty: { padding: 40, alignItems: "center" },
  emptyTxt: { color: colors.textMuted, marginTop: 8 },
});
