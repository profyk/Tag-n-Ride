import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useNotifications } from "../../src/NotificationContext";
import { api } from "../../src/api";
import { colors, radius } from "../../src/theme";

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const TYPE_CONFIG: Record<string, { icon: any; color: string; bg: string }> = {
  success:    { icon: "checkmark-circle", color: colors.green, bg: colors.greenDim },
  warning:    { icon: "warning", color: "#FFD60A", bg: "#FFD60A22" },
  error:      { icon: "close-circle", color: colors.red, bg: colors.redDim },
  info:       { icon: "information-circle", color: colors.cyan, bg: colors.cyanDim },
  payment:    { icon: "cash", color: colors.green, bg: colors.greenDim },
  kyc:        { icon: "shield-checkmark", color: colors.cyan, bg: colors.cyanDim },
  withdrawal: { icon: "wallet", color: "#A064FF", bg: "rgba(160,100,255,0.15)" },
};

export default function NotificationsScreen() {
  const router = useRouter();
  const { notifications, markAllRead, refresh } = useNotifications();
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => { markAllRead(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      "Delete notification?",
      "This will remove it from your list.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(id);
            try {
              await api.deleteNotification(id);
              await refresh();
            } catch {}
            setDeleting(null);
          },
        },
      ]
    );
  };

  const handleClearAll = () => {
    if (notifications.length === 0) return;
    Alert.alert(
      "Clear all notifications?",
      "This will permanently remove all your notifications.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear all",
          style: "destructive",
          onPress: async () => {
            try {
              await api.clearAllNotifications();
              await refresh();
            } catch {}
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        {notifications.length > 0 ? (
          <TouchableOpacity onPress={handleClearAll} style={styles.clearBtn}>
            <Text style={styles.clearText}>Clear all</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 70 }} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.cyan}
          />
        }>

        {notifications.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="notifications-off-outline" size={40} color={colors.textDim} />
            </View>
            <Text style={styles.emptyTitle}>No notifications</Text>
            <Text style={styles.emptySub}>
              Payment confirmations, KYC updates and announcements will appear here.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.countText}>
              {notifications.length} notification{notifications.length !== 1 ? "s" : ""}
            </Text>
            {notifications.map((n) => {
              const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.info;
              const isDeleting = deleting === n.id;
              return (
                <View key={n.id} style={[styles.notifCard, isDeleting && { opacity: 0.4 }]}>
                  <View style={[styles.notifIcon, { backgroundColor: cfg.bg }]}>
                    <Ionicons name={cfg.icon} size={22} color={cfg.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.notifTitle}>{n.title}</Text>
                    <Text style={styles.notifMessage}>{n.message}</Text>
                    <Text style={styles.notifTime}>{formatTime(n.sent_at)}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleDelete(n.id)}
                    disabled={isDeleting}
                    style={styles.deleteBtn}>
                    <Ionicons name="close" size={16} color={colors.textDim} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.bg2, borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  clearBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  clearText: { color: colors.red, fontSize: 13, fontWeight: "700" },
  empty: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.bg2, borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  emptySub: {
    color: colors.textMuted, fontSize: 13,
    textAlign: "center", paddingHorizontal: 32, lineHeight: 20,
  },
  countText: {
    color: colors.textMuted, fontSize: 11,
    fontWeight: "700", letterSpacing: 1.2, marginBottom: 12,
  },
  notifCard: {
    flexDirection: "row", gap: 12, alignItems: "flex-start",
    backgroundColor: colors.bg2, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    padding: 14, marginBottom: 8,
  },
  notifIcon: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  notifTitle: { color: colors.text, fontSize: 14, fontWeight: "700", marginBottom: 4 },
  notifMessage: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  notifTime: { color: colors.textDim, fontSize: 11, marginTop: 6 },
  deleteBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.bg3, borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0, marginTop: 2,
  },
});
