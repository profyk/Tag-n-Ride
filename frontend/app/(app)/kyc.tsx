import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Image, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { Button } from "../../src/ui";
import { colors, radius } from "../../src/theme";

type KYCStatus = "not_submitted" | "pending" | "approved" | "rejected";

export default function KYCScreen() {
  const [status, setStatus] = useState<KYCStatus>("not_submitted");
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<any>(null);
  const [licence, setLicence] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const res = await api.kycStatus();
      setStatus(res.status);
      setRejectionReason(res.rejection_reason || null);
    } catch {
      // ignore
    } finally {
      setLoadingStatus(false);
    }
  };

  const takeSelfie = async () => {
    const { status: camStatus } = await ImagePicker.requestCameraPermissionsAsync();
    if (camStatus !== "granted") {
      Alert.alert("Permission needed", "Camera access is required to take your selfie.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      cameraType: ImagePicker.CameraType.front,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setSelfie({ uri: asset.uri, type: "image/jpeg", name: "selfie.jpg" });
    }
  };

  const takeLicence = async () => {
    const { status: camStatus } = await ImagePicker.requestCameraPermissionsAsync();
    if (camStatus !== "granted") {
      Alert.alert("Permission needed", "Camera access is required to photograph your licence.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
      cameraType: ImagePicker.CameraType.back,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setLicence({ uri: asset.uri, type: "image/jpeg", name: "licence_front.jpg" });
    }
  };

  const handleSubmit = async () => {
    if (!selfie || !licence) {
      Alert.alert("Required", "Please take both a selfie and a photo of your licence.");
      return;
    }
    setSubmitting(true);
    try {
      await api.kycSubmit(selfie, licence);
      setStatus("pending");
      setSelfie(null);
      setLicence(null);
      Alert.alert(
        "Submitted!",
        "Your documents have been submitted for review. We will notify you once verified."
      );
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Could not submit documents.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingStatus) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <ActivityIndicator color={colors.cyan} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (status === "approved") {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.statusContainer}>
          <View style={[styles.statusIcon, { backgroundColor: colors.greenDim, borderColor: colors.green }]}>
            <Ionicons name="checkmark-circle" size={48} color={colors.green} />
          </View>
          <Text style={styles.statusTitle}>KYC Approved</Text>
          <Text style={styles.statusSub}>
            Your identity has been verified. You can now receive payments on Tag n Ride.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (status === "pending") {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.statusContainer}>
          <View style={[styles.statusIcon, { backgroundColor: colors.yellowDim, borderColor: colors.yellow }]}>
            <Ionicons name="time" size={48} color={colors.yellow} />
          </View>
          <Text style={styles.statusTitle}>Under Review</Text>
          <Text style={styles.statusSub}>
            Your documents have been submitted and are being reviewed by our team.
            This usually takes 24 to 48 hours.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text style={styles.title}>Identity Verification</Text>
        <Text style={styles.subtitle}>
          To receive payments on Tag n Ride, we need to verify your identity.
        </Text>

        {status === "rejected" && rejectionReason && (
          <View style={styles.rejectedCard}>
            <Ionicons name="close-circle" size={20} color={colors.red} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rejectedTitle}>Documents Rejected</Text>
              <Text style={styles.rejectedReason}>{rejectionReason}</Text>
              <Text style={styles.rejectedHint}>Please resubmit with clearer photos.</Text>
            </View>
          </View>
        )}

        <View style={styles.docSection}>
          <Text style={styles.docLabel}>STEP 1 — SELFIE</Text>
          <Text style={styles.docHint}>
            Take a clear photo of your face using the front camera.
          </Text>
          {selfie ? (
            <View style={styles.previewWrap}>
              <Image source={{ uri: selfie.uri }} style={styles.preview} />
              <TouchableOpacity style={styles.retakeBtn} onPress={takeSelfie}>
                <Ionicons name="refresh" size={16} color={colors.cyan} />
                <Text style={styles.retakeText}>Retake</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.cameraBtn} onPress={takeSelfie}>
              <View style={styles.cameraBtnIcon}>
                <Ionicons name="camera" size={28} color={colors.cyan} />
              </View>
              <Text style={styles.cameraBtnText}>Take Selfie</Text>
              <Text style={styles.cameraBtnHint}>Front camera</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.docSection}>
          <Text style={styles.docLabel}>STEP 2 — DRIVER'S LICENCE (FRONT)</Text>
          <Text style={styles.docHint}>
            Place your licence on a flat surface and take a clear photo.
          </Text>
          {licence ? (
            <View style={styles.previewWrap}>
              <Image source={{ uri: licence.uri }} style={[styles.preview, { aspectRatio: 4 / 3 }]} />
              <TouchableOpacity style={styles.retakeBtn} onPress={takeLicence}>
                <Ionicons name="refresh" size={16} color={colors.cyan} />
                <Text style={styles.retakeText}>Retake</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.cameraBtn} onPress={takeLicence}>
              <View style={styles.cameraBtnIcon}>
                <Ionicons name="card" size={28} color={colors.cyan} />
              </View>
              <Text style={styles.cameraBtnText}>Photo of Licence</Text>
              <Text style={styles.cameraBtnHint}>Back camera · Front of licence</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>Tips for approval</Text>
          {[
            "Make sure your face is clearly visible in your selfie",
            "Ensure all text on your licence is readable",
            "Use good lighting — avoid shadows",
            "Hold your licence flat and straight",
          ].map((tip, i) => (
            <View key={i} style={styles.tip}>
              <Text style={styles.tipDot}>•</Text>
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 24 }}>
          <Button
            label="Submit for Verification"
            onPress={handleSubmit}
            loading={submitting}
            disabled={!selfie || !licence}
          />
        </View>

        <Text style={styles.privacy}>
          Your documents are encrypted and only used for identity verification.
          They are never shared with third parties.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 24, fontWeight: "800", marginBottom: 8 },
  subtitle: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 24 },
  statusContainer: {
    flex: 1, alignItems: "center", justifyContent: "center", padding: 40,
  },
  statusIcon: {
    width: 96, height: 96, borderRadius: 48,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, marginBottom: 24,
  },
  statusTitle: { color: colors.text, fontSize: 24, fontWeight: "800", textAlign: "center" },
  statusSub: {
    color: colors.textMuted, fontSize: 15, textAlign: "center",
    marginTop: 12, lineHeight: 22,
  },
  rejectedCard: {
    flexDirection: "row", gap: 12, alignItems: "flex-start",
    backgroundColor: colors.redDim, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.red,
    padding: 14, marginBottom: 20,
  },
  rejectedTitle: { color: colors.red, fontWeight: "800", fontSize: 14 },
  rejectedReason: { color: colors.text, fontSize: 13, marginTop: 4 },
  rejectedHint: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  docSection: { marginBottom: 24 },
  docLabel: {
    color: colors.textMuted, fontSize: 11, fontWeight: "700",
    letterSpacing: 1.4, marginBottom: 6,
  },
  docHint: { color: colors.textMuted, fontSize: 13, marginBottom: 12 },
  cameraBtn: {
    backgroundColor: colors.bg2, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    padding: 32, alignItems: "center",
  },
  cameraBtnIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.cyanDim, borderWidth: 1, borderColor: colors.cyan,
    alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  cameraBtnText: { color: colors.text, fontWeight: "700", fontSize: 16 },
  cameraBtnHint: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  previewWrap: { position: "relative" },
  preview: {
    width: "100%", aspectRatio: 1,
    borderRadius: radius.md, borderWidth: 2, borderColor: colors.green,
  },
  retakeBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "center", marginTop: 10,
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: colors.cyanDim, borderRadius: 999, borderWidth: 1, borderColor: colors.cyan,
  },
  retakeText: { color: colors.cyan, fontWeight: "700", fontSize: 13 },
  tipsCard: {
    backgroundColor: colors.bg2, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: 16,
  },
  tipsTitle: { color: colors.text, fontWeight: "700", fontSize: 14, marginBottom: 12 },
  tip: { flexDirection: "row", gap: 8, marginBottom: 8 },
  tipDot: { color: colors.cyan, fontWeight: "800" },
  tipText: { color: colors.textMuted, fontSize: 13, flex: 1, lineHeight: 18 },
  privacy: {
    color: colors.textDim, fontSize: 12, textAlign: "center",
    marginTop: 20, lineHeight: 18,
  },
});
