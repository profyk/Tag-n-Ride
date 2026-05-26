import React from "react";
import { View, Text, StyleSheet, Image, ImageBackground } from "react-native";
import { Link } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, PoweredBy } from "../../src/ui";
import { useTheme } from "../../src/ThemeContext";

export default function Welcome() {
  const { colors } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: "#0a0a0a" }} testID="welcome-screen">
      <ImageBackground
        source={{ uri: "https://images.unsplash.com/photo-1744907895363-d351aa6019ef?w=1080" }}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      >
        <View style={styles.scrim} />
      </ImageBackground>

      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.top}>
          <Image
            source={require("../../assets/images/icon.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <View style={styles.bottom}>
          <Text style={[styles.kicker, { color: colors.cyan }]}>SCAN · TAP · RIDE</Text>
          <Text style={styles.title}>The cashless way to{"\n"}move around the city.</Text>
          <Text style={styles.sub}>
            Pay any taxi or bus driver in seconds. Top up your wallet, scan a QR, and ride. No cash, no stress.
          </Text>

          <View style={{ height: 24 }} />

          <Link href="/(auth)/register" asChild>
            <Button label="Create an account" onPress={() => {}} testID="welcome-register-btn" icon="rocket-outline" />
          </Link>
          <View style={{ height: 12 }} />
          <Link href="/(auth)/login" asChild>
            <Button label="I already have an account" onPress={() => {}} variant="secondary" testID="welcome-login-btn" />
          </Link>
          <PoweredBy testID="welcome-powered" />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(10,10,10,0.78)" },
  top: { flex: 1, alignItems: "center", justifyContent: "center" },
  logo: { width: 200, height: 200 },
  bottom: { paddingHorizontal: 24, paddingBottom: 24 },
  kicker: { fontWeight: "800", letterSpacing: 4, fontSize: 12, marginBottom: 12 },
  title: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "800",
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  sub: {
    color: "#3DDBB8",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12,
    opacity: 0.85,
  },
});
