import React, { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet, Image, Text } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../src/AuthContext";
import { colors } from "../src/theme";

export default function Index() {
  const router = useRouter();
  const { state } = useAuth();

  useEffect(() => {
    if (state.status === "loading") return;
    if (state.status === "guest") {
      router.replace("/(auth)/welcome");
    } else {
      router.replace("/(app)");
    }
  }, [state.status, router]);

  return (
    <View style={styles.container} testID="splash-screen">
      <View style={styles.glow} />
      <Image
        source={{ uri: "https://customer-assets.emergentagent.com/job_57c62ad7-fa2d-4199-83da-1e64e8a2afac/artifacts/pqg1jmf2_file_000000008b9071fd825a3aae1fed8553.png" }}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.tagline}>NO CASH · NO STRESS</Text>
      <ActivityIndicator color={colors.cyan} style={{ marginTop: 24 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  glow: {
    position: "absolute",
    width: 380,
    height: 380,
    borderRadius: 999,
    backgroundColor: colors.cyan,
    opacity: 0.06,
  },
  logo: { width: 220, height: 220 },
  tagline: { color: colors.cyan, fontWeight: "800", letterSpacing: 4, fontSize: 12, marginTop: 8 },
});
