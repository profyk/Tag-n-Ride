import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Alert, TextInput, Modal, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/AuthContext";
import { api } from "../../src/api";
import { Button, PoweredBy } from "../../src/ui";
import { colors, radius } from "../../src/theme";

type PayoutAccount = {
  id: string;
  type: "self" | "owner";
  bank_name: string;
  account_number: string;
  account_name?: string;
};

export default function Profile() {
  const router = useRouter();
  const { state, signOut, refresh } = useAuth();

  const [editingPlate, setEditingPlate] = useState(false);
  const [plate, setPlate] = useState("");
  const [savingPlate, setSavingPlate] = useState(false);

  const [pinModal, setPinModal] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [savingPin, setSavingPin] = useState(false);

  const [payoutModal, setPayoutModal] = useState(false);
  const [payoutType, setPayoutType] = useState<"self" | "owner">("self");
  const [payoutBank, setPayoutBank] = useState("");
  const [payoutAccount, setPayoutAccount] = useState("");
  const [payoutName, setPayoutName] = useState("");
  const [savingPayout, setSavingPayout] = useState(false);
  const [payoutAccounts, setPayoutAccounts] = useState<PayoutAccount[]>([]);
  const [loadingPayouts, setLoadingPayouts] = useState(false);

  useEffect(() => {
    if (state.status === "authed" && state.user.role === "driver") {
      setPlate(state.user.vehicle_plate || "");
      loadPayoutAccounts();
    }
  }, [state]);

  useEffect(() => {
    if (state.status === "guest") router.replace("/(auth)/welcome");
  }, [state.status]);

  if (state.status !== "authed") return null;
  const u = state.user;
  const isDriver = u.role === "driver";

  const loadPayoutAccounts = async () => {
    setLoadingPayouts(true);
    try {
      const accounts = await api.getPayoutAccounts();
      setPayoutAccounts(accounts);
    } catch {
    } finally {
      setLoadingPayouts(false);
    }
  };

  const savePlate = async () => {
    if (plate.trim().length < 2) {
      Alert.alert("Invalid plate", "Please enter at least 2 characters.");
      return;
    }
    setSavingPlate(true);
    try {
      await api.updateDriverProfile(plate.trim().toUpperCase());
      await refresh();
      setEditingPlate(false);
    } catch (e: any) {
      Alert.alert("Could not save", e?.message || "");
    } finally {
      setSavingPlate(false);
    }
  };

  const handleChangePin = async () => {
    if (!currentPin || currentPin.length !== 4) {
      Alert.alert("Invalid", "Enter your current 4-digit PIN.");
      return;
    }
    if (!newPin || newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
      Alert.alert("Invalid", "New PIN must be exactly 4 digits.");
      return;
    }
    if (newPin !== confirmPin) {
      Alert.alert("Mismatch", "New PINs do not match.");
      return;
    }
    if (newPin === currentPin) {
      Alert.alert("Invalid", "New PIN must be different from current PIN.");
      return;
    }
    setSavingPin(true);
    try {
      await api.changePin({ current_pin: currentPin, new_pin: newPin });
      setPinModal(false);
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      Alert.alert("Success", "Your PIN has been changed successfully.");
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Could not change PIN.");
    } finally {
      setSavingPin(false);
    }
  };

  const handleSavePayout = async () => {
    if (!payoutBank.trim()) {
      Alert.alert("Required", "Please enter a bank name.");
      return;
    }
    if (!payoutAccount.trim() || payoutAccount.trim().length < 6) {
      Alert.alert("Required", "Please enter a valid account number.");
      return;
    }
    setSavingPayout(true);
    try {
      await api.savePayoutAccount({
        type: payoutType,
        bank_name: payoutBank.trim(),
        account_number: payoutAccount.trim(),
        account_name: payoutName.trim() || undefined,
      });
      await loadPayoutAccounts();
      setPayoutModal(false);
      setPayoutBank("");
      setPayoutAccount("");
      setPayoutName("");
      Alert.alert(
        "Saved",
        `${payoutType === "self" ? "My Account" : "Owner Account"} saved successfully.`
      );
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Could not save account.");
    } finally {
      setSavingPayout(false);
    }
  };

  const openPayoutModal = (type: "self" | "owner") => {
    const existing = payoutAccounts.find((p) => p.type === type);
    setPayoutType(type);
    setPayoutBank(existing?.bank_name || "");
    setPayoutAccount(existing?.account_number || "");
    setPayoutName(existing?.account_name || "");
    setPayoutModal(true);
  };

  const confirmLogout = () => {
    Alert.alert(
      "Sign out?",
      "You will need to sign back in to use Tag n Ride.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: async () => {
            await signOut();
            router.replace("/(auth)/welcome");
          },
        },
      ]
    );
  };

  const selfAccount = payoutAccounts.find((p) => p.type === "self");
  const ownerAccount = payoutAccounts.find((p) => p.type === "owner");

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="profile-screen">
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View style={styles.header}>
          <Image
            source={require("../../assets/images/icon.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <View style={styles.card}>
          <View style={styles.avatar}>
            <Ionicons
              name={isDriver ? "car-sport" : "person"}
              size={32}
              color={colors.cyan}
            />
          </View>
          <Text style={styles.name} testID="profile-name">{u.full_name}</Text>
          <Text style={styles.phone}>{u.phone_number}</Text>
          <View style={styles.rolePill}>
            <Ionicons
              name={isDriver ? "shield-checkmark" : "person-circle"}
              size={13}
              color={colors.cyan}
            />
            <Text style={styles.rolePillText}>{u.role.toUpperCase()}</Text>
          </View>
        </View>

        {isDriver ? (
          <View style={styles.plateCard} testID="profile-plate-card">
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={styles.plateLabel}>VEHICLE PLATE</Text>
              {!editingPlate && (
                <TouchableOpacity onPress={() => setEditingPlate(true)} testID="edit-plate-btn">
                  <Ionicons name="create-outline" size={18} color={colors.cyan} />
                </TouchableOpacity>
              )}
            </View>
            {!editingPlate ? (
              <View style={styles.plateBox}>
                <Text style={styles.plateValue}>{u.vehicle_plate || "Not set"}</Text>
              </View>
            ) : (
              <View>
                <TextInput
                  testID="plate-input"
                  value={plate}
                  onChangeText={(t) => setPlate(t.toUpperCase().slice(0, 12))}
                  placeholder="ND 123 456"
                  placeholderTextColor={colors.textDim}
                  autoCapitalize="characters"
                  style={styles.plateInput}
                />
                <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Cancel"
                      variant="secondary"
                      onPress={() => {
                        setPlate(u.vehicle_plate || "");
                        setEditingPlate(false);
                      }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Save"
                      onPress={savePlate}
                      loading={savingPlate}
                      testID="save-plate-btn"
                    />
                  </View>
                </View>
              </View>
            )}
          </View>
        ) : null}

        {isDriver ? (
          <>
            <Text style={styles.section}>PAYOUT ACCOUNTS</Text>
            {loadingPayouts ? (
              <ActivityIndicator color={colors.cyan} style={{ marginVertical: 12 }} />
            ) : (
              <>
                <TouchableOpacity
                  style={styles.payoutRow}
                  onPress={() => openPayoutModal("self")}
                  testID="payout-self-btn">
                  <View style={[styles.payoutIcon, { backgroundColor: colors.cyanDim }]}>
                    <Ionicons name="person-outline" size={18} color={colors.cyan} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.payoutLabel}>My Account</Text>
                    {selfAccount ? (
                      <Text style={styles.payoutSub}>
                        {selfAccount.bank_name} · ****{selfAccount.account_number.slice(-4)}
                      </Text>
                    ) : (
                      <Text style={styles.payoutEmpty}>Not set — tap to add</Text>
                    )}
                  </View>
                  <Ionicons
                    name={selfAccount ? "create-outline" : "add-circle-outline"}
                    size={18}
                    color={colors.cyan}
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.payoutRow}
                  onPress={() => openPayoutModal("owner")}
                  testID="payout-owner-btn">
                  <View style={[styles.payoutIcon, { backgroundColor: "rgba(160,100,255,0.15)" }]}>
                    <Ionicons name="car-outline" size={18} color="#A064FF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.payoutLabel}>Owner Account</Text>
                    {ownerAccount ? (
                      <Text style={styles.payoutSub}>
                        {ownerAccount.bank_name} · ****{ownerAccount.account_number.slice(-4)}
                      </Text>
                    ) : (
                      <Text style={styles.payoutEmpty}>Not set — tap to add</Text>
                    )}
                  </View>
                  <Ionicons
                    name={ownerAccount ? "create-outline" : "add-circle-outline"}
                    size={18}
                    color="#A064FF"
                  />
                </TouchableOpacity>
              </>
            )}
          </>
        ) : null}

        <Text style={styles.section}>ACCOUNT</Text>
        <Row
          icon="card-outline"
          label={isDriver ? "Withdrawal requests" : "Top up wallet"}
          onPress={() => router.push(isDriver ? "/withdraw" : "/topup")}
          testID={isDriver ? "row-withdraw" : "row-topup"}
        />
        <Row
          icon="receipt-outline"
          label="Transaction history"
          onPress={() => router.push("/(app)/transactions")}
          testID="row-history"
        />
        <Row
          icon="lock-closed-outline"
          label="Change PIN"
          onPress={() => setPinModal(true)}
          testID="row-change-pin"
        />

        <Text style={styles.section}>SUPPORT</Text>
        <Row
          icon="help-circle-outline"
          label="Help & FAQs"
          onPress={() => Alert.alert("Help", "support@tagnride.app")}
        />
        <Row
          icon="shield-outline"
          label="Privacy & Security"
          onPress={() =>
            Alert.alert("Privacy", "Your PIN is bcrypt-hashed and never stored in plaintext.")
          }
        />

        <View style={{ height: 16 }} />
        <TouchableOpacity
          onPress={confirmLogout}
          style={styles.signout}
          testID="signout-btn">
          <Ionicons name="log-out-outline" size={18} color={colors.red} />
          <Text style={styles.signoutText}>Sign out</Text>
        </TouchableOpacity>

        <Text style={styles.brand}>Tag n Ride · No cash · No stress</Text>
        <PoweredBy testID="profile-powered" />
      </ScrollView>

      {/* Change PIN Modal */}
      <Modal
        visible={pinModal}
        transparent
        animationType="slide"
        onRequestClose={() => setPinModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalIconWrap}>
              <Ionicons name="lock-closed-outline" size={26} color={colors.cyan} />
            </View>
            <Text style={styles.modalTitle}>Change PIN</Text>
            <Text style={styles.modalSub}>
              Enter your current PIN and choose a new 4-digit PIN.
            </Text>

            <Text style={styles.inputLabel}>CURRENT PIN</Text>
            <TextInput
              style={styles.pinInput}
              value={currentPin}
              onChangeText={(t) => setCurrentPin(t.replace(/\D/g, "").slice(0, 4))}
              keyboardType="number-pad"
              secureTextEntry
              placeholder="••••"
              placeholderTextColor={colors.textDim}
              maxLength={4}
              testID="current-pin-input"
            />

            <Text style={styles.inputLabel}>NEW PIN</Text>
            <TextInput
              style={styles.pinInput}
              value={newPin}
              onChangeText={(t) => setNewPin(t.replace(/\D/g, "").slice(0, 4))}
              keyboardType="number-pad"
              secureTextEntry
              placeholder="••••"
              placeholderTextColor={colors.textDim}
              maxLength={4}
              testID="new-pin-input"
            />

            <Text style={styles.inputLabel}>CONFIRM NEW PIN</Text>
            <TextInput
              style={styles.pinInput}
              value={confirmPin}
              onChangeText={(t) => setConfirmPin(t.replace(/\D/g, "").slice(0, 4))}
              keyboardType="number-pad"
              secureTextEntry
              placeholder="••••"
              placeholderTextColor={colors.textDim}
              maxLength={4}
              testID="confirm-pin-input"
            />

            <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
              <View style={{ flex: 1 }}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => {
                    setPinModal(false);
                    setCurrentPin("");
                    setNewPin("");
                    setConfirmPin("");
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="Change PIN"
                  onPress={handleChangePin}
                  loading={savingPin}
                  testID="save-pin-btn"
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Payout Account Modal */}
      <Modal
        visible={payoutModal}
        transparent
        animationType="slide"
        onRequestClose={() => setPayoutModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={[
              styles.modalIconWrap,
              { backgroundColor: payoutType === "self" ? colors.cyanDim : "rgba(160,100,255,0.15)" }
            ]}>
              <Ionicons
                name={payoutType === "self" ? "person-outline" : "car-outline"}
                size={26}
                color={payoutType === "self" ? colors.cyan : "#A064FF"}
              />
            </View>
            <Text style={styles.modalTitle}>
              {payoutType === "self" ? "My Account" : "Owner Account"}
            </Text>
            <Text style={styles.modalSub}>
              {payoutType === "self"
                ? "Your personal payout account for Pay Fuel and CashUp."
                : "Vehicle owner's account for CashUp payments."}
            </Text>

            <Text style={styles.inputLabel}>BANK NAME</Text>
            <TextInput
              style={styles.textInput}
              value={payoutBank}
              onChangeText={setPayoutBank}
              placeholder="e.g. FNB, Capitec, Standard Bank"
              placeholderTextColor={colors.textDim}
              testID="payout-bank-input"
            />

            <Text style={styles.inputLabel}>ACCOUNT NUMBER</Text>
            <TextInput
              style={styles.textInput}
              value={payoutAccount}
              onChangeText={(t) => setPayoutAccount(t.replace(/\D/g, ""))}
              placeholder="e.g. 1234567890"
              placeholderTextColor={colors.textDim}
              keyboardType="number-pad"
              testID="payout-account-input"
            />

            <Text style={styles.inputLabel}>ACCOUNT NAME (optional)</Text>
            <TextInput
              style={styles.textInput}
              value={payoutName}
              onChangeText={setPayoutName}
              placeholder="e.g. John Doe"
              placeholderTextColor={colors.textDim}
              testID="payout-name-input"
            />

            <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
              <View style={{ flex: 1 }}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => setPayoutModal(false)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="Save"
                  onPress={handleSavePayout}
                  loading={savingPayout}
                  testID="save-payout-btn"
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const Row: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  testID?: string;
}> = ({ icon, label, onPress, testID }) => (
  <TouchableOpacity
    testID={testID}
    onPress={onPress}
    activeOpacity={0.85}
    style={styles.row}>
    <Ionicons name={icon} size={20} color={colors.cyan} />
    <Text style={styles.rowText}>{label}</Text>
    <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { alignItems: "center", marginBottom: 8 },
  logo: { width: 80, height: 80 },
  card: {
    backgroundColor: colors.bg2, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    padding: 24, alignItems: "center",
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.cyanDim, borderWidth: 1, borderColor: colors.cyan,
  },
  name: { color: colors.text, fontSize: 22, fontWeight: "800", marginTop: 12 },
  phone: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
  rolePill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    backgroundColor: colors.cyanDim, marginTop: 12,
    borderWidth: 1, borderColor: colors.cyan,
  },
  rolePillText: { color: colors.cyan, fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },
  section: {
    color: colors.textMuted, fontSize: 12, fontWeight: "700",
    letterSpacing: 1.4, marginTop: 24, marginBottom: 10,
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 16, backgroundColor: colors.bg2,
    borderRadius: radius.md, borderWidth: 1,
    borderColor: colors.border, marginBottom: 8,
  },
  rowText: { color: colors.text, fontSize: 15, fontWeight: "600", flex: 1 },
  signout: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, padding: 16, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.red, backgroundColor: colors.redDim,
  },
  signoutText: { color: colors.red, fontWeight: "700", fontSize: 15 },
  brand: {
    color: colors.textDim, textAlign: "center",
    marginTop: 32, fontSize: 12, letterSpacing: 1,
  },
  plateCard: {
    marginTop: 16, padding: 16, backgroundColor: colors.bg2,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  plateLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4 },
  plateBox: {
    marginTop: 10, paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: "#FFD60A", borderRadius: 8,
    borderWidth: 2, borderColor: "#0A0A0A", alignItems: "center",
  },
  plateValue: {
    color: "#0A0A0A", fontSize: 22, fontWeight: "900",
    letterSpacing: 2, fontFamily: "monospace",
  },
  plateInput: {
    marginTop: 10, backgroundColor: colors.bg,
    borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.sm + 4, paddingHorizontal: 14,
    paddingVertical: 14, color: colors.text,
    fontSize: 18, fontWeight: "800", letterSpacing: 2,
  },
  payoutRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, backgroundColor: colors.bg2,
    borderRadius: radius.md, borderWidth: 1,
    borderColor: colors.border, marginBottom: 8,
  },
  payoutIcon: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
  },
  payoutLabel: { color: colors.text, fontSize: 14, fontWeight: "700" },
  payoutSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  payoutEmpty: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: colors.bg2, borderTopLeftRadius: 24,
    borderTopRightRadius: 24, padding: 24, paddingBottom: 40,
    borderWidth: 1, borderColor: colors.border,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.border, alignSelf: "center", marginBottom: 20,
  },
  modalIconWrap: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.cyanDim, alignItems: "center",
    justifyContent: "center", alignSelf: "center", marginBottom: 12,
  },
  modalTitle: {
    color: colors.text, fontSize: 20, fontWeight: "800",
    textAlign: "center", marginBottom: 6,
  },
  modalSub: {
    color: colors.textMuted, fontSize: 13,
    textAlign: "center", marginBottom: 20, lineHeight: 20,
  },
  inputLabel: {
    color: colors.textMuted, fontSize: 10, fontWeight: "700",
    letterSpacing: 1.4, marginBottom: 6, marginTop: 12,
  },
  pinInput: {
    backgroundColor: colors.bg, borderColor: colors.border,
    borderWidth: 1, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 14,
    color: colors.text, fontSize: 22,
    fontWeight: "800", letterSpacing: 8, textAlign: "center",
  },
  textInput: {
    backgroundColor: colors.bg, borderColor: colors.border,
    borderWidth: 1, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 12,
    color: colors.text, fontSize: 14,
  },
});
