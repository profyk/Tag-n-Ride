import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Alert, TextInput, Modal } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/AuthContext";
import { api, Wallet, Txn } from "../../src/api";
import { colors, formatZAR, formatDate, radius } from "../../src/theme";
import { Pill, Button } from "../../src/ui";

export default function Home() {
  const router = useRouter();
  const { state } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const [fuelModal, setFuelModal] = useState(false);
  const [fuelAmount, setFuelAmount] = useState("");
  const [fuelLoading, setFuelLoading] = useState(false);

  const [cashUpModal, setCashUpModal] = useState(false);
  const [cashUpAmount, setCashUpAmount] = useState("");
  const [cashUpType, setCashUpType] = useState<"self" | "owner">("self");
  const [cashUpLoading, setCashUpLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [w, t] = await Promise.all([api.wallet(), api.transactions()]);
      setWallet(w);
      setTxns(t.slice(0, 5));
    } catch (e) {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (state.status !== "authed") return null;
  const isDriver = state.user.role === "driver";

  const handlePayFuel = async () => {
    const amount = parseFloat(fuelAmount);
    if (!fuelAmount || isNaN(amount) || amount <= 0) {
      Alert.alert("Invalid amount", "Please enter a valid amount.");
      return;
    }
    setFuelLoading(true);
    try {
      await api.withdraw({ amount });
      setFuelModal(false);
      setFuelAmount("");
      Alert.alert("Done", "Fuel withdrawal submitted.");
      load();
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Could not process withdrawal.");
    } finally {
      setFuelLoading(false);
    }
  };

  const handleCashUp = async () => {
    const amount = parseFloat(cashUpAmount);
    if (!cashUpAmount || isNaN(amount) || amount <= 0) {
      Alert.alert("Invalid amount", "Please enter a valid amount.");
      return;
    }
    setCashUpLoading(true);
    try {
      await api.cashup({ amount, type: cashUpType });
      setCashUpModal(false);
      setCashUpAmount("");
      Alert.alert("Done", `CashUp to ${cashUpType === "self" ? "your account" : "owner's account"} submitted.`);
      load();
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Could not process CashUp.");
    } finally {
      setCashUpLoading(false);
    }
  };

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

        <Text style={styles.section}>QUICK ACTIONS</Text>
        {isDriver ? (
          <>
            <View style={styles.qaRow}>
              <QA icon="qr-code" label="My QR" tone="cyan" onPress={() => router.push("/(app)/action")} testID="qa-myqr" />
              <QA icon="cash-outline" label="Withdraw" tone="green" onPress={() => router.push("/withdraw")} testID="qa-withdraw" />
              <QA icon="receipt-outline" label="History" tone="muted" onPress={() => router.push("/(app)/transactions")} testID="qa-history" />
            </View>
            <View style={[styles.qaRow, { marginTop: 12 }]}>
              <QA icon="flame-outline" label="Pay Fuel" tone="orange" onPress={() => setFuelModal(true)} testID="qa-payfuel" />
              <QA icon="wallet-outline" label="CashUp" tone="purple" onPress={() => setCashUpModal(true)} testID="qa-cashup" />
              <QA icon="person-outline" label="Profile" tone="muted" onPress={() => router.push("/(app)/profile")} testID="qa-profile" />
            </View>
          </>
        ) : (
          <View style={styles.qaRow}>
            <QA icon="scan" label="Scan & Pay" tone="cyan" onPress={() => router.push("/(app)/action")} testID="qa-scan" />
            <QA icon="add-circle-outline" label="Top Up" tone="green" onPress={() => router.push("/topup")} testID="qa-topup" />
            <QA icon="receipt-outline" label="History" tone="muted" onPress={() => router.push("/(app)/transactions")} testID="qa-history" />
          </View>
        )}

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

      {/* Pay Fuel Modal */}
      <Modal visible={fuelModal} transparent animationType="slide" onRequestClose={() => setFuelModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalIconWrap}>
              <Ionicons name="flame-outline" size={28} color="#FF8C00" />
            </View>
            <Text style={styles.modalTitle}>Pay Fuel</Text>
            <Text style={styles.modalSub}>Withdraws from your saved payout account instantly.</Text>
            <Text style={styles.inputLabel}>AMOUNT (ZAR)</Text>
            <TextInput
              style={styles.input}
              value={fuelAmount}
              onChangeText={setFuelAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textDim}
              testID="fuel-amount-input"
            />
            <View style={styles.modalActions}>
              <View style={{ flex: 1 }}>
                <Button label="Cancel" variant="secondary" onPress={() => { setFuelModal(false); setFuelAmount(""); }} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Pay Fuel" onPress={handlePayFuel} loading={fuelLoading} testID="fuel-confirm-btn" />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* CashUp Modal */}
      <Modal visible={cashUpModal} transparent animationType="slide" onRequestClose={() => setCashUpModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalIconWrap}>
              <Ionicons name="wallet-outline" size={28} color="#A064FF" />
            </View>
            <Text style={styles.modalTitle}>CashUp</Text>
            <Text style={styles.modalSub}>Choose which account to cash out to.</Text>
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleBtn, cashUpType === "self" && styles.toggleBtnActive]}
                onPress={() => setCashUpType("self")}
                testID="cashup-type-self"
              >
                <Ionicons name="person-outline" size={16} color={cashUpType === "self" ? colors.bg : colors.textMuted} />
                <Text style={[styles.toggleText, cashUpType === "self" && styles.toggleTextActive]}>My Account</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, cashUpType === "owner" && styles.toggleBtnActive]}
                onPress={() => setCashUpType("owner")}
                testID="cashup-type-owner"
              >
                <Ionicons name="car-outline" size={16} color={cashUpType === "owner" ? colors.bg : colors.textMuted} />
                <Text style={[styles.toggleText, cashUpType === "owner" && styles.toggleTextActive]}>Owner's Account</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.inputLabel}>AMOUNT (ZAR)</Text>
            <TextInput
              style={styles.input}
              value={cashUpAmount}
              onChangeText={setCashUpAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textDim}
              testID="cashup-amount-input"
            />
            <View style={styles.modalActions}>
              <View style={{ flex: 1 }}>
                <Button label="Cancel" variant="secondary" onPress={() => { setCashUpModal(false); setCashUpAmount(""); }} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="CashUp" onPress={handleCashUp} loading={cashUpLoading} testID="cashup-confirm-btn" />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

