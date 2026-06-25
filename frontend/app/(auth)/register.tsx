import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, TouchableOpacity, Image, Alert, ActivityIndicator,
  Modal,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Field, Button, CountryChip, PoweredBy, SelectField, ListPickerModal } from "../../src/ui";
import { colors, radius } from "../../src/theme";
import { useAuth } from "../../src/AuthContext";
import { api, SA_PROVINCES } from "../../src/api";

type Role = "passenger" | "driver" | "owner";
type Step = "form" | "kyc";

// ── Web Camera Component ─────────────────────────────────────
function WebCamera({
  visible, onCapture, onClose, title = "Take Photo", aspectRatio = "1:1",
}: {
  visible: boolean;
  onCapture: (base64: string, uri: string) => void;
  onClose: () => void;
  title?: string;
  aspectRatio?: "1:1" | "4:3";
}) {
  const videoRef = useRef<any>(null);
  const canvasRef = useRef<any>(null);
  const streamRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [flashOn, setFlashOn] = useState(false);
  const [flashSupported, setFlashSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) startCamera();
    return () => stopCamera();
  }, [visible, facingMode]);

  const startCamera = async () => {
    setReady(false);
    setError(null);
    stopCamera();
    try {
      const stream = await (navigator as any).mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setReady(true);
      }
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities?.();
      setFlashSupported(!!caps?.torch);
    } catch {
      setError("Camera access denied. Please allow camera access in your browser settings.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t: any) => t.stop());
      streamRef.current = null;
    }
    setReady(false);
    setFlashOn(false);
  };

  const toggleFlash = async () => {
    if (!streamRef.current || !flashSupported) return;
    const track = streamRef.current.getVideoTracks()[0];
    const newFlash = !flashOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: newFlash }] });
      setFlashOn(newFlash);
    } catch {}
  };

  const capture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const isSquare = aspectRatio === "1:1";
    const size = Math.min(video.videoWidth, video.videoHeight);
    canvas.width = isSquare ? size : video.videoWidth;
    canvas.height = isSquare ? size : video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (isSquare) {
      const offsetX = (video.videoWidth - size) / 2;
      const offsetY = (video.videoHeight - size) / 2;
      ctx.drawImage(video, offsetX, offsetY, size, size, 0, 0, size, size);
    } else {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    const base64 = dataUrl.split(",")[1];
    stopCamera();
    onCapture(base64, dataUrl);
  };

  const handleClose = () => { stopCamera(); onClose(); };

  if (!visible) return null;

  return (
    <View style={camStyles.overlay}>
      <View style={camStyles.container}>

        {/* Header */}
        <View style={camStyles.header}>
          <TouchableOpacity onPress={handleClose} style={camStyles.headerBtn}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={camStyles.headerTitle}>{title}</Text>
          <View style={camStyles.headerRight}>
            {flashSupported && (
              <TouchableOpacity onPress={toggleFlash} style={camStyles.headerBtn}>
                <Ionicons
                  name={flashOn ? "flash" : "flash-off"}
                  size={22}
                  color={flashOn ? "#FFD60A" : colors.textMuted}
                />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => setFacingMode(f => f === "user" ? "environment" : "user")}
              style={camStyles.headerBtn}>
              <Ionicons name="camera-reverse-outline" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Video */}
        <View style={[camStyles.videoWrap, aspectRatio === "1:1" ? camStyles.square : camStyles.landscape]}>
          {error ? (
            <View style={camStyles.errorWrap}>
              <Ionicons name="camera-off-outline" size={48} color={colors.red} />
              <Text style={camStyles.errorText}>{error}</Text>
              <TouchableOpacity onPress={startCamera} style={camStyles.retryBtn}>
                <Text style={camStyles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* @ts-ignore */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: "100%", height: "100%", objectFit: "cover",
                  transform: facingMode === "user" ? "scaleX(-1)" : "none",
                  borderRadius: 12,
                }}
              />
              {!ready && (
                <View style={camStyles.loadingOverlay}>
                  <ActivityIndicator color={colors.cyan} size="large" />
                  <Text style={camStyles.loadingText}>Starting camera...</Text>
                </View>
              )}
              {/* Corner guides */}
              <View style={[camStyles.corner, camStyles.cTL]} />
              <View style={[camStyles.corner, camStyles.cTR]} />
              <View style={[camStyles.corner, camStyles.cBL]} />
              <View style={[camStyles.corner, camStyles.cBR]} />
            </>
          )}
        </View>

        {/* @ts-ignore */}
        <canvas ref={canvasRef} style={{ display: "none" }} />

        {/* Capture button */}
        {!error && (
          <View style={camStyles.captureRow}>
            <TouchableOpacity
              onPress={capture}
              disabled={!ready}
              style={[camStyles.captureBtn, !ready && { opacity: 0.4 }]}>
              <View style={camStyles.captureBtnInner} />
            </TouchableOpacity>
          </View>
        )}

        <Text style={camStyles.hint}>
          {aspectRatio === "1:1"
            ? "Centre your face in the frame"
            : "Ensure all licence text is readable"}
        </Text>
      </View>
    </View>
  );
}

