import React, { useState, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, FlatList, RefreshControl,
  TouchableOpacity, Modal, ScrollView, Pressable, Alert,
  ActivityIndicator, Share,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../src/ThemeContext";
import { useAuth } from "../../src/AuthContext";
import { useDocuments } from "../../src/DocumentContext";
import { api, UserDocument } from "../../src/api";
import { formatDate, radius } from "../../src/theme";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { buildStatementPDF, buildFormalPayslipPDF } from "./payslip";

type FilterTab = "all" | "payslips" | "statements" | "financial" | "identity" | "notices";

function docIcon(type: string): any {
  switch (type) {
    case "statement": return "document-text";
    case "payslip": return "shield-checkmark";
    case "topup": return "card";
    case "withdrawal": return "cash";
    case "kyc": return "finger-print";
    case "notice": return "mail";
    case "contract": return "megaphone";
    default: return "document-outline";
  }
}

function docColor(type: string, colors: any): string {
  switch (type) {
    case "statement": return colors.cyan;
    case "payslip": return "#22c55e";
    case "topup": return "#A064FF";
    case "withdrawal": return colors.green;
    case "kyc": return "#FFD60A";
    case "notice": return colors.cyan;
    case "contract": return "#FF8C00";
    default: return colors.textMuted;
  }
}

function docBg(type: string, colors: any): string {
  switch (type) {
    case "statement": return colors.cyanDim;
    case "payslip": return "#22c55e20";
    case "topup": return "rgba(160,100,255,0.12)";
    case "withdrawal": return colors.greenDim;
    case "kyc": return "rgba(255,214,10,0.12)";
    case "notice": return colors.cyanDim;
    case "contract": return "rgba(255,140,0,0.12)";
    default: return colors.bg;
  }
}

function filterDocs(docs: UserDocument[], tab: FilterTab): UserDocument[] {
  if (tab === "all") return docs;
  if (tab === "payslips") return docs.filter(d => d.document_type === "payslip");
  if (tab === "statements") return docs.filter(d => d.document_type === "statement");
  if (tab === "financial") return docs.filter(d => d.document_type === "topup" || d.document_type === "withdrawal");
  if (tab === "identity") return docs.filter(d => d.document_type === "kyc");
  if (tab === "notices") return docs.filter(d => d.document_type === "notice" || d.document_type === "contract");
  return docs;
}

function formatAmount(amount: number): string {
  return `R ${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

export default function DocumentsScreen() {
  const { colors } = useTheme();
  const { state } = useAuth();
  const { refreshCount } = useDocuments();
  const router = useRouter();
  const s = makeStyles(colors);

  const [docs, setDocs] = useState<UserDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<FilterTab>("all");
  const [selected, setSelected] = useState<UserDocument | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const isDriver = state.status === "authed" && state.user.role === "driver";

  const load = useCallback(async () => {
    try {
      const data = await api.documents();
      setDocs(data);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
    refreshCount();
  }, [load, refreshCount]));

  const handleOpen = async (doc: UserDocument) => {
    setSelected(doc);
    if (!doc.is_read) {
      try {
        await api.documentRead(doc.id);
        setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, is_read: true } : d));
        refreshCount();
      } catch {}
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.documentReadAll();
      setDocs(prev => prev.map(d => ({ ...d, is_read: true })));
      refreshCount();
    } catch {}
  };

  const handleDelete = (doc: UserDocument) => {
    Alert.alert(
      "Remove Document?",
      `Remove "${doc.title}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove", style: "destructive", onPress: async () => {
            try {
              await api.documentDelete(doc.id);
              setDocs(prev => prev.filter(d => d.id !== doc.id));
              if (selected?.id === doc.id) setSelected(null);
              refreshCount();
            } catch (e: any) {
              Alert.alert("Error", e?.message || "Could not delete document.");
            }
          }
        },
      ]
    );
  };

  const handleShare = async (doc: UserDocument) => {
    if (doc.reference_number) {
      const url = `https://tagnride.com/verify?ref=${doc.reference_number}`;
      try {
        await Share.share({ message: `View my payslip: ${url}`, url });
      } catch {}
    } else {
      handleDownload(doc);
    }
  };

  const handleDownload = async (doc: UserDocument) => {
    setDownloading(doc.id);
    try {
      const meta = doc.metadata || {};
      // Fall back to doc.id if metadata.payslip_id wasn't stored by backend
      const payslipId = meta.payslip_id ?? doc.id;
      const data = await api.payslipGet(payslipId);
      const isPayslip = (data.document_type ?? doc.document_type) === "payslip";
      const html = isPayslip ? buildFormalPayslipPDF(data) : buildStatementPDF(data);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const safePeriod = (data.period_label || "Doc").replace(/[^a-zA-Z0-9]/g, "-");
      const safeName = (data.driver_name || "Driver").replace(/[^a-zA-Z0-9]/g, "-");
      const fileName = isPayslip
        ? `TagNRide-Payslip-${safePeriod}-${safeName}.pdf`
        : `TagNRide-Statement-${safePeriod}.pdf`;
      await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: fileName, UTI: "com.adobe.pdf" });
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not generate PDF.");
    } finally { setDownloading(null); }
  };

  const unreadCount = docs.filter(d => !d.is_read).length;
  const filtered = filterDocs(docs, tab);

  const TABS: { key: FilterTab; label: string; driver?: boolean }[] = [
    { key: "all", label: "All" },
    { key: "payslips", label: "Payslips", driver: true },
    { key: "statements", label: "Statements", driver: true },
    { key: "financial", label: "Financial" },
    { key: "identity", label: "Identity" },
    { key: "notices", label: "Notices" },
  ];

  const visibleTabs = TABS.filter(t => !t.driver || isDriver);

  if (state.status !== "authed") return null;

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color={colors.cyan} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={s.title}>My Documents</Text>
            {unreadCount > 0 && (
              <View style={s.badge}><Text style={s.badgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text></View>
            )}
          </View>
          {unreadCount > 0 && <Text style={s.subtitle}>{unreadCount} unread</Text>}
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={handleMarkAllRead} style={s.markAllBtn}>
            <Ionicons name="checkmark-done-outline" size={14} color={colors.cyan} />
            <Text style={s.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabsScroll} contentContainerStyle={s.tabs}>
        {visibleTabs.map(t => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[s.tabBtn, tab === t.key && s.tabBtnActive]}>
            <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={colors.cyan} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={d => d.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.cyan} />}
          renderItem={({ item: doc }) => {
            const color = docColor(doc.document_type, colors);
            const bg = docBg(doc.document_type, colors);
            const canDownload = doc.document_type === "statement" || doc.document_type === "payslip";
            return (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => handleOpen(doc)}
                style={[s.card, !doc.is_read && { borderColor: color + "50", backgroundColor: colors.bg2 }]}>
                {/* Unread dot */}
                {!doc.is_read && <View style={[s.unreadDot, { backgroundColor: colors.cyan }]} />}
                <View style={[s.iconWrap, { backgroundColor: bg }]}>
                  <Ionicons name={docIcon(doc.document_type)} size={22} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.cardTitle, !doc.is_read && { fontWeight: "800", color: colors.text }]}>
                    {doc.title}
                  </Text>
                  {doc.description ? (
                    <Text style={s.cardDesc} numberOfLines={2}>{doc.description}</Text>
                  ) : null}
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                    {doc.period_label ? (
                      <Text style={s.periodLabel}>{doc.period_label}</Text>
                    ) : null}
                    {(doc.amount ?? 0) > 0 ? (
                      <Text style={s.amount}>{formatAmount(doc.amount)}</Text>
                    ) : null}
                  </View>
                  {doc.reference_number ? (
                    <Text style={s.ref}>{doc.reference_number}</Text>
                  ) : null}
                  <Text style={s.date}>{formatDate(doc.created_at)}</Text>
                </View>
                <View style={s.cardActions}>
                  {canDownload && (
                    <TouchableOpacity onPress={() => handleDownload(doc)} style={s.actionBtn} disabled={downloading === doc.id}>
                      {downloading === doc.id
                        ? <ActivityIndicator color={color} size="small" />
                        : <Ionicons name="download-outline" size={18} color={color} />}
                    </TouchableOpacity>
                  )}
                  {doc.document_type === "payslip" && (
                    <TouchableOpacity onPress={() => handleShare(doc)} style={s.actionBtn}>
                      <Ionicons name="share-outline" size={18} color={colors.cyan} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => handleDelete(doc)} style={s.actionBtn}>
                    <Ionicons name="trash-outline" size={18} color={colors.red} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={(
            <View style={s.empty}>
              <Ionicons name="folder-open-outline" size={44} color={colors.textDim} />
              <Text style={s.emptyTitle}>No documents</Text>
              <Text style={s.emptyText}>
                {tab === "all"
                  ? "Documents will appear here when you generate statements, payslips, or when account events happen."
                  : `No ${tab} documents yet.`}
              </Text>
            </View>
          )}
        />
      )}

      {/* Detail bottom sheet */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <Pressable style={s.backdrop} onPress={() => setSelected(null)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            {selected && (() => {
              const color = docColor(selected.document_type, colors);
              const bg = docBg(selected.document_type, colors);
              const canDownload = selected.document_type === "statement" || selected.document_type === "payslip";
              return (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={s.sheetHandle} />
                  <View style={s.sheetHeader}>
                    <View style={[s.sheetIconWrap, { backgroundColor: bg }]}>
                      <Ionicons name={docIcon(selected.document_type)} size={32} color={color} />
                    </View>
                    <TouchableOpacity onPress={() => setSelected(null)} style={s.closeBtn}>
                      <Ionicons name="close" size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <Text style={[s.sheetTitle, { color }]}>{selected.title}</Text>
                  <Text style={s.sheetDate}>{formatDate(selected.created_at)}</Text>
                  {selected.description ? (
                    <View style={[s.sheetMsgBox, { borderColor: color + "30", backgroundColor: bg }]}>
                      <Text style={s.sheetMsg}>{selected.description}</Text>
                    </View>
                  ) : null}
                  {selected.period_label ? (
                    <View style={s.detailRow}>
                      <Text style={s.detailLabel}>Period</Text>
                      <Text style={s.detailValue}>{selected.period_label}</Text>
                    </View>
                  ) : null}
                  {(selected.amount ?? 0) > 0 ? (
                    <View style={s.detailRow}>
                      <Text style={s.detailLabel}>Amount</Text>
                      <Text style={[s.detailValue, { color: colors.green, fontWeight: "800" }]}>{formatAmount(selected.amount)}</Text>
                    </View>
                  ) : null}
                  {selected.reference_number ? (
                    <View style={s.detailRow}>
                      <Text style={s.detailLabel}>Reference</Text>
                      <Text style={[s.detailValue, { fontFamily: "monospace", color: colors.cyan }]}>{selected.reference_number}</Text>
                    </View>
                  ) : null}
                  <View style={{ gap: 10, marginTop: 16 }}>
                    {canDownload && (
                      <TouchableOpacity
                        style={[s.sheetActionBtn, { backgroundColor: color, borderColor: color }]}
                        onPress={() => { setSelected(null); handleDownload(selected); }}
                        disabled={downloading === selected.id}>
                        <Ionicons name="download-outline" size={18} color="#fff" />
                        <Text style={s.sheetActionBtnText}>Download PDF</Text>
                      </TouchableOpacity>
                    )}
                    {selected.document_type === "payslip" && (
                      <TouchableOpacity
                        style={[s.sheetActionBtn, { backgroundColor: colors.cyanDim, borderColor: colors.cyan + "60" }]}
                        onPress={() => { setSelected(null); handleShare(selected); }}>
                        <Ionicons name="share-outline" size={18} color={colors.cyan} />
                        <Text style={[s.sheetActionBtnText, { color: colors.cyan }]}>Share Verification Link</Text>
                      </TouchableOpacity>
                    )}
                    {selected.document_type === "kyc" && (
                      <TouchableOpacity
                        style={[s.sheetActionBtn, { backgroundColor: "#FFD60A20", borderColor: "#FFD60A" }]}
                        onPress={() => { setSelected(null); router.push("/(app)/kyc"); }}>
                        <Ionicons name="finger-print" size={18} color="#FFD60A" />
                        <Text style={[s.sheetActionBtnText, { color: "#FFD60A" }]}>Go to KYC</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={() => { handleDelete(selected); }}
                      style={s.deleteBtn}>
                      <Ionicons name="trash-outline" size={15} color={colors.red} />
                      <Text style={[s.deleteBtnText, { color: colors.red }]}>Remove document</Text>
                    </TouchableOpacity>
                  </View>
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
    paddingHorizontal: 16, paddingVertical: 12,
    gap: 10,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontSize: 22, fontWeight: "800" },
  subtitle: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  badge: { backgroundColor: colors.red, borderRadius: 999, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "900" },
  markAllBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: colors.cyanDim, borderWidth: 1, borderColor: colors.cyan + "30" },
  markAllText: { color: colors.cyan, fontSize: 11, fontWeight: "700" },
  tabsScroll: { maxHeight: 44 },
  tabs: { paddingHorizontal: 16, gap: 8, alignItems: "center" },
  tabBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg2 },
  tabBtnActive: { backgroundColor: colors.cyanDim, borderColor: colors.cyan },
  tabText: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  tabTextActive: { color: colors.cyan, fontWeight: "800" },
  card: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    padding: 14, backgroundColor: colors.bg2,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    position: "relative",
  },
  unreadDot: { position: "absolute", left: -3, top: "50%", width: 6, height: 6, borderRadius: 3 },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  cardTitle: { color: colors.textMuted, fontWeight: "600", fontSize: 14 },
  cardDesc: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  periodLabel: { color: colors.textMuted, fontSize: 11, backgroundColor: colors.bg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill },
  amount: { color: colors.green, fontSize: 12, fontWeight: "800" },
  ref: { color: colors.cyan, fontSize: 10, fontFamily: "monospace", marginTop: 3 },
  date: { color: colors.textDim, fontSize: 10, marginTop: 4 },
  cardActions: { flexDirection: "column", gap: 8, alignItems: "center" },
  actionBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  empty: { paddingTop: 60, alignItems: "center", paddingHorizontal: 24 },
  emptyTitle: { color: colors.text, fontWeight: "700", fontSize: 16, marginTop: 12 },
  emptyText: { color: colors.textMuted, fontSize: 13, marginTop: 6, textAlign: "center", lineHeight: 19 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.bg2, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: "85%" },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 20 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  sheetIconWrap: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bg3 ?? colors.border, alignItems: "center", justifyContent: "center" },
  sheetTitle: { fontSize: 20, fontWeight: "800", marginBottom: 4 },
  sheetDate: { color: colors.textDim, fontSize: 11, marginBottom: 16 },
  sheetMsgBox: { borderWidth: 1, borderRadius: radius.md, padding: 16, marginBottom: 16 },
  sheetMsg: { color: colors.text, fontSize: 15, lineHeight: 22 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  detailLabel: { color: colors.textMuted, fontSize: 13 },
  detailValue: { color: colors.text, fontSize: 13, fontWeight: "600", maxWidth: "60%", textAlign: "right" },
  sheetActionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: radius.md, borderWidth: 1 },
  sheetActionBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  deleteBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, justifyContent: "center", borderWidth: 1, borderColor: colors.red + "30", borderRadius: radius.md, backgroundColor: colors.redDim ?? colors.red + "10" },
  deleteBtnText: { fontSize: 13, fontWeight: "700" },
});