type Tone = "cyan" | "green" | "muted" | "orange" | "purple";

const QA: React.FC<{ icon: keyof typeof Ionicons.glyphMap; label: string; tone: Tone; onPress: () => void; testID?: string }> = ({ icon, label, tone, onPress, testID }) => {
  const map: Record<Tone, { bg: string; fg: string }> = {
    cyan:   { bg: colors.cyanDim,   fg: colors.cyan },
    green:  { bg: colors.greenDim,  fg: colors.green },
    muted:  { bg: "rgba(255,255,255,0.06)", fg: colors.text },
    orange: { bg: "rgba(255,140,0,0.15)", fg: "#FF8C00" },
    purple: { bg: "rgba(160,100,255,0.15)", fg: "#A064FF" },
  };
  const { bg, fg } = map[tone];
  return (
    <TouchableOpacity testID={testID} onPress={onPress} activeOpacity={0.85} style={[styles.qa, { backgroundColor: colors.bg2 }]}>
      <View style={[styles.qaIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={22} color={fg} />
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
  balanceCard: { backgroundColor: colors.bg2, borderColor: colors.cyan, borderWidth: 1, borderRadius: radius.lg, padding: 24, overflow: "hidden" },
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
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: colors.bg2, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, borderTopWidth: 1, borderColor: colors.border },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 20 },
  modalIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: "800", textAlign: "center" },
  modalSub: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginTop: 4, marginBottom: 20 },
  inputLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, marginBottom: 8 },
  input: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 14, color: colors.text, fontSize: 20, fontWeight: "800", marginBottom: 20 },
  modalActions: { flexDirection: "row", gap: 12 },
  toggleRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  toggleBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  toggleBtnActive: { backgroundColor: colors.cyan, borderColor: colors.cyan },
  toggleText: { color: colors.textMuted, fontWeight: "700", fontSize: 13 },
  toggleTextActive: { color: colors.bg },
});
