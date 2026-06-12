import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Keyboard, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/AuthContext";
import { useTheme } from "../../src/ThemeContext";
import { radius } from "../../src/theme";

// ── Step bar ──────────────────────────────────────────────────
function StepBar({ step, total, colors }: { step: number; total: number; colors: any }) {
  return (
    <View style={{ flexDirection: "row", gap: 6, marginBottom: 28 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={{
          flex: 1, height: 4, borderRadius: 2,
          backgroundColor: i < step ? colors.cyan : colors.border,
        }} />
      ))}
    </View>
  );
}

// ── PIN dot input ─────────────────────────────────────────────
function PinInput({ value, onChange, colors }: { value: string; onChange: (v: string) => void; colors: any }) {
  return (
    <View style={{ flexDirection: "row", gap: 12, justifyContent: "center", position: "relative" }}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={{
          width: 60, height: 60, borderRadius: 14, borderWidth: 2,
          borderColor: value.length > i ? colors.cyan : colors.border,
          backgroundColor: value.length > i ? colors.cyanDim : colors.bg2,
          alignItems: "center", justifyContent: "center",
        }}>
          <Text style={{ color: colors.cyan, fontSize: 24 }}>{value[i] ? "●" : ""}</Text>
        </View>
      ))}
      <TextInput
        style={{ position: "absolute", opacity: 0, width: "100%", height: "100%" }}
        value={value}
        onChangeText={(t) => { if (/^\d*$/.test(t) && t.length <= 4) onChange(t); }}
        keyboardType="numeric"
        maxLength={4}
        autoFocus
        caretHidden
      />
    </View>
  );
}

// ── Password strength ─────────────────────────────────────────
function passwordStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: "", color: "transparent" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score, label: "Weak", color: "#FF3B30" };
  if (score <= 2) return { score, label: "Fair", color: "#FF9500" };
  if (score <= 3) return { score, label: "Good", color: "#FFD60A" };
  return { score, label: "Strong", color: "#39FF14" };
}

const TOTAL_STEPS = 2;

