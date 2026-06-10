import React, { useState, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, FlatList, RefreshControl,
  TouchableOpacity, Modal, ScrollView, Pressable, Alert,
  ActivityIndicator, Share,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../src/ThemeContext";
import { useAuth } from "../../src/AuthContext";
import { useNotifications } from "../../src/NotificationContext";
import { useDocuments } from "../../src/DocumentContext";
import { api, Notification, UserDocument } from "../../src/api";
import { formatDate, radius } from "../../src/theme";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { buildStatementPDF, buildFormalPayslipPDF } from "./payslip";
import { buildPassengerStatementPDF } from "./statement";
import { buildOwnerStatementPDF } from "../owner/statement";

// ── Notification helpers ──────────────────────────────────────────────────────
function notifIcon(t: string): any {
  if (t === "success") return "checkmark-circle";
  if (t === "warning") return "warning";
  if (t === "error") return "alert-circle";
  return "information-circle";
}
function notifColor(t: string, c: any) {
  if (t === "success") return c.green;
  if (t === "warning") return c.yellow;
  if (t === "error") return c.red;
  return c.cyan;
}
function notifBg(t: string, c: any) {
  if (t === "success") return c.greenDim;
  if (t === "warning") return "rgba(255,214,10,0.12)";
  if (t === "error") return c.redDim;
  return c.cyanDim;
}

// ── Document helpers ──────────────────────────────────────────────────────────
type DocTab = "all" | "payslips" | "statements" | "financial" | "identity" | "notices";

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
function docColor(type: string, c: any) {
  switch (type) {
    case "statement": return c.cyan;
    case "payslip": return "#22c55e";
    case "topup": return "#A064FF";
    case "withdrawal": return c.green;
    case "kyc": return "#FFD60A";
    case "notice": return c.cyan;
    case "contract": return "#FF8C00";
    default: return c.textMuted;
  }
}
function docBg(type: string, c: any) {
  switch (type) {
    case "statement": return c.cyanDim;
    case "payslip": return "#22c55e20";
    case "topup": return "rgba(160,100,255,0.12)";
    case "withdrawal": return c.greenDim;
    case "kyc": return "rgba(255,214,10,0.12)";
    case "notice": return c.cyanDim;
    case "contract": return "rgba(255,140,0,0.12)";
    default: return c.bg;
  }
}
function filterDocs(docs: UserDocument[], tab: DocTab) {
  if (tab === "all") return docs;
  if (tab === "payslips") return docs.filter(d => d.document_type === "payslip");
  if (tab === "statements") return docs.filter(d => d.document_type === "statement");
  if (tab === "financial") return docs.filter(d => ["topup", "withdrawal", "receipt"].includes(d.document_type));
  if (tab === "identity") return docs.filter(d => d.document_type === "kyc");
  if (tab === "notices") return docs.filter(d => ["notice", "contract"].includes(d.document_type));
  return docs;
}
function fmtAmt(n: number) {
  return `R ${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}
function ContentRow({ label, value, colors, green = false, bold = false }: {
  label: string; value: string; colors: any; green?: boolean; bold?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border + "55" }}>
      <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}>{label}</Text>
      <Text style={{ color: green ? colors.green : colors.text, fontSize: 12, fontWeight: bold ? "800" : "600", maxWidth: "55%", textAlign: "right" }}>{value}</Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function InboxScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { state } = useAuth();
  const {
    notifications, unreadCount, isRead,
    markRead, markAllRead, deleteNotification, refresh: refreshNotifs,
  } = useNotifications();
  const { unreadCount: docsUnreadCount, refreshCount } = useDocuments();

  const params = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<"alerts" | "docs">(
    params.tab === "docs" ? "docs" : "alerts"
  );

  // Notification state
  const [notifRefreshing, setNotifRefreshing] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState<Notification | null>(null);

  // Document state
  const [docs, setDocs] = useState<UserDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsRefreshing, setDocsRefreshing] = useState(false);
  const [docTab, setDocTab] = useState<DocTab>("all");
  const [selectedDoc, setSelectedDoc] = useState<UserDocument | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [fullContent, setFullContent] = useState<{ type: string; data: any } | null>(null);
  const [contentLoading, setContentLoading] = useState(false);

  const isDriver = state.status === "authed" && state.user.role === "driver";
  const docUnreadCount = docs.filter(d => !d.is_read).length;
  const totalUnread = unreadCount + docUnreadCount;

  // Load documents on focus
  const loadDocs = useCallback(async () => {
    try {
      const data = await api.documents();
      setDocs(data);
    } catch {}
    finally { setDocsLoading(false); setDocsRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => {
    loadDocs();
    refreshCount();
  }, [loadDocs, refreshCount]));

  // Load document full content when detail sheet opens
  useEffect(() => {
    if (!selectedDoc || (selectedDoc.document_type !== "payslip" && selectedDoc.document_type !== "statement")) {
      setFullContent(null);
      return;
    }
    setContentLoading(true);
    setFullContent(null);
    const rawMeta = selectedDoc.metadata;
    const meta: Record<string, any> = !rawMeta ? {} :
      typeof rawMeta === "string"
        ? (() => { try { return JSON.parse(rawMeta); } catch { return {}; } })()
        : rawMeta;
    const isPassenger = meta.statement_type === "passenger" ||
      (selectedDoc.document_type === "statement" && !!meta.statement_id && !meta.payslip_id && meta.statement_type !== "owner");
    const isOwner = meta.statement_type === "owner";

    if (isPassenger) {
      api.getPassengerStatement(meta.statement_id ?? selectedDoc.id)
        .then(r => setFullContent({ type: "passenger", data: typeof r.data === "string" ? JSON.parse(r.data) : r.data }))
        .catch(() => {}).finally(() => setContentLoading(false));
    } else if (isOwner) {
      api.getOwnerStatement(meta.statement_id ?? selectedDoc.id)
        .then(r => setFullContent({ type: "owner", data: typeof r.data === "string" ? JSON.parse(r.data) : r.data }))
        .catch(() => {}).finally(() => setContentLoading(false));
    } else {
      api.payslipGet(meta.payslip_id ?? selectedDoc.id)
        .then(data => setFullContent({ type: "payslip", data }))
        .catch(() => {}).finally(() => setContentLoading(false));
    }
  }, [selectedDoc?.id]);

  // ── Notification handlers ──────────────────────────────────────────────────
  const handleOpenNotif = (n: Notification) => { setSelectedNotif(n); markRead(n.id); };
  const handleDeleteNotif = async (id: string) => {
    await deleteNotification(id);
    if (selectedNotif?.id === id) setSelectedNotif(null);
  };

  // ── Document handlers ──────────────────────────────────────────────────────
  const handleOpenDoc = async (doc: UserDocument) => {
    setSelectedDoc(doc);
    if (!doc.is_read) {
      try {
        await api.documentRead(doc.id);
        setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, is_read: true } : d));
        refreshCount();
      } catch {}
    }
  };
  const handleDocsMarkAllRead = async () => {
    try {
      await api.documentReadAll();
      setDocs(prev => prev.map(d => ({ ...d, is_read: true })));
      refreshCount();
    } catch {}
  };
  const handleDeleteDoc = (doc: UserDocument) => {
    Alert.alert("Remove Document?", `Remove "${doc.title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive", onPress: async () => {
          try {
            await api.documentDelete(doc.id);
            setDocs(prev => prev.filter(d => d.id !== doc.id));
            if (selectedDoc?.id === doc.id) setSelectedDoc(null);
            refreshCount();
          } catch (e: any) { Alert.alert("Error", e?.message || "Could not delete."); }
        },
      },
    ]);
  };
  const handleShare = async (doc: UserDocument) => {
    if (doc.reference_number) {
      const url = `https://tag-n-ride-admin.vercel.app/verify?ref=${doc.reference_number}`;
      try { await Share.share({ message: `View my payslip: ${url}`, url }); } catch {}
    } else { handleDownload(doc); }
  };
  const handleDownload = async (doc: UserDocument) => {
    setDownloading(doc.id);
    try {
      const rawMeta = doc.metadata;
      const meta: Record<string, any> = !rawMeta ? {} :
        typeof rawMeta === "string"
          ? (() => { try { return JSON.parse(rawMeta); } catch { return {}; } })()
          : rawMeta;
      let html = "";
      let fileName = "TagNRide-Document.pdf";
      const isPassengerStatement =
        meta.statement_type === "passenger" ||
        (doc.document_type === "statement" && !!meta.statement_id && !meta.payslip_id && meta.statement_type !== "owner");
      const isOwnerStatement = meta.statement_type === "owner";

      if (isPassengerStatement) {
        const res = await api.getPassengerStatement(meta.statement_id ?? doc.id);
        const d2 = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
        html = buildPassengerStatementPDF(d2, res.reference ?? "");
        fileName = `TagNRide-Expense-Statement-${(doc.period_label || "Statement").replace(/[^a-zA-Z0-9]/g, "-")}.pdf`;
      } else if (isOwnerStatement) {
        const res = await api.getOwnerStatement(meta.statement_id ?? doc.id);
        const d2 = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
        html = buildOwnerStatementPDF(d2, res.reference ?? "");
        fileName = `TagNRide-Fleet-Statement-${(doc.period_label || "Fleet").replace(/[^a-zA-Z0-9]/g, "-")}.pdf`;
      } else {
        const data = await api.payslipGet(meta.payslip_id ?? doc.id);
        const isPayslip = doc.document_type === "payslip" || (data.document_type ?? "") === "payslip";
        html = isPayslip ? buildFormalPayslipPDF(data) : buildStatementPDF(data);
        const safePeriod = (data.period_label || "Doc").replace(/[^a-zA-Z0-9]/g, "-");
        const safeName = (data.driver_name || "Driver").replace(/[^a-zA-Z0-9]/g, "-");
        fileName = isPayslip
          ? `TagNRide-Payslip-${safePeriod}-${safeName}.pdf`
          : `TagNRide-Statement-${safePeriod}.pdf`;
      }
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: fileName, UTI: "com.adobe.pdf" });
    } catch (e: any) { Alert.alert("Error", e?.message || "Could not generate PDF."); }
    finally { setDownloading(null); }
  };

  const filteredDocs = filterDocs(docs, docTab);
  const DOC_TABS: { key: DocTab; label: string; driver?: boolean }[] = [
    { key: "all", label: "All" },
    { key: "payslips", label: "Payslips", driver: true },
    { key: "statements", label: "Statements" },
    { key: "financial", label: "Financial" },
    { key: "identity", label: "Identity" },
    { key: "notices", label: "Notices" },
  ];
  const visibleDocTabs = DOC_TABS.filter(t => !t.driver || isDriver);
  const s = makeStyles(colors);

  return (
    <SafeAreaView style={s.root} edges={["top"]}>

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color={colors.cyan} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={s.title}>Inbox</Text>
            {totalUnread > 0 && (
              <View style={s.badge}><Text style={s.badgeText}>{totalUnread > 99 ? "99+" : totalUnread}</Text></View>
            )}
          </View>
          {totalUnread > 0 && <Text style={s.subtitle}>{totalUnread} unread</Text>}
        </View>
        {activeTab === "alerts" && unreadCount > 0 && (
          <TouchableOpacity onPress={markAllRead} style={s.markAllBtn}>
            <Ionicons name="checkmark-done-outline" size={14} color={colors.cyan} />
            <Text style={s.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
        {activeTab === "docs" && docUnreadCount > 0 && (
          <TouchableOpacity onPress={handleDocsMarkAllRead} style={s.markAllBtn}>
            <Ionicons name="checkmark-done-outline" size={14} color={colors.cyan} />
            <Text style={s.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Alerts | Documents top tabs */}
      <View style={s.topTabs}>
        {(["alerts", "docs"] as const).map(tab => {
          const label = tab === "alerts" ? "Alerts" : "Documents";
          const count = tab === "alerts" ? unreadCount : docUnreadCount;
          const active = activeTab === tab;
          return (
            <TouchableOpacity key={tab} style={[s.topTab, active && s.topTabActive]} onPress={() => setActiveTab(tab)}>
              <Text style={[s.topTabText, active && s.topTabTextActive]}>{label}</Text>
              {count > 0 && (
                <View style={[s.topTabBadge, active && { backgroundColor: colors.cyan }]}>
                  <Text style={[s.topTabBadgeText, active && { color: colors.bg }]}>{count > 99 ? "99+" : count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Alerts tab ─────────────────────────────────────────────────────── */}
      {activeTab === "alerts" && (
        <FlatList
          data={notifications}
          keyExtractor={n => n.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 8 }}
          refreshControl={
            <RefreshControl
              refreshing={notifRefreshing}
              onRefresh={async () => { setNotifRefreshing(true); try { await refreshNotifs(); } finally { setNotifRefreshing(false); } }}
              tintColor={colors.cyan}
            />
          }
          renderItem={({ item: n }) => {
            const read = isRead(n.id);
            const color = notifColor(n.type, colors);
            const bg = notifBg(n.type, colors);
            return (
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => handleOpenNotif(n)}
                style={[s.item, !read && s.itemUnread]}
                testID={`notif-${n.id}`}>
                <View style={[s.iconWrap, { backgroundColor: bg }]}>
                  <Ionicons name={notifIcon(n.type)} size={22} color={color} />
                </View>
                <View style={s.itemBody}>
                  <View style={s.itemTitleRow}>
                    <Text style={[s.itemTitle, !read && s.itemTitleUnread]} numberOfLines={1}>{n.title}</Text>
                    {!read && <View style={[s.dot, { backgroundColor: color }]} />}
                  </View>
                  <Text style={s.itemMsg} numberOfLines={2}>{n.message}</Text>
                  <Text style={s.itemDate}>{formatDate(n.sent_at)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={colors.textDim} />
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="notifications-off-outline" size={40} color={colors.textDim} />
              <Text style={s.emptyTitle}>No alerts</Text>
              <Text style={s.emptyText}>Top-up confirmations, transfers, and account events appear here.</Text>
            </View>
          }
        />
      )}

      {/* ── Documents tab ──────────────────────────────────────────────────── */}
      {activeTab === "docs" && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabsScroll} contentContainerStyle={s.docTabs}>
            {visibleDocTabs.map(t => (
              <TouchableOpacity
                key={t.key}
                onPress={() => setDocTab(t.key)}
                style={[s.docTabBtn, docTab === t.key && s.docTabBtnActive]}>
                <Text style={[s.docTabText, docTab === t.key && s.docTabTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {docsLoading ? (
            <ActivityIndicator color={colors.cyan} style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={filteredDocs}
              keyExtractor={d => d.id}
              contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}
              refreshControl={
                <RefreshControl
                  refreshing={docsRefreshing}
                  onRefresh={() => { setDocsRefreshing(true); loadDocs(); }}
                  tintColor={colors.cyan}
                />
              }
              renderItem={({ item: doc }) => {
                const color = docColor(doc.document_type, colors);
                const bg = docBg(doc.document_type, colors);
                const canDownload = doc.document_type === "statement" || doc.document_type === "payslip";
                return (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => handleOpenDoc(doc)}
                    style={[s.card, !doc.is_read && { borderColor: color + "50", backgroundColor: colors.bg2 }]}>
                    {!doc.is_read && <View style={[s.unreadDot, { backgroundColor: colors.cyan }]} />}
                    <View style={[s.iconWrap, { backgroundColor: bg }]}>
                      <Ionicons name={docIcon(doc.document_type)} size={22} color={color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.cardTitle, !doc.is_read && { fontWeight: "800", color: colors.text }]}>{doc.title}</Text>
                      {doc.description ? <Text style={s.cardDesc} numberOfLines={2}>{doc.description}</Text> : null}
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                        {doc.period_label ? <Text style={s.periodLabel}>{doc.period_label}</Text> : null}
                        {(doc.amount ?? 0) > 0 ? <Text style={s.amount}>{fmtAmt(doc.amount)}</Text> : null}
                      </View>
                      {doc.reference_number ? <Text style={s.ref}>{doc.reference_number}</Text> : null}
                      <Text style={s.date}>{formatDate(doc.created_at)}</Text>
                      {canDownload && (
                        <View style={s.cardBtnRow}>
                          <TouchableOpacity
                            style={[s.viewChip, { backgroundColor: bg, borderColor: color + "50" }]}
                            onPress={() => router.push(`/(app)/document-view?id=${doc.id}` as any)}>
                            <Ionicons name="eye-outline" size={13} color={color} />
                            <Text style={[s.viewChipText, { color }]}>View</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={s.dlChip}
                            onPress={e => { e.stopPropagation?.(); handleDownload(doc); }}
                            disabled={downloading === doc.id}>
                            {downloading === doc.id
                              ? <ActivityIndicator color={colors.textMuted} size="small" style={{ width: 13, height: 13 }} />
                              : <Ionicons name="download-outline" size={13} color={colors.textMuted} />}
                            <Text style={s.dlChipText}>PDF</Text>
                          </TouchableOpacity>
                          {doc.document_type === "payslip" && (
                            <TouchableOpacity style={s.dlChip} onPress={e => { e.stopPropagation?.(); handleShare(doc); }}>
                              <Ionicons name="share-outline" size={13} color={colors.textMuted} />
                              <Text style={s.dlChipText}>Share</Text>
                            </TouchableOpacity>
                          )}
                          {doc.document_type === "statement" && (
                            <TouchableOpacity
                              style={[s.dlChip, { borderColor: colors.red + "40" }]}
                              onPress={e => { e.stopPropagation?.(); handleDeleteDoc(doc); }}>
                              <Ionicons name="trash-outline" size={13} color={colors.red} />
                              <Text style={[s.dlChipText, { color: colors.red }]}>Delete</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </View>
                    <TouchableOpacity onPress={() => handleDeleteDoc(doc)} style={s.actionBtn}>
                      <Ionicons name="trash-outline" size={18} color={colors.red} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={s.empty}>
                  <Ionicons name="folder-open-outline" size={44} color={colors.textDim} />
                  <Text style={s.emptyTitle}>No documents</Text>
                  <Text style={s.emptyText}>
                    {docTab === "all"
                      ? "All your documents appear here — statements, top-up receipts, KYC, and notices."
                      : docTab === "statements"
                      ? "Your expense statements appear here. Generate one from your profile."
                      : docTab === "financial"
                      ? "Wallet top-up confirmations and withdrawal receipts appear here automatically."
                      : docTab === "identity"
                      ? "Your KYC / identity verification documents appear here."
                      : docTab === "notices"
                      ? "Important notices and policy documents from Tag n Ride appear here."
                      : `No ${docTab} documents yet.`}
                  </Text>
                  {docTab === "statements" && (
                    <TouchableOpacity style={s.emptyAction} onPress={() => router.push("/(app)/statement")} activeOpacity={0.8}>
                      <Ionicons name="document-text-outline" size={16} color={colors.cyan} />
                      <Text style={s.emptyActionText}>Generate an Expense Statement</Text>
                    </TouchableOpacity>
                  )}
                  {docTab === "payslips" && isDriver && (
                    <TouchableOpacity style={s.emptyAction} onPress={() => router.push("/(app)/payslip")} activeOpacity={0.8}>
                      <Ionicons name="shield-checkmark-outline" size={16} color={colors.cyan} />
                      <Text style={s.emptyActionText}>Generate a Payslip or Statement</Text>
                    </TouchableOpacity>
                  )}
                </View>
              }
            />
          )}
        </>
      )}

      {/* ── Notification detail sheet ───────────────────────────────────────── */}
      <Modal visible={!!selectedNotif} transparent animationType="slide" onRequestClose={() => setSelectedNotif(null)}>
        <Pressable style={s.backdrop} onPress={() => setSelectedNotif(null)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            {selectedNotif && (() => {
              const color = notifColor(selectedNotif.type, colors);
              const bg = notifBg(selectedNotif.type, colors);
              return (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={s.sheetHandle} />
                  <View style={s.sheetHeader}>
                    <View style={[s.sheetIconWrap, { backgroundColor: bg }]}>
                      <Ionicons name={notifIcon(selectedNotif.type)} size={32} color={color} />
                    </View>
                    <TouchableOpacity onPress={() => setSelectedNotif(null)} style={s.closeBtn}>
                      <Ionicons name="close" size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <Text style={[s.sheetTitle, { color }]}>{selectedNotif.title}</Text>
                  <Text style={s.sheetDate}>{formatDate(selectedNotif.sent_at)}</Text>
                  <View style={[s.sheetMsgBox, { borderColor: color + "30", backgroundColor: bg }]}>
                    <Text style={s.sheetMsg}>{selectedNotif.message}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleDeleteNotif(selectedNotif.id)} style={s.deleteBtn}>
                    <Ionicons name="trash-outline" size={15} color={colors.red} />
                    <Text style={[s.deleteBtnText, { color: colors.red }]}>Remove notification</Text>
                  </TouchableOpacity>
                </ScrollView>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Document detail sheet ───────────────────────────────────────────── */}
      <Modal visible={!!selectedDoc} transparent animationType="slide" onRequestClose={() => setSelectedDoc(null)}>
        <Pressable style={s.backdrop} onPress={() => setSelectedDoc(null)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            {selectedDoc && (() => {
              const color = docColor(selectedDoc.document_type, colors);
              const bg = docBg(selectedDoc.document_type, colors);
              const canDownload = selectedDoc.document_type === "statement" || selectedDoc.document_type === "payslip";
              return (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={s.sheetHandle} />
                  <View style={s.sheetHeader}>
                    <View style={[s.sheetIconWrap, { backgroundColor: bg }]}>
                      <Ionicons name={docIcon(selectedDoc.document_type)} size={32} color={color} />
                    </View>
                    <TouchableOpacity onPress={() => setSelectedDoc(null)} style={s.closeBtn}>
                      <Ionicons name="close" size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <Text style={[s.sheetTitle, { color }]}>{selectedDoc.title}</Text>
                  <Text style={s.sheetDate}>{formatDate(selectedDoc.created_at)}</Text>
                  {selectedDoc.description ? (
                    <View style={[s.sheetMsgBox, { borderColor: color + "30", backgroundColor: bg }]}>
                      <Text style={s.sheetMsg}>{selectedDoc.description}</Text>
                    </View>
                  ) : null}
                  {selectedDoc.period_label ? (
                    <View style={s.detailRow}><Text style={s.detailLabel}>Period</Text><Text style={s.detailValue}>{selectedDoc.period_label}</Text></View>
                  ) : null}
                  {(selectedDoc.amount ?? 0) > 0 ? (
                    <View style={s.detailRow}>
                      <Text style={s.detailLabel}>Amount</Text>
                      <Text style={[s.detailValue, { color: colors.green, fontWeight: "800" }]}>{fmtAmt(selectedDoc.amount)}</Text>
                    </View>
                  ) : null}
                  {selectedDoc.reference_number ? (
                    <View style={s.detailRow}>
                      <Text style={s.detailLabel}>Reference</Text>
                      <Text style={[s.detailValue, { fontFamily: "monospace", color: colors.cyan }]}>{selectedDoc.reference_number}</Text>
                    </View>
                  ) : null}
                  {(selectedDoc.document_type === "payslip" || selectedDoc.document_type === "statement") && (
                    <View style={[s.contentBlock, { borderColor: color + "30" }]}>
                      <Text style={[s.contentBlockTitle, { color }]}>Document Contents</Text>
                      {contentLoading ? (
                        <View style={{ alignItems: "center", paddingVertical: 12 }}>
                          <ActivityIndicator color={color} size="small" />
                          <Text style={s.contentLoading}>Loading…</Text>
                        </View>
                      ) : fullContent ? (() => {
                        const fc = fullContent;
                        if (fc.type === "payslip") {
                          const d = fc.data;
                          return (<>
                            {d.driver_name ? <ContentRow label="Driver" value={d.driver_name} colors={colors} /> : null}
                            {d.period_label ? <ContentRow label="Period" value={d.period_label} colors={colors} /> : null}
                            <ContentRow label="Gross Earnings" value={fmtAmt(d.gross_earnings ?? 0)} colors={colors} green />
                            <ContentRow label="Platform Fee" value={`-${fmtAmt(d.platform_fee ?? 0)}`} colors={colors} />
                            {(d.owner_payouts ?? 0) > 0 && <ContentRow label="Owner Payouts" value={`-${fmtAmt(d.owner_payouts)}`} colors={colors} />}
                            <ContentRow label="Net Earnings" value={fmtAmt(d.driver_net_earnings ?? d.total_net ?? 0)} colors={colors} green bold />
                            {(d.total_trips ?? 0) > 0 && <ContentRow label="Total Trips" value={String(d.total_trips)} colors={colors} />}
                          </>);
                        }
                        if (fc.type === "passenger") {
                          const d = fc.data; const sm = d.summary ?? {};
                          return (<>
                            {d.passenger_name ? <ContentRow label="Passenger" value={d.passenger_name} colors={colors} /> : null}
                            {(d.period_start || d.period_end) ? <ContentRow label="Period" value={`${d.period_start ?? ""} – ${d.period_end ?? ""}`} colors={colors} /> : null}
                            <ContentRow label="Total Rides" value={String(sm.total_trips ?? 0)} colors={colors} />
                            <ContentRow label="Total Spent" value={`-${fmtAmt(sm.total_spent ?? 0)}`} colors={colors} />
                            <ContentRow label="Wallet Top-Ups" value={`+${fmtAmt(sm.total_topups ?? 0)}`} colors={colors} green />
                            <ContentRow label="Avg Trip Cost" value={fmtAmt(sm.average_trip ?? 0)} colors={colors} />
                          </>);
                        }
                        if (fc.type === "owner") {
                          const d = fc.data; const sm = d.summary ?? {};
                          return (<>
                            {(d.business_name || d.owner_name) ? <ContentRow label="Owner" value={d.business_name || d.owner_name} colors={colors} /> : null}
                            {(d.period_start || d.period_end) ? <ContentRow label="Period" value={`${d.period_start ?? ""} – ${d.period_end ?? ""}`} colors={colors} /> : null}
                            {sm.total_cashup_received != null && <ContentRow label="Cashup Received" value={fmtAmt(sm.total_cashup_received)} colors={colors} green bold />}
                            {sm.total_fuel_deducted != null && <ContentRow label="Fuel Deducted" value={`-${fmtAmt(sm.total_fuel_deducted)}`} colors={colors} />}
                            {sm.net_earnings != null && <ContentRow label="Net Earnings" value={fmtAmt(sm.net_earnings)} colors={colors} green={sm.net_earnings >= 0} bold />}
                          </>);
                        }
                        return null;
                      })() : <Text style={s.contentLoading}>Content unavailable</Text>}
                    </View>
                  )}
                  <View style={{ gap: 10, marginTop: 16 }}>
                    {canDownload && (
                      <TouchableOpacity
                        style={[s.sheetActionBtn, { backgroundColor: color, borderColor: color }]}
                        onPress={() => { setSelectedDoc(null); handleDownload(selectedDoc); }}
                        disabled={downloading === selectedDoc.id}>
                        <Ionicons name="download-outline" size={18} color="#fff" />
                        <Text style={s.sheetActionBtnText}>Download / Print PDF</Text>
                      </TouchableOpacity>
                    )}
                    {selectedDoc.document_type === "payslip" && (
                      <TouchableOpacity
                        style={[s.sheetActionBtn, { backgroundColor: colors.cyanDim, borderColor: colors.cyan + "60" }]}
                        onPress={() => { setSelectedDoc(null); handleShare(selectedDoc); }}>
                        <Ionicons name="share-outline" size={18} color={colors.cyan} />
                        <Text style={[s.sheetActionBtnText, { color: colors.cyan }]}>Share Verification Link</Text>
                      </TouchableOpacity>
                    )}
                    {selectedDoc.document_type === "kyc" && (
                      <TouchableOpacity
                        style={[s.sheetActionBtn, { backgroundColor: "#FFD60A20", borderColor: "#FFD60A" }]}
                        onPress={() => { setSelectedDoc(null); router.push("/(app)/kyc"); }}>
                        <Ionicons name="finger-print" size={18} color="#FFD60A" />
                        <Text style={[s.sheetActionBtnText, { color: "#FFD60A" }]}>Go to KYC</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => handleDeleteDoc(selectedDoc)} style={s.deleteBtn}>
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
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontSize: 22, fontWeight: "800" },
  subtitle: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  badge: { backgroundColor: colors.red, borderRadius: 999, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "900" },
  markAllBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: colors.cyanDim, borderWidth: 1, borderColor: colors.cyan + "30" },
  markAllText: { color: colors.cyan, fontSize: 11, fontWeight: "700" },
  // Top-level Alerts | Documents tabs
  topTabs: { flexDirection: "row", marginHorizontal: 16, marginBottom: 6, backgroundColor: colors.bg2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 3, gap: 2 },
  topTab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 9, borderRadius: 10, gap: 6 },
  topTabActive: { backgroundColor: colors.cyanDim },
  topTabText: { color: colors.textMuted, fontWeight: "700", fontSize: 13 },
  topTabTextActive: { color: colors.cyan },
  topTabBadge: { backgroundColor: colors.border, borderRadius: 8, minWidth: 16, height: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  topTabBadgeText: { color: colors.textMuted, fontSize: 8, fontWeight: "900" },
  // Notification list items
  item: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: colors.bg2, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  itemUnread: { borderColor: colors.cyan + "30", backgroundColor: colors.cyanDim },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  itemBody: { flex: 1 },
  itemTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  itemTitle: { color: colors.textMuted, fontWeight: "600", fontSize: 14, flex: 1 },
  itemTitleUnread: { color: colors.text, fontWeight: "800" },
  dot: { width: 7, height: 7, borderRadius: 4 },
  itemMsg: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  itemDate: { color: colors.textDim, fontSize: 10, marginTop: 4 },
  // Document filter sub-tabs
  tabsScroll: { maxHeight: 44 },
  docTabs: { paddingHorizontal: 16, gap: 8, alignItems: "center" },
  docTabBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg2 },
  docTabBtnActive: { backgroundColor: colors.cyanDim, borderColor: colors.cyan },
  docTabText: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  docTabTextActive: { color: colors.cyan, fontWeight: "800" },
  // Document cards
  card: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, backgroundColor: colors.bg2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, position: "relative" },
  unreadDot: { position: "absolute", left: -3, top: "50%", width: 6, height: 6, borderRadius: 3 },
  cardTitle: { color: colors.textMuted, fontWeight: "600", fontSize: 14 },
  cardDesc: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  periodLabel: { color: colors.textMuted, fontSize: 11, backgroundColor: colors.bg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  amount: { color: colors.green, fontSize: 12, fontWeight: "800" },
  ref: { color: colors.cyan, fontSize: 10, fontFamily: "monospace", marginTop: 3 },
  date: { color: colors.textDim, fontSize: 10, marginTop: 4 },
  actionBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  cardBtnRow: { flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" },
  viewChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  viewChipText: { fontSize: 11, fontWeight: "800" },
  dlChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  dlChipText: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  // Empty states
  empty: { paddingTop: 60, alignItems: "center", paddingHorizontal: 24 },
  emptyTitle: { color: colors.text, fontWeight: "700", fontSize: 16, marginTop: 12 },
  emptyText: { color: colors.textMuted, fontSize: 13, marginTop: 6, textAlign: "center", lineHeight: 19 },
  emptyAction: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 18, paddingHorizontal: 18, paddingVertical: 11, backgroundColor: colors.cyanDim, borderRadius: 999, borderWidth: 1, borderColor: colors.cyan + "40" },
  emptyActionText: { color: colors.cyan, fontWeight: "700", fontSize: 13 },
  // Bottom sheets
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.bg2, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: "85%" },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 20 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  sheetIconWrap: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bg3 ?? colors.border, alignItems: "center", justifyContent: "center" },
  sheetTitle: { fontSize: 20, fontWeight: "800", marginBottom: 4 },
  sheetDate: { color: colors.textDim, fontSize: 11, marginBottom: 16 },
  sheetMsgBox: { borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 16 },
  sheetMsg: { color: colors.text, fontSize: 15, lineHeight: 22 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  detailLabel: { color: colors.textMuted, fontSize: 13 },
  detailValue: { color: colors.text, fontSize: 13, fontWeight: "600", maxWidth: "60%", textAlign: "right" },
  sheetActionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1 },
  sheetActionBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  deleteBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, justifyContent: "center", borderWidth: 1, borderColor: colors.red + "30", borderRadius: 12, backgroundColor: colors.redDim ?? colors.red + "10" },
  deleteBtnText: { fontSize: 13, fontWeight: "700" },
  contentBlock: { borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 12 },
  contentBlockTitle: { fontSize: 10, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 10 },
  contentLoading: { color: colors.textDim, fontSize: 12, textAlign: "center", marginTop: 4 },
});
