import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/AuthContext";
import { useTheme } from "../../src/ThemeContext";
import { api } from "../../src/api";
import { Button } from "../../src/ui";
import { radius } from "../../src/theme";

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const RELATIONSHIPS = ["Spouse", "Parent", "Sibling", "Child", "Friend", "Other"];

export default function SafetyProfileScreen() {
  const router = useRouter();
  const { state } = useAuth();
  const { colors } = useTheme();
  const s = makeStyles(colors);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [profileComplete, setProfileComplete] = useState(false);

  const [idNumber, setIdNumber] = useState("");
  const [dob, setDob] = useState("");
  const [bloodType, setBloodType] = useState("");
  const [medical, setMedical] = useState("");
  const [allergies, setAllergies] = useState("");
  const [homeAddress, setHomeAddress] = useState("");

  const [ec1Name, setEc1Name] = useState("");
  const [ec1Phone, setEc1Phone] = useState("");
  const [ec1Rel, setEc1Rel] = useState("");

  const [ec2Name, setEc2Name] = useState("");
  const [ec2Phone, setEc2Phone] = useState("");
  const [ec2Rel, setEc2Rel] = useState("");

  const [nokName, setNokName] = useState("");
  const [nokPhone, setNokPhone] = useState("");
  const [nokRel, setNokRel] = useState("");

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const p = await api.safetyProfile();
      if (p) {
        setIdNumber(p.id_number || "");
        setDob(p.date_of_birth || "");
        setBloodType(p.blood_type || "");
        setMedical(p.medical_conditions || "");
        setAllergies(p.allergies || "");
        setHomeAddress(p.home_address || "");
        setEc1Name(p.emergency_contact_1_name || "");
        setEc1Phone(p.emergency_contact_1_phone || "");
        setEc1Rel(p.emergency_contact_1_relationship || "");
        setEc2Name(p.emergency_contact_2_name || "");
        setEc2Phone(p.emergency_contact_2_phone || "");
        setEc2Rel(p.emergency_contact_2_relationship || "");
        setNokName(p.next_of_kin_name || "");
        setNokPhone(p.next_of_kin_phone || "");
        setNokRel(p.next_of_kin_relationship || "");
        setProfileComplete(!!p.profile_complete);
      }
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadProfile(); }, []);

  const filledFields = [idNumber, dob, bloodType, medical, allergies, homeAddress,
    ec1Name, ec1Phone, ec1Rel, ec2Name, ec2Phone, ec2Rel, nokName, nokPhone, nokRel];
  const pct = Math.round((filledFields.filter(Boolean).length / filledFields.length) * 100);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.saveSafetyProfile({
        id_number: idNumber || undefined,
        date_of_birth: dob || undefined,
        blood_type: bloodType || undefined,
        medical_conditions: medical || undefined,
        allergies: allergies || undefined,
        home_address: homeAddress || undefined,
        emergency_contact_1_name: ec1Name || undefined,
        emergency_contact_1_phone: ec1Phone || undefined,
        emergency_contact_1_relationship: ec1Rel || undefined,
        emergency_contact_2_name: ec2Name || undefined,
        emergency_contact_2_phone: ec2Phone || undefined,
        emergency_contact_2_relationship: ec2Rel || undefined,
        next_of_kin_name: nokName || undefined,
        next_of_kin_phone: nokPhone || undefined,
        next_of_kin_relationship: nokRel || undefined,
      });
      setSaved(true);
      setProfileComplete(!!(ec1Name && ec1Phone && idNumber));
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      Alert.alert("Save failed", e?.message || "Could not save profile");
    } finally { setSaving(false); }
  };

  if (state.status !== "authed") return null;

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>

        <TouchableOpacity onPress={() => router.back()} style={s.backRow}>
          <Ionicons name="arrow-back" size={20} color={colors.cyan} />
          <Text style={s.backText}>Back</Text>
        </TouchableOpacity>

        {/* Header */}
        <View style={s.headerWrap}>
          <View style={s.headerIcon}>
            <Ionicons name="shield-half-outline" size={28} color={colors.cyan} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>SafeRide Profile</Text>
            <Text style={s.subtitle}>Your safety information helps us protect you in emergencies</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.cyan} style={{ marginVertical: 40 }} />
        ) : (
          <>
            {/* Progress / Active banner */}
            {profileComplete ? (
              <View style={[s.banner, { backgroundColor: colors.green + "15", borderColor: colors.green + "40" }]}>
                <Ionicons name="shield-checkmark" size={20} color={colors.green} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.bannerTitle, { color: colors.green }]}>Your SafeRide profile is active</Text>
                  <Text style={[s.bannerSub, { color: colors.green + "aa" }]}>
                    In case of emergency we can reach your loved ones
                  </Text>
                </View>
              </View>
            ) : (
              <View style={s.progressCard}>
                <View style={s.progressRow}>
                  <View style={s.progressCircle}>
                    <Text style={s.progressPct}>{pct}%</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.progressTitle}>Profile {pct}% complete</Text>
                    <Text style={s.progressSub}>
                      Complete your profile to help us reach your family in an emergency
                    </Text>
                  </View>
                </View>
                <View style={s.progressBarBg}>
                  <View style={[s.progressBarFill, { width: `${pct}%` as any }]} />
                </View>
              </View>
            )}

            {/* ── SECTION 1: Personal Information ── */}
            <Text style={s.section}>PERSONAL INFORMATION</Text>

            <Text style={s.label}>ID NUMBER</Text>
            <TextInput style={s.input} value={idNumber} onChangeText={setIdNumber}
              placeholder="South African ID number" placeholderTextColor={colors.textDim}
              keyboardType="number-pad" />

            <Text style={s.label}>DATE OF BIRTH</Text>
            <TextInput style={s.input} value={dob} onChangeText={setDob}
              placeholder="YYYY-MM-DD" placeholderTextColor={colors.textDim} />

            <Text style={s.label}>BLOOD TYPE</Text>
            <View style={s.chipRow}>
              {BLOOD_TYPES.map(bt => (
                <TouchableOpacity key={bt}
                  style={[s.chip, bloodType === bt && { backgroundColor: "#ef444415", borderColor: "#ef4444" }]}
                  onPress={() => setBloodType(bloodType === bt ? "" : bt)}>
                  <Text style={[s.chipText, bloodType === bt && { color: "#ef4444", fontWeight: "800" }]}>{bt}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.label}>MEDICAL CONDITIONS</Text>
            <TextInput style={[s.input, s.multiline]} value={medical} onChangeText={setMedical}
              placeholder="e.g. Diabetes, Hypertension, Asthma" placeholderTextColor={colors.textDim}
              multiline numberOfLines={3} textAlignVertical="top" />

            <Text style={s.label}>ALLERGIES</Text>
            <TextInput style={[s.input, s.multiline]} value={allergies} onChangeText={setAllergies}
              placeholder="e.g. Penicillin, Nuts, Latex" placeholderTextColor={colors.textDim}
              multiline numberOfLines={2} textAlignVertical="top" />

            {/* ── SECTION 2: Home Address ── */}
            <Text style={s.section}>HOME ADDRESS</Text>
            <TextInput style={[s.input, s.multiline]} value={homeAddress} onChangeText={setHomeAddress}
              placeholder="Full home address including suburb, city and province"
              placeholderTextColor={colors.textDim} multiline numberOfLines={3} textAlignVertical="top" />

            {/* ── SECTION 3: Emergency Contact 1 (Required) ── */}
            <Text style={s.section}>
              PRIMARY EMERGENCY CONTACT{" "}
              <Text style={{ color: colors.red }}>*</Text>
            </Text>
            <View style={s.contactCard}>
              <Text style={s.label}>FULL NAME</Text>
              <TextInput style={s.input} value={ec1Name} onChangeText={setEc1Name}
                placeholder="Contact full name" placeholderTextColor={colors.textDim} />
              <Text style={s.label}>RELATIONSHIP</Text>
              <View style={s.chipRow}>
                {RELATIONSHIPS.map(r => (
                  <TouchableOpacity key={r}
                    style={[s.chip, ec1Rel === r && { backgroundColor: colors.cyanDim, borderColor: colors.cyan }]}
                    onPress={() => setEc1Rel(ec1Rel === r ? "" : r)}>
                    <Text style={[s.chipText, ec1Rel === r && { color: colors.cyan, fontWeight: "700" }]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.label}>PHONE NUMBER <Text style={{ color: colors.red }}>*</Text></Text>
              <TextInput style={s.input} value={ec1Phone} onChangeText={setEc1Phone}
                placeholder="e.g. 0821234567" placeholderTextColor={colors.textDim}
                keyboardType="phone-pad" />
            </View>

            {/* ── SECTION 4: Emergency Contact 2 (Optional) ── */}
            <Text style={s.section}>SECONDARY EMERGENCY CONTACT</Text>
            <View style={s.contactCard}>
              <Text style={s.label}>FULL NAME</Text>
              <TextInput style={s.input} value={ec2Name} onChangeText={setEc2Name}
                placeholder="Contact full name (optional)" placeholderTextColor={colors.textDim} />
              <Text style={s.label}>RELATIONSHIP</Text>
              <View style={s.chipRow}>
                {RELATIONSHIPS.map(r => (
                  <TouchableOpacity key={r}
                    style={[s.chip, ec2Rel === r && { backgroundColor: colors.cyanDim, borderColor: colors.cyan }]}
                    onPress={() => setEc2Rel(ec2Rel === r ? "" : r)}>
                    <Text style={[s.chipText, ec2Rel === r && { color: colors.cyan, fontWeight: "700" }]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.label}>PHONE NUMBER</Text>
              <TextInput style={s.input} value={ec2Phone} onChangeText={setEc2Phone}
                placeholder="e.g. 0821234567 (optional)" placeholderTextColor={colors.textDim}
                keyboardType="phone-pad" />
            </View>

            {/* ── SECTION 5: Next of Kin ── */}
            <Text style={s.section}>NEXT OF KIN</Text>
            <View style={s.contactCard}>
              <View style={s.infoRow}>
                <Ionicons name="information-circle-outline" size={13} color={colors.textMuted} />
                <Text style={s.infoText}>
                  This person will be contacted if you cannot speak for yourself
                </Text>
              </View>
              <Text style={s.label}>FULL NAME</Text>
              <TextInput style={s.input} value={nokName} onChangeText={setNokName}
                placeholder="Next of kin full name" placeholderTextColor={colors.textDim} />
              <Text style={s.label}>RELATIONSHIP</Text>
              <TextInput style={s.input} value={nokRel} onChangeText={setNokRel}
                placeholder="e.g. Mother, Father, Spouse" placeholderTextColor={colors.textDim} />
              <Text style={s.label}>PHONE NUMBER</Text>
              <TextInput style={s.input} value={nokPhone} onChangeText={setNokPhone}
                placeholder="e.g. 0821234567" placeholderTextColor={colors.textDim}
                keyboardType="phone-pad" />
            </View>

            {/* Save */}
            <View style={{ marginTop: 24 }}>
              {saved && (
                <View style={s.savedRow}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.green} />
                  <Text style={s.savedText}>Profile saved successfully</Text>
                </View>
              )}
              <Button label="Save SafeRide Profile" onPress={handleSave} loading={saving} testID="save-safety-btn" />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  backRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  backText: { color: colors.cyan, fontSize: 15, fontWeight: "600" },
  headerWrap: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 20 },
  headerIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.cyanDim, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.cyan },
  title: { color: colors.text, fontSize: 22, fontWeight: "900" },
  subtitle: { color: colors.textMuted, fontSize: 13, marginTop: 2, lineHeight: 18 },
  banner: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: radius.md, borderWidth: 1, marginBottom: 20 },
  bannerTitle: { fontSize: 14, fontWeight: "700" },
  bannerSub: { fontSize: 12, marginTop: 2 },
  progressCard: { backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 20 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  progressCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.cyanDim, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.cyan },
  progressPct: { color: colors.cyan, fontSize: 13, fontWeight: "900" },
  progressTitle: { color: colors.text, fontWeight: "700", fontSize: 14 },
  progressSub: { color: colors.textMuted, fontSize: 12, marginTop: 2, lineHeight: 16 },
  progressBarBg: { height: 4, backgroundColor: colors.border, borderRadius: 2 },
  progressBarFill: { height: 4, backgroundColor: colors.cyan, borderRadius: 2 },
  section: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, marginTop: 24, marginBottom: 12 },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, color: colors.text, fontSize: 15, padding: 14, marginBottom: 2 },
  multiline: { minHeight: 80 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  chipText: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  contactCard: { backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 8 },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginBottom: 8 },
  infoText: { color: colors.textMuted, fontSize: 12, flex: 1, lineHeight: 17 },
  savedRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.green + "15", borderRadius: radius.sm, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.green + "40" },
  savedText: { color: colors.green, fontSize: 14, fontWeight: "600" },
});
