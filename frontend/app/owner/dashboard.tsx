import React, { useCallback, useState, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert, TextInput, Modal, Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useAuth } from "../../src/AuthContext";
import { api, DriverTransfer } from "../../src/api";
import { formatZAR, formatDate, radius, useColors, darkColors as colors } from "../../src/theme";
import { Button } from "../../src/ui";
import { useNotifications } from "../../src/NotificationContext";
import { useDocuments } from "../../src/DocumentContext";

type Driver = {
  user_id: string;
  full_name: string;
  phone_number: string;
  vehicle_plate: string;
  total_earnings: number;
  today_earnings: number;
  daily_target: number;
  qr_code: string;
  rating_avg: number;
  rating_count: number;
  is_verified: boolean;
  payment_mode: "daily_target" | "commission_split";
  driver_commission_pct: number;
  commission_status?: string;
  driver_status: "online" | "on_trip" | "offline";
};

type Tab = "drivers" | "cashups" | "outstanding" | "performance" | "deductions";

function StatCard({ label, value, sub, color = colors.cyan, icon, bg }: {
  label: string; value: string; sub?: string; color?: string; icon: any; bg?: string;
}) {
  return (
    <View style={[s.statCard, { borderColor: color + "40", backgroundColor: bg || colors.bg2 }]}>
      <View style={[s.statIcon, { backgroundColor: color + "18" }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={[s.statVal, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
      {sub ? <Text style={s.statSub}>{sub}</Text> : null}
    </View>
  );
}

function MiniBar({ progress, color }: { progress: number; color: string }) {
  return (
    <View style={s.barBg}>
      <View style={[s.barFill, { width: `${Math.min(100, Math.max(0, progress * 100))}%` as any, backgroundColor: color }]} />
    </View>
  );
}

export default function OwnerDashboard() {
  const router = useRouter();
  const { state } = useAuth();
  const colors = useColors();

  const { unreadCount: notifUnread } = useNotifications();
  const { unreadCount: docsUnread } = useDocuments();
  const totalInboxUnread = notifUnread + docsUnread;

  // SOS state
  const [sosModal, setSosModal] = useState(false);
  const [sosLoading, setSosLoading] = useState(false);
  const [sosActive, setSosActive] = useState<{ id: string; type: string } | null>(null);
  const [sosEmergencyType, setSosEmergencyType] = useState<"police" | "ambulance" | null>(null);
  const [sosLocation, setSosLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [sosLocationLoading, setSosLocationLoading] = useState(false);
  const [sosHelpComing, setSosHelpComing] = useState(false);
  const [sosAdminNote, setSosAdminNote] = useState<string | null>(null);
  const [sosTapCount, setSosTapCount] = useState(0);
  const sosTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sosHelpComingRef = useRef(false);
  const [cancelModal, setCancelModal] = useState(false);
  const [cancelPin, setCancelPin] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const sosPingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ghostPingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [ghostActive, setGhostActive] = useState(false);

  const stopSosPing = useCallback(() => {
    if (sosPingRef.current) { clearInterval(sosPingRef.current); sosPingRef.current = null; }
  }, []);

  const stopGhostPing = useCallback(() => {
    if (ghostPingRef.current) { clearInterval(ghostPingRef.current); ghostPingRef.current = null; }
    setGhostActive(false);
  }, []);

  const startSosPing = useCallback((sosId: string) => {
    sosHelpComingRef.current = false;
    stopSosPing();
    sosPingRef.current = setInterval(async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== "granted") return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const res = await api.sosLocationPing(sosId, { latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        if (res.resolved) {
          stopSosPing();
          setSosActive(null);
          setSosHelpComing(false);
          setSosAdminNote(null);
        } else if (res.help_coming) {
          if (!sosHelpComingRef.current) {
            sosHelpComingRef.current = true;
            setSosHelpComing(true);
          }
          if (res.admin_notes) setSosAdminNote(res.admin_notes);
        }
      } catch {}
    }, 10000);
  }, [stopSosPing]);

  // Ghost ping — active after dead man code used during SOS cancel
  const startGhostPing = useCallback(() => {
    stopGhostPing();
    setGhostActive(true);
    ghostPingRef.current = setInterval(async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== "granted") return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const res = await api.ghostPing({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        if (!res.continue) stopGhostPing();
      } catch {}
    }, 30000);
  }, [stopGhostPing]);

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

  const handleSosTap = () => {
    if (sosLoading || sosActive) return;
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

  const handleSOS = async () => {
    if (!sosEmergencyType) return;
    const type = sosEmergencyType;
    setSosModal(false);
    setSosLoading(true);
    try {
      const res = await api.sosRequest({
        emergency_type: type,
        latitude: sosLocation?.latitude,
        longitude: sosLocation?.longitude,
      });
      setSosActive({ id: res.sos_id, type });
      startSosPing(res.sos_id);
      const label = type === "police" ? "Police" : "Ambulance";
      Alert.alert(
        "SOS Sent",
        `${label} request sent to admin. Our team is contacting emergency services on your behalf. Stay calm and stay on the line.`,
        [{ text: "OK" }]
      );
    } catch (e: any) {
      Alert.alert("SOS Failed", e?.message || "Could not send — call 10111 (Police) or 10177 (Ambulance) immediately.");
    } finally { setSosLoading(false); }
  };

  const confirmHelpReceived = async () => {
    if (!sosActive) return;
    try {
      await api.sosReceived(sosActive.id);
    } catch {}
    stopSosPing();
    setSosActive(null);
    setSosHelpComing(false);
    setSosAdminNote(null);
    sosHelpComingRef.current = false;
    Alert.alert("Thank you", "We're glad help arrived. Stay safe!");
  };

  const handleCancelSOS = async () => {
    if (!sosActive || cancelPin.length < 4) { setCancelError("Enter your PIN to cancel SOS."); return; }
    setCancelling(true);
    try {
      const res = await api.sosCancelPin({ sos_id: sosActive.id, pin: cancelPin });
      setCancelModal(false); setCancelPin("");
      stopSosPing();
      setSosActive(null);
      setSosHelpComing(false);
      setSosAdminNote(null);
      sosHelpComingRef.current = false;
      if (res.stealth) {
        // Dead man code was entered — appear to cancel but silently keep tracking
        startGhostPing();
      }
    } catch (e: any) {
      const msg = e?.message || "";
      setCancelError(msg.toLowerCase().includes("pin") || msg.toLowerCase().includes("incorrect") ? "Incorrect PIN." : msg || "Could not cancel.");
    } finally { setCancelling(false); }
  };
  const [data, setData] = useState<any>(null);
  const [outstanding, setOutstanding] = useState<any>(null);
  const [cashupHistory, setCashupHistory] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [linkModal, setLinkModal] = useState(false);
  const [driverCode, setDriverCode] = useState("");
  const [linking, setLinking] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [targetInput, setTargetInput] = useState("");
  const [settingTarget, setSettingTarget] = useState(false);
  const [commissionInput, setCommissionInput] = useState("");
  const [settingCommission, setSettingCommission] = useState(false);
  const [driverMode, setDriverMode] = useState<"daily_target" | "commission_split">("daily_target");
  const [activeTab, setActiveTab] = useState<Tab>("drivers");
  const [transfers, setTransfers] = useState<DriverTransfer[]>([]);
  const [transferModal, setTransferModal] = useState<DriverTransfer | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actingTransfer, setActingTransfer] = useState(false);

  // Deductions
  const [deductions, setDeductions] = useState<any[]>([]);
  const [deductionModal, setDeductionModal] = useState<Driver | null>(null);
  const [deductionAmt, setDeductionAmt] = useState("");
  const [deductionReason, setDeductionReason] = useState("");
  const [deductionType, setDeductionType] = useState("manual");
  const [addingDeduction, setAddingDeduction] = useState(false);

  // Document expiry
  const [docModal, setDocModal] = useState<Driver | null>(null);
  const [driverDocs, setDriverDocs] = useState<any[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docType, setDocType] = useState("pdp");
  const [docExpiry, setDocExpiry] = useState("");
  const [docNotes, setDocNotes] = useState("");
  const [savingDoc, setSavingDoc] = useState(false);

  const load = useCallback(async () => {
    try {
      const [dashRes, outRes, histRes, txRes, dedRes] = await Promise.all([
        api.ownerDashboard(),
        api.ownerOutstanding().catch(() => null),
        api.ownerCashupHistory().catch(() => null),
        api.ownerTransfers().catch(() => []),
        api.ownerListDeductions().catch(() => []),
      ]);
      setData(dashRes);
      setOutstanding(outRes);
      setCashupHistory(histRes);
      setTransfers(txRes as DriverTransfer[]);
      setDeductions(dedRes as any[]);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to load dashboard");
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (state.status !== "authed") {
    return (
      <SafeAreaView style={[s.root, { alignItems: "center", justifyContent: "center" }]} edges={["top"]}>
        <ActivityIndicator color={colors.cyan} size="large" />
      </SafeAreaView>
    );
  }

  const handleLinkDriver = async () => {
    if (!driverCode.trim()) return;
    setLinking(true);
    try {
      const res = await api.ownerLinkDriver(driverCode.trim().toUpperCase());
      setLinkModal(false); setDriverCode("");
      let msg = `${res.driver.full_name} added to your fleet.`;
      if (res.subscription_charged > 0) {
        msg += `\n\nSubscription fee of ${formatZAR(res.subscription_charged)} deducted for taxi #${res.taxi_count} (${res.free_taxis} free, R${res.subscription_price_per_taxi.toFixed(2)}/taxi/month).`;
      } else if (res.subscription_insufficient) {
        msg += `\n\nInsufficient wallet balance for subscription fee of ${formatZAR(res.subscription_price_per_taxi)}. Please top up your wallet.`;
      } else if (res.taxi_count <= res.free_taxis) {
        msg += `\n\nTaxi ${res.taxi_count} of ${res.free_taxis} free — no subscription fee.`;
      }
      Alert.alert("Driver Linked!", msg);
      load();
    } catch (e: any) { Alert.alert("Failed", e?.message || "Could not link driver"); }
    finally { setLinking(false); }
  };

  const handleConfirmDriver = async (driver: Driver) => {
    try {
      await api.ownerConfirmDriver(driver.user_id);
      Alert.alert("Confirmed", `${driver.full_name} confirmed.`);
      setSelectedDriver(null); load();
    } catch (e: any) { Alert.alert("Error", e?.message || "Could not confirm driver"); }
  };

  const handleSetTarget = async (driver: Driver) => {
    const target = parseFloat(targetInput);
    if (!targetInput || isNaN(target) || target < 0) { Alert.alert("Invalid", "Enter a valid daily target"); return; }
    setSettingTarget(true);
    try {
      await api.ownerSetTarget(driver.user_id, target);
      Alert.alert("Target Set", `Daily target: ${formatZAR(target)}`);
      setTargetInput(""); setSelectedDriver(null); load();
    } catch (e: any) { Alert.alert("Error", e?.message || "Could not set target"); }
    finally { setSettingTarget(false); }
  };

  const handleSetCommission = async (driver: Driver) => {
    const pct = parseFloat(commissionInput);
    if (!commissionInput || isNaN(pct) || pct < 0 || pct > 100) { Alert.alert("Invalid", "Enter a commission % between 0 and 100"); return; }
    setSettingCommission(true);
    try {
      await api.ownerSetCommission(driver.user_id, pct);
      Alert.alert("Commission Set", `Driver receives ${pct}%, you receive ${(100 - pct).toFixed(0)}%`);
      setCommissionInput(""); setSelectedDriver(null); load();
    } catch (e: any) { Alert.alert("Error", e?.message || "Could not set commission"); }
    finally { setSettingCommission(false); }
  };

  const handleCancelOutstanding = async (id: string, driverName: string, amount: number) => {
    Alert.alert("Cancel Outstanding?", `Cancel ${formatZAR(amount)} for ${driverName}?`, [
      { text: "No", style: "cancel" },
      {
        text: "Cancel Balance", style: "destructive",
        onPress: async () => {
          try { await api.ownerCancelOutstanding(id); load(); }
          catch (e: any) { Alert.alert("Error", e?.message || "Could not cancel"); }
        },
      },
    ]);
  };

  const handleUnlink = (driver: Driver) => {
    Alert.alert("Remove Driver", `Remove ${driver.full_name} from your fleet?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive",
        onPress: async () => {
          try { await api.ownerUnlinkDriver(driver.user_id); setSelectedDriver(null); load(); }
          catch (e: any) { Alert.alert("Error", e?.message || "Failed to remove"); }
        },
      },
    ]);
  };

  const handleAddDeduction = async (driver: Driver) => {
    const amt = parseFloat(deductionAmt);
    if (!deductionAmt || isNaN(amt) || amt <= 0) { Alert.alert("Invalid", "Enter a valid amount"); return; }
    if (!deductionReason.trim()) { Alert.alert("Required", "Enter a reason for this deduction"); return; }
    setAddingDeduction(true);
    try {
      await api.ownerAddDeduction(driver.user_id, amt, deductionReason.trim(), deductionType);
      Alert.alert("Deduction Added", `${formatZAR(amt)} will be deducted on next cashup.`);
      setDeductionModal(null); setDeductionAmt(""); setDeductionReason(""); setDeductionType("manual");
      load();
    } catch (e: any) { Alert.alert("Error", e?.message || "Could not add deduction"); }
    finally { setAddingDeduction(false); }
  };

  const openDocModal = async (driver: Driver) => {
    setDocModal(driver); setDocsLoading(true);
    try {
      const docs = await api.ownerGetDriverDocs(driver.user_id);
      setDriverDocs(docs);
    } catch { setDriverDocs([]); }
    finally { setDocsLoading(false); }
  };

  const handleSaveDoc = async (driver: Driver) => {
    if (!docExpiry) { Alert.alert("Required", "Select an expiry date"); return; }
    setSavingDoc(true);
    try {
      await api.ownerSetDriverDoc(driver.user_id, docType, docExpiry, docNotes);
      const docs = await api.ownerGetDriverDocs(driver.user_id);
      setDriverDocs(docs); setDocExpiry(""); setDocNotes("");
      Alert.alert("Saved", `${docType.toUpperCase()} expiry updated.`);
    } catch (e: any) { Alert.alert("Error", e?.message || "Could not save"); }
    finally { setSavingDoc(false); }
  };

  const handleDeleteDoc = async (driver: Driver, docId: string, docTypeName: string) => {
    Alert.alert("Remove", `Remove ${docTypeName.toUpperCase()} record?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
        try {
          await api.ownerDeleteDriverDoc(driver.user_id, docId);
          setDriverDocs(prev => prev.filter(d => d.id !== docId));
        } catch (e: any) { Alert.alert("Error", e?.message); }
      }},
    ]);
  };

  const drivers: Driver[] = data?.drivers ?? [];
  const topEarner = drivers.reduce<Driver | null>((best, d) => !best || d.total_earnings > best.total_earnings ? d : best, null);
  const avgEarnings = drivers.length ? drivers.reduce((s, d) => s + d.total_earnings, 0) / drivers.length : 0;
  const verifiedCount = drivers.filter(d => d.is_verified).length;
  const totalFleetEarnings = drivers.reduce((s, d) => s + d.total_earnings, 0);

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: "drivers", label: "Drivers", count: drivers.length },
    { key: "performance", label: "Performance" },
    { key: "cashups", label: "Cash-Ups" },
    { key: "outstanding", label: "Outstanding", count: outstanding?.items?.length || 0 },
    { key: "deductions", label: "Deductions", count: deductions.filter((d: any) => d.status === "pending").length },
  ];

  const pendingDeductions = deductions.filter((d: any) => d.status === "pending");
  const expiringDocs = data?.expiring_docs ?? 0;
  const onlineDrivers = drivers.filter(d => d.driver_status !== "offline").length;
  const onTripDrivers = drivers.filter(d => d.driver_status === "on_trip").length;

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.cyan} />}>

        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <View style={s.brandDot} />
            <View>
              <Text style={s.greeting}>Fleet Dashboard</Text>
              <Text style={s.ownerName}>{state.user.full_name}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TouchableOpacity onPress={() => router.push("/owner/driver-mode")} style={s.driveBtn}>
              <Ionicons name="qr-code-outline" size={18} color={colors.bg} />
              <Text style={s.driveBtnText}>Drive</Text>
            </TouchableOpacity>
            {/* SOS button — tap 3× to arm */}
            <TouchableOpacity
              onPress={() => sosActive ? setCancelModal(true) : handleSosTap()}
              style={[s.sosHeaderBtn, sosActive && (sosHelpComing
                ? { backgroundColor: "#15803d", borderColor: "#4ade80" }
                : { backgroundColor: colors.red, borderColor: colors.red })]}
              disabled={sosLoading}
              activeOpacity={0.8}>
              {sosLoading
                ? <ActivityIndicator size="small" color={sosActive ? "#fff" : colors.red} />
                : <Ionicons name="warning" size={14} color={sosActive ? "#fff" : colors.red} />}
              <Text style={[s.sosHeaderText, { color: sosActive ? "#fff" : colors.red }]}>
                {sosActive ? (sosHelpComing ? "HELP COMING" : "● LIVE") : (sosTapCount > 0 ? `${sosTapCount}×` : "SOS")}
              </Text>
            </TouchableOpacity>
            {/* Bell */}
            <TouchableOpacity onPress={() => router.push("/owner/notifications")} style={s.avatar}>
              <Ionicons name="notifications-outline" size={20} color={colors.cyan} />
              {totalInboxUnread > 0 && (
                <View style={s.bellBadge}>
                  <Text style={s.bellBadgeText}>{totalInboxUnread > 9 ? "9+" : String(totalInboxUnread)}</Text>
                </View>
              )}
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
            <Text style={{ color: "#86efac", fontSize: 12, textAlign: "center" }}>
              {sosAdminNote || "Admin has acknowledged your SOS. Stay calm and keep your phone with you."}
            </Text>
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

        {loading ? (
          <ActivityIndicator color={colors.cyan} style={{ marginTop: 60 }} />
        ) : (
          <View style={{ paddingHorizontal: 16 }}>

            {/* Stats grid */}
            <View style={s.statsGrid}>
              <StatCard label="Fleet Total" value={formatZAR(totalFleetEarnings)} icon="wallet-outline" color={colors.cyan} />
              <StatCard label="Today" value={formatZAR(data?.today_revenue ?? 0)} icon="today-outline" color={colors.green} />
            </View>
            <View style={[s.statsGrid, { marginTop: 8 }]}>
              <StatCard label="Drivers" value={String(drivers.length)} sub={`${verifiedCount} verified`} icon="car-sport-outline" color="#A064FF" />
              <StatCard label="Avg Earnings" value={formatZAR(avgEarnings)} sub="per driver" icon="stats-chart-outline" color="#FFD60A" />
            </View>

            {/* Live fleet status row */}
            {drivers.length > 0 && (
              <View style={s.liveStatusRow}>
                <View style={s.liveStatusItem}>
                  <View style={[s.statusDot, { backgroundColor: colors.green }]} />
                  <Text style={s.liveStatusText}><Text style={{ color: colors.green, fontWeight: "800" }}>{onlineDrivers}</Text> active</Text>
                </View>
                <View style={s.liveStatusItem}>
                  <View style={[s.statusDot, { backgroundColor: "#FF9F0A" }]} />
                  <Text style={s.liveStatusText}><Text style={{ color: "#FF9F0A", fontWeight: "800" }}>{onTripDrivers}</Text> on trip</Text>
                </View>
                <View style={s.liveStatusItem}>
                  <View style={[s.statusDot, { backgroundColor: colors.textDim }]} />
                  <Text style={s.liveStatusText}><Text style={{ color: colors.textDim, fontWeight: "800" }}>{drivers.length - onlineDrivers}</Text> offline</Text>
                </View>
                <Text style={s.liveLabel}>LIVE</Text>
              </View>
            )}

            {/* Alert banners */}
            {cashupHistory?.today_total > 0 && (
              <View style={s.infoBanner}>
                <Ionicons name="arrow-down-circle" size={18} color={colors.green} />
                <View style={{ flex: 1 }}>
                  <Text style={s.infoBannerTitle}>Today's Cash-Ups</Text>
                  <Text style={[s.infoBannerVal, { color: colors.green }]}>{formatZAR(cashupHistory.today_total)}</Text>
                </View>
              </View>
            )}
            {outstanding?.total_outstanding > 0 && (
              <TouchableOpacity style={s.warningBanner} onPress={() => setActiveTab("outstanding")}>
                <Ionicons name="warning" size={16} color="#FFD60A" />
                <Text style={s.warningBannerText}>
                  {formatZAR(outstanding.total_outstanding)} outstanding · {outstanding.items?.length} driver(s)
                </Text>
                <Ionicons name="chevron-forward" size={14} color="#FFD60A" />
              </TouchableOpacity>
            )}
            {expiringDocs > 0 && (
              <TouchableOpacity style={[s.warningBanner, { borderColor: "#FF6B0033", backgroundColor: "#FF6B0011" }]}
                onPress={() => setActiveTab("drivers")}>
                <Ionicons name="document-text-outline" size={16} color="#FF6B00" />
                <Text style={[s.warningBannerText, { color: "#FF6B00" }]}>
                  {expiringDocs} document(s) expiring soon — tap to review
                </Text>
                <Ionicons name="chevron-forward" size={14} color="#FF6B00" />
              </TouchableOpacity>
            )}
            {pendingDeductions.length > 0 && (
              <TouchableOpacity style={[s.warningBanner, { borderColor: "#A064FF33", backgroundColor: "#A064FF11" }]}
                onPress={() => setActiveTab("deductions")}>
                <Ionicons name="remove-circle-outline" size={16} color="#A064FF" />
                <Text style={[s.warningBannerText, { color: "#A064FF" }]}>
                  {pendingDeductions.length} pending deduction(s) — tap to review
                </Text>
                <Ionicons name="chevron-forward" size={14} color="#A064FF" />
              </TouchableOpacity>
            )}

            {/* Pending transfer banners */}
            {transfers.filter(t => t.status === "pending_old_owner" || t.status === "pending_new_owner").map(t => (
              <TouchableOpacity key={t.id} style={s.transferBanner} onPress={() => { setTransferModal(t); setRejectReason(""); }}>
                <Ionicons name="swap-horizontal-outline" size={16} color="#FF9F0A" />
                <Text style={s.transferBannerText} numberOfLines={1}>
                  {t.status === "pending_old_owner"
                    ? `${t.driver_name} wants to leave your fleet`
                    : `${t.driver_name} wants to join your fleet`}
                </Text>
                <Text style={s.transferBannerAction}>Review</Text>
              </TouchableOpacity>
            ))}

            {/* Tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={s.tabRow}>
                {TABS.map(t => (
                  <TouchableOpacity key={t.key} onPress={() => setActiveTab(t.key)}
                    style={[s.tab, activeTab === t.key && s.tabActive]}>
                    <Text style={[s.tabText, activeTab === t.key && s.tabTextActive]}>{t.label}</Text>
                    {t.count !== undefined && t.count > 0 && (
                      <View style={[s.tabBadge, activeTab === t.key ? { backgroundColor: colors.cyan } : { backgroundColor: colors.border }]}>
                        <Text style={[s.tabBadgeText, activeTab === t.key && { color: colors.bg }]}>{t.count}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* ── Drivers Tab ── */}
            {activeTab === "drivers" && (
              <>
                <View style={s.sectionRow}>
                  <Text style={s.sectionLabel}>MY FLEET</Text>
                  <TouchableOpacity onPress={() => setLinkModal(true)} style={s.addBtn}>
                    <Ionicons name="add" size={16} color={colors.bg} />
                    <Text style={s.addBtnText}>Add Driver</Text>
                  </TouchableOpacity>
                </View>
                {!drivers.length ? (
                  <View style={s.empty}>
                    <Ionicons name="car-outline" size={44} color={colors.textDim} />
                    <Text style={s.emptyTitle}>No drivers yet</Text>
                    <Text style={s.emptySub}>Add a driver using their TNR code</Text>
                    <TouchableOpacity onPress={() => setLinkModal(true)} style={[s.addBtn, { marginTop: 16 }]}>
                      <Ionicons name="add" size={16} color={colors.bg} />
                      <Text style={s.addBtnText}>Add First Driver</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  drivers.map((driver, idx) => {
                    const isTop = driver.user_id === topEarner?.user_id;
                    const isCommission = driver.payment_mode === "commission_split";
                    const progress = !isCommission && driver.daily_target && driver.today_earnings
                      ? driver.today_earnings / driver.daily_target : null;
                    const statusColor = driver.driver_status === "on_trip" ? "#FF9F0A"
                      : driver.driver_status === "online" ? colors.green : colors.textDim;
                    return (
                      <TouchableOpacity key={driver.user_id} style={[s.driverCard, isTop && s.driverCardTop,
                        driver.driver_status === "on_trip" && { borderColor: "#FF9F0A44" }]}
                        onPress={() => {
                          setSelectedDriver(driver);
                          setTargetInput("");
                          setCommissionInput("");
                          setDriverMode(driver.payment_mode || "daily_target");
                        }} activeOpacity={0.82}>
                        <View style={s.driverRank}>
                          <Text style={s.driverRankNum}>#{idx + 1}</Text>
                        </View>
                        <View style={[s.driverAvatar, { borderColor: isTop ? "#FFD60A" : colors.cyan }]}>
                          <Ionicons name="car-sport" size={20} color={isTop ? "#FFD60A" : colors.cyan} />
                          {/* Online status dot */}
                          <View style={[s.onlineDot, { backgroundColor: statusColor }]} />
                          {isTop && (
                            <View style={s.crownWrap}>
                              <Ionicons name="trophy" size={10} color="#FFD60A" />
                            </View>
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Text style={s.driverName}>{driver.full_name}</Text>
                            {driver.is_verified && <Ionicons name="checkmark-circle" size={13} color={colors.green} />}
                          </View>
                          <Text style={s.driverPhone}>{driver.phone_number}</Text>
                          {driver.vehicle_plate && (
                            <View style={s.platePill}>
                              <Text style={s.plateText}>{driver.vehicle_plate}</Text>
                            </View>
                          )}
                          {/* Payment mode badge */}
                          <View style={s.modeBadge}>
                            <Ionicons name={isCommission ? "pie-chart-outline" : "flag-outline"} size={9} color={isCommission ? "#A064FF" : colors.cyan} />
                            <Text style={[s.modeBadgeText, { color: isCommission ? "#A064FF" : colors.cyan }]}>
                              {isCommission
                                ? `${driver.driver_commission_pct ?? 0}% commission`
                                : driver.daily_target ? `Target ${formatZAR(driver.daily_target)}` : "Daily target"}
                            </Text>
                          </View>
                          {progress !== null && (
                            <View style={{ marginTop: 4 }}>
                              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                                <Text style={s.targetLabel}>Today {formatZAR(driver.today_earnings ?? 0)}</Text>
                                <Text style={[s.targetLabel, { color: progress >= 1 ? colors.green : colors.yellow }]}>
                                  {Math.round(progress * 100)}%
                                </Text>
                              </View>
                              <MiniBar progress={progress} color={progress >= 1 ? colors.green : colors.yellow} />
                            </View>
                          )}
                          {driver.rating_count > 0 && (
                            <View style={s.ratingRow}>
                              <Ionicons name="star" size={10} color="#FFD60A" />
                              <Text style={s.ratingText}>{driver.rating_avg.toFixed(1)} ({driver.rating_count})</Text>
                            </View>
                          )}
                        </View>
                        <View style={s.driverRight}>
                          <Text style={s.driverEarnings}>{formatZAR(driver.total_earnings)}</Text>
                          <Text style={s.driverEarningsLabel}>total</Text>
                          {driver.today_earnings > 0 && (
                            <Text style={[s.driverEarningsLabel, { color: colors.green, marginTop: 4 }]}>
                              +{formatZAR(driver.today_earnings)} today
                            </Text>
                          )}
                          <View style={{ flexDirection: "row", gap: 4, marginTop: 6 }}>
                            <TouchableOpacity
                              style={s.cardQuickBtn}
                              onPress={e => { e.stopPropagation(); setDeductionModal(driver); setDeductionAmt(""); setDeductionReason(""); }}>
                              <Ionicons name="remove-circle-outline" size={13} color="#A064FF" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={s.cardQuickBtn}
                              onPress={e => { e.stopPropagation(); openDocModal(driver); }}>
                              <Ionicons name="document-text-outline" size={13} color="#FF6B00" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </>
            )}

            {/* ── Performance Tab ── */}
            {activeTab === "performance" && (
              <>
                <Text style={s.sectionLabel}>FLEET PERFORMANCE</Text>
                {!drivers.length ? (
                  <View style={s.empty}>
                    <Ionicons name="stats-chart-outline" size={44} color={colors.textDim} />
                    <Text style={s.emptyTitle}>No data yet</Text>
                  </View>
                ) : (
                  <>
                    {/* Fleet health bar */}
                    <View style={s.perfCard}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
                        <Text style={s.perfCardTitle}>Fleet Health Score</Text>
                        <Text style={[s.perfCardTitle, { color: colors.cyan }]}>
                          {Math.round((verifiedCount / Math.max(drivers.length, 1)) * 100)}%
                        </Text>
                      </View>
                      <MiniBar progress={verifiedCount / Math.max(drivers.length, 1)} color={colors.cyan} />
                      <Text style={s.perfCardSub}>{verifiedCount} of {drivers.length} drivers verified</Text>
                    </View>

                    {/* Leaderboard */}
                    <View style={s.perfCard}>
                      <Text style={s.perfCardTitle}>Earnings Leaderboard</Text>
                      {[...drivers].sort((a, b) => b.total_earnings - a.total_earnings).map((d, i) => {
                        const maxEarnings = drivers[0]?.total_earnings || 1;
                        const sorted = [...drivers].sort((a, b) => b.total_earnings - a.total_earnings);
                        const pct = d.total_earnings / (sorted[0]?.total_earnings || 1);
                        const rankColors = ["#FFD60A", "#C0C0C0", "#CD7F32"];
                        return (
                          <View key={d.user_id} style={s.lbRow}>
                            <View style={[s.lbRankBadge, { backgroundColor: (rankColors[i] || colors.border) + "22" }]}>
                              <Text style={[s.lbRank, { color: rankColors[i] || colors.textMuted }]}>#{i + 1}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                                <Text style={s.lbName}>{d.full_name}</Text>
                                <Text style={[s.lbEarnings, { color: i === 0 ? "#FFD60A" : colors.green }]}>{formatZAR(d.total_earnings)}</Text>
                              </View>
                              <MiniBar progress={pct} color={rankColors[i] || colors.cyan} />
                            </View>
                          </View>
                        );
                      })}
                    </View>

                    {/* Today's earnings bar chart */}
                    {drivers.some(d => d.today_earnings > 0) && (
                      <View style={s.perfCard}>
                        <Text style={s.perfCardTitle}>Today's Earnings by Driver</Text>
                        {(() => {
                          const maxE = Math.max(...drivers.map(d => d.today_earnings), 1);
                          return drivers.filter(d => d.today_earnings > 0)
                            .sort((a, b) => b.today_earnings - a.today_earnings)
                            .map((d, i) => (
                              <View key={d.user_id} style={{ marginBottom: 10 }}>
                                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
                                  <Text style={s.lbName} numberOfLines={1}>{d.full_name.split(" ")[0]}</Text>
                                  <Text style={[s.lbEarnings, { color: i === 0 ? colors.green : colors.cyan }]}>{formatZAR(d.today_earnings)}</Text>
                                </View>
                                <View style={s.barBg}>
                                  <View style={[s.barFill, { width: `${(d.today_earnings / maxE) * 100}%` as any, backgroundColor: i === 0 ? colors.green : colors.cyan + "BB" }]} />
                                </View>
                              </View>
                            ));
                        })()}
                      </View>
                    )}

                    {/* Summary stats */}
                    <View style={s.perfCard}>
                      <Text style={s.perfCardTitle}>Fleet Summary</Text>
                      {[
                        { label: "Total fleet earnings", value: formatZAR(totalFleetEarnings), color: colors.cyan },
                        { label: "Average per driver", value: formatZAR(avgEarnings), color: colors.green },
                        { label: "Top earner", value: topEarner?.full_name || "-", color: "#FFD60A" },
                        { label: "Active now", value: `${onTripDrivers} on trip · ${onlineDrivers} online`, color: colors.green },
                        { label: "Verified drivers", value: `${verifiedCount} / ${drivers.length}`, color: colors.green },
                        { label: "Today's revenue", value: formatZAR(data?.today_revenue ?? 0), color: colors.cyan },
                        { label: "Pending deductions", value: `${pendingDeductions.length}`, color: "#A064FF" },
                      ].map(row => (
                        <View key={row.label} style={s.summaryRow}>
                          <Text style={s.summaryLabel}>{row.label}</Text>
                          <Text style={[s.summaryVal, { color: row.color }]}>{row.value}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </>
            )}

            {/* ── Cash-Ups Tab ── */}
            {activeTab === "cashups" && (
              <>
                <Text style={s.sectionLabel}>CASH-UP HISTORY</Text>
                {!cashupHistory?.history?.length ? (
                  <View style={s.empty}>
                    <Ionicons name="cash-outline" size={44} color={colors.textDim} />
                    <Text style={s.emptyTitle}>No cash-ups yet</Text>
                  </View>
                ) : (
                  cashupHistory.history.map((c: any) => (
                    <View key={c.id} style={s.cashupRow}>
                      <View style={s.cashupIcon}>
                        <Ionicons name={c.cashup_method === "wallet" ? "wallet-outline" : "card-outline"} size={18} color={colors.cyan} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.cashupDriver}>{c.driver_name}</Text>
                        <Text style={s.cashupDate}>{formatDate(c.created_at)}</Text>
                        <Text style={s.cashupMethod}>
                          {c.cashup_method === "wallet" ? "Wallet transfer · Free" : `Bank payout · -R${c.payout_fee?.toFixed(2)}`}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={s.cashupAmt}>{formatZAR(c.cashup_amount)}</Text>
                        {c.shortfall > 0 && <Text style={s.cashupShortfall}>-{formatZAR(c.shortfall)} short</Text>}
                        {c.driver_profit > 0 && <Text style={s.cashupProfit}>+{formatZAR(c.driver_profit)} profit</Text>}
                      </View>
                    </View>
                  ))
                )}
              </>
            )}

            {/* ── Outstanding Tab ── */}
            {activeTab === "outstanding" && (
              <>
                <View style={s.sectionRow}>
                  <Text style={s.sectionLabel}>OUTSTANDING BALANCES</Text>
                  {outstanding?.total_outstanding > 0 && (
                    <Text style={[s.sectionLabel, { color: colors.red }]}>{formatZAR(outstanding.total_outstanding)}</Text>
                  )}
                </View>
                {!outstanding?.items?.length ? (
                  <View style={s.empty}>
                    <Ionicons name="checkmark-circle-outline" size={44} color={colors.green} />
                    <Text style={s.emptyTitle}>All clear!</Text>
                    <Text style={s.emptySub}>No outstanding balances</Text>
                  </View>
                ) : (
                  outstanding.items.map((ob: any) => (
                    <View key={ob.id} style={s.outstandingRow}>
                      <View style={s.outstandingIcon}>
                        <Ionicons name="warning" size={18} color="#FFD60A" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.outstandingDriver}>{ob.driver_name}</Text>
                        <Text style={s.outstandingReason}>{ob.reason}</Text>
                        <Text style={s.outstandingDate}>{formatDate(ob.created_at)}</Text>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 8 }}>
                        <Text style={s.outstandingAmt}>{formatZAR(ob.amount)}</Text>
                        <TouchableOpacity style={s.cancelBtn}
                          onPress={() => handleCancelOutstanding(ob.id, ob.driver_name, ob.amount)}>
                          <Text style={s.cancelBtnText}>Write off</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </>
            )}

            {/* ── Deductions Tab ── */}
            {activeTab === "deductions" && (
              <>
                <View style={s.sectionRow}>
                  <Text style={s.sectionLabel}>DRIVER DEDUCTIONS</Text>
                </View>
                {!deductions.length ? (
                  <View style={s.empty}>
                    <Ionicons name="remove-circle-outline" size={44} color={colors.textDim} />
                    <Text style={s.emptyTitle}>No deductions</Text>
                    <Text style={s.emptySub}>Tap the purple button on any driver card to add a deduction</Text>
                  </View>
                ) : (
                  deductions.map((d: any) => (
                    <View key={d.id} style={[s.outstandingRow, { borderColor: d.status === "pending" ? "#A064FF44" : colors.border }]}>
                      <View style={[s.outstandingIcon, { backgroundColor: d.status === "pending" ? "#A064FF18" : colors.bg2 }]}>
                        <Ionicons name="remove-circle" size={18} color={d.status === "pending" ? "#A064FF" : colors.textDim} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.outstandingDriver}>{d.driver_name}</Text>
                        <Text style={s.outstandingReason}>{d.reason}</Text>
                        <View style={{ flexDirection: "row", gap: 6, marginTop: 4, alignItems: "center" }}>
                          <View style={[s.deductionTypePill, { backgroundColor: d.status === "pending" ? "#A064FF18" : colors.bg }]}>
                            <Text style={[s.deductionTypeText, { color: d.status === "pending" ? "#A064FF" : colors.textDim }]}>
                              {d.deduction_type} · {d.status}
                            </Text>
                          </View>
                          <Text style={s.outstandingDate}>{formatDate(d.created_at)}</Text>
                        </View>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 8 }}>
                        <Text style={[s.outstandingAmt, { color: "#A064FF" }]}>{formatZAR(d.amount)}</Text>
                        {d.status === "pending" && (
                          <TouchableOpacity style={[s.cancelBtn, { borderColor: "#A064FF44", backgroundColor: "#A064FF11" }]}
                            onPress={() => Alert.alert("Cancel Deduction?", `Cancel ${formatZAR(d.amount)} for ${d.driver_name}?`, [
                              { text: "No", style: "cancel" },
                              { text: "Cancel It", style: "destructive", onPress: async () => {
                                try { await api.ownerCancelDeduction(d.id); load(); }
                                catch (e: any) { Alert.alert("Error", e?.message); }
                              }},
                            ])}>
                            <Text style={[s.cancelBtnText, { color: "#A064FF" }]}>Cancel</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  ))
                )}
              </>
            )}
          </View>
        )}
      </ScrollView>

      {/* Link driver modal */}
      <Modal visible={linkModal} transparent animationType="slide" onRequestClose={() => setLinkModal(false)}>
        <Pressable style={s.overlay} onPress={() => setLinkModal(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <View style={s.sheetHandle} />
            <View style={s.sheetIconWrap}>
              <Ionicons name="link-outline" size={26} color={colors.cyan} />
            </View>
            <Text style={s.sheetTitle}>Add Driver</Text>
            <Text style={s.sheetSub}>Enter the driver's TNR code to link them to your fleet.</Text>
            <Text style={s.inputLabel}>DRIVER TNR CODE</Text>
            <TextInput style={s.input} value={driverCode}
              onChangeText={t => setDriverCode(t.toUpperCase())}
              placeholder="TNR0000000000000" placeholderTextColor={colors.textDim}
              autoCapitalize="characters" />
            <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
              <View style={{ flex: 1 }}>
                <Button label="Cancel" variant="secondary" onPress={() => { setLinkModal(false); setDriverCode(""); }} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Link Driver" onPress={handleLinkDriver} loading={linking} />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add Deduction Modal */}
      {deductionModal && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setDeductionModal(null)}>
          <Pressable style={s.overlay} onPress={() => setDeductionModal(null)}>
            <Pressable style={s.sheet} onPress={() => {}}>
              <View style={s.sheetHandle} />
              <View style={[s.sheetIconWrap, { backgroundColor: "#A064FF18", borderColor: "#A064FF44" }]}>
                <Ionicons name="remove-circle-outline" size={26} color="#A064FF" />
              </View>
              <Text style={s.sheetTitle}>Add Deduction</Text>
              <Text style={s.sheetSub}>{deductionModal.full_name} · deducted on next cashup</Text>

              <Text style={s.inputLabel}>TYPE</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {[
                    { key: "fuel", label: "Fuel" },
                    { key: "damage", label: "Damage" },
                    { key: "advance", label: "Advance" },
                    { key: "fine", label: "Fine" },
                    { key: "manual", label: "Other" },
                  ].map(t => (
                    <TouchableOpacity key={t.key}
                      style={[s.modeToggleBtn, { paddingHorizontal: 14 }, deductionType === t.key && s.modeToggleActiveCommission]}
                      onPress={() => setDeductionType(t.key)}>
                      <Text style={[s.modeToggleText, deductionType === t.key && { color: colors.bg }]}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <Text style={s.inputLabel}>AMOUNT (ZAR)</Text>
              <TextInput style={s.input} value={deductionAmt} onChangeText={setDeductionAmt}
                placeholder="e.g. 150" placeholderTextColor={colors.textDim} keyboardType="decimal-pad" />
              <Text style={s.inputLabel}>REASON</Text>
              <TextInput style={[s.input, { marginBottom: 12 }]} value={deductionReason} onChangeText={setDeductionReason}
                placeholder="e.g. Fuel advance on Monday" placeholderTextColor={colors.textDim} />
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Button label="Cancel" variant="secondary" onPress={() => setDeductionModal(null)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Add Deduction" onPress={() => handleAddDeduction(deductionModal)} loading={addingDeduction} />
                </View>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* Document Expiry Modal */}
      {docModal && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setDocModal(null)}>
          <Pressable style={s.overlay} onPress={() => setDocModal(null)}>
            <Pressable style={[s.sheet, { maxHeight: "85%" }]} onPress={() => {}}>
              <View style={s.sheetHandle} />
              <View style={[s.sheetIconWrap, { backgroundColor: "#FF6B0018", borderColor: "#FF6B0044" }]}>
                <Ionicons name="document-text-outline" size={26} color="#FF6B00" />
              </View>
              <Text style={s.sheetTitle}>Document Expiry</Text>
              <Text style={s.sheetSub}>{docModal.full_name}</Text>
              {docsLoading ? <ActivityIndicator color={colors.cyan} style={{ marginVertical: 16 }} /> : (
                <>
                  {driverDocs.length > 0 && (
                    <View style={{ marginBottom: 12 }}>
                      {driverDocs.map((doc: any) => (
                        <View key={doc.id} style={[s.docRow, { borderColor: doc.status === "expired" ? colors.red + "44" : doc.status === "expiring_soon" ? "#FF6B0044" : colors.border }]}>
                          <View style={{ flex: 1 }}>
                            <Text style={s.docType}>{doc.document_type.toUpperCase()}</Text>
                            <Text style={s.docExpiry}>Expires {doc.expiry_date}</Text>
                            <View style={[s.docStatusPill, { backgroundColor: doc.status === "expired" ? colors.red + "22" : doc.status === "expiring_soon" ? "#FF6B0022" : colors.greenDim }]}>
                              <Text style={[s.docStatusText, { color: doc.status === "expired" ? colors.red : doc.status === "expiring_soon" ? "#FF6B00" : colors.green }]}>
                                {doc.status === "expired" ? "EXPIRED" : doc.status === "expiring_soon" ? `${doc.days_left}d left` : "VALID"}
                              </Text>
                            </View>
                          </View>
                          <TouchableOpacity onPress={() => handleDeleteDoc(docModal, doc.id, doc.document_type)}>
                            <Ionicons name="trash-outline" size={16} color={colors.red} />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                  <Text style={s.inputLabel}>ADD / UPDATE DOCUMENT</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {["pdp", "license", "roadworthy", "insurance"].map(t => (
                        <TouchableOpacity key={t}
                          style={[s.modeToggleBtn, { paddingHorizontal: 12 }, docType === t && { backgroundColor: "#FF6B00", borderColor: "#FF6B00" }]}
                          onPress={() => setDocType(t)}>
                          <Text style={[s.modeToggleText, docType === t && { color: "#fff" }]}>{t.toUpperCase()}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                  <Text style={s.inputLabel}>EXPIRY DATE (YYYY-MM-DD)</Text>
                  <TextInput style={s.input} value={docExpiry} onChangeText={setDocExpiry}
                    placeholder="e.g. 2025-12-31" placeholderTextColor={colors.textDim} />
                  <Text style={s.inputLabel}>NOTES (OPTIONAL)</Text>
                  <TextInput style={[s.input, { marginBottom: 12 }]} value={docNotes} onChangeText={setDocNotes}
                    placeholder="e.g. PDP renewal pending" placeholderTextColor={colors.textDim} />
                </>
              )}
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Button label="Close" variant="secondary" onPress={() => setDocModal(null)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Save" onPress={() => handleSaveDoc(docModal)} loading={savingDoc} />
                </View>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* Driver detail modal */}
      {selectedDriver && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setSelectedDriver(null)}>
          <Pressable style={s.overlay} onPress={() => setSelectedDriver(null)}>
            <Pressable style={s.sheet} onPress={() => {}}>
              <View style={s.sheetHandle} />

              {/* Driver header */}
              <View style={s.driverDetailHeader}>
                <View style={[s.driverAvatar, { width: 52, height: 52, borderRadius: 26 }]}>
                  <Ionicons name="car-sport" size={24} color={colors.cyan} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.sheetTitle}>{selectedDriver.full_name}</Text>
                  <Text style={[s.sheetSub, { textAlign: "left", marginBottom: 0, marginTop: 2 }]}>{selectedDriver.phone_number}</Text>
                  {selectedDriver.vehicle_plate && (
                    <View style={[s.platePill, { marginTop: 4 }]}>
                      <Text style={s.plateText}>{selectedDriver.vehicle_plate}</Text>
                    </View>
                  )}
                </View>
                {selectedDriver.is_verified && (
                  <View style={s.verifiedTag}>
                    <Ionicons name="checkmark-circle" size={12} color={colors.green} />
                    <Text style={s.verifiedTagText}>Verified</Text>
                  </View>
                )}
              </View>

              {/* Stats row */}
              <View style={s.detailGrid}>
                <View style={s.detailItem}>
                  <Text style={s.detailLabel}>TOTAL EARNED</Text>
                  <Text style={[s.detailVal, { color: colors.green }]}>{formatZAR(selectedDriver.total_earnings)}</Text>
                </View>
                <View style={s.detailItem}>
                  <Text style={s.detailLabel}>TODAY</Text>
                  <Text style={[s.detailVal, { color: colors.cyan }]}>{formatZAR(selectedDriver.today_earnings ?? 0)}</Text>
                </View>
                <View style={s.detailItem}>
                  <Text style={s.detailLabel}>RATING</Text>
                  <Text style={[s.detailVal, { color: "#FFD60A" }]}>
                    {selectedDriver.rating_count > 0 ? `${selectedDriver.rating_avg.toFixed(1)}★` : "—"}
                  </Text>
                </View>
              </View>

              {/* Payment mode toggle */}
              <Text style={[s.inputLabel, { marginBottom: 6 }]}>PAYMENT MODE</Text>
              <View style={s.modeToggleRow}>
                <TouchableOpacity
                  style={[s.modeToggleBtn, driverMode === "daily_target" && s.modeToggleActive]}
                  onPress={() => setDriverMode("daily_target")}>
                  <Ionicons name="flag-outline" size={14} color={driverMode === "daily_target" ? colors.bg : colors.textMuted} />
                  <Text style={[s.modeToggleText, driverMode === "daily_target" && { color: colors.bg }]}>Daily Target</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.modeToggleBtn, driverMode === "commission_split" && s.modeToggleActiveCommission]}
                  onPress={() => setDriverMode("commission_split")}>
                  <Ionicons name="pie-chart-outline" size={14} color={driverMode === "commission_split" ? colors.bg : colors.textMuted} />
                  <Text style={[s.modeToggleText, driverMode === "commission_split" && { color: colors.bg }]}>Commission %</Text>
                </TouchableOpacity>
              </View>

              {/* Daily target section */}
              {driverMode === "daily_target" && (
                <>
                  {selectedDriver.daily_target > 0 && (
                    <View style={s.currentValueRow}>
                      <Ionicons name="flag" size={13} color={colors.cyan} />
                      <Text style={s.currentValueText}>Current target: <Text style={{ color: colors.cyan, fontWeight: "800" }}>{formatZAR(selectedDriver.daily_target)}</Text></Text>
                    </View>
                  )}
                  <Text style={s.inputLabel}>SET DAILY TARGET (ZAR)</Text>
                  <TextInput style={s.input} value={targetInput} onChangeText={setTargetInput}
                    placeholder={selectedDriver.daily_target > 0 ? `Current: ${formatZAR(selectedDriver.daily_target)}` : "e.g. 2500"}
                    placeholderTextColor={colors.textDim} keyboardType="decimal-pad" />
                  <TouchableOpacity
                    style={[s.actionBtn, { backgroundColor: colors.green + "22", borderColor: colors.green + "44" }]}
                    onPress={() => handleSetTarget(selectedDriver)} disabled={settingTarget}>
                    <Ionicons name="flag-outline" size={15} color={colors.green} />
                    <Text style={[s.actionBtnText, { color: colors.green }]}>{settingTarget ? "Saving…" : "Save Daily Target"}</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* Commission section */}
              {driverMode === "commission_split" && (
                <>
                  {(selectedDriver.driver_commission_pct ?? 0) > 0 && (
                    <View style={s.currentValueRow}>
                      <Ionicons name="pie-chart" size={13} color="#A064FF" />
                      <Text style={s.currentValueText}>
                        Driver gets <Text style={{ color: "#A064FF", fontWeight: "800" }}>{selectedDriver.driver_commission_pct}%</Text>
                        {" · "}You get <Text style={{ color: colors.green, fontWeight: "800" }}>{(100 - (selectedDriver.driver_commission_pct ?? 0)).toFixed(0)}%</Text>
                      </Text>
                    </View>
                  )}
                  <Text style={s.inputLabel}>DRIVER'S COMMISSION (%)</Text>
                  <TextInput style={s.input} value={commissionInput} onChangeText={setCommissionInput}
                    placeholder={`Current: ${selectedDriver.driver_commission_pct ?? 0}%`}
                    placeholderTextColor={colors.textDim} keyboardType="decimal-pad" />
                  {commissionInput && !isNaN(parseFloat(commissionInput)) && (
                    <View style={s.commissionHint}>
                      <Text style={s.commissionHintText}>
                        Driver keeps <Text style={{ color: "#A064FF", fontWeight: "800" }}>{parseFloat(commissionInput).toFixed(0)}%</Text>
                        {" · "}Owner earns <Text style={{ color: colors.green, fontWeight: "800" }}>{(100 - parseFloat(commissionInput)).toFixed(0)}%</Text> of every trip
                      </Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={[s.actionBtn, { backgroundColor: "#A064FF22", borderColor: "#A064FF44" }]}
                    onPress={() => handleSetCommission(selectedDriver)} disabled={settingCommission}>
                    <Ionicons name="pie-chart-outline" size={15} color="#A064FF" />
                    <Text style={[s.actionBtnText, { color: "#A064FF" }]}>{settingCommission ? "Saving…" : "Save Commission"}</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* Quick fleet actions */}
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: "#A064FF11", borderColor: "#A064FF33", flex: 1 }]}
                  onPress={() => { setSelectedDriver(null); setDeductionModal(selectedDriver); setDeductionAmt(""); setDeductionReason(""); }}>
                  <Ionicons name="remove-circle-outline" size={14} color="#A064FF" />
                  <Text style={[s.actionBtnText, { color: "#A064FF" }]}>Add Deduction</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: "#FF6B0011", borderColor: "#FF6B0033", flex: 1 }]}
                  onPress={() => { setSelectedDriver(null); openDocModal(selectedDriver); }}>
                  <Ionicons name="document-text-outline" size={14} color="#FF6B00" />
                  <Text style={[s.actionBtnText, { color: "#FF6B00" }]}>Documents</Text>
                </TouchableOpacity>
              </View>

              {/* View full earnings + confirm + action buttons */}
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: colors.cyanDim, borderColor: colors.cyan + "55", marginTop: 10 }]}
                onPress={() => { setSelectedDriver(null); router.push(`/owner/driver/${selectedDriver.user_id}` as any); }}>
                <Ionicons name="stats-chart-outline" size={15} color={colors.cyan} />
                <Text style={[s.actionBtnText, { color: colors.cyan }]}>View Full Earnings & Trips</Text>
              </TouchableOpacity>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: colors.green + "15", borderColor: colors.green + "44", flex: 1 }]}
                  onPress={() => handleConfirmDriver(selectedDriver)}>
                  <Ionicons name="checkmark-circle-outline" size={15} color={colors.green} />
                  <Text style={[s.actionBtnText, { color: colors.green }]}>Confirm</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: colors.redDim, borderColor: colors.red + "44", flex: 1 }]}
                  onPress={() => { setSelectedDriver(null); handleUnlink(selectedDriver); }}>
                  <Ionicons name="trash-outline" size={15} color={colors.red} />
                  <Text style={[s.actionBtnText, { color: colors.red }]}>Remove</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={() => setSelectedDriver(null)} style={{ alignItems: "center", paddingVertical: 14 }}>
                <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "600" }}>Close</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* Transfer review modal */}
      {transferModal && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setTransferModal(null)}>
          <Pressable style={s.overlay} onPress={() => setTransferModal(null)}>
            <Pressable style={s.sheet} onPress={e => e.stopPropagation()}>
              <View style={s.sheetHandle} />
              <View style={[s.sheetIconWrap, { backgroundColor: "#FF9F0A18", borderColor: "#FF9F0A44" }]}>
                <Ionicons name="swap-horizontal-outline" size={26} color="#FF9F0A" />
              </View>
              <Text style={s.sheetTitle}>Driver Transfer Request</Text>
              <Text style={s.sheetSub}>
                {transferModal.status === "pending_old_owner"
                  ? `${transferModal.driver_name} wants to leave your fleet and join another owner.`
                  : `${transferModal.driver_name} is requesting to join your fleet.`}
              </Text>
              <View style={{ marginBottom: 16 }}>
                {transferModal.old_owner_name && (
                  <View style={s.summaryRow}>
                    <Text style={s.summaryLabel}>From fleet</Text>
                    <Text style={s.summaryVal}>{transferModal.old_owner_name}</Text>
                  </View>
                )}
                <View style={s.summaryRow}>
                  <Text style={s.summaryLabel}>To fleet</Text>
                  <Text style={s.summaryVal}>{transferModal.new_owner_name}</Text>
                </View>
                <View style={s.summaryRow}>
                  <Text style={s.summaryLabel}>Driver</Text>
                  <Text style={s.summaryVal}>{transferModal.driver_name}</Text>
                </View>
              </View>
              <Text style={s.inputLabel}>REJECTION REASON (if rejecting)</Text>
              <TextInput
                style={s.input}
                value={rejectReason}
                onChangeText={setRejectReason}
                placeholder="Optional reason for rejection"
                placeholderTextColor={colors.textDim}
              />
              <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    label={actingTransfer ? "…" : "Reject"}
                    variant="destructive"
                    loading={actingTransfer}
                    onPress={async () => {
                      if (!rejectReason.trim()) { Alert.alert("Required", "Enter a rejection reason."); return; }
                      setActingTransfer(true);
                      try {
                        await api.ownerTransferReject(transferModal.id, rejectReason.trim());
                        Alert.alert("Rejected", "Transfer request rejected.");
                        setTransferModal(null); load();
                      } catch (e: any) { Alert.alert("Error", e?.message); }
                      finally { setActingTransfer(false); }
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label={actingTransfer ? "…" : "Approve"}
                    loading={actingTransfer}
                    onPress={async () => {
                      setActingTransfer(true);
                      try {
                        await api.ownerTransferApprove(transferModal.id);
                        const msg = transferModal.status === "pending_old_owner"
                          ? "Approved — waiting for new owner to accept."
                          : "Approved — driver has been added to your fleet!";
                        Alert.alert("Approved", msg);
                        setTransferModal(null); load();
                      } catch (e: any) { Alert.alert("Error", e?.message); }
                      finally { setActingTransfer(false); }
                    }}
                  />
                </View>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
      {/* ── SOS choice modal ── */}
      <Modal visible={sosModal} transparent animationType="slide" onRequestClose={closeSosModal}>
        <Pressable style={ss.backdrop} onPress={closeSosModal}>
          <Pressable style={[ss.sheet, { backgroundColor: colors.bg2, borderColor: colors.border }]} onPress={() => {}}>
            <View style={ss.handle} />
            <View style={[ss.iconWrap, { backgroundColor: colors.redDim, borderColor: colors.red + "40" }]}>
              <Ionicons name="warning" size={32} color={colors.red} />
            </View>
            <Text style={[ss.title, { color: colors.text }]}>Emergency SOS</Text>
            <Text style={[ss.sub, { color: colors.textMuted }]}>
              Select the type of emergency — admin will contact services on your behalf
            </Text>
            <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
              <TouchableOpacity
                onPress={() => setSosEmergencyType("police")}
                style={{ flex: 1, paddingVertical: 20, borderRadius: 14, borderWidth: 2,
                  borderColor: sosEmergencyType === "police" ? "#1D4ED8" : colors.border,
                  backgroundColor: sosEmergencyType === "police" ? "#1D4ED820" : colors.bg,
                  alignItems: "center", gap: 8 }}>
                <Ionicons name="shield" size={32} color={sosEmergencyType === "police" ? "#1D4ED8" : colors.textMuted} />
                <Text style={{ fontWeight: "900", fontSize: 15, color: sosEmergencyType === "police" ? "#1D4ED8" : colors.textMuted, letterSpacing: 0.5 }}>POLICE</Text>
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

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button label="Cancel" variant="secondary" onPress={closeSosModal} />
              </View>
              <TouchableOpacity onPress={handleSOS} disabled={!sosEmergencyType}
                style={{ flex: 1, backgroundColor: sosEmergencyType ? colors.red : colors.border, borderRadius: 10, paddingVertical: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }}>
                <Ionicons name="flash" size={16} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "900", fontSize: 14, letterSpacing: 0.5 }}>SEND SOS</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── SOS cancel modal (PIN required) ── */}
      <Modal visible={cancelModal} transparent animationType="slide" onRequestClose={() => setCancelModal(false)}>
        <Pressable style={ss.backdrop} onPress={() => setCancelModal(false)}>
          <Pressable style={[ss.sheet, { backgroundColor: colors.bg2, borderColor: colors.border }]} onPress={() => {}}>
            <View style={ss.handle} />
            <View style={[ss.iconWrap, { backgroundColor: colors.greenDim, borderColor: colors.green + "40" }]}>
              <Ionicons name="checkmark-circle-outline" size={32} color={colors.green} />
            </View>
            <Text style={[ss.title, { color: colors.text }]}>Cancel SOS</Text>
            <Text style={[ss.sub, { color: colors.textMuted }]}>
              Enter your PIN to confirm you are safe and cancel the {sosActive?.type} alert.
            </Text>
            <TextInput
              style={[ss.pinInput, { backgroundColor: colors.bg, borderColor: cancelError ? colors.red : colors.border, color: colors.text }]}
              value={cancelPin}
              onChangeText={v => { setCancelPin(v.replace(/\D/g, "").slice(0, 6)); setCancelError(""); }}
              placeholder="••••" placeholderTextColor={colors.textDim}
              keyboardType="number-pad" secureTextEntry maxLength={6} autoFocus
            />
            {cancelError ? <Text style={{ color: colors.red, fontSize: 12, textAlign: "center", marginBottom: 8 }}>{cancelError}</Text> : null}
            <TouchableOpacity
              style={[ss.confirmBtn, { backgroundColor: colors.green, opacity: cancelling || cancelPin.length < 4 ? 0.5 : 1 }]}
              onPress={handleCancelSOS} disabled={cancelling || cancelPin.length < 4}>
              {cancelling ? <ActivityIndicator color="#fff" size="small" /> : (
                <><Ionicons name="checkmark" size={18} color="#fff" />
                  <Text style={{ color: "#fff", fontSize: 15, fontWeight: "800" }}>I Am Safe — Cancel SOS</Text></>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setCancelModal(false)} style={ss.cancelRow}>
              <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "600" }}>Keep SOS active</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const ss = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 48, borderTopWidth: 1 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#444", alignSelf: "center", marginBottom: 20 },
  iconWrap: { width: 64, height: 64, borderRadius: 32, borderWidth: 1, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 14 },
  title: { fontSize: 22, fontWeight: "900", textAlign: "center", marginBottom: 6 },
  sub: { fontSize: 13, textAlign: "center", lineHeight: 20, marginBottom: 24 },
  cancelRow: { alignItems: "center", paddingVertical: 14 },
  pinInput: { borderWidth: 1.5, borderRadius: 14, fontSize: 22, padding: 16, textAlign: "center", letterSpacing: 8, marginBottom: 8 },
  confirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, padding: 16, marginTop: 4 },
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, paddingBottom: 12 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandDot: { width: 4, height: 32, borderRadius: 2, backgroundColor: colors.cyan },
  greeting: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  ownerName: { color: colors.text, fontSize: 20, fontWeight: "800" },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.cyanDim, borderWidth: 1, borderColor: colors.cyan, alignItems: "center", justifyContent: "center" },
  bellBadge: { position: "absolute", top: -4, right: -4, backgroundColor: "#FF3B30", borderRadius: 8, minWidth: 16, height: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 2 },
  bellBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  driveBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.cyan, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  driveBtnText: { color: colors.bg, fontWeight: "800", fontSize: 13 },
  sosHeaderBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1.5, borderColor: colors.red, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: colors.redDim },
  sosHeaderText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  statsGrid: { flexDirection: "row", gap: 10 },
  statCard: { flex: 1, backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, padding: 14 },
  statIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  statVal: { fontSize: 18, fontWeight: "900" },
  statLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", marginTop: 2 },
  statSub: { color: colors.textDim, fontSize: 10, marginTop: 1 },
  infoBanner: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.greenDim, borderRadius: radius.md, borderWidth: 1, borderColor: colors.green + "44", padding: 14, marginTop: 12 },
  infoBannerTitle: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  infoBannerVal: { fontSize: 18, fontWeight: "900", marginTop: 1 },
  warningBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FFD60A11", borderRadius: radius.md, borderWidth: 1, borderColor: "#FFD60A33", padding: 12, marginTop: 10 },
  warningBannerText: { color: "#FFD60A", fontSize: 13, fontWeight: "700", flex: 1 },
  transferBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FF9F0A11", borderRadius: radius.md, borderWidth: 1, borderColor: "#FF9F0A33", padding: 12, marginTop: 10 },
  transferBannerText: { color: "#FF9F0A", fontSize: 13, fontWeight: "700", flex: 1 },
  transferBannerAction: { color: "#FF9F0A", fontSize: 12, fontWeight: "800", textDecorationLine: "underline" },
  tabRow: { flexDirection: "row", gap: 6, marginTop: 16, marginBottom: 4 },
  tab: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border },
  tabActive: { backgroundColor: colors.cyanDim, borderColor: colors.cyan },
  tabText: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  tabTextActive: { color: colors.cyan },
  tabBadge: { borderRadius: 999, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  tabBadgeText: { fontSize: 10, fontWeight: "800", color: colors.textMuted },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, textTransform: "uppercase" },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.cyan, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  addBtnText: { color: colors.bg, fontWeight: "800", fontSize: 13 },
  driverCard: { backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10, flexDirection: "row", alignItems: "flex-start", gap: 12 },
  driverCardTop: { borderColor: "#FFD60A44", backgroundColor: "#FFD60A08" },
  driverRank: { paddingTop: 2 },
  driverRankNum: { color: colors.textDim, fontSize: 10, fontWeight: "800" },
  driverAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.cyanDim, borderWidth: 1.5, alignItems: "center", justifyContent: "center", position: "relative" },
  crownWrap: { position: "absolute", top: -8, right: -4 },
  driverName: { color: colors.text, fontWeight: "700", fontSize: 14 },
  driverPhone: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  platePill: { backgroundColor: "#FFD60A", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginTop: 4, alignSelf: "flex-start" },
  plateText: { color: "#111", fontWeight: "900", fontSize: 11 },
  targetLabel: { color: colors.textDim, fontSize: 10, fontWeight: "600" },
  barBg: { height: 4, backgroundColor: colors.border, borderRadius: 2, marginTop: 4, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 2 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4 },
  ratingText: { color: colors.textMuted, fontSize: 10 },
  driverRight: { alignItems: "flex-end", paddingTop: 2 },
  driverEarnings: { color: colors.green, fontWeight: "900", fontSize: 16 },
  driverEarningsLabel: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  // Performance
  perfCard: { backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 12 },
  perfCardTitle: { color: colors.text, fontWeight: "700", fontSize: 14, marginBottom: 8 },
  perfCardSub: { color: colors.textMuted, fontSize: 11, marginTop: 6 },
  lbRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  lbRankBadge: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  lbRank: { fontSize: 11, fontWeight: "800" },
  lbName: { color: colors.text, fontSize: 13, fontWeight: "600" },
  lbEarnings: { fontSize: 13, fontWeight: "800" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  summaryLabel: { color: colors.textMuted, fontSize: 13 },
  summaryVal: { fontSize: 13, fontWeight: "700" },
  // Cash-ups
  cashupRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 8 },
  cashupIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.cyanDim, alignItems: "center", justifyContent: "center" },
  cashupDriver: { color: colors.text, fontWeight: "700", fontSize: 14 },
  cashupDate: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  cashupMethod: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  cashupAmt: { color: "#A064FF", fontWeight: "900", fontSize: 16 },
  cashupShortfall: { color: colors.red, fontSize: 11, marginTop: 2 },
  cashupProfit: { color: colors.green, fontSize: 11, marginTop: 2 },
  // Outstanding
  outstandingRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: "#FFD60A33", padding: 14, marginBottom: 8 },
  outstandingIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#FFD60A11", alignItems: "center", justifyContent: "center" },
  outstandingDriver: { color: colors.text, fontWeight: "700", fontSize: 14 },
  outstandingReason: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  outstandingDate: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  outstandingAmt: { color: "#FFD60A", fontWeight: "900", fontSize: 18 },
  cancelBtn: { backgroundColor: colors.redDim, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.red + "44", paddingHorizontal: 12, paddingVertical: 6 },
  cancelBtnText: { color: colors.red, fontSize: 12, fontWeight: "700" },
  // Empty state
  empty: { alignItems: "center", padding: 40, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, borderRadius: radius.md, marginBottom: 12 },
  emptyTitle: { color: colors.text, fontWeight: "700", marginTop: 12, fontSize: 16 },
  emptySub: { color: colors.textMuted, fontSize: 13, marginTop: 4, textAlign: "center" },
  // Modals
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.bg2, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, borderTopWidth: 1, borderColor: colors.border },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 20 },
  sheetIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.cyanDim, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  sheetTitle: { color: colors.text, fontSize: 20, fontWeight: "800", textAlign: "center" },
  sheetSub: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginTop: 4, marginBottom: 20 },
  driverDetailHeader: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 16 },
  verifiedTag: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.greenDim, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: colors.green + "44" },
  verifiedTagText: { color: colors.green, fontSize: 11, fontWeight: "700" },
  detailGrid: { flexDirection: "row", gap: 10, marginBottom: 16 },
  detailItem: { flex: 1, backgroundColor: colors.bg, borderRadius: radius.md, padding: 12 },
  detailLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase" },
  detailVal: { color: colors.text, fontWeight: "800", fontSize: 16, marginTop: 4 },
  inputLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 8 },
  input: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 14, color: colors.text, fontSize: 16, fontWeight: "700", marginBottom: 4 },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1 },
  actionBtnText: { fontWeight: "700", fontSize: 13 },
  // Driver card payment mode badge
  modeBadge: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, alignSelf: "flex-start", backgroundColor: colors.bg, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: colors.border },
  modeBadgeText: { fontSize: 9, fontWeight: "700" },
  // Online status dot on driver avatar
  onlineDot: { position: "absolute", bottom: 0, right: 0, width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: colors.bg2 },
  // Quick action buttons on driver card
  cardQuickBtn: { width: 26, height: 26, borderRadius: 6, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  // Live status row
  liveStatusRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10, marginTop: 10, marginBottom: 4 },
  liveStatusItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  liveStatusText: { color: colors.textMuted, fontSize: 12 },
  liveLabel: { marginLeft: "auto" as any, color: colors.cyan, fontSize: 9, fontWeight: "900", letterSpacing: 1.4 },
  // Deductions tab
  deductionTypePill: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  deductionTypeText: { fontSize: 10, fontWeight: "700" },
  // Document modal
  docRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, padding: 12, marginBottom: 8 },
  docType: { color: colors.text, fontWeight: "800", fontSize: 13 },
  docExpiry: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  docStatusPill: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginTop: 4, alignSelf: "flex-start" },
  docStatusText: { fontSize: 10, fontWeight: "800" },
  // Driver detail modal: payment mode toggle
  modeToggleRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  modeToggleBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.bg },
  modeToggleActive: { backgroundColor: colors.cyan, borderColor: colors.cyan },
  modeToggleActiveCommission: { backgroundColor: "#A064FF", borderColor: "#A064FF" },
  modeToggleText: { color: colors.textMuted, fontWeight: "700", fontSize: 13 },
  currentValueRow: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.bg, borderRadius: radius.sm, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  currentValueText: { color: colors.textMuted, fontSize: 12 },
  commissionHint: { backgroundColor: "#A064FF11", borderRadius: radius.sm, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: "#A064FF33" },
  commissionHintText: { color: colors.textMuted, fontSize: 12, textAlign: "center" },
});