export default function OwnerRegister() {
  const router = useRouter();
  const { signUp } = useAuth();
  const { colors } = useTheme();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [regError, setRegError] = useState("");

  // Step 1 — Identity
  const [fullName, setFullName] = useState("");
  const [surname, setSurname] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [businessName, setBusinessName] = useState("");

  // Step 2 — Credentials
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinSubStep, setPinSubStep] = useState<"create" | "confirm">("create");
  const [credSubStep, setCredSubStep] = useState<"password" | "pin">("password");

  const pwStrength = passwordStrength(password);
  const s = makeStyles(colors);

  const back = () => {
    if (step === 2 && credSubStep === "pin") { setCredSubStep("password"); return; }
    if (step === 1) { router.back(); return; }
    setStep((v) => v - 1);
  };

  // ── Step 1: Identity ──────────────────────────────────────
  const submitStep1 = () => {
    if (!fullName.trim()) { Alert.alert("Required", "Please enter your first name."); return; }
    if (!surname.trim()) { Alert.alert("Required", "Please enter your surname."); return; }
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email.trim())) {
      Alert.alert("Required", "Please enter a valid email address. You'll use it to sign in."); return;
    }
    setStep(2);
  };

  // ── Step 2a: Password ─────────────────────────────────────
  const submitPassword = () => {
    if (password.length < 8) {
      Alert.alert("Too short", "Password must be at least 8 characters."); return;
    }
    if (password !== passwordConfirm) {
      Alert.alert("Mismatch", "Passwords do not match. Please re-enter."); return;
    }
    setCredSubStep("pin");
    setPin(""); setPinConfirm(""); setPinSubStep("create");
  };

  // ── Step 2b: PIN → triggers registration on confirm ───────
  const submitPin = () => {
    if (pinSubStep === "create") {
      if (pin.length !== 4) { Alert.alert("Required", "Please enter a 4-digit PIN."); return; }
      // Don't dismiss keyboard — user still needs it for the confirm step
      setPinSubStep("confirm"); setPinConfirm(""); return;
    }
    // Only dismiss keyboard when we're about to submit
    Keyboard.dismiss();
    if (pin !== pinConfirm) {
      Alert.alert("PIN Mismatch", "PINs do not match. Try again.");
      setPinSubStep("create"); setPin(""); setPinConfirm(""); return;
    }
    submitRegister();
  };

  // ── Register ──────────────────────────────────────────────
  const submitRegister = async () => {
    setRegError("");
    setLoading(true);
    try {
      await signUp({
        full_name: fullName.trim(),
        surname: surname.trim(),
        pin,
        role: "owner",
        email: email.trim().toLowerCase(),
        password: password,
        phone_number: phoneNumber.trim() || undefined,
        business_name: businessName.trim() || undefined,
        id_number: idNumber.trim() || undefined,
      });
      router.replace("/owner/dashboard");
    } catch (e: any) {
      const msg: string = e?.message || "Something went wrong. Please try again.";
      console.error("[owner-register] signUp failed:", msg);
      setRegError(msg);
      if (msg.toLowerCase().includes("email already")) {
        Alert.alert(
          "Email Already Registered",
          "This email address is already linked to an account. Sign in instead.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Sign In", onPress: () => router.replace("/(auth)/owner-login") },
          ]
        );
      } else {
        Alert.alert("Registration Failed", msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          <TouchableOpacity onPress={back} style={s.backBtn}>
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <StepBar step={step} total={TOTAL_STEPS} colors={colors} />

          {/* ── STEP 1: Identity ── */}
          {step === 1 && (
            <View>
              <View style={s.iconWrap}><Ionicons name="business-outline" size={28} color={colors.cyan} /></View>
              <Text style={s.stepTitle}>Fleet Owner Setup</Text>
              <Text style={s.stepSub}>Create your Tag n Ride fleet owner account.</Text>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>FIRST NAME</Text>
                  <TextInput style={s.input} value={fullName} onChangeText={setFullName}
                    placeholder="Jane" placeholderTextColor={colors.textDim} autoCapitalize="words" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>SURNAME</Text>
                  <TextInput style={s.input} value={surname} onChangeText={setSurname}
                    placeholder="Doe" placeholderTextColor={colors.textDim} autoCapitalize="words" />
                </View>
              </View>

              <Text style={s.label}>EMAIL ADDRESS <Text style={{ color: colors.cyan }}>— used to sign in</Text></Text>
              <TextInput style={s.input} value={email} onChangeText={setEmail}
                placeholder="jane@example.com" placeholderTextColor={colors.textDim}
                keyboardType="email-address" autoCapitalize="none" autoComplete="email" />

              <Text style={s.label}>PHONE NUMBER <Text style={{ color: colors.textDim }}>— optional</Text></Text>
              <TextInput style={s.input} value={phoneNumber} onChangeText={setPhoneNumber}
                placeholder="+27 83 123 4567" placeholderTextColor={colors.textDim}
                keyboardType="phone-pad" autoComplete="tel" />

              <Text style={s.label}>BUSINESS NAME <Text style={{ color: colors.textDim }}>— optional</Text></Text>
              <TextInput style={s.input} value={businessName} onChangeText={setBusinessName}
                placeholder="e.g. Profy Fleet Services" placeholderTextColor={colors.textDim} autoCapitalize="words" />

              <Text style={s.label}>ID / PASSPORT NUMBER <Text style={{ color: colors.textDim }}>— optional</Text></Text>
              <TextInput style={s.input} value={idNumber} onChangeText={setIdNumber}
                placeholder="8001015009087" placeholderTextColor={colors.textDim} autoCapitalize="characters" />

              <TouchableOpacity style={s.primaryBtn} onPress={submitStep1}>
                <Text style={s.primaryBtnText}>Continue</Text>
                <Ionicons name="arrow-forward" size={18} color={colors.bg} />
              </TouchableOpacity>
            </View>
          )}

          {/* ── STEP 2a: Password ── */}
          {step === 2 && credSubStep === "password" && (
            <View>
              <View style={s.iconWrap}><Ionicons name="key-outline" size={28} color={colors.cyan} /></View>
              <Text style={s.stepTitle}>Set Your Password</Text>
              <Text style={s.stepSub}>Your password is used to sign in. Make it strong — at least 8 characters.</Text>

              <Text style={s.label}>PASSWORD</Text>
              <View style={s.passwordRow}>
                <TextInput
                  style={[s.input, { flex: 1, marginBottom: 0 }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="At least 8 characters"
                  placeholderTextColor={colors.textDim}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="new-password"
                />
                <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={s.eyeBtn}>
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              {password.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: "row", gap: 4, marginBottom: 4 }}>
                    {[1, 2, 3, 4].map(i => (
                      <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i <= pwStrength.score ? pwStrength.color : colors.border }} />
                    ))}
                  </View>
                  <Text style={{ color: pwStrength.color, fontSize: 11, fontWeight: "700" }}>{pwStrength.label}</Text>
                </View>
              )}

              <Text style={s.label}>CONFIRM PASSWORD</Text>
              <View style={[s.passwordRow, { marginBottom: 8 }]}>
                <TextInput
                  style={[s.input, { flex: 1, marginBottom: 0, borderColor: passwordConfirm && password !== passwordConfirm ? colors.red : colors.border }]}
                  value={passwordConfirm}
                  onChangeText={setPasswordConfirm}
                  placeholder="Repeat your password"
                  placeholderTextColor={colors.textDim}
                  secureTextEntry={!showPasswordConfirm}
                  autoCapitalize="none"
                  autoComplete="new-password"
                />
                <TouchableOpacity onPress={() => setShowPasswordConfirm(v => !v)} style={s.eyeBtn}>
                  <Ionicons name={showPasswordConfirm ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              {passwordConfirm.length > 0 && password !== passwordConfirm && (
                <Text style={{ color: colors.red, fontSize: 12, marginBottom: 12 }}>Passwords do not match</Text>
              )}

              <View style={s.infoCard}>
                <Ionicons name="shield-checkmark-outline" size={16} color={colors.cyan} />
                <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1, lineHeight: 18 }}>
                  You'll also set a 4-digit PIN for in-app security (cashups, payments).
                </Text>
              </View>

              <TouchableOpacity
                style={[s.primaryBtn, { opacity: password.length < 8 || password !== passwordConfirm ? 0.4 : 1 }]}
                onPress={submitPassword}
                disabled={password.length < 8 || password !== passwordConfirm}>
                <Text style={s.primaryBtnText}>Continue to PIN</Text>
                <Ionicons name="arrow-forward" size={18} color={colors.bg} />
              </TouchableOpacity>
            </View>
          )}

          {/* ── STEP 2b: PIN ── */}
          {step === 2 && credSubStep === "pin" && (
            <View>
              <View style={s.iconWrap}><Ionicons name="lock-closed-outline" size={28} color={colors.cyan} /></View>
              <Text style={s.stepTitle}>{pinSubStep === "create" ? "Create Security PIN" : "Confirm Your PIN"}</Text>
              <Text style={s.stepSub}>
                {pinSubStep === "create"
                  ? "Your 4-digit PIN is used for quick in-app actions like cashups."
                  : "Enter your PIN again to confirm."}
              </Text>
              <PinInput
                key={pinSubStep}
                value={pinSubStep === "create" ? pin : pinConfirm}
                onChange={pinSubStep === "create" ? setPin : setPinConfirm}
                colors={colors}
              />
              <TouchableOpacity
                style={[s.primaryBtn, { marginTop: 32, opacity: (pinSubStep === "create" ? pin : pinConfirm).length !== 4 ? 0.4 : 1 }]}
                onPress={submitPin}
                disabled={loading || (pinSubStep === "create" ? pin : pinConfirm).length !== 4}>
                {loading ? <ActivityIndicator color={colors.bg} /> : (
                  <>
                    <Text style={s.primaryBtnText}>{pinSubStep === "create" ? "Continue" : "Create Account"}</Text>
                    <Ionicons name={pinSubStep === "create" ? "arrow-forward" : "checkmark"} size={18} color={colors.bg} />
                  </>
                )}
              </TouchableOpacity>
              {!!regError && (
                <View style={{ backgroundColor: "#FF3B3020", borderRadius: 10, borderWidth: 1, borderColor: "#FF3B30", padding: 12, marginTop: 12 }}>
                  <Text style={{ color: "#FF3B30", fontSize: 13, textAlign: "center" }}>{regError}</Text>
                </View>
              )}
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 24, paddingBottom: 60, flexGrow: 1 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  iconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.cyanDim, borderWidth: 1, borderColor: colors.cyan, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  stepTitle: { color: colors.text, fontSize: 26, fontWeight: "800", marginBottom: 8 },
  stepSub: { color: colors.textMuted, fontSize: 15, lineHeight: 22, marginBottom: 28 },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, marginBottom: 8 },
  input: { backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 14, color: colors.text, fontSize: 15, marginBottom: 16 },
  passwordRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  eyeBtn: { width: 48, height: 50, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  primaryBtn: { backgroundColor: colors.cyan, borderRadius: radius.md, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8 },
  primaryBtnText: { color: colors.bg, fontWeight: "800", fontSize: 16 },
  infoCard: { flexDirection: "row", gap: 10, alignItems: "flex-start", backgroundColor: colors.cyanDim, borderRadius: radius.md, borderWidth: 1, borderColor: colors.cyan + "50", padding: 14, marginBottom: 16 },
});
