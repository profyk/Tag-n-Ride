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
import { useDocuments } from "../../src/DocumentContext";

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
  const { unreadCount: docsUnreadCount } = useDocuments();

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [allTxns, setAllTxns] = useState<Txn[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [safetyProfileComplete, setSafetyProfileComplete] = useState<boolean | null>(null);
  const [panicHolding, setPanicHolding] = useState(false);
  const [panicTimer, setPanicTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [sendingPanic, setSendingPanic] = useState(false);
  const [fuelModal, setFuelModal] = useState(false);
  const [fuelAmount, setFuelAmount] = useState("");
  const [fuelLoading, setFuelLoading] = useState(false);
  const [cashUpModal, setCashUpModal] = useState(false);
  const [cashUpMethod, setCashUpMethod] = useState<"wallet" | "bank">("wallet");
  const [cashUpAmount, setCashUpAmount] = useState("");
  const [cashUpLoading, setCashUpLoading] = useState(false);
  const [cashupStatus, setCashupStatus] = useState<any>(null);
  const [cashupStatusLoading, setCashupStatusLoading] = useState(false);
  const [driverBank, setDriverBank] = useState<any>(null);
  const [payOutModal, setPayOutModal] = useState(false);
  const [payOutAmount, setPayOutAmount] = useState("");
  const [payOutLoading, setPayOutLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [w, t, hidden, sp] = await Promise.all([
        api.wallet(), api.transactions(), getHidden(),
        api.safetyProfile().catch(() => null),
      ]);
      setWallet(w);
      setAllTxns(t);
      setTxns(t.filter((tx: Txn) => !hidden.includes(tx.id)).slice(0, 5));
      if (sp !== null) setSafetyProfileComplete(!!sp?.profile_complete);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (state.status !== "authed") return null;
  const isDriver = state.user.role === "driver";

  const handlePanicPressIn = () => {
    setPanicHolding(true);
    const t = setTimeout(async () => {
      setPanicHolding(false);
      setSendingPanic(true);
      try {
        const res = await api.safetyPanic({});
        Alert.alert("SOS Sent", res.message || "Your emergency contacts have been notified.");
      } catch (e: any) {
        Alert.alert("SOS Failed", e?.message || "Could not send emergency alert");
      } finally { setSendingPanic(false); }
    }, 3000);
    setPanicTimer(t);
  };

  const handlePanicPressOut = () => {
    if (panicTimer) { clearTimeout(panicTimer); setPanicTimer(null); }
    setPanicHolding(false);
  };

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

  const openCashUpModal = async () => {
    setCashUpModal(true);
    setCashupStatus(null);
    setCashUpAmount("");
    setDriverBank(null);
    setCashupStatusLoading(true);
    try {
      const [status, accounts] = await Promise.all([
        api.driverCashupStatus(),
        api.getPayoutAccounts().catch(() => []),
      ]);
      setCashupStatus(status);
      setCashUpMethod("wallet");
      if (status?.cashup_amount > 0) {
        setCashUpAmount(status.cashup_amount.toFixed(2));
      }
      const ownerAccount = (accounts as any[]).find((a: any) => a.type === "owner");
      setDriverBank(ownerAccount || null);
    } catch {
      setCashupStatus(null);
    } finally {
      setCashupStatusLoading(false);
    }
  };

  const handleCashUp = async () => {
    if (!cashupStatus?.has_owner) return;
    const amount = parseFloat(cashUpAmount);
    if (!cashUpAmount || isNaN(amount) || amount <= 0) {
      Alert.alert("Invalid amount", "Please enter a valid amount."); return;
    }
    if (amount < 5) { Alert.alert("Minimum amount", "Minimum CashUp amount is R5.00."); return; }
    if (amount > (wallet?.balance ?? 0)) {
      Alert.alert("Insufficient balance", `Your wallet balance is ${formatZAR(wallet?.balance ?? 0)}.`); return;
    }
    setCashUpLoading(true);
    try {
      const res = await api.driverCashupV2(cashupStatus.owner_user_id, cashUpMethod, amount);
      setCashUpModal(false); setCashUpAmount("");
      const dest = cashUpMethod === "wallet" ? "owner's wallet" : "owner's bank account";
      const feeNote = res.payout_fee > 0 ? ` · R${res.payout_fee.toFixed(2)} fee deducted` : "";
      Alert.alert("CashUp Done", `${formatZAR(res.cashup_amount)} sent to ${dest}${feeNote}.`);
      load();
    } catch (e: any) {
      const msg = e?.message || "";
      if (msg.includes("bank account") || msg.includes("No bank")) {
        Alert.alert("No bank account", "No bank account found for owner. Ask the owner to set one up, or add it in Profile → Owner Account.");
      } else if (msg.includes("Insufficient")) {
        Alert.alert("Insufficient balance", "Not enough in your wallet to cash up.");
      } else {
        Alert.alert("Failed", msg || "Could not process. Please try again.");
      }
    } finally {
      setCashUpLoading(false);
    }
  };

  const handleCashUpNoOwner = async () => {
    const amount = parseFloat(cashUpAmount);
    if (!cashUpAmount || isNaN(amount) || amount <= 0) {
      Alert.alert("Invalid amount", "Please enter a valid amount."); return;
    }
    if (amount < 5) { Alert.alert("Minimum amount", "Minimum CashUp amount is R5.00."); return; }
    if (amount > (wallet?.balance ?? 0)) {
      Alert.alert("Insufficient balance", `Your wallet balance is ${formatZAR(wallet?.balance ?? 0)}.`); return;
    }
    setCashUpLoading(true);
    try {
      await api.cashup({ amount, type: "owner" });
      setCashUpModal(false); setCashUpAmount("");
      Alert.alert("CashUp Submitted", `${formatZAR(amount)} has been submitted for admin approval. You will be notified once your funds are on their way to the bank account.`);
      load();
    } catch (e: any) {
      const msg = e?.message || "";
      if (msg.includes("owner") || msg.includes("payout account")) {
        Alert.alert("No owner bank account", "Add the owner's banking details in Profile → Owner Account.",
          [{ text: "Go to Profile", onPress: () => { setCashUpModal(false); router.push("/(app)/profile"); } },
           { text: "Cancel", style: "cancel" }]);
      } else if (msg.includes("Insufficient")) {
        Alert.alert("Insufficient balance", "Not enough in your wallet.");
      } else {
        Alert.alert("Failed", msg || "Could not process. Please try again.");
      }
    } finally {
      setCashUpLoading(false);
    }
  };

  const handlePayOut = async () => {
    const amount = parseFloat(payOutAmount);
    if (!payOutAmount || isNaN(amount) || amount <= 0) {
      Alert.alert("Invalid amount", "Please enter a valid amount."); return;
    }
    if (amount < 5) { Alert.alert("Minimum amount", "Minimum payout is R5.00."); return; }
    if (amount > (wallet?.balance ?? 0)) {
      Alert.alert("Insufficient balance", `Your wallet balance is ${formatZAR(wallet?.balance ?? 0)}.`); return;
    }
    setPayOutLoading(true);
    try {
      await api.driverPayout(amount);
      setPayOutModal(false); setPayOutAmount("");
      Alert.alert("Payout Submitted", `${formatZAR(amount)} has been submitted for admin approval. You will be notified once your funds are on their way to your bank account.`);
      load();
    } catch (e: any) {
      const msg = e?.message || "";
      if (msg.includes("payout account") || msg.includes("No saved")) {
        Alert.alert("No bank account", "Add your bank account in Profile → My Account.",
          [{ text: "Go to Profile", onPress: () => { setPayOutModal(false); router.push("/(app)/profile"); } },
           { text: "Cancel", style: "cancel" }]);
      } else if (msg.includes("Insufficient")) {
        Alert.alert("Insufficient balance", "Not enough in your wallet.");
      } else {
        Alert.alert("Failed", msg || "Could not process. Please try again.");
      }
    } finally {
      setPayOutLoading(false);
    }
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
            <TouchableOpacity onPress={() => router.push("/(app)/documents")} style={s.headerBtn} testID="home-docs-btn">
              <Ionicons name="document-text-outline" size={22} color={colors.text} />
              {docsUnreadCount > 0 && (
                <View style={s.badge}><Text style={s.badgeText}>{docsUnreadCount > 9 ? "9+" : docsUnreadCount}</Text></View>
              )}
            </TouchableOpacity>
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

        {/* SafeRide profile incomplete banner */}
        {safetyProfileComplete === false && (
          <TouchableOpacity style={s.safetyBanner} onPress={() => router.push("/(app)/safety")} testID="safety-banner">
            <Ionicons name="warning-outline" size={18} color="#FFD60A" />
            <View style={{ flex: 1 }}>
              <Text style={s.safetyBannerTitle}>Complete your SafeRide profile</Text>
              <Text style={s.safetyBannerSub}>Your emergency contacts are not set up · Tap to complete</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#FFD60A" />
          </TouchableOpacity>
        )}

        {/* Quick actions */}
        <Text style={s.section}>QUICK ACTIONS</Text>
        {isDriver ? (
          <>
            <View style={s.qaRow}>
              <QA icon="qr-code" label="My QR" tone="cyan" colors={colors} onPress={() => router.push("/(app)/action")} testID="qa-myqr" />
              <QA icon="receipt-outline" label="History" tone="muted" colors={colors} onPress={() => router.push("/(app)/transactions")} testID="qa-history" />
              <QA icon="shield-outline" label="SafeRide" tone="green" colors={colors} onPress={() => router.push("/(app)/saferide-trip")} testID="qa-saferide" />
            </View>
            <View style={[s.qaRow, { marginTop: 12 }]}>
              <QA icon="flame-outline" label="Pay Fuel" tone="orange" colors={colors} onPress={() => setFuelModal(true)} testID="qa-payfuel" />
              <QA icon="wallet-outline" label="CashUp" tone="purple" colors={colors} onPress={openCashUpModal} testID="qa-cashup" />
              <QA icon="arrow-up-circle-outline" label="Pay Out" tone="green" colors={colors} onPress={() => { setPayOutAmount(""); setPayOutModal(true); }} testID="qa-payout" />
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

      {/* SOS Panic button */}
      <TouchableOpacity
        style={[s.panicBtn, panicHolding && { transform: [{ scale: 0.92 }] }]}
        onPressIn={handlePanicPressIn}
        onPressOut={handlePanicPressOut}
        disabled={sendingPanic}
        testID="panic-btn">
        {sendingPanic ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={s.panicBtnText}>{panicHolding ? "..." : "SOS"}</Text>
        )}
      </TouchableOpacity>

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

            {cashupStatusLoading ? (
              <ActivityIndicator color={colors.cyan} style={{ marginVertical: 24 }} />
            ) : !cashupStatus?.has_owner ? (
              <>
                {driverBank ? (
                  <>
                    <View style={s.cashupOwnerRow}>
                      <View style={[s.cashupOwnerIcon, { backgroundColor: colors.cyanDim }]}>
                        <Ionicons name="card-outline" size={18} color={colors.cyan} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.cashupOwnerName}>{driverBank.bank_name}</Text>
                        <Text style={s.cashupOwnerSub}>
                          {driverBank.account_number}{driverBank.account_name ? ` · ${driverBank.account_name}` : ""}
                        </Text>
                      </View>
                    </View>
                    <Text style={s.inputLabel}>AMOUNT (ZAR)</Text>
                    <TextInput
                      style={s.input}
                      value={cashUpAmount}
                      onChangeText={setCashUpAmount}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={colors.textDim}
                    />
                    <View style={s.modalActions}>
                      <View style={{ flex: 1 }}><Button label="Cancel" variant="secondary" onPress={() => setCashUpModal(false)} /></View>
                      <View style={{ flex: 1 }}>
                        <Button label="CashUp" onPress={handleCashUpNoOwner} loading={cashUpLoading} />
                      </View>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 }}>
                      <Ionicons name="link-outline" size={16} color={colors.textDim} />
                      <Text style={{ color: colors.textDim, fontSize: 13 }}>No owner linked</Text>
                    </View>
                    <Text style={{ color: colors.text, fontSize: 14, marginBottom: 4 }}>No owner bank account saved.</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 20 }}>
                      Add the owner's banking details in Profile → Owner Account.
                    </Text>
                    <Button label="Go to Profile" onPress={() => { setCashUpModal(false); router.push("/(app)/profile"); }} />
                    <View style={{ marginTop: 8 }}>
                      <Button label="Close" variant="secondary" onPress={() => setCashUpModal(false)} />
                    </View>
                  </>
                )}
              </>
            ) : (
              <>
                {/* Owner info */}
                <View style={s.cashupOwnerRow}>
                  <View style={s.cashupOwnerIcon}>
                    <Ionicons name="business-outline" size={18} color={colors.cyan} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cashupOwnerName}>{cashupStatus.owner_name}</Text>
                    <Text style={s.cashupOwnerSub}>
                      Today's earnings: {formatZAR(cashupStatus.today_earned)}
                      {cashupStatus.cashup_amount < cashupStatus.today_earned
                        ? `  ·  Cashup: ${formatZAR(cashupStatus.cashup_amount)}`
                        : ""}
                    </Text>
                  </View>
                </View>

                {/* Method options */}
                <Text style={s.inputLabel}>SEND TO</Text>
                <TouchableOpacity
                  testID="cashup-method-wallet"
                  onPress={() => setCashUpMethod("wallet")}
                  style={[s.cashupMethodCard, cashUpMethod === "wallet" && s.cashupMethodCardActive]}>
                  <View style={[s.cashupMethodIcon, { backgroundColor: colors.cyanDim }]}>
                    <Ionicons name="phone-portrait-outline" size={20} color={colors.cyan} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.cashupMethodLabel, cashUpMethod === "wallet" && { color: colors.cyan }]}>
                      Tag n Ride Wallet
                    </Text>
                    <Text style={s.cashupMethodSub}>Instant · Free · Owner's in-app wallet</Text>
                  </View>
                  {cashUpMethod === "wallet" && <Ionicons name="checkmark-circle" size={20} color={colors.cyan} />}
                </TouchableOpacity>

                <TouchableOpacity
                  testID="cashup-method-bank"
                  onPress={() => setCashUpMethod("bank")}
                  style={[s.cashupMethodCard, cashUpMethod === "bank" && s.cashupMethodCardActiveBank]}>
                  <View style={[s.cashupMethodIcon, { backgroundColor: "rgba(160,100,255,0.12)" }]}>
                    <Ionicons name="card-outline" size={20} color="#A064FF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.cashupMethodLabel, cashUpMethod === "bank" && { color: "#A064FF" }]}>
                      Bank Account
                    </Text>
                    <Text style={s.cashupMethodSub}>Owner's bank account · R3.50 fee</Text>
                  </View>
                  {cashUpMethod === "bank" && <Ionicons name="checkmark-circle" size={20} color="#A064FF" />}
                </TouchableOpacity>

                {/* Amount input */}
                <Text style={s.inputLabel}>AMOUNT (ZAR)</Text>
                <TextInput
                  style={s.input}
                  value={cashUpAmount}
                  onChangeText={setCashUpAmount}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.textDim}
                  testID="cashup-amount-input"
                />
                {cashUpMethod === "bank" && (
                  <Text style={s.cashupAmountFee}>R3.50 bank transfer fee will be deducted</Text>
                )}

                <View style={s.modalActions}>
                  <View style={{ flex: 1 }}><Button label="Cancel" variant="secondary" onPress={() => setCashUpModal(false)} /></View>
                  <View style={{ flex: 1 }}>
                    <Button
                      label="CashUp"
                      onPress={handleCashUp}
                      loading={cashUpLoading}
                      testID="cashup-confirm-btn"
                    />
                  </View>
                </View>
              </>
            )}

          </View>
        </View>
      </Modal>
      {/* Pay Out modal */}
      <Modal visible={payOutModal} transparent animationType="slide" onRequestClose={() => setPayOutModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <View style={[s.modalIconWrap, { backgroundColor: colors.greenDim, borderColor: colors.green }]}>
              <Ionicons name="arrow-up-circle-outline" size={28} color={colors.green} />
            </View>
            <Text style={s.modalTitle}>Pay Out</Text>
            <Text style={s.modalSub}>Withdraw to your bank account set in Profile.</Text>
            {wallet && <View style={s.balancePill}><Text style={s.balancePillText}>Available: {formatZAR(wallet.balance)}</Text></View>}
            <Text style={s.inputLabel}>AMOUNT (ZAR)</Text>
            <TextInput
              style={s.input}
              value={payOutAmount}
              onChangeText={setPayOutAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textDim}
              testID="payout-amount-input"
            />
            <View style={s.modalActions}>
              <View style={{ flex: 1 }}>
                <Button label="Cancel" variant="secondary" onPress={() => { setPayOutModal(false); setPayOutAmount(""); }} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Pay Out" onPress={handlePayOut} loading={payOutLoading} testID="payout-confirm-btn" />
              </View>
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
  cashupOwnerRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 16 },
  cashupOwnerIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.cyanDim, alignItems: "center", justifyContent: "center" },
  cashupOwnerName: { color: colors.text, fontWeight: "700", fontSize: 14 },
  cashupOwnerSub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  cashupMethodCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, padding: 14, marginBottom: 10 },
  cashupMethodCardActive: { borderColor: colors.cyan, backgroundColor: colors.cyanDim },
  cashupMethodCardActiveBank: { borderColor: "#A064FF", backgroundColor: "rgba(160,100,255,0.10)" },
  cashupMethodIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  cashupMethodLabel: { color: colors.text, fontWeight: "700", fontSize: 14 },
  cashupMethodSub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  cashupAmountPreview: { backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, alignItems: "center", marginBottom: 16, marginTop: 4 },
  cashupAmountLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 1.4 },
  cashupAmountVal: { color: colors.text, fontSize: 28, fontWeight: "900", marginTop: 4 },
  cashupAmountFee: { color: colors.red, fontSize: 11, marginTop: 4 },
  safetyBanner: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#FFD60A15", borderRadius: 10, borderWidth: 1, borderColor: "#FFD60A40", padding: 12, marginBottom: 16 },
  safetyBannerTitle: { color: "#FFD60A", fontWeight: "700", fontSize: 13 },
  safetyBannerSub: { color: "#FFD60Aaa", fontSize: 11, marginTop: 1 },
  panicBtn: { position: "absolute", bottom: 32, right: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: colors.red, alignItems: "center", justifyContent: "center", elevation: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, borderWidth: 3, borderColor: colors.red + "60" },
  panicBtnText: { color: "#fff", fontWeight: "900", fontSize: 13, letterSpacing: 1 },
});
