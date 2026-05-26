import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, Txn } from "../../src/api";
import { useAuth } from "../../src/AuthContext";
import { useTheme } from "../../src/ThemeContext";
import { Pill } from "../../src/ui";
import { formatZAR, formatDate, radius } from "../../src/theme";

type Filter = "all" | "in" | "out" | "topup" | "withdrawal";
const HIDDEN_KEY = "tnr_hidden_transactions";

async function getHidden(): Promise<string[]> {
  try { const raw = await AsyncStorage.getItem(HIDDEN_KEY); return raw ? JSON.parse(raw) : []; }
  catch { return []; }
}
async function addHidden(ids: string[]) {
  try {
    const existing = await getHidden();
    await AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(new Set([...existing, ...ids]))));
  } catch {}
}

export default function Transactions() {
  const { state } = useAuth();
  const { colors } = useTheme();
  const [items, setItems] = useState<Txn[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [t, h] = await Promise.all([api.transactions(), getHidden()]);
      setItems(t); setHidden(h);
    } catch {}
    finally { setRefreshing(false); setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleHide = async (id: string) => {
    await addHidden([id]);
    setHidden(prev => [...prev, id]);
  };

  const handleClearAll = () => {
  Alert.alert(
    "Clear all transactions?",
    "All transactions will be removed from this device permanently.",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete all", style: "destructive",
        onPress: async () => {
          const allIds = items.map(t => t.id);
          await addHidden(allIds);
          setItems([]);
          setHidden(allIds);
        },
      },
    ]
  );
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
  const s = makeStyles(colors);

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="transactions-screen">
      <View style={s.header}>
        <Text style={s.title}>Transactions</Text>
        {filtered.length > 0 && (
          <TouchableOpacity onPress={handleClearAll} style={s.clearBtn}>
            <Ionicons name="trash-outline" size={14} color={colors.textMuted} />
            <Text style={s.clearText}>Clear all</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={s.filterRow}>
        {filters.map((f) => (
          <TouchableOpacity key={f} onPress={() => setFilter(f)}
            style={[s.filter, filter === f && s.filterActive]} testID={`filter-${f}`}>
            <Text style={[s.filterText, filter === f && s.filterTextActive]}>
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
            <View style={{ position: "relative" }}>
              <View style={s.row} testID={`txn-row-${t.id}`}>
                <View style={[s.icon, { backgroundColor: isIn ? colors.greenDim : colors.cyanDim }]}>
                  <Ionicons name={icon as any} size={20} color={isIn ? colors.green : colors.cyan} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>{title}</Text>
                  <Text style={s.rowSub}>{formatDate(t.created_at)} · {t.reference}</Text>
                  {t.note ? <Text style={s.note}>{t.note}</Text> : null}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[s.amt, { color }]}>{sign}{formatZAR(t.amount)}</Text>
                  <View style={{ marginTop: 6 }}>
                    <Pill label={t.status} tone={t.status === "completed" ? "green" : t.status === "pending" ? "yellow" : "red"} />
                  </View>
                </View>
                <TouchableOpacity onPress={() => handleHide(t.id)} style={s.hideBtn} testID={`hide-txn-${t.id}`}>
                  <Ionicons name="eye-off-outline" size={16} color={colors.textDim} />
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={!loading ? (
          <View style={s.empty}>
            <Ionicons name="receipt-outline" size={36} color={colors.textDim} />
            <Text style={s.emptyTxt}>No transactions</Text>
          </View>
        ) : null}
      />
    </SafeAreaView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, paddingBottom: 8 },
  title: { color: colors.text, fontSize: 24, fontWeight: "800" },
  clearBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border },
  clearText: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  filterRow: { flexDirection: "row", paddingHorizontal: 20, gap: 8, paddingVertical: 8 },
  filter: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg2 },
  filterActive: { borderColor: colors.cyan, backgroundColor: colors.cyanDim },
  filterText: { color: colors.textMuted, fontWeight: "700", fontSize: 12 },
  filterTextActive: { color: colors.cyan },
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