// ── T&C / Privacy Modal ──────────────────────────────────────
const TC_CONTENT = {
  terms: {
    title: "Terms of Service",
    sections: [
      {
        heading: "1. Acceptance of Terms",
        body: "By creating a Tag-n-Ride account you agree to these Terms of Service and our Privacy Policy. If you do not agree, do not use the platform.",
      },
      {
        heading: "2. The Service",
        body: "Tag-n-Ride is a QR-code-based digital payment platform for South African taxi and ride-share trips. It enables passengers to pay drivers electronically and allows drivers and fleet owners to receive and manage payments.",
      },
      {
        heading: "3. Account Registration",
        body: "• You must provide accurate, complete, and current personal information.\n• You must be at least 18 years old to register.\n• You are solely responsible for the security and confidentiality of your 4-digit PIN. Do not share it with anyone under any circumstances.\n• Tag-n-Ride staff, agents, and support personnel will NEVER ask for your PIN. Any person claiming to be from Tag-n-Ride who requests your PIN should be reported immediately.\n• Only one account per person is permitted.",
      },
      {
        heading: "4. Payments & Fees",
        body: "• All transactions are processed in South African Rand (ZAR).\n• A platform service fee applies to driver earnings, disclosed at the time of use.\n• Withdrawals are subject to processing fees.\n• All completed transactions are final. Disputes must be reported within 24 hours to support@tagnride.com.",
      },
      {
        heading: "5. Driver & Fleet Owner Obligations",
        body: "• Drivers must complete identity verification (KYC) before receiving payments.\n• Fleet owners are responsible for ensuring their registered drivers comply with all applicable South African laws and transport regulations.\n• Vehicle registration plate numbers must be accurate and kept up to date.",
      },
      {
        heading: "6. Prohibited Conduct",
        body: "You may not use Tag-n-Ride to:\n• Process fraudulent or unauthorized transactions.\n• Impersonate another person or create false accounts.\n• Violate any law or regulation of the Republic of South Africa.\n• Attempt to tamper with, reverse-engineer, or disrupt the platform.\n• Harass or harm other users.",
      },
      {
        heading: "7. Account Security & Your Responsibilities",
        body: "Every user is personally responsible for the security of their Tag-n-Ride account. You agree to the following:\n\nPIN Protection\n• Your PIN must be kept strictly confidential at all times. Never write it down, share it verbally, or enter it where others can observe you.\n• If you believe your PIN has been compromised, change it immediately from the Profile section of the app, or call us on 083 278 9333.\n\nLost or Stolen Device\n• If your device is lost or stolen, you must contact Tag-n-Ride support immediately to suspend your account and prevent unauthorised access.\n• You can reach us through any of the following:\n  — WhatsApp: 083 278 9333\n  — Email: support@tagnride.com\n  — Call Centre: 083 278 9333\n• Failure to report a lost or stolen device promptly may result in financial loss for which Tag-n-Ride cannot be held responsible.\n\nGeneral\n• Do not leave the app open on a shared or unattended device.\n• Regularly review your transaction history and report any suspicious activity immediately.\n• Use a device with a screen lock enabled to add an additional layer of protection.",
      },
      {
        heading: "8. Account Suspension",
        body: "We reserve the right to suspend or permanently close accounts found to be in violation of these Terms or involved in fraudulent activity, without prior notice.",
      },
      {
        heading: "9. Limitation of Liability & Disclaimer of Negligence",
        body: "Tag-n-Ride shall not be held liable or accountable for any losses — financial or otherwise — arising from:\n\n• User negligence, including but not limited to: sharing your PIN with another person, writing your PIN down, failing to secure your device, or allowing another person access to your account.\n• Failure to report a lost or stolen device promptly.\n• Unauthorised transactions resulting from the user's failure to protect their login credentials.\n• Actions of third parties, including fraud, social engineering, or scams targeting the user.\n• Service interruptions, technical failures, or circumstances beyond our reasonable control.\n\nEach user accepts full responsibility for all activity that occurs under their account. Tag-n-Ride provides a secure platform, but cannot protect users from the consequences of their own negligence. If you believe a transaction was made without your authorisation, report it immediately through our support channels. Our total liability is limited to the rand value of the disputed transaction.",
      },
      {
        heading: "10. Governing Law",
        body: "These Terms are governed by the laws of the Republic of South Africa.",
      },
      {
        heading: "11. Changes to Terms",
        body: "We may update these Terms from time to time. We will notify you of material changes via the app. Continued use after changes are posted constitutes acceptance.",
      },
      {
        heading: "Contact & Support",
        body: "For any account queries, disputes, or emergencies:\n\n• WhatsApp: 083 278 9333\n• Email: support@tagnride.com\n• Call Centre: 083 278 9333\n\nSupport hours and response times are available on our website.",
      },
    ],
  },
  privacy: {
    title: "Privacy Policy",
    sections: [
      {
        heading: "1. Information We Collect",
        body: "• Personal details: name, surname, email address, and ID/passport number.\n• Identity documents: selfie photo and driver's licence (for KYC verification only).\n• Transaction data: payment history, wallet balance, and trip records.\n• Device information: app version and device type (for support and troubleshooting).",
      },
      {
        heading: "2. How We Use Your Information",
        body: "• To create and manage your account.\n• To process payments and withdrawals.\n• To verify your identity as required by law (FICA).\n• To detect and prevent fraud.\n• To send important account notifications (no marketing without consent).\n• To improve our service.",
      },
      {
        heading: "3. Sharing of Information",
        body: "We do not sell your personal information. We only share data with:\n• Payment processors (e.g., Stitch) strictly to facilitate transactions.\n• South African regulatory and law enforcement authorities when legally required.\n• Service providers who operate the platform under strict confidentiality obligations.",
      },
      {
        heading: "4. Data Security",
        body: "Your data is encrypted in transit (TLS) and at rest. Identity documents are stored securely and accessed only by authorised personnel for verification purposes.",
      },
      {
        heading: "5. Your Rights under POPIA",
        body: "Under the Protection of Personal Information Act (POPIA) you have the right to:\n• Access your personal information we hold.\n• Request correction of inaccurate information.\n• Request deletion of your personal data.\n• Object to processing of your data.\n\nTo exercise these rights, contact: privacy@tagnride.com",
      },
      {
        heading: "6. Data Retention",
        body: "We retain personal data for as long as your account is active and for up to 5 years after account closure, as required by South African financial regulations.",
      },
      {
        heading: "7. Analytics",
        body: "We collect anonymised, aggregated usage data to improve the service. No advertising trackers are used.",
      },
      {
        heading: "Contact",
        body: "Tag-n-Ride, South Africa\n\n• WhatsApp: 083 278 9333\n• Email: privacy@tagnride.com\n• Call Centre: 083 278 9333",
      },
    ],
  },
};

