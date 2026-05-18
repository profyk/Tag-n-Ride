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
};

type DashboardData = {
  total_earnings: number;
  today_revenue: number;
  driver_count: number;
  drivers: Driver[];
};

export default function OwnerDashboard() {
  const { state, signOut } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [linkModal, setLinkModal] = useState(false);
  const [driverCode, setDriverCode] = useState("");
  const [linking, setLinking] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.ownerDashboard();
      setData(res);
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
      Alert.alert("Driver Linked!", `${res.driver.full_name} has been added to your fleet.`);
      load();
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Could not link driver");
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = (driver: Driver) => {
    Alert.alert(
      "Remove Driver",
      `Remove ${driver.full_name} from your fleet?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await api.ownerUnlinkDriver(driver.user_id);
              load();
            } catch (e: any) {
              Alert.alert("Error", e?.message || "Failed to remove driver");
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={colors.cyan}
          />
        }>

        <View style={styles.headerRow}>
          <View>
            <Text style={styles.hello}>Fleet Dashboard</Text>
            <Text style={styles.name}>{state.user.full_name}</Text>
          </View>
          <TouchableOpacity
            onPress={() => Alert.alert("Sign out?", "", [
              { text: "Cancel", style: "cancel" },
              { text: "Sign out", style: "destructive", onPress: signOut },
            ])}
            style={styles.avatar}>
            <Ionicons name="business-outline" size={22} color={colors.cyan} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.cyan} style={{ marginTop: 40 }} />
        ) : (
          <>
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>TOTAL EARNINGS</Text>
                <Text style={styles.statVal}>{formatZAR(data?.total_earnings ?? 0)}</Text>
              </View>
              <View style={[styles.statCard, { borderColor: colors.green }]}>
                <Text style={styles.statLabel}>TODAY</Text>
                <Text style={[styles.statVal, { color: colors.green }]}>
                  {formatZAR(data?.today_revenue ?? 0)}
                </Text>
              </View>
              <View style={[styles.statCard, { borderColor: "#A064FF" }]}>
                <Text style={styles.statLabel}>DRIVERS</Text>
                <Text style={[styles.statVal, { color: "#A064FF" }]}>
                  {data?.driver_count ?? 0}
                </Text>
              </View>
            </View>

            <View style={styles.sectionRow}>
              <Text style={styles.section}>MY DRIVERS</Text>
              <TouchableOpacity onPress={() => setLinkModal(true)} style={styles.addBtn}>
                <Ionicons name="add" size={18} color={colors.bg} />
                <Text style={styles.addBtnText}>Add Driver</Text>
              </TouchableOpacity>
            </View>

            {data?.drivers.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="car-outline" size={40} color={colors.textDim} />
                <Text style={styles.emptyText}>No drivers yet</Text>
                <Text style={styles.emptySub}>Add a driver using their TNR code</Text>
              </View>
            ) : (
              data?.drivers.map((driver) => (
                <TouchableOpacity
                  key={driver.user_id}
                  style={styles.driverCard}
                  onPress={() => setSelectedDriver(driver)}
                  activeOpacity={0.85}>
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
      </ScrollView>

      <Modal
        visible={linkModal}
        transparent
        animationType="slide"
        onRequestClose={() => setLinkModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalIconWrap}>
              <Ionicons name="link-outline" size={26} color={colors.cyan} />
            </View>
            <Text style={styles.modalTitle}>Add Driver</Text>
            <Text style={styles.modalSub}>
              Enter the driver's TNR code to link them to your fleet.
            </Text>
            <Text style={styles.inputLabel}>DRIVER TNR CODE</Text>
            <TextInput
              style={styles.input}
              value={driverCode}
              onChangeText={(t) => setDriverCode(t.toUpperCase())}
              placeholder="TNR0000000000000"
              placeholderTextColor={colors.textDim}
              autoCapitalize="characters"
            />
            <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
              <View style={{ flex: 1 }}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => { setLinkModal(false); setDriverCode(""); }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Link Driver" onPress={handleLinkDriver} loading={linking} />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {selectedDriver && (
        <Modal
          visible={!!selectedDriver}
          transparent
          animationType="slide"
          onRequestClose={() => setSelectedDriver(null)}>
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
                    {selectedDriver.rating_count > 0
                      ? `${selectedDriver.rating_avg.toFixed(1)} (${selectedDriver.rating_count})`
                      : "New"}
                  </Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>TNR CODE</Text>
                  <Text style={[styles.detailVal, { fontSize: 12, fontFamily: "monospace" }]}>
                    {selectedDriver.qr_code}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Close"
                    variant="secondary"
                    onPress={() => setSelectedDriver(null)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Remove"
                    variant="danger"
                    onPress={() => {
                      setSelectedDriver(null);
                      handleUnlink(selectedDriver);
                    }}
                  />
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
  headerRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 20,
  },
  hello: { color: colors.textMuted, fontSize: 14 },
  name: { color: colors.text, fontSize: 22, fontWeight: "800" },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.cyanDim, borderWidth: 1, borderColor: colors.cyan,
    alignItems: "center", justifyContent: "center",
  },
  statsGrid: { flexDirection: "row", gap: 10, marginBottom: 24 },
  statCard: {
    flex: 1, backgroundColor: colors.bg2, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: 14, alignItems: "center",
  },
  statLabel: {
    color: colors.textMuted, fontSize: 9, fontWeight: "800",
    letterSpacing: 1, textTransform: "uppercase", textAlign: "center",
  },
  statVal: { color: colors.cyan, fontSize: 16, fontWeight: "800", marginTop: 4, textAlign: "center" },
  sectionRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 12,
  },
  section: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4 },
  addBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.cyan, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
  },
  addBtnText: { color: colors.bg, fontWeight: "800", fontSize: 13 },
  driverCard: {
    backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1,
    borderColor: colors.border, padding: 16, marginBottom: 10,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  driverLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  driverAvatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.cyanDim,
    borderWidth: 1, borderColor: colors.cyan, alignItems: "center", justifyContent: "center",
  },
  driverName: { color: colors.text, fontWeight: "700", fontSize: 15 },
  driverPhone: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  platePill: {
    backgroundColor: "#FFD60A", borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2, marginTop: 4, alignSelf: "flex-start",
  },
  plateText: { color: "#111", fontWeight: "900", fontSize: 11, fontFamily: "monospace" },
  driverRight: { alignItems: "flex-end" },
  driverEarnings: { color: colors.green, fontWeight: "800", fontSize: 16 },
  driverEarningsLabel: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  verifiedBadge: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4 },
  verifiedText: { color: colors.green, fontSize: 10, fontWeight: "700" },
  empty: {
    alignItems: "center", padding: 40, borderWidth: 1,
    borderStyle: "dashed", borderColor: colors.border, borderRadius: radius.md,
  },
  emptyText: { color: colors.text, fontWeight: "700", marginTop: 12 },
  emptySub: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: colors.bg2, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40, borderTopWidth: 1, borderColor: colors.border,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: "center", marginBottom: 20,
  },
  modalIconWrap: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.cyanDim,
    alignItems: "center", justifyContent: "center", alignSelf: "center",
    marginBottom: 12, borderWidth: 1, borderColor: colors.border,
  },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: "800", textAlign: "center" },
  modalSub: {
    color: colors.textMuted, fontSize: 13, textAlign: "center",
    marginTop: 4, marginBottom: 20,
  },
  inputLabel: {
    color: colors.textMuted, fontSize: 11, fontWeight: "700",
    letterSpacing: 1.4, marginBottom: 8,
  },
  input: {
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.borderStrong,
    borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 14,
    color: colors.text, fontSize: 16, fontWeight: "700", letterSpacing: 2, marginBottom: 4,
  },
  driverDetailGrid: { marginTop: 16, gap: 12 },
  detailItem: { backgroundColor: colors.bg, borderRadius: radius.md, padding: 12 },
  detailLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 1.4 },
  detailVal: { color: colors.text, fontWeight: "700", fontSize: 16, marginTop: 4 },
});
