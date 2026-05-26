import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, KeyboardAvoidingView, Platform,
  ActivityIndicator, Linking, TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../src/api";
import { useTheme } from "../src/ThemeContext";
import { radius, formatZAR } from "../src/theme";

const QUICK_AMOUNTS = [50, 100, 200, 500, 1000];
type Step = "amount" | "breakdown" | "processing" | "success" | "failed";export default function TopUpScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [step, setStep] = useState<Step>("amount");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [breakdown, setBreakdown] = useState<any>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [verified, setVerified] = useState<any>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCount = useRef(0);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleGetBreakdown = async () => {
    const amt = parseFloat(amount);
    if (!amount || isNaN(amt) || amt < 10) return;
    setLoading(true);
    try {
      const res = await api.topupInitiate(amt);
      setBreakdown(res); setPaymentId(res.payment_id); setStep("breakdown");
    } catch (e: any) {
      if (Platform.OS === "web") window.alert(e?.message || "Could not initiate top-up.");
    } finally { setLoading(false); }
  };

  const handleProceedToPayment = async () => {
    if (!breakdown?.redirect_url) return;
    setStep("processing");
    if (Platform.OS === "web") { window.open(breakdown.redirect_url, "_blank"); }
    else { await Linking.openURL(breakdown.redirect_url); }
    pollCount.current = 0;
    pollRef.current = setInterval(async () => {
      pollCount.current += 1;
      try {
        const res = await api.verifyTopup(paymentId!);
        if (res.completed) {
          if (pollRef.current) clearInterval(pollRef.current);
          setVerified(res); setStep("success");
        }
      } catch {}
      if (pollCount.current > 120) {
        if (pollRef.current) clearInterval(pollRef.current);
        setStep("failed");
      }
    }, 5000);
  };

  const handleManualVerify = async () => {
    if (!paymentId) return;
    setLoading(true);
    try {
      const res = await api.verifyTopup(paymentId);
      if (res.completed) {
        if (pollRef.current) clearInterval(pollRef.current);
        setVerified(res); setStep("success");
      } else {
        if (Platform.OS === "web") window.alert("Payment not confirmed yet. Please wait.");
      }
    } catch (e: any) {
      if (Platform.OS === "web") window.alert(e?.message || "Could not verify payment.");
    } finally { setLoading(false); }
  };

  const amt = parseFloat(amount) || 0;
  const isValid = amt >= 10;
  const s = makeStyles(colors);if (step === "amount") {
    return (
      <SafeAreaView style={s.root} edges={["top"]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            <View style={s.headerRow}>
              <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
                <Ionicons name="arrow-back" size={22} color={colors.text} />
              </TouchableOpacity>
              <Text style={s.title}>Top Up Wallet</Text>
              <View style={{ width: 40 }} />
            </View>

            <Text style={s.section}>HOW MUCH TO ADD TO YOUR WALLET?</Text>

            <TextInput
              style={s.amountInput}
              value={amount}
              onChangeText={t => setAmount(t.replace(/[^0-9.]/g, ""))}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textDim}
            />

            <View style={s.quickRow}>
              {QUICK_AMOUNTS.map(q => (
                <TouchableOpacity key={q} style={[s.quickBtn, amount === String(q) && s.quickBtnActive]} onPress={() => setAmount(String(q))}>
                  <Text style={[s.quickText, amount === String(q) && s.quickTextActive]}>R{q}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {amt >= 10 && (
              <View style={s.miniFeeNote}>
                <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
                <Text style={s.miniFeeText}>A small processing fee will be added. Tap Continue to see full breakdown.</Text>
              </View>
            )}

            {amt > 0 && amt < 10 && (
              <View style={s.errorNote}>
                <Ionicons name="warning-outline" size={14} color={colors.red} />
                <Text style={s.errorText}>Minimum top-up is R10.</Text>
              </View>
            )}

            <TouchableOpacity style={[s.continueBtn, !isValid && s.continueBtnDisabled]} onPress={handleGetBreakdown} disabled={!isValid || loading}>
              {loading ? <ActivityIndicator color={colors.bg} /> : (
                <>
                  <Text style={s.continueBtnText}>{isValid ? `Continue · ${formatZAR(amt)}` : "Enter amount to continue"}</Text>
                  {isValid && <Ionicons name="arrow-forward" size={18} color={colors.bg} />}
                </>
              )}
            </TouchableOpacity>

            <View style={s.paymentMethods}>
              <Text style={s.paymentMethodsLabel}>PAY WITH YOUR BANK</Text>
              <View style={s.methodRow}>
                {["Capitec", "FNB", "Absa", "Nedbank", "Standard Bank", "TymeBank"].map(bank => (
                  <View key={bank} style={s.methodBadge}>
                    <Ionicons name="phone-portrait-outline" size={14} color={colors.cyan} />
                    <Text style={s.methodText}>{bank}</Text>
                  </View>
                ))}
              </View>
              <Text style={s.poweredBy}>Powered by Stitch · Instant EFT · Secured by SSL</Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }if (step === "breakdown" && breakdown) {
    return (
      <SafeAreaView style={s.root} edges={["top"]}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          <View style={s.headerRow}>
            <TouchableOpacity onPress={() => setStep("amount")} style={s.backBtn}>
              <Ionicons name="arrow-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={s.title}>Payment Summary</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={s.summaryCard}>
            <View style={s.summaryIconWrap}><Ionicons name="wallet" size={28} color={colors.cyan} /></View>
            <Text style={s.summaryTitle}>Wallet Top-Up</Text>
            <Text style={s.summarySubtitle}>Review before paying</Text>
            <View style={s.divider} />
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Wallet credit</Text>
              <Text style={s.summaryValueGreen}>{formatZAR(breakdown.wallet_amount)}</Text>
            </View>
            <View style={s.summaryRow}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={s.summaryLabel}>Processing fee</Text>
                <View style={s.feeBadge}><Text style={s.feeBadgeText}>{breakdown.processing_fee_pct}%</Text></View>
              </View>
              <Text style={s.summaryValueMuted}>{formatZAR(breakdown.processing_fee)}</Text>
            </View>
            <View style={s.divider} />
            <View style={s.summaryRow}>
              <Text style={s.summaryTotalLabel}>Total charged</Text>
              <Text style={s.summaryTotalValue}>{formatZAR(breakdown.charge_amount)}</Text>
            </View>
          </View>

          <View style={s.feeExplain}>
            <Text style={s.feeExplainTitle}>WHERE DOES THE FEE GO?</Text>
            <View style={s.feeExplainRow}>
              <View style={[s.feeExplainDot, { backgroundColor: "#FF6B6B" }]} />
              <Text style={s.feeExplainText}>Gateway fee approx {formatZAR(breakdown.gateway_fee)} goes to Stitch</Text>
            </View>
            <View style={s.feeExplainRow}>
              <View style={[s.feeExplainDot, { backgroundColor: colors.cyan }]} />
              <Text style={s.feeExplainText}>Operations approx {formatZAR(breakdown.operations_income)} covers platform costs</Text>
            </View>
          </View>

          {breakdown.sandbox && (
            <View style={s.sandboxNote}>
              <Ionicons name="flask-outline" size={14} color="#FFD60A" />
              <Text style={s.sandboxText}>Sandbox mode — tap Pay then tap "I have paid" to simulate a successful payment</Text>
            </View>
          )}

          <TouchableOpacity style={s.payBtn} onPress={handleProceedToPayment}>
            <Ionicons name="lock-closed" size={18} color={colors.bg} />
            <Text style={s.payBtnText}>Pay {formatZAR(breakdown.charge_amount)} via Stitch</Text>
          </TouchableOpacity>

          <Text style={s.redirectNote}>You will be redirected to Stitch — select your bank and authorise the payment instantly.</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }if (step === "processing") {
    return (
      <SafeAreaView style={s.root} edges={["top"]}>
        <View style={s.centeredScreen}>
          <View style={s.processingIcon}><ActivityIndicator size="large" color={colors.cyan} /></View>
          <Text style={s.processingTitle}>Waiting for payment...</Text>
          <Text style={s.processingSubtitle}>Complete your payment on the Stitch page.{"\n"}This screen updates automatically.</Text>
          <View style={s.processingSteps}>
            <View style={s.processingStep}>
              <Ionicons name="checkmark-circle" size={18} color={colors.green} />
              <Text style={s.processingStepText}>Payment initiated</Text>
            </View>
            <View style={s.processingStep}>
              <ActivityIndicator size="small" color={colors.cyan} />
              <Text style={s.processingStepText}>Waiting for Stitch confirmation...</Text>
            </View>
            <View style={s.processingStep}>
              <Ionicons name="ellipse-outline" size={18} color={colors.textDim} />
              <Text style={[s.processingStepText, { color: colors.textDim }]}>Wallet will be credited</Text>
            </View>
          </View>
          <TouchableOpacity style={s.verifyBtn} onPress={handleManualVerify} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.cyan} /> : <Text style={s.verifyBtnText}>I have paid — check now</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={s.cancelLink} onPress={() => { if (pollRef.current) clearInterval(pollRef.current); setStep("amount"); }}>
            <Text style={s.cancelLinkText}>Cancel and go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (step === "success" && verified) {
    return (
      <SafeAreaView style={s.root} edges={["top"]}>
        <View style={s.centeredScreen}>
          <Ionicons name="checkmark-circle" size={72} color={colors.green} style={{ marginBottom: 20 }} />
          <Text style={s.successTitle}>Top-Up Successful!</Text>
          <Text style={s.successSubtitle}>Your wallet has been credited</Text>
          <View style={s.successCard}>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Amount credited</Text>
              <Text style={s.summaryValueGreen}>{formatZAR(verified.wallet_amount)}</Text>
            </View>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Processing fee</Text>
              <Text style={s.summaryValueMuted}>{formatZAR(verified.processing_fee)}</Text>
            </View>
            <View style={s.divider} />
            <View style={s.summaryRow}>
              <Text style={s.summaryTotalLabel}>New balance</Text>
              <Text style={s.summaryTotalValue}>{formatZAR(verified.balance)}</Text>
            </View>
          </View>
          <TouchableOpacity style={s.doneBtn} onPress={() => router.back()}>
            <Text style={s.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (step === "failed") {
    return (
      <SafeAreaView style={s.root} edges={["top"]}>
        <View style={s.centeredScreen}>
          <Ionicons name="close-circle" size={72} color={colors.red} style={{ marginBottom: 20 }} />
          <Text style={s.failedTitle}>Payment Not Confirmed</Text>
          <Text style={s.failedSubtitle}>We could not confirm your payment.{"\n"}If money was deducted, please contact support.</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => setStep("amount")}>
            <Text style={s.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.cancelLink} onPress={() => router.back()}>
            <Text style={s.cancelLinkText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return null;
}const makeStyles = (colors: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  title: { color: colors.text, fontSize: 18, fontWeight: "800" },
  section: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, marginBottom: 10 },
  amountInput: { backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 16, color: colors.text, fontSize: 36, fontWeight: "800", textAlign: "center", marginBottom: 12 },
  quickRow: { flexDirection: "row", gap: 8, marginBottom: 16, flexWrap: "wrap" },
  quickBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg2 },
  quickBtnActive: { backgroundColor: colors.cyanDim, borderColor: colors.cyan },
  quickText: { color: colors.textMuted, fontWeight: "700", fontSize: 14 },
  quickTextActive: { color: colors.cyan },
  miniFeeNote: { flexDirection: "row", alignItems: "center", gap: 6, padding: 10, backgroundColor: colors.bg2, borderRadius: radius.sm, marginBottom: 8 },
  miniFeeText: { color: colors.textMuted, fontSize: 12, flex: 1 },
  errorNote: { flexDirection: "row", alignItems: "center", gap: 6, padding: 10, backgroundColor: colors.redDim, borderRadius: radius.sm, marginBottom: 8 },
  errorText: { color: colors.red, fontSize: 12 },
  continueBtn: { backgroundColor: colors.cyan, borderRadius: radius.md, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8 },
  continueBtnDisabled: { backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border },
  continueBtnText: { color: colors.bg, fontWeight: "800", fontSize: 16 },
  paymentMethods: { marginTop: 32, alignItems: "center" },
  paymentMethodsLabel: { color: colors.textDim, fontSize: 10, fontWeight: "700", letterSpacing: 1.4, marginBottom: 12 },
  methodRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" },
  methodBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.bg2, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  methodText: { color: colors.textMuted, fontSize: 11, fontWeight: "600" },
  poweredBy: { color: colors.textDim, fontSize: 10, marginTop: 12 },
  summaryCard: { backgroundColor: colors.bg2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 20, marginBottom: 16 },
  summaryIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.cyanDim, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 12 },
  summaryTitle: { color: colors.text, fontSize: 20, fontWeight: "800", textAlign: "center" },
  summarySubtitle: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginBottom: 16 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  summaryLabel: { color: colors.textMuted, fontSize: 14 },
  summaryValueGreen: { color: colors.green, fontWeight: "800", fontSize: 16 },
  summaryValueMuted: { color: colors.textMuted, fontWeight: "600", fontSize: 14 },
  summaryTotalLabel: { color: colors.text, fontSize: 16, fontWeight: "800" },
  summaryTotalValue: { color: colors.cyan, fontSize: 22, fontWeight: "900" },
  feeBadge: { backgroundColor: colors.cyanDim, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  feeBadgeText: { color: colors.cyan, fontSize: 10, fontWeight: "800" },
  feeExplain: { backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 16 },
  feeExplainTitle: { color: colors.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 1.2, marginBottom: 10 },
  feeExplainRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  feeExplainDot: { width: 8, height: 8, borderRadius: 4 },
  feeExplainText: { color: colors.textMuted, fontSize: 13 },
  sandboxNote: { flexDirection: "row", alignItems: "center", gap: 6, padding: 10, backgroundColor: "#FFD60A22", borderRadius: radius.sm, borderWidth: 1, borderColor: "#FFD60A44", marginBottom: 16 },
  sandboxText: { color: "#FFD60A", fontSize: 12, fontWeight: "600", flex: 1 },
  payBtn: { backgroundColor: colors.cyan, borderRadius: radius.md, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 12 },
  payBtnText: { color: colors.bg, fontWeight: "800", fontSize: 16 },
  redirectNote: { color: colors.textDim, fontSize: 12, textAlign: "center", lineHeight: 18 },
  centeredScreen: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  processingIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.cyanDim, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  processingTitle: { color: colors.text, fontSize: 22, fontWeight: "800", marginBottom: 8 },
  processingSubtitle: { color: colors.textMuted, textAlign: "center", lineHeight: 22, marginBottom: 32 },
  processingSteps: { width: "100%", gap: 12, marginBottom: 32 },
  processingStep: { flexDirection: "row", alignItems: "center", gap: 10 },
  processingStepText: { color: colors.text, fontSize: 14 },
  verifyBtn: { backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.cyan, paddingHorizontal: 24, paddingVertical: 14, marginBottom: 12 },
  verifyBtnText: { color: colors.cyan, fontWeight: "700", fontSize: 15 },
  cancelLink: { paddingVertical: 12 },
  cancelLinkText: { color: colors.textMuted, fontSize: 14 },
  successTitle: { color: colors.text, fontSize: 26, fontWeight: "900", marginBottom: 6 },
  successSubtitle: { color: colors.textMuted, fontSize: 15, marginBottom: 24 },
  successCard: { width: "100%", backgroundColor: colors.bg2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.green, padding: 20, marginBottom: 24 },
  doneBtn: { backgroundColor: colors.green, borderRadius: radius.md, paddingHorizontal: 48, paddingVertical: 16 },
  doneBtnText: { color: colors.bg, fontWeight: "900", fontSize: 18 },
  failedTitle: { color: colors.text, fontSize: 22, fontWeight: "800", marginBottom: 8 },
  failedSubtitle: { color: colors.textMuted, textAlign: "center", lineHeight: 22, marginBottom: 32 },
  retryBtn: { backgroundColor: colors.cyan, borderRadius: radius.md, paddingHorizontal: 32, paddingVertical: 14, marginBottom: 12 },
  retryBtnText: { color: colors.bg, fontWeight: "800", fontSize: 15 },
});