function TcModal({
  visible, type, onClose,
}: {
  visible: boolean;
  type: "terms" | "privacy";
  onClose: () => void;
}) {
  const content = TC_CONTENT[type];
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={tcStyles.root}>
        <View style={tcStyles.header}>
          <Text style={tcStyles.title}>{content.title}</Text>
          <TouchableOpacity onPress={onClose} style={tcStyles.closeBtn}>
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>
        <Text style={tcStyles.lastUpdated}>Last updated: June 2026</Text>
        <ScrollView style={tcStyles.scroll} contentContainerStyle={{ paddingBottom: 40 }}>
          {content.sections.map((s, i) => (
            <View key={i} style={tcStyles.section}>
              <Text style={tcStyles.heading}>{s.heading}</Text>
              <Text style={tcStyles.body}>{s.body}</Text>
            </View>
          ))}
        </ScrollView>
        <View style={tcStyles.footer}>
          <TouchableOpacity onPress={onClose} style={tcStyles.doneBtn}>
            <Text style={tcStyles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// ── Main Register Screen ─────────────────────────────────────
export default function Register() {
  const router = useRouter();
  const { signUp } = useAuth();

  const [role, setRole] = useState<Role>("passenger");
  const [step, setStep] = useState<Step>("form");

  // Form fields
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [phone, setPhone] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [plate, setPlate] = useState("");
  const [province, setProvince] = useState("");
  const [provinceModal, setProvinceModal] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // T&C acceptance
  const [tcAccepted, setTcAccepted] = useState(false);
  const [tcModal, setTcModal] = useState<"terms" | "privacy" | null>(null);

  // KYC
  const [selfie, setSelfie] = useState<{ uri: string; base64: string } | null>(null);
  const [licence, setLicence] = useState<{ uri: string; base64: string } | null>(null);
  const [uploadingKyc, setUploadingKyc] = useState(false);

  // Web camera
  const [cameraVisible, setCameraVisible] = useState(false);
  const [cameraTarget, setCameraTarget] = useState<"selfie" | "licence">("selfie");

  const validateForm = () => {
    setErr(null);
    if (name.trim().length < 2) { setErr("Enter your first name"); return false; }
    if (surname.trim().length < 2) { setErr("Enter your surname"); return false; }
    const localDigits = phone.replace(/\D/g, "").replace(/^0+/, "");
    if (localDigits.length < 9) { setErr("Enter a valid SA phone number (9 digits)"); return false; }
    if (pin.length !== 4) { setErr("PIN must be 4 digits"); return false; }
    if (pin !== pin2) { setErr("PINs don't match"); return false; }
    if (!province) { setErr("Select your province"); return false; }
    if (role === "driver" && plate.trim().length < 2) { setErr("Enter your vehicle plate number"); return false; }
    if (email.trim() && !/\S+@\S+\.\S+/.test(email.trim())) { setErr("Enter a valid email address"); return false; }
    if (!tcAccepted) { setErr("You must accept the Terms of Service and Privacy Policy to continue"); return false; }
    return true;
  };

  const onNext = async () => {
    if (!validateForm()) return;
    if (role === "owner") { router.push("/(auth)/owner-register"); return; }
    if (role === "driver") { setStep("kyc"); return; }
    await submitRegistration();
  };

  // Native image picker (iOS/Android only)
  const pickImage = async (type: "selfie" | "licence", camera: boolean) => {
    try {
      const { status } = camera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission required", `Please allow ${camera ? "camera" : "gallery"} access.`);
        return;
      }
      const opts = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7 as any,
        base64: true,
        allowsEditing: true,
        aspect: type === "selfie" ? [1, 1] as [number, number] : [4, 3] as [number, number],
      };
      const result = camera
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const data = { uri: asset.uri, base64: asset.base64 || "" };
        if (type === "selfie") setSelfie(data);
        else setLicence(data);
      }
    } catch {
      Alert.alert("Error", "Could not open camera/gallery.");
    }
  };

  const showImageOptions = (type: "selfie" | "licence") => {
    if (Platform.OS === "web") {
      setCameraTarget(type);
      setCameraVisible(true);
      return;
    }
    Alert.alert(
      type === "selfie" ? "Take Selfie" : "Licence Photo",
      "Choose source",
      [
        { text: "Camera", onPress: () => pickImage(type, true) },
        { text: "Gallery", onPress: () => pickImage(type, false) },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  const submitRegistration = async () => {
    setLoading(true);
    try {
      const localDigits = phone.replace(/\D/g, "").replace(/^0+/, "");
      await signUp({
        phone_number: "+27" + localDigits,
        full_name: name.trim(),
        surname: surname.trim(),
        pin,
        role,
        vehicle_plate: role === "driver" ? plate.trim().toUpperCase() : undefined,
        id_number: idNumber.trim() || undefined,
        email: email.trim() || undefined,
        province,
      });
      router.replace("/(app)");
    } catch (e: any) {
      setErr(e?.message || "Registration failed");
      setStep("form");
    } finally {
      setLoading(false);
    }
  };

  const submitWithKyc = async () => {
    if (!selfie) { Alert.alert("Required", "Please take a selfie."); return; }
    if (!licence) { Alert.alert("Required", "Please photograph your driver's licence."); return; }
    setUploadingKyc(true);
    try {
      const localDigits = phone.replace(/\D/g, "").replace(/^0+/, "");
      await signUp({
        phone_number: "+27" + localDigits,
        full_name: name.trim(),
        surname: surname.trim(),
        pin,
        role,
        vehicle_plate: plate.trim().toUpperCase(),
        id_number: idNumber.trim() || undefined,
        email: email.trim() || undefined,
        province,
      });
      try {
        await api.submitKyc(selfie.base64, licence.base64);
      } catch {
        // KYC can be submitted later from profile
      }
      router.replace("/(app)");
    } catch (e: any) {
      setErr(e?.message || "Registration failed");
      setStep("form");
    } finally {
      setUploadingKyc(false);
    }
  };

  // ── KYC Step ───────────────────────────────────────────────
  if (step === "kyc") {
    return (
      <SafeAreaView style={styles.root}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled">

            <TouchableOpacity onPress={() => setStep("form")} style={styles.back}>
              <Ionicons name="chevron-back" size={26} color={colors.text} />
            </TouchableOpacity>

            <Image
              source={require("../../assets/images/icon.png")}
              style={styles.logo}
              resizeMode="contain"
            />

            <Text style={styles.title}>Identity Verification</Text>
            <Text style={styles.sub}>Required to receive payments as a driver</Text>

            <View style={styles.kycInfoCard}>
              <Ionicons name="shield-checkmark-outline" size={20} color={colors.cyan} />
              <Text style={styles.kycInfoText}>
                Your documents are encrypted and used only for verification.
                This helps keep Tag n Ride safe for everyone.
              </Text>
            </View>

            <View style={{ height: 16 }} />

            {/* Selfie */}
            <Text style={styles.kycLabel}>SELFIE PHOTO</Text>
            <Text style={styles.kycHint}>Look directly at the camera with good lighting</Text>
            <TouchableOpacity
              style={[styles.kycUpload, selfie && styles.kycUploadDone]}
              onPress={() => showImageOptions("selfie")}
              testID="selfie-btn">
              {selfie ? (
                <View style={styles.kycPreviewWrap}>
                  <Image source={{ uri: selfie.uri }} style={styles.kycPreview} />
                  <View style={styles.kycDoneBadge}>
                    <Ionicons name="checkmark-circle" size={28} color={colors.green} />
                  </View>
                </View>
              ) : (
                <View style={styles.kycPlaceholder}>
                  <Ionicons name="camera-outline" size={40} color={colors.textMuted} />
                  <Text style={styles.kycPlaceholderText}>Tap to take selfie</Text>
                  <Text style={styles.kycPlaceholderSub}>Front-facing camera recommended</Text>
                </View>
              )}
            </TouchableOpacity>

            <View style={{ height: 20 }} />

            {/* Licence */}
            <Text style={styles.kycLabel}>DRIVER'S LICENCE</Text>
            <Text style={styles.kycHint}>Photograph the front of your licence clearly</Text>
            <TouchableOpacity
              style={[styles.kycUpload, styles.kycLicence, licence && styles.kycUploadDone]}
              onPress={() => showImageOptions("licence")}
              testID="licence-btn">
              {licence ? (
                <View style={styles.kycPreviewWrap}>
                  <Image
                    source={{ uri: licence.uri }}
                    style={[styles.kycPreview, { aspectRatio: 4 / 3 }]}
                  />
                  <View style={styles.kycDoneBadge}>
                    <Ionicons name="checkmark-circle" size={28} color={colors.green} />
                  </View>
                </View>
              ) : (
                <View style={styles.kycPlaceholder}>
                  <Ionicons name="card-outline" size={40} color={colors.textMuted} />
                  <Text style={styles.kycPlaceholderText}>Tap to photograph licence</Text>
                  <Text style={styles.kycPlaceholderSub}>Make sure all text is readable</Text>
                </View>
              )}
            </TouchableOpacity>

            <View style={{ height: 8 }} />

            {/* Skip */}
            <TouchableOpacity
              onPress={() =>
                Alert.alert(
                  "Skip KYC?",
                  "You can still create your account but you won't be able to receive payments until KYC is approved. You can submit it later from your profile.",
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: "Skip for now", onPress: submitRegistration },
                  ]
                )
              }
              style={styles.skipBtn}>
              <Text style={styles.skipText}>Skip for now — submit later</Text>
            </TouchableOpacity>

            <View style={{ height: 12 }} />

            {uploadingKyc ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.cyan} />
                <Text style={styles.loadingText}>
                  Creating account & uploading documents...
                </Text>
              </View>
            ) : (
              <Button
                label="Submit & Create Account"
                onPress={submitWithKyc}
                icon="checkmark-circle-outline"
                testID="kyc-submit-btn"
              />
            )}

            <PoweredBy />
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Web Camera — overlays the whole screen */}
        {Platform.OS === "web" && (
          <WebCamera
            visible={cameraVisible}
            title={cameraTarget === "selfie" ? "Take Selfie" : "Photograph Licence"}
            aspectRatio={cameraTarget === "selfie" ? "1:1" : "4:3"}
            onCapture={(base64, uri) => {
              const data = { uri, base64 };
              if (cameraTarget === "selfie") setSelfie(data);
              else setLicence(data);
              setCameraVisible(false);
            }}
            onClose={() => setCameraVisible(false)}
          />
        )}
      </SafeAreaView>
    );
  }

  // ── Form Step ──────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.root} testID="register-screen">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled">

          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.back}
            testID="register-back-btn">
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

          {/* Role selection */}
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

          {/* Owner option */}
          <TouchableOpacity
            testID="role-owner"
            onPress={() => setRole("owner")}
            activeOpacity={0.85}
            style={[styles.ownerRole, role === "owner" && styles.ownerRoleActive]}>
            <View style={styles.ownerRoleLeft}>
              <View style={[
                styles.ownerIcon,
                role === "owner" && { backgroundColor: colors.cyanDim, borderColor: colors.cyan }
              ]}>
                <Ionicons
                  name="business-outline"
                  size={22}
                  color={role === "owner" ? colors.cyan : colors.textMuted}
                />
              </View>
              <View>
                <Text style={[styles.ownerLabel, role === "owner" && { color: colors.cyan }]}>
                  Fleet Owner
                </Text>
                <Text style={styles.ownerHint}>Manage drivers & view fleet earnings</Text>
              </View>
            </View>
            {role === "owner" && (
              <Ionicons name="checkmark-circle" size={22} color={colors.cyan} />
            )}
          </TouchableOpacity>

          <View style={{ height: 12 }} />

          {/* Driver KYC notice */}
          {role === "driver" && (
            <View style={styles.driverNotice}>
              <Ionicons name="information-circle-outline" size={18} color={colors.cyan} />
              <Text style={styles.driverNoticeText}>
                Drivers need to verify their identity with a selfie and licence photo.
                You'll do this in the next step.
              </Text>
            </View>
          )}

          {/* Form fields */}
          {role !== "owner" && (
            <>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Field
                    label="First name"
                    placeholder="Jane"
                    value={name}
                    onChangeText={setName}
                    testID="register-name-input"
                    autoCapitalize="words"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Surname"
                    placeholder="Doe"
                    value={surname}
                    onChangeText={setSurname}
                    testID="register-surname-input"
                    autoCapitalize="words"
                  />
                </View>
              </View>
              <Field
                label="ID / Passport number"
                placeholder="8001015009087"
                value={idNumber}
                onChangeText={(t) => setIdNumber(t.replace(/\s/g, "").slice(0, 30))}
                testID="register-id-input"
                autoCapitalize="characters"
              />
              <Field
                label="Email address (optional)"
                placeholder="jane@example.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                testID="register-email-input"
                autoCapitalize="none"
              />
              <Field
                label="Phone number"
                placeholder="82 123 4567"
                value={phone}
                onChangeText={(t) => setPhone(t.replace(/[^0-9 ]/g, "").slice(0, 13))}
                keyboardType="phone-pad"
                testID="register-phone-input"
                leftAddon={<CountryChip testID="register-country-chip" />}
              />
              <SelectField
                label="Province"
                value={province}
                placeholder="Select your province"
                onPress={() => setProvinceModal(true)}
                testID="register-province-select"
              />
              {role === "driver" && (
                <Field
                  label="Vehicle plate number"
                  placeholder="ND 123 456"
                  value={plate}
                  onChangeText={(t) => setPlate(t.toUpperCase().slice(0, 12))}
                  testID="register-plate-input"
                  autoCapitalize="characters"
                />
              )}
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
              {err ? (
                <Text style={styles.err} testID="register-error">{err}</Text>
              ) : null}

              {/* Terms & Conditions */}
              <View style={{ height: 12 }} />
              <View style={styles.tcRow}>
                <TouchableOpacity
                  testID="register-tc-checkbox"
                  activeOpacity={0.8}
                  onPress={() => setTcAccepted(v => !v)}
                  style={[styles.checkbox, tcAccepted && styles.checkboxChecked]}>
                  {tcAccepted && (
                    <Ionicons name="checkmark" size={13} color="#001218" />
                  )}
                </TouchableOpacity>
                <Text style={styles.tcText}>
                  I have read and agree to the{" "}
                  <Text
                    style={styles.tcLink}
                    onPress={() => setTcModal("terms")}>
                    Terms of Service
                  </Text>
                  {" "}and{" "}
                  <Text
                    style={styles.tcLink}
                    onPress={() => setTcModal("privacy")}>
                    Privacy Policy
                  </Text>
                </Text>
              </View>
              {tcModal !== null && (
                <TcModal
                  visible
                  type={tcModal}
                  onClose={() => setTcModal(null)}
                />
              )}
              <ListPickerModal
                visible={provinceModal}
                title="Select Province"
                subtitle="Where are you based? Used to improve service in your area."
                options={SA_PROVINCES}
                selected={province}
                onSelect={(p) => { setProvince(p); setProvinceModal(false); }}
                onClose={() => setProvinceModal(false)}
              />
              <View style={{ height: 12 }} />

              <Button
                label={role === "driver" ? "Next — Verify Identity" : "Create account"}
                onPress={onNext}
                loading={loading}
                disabled={!tcAccepted}
                testID="register-submit-btn"
                icon={role === "driver" ? "arrow-forward-outline" : "rocket-outline"}
              />
            </>
          )}

          {/* Owner CTA */}
          {role === "owner" && (
            <View>
              <View style={styles.ownerInfoCard}>
                <Ionicons name="information-circle-outline" size={20} color={colors.cyan} />
                <Text style={styles.ownerInfoText}>
                  Fleet owner setup takes a few extra steps — you'll set up your business
                  details, PIN, optional driver mode with KYC, and add your first driver.
                </Text>
              </View>
              <Button
                label="Start Fleet Owner Setup"
                onPress={() => router.push("/(auth)/owner-register")}
                icon="arrow-forward-outline"
                testID="register-owner-btn"
              />
            </View>
          )}

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

