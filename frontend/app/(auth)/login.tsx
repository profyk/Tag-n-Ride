import React, { useState } from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, Image } from "react-native";
import { Link, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Field, Button, CountryChip, PoweredBy } from "../../src/ui";
import { colors } from "../../src/theme";
import { useAuth } from "../../src/AuthContext";

export default function Login() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setErr(null);
    const localDigits = phone.replace(/\D/g, "").replace(/^0+/, "");
    if (localDigits.length < 9 || pin.length !== 4) {
      setErr("Enter your phone number and 4-digit PIN");
      return;
    }
    setLoading(true);
    try {
      await signIn("+27" + localDigits, pin);
      router.replace("/(app)");
    } catch (e: any) {
      setErr(e?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} testID="login-screen">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} style={styles.back} testID="login-back-btn">
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </TouchableOpacity>

          <Image
            source={{ uri: "https://customer-assets.emergentagent.com/job_57c62ad7-fa2d-4199-83da-1e64e8a2afac/artifacts/pqg1jmf2_file_000000008b9071fd825a3aae1fed8553.png" }}
            style={styles.logo}
            resizeMode="contain"
          />

          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.sub}>Sign in to your Tag n Ride account</Text>

          <View style={{ height: 24 }} />

          <Field
            label="Phone number"
            placeholder="82 123 4567"
            value={phone}
            onChangeText={(t) => setPhone(t.replace(/[^0-9 ]/g, "").slice(0, 13))}
            keyboardType="phone-pad"
            testID="login-phone-input"
            leftAddon={<CountryChip testID="login-country-chip" />}
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
            testID="login-pin-input"
          />

          {err ? <Text style={styles.err} testID="login-error">{err}</Text> : null}

          <View style={{ height: 12 }} />
          <Button label="Sign in" onPress={onSubmit} loading={loading} testID="login-submit-btn" icon="log-in-outline" />

          <View style={styles.footer}>
            <Text style={styles.footerText}>New to Tag n Ride?</Text>
            <Link href="/(auth)/register" testID="login-go-register">
              <Text style={styles.link}> Create account</Text>
            </Link>
          </View>

          <PoweredBy testID="login-powered" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: 24, paddingBottom: 40 },
  back: { width: 40, height: 40, alignItems: "flex-start", justifyContent: "center", marginTop: 8 },
  logo: { width: 120, height: 120, alignSelf: "center", marginVertical: 12 },
  title: { color: colors.text, fontSize: 28, fontWeight: "800" },
  sub: { color: colors.textMuted, fontSize: 15, marginTop: 4 },
  err: { color: colors.red, fontSize: 13, marginTop: 4 },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: 24 },
  footerText: { color: colors.textMuted },
  link: { color: colors.cyan, fontWeight: "700" },
});
