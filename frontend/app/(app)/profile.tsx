import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Alert, TextInput, Modal, ActivityIndicator,
  Platform, Linking, Share, Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useNavigation, useFocusEffect } from "expo-router";
import { CommonActions } from "@react-navigation/native";
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
  const navigation = useNavigation();
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
  const [safetyProfileComplete, setSafetyProfileComplete] = useState<boolean | null>(null);

  const [deadManCodeSet, setDeadManCodeSet] = useState(false);
  const [deadManModal, setDeadManModal] = useState(false);
  const [deadManCode, setDeadManCode] = useState("");
  const [deadManCodeConfirm, setDeadManCodeConfirm] = useState("");
  const [deadManCurrentPin, setDeadManCurrentPin] = useState("");
  const [deadManSaving, setDeadManSaving] = useState(false);
  const [deadManResetRequest, setDeadManResetRequest] = useState<{ id: string; status: string; reason: string; admin_reason?: string; created_at: string } | null>(null);
  const [deadManResetModal, setDeadManResetModal] = useState(false);
  const [deadManResetReason, setDeadManResetReason] = useState("");
  const [deadManResetSubmitting, setDeadManResetSubmitting] = useState(false);

  const [passengerTrip, setPassengerTrip] = useState<any | null>(null);
  const [sharingLocation, setSharingLocation] = useState(false);

  const [associations, setAssociations] = useState<{ id: string; name: string; city?: string; province?: string }[]>([]);
  const [assocId, setAssocId] = useState<string | null>(null);
  const [assocModal, setAssocModal] = useState(false);
  const [savingAssoc, setSavingAssoc] = useState(false);

  useEffect(() => {
    if (state.status === "authed") {
      if (state.user.role === "driver") {
        setPlate(state.user.vehicle_plate || "");
        loadPayoutAccounts();
        api.getTaxiAssociations().then(r => {
          setAssociations(r.associations);
          setAssocId(r.my_association_id);
        }).catch(() => {});
      }
      if (state.user.role === "driver" || state.user.role === "owner") {
        loadKycStatus();
      }
      if (state.user.role === "passenger") {
        api.tripsPassengerCurrent().then(r => setPassengerTrip(r?.trip ?? null)).catch(() => {});
      }
      api.safetyProfile().then(p => {
        setSafetyProfileComplete(!!p?.profile_complete);
        setDeadManCodeSet(!!p?.dead_man_code_set);
      }).catch(() => {});
      api.getDeadManResetStatus().then(r => setDeadManResetRequest(r?.request ?? null)).catch(() => {});
    }
  }, [state]);

  useFocusEffect(useCallback(() => {
    if (state.status === "authed") {
      api.safetyProfile().then(p => {
        setSafetyProfileComplete(!!p?.profile_complete);
        setDeadManCodeSet(!!p?.dead_man_code_set);
      }).catch(() => {});
      api.getDeadManResetStatus().then(r => setDeadManResetRequest(r?.request ?? null)).catch(() => {});
    }
  }, [state.status]));

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

  const handleShareLocation = async () => {
    if (!passengerTrip?.id || sharingLocation) return;
    setSharingLocation(true);
    try {
      const res = await api.tripsShare({ trip_id: passengerTrip.id });
      await Share.share({
        message: `I am in a Tag n Ride trip right now.\nTrack my journey for my safety 📍\n${res.share_url}${passengerTrip.vehicle_plate ? `\nVehicle: ${passengerTrip.vehicle_plate}` : ""}`,
        url: res.share_url,
      });
    } catch (e: any) {
      if ((e as any)?.message !== "User did not share") {
        Alert.alert("Could not generate link", e?.message || "Try again");
      }
    } finally {
      setSharingLocation(false);
    }
  };

  const saveAssociation = async (selectedId: string | null) => {
    setSavingAssoc(true);
    try {
      await api.updateMyAssociation(selectedId);
      setAssocId(selectedId);
      setAssocModal(false);
      Alert.alert("Saved", selectedId
        ? `You are now linked to ${associations.find(a => a.id === selectedId)?.name}`
        : "Association removed");
    } catch (e: any) {
      Alert.alert("Could not save", e?.message || "");
    } finally { setSavingAssoc(false); }
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

  const handleSignOut = async () => {
    await signOut();
    if (Platform.OS === "web") { window.location.replace("/"); return; }
    navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: "(auth)", state: { routes: [{ name: "welcome" }] } }] }));
  };

  const confirmLogout = () => {
    if (Platform.OS === "web") { handleSignOut(); return; }
    Alert.alert("Sign out?", "You will need to sign back in to use Tag n Ride.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: handleSignOut },
    ]);
  };

  const openWhatsApp = () => {
    Linking.openURL(WHATSAPP_URL).catch(() => {
      Alert.alert("WhatsApp not available", "Please contact us at support@tagnride.app");
    });
  };

  const handleSaveDeadManCode = async () => {
    if (deadManCode.length < 4 || !/^\d+$/.test(deadManCode)) {
      Alert.alert("Invalid", "Dead man code must be 4–6 digits."); return;
    }
    if (deadManCode !== deadManCodeConfirm) {
      Alert.alert("Mismatch", "Codes do not match."); return;
    }
    if (!deadManCurrentPin) {
      Alert.alert("PIN required", "Enter your current account PIN to confirm."); return;
    }
    if (deadManCode === deadManCurrentPin) {
      Alert.alert("Invalid", "Dead man code must be different from your real PIN."); return;
    }
    setDeadManSaving(true);
    try {
      await api.setDeadManCode({ dead_man_code: deadManCode, current_pin: deadManCurrentPin });
      setDeadManCodeSet(true);
      setDeadManModal(false);
      setDeadManCode(""); setDeadManCodeConfirm(""); setDeadManCurrentPin("");
      Alert.alert("Dead Man Code Set", "Saved securely. If you enter this code instead of your real PIN when cancelling an SOS, it will appear cancelled but your location keeps being tracked silently.");
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Could not save code.");
    } finally { setDeadManSaving(false); }
  };

  const handleSubmitDeadManReset = async () => {
    if (deadManResetReason.trim().length < 10) {
      Alert.alert("Too short", "Please provide a detailed reason (at least 10 characters)."); return;
    }
    setDeadManResetSubmitting(true);
    try {
      await api.requestDeadManReset(deadManResetReason.trim());
      const res = await api.getDeadManResetStatus();
      setDeadManResetRequest(res.request);
      setDeadManResetModal(false);
      setDeadManResetReason("");
      Alert.alert("Request Submitted", "Your dead man code reset request has been sent to an admin for review. You will be notified once it is processed.");
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Could not submit request.");
    } finally { setDeadManResetSubmitting(false); }
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

        {/* Taxi Association */}
        {isDriver && (
          <>
            <Text style={s.section}>TAXI ASSOCIATION</Text>
            <TouchableOpacity
              style={[s.payoutRow, {
                borderColor: assocId ? colors.cyan + "60" : colors.border,
                borderWidth: assocId ? 1.5 : 1,
              }]}
              onPress={() => setAssocModal(true)}
              activeOpacity={0.7}
              testID="assoc-btn">
              <View style={[s.payoutIcon, { backgroundColor: assocId ? colors.cyanDim : colors.bg2 }]}>
                <Ionicons name="business-outline" size={18} color={assocId ? colors.cyan : colors.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.payoutLabel}>My Taxi Association</Text>
                {assocId
                  ? <Text style={s.payoutSub}>{associations.find(a => a.id === assocId)?.name || "Linked"}</Text>
                  : <Text style={s.payoutEmpty}>Not set — tap to select</Text>}
              </View>
              <Ionicons name={assocId ? "checkmark-circle" : "add-circle-outline"} size={20}
                color={assocId ? colors.cyan : colors.textMuted} />
            </TouchableOpacity>
          </>
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

        {/* SafeRide Profile row */}
        <TouchableOpacity
          style={{
            flexDirection: "row", alignItems: "center",
            backgroundColor: colors.bg2, borderRadius: 10,
            borderWidth: 1.5,
            borderColor: safetyProfileComplete === false ? "#FFD60A60" : safetyProfileComplete ? colors.green + "40" : colors.border,
            padding: 16, gap: 12, marginBottom: 10,
          }}
          onPress={() => router.push("/(app)/safety")}
          testID="row-saferide"
          activeOpacity={0.7}>
          <Ionicons name="shield-checkmark-outline" size={20} color={safetyProfileComplete ? colors.green : "#FFD60A"} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: "600", fontSize: 15 }}>SafeRide Profile</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>Emergency contacts and safety info</Text>
          </View>
          {safetyProfileComplete === false && (
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#FFD60A", marginRight: 4 }} />
          )}
          {safetyProfileComplete === true && (
            <Ionicons name="checkmark-circle" size={18} color={colors.green} />
          )}
          <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
        </TouchableOpacity>

        {isPassenger && passengerTrip && (
          <TouchableOpacity
            style={{
              flexDirection: "row", alignItems: "center",
              backgroundColor: colors.bg2, borderRadius: 10,
              borderWidth: 1.5, borderColor: colors.cyan + "40",
              padding: 16, gap: 12, marginBottom: 10,
            }}
            onPress={handleShareLocation}
            disabled={sharingLocation}
            activeOpacity={0.7}>
            {sharingLocation
              ? <ActivityIndicator size="small" color={colors.cyan} />
              : <Ionicons name="location-outline" size={20} color={colors.cyan} />}
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: "600", fontSize: 15 }}>Share Live Location</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                {passengerTrip.vehicle_plate
                  ? `Vehicle ${passengerTrip.vehicle_plate} · Tap to send tracking link`
                  : "Tap to send tracking link to family"}
              </Text>
            </View>
            {!sharingLocation && <Ionicons name="share-outline" size={18} color={colors.cyan} />}
          </TouchableOpacity>
        )}

        {isDriver && (
          <Row icon="car-outline" label="Trip Centre"
            sub="Start and manage SafeRide trips"
            onPress={() => router.push("/(app)/trip-centre")} testID="row-tripcentre" colors={colors} />
        )}

        <Row icon="notifications-outline" label="Inbox"
          sub="Alerts and documents"
          onPress={() => router.push("/(app)/notifications")} testID="row-inbox" colors={colors} />
        {isPassenger && (
          <Row icon="add-circle-outline" label="Top up wallet"
            onPress={() => router.push("/topup")} testID="row-topup" colors={colors} />
        )}
        <Row icon="receipt-outline" label="Transaction history"
          onPress={() => router.push("/(app)/transactions")} testID="row-history" colors={colors} />
        <Row icon="alert-circle-outline" label="My Disputes"
          sub="Raise or track a payment dispute"
          onPress={() => router.push("/(app)/transactions")} testID="row-disputes" colors={colors} />
        {(isDriver || isPassenger) && (
          <PayslipStatementRow
            isDriver={isDriver}
            colors={colors}
            onPress={() => router.push(isDriver ? "/(app)/payslip" : "/(app)/statement")}
          />
        )}
        <Row icon="lock-closed-outline" label="Change PIN"
          onPress={() => setPinModal(true)} testID="row-change-pin" colors={colors} />

        {/* Emergency Safety */}
        <Text style={s.section}>EMERGENCY SAFETY</Text>
        <View style={[s.deadManCard, { backgroundColor: colors.bg2, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.redDim, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="shield-half-outline" size={20} color={colors.red} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>Dead Man Code</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2, lineHeight: 17 }}>
                A secret code you enter instead of your real PIN when cancelling an SOS under duress. It appears to cancel but silently keeps tracking your location and alerts our team.
              </Text>
            </View>
          </View>
          {deadManCodeSet ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <Ionicons name="checkmark-circle" size={15} color={colors.green} />
              <Text style={{ color: colors.green, fontWeight: "700", fontSize: 13 }}>Dead man code is set</Text>
            </View>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <Ionicons name="warning-outline" size={15} color={colors.red} />
              <Text style={{ color: colors.red, fontWeight: "700", fontSize: 13 }}>No dead man code set</Text>
            </View>
          )}
          <TouchableOpacity
            style={[s.deadManBtn, { borderColor: colors.red + "60", backgroundColor: colors.redDim }]}
            onPress={() => { setDeadManCode(""); setDeadManCodeConfirm(""); setDeadManCurrentPin(""); setDeadManModal(true); }}>
            <Ionicons name="key-outline" size={15} color={colors.red} />
            <Text style={{ color: colors.red, fontWeight: "700", fontSize: 13 }}>
              {deadManCodeSet ? "Change Dead Man Code" : "Set Dead Man Code"}
            </Text>
          </TouchableOpacity>

          {deadManResetRequest?.status === "pending" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, padding: 10, borderRadius: 8, backgroundColor: colors.bg }}>
              <Ionicons name="time-outline" size={14} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}>Reset request pending admin review</Text>
            </View>
          ) : deadManResetRequest?.status === "approved" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, padding: 10, borderRadius: 8, backgroundColor: colors.greenDim }}>
              <Ionicons name="checkmark-circle-outline" size={14} color={colors.green} />
              <Text style={{ color: colors.green, fontSize: 12, flex: 1 }}>Reset approved — set your new dead man code above</Text>
            </View>
          ) : deadManResetRequest?.status === "rejected" ? (
            <View style={{ marginTop: 10, padding: 10, borderRadius: 8, backgroundColor: colors.redDim }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <Ionicons name="close-circle-outline" size={14} color={colors.red} />
                <Text style={{ color: colors.red, fontSize: 12, fontWeight: "700" }}>Reset request rejected</Text>
              </View>
              {!!deadManResetRequest.admin_reason && (
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>Reason: {deadManResetRequest.admin_reason}</Text>
              )}
            </View>
          ) : (
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, padding: 10, borderRadius: 8, backgroundColor: colors.bg }}
              onPress={() => { setDeadManResetReason(""); setDeadManResetModal(true); }}>
              <Ionicons name="refresh-outline" size={14} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Forgot your code? Request a reset</Text>
            </TouchableOpacity>
          )}
        </View>

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

      {/* Dead Man Code modal */}
      <Modal visible={deadManModal} transparent animationType="slide" onRequestClose={() => setDeadManModal(false)}>
        <Pressable style={s.modalOverlay} onPress={() => setDeadManModal(false)}>
          <Pressable style={s.modalSheet} onPress={() => {}}>
            <View style={s.modalHandle} />
            <View style={[s.modalIconWrap, { backgroundColor: colors.redDim, borderColor: colors.red + "40" }]}>
              <Ionicons name="shield-half-outline" size={26} color={colors.red} />
            </View>
            <Text style={s.modalTitle}>Dead Man Code</Text>
            <Text style={s.modalSub}>
              Enter this code instead of your real PIN when cancelling an SOS if you are under duress.
              It looks like a cancel but your location keeps being tracked silently.{"\n\n"}
              Keep it secret — never share it with anyone.
            </Text>
            <Text style={s.inputLabel}>NEW DEAD MAN CODE (4–6 digits)</Text>
            <TextInput
              style={[s.textInput, { borderColor: colors.red + "60", marginBottom: 16 }]}
              value={deadManCode}
              onChangeText={setDeadManCode}
              placeholder="e.g. 9999"
              placeholderTextColor={colors.textDim}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
            />
            <Text style={s.inputLabel}>CONFIRM CODE</Text>
            <TextInput
              style={[s.textInput, { borderColor: deadManCodeConfirm && deadManCode !== deadManCodeConfirm ? colors.red : colors.red + "60", marginBottom: 4 }]}
              value={deadManCodeConfirm}
              onChangeText={setDeadManCodeConfirm}
              placeholder="Repeat code"
              placeholderTextColor={colors.textDim}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
            />
            {deadManCodeConfirm.length > 0 && deadManCode !== deadManCodeConfirm && (
              <Text style={{ color: colors.red, fontSize: 11, marginBottom: 8 }}>Codes do not match</Text>
            )}
            <Text style={[s.inputLabel, { marginTop: 8 }]}>YOUR CURRENT ACCOUNT PIN</Text>
            <TextInput
              style={[s.textInput, { marginBottom: 16 }]}
              value={deadManCurrentPin}
              onChangeText={setDeadManCurrentPin}
              placeholder="Your regular 4-digit PIN"
              placeholderTextColor={colors.textDim}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
            />
            <TouchableOpacity
              style={[s.signout, { marginTop: 4, backgroundColor: colors.redDim, borderColor: colors.red, opacity: deadManSaving ? 0.6 : 1 }]}
              onPress={handleSaveDeadManCode}
              disabled={deadManSaving}>
              {deadManSaving
                ? <ActivityIndicator color={colors.red} size="small" />
                : <><Ionicons name="key-outline" size={18} color={colors.red} /><Text style={s.signoutText}>Save Dead Man Code</Text></>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setDeadManModal(false)} style={{ alignItems: "center", paddingVertical: 12 }}>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Dead Man Reset Request modal */}
      <Modal visible={deadManResetModal} transparent animationType="slide" onRequestClose={() => setDeadManResetModal(false)}>
        <Pressable style={s.modalOverlay} onPress={() => setDeadManResetModal(false)}>
          <Pressable style={s.modalSheet} onPress={() => {}}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Request Code Reset</Text>
            <Text style={s.modalSub}>
              If you have forgotten your dead man code, an admin can clear it so you can set a new one.
              You must provide a reason — this request will be reviewed and reported to senior management.
            </Text>
            <Text style={s.inputLabel}>REASON FOR RESET REQUEST</Text>
            <TextInput
              style={[s.textInput, { height: 90, textAlignVertical: "top", marginBottom: 4 }]}
              value={deadManResetReason}
              onChangeText={setDeadManResetReason}
              placeholder="Explain why you need to reset your dead man code..."
              placeholderTextColor={colors.textDim}
              multiline
              maxLength={500}
            />
            <Text style={{ color: colors.textMuted, fontSize: 11, textAlign: "right", marginBottom: 16 }}>{deadManResetReason.length}/500</Text>
            <TouchableOpacity
              style={[s.signout, { backgroundColor: colors.redDim, borderColor: colors.red, opacity: deadManResetSubmitting ? 0.6 : 1 }]}
              onPress={handleSubmitDeadManReset}
              disabled={deadManResetSubmitting}>
              {deadManResetSubmitting
                ? <ActivityIndicator color={colors.red} size="small" />
                : <><Ionicons name="send-outline" size={18} color={colors.red} /><Text style={s.signoutText}>Submit Reset Request</Text></>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setDeadManResetModal(false)} style={{ alignItems: "center", paddingVertical: 12 }}>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Taxi association picker */}
      <Modal visible={assocModal} transparent animationType="slide" onRequestClose={() => setAssocModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { maxHeight: "75%" }]}>
            <View style={s.modalHandle} />
            <View style={[s.modalIconWrap, { backgroundColor: colors.cyanDim }]}>
              <Ionicons name="business-outline" size={26} color={colors.cyan} />
            </View>
            <Text style={s.modalTitle}>Taxi Association</Text>
            <Text style={s.modalSub}>Select the association you drive under. Your admin will use this for monthly payments.</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                style={[s.bankOption, !assocId && s.bankOptionActive]}
                onPress={() => saveAssociation(null)}
                disabled={savingAssoc}>
                <Text style={[s.bankOptionText, !assocId && { color: colors.cyan }]}>— None / Independent —</Text>
                {!assocId && <Ionicons name="checkmark" size={18} color={colors.cyan} />}
              </TouchableOpacity>
              {associations.map(assoc => (
                <TouchableOpacity
                  key={assoc.id}
                  style={[s.bankOption, assocId === assoc.id && s.bankOptionActive]}
                  onPress={() => saveAssociation(assoc.id)}
                  disabled={savingAssoc}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.bankOptionText, assocId === assoc.id && { color: colors.cyan }]}>{assoc.name}</Text>
                    {(assoc.city || assoc.province) && (
                      <Text style={{ color: colors.textMuted, fontSize: 11 }}>{[assoc.city, assoc.province].filter(Boolean).join(", ")}</Text>
                    )}
                  </View>
                  {assocId === assoc.id && <Ionicons name="checkmark" size={18} color={colors.cyan} />}
                  {savingAssoc && assocId !== assoc.id && null}
                </TouchableOpacity>
              ))}
              {associations.length === 0 && (
                <Text style={{ color: colors.textMuted, textAlign: "center", padding: 20, fontSize: 13 }}>
                  No associations available yet
                </Text>
              )}
            </ScrollView>
            {savingAssoc && <ActivityIndicator color={colors.cyan} style={{ marginTop: 12 }} />}
            <TouchableOpacity onPress={() => setAssocModal(false)} style={{ alignItems: "center", paddingVertical: 14 }}>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>Cancel</Text>
            </TouchableOpacity>
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

const PayslipStatementRow: React.FC<{
  isDriver: boolean; colors: any; onPress: () => void;
}> = ({ isDriver, colors, onPress }) => (
  <TouchableOpacity
    style={{
      flexDirection: "row", alignItems: "center",
      backgroundColor: colors.bg2, borderRadius: radius.md,
      borderWidth: 1.5, borderColor: colors.cyan + "40",
      padding: 16, gap: 12, marginBottom: 10,
    }}
    onPress={onPress}
    testID="row-payslip-statement"
    activeOpacity={0.7}>
    <View style={{
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: colors.cyanDim,
      alignItems: "center", justifyContent: "center",
    }}>
      <Ionicons name="document-text-outline" size={20} color={colors.cyan} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>
        {isDriver ? "Payslip & Statement" : "Expense Statement"}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
        {isDriver
          ? "Download your earnings payslip"
          : "Download your expense statement"}
      </Text>
    </View>
    <Ionicons name="chevron-forward" size={16} color={colors.cyan} />
  </TouchableOpacity>
);

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
  deadManCard: { borderRadius: radius.md, borderWidth: 1, padding: 16, marginBottom: 8 },
  deadManBtn: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radius.md, borderWidth: 1, padding: 12, alignSelf: "flex-start" },
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
