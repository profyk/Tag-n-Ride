import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Image, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
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

// ── Camera photo picker ───────────────────────────────────────
function PhotoPicker({ label, hint, value, onPick, front = false, aspect = [4, 3] as [number, number], colors }: {
  label: string; hint: string; value: any; onPick: (v: any) => void;
  front?: boolean; aspect?: [number, number]; colors: any;
}) {
  const pick = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") { Alert.alert("Permission needed", "Camera access required."); return; }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect, quality: 0.8,
      cameraType: front ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      onPick({ uri: a.uri, type: "image/jpeg", name: `${label.toLowerCase().replace(/ /g, "_")}.jpg` });
    }
  };
  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, marginBottom: 6 }}>
        {label.toUpperCase()}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 12 }}>{hint}</Text>
      {value ? (
        <View>
          <Image source={{ uri: value.uri }}
            style={{ width: "100%", aspectRatio: aspect[0] / aspect[1], borderRadius: radius.md, borderWidth: 2, borderColor: colors.green }} />
          <TouchableOpacity onPress={pick}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "center", marginTop: 10, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: colors.cyanDim, borderRadius: 999, borderWidth: 1, borderColor: colors.cyan }}>
            <Ionicons name="refresh" size={14} color={colors.cyan} />
            <Text style={{ color: colors.cyan, fontWeight: "700", fontSize: 13 }}>Retake</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity onPress={pick}
          style={{ backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 28, alignItems: "center" }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.cyanDim, borderWidth: 1, borderColor: colors.cyan, alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
            <Ionicons name={front ? "person" : "card"} size={26} color={colors.cyan} />
          </View>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>{label}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
            {front ? "Front camera" : "Back camera"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const TOTAL_STEPS = 5;

export default function OwnerRegister() {
  const router = useRouter();
  const { signUp } = useAuth();
  const { colors } = useTheme();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

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

  // Step 3 — Driver mode
  const [driverMode, setDriverMode] = useState<boolean | null>(null);

  // Step 4 — KYC
  const [selfie, setSelfie] = useState<any>(null);
  const [licenceFront, setLicenceFront] = useState<any>(null);

  // Step 5 — Link first driver
  const [firstDriverCode, setFirstDriverCode] = useState("");

  const pwStrength = passwordStrength(password);
  const s = makeStyles(colors);

  const next = () => setStep((v) => Math.min(v + 1, TOTAL_STEPS));
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
    next();
  };

  // ── Step 2: Credentials (password then PIN) ───────────────
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

  const submitPin = () => {
    if (pinSubStep === "create") {
      if (pin.length !== 4) { Alert.alert("Required", "Please enter a 4-digit PIN."); return; }
      setPinSubStep("confirm"); setPinConfirm(""); return;
    }
    if (pin !== pinConfirm) {
      Alert.alert("PIN Mismatch", "PINs do not match. Try again.");
      setPinSubStep("create"); setPin(""); setPinConfirm(""); return;
    }
    next();
  };

  // ── Step 3: Driver mode ──────────────────────────────────
  const submitDriverMode = () => {
    if (driverMode === null) { Alert.alert("Required", "Please select an option."); return; }
    if (driverMode) { next(); } else { setStep(5); }
  };

  // ── Step 4: KYC ──────────────────────────────────────────
  const submitKYC = () => {
    if (!selfie) { Alert.alert("Required", "Please take a selfie."); return; }
    if (!licenceFront) { Alert.alert("Required", "Please photograph your licence."); return; }
    next();
  };

  // ── Step 5: Final submit ──────────────────────────────────
  const submitRegister = async () => {
    setLoading(true);
    try {
      // signUp stores the token AND sets auth state directly from the registration
      // response — no second api.me() call that could fail and clear the token.
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
        driver_mode: driverMode === true,
      });
      // KYC and driver link are best-effort — failures must not block navigation.
      if (driverMode && selfie && licenceFront) {
        try { await api.kycSubmit(selfie, licenceFront); } catch {}
      }
      if (firstDriverCode.trim()) {
        try { await api.ownerLinkDriver(firstDriverCode.trim().toUpperCase()); } catch {}
      }
      router.replace("/owner/dashboard");
    } catch (e: any) {
      Alert.alert("Registration Failed", e?.message || "Please try again.");
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

              {/* Strength indicator */}
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
                value={pinSubStep === "create" ? pin : pinConfirm}
                onChange={pinSubStep === "create" ? setPin : setPinConfirm}
                colors={colors}
              />
              <TouchableOpacity
                style={[s.primaryBtn, { marginTop: 32, opacity: (pinSubStep === "create" ? pin : pinConfirm).length !== 4 ? 0.4 : 1 }]}
                onPress={submitPin}
                disabled={(pinSubStep === "create" ? pin : pinConfirm).length !== 4}>
                <Text style={s.primaryBtnText}>{pinSubStep === "create" ? "Continue" : "Confirm PIN"}</Text>
                <Ionicons name="arrow-forward" size={18} color={colors.bg} />
              </TouchableOpacity>
            </View>
          )}

          {/* ── STEP 3: Driver mode ── */}
          {step === 3 && (
            <View>
              <View style={s.iconWrap}><Ionicons name="car-sport-outline" size={28} color={colors.cyan} /></View>
              <Text style={s.stepTitle}>Do you also drive?</Text>
              <Text style={s.stepSub}>As a fleet owner you can also drive and accept passenger payments directly.</Text>
              <TouchableOpacity
                style={[s.choiceCard, driverMode === true && s.choiceCardActiveCyan]}
                onPress={() => setDriverMode(true)}>
                <View style={[s.choiceIcon, driverMode === true && { backgroundColor: colors.cyanDim }]}>
                  <Ionicons name="car" size={24} color={driverMode === true ? colors.cyan : colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.choiceTitle, driverMode === true && { color: colors.cyan }]}>Yes, I also drive</Text>
                  <Text style={s.choiceSub}>Receive passenger payments and manage your fleet. KYC required.</Text>
                </View>
                {driverMode === true && <Ionicons name="checkmark-circle" size={22} color={colors.cyan} />}
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.choiceCard, driverMode === false && s.choiceCardActiveGreen]}
                onPress={() => setDriverMode(false)}>
                <View style={[s.choiceIcon, { backgroundColor: driverMode === false ? colors.greenDim : colors.bg2 }]}>
                  <Ionicons name="business" size={24} color={driverMode === false ? colors.green : colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.choiceTitle, driverMode === false && { color: colors.green }]}>Owner only</Text>
                  <Text style={s.choiceSub}>I manage my fleet. Drivers receive payments on my behalf.</Text>
                </View>
                {driverMode === false && <Ionicons name="checkmark-circle" size={22} color={colors.green} />}
              </TouchableOpacity>
              <TouchableOpacity style={[s.primaryBtn, { opacity: driverMode === null ? 0.4 : 1 }]}
                onPress={submitDriverMode} disabled={driverMode === null}>
                <Text style={s.primaryBtnText}>Continue</Text>
                <Ionicons name="arrow-forward" size={18} color={colors.bg} />
              </TouchableOpacity>
            </View>
          )}

          {/* ── STEP 4: KYC ── */}
          {step === 4 && (
            <View>
              <View style={s.iconWrap}><Ionicons name="shield-checkmark-outline" size={28} color={colors.cyan} /></View>
              <Text style={s.stepTitle}>Identity Verification</Text>
              <Text style={s.stepSub}>To activate driver mode we need to verify your identity.</Text>
              <PhotoPicker label="Selfie" hint="Clear photo of your face using the front camera."
                value={selfie} onPick={setSelfie} front aspect={[1, 1]} colors={colors} />
              <PhotoPicker label="Driver's Licence (Front)" hint="Place licence on a flat surface — all text must be readable."
                value={licenceFront} onPick={setLicenceFront} aspect={[4, 3]} colors={colors} />
              <View style={s.tipsCard}>
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13, marginBottom: 10 }}>Tips for fast approval</Text>
                {["Face clearly visible, good lighting", "All licence text readable, no blur", "No shadows or glare on documents"].map((t, i) => (
                  <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
                    <Ionicons name="checkmark-circle-outline" size={14} color={colors.green} style={{ marginTop: 2 }} />
                    <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20, flex: 1 }}>{t}</Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity style={[s.primaryBtn, { opacity: (!selfie || !licenceFront) ? 0.4 : 1 }]}
                onPress={submitKYC} disabled={!selfie || !licenceFront}>
                <Text style={s.primaryBtnText}>Continue</Text>
                <Ionicons name="arrow-forward" size={18} color={colors.bg} />
              </TouchableOpacity>
            </View>
          )}

          {/* ── STEP 5: Add first driver ── */}
          {step === 5 && (
            <View>
              <View style={s.iconWrap}><Ionicons name="people-outline" size={28} color={colors.cyan} /></View>
              <Text style={s.stepTitle}>Add Your First Driver</Text>
              <Text style={s.stepSub}>Enter a driver's TNR code to link them to your fleet. You can skip and add drivers later.</Text>
              <Text style={s.label}>DRIVER TNR CODE <Text style={{ color: colors.textDim }}>— optional</Text></Text>
              <TextInput style={s.input} value={firstDriverCode}
                onChangeText={(t) => setFirstDriverCode(t.toUpperCase())}
                placeholder="TNR0000000000000" placeholderTextColor={colors.textDim} autoCapitalize="characters" />
              {driverMode && (
                <View style={s.infoCard}>
                  <Ionicons name="time-outline" size={16} color={colors.cyan} />
                  <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18, flex: 1 }}>
                    Your KYC documents have been submitted for review. Driver mode activates once verified (usually 24–48 hrs).
                  </Text>
                </View>
              )}
              <TouchableOpacity style={s.primaryBtn} onPress={submitRegister} disabled={loading}>
                {loading ? <ActivityIndicator color={colors.bg} /> : (
                  <>
                    <Text style={s.primaryBtnText}>{firstDriverCode.trim() ? "Add Driver & Finish" : "Finish Setup"}</Text>
                    <Ionicons name="checkmark" size={18} color={colors.bg} />
                  </>
                )}
              </TouchableOpacity>
              {!loading && (
                <TouchableOpacity style={{ alignItems: "center", marginTop: 16 }} onPress={submitRegister}>
                  <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: "600" }}>Skip for now</Text>
                </TouchableOpacity>
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
  choiceCard: { backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16, flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 12 },
  choiceCardActiveCyan: { borderColor: colors.cyan, backgroundColor: colors.cyanDim },
  choiceCardActiveGreen: { borderColor: colors.green, backgroundColor: colors.greenDim },
  choiceIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  choiceTitle: { color: colors.text, fontWeight: "700", fontSize: 15, marginBottom: 4 },
  choiceSub: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  tipsCard: { backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 20 },
  infoCard: { flexDirection: "row", gap: 10, alignItems: "flex-start", backgroundColor: colors.cyanDim, borderRadius: radius.md, borderWidth: 1, borderColor: colors.cyan + "50", padding: 14, marginBottom: 16 },
});
