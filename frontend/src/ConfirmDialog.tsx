import React from "react";
import { View, Text, TouchableOpacity, Modal, Pressable, StyleSheet } from "react-native";
import { useTheme } from "./ThemeContext";

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

// react-native-web's Alert.alert() is a no-op stub — it never renders
// anything and its button callbacks never fire. Any confirm-before-action
// flow needs a real component like this instead of Alert.alert.
export function ConfirmDialog({
  visible, title, message, confirmLabel = "Confirm", cancelLabel = "Cancel",
  destructive = true, onConfirm, onCancel,
}: Props) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={[styles.card, { backgroundColor: colors.bg2, borderColor: colors.border }]} onPress={() => {}}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.message, { color: colors.textMuted }]}>{message}</Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.btn, { borderWidth: 1, borderColor: colors.border }]}
              onPress={onCancel}>
              <Text style={[styles.btnText, { color: colors.textMuted }]}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: destructive ? colors.red : colors.cyan }]}
              onPress={onConfirm}>
              <Text style={[styles.btnText, { color: "#fff", fontWeight: "800" }]}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 360, borderRadius: 20, borderWidth: 1, padding: 22 },
  title: { fontSize: 17, fontWeight: "800", marginBottom: 8 },
  message: { fontSize: 13, lineHeight: 19, marginBottom: 20 },
  row: { flexDirection: "row", gap: 10 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  btnText: { fontSize: 13, fontWeight: "700" },
});
