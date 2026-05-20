import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/AuthContext";
import { colors, radius } from "../../src/theme";

export default function OwnerProfile() {
  const { state, signOut } = useAuth();
  const router = useRouter();
  if (state.status !== "authed") return null;
  const user = state.user;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text style={styles.title}>Profile</Text>

        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Ionicons name="business" size={36} color={colors.cyan} />
          </View>
          <Text style={styles.name}>{user.full_name}</Text>
          <Text style={styles.phone}>{user.phone_number}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>FLEET OWNER</Text>
          </View>
        </View>

        <Text style={styles.section}>ACCOUNT</Text>

        {[
          { icon: "car-sport-outline", color: colors.cyanDim, iconColor: colors.cyan, title: "Driver Mode", sub: "Activate to receive passenger payments", route: "/(owner)/driver-mode" },
          { icon: "lock-closed-outline", color: colors.greenDim, iconColor: colors.green, title: "Change PIN", sub: "Update your 4-digit security PIN", route: null },
          { icon: "shield-checkmark-outline", color: "#A064FF20", iconColor: "#A064FF", title: "Identity Verification", sub: "KYC status and documents", route: null },
        ].map((item, i) => (
          <TouchableOpacity key={i} style={styles.menuItem}
            onPress={() => item.route ? router.push(item.route as any) : null}>
            <View style={[styles.menuIcon, { backgroundColor: item.color }]}>
              <Ionicons name={item.icon as any} size={20} color={item.iconColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuTitle}>{item.title}</Text>
              <Text style={styles.menuSub}>{item.sub}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ))}

        <Text style={[styles.section, { marginTop: 24 }]}>SUPPORT</Text>
        <TouchableOpacity style={styles.menuItem}>
          <View style={[styles.menuIcon, { backgroundColor: colors.yellowDim }]}>
            <Ionicons name="help-circle-outline" size={20} color={colors.yellow} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.menuTitle}>Help & Support</Text>
            <Text style={styles.menuSub}>Get help with your fleet account</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.signOutBtn}
          onPress={() => Alert.alert("Sign out", "Are you sure?", [
            { text: "Cancel", style: "cancel" },
            { text: "Sign out", style: "destructive", onPress: signOut },
          ])}>
          <Ionicons name="log-out-outline" size={20} color={colors.red} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>Tag n Ride · Fleet Owner · v1.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 24, fontWeight: "800", marginBottom: 24 },
  avatarSection: { alignItems: "center", marginBottom: 32 },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.cyanDim, borderWidth: 2, borderColor: colors.cyan, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  name: { color: colors.text, fontSize: 22, fontWeight: "800" },
  phone: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
  roleBadge: { marginTop: 10, backgroundColor: colors.cyanDim, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 4, borderWidth: 1, borderColor: colors.cyan },
  roleText: { color: colors.cyan, fontSize: 11, fontWeight: "800", letterSpacing: 1.4 },
  section: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, marginBottom: 10 },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 8 },
  menuIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  menuTitle: { color: colors.text, fontWeight: "700", fontSize: 15 },
  menuSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  signOutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: colors.redDim, borderRadius: radius.md, borderWidth: 1, borderColor: colors.red, padding: 16, marginTop: 24 },
  signOutText: { color: colors.red, fontWeight: "800", fontSize: 15 },
  version: { color: colors.textDim, fontSize: 12, textAlign: "center", marginTop: 24 },
});
