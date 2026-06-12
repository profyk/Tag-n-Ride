import React, { useEffect, useRef } from "react";
import { View, ActivityIndicator, StyleSheet, Image, Text } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { useAuth } from "../src/AuthContext";
import { useTheme } from "../src/ThemeContext";

export default function Index() {
  const router = useRouter();
  const { state } = useAuth();
  const { colors } = useTheme();

  // Only redirect from this screen when it's the focused screen.
  // Using useFocusEffect prevents this from firing a competing navigation
  // while the user is already mid-flow on a registration or login screen.
  const isMounted = useRef(false);
  useFocusEffect(useCallback(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []));

  useEffect(() => {
    if (!isMounted.current) return;
    if (state.status === "loading") return;
    if (state.status === "guest") {
      router.replace("/(auth)/welcome");
    } else if (state.status === "authed" && state.user.role === "owner") {
      router.replace("/owner/dashboard");
    } else {
      router.replace("/(app)");
    }
  }, [state.status, router]);

  const s = makeStyles(colors);

  return (
    <View style={s.container} testID="splash-screen">
      <View style={s.glow} />
      <Image
        source={require("../assets/images/icon.png")}
        style={s.logo}
        resizeMode="contain"
      />
      <Text style={s.tagline}>NO CASH · NO STRESS</Text>
      <ActivityIndicator color={colors.cyan} style={{ marginTop: 24 }} />
    </View>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  glow: { position: "absolute", width: 380, height: 380, borderRadius: 999, backgroundColor: colors.cyan, opacity: 0.06 },
  logo: { width: 220, height: 220 },
  tagline: { color: colors.cyan, fontWeight: "800", letterSpacing: 4, fontSize: 12, marginTop: 8 },
});
