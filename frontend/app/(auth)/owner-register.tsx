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
import { colors, radius } from "../../src/theme";

function StepBar({ step, total }: { step: number; total: number }) {
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

function PinInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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

function PhotoPicker({ label, hint, value, onPick, front = false, aspect = [4, 3] as [number, number] }: {
  label: string; hint: string; value: any; onPick: (v: any) => void;
  front?: boolean; aspect?: [number, number];
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
      <Text style={styles.label}>{label.toUpperCase()}</Text>
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
  const { signIn } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const [fullName, setFullName] = useState("");
  const [surname, setSurname] = useState("");
  const [phone, setPhone] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");

  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinStep, setPinStep] = useState<"create" | "confirm">("create");

  const [driverMode, setDriverMode] = useState<boolean | null>(null);
  const [selfie, setSelfie] = useState<any>(null);
  const [licenceFront, setLicenceFront] = useState<any>(null);
  const [firstDriverCode, setFirstDriverCode] = useState("");

  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  const back = () => { if (step === 1) { router.back(); return; } setStep((s) => s - 1); };

  const submitStep1 = () => {
    if (!fullName.trim()) { Alert.alert("Required", "Please enter your first name."); return; }
    if (!surname.trim()) { Alert.alert("Required", "Please enter your surname."); return; }
    if (!phone.trim() || phone.length < 10) { Alert.alert("Required", "Please enter a valid phone number."); return; }
    next();
  };

  const submitPin = () => {
    if (pinStep === "create") {
      if (pin.length !== 4) { Alert.alert("Required", "Please enter a 4-digit PIN."); return; }
      setPinStep("confirm"); setPinConfirm(""); return;
    }
    if (pin !== pinConfirm) {
      Alert.alert("PIN Mismatch", "PINs do not match. Please try again.");
      setPinStep("create"); setPin(""); setPinConfirm(""); return;
    }
    next();
  };

  const submitDriverMode = () => {
    if (driverMode === null) { Alert.alert("Required", "Please select an option."); return; }
    if (driverMode) { next(); } else { setStep(5); }
  };

  const submitKYC = () => {
    if (!selfie) { Alert.alert("Required", "Please take a selfie."); return; }
    if (!licenceFront) { Alert.alert("Required", "Please photograph your licence."); return; }
    next();
  };

  const submitRegister = async () => {
    setLoading(true);
    try {
      await api.register({
        full_name: fullName.trim(),
        surname: surname.trim(),
        phone_number: phone.trim(),
        pin, role: "owner",
        business_name: businessName.trim() || undefined,
        id_number: idNumber.trim() || undefined,
        email: email.trim() || undefined,
      });
      await signIn(phone.trim(), pin);
      if (driverMode && selfie && licenceFront) {
        await api.kycSubmit(selfie, licenceFront);
      }
      if (firstDriverCode.trim()) {
        try { await api.ownerLinkDriver(firstDriverCode.trim().toUpperCase()); } catch {}
      }
      router.replace("/owner");
    } catch (e: any) {
      Alert.alert("Registration Failed", e?.message || "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          <TouchableOpacity onPress={back} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <StepBar step={step} total={TOTAL_STEPS} />

          {step === 1 && (
            <View>
              <View style={styles.iconWrap}><Ionicons name="business-outline" size={28} color={colors.cyan} /></View>
              <Text style={styles.stepTitle}>Fleet Owner Setup</Text>
              <Text style={styles.stepSub}>Set up your Tag n Ride fleet owner account.</Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>FIRST NAME</Text>
                  <TextInput style={styles.input} value={fullName} onChangeText={setFullName}
                    placeholder="Jane" placeholderTextColor={colors.textDim} autoCapitalize="words" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>SURNAME</Text>
                  <TextInput style={styles.input} value={surname} onChangeText={setSurname}
                    placeholder="Doe" placeholderTextColor={colors.textDim} autoCapitalize="words" />
                </View>
              </View>
              <Text style={styles.label}>ID / PASSPORT NUMBER</Text>
              <TextInput style={styles.input} value={idNumber} onChangeText={setIdNumber}
                placeholder="8001015009087" placeholderTextColor={colors.textDim} autoCapitalize="characters" />
              <Text style={styles.label}>PHONE NUMBER</Text>
              <TextInput style={styles.input} value={phone} onChangeText={setPhone}
                placeholder="+27 XX XXX XXXX" placeholderTextColor={colors.textDim} keyboardType="phone-pad" />
              <Text style={styles.label}>EMAIL (OPTIONAL)</Text>
              <TextInput style={styles.input} value={email} onChangeText={setEmail}
                placeholder="jane@example.com" placeholderTextColor={colors.textDim} keyboardType="email-address" autoCapitalize="none" />
              <Text style={styles.label}>BUSINESS NAME (OPTIONAL)</Text>
              <TextInput style={styles.input} value={businessName} onChangeText={setBusinessName}
                placeholder="e.g. Profy Fleet Services" placeholderTextColor={colors.textDim} autoCapitalize="words" />
              <TouchableOpacity style={styles.primaryBtn} onPress={submitStep1}>
                <Text style={styles.primaryBtnText}>Continue</Text>
                <Ionicons name="arrow-forward" size={18} color={colors.bg} />
              </TouchableOpacity>
            </View>
          )}

          {step === 2 && (
            <View>
              <View style={styles.iconWrap}><Ionicons name="lock-closed-outline" size={28} color={colors.cyan} /></View>
              <Text style={styles.stepTitle}>{pinStep === "create" ? "Create PIN" : "Confirm PIN"}</Text>
              <Text style={styles.stepSub}>
                {pinStep === "create" ? "Create a 4-digit PIN to secure your account." : "Enter your PIN again to confirm."}
              </Text>
              <PinInput value={pinStep === "create" ? pin : pinConfirm}
                onChange={pinStep === "create" ? setPin : setPinConfirm} />
              <TouchableOpacity style={[styles.primaryBtn, { marginTop: 32, opacity: (pinStep === "create" ? pin : pinConfirm).length !== 4 ? 0.4 : 1 }]}
                onPress={submitPin} disabled={(pinStep === "create" ? pin : pinConfirm).length !== 4}>
                <Text style={styles.primaryBtnText}>{pinStep === "create" ? "Continue" : "Confirm PIN"}</Text>
                <Ionicons name="arrow-forward" size={18} color={colors.bg} />
              </TouchableOpacity>
            </View>
          )}

          {step === 3 && (
            <View>
              <View style={styles.iconWrap}><Ionicons name="car-sport-outline" size={28} color={colors.cyan} /></View>
              <Text style={styles.stepTitle}>Do you also drive?</Text>
              <Text style={styles.stepSub}>As a fleet owner you can also drive and receive passenger payments directly.</Text>
              <TouchableOpacity style={[styles.choiceCard, driverMode === true && styles.choiceCardActive]} onPress={() => setDriverMode(true)}>
                <View style={styles.choiceIcon}><Ionicons name="car" size={24} color={driverMode === true ? colors.cyan : colors.textMuted} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.choiceTitle, driverMode === true && { color: colors.cyan }]}>Yes, I also drive</Text>
                  <Text style={styles.choiceSub}>Receive passenger payments and manage your fleet. KYC required.</Text>
                </View>
                {driverMode === true && <Ionicons name="checkmark-circle" size={22} color={colors.cyan} />}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.choiceCard, driverMode === false && { borderColor: colors.green, backgroundColor: colors.greenDim }]} onPress={() => setDriverMode(false)}>
                <View style={[styles.choiceIcon, { backgroundColor: colors.greenDim }]}><Ionicons name="business" size={24} color={driverMode === false ? colors.green : colors.textMuted} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.choiceTitle, driverMode === false && { color: colors.green }]}>Owner only</Text>
                  <Text style={styles.choiceSub}>I manage the fleet and drivers only. No passenger payments.</Text>
                </View>
                {driverMode === false && <Ionicons name="checkmark-circle" size={22} color={colors.green} />}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryBtn, { opacity: driverMode === null ? 0.4 : 1 }]}
                onPress={submitDriverMode} disabled={driverMode === null}>
                <Text style={styles.primaryBtnText}>Continue</Text>
                <Ionicons name="arrow-forward" size={18} color={colors.bg} />
              </TouchableOpacity>
            </View>
          )}

          {step === 4 && (
            <View>
              <View style={styles.iconWrap}><Ionicons name="shield-checkmark-outline" size={28} color={colors.cyan} /></View>
              <Text style={styles.stepTitle}>Identity Verification</Text>
              <Text style={styles.stepSub}>To activate driver mode we need to verify your identity.</Text>
              <PhotoPicker label="Selfie" hint="Clear photo of your face using the front camera."
                value={selfie} onPick={setSelfie} front aspect={[1, 1]} />
              <PhotoPicker label="Driver's Licence (Front)" hint="Place licence flat on a surface, all text must be readable."
                value={licenceFront} onPick={setLicenceFront} aspect={[4, 3]} />
              <View style={styles.tipsCard}>
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13, marginBottom: 10 }}>Tips for fast approval</Text>
                {["Face clearly visible, good lighting", "All licence text must be readable", "No shadows or glare"].map((t, i) => (
                  <Text key={i} style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>• {t}</Text>
                ))}
              </View>
              <TouchableOpacity style={[styles.primaryBtn, { opacity: (!selfie || !licenceFront) ? 0.4 : 1 }]}
                onPress={submitKYC} disabled={!selfie || !licenceFront}>
                <Text style={styles.primaryBtnText}>Continue</Text>
                <Ionicons name="arrow-forward" size={18} color={colors.bg} />
              </TouchableOpacity>
            </View>
          )}

          {step === 5 && (
            <View>
              <View style={styles.iconWrap}><Ionicons name="people-outline" size={28} color={colors.cyan} /></View>
              <Text style={styles.stepTitle}>Add Your First Driver</Text>
              <Text style={styles.stepSub}>Enter a driver's TNR code to link them to your fleet. You can skip this.</Text>
              <Text style={styles.label}>DRIVER TNR CODE (OPTIONAL)</Text>
              <TextInput style={styles.input} value={firstDriverCode}
                onChangeText={(t) => setFirstDriverCode(t.toUpperCase())}
                placeholder="e.g. TNR6590603682530" placeholderTextColor={colors.textDim} autoCapitalize="characters" />
              {driverMode && (
                <View style={styles.infoCard}>
                  <Ionicons name="information-circle-outline" size={18} color={colors.cyan} />
                  <Text style={{ color: colors.text, fontSize: 13, lineHeight: 18, flex: 1 }}>
                    Your KYC documents have been submitted. Driver mode activates once verified (24-48 hours).
                  </Text>
                </View>
              )}
              <TouchableOpacity style={styles.primaryBtn} onPress={submitRegister} disabled={loading}>
                {loading ? <ActivityIndicator color={colors.bg} /> : (
                  <>
                    <Text style={styles.primaryBtnText}>{firstDriverCode.trim() ? "Add Driver & Finish" : "Finish Setup"}</Text>
                    <Ionicons name="checkmark" size={18} color={colors.bg} />
                  </>
                )}
              </TouchableOpacity>
              {!loading && (
                <TouchableOpacity style={{ alignItems: "center", marginTop: 16 }}
                  onPress={() => { setFirstDriverCode(""); submitRegister(); }}>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 24, paddingBottom: 60, flexGrow: 1 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  iconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.cyanDim, borderWidth: 1, borderColor: colors.cyan, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  stepTitle: { color: colors.text, fontSize: 26, fontWeight: "800", marginBottom: 8 },
  stepSub: { color: colors.textMuted, fontSize: 15, lineHeight: 22, marginBottom: 28 },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, marginBottom: 8 },
  input: { backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 14, color: colors.text, fontSize: 15, marginBottom: 16 },
  primaryBtn: { backgroundColor: colors.cyan, borderRadius: radius.md, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8 },
  primaryBtnText: { color: colors.bg, fontWeight: "800", fontSize: 16 },
  choiceCard: { backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16, flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 12 },
  choiceCardActive: { borderColor: colors.cyan, backgroundColor: colors.cyanDim },
  choiceIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.cyanDim, alignItems: "center", justifyContent: "center" },
  choiceTitle: { color: colors.text, fontWeight: "700", fontSize: 15, marginBottom: 4 },
  choiceSub: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  tipsCard: { backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 20 },
  infoCard: { flexDirection: "row", gap: 10, alignItems: "flex-start", backgroundColor: colors.cyanDim, borderRadius: radius.md, borderWidth: 1, borderColor: colors.cyan, padding: 14, marginBottom: 16 },
});
