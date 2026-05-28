import React, { useState } from "react";
import {
  View, Text, StyleSheet, FlatList, RefreshControl,
  TouchableOpacity, Modal, ScrollView, Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNotifications } from "../../src/NotificationContext";
import { useTheme } from "../../src/ThemeContext";
import { Notification } from "../../src/api";
import { formatDate, radius } from "../../src/theme";

function typeIcon(t: string): any {
  if (t === "success") return "checkmark-circle";
  if (t === "warning") return "warning";
  if (t === "error") return "alert-circle";
  return "information-circle";
}

function typeColor(t: string, colors: any): string {
  if (t === "success") return colors.green;
  if (t === "warning") return colors.yellow;
  if (t === "error") return colors.red;
  return colors.cyan;
}

function typeBg(t: string, colors: any): string {
  if (t === "success") return colors.greenDim;
  if (t === "warning") return "rgba(255,214,10,0.12)";
  if (t === "error") return colors.redDim;
  return colors.cyanDim;
}

export default function NotificationsScreen() {
  const { notifications, unreadCount, isRead, markRead, markAllRead, deleteNotification, refresh } = useNotifications();
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Notification | null>(null);

  const handleOpen = (n: Notification) => {
    setSelected(n);
    markRead(n.id);
  };

  const handleDelete = async (id: string) => {
    await deleteNotification(id);
    if (selected?.id === id) setSelected(null);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    refresh();
    setTimeout(() => setRefreshing(false), 800);
  };

  const s = makeStyles(colors);

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <View style={s.header}>
        <View>
          <Text style={s.title}>Notifications</Text>
          {unreadCount > 0 && (
            <Text style={s.subtitle}>{unreadCount} unread</Text>
          )}
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllRead} style={s.markAllBtn}>
            <Ionicons name="checkmark-done-outline" size={14} color={colors.cyan} />
            <Text style={s.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 8 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.cyan} />
        }
        renderItem={({ item: n }) => {
          const read = isRead(n.id);
          const color = typeColor(n.type, colors);
          const bg = typeBg(n.type, colors);
          return (
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => handleOpen(n)}
              style={[s.item, !read && s.itemUnread]}
              testID={`notif-${n.id}`}>
              <View style={[s.iconWrap, { backgroundColor: bg }]}>
                <Ionicons name={typeIcon(n.type)} size={22} color={color} />
              </View>
              <View style={s.itemBody}>
                <View style={s.itemTitleRow}>
                  <Text style={[s.itemTitle, !read && s.itemTitleUnread]} numberOfLines={1}>
                    {n.title}
                  </Text>
                  {!read && <View style={[s.dot, { backgroundColor: color }]} />}
                </View>
                <Text style={s.itemMsg} numberOfLines={2}>{n.message}</Text>
                <Text style={s.itemDate}>{formatDate(n.sent_at)}</Text>
              </View>
              <View style={s.chevron}>
                <Ionicons name="chevron-forward" size={14} color={colors.textDim} />
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={(
          <View style={s.empty}>
            <Ionicons name="notifications-off-outline" size={40} color={colors.textDim} />
            <Text style={s.emptyTxt}>No notifications</Text>
          </View>
        )}
      />

      {/* Detail modal */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <Pressable style={s.backdrop} onPress={() => setSelected(null)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            {selected && (() => {
              const color = typeColor(selected.type, colors);
              const bg = typeBg(selected.type, colors);
              return (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={s.sheetHandle} />

                  <View style={s.sheetHeader}>
                    <View style={[s.sheetIconWrap, { backgroundColor: bg }]}>
                      <Ionicons name={typeIcon(selected.type)} size={32} color={color} />
                    </View>
                    <TouchableOpacity
                      onPress={() => setSelected(null)}
                      style={s.closeBtn}>
                      <Ionicons name="close" size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>

                  <Text style={[s.sheetTitle, { color }]}>{selected.title}</Text>
                  <Text style={s.sheetDate}>{formatDate(selected.sent_at)}</Text>

                  <View style={[s.sheetMsgBox, { borderColor: color + "30", backgroundColor: bg }]}>
                    <Text style={s.sheetMsg}>{selected.message}</Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => handleDelete(selected.id)}
                    style={s.deleteBtn}>
                    <Ionicons name="trash-outline" size={15} color={colors.red} />
                    <Text style={[s.deleteBtnText, { color: colors.red }]}>Remove notification</Text>
                  </TouchableOpacity>
                </ScrollView>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", padding: 20, paddingBottom: 8,
  },
  title: { color: colors.text, fontSize: 24, fontWeight: "800" },
  subtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  markAllBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    backgroundColor: colors.cyanDim, borderWidth: 1, borderColor: colors.cyan + "30",
  },
  markAllText: { color: colors.cyan, fontSize: 11, fontWeight: "700" },
  item: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, backgroundColor: colors.bg2,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  itemUnread: { borderColor: colors.cyan + "30", backgroundColor: colors.cyanDim },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  itemBody: { flex: 1 },
  itemTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  itemTitle: { color: colors.textMuted, fontWeight: "600", fontSize: 14, flex: 1 },
  itemTitleUnread: { color: colors.text, fontWeight: "800" },
  dot: { width: 7, height: 7, borderRadius: 4 },
  itemMsg: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  itemDate: { color: colors.textDim, fontSize: 10, marginTop: 4 },
  chevron: { paddingLeft: 4 },
  empty: { paddingTop: 60, alignItems: "center" },
  emptyTxt: { color: colors.textMuted, marginTop: 10, fontWeight: "600" },
  // Modal / sheet
  backdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.bg2,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
    maxHeight: "80%",
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.border, alignSelf: "center", marginBottom: 20,
  },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  sheetIconWrap: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.bg3 ?? colors.border,
    alignItems: "center", justifyContent: "center",
  },
  sheetTitle: { fontSize: 20, fontWeight: "800", marginBottom: 4 },
  sheetDate: { color: colors.textDim, fontSize: 11, marginBottom: 16 },
  sheetMsgBox: {
    borderWidth: 1, borderRadius: radius.md,
    padding: 16, marginBottom: 24,
  },
  sheetMsg: { color: colors.text, fontSize: 15, lineHeight: 22 },
  deleteBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 12, justifyContent: "center",
    borderWidth: 1, borderColor: colors.red + "30",
    borderRadius: radius.md, backgroundColor: colors.redDim,
  },
  deleteBtnText: { fontSize: 13, fontWeight: "700" },
});
