import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Modal, RefreshControl, Vibration, TextInput, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/AuthContext";
import { api } from "../../src/api";
import { colors, formatZAR, radius } from "../../src/theme";

function formatDuration(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}hr ${m}m`;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

const FARE_PRESETS = [10, 15, 20, 25, 30, 35, 50];export default function EarningsScreen() {
  const { state } = useAuth();
  const [routeData, setRouteData] = useState<any>(null);
  const [cashupStatus, setCashupStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [startModal, setStartModal] = useState(false);
  const [summaryModal, setSummaryModal] = useState(false);
  const [cashupModal, setCashupModal] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [selectedFare, setSelectedFare] = useState(0);
  const [customFare, setCustomFare] = useState("");
  const [cashUpdating, setCashUpdating] = useState(false);
  const [cashingUp, setCashingUp] = useState(false);
  const [cashupDest, setCashupDest] = useState<any>(null);
  const prevPaymentCount = useRef(0);

  if (state.status !== "authed") return null;

  const load = useCallback(async () => {
    try {
      const [routeRes, statusRes] = await Promise.all([
        api.currentRoute(),
        api.driverCashupStatus().catch(() => null),
      ]);
      if (routeRes.active && routeRes.app_count > prevPaymentCount.current) {
        if (prevPaymentCount.current > 0) Vibration.vibrate(300);
        prevPaymentCount.current = routeRes.app_count;
      }
      setRouteData(routeRes);
      setCashupStatus(statusRes);
    } catch (e) {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [load]);

  const handleStartRoute = async () => {
    const fare = customFare ? parseFloat(customFare) : selectedFare || 0;
    try {
      await api.startRoute(fare);
      setStartModal(false);
      setSelectedFare(0);
      setCustomFare("");
      prevPaymentCount.current = 0;
      load();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not start route");
    }
  };

  const handleEndRoute = async () => {
    if (Platform.OS === "web") {
      try {
        const res = await api.endRoute();
        setSummary(res.summary);
        setSummaryModal(true);
        prevPaymentCount.current = 0;
        load();
      } catch (e: any) { console.error(e); }
      return;
    }
    Alert.alert("End Route?", "This will close the current route.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "End Route", style: "destructive",
        onPress: async () => {
          try {
            const res = await api.endRoute();
            setSummary(res.summary);
            setSummaryModal(true);
            prevPaymentCount.current = 0;
            load();
          } catch (e: any) { Alert.alert("Error", e?.message || "Could not end route"); }
        },
      },
    ]);
  };

  const handleCash = async (delta: 1 | -1) => {
    setCashUpdating(true);
    try {
      const res = await api.updateCash(delta);
      setRouteData((prev: any) => ({
        ...prev,
        cash_count: res.cash_count,
        total_passengers: prev.app_count + res.cash_count,
      }));
    } catch (e) {}
    finally { setCashUpdating(false); }
  };

  const handleOpenCashup = async () => {
    try {
      const dest = await api.driverCashupDestination();
      setCashupDest(dest);
      setCashupModal(true);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not load cashup info");
    }
  };

  const handleCashup = async () => {
    if (!cashupStatus?.owner_user_id) return;
    setCashingUp(true);
    try {
      const res = await api.driverCashupV2(cashupStatus.owner_user_id);
      setCashupModal(false);
      const lines = [
        `Cash-up: ${formatZAR(res.cashup_amount)}`,
        res.driver_profit > 0 ? `Your profit: ${formatZAR(res.driver_profit)}` : null,
        res.shortfall > 0 ? `Outstanding: ${formatZAR(res.shortfall)}` : null,
        `Method: ${res.method === "wallet" ? "Owner wallet (free)" : `Owner bank (-R${res.payout_fee?.toFixed(2)})`}`,
      ].filter(Boolean).join("\n");
      Alert.alert("Cash-Up Complete!", lines);
      load();
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Could not complete cash-up");
    } finally { setCashingUp(false); }
  };

  const onRefresh = async () => { setRefreshing(true); await load(); };if (!routeData || !routeData.active) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.cyan} />}>

          <Text style={styles.pageTitle}>Earnings</Text>

          <View style={styles.todayCard}>
            <Text style={styles.todayLabel}>TODAY'S TOTAL</Text>
            <Text style={styles.todayAmount}>{formatZAR(routeData ? routeData.today_total : 0)}</Text>
            <Text style={styles.todayCount}>{routeData ? routeData.today_count : 0} passengers paid via app</Text>
          </View>

          {cashupStatus?.has_owner && (
            <View style={styles.cashupCard}>
              <View style={styles.cashupHeader}>
                <Ionicons name="business-outline" size={20} color="#A064FF" />
                <Text style={styles.cashupTitle}>Daily Cash-Up</Text>
                {cashupStatus.is_confirmed && (
                  <View style={styles.confirmedBadge}>
                    <Ionicons name="checkmark-circle" size={12} color={colors.green} />
                    <Text style={styles.confirmedText}>Confirmed</Text>
                  </View>
                )}
              </View>
              <Text style={styles.cashupOwner}>Owner: {cashupStatus.owner_name}</Text>
              <View style={styles.cashupStatsRow}>
                <View style={styles.cashupStat}>
                  <Text style={styles.cashupStatVal}>{formatZAR(cashupStatus.daily_target)}</Text>
                  <Text style={styles.cashupStatLabel}>Target</Text>
                </View>
                <View style={styles.cashupStat}>
                  <Text style={[styles.cashupStatVal, { color: colors.green }]}>{formatZAR(cashupStatus.today_earned)}</Text>
                  <Text style={styles.cashupStatLabel}>Earned</Text>
                </View>
                <View style={styles.cashupStat}>
                  <Text style={[styles.cashupStatVal, { color: cashupStatus.driver_profit > 0 ? colors.cyan : colors.red }]}>
                    {formatZAR(cashupStatus.driver_profit > 0 ? cashupStatus.driver_profit : cashupStatus.shortfall)}
                  </Text>
                  <Text style={styles.cashupStatLabel}>{cashupStatus.driver_profit > 0 ? "Profit" : "Shortfall"}</Text>
                </View>
              </View>
              {cashupStatus.outstanding_balance > 0 && (
                <View style={styles.outstandingBanner}>
                  <Ionicons name="warning-outline" size={14} color="#FFD60A" />
                  <Text style={styles.outstandingText}>Outstanding: {formatZAR(cashupStatus.outstanding_balance)}</Text>
                </View>
              )}
              {!cashupStatus.is_confirmed && (
                <View style={styles.unconfirmedNote}>
                  <Ionicons name="information-circle-outline" size={13} color={colors.textMuted} />
                  <Text style={styles.unconfirmedText}>Owner has not confirmed you yet — using your saved account</Text>
                </View>
              )}
              <TouchableOpacity
                style={[styles.cashupBtn, cashupStatus.today_earned <= 0 && styles.cashupBtnDisabled]}
                onPress={handleOpenCashup}
                disabled={cashupStatus.today_earned <= 0}>
                <Ionicons name="arrow-up-circle" size={18} color={colors.bg} />
                <Text style={styles.cashupBtnText}>Cash Up {formatZAR(cashupStatus.cashup_amount)} to Owner</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.offDutyCard}>
            <View style={styles.offDutyDot} />
            <Text style={styles.offDutyTitle}>OFF ROUTE</Text>
            <Text style={styles.offDutySub}>Start a route to track payments</Text>
            <TouchableOpacity style={styles.startBtn} onPress={() => setStartModal(true)}>
              <Ionicons name="play-circle" size={22} color={colors.bg} />
              <Text style={styles.startBtnText}>Start Route</Text>
            </TouchableOpacity>
          </View>

          {routeData?.last_route && (
            <View style={styles.lastRouteCard}>
              <Text style={styles.sectionLabel}>LAST ROUTE</Text>
              <View style={styles.lastRouteRow}>
                <View style={styles.lastRouteStat}>
                  <Text style={styles.lastRouteVal}>{formatZAR(routeData.last_route.total_collected)}</Text>
                  <Text style={styles.lastRouteLabel}>Collected</Text>
                </View>
                <View style={styles.lastRouteStat}>
                  <Text style={styles.lastRouteVal}>{routeData.last_route.total_passengers}</Text>
                  <Text style={styles.lastRouteLabel}>Passengers</Text>
                </View>
                <View style={styles.lastRouteStat}>
                  <Text style={styles.lastRouteVal}>{formatDuration(routeData.last_route.duration_mins)}</Text>
                  <Text style={styles.lastRouteLabel}>Duration</Text>
                </View>
              </View>
              <Text style={styles.lastRouteSub}>
                {routeData.last_route.app_count} app · {routeData.last_route.cash_count} cash
                {routeData.last_route.fare > 0 ? ` · R${routeData.last_route.fare} fare` : ""}
              </Text>
            </View>
          )}
        </ScrollView>

        <Modal visible={startModal} transparent animationType="slide" onRequestClose={() => setStartModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Start Route</Text>
              <Text style={styles.modalSub}>Set fare for underpaid alerts (optional)</Text>
              <Text style={styles.fareLabel}>ROUTE FARE</Text>
              <View style={styles.fareGrid}>
                {FARE_PRESETS.map(f => (
                  <TouchableOpacity key={f} onPress={() => { setSelectedFare(f); setCustomFare(""); }}
                    style={[styles.fareChip, selectedFare === f && !customFare && styles.fareChipActive]}>
                    <Text style={[styles.fareChipText, selectedFare === f && !customFare && styles.fareChipTextActive]}>R{f}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity onPress={() => { setSelectedFare(0); setCustomFare(""); }}
                  style={[styles.fareChip, selectedFare === 0 && !customFare && styles.fareChipActive]}>
                  <Text style={[styles.fareChipText, selectedFare === 0 && !customFare && styles.fareChipTextActive]}>No fare</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.fareLabel}>OR ENTER CUSTOM FARE</Text>
              <TextInput
                style={[styles.customFareInput, customFare ? styles.customFareInputActive : null]}
                value={customFare}
                onChangeText={(t) => { setCustomFare(t.replace(/[^0-9]/g, "")); setSelectedFare(0); }}
                placeholder="e.g. 18" placeholderTextColor={colors.textDim} keyboardType="number-pad"
              />
              <View style={styles.modalActions}>
                <View style={{ flex: 1 }}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => { setStartModal(false); setSelectedFare(0); setCustomFare(""); }}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flex: 1 }}>
                  <TouchableOpacity style={styles.confirmBtn} onPress={handleStartRoute}>
                    <Ionicons name="play-circle" size={18} color={colors.bg} />
                    <Text style={styles.confirmBtnText}>{customFare ? `Start · R${customFare}` : selectedFare > 0 ? `Start · R${selectedFare}` : "Start Route"}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={summaryModal} transparent animationType="slide" onRequestClose={() => setSummaryModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <Text style={styles.summaryEmoji}>🎉</Text>
              <Text style={styles.modalTitle}>Route Complete!</Text>
              <View style={styles.summaryGrid}>
                <View style={styles.summaryStat}>
                  <Text style={styles.summaryVal}>{formatZAR(summary ? summary.total_collected : 0)}</Text>
                  <Text style={styles.summaryStatLabel}>Collected</Text>
                </View>
                <View style={styles.summaryStat}>
                  <Text style={styles.summaryVal}>{summary ? summary.total_passengers : 0}</Text>
                  <Text style={styles.summaryStatLabel}>Passengers</Text>
                </View>
                <View style={styles.summaryStat}>
                  <Text style={styles.summaryVal}>{formatDuration(summary ? summary.duration_mins : 0)}</Text>
                  <Text style={styles.summaryStatLabel}>Duration</Text>
                </View>
              </View>
              <Text style={styles.summarySub}>{summary ? summary.app_count : 0} app · {summary ? summary.cash_count : 0} cash</Text>
              <View style={styles.modalActions}>
                <View style={{ flex: 1 }}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setSummaryModal(false)}>
                    <Text style={styles.cancelBtnText}>Done</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flex: 1 }}>
                  <TouchableOpacity style={styles.confirmBtn} onPress={() => { setSummaryModal(false); setStartModal(true); }}>
                    <Ionicons name="play-circle" size={18} color={colors.bg} />
                    <Text style={styles.confirmBtnText}>New Route</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={cashupModal} transparent animationType="slide" onRequestClose={() => setCashupModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Confirm Cash-Up</Text>
              {cashupStatus && (
                <>
                  <View style={styles.cashupConfirmGrid}>
                    <View style={styles.cashupConfirmRow}>
                      <Text style={styles.cashupConfirmLabel}>Today's target</Text>
                      <Text style={styles.cashupConfirmVal}>{formatZAR(cashupStatus.daily_target)}</Text>
                    </View>
                    <View style={styles.cashupConfirmRow}>
                      <Text style={styles.cashupConfirmLabel}>You earned</Text>
                      <Text style={[styles.cashupConfirmVal, { color: colors.green }]}>{formatZAR(cashupStatus.today_earned)}</Text>
                    </View>
                    <View style={[styles.cashupConfirmRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, marginTop: 4 }]}>
                      <Text style={styles.cashupConfirmLabel}>Cash-up amount</Text>
                      <Text style={[styles.cashupConfirmVal, { color: "#A064FF" }]}>{formatZAR(cashupStatus.cashup_amount)}</Text>
                    </View>
                    {cashupStatus.driver_profit > 0 && (
                      <View style={styles.cashupConfirmRow}>
                        <Text style={styles.cashupConfirmLabel}>Your profit</Text>
                        <Text style={[styles.cashupConfirmVal, { color: colors.cyan }]}>{formatZAR(cashupStatus.driver_profit)}</Text>
                      </View>
                    )}
                    {cashupStatus.shortfall > 0 && (
                      <View style={styles.cashupConfirmRow}>
                        <Text style={[styles.cashupConfirmLabel, { color: colors.red }]}>Shortfall (outstanding)</Text>
                        <Text style={[styles.cashupConfirmVal, { color: colors.red }]}>{formatZAR(cashupStatus.shortfall)}</Text>
                      </View>
                    )}
                  </View>
                  {cashupDest && (
                    <View style={styles.destCard}>
                      <Text style={styles.destTitle}>GOING TO</Text>
                      <View style={styles.destRow}>
                        <Ionicons name={cashupDest.confirmed ? "checkmark-circle" : "warning-outline"} size={16} color={cashupDest.confirmed ? colors.green : "#FFD60A"} />
                        <Text style={[styles.destText, !cashupDest.confirmed && { color: "#FFD60A" }]}>
                          {cashupDest.confirmed
                            ? cashupDest.method === "wallet"
                              ? `${cashupStatus.owner_name} wallet (free)`
                              : `${cashupDest.account?.bank_name} (R3.50 fee)`
                            : cashupDest.account
                              ? `Your saved: ${cashupDest.account.bank_name} (R3.50 fee)`
                              : "No account — contact owner"}
                        </Text>
                      </View>
                    </View>
                  )}
                </>
              )}
              <View style={styles.modalActions}>
                <View style={{ flex: 1 }}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setCashupModal(false)}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flex: 1 }}>
                  <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: "#A064FF" }]} onPress={handleCashup} disabled={cashingUp}>
                    <Ionicons name="arrow-up-circle" size={18} color={colors.bg} />
                    <Text style={styles.confirmBtnText}>{cashingUp ? "Processing..." : "Confirm"}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
        }const isLongRoute = routeData.duration_mins >= 120;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.cyan} />}>

        <Text style={styles.pageTitle}>Earnings</Text>

        <View style={styles.activeHeader}>
          <View style={styles.activeLeft}>
            <View style={styles.activeDot} />
            <Text style={styles.activeTitle}>ROUTE ACTIVE</Text>
            <Text style={styles.activeDuration}>{formatDuration(routeData.duration_mins)}</Text>
          </View>
          <TouchableOpacity style={styles.endBtn} onPress={handleEndRoute}>
            <Ionicons name="stop-circle" size={18} color="#fff" />
            <Text style={styles.endBtnText}>End Route</Text>
          </TouchableOpacity>
        </View>

        {isLongRoute && (
          <View style={styles.warningBanner}>
            <Ionicons name="warning-outline" size={16} color="#FFD60A" />
            <Text style={styles.warningText}>Route running {formatDuration(routeData.duration_mins)} — did you forget to end?</Text>
          </View>
        )}

        {cashupStatus?.has_owner && cashupStatus.daily_target > 0 && (
          <View style={styles.targetMini}>
            <Text style={styles.targetMiniLabel}>Target: {formatZAR(cashupStatus.daily_target)}</Text>
            <View style={styles.targetBar}>
              <View style={[styles.targetBarFill, {
                width: `${Math.min(100, (routeData.today_total / cashupStatus.daily_target) * 100)}%` as any,
                backgroundColor: routeData.today_total >= cashupStatus.daily_target ? colors.green : colors.cyan,
              }]} />
            </View>
            <Text style={styles.targetMiniPct}>{Math.round((routeData.today_total / cashupStatus.daily_target) * 100)}%</Text>
          </View>
        )}

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { flex: 1.2 }]}>
            <Text style={styles.statCardLabel}>COLLECTED</Text>
            <Text style={styles.statCardVal}>{formatZAR(routeData.total_collected)}</Text>
            {routeData.fare > 0 && <Text style={styles.statCardSub}>R{routeData.fare} fare</Text>}
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statCardLabel}>PASSENGERS</Text>
            <Text style={[styles.statCardVal, { color: colors.cyan }]}>{routeData.total_passengers}</Text>
            <Text style={styles.statCardSub}>{routeData.app_count} app</Text>
          </View>
        </View>

        <View style={styles.cashCard}>
          <View style={styles.cashLeft}>
            <Ionicons name="cash-outline" size={20} color="#FFD60A" />
            <View>
              <Text style={styles.cashTitle}>Cash Passengers</Text>
              <Text style={styles.cashSub}>Tap to add or remove</Text>
            </View>
          </View>
          <View style={styles.cashCounter}>
            <TouchableOpacity style={[styles.cashBtn, routeData.cash_count === 0 && styles.cashBtnDisabled]}
              onPress={() => handleCash(-1)} disabled={cashUpdating || routeData.cash_count === 0}>
              <Ionicons name="remove" size={20} color={routeData.cash_count === 0 ? colors.textDim : colors.text} />
            </TouchableOpacity>
            <Text style={styles.cashCount}>{routeData.cash_count}</Text>
            <TouchableOpacity style={styles.cashBtn} onPress={() => handleCash(1)} disabled={cashUpdating}>
              <Ionicons name="add" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.todayMini}>
          <Text style={styles.todayMiniLabel}>Today total</Text>
          <Text style={styles.todayMiniVal}>{formatZAR(routeData.today_total)}</Text>
          <Text style={styles.todayMiniCount}>{routeData.today_count} passengers</Text>
        </View>

        <Text style={styles.sectionLabel}>APP PAYMENTS THIS ROUTE ({routeData.app_count})</Text>

        {routeData.payments.length === 0 ? (
          <View style={styles.emptyFeed}>
            <Ionicons name="time-outline" size={32} color={colors.textDim} />
            <Text style={styles.emptyFeedText}>Waiting for payments...</Text>
            <Text style={styles.emptyFeedSub}>Passengers scan your QR · auto-refreshes every 10s</Text>
          </View>
        ) : (
          routeData.payments.map((p: any, i: number) => (
            <View key={p.id} style={[styles.paymentCard, i === 0 && styles.paymentCardNew, p.underpaid && styles.paymentCardWarn]}>
              <View style={[styles.paymentIcon, { backgroundColor: p.underpaid ? "#FFD60A22" : colors.greenDim }]}>
                <Ionicons name={p.underpaid ? "warning" : "checkmark-circle"} size={22} color={p.underpaid ? "#FFD60A" : colors.green} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.paymentAmount, p.underpaid && { color: "#FFD60A" }]}>
                  {formatZAR(p.driver_net)}
                  {p.underpaid && routeData.fare > 0 && <Text style={styles.underpaidTag}> -{formatZAR(routeData.fare - p.amount)}</Text>}
                </Text>
                <Text style={styles.paymentTime}>{formatTime(p.created_at)}</Text>
              </View>
              {p.underpaid && <View style={styles.underpaidBadge}><Text style={styles.underpaidBadgeText}>Underpaid</Text></View>}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  pageTitle: { color: colors.text, fontSize: 26, fontWeight: "800", marginBottom: 16 },
  sectionLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 10 },
  todayCard: { backgroundColor: colors.bg2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 20, alignItems: "center", marginBottom: 16 },
  todayLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4 },
  todayAmount: { color: colors.green, fontSize: 36, fontWeight: "900", marginTop: 4 },
  todayCount: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  cashupCard: { backgroundColor: colors.bg2, borderRadius: radius.lg, borderWidth: 1, borderColor: "#A064FF44", padding: 16, marginBottom: 16 },
  cashupHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  cashupTitle: { color: colors.text, fontWeight: "800", fontSize: 15, flex: 1 },
  confirmedBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.greenDim, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  confirmedText: { color: colors.green, fontSize: 10, fontWeight: "700" },
  cashupOwner: { color: colors.textMuted, fontSize: 12, marginBottom: 12 },
  cashupStatsRow: { flexDirection: "row", marginBottom: 12 },
  cashupStat: { flex: 1, alignItems: "center" },
  cashupStatVal: { color: colors.text, fontWeight: "800", fontSize: 16 },
  cashupStatLabel: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  outstandingBanner: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FFD60A11", borderRadius: radius.sm, padding: 8, marginBottom: 8, borderWidth: 1, borderColor: "#FFD60A33" },
  outstandingText: { color: "#FFD60A", fontSize: 12, fontWeight: "700" },
  unconfirmedNote: { flexDirection: "row", alignItems: "center", gap: 6, padding: 8, backgroundColor: colors.bg3, borderRadius: radius.sm, marginBottom: 8 },
  unconfirmedText: { color: colors.textMuted, fontSize: 11, flex: 1 },
  cashupBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#A064FF", borderRadius: radius.md, paddingVertical: 14 },
  cashupBtnDisabled: { backgroundColor: colors.bg3, borderWidth: 1, borderColor: colors.border },
  cashupBtnText: { color: colors.bg, fontWeight: "800", fontSize: 15 },
  offDutyCard: { backgroundColor: colors.bg2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 32, alignItems: "center", marginBottom: 16, gap: 8 },
  offDutyDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.textDim },
  offDutyTitle: { color: colors.textMuted, fontSize: 13, fontWeight: "800", letterSpacing: 2 },
  offDutySub: { color: colors.textDim, fontSize: 13 },
  startBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.cyan, borderRadius: radius.md, paddingHorizontal: 28, paddingVertical: 14, marginTop: 8 },
  startBtnText: { color: colors.bg, fontWeight: "800", fontSize: 16 },
  lastRouteCard: { backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16 },
  lastRouteRow: { flexDirection: "row", marginTop: 12, marginBottom: 8 },
  lastRouteStat: { flex: 1, alignItems: "center" },
  lastRouteVal: { color: colors.text, fontSize: 18, fontWeight: "800" },
  lastRouteLabel: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  lastRouteSub: { color: colors.textDim, fontSize: 12, textAlign: "center" },
  activeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.green, padding: 14, marginBottom: 8 },
  activeLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  activeDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.green },
  activeTitle: { color: colors.green, fontSize: 12, fontWeight: "800", letterSpacing: 1.2 },
  activeDuration: { color: colors.textMuted, fontSize: 12 },
  endBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.red, borderRadius: radius.sm + 2, paddingHorizontal: 14, paddingVertical: 8 },
  endBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  warningBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FFD60A22", borderRadius: radius.sm, borderWidth: 1, borderColor: "#FFD60A44", padding: 10, marginBottom: 8 },
  warningText: { color: "#FFD60A", fontSize: 12, fontWeight: "600", flex: 1 },
  targetMini: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 10, marginBottom: 10 },
  targetMiniLabel: { color: colors.textMuted, fontSize: 11, minWidth: 100 },
  targetBar: { flex: 1, height: 6, backgroundColor: colors.bg3, borderRadius: 3, overflow: "hidden" },
  targetBarFill: { height: 6, borderRadius: 3 },
  targetMiniPct: { color: colors.textMuted, fontSize: 11, minWidth: 35, textAlign: "right" },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  statCard: { backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16, alignItems: "center" },
  statCardLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 1.2, marginBottom: 4 },
  statCardVal: { color: colors.green, fontSize: 22, fontWeight: "900" },
  statCardSub: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  cashCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: "#FFD60A44", padding: 14, marginBottom: 10 },
  cashLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  cashTitle: { color: colors.text, fontWeight: "700", fontSize: 14 },
  cashSub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  cashCounter: { flexDirection: "row", alignItems: "center", gap: 4 },
  cashBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg3, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  cashBtnDisabled: { opacity: 0.3 },
  cashCount: { color: colors.text, fontSize: 22, fontWeight: "900", minWidth: 40, textAlign: "center" },
  todayMini: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 16 },
  todayMiniLabel: { color: colors.textMuted, fontSize: 12, flex: 1 },
  todayMiniVal: { color: colors.cyan, fontWeight: "800", fontSize: 15 },
  todayMiniCount: { color: colors.textDim, fontSize: 11 },
  emptyFeed: { alignItems: "center", padding: 32, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, borderRadius: radius.md, gap: 8 },
  emptyFeedText: { color: colors.textMuted, fontWeight: "700" },
  emptyFeedSub: { color: colors.textDim, fontSize: 12, textAlign: "center", lineHeight: 18 },
  paymentCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 8 },
  paymentCardNew: { borderColor: colors.green },
  paymentCardWarn: { borderColor: "#FFD60A" },
  paymentIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  paymentAmount: { color: colors.green, fontSize: 18, fontWeight: "900" },
  paymentTime: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  underpaidTag: { color: "#FFD60A", fontSize: 13, fontWeight: "700" },
  underpaidBadge: { backgroundColor: "#FFD60A22", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: "#FFD60A44" },
  underpaidBadgeText: { color: "#FFD60A", fontSize: 10, fontWeight: "800" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: colors.bg2, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, borderTopWidth: 1, borderColor: colors.border },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 20 },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: "800", textAlign: "center", marginBottom: 6 },
  modalSub: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginBottom: 20, lineHeight: 18 },
  fareLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 1.4, marginBottom: 10 },
  fareGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  fareChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  fareChipActive: { backgroundColor: colors.cyanDim, borderColor: colors.cyan },
  fareChipText: { color: colors.textMuted, fontWeight: "700", fontSize: 14 },
  fareChipTextActive: { color: colors.cyan },
  customFareInput: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, color: colors.text, fontSize: 18, fontWeight: "800", marginBottom: 20 },
  customFareInputActive: { borderColor: colors.cyan },
  modalActions: { flexDirection: "row", gap: 12 },
  cancelBtn: { backgroundColor: colors.bg3, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, alignItems: "center" },
  cancelBtnText: { color: colors.textMuted, fontWeight: "700" },
  confirmBtn: { backgroundColor: colors.cyan, borderRadius: radius.md, padding: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 },
  confirmBtnText: { color: colors.bg, fontWeight: "800" },
  summaryEmoji: { fontSize: 40, textAlign: "center", marginBottom: 8 },
  summaryGrid: { flexDirection: "row", marginVertical: 20 },
  summaryStat: { flex: 1, alignItems: "center" },
  summaryVal: { color: colors.text, fontSize: 22, fontWeight: "900" },
  summaryStatLabel: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  summarySub: { color: colors.textDim, fontSize: 12, textAlign: "center", marginBottom: 20 },
  cashupConfirmGrid: { backgroundColor: colors.bg, borderRadius: radius.md, padding: 14, marginVertical: 16, gap: 8 },
  cashupConfirmRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cashupConfirmLabel: { color: colors.textMuted, fontSize: 13 },
  cashupConfirmVal: { color: colors.text, fontWeight: "800", fontSize: 15 },
  destCard: { backgroundColor: colors.bg, borderRadius: radius.md, padding: 12, marginBottom: 16 },
  destTitle: { color: colors.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 1.2, marginBottom: 8 },
  destRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  destText: { color: colors.textMuted, fontSize: 13, flex: 1 },
});
