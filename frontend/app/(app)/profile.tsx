import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Alert, TextInput, Modal, ActivityIndicator,
  Platform, Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/AuthContext";
import { useTheme } from "../../src/ThemeContext";
import { ThemeToggle } from "../../src/ThemeToggle";
import { api } from "../../src/api";
import { Button, PoweredBy } from "../../src/ui";
import { radius } from "../../src/theme";

type PayoutAccount = {
  id: string; type: "self" | "owner";
  bank_name: string; account_number: string; account_name?: string;
};

const WHATSAPP_NUMBER = "27832789333";
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Hi Tag n Ride support, I need help with my account.")}`;

const SA_BANKS = [
  "ABSA", "Capitec", "FNB", "Nedbank", "Standard Bank",
  "TymeBank", "African Bank", "Investec", "Discovery Bank",
  "Bidvest", "Grindrod", "HBZ", "Mercantile",
];

const APP_VERSION = "1.0.0";export default function Profile() {
  const router = useRouter();
  const { state, signOut, refresh } = useAuth();
  const { colors } = useTheme();

  const [editingPlate, setEditingPlate] = useState(false);
  const [plate, setPlate] = useState("");
  const [savingPlate, setSavingPlate] = useState(false);

  const [pinModal, setPinModal] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [savingPin, setSavingPin] = useState(false);
  const [showPin, setShowPin] = useState(false);

  const [payoutModal, setPayoutModal] = useState(false);
  const [payoutType, setPayoutType] = useState<"self" | "owner">("self");
  const [payoutBank, setPayoutBank] = useState("");
  const [payoutAccount, setPayoutAccount] = useState("");
  const [payoutName, setPayoutName] = useState("");
  const [savingPayout, setSavingPayout] = useState(false);
  const [payoutAccounts, setPayoutAccounts] = useState<PayoutAccount[]>([]);
  const [loadingPayouts, setLoadingPayouts] = useState(false);
  const [showBankPicker, setShowBankPicker] = useState(false);

  const [kycStatus, setKycStatus] = useState<
    "not_submitted" | "pending" | "approved" | "rejected" | null
  >(null);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);

  useEffect(() => {
    if (state.status === "authed") {
      if (state.user.role === "driver") {
        setPlate(state.user.vehicle_plate || "");
        loadPayoutAccounts();
      }
      if (state.user.role === "driver" || state.user.role === "owner") {
        loadKycStatus();
      }
    }
  }, [state]);

  useEffect(() => {
    if (state.status === "guest") router.replace("/(auth)/welcome");
  }, [state.status]);

  if (state.status !== "authed") return null;
  const u = state.user;
  const isDriver = u.role === "driver";
  const isOwner = u.role === "owner";
  const isPassenger = u.role === "passenger";
  const showKyc = isDriver || isOwner;

  const loadPayoutAccounts = async () => {
    setLoadingPayouts(true);
    try {
      const accounts = await api.getPayoutAccounts();
      setPayoutAccounts(accounts);
    } catch {} finally { setLoadingPayouts(false); }
  };

  const loadKycStatus = async () => {
    try {
      const res = await api.kycStatus();
      setKycStatus(res.status);
      if (res.status === "approved") {
        const selfie = await api.kycSelfieUrl().catch(() => null);
        if (selfie?.url) setSelfieUrl(selfie.url);
      }
    } catch { setKycStatus("not_submitted"); }
  };

  const savePlate = async () => {
    if (plate.trim().length < 2) {
      Alert.alert("Invalid plate", "Please enter at least 2 characters."); return;
    }
    setSavingPlate(true);
    try {
      await api.updateDriverProfile(plate.trim().toUpperCase());
      await refresh();
      setEditingPlate(false);
    } catch (e: any) { Alert.alert("Could not save", e?.message || ""); }
    finally { setSavingPlate(false); }
  };

  const handleChangePin = async () => {
    if (!currentPin || currentPin.length !== 4) {
      Alert.alert("Invalid", "Enter your current 4-digit PIN."); return;
    }
    if (!newPin || newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
      Alert.alert("Invalid", "New PIN must be exactly 4 digits."); return;
    }
    if (newPin !== confirmPin) {
      Alert.alert("Mismatch", "New PINs do not match."); return;
    }
    if (newPin === currentPin) {
      Alert.alert("Invalid", "New PIN must be different from current PIN."); return;
    }
    setSavingPin(true);
    try {
      await api.changePin({ current_pin: currentPin, new_pin: newPin });
      setPinModal(false);
      setCurrentPin(""); setNewPin(""); setConfirmPin(""); setShowPin(false);
      Alert.alert("Success ✓", "Your PIN has been changed successfully.");
    } catch (e: any) { Alert.alert("Failed", e?.message || "Could not change PIN."); }
    finally { setSavingPin(false); }
  };

  const handleSavePayout = async () => {
    if (!payoutBank.trim()) {
      Alert.alert("Required", "Please select a bank."); return;
    }
    if (!payoutAccount.trim() || payoutAccount.trim().length < 6) {
      Alert.alert("Required", "Please enter a valid account number."); return;
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
      setPayoutBank(""); setPayoutAccount(""); setPayoutName("");
      Alert.alert("Saved ✓",
        `${payoutType === "self" ? "My Account" : "Owner Account"} saved.`);
    } catch (e: any) { Alert.alert("Failed", e?.message || "Could not save account."); }
    finally { setSavingPayout(false); }
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
    if (Platform.OS === "web") {
      signOut().then(() => { window.location.href = "/login"; }); return;
    }
    Alert.alert("Sign out?", "You will need to sign back in to use Tag n Ride.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: async () => {
        await signOut(); router.replace("/(auth)/welcome");
      }},
    ]);
  };

  const openWhatsApp = () => {
    Linking.openURL(WHATSAPP_URL).catch(() => {
      Alert.alert("WhatsApp not available", "Please contact us at support@tagnride.app");
    });
  };

  const kycColor = () => {
    switch (kycStatus) {
      case "approved": return colors.green;
      case "pending": return "#FFD60A";
      case "rejected": return colors.red;
      default: return colors.textMuted;
    }
  };
  const kycLabel = () => {
    switch (kycStatus) {
      case "approved": return "Verified ✓";
      case "pending": return "Under Review";
      case "rejected": return "Rejected — Resubmit";
      default: return "Not Submitted";
    }
  };
  const kycIcon = (): any => {
    switch (kycStatus) {
      case "approved": return "shield-checkmark";
      case "pending": return "time-outline";
      case "rejected": return "close-circle-outline";
      default: return "finger-print-outline";
    }
  };

  const selfAccount = payoutAccounts.find((p) => p.type === "self");
  const ownerAccount = payoutAccounts.find((p) => p.type === "owner");
  const s = makeStyles(colors);return (
    <SafeAreaView style={s.root} edges={["top"]} testID="profile-screen">
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>

        <View style={s.header}>
          <Image source={require("../../assets/images/icon.png")} style={s.logo} resizeMode="contain" />
        </View>

        {/* Profile card */}
        <View style={s.card}>
          <View style={s.avatar}>
            {selfieUrl ? (
              <Image
                source={{ uri: selfieUrl }}
                style={{ width: "100%", height: "100%", borderRadius: 36 }}
                resizeMode="cover"
              />
            ) : (
              <Ionicons
                name={isDriver ? "car-sport" : isOwner ? "business" : "person"}
                size={32} color={colors.cyan}
              />
            )}
            {kycStatus === "approved" && (
              <View style={s.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={18} color={colors.green} />
              </View>
            )}
          </View>
          <Text style={s.name} testID="profile-name">{u.full_name}</Text>
          <Text style={s.phone}>{u.phone_number}</Text>
          <View style={s.rolePill}>
            <Ionicons name={isDriver ? "shield-checkmark" : isOwner ? "briefcase" : "person-circle"} size={13} color={colors.cyan} />
            <Text style={s.rolePillText}>{u.role.toUpperCase()}</Text>
          </View>
        </View>

        {/* KYC */}
        {showKyc && (
          <>
            <Text style={s.section}>IDENTITY VERIFICATION</Text>
            <TouchableOpacity
              style={[s.kycRow, { borderColor: kycColor() }]}
              onPress={() => router.push("/(app)/kyc")}
              testID="kyc-btn"
              disabled={kycStatus === "approved"}>
              <View style={[s.kycIconWrap, { backgroundColor: kycColor() + "22" }]}>
                <Ionicons name={kycIcon()} size={22} color={kycColor()} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.kycTitle}>KYC Verification</Text>
                <Text style={[s.kycStatusText, { color: kycColor() }]}>{kycLabel()}</Text>
                {kycStatus !== "approved" && (
                  <Text style={s.kycHintText}>
                    {kycStatus === "pending" ? "Being reviewed — usually 24 hrs"
                      : kycStatus === "rejected" ? "Tap to resubmit your documents"
                      : "Required to receive payments · Tap to verify"}
                  </Text>
                )}
              </View>
              {kycStatus !== "approved" && (
                <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
              )}
            </TouchableOpacity>
          </>
        )}

        {/* Vehicle plate */}
        {isDriver && (
          <View style={s.plateCard} testID="profile-plate-card">
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={s.plateLabel}>VEHICLE PLATE</Text>
              {!editingPlate && (
                <TouchableOpacity onPress={() => setEditingPlate(true)} testID="edit-plate-btn">
                  <Ionicons name="create-outline" size={18} color={colors.cyan} />
                </TouchableOpacity>
              )}
            </View>
            {!editingPlate ? (
              <View style={[s.plateBox, {
                backgroundColor: u.vehicle_plate ? colors.bg : "#FFD60A22",
                borderColor: u.vehicle_plate ? colors.border : "#FFD60A",
              }]}>
                <Text style={[s.plateValue, { color: u.vehicle_plate ? colors.text : "#FFD60A" }]}>
                  {u.vehicle_plate || "Not set — tap pencil to add"}
                </Text>
              </View>
            ) : (
              <View>
                <TextInput
                  testID="plate-input" value={plate}
                  onChangeText={(t) => setPlate(t.toUpperCase().slice(0, 12))}
                  placeholder="ND 123 456" placeholderTextColor={colors.textDim}
                  autoCapitalize="characters" style={s.plateInput}
                />
                <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Button label="Cancel" variant="secondary"
                      onPress={() => { setPlate(u.vehicle_plate || ""); setEditingPlate(false); }} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button label="Save" onPress={savePlate} loading={savingPlate} testID="save-plate-btn" />
                  </View>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Payout accounts */}
        {isDriver && (
          <>
            <Text style={s.section}>PAYOUT ACCOUNTS</Text>
            <View style={s.payoutInfo}>
              <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
              <Text style={s.payoutInfoText}>Set up your bank accounts to receive CashUp payments instantly.</Text>
            </View>
            {loadingPayouts ? (
              <ActivityIndicator color={colors.cyan} style={{ marginVertical: 12 }} />
            ) : (
              <>
                <TouchableOpacity style={s.payoutRow} onPress={() => openPayoutModal("self")} testID="payout-self-btn">
                  <View style={[s.payoutIcon, { backgroundColor: selfAccount ? colors.cyanDim : colors.bg2 }]}>
                    <Ionicons name="person-outline" size={18} color={selfAccount ? colors.cyan : colors.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.payoutLabel}>My Account</Text>
                    {selfAccount
                      ? <Text style={s.payoutSub}>{selfAccount.bank_name} · ****{selfAccount.account_number.slice(-4)}</Text>
                      : <Text style={s.payoutEmpty}>Not set — tap to add</Text>}
                  </View>
                  <Ionicons name={selfAccount ? "checkmark-circle" : "add-circle-outline"} size={20}
                    color={selfAccount ? colors.green : colors.cyan} />
                </TouchableOpacity>

                <TouchableOpacity style={s.payoutRow} onPress={() => openPayoutModal("owner")} testID="payout-owner-btn">
                  <View style={[s.payoutIcon, { backgroundColor: ownerAccount ? "rgba(160,100,255,0.15)" : colors.bg2 }]}>
                    <Ionicons name="car-outline" size={18} color={ownerAccount ? "#A064FF" : colors.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.payoutLabel}>Owner Account</Text>
                    {ownerAccount
                      ? <Text style={s.payoutSub}>{ownerAccount.bank_name} · ****{ownerAccount.account_number.slice(-4)}</Text>
                      : <Text style={s.payoutEmpty}>Not set — tap to add</Text>}
                  </View>
                  <Ionicons name={ownerAccount ? "checkmark-circle" : "add-circle-outline"} size={20}
                    color={ownerAccount ? colors.green : "#A064FF"} />
                </TouchableOpacity>
              </>
            )}
          </>
        )}

        {/* Switch owner */}
        {isDriver && (
          <>
            <Text style={s.section}>FLEET</Text>
            <Row
              icon="swap-horizontal-outline"
              label="Switch Owner / Change Taxi"
              onPress={() => router.push("/(app)/transfer")}
              testID="row-switch-owner"
              colors={colors}
            />
          </>
        )}

        {/* Appearance */}
        <Text style={s.section}>APPEARANCE</Text>
        <View style={s.themeCard}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <Ionicons name="contrast-outline" size={18} color={colors.textMuted} />
            <Text style={s.themeLabel}>App Theme</Text>
          </View>
          <ThemeToggle />
        </View>

        {/* Account */}
        <Text style={s.section}>ACCOUNT</Text>
        {isPassenger && (
          <Row icon="add-circle-outline" label="Top up wallet"
            onPress={() => router.push("/topup")} testID="row-topup" colors={colors} />
        )}
        <Row icon="receipt-outline" label="Transaction history"
          onPress={() => router.push("/(app)/transactions")} testID="row-history" colors={colors} />
        {isDriver && (
          <Row icon="document-text-outline" label="Earnings Statements"
            sub="Request and download your official earnings documents"
            onPress={() => router.push("/(app)/payslip")} testID="row-payslip" colors={colors} />
        )}
        {isPassenger && (
          <Row icon="document-text-outline" label="Monthly Expense Statement"
            sub="Track your ride spending — small fee applies"
            onPress={() => router.push("/(app)/statement")} testID="row-statement" colors={colors} />
        )}
        <Row icon="lock-closed-outline" label="Change PIN"
          onPress={() => setPinModal(true)} testID="row-change-pin" colors={colors} />

        {/* Support */}
        <Text style={s.section}>SUPPORT</Text>
        <TouchableOpacity style={s.whatsappRow} onPress={openWhatsApp} testID="row-whatsapp">
          <View style={s.whatsappIcon}>
            <Ionicons name="logo-whatsapp" size={22} color="#fff" />
          </View>
          <Text style={s.whatsappLabel}>WhatsApp Support</Text>
          <Ionicons name="chevron-forward" size={18} color="#ffffff88" />
        </TouchableOpacity>

        <View style={{ height: 16 }} />
        <TouchableOpacity onPress={confirmLogout} style={s.signout} testID="signout-btn">
          <Ionicons name="log-out-outline" size={18} color={colors.red} />
          <Text style={s.signoutText}>Sign out</Text>
        </TouchableOpacity>

        <Text style={s.brand}>Tag n Ride · No cash · No stress</Text>
        <Text style={s.version}>Version {APP_VERSION}</Text>
        <PoweredBy testID="profile-powered" />
      </ScrollView>

      {/* Change PIN Modal */}
      <Modal visible={pinModal} transparent animationType="slide" onRequestClose={() => setPinModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <View style={s.modalIconWrap}>
              <Ionicons name="lock-closed-outline" size={26} color={colors.cyan} />
            </View>
            <Text style={s.modalTitle}>Change PIN</Text>
            <Text style={s.modalSub}>Enter your current PIN and choose a new 4-digit PIN.</Text>
            {[
              { label: "CURRENT PIN", value: currentPin, setter: setCurrentPin, testID: "current-pin-input" },
              { label: "NEW PIN", value: newPin, setter: setNewPin, testID: "new-pin-input" },
              { label: "CONFIRM NEW PIN", value: confirmPin, setter: setConfirmPin, testID: "confirm-pin-input" },
            ].map((f, i) => (
              <View key={f.label}>
                <Text style={s.inputLabel}>{f.label}</Text>
                <View style={s.pinRow}>
                  <TextInput
                    style={[s.pinInput, { flex: 1 }]}
                    value={f.value}
                    onChangeText={(t) => f.setter(t.replace(/\D/g, "").slice(0, 4))}
                    keyboardType="number-pad"
                    secureTextEntry={!showPin}
                    placeholder="••••"
                    placeholderTextColor={colors.textDim}
                    maxLength={4}
                    testID={f.testID}
                  />
                  {i === 2 && (
                    <TouchableOpacity onPress={() => setShowPin(v => !v)} style={s.pinToggle}>
                      <Ionicons name={showPin ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
            <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <Button label="Cancel" variant="secondary" onPress={() => {
                  setPinModal(false); setCurrentPin(""); setNewPin(""); setConfirmPin(""); setShowPin(false);
                }} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Change PIN" onPress={handleChangePin} loading={savingPin} testID="save-pin-btn" />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Payout modal */}
      <Modal visible={payoutModal} transparent animationType="slide" onRequestClose={() => setPayoutModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <View style={[s.modalIconWrap, {
              backgroundColor: payoutType === "self" ? colors.cyanDim : "rgba(160,100,255,0.15)"
            }]}>
              <Ionicons name={payoutType === "self" ? "person-outline" : "car-outline"} size={26}
                color={payoutType === "self" ? colors.cyan : "#A064FF"} />
            </View>
            <Text style={s.modalTitle}>{payoutType === "self" ? "My Account" : "Owner Account"}</Text>
            <Text style={s.modalSub}>
              {payoutType === "self"
                ? "Your personal bank account for CashUp payouts."
                : "The vehicle owner account for CashUp payments."}
            </Text>
            <Text style={s.inputLabel}>BANK</Text>
            <TouchableOpacity
              style={[s.textInput, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}
              onPress={() => setShowBankPicker(true)}>
              <Text style={{ color: payoutBank ? colors.text : colors.textDim, fontSize: 15 }}>
                {payoutBank || "Select your bank"}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.textDim} />
            </TouchableOpacity>
            <Text style={s.inputLabel}>ACCOUNT NUMBER</Text>
            <TextInput style={s.textInput} value={payoutAccount}
              onChangeText={(t) => setPayoutAccount(t.replace(/\D/g, ""))}
              placeholder="e.g. 1234567890" placeholderTextColor={colors.textDim}
              keyboardType="number-pad" testID="payout-account-input" />
            <Text style={s.inputLabel}>ACCOUNT NAME (optional)</Text>
            <TextInput style={s.textInput} value={payoutName} onChangeText={setPayoutName}
              placeholder="e.g. John Doe" placeholderTextColor={colors.textDim} testID="payout-name-input" />
            <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
              <View style={{ flex: 1 }}>
                <Button label="Cancel" variant="secondary" onPress={() => {
                  setPayoutModal(false); setPayoutBank(""); setPayoutAccount(""); setPayoutName("");
                }} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Save Account" onPress={handleSavePayout} loading={savingPayout} testID="save-payout-btn" />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Bank picker */}
      <Modal visible={showBankPicker} transparent animationType="slide" onRequestClose={() => setShowBankPicker(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { maxHeight: "70%" }]}>
            <View style={s.modalHandle} />
            <Text style={[s.modalTitle, { marginBottom: 16 }]}>Select Bank</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {SA_BANKS.map(bank => (
                <TouchableOpacity
                  key={bank}
                  style={[s.bankOption, payoutBank === bank && s.bankOptionActive]}
                  onPress={() => { setPayoutBank(bank); setShowBankPicker(false); }}>
                  <Text style={[s.bankOptionText, payoutBank === bank && { color: colors.cyan }]}>{bank}</Text>
                  {payoutBank === bank && <Ionicons name="checkmark" size={18} color={colors.cyan} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const Row: React.FC<{
  icon: any; label: string; sub?: string; onPress: () => void; testID?: string; colors: any;
}> = ({ icon, label, sub, onPress, testID, colors }) => (
  <TouchableOpacity
    style={{
      flexDirection: "row", alignItems: "center",
      backgroundColor: colors.bg2, borderRadius: radius.md,
      borderWidth: 1, borderColor: colors.border,
      padding: 16, gap: 12, marginBottom: 10,
    }}
    onPress={onPress} testID={testID} activeOpacity={0.7}>
    <Ionicons name={icon} size={20} color={colors.cyan} />
    <View style={{ flex: 1 }}>
      <Text style={{ color: colors.text, fontWeight: "600", fontSize: 15 }}>{label}</Text>
      {sub && <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{sub}</Text>}
    </View>
    <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
  </TouchableOpacity>
);

const makeStyles = (colors: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { alignItems: "center", marginBottom: 8 },
  logo: { width: 80, height: 40 },
  card: { backgroundColor: colors.bg2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, alignItems: "center", padding: 24, marginBottom: 8 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.cyanDim, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.cyan, marginBottom: 12, overflow: "hidden", position: "relative" },
  verifiedBadge: { position: "absolute", bottom: 0, right: 0, backgroundColor: colors.bg2, borderRadius: 10, padding: 1 },
  name: { color: colors.text, fontSize: 20, fontWeight: "800" },
  phone: { color: colors.textMuted, fontSize: 14, marginTop: 2 },
  rolePill: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8, backgroundColor: colors.cyanDim, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.cyan },
  rolePillText: { color: colors.cyan, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  section: { color: colors.textMuted, fontSize: 12, fontWeight: "700", letterSpacing: 1.4, marginTop: 24, marginBottom: 12 },
  kycRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1.5, padding: 14, gap: 12, marginBottom: 4 },
  kycIconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  kycTitle: { color: colors.text, fontWeight: "700", fontSize: 14 },
  kycStatusText: { fontSize: 12, fontWeight: "700", marginTop: 2 },
  kycHintText: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  plateCard: { backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 4, marginTop: 16 },
  plateLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4 },
  plateBox: { marginTop: 10, borderRadius: radius.sm, borderWidth: 1, padding: 14, alignItems: "center" },
  plateValue: { fontSize: 20, fontWeight: "800", letterSpacing: 2 },
  plateInput: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.cyan, borderRadius: radius.sm, color: colors.text, fontSize: 18, fontWeight: "700", padding: 12, marginTop: 10, textAlign: "center", letterSpacing: 2 },
  payoutInfo: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: colors.cyanDim, borderRadius: radius.sm, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: colors.cyan + "30" },
  payoutInfoText: { color: colors.textMuted, fontSize: 12, flex: 1, lineHeight: 18 },
  payoutRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 12, marginBottom: 10 },
  payoutIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  payoutLabel: { color: colors.text, fontWeight: "700", fontSize: 14 },
  payoutSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  payoutEmpty: { color: colors.textDim, fontSize: 12, marginTop: 2, fontStyle: "italic" },
  themeCard: { backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 4 },
  themeLabel: { color: colors.text, fontWeight: "600", fontSize: 15 },
  whatsappRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#128C7E", borderRadius: radius.md, padding: 16, gap: 12, marginBottom: 10 },
  whatsappIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  whatsappLabel: { flex: 1, color: "#fff", fontWeight: "700", fontSize: 15 },
  signout: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 16, borderWidth: 1, borderColor: colors.red + "40", borderRadius: radius.md, backgroundColor: colors.red + "10" },
  signoutText: { color: colors.red, fontWeight: "700", fontSize: 15 },
  brand: { color: colors.textDim, fontSize: 12, textAlign: "center", marginTop: 16, marginBottom: 4 },
  version: { color: colors.textDim, fontSize: 11, textAlign: "center", marginBottom: 8 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: colors.bg2, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, borderTopWidth: 1, borderColor: colors.border },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 20 },
  modalIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: "800", textAlign: "center" },
  modalSub: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginTop: 4, marginBottom: 20 },
  inputLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, marginBottom: 6, marginTop: 12 },
  pinRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pinInput: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, color: colors.text, fontSize: 22, fontWeight: "700", padding: 14, textAlign: "center", letterSpacing: 8, marginBottom: 4 },
  pinToggle: { padding: 14, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, marginBottom: 4 },
  textInput: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, color: colors.text, fontSize: 15, padding: 14 },
  bankOption: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  bankOptionActive: { backgroundColor: colors.cyanDim, borderRadius: radius.sm, paddingHorizontal: 8 },
  bankOptionText: { color: colors.text, fontSize: 15, fontWeight: "600" },
});
