import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Image, ActivityIndicator, Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { api } from "../../src/api";
import { useTheme } from "../../src/ThemeContext";
import { Button } from "../../src/ui";
import { radius } from "../../src/theme";

type KYCStatus = "not_submitted" | "pending" | "approved" | "rejected";
type Step = 1 | 2 | 3;

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const CARD_W = SCREEN_W - 48;
const CARD_H = CARD_W * 0.63;
const CORNER_SIZE = 20;
const CORNER_T = 3;
const CORNER_TOP = (SCREEN_H - CARD_H) / 2 - 1;
const CORNER_LEFT = 23;export default function KYCScreen() {
  const { colors } = useTheme();
  const [status, setStatus] = useState<KYCStatus>("not_submitted");
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<any>(null);
  const [licence, setLicence] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [step, setStep] = useState<Step>(1);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => { loadStatus(); }, []);

  const loadStatus = async () => {
    try {
      const res = await api.kycStatus();
      setStatus(res.status);
      setRejectionReason(res.rejection_reason || null);
    } catch {}
    finally { setLoadingStatus(false); }
  };

  const takeSelfie = async () => {
    try {
      const { status: perm } = await ImagePicker.requestCameraPermissionsAsync();
      if (perm !== "granted") {
        Alert.alert("Permission needed", "Camera access is required to take your selfie."); return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true, aspect: [1, 1], quality: 0.85,
        cameraType: "front" as any,
      });
      if (!result.canceled && result.assets?.[0]) {
        setSelfie({ uri: result.assets[0].uri, type: "image/jpeg", name: "selfie.jpg" });
      }
    } catch (e: any) { Alert.alert("Camera error", e?.message || "Could not open camera."); }
  };

  const openLicenceScanner = async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert("Permission needed", "Camera access is required to scan your licence."); return;
      }
    }
    setScannerOpen(true);
  };

  const captureDocument = async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9, base64: false });
      setLicence({ uri: photo.uri, type: "image/jpeg", name: "licence_front.jpg" });
      setScannerOpen(false);
    } catch (e: any) { Alert.alert("Capture error", e?.message || "Could not capture."); }
    finally { setCapturing(false); }
  };

  const handleSubmit = async () => {
    if (!selfie || !licence) {
      Alert.alert("Required", "Please complete both steps before submitting."); return;
    }
    setSubmitting(true);
    try {
      await api.kycSubmit(selfie, licence);
      setStatus("pending"); setSelfie(null); setLicence(null);
      Alert.alert("Submitted! 🎉", "Your documents are being reviewed. Usually within 24 hours.");
    } catch (e: any) { Alert.alert("Submission failed", e?.message || "Could not submit. Please try again."); }
    finally { setSubmitting(false); }
  };

  const s = makeStyles(colors);if (scannerOpen) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)" }} />
          <View style={{ flexDirection: "row", height: CARD_H }}>
            <View style={{ width: 24, backgroundColor: "rgba(0,0,0,0.6)" }} />
            <View style={{ width: CARD_W, borderWidth: 2, borderColor: colors.cyan, borderRadius: 12 }} />
            <View style={{ width: 24, backgroundColor: "rgba(0,0,0,0.6)" }} />
          </View>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)" }} />
        </View>

        {/* Corner markers */}
        <View pointerEvents="none" style={{ position: "absolute", width: CORNER_SIZE, height: CORNER_SIZE, top: CORNER_TOP, left: CORNER_LEFT, borderTopWidth: CORNER_T, borderLeftWidth: CORNER_T, borderColor: colors.cyan }} />
        <View pointerEvents="none" style={{ position: "absolute", width: CORNER_SIZE, height: CORNER_SIZE, top: CORNER_TOP, right: CORNER_LEFT, borderTopWidth: CORNER_T, borderRightWidth: CORNER_T, borderColor: colors.cyan }} />
        <View pointerEvents="none" style={{ position: "absolute", width: CORNER_SIZE, height: CORNER_SIZE, top: CORNER_TOP + CARD_H - CORNER_SIZE, left: CORNER_LEFT, borderBottomWidth: CORNER_T, borderLeftWidth: CORNER_T, borderColor: colors.cyan }} />
        <View pointerEvents="none" style={{ position: "absolute", width: CORNER_SIZE, height: CORNER_SIZE, top: CORNER_TOP + CARD_H - CORNER_SIZE, right: CORNER_LEFT, borderBottomWidth: CORNER_T, borderRightWidth: CORNER_T, borderColor: colors.cyan }} />

        <SafeAreaView style={{ ...StyleSheet.absoluteFillObject, justifyContent: "space-between" } as any} edges={["top", "bottom"]}>
          <TouchableOpacity onPress={() => setScannerOpen(false)}
            style={{ alignSelf: "flex-start", margin: 16, padding: 8, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 20 }}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>

          <View style={{ alignItems: "center", paddingTop: 8 }}>
            <Text style={{ color: "#fff", fontSize: 20, fontWeight: "800" }}>Scan Licence</Text>
            <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 4 }}>Fit your licence inside the frame</Text>
          </View>

          <View style={{ alignItems: "center", paddingBottom: 40, gap: 24 }}>
            <View style={{ flexDirection: "row", gap: 16 }}>
              {["Flat on surface", "No glare", "All text visible"].map((t, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.cyan} />
                  <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 12 }}>{t}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity
              style={[{ width: 72, height: 72, borderRadius: 36, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: colors.cyan }, capturing && { opacity: 0.5 }]}
              onPress={captureDocument}
              disabled={capturing}>
              {capturing
                ? <ActivityIndicator color="#000" />
                : <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.cyan }} />}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }if (loadingStatus) {
    return (
      <SafeAreaView style={s.root} edges={["top"]}>
        <ActivityIndicator color={colors.cyan} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (status === "approved") {
    return (
      <SafeAreaView style={s.root} edges={["top"]}>
        <View style={s.statusContainer}>
          <View style={[s.statusIcon, { backgroundColor: colors.greenDim, borderColor: colors.green }]}>
            <Ionicons name="checkmark-circle" size={48} color={colors.green} />
          </View>
          <Text style={s.statusTitle}>Identity Verified ✓</Text>
          <Text style={s.statusSub}>Your identity has been verified. You can now receive payments on Tag n Ride.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (status === "pending") {
    return (
      <SafeAreaView style={s.root} edges={["top"]}>
        <View style={s.statusContainer}>
          <View style={[s.statusIcon, { backgroundColor: "#FFD60A22", borderColor: "#FFD60A" }]}>
            <Ionicons name="time" size={48} color="#FFD60A" />
          </View>
          <Text style={s.statusTitle}>Under Review</Text>
          <Text style={s.statusSub}>
            Your documents have been submitted and are being reviewed.{"\n\n"}
            This usually takes 24 to 48 hours.
          </Text>
        </View>
      </SafeAreaView>
    );
  }return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text style={s.title}>Identity Verification</Text>
        <Text style={s.subtitle}>We need to verify your identity before you can receive payments.</Text>

        {status === "rejected" && rejectionReason && (
          <View style={s.rejectedCard}>
            <Ionicons name="close-circle" size={20} color={colors.red} />
            <View style={{ flex: 1 }}>
              <Text style={s.rejectedTitle}>Documents Rejected</Text>
              <Text style={s.rejectedReason}>{rejectionReason}</Text>
              <Text style={s.rejectedHint}>Please resubmit with clearer photos.</Text>
            </View>
          </View>
        )}

        <View style={s.stepRow}>
          {([1, 2, 3] as Step[]).map((num) => (
            <View key={num} style={s.stepWrap}>
              <View style={[s.stepCircle, step === num && s.stepCircleActive, step > num && s.stepCircleDone]}>
                {step > num
                  ? <Ionicons name="checkmark" size={14} color={colors.bg} />
                  : <Text style={[s.stepNum, step === num && s.stepNumActive]}>{num}</Text>}
              </View>
              <Text style={[s.stepLabel, step === num && s.stepLabelActive]}>
                {num === 1 ? "Selfie" : num === 2 ? "Licence" : "Review"}
              </Text>
              {num < 3 && <View style={[s.stepLine, step > num && s.stepLineDone]} />}
            </View>
          ))}
        </View>

        {step === 1 && (
          <View style={s.stepContent}>
            <Text style={s.stepTitle}>Step 1 — Take a Selfie</Text>
            <Text style={s.stepDesc}>Use the front camera. Make sure your face is clearly visible, well-lit, and not covered.</Text>
            {selfie ? (
              <View style={s.previewWrap}>
                <Image source={{ uri: selfie.uri }} style={s.selfiePrev} />
                <View style={s.previewCheck}><Ionicons name="checkmark-circle" size={28} color={colors.green} /></View>
                <TouchableOpacity style={s.retakeBtn} onPress={takeSelfie}>
                  <Ionicons name="refresh" size={15} color={colors.cyan} />
                  <Text style={s.retakeText}>Retake</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={s.cameraBtn} onPress={takeSelfie} activeOpacity={0.8}>
                <View style={s.cameraBtnIcon}><Ionicons name="person" size={32} color={colors.cyan} /></View>
                <Text style={s.cameraBtnText}>Take Selfie</Text>
                <Text style={s.cameraBtnHint}>Front camera · Face clearly visible</Text>
              </TouchableOpacity>
            )}
            <View style={s.tipsCard}>
              {["Look directly at the camera", "Good lighting — no shadows", "Remove sunglasses or hat", "Neutral expression"].map((t, i) => (
                <View key={i} style={s.tip}>
                  <Ionicons name="checkmark-circle-outline" size={14} color={colors.cyan} />
                  <Text style={s.tipText}>{t}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={[s.nextBtn, !selfie && s.nextBtnDisabled]} onPress={() => selfie && setStep(2)} disabled={!selfie}>
              <Text style={s.nextBtnText}>Next — Scan Licence</Text>
              <Ionicons name="arrow-forward" size={18} color={colors.bg} />
            </TouchableOpacity>
          </View>
        )}

        {step === 2 && (
          <View style={s.stepContent}>
            <TouchableOpacity onPress={() => setStep(1)} style={s.backBtn}>
              <Ionicons name="arrow-back" size={16} color={colors.textMuted} />
              <Text style={s.backText}>Back to selfie</Text>
            </TouchableOpacity>
            <Text style={s.stepTitle}>Step 2 — Scan Licence</Text>
            <Text style={s.stepDesc}>Place your driver's licence flat on a surface. Tap below to open the document scanner.</Text>
            {licence ? (
              <View style={s.previewWrap}>
                <Image source={{ uri: licence.uri }} style={s.licencePrev} />
                <View style={s.previewCheck}><Ionicons name="checkmark-circle" size={28} color={colors.green} /></View>
                <TouchableOpacity style={s.retakeBtn} onPress={openLicenceScanner}>
                  <Ionicons name="refresh" size={15} color={colors.cyan} />
                  <Text style={s.retakeText}>Rescan</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={s.cameraBtn} onPress={openLicenceScanner} activeOpacity={0.8}>
                <View style={s.cameraBtnIcon}><Ionicons name="card" size={32} color={colors.cyan} /></View>
                <Text style={s.cameraBtnText}>Scan Licence</Text>
                <Text style={s.cameraBtnHint}>Document scanner · Back camera</Text>
              </TouchableOpacity>
            )}
            <View style={s.tipsCard}>
              {["All text must be readable", "No glare or reflections", "Licence flat — not curved", "Entire card in frame"].map((t, i) => (
                <View key={i} style={s.tip}>
                  <Ionicons name="checkmark-circle-outline" size={14} color={colors.cyan} />
                  <Text style={s.tipText}>{t}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={[s.nextBtn, !licence && s.nextBtnDisabled]} onPress={() => licence && setStep(3)} disabled={!licence}>
              <Text style={s.nextBtnText}>Next — Review & Submit</Text>
              <Ionicons name="arrow-forward" size={18} color={colors.bg} />
            </TouchableOpacity>
          </View>
        )}

        {step === 3 && (
          <View style={s.stepContent}>
            <TouchableOpacity onPress={() => setStep(2)} style={s.backBtn}>
              <Ionicons name="arrow-back" size={16} color={colors.textMuted} />
              <Text style={s.backText}>Back to licence</Text>
            </TouchableOpacity>
            <Text style={s.stepTitle}>Step 3 — Review & Submit</Text>
            <Text style={s.stepDesc}>Check that both photos are clear before submitting.</Text>
            <View style={s.reviewRow}>
              <View style={s.reviewItem}>
                <Text style={s.reviewLabel}>SELFIE</Text>
                <Image source={{ uri: selfie?.uri }} style={s.reviewSelfie} />
                <TouchableOpacity style={s.reviewRetake} onPress={() => setStep(1)}>
                  <Ionicons name="refresh" size={13} color={colors.cyan} />
                  <Text style={s.retakeText}>Redo</Text>
                </TouchableOpacity>
              </View>
              <View style={s.reviewItem}>
                <Text style={s.reviewLabel}>LICENCE</Text>
                <Image source={{ uri: licence?.uri }} style={s.reviewLicence} />
                <TouchableOpacity style={s.reviewRetake} onPress={() => setStep(2)}>
                  <Ionicons name="refresh" size={13} color={colors.cyan} />
                  <Text style={s.retakeText}>Redo</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={s.submitNote}>
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.textMuted} />
              <Text style={s.submitNoteText}>Documents are encrypted and only used for identity verification. Never shared with third parties.</Text>
            </View>
            <Button label="Submit for Verification" onPress={handleSubmit} loading={submitting} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
const makeStyles = (colors: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 24, fontWeight: "800", marginBottom: 6 },
  subtitle: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 20 },
  statusContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  statusIcon: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center", borderWidth: 1, marginBottom: 24 },
  statusTitle: { color: colors.text, fontSize: 24, fontWeight: "800", textAlign: "center" },
  statusSub: { color: colors.textMuted, fontSize: 15, textAlign: "center", marginTop: 12, lineHeight: 22 },
  rejectedCard: { flexDirection: "row", gap: 12, alignItems: "flex-start", backgroundColor: colors.redDim, borderRadius: radius.md, borderWidth: 1, borderColor: colors.red, padding: 14, marginBottom: 20 },
  rejectedTitle: { color: colors.red, fontWeight: "800", fontSize: 14 },
  rejectedReason: { color: colors.text, fontSize: 13, marginTop: 4 },
  rejectedHint: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  stepRow: { flexDirection: "row", alignItems: "center", marginBottom: 28 },
  stepWrap: { flexDirection: "row", alignItems: "center", flex: 1 },
  stepCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  stepCircleActive: { borderColor: colors.cyan, backgroundColor: colors.cyanDim },
  stepCircleDone: { backgroundColor: colors.green, borderColor: colors.green },
  stepNum: { color: colors.textDim, fontSize: 13, fontWeight: "800" },
  stepNumActive: { color: colors.cyan },
  stepLabel: { color: colors.textDim, fontSize: 11, fontWeight: "700", marginLeft: 6 },
  stepLabelActive: { color: colors.cyan },
  stepLine: { flex: 1, height: 1, backgroundColor: colors.border, marginHorizontal: 6 },
  stepLineDone: { backgroundColor: colors.green },
  stepContent: { gap: 16 },
  stepTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  stepDesc: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  cameraBtn: { backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 32, alignItems: "center" },
  cameraBtnIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.cyanDim, borderWidth: 1, borderColor: colors.cyan, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  cameraBtnText: { color: colors.text, fontWeight: "700", fontSize: 16 },
  cameraBtnHint: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  previewWrap: { alignItems: "center" },
  selfiePrev: { width: "100%", aspectRatio: 1, borderRadius: radius.md, borderWidth: 2, borderColor: colors.green },
  licencePrev: { width: "100%", aspectRatio: 16 / 10, borderRadius: radius.md, borderWidth: 2, borderColor: colors.green },
  previewCheck: { position: "absolute", top: 10, right: 10, backgroundColor: colors.bg, borderRadius: 14 },
  retakeBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.cyanDim, borderRadius: 999, borderWidth: 1, borderColor: colors.cyan },
  retakeText: { color: colors.cyan, fontWeight: "700", fontSize: 13 },
  tipsCard: { backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 10 },
  tip: { flexDirection: "row", alignItems: "center", gap: 8 },
  tipText: { color: colors.textMuted, fontSize: 13, flex: 1 },
  nextBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.cyan, borderRadius: radius.md, padding: 16 },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { color: colors.bg, fontWeight: "800", fontSize: 15 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  backText: { color: colors.textMuted, fontSize: 13 },
  reviewRow: { flexDirection: "row", gap: 12 },
  reviewItem: { flex: 1, alignItems: "center", gap: 8 },
  reviewLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 1.4 },
  reviewSelfie: { width: "100%", aspectRatio: 1, borderRadius: radius.md, borderWidth: 2, borderColor: colors.green },
  reviewLicence: { width: "100%", aspectRatio: 1, borderRadius: radius.md, borderWidth: 2, borderColor: colors.green },
  reviewRetake: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.cyanDim, borderRadius: 999, borderWidth: 1, borderColor: colors.cyan },
  submitNote: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: colors.bg2, borderRadius: radius.sm, padding: 12, borderWidth: 1, borderColor: colors.border },
  submitNoteText: { color: colors.textMuted, fontSize: 12, flex: 1, lineHeight: 18 },
});
