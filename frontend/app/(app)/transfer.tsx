import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Alert, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/AuthContext";
import { useTheme } from "../../src/ThemeContext";
import { api, DriverTransfer } from "../../src/api";
import { Button } from "../../src/ui";
import { radius } from "../../src/theme";

const STATUS_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  pending_old_owner: { label: "Waiting for old owner approval", color: "#FFD60A", icon: "time-outline" },
  pending_new_owner: { label: "Waiting for new owner approval", color: "#FFD60A", icon: "time-outline" },
  escalated_to_admin: { label: "Escalated to admin", color: "#FF9F0A", icon: "alert-circle-outline" },
  completed: { label: "Transfer complete!", color: "#30D158", icon: "checkmark-circle-outline" },
  rejected_by_old_owner: { label: "Rejected by current owner", color: "#FF3B30", icon: "close-circle-outline" },
  rejected_by_new_owner: { label: "Rejected by new owner", color: "#FF3B30", icon: "close-circle-outline" },
  cancelled: { label: "Cancelled", color: "#636366", icon: "ban-outline" },
};

export default function TransferScreen() {
  const router = useRouter();
  const { state } = useAuth();
  const { colors } = useTheme();

  const [transfer, setTransfer] = useState<DriverTransfer | null>(null);
  const [loading, setLoading] = useState(true);
  const [ownerCode, setOwnerCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (state.status === "authed" && state.user.role !== "driver") {
      router.replace("/(app)/profile");
    }
  }, [state.status]);

  const loadActive = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.transferActive();
      setTransfer(res.transfer);
    } catch {} finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { loadActive(); }, [loadActive]));

  if (state.status !== "authed" || state.user.role !== "driver") return null;

  const handleSubmit = async () => {
    const code = ownerCode.trim();
    if (!code) { Alert.alert("Required", "Enter the owner's phone number or code."); return; }
    setSubmitting(true);
    try {
      await api.transferRequest(code);
      Alert.alert("Request Sent", "Your transfer request has been submitted. You'll be notified when the owner responds.");
      setOwnerCode("");
      loadActive();
    } catch (e: any) { Alert.alert("Failed", e?.message || "Could not submit transfer request."); }
    finally { setSubmitting(false); }
  };

  const handleCancel = () => {
    if (!transfer) return;
    Alert.alert("Cancel Transfer?", "Are you sure you want to cancel this transfer request?", [
      { text: "No", style: "cancel" },
      {
        text: "Cancel Request", style: "destructive",
        onPress: async () => {
          setCancelling(true);
          try {
            await api.transferCancel(transfer.id);
            Alert.alert("Cancelled", "Your transfer request has been cancelled.");
            setTransfer(null);
          } catch (e: any) { Alert.alert("Error", e?.message || "Could not cancel."); }
          finally { setCancelling(false); }
        },
      },
    ]);
  };

  const s = makeStyles(colors);
  const isActive = transfer && !["completed", "cancelled", "rejected_by_old_owner", "rejected_by_new_owner"].includes(transfer.status);
  const statusInfo = transfer ? (STATUS_LABELS[transfer.status] || { label: transfer.status, color: colors.textMuted, icon: "ellipse-outline" }) : null;

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>

        <TouchableOpacity style={s.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={colors.cyan} />
          <Text style={s.backText}>Back</Text>
        </TouchableOpacity>

        <Text style={s.title}>Switch Owner / Change Taxi</Text>
        <Text style={s.sub}>
          Request to join a new fleet owner. Your current owner will be notified and must approve before the transfer completes.
        </Text>

        {loading ? (
          <ActivityIndicator color={colors.cyan} style={{ marginTop: 40 }} />
        ) : isActive ? (
          <View style={s.statusCard}>
            <View style={[s.statusIcon, { backgroundColor: statusInfo!.color + "20" }]}>
              <Ionicons name={statusInfo!.icon as any} size={28} color={statusInfo!.color} />
            </View>
            <Text style={[s.statusLabel, { color: statusInfo!.color }]}>{statusInfo!.label}</Text>

            <View style={s.infoRow}>
              <Text style={s.infoKey}>From fleet</Text>
              <Text style={s.infoVal}>{transfer!.old_owner_name || "Unlinked"}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoKey}>To fleet</Text>
              <Text style={s.infoVal}>{transfer!.new_owner_name}</Text>
            </View>

            {transfer!.status === "pending_old_owner" && (
              <View style={s.hint}>
                <Ionicons name="information-circle-outline" size={15} color={colors.textMuted} />
                <Text style={s.hintText}>
                  Waiting for your current owner to approve. If they don't respond within 24 hours, a reminder will be sent. After 48 hours admin will step in.
                </Text>
              </View>
            )}
            {transfer!.status === "escalated_to_admin" && (
              <View style={[s.hint, { borderColor: "#FF9F0A40" }]}>
                <Ionicons name="alert-circle-outline" size={15} color="#FF9F0A" />
                <Text style={[s.hintText, { color: "#FF9F0A" }]}>
                  Escalated to admin — your previous owner is being contacted directly.
                </Text>
              </View>
            )}

            <View style={{ marginTop: 16 }}>
              <Button
                label={cancelling ? "Cancelling…" : "Cancel Request"}
                variant="secondary"
                onPress={handleCancel}
                loading={cancelling}
              />
            </View>
          </View>
        ) : (
          <>
            {transfer && (
              <View style={[s.statusCard, { marginBottom: 24, borderColor: statusInfo!.color + "40" }]}>
                <View style={[s.statusIcon, { backgroundColor: statusInfo!.color + "20" }]}>
                  <Ionicons name={statusInfo!.icon as any} size={24} color={statusInfo!.color} />
                </View>
                <Text style={[s.statusLabel, { color: statusInfo!.color }]}>{statusInfo!.label}</Text>
                {transfer.old_owner_reject_reason && (
                  <Text style={s.rejectReason}>Reason: {transfer.old_owner_reject_reason}</Text>
                )}
                {transfer.new_owner_reject_reason && (
                  <Text style={s.rejectReason}>Reason: {transfer.new_owner_reject_reason}</Text>
                )}
              </View>
            )}

            <Text style={s.sectionLabel}>NEW OWNER CODE</Text>
            <Text style={s.inputHint}>Enter the fleet owner's phone number or owner ID.</Text>
            <TextInput
              style={s.input}
              value={ownerCode}
              onChangeText={setOwnerCode}
              placeholder="+27 800 000 000 or owner code"
              placeholderTextColor={colors.textDim}
              autoCapitalize="none"
              keyboardType="default"
            />

            <View style={s.warningBox}>
              <Ionicons name="warning-outline" size={16} color="#FFD60A" />
              <Text style={s.warningText}>
                Your current owner will receive a notification and must approve this transfer. Make sure you have no open cashup before switching.
              </Text>
            </View>

            <Button
              label="Request Transfer"
              onPress={handleSubmit}
              loading={submitting}
              testID="submit-transfer-btn"
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  back: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 16 },
  backText: { color: colors.cyan, fontSize: 15, fontWeight: "600" },
  title: { color: colors.text, fontSize: 22, fontWeight: "800", marginBottom: 8 },
  sub: { color: colors.textMuted, fontSize: 13, lineHeight: 20, marginBottom: 24 },
  statusCard: { backgroundColor: colors.bg2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 20, alignItems: "center" },
  statusIcon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  statusLabel: { fontSize: 16, fontWeight: "700", textAlign: "center", marginBottom: 16 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", width: "100%", paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  infoKey: { color: colors.textMuted, fontSize: 13 },
  infoVal: { color: colors.text, fontSize: 13, fontWeight: "600" },
  hint: { flexDirection: "row", gap: 8, backgroundColor: colors.bg, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: 10, marginTop: 12, width: "100%" },
  hintText: { flex: 1, color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  rejectReason: { color: colors.textMuted, fontSize: 12, fontStyle: "italic", marginTop: 4 },
  sectionLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, marginBottom: 6 },
  inputHint: { color: colors.textDim, fontSize: 12, marginBottom: 10 },
  input: { backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, color: colors.text, fontSize: 15, padding: 14, marginBottom: 16 },
  warningBox: { flexDirection: "row", gap: 10, backgroundColor: "#FFD60A15", borderRadius: radius.sm, borderWidth: 1, borderColor: "#FFD60A30", padding: 12, marginBottom: 20 },
  warningText: { flex: 1, color: colors.textMuted, fontSize: 12, lineHeight: 18 },
});
