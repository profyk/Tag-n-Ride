import React, { useState, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";

const BASE = "#0a0a14";
const BG2  = "#13131f";
const CYAN = "#00E5FF";
const GREEN = "#4ade80";
const RED   = "#f87171";
const BORDER = "#1e1e2e";
const TEXT  = "#f0f0f0";
const MUTED = "#888";

function R(n: number) {
  return `R ${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

type Result = {
  valid: boolean;
  document_type?: string;
  driver_name?: string;
  phone?: string;
  period_label?: string;
  driver_net_earnings?: number;
  total_trips?: number;
  issued_by?: string;
  verified_at?: string;
};

export default function VerifyPage() {
  const { ref } = useLocalSearchParams<{ ref?: string }>();
  const router = useRouter();

  const [input, setInput] = useState(ref ?? "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [searched, setSearched] = useState(false);

  const verify = async (code?: string) => {
    const refCode = (code ?? input).trim().toUpperCase();
    if (!refCode) return;
    setLoading(true);
    setResult(null);
    setSearched(false);
    try {
      const data = await api.payslipVerify(refCode);
      setResult(data);
    } catch {
      setResult({ valid: false });
    } finally {
      setLoading(false);
      setSearched(true);
    }
  };

  // Auto-verify if ref comes from URL
  useEffect(() => {
    if (ref && ref.trim()) {
      verify(ref.trim().toUpperCase());
    }
  }, []);

  const docLabel = result?.document_type === "payslip" ? "Formal Payslip" : "Earnings Statement";

  return (
    <SafeAreaView style={s.root} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : null} style={s.backBtn}>
            <Ionicons name="arrow-back" size={20} color={CYAN} />
          </TouchableOpacity>
          <View style={s.brandRow}>
            <View style={s.brandDot} />
            <Text style={s.brand}>Tag n Ride</Text>
          </View>
        </View>

        {/* Page title */}
        <View style={s.titleBlock}>
          <View style={s.verifyBadge}>
            <Ionicons name="shield-checkmark-outline" size={14} color={CYAN} />
            <Text style={s.verifyBadgeText}>Document Verification</Text>
          </View>
          <Text style={s.title}>Verify a Document</Text>
          <Text style={s.sub}>
            Enter the reference number found on a Tag n Ride earnings statement or payslip to confirm its authenticity.
          </Text>
        </View>

        {/* Search box */}
        <View style={s.searchBox}>
          <Text style={s.inputLabel}>REFERENCE NUMBER</Text>
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              value={input}
              onChangeText={t => setInput(t.toUpperCase())}
              placeholder="e.g. TNR-STMT-2026-ABC123"
              placeholderTextColor="#444"
              autoCapitalize="characters"
              autoCorrect={false}
              onSubmitEditing={() => verify()}
            />
            <TouchableOpacity
              style={[s.verifyBtn, (!input.trim() || loading) && { opacity: 0.5 }]}
              onPress={() => verify()}
              disabled={!input.trim() || loading}
            >
              {loading
                ? <ActivityIndicator color={BASE} size="small" />
                : <Ionicons name="search" size={20} color={BASE} />}
            </TouchableOpacity>
          </View>
          <Text style={s.hint}>Reference numbers start with TNR- and are printed on the document</Text>
        </View>

        {/* Loading state */}
        {loading && (
          <View style={s.loadingCard}>
            <ActivityIndicator color={CYAN} />
            <Text style={s.loadingText}>Verifying document…</Text>
          </View>
        )}

        {/* Result: VALID */}
        {!loading && searched && result?.valid && (
          <View style={s.validCard}>
            <View style={s.validHeader}>
              <View style={s.validIconWrap}>
                <Ionicons name="shield-checkmark" size={32} color={GREEN} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.validTitle}>Document Verified</Text>
                <Text style={s.validSub}>This is an authentic Tag n Ride {docLabel}</Text>
              </View>
            </View>

            <View style={s.divider} />

            {[
              { label: "Document Type",   value: docLabel },
              { label: "Issued To",        value: result.driver_name ?? "—" },
              { label: "Contact",          value: result.phone ?? "—" },
              { label: "Period",           value: result.period_label ?? "—" },
              { label: "Net Earnings",     value: result.driver_net_earnings != null ? R(result.driver_net_earnings) : "—", color: GREEN },
              { label: "Total Trips",      value: result.total_trips != null ? String(result.total_trips) : "—" },
              { label: "Issued By",        value: result.issued_by ?? "Tag n Ride Pty Ltd" },
            ].map(row => (
              <View key={row.label} style={s.resultRow}>
                <Text style={s.resultLabel}>{row.label}</Text>
                <Text style={[s.resultValue, row.color ? { color: row.color } : {}]}>{row.value}</Text>
              </View>
            ))}

            <View style={s.divider} />

            <View style={s.verifiedStamp}>
              <Ionicons name="checkmark-circle" size={14} color={GREEN} />
              <Text style={s.verifiedStampText}>
                Verified {result.verified_at ? new Date(result.verified_at).toLocaleString("en-ZA") : "now"}
              </Text>
            </View>

            <Text style={s.privacyNote}>
              Personal details are partially masked to protect driver privacy.
            </Text>
          </View>
        )}

        {/* Result: INVALID */}
        {!loading && searched && result && !result.valid && (
          <View style={s.invalidCard}>
            <View style={s.invalidHeader}>
              <View style={s.invalidIconWrap}>
                <Ionicons name="close-circle" size={32} color={RED} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.invalidTitle}>Document Not Found</Text>
                <Text style={s.invalidSub}>
                  No document matches this reference number. It may have been deleted or the reference is incorrect.
                </Text>
              </View>
            </View>
            <View style={s.invalidTips}>
              {[
                "Check the reference number is entered exactly as printed",
                "Reference numbers are case-insensitive",
                "Contact the document holder if you believe this is an error",
              ].map((tip, i) => (
                <View key={i} style={s.tipRow}>
                  <Ionicons name="alert-circle-outline" size={13} color={RED} style={{ marginTop: 2 }} />
                  <Text style={s.tipText}>{tip}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Footer */}
        <View style={s.footer}>
          <View style={s.footerDot} />
          <Text style={s.footerText}>Tag n Ride Pty Ltd · Secure document verification</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BASE },
  scroll: { padding: 20, paddingBottom: 48 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 28, gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: BG2, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandDot: { width: 4, height: 24, borderRadius: 2, backgroundColor: CYAN },
  brand: { color: TEXT, fontWeight: "900", fontSize: 18, letterSpacing: 0.5 },
  titleBlock: { marginBottom: 28 },
  verifyBadge: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: "#00E5FF15", borderWidth: 1, borderColor: CYAN + "40", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 12 },
  verifyBadgeText: { color: CYAN, fontSize: 11, fontWeight: "700" },
  title: { color: TEXT, fontSize: 26, fontWeight: "900", marginBottom: 8 },
  sub: { color: MUTED, fontSize: 14, lineHeight: 21 },
  searchBox: { backgroundColor: BG2, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 20, marginBottom: 20 },
  inputLabel: { color: MUTED, fontSize: 10, fontWeight: "700", letterSpacing: 1.4, marginBottom: 10 },
  inputRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  input: { flex: 1, backgroundColor: BASE, borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, color: TEXT, fontSize: 14, fontFamily: "monospace" },
  verifyBtn: { width: 52, borderRadius: 12, backgroundColor: CYAN, alignItems: "center", justifyContent: "center" },
  hint: { color: "#444", fontSize: 11, lineHeight: 16 },
  loadingCard: { backgroundColor: BG2, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 28, alignItems: "center", gap: 12, marginBottom: 20 },
  loadingText: { color: MUTED, fontSize: 13 },
  validCard: { backgroundColor: BG2, borderRadius: 16, borderWidth: 1, borderColor: GREEN + "40", padding: 20, marginBottom: 20 },
  validHeader: { flexDirection: "row", alignItems: "flex-start", gap: 14, marginBottom: 16 },
  validIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: GREEN + "15", borderWidth: 1, borderColor: GREEN + "40", alignItems: "center", justifyContent: "center" },
  validTitle: { color: GREEN, fontSize: 18, fontWeight: "900", marginBottom: 4 },
  validSub: { color: MUTED, fontSize: 12, lineHeight: 18 },
  divider: { height: 1, backgroundColor: BORDER, marginVertical: 14 },
  resultRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: BORDER + "88" },
  resultLabel: { color: MUTED, fontSize: 13 },
  resultValue: { color: TEXT, fontSize: 13, fontWeight: "700", maxWidth: "55%", textAlign: "right" },
  verifiedStamp: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  verifiedStampText: { color: GREEN, fontSize: 11, fontWeight: "700" },
  privacyNote: { color: "#444", fontSize: 11, lineHeight: 17 },
  invalidCard: { backgroundColor: BG2, borderRadius: 16, borderWidth: 1, borderColor: RED + "40", padding: 20, marginBottom: 20 },
  invalidHeader: { flexDirection: "row", alignItems: "flex-start", gap: 14, marginBottom: 16 },
  invalidIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: RED + "15", borderWidth: 1, borderColor: RED + "40", alignItems: "center", justifyContent: "center" },
  invalidTitle: { color: RED, fontSize: 18, fontWeight: "900", marginBottom: 4 },
  invalidSub: { color: MUTED, fontSize: 12, lineHeight: 18 },
  invalidTips: { gap: 8 },
  tipRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  tipText: { color: MUTED, fontSize: 12, lineHeight: 18, flex: 1 },
  footer: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, justifyContent: "center" },
  footerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: CYAN },
  footerText: { color: "#333", fontSize: 11 },
});
