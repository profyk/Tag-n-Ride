import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Modal, RefreshControl, Vibration, TextInput, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "../../src/AuthContext";
import { api } from "../../src/api";
import { colors, formatZAR, radius } from "../../src/theme";

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
      if (walletRes) setWalletBalance(walletRes.total_earnings ?? 0);
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
    } catch (e: any) { Alert.alert("Error", e?.message || "Could not start route"); }
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
      { text: "End Route", style: "destructive", onPress: async () => {
        try {
          const res = await api.endRoute();
          setSummary(res.summary);
          setSummaryModal(true);
          prevPaymentCount.current = 0;
          load();
        } catch (e: any) { Alert.alert("Error", e?.message || "Could not end route"); }
      }},
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
    } catch (e: any) { Alert.alert("Error", e?.message || "Could not load cashup info"); }
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
    await hideRoute(id);
    setHiddenRoutes(prev => [...prev, id]);
  };

  const handleClearAllRoutes = () => {
    Alert.alert(
      "Clear route history?",
      "This only clears your view on this device. Your records are safely stored.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear", style: "destructive", onPress: async () => {
          const allIds = (routeData?.route_history || []).map((r: any) => r.id);
          await AsyncStorage.setItem(HIDDEN_ROUTES_KEY, JSON.stringify(allIds));
          setHiddenRoutes(allIds);
        }},
      ]
    );
  };

  const handleRestoreRoutes = async () => {
    await clearAllHiddenRoutes();
    setHiddenRoutes([]);
  };

  const onRefresh = async () => { setRefreshing(true); await load(); };

  const visibleRoutes = (routeData?.route_history || []).filter((r: any) => !hiddenRoutes.includes(r.id));
  const hiddenCount = hiddenRoutes.length;if (!routeData || !routeData.active) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.cyan} />}>

          <Text style={styles.pageTitle}>Earnings</Text>

          {/* Total earnings card */}
          <View style={styles.earningsCard}>
            <View style={styles.earningsRow}>
              <View style={styles.earningsStat}>
                <Text style={styles.earningsLabel}>TOTAL EARNINGS</Text>
                <Text style={styles.earningsVal}>{formatZAR(walletBalance)}</Text>
                <Text style={styles.earningsSub}>Lifetime</Text>
              </View>
              <View style={[styles.earningsStat, { borderLeftWidth: 1, borderLeftColor: colors.border, paddingLeft: 16 }]}>
                <Text style={styles.earningsLabel}>TODAY</Text>
                <Text style={[styles.earningsVal, { color: colors.cyan }]}>
                  {formatZAR(routeData?.today_total ?? 0)}
                </Text>
                <Text style={styles.earningsSub}>{routeData?.today_count ?? 0} app payments</Text>
              </View>
            </View>
          </View>

          {/* Cash-up card */}
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
                  <Text style={styles.unconfirmedText}>Owner has not confirmed you yet</Text>
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

          {/* Off duty */}
          <View style={styles.offDutyCard}>
            <View style={styles.offDutyDot} />
            <Text style={styles.offDutyTitle}>OFF ROUTE</Text>
            <Text style={styles.offDutySub}>Start a route to track payments</Text>
            <TouchableOpacity style={styles.startBtn} onPress={() => setStartModal(true)}>
              <Ionicons name="play-circle" size={22} color={colors.bg} />
              <Text style={styles.startBtnText}>Start Route</Text>
            </TouchableOpacity>
          </View>

          {/* Last route */}
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

          {/* Route history */}
          {(visibleRoutes.length > 0 || hiddenCount > 0) && (
            <View>
              <View style={styles.historyHeader}>
                <Text style={styles.sectionLabel}>ROUTE HISTORY</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {hiddenCount > 0 && (
                    <TouchableOpacity onPress={handleRestoreRoutes} style={styles.historyActionBtn}>
                      <Ionicons name="eye-outline" size={13} color={colors.cyan} />
                      <Text style={[styles.historyActionText, { color: colors.cyan }]}>Restore ({hiddenCount})</Text>
                    </TouchableOpacity>
                  )}
                  {visibleRoutes.length > 0 && (
                    <TouchableOpacity onPress={handleClearAllRoutes} style={styles.historyActionBtn}>
                      <Ionicons name="trash-outline" size={13} color={colors.textMuted} />
                      <Text style={styles.historyActionText}>Clear all</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              {visibleRoutes.length === 0 && hiddenCount > 0 ? (
                <View style={styles.hiddenNote}>
                  <Text style={styles.hiddenNoteText}>All routes hidden on this device</Text>
                  <TouchableOpacity onPress={handleRestoreRoutes}>
                    <Text style={{ color: colors.cyan, fontWeight: "700", fontSize: 13 }}>Restore all</Text>
                  </TouchableOpacity>
                </View>
              ) : visibleRoutes.map((route: any) => (
                <View key={route.id} style={styles.routeHistoryCard}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <Text style={styles.routeHistoryAmt}>{formatZAR(route.total_collected)}</Text>
                      <View style={styles.routeHistoryPill}>
                        <Text style={styles.routeHistoryPillText}>{route.passenger_count} pax</Text>
                      </View>
                      {route.fare > 0 && (
                        <View style={[styles.routeHistoryPill, { backgroundColor: colors.cyanDim }]}>
                          <Text style={[styles.routeHistoryPillText, { color: colors.cyan }]}>R{route.fare} fare</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.routeHistorySub}>
                      {route.app_count} app · {route.cash_count} cash · {formatDuration(route.duration_mins || 0)}
                    </Text>
                    <Text style={styles.routeHistoryTime}>{formatTime(route.started_at)}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleHideRoute(route.id)} style={styles.hideRouteBtn}>
                    <Ionicons name="eye-off-outline" size={16} color={colors.textDim} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </ScrollView><Modal visible={startModal} transparent animationType="slide" onRequestClose={() => setStartModal(false)}>
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
                    <Text style={styles.confirmBtnText}>
                      {customFare ? `Start · R${customFare}` : selectedFare > 0 ? `Start · R${selectedFare}` : "Start Route"}
                    </Text>
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
                  <Text style={styles.summaryVal}>{formatZAR(summary?.total_collected ?? 0)}</Text>
                  <Text style={styles.summaryStatLabel}>Collected</Text>
                </View>
                <View style={styles.summaryStat}>
                  <Text style={styles.summaryVal}>{summary?.total_passengers ?? 0}</Text>
                  <Text style={styles.summaryStatLabel}>Passengers</Text>
                </View>
                <View style={styles.summaryStat}>
                  <Text style={styles.summaryVal}>{formatDuration(summary?.duration_mins ?? 0)}</Text>
                  <Text style={styles.summaryStatLabel}>Duration</Text>
                </View>
              </View>
              <Text style={styles.summarySub}>{summary?.app_count ?? 0} app · {summary?.cash_count ?? 0} cash</Text>
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
                        <Ionicons name={cashupDest.confirmed ? "checkmark-circle" : "warning-outline"} size={16}
                          color={cashupDest.confirmed ? colors.green : "#FFD60A"} />
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
                  <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: "#A064FF" }]}
                    onPress={handleCashup} disabled={cashingUp}>
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
   }
  const isLongRoute = routeData.duration_mins >= 120;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.cyan} />}>

        <View style={styles.activeBadge}>
          <View style={styles.activeDot} />
          <Text style={styles.activeBadgeText}>ROUTE ACTIVE</Text>
          {isLongRoute && (
            <View style={styles.longRouteBadge}>
              <Ionicons name="time-outline" size={11} color="#FFD60A" />
              <Text style={styles.longRouteText}>{formatDuration(routeData.duration_mins)}</Text>
            </View>
          )}
        </View>

        <View style={styles.activeEarningsCard}>
          <Text style={styles.activeEarningsLabel}>COLLECTED THIS ROUTE</Text>
          <Text style={styles.activeEarningsAmt}>{formatZAR(routeData.total_collected || 0)}</Text>
          {routeData.fare > 0 && (
            <Text style={styles.activeFare}>R{routeData.fare} fare set</Text>
          )}
          <View style={styles.activeMiniStats}>
            <View style={styles.activeMiniStat}>
              <Text style={styles.activeMiniVal}>{routeData.app_count || 0}</Text>
              <Text style={styles.activeMiniLabel}>App</Text>
            </View>
            <View style={styles.activeMiniStat}>
              <Text style={styles.activeMiniVal}>{routeData.cash_count || 0}</Text>
              <Text style={styles.activeMiniLabel}>Cash</Text>
            </View>
            <View style={styles.activeMiniStat}>
              <Text style={styles.activeMiniVal}>{(routeData.app_count || 0) + (routeData.cash_count || 0)}</Text>
              <Text style={styles.activeMiniLabel}>Total pax</Text>
            </View>
            <View style={styles.activeMiniStat}>
              <Text style={styles.activeMiniVal}>{formatDuration(routeData.duration_mins || 0)}</Text>
              <Text style={styles.activeMiniLabel}>Time</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionLabel}>CASH PASSENGERS</Text>
        <View style={styles.cashRow}>
          <TouchableOpacity
            style={[styles.cashBtn, styles.cashBtnMinus]}
            onPress={() => handleCash(-1)}
            disabled={cashUpdating || (routeData.cash_count || 0) === 0}>
            <Ionicons name="remove" size={24} color={colors.red} />
          </TouchableOpacity>
          <View style={styles.cashCount}>
            <Text style={styles.cashCountNum}>{routeData.cash_count || 0}</Text>
            <Text style={styles.cashCountLabel}>cash pax</Text>
          </View>
          <TouchableOpacity style={[styles.cashBtn, styles.cashBtnPlus]} onPress={() => handleCash(1)} disabled={cashUpdating}>
            <Ionicons name="add" size={24} color={colors.green} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.endRouteBtn} onPress={handleEndRoute}>
          <Ionicons name="stop-circle" size={20} color={colors.bg} />
          <Text style={styles.endRouteBtnText}>End Route</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={summaryModal} transparent animationType="slide" onRequestClose={() => setSummaryModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.summaryEmoji}>🎉</Text>
            <Text style={styles.modalTitle}>Route Complete!</Text>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryStat}>
                <Text style={styles.summaryVal}>{formatZAR(summary?.total_collected ?? 0)}</Text>
                <Text style={styles.summaryStatLabel}>Collected</Text>
              </View>
              <View style={styles.summaryStat}>
                <Text style={styles.summaryVal}>{summary?.total_passengers ?? 0}</Text>
                <Text style={styles.summaryStatLabel}>Passengers</Text>
              </View>
              <View style={styles.summaryStat}>
                <Text style={styles.summaryVal}>{formatDuration(summary?.duration_mins ?? 0)}</Text>
                <Text style={styles.summaryStatLabel}>Duration</Text>
              </View>
            </View>
            <Text style={styles.summarySub}>{summary?.app_count ?? 0} app · {summary?.cash_count ?? 0} cash</Text>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  pageTitle: { color: colors.text, fontSize: 24, fontWeight: "800", marginBottom: 16 },

  // Earnings card
  earningsCard: { backgroundColor: colors.bg2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 20, marginBottom: 16 },
  earningsRow: { flexDirection: "row", gap: 16 },
  earningsStat: { flex: 1 },
  earningsLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 1.4, marginBottom: 4 },
  earningsVal: { color: colors.green, fontSize: 24, fontWeight: "800" },
  earningsSub: { color: colors.textDim, fontSize: 11, marginTop: 2 },

  // Cashup card
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

  // Off duty
  offDutyCard: { backgroundColor: colors.bg2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 24, alignItems: "center", marginBottom: 16 },
  offDutyDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.textDim, marginBottom: 10 },
  offDutyTitle: { color: colors.textMuted, fontSize: 13, fontWeight: "800", letterSpacing: 1.4 },
  offDutySub: { color: colors.textDim, fontSize: 13, marginTop: 4, marginBottom: 16 },
  startBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.cyan, borderRadius: radius.md, paddingHorizontal: 24, paddingVertical: 14 },
  startBtnText: { color: colors.bg, fontWeight: "800", fontSize: 15 },

  // Last route
  lastRouteCard: { backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 16 },
  sectionLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 1.4, marginBottom: 10 },
  lastRouteRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  lastRouteStat: { flex: 1, alignItems: "center" },
  lastRouteVal: { color: colors.text, fontSize: 18, fontWeight: "800" },
  lastRouteLabel: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  lastRouteSub: { color: colors.textDim, fontSize: 11, textAlign: "center" },

  // Route history
  historyHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  historyActionBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border },
  historyActionText: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  routeHistoryCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10, paddingRight: 40 },
  routeHistoryAmt: { color: colors.text, fontSize: 18, fontWeight: "800" },
  routeHistoryPill: { backgroundColor: colors.bg3, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  routeHistoryPillText: { color: colors.textMuted, fontSize: 10, fontWeight: "700" },
  routeHistorySub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  routeHistoryTime: { color: colors.textDim, fontSize: 10, marginTop: 3 },
  hideRouteBtn: { position: "absolute", top: 14, right: 12, padding: 4 },
  hiddenNote: { alignItems: "center", padding: 20, gap: 8 },
  hiddenNoteText: { color: colors.textMuted, fontSize: 13 },

  // Active route
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

  // Modals
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
  customFareInputActive: { borderColor: colors.cyan },
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
