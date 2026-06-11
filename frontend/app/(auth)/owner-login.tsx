import React, { useState } from "react";
import {
  View, Text, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, TouchableOpacity, Image, ActivityIndicator,
  TextInput, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { PoweredBy } from "../../src/ui";
import { useTheme } from "../../src/ThemeContext";
import { radius } from "../../src/theme";
import { useAuth } from "../../src/AuthContext";

export default function OwnerLogin() {
  const router = useRouter();
  const { signInOwner } = useAuth();
  const { colors } = useTheme();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setErr(null);
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email.trim())) {
      setErr("Enter the email address you registered with");
      return;
    }
    if (!password.trim() || password.length < 8) {
      setErr("Enter your password (at least 8 characters)");
      return;
    }
    setLoading(true);
    try {
      await signInOwner(email.trim().toLowerCase(), password);
      router.replace("/owner");
    } catch (e: any) {
      setErr(e?.message || "Login failed. Check your email and password.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    Alert.alert(
      "Reset Password",
      "To reset your password, contact Tag n Ride support:\n\n📱 WhatsApp: +27 83 278 9333\n📧 support@tagnride.com\n\nWe will verify your identity and reset your password.",
      [{ text: "OK" }]
    );
  };

  const s = makeStyles(colors);

  return (
    <SafeAreaView style={s.root}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          <TouchableOpacity onPress={() => router.back()} style={s.back}>
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </TouchableOpacity>

          <Image source={require("../../assets/images/icon.png")} style={s.logo} resizeMode="contain" />

          <View style={s.badge}>
            <Ionicons name="business-outline" size={16} color={colors.cyan} />
            <Text style={s.badgeText}>Fleet Owner Portal</Text>
          </View>

          <Text style={s.title}>Owner Sign In</Text>
          <Text style={s.sub}>Sign in with your registered email and password</Text>

          <View style={{ height: 28 }} />

          {/* Email */}
          <Text style={s.label}>EMAIL ADDRESS</Text>
          <TextInput
            style={s.input}
            value={email}
            onChangeText={setEmail}
            placeholder="jane@example.com"
            placeholderTextColor={colors.textDim}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            testID="owner-login-email"
          />

          {/* Password */}
          <Text style={s.label}>PASSWORD</Text>
          <View style={s.passwordRow}>
            <TextInput
              style={[s.input, { flex: 1, marginBottom: 0 }]}
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              placeholderTextColor={colors.textDim}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="password"
              testID="owner-login-password"
            />
            <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={s.eyeBtn}>
              <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Forgot password */}
          <TouchableOpacity onPress={handleForgotPassword} style={s.forgotRow} testID="forgot-password-btn">
            <Text style={s.forgotText}>Forgot password?</Text>
          </TouchableOpacity>

          {err ? <Text style={s.err} testID="owner-login-error">{err}</Text> : null}

          <View style={{ height: 16 }} />

          {loading ? (
            <View style={s.loadingRow}>
              <ActivityIndicator color={colors.cyan} />
              <Text style={s.loadingText}>Signing in…</Text>
            </View>
          ) : (
            <TouchableOpacity style={s.btn} onPress={onSubmit} testID="owner-login-btn">
              <Ionicons name="business-outline" size={18} color={colors.bg} />
              <Text style={s.btnText}>Sign In as Owner</Text>
            </TouchableOpacity>
          )}

          <View style={s.divider}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>not an owner?</Text>
            <View style={s.dividerLine} />
          </View>

          <TouchableOpacity style={s.secondaryBtn} onPress={() => router.replace("/(auth)/login")}>
            <Text style={s.secondaryBtnText}>Passenger / Driver Sign In</Text>
          </TouchableOpacity>

          <View style={{ height: 12 }} />

          <TouchableOpacity style={s.secondaryBtn} onPress={() => router.push("/(auth)/owner-register")}>
            <Text style={s.secondaryBtnText}>Create Fleet Owner Account</Text>
          </TouchableOpacity>

          <PoweredBy />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: 24, paddingBottom: 40 },
  back: { width: 40, height: 40, alignItems: "flex-start", justifyContent: "center", marginTop: 8 },
  logo: { width: 90, height: 90, alignSelf: "center", marginVertical: 8 },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "center",
    backgroundColor: colors.cyanDim, borderWidth: 1, borderColor: colors.cyan,
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 12,
  },
  badgeText: { color: colors.cyan, fontWeight: "700", fontSize: 12 },
  title: { color: colors.text, fontSize: 26, fontWeight: "800" },
  sub: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, marginBottom: 8 },
  input: {
    backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 14,
    color: colors.text, fontSize: 15, marginBottom: 16,
  },
  passwordRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  eyeBtn: {
    width: 48, height: 50, backgroundColor: colors.bg2, borderWidth: 1,
    borderColor: colors.border, borderRadius: radius.md,
    alignItems: "center", justifyContent: "center",
  },
  forgotRow: { alignItems: "flex-end", marginBottom: 8 },
  forgotText: { color: colors.cyan, fontSize: 13, fontWeight: "600" },
  err: { color: colors.red, fontSize: 13, marginTop: 4 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 12, justifyContent: "center", padding: 16 },
  loadingText: { color: colors.textMuted, fontSize: 13 },
  btn: {
    backgroundColor: colors.cyan, borderRadius: radius.md, paddingVertical: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
  },
  btnText: { color: colors.bg, fontWeight: "800", fontSize: 16 },
  divider: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.textMuted, fontSize: 12 },
  secondaryBtn: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingVertical: 14, alignItems: "center", backgroundColor: colors.bg2,
  },
  secondaryBtnText: { color: colors.textMuted, fontWeight: "600", fontSize: 14 },
});
