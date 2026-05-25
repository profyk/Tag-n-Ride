import React, { useCallback, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert, TextInput, Modal, StyleSheet,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "../../src/AuthContext";
import { useTheme } from "../../src/ThemeContext";
import { api, Wallet, Txn } from "../../src/api";
import { formatZAR, formatDate, radius } from "../../src/theme";
import { Pill, Button } from "../../src/ui";
import { useNotifications } from "../../src/NotificationContext";

const HIDDEN_KEY = "tnr_hidden_transactions";

async function getHidden(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(HIDDEN_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function addHidden(ids: string[]) {
  try {
    const existing = await getHidden();
    const merged = Array.from(new Set([...existing, ...ids]));
    await AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify(merged));
  } catch {}
}export default function Home() {
  const router = useRouter();
  const { state } = useAuth();
  const { colors } = useTheme();
  const { unreadCount } = useNotifications();

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [allTxns, setAllTxns] = useState<Txn[]>([]);
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
      const [w, t, hidden] = await Promise.all([
        api.wallet(), api.transactions(), getHidden(),
      ]);
      setWallet(w);
      setAllTxns(t);
      setTxns(t.filter((tx: Txn) => !hidden.includes(tx.id)).slice(0, 5));
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (state.status !== "authed") return null;
  const isDriver = state.user.role === "driver";

  const handleHideTxn = async (id: string) => {
    await addHidden([id]);
    setTxns(prev => prev.filter(t => t.id !== id));
  };

  const handlePayFuel = async () => {
    const amount = parseFloat(fuelAmount);
    if (!fuelAmount || isNaN(amount) || amount <= 0) {
      Alert.alert("Invalid amount", "Please enter a valid amount."); return;
    }
    if (amount > (wallet?.balance ?? 0)) {
      Alert.alert("Insufficient balance", `Your wallet balance is ${formatZAR(wallet?.balance ?? 0)}.`); return;
    }
    if (amount < 5) { Alert.alert("Minimum amount", "Minimum amount is R5.00."); return; }
    setFuelLoading(true);
    try {
      await api.cashup({ amount, type: "self" });
      setFuelModal(false); setFuelAmount("");
      Alert.alert("Done", `R${amount.toFixed(2)} paid. Money is on its way to your bank account.`);
      load();
    } catch (e: any) {
      const msg = e?.message || "";
      if (msg.includes("payout account") || msg.includes("No 'self'")) {
        Alert.alert("No payout account", "Add your bank account in Profile → My Account.",
          [{ text: "Go to Profile", onPress: () => { setFuelModal(false); router.push("/(app)/profile"); } }, { text: "Cancel", style: "cancel" }]);
      } else if (msg.includes("Insufficient") || msg.includes("balance")) {
        Alert.alert("Insufficient balance", "Not enough in your wallet.");
      } else { Alert.alert("Failed", msg || "Could not process. Please try again."); }
    } finally { setFuelLoading(false); }
  };

  const handleCashUp = async () => {
    const amount = parseFloat(cashUpAmount);
    if (!cashUpAmount || isNaN(amount) || amount <= 0) {
      Alert.alert("Invalid amount", "Please enter a valid amount."); return;
    }
    if (amount > (wallet?.balance ?? 0)) {
      Alert.alert("Insufficient balance", `Your wallet balance is ${formatZAR(wallet?.balance ?? 0)}.`); return;
    }
    if (amount < 5) { Alert.alert("Minimum amount", "Minimum CashUp amount is R5.00."); return; }
    setCashUpLoading(true);
    try {
      await api.cashup({ amount, type: cashUpType });
      setCashUpModal(false); setCashUpAmount("");
      Alert.alert("CashUp submitted", `R${amount.toFixed(2)} is being paid to ${cashUpType === "self" ? "your bank account" : "the owner's account"}.`);
      load();
    } catch (e: any) {
      const msg = e?.message || "";
      if (msg.includes("payout account") || msg.includes("No '")) {
        const accountType = cashUpType === "self" ? "My Account" : "Owner Account";
        Alert.alert(`${accountType} not set up`, `Add ${accountType} bank details in Profile.`,
          [{ text: "Go to Profile", onPress: () => { setCashUpModal(false); router.push("/(app)/profile"); } }, { text: "Cancel", style: "cancel" }]);
      } else if (msg.includes("Insufficient") || msg.includes("balance")) {
        Alert.alert("Insufficient balance", `Not enough to CashUp R${amount.toFixed(2)}.`);
      } else { Alert.alert("Failed", msg || "Could not process. Please try again."); }
    } finally { setCashUpLoading(false); }
  };const s = makeStyles(colors);

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="home-screen">
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.cyan} />}>

        <View style={s.headerRow}>
          <View>
            <Text style={s.hello}>Hello,</Text>
            <Text style={s.name} testID="home-username">{state.user.full_name.split(" ")[0]} 👋</Text>
          </View>
          <View style={s.headerActions}>
            <TouchableOpacity onPress={() => router.push("/(app)/notifications")} style={s.headerBtn} testID="home-notif-btn">
              <Ionicons name="notifications-outline" size={22} color={colors.text} />
              {unreadCount > 0 && (
                <View style={s.badge}><Text style={s.badgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text></View>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push("/(app)/profile")} testID="home-profile-btn" style={s.avatar}>
              <Ionicons name={isDriver ? "car-sport" : "person"} size={22} color={colors.cyan} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={s.balanceCard} testID="balance-card">
          <View style={s.balanceCardGlow} />
          <Text style={s.balanceLabel}>WALLET BALANCE · ZAR</Text>
          {loading || !wallet ? (
            <ActivityIndicator color={colors.cyan} style={{ marginTop: 16 }} />
          ) : (
            <Text style={s.balanceAmt} testID="balance-amount">{formatZAR(wallet.balance)}</Text>
          )}
          {isDriver && wallet ? (
            <View style={s.statsRow}>
              <View style={s.stat}>
                <Text style={s.statLabel}>Today</Text>
                <Text style={s.statVal}>{formatZAR(wallet.today_total ?? 0)}</Text>
              </View>
              <View style={[s.stat, { borderLeftColor: colors.border, borderLeftWidth: 1, paddingLeft: 16 }]}>
                <Text style={s.statLabel}>Rating</Text>
                <Text style={s.statVal}>
                  {wallet.rating_count ? `★ ${wallet.rating_avg?.toFixed(1)}` : "—"}
                  {wallet.rating_count ? <Text style={{ color: colors.textMuted, fontSize: 13 }}>{"  "}({wallet.rating_count})</Text> : null}
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        <Text style={s.section}>QUICK ACTIONS</Text>
        {isDriver ? (
          <>
            <View style={s.qaRow}>
              <QA icon="qr-code" label="My QR" tone="cyan" colors={colors} onPress={() => router.push("/(app)/action")} testID="qa-myqr" />
              <QA icon="receipt-outline" label="History" tone="muted" colors={colors} onPress={() => router.push("/(app)/transactions")} testID="qa-history" />
              <QA icon="person-outline" label="Profile" tone="muted" colors={colors} onPress={() => router.push("/(app)/profile")} testID="qa-profile" />
            </View>
            <View style={[s.qaRow, { marginTop: 12 }]}>
              <QA icon="flame-outline" label="Pay Fuel" tone="orange" colors={colors} onPress={() => setFuelModal(true)} testID="qa-payfuel" />
              <QA icon="wallet-outline" label="CashUp" tone="purple" colors={colors} onPress={() => setCashUpModal(true)} testID="qa-cashup" />
              <QA icon="notifications-outline" label="Alerts" tone="muted" colors={colors} onPress={() => router.push("/(app)/notifications")} testID="qa-notifs" />
            </View>
          </>
        ) : (
          <View style={s.qaRow}>
            <QA icon="scan" label="Scan & Pay" tone="cyan" colors={colors} onPress={() => router.push("/(app)/action")} testID="qa-scan" />
            <QA icon="add-circle-outline" label="Top Up" tone="green" colors={colors} onPress={() => router.push("/topup")} testID="qa-topup" />
            <QA icon="receipt-outline" label="History" tone="muted" colors={colors} onPress={() => router.push("/(app)/transactions")} testID="qa-history" />
          </View>
        )}

        <View style={s.recentHeader}>
          <Text style={s.section}>RECENT</Text>
          <TouchableOpacity onPress={() => router.push("/(app)/transactions")}>
            <Text style={s.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>

        {txns.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="time-outline" size={32} color={colors.textDim} />
            <Text style={s.emptyText}>No transactions yet</Text>
            <Text style={s.emptySub}>{isDriver ? "Share your QR code to start receiving payments." : "Top up your wallet, then scan a driver's QR to pay."}</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {txns.map((t) => <TxnRow key={t.id} t={t} onHide={handleHideTxn} colors={colors} />)}
          </View>
        )}
      </ScrollView>

      <Modal visible={fuelModal} transparent animationType="slide" onRequestClose={() => setFuelModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <View style={s.modalIconWrap}><Ionicons name="flame-outline" size={28} color="#FF8C00" /></View>
            <Text style={s.modalTitle}>Pay Fuel</Text>
            <Text style={s.modalSub}>CashUp to your personal payout account.{"\n"}Set it up in Profile first.</Text>
            {wallet && <View style={s.balancePill}><Text style={s.balancePillText}>Available: {formatZAR(wallet.balance)}</Text></View>}
            <Text style={s.inputLabel}>AMOUNT (ZAR)</Text>
            <TextInput style={s.input} value={fuelAmount} onChangeText={setFuelAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textDim} testID="fuel-amount-input" />
            <View style={s.modalActions}>
              <View style={{ flex: 1 }}><Button label="Cancel" variant="secondary" onPress={() => { setFuelModal(false); setFuelAmount(""); }} /></View>
              <View style={{ flex: 1 }}><Button label="Pay Fuel" onPress={handlePayFuel} loading={fuelLoading} testID="fuel-confirm-btn" /></View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={cashUpModal} transparent animationType="slide" onRequestClose={() => setCashUpModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <View style={s.modalIconWrap}><Ionicons name="wallet-outline" size={28} color="#A064FF" /></View>
            <Text style={s.modalTitle}>CashUp</Text>
            <Text style={s.modalSub}>Choose which account to cash out to.</Text>
            {wallet && <View style={s.balancePill}><Text style={s.balancePillText}>Available: {formatZAR(wallet.balance)}</Text></View>}
            <View style={s.toggleRow}>
              <TouchableOpacity style={[s.toggleBtn, cashUpType === "self" && s.toggleBtnActive]} onPress={() => setCashUpType("self")} testID="cashup-type-self">
                <Ionicons name="person-outline" size={16} color={cashUpType === "self" ? colors.bg : colors.textMuted} />
                <Text style={[s.toggleText, cashUpType === "self" && s.toggleTextActive]}>My Account</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.toggleBtn, cashUpType === "owner" && s.toggleBtnActive]} onPress={() => setCashUpType("owner")} testID="cashup-type-owner">
                <Ionicons name="car-outline" size={16} color={cashUpType === "owner" ? colors.bg : colors.textMuted} />
                <Text style={[s.toggleText, cashUpType === "owner" && s.toggleTextActive]}>Owner's Account</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.inputLabel}>AMOUNT (ZAR)</Text>
            <TextInput style={s.input} value={cashUpAmount} onChangeText={setCashUpAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textDim} testID="cashup-amount-input" />
            <View style={s.modalActions}>
              <View style={{ flex: 1 }}><Button label="Cancel" variant="secondary" onPress={() => { setCashUpModal(false); setCashUpAmount(""); }} /></View>
              <View style={{ flex: 1 }}><Button label="CashUp" onPress={handleCashUp} loading={cashUpLoading} testID="cashup-confirm-btn" /></View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
type Tone = "cyan" | "green" | "muted" | "orange" | "purple";

const QA: React.FC<{
  icon: keyof typeof Ionicons.glyphMap; label: string;
  tone: Tone; colors: any; onPress: () => void; testID?: string;
}> = ({ icon, label, tone, colors, onPress, testID }) => {
  const map: Record<Tone, { bg: string; fg: string }> = {
    cyan:   { bg: colors.cyanDim, fg: colors.cyan },
    green:  { bg: colors.greenDim, fg: colors.green },
    muted:  { bg: "rgba(128,128,128,0.1)", fg: colors.text },
    orange: { bg: "rgba(255,140,0,0.15)", fg: "#FF8C00" },
    purple: { bg: "rgba(160,100,255,0.15)", fg: "#A064FF" },
  };
  const { bg, fg } = map[tone];
  return (
    <TouchableOpacity testID={testID} onPress={onPress} activeOpacity={0.85}
      style={{ flex: 1, paddingVertical: 18, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center", backgroundColor: colors.bg2 }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: bg }}>
        <Ionicons name={icon} size={22} color={fg} />
      </View>
      <Text style={{ color: colors.text, marginTop: 8, fontSize: 13, fontWeight: "600" }}>{label}</Text>
    </TouchableOpacity>
  );
};

const TxnRow: React.FC<{ t: Txn; onHide: (id: string) => void; colors: any }> = ({ t, onHide, colors }) => {
  const isIn = t.direction === "in" || t.type === "topup";
  const isWithdraw = t.type === "withdrawal";
  const sign = isIn ? "+" : "-";
  const color = isIn ? colors.green : colors.text;
  const icon = t.type === "topup" ? "arrow-down" : isWithdraw ? "cash-outline" : isIn ? "arrow-down-circle" : "arrow-up-circle";
  const title = t.type === "topup" ? "Wallet top-up" : isWithdraw ? "Withdrawal" : t.counterparty_name || "Transfer";
  return (
    <View style={{ position: "relative" }}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 14, paddingRight: 38, backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: 12 }} testID={`txn-${t.id}`}>
        <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: isIn ? colors.greenDim : colors.cyanDim }}>
          <Ionicons name={icon as any} size={18} color={isIn ? colors.green : colors.cyan} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 14 }}>{title}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{formatDate(t.created_at)} · {t.reference}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontWeight: "800", fontSize: 15, color }}>{sign}{formatZAR(t.amount)}</Text>
          <View style={{ marginTop: 4 }}>
            <Pill label={t.status} tone={t.status === "completed" ? "green" : t.status === "pending" ? "yellow" : "red"} />
          </View>
        </View>
        <TouchableOpacity onPress={() => onHide(t.id)} style={{ position: "absolute", top: 14, right: 10, padding: 4 }}>
          <Ionicons name="eye-off-outline" size={15} color={colors.textDim} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const makeStyles = (colors: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  hello: { color: colors.textMuted, fontSize: 14 },
  name: { color: colors.text, fontSize: 24, fontWeight: "800" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border, position: "relative" },
  badge: { position: "absolute", top: -2, right: -2, backgroundColor: colors.red, borderRadius: 999, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderWidth: 2, borderColor: colors.bg },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "900" },
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
  recentHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  seeAll: { color: colors.cyan, fontWeight: "700", fontSize: 13, marginTop: 16 },
  empty: { padding: 32, alignItems: "center", borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, borderRadius: radius.md },
  emptyText: { color: colors.text, fontWeight: "700", marginTop: 10 },
  emptySub: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginTop: 6 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: colors.bg2, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, borderTopWidth: 1, borderColor: colors.border },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 20 },
  modalIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: "800", textAlign: "center" },
  modalSub: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginTop: 4, marginBottom: 12 },
  balancePill: { alignSelf: "center", backgroundColor: colors.bg, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: colors.border, marginBottom: 16 },
  balancePillText: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  inputLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, marginBottom: 8 },
  input: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.text, fontSize: 22, fontWeight: "700", padding: 16, textAlign: "center", marginBottom: 20 },
  toggleRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  toggleBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  toggleBtnActive: { backgroundColor: colors.cyan, borderColor: colors.cyan },
  toggleText: { color: colors.textMuted, fontWeight: "700", fontSize: 13 },
  toggleTextActive: { color: colors.bg },
  modalActions: { flexDirection: "row", gap: 12 },
});
