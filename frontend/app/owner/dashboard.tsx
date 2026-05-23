import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert, TextInput, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/AuthContext";
import { api } from "../../src/api";
import { colors, formatZAR, radius } from "../../src/theme";
import { Button } from "../../src/ui";

type Driver = {
  user_id: string;
  full_name: string;
  phone_number: string;
  vehicle_plate: string;
  total_earnings: number;
  qr_code: string;
  rating_avg: number;
  rating_count: number;
  is_verified: boolean;
};export default function OwnerDashboard() {
  const { state, signOut } = useAuth();
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
  const [activeTab, setActiveTab] = useState<"drivers" | "cashups" | "outstanding">("drivers");

  const load = useCallback(async () => {
    try {
      const [dashRes, outRes, histRes] = await Promise.all([
        api.ownerDashboard(),
        api.ownerOutstanding().catch(() => null),
        api.ownerCashupHistory().catch(() => null),
      ]);
      setData(dashRes);
      setOutstanding(outRes);
      setCashupHistory(histRes);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (state.status !== "authed") return null;

  const handleLinkDriver = async () => {
    if (!driverCode.trim()) return;
    setLinking(true);
    try {
      const res = await api.ownerLinkDriver(driverCode.trim().toUpperCase());
      setLinkModal(false);
      setDriverCode("");
      Alert.alert("Driver Linked!", `${res.driver.full_name} added to your fleet.`);
      load();
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Could not link driver");
    } finally {
      setLinking(false);
    }
  };

  const handleConfirmDriver = async (driver: Driver) => {
    try {
      await api.ownerConfirmDriver(driver.user_id);
      Alert.alert("Confirmed", `${driver.full_name} confirmed. Cash-ups will now go to your account.`);
      setSelectedDriver(null);
      load();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not confirm driver");
    }
  };

  const handleSetTarget = async (driver: Driver) => {
    const target = parseFloat(targetInput);
    if (!targetInput || isNaN(target) || target < 0) {
      Alert.alert("Invalid", "Please enter a valid daily target");
      return;
    }
    setSettingTarget(true);
    try {
      await api.ownerSetTarget(driver.user_id, target);
      Alert.alert("Target Set", `Daily target set to ${formatZAR(target)}`);
      setTargetInput("");
      setSelectedDriver(null);
      load();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not set target");
    } finally {
      setSettingTarget(false);
    }
  };

  const handleCancelOutstanding = async (id: string, driverName: string, amount: number) => {
    Alert.alert("Cancel Outstanding?", `Cancel ${formatZAR(amount)} for ${driverName}?`, [
      { text: "No", style: "cancel" },
      {
        text: "Cancel Balance", style: "destructive",
        onPress: async () => {
          try {
            await api.ownerCancelOutstanding(id);
            load();
          } catch (e: any) {
            Alert.alert("Error", e?.message || "Could not cancel");
          }
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
          try {
            await api.ownerUnlinkDriver(driver.user_id);
            setSelectedDriver(null);
            load();
          } catch (e: any) {
            Alert.alert("Error", e?.message || "Failed to remove");
          }
        },
      },
    ]);
  };return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.cyan} />}>

        <View style={styles.headerRow}>
          <View>
            <Text style={styles.hello}>Fleet Dashboard</Text>
            <Text style={styles.name}>{state.user.full_name}</Text>
          </View>
          <TouchableOpacity onPress={() => Alert.alert("Sign out?", "", [
            { text: "Cancel", style: "cancel" },
            { text: "Sign out", style: "destructive", onPress: signOut },
          ])} style={styles.avatar}>
            <Ionicons name="business-outline" size={22} color={colors.cyan} />
          </TouchableOpacity>
        </View>

        {loading ? <ActivityIndicator color={colors.cyan} style={{ marginTop: 40 }} /> : (
          <>
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>TOTAL EARNINGS</Text>
                <Text style={styles.statVal}>{formatZAR(data?.total_earnings ?? 0)}</Text>
              </View>
              <View style={[styles.statCard, { borderColor: colors.green }]}>
                <Text style={styles.statLabel}>TODAY</Text>
                <Text style={[styles.statVal, { color: colors.green }]}>{formatZAR(data?.today_revenue ?? 0)}</Text>
              </View>
              <View style={[styles.statCard, { borderColor: "#A064FF" }]}>
                <Text style={styles.statLabel}>DRIVERS</Text>
                <Text style={[styles.statVal, { color: "#A064FF" }]}>{data?.driver_count ?? 0}</Text>
              </View>
            </View>

            {cashupHistory?.today_total > 0 && (
              <View style={styles.cashupSummaryCard}>
                <Ionicons name="arrow-down-circle" size={20} color={colors.green} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.cashupSummaryTitle}>Today's Cash-Ups</Text>
                  <Text style={styles.cashupSummaryVal}>{formatZAR(cashupHistory.today_total)}</Text>
                </View>
              </View>
            )}

            {outstanding?.total_outstanding > 0 && (
              <TouchableOpacity style={styles.outstandingAlert} onPress={() => setActiveTab("outstanding")}>
                <Ionicons name="warning" size={16} color="#FFD60A" />
                <Text style={styles.outstandingAlertText}>
                  Outstanding: {formatZAR(outstanding.total_outstanding)} from {outstanding.items?.length} driver(s)
                </Text>
                <Ionicons name="chevron-forward" size={14} color="#FFD60A" />
              </TouchableOpacity>
            )}

            <View style={styles.tabRow}>
              {[
                { key: "drivers", label: "Drivers" },
                { key: "cashups", label: "Cash-Ups" },
                { key: "outstanding", label: outstanding?.items?.length > 0 ? `Outstanding (${outstanding.items.length})` : "Outstanding" },
              ].map(t => (
                <TouchableOpacity key={t.key} onPress={() => setActiveTab(t.key as any)}
                  style={[styles.tab, activeTab === t.key && styles.tabActive]}>
                  <Text style={[styles.tabText, activeTab === t.key && styles.tabTextActive]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {activeTab === "drivers" && (
              <>
                <View style={styles.sectionRow}>
                  <Text style={styles.section}>MY DRIVERS</Text>
                  <TouchableOpacity onPress={() => setLinkModal(true)} style={styles.addBtn}>
                    <Ionicons name="add" size={18} color={colors.bg} />
                    <Text style={styles.addBtnText}>Add Driver</Text>
                  </TouchableOpacity>
                </View>
                {!data?.drivers?.length ? (
                  <View style={styles.empty}>
                    <Ionicons name="car-outline" size={40} color={colors.textDim} />
                    <Text style={styles.emptyText}>No drivers yet</Text>
                    <Text style={styles.emptySub}>Add a driver using their TNR code</Text>
                  </View>
                ) : (
                  data.drivers.map((driver: Driver) => (
                    <TouchableOpacity key={driver.user_id} style={styles.driverCard}
                      onPress={() => { setSelectedDriver(driver); setTargetInput(""); }} activeOpacity={0.85}>
                      <View style={styles.driverLeft}>
                        <View style={styles.driverAvatar}>
                          <Ionicons name="car-sport" size={22} color={colors.cyan} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.driverName}>{driver.full_name}</Text>
                          <Text style={styles.driverPhone}>{driver.phone_number}</Text>
                          {driver.vehicle_plate ? (
                            <View style={styles.platePill}>
                              <Text style={styles.plateText}>{driver.vehicle_plate}</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                      <View style={styles.driverRight}>
                        <Text style={styles.driverEarnings}>{formatZAR(driver.total_earnings)}</Text>
                        <Text style={styles.driverEarningsLabel}>earnings</Text>
                        {driver.is_verified && (
                          <View style={styles.verifiedBadge}>
                            <Ionicons name="checkmark-circle" size={12} color={colors.green} />
                            <Text style={styles.verifiedText}>Verified</Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </>
            )}

            {activeTab === "cashups" && (
              <>
                <Text style={styles.section}>CASH-UP HISTORY</Text>
                {!cashupHistory?.history?.length ? (
                  <View style={styles.empty}><Text style={styles.emptyText}>No cash-ups yet</Text></View>
                ) : (
                  cashupHistory.history.map((c: any) => (
                    <View key={c.id} style={styles.cashupRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cashupRowDriver}>{c.driver_name}</Text>
                        <Text style={styles.cashupRowDate}>{new Date(c.created_at).toLocaleDateString()}</Text>
                        <Text style={styles.cashupRowMethod}>
                          {c.cashup_method === "wallet" ? "Wallet transfer (free)" : `Bank payout (-R${c.payout_fee?.toFixed(2)})`}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={styles.cashupRowAmt}>{formatZAR(c.cashup_amount)}</Text>
                        {c.shortfall > 0 && <Text style={styles.cashupRowShortfall}>-{formatZAR(c.shortfall)} shortfall</Text>}
                        {c.driver_profit > 0 && <Text style={styles.cashupRowProfit}>+{formatZAR(c.driver_profit)} profit</Text>}
                      </View>
                    </View>
                  ))
                )}
              </>
            )}

            {activeTab === "outstanding" && (
              <>
                <View style={styles.sectionRow}>
                  <Text style={styles.section}>OUTSTANDING BALANCES</Text>
                  {outstanding?.total_outstanding > 0 && (
                    <Text style={styles.outstandingTotal}>{formatZAR(outstanding.total_outstanding)}</Text>
                  )}
                </View>
                {!outstanding?.items?.length ? (
                  <View style={styles.empty}>
                    <Ionicons name="checkmark-circle-outline" size={40} color={colors.green} />
                    <Text style={styles.emptyText}>No outstanding balances</Text>
                  </View>
                ) : (
                  outstanding.items.map((ob: any) => (
                    <View key={ob.id} style={styles.outstandingRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.outstandingDriver}>{ob.driver_name}</Text>
                        <Text style={styles.outstandingReason}>{ob.reason}</Text>
                        <Text style={styles.outstandingDate}>{new Date(ob.created_at).toLocaleDateString()}</Text>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 8 }}>
                        <Text style={styles.outstandingAmt}>{formatZAR(ob.amount)}</Text>
                        <TouchableOpacity style={styles.cancelObBtn}
                          onPress={() => handleCancelOutstanding(ob.id, ob.driver_name, ob.amount)}>
                          <Text style={styles.cancelObBtnText}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </>
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={linkModal} transparent animationType="slide" onRequestClose={() => setLinkModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalIconWrap}>
              <Ionicons name="link-outline" size={26} color={colors.cyan} />
            </View>
            <Text style={styles.modalTitle}>Add Driver</Text>
            <Text style={styles.modalSub}>Enter the driver's TNR code to link them to your fleet.</Text>
            <Text style={styles.inputLabel}>DRIVER TNR CODE</Text>
            <TextInput style={styles.input} value={driverCode}
              onChangeText={(t) => setDriverCode(t.toUpperCase())}
              placeholder="TNR0000000000000" placeholderTextColor={colors.textDim} autoCapitalize="characters" />
            <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
              <View style={{ flex: 1 }}>
                <Button label="Cancel" variant="secondary" onPress={() => { setLinkModal(false); setDriverCode(""); }} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Link Driver" onPress={handleLinkDriver} loading={linking} />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {selectedDriver && (
        <Modal visible={!!selectedDriver} transparent animationType="slide" onRequestClose={() => setSelectedDriver(null)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>{selectedDriver.full_name}</Text>
              <Text style={styles.modalSub}>{selectedDriver.phone_number}</Text>
              <View style={styles.driverDetailGrid}>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>TOTAL EARNINGS</Text>
                  <Text style={styles.detailVal}>{formatZAR(selectedDriver.total_earnings)}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>RATING</Text>
                  <Text style={styles.detailVal}>
                    {selectedDriver.rating_count > 0 ? `${selectedDriver.rating_avg.toFixed(1)} (${selectedDriver.rating_count})` : "New"}
                  </Text>
                </View>
              </View>
              <Text style={styles.inputLabel}>SET DAILY TARGET (ZAR)</Text>
              <TextInput style={styles.input} value={targetInput} onChangeText={setTargetInput}
                placeholder="e.g. 2500" placeholderTextColor={colors.textDim} keyboardType="decimal-pad" />
              <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.green + "22", borderColor: colors.green + "44", flex: 1 }]}
                  onPress={() => handleSetTarget(selectedDriver)} disabled={settingTarget}>
                  <Ionicons name="flag-outline" size={16} color={colors.green} />
                  <Text style={[styles.actionBtnText, { color: colors.green }]}>{settingTarget ? "Setting..." : "Set Target"}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.cyanDim, borderColor: colors.cyan + "44", flex: 1 }]}
                  onPress={() => handleConfirmDriver(selectedDriver)}>
                  <Ionicons name="checkmark-circle-outline" size={16} color={colors.cyan} />
                  <Text style={[styles.actionBtnText, { color: colors.cyan }]}>Confirm</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
                <View style={{ flex: 1 }}>
                  <Button label="Close" variant="secondary" onPress={() => setSelectedDriver(null)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Remove" variant="danger" onPress={() => { setSelectedDriver(null); handleUnlink(selectedDriver); }} />
                </View>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  hello: { color: colors.textMuted, fontSize: 14 },
  name: { color: colors.text, fontSize: 22, fontWeight: "800" },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.cyanDim, borderWidth: 1, borderColor: colors.cyan, alignItems: "center", justifyContent: "center" },
  statsGrid: { flexDirection: "row", gap: 10, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, alignItems: "center" },
  statLabel: { color: colors.textMuted, fontSize: 9, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase", textAlign: "center" },
  statVal: { color: colors.cyan, fontSize: 16, fontWeight: "800", marginTop: 4, textAlign: "center" },
  cashupSummaryCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.greenDim, borderRadius: radius.md, borderWidth: 1, borderColor: colors.green + "44", padding: 14, marginBottom: 12 },
  cashupSummaryTitle: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  cashupSummaryVal: { color: colors.green, fontSize: 18, fontWeight: "900" },
  outstandingAlert: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FFD60A11", borderRadius: radius.md, borderWidth: 1, borderColor: "#FFD60A33", padding: 12, marginBottom: 12 },
  outstandingAlertText: { color: "#FFD60A", fontSize: 13, fontWeight: "700", flex: 1 },
  tabRow: { flexDirection: "row", gap: 4, marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: radius.md, alignItems: "center", backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border },
  tabActive: { backgroundColor: colors.cyanDim, borderColor: colors.cyan },
  tabText: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  tabTextActive: { color: colors.cyan },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  section: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4 },
  outstandingTotal: { color: colors.red, fontWeight: "800", fontSize: 14 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.cyan, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  addBtnText: { color: colors.bg, fontWeight: "800", fontSize: 13 },
  driverCard: { backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  driverLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  driverAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.cyanDim, borderWidth: 1, borderColor: colors.cyan, alignItems: "center", justifyContent: "center" },
  driverName: { color: colors.text, fontWeight: "700", fontSize: 15 },
  driverPhone: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  platePill: { backgroundColor: "#FFD60A", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginTop: 4, alignSelf: "flex-start" },
  plateText: { color: "#111", fontWeight: "900", fontSize: 11 },
  driverRight: { alignItems: "flex-end" },
  driverEarnings: { color: colors.green, fontWeight: "800", fontSize: 16 },
  driverEarningsLabel: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  verifiedBadge: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4 },
  verifiedText: { color: colors.green, fontSize: 10, fontWeight: "700" },
  cashupRow: { flexDirection: "row", backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 8 },
  cashupRowDriver: { color: colors.text, fontWeight: "700", fontSize: 14 },
  cashupRowDate: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  cashupRowMethod: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  cashupRowAmt: { color: "#A064FF", fontWeight: "800", fontSize: 16 },
  cashupRowShortfall: { color: colors.red, fontSize: 11, marginTop: 2 },
  cashupRowProfit: { color: colors.green, fontSize: 11, marginTop: 2 },
  outstandingRow: { flexDirection: "row", backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: "#FFD60A33", padding: 14, marginBottom: 8 },
  outstandingDriver: { color: colors.text, fontWeight: "700", fontSize: 14 },
  outstandingReason: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  outstandingDate: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  outstandingAmt: { color: "#FFD60A", fontWeight: "800", fontSize: 16 },
  cancelObBtn: { backgroundColor: colors.redDim, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.red + "44", paddingHorizontal: 12, paddingVertical: 6 },
  cancelObBtnText: { color: colors.red, fontSize: 12, fontWeight: "700" },
  empty: { alignItems: "center", padding: 40, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, borderRadius: radius.md },
  emptyText: { color: colors.text, fontWeight: "700", marginTop: 12 },
  emptySub: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: colors.bg2, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, borderTopWidth: 1, borderColor: colors.border },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 20 },
  modalIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.cyanDim, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: "800", textAlign: "center" },
  modalSub: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginTop: 4, marginBottom: 20 },
  inputLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, marginBottom: 8 },
  input: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 14, color: colors.text, fontSize: 16, fontWeight: "700", marginBottom: 4 },
  driverDetailGrid: { marginTop: 8, gap: 10, marginBottom: 16 },
  detailItem: { backgroundColor: colors.bg, borderRadius: radius.md, padding: 12 },
  detailLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 1.4 },
  detailVal: { color: colors.text, fontWeight: "700", fontSize: 16, marginTop: 4 },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1 },
  actionBtnText: { fontWeight: "700", fontSize: 13 },
});
