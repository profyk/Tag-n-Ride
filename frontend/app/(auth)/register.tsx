import React, { useState } from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, Image } from "react-native";
import { Link, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Field, Button, CountryChip, PoweredBy } from "../../src/ui";
import { colors, radius } from "../../src/theme";
import { useAuth } from "../../src/AuthContext";

type Role = "passenger" | "driver";

export default function Register() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [role, setRole] = useState<Role>("passenger");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [plate, setPlate] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setErr(null);
    if (name.trim().length < 2) return setErr("Enter your full name");
    const localDigits = phone.replace(/\D/g, "").replace(/^0+/, "");
    if (localDigits.length < 9) return setErr("Enter a valid SA phone number (9 digits)");
    if (pin.length !== 4) return setErr("PIN must be 4 digits");
    if (pin !== pin2) return setErr("PINs don't match");
    if (role === "driver" && plate.trim().length < 2) return setErr("Enter your vehicle plate number");
    setLoading(true);
    try {
      await signUp({
        phone_number: "+27" + localDigits,
        full_name: name.trim(),
        pin,
        role,
        vehicle_plate: role === "driver" ? plate.trim().toUpperCase() : undefined,
      });
      router.replace("/(app)");
    } catch (e: any) {
      setErr(e?.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} testID="register-screen">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} style={styles.back} testID="register-back-btn">
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </TouchableOpacity>

          <Image
            source={require("../../assets/images/icon.png")}
            style={styles.logo}
            resizeMode="contain"
          />

          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.sub}>Choose your role and get started</Text>

          <View style={{ height: 20 }} />

          <View style={styles.roleRow}>
            <RoleChip
              active={role === "passenger"}
              icon="person-outline"
              label="Passenger"
              hint="Pay for rides"
              onPress={() => setRole("passenger")}
              testID="role-passenger"
            />
            <RoleChip
              active={role === "driver"}
              icon="car-sport-outline"
              label="Driver"
              hint="Receive payments"
              onPress={() => setRole("driver")}
              testID="role-driver"
            />
          </View>

          <View style={{ height: 12 }} />

          <Field label="Full name" placeholder="Jane Doe" value={name} onChangeText={setName} testID="register-name-input" autoCapitalize="words" />
          <Field
            label="Phone number"
            placeholder="82 123 4567"
            value={phone}
            onChangeText={(t) => setPhone(t.replace(/[^0-9 ]/g, "").slice(0, 13))}
            keyboardType="phone-pad"
            testID="register-phone-input"
            leftAddon={<CountryChip testID="register-country-chip" />}
          />
          {role === "driver" ? (
            <Field
              label="Vehicle plate number"
              placeholder="ND 123 456"
              value={plate}
              onChangeText={(t) => setPlate(t.toUpperCase().slice(0, 12))}
              testID="register-plate-input"
              autoCapitalize="characters"
            />
          ) : null}
          <Field
            label="Create 4-digit PIN"
            placeholder="••••"
            value={pin}
            onChangeText={(t) => setPin(t.replace(/[^0-9]/g, "").slice(0, 4))}
            keyboardType="number-pad"
            secureTextEntry
            toggleSecure
            maxLength={4}
            testID="register-pin-input"
          />
          <Field
            label="Confirm PIN"
            placeholder="••••"
            value={pin2}
            onChangeText={(t) => setPin2(t.replace(/[^0-9]/g, "").slice(0, 4))}
            keyboardType="number-pad"
            secureTextEntry
            toggleSecure
            maxLength={4}
            testID="register-pin2-input"
          />

          {err ? <Text style={styles.err} testID="register-error">{err}</Text> : null}

          <View style={{ height: 8 }} />
          <Button label="Create account" onPress={onSubmit} loading={loading} testID="register-submit-btn" icon="rocket-outline" />

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account?</Text>
            <Link href="/(auth)/login" testID="register-go-login">
              <Text style={styles.link}> Sign in</Text>
            </Link>
          </View>

          <PoweredBy testID="register-powered" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const RoleChip: React.FC<{
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint: string;
  onPress: () => void;
  testID?: string;
}> = ({ active, icon, label, hint, onPress, testID }) => (
  <TouchableOpacity
    testID={testID}
    onPress={onPress}
    activeOpacity={0.85}
    style={[styles.role, active && { borderColor: colors.cyan, backgroundColor: colors.cyanDim }]}
  >
    <Ionicons name={icon} size={26} color={active ? colors.cyan : colors.text} />
    <Text style={[styles.roleLabel, active && { color: colors.cyan }]}>{label}</Text>
    <Text style={styles.roleHint}>{hint}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: 24, paddingBottom: 40 },
  back: { width: 40, height: 40, alignItems: "flex-start", justifyContent: "center", marginTop: 8 },
  logo: { width: 90, height: 90, alignSelf: "center", marginVertical: 8 },
  title: { color: colors.text, fontSize: 26, fontWeight: "800" },
  sub: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
  roleRow: { flexDirection: "row", gap: 12 },
  role: { flex: 1, borderWidth: 1, borderColor: colors.border, padding: 16, borderRadius: radius.md, backgroundColor: colors.bg2 },
  roleLabel: { color: colors.text, fontSize: 16, fontWeight: "700", marginTop: 8 },
  roleHint: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  err: { color: colors.red, fontSize: 13, marginTop: 4 },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: 24 },
  footerText: { color: colors.textMuted },
  link: { color: colors.cyan, fontWeight: "700" },
});
