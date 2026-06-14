import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput, Modal, ActivityIndicator, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/AuthContext";
import { useTheme } from "../../src/ThemeContext";
import { api } from "../../src/api";
import { formatZAR, radius } from "../../src/theme";
import { Button } from "../../src/ui";

const BANKS = ["Capitec", "FNB", "Absa", "Nedbank", "Standard Bank", "TymeBank", "African Bank", "Investec", "Other"];

export default function OwnerProfile() {
  const { state, signOut } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();

  // Bank / cashup
  const [bankData, setBankData] = useState<any>(null);
  const [bankModal, setBankModal] = useState(false);
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [saving, setSaving] = useState(false);
  const [cashupMethod, setCashupMethod] = useState<"wallet" | "bank">("wallet");
  const [savingMethod, setSavingMethod] = useState(false);

  // Wallet / payout
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [payOutModal, setPayOutModal] = useState(false);
  const [payOutAmount, setPayOutAmount] = useState("");
  const [payOutLoading, setPayOutLoading] = useState(false);
  const [payOutFee, setPayOutFee] = useState<{ gateway_fee: number; total_deducted: number } | null>(null);
  const [payOutFeeLoading, setPayOutFeeLoading] = useState(false);

  // Subscription
  const [subscription, setSubscription] = useState<any>(null);

  // Change password
  const [pwModal, setPwModal] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  // Change PIN
  const [pinModal, setPinModal] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [changingPin, setChangingPin] = useState(false);

  // Dead man code
  const [deadManCodeSet, setDeadManCodeSet] = useState(false);
  const [deadManModal, setDeadManModal] = useState(false);
  const [deadManCode, setDeadManCode] = useState("");
  const [deadManCodeConfirm, setDeadManCodeConfirm] = useState("");
  const [deadManCurrentPin, setDeadManCurrentPin] = useState("");
  const [deadManSaving, setDeadManSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [bankRes, walletRes, subRes, safetyRes] = await Promise.all([
        api.ownerGetBank(),
        api.ownerWallet().catch(() => null),
        api.ownerSubscription().catch(() => null),
        api.safetyProfile().catch(() => null),
      ]);
      setBankData(bankRes);
      setCashupMethod(bankRes.cashup_method || "wallet");
      if (bankRes.bank_name) {
        setBankName(bankRes.bank_name || "");
        setAccountNumber(bankRes.account_number || "");
        setAccountName(bankRes.account_name || "");
      }
      if (walletRes) setWalletBalance(walletRes.balance ?? null);
      if (subRes) setSubscription(subRes.subscription);
      if (safetyRes) setDeadManCodeSet(!!safetyRes.dead_man_code_set);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (state.status !== "authed") return null;
  const user = state.user;

  const fetchPayOutFee = useCallback(async (amountStr: string) => {
    const amount = parseFloat(amountStr);
    if (!amountStr || isNaN(amount) || amount <= 0) { setPayOutFee(null); return; }
    setPayOutFeeLoading(true);
    try {
      const res = await api.ownerPayoutFee(amount);
      setPayOutFee({ gateway_fee: res.gateway_fee, total_deducted: res.total_deducted });
    } catch { setPayOutFee(null); }
    finally { setPayOutFeeLoading(false); }
  }, []);

  const handlePayOut = async () => {
    const amount = parseFloat(payOutAmount);
    if (!payOutAmount || isNaN(amount) || amount <= 0) { Alert.alert("Invalid amount", "Please enter a valid amount."); return; }
    if (amount < 5) { Alert.alert("Minimum", "Minimum payout is R5.00."); return; }
    const totalNeeded = payOutFee ? payOutFee.total_deducted : amount;
    if (walletBalance !== null && totalNeeded > walletBalance) {
      Alert.alert("Insufficient balance", `You need ${formatZAR(totalNeeded)} (incl. gateway fee). Your balance is ${formatZAR(walletBalance)}.`); return;
    }
    if (!bankData?.bank_name) { Alert.alert("No bank account", "Please add your banking details first."); return; }
    setPayOutLoading(true);
    try {
      const res = await api.ownerPayout(amount);
      setPayOutModal(false); setPayOutAmount(""); setPayOutFee(null);
      const msg = res.pending_approval
        ? `${formatZAR(res.net_to_bank)} submitted for processing.\nGateway fee: ${formatZAR(res.gateway_fee)}\nTotal deducted: ${formatZAR(res.total_deducted)}`
        : `${formatZAR(res.net_to_bank)} sent to ${bankData.bank_name}.\nGateway fee: ${formatZAR(res.gateway_fee)}`;
      Alert.alert("Payout Submitted", msg);
      load();
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Could not process payout.");
    } finally { setPayOutLoading(false); }
  };

  const handleSaveBank = async () => {
    if (!bankName || !accountNumber) { Alert.alert("Required", "Please enter bank name and account number."); return; }
    setSaving(true);
    try {
      await api.ownerSaveBank({ bank_name: bankName, account_number: accountNumber, account_name: accountName });
      setBankModal(false);
      load();
      Alert.alert("Saved", "Banking details saved.");
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not save banking details.");
    } finally { setSaving(false); }
  };

  const handleSetCashupMethod = async (method: "wallet" | "bank") => {
    if (method === "bank" && !bankData?.bank_name) {
      Alert.alert("No bank account", "Please add your bank account details first."); return;
    }
    setSavingMethod(true);
    try {
      await api.ownerSetCashupMethod(method);
      setCashupMethod(method);
      load();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not update preference.");
    } finally { setSavingMethod(false); }
  };

  const handleChangePassword = async () => {
    if (!currentPw) { Alert.alert("Required", "Enter your current password."); return; }
    if (newPw.length < 8) { Alert.alert("Too short", "New password must be at least 8 characters."); return; }
    if (newPw !== confirmPw) { Alert.alert("Mismatch", "New passwords do not match."); return; }
    if (newPw === currentPw) { Alert.alert("Invalid", "New password must be different from current."); return; }
    setChangingPw(true);
    try {
      await api.ownerChangePassword({ current_password: currentPw, new_password: newPw });
      setPwModal(false);
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      Alert.alert("Password Changed", "Your login password has been updated.");
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Could not change password.");
    } finally { setChangingPw(false); }
  };

  const handleChangePin = async () => {
    if (currentPin.length !== 4) { Alert.alert("Required", "Enter your current 4-digit PIN."); return; }
    if (newPin.length !== 4) { Alert.alert("Required", "Enter a new 4-digit PIN."); return; }
    if (newPin !== confirmPin) { Alert.alert("Mismatch", "New PINs do not match."); return; }
    if (newPin === currentPin) { Alert.alert("Invalid", "New PIN must be different from current."); return; }
    setChangingPin(true);
    try {
      await api.changePin({ current_pin: currentPin, new_pin: newPin });
      setPinModal(false);
      setCurrentPin(""); setNewPin(""); setConfirmPin("");
      Alert.alert("PIN Changed", "Your security PIN has been updated.");
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Could not change PIN.");
    } finally { setChangingPin(false); }
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

  const styles = makeStyles(colors);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text style={styles.title}>Profile</Text>

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Ionicons name="business" size={36} color={colors.cyan} />
          </View>
          <Text style={styles.name}>{user.full_name}</Text>
          <Text style={styles.phone}>{user.email || user.phone_number || ""}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>FLEET OWNER</Text>
          </View>
        </View>

        {/* Cashup method */}
        <Text style={styles.section}>CASHUP PREFERENCES</Text>
        <View style={styles.methodCard}>
          <Text style={styles.methodTitle}>Driver Cash-Up Method</Text>
          <Text style={styles.methodSub}>Choose where drivers send their daily cash-up</Text>
          <View style={styles.methodRow}>
            <TouchableOpacity style={[styles.methodBtn, cashupMethod === "wallet" && styles.methodBtnActive]}
              onPress={() => handleSetCashupMethod("wallet")} disabled={savingMethod}>
              <Ionicons name="wallet-outline" size={18} color={cashupMethod === "wallet" ? colors.bg : colors.textMuted} />
              <View>
                <Text style={[styles.methodBtnTitle, cashupMethod === "wallet" && styles.methodBtnTitleActive]}>Wallet</Text>
                <Text style={[styles.methodBtnSub, cashupMethod === "wallet" && { color: colors.bg + "CC" }]}>Free · Instant</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.methodBtn, cashupMethod === "bank" && styles.methodBtnActive]}
              onPress={() => handleSetCashupMethod("bank")} disabled={savingMethod}>
              <Ionicons name="business-outline" size={18} color={cashupMethod === "bank" ? colors.bg : colors.textMuted} />
              <View>
                <Text style={[styles.methodBtnTitle, cashupMethod === "bank" && styles.methodBtnTitleActive]}>Bank Account</Text>
                <Text style={[styles.methodBtnSub, cashupMethod === "bank" && { color: colors.bg + "CC" }]}>R3.50 fee · Instant</Text>
              </View>
            </TouchableOpacity>
          </View>
          {cashupMethod === "bank" && !bankData?.bank_name && (
            <View style={styles.warningNote}>
              <Ionicons name="warning-outline" size={14} color="#FFD60A" />
              <Text style={styles.warningText}>Add bank account below to enable bank cashups</Text>
            </View>
          )}
        </View>

        {/* Banking details */}
        <Text style={[styles.section, { marginTop: 24 }]}>BANKING DETAILS</Text>
        {bankData?.bank_name ? (
          <View style={styles.bankCard}>
            <View style={styles.bankCardLeft}>
              <View style={styles.bankIcon}>
                <Ionicons name="card-outline" size={20} color={colors.cyan} />
              </View>
              <View>
                <Text style={styles.bankName}>{bankData.bank_name}</Text>
                <Text style={styles.bankAccount}>**** {bankData.account_number?.slice(-4)}</Text>
                {bankData.account_name && <Text style={styles.bankHolder}>{bankData.account_name}</Text>}
              </View>
            </View>
            <TouchableOpacity onPress={() => setBankModal(true)} style={styles.editBtn}>
              <Ionicons name="pencil-outline" size={16} color={colors.cyan} />
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.addBankBtn} onPress={() => setBankModal(true)}>
            <Ionicons name="add-circle-outline" size={20} color={colors.cyan} />
            <Text style={styles.addBankText}>Add Banking Details</Text>
          </TouchableOpacity>
        )}

        {/* Wallet */}
        <Text style={[styles.section, { marginTop: 24 }]}>WALLET</Text>
        <View style={styles.walletCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.walletLabel}>AVAILABLE BALANCE</Text>
            <Text style={styles.walletBalance}>{walletBalance !== null ? formatZAR(walletBalance) : "—"}</Text>
          </View>
          <TouchableOpacity
            onPress={() => { setPayOutAmount(""); setPayOutModal(true); }}
            style={[styles.payOutBtn, !bankData?.bank_name && { opacity: 0.4 }]}
            disabled={!bankData?.bank_name}>
            <Ionicons name="arrow-up-circle-outline" size={18} color={colors.bg} />
            <Text style={styles.payOutBtnText}>Pay Out</Text>
          </TouchableOpacity>
        </View>
        {!bankData?.bank_name && (
          <Text style={styles.payOutNote}>Add banking details above to enable payouts</Text>
        )}

        {/* Subscription */}
        <Text style={[styles.section, { marginTop: 24 }]}>FLEET SUBSCRIPTION</Text>
        {subscription ? (
          <View style={[styles.subCard, subscription.status === "overdue" && { borderColor: colors.red }]}>
            {/* Status row */}
            <View style={styles.subRow}>
              <View style={[styles.subIcon, subscription.status === "overdue" && { backgroundColor: colors.redDim, borderColor: colors.red }]}>
                <Ionicons name="car-sport-outline" size={20} color={subscription.status === "overdue" ? colors.red : colors.cyan} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.subTitle}>
                  {subscription.taxi_count} Taxi{subscription.taxi_count !== 1 ? "s" : ""} ·{" "}
                  {subscription.billable_taxis === 0 ? "Free Tier" : formatZAR(subscription.monthly_fee) + "/month"}
                </Text>
                <Text style={styles.subSub}>
                  {subscription.billable_taxis === 0
                    ? `First ${subscription.free_taxis} free · no charge`
                    : `${subscription.free_taxis} free + ${subscription.billable_taxis} × ${formatZAR(subscription.price_per_taxi ?? 0)}`}
                </Text>
              </View>
              <View style={[styles.subStatusBadge, subscription.status === "overdue" && { backgroundColor: colors.redDim, borderColor: colors.red }]}>
                <Text style={[styles.subStatusText, subscription.status === "overdue" && { color: colors.red }]}>
                  {subscription.status.toUpperCase()}
                </Text>
              </View>
            </View>

            {/* Pricing breakdown */}
            {subscription.billable_taxis > 0 && (
              <View style={[styles.subBreakdown, { borderColor: colors.border }]}>
                <View style={styles.subBreakdownRow}>
                  <Text style={[styles.subBreakdownLabel, { color: colors.textMuted }]}>Price per taxi/month</Text>
                  <Text style={[styles.subBreakdownVal, { color: colors.text }]}>{formatZAR(subscription.price_per_taxi ?? 0)}</Text>
                </View>
                <View style={styles.subBreakdownRow}>
                  <Text style={[styles.subBreakdownLabel, { color: colors.textMuted }]}>Paid taxis</Text>
                  <Text style={[styles.subBreakdownVal, { color: colors.text }]}>{subscription.billable_taxis}</Text>
                </View>
                <View style={[styles.subBreakdownRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginTop: 4 }]}>
                  <Text style={[styles.subBreakdownLabel, { color: colors.text, fontWeight: "800" }]}>Monthly total</Text>
                  <Text style={[styles.subBreakdownVal, { color: colors.cyan, fontWeight: "900" }]}>{formatZAR(subscription.monthly_fee)}</Text>
                </View>
              </View>
            )}

            {/* Auto-debit notice */}
            <View style={[styles.autoDebitNote, { backgroundColor: colors.cyanDim, borderColor: colors.cyan + "40" }]}>
              <Ionicons name="repeat-outline" size={13} color={colors.cyan} />
              <Text style={[styles.autoDebitText, { color: colors.cyan }]}>
                Auto-debited from your wallet on the 1st of each month
              </Text>
            </View>

            {subscription.status === "overdue" && (
              <View style={styles.overdueNote}>
                <Ionicons name="warning-outline" size={14} color={colors.red} />
                <Text style={styles.overdueText}>Payment failed — top up your wallet to clear your subscription</Text>
              </View>
            )}
            {subscription.next_billing_date && (
              <Text style={styles.subNextBilling}>
                Next billing: {subscription.next_billing_date}
                {subscription.monthly_fee > 0 ? ` · ${formatZAR(subscription.monthly_fee)}` : " · Free"}
              </Text>
            )}
          </View>
        ) : null}

        {/* Documents */}
        <TouchableOpacity style={styles.menuItem} onPress={() => router.push("/owner/notifications")}>
          <View style={[styles.menuIcon, { backgroundColor: colors.cyanDim }]}>
            <Ionicons name="folder-outline" size={20} color={colors.cyan} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.menuTitle}>My Documents</Text>
            <Text style={styles.menuSub}>Statements & fleet documents</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>

        <Text style={[styles.section, { marginTop: 24 }]}>ACCOUNT</Text>

        {/* Change Password */}
        <TouchableOpacity style={styles.menuItem} onPress={() => { setCurrentPw(""); setNewPw(""); setConfirmPw(""); setPwModal(true); }}>
          <View style={[styles.menuIcon, { backgroundColor: colors.cyanDim }]}>
            <Ionicons name="key-outline" size={20} color={colors.cyan} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.menuTitle}>Change Password</Text>
            <Text style={styles.menuSub}>Update your login password</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Change PIN */}
        <TouchableOpacity style={styles.menuItem} onPress={() => { setCurrentPin(""); setNewPin(""); setConfirmPin(""); setPinModal(true); }}>
          <View style={[styles.menuIcon, { backgroundColor: colors.greenDim }]}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.green} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.menuTitle}>Change Security PIN</Text>
            <Text style={styles.menuSub}>Update your 4-digit in-app PIN</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Driver Mode */}
        <TouchableOpacity style={styles.menuItem} onPress={() => router.push("/owner/driver-mode")}>
          <View style={[styles.menuIcon, { backgroundColor: colors.cyanDim }]}>
            <Ionicons name="car-sport-outline" size={20} color={colors.cyan} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.menuTitle}>Driver Mode</Text>
            <Text style={styles.menuSub}>Activate to receive passenger payments</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>

        {/* KYC */}
        <TouchableOpacity style={styles.menuItem} onPress={() => router.push("/owner/documents")}>
          <View style={[styles.menuIcon, { backgroundColor: "#A064FF20" }]}>
            <Ionicons name="shield-checkmark-outline" size={20} color="#A064FF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.menuTitle}>Identity Verification</Text>
            <Text style={styles.menuSub}>KYC status and documents</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Dead Man Code */}
        <Text style={[styles.section, { marginTop: 24 }]}>EMERGENCY SAFETY</Text>
        <View style={[styles.deadManCard, { backgroundColor: colors.bg2, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
            <View style={[styles.menuIcon, { backgroundColor: colors.redDim }]}>
              <Ionicons name="shield-half-outline" size={20} color={colors.red} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuTitle, { color: colors.text }]}>Dead Man Code</Text>
              <Text style={[styles.menuSub, { color: colors.textMuted }]}>
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
            style={[styles.deadManBtn, { borderColor: colors.red + "60", backgroundColor: colors.redDim }]}
            onPress={() => { setDeadManCode(""); setDeadManCodeConfirm(""); setDeadManCurrentPin(""); setDeadManModal(true); }}>
            <Ionicons name="key-outline" size={15} color={colors.red} />
            <Text style={{ color: colors.red, fontWeight: "700", fontSize: 13 }}>
              {deadManCodeSet ? "Change Dead Man Code" : "Set Dead Man Code"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Sign out */}
        <TouchableOpacity style={styles.signOutBtn}
          onPress={() => Alert.alert("Sign out", "Are you sure?", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Sign out", style: "destructive",
              onPress: async () => {
                await signOut();
                router.replace("/(auth)/welcome");
              },
            },
          ])}>
          <Ionicons name="log-out-outline" size={20} color={colors.red} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>Tag n Ride · Fleet Owner · v1.0</Text>
      </ScrollView>

      {/* ── Pay Out modal ── */}
      <Modal visible={payOutModal} transparent animationType="slide" onRequestClose={() => { setPayOutModal(false); setPayOutFee(null); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Pay Out</Text>
            <Text style={styles.modalSub}>
              Withdraw to your bank account.{"\n"}
              {bankData?.bank_name ? `${bankData.bank_name} · **** ${bankData.account_number?.slice(-4)}` : ""}
            </Text>
            {walletBalance !== null && (
              <View style={styles.balancePill}>
                <Text style={styles.balancePillText}>Available: {formatZAR(walletBalance)}</Text>
              </View>
            )}
            <Text style={styles.inputLabel}>AMOUNT TO RECEIVE (ZAR)</Text>
            <TextInput
              style={styles.modalInput}
              value={payOutAmount}
              onChangeText={v => { setPayOutAmount(v); fetchPayOutFee(v); }}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textDim} />
            {/* Fee breakdown */}
            {payOutFeeLoading && (
              <View style={{ flexDirection: "row", gap: 6, alignItems: "center", marginBottom: 12 }}>
                <ActivityIndicator size="small" color={colors.cyan} />
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>Calculating fee…</Text>
              </View>
            )}
            {payOutFee && !payOutFeeLoading && (
              <View style={[styles.feeBreakdown, { borderColor: colors.border, backgroundColor: colors.bg }]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>Payout amount</Text>
                  <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>{formatZAR(parseFloat(payOutAmount) || 0)}</Text>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>Gateway fee</Text>
                  <Text style={{ color: colors.red, fontSize: 12, fontWeight: "700" }}>−{formatZAR(payOutFee.gateway_fee)}</Text>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <Text style={{ color: colors.text, fontSize: 12, fontWeight: "800" }}>Total deducted from wallet</Text>
                  <Text style={{ color: colors.cyan, fontSize: 13, fontWeight: "900" }}>{formatZAR(payOutFee.total_deducted)}</Text>
                </View>
              </View>
            )}
            <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
              <View style={{ flex: 1 }}><Button label="Cancel" variant="secondary" onPress={() => { setPayOutModal(false); setPayOutAmount(""); setPayOutFee(null); }} /></View>
              <View style={{ flex: 1 }}><Button label="Pay Out" onPress={handlePayOut} loading={payOutLoading} /></View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Bank details modal ── */}
      <Modal visible={bankModal} transparent animationType="slide" onRequestClose={() => setBankModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Banking Details</Text>
            <Text style={styles.modalSub}>Cash-ups from drivers will be sent here when bank method is selected</Text>
            <Text style={styles.inputLabel}>BANK NAME</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {BANKS.map(b => (
                  <TouchableOpacity key={b} style={[styles.bankChip, bankName === b && styles.bankChipActive]} onPress={() => setBankName(b)}>
                    <Text style={[styles.bankChipText, bankName === b && styles.bankChipTextActive]}>{b}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <Text style={styles.inputLabel}>ACCOUNT NUMBER</Text>
            <TextInput style={styles.modalInput} value={accountNumber} onChangeText={setAccountNumber}
              placeholder="e.g. 1234567890" placeholderTextColor={colors.textDim} keyboardType="number-pad" />
            <Text style={styles.inputLabel}>ACCOUNT HOLDER NAME</Text>
            <TextInput style={styles.modalInput} value={accountName} onChangeText={setAccountName}
              placeholder="e.g. John Mokoena" placeholderTextColor={colors.textDim} autoCapitalize="words" />
            <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
              <View style={{ flex: 1 }}><Button label="Cancel" variant="secondary" onPress={() => setBankModal(false)} /></View>
              <View style={{ flex: 1 }}><Button label="Save Details" onPress={handleSaveBank} loading={saving} /></View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Change Password modal ── */}
      <Modal visible={pwModal} transparent animationType="slide" onRequestClose={() => setPwModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={[styles.modalIconWrap, { backgroundColor: colors.cyanDim }]}>
              <Ionicons name="key-outline" size={26} color={colors.cyan} />
            </View>
            <Text style={styles.modalTitle}>Change Password</Text>
            <Text style={styles.modalSub}>Your login password (not the 4-digit PIN)</Text>

            <Text style={styles.inputLabel}>CURRENT PASSWORD</Text>
            <View style={styles.pwRow}>
              <TextInput style={[styles.modalInput, { flex: 1, marginBottom: 0 }]} value={currentPw} onChangeText={setCurrentPw}
                placeholder="Current password" placeholderTextColor={colors.textDim}
                secureTextEntry={!showCurrentPw} autoCapitalize="none" />
              <TouchableOpacity onPress={() => setShowCurrentPw(v => !v)} style={styles.eyeBtn}>
                <Ionicons name={showCurrentPw ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.inputLabel, { marginTop: 14 }]}>NEW PASSWORD</Text>
            <View style={styles.pwRow}>
              <TextInput style={[styles.modalInput, { flex: 1, marginBottom: 0 }]} value={newPw} onChangeText={setNewPw}
                placeholder="At least 8 characters" placeholderTextColor={colors.textDim}
                secureTextEntry={!showNewPw} autoCapitalize="none" />
              <TouchableOpacity onPress={() => setShowNewPw(v => !v)} style={styles.eyeBtn}>
                <Ionicons name={showNewPw ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.inputLabel, { marginTop: 14 }]}>CONFIRM NEW PASSWORD</Text>
            <View style={[styles.pwRow, { marginBottom: 4 }]}>
              <TextInput style={[styles.modalInput, { flex: 1, marginBottom: 0, borderColor: confirmPw && newPw !== confirmPw ? colors.red : colors.border }]}
                value={confirmPw} onChangeText={setConfirmPw}
                placeholder="Repeat new password" placeholderTextColor={colors.textDim}
                secureTextEntry={!showConfirmPw} autoCapitalize="none" />
              <TouchableOpacity onPress={() => setShowConfirmPw(v => !v)} style={styles.eyeBtn}>
                <Ionicons name={showConfirmPw ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            {confirmPw.length > 0 && newPw !== confirmPw && (
              <Text style={{ color: colors.red, fontSize: 11, marginBottom: 8 }}>Passwords do not match</Text>
            )}
            <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
              <View style={{ flex: 1 }}><Button label="Cancel" variant="secondary" onPress={() => setPwModal(false)} /></View>
              <View style={{ flex: 1 }}><Button label="Update" onPress={handleChangePassword} loading={changingPw} /></View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Change PIN modal ── */}
      <Modal visible={pinModal} transparent animationType="slide" onRequestClose={() => setPinModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={[styles.modalIconWrap, { backgroundColor: colors.greenDim }]}>
              <Ionicons name="lock-closed-outline" size={26} color={colors.green} />
            </View>
            <Text style={styles.modalTitle}>Change Security PIN</Text>
            <Text style={styles.modalSub}>Your 4-digit PIN for in-app actions</Text>

            <Text style={styles.inputLabel}>CURRENT PIN</Text>
            <TextInput style={styles.modalInput} value={currentPin} onChangeText={t => { if (/^\d*$/.test(t) && t.length <= 4) setCurrentPin(t); }}
              placeholder="••••" placeholderTextColor={colors.textDim}
              keyboardType="numeric" maxLength={4} secureTextEntry />

            <Text style={styles.inputLabel}>NEW PIN</Text>
            <TextInput style={styles.modalInput} value={newPin} onChangeText={t => { if (/^\d*$/.test(t) && t.length <= 4) setNewPin(t); }}
              placeholder="••••" placeholderTextColor={colors.textDim}
              keyboardType="numeric" maxLength={4} secureTextEntry />

            <Text style={styles.inputLabel}>CONFIRM NEW PIN</Text>
            <TextInput style={[styles.modalInput, { borderColor: confirmPin && newPin !== confirmPin ? colors.red : colors.border }]}
              value={confirmPin} onChangeText={t => { if (/^\d*$/.test(t) && t.length <= 4) setConfirmPin(t); }}
              placeholder="••••" placeholderTextColor={colors.textDim}
              keyboardType="numeric" maxLength={4} secureTextEntry />
            {confirmPin.length > 0 && newPin !== confirmPin && (
              <Text style={{ color: colors.red, fontSize: 11, marginTop: -10, marginBottom: 8 }}>PINs do not match</Text>
            )}

            <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
              <View style={{ flex: 1 }}><Button label="Cancel" variant="secondary" onPress={() => setPinModal(false)} /></View>
              <View style={{ flex: 1 }}><Button label="Update PIN" onPress={handleChangePin} loading={changingPin} /></View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Dead Man Code modal ── */}
      <Modal visible={deadManModal} transparent animationType="slide" onRequestClose={() => setDeadManModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setDeadManModal(false)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <View style={[styles.modalIconWrap, { backgroundColor: colors.redDim, borderColor: colors.red + "40" }]}>
              <Ionicons name="shield-half-outline" size={26} color={colors.red} />
            </View>
            <Text style={styles.modalTitle}>Dead Man Code</Text>
            <Text style={[styles.modalSub, { color: colors.textMuted }]}>
              Enter this code instead of your real PIN when cancelling an SOS if you are under duress.
              It looks like a cancel but your location keeps being tracked silently.{"\n\n"}
              Keep it secret — never share it with anyone.
            </Text>

            <Text style={styles.inputLabel}>NEW DEAD MAN CODE (4–6 digits)</Text>
            <TextInput
              style={[styles.modalInput, { borderColor: colors.red + "60" }]}
              value={deadManCode}
              onChangeText={setDeadManCode}
              placeholder="e.g. 9999"
              placeholderTextColor={colors.textDim}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
            />

            <Text style={styles.inputLabel}>CONFIRM CODE</Text>
            <TextInput
              style={[styles.modalInput, { borderColor: deadManCodeConfirm && deadManCode !== deadManCodeConfirm ? colors.red : colors.red + "60" }]}
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

            <Text style={styles.inputLabel}>YOUR CURRENT ACCOUNT PIN</Text>
            <TextInput
              style={styles.modalInput}
              value={deadManCurrentPin}
              onChangeText={setDeadManCurrentPin}
              placeholder="Your regular 4-digit PIN"
              placeholderTextColor={colors.textDim}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
            />

            <TouchableOpacity
              style={[styles.signOutBtn, { marginTop: 8, backgroundColor: colors.redDim, borderColor: colors.red, opacity: deadManSaving ? 0.6 : 1 }]}
              onPress={handleSaveDeadManCode}
              disabled={deadManSaving}>
              {deadManSaving
                ? <ActivityIndicator color={colors.red} size="small" />
                : <><Ionicons name="key-outline" size={18} color={colors.red} />
                   <Text style={styles.signOutText}>Save Dead Man Code</Text></>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setDeadManModal(false)} style={{ alignItems: "center", paddingVertical: 12 }}>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 24, fontWeight: "800", marginBottom: 24 },
  avatarSection: { alignItems: "center", marginBottom: 32 },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.cyanDim, borderWidth: 2, borderColor: colors.cyan, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  name: { color: colors.text, fontSize: 22, fontWeight: "800" },
  phone: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
  roleBadge: { marginTop: 10, backgroundColor: colors.cyanDim, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 4, borderWidth: 1, borderColor: colors.cyan },
  roleText: { color: colors.cyan, fontSize: 11, fontWeight: "800", letterSpacing: 1.4 },
  section: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, marginBottom: 10 },
  methodCard: { backgroundColor: colors.bg2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 8 },
  methodTitle: { color: colors.text, fontWeight: "700", fontSize: 15, marginBottom: 4 },
  methodSub: { color: colors.textMuted, fontSize: 12, marginBottom: 14 },
  methodRow: { flexDirection: "row", gap: 10 },
  methodBtn: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  methodBtnActive: { backgroundColor: colors.cyan, borderColor: colors.cyan },
  methodBtnTitle: { color: colors.textMuted, fontWeight: "700", fontSize: 13 },
  methodBtnTitleActive: { color: colors.bg },
  methodBtnSub: { color: colors.textDim, fontSize: 10, marginTop: 1 },
  warningNote: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12, padding: 8, backgroundColor: "#FFD60A11", borderRadius: radius.sm },
  warningText: { color: "#FFD60A", fontSize: 11, flex: 1 },
  bankCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 8 },
  bankCardLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  bankIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.cyanDim, alignItems: "center", justifyContent: "center" },
  bankName: { color: colors.text, fontWeight: "700", fontSize: 15 },
  bankAccount: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  bankHolder: { color: colors.textDim, fontSize: 11, marginTop: 1 },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.cyanDim, borderRadius: radius.sm },
  editBtnText: { color: colors.cyan, fontWeight: "700", fontSize: 12 },
  addBankBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", padding: 16, marginBottom: 8 },
  addBankText: { color: colors.cyan, fontWeight: "700", fontSize: 14 },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 8 },
  menuIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  menuTitle: { color: colors.text, fontWeight: "700", fontSize: 15 },
  menuSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  walletCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 8 },
  walletLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 1.4 },
  walletBalance: { color: colors.text, fontSize: 24, fontWeight: "900", marginTop: 2 },
  payOutBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.green, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
  payOutBtnText: { color: colors.bg, fontWeight: "800", fontSize: 14 },
  payOutNote: { color: colors.textDim, fontSize: 11, marginBottom: 8, marginTop: -4 },
  balancePill: { alignSelf: "center", backgroundColor: colors.bg, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: colors.border, marginBottom: 16 },
  feeBreakdown: { borderRadius: radius.md, borderWidth: 1, padding: 12, marginBottom: 14 },
  balancePillText: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  subCard: { backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 8 },
  subRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  subIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.cyanDim, borderWidth: 1, borderColor: colors.cyan, alignItems: "center", justifyContent: "center" },
  subTitle: { color: colors.text, fontWeight: "700", fontSize: 14 },
  subSub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  subStatusBadge: { backgroundColor: colors.cyanDim, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.cyan },
  subStatusText: { color: colors.cyan, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  subNextBilling: { color: colors.textDim, fontSize: 11, marginTop: 8 },
  overdueNote: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, padding: 8, backgroundColor: colors.redDim, borderRadius: radius.sm },
  overdueText: { color: colors.red, fontSize: 11, flex: 1 },
  subBreakdown: { borderRadius: radius.sm, borderWidth: 1, padding: 10, marginTop: 10, gap: 6 },
  subBreakdownRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  subBreakdownLabel: { fontSize: 12 },
  subBreakdownVal: { fontSize: 12, fontWeight: "700" },
  autoDebitNote: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.sm, borderWidth: 1, padding: 8, marginTop: 10 },
  autoDebitText: { fontSize: 11, fontWeight: "600", flex: 1 },
  deadManCard: { borderRadius: radius.md, borderWidth: 1, padding: 16, marginBottom: 8 },
  deadManBtn: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radius.md, borderWidth: 1, padding: 12, alignSelf: "flex-start" },
  signOutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: colors.redDim, borderRadius: radius.md, borderWidth: 1, borderColor: colors.red, padding: 16, marginTop: 24 },
  signOutText: { color: colors.red, fontWeight: "800", fontSize: 15 },
  version: { color: colors.textDim, fontSize: 12, textAlign: "center", marginTop: 24 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: colors.bg2, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, borderTopWidth: 1, borderColor: colors.border },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 20 },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: "800", textAlign: "center" },
  modalSub: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginTop: 4, marginBottom: 20, lineHeight: 18 },
  inputLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, marginBottom: 8 },
  modalInput: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 14, color: colors.text, fontSize: 15, marginBottom: 16 },
  bankChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  bankChipActive: { backgroundColor: colors.cyanDim, borderColor: colors.cyan },
  bankChipText: { color: colors.textMuted, fontWeight: "700", fontSize: 13 },
  bankChipTextActive: { color: colors.cyan },
  modalIconWrap: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  pwRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  eyeBtn: { width: 48, height: 50, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
});
