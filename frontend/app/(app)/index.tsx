import React, { useCallback, useState, useEffect, useRef } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert, TextInput, Modal, StyleSheet, Share,
} from "react-native";
import * as Location from "expo-location";
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
  const [sendingPanic, setSendingPanic] = useState(false);
  const [passengerTrip, setPassengerTrip] = useState<any>(null);

  // SOS state
  const [sosModal, setSosModal] = useState(false);
  const [sosEmergencyType, setSosEmergencyType] = useState<"police" | "ambulance" | null>(null);
  const [sosLocation, setSosLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [sosLocationLoading, setSosLocationLoading] = useState(false);
  const [sosActive, setSosActive] = useState(false);
  const [activeSosId, setActiveSosId] = useState<string | null>(null);
  const [sosHelpComing, setSosHelpComing] = useState(false);
  const [sosTapCount, setSosTapCount] = useState(0);
  const sosTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sosLocationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sosHelpComingRef = useRef(false);
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
  const [trackMeLoading, setTrackMeLoading] = useState(false);
  const [trackMeSession, setTrackMeSession] = useState<{ id: string; share_url: string } | null>(null);
  const [trackMeFee, setTrackMeFee] = useState<number>(3);
  const [trackMeConfirmModal, setTrackMeConfirmModal] = useState(false);
  const [trackMeStartLocation, setTrackMeStartLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const trackMePingRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      // Passenger: check active trip + active track-me session + fee
      if (state.status === "authed" && state.user.role === "passenger") {
        const [pt, tm, fee] = await Promise.all([
          api.tripsPassengerCurrent().catch(() => null),
          api.trackMeActive().catch(() => null),
          api.trackMeFee().catch(() => null),
        ]);
        setPassengerTrip(pt?.trip || null);
        if (tm?.session) {
          setTrackMeSession({ id: tm.session.id, share_url: tm.session.share_url });
        }
        if (fee?.fee !== undefined) setTrackMeFee(fee.fee);
      }
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (state.status !== "authed") return null;
  const isDriver = state.user.role === "driver";

  const openSosModal = async () => {
    setSosModal(true);
    setSosEmergencyType(null);
    setSosLocation(null);
    setSosLocationLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setSosLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      }
    } catch {} finally { setSosLocationLoading(false); }
  };

  const closeSosModal = () => {
    setSosModal(false);
    setSosLocation(null);
    setSosEmergencyType(null);
  };

  const startSosLocationPing = (sosId: string) => {
    sosHelpComingRef.current = false;
    if (sosLocationIntervalRef.current) clearInterval(sosLocationIntervalRef.current);
    sosLocationIntervalRef.current = setInterval(async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== "granted") return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const res = await api.sosLocationPing(sosId, { latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        if (res.resolved) {
          clearInterval(sosLocationIntervalRef.current!);
          sosLocationIntervalRef.current = null;
          setSosActive(false);
          setActiveSosId(null);
          setSosHelpComing(false);
        } else if (res.help_coming && !sosHelpComingRef.current) {
          sosHelpComingRef.current = true;
          setSosHelpComing(true);
        }
      } catch {}
    }, 10000);
  };

  const triggerSOS = async () => {
    if (!sosEmergencyType) return;
    setSosModal(false);
    setSendingPanic(true);
    try {
      const res = await api.sosRequest({
        emergency_type: sosEmergencyType,
        latitude: sosLocation?.latitude,
        longitude: sosLocation?.longitude,
      });
      setActiveSosId(res.sos_id);
      setSosActive(true);
      startSosLocationPing(res.sos_id);
      const label = sosEmergencyType === "police" ? "Police" : "Ambulance";
      Alert.alert(
        "SOS Sent",
        `${label} request sent to admin. Our team is contacting emergency services on your behalf. Stay calm and stay on the line.`,
        [{ text: "OK" }]
      );
    } catch (e: any) {
      Alert.alert("SOS Failed", e?.message || "Could not send — call 10111 (Police) or 10177 (Ambulance) immediately.");
    } finally { setSendingPanic(false); }
  };

  const handleSosTap = () => {
    if (sendingPanic || sosActive) return;
    const newCount = sosTapCount + 1;
    setSosTapCount(newCount);
    if (sosTapTimerRef.current) clearTimeout(sosTapTimerRef.current);
    if (newCount >= 3) {
      setSosTapCount(0);
      openSosModal();
      return;
    }
    sosTapTimerRef.current = setTimeout(() => setSosTapCount(0), 1500);
  };

  const cancelActiveSos = () => {
    if (sosLocationIntervalRef.current) { clearInterval(sosLocationIntervalRef.current); sosLocationIntervalRef.current = null; }
    setSosActive(false);
    setActiveSosId(null);
    setSosHelpComing(false);
    sosHelpComingRef.current = false;
    Alert.alert("SOS Cancelled", "Your live tracking has stopped. Contact 10111 or 10177 if you still need help.");
  };

  const confirmHelpReceived = async () => {
    if (!activeSosId) return;
    try {
      await api.sosReceived(activeSosId);
    } catch {}
    if (sosLocationIntervalRef.current) { clearInterval(sosLocationIntervalRef.current); sosLocationIntervalRef.current = null; }
    setSosActive(false);
    setActiveSosId(null);
    setSosHelpComing(false);
    sosHelpComingRef.current = false;
    Alert.alert("Thank you", "We're glad help arrived. Stay safe!");
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
    if (!cashupStatus?.has_owner) {
      Alert.alert("No Owner", "You are not linked to a fleet owner. Use the Payout button to send funds to your own bank account.");
      return;
    }
    const amount = parseFloat(cashUpAmount);
    if (!cashUpAmount || isNaN(amount) || amount <= 0) {
      Alert.alert("Invalid amount", "Please enter a valid amount."); return;
    }
    if (amount < 5) { Alert.alert("Minimum amount", "Minimum CashUp amount is R5.00."); return; }
    if (amount > (wallet?.balance ?? 0)) {
      Alert.alert("Insufficient balance", `Your wallet balance is ${formatZAR(wallet?.balance ?? 0)}.`); return;
    }
    const dest = cashUpMethod === "wallet" ? "owner's wallet (free)" : `owner's bank account (R3.50 fee)`;
    const confirmed = await new Promise<boolean>(resolve =>
      Alert.alert(
        "Confirm CashUp",
        `Send ${formatZAR(amount)} to ${dest}?\n\nThis cannot be undone.`,
        [
          { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
          { text: "Confirm CashUp", onPress: () => resolve(true) },
        ]
      )
    );
    if (!confirmed) return;
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
    const confirmed = await new Promise<boolean>(resolve =>
      Alert.alert(
        "Confirm Payout",
        `Submit ${formatZAR(amount)} for admin approval?\n\nFunds will be sent to your registered bank account.`,
        [
          { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
          { text: "Confirm", onPress: () => resolve(true) },
        ]
      )
    );
    if (!confirmed) return;
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
    const confirmed = await new Promise<boolean>(resolve =>
      Alert.alert(
        "Confirm Payout",
        `Withdraw ${formatZAR(amount)} to your bank account?\n\nR3.50 fee applies. Arrives within seconds.`,
        [
          { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
          { text: "Withdraw", onPress: () => resolve(true) },
        ]
      )
    );
    if (!confirmed) return;
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

  const stopTrackMePing = () => {
    if (trackMePingRef.current) { clearInterval(trackMePingRef.current); trackMePingRef.current = null; }
  };

  const startTrackMePing = (sessionId: string) => {
    stopTrackMePing();
    trackMePingRef.current = setInterval(async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== "granted") return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        await api.trackMePing(sessionId, {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          accuracy: loc.coords.accuracy ?? undefined,
        });
      } catch {}
    }, 30000);
  };

  const handleTrackMeStop = async () => {
    if (!trackMeSession) return;
    stopTrackMePing();
    try { await api.trackMeEnd(trackMeSession.id); } catch {}
    setTrackMeSession(null);
    Alert.alert("Tracking stopped", "Your live location sharing has ended.");
  };

  const handleTrackMeOpenConfirm = async () => {
    // If already in a taxi trip — free, share instantly
    if (passengerTrip) {
      setTrackMeLoading(true);
      try {
        const res = await api.tripsShare({ trip_id: passengerTrip.id });
        await Share.share({
          message: `🛡️ I'm in a Tag n Ride taxi right now. Track me live:\n\n${res.share_url}${passengerTrip.vehicle_plate ? `\n\nVehicle: ${passengerTrip.vehicle_plate}` : ""}\n\nUpdates every 30 seconds.`,
          url: res.share_url,
        });
      } catch (e: any) {
        if (e?.message !== "User did not share") Alert.alert("Could not share", e?.message || "Please try again.");
      } finally { setTrackMeLoading(false); }
      return;
    }
    // Standalone session — get location first, then show confirm
    setTrackMeLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setTrackMeStartLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      } else {
        setTrackMeStartLocation(null);
      }
    } catch { setTrackMeStartLocation(null); }
    finally { setTrackMeLoading(false); }
    setTrackMeConfirmModal(true);
  };

  const handleTrackMeStart = async () => {
    setTrackMeConfirmModal(false);
    setTrackMeLoading(true);
    try {
      const res = await api.trackMeStart({
        latitude: trackMeStartLocation?.latitude,
        longitude: trackMeStartLocation?.longitude,
      });
      setTrackMeSession({ id: res.session_id, share_url: res.share_url });
      startTrackMePing(res.session_id);
      await Share.share({
        message: `🛡️ I've started a live safety tracker. Track my location here:\n\n${res.share_url}\n\nUpdates every 30 seconds while I have the app open.`,
        url: res.share_url,
      });
    } catch (e: any) {
      if (e?.message !== "User did not share") Alert.alert("Could not start", e?.message || "Please try again.");
    } finally { setTrackMeLoading(false); }
  };

  const s = makeStyles(colors);
  const breakdown = isDriver && wallet ? computeTodayBreakdown(allTxns, wallet.today_gross, wallet.today_platform_fee) : null;

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="home-screen">

      {/* ─── FIXED TOP NAV BAR ─── */}
      <View style={s.topBar}>
        <View>
          <Text style={s.hello}>Hello,</Text>
          <Text style={s.name} testID="home-username">{state.user.full_name.split(" ")[0]} 👋</Text>
        </View>
        <View style={s.headerActions}>
          <TouchableOpacity onPress={() => router.push("/(app)/notifications")} style={s.headerBtn} testID="home-inbox-btn">
            <Ionicons name="notifications-outline" size={22} color={colors.text} />
            {(unreadCount + docsUnreadCount) > 0 && (
              <View style={s.badge}><Text style={s.badgeText}>{(unreadCount + docsUnreadCount) > 9 ? "9+" : (unreadCount + docsUnreadCount)}</Text></View>
            )}
          </TouchableOpacity>
          {/* SOS button in top bar — tap 3× to open */}
          <TouchableOpacity
            style={[s.sosBtn, sosActive && (sosHelpComing
              ? { backgroundColor: "#15803d", borderWidth: 2, borderColor: "#4ade80" }
              : { backgroundColor: "#cc0000", borderWidth: 2, borderColor: "#ff6666" })]}
            onPress={sosActive ? cancelActiveSos : handleSosTap}
            disabled={sendingPanic}
            testID="panic-btn">
            {sendingPanic
              ? <ActivityIndicator color="#fff" size="small" />
              : sosActive
                ? <Text style={[s.sosBtnText, { fontSize: 8 }]}>{sosHelpComing ? "HELP\nCOMING" : "● LIVE"}</Text>
                : <Text style={s.sosBtnText}>{sosTapCount > 0 ? `${sosTapCount}×` : "SOS"}</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/(app)/profile")} testID="home-profile-btn" style={s.avatar}>
            <Ionicons name={isDriver ? "car-sport" : "person"} size={22} color={colors.cyan} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── HELP COMING BANNER ─── */}
      {sosHelpComing && (
        <View style={{ marginHorizontal: 16, marginTop: 10, borderRadius: 14, backgroundColor: "#14532d", borderWidth: 2, borderColor: "#4ade80", padding: 14, alignItems: "center", gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="checkmark-circle" size={22} color="#4ade80" />
            <Text style={{ color: "#4ade80", fontWeight: "900", fontSize: 16, letterSpacing: 0.5 }}>HELP IS ON THE WAY</Text>
          </View>
          <Text style={{ color: "#86efac", fontSize: 12, textAlign: "center" }}>Admin has acknowledged your SOS. Stay calm and keep your phone with you.</Text>
          <TouchableOpacity
            onPress={() => Alert.alert(
              "Received Help?",
              "Press confirm only when help has physically arrived.",
              [
                { text: "Not Yet", style: "cancel" },
                { text: "Confirm — Help Arrived", style: "default", onPress: confirmHelpReceived },
              ]
            )}
            style={{ backgroundColor: "#15803d", borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24, borderWidth: 1, borderColor: "#4ade80" }}>
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 14 }}>Received Help</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ─── FIXED WALLET CARD ─── */}
      <View style={s.walletCardWrap}>
        {isDriver ? (
          <View style={s.balanceCard} testID="balance-card">
            <View style={s.balanceCardGlow} />
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
            {loading || !wallet ? (
              <ActivityIndicator color={colors.cyan} style={{ marginTop: 16 }} />
            ) : (
              <>
                <Text style={s.grossFare} testID="gross-fare">
                  {formatZAR(breakdown?.gross ?? wallet.today_total ?? 0)}
                </Text>
                <Text style={s.grossFareLabel}>Gross fare paid by passengers</Text>
                {(breakdown?.fee ?? 0) > 0 && (
                  <View style={s.feeRow}>
                    <Ionicons name="remove-circle-outline" size={13} color={colors.red} />
                    <Text style={s.feeLabel}>Platform fee</Text>
                    <Text style={s.feeAmt}>−{formatZAR(breakdown!.fee)}</Text>
                  </View>
                )}
                <View style={s.divider} />
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
      </View>

      {/* ─── SCROLLABLE BODY ─── */}
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.cyan} />}>

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

        {/* Passenger: you are in a SafeRide trip */}
        {!isDriver && passengerTrip && (
          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#00E5FF10", borderWidth: 1.5, borderColor: "#00E5FF40", borderRadius: 12, padding: 14, marginBottom: 16, gap: 10 }} testID="passenger-trip-banner">
            <Ionicons name="shield-checkmark-outline" size={20} color="#00E5FF" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#00E5FF", fontWeight: "700", fontSize: 13 }}>You are in a SafeRide trip</Text>
              {passengerTrip.vehicle_plate ? <Text style={{ color: "#00E5FFaa", fontSize: 11, marginTop: 1 }}>Vehicle: {passengerTrip.vehicle_plate}</Text> : null}
            </View>
            <TouchableOpacity
              style={{ backgroundColor: "#00E5FF20", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: "#00E5FF50" }}
              onPress={async () => {
                if (!passengerTrip?.id) return;
                try {
                  const res = await api.tripsShare({ trip_id: passengerTrip.id });
                  await Share.share({
                    message: `I am in a Tag n Ride trip right now.\nTrack my journey for my safety:\n${res.share_url}${passengerTrip.vehicle_plate ? `\nVehicle: ${passengerTrip.vehicle_plate}` : ""}`,
                    url: res.share_url,
                  });
                } catch (e: any) {
                  if (e?.message !== "User did not share") {
                    Alert.alert("Could not share", e?.message || "Please try again.");
                  }
                }
              }}>
              <Text style={{ color: "#00E5FF", fontWeight: "700", fontSize: 12 }}>SHARE</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Quick actions */}
        <Text style={s.section}>QUICK ACTIONS</Text>
        {isDriver ? (
          <>
            <View style={s.qaRow}>
              <QA icon="qr-code" label="My QR" tone="cyan" colors={colors} onPress={() => router.push("/(app)/action")} testID="qa-myqr" />
              <QA icon="receipt-outline" label="History" tone="muted" colors={colors} onPress={() => router.push("/(app)/transactions")} testID="qa-history" />
              <QA icon="car-sport-outline" label="Trip Centre" tone="cyan" colors={colors} onPress={() => router.push("/(app)/trip-centre")} testID="qa-tripcentre" />
            </View>
            <View style={[s.qaRow, { marginTop: 12 }]}>
              <QA icon="flame-outline" label="Pay Fuel" tone="orange" colors={colors} onPress={() => setFuelModal(true)} testID="qa-payfuel" />
              <QA icon="wallet-outline" label="CashUp" tone="purple" colors={colors} onPress={openCashUpModal} testID="qa-cashup" />
              <QA icon="arrow-up-circle-outline" label="Pay Out" tone="green" colors={colors} onPress={() => { setPayOutAmount(""); setPayOutModal(true); }} testID="qa-payout" />
            </View>
          </>
        ) : (
          <>
            <View style={s.qaRow}>
              <QA icon="scan" label="Scan & Pay" tone="cyan" colors={colors} onPress={() => router.push("/(app)/action")} testID="qa-scan" />
              <QA icon="add-circle-outline" label="Top Up" tone="green" colors={colors} onPress={() => router.push("/topup")} testID="qa-topup" />
              <QA icon="receipt-outline" label="History" tone="muted" colors={colors} onPress={() => router.push("/(app)/transactions")} testID="qa-history" />
            </View>
            {/* Track Me — safety quick action */}
            <TouchableOpacity
              testID="qa-trackme"
              onPress={trackMeSession ? handleTrackMeStop : handleTrackMeOpenConfirm}
              activeOpacity={0.85}
              disabled={trackMeLoading}
              style={[
                s.trackMeBtn,
                trackMeSession
                  ? { borderColor: "#4ade8050", backgroundColor: "rgba(74,222,128,0.05)" }
                  : passengerTrip
                    ? { borderColor: "#00E5FF50", backgroundColor: "rgba(0,229,255,0.05)" }
                    : { borderColor: colors.border, backgroundColor: colors.bg2 },
              ]}>
              <View style={[
                s.trackMeIconWrap,
                { backgroundColor: trackMeSession ? "rgba(74,222,128,0.14)" : passengerTrip ? "rgba(0,229,255,0.14)" : "rgba(128,128,128,0.1)" },
              ]}>
                {trackMeLoading
                  ? <ActivityIndicator size="small" color={trackMeSession ? "#4ade80" : "#00E5FF"} />
                  : <Ionicons name="navigate" size={22} color={trackMeSession ? "#4ade80" : passengerTrip ? "#00E5FF" : colors.textMuted} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: trackMeSession ? "#4ade80" : passengerTrip ? "#00E5FF" : colors.text, fontWeight: "700", fontSize: 14 }}>
                  Track Me
                </Text>
                <Text style={{ color: trackMeSession ? "#4ade8090" : passengerTrip ? "#00E5FF90" : colors.textMuted, fontSize: 11, marginTop: 2 }}>
                  {trackMeSession
                    ? "Broadcasting live · tap to stop"
                    : passengerTrip
                      ? "Share taxi live location · free"
                      : `Share your location anytime · R${trackMeFee.toFixed(2)}`}
                </Text>
              </View>
              {trackMeSession ? (
                <View style={s.trackMeLiveBadge}>
                  <View style={s.trackMeLiveDot} />
                  <Text style={s.trackMeLiveText}>LIVE</Text>
                </View>
              ) : passengerTrip ? (
                <View style={[s.trackMeLiveBadge, { borderColor: "rgba(0,229,255,0.25)", backgroundColor: "rgba(0,229,255,0.12)" }]}>
                  <View style={[s.trackMeLiveDot, { backgroundColor: "#00E5FF" }]} />
                  <Text style={[s.trackMeLiveText, { color: "#00E5FF" }]}>FREE</Text>
                </View>
              ) : (
                <Ionicons name="share-social-outline" size={18} color={colors.textDim} />
              )}
            </TouchableOpacity>
          </>
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

      {/* SOS Modal */}
      <Modal visible={sosModal} transparent animationType="slide" onRequestClose={closeSosModal}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { borderTopColor: colors.red + "80" }]}>
            <View style={s.modalHandle} />

            {/* Header */}
            <View style={{ alignItems: "center", marginBottom: 6 }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.red + "20", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                <Ionicons name="warning" size={28} color={colors.red} />
              </View>
              <Text style={{ color: colors.red, fontSize: 20, fontWeight: "900", letterSpacing: 1 }}>EMERGENCY SOS</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>Select the type of emergency — admin will contact services on your behalf</Text>
            </View>

            {/* Emergency type buttons */}
            <Text style={[s.inputLabel, { textAlign: "center", marginTop: 8, marginBottom: 10 }]}>WHAT DO YOU NEED?</Text>
            <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
              <TouchableOpacity
                onPress={() => setSosEmergencyType("police")}
                style={{ flex: 1, paddingVertical: 20, borderRadius: 14, borderWidth: 2,
                  borderColor: sosEmergencyType === "police" ? "#3B82F6" : colors.border,
                  backgroundColor: sosEmergencyType === "police" ? "#3B82F620" : colors.bg,
                  alignItems: "center", gap: 8 }}>
                <Ionicons name="shield" size={32} color={sosEmergencyType === "police" ? "#3B82F6" : colors.textMuted} />
                <Text style={{ fontWeight: "900", fontSize: 15, color: sosEmergencyType === "police" ? "#3B82F6" : colors.textMuted, letterSpacing: 0.5 }}>POLICE</Text>
                <Text style={{ fontSize: 10, color: colors.textDim, textAlign: "center" }}>Crime · Threat{"\n"}Assault · Hijacking</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setSosEmergencyType("ambulance")}
                style={{ flex: 1, paddingVertical: 20, borderRadius: 14, borderWidth: 2,
                  borderColor: sosEmergencyType === "ambulance" ? colors.red : colors.border,
                  backgroundColor: sosEmergencyType === "ambulance" ? colors.red + "20" : colors.bg,
                  alignItems: "center", gap: 8 }}>
                <Ionicons name="medkit" size={32} color={sosEmergencyType === "ambulance" ? colors.red : colors.textMuted} />
                <Text style={{ fontWeight: "900", fontSize: 15, color: sosEmergencyType === "ambulance" ? colors.red : colors.textMuted, letterSpacing: 0.5 }}>AMBULANCE</Text>
                <Text style={{ fontSize: 10, color: colors.textDim, textAlign: "center" }}>Medical emergency{"\n"}Accident · Injury</Text>
              </TouchableOpacity>
            </View>

            {/* Location status */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.bg, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: colors.border, marginBottom: 16 }}>
              <Ionicons name="location-outline" size={16} color={sosLocation ? colors.green : colors.textMuted} />
              {sosLocationLoading
                ? <ActivityIndicator size="small" color={colors.cyan} />
                : sosLocation
                  ? <Text style={{ color: colors.green, fontSize: 12, fontWeight: "600" }}>Location acquired — will be sent with your SOS</Text>
                  : <Text style={{ color: colors.textMuted, fontSize: 12 }}>Acquiring location… enable GPS for best response</Text>}
            </View>

            {/* Info note */}
            <View style={{ backgroundColor: colors.bg2 || colors.bg, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: colors.border, marginBottom: 16 }}>
              <Text style={{ color: colors.textMuted, fontSize: 11, lineHeight: 17 }}>
                Admin will contact emergency services on your behalf and share your live location. Emergency contacts will also receive an SMS. A service fee applies after resolution.
              </Text>
            </View>

            {/* Actions */}
            <View style={s.modalActions}>
              <View style={{ flex: 1 }}>
                <Button label="Cancel" variant="secondary" onPress={closeSosModal} />
              </View>
              <TouchableOpacity onPress={triggerSOS} disabled={!sosEmergencyType}
                style={{ flex: 1, backgroundColor: sosEmergencyType ? colors.red : colors.border, borderRadius: 10, paddingVertical: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }}>
                <Ionicons name="flash" size={16} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "900", fontSize: 14, letterSpacing: 0.5 }}>SEND SOS</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
      {/* Track Me confirm modal */}
      <Modal visible={trackMeConfirmModal} transparent animationType="slide" onRequestClose={() => setTrackMeConfirmModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <View style={[s.modalIconWrap, { backgroundColor: "rgba(0,229,255,0.08)", borderColor: "#00E5FF40" }]}>
              <Ionicons name="navigate" size={28} color="#00E5FF" />
            </View>
            <Text style={s.modalTitle}>Start Track Me</Text>
            <Text style={s.modalSub}>Share your live location with family or friends for your safety.</Text>

            <View style={{ backgroundColor: colors.bg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 16, gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Ionicons name="navigate-circle-outline" size={18} color="#00E5FF" />
                <Text style={{ color: colors.text, fontSize: 13, flex: 1 }}>Your GPS location pings every 30 seconds</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Ionicons name="eye-outline" size={18} color="#00E5FF" />
                <Text style={{ color: colors.text, fontSize: 13, flex: 1 }}>Anyone with the link can see your location</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Ionicons name="phone-portrait-outline" size={18} color={colors.yellow} />
                <Text style={{ color: colors.textMuted, fontSize: 13, flex: 1 }}>Tracking pauses if you close the app</Text>
              </View>
            </View>

            <View style={{ alignSelf: "center", backgroundColor: colors.bg, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1, borderColor: "#00E5FF40", marginBottom: 20 }}>
              <Text style={{ color: "#00E5FF", fontWeight: "900", fontSize: 18 }}>R{trackMeFee.toFixed(2)} <Text style={{ color: colors.textMuted, fontWeight: "600", fontSize: 13 }}>deducted from wallet</Text></Text>
            </View>

            <View style={s.modalActions}>
              <View style={{ flex: 1 }}>
                <Button label="Cancel" variant="secondary" onPress={() => setTrackMeConfirmModal(false)} />
              </View>
              <TouchableOpacity
                onPress={handleTrackMeStart}
                style={{ flex: 1, backgroundColor: "#00E5FF", borderRadius: 10, paddingVertical: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }}>
                <Ionicons name="navigate" size={16} color="#000" />
                <Text style={{ color: "#000", fontWeight: "900", fontSize: 14 }}>Start Tracking</Text>
              </TouchableOpacity>
            </View>
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
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, backgroundColor: colors.bg },
  walletCardWrap: { paddingHorizontal: 20, paddingBottom: 12, backgroundColor: colors.bg },
  hello: { color: colors.textMuted, fontSize: 14 },
  name: { color: colors.text, fontSize: 24, fontWeight: "800" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border, position: "relative" },
  badge: { position: "absolute", top: -2, right: -2, backgroundColor: colors.red, borderRadius: 999, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderWidth: 2, borderColor: colors.bg },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "900" },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.cyanDim, borderWidth: 1, borderColor: colors.cyan },
  sosBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.red, borderWidth: 2, borderColor: "rgba(255,60,60,0.4)" },
  sosBtnHolding: { transform: [{ scale: 0.88 }], opacity: 0.75 },
  sosBtnText: { color: "#fff", fontWeight: "900", fontSize: 11, letterSpacing: 1 },

  // Driver balance card
  balanceCard: { backgroundColor: colors.bg2, borderColor: colors.cyan, borderWidth: 1, borderRadius: radius.lg, padding: 20, overflow: "hidden" },
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
  trackMeBtn: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 12, paddingVertical: 16, paddingHorizontal: 18, borderRadius: radius.md, borderWidth: 1.5 },
  trackMeIconWrap: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  trackMeLiveBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(74,222,128,0.12)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "rgba(74,222,128,0.25)" },
  trackMeLiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#4ade80" },
  trackMeLiveText: { color: "#4ade80", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
});
