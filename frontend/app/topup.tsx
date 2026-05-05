import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Field, Button, Card } from "../src/ui";
import { api } from "../src/api";
import { colors, formatNGN, radius } from "../src/theme";

const QUICKS = [500, 1000, 2000, 5000, 10000];

export default function TopUp() {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [card, setCard] = useState("");
  const [exp, setExp] = useState("");
  const [cvv, setCvv] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const numAmt = parseFloat(amount) || 0;

  const submit = async () => {
    setErr(null);
    if (numAmt <= 0) return setErr("Enter an amount");
    if (card.replace(/\s/g, "").length < 12) return setErr("Enter a valid card number");
    if (exp.length < 4) return setErr("Enter card expiry");
    if (cvv.length < 3) return setErr("Enter CVV");
    setBusy(true);
    try {
      const r = await api.topup(numAmt);
      Alert.alert("Top-up successful 🎉", `New balance: ${formatNGN(r.balance)}`, [
        { text: "Done", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      setErr(e?.message || "Top-up failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} testID="topup-screen">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={styles.headerRow}>
            <Text style={styles.title}>Top up</Text>
            <TouchableOpacity onPress={() => router.back()} testID="topup-close-btn" style={styles.close}>
              <Ionicons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          <Field
            label="Amount (NGN)"
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ""))}
            placeholder="0.00"
            keyboardType="decimal-pad"
            testID="topup-amount-input"
            inputStyle={{ fontSize: 28, fontWeight: "800", textAlign: "center", paddingVertical: 22 }}
          />

          <View style={styles.quickRow}>
            {QUICKS.map((q) => (
              <TouchableOpacity key={q} onPress={() => setAmount(String(q))} style={styles.quick} testID={`quick-${q}`}>
                <Text style={styles.quickText}>{formatNGN(q).replace(".00", "")}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Card style={{ marginTop: 24 }}>
            <View style={styles.cardHead}>
              <Ionicons name="card" size={18} color={colors.cyan} />
              <Text style={styles.cardHeadText}>Card details</Text>
              <View style={{ flex: 1 }} />
              <Text style={styles.mockTag}>TEST MODE</Text>
            </View>
            <View style={{ height: 12 }} />
            <Field
              label="Card number"
              value={card}
              onChangeText={(t) => setCard(t.replace(/[^0-9 ]/g, "").slice(0, 19))}
              placeholder="4242 4242 4242 4242"
              keyboardType="number-pad"
              testID="topup-card-input"
            />
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Field label="Expiry" value={exp} onChangeText={(t) => setExp(t.replace(/[^0-9/]/g, "").slice(0, 5))} placeholder="MM/YY" keyboardType="number-pad" testID="topup-exp-input" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="CVV" value={cvv} onChangeText={(t) => setCvv(t.replace(/[^0-9]/g, "").slice(0, 4))} placeholder="123" keyboardType="number-pad" secureTextEntry testID="topup-cvv-input" />
              </View>
            </View>
          </Card>

          {err ? <Text style={styles.err} testID="topup-error">{err}</Text> : null}

          <View style={{ height: 16 }} />
          <Button label={`Top up ${numAmt > 0 ? formatNGN(numAmt) : ""}`} onPress={submit} loading={busy} icon="checkmark-circle" testID="topup-submit-btn" />
          <Text style={styles.disclaimer}>Mock card payment — no real money is moved. For demo only.</Text>
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
  quickRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 4 },
  quick: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg2 },
  quickText: { color: colors.text, fontWeight: "700", fontSize: 12 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardHeadText: { color: colors.text, fontWeight: "700", fontSize: 15 },
  mockTag: { color: colors.yellow, fontSize: 10, fontWeight: "800", letterSpacing: 1, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: "rgba(255,214,10,0.12)", borderWidth: 1, borderColor: colors.yellow },
  err: { color: colors.red, marginTop: 8 },
  disclaimer: { color: colors.textDim, fontSize: 12, marginTop: 12, textAlign: "center" },
});
