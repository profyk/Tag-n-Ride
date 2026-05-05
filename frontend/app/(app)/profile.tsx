import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/AuthContext";
import { colors, radius } from "../../src/theme";

export default function Profile() {
  const router = useRouter();
  const { state, signOut } = useAuth();
  if (state.status !== "authed") return null;
  const u = state.user;
  const isDriver = u.role === "driver";

  const confirmLogout = () => {
    Alert.alert("Sign out?", "You will need to sign back in to use Tag n Ride.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/(auth)/welcome");
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="profile-screen">
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View style={styles.header}>
          <Image
            source={{ uri: "https://customer-assets.emergentagent.com/job_57c62ad7-fa2d-4199-83da-1e64e8a2afac/artifacts/pqg1jmf2_file_000000008b9071fd825a3aae1fed8553.png" }}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <View style={styles.card}>
          <View style={styles.avatar}>
            <Ionicons name={isDriver ? "car-sport" : "person"} size={32} color={colors.cyan} />
          </View>
          <Text style={styles.name} testID="profile-name">{u.full_name}</Text>
          <Text style={styles.phone}>{u.phone_number}</Text>
          <View style={styles.rolePill}>
            <Ionicons name={isDriver ? "shield-checkmark" : "person-circle"} size={13} color={colors.cyan} />
            <Text style={styles.rolePillText}>{u.role.toUpperCase()}</Text>
          </View>
        </View>

        <Text style={styles.section}>ACCOUNT</Text>
        <Row icon="card-outline" label={isDriver ? "Withdrawal requests" : "Top up wallet"} onPress={() => router.push(isDriver ? "/withdraw" : "/topup")} testID={isDriver ? "row-withdraw" : "row-topup"} />
        <Row icon="receipt-outline" label="Transaction history" onPress={() => router.push("/(app)/transactions")} testID="row-history" />

        <Text style={styles.section}>SUPPORT</Text>
        <Row icon="help-circle-outline" label="Help & FAQs" onPress={() => Alert.alert("Help", "support@tagnride.app")} />
        <Row icon="shield-outline" label="Privacy & Security" onPress={() => Alert.alert("Privacy", "Your PIN is bcrypt-hashed and never stored in plaintext.")} />

        <View style={{ height: 16 }} />
        <TouchableOpacity onPress={confirmLogout} style={styles.signout} testID="signout-btn">
          <Ionicons name="log-out-outline" size={18} color={colors.red} />
          <Text style={styles.signoutText}>Sign out</Text>
        </TouchableOpacity>

        <Text style={styles.brand}>Tag n Ride · No cash · No stress</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const Row: React.FC<{ icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; testID?: string }> = ({ icon, label, onPress, testID }) => (
  <TouchableOpacity testID={testID} onPress={onPress} activeOpacity={0.85} style={styles.row}>
    <Ionicons name={icon} size={20} color={colors.cyan} />
    <Text style={styles.rowText}>{label}</Text>
    <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { alignItems: "center", marginBottom: 8 },
  logo: { width: 80, height: 80 },
  card: { backgroundColor: colors.bg2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 24, alignItems: "center" },
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", backgroundColor: colors.cyanDim, borderWidth: 1, borderColor: colors.cyan },
  name: { color: colors.text, fontSize: 22, fontWeight: "800", marginTop: 12 },
  phone: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
  rolePill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.cyanDim, marginTop: 12, borderWidth: 1, borderColor: colors.cyan },
  rolePillText: { color: colors.cyan, fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },
  section: { color: colors.textMuted, fontSize: 12, fontWeight: "700", letterSpacing: 1.4, marginTop: 24, marginBottom: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  rowText: { color: colors.text, fontSize: 15, fontWeight: "600", flex: 1 },
  signout: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 16, borderRadius: radius.md, borderWidth: 1, borderColor: colors.red, backgroundColor: colors.redDim },
  signoutText: { color: colors.red, fontWeight: "700", fontSize: 15 },
  brand: { color: colors.textDim, textAlign: "center", marginTop: 32, fontSize: 12, letterSpacing: 1 },
});
