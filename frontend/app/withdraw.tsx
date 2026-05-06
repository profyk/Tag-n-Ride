import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Field, Button, Card } from "../src/ui";
import { api } from "../src/api";
import { colors, formatNGN, radius } from "../src/theme";

const BANKS = ["Standard Bank", "FNB", "Absa", "Nedbank", "Capitec", "Investec", "Discovery", "TymeBank", "African Bank"];

export default function Withdraw() {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [bank, setBank] = useState("");
  const [acct, setAcct] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    const a = parseFloat(amount) || 0;
    if (a <= 0) return setErr("Enter an amount");
    if (!bank) return setErr("Select your bank");
    if (acct.length < 6) return setErr("Enter a valid account number");
    setBusy(true);
    try {
      const r = await api.withdraw({ amount: a, bank_name: bank, account_number: acct, account_name: name || undefined });
      Alert.alert("Withdrawal requested ✓", `${formatNGN(a)} will be processed within 1 business day.\nNew balance: ${formatNGN(r.balance)}`, [
        { text: "Done", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      setErr(e?.message || "Withdrawal failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} testID="withdraw-screen">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={styles.headerRow}>
            <Text style={styles.title}>Withdraw</Text>
            <TouchableOpacity onPress={() => router.back()} testID="withdraw-close-btn" style={styles.close}>
              <Ionicons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          <Field
            label="Amount (ZAR)"
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ""))}
            placeholder="0.00"
            keyboardType="decimal-pad"
            testID="withdraw-amount-input"
            inputStyle={{ fontSize: 28, fontWeight: "800", textAlign: "center", paddingVertical: 22 }}
          />

          <Card>
            <Text style={styles.label}>SELECT BANK</Text>
            <View style={styles.bankRow}>
              {BANKS.map((b) => (
                <TouchableOpacity
                  key={b}
                  onPress={() => setBank(b)}
                  style={[styles.bank, bank === b && styles.bankActive]}
                  testID={`bank-${b}`}
                >
                  <Text style={[styles.bankText, bank === b && { color: colors.cyan }]}>{b}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ height: 12 }} />
            <Field label="Account number" value={acct} onChangeText={(t) => setAcct(t.replace(/[^0-9]/g, "").slice(0, 12))} placeholder="0123456789" keyboardType="number-pad" testID="withdraw-acct-input" />
            <Field label="Account name (optional)" value={name} onChangeText={setName} placeholder="Jane Doe" testID="withdraw-name-input" autoCapitalize="words" />
          </Card>

          {err ? <Text style={styles.err} testID="withdraw-error">{err}</Text> : null}

          <View style={{ height: 16 }} />
          <Button label="Request withdrawal" onPress={submit} loading={busy} icon="cash-outline" testID="withdraw-submit-btn" />
          <Text style={styles.disclaimer}>Funds typically arrive in 1 business day. Processed by Tag n Ride finance team.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  title: { color: colors.text, fontSize: 24, fontWeight: "800" },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg2, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: "700", letterSpacing: 1.4, marginBottom: 10 },
  bankRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  bank: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  bankActive: { borderColor: colors.cyan, backgroundColor: colors.cyanDim },
  bankText: { color: colors.textMuted, fontWeight: "700", fontSize: 12 },
  err: { color: colors.red, marginTop: 8 },
  disclaimer: { color: colors.textDim, fontSize: 12, marginTop: 12, textAlign: "center" },
});
