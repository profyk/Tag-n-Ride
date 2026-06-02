import React, { useState } from "react";
import {
  View, Text, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, TouchableOpacity, Image, ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Field, PoweredBy } from "../../src/ui";
import { colors, radius } from "../../src/theme";
import { api, tokenStore } from "../../src/api";
import { useAuth } from "../../src/AuthContext";

export default function OwnerLogin() {
  const router = useRouter();
  const { refresh } = useAuth();

  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setErr(null);
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email.trim())) {
      setErr("Enter the email address you registered with");
      return;
    }
    if (pin.length !== 4) {
      setErr("Enter your 4-digit PIN");
      return;
    }
    setLoading(true);
    try {
      const r = await api.ownerLogin({ email: email.trim().toLowerCase(), pin });
      await tokenStore.set(r.token);
      await refresh();
      router.replace("/owner");
    } catch (e: any) {
      setErr(e?.message || "Login failed. Check your email and PIN.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled">

          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </TouchableOpacity>

          <Image
            source={require("../../assets/images/icon.png")}
            style={styles.logo}
            resizeMode="contain"
          />

          <View style={styles.badge}>
            <Ionicons name="business-outline" size={16} color={colors.cyan} />
            <Text style={styles.badgeText}>Fleet Owner Portal</Text>
          </View>

          <Text style={styles.title}>Owner Sign In</Text>
          <Text style={styles.sub}>Sign in with your registered email and PIN</Text>

          <View style={{ height: 28 }} />

          <Field
            label="Email address"
            placeholder="jane@example.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            testID="owner-login-email"
          />
          <Field
            label="4-digit PIN"
            placeholder="••••"
            value={pin}
            onChangeText={(t) => setPin(t.replace(/[^0-9]/g, "").slice(0, 4))}
            keyboardType="number-pad"
            secureTextEntry
            toggleSecure
            maxLength={4}
            testID="owner-login-pin"
          />

          {err ? <Text style={styles.err}>{err}</Text> : null}

          <View style={{ height: 16 }} />

          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.cyan} />
              <Text style={styles.loadingText}>Signing in...</Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.btn} onPress={onSubmit}>
              <Ionicons name="business-outline" size={18} color={colors.bg} />
              <Text style={styles.btnText}>Sign In as Owner</Text>
            </TouchableOpacity>
          )}

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>not an owner?</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => router.replace("/(auth)/login")}>
            <Text style={styles.secondaryBtnText}>Passenger / Driver Sign In</Text>
          </TouchableOpacity>

          <View style={{ height: 12 }} />

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => router.push("/(auth)/owner-register")}>
            <Text style={styles.secondaryBtnText}>Create Fleet Owner Account</Text>
          </TouchableOpacity>

          <PoweredBy />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: 24, paddingBottom: 40 },
  back: {
    width: 40, height: 40,
    alignItems: "flex-start", justifyContent: "center", marginTop: 8,
  },
  logo: { width: 90, height: 90, alignSelf: "center", marginVertical: 8 },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "center",
    backgroundColor: colors.cyanDim, borderWidth: 1, borderColor: colors.cyan,
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 12,
  },
  badgeText: { color: colors.cyan, fontWeight: "700", fontSize: 12 },
  title: { color: colors.text, fontSize: 26, fontWeight: "800" },
  sub: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
  err: { color: colors.red, fontSize: 13, marginTop: 4 },
  loadingRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    justifyContent: "center", padding: 16,
  },
  loadingText: { color: colors.textMuted, fontSize: 13 },
  btn: {
    backgroundColor: colors.cyan, borderRadius: radius.md,
    paddingVertical: 16, flexDirection: "row",
    alignItems: "center", justifyContent: "center", gap: 8,
  },
  btnText: { color: colors.bg, fontWeight: "800", fontSize: 16 },
  divider: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginVertical: 20,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.textMuted, fontSize: 12 },
  secondaryBtn: {
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingVertical: 14,
    alignItems: "center", backgroundColor: colors.bg2,
  },
  secondaryBtnText: { color: colors.textMuted, fontWeight: "600", fontSize: 14 },
});
