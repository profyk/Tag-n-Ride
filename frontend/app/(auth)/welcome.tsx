import React from "react";
import { View, Text, StyleSheet, Image, ImageBackground } from "react-native";
import { Link } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, PoweredBy } from "../../src/ui";
import { colors } from "../../src/theme";

export default function Welcome() {
  return (
    <View style={styles.root} testID="welcome-screen">
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
            source={{ uri: "https://customer-assets.emergentagent.com/job_57c62ad7-fa2d-4199-83da-1e64e8a2afac/artifacts/pqg1jmf2_file_000000008b9071fd825a3aae1fed8553.png" }}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <View style={styles.bottom}>
          <Text style={styles.kicker}>SCAN · TAP · RIDE</Text>
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
  root: { flex: 1, backgroundColor: colors.bg },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(10,10,10,0.78)" },
  top: { flex: 1, alignItems: "center", justifyContent: "center" },
  logo: { width: 200, height: 200 },
  bottom: { paddingHorizontal: 24, paddingBottom: 24 },
  kicker: { color: colors.cyan, fontWeight: "800", letterSpacing: 4, fontSize: 12, marginBottom: 12 },
  title: { color: colors.text, fontSize: 30, fontWeight: "800", lineHeight: 36, letterSpacing: -0.5 },
  sub: { color: colors.textMuted, fontSize: 15, lineHeight: 22, marginTop: 12 },
});
