import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Modal, RefreshControl, Vibration, TextInput, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "../../src/AuthContext";
import { useTheme } from "../../src/ThemeContext";
import { api } from "../../src/api";
import { formatZAR, radius } from "../../src/theme";

const HIDDEN_ROUTES_KEY = "tnr_hidden_routes";

async function getHiddenRoutes(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(HIDDEN_ROUTES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function hideRoute(id: string) {
  try {
    const hidden = await getHiddenRoutes();
    if (!hidden.includes(id)) {
      await AsyncStorage.setItem(HIDDEN_ROUTES_KEY, JSON.stringify([...hidden, id]));
    }
  } catch {}
}

async function clearAllHiddenRoutes() {
  try { await AsyncStorage.removeItem(HIDDEN_ROUTES_KEY); } catch {}
}

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
  const { colors } = useTheme();
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
  const [hiddenRoutes, setHiddenRoutes] = useState<string[]>([]);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [todayGross, setTodayGross] = useState<number>(0);
  const [todayPlatformFee, setTodayPlatformFee] = useState<number>(0);
  const prevPaymentCount = useRef(0);

  if (state.status !== "authed") return null;

  const load = useCallback(async () => {
    try {
      const [routeRes, statusRes, walletRes, hidden] = await Promise.all([
        api.currentRoute(),
        api.driverCashupStatus().catch(() => null),
        api.wallet().catch(() => null),
        getHiddenRoutes(),
      ]);
      if (routeRes.active && routeRes.app_count > prevPaymentCount.current) {
        if (prevPaymentCount.current > 0) Vibration.vibrate(300);
        prevPaymentCount.current = routeRes.app_count;
      }
      setRouteData(routeRes);
      setCashupStatus(statusRes);
      setHiddenRoutes(hidden);
      if (walletRes) {
        setWalletBalance(walletRes.balance ?? walletRes.total_earnings ?? 0);
        setTodayGross(walletRes.today_gross ?? 0);
        setTodayPlatformFee(walletRes.today_platform_fee ?? 0);
      }
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
      setStartModal(false); setSelectedFare(0); setCustomFare("");
      prevPaymentCount.current = 0; load();
    } catch (e: any) { Alert.alert("Error", e?.message || "Could not start route"); }
  };

  const handleEndRoute = async () => {
    if (Platform.OS === "web") {
      try { const res = await api.endRoute(); setSummary(res.summary); setSummaryModal(true); prevPaymentCount.current = 0; load(); }
      catch (e: any) { Alert.alert("Error", e?.message || "Could not end route"); }
      return;
    }
    Alert.alert("End Route?", "This will close the current route.", [
      { text: "Cancel", style: "cancel" },
      { text: "End Route", style: "destructive", onPress: async () => {
        try { const res = await api.endRoute(); setSummary(res.summary); setSummaryModal(true); prevPaymentCount.current = 0; load(); }
        catch (e: any) { Alert.alert("Error", e?.message || "Could not end route"); }
      }},
    ]);
  };

  const handleCash = async (delta: 1 | -1) => {
    setCashUpdating(true);
    try {
      const res = await api.updateCash(delta);
      setRouteData((prev: any) => ({ ...prev, cash_count: res.cash_count, total_passengers: prev.app_count + res.cash_count }));
    } catch (e) {}
    finally { setCashUpdating(false); }
  };

  const handleOpenCashup = async () => {
    try { const dest = await api.driverCashupDestination(); setCashupDest(dest); setCashupModal(true); }
    catch (e: any) { Alert.alert("Error", e?.message || "Could not load cashup info"); }
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
    } catch (e: any) { Alert.alert("Failed", e?.message || "Could not complete cash-up"); }
    finally { setCashingUp(false); }
  };

  const handleHideRoute = async (id: string) => {
    await hideRoute(id); setHiddenRoutes(prev => [...prev, id]);
  };

  const handleClearAllRoutes = () => {
    Alert.alert("Clear route history?", "This only clears your view on this device.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: async () => {
        const allIds = (routeData?.route_history || []).map((r: any) => r.id);
        await AsyncStorage.setItem(HIDDEN_ROUTES_KEY, JSON.stringify(allIds));
        setHiddenRoutes(allIds);
      }},
    ]);
  };

  const handleRestoreRoutes = async () => { await clearAllHiddenRoutes(); setHiddenRoutes([]); };
  const onRefresh = async () => { setRefreshing(true); await load(); };

  const visibleRoutes = (routeData?.route_history || []).filter((r: any) => !hiddenRoutes.includes(r.id));
  const hiddenCount = hiddenRoutes.length;
  const s = makeStyles(colors);if (!routeData || !routeData.active) {
    return (
      <SafeAreaView style={s.root} edges={["top"]}>
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.cyan} />}>

          <Text style={s.pageTitle}>Earnings</Text>

          <View style={s.earningsCard}>
            <View style={s.earningsHeaderRow}>
              <Text style={s.earningsHeaderLabel}>FARE COLLECTED TODAY</Text>
              {(routeData?.today_count ?? 0) > 0 && (
                <View style={s.tripCountBadge}>
                  <Text style={s.tripCountText}>{routeData?.today_count ?? 0} trip{(routeData?.today_count ?? 0) !== 1 ? "s" : ""}</Text>
                </View>
              )}
            </View>
            <Text style={s.grossFareAmt}>{formatZAR(todayGross)}</Text>
            <Text style={s.grossFareSub}>Gross fare paid by passengers</Text>
            {todayPlatformFee > 0 && (
              <View style={s.feeRow}>
                <Text style={s.feeRowLabel}>Platform fee</Text>
                <Text style={s.feeRowAmt}>−{formatZAR(todayPlatformFee)}</Text>
              </View>
            )}
            <View style={s.earningsDivider} />
            <View style={s.earningsBottomRow}>
              <View style={s.earningsBottomStat}>
                <Text style={s.earningsBottomLabel}>TOTAL BALANCE</Text>
                <Text style={s.earningsBottomVal}>{formatZAR(walletBalance)}</Text>
              </View>
              <View style={[s.earningsBottomStat, s.earningsBottomBorder]}>
                <Text style={[s.earningsBottomLabel, { color: colors.red }]}>PLATFORM FEE</Text>
                <Text style={[s.earningsBottomVal, { color: colors.red }]}>{formatZAR(todayPlatformFee)}</Text>
              </View>
              <View style={[s.earningsBottomStat, s.earningsBottomBorder]}>
                <Text style={[s.earningsBottomLabel, { color: colors.cyan }]}>AVAILABLE</Text>
                <Text style={[s.earningsBottomVal, { color: colors.cyan }]}>{formatZAR(Math.max(0, todayGross - todayPlatformFee))}</Text>
              </View>
            </View>
          </View>

          {cashupStatus?.has_owner && (
            <View style={s.cashupCard}>
              <View style={s.cashupHeader}>
                <Ionicons name="business-outline" size={20} color="#A064FF" />
                <Text style={s.cashupTitle}>Daily Cash-Up</Text>
                {cashupStatus.is_confirmed && (
                  <View style={s.confirmedBadge}>
                    <Ionicons name="checkmark-circle" size={12} color={colors.green} />
                    <Text style={s.confirmedText}>Confirmed</Text>
                  </View>
                )}
              </View>
              <Text style={s.cashupOwner}>Owner: {cashupStatus.owner_name}</Text>
              <View style={s.cashupStatsRow}>
                <View style={s.cashupStat}>
                  <Text style={s.cashupStatVal}>{formatZAR(cashupStatus.daily_target)}</Text>
                  <Text style={s.cashupStatLabel}>Target</Text>
                </View>
                <View style={s.cashupStat}>
                  <Text style={[s.cashupStatVal, { color: colors.green }]}>{formatZAR(cashupStatus.today_earned)}</Text>
                  <Text style={s.cashupStatLabel}>Earned</Text>
                </View>
                <View style={s.cashupStat}>
                  <Text style={[s.cashupStatVal, { color: cashupStatus.driver_profit > 0 ? colors.cyan : colors.red }]}>
                    {formatZAR(cashupStatus.driver_profit > 0 ? cashupStatus.driver_profit : cashupStatus.shortfall)}
                  </Text>
                  <Text style={s.cashupStatLabel}>{cashupStatus.driver_profit > 0 ? "Profit" : "Shortfall"}</Text>
                </View>
              </View>
              {cashupStatus.outstanding_balance > 0 && (
                <View style={s.outstandingBanner}>
                  <Ionicons name="warning-outline" size={14} color="#FFD60A" />
                  <Text style={s.outstandingText}>Outstanding: {formatZAR(cashupStatus.outstanding_balance)}</Text>
                </View>
              )}
              {!cashupStatus.is_confirmed && (
                <View style={s.unconfirmedNote}>
                  <Ionicons name="information-circle-outline" size={13} color={colors.textMuted} />
                  <Text style={s.unconfirmedText}>Owner has not confirmed you yet</Text>
                </View>
              )}
              <TouchableOpacity
                style={[s.cashupBtn, cashupStatus.today_earned <= 0 && s.cashupBtnDisabled]}
                onPress={handleOpenCashup}
                disabled={cashupStatus.today_earned <= 0}>
                <Ionicons name="arrow-up-circle" size={18} color={colors.bg} />
                <Text style={s.cashupBtnText}>Cash Up {formatZAR(cashupStatus.cashup_amount)} to Owner</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={s.offDutyCard}>
            <View style={s.offDutyDot} />
            <Text style={s.offDutyTitle}>OFF ROUTE</Text>
            <Text style={s.offDutySub}>Start a route to track payments</Text>
            <TouchableOpacity style={s.startBtn} onPress={() => setStartModal(true)}>
              <Ionicons name="play-circle" size={22} color={colors.bg} />
              <Text style={s.startBtnText}>Start Route</Text>
            </TouchableOpacity>
          </View>

          {routeData?.last_route && (
            <View style={s.lastRouteCard}>
              <Text style={s.sectionLabel}>LAST ROUTE</Text>
              <View style={s.lastRouteRow}>
                <View style={s.lastRouteStat}>
                  <Text style={s.lastRouteVal}>{formatZAR(routeData.last_route.total_collected)}</Text>
                  <Text style={s.lastRouteLabel}>Collected</Text>
                </View>
                <View style={s.lastRouteStat}>
                  <Text style={s.lastRouteVal}>{routeData.last_route.total_passengers}</Text>
                  <Text style={s.lastRouteLabel}>Passengers</Text>
                </View>
                <View style={s.lastRouteStat}>
                  <Text style={s.lastRouteVal}>{formatDuration(routeData.last_route.duration_mins)}</Text>
                  <Text style={s.lastRouteLabel}>Duration</Text>
                </View>
              </View>
              <Text style={s.lastRouteSub}>
                {routeData.last_route.app_count} app · {routeData.last_route.cash_count} cash
                {routeData.last_route.fare > 0 ? ` · R${routeData.last_route.fare} fare` : ""}
              </Text>
            </View>
          )}

          {(visibleRoutes.length > 0 || hiddenCount > 0) && (
            <View>
              <View style={s.historyHeader}>
                <Text style={s.sectionLabel}>ROUTE HISTORY</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {hiddenCount > 0 && (
                    <TouchableOpacity onPress={handleRestoreRoutes} style={[s.historyActionBtn, { backgroundColor: colors.cyanDim, borderColor: colors.cyan + "40" }]}>
                      <Ionicons name="eye-outline" size={13} color={colors.cyan} />
                      <Text style={[s.historyActionText, { color: colors.cyan }]}>Restore ({hiddenCount})</Text>
                    </TouchableOpacity>
                  )}
                  {visibleRoutes.length > 0 && (
                    <TouchableOpacity onPress={handleClearAllRoutes} style={s.historyActionBtn}>
                      <Ionicons name="trash-outline" size={13} color={colors.textMuted} />
                      <Text style={s.historyActionText}>Clear all</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              {visibleRoutes.length === 0 && hiddenCount > 0 ? (
                <View style={s.hiddenNote}>
                  <Text style={s.hiddenNoteText}>All routes hidden on this device</Text>
                  <TouchableOpacity onPress={handleRestoreRoutes}>
                    <Text style={{ color: colors.cyan, fontWeight: "700", fontSize: 13 }}>Restore all</Text>
                  </TouchableOpacity>
                </View>
              ) : visibleRoutes.map((route: any) => (
                <View key={route.id} style={s.routeHistoryCard}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <Text style={s.routeHistoryAmt}>{formatZAR(route.total_collected)}</Text>
                      <View style={s.routeHistoryPill}>
                        <Text style={s.routeHistoryPillText}>{route.passenger_count} pax</Text>
                      </View>
                      {route.fare > 0 && (
                        <View style={[s.routeHistoryPill, { backgroundColor: colors.cyanDim }]}>
                          <Text style={[s.routeHistoryPillText, { color: colors.cyan }]}>R{route.fare} fare</Text>
                        </View>
                      )}
                    </View>
                    <Text style={s.routeHistorySub}>
                      {route.app_count} app · {route.cash_count} cash · {formatDuration(route.duration_mins || 0)}
                    </Text>
                    <Text style={s.routeHistoryTime}>{formatTime(route.started_at)}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleHideRoute(route.id)} style={s.hideRouteBtn}>
                    <Ionicons name="eye-off-outline" size={16} color={colors.textDim} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Start Route Modal */}
        <Modal visible={startModal} transparent animationType="slide" onRequestClose={() => setStartModal(false)}>
          <View style={s.modalOverlay}>
            <View style={s.modalSheet}>
              <View style={s.modalHandle} />
              <Text style={s.modalTitle}>Start Route</Text>
              <Text style={s.modalSub}>Set fare for underpaid alerts (optional)</Text>
              <Text style={s.fareLabel}>ROUTE FARE</Text>
              <View style={s.fareGrid}>
                {FARE_PRESETS.map(f => (
                  <TouchableOpacity key={f} onPress={() => { setSelectedFare(f); setCustomFare(""); }}
                    style={[s.fareChip, selectedFare === f && !customFare && s.fareChipActive]}>
                    <Text style={[s.fareChipText, selectedFare === f && !customFare && s.fareChipTextActive]}>R{f}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity onPress={() => { setSelectedFare(0); setCustomFare(""); }}
                  style={[s.fareChip, selectedFare === 0 && !customFare && s.fareChipActive]}>
                  <Text style={[s.fareChipText, selectedFare === 0 && !customFare && s.fareChipTextActive]}>No fare</Text>
                </TouchableOpacity>
              </View>
              <Text style={s.fareLabel}>OR ENTER CUSTOM FARE</Text>
              <TextInput
                style={[s.customFareInput, customFare ? { borderColor: colors.cyan } : null]}
                value={customFare}
                onChangeText={(t) => { setCustomFare(t.replace(/[^0-9]/g, "")); setSelectedFare(0); }}
                placeholder="e.g. 18" placeholderTextColor={colors.textDim} keyboardType="number-pad"
              />
              <View style={s.modalActions}>
                <View style={{ flex: 1 }}>
                  <TouchableOpacity style={s.cancelBtn} onPress={() => { setStartModal(false); setSelectedFare(0); setCustomFare(""); }}>
                    <Text style={s.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flex: 1 }}>
                  <TouchableOpacity style={s.confirmBtn} onPress={handleStartRoute}>
                    <Ionicons name="play-circle" size={18} color={colors.bg} />
                    <Text style={s.confirmBtnText}>
                      {customFare ? `Start · R${customFare}` : selectedFare > 0 ? `Start · R${selectedFare}` : "Start Route"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>

        {/* Summary Modal */}
        <Modal visible={summaryModal} transparent animationType="slide" onRequestClose={() => setSummaryModal(false)}>
          <View style={s.modalOverlay}>
            <View style={s.modalSheet}>
              <View style={s.modalHandle} />
              <Text style={s.summaryEmoji}>🎉</Text>
              <Text style={s.modalTitle}>Route Complete!</Text>
              <View style={s.summaryGrid}>
                <View style={s.summaryStat}>
                  <Text style={s.summaryVal}>{formatZAR(summary?.total_collected ?? 0)}</Text>
                  <Text style={s.summaryStatLabel}>Collected</Text>
                </View>
                <View style={s.summaryStat}>
                  <Text style={s.summaryVal}>{summary?.total_passengers ?? 0}</Text>
                  <Text style={s.summaryStatLabel}>Passengers</Text>
                </View>
                <View style={s.summaryStat}>
                  <Text style={s.summaryVal}>{formatDuration(summary?.duration_mins ?? 0)}</Text>
                  <Text style={s.summaryStatLabel}>Duration</Text>
                </View>
              </View>
              <Text style={s.summarySub}>{summary?.app_count ?? 0} app · {summary?.cash_count ?? 0} cash</Text>
              <View style={s.modalActions}>
                <View style={{ flex: 1 }}>
                  <TouchableOpacity style={s.cancelBtn} onPress={() => setSummaryModal(false)}>
                    <Text style={s.cancelBtnText}>Done</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flex: 1 }}>
                  <TouchableOpacity style={s.confirmBtn} onPress={() => { setSummaryModal(false); setStartModal(true); }}>
                    <Ionicons name="play-circle" size={18} color={colors.bg} />
                    <Text style={s.confirmBtnText}>New Route</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>

        {/* Cashup Modal */}
        <Modal visible={cashupModal} transparent animationType="slide" onRequestClose={() => setCashupModal(false)}>
          <View style={s.modalOverlay}>
            <View style={s.modalSheet}>
              <View style={s.modalHandle} />
              <Text style={s.modalTitle}>Confirm Cash-Up</Text>
              {cashupStatus && (
                <View style={s.cashupConfirmGrid}>
                  <View style={s.cashupConfirmRow}>
                    <Text style={s.cashupConfirmLabel}>Today's target</Text>
                    <Text style={s.cashupConfirmVal}>{formatZAR(cashupStatus.daily_target)}</Text>
                  </View>
                  <View style={s.cashupConfirmRow}>
                    <Text style={s.cashupConfirmLabel}>You earned</Text>
                    <Text style={[s.cashupConfirmVal, { color: colors.green }]}>{formatZAR(cashupStatus.today_earned)}</Text>
                  </View>
                  <View style={[s.cashupConfirmRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, marginTop: 4 }]}>
                    <Text style={s.cashupConfirmLabel}>Cash-up amount</Text>
                    <Text style={[s.cashupConfirmVal, { color: "#A064FF" }]}>{formatZAR(cashupStatus.cashup_amount)}</Text>
                  </View>
                  {cashupStatus.driver_profit > 0 && (
                    <View style={s.cashupConfirmRow}>
                      <Text style={s.cashupConfirmLabel}>Your profit</Text>
                      <Text style={[s.cashupConfirmVal, { color: colors.cyan }]}>{formatZAR(cashupStatus.driver_profit)}</Text>
                    </View>
                  )}
                  {cashupStatus.shortfall > 0 && (
                    <View style={s.cashupConfirmRow}>
                      <Text style={[s.cashupConfirmLabel, { color: colors.red }]}>Shortfall</Text>
                      <Text style={[s.cashupConfirmVal, { color: colors.red }]}>{formatZAR(cashupStatus.shortfall)}</Text>
                    </View>
                  )}
                </View>
              )}
              {cashupDest && (
                <View style={s.destCard}>
                  <Text style={s.destTitle}>GOING TO</Text>
                  <View style={s.destRow}>
                    <Ionicons name={cashupDest.confirmed ? "checkmark-circle" : "warning-outline"} size={16}
                      color={cashupDest.confirmed ? colors.green : "#FFD60A"} />
                    <Text style={[s.destText, !cashupDest.confirmed && { color: "#FFD60A" }]}>
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
              <View style={s.modalActions}>
                <View style={{ flex: 1 }}>
                  <TouchableOpacity style={s.cancelBtn} onPress={() => setCashupModal(false)}>
                    <Text style={s.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flex: 1 }}>
                  <TouchableOpacity style={[s.confirmBtn, { backgroundColor: "#A064FF" }]} onPress={handleCashup} disabled={cashingUp}>
                    <Ionicons name="arrow-up-circle" size={18} color={colors.bg} />
                    <Text style={s.confirmBtnText}>{cashingUp ? "Processing..." : "Confirm"}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }
  const isLongRoute = routeData.duration_mins >= 120;

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.cyan} />}>

        <View style={s.activeBadge}>
          <View style={s.activeDot} />
          <Text style={s.activeBadgeText}>ROUTE ACTIVE</Text>
          {isLongRoute && (
            <View style={s.longRouteBadge}>
              <Ionicons name="time-outline" size={11} color="#FFD60A" />
              <Text style={s.longRouteText}>{formatDuration(routeData.duration_mins)}</Text>
            </View>
          )}
        </View>

        <View style={s.activeEarningsCard}>
          <Text style={s.activeEarningsLabel}>COLLECTED THIS ROUTE</Text>
          <Text style={s.activeEarningsAmt}>{formatZAR(routeData.total_collected || 0)}</Text>
          {routeData.fare > 0 && <Text style={s.activeFare}>R{routeData.fare} fare set</Text>}
          <View style={s.activeMiniStats}>
            <View style={s.activeMiniStat}>
              <Text style={s.activeMiniVal}>{routeData.app_count || 0}</Text>
              <Text style={s.activeMiniLabel}>App</Text>
            </View>
            <View style={s.activeMiniStat}>
              <Text style={s.activeMiniVal}>{routeData.cash_count || 0}</Text>
              <Text style={s.activeMiniLabel}>Cash</Text>
            </View>
            <View style={s.activeMiniStat}>
              <Text style={s.activeMiniVal}>{(routeData.app_count || 0) + (routeData.cash_count || 0)}</Text>
              <Text style={s.activeMiniLabel}>Total pax</Text>
            </View>
            <View style={s.activeMiniStat}>
              <Text style={s.activeMiniVal}>{formatDuration(routeData.duration_mins || 0)}</Text>
              <Text style={s.activeMiniLabel}>Time</Text>
            </View>
          </View>
        </View>

        <Text style={s.sectionLabel}>CASH PASSENGERS</Text>
        <View style={s.cashRow}>
          <TouchableOpacity style={[s.cashBtn, s.cashBtnMinus]} onPress={() => handleCash(-1)}
            disabled={cashUpdating || (routeData.cash_count || 0) === 0}>
            <Ionicons name="remove" size={24} color={colors.red} />
          </TouchableOpacity>
          <View style={s.cashCount}>
            <Text style={s.cashCountNum}>{routeData.cash_count || 0}</Text>
            <Text style={s.cashCountLabel}>cash pax</Text>
          </View>
          <TouchableOpacity style={[s.cashBtn, s.cashBtnPlus]} onPress={() => handleCash(1)} disabled={cashUpdating}>
            <Ionicons name="add" size={24} color={colors.green} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={s.endRouteBtn} onPress={handleEndRoute}>
          <Ionicons name="stop-circle" size={20} color={colors.bg} />
          <Text style={s.endRouteBtnText}>End Route</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={summaryModal} transparent animationType="slide" onRequestClose={() => setSummaryModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.summaryEmoji}>🎉</Text>
            <Text style={s.modalTitle}>Route Complete!</Text>
            <View style={s.summaryGrid}>
              <View style={s.summaryStat}>
                <Text style={s.summaryVal}>{formatZAR(summary?.total_collected ?? 0)}</Text>
                <Text style={s.summaryStatLabel}>Collected</Text>
              </View>
              <View style={s.summaryStat}>
                <Text style={s.summaryVal}>{summary?.total_passengers ?? 0}</Text>
                <Text style={s.summaryStatLabel}>Passengers</Text>
              </View>
              <View style={s.summaryStat}>
                <Text style={s.summaryVal}>{formatDuration(summary?.duration_mins ?? 0)}</Text>
                <Text style={s.summaryStatLabel}>Duration</Text>
              </View>
            </View>
            <Text style={s.summarySub}>{summary?.app_count ?? 0} app · {summary?.cash_count ?? 0} cash</Text>
            <View style={s.modalActions}>
              <View style={{ flex: 1 }}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setSummaryModal(false)}>
                  <Text style={s.cancelBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                <TouchableOpacity style={s.confirmBtn} onPress={() => { setSummaryModal(false); setStartModal(true); }}>
                  <Ionicons name="play-circle" size={18} color={colors.bg} />
                  <Text style={s.confirmBtnText}>New Route</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
const makeStyles = (colors: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  pageTitle: { color: colors.text, fontSize: 24, fontWeight: "800", marginBottom: 16 },
  earningsCard: { backgroundColor: colors.bg2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 20, marginBottom: 16 },
  earningsHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  earningsHeaderLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 1.4 },
  tripCountBadge: { backgroundColor: colors.bg3 || colors.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.border },
  tripCountText: { color: colors.textMuted, fontSize: 10, fontWeight: "700" },
  grossFareAmt: { color: colors.green, fontSize: 36, fontWeight: "900", letterSpacing: -1 },
  grossFareSub: { color: colors.textDim, fontSize: 11, marginTop: 2, marginBottom: 12 },
  feeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.red + "15", borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12 },
  feeRowLabel: { color: colors.red, fontSize: 12, fontWeight: "600" },
  feeRowAmt: { color: colors.red, fontSize: 14, fontWeight: "800" },
  earningsDivider: { height: 1, backgroundColor: colors.border, marginBottom: 12 },
  earningsBottomRow: { flexDirection: "row" },
  earningsBottomStat: { flex: 1, alignItems: "center" },
  earningsBottomBorder: { borderLeftWidth: 1, borderLeftColor: colors.border },
  earningsBottomLabel: { color: colors.textMuted, fontSize: 9, fontWeight: "700", letterSpacing: 1.2, marginBottom: 3, textAlign: "center" },
  earningsBottomVal: { color: colors.text, fontSize: 14, fontWeight: "800" },
  cashupCard: { backgroundColor: colors.bg2, borderRadius: radius.lg, borderWidth: 1, borderColor: "#A064FF44", padding: 16, marginBottom: 16 },
  cashupHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  cashupTitle: { color: colors.text, fontWeight: "800", fontSize: 15, flex: 1 },
  confirmedBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.greenDim, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  confirmedText: { color: colors.green, fontSize: 10, fontWeight: "700" },
  cashupOwner: { color: colors.textMuted, fontSize: 12, marginBottom: 12 },
  cashupStatsRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  cashupStat: { flex: 1, backgroundColor: colors.bg, borderRadius: radius.sm, padding: 10, alignItems: "center" },
  cashupStatVal: { color: colors.text, fontSize: 16, fontWeight: "800" },
  cashupStatLabel: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  outstandingBanner: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FFD60A15", borderRadius: radius.sm, padding: 8, marginBottom: 10 },
  outstandingText: { color: "#FFD60A", fontSize: 12, fontWeight: "700" },
  unconfirmedNote: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  unconfirmedText: { color: colors.textMuted, fontSize: 11, flex: 1 },
  cashupBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#A064FF", borderRadius: radius.md, padding: 14 },
  cashupBtnDisabled: { opacity: 0.4 },
  cashupBtnText: { color: colors.bg, fontWeight: "800", fontSize: 14 },
  offDutyCard: { backgroundColor: colors.bg2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 24, alignItems: "center", marginBottom: 16 },
  offDutyDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.textDim, marginBottom: 10 },
  offDutyTitle: { color: colors.textMuted, fontSize: 13, fontWeight: "800", letterSpacing: 1.4 },
  offDutySub: { color: colors.textDim, fontSize: 13, marginTop: 4, marginBottom: 16 },
  startBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.cyan, borderRadius: radius.md, paddingHorizontal: 24, paddingVertical: 14 },
  startBtnText: { color: colors.bg, fontWeight: "800", fontSize: 15 },
  lastRouteCard: { backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 16 },
  sectionLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 1.4, marginBottom: 10 },
  lastRouteRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  lastRouteStat: { flex: 1, alignItems: "center" },
  lastRouteVal: { color: colors.text, fontSize: 18, fontWeight: "800" },
  lastRouteLabel: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  lastRouteSub: { color: colors.textDim, fontSize: 11, textAlign: "center" },
  historyHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  historyActionBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border },
  historyActionText: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  routeHistoryCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10, paddingRight: 40, position: "relative" },
  routeHistoryAmt: { color: colors.text, fontSize: 18, fontWeight: "800" },
  routeHistoryPill: { backgroundColor: colors.bg3, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  routeHistoryPillText: { color: colors.textMuted, fontSize: 10, fontWeight: "700" },
  routeHistorySub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  routeHistoryTime: { color: colors.textDim, fontSize: 10, marginTop: 3 },
  hideRouteBtn: { position: "absolute", top: 14, right: 12, padding: 4 },
  hiddenNote: { alignItems: "center", padding: 20, gap: 8 },
  hiddenNoteText: { color: colors.textMuted, fontSize: 13 },
  activeBadge: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  activeDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.green },
  activeBadgeText: { color: colors.green, fontSize: 12, fontWeight: "800", letterSpacing: 1.4 },
  longRouteBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FFD60A15", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  longRouteText: { color: "#FFD60A", fontSize: 11, fontWeight: "700" },
  activeEarningsCard: { backgroundColor: colors.bg2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.green, padding: 24, marginBottom: 20, alignItems: "center" },
  activeEarningsLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4 },
  activeEarningsAmt: { color: colors.green, fontSize: 44, fontWeight: "900", marginTop: 8, letterSpacing: -1 },
  activeFare: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  activeMiniStats: { flexDirection: "row", gap: 16, marginTop: 16 },
  activeMiniStat: { alignItems: "center" },
  activeMiniVal: { color: colors.text, fontSize: 18, fontWeight: "800" },
  activeMiniLabel: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  cashRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 20, marginBottom: 24 },
  cashBtn: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  cashBtnMinus: { borderColor: colors.red, backgroundColor: colors.red + "15" },
  cashBtnPlus: { borderColor: colors.green, backgroundColor: colors.green + "15" },
  cashCount: { alignItems: "center", minWidth: 80 },
  cashCountNum: { color: colors.text, fontSize: 40, fontWeight: "900" },
  cashCountLabel: { color: colors.textMuted, fontSize: 12 },
  endRouteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: colors.red, borderRadius: radius.md, padding: 16 },
  endRouteBtnText: { color: colors.bg, fontWeight: "800", fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: colors.bg2, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, borderTopWidth: 1, borderColor: colors.border },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 20 },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: "800", textAlign: "center", marginBottom: 4 },
  modalSub: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginBottom: 16 },
  fareLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 1.4, marginBottom: 8, marginTop: 8 },
  fareGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  fareChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  fareChipActive: { borderColor: colors.cyan, backgroundColor: colors.cyanDim },
  fareChipText: { color: colors.textMuted, fontWeight: "700", fontSize: 13 },
  fareChipTextActive: { color: colors.cyan },
  customFareInput: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, color: colors.text, fontSize: 16, padding: 12, textAlign: "center", marginBottom: 16 },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 14, alignItems: "center" },
  cancelBtnText: { color: colors.textMuted, fontWeight: "700", fontSize: 14 },
  confirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.cyan, borderRadius: radius.md, padding: 14 },
  confirmBtnText: { color: colors.bg, fontWeight: "800", fontSize: 14 },
  summaryEmoji: { fontSize: 40, textAlign: "center", marginBottom: 8 },
  summaryGrid: { flexDirection: "row", gap: 8, marginVertical: 16 },
  summaryStat: { flex: 1, backgroundColor: colors.bg, borderRadius: radius.sm, padding: 12, alignItems: "center" },
  summaryVal: { color: colors.text, fontSize: 18, fontWeight: "800" },
  summaryStatLabel: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  summarySub: { color: colors.textMuted, fontSize: 12, textAlign: "center", marginBottom: 16 },
  cashupConfirmGrid: { backgroundColor: colors.bg, borderRadius: radius.md, padding: 14, marginBottom: 12 },
  cashupConfirmRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  cashupConfirmLabel: { color: colors.textMuted, fontSize: 13 },
  cashupConfirmVal: { color: colors.text, fontSize: 13, fontWeight: "700" },
  destCard: { backgroundColor: colors.bg, borderRadius: radius.sm, padding: 12, marginBottom: 12 },
  destTitle: { color: colors.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 1.4, marginBottom: 6 },
  destRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  destText: { color: colors.text, fontSize: 13, flex: 1 },
});
