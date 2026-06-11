import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert, TextInput, Modal, Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/AuthContext";
import { useRouter } from "expo-router";
import { api, DriverTransfer } from "../../src/api";
import { formatZAR, formatDate, radius, useColors, darkColors as colors } from "../../src/theme";
import { Button } from "../../src/ui";

type Driver = {
  user_id: string;
  full_name: string;
  phone_number: string;
  vehicle_plate: string;
  total_earnings: number;
  today_earnings?: number;
  daily_target?: number;
  qr_code: string;
  rating_avg: number;
  rating_count: number;
  is_verified: boolean;
};

type Tab = "drivers" | "cashups" | "outstanding" | "performance";

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
  const { state, signOut } = useAuth();
  const colors = useColors();
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
  const [activeTab, setActiveTab] = useState<Tab>("drivers");
  const [transfers, setTransfers] = useState<DriverTransfer[]>([]);
  const [transferModal, setTransferModal] = useState<DriverTransfer | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actingTransfer, setActingTransfer] = useState(false);

  const load = useCallback(async () => {
    try {
      const [dashRes, outRes, histRes, txRes] = await Promise.all([
        api.ownerDashboard(),
        api.ownerOutstanding().catch(() => null),
        api.ownerCashupHistory().catch(() => null),
        api.ownerTransfers().catch(() => []),
      ]);
      setData(dashRes);
      setOutstanding(outRes);
      setCashupHistory(histRes);
      setTransfers(txRes as DriverTransfer[]);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to load dashboard");
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (state.status === "guest") router.replace("/(auth)/welcome");
  }, [state.status]);

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
      Alert.alert("Driver Linked!", `${res.driver.full_name} added to your fleet.`);
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
  ];

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
            <TouchableOpacity onPress={() => Alert.alert("Sign out?", "", [
              { text: "Cancel", style: "cancel" },
              { text: "Sign out", style: "destructive", onPress: signOut },
            ])} style={s.avatar}>
              <Ionicons name="business-outline" size={20} color={colors.cyan} />
            </TouchableOpacity>
          </View>
        </View>

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
                    const progress = driver.daily_target && driver.today_earnings
                      ? driver.today_earnings / driver.daily_target : null;
                    return (
                      <TouchableOpacity key={driver.user_id} style={[s.driverCard, isTop && s.driverCardTop]}
                        onPress={() => { setSelectedDriver(driver); setTargetInput(""); }} activeOpacity={0.82}>
                        <View style={s.driverRank}>
                          <Text style={s.driverRankNum}>#{idx + 1}</Text>
                        </View>
                        <View style={[s.driverAvatar, { borderColor: isTop ? "#FFD60A" : colors.cyan }]}>
                          <Ionicons name="car-sport" size={20} color={isTop ? "#FFD60A" : colors.cyan} />
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
                          {progress !== null && (
                            <View style={{ marginTop: 6 }}>
                              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                                <Text style={s.targetLabel}>Daily target</Text>
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

                    {/* Summary stats */}
                    <View style={s.perfCard}>
                      <Text style={s.perfCardTitle}>Fleet Summary</Text>
                      {[
                        { label: "Total fleet earnings", value: formatZAR(totalFleetEarnings), color: colors.cyan },
                        { label: "Average per driver", value: formatZAR(avgEarnings), color: colors.green },
                        { label: "Top earner", value: topEarner?.full_name || "-", color: "#FFD60A" },
                        { label: "Verified drivers", value: `${verifiedCount} / ${drivers.length}`, color: colors.green },
                        { label: "Today's revenue", value: formatZAR(data?.today_revenue ?? 0), color: colors.cyan },
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

      {/* Driver detail modal */}
      {selectedDriver && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setSelectedDriver(null)}>
          <Pressable style={s.overlay} onPress={() => setSelectedDriver(null)}>
            <Pressable style={s.sheet} onPress={() => {}}>
              <View style={s.sheetHandle} />
              <View style={s.driverDetailHeader}>
                <View style={[s.driverAvatar, { width: 52, height: 52, borderRadius: 26 }]}>
                  <Ionicons name="car-sport" size={24} color={colors.cyan} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.sheetTitle}>{selectedDriver.full_name}</Text>
                  <Text style={s.sheetSub}>{selectedDriver.phone_number}</Text>
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

              <View style={s.detailGrid}>
                <View style={s.detailItem}>
                  <Text style={s.detailLabel}>TOTAL EARNINGS</Text>
                  <Text style={[s.detailVal, { color: colors.green }]}>{formatZAR(selectedDriver.total_earnings)}</Text>
                </View>
                <View style={s.detailItem}>
                  <Text style={s.detailLabel}>RATING</Text>
                  <Text style={[s.detailVal, { color: "#FFD60A" }]}>
                    {selectedDriver.rating_count > 0
                      ? `⭐ ${selectedDriver.rating_avg.toFixed(1)} (${selectedDriver.rating_count})`
                      : "New driver"}
                  </Text>
                </View>
              </View>

              <Text style={s.inputLabel}>SET DAILY TARGET (ZAR)</Text>
              <TextInput style={s.input} value={targetInput} onChangeText={setTargetInput}
                placeholder="e.g. 2500" placeholderTextColor={colors.textDim} keyboardType="decimal-pad" />

              <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: colors.green + "22", borderColor: colors.green + "44", flex: 1 }]}
                  onPress={() => handleSetTarget(selectedDriver)} disabled={settingTarget}>
                  <Ionicons name="flag-outline" size={15} color={colors.green} />
                  <Text style={[s.actionBtnText, { color: colors.green }]}>{settingTarget ? "Setting…" : "Set Target"}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: colors.cyanDim, borderColor: colors.cyan + "44", flex: 1 }]}
                  onPress={() => handleConfirmDriver(selectedDriver)}>
                  <Ionicons name="checkmark-circle-outline" size={15} color={colors.cyan} />
                  <Text style={[s.actionBtnText, { color: colors.cyan }]}>Confirm</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
                <View style={{ flex: 1 }}>
                  <Button label="Close" variant="secondary" onPress={() => setSelectedDriver(null)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Remove" variant="destructive" onPress={() => { setSelectedDriver(null); handleUnlink(selectedDriver); }} />
                </View>
              </View>
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
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, paddingBottom: 12 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandDot: { width: 4, height: 32, borderRadius: 2, backgroundColor: colors.cyan },
  greeting: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  ownerName: { color: colors.text, fontSize: 20, fontWeight: "800" },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.cyanDim, borderWidth: 1, borderColor: colors.cyan, alignItems: "center", justifyContent: "center" },
  driveBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.cyan, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  driveBtnText: { color: colors.bg, fontWeight: "800", fontSize: 13 },
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
});
