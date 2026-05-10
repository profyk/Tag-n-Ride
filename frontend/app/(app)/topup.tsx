"use client";
import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  Alert, TouchableOpacity, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { Button } from "../../src/ui";
import { colors, radius, formatZAR } from "../../src/theme";

const QUICK_AMOUNTS = [50, 100, 200, 500];

export default function TopUpScreen() {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  // Card details (UI only — for real payments integrate a payment gateway)
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [cardName, setCardName] = useState("");

  const formatCardNumber = (text: string) => {
    const clean = text.replace(/\D/g, "").slice(0, 16);
    return clean.replace(/(.{4})/g, "$1 ").trim();
  };

  const formatExpiry = (text: string) => {
    const clean = text.replace(/\D/g, "").slice(0, 4);
    if (clean.length >= 3) return clean.slice(0, 2) + "/" + clean.slice(2);
    return clean;
  };

  const handleTopUp = async () => {
    const amt = parseFloat(amount);
    if (!amount || isNaN(amt) || amt <= 0) {
      Alert.alert("Invalid amount", "Please enter a valid amount.");
      return;
    }
    if (amt < 10) {
      Alert.alert("Minimum amount", "Minimum top up is R10.");
      return;
    }
    if (!cardName.trim()) {
      Alert.alert("Required", "Please enter the name on your card.");
      return;
    }
    if (cardNumber.replace(/\s/g, "").length < 16) {
      Alert.alert("Invalid card", "Please enter a valid 16-digit card number.");
      return;
    }
    if (expiry.length < 5) {
      Alert.alert("Invalid expiry", "Please enter a valid expiry date.");
      return;
    }
    if (cvv.length < 3) {
      Alert.alert("Invalid CVV", "Please enter a valid CVV.");
      return;
    }

    setLoading(true);
    try {
      await api.topup(amt);
      Alert.alert(
        "Top Up Successful",
        `${formatZAR(amt)} has been added to your wallet.`,
        [{ text: "OK", onPress: () => router.back() }]
      );
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Could not process top up.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          {/* Header */}
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.title}>Top Up Wallet</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Amount */}
          <Text style={styles.section}>AMOUNT (ZAR)</Text>
          <TextInput
            style={styles.amountInput}
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ""))}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.textDim}
            testID="topup-amount-input"
          />

          {/* Quick amounts */}
          <View style={styles.quickRow}>
            {QUICK_AMOUNTS.map((q) => (
              <TouchableOpacity
                key={q}
                style={[styles.quickBtn, amount === String(q) && styles.quickBtnActive]}
                onPress={() => setAmount(String(q))}>
                <Text style={[styles.quickText, amount === String(q) && styles.quickTextActive]}>
                  R{q}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Card details */}
          <Text style={styles.section}>CARD DETAILS</Text>

          <Text style={styles.label}>NAME ON CARD</Text>
          <TextInput
            style={styles.input}
            value={cardName}
            onChangeText={setCardName}
            placeholder="e.g. John Doe"
            placeholderTextColor={colors.textDim}
            autoCapitalize="words"
            testID="card-name-input"
          />

          <Text style={styles.label}>CARD NUMBER</Text>
          <View style={styles.inputRow}>
            <Ionicons name="card-outline" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              value={cardNumber}
              onChangeText={(t) => setCardNumber(formatCardNumber(t))}
              placeholder="0000 0000 0000 0000"
              placeholderTextColor={colors.textDim}
              keyboardType="number-pad"
              maxLength={19}
              testID="card-number-input"
            />
          </View>

          <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>EXPIRY</Text>
              <TextInput
                style={styles.input}
                value={expiry}
                onChangeText={(t) => setExpiry(formatExpiry(t))}
                placeholder="MM/YY"
                placeholderTextColor={colors.textDim}
                keyboardType="number-pad"
                maxLength={5}
                testID="card-expiry-input"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>CVV</Text>
              <TextInput
                style={styles.input}
                value={cvv}
                onChangeText={(t) => setCvv(t.replace(/\D/g, "").slice(0, 4))}
                placeholder="•••"
                placeholderTextColor={colors.textDim}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={4}
                testID="card-cvv-input"
              />
            </View>
          </View>

          {/* Security note */}
          <View style={styles.securityNote}>
            <Ionicons name="lock-closed" size={14} color={colors.green} />
            <Text style={styles.securityText}>
              Your card details are encrypted and never stored.
            </Text>
          </View>

          {/* Submit */}
          <View style={{ marginTop: 24 }}>
            <Button
              label={amount ? `Top Up ${formatZAR(parseFloat(amount) || 0)}` : "Top Up"}
              onPress={handleTopUp}
              loading={loading}
              testID="topup-submit-btn"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  title: { color: colors.text, fontSize: 18, fontWeight: "800" },
  section: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, marginBottom: 10, marginTop: 8 },
  amountInput: { backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 16, color: colors.text, fontSize: 32, fontWeight: "800", textAlign: "center", marginBottom: 12 },
  quickRow: { flexDirection: "row", gap: 8, marginBottom: 24 },
  quickBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg2, alignItems: "center" },
  quickBtnActive: { backgroundColor: colors.cyanDim, borderColor: colors.cyan },
  quickText: { color: colors.textMuted, fontWeight: "700", fontSize: 14 },
  quickTextActive: { color: colors.cyan },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 14, color: colors.text, fontSize: 15, marginBottom: 4 },
  inputRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14 },
  securityNote: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 16, padding: 12, backgroundColor: colors.greenDim, borderRadius: radius.md, borderWidth: 1, borderColor: colors.green + "30" },
  securityText: { color: colors.textMuted, fontSize: 12, flex: 1 },
});
