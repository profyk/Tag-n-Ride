import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/AuthContext";
import { api, Wallet, Txn } from "../../src/api";
import { colors, formatZAR, formatDate, radius } from "../../src/theme";
import { Pill } from "../../src/ui";

export default function Home() {
  const router = useRouter();
  const { state } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [w, t] = await Promise.all([api.wallet(), api.transactions()]);
      setWallet(w);
      setTxns(t.slice(0, 5));
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (state.status !== "authed") return null;
  const isDriver = state.user.role === "driver";

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="home-screen">
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.cyan} />}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.hello}>Hello,</Text>
            <Text style={styles.name} testID="home-username">{state.user.full_name.split(" ")[0]} 👋</Text>
          </View>
          <TouchableOpacity onPress={() => router.push("/(app)/profile")} testID="home-profile-btn" style={styles.avatar}>
            <Ionicons name={isDriver ? "car-sport" : "person"} size={22} color={colors.cyan} />
          </TouchableOpacity>
        </View>

        {/* Balance card */}
        <View style={styles.balanceCard} testID="balance-card">
          <View style={styles.balanceCardGlow} />
          <Text style={styles.balanceLabel}>WALLET BALANCE · ZAR</Text>
          {loading || !wallet ? (
            <ActivityIndicator color={colors.cyan} style={{ marginTop: 16 }} />
          ) : (
            <Text style={styles.balanceAmt} testID="balance-amount">{formatZAR(wallet.balance)}</Text>
          )}
          {isDriver && wallet ? (
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>Total earnings</Text>
                <Text style={styles.statVal}>{formatZAR(wallet.total_earnings ?? 0)}</Text>
              </View>
              <View style={[styles.stat, { borderLeftColor: colors.border, borderLeftWidth: 1, paddingLeft: 16 }]}>
                <Text style={styles.statLabel}>Rating</Text>
                <Text style={styles.statVal}>
                  {wallet.rating_count ? `★ ${wallet.rating_avg?.toFixed(1)}` : "—"}
                  {wallet.rating_count ? <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "500" }}>  ({wallet.rating_count})</Text> : null}
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* Quick actions */}
        <Text style={styles.section}>QUICK ACTIONS</Text>
        <View style={styles.qaRow}>
          {isDriver ? (
            <>
              <QA icon="qr-code" label="My QR" tone="cyan" onPress={() => router.push("/(app)/action")} testID="qa-myqr" />
              <QA icon="cash-outline" label="Withdraw" tone="green" onPress={() => router.push("/withdraw")} testID="qa-withdraw" />
              <QA icon="receipt-outline" label="History" tone="muted" onPress={() => router.push("/(app)/transactions")} testID="qa-history" />
            </>
          ) : (
            <>
              <QA icon="scan" label="Scan & Pay" tone="cyan" onPress={() => router.push("/(app)/action")} testID="qa-scan" />
              <QA icon="add-circle-outline" label="Top Up" tone="green" onPress={() => router.push("/topup")} testID="qa-topup" />
              <QA icon="receipt-outline" label="History" tone="muted" onPress={() => router.push("/(app)/transactions")} testID="qa-history" />
            </>
          )}
        </View>

        <View style={styles.recentHeader}>
          <Text style={styles.section}>RECENT</Text>
          <TouchableOpacity onPress={() => router.push("/(app)/transactions")}>
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>

        {txns.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="time-outline" size={32} color={colors.textDim} />
            <Text style={styles.emptyText}>No transactions yet</Text>
            <Text style={styles.emptySub}>{isDriver ? "Share your QR code to start receiving payments." : "Top up your wallet, then scan a driver's QR to pay."}</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {txns.map((t) => <TxnRow key={t.id} t={t} />)}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const QA: React.FC<{ icon: keyof typeof Ionicons.glyphMap; label: string; tone: "cyan" | "green" | "muted"; onPress: () => void; testID?: string }> = ({ icon, label, tone, onPress, testID }) => {
  const map = { cyan: { bg: colors.cyanDim, fg: colors.cyan }, green: { bg: colors.greenDim, fg: colors.green }, muted: { bg: "rgba(255,255,255,0.06)", fg: colors.text } }[tone];
  return (
    <TouchableOpacity testID={testID} onPress={onPress} activeOpacity={0.85} style={[styles.qa, { backgroundColor: colors.bg2 }]}>
      <View style={[styles.qaIcon, { backgroundColor: map.bg }]}>
        <Ionicons name={icon} size={22} color={map.fg} />
      </View>
      <Text style={styles.qaLabel}>{label}</Text>
    </TouchableOpacity>
  );
};

const TxnRow: React.FC<{ t: Txn }> = ({ t }) => {
  const isIn = t.direction === "in" || t.type === "topup";
  const isWithdraw = t.type === "withdrawal";
  const sign = isIn ? "+" : "-";
  const color = isIn ? colors.green : colors.text;
  const icon = t.type === "topup" ? "arrow-down" : isWithdraw ? "cash-outline" : isIn ? "arrow-down-circle" : "arrow-up-circle";
  const title = t.type === "topup" ? "Wallet top-up" : isWithdraw ? "Withdrawal" : t.counterparty_name || "Transfer";
  return (
    <View style={styles.txnRow} testID={`txn-${t.id}`}>
      <View style={[styles.txnIcon, { backgroundColor: isIn ? colors.greenDim : colors.cyanDim }]}>
        <Ionicons name={icon as any} size={18} color={isIn ? colors.green : colors.cyan} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.txnTitle}>{title}</Text>
        <Text style={styles.txnSub}>{formatDate(t.created_at)} · {t.reference}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={[styles.txnAmt, { color }]}>{sign}{formatZAR(t.amount)}</Text>
        <View style={{ marginTop: 4 }}>
          <Pill label={t.status} tone={t.status === "completed" ? "green" : t.status === "pending" ? "yellow" : "red"} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  hello: { color: colors.textMuted, fontSize: 14 },
  name: { color: colors.text, fontSize: 24, fontWeight: "800" },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.cyanDim, borderWidth: 1, borderColor: colors.cyan },
  balanceCard: {
    backgroundColor: colors.bg2,
    borderColor: colors.cyan,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 24,
    overflow: "hidden",
  },
  balanceCardGlow: { position: "absolute", top: -50, right: -50, width: 200, height: 200, borderRadius: 100, backgroundColor: colors.cyan, opacity: 0.08 },
  balanceLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700", letterSpacing: 1.4 },
  balanceAmt: { color: colors.text, fontSize: 38, fontWeight: "800", marginTop: 8, letterSpacing: -1 },
  statsRow: { flexDirection: "row", marginTop: 18, gap: 16 },
  stat: { flex: 1 },
  statLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  statVal: { color: colors.text, fontSize: 16, fontWeight: "700", marginTop: 4 },
  section: { color: colors.textMuted, fontSize: 12, fontWeight: "700", letterSpacing: 1.4, marginTop: 24, marginBottom: 12 },
  qaRow: { flexDirection: "row", gap: 12 },
  qa: { flex: 1, paddingVertical: 18, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  qaIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  qaLabel: { color: colors.text, marginTop: 8, fontSize: 13, fontWeight: "600" },
  recentHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  seeAll: { color: colors.cyan, fontWeight: "700", fontSize: 13, marginTop: 16 },
  empty: { padding: 32, alignItems: "center", borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, borderRadius: radius.md },
  emptyText: { color: colors.text, fontWeight: "700", marginTop: 10 },
  emptySub: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginTop: 6 },
  txnRow: { flexDirection: "row", alignItems: "center", padding: 14, backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: 12 },
  txnIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  txnTitle: { color: colors.text, fontWeight: "700", fontSize: 14 },
  txnSub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  txnAmt: { fontWeight: "800", fontSize: 15 },
});