// ── Role Chip ────────────────────────────────────────────────
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
    style={[styles.role, active && { borderColor: colors.cyan, backgroundColor: colors.cyanDim }]}>
    <Ionicons name={icon} size={26} color={active ? colors.cyan : colors.text} />
    <Text style={[styles.roleLabel, active && { color: colors.cyan }]}>{label}</Text>
    <Text style={styles.roleHint}>{hint}</Text>
  </TouchableOpacity>
);

// ── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: 24, paddingBottom: 40 },
  back: {
    width: 40, height: 40,
    alignItems: "flex-start", justifyContent: "center", marginTop: 8,
  },
  logo: { width: 90, height: 90, alignSelf: "center", marginVertical: 8 },
  title: { color: colors.text, fontSize: 26, fontWeight: "800" },
  sub: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
  roleRow: { flexDirection: "row", gap: 12 },
  role: {
    flex: 1, borderWidth: 1, borderColor: colors.border,
    padding: 16, borderRadius: radius.md, backgroundColor: colors.bg2,
  },
  roleLabel: { color: colors.text, fontSize: 16, fontWeight: "700", marginTop: 8 },
  roleHint: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  ownerRole: {
    marginTop: 12, flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", borderWidth: 1,
    borderColor: colors.border, padding: 16,
    borderRadius: radius.md, backgroundColor: colors.bg2,
  },
  ownerRoleActive: { borderColor: colors.cyan, backgroundColor: colors.cyanDim },
  ownerRoleLeft: { flexDirection: "row", alignItems: "center", gap: 14 },
  ownerIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.bg3, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  ownerLabel: { color: colors.text, fontSize: 16, fontWeight: "700" },
  ownerHint: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  ownerInfoCard: {
    flexDirection: "row", gap: 10, alignItems: "flex-start",
    backgroundColor: colors.cyanDim, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.cyan, padding: 14, marginBottom: 16,
  },
  ownerInfoText: { color: colors.text, fontSize: 13, lineHeight: 18, flex: 1 },
  driverNotice: {
    flexDirection: "row", gap: 10, alignItems: "flex-start",
    backgroundColor: colors.cyanDim, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.cyan, padding: 12, marginBottom: 4,
  },
  driverNoticeText: { color: colors.text, fontSize: 12, lineHeight: 18, flex: 1 },
  err: { color: colors.red, fontSize: 13, marginTop: 4 },
  tcRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    paddingVertical: 4,
  },
  checkbox: {
    width: 20, height: 20, borderRadius: 5,
    borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.bg2,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0, marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: colors.cyan, borderColor: colors.cyan,
  },
  tcText: {
    flex: 1, color: colors.textMuted, fontSize: 12, lineHeight: 18,
  },
  tcLink: { color: colors.cyan, fontWeight: "700" },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: 24 },
  footerText: { color: colors.textMuted },
  link: { color: colors.cyan, fontWeight: "700" },

  // KYC
  kycInfoCard: {
    flexDirection: "row", gap: 10, alignItems: "flex-start",
    backgroundColor: colors.cyanDim, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.cyan, padding: 14,
  },
  kycInfoText: { color: colors.text, fontSize: 13, lineHeight: 18, flex: 1 },
  kycLabel: {
    color: colors.textMuted, fontSize: 11, fontWeight: "700",
    letterSpacing: 1.4, marginBottom: 4,
  },
  kycHint: { color: colors.textDim, fontSize: 12, marginBottom: 10 },
  kycUpload: {
    borderWidth: 2, borderColor: colors.border, borderStyle: "dashed",
    borderRadius: radius.lg, backgroundColor: colors.bg2,
    minHeight: 180, alignItems: "center", justifyContent: "center",
    overflow: "hidden",
  },
  kycLicence: { minHeight: 140 },
  kycUploadDone: { borderColor: colors.green, borderStyle: "solid" },
  kycPreviewWrap: { width: "100%", position: "relative" },
  kycPreview: { width: "100%", aspectRatio: 1, borderRadius: radius.md },
  kycDoneBadge: {
    position: "absolute", bottom: 8, right: 8,
    backgroundColor: colors.bg, borderRadius: 999, padding: 2,
  },
  kycPlaceholder: { alignItems: "center", padding: 24, gap: 8 },
  kycPlaceholderText: { color: colors.textMuted, fontSize: 15, fontWeight: "700" },
  kycPlaceholderSub: { color: colors.textDim, fontSize: 12 },
  skipBtn: { alignItems: "center", padding: 12 },
  skipText: { color: colors.textMuted, fontSize: 13, textDecorationLine: "underline" },
  loadingRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    justifyContent: "center", padding: 16,
  },
  loadingText: { color: colors.textMuted, fontSize: 13 },
});

