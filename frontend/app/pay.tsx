import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Field, Button } from "../src/ui";
import { api, DriverInfo, Txn } from "../src/api";
import { colors, formatNGN, radius } from "../src/theme";

const QUICKS = [20, 50, 100, 150, 200, 500];

type Stage = "review" | "confirm" | "success";

export default function Pay() {
  const router = useRouter();
  const params = useLocalSearchParams<{ driver_id?: string }>();
  const driverId = params.driver_id;

  const [driver, setDriver] = useState<DriverInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("review");
  const [resultTxn, setResultTxn] = useState<Txn | null>(null);
  const [stars, setStars] = useState(0);
  const [rated, setRated] = useState(false);

  useEffect(() => {
    if (!driverId) {
      setErr("No driver ID");
      setLoading(false);
      return;
    }
    api
      .lookupDriver(driverId)
      .then(setDriver)
      .catch((e) => setErr(e?.message || "Driver not found"))
      .finally(() => setLoading(false));
  }, [driverId]);

  const submit = async () => {
    if (!driver) return;
    const a = parseFloat(amount) || 0;
    if (a <= 0) return setErr("Enter an amount");
    setErr(null);
    setBusy(true);
    try {
      const r = await api.transfer(driver.user_id, a, note || undefined);
      setResultTxn(r.transaction);
      setStage("success");
    } catch (e: any) {
      setErr(e?.message || "Payment failed");
    } finally {
      setBusy(false);
    }
  };

  const submitRating = async () => {
    if (!driver || !resultTxn || stars === 0) return;
    try {
      await api.rate({ driver_user_id: driver.user_id, transaction_id: resultTxn.id, stars });
      setRated(true);
    } catch (e: any) {
      Alert.alert("Could not save rating", e?.message || "");
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.root, { alignItems: "center", justifyContent: "center" }]} testID="pay-loading">
        <ActivityIndicator color={colors.cyan} size="large" />
      </SafeAreaView>
    );
  }

  if (err && !driver) {
    return (
      <SafeAreaView style={styles.root} testID="pay-error-screen">
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.close}>
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>
        <View style={{ padding: 20, alignItems: "center", marginTop: 40 }}>
          <Ionicons name="alert-circle" size={56} color={colors.red} />
          <Text style={styles.title}>Driver not found</Text>
          <Text style={styles.sub}>{err}</Text>
          <View style={{ height: 16 }} />
          <Button label="Try again" onPress={() => router.back()} variant="secondary" />
        </View>
      </SafeAreaView>
    );
  }

  if (stage === "success" && driver && resultTxn) {
    return (
      <SafeAreaView style={styles.root} testID="pay-success-screen">
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <View style={{ alignItems: "center", marginTop: 40 }}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark" size={48} color={colors.bg} />
            </View>
            <Text style={styles.successTitle}>Payment successful</Text>
            <Text style={styles.successAmt} testID="pay-success-amount">{formatNGN(resultTxn.amount)}</Text>
            <Text style={styles.successSub}>paid to {driver.full_name}</Text>
            <Text style={styles.refText}>Ref · {resultTxn.reference}</Text>
          </View>

          <View style={styles.rateBox}>
            <Text style={styles.rateTitle}>How was your ride?</Text>
            <View style={styles.starRow}>
              {[1, 2, 3, 4, 5].map((s) => (
                <TouchableOpacity key={s} onPress={() => !rated && setStars(s)} disabled={rated} testID={`star-${s}`}>
                  <Ionicons name={s <= stars ? "star" : "star-outline"} size={36} color={s <= stars ? colors.yellow : colors.textDim} />
                </TouchableOpacity>
              ))}
            </View>
            {!rated ? (
              <Button
                label="Submit rating"
                onPress={submitRating}
                disabled={stars === 0}
                icon="send"
                testID="rating-submit-btn"
                style={{ marginTop: 12 }}
              />
            ) : (
              <Text style={styles.thanks}>Thanks for your feedback! ⚡</Text>
            )}
          </View>

          <View style={{ height: 12 }} />
          <Button label="Done" onPress={() => router.replace("/(app)")} variant="secondary" testID="pay-done-btn" />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Review / confirm stage
  return (
    <SafeAreaView style={styles.root} testID="pay-review-screen">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={styles.headerRow}>
            <Text style={styles.title}>Pay driver</Text>
            <TouchableOpacity onPress={() => router.back()} style={styles.close} testID="pay-close-btn">
              <Ionicons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          {driver ? (
            <View style={styles.driverCard}>
              <View style={styles.driverAvatar}>
                <Ionicons name="car-sport" size={26} color={colors.cyan} />
              </View>
              <Text style={styles.driverName} testID="pay-driver-name">{driver.full_name}</Text>
              <Text style={styles.driverPhone}>{driver.phone_number}</Text>
              {driver.vehicle_plate ? (
                <View style={styles.plateBox} testID="pay-driver-plate">
                  <Text style={styles.plateLabel}>VEHICLE</Text>
                  <Text style={styles.plateValue}>{driver.vehicle_plate}</Text>
                </View>
              ) : null}
              <View style={styles.driverMeta}>
                {driver.is_verified ? (
                  <View style={[styles.metaPill, { borderColor: colors.green, backgroundColor: colors.greenDim }]}>
                    <Ionicons name="checkmark-circle" size={12} color={colors.green} />
                    <Text style={[styles.metaText, { color: colors.green }]}>Verified</Text>
                  </View>
                ) : null}
                <View style={styles.metaPill}>
                  <Ionicons name="star" size={12} color={colors.yellow} />
                  <Text style={[styles.metaText, { color: colors.yellow }]}>
                    {driver.rating_count > 0 ? `${driver.rating_avg.toFixed(1)} (${driver.rating_count})` : "New"}
                  </Text>
                </View>
              </View>
            </View>
          ) : null}

          <Field
            label="Amount (ZAR)"
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ""))}
            placeholder="0.00"
            keyboardType="decimal-pad"
            testID="pay-amount-input"
            inputStyle={{ fontSize: 28, fontWeight: "800", textAlign: "center", paddingVertical: 22 }}
          />

          <View style={styles.quickRow}>
            {QUICKS.map((q) => (
              <TouchableOpacity key={q} onPress={() => setAmount(String(q))} style={styles.quick} testID={`pay-quick-${q}`}>
                <Text style={styles.quickText}>{formatNGN(q).replace(".00", "")}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="Ride from VI to Lekki" testID="pay-note-input" />

          {err ? <Text style={styles.err} testID="pay-error">{err}</Text> : null}

          <View style={{ height: 12 }} />
          <Button label="Confirm & Pay" onPress={submit} loading={busy} icon="lock-closed" testID="pay-confirm-btn" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, paddingBottom: 8 },
  title: { color: colors.text, fontSize: 24, fontWeight: "800" },
  sub: { color: colors.textMuted, fontSize: 14, marginTop: 8, textAlign: "center" },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg2, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  driverCard: { alignItems: "center", padding: 20, backgroundColor: colors.bg2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: 16 },
  driverAvatar: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: colors.cyanDim, borderWidth: 1, borderColor: colors.cyan },
  driverName: { color: colors.text, fontSize: 20, fontWeight: "800", marginTop: 12 },
  driverPhone: { color: colors.textMuted, marginTop: 4 },
  driverMeta: { flexDirection: "row", gap: 8, marginTop: 12 },
  metaPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  metaText: { fontSize: 11, fontWeight: "700" },
  plateBox: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: "#FFD60A", borderRadius: 8, borderWidth: 2, borderColor: "#0A0A0A" },
  plateLabel: { color: "#666", fontSize: 9, fontWeight: "800", letterSpacing: 1.4, textAlign: "center" },
  plateValue: { color: "#0A0A0A", fontSize: 22, fontWeight: "900", letterSpacing: 2, textAlign: "center", fontFamily: "monospace" },
  quickRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 16 },
  quick: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg2 },
  quickText: { color: colors.text, fontWeight: "700", fontSize: 12 },
  err: { color: colors.red, marginTop: 4 },
  successIcon: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center", backgroundColor: colors.green },
  successTitle: { color: colors.text, fontSize: 24, fontWeight: "800", marginTop: 18 },
  successAmt: { color: colors.green, fontSize: 40, fontWeight: "800", marginTop: 8, letterSpacing: -1 },
  successSub: { color: colors.textMuted, marginTop: 4 },
  refText: { color: colors.textDim, fontSize: 12, marginTop: 12, letterSpacing: 1 },
  rateBox: { marginTop: 32, padding: 20, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.bg2 },
  rateTitle: { color: colors.text, fontSize: 16, fontWeight: "700", textAlign: "center" },
  starRow: { flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 14 },
  thanks: { color: colors.green, textAlign: "center", marginTop: 12, fontWeight: "700" },
});
