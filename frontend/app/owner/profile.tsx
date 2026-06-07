import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput, Modal } from "react-native";
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
  const [bankData, setBankData] = useState<any>(null);
  const [bankModal, setBankModal] = useState(false);
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [saving, setSaving] = useState(false);
  const [cashupMethod, setCashupMethod] = useState<"wallet" | "bank">("wallet");
  const [savingMethod, setSavingMethod] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [payOutModal, setPayOutModal] = useState(false);
  const [payOutAmount, setPayOutAmount] = useState("");
  const [payOutLoading, setPayOutLoading] = useState(false);
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

  if (state.status !== "authed") return null;
  const user = state.user;

  const load = useCallback(async () => {
    try {
      const [bankRes, walletRes, subRes] = await Promise.all([
        api.ownerGetBank(),
        api.ownerWallet().catch(() => null),
        api.ownerSubscription().catch(() => null),
      ]);
      setBankData(bankRes);
      setCashupMethod(bankRes.cashup_method || "wallet");
      if (bankRes.bank_account) {
        setBankName(bankRes.bank_account.bank_name || "");
        setAccountNumber(bankRes.bank_account.account_number || "");
        setAccountName(bankRes.bank_account.account_name || "");
      }
      if (walletRes) setWalletBalance(walletRes.balance ?? null);
      if (subRes) setSubscription(subRes.subscription);
    } catch (e) {}
  }, []);

  const handlePayOut = async () => {
    const amount = parseFloat(payOutAmount);
    if (!payOutAmount || isNaN(amount) || amount <= 0) {
      Alert.alert("Invalid amount", "Please enter a valid amount."); return;
    }
    if (amount < 5) { Alert.alert("Minimum amount", "Minimum payout is R5.00."); return; }
    if (walletBalance !== null && amount > walletBalance) {
      Alert.alert("Insufficient balance", `Your wallet balance is ${formatZAR(walletBalance)}.`); return;
    }
    if (!bankData?.bank_name) {
      Alert.alert("No bank account", "Please add your banking details first."); return;
    }
    setPayOutLoading(true);
    try {
      await api.ownerPayout(amount);
      setPayOutModal(false); setPayOutAmount("");
      Alert.alert("Payout Submitted", `${formatZAR(amount)} has been submitted for admin approval. You will be notified once it is processed to your bank account.`);
      load();
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Could not process payout. Please try again.");
    } finally {
      setPayOutLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleSaveBank = async () => {
    if (!bankName || !accountNumber) {
      Alert.alert("Required", "Please enter bank name and account number");
      return;
    }
    setSaving(true);
    try {
      await api.ownerSaveBank({ bank_name: bankName, account_number: accountNumber, account_name: accountName });
      setBankModal(false);
      load();
      Alert.alert("Saved", "Banking details saved successfully.");
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not save banking details");
    } finally {
      setSaving(false);
    }
  };

  const handleSetCashupMethod = async (method: "wallet" | "bank") => {
    if (method === "bank" && !bankData?.bank_account) {
      Alert.alert("No bank account", "Please add your bank account details first.");
      return;
    }
    setSavingMethod(true);
    try {
      await api.ownerSetCashupMethod(method);
      setCashupMethod(method);
      load();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not update preference");
    } finally {
      setSavingMethod(false);
    }
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
      setShowCurrentPw(false); setShowNewPw(false); setShowConfirmPw(false);
      Alert.alert("Password Changed ✓", "Your login password has been updated successfully.");
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Could not change password. Please try again.");
    } finally {
      setChangingPw(false);
    }
  };

  const styles = makeStyles(colors);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text style={styles.title}>Profile</Text>

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
          {cashupMethod === "bank" && !bankData?.bank_account && (
            <View style={styles.warningNote}>
              <Ionicons name="warning-outline" size={14} color="#FFD60A" />
              <Text style={styles.warningText}>Add bank account below to enable bank cashups</Text>
            </View>
          )}
        </View>

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

        {/* Pay Out */}
        <Text style={[styles.section, { marginTop: 24 }]}>WALLET</Text>
        <View style={styles.walletCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.walletLabel}>AVAILABLE BALANCE</Text>
            <Text style={styles.walletBalance}>
              {walletBalance !== null ? formatZAR(walletBalance) : "—"}
            </Text>
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
        <Text style={[styles.section, { marginTop: 24 }]}>SUBSCRIPTION</Text>
        {subscription ? (
          <View style={styles.subCard}>
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
                    ? `First ${subscription.free_taxis} taxi free — add more taxis to unlock paid plan`
                    : `${subscription.free_taxis} free + ${subscription.billable_taxis} paid`}
                </Text>
              </View>
              <View style={[styles.subStatusBadge, subscription.status === "overdue" && { backgroundColor: colors.redDim, borderColor: colors.red }]}>
                <Text style={[styles.subStatusText, subscription.status === "overdue" && { color: colors.red }]}>
                  {subscription.status.toUpperCase()}
                </Text>
              </View>
            </View>
            {subscription.status === "overdue" && (
              <View style={styles.overdueNote}>
                <Ionicons name="warning-outline" size={14} color={colors.red} />
                <Text style={styles.overdueText}>Payment failed — please top up your wallet to clear your subscription</Text>
              </View>
            )}
            {subscription.next_billing_date && (
              <Text style={styles.subNextBilling}>
                Next billing: {subscription.next_billing_date}
              </Text>
            )}
          </View>
        ) : null}

        {/* Statement */}
        <TouchableOpacity style={styles.stmtBtn} onPress={() => router.push("/owner/statement")}>
          <View style={[styles.menuIcon, { backgroundColor: "#FFD60A22" }]}>
            <Ionicons name="document-text-outline" size={20} color="#FFD60A" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.menuTitle}>Fleet Statement</Text>
            <Text style={styles.menuSub}>Download monthly earnings & cashup breakdown</Text>
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

        {[
          { icon: "car-sport-outline", color: colors.cyanDim, iconColor: colors.cyan, title: "Driver Mode", sub: "Activate to receive passenger payments", route: "/owner/driver-mode" },
          { icon: "lock-closed-outline", color: colors.greenDim, iconColor: colors.green, title: "Change Security PIN", sub: "Update your 4-digit in-app PIN", route: "/(app)/profile" },
          { icon: "shield-checkmark-outline", color: "#A064FF20", iconColor: "#A064FF", title: "Identity Verification", sub: "KYC status and documents", route: "/(app)/kyc" },
        ].map((item, i) => (
          <TouchableOpacity key={i} style={styles.menuItem} onPress={() => router.push(item.route as any)}>
            <View style={[styles.menuIcon, { backgroundColor: item.color }]}>
              <Ionicons name={item.icon as any} size={20} color={item.iconColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuTitle}>{item.title}</Text>
              <Text style={styles.menuSub}>{item.sub}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={styles.signOutBtn}
          onPress={() => Alert.alert("Sign out", "Are you sure?", [
            { text: "Cancel", style: "cancel" },
            { text: "Sign out", style: "destructive", onPress: async () => { await signOut(); router.replace("/(auth)/welcome"); } },
          ])}>
          <Ionicons name="log-out-outline" size={20} color={colors.red} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>Tag n Ride · Fleet Owner · v1.0</Text>
      </ScrollView>

      {/* Pay Out modal */}
      <Modal visible={payOutModal} transparent animationType="slide" onRequestClose={() => setPayOutModal(false)}>
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
            <Text style={styles.inputLabel}>AMOUNT (ZAR)</Text>
            <TextInput
              style={styles.modalInput}
              value={payOutAmount}
              onChangeText={setPayOutAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textDim}
            />
            <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
              <View style={{ flex: 1 }}>
                <Button label="Cancel" variant="secondary" onPress={() => { setPayOutModal(false); setPayOutAmount(""); }} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Pay Out" onPress={handlePayOut} loading={payOutLoading} />
              </View>
            </View>
          </View>
        </View>
      </Modal>

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
              <View style={{ flex: 1 }}>
                <Button label="Cancel" variant="secondary" onPress={() => setBankModal(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Save Details" onPress={handleSaveBank} loading={saving} />
              </View>
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

            {/* Current password */}
            <Text style={styles.inputLabel}>CURRENT PASSWORD</Text>
            <View style={styles.pwRow}>
              <TextInput
                style={[styles.modalInput, { flex: 1, marginBottom: 0 }]}
                value={currentPw}
                onChangeText={setCurrentPw}
                placeholder="Current password"
                placeholderTextColor={colors.textDim}
                secureTextEntry={!showCurrentPw}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowCurrentPw(v => !v)} style={styles.eyeBtn}>
                <Ionicons name={showCurrentPw ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* New password */}
            <Text style={[styles.inputLabel, { marginTop: 14 }]}>NEW PASSWORD</Text>
            <View style={styles.pwRow}>
              <TextInput
                style={[styles.modalInput, { flex: 1, marginBottom: 0 }]}
                value={newPw}
                onChangeText={setNewPw}
                placeholder="At least 8 characters"
                placeholderTextColor={colors.textDim}
                secureTextEntry={!showNewPw}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowNewPw(v => !v)} style={styles.eyeBtn}>
                <Ionicons name={showNewPw ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Confirm new password */}
            <Text style={[styles.inputLabel, { marginTop: 14 }]}>CONFIRM NEW PASSWORD</Text>
            <View style={[styles.pwRow, { marginBottom: 4 }]}>
              <TextInput
                style={[styles.modalInput, {
                  flex: 1, marginBottom: 0,
                  borderColor: confirmPw && newPw !== confirmPw ? colors.red : colors.border,
                }]}
                value={confirmPw}
                onChangeText={setConfirmPw}
                placeholder="Repeat new password"
                placeholderTextColor={colors.textDim}
                secureTextEntry={!showConfirmPw}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowConfirmPw(v => !v)} style={styles.eyeBtn}>
                <Ionicons name={showConfirmPw ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            {confirmPw.length > 0 && newPw !== confirmPw && (
              <Text style={{ color: colors.red, fontSize: 11, marginBottom: 8 }}>Passwords do not match</Text>
            )}

            <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
              <View style={{ flex: 1 }}>
                <Button label="Cancel" variant="secondary" onPress={() => setPwModal(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Update" onPress={handleChangePassword} loading={changingPw} />
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
  stmtBtn: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 8 },
  signOutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: colors.redDim, borderRadius: radius.md, borderWidth: 1, borderColor: colors.red, padding: 16, marginTop: 24 },
  signOutText: { color: colors.red, fontWeight: "800", fontSize: 15 },
  version: { color: colors.textDim, fontSize: 12, textAlign: "center", marginTop: 24 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: colors.bg2, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, borderTopWidth: 1, borderColor: colors.border },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 20 },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: "800", textAlign: "center" },
  modalSub: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginTop: 4, marginBottom: 20, lineHeight: 18 },
  inputLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, marginBottom: 8 },
  modalInput: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 14, color: colors.text, fontSize: 15, marginBottom: 16 },
  bankChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  bankChipActive: { backgroundColor: colors.cyanDim, borderColor: colors.cyan },
  bankChipText: { color: colors.textMuted, fontWeight: "700", fontSize: 13 },
  bankChipTextActive: { color: colors.cyan },
  // Change password modal
  modalIconWrap: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  pwRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  eyeBtn: { width: 48, height: 50, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
});