// ── T&C Modal Styles ─────────────────────────────────────────
const tcStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { color: colors.text, fontSize: 20, fontWeight: "800" },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  lastUpdated: {
    color: colors.textMuted, fontSize: 12,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4,
  },
  scroll: { flex: 1, paddingHorizontal: 20 },
  section: { marginTop: 20 },
  heading: { color: colors.cyan, fontSize: 13, fontWeight: "700", marginBottom: 6 },
  body: { color: colors.textMuted, fontSize: 14, lineHeight: 22 },
  footer: {
    paddingHorizontal: 20, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  doneBtn: {
    backgroundColor: colors.cyan, borderRadius: radius.md,
    paddingVertical: 14, alignItems: "center",
  },
  doneBtnText: { color: colors.bg, fontWeight: "800", fontSize: 16 },
});

// ── Web Camera Styles ─────────────────────────────────────────
const camStyles = StyleSheet.create({
  overlay: {
    position: "absolute" as any,
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.97)",
    zIndex: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    width: "100%",
    maxWidth: 480,
    padding: 20,
  },
  header: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 16,
  },
  headerBtn: {
    width: 40, height: 40, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.bg2, borderRadius: 20,
    borderWidth: 1, borderColor: colors.border,
  },
  headerTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  headerRight: { flexDirection: "row", gap: 8 },
  videoWrap: {
    width: "100%", borderRadius: 12,
    overflow: "hidden", backgroundColor: colors.bg3,
    position: "relative",
  },
  square: { aspectRatio: 1 },
  landscape: { aspectRatio: 4 / 3 },
  loadingOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.bg3, gap: 12,
  },
  loadingText: { color: colors.textMuted, fontSize: 14 },
  errorWrap: {
    alignItems: "center", justifyContent: "center",
    padding: 32, gap: 12,
  },
  errorText: {
    color: colors.red, fontSize: 14,
    textAlign: "center", lineHeight: 20,
  },
  retryBtn: {
    paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: colors.bg2, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  retryText: { color: colors.cyan, fontWeight: "700" },
  corner: { position: "absolute", width: 24, height: 24, borderColor: colors.cyan },
  cTL: { top: 12, left: 12, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 4 },
  cTR: { top: 12, right: 12, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 4 },
  cBL: { bottom: 12, left: 12, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 4 },
  cBR: { bottom: 12, right: 12, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 4 },
  captureRow: { alignItems: "center", marginTop: 24, marginBottom: 8 },
  captureBtn: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 4, borderColor: colors.cyan,
    alignItems: "center", justifyContent: "center",
  },
  captureBtnInner: {
    width: 54, height: 54, borderRadius: 27, backgroundColor: colors.cyan,
  },
  hint: { color: colors.textDim, fontSize: 12, textAlign: "center", marginTop: 8 },
});
