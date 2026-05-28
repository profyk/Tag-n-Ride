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
}

function todayStr() {
  return new Date().toDateString();
}

/** Compute today's fare breakdown from transaction list */
function computeTodayBreakdown(txns: Txn[], walletGross?: number, walletFee?: number) {
  const payments = txns.filter(
    (t) =>
      t.type === "payment" &&
      t.direction === "in" &&
      t.status === "completed" &&
      new Date(t.created_at).toDateString() === todayStr()
  );

  if (walletGross !== undefined) {
    return {
      gross: walletGross,
      fee: walletFee ?? 0,
      net: walletGross - (walletFee ?? 0),
      trips: payments.length,
    };
  }

  // Derive from individual transactions
  const gross = payments.reduce((s, t) => s + (t.gross_amount ?? t.amount + (t.platform_fee ?? 0)), 0);
  const fee = payments.reduce((s, t) => s + (t.platform_fee ?? 0), 0);
  const net = gross - fee;
  return { gross, fee, net, trips: payments.length };
}

export default function Home() {
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
  };

  const s = makeStyles(colors);
  const breakdown = isDriver && wallet ? computeTodayBreakdown(allTxns, wallet.today_gross, wallet.today_platform_fee) : null;

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="home-screen">
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.cyan} />}>

        {/* Header */}
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

        {/* ── Driver balance card ── */}
        {isDriver ? (
          <View style={s.balanceCard} testID="balance-card">
            <View style={s.balanceCardGlow} />

            {/* Fare collected header */}
            <View style={s.fareHeader}>
              <View style={s.fareIconWrap}>
                <Ionicons name="cash-outline" size={16} color={colors.cyan} />
              </View>
              <Text style={s.fareHeaderLabel}>FARE COLLECTED TODAY</Text>
              {breakdown && breakdown.trips > 0 && (
                <View style={s.tripBadge}>
                  <Text style={s.tripBadgeText}>{breakdown.trips} trip{breakdown.trips !== 1 ? "s" : ""}</Text>
                </View>
              )}
            </View>

            {/* Gross fare — what passengers paid */}
            {loading || !wallet ? (
              <ActivityIndicator color={colors.cyan} style={{ marginTop: 16 }} />
            ) : (
              <>
                <Text style={s.grossFare} testID="gross-fare">
                  {formatZAR(breakdown?.gross ?? wallet.today_total ?? 0)}
                </Text>
                <Text style={s.grossFareLabel}>Gross fare paid by passengers</Text>

                {/* Platform fee line */}
                {(breakdown?.fee ?? 0) > 0 && (
                  <View style={s.feeRow}>
                    <Ionicons name="remove-circle-outline" size={13} color={colors.red} />
                    <Text style={s.feeLabel}>Platform fee</Text>
                    <Text style={s.feeAmt}>−{formatZAR(breakdown!.fee)}</Text>
                  </View>
                )}

                {/* Divider */}
                <View style={s.divider} />

                {/* Bottom 3-column breakdown */}
                <View style={s.bottomRow}>
                  <View style={s.bottomStat}>
                    <Text style={s.bottomStatLabel}>TOTAL BALANCE</Text>
                    <Text style={[s.bottomStatVal, { color: colors.text }]} testID="balance-amount">
                      {formatZAR(wallet.balance)}
                    </Text>
                  </View>
                  <View style={[s.bottomStat, s.bottomStatCenter]}>
                    <Text style={s.bottomStatLabel}>PLATFORM FEE</Text>
                    <Text style={[s.bottomStatVal, { color: colors.red }]}>
                      −{formatZAR(breakdown?.fee ?? 0)}
                    </Text>
                  </View>
                  <View style={[s.bottomStat, { alignItems: "flex-end" }]}>
                    <Text style={s.bottomStatLabel}>AVAILABLE</Text>
                    <Text style={[s.bottomStatVal, { color: colors.green }]}>
                      {formatZAR(wallet.balance)}
                    </Text>
                  </View>
                </View>

                {/* Rating row */}
                {(wallet.rating_count ?? 0) > 0 && (
                  <View style={s.ratingRow}>
                    <Ionicons name="star" size={12} color="#FFD60A" />
                    <Text style={s.ratingText}>
                      {wallet.rating_avg?.toFixed(1)} rating · {wallet.rating_count} review{wallet.rating_count !== 1 ? "s" : ""}
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>
        ) : (
          /* ── Passenger balance card (unchanged) ── */
          <View style={s.balanceCard} testID="balance-card">
            <View style={s.balanceCardGlow} />
            <Text style={s.balanceLabel}>WALLET BALANCE · ZAR</Text>
            {loading || !wallet ? (
              <ActivityIndicator color={colors.cyan} style={{ marginTop: 16 }} />
            ) : (
              <Text style={s.balanceAmt} testID="balance-amount">{formatZAR(wallet.balance)}</Text>
            )}
          </View>
        )}

        {/* Quick actions */}
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

        {/* Recent transactions */}
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

      {/* Pay Fuel modal */}
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

      {/* CashUp modal */}
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
  const sign = isIn ? "+" : "−";
  const color = isIn ? colors.green : colors.text;
  const icon = t.type === "topup" ? "arrow-down" : isWithdraw ? "cash-outline" : isIn ? "arrow-down-circle" : "arrow-up-circle";
  const title = t.type === "topup" ? "Wallet top-up" : isWithdraw ? "Withdrawal" : t.counterparty_name || "Transfer";

  // Show gross for incoming payments when available
  const displayAmt = isIn && t.type === "payment" && t.gross_amount ? t.gross_amount : t.amount;
  const hasFee = isIn && t.type === "payment" && (t.platform_fee ?? 0) > 0;

  return (
    <View style={{ position: "relative" }}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 14, paddingRight: 38, backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: 12 }} testID={`txn-${t.id}`}>
        <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: isIn ? colors.greenDim : colors.cyanDim }}>
          <Ionicons name={icon as any} size={18} color={isIn ? colors.green : colors.cyan} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 14 }}>{title}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{formatDate(t.created_at)} · {t.reference}</Text>
          {hasFee && (
            <Text style={{ color: colors.textDim, fontSize: 10, marginTop: 1 }}>
              Fee: −{formatZAR(t.platform_fee!)} · Net: {formatZAR(t.driver_net ?? t.amount)}
            </Text>
          )}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontWeight: "800", fontSize: 15, color }}>{sign}{formatZAR(displayAmt)}</Text>
          {hasFee && (
            <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: 1 }}>
              You receive {formatZAR(t.driver_net ?? t.amount)}
            </Text>
          )}
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

  // Driver balance card
  balanceCard: { backgroundColor: colors.bg2, borderColor: colors.cyan, borderWidth: 1, borderRadius: radius.lg, padding: 20, overflow: "hidden", marginBottom: 4 },
  balanceCardGlow: { position: "absolute", top: -50, right: -50, width: 200, height: 200, borderRadius: 100, backgroundColor: colors.cyan, opacity: 0.06 },

  // Fare header
  fareHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  fareIconWrap: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.cyanDim, alignItems: "center", justifyContent: "center" },
  fareHeaderLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, flex: 1 },
  tripBadge: { backgroundColor: colors.cyanDim, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  tripBadgeText: { color: colors.cyan, fontSize: 10, fontWeight: "700" },

  // Gross fare number
  grossFare: { color: colors.text, fontSize: 40, fontWeight: "800", letterSpacing: -1, marginBottom: 2 },
  grossFareLabel: { color: colors.textDim, fontSize: 11, marginBottom: 10 },

  // Platform fee row
  feeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: "rgba(255,60,60,0.07)", borderRadius: radius.sm, borderWidth: 1, borderColor: "rgba(255,60,60,0.15)" },
  feeLabel: { color: colors.textMuted, fontSize: 12, flex: 1 },
  feeAmt: { color: colors.red, fontSize: 13, fontWeight: "800" },

  // Divider
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },

  // Bottom 3-column breakdown
  bottomRow: { flexDirection: "row", alignItems: "flex-start" },
  bottomStat: { flex: 1 },
  bottomStatCenter: { alignItems: "center" },
  bottomStatLabel: { color: colors.textDim, fontSize: 9, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 },
  bottomStatVal: { fontSize: 14, fontWeight: "800", letterSpacing: -0.3 },

  // Rating
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  ratingText: { color: colors.textMuted, fontSize: 11, fontWeight: "600" },

  // Passenger card
  balanceLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700", letterSpacing: 1.4, marginBottom: 8 },
  balanceAmt: { color: colors.text, fontSize: 38, fontWeight: "800", marginTop: 8, letterSpacing: -1 },

  // Shared
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
