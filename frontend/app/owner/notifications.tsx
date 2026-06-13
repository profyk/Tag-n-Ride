import React, { useState, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, FlatList, RefreshControl,
  TouchableOpacity, Modal, ScrollView, Pressable, Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../src/ThemeContext";
import { useAuth } from "../../src/AuthContext";
import { useNotifications } from "../../src/NotificationContext";
import { useDocuments } from "../../src/DocumentContext";
import { api, Notification, UserDocument } from "../../src/api";
import { formatDate, radius } from "../../src/theme";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as Location from "expo-location";
import { buildOwnerStatementPDF } from "./statement";

// ── Notification helpers ──────────────────────────────────────
function notifIcon(t: string): any {
  if (t === "success") return "checkmark-circle";
  if (t === "warning") return "warning";
  if (t === "error") return "alert-circle";
  return "information-circle";
}
function notifColor(t: string, c: any) {
  if (t === "success") return c.green;
  if (t === "warning") return "#FFD60A";
  if (t === "error") return c.red;
  return c.cyan;
}
function notifBg(t: string, c: any) {
  if (t === "success") return c.greenDim;
  if (t === "warning") return "rgba(255,214,10,0.12)";
  if (t === "error") return c.redDim;
  return c.cyanDim;
}

// ── Document helpers ──────────────────────────────────────────
function docIcon(type: string): any {
  if (type === "statement") return "document-text";
  if (type === "topup") return "card";
  if (type === "withdrawal") return "cash";
  if (type === "kyc") return "finger-print";
  if (type === "notice") return "mail";
  return "document-outline";
}
function docColor(type: string, c: any) {
  if (type === "statement") return c.cyan;
  if (type === "topup") return "#A064FF";
  if (type === "withdrawal") return c.green;
  if (type === "kyc") return "#FFD60A";
  return c.textMuted;
}
function docBg(type: string, c: any) {
  if (type === "statement") return c.cyanDim;
  if (type === "topup") return "rgba(160,100,255,0.12)";
  if (type === "withdrawal") return c.greenDim;
  if (type === "kyc") return "rgba(255,214,10,0.12)";
  return c.bg;
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

type DocTab = "all" | "statements" | "financial" | "identity" | "notices";
function filterDocs(docs: UserDocument[], tab: DocTab) {
  if (tab === "all") return docs;
  if (tab === "statements") return docs.filter(d => d.document_type === "statement");
  if (tab === "financial") return docs.filter(d => ["topup", "withdrawal", "receipt"].includes(d.document_type));
  if (tab === "identity") return docs.filter(d => d.document_type === "kyc");
  if (tab === "notices") return docs.filter(d => ["notice", "contract"].includes(d.document_type));
  return docs;
}

// ── SOS helpers ───────────────────────────────────────────────
async function getLocation() {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
  } catch { return null; }
}

export default function OwnerNotifications() {
  const router = useRouter();
  const { colors } = useTheme();
  const { state } = useAuth();
  const {
    notifications, unreadCount, isRead,
    markRead, markAllRead, deleteNotification, refresh: refreshNotifs,
  } = useNotifications();
  const { unreadCount: docsUnreadCount, refreshCount } = useDocuments();

  const [activeTab, setActiveTab] = useState<"alerts" | "docs">("alerts");
  const [notifRefreshing, setNotifRefreshing] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState<Notification | null>(null);

  const [docs, setDocs] = useState<UserDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsRefreshing, setDocsRefreshing] = useState(false);
  const [docTab, setDocTab] = useState<DocTab>("all");
  const [selectedDoc, setSelectedDoc] = useState<UserDocument | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [fullContent, setFullContent] = useState<any>(null);
  const [contentLoading, setContentLoading] = useState(false);

  // SOS state
  const [sosActive, setSosActive] = useState<{ sos_id: string; type: string } | null>(null);
  const [sosLoading, setSosLoading] = useState(false);

  const docUnreadCount = docs.filter(d => !d.is_read).length;
  const totalUnread = unreadCount + docUnreadCount;

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

  // Load statement content when detail sheet opens
  useEffect(() => {
    if (!selectedDoc || selectedDoc.document_type !== "statement") {
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
    api.getOwnerStatement(meta.statement_id ?? selectedDoc.id)
      .then(r => setFullContent(typeof r.data === "string" ? JSON.parse(r.data) : r.data))
      .catch(() => setFullContent(null))
      .finally(() => setContentLoading(false));
  }, [selectedDoc?.id]);

  // Notification handlers
  const handleOpenNotif = (n: Notification) => { setSelectedNotif(n); markRead(n.id); };
  const handleDeleteNotif = async (id: string) => {
    await deleteNotification(id);
    if (selectedNotif?.id === id) setSelectedNotif(null);
  };

  // Document handlers
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
  const handleDownload = async (doc: UserDocument) => {
    setDownloading(doc.id);
    try {
      const rawMeta = doc.metadata;
      const meta: Record<string, any> = !rawMeta ? {} :
        typeof rawMeta === "string"
          ? (() => { try { return JSON.parse(rawMeta); } catch { return {}; } })()
          : rawMeta;
      const res = await api.getOwnerStatement(meta.statement_id ?? doc.id);
      const d2 = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
      const html = buildOwnerStatementPDF(d2, res.reference ?? "");
      const fileName = `TagNRide-Fleet-Statement-${(doc.period_label || "Fleet").replace(/[^a-zA-Z0-9]/g, "-")}.pdf`;
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: fileName, UTI: "com.adobe.pdf" });
    } catch (e: any) { Alert.alert("Error", e?.message || "Could not generate PDF."); }
    finally { setDownloading(null); }
  };

  // SOS handler
  const handleSOS = (type: "police" | "ambulance") => {
    Alert.alert(
      type === "police" ? "Call Police (Emergency)" : "Call Ambulance (Emergency)",
      "This will send your location to emergency services via Tag n Ride. Only use in a genuine emergency.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "SEND SOS", style: "destructive", onPress: async () => {
            setSosLoading(true);
            try {
              const loc = await getLocation();
              const res = await api.sosRequest({
                emergency_type: type,
                latitude: loc?.latitude,
                longitude: loc?.longitude,
              });
              setSosActive({ sos_id: res.sos_id, type });
              Alert.alert(
                "SOS Sent",
                `Your emergency alert has been sent. Help is on the way.\n\nSOS ID: ${res.sos_id}`,
              );
            } catch (e: any) {
              Alert.alert("SOS Failed", e?.message || "Could not send emergency alert. Please call 10111 directly.");
            } finally { setSosLoading(false); }
          },
        },
      ]
    );
  };

  const filteredDocs = filterDocs(docs, docTab);
  const DOC_TABS: { key: DocTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "statements", label: "Statements" },
    { key: "financial", label: "Financial" },
    { key: "identity", label: "Identity" },
    { key: "notices", label: "Notices" },
  ];
  const s = makeStyles(colors);

  return (
    <SafeAreaView style={s.root} edges={["top"]}>

      {/* Header */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={s.title}>Inbox</Text>
            {totalUnread > 0 && (
              <View style={s.badge}><Text style={s.badgeText}>{totalUnread > 99 ? "99+" : totalUnread}</Text></View>
            )}
          </View>
          {totalUnread > 0 && <Text style={s.subtitle}>{totalUnread} unread</Text>}
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
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
      </View>

      {/* SOS Panel */}
      <View style={s.sosPanel}>
        <View style={s.sosPanelLeft}>
          <View style={s.sosIconWrap}>
            <Ionicons name="warning" size={16} color={colors.red} />
          </View>
          <Text style={s.sosLabel}>EMERGENCY SOS</Text>
        </View>
        <View style={s.sosBtns}>
          <TouchableOpacity
            style={[s.sosBtn, { borderColor: "#1D4ED8" }]}
            onPress={() => handleSOS("police")}
            disabled={sosLoading}>
            {sosLoading ? <ActivityIndicator size="small" color="#1D4ED8" /> : <Ionicons name="shield-outline" size={14} color="#1D4ED8" />}
            <Text style={[s.sosBtnText, { color: "#1D4ED8" }]}>Police</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.sosBtn, { borderColor: colors.red }]}
            onPress={() => handleSOS("ambulance")}
            disabled={sosLoading}>
            {sosLoading ? <ActivityIndicator size="small" color={colors.red} /> : <Ionicons name="medkit-outline" size={14} color={colors.red} />}
            <Text style={[s.sosBtnText, { color: colors.red }]}>Ambulance</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Alerts | Documents tabs */}
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

      {/* Alerts tab */}
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
                style={[s.item, !read && s.itemUnread]}>
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

      {/* Documents tab */}
      {activeTab === "docs" && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabsScroll} contentContainerStyle={s.docTabs}>
            {DOC_TABS.map(t => (
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
                const canDownload = doc.document_type === "statement";
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
                            style={s.dlChip}
                            onPress={e => { e.stopPropagation?.(); handleDownload(doc); }}
                            disabled={downloading === doc.id}>
                            {downloading === doc.id
                              ? <ActivityIndicator color={colors.textMuted} size="small" style={{ width: 13, height: 13 }} />
                              : <Ionicons name="download-outline" size={13} color={colors.textMuted} />}
                            <Text style={s.dlChipText}>PDF</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[s.dlChip, { borderColor: colors.red + "40" }]}
                            onPress={e => { e.stopPropagation?.(); handleDeleteDoc(doc); }}>
                            <Ionicons name="trash-outline" size={13} color={colors.red} />
                            <Text style={[s.dlChipText, { color: colors.red }]}>Delete</Text>
                          </TouchableOpacity>
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
                    {docTab === "statements"
                      ? "Your fleet statements appear here. Generate one below."
                      : docTab === "financial"
                      ? "Wallet top-up confirmations and withdrawal receipts appear here automatically."
                      : docTab === "identity"
                      ? "Your KYC / identity verification documents appear here."
                      : "All your documents appear here — statements, receipts, KYC, and notices."}
                  </Text>
                  {(docTab === "all" || docTab === "statements") && (
                    <TouchableOpacity
                      style={s.emptyAction}
                      onPress={() => router.push("/owner/statement")}
                      activeOpacity={0.8}>
                      <Ionicons name="document-text-outline" size={16} color={colors.cyan} />
                      <Text style={s.emptyActionText}>Generate Fleet Statement</Text>
                    </TouchableOpacity>
                  )}
                </View>
              }
            />
          )}
        </>
      )}

      {/* Generate statement shortcut (sticky bottom) when on docs/statements */}
      {activeTab === "docs" && (docTab === "all" || docTab === "statements") && filteredDocs.length > 0 && (
        <TouchableOpacity
          style={[s.stickyGenBtn, { backgroundColor: colors.cyanDim, borderColor: colors.cyan }]}
          onPress={() => router.push("/owner/statement")}
          activeOpacity={0.85}>
          <Ionicons name="add-circle-outline" size={18} color={colors.cyan} />
          <Text style={[s.stickyGenBtnText, { color: colors.cyan }]}>Generate New Fleet Statement</Text>
        </TouchableOpacity>
      )}

      {/* Notification detail sheet */}
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

      {/* Document detail sheet */}
      <Modal visible={!!selectedDoc} transparent animationType="slide" onRequestClose={() => setSelectedDoc(null)}>
        <Pressable style={s.backdrop} onPress={() => setSelectedDoc(null)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            {selectedDoc && (() => {
              const color = docColor(selectedDoc.document_type, colors);
              const bg = docBg(selectedDoc.document_type, colors);
              const isStatement = selectedDoc.document_type === "statement";
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
                    <View style={s.detailRow}>
                      <Text style={s.detailLabel}>Period</Text>
                      <Text style={s.detailValue}>{selectedDoc.period_label}</Text>
                    </View>
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

                  {/* Statement full content */}
                  {isStatement && (
                    <View style={[s.contentBlock, { borderColor: color + "30" }]}>
                      <Text style={[s.contentBlockTitle, { color }]}>Statement Contents</Text>
                      {contentLoading ? (
                        <View style={{ alignItems: "center", paddingVertical: 12 }}>
                          <ActivityIndicator color={color} size="small" />
                          <Text style={s.contentLoading}>Loading…</Text>
                        </View>
                      ) : fullContent ? (() => {
                        const d = fullContent;
                        const sm = d.summary ?? {};
                        return (<>
                          {(d.business_name || d.owner_name) && <ContentRow label="Owner" value={d.business_name || d.owner_name} colors={colors} />}
                          {(d.period_start || d.period_end) && <ContentRow label="Period" value={`${d.period_start ?? ""} – ${d.period_end ?? ""}`} colors={colors} />}
                          {sm.total_cashup_received != null && <ContentRow label="Cashup Received" value={fmtAmt(sm.total_cashup_received)} colors={colors} green bold />}
                          {sm.total_fuel_deducted != null && <ContentRow label="Fuel Deducted" value={`-${fmtAmt(sm.total_fuel_deducted)}`} colors={colors} />}
                          {sm.total_driver_profit != null && <ContentRow label="Driver Profit" value={`-${fmtAmt(sm.total_driver_profit)}`} colors={colors} />}
                          {sm.subscription_fees_paid != null && <ContentRow label="Subscription Fees" value={`-${fmtAmt(sm.subscription_fees_paid)}`} colors={colors} />}
                          {sm.total_payouts != null && <ContentRow label="Payouts" value={`-${fmtAmt(sm.total_payouts)}`} colors={colors} />}
                          {sm.net_earnings != null && <ContentRow label="Net Earnings" value={fmtAmt(sm.net_earnings)} colors={colors} green={sm.net_earnings >= 0} bold />}
                          {(d.drivers ?? []).length > 0 && (
                            <ContentRow label="Fleet Drivers" value={String(d.drivers.length)} colors={colors} />
                          )}
                        </>);
                      })() : <Text style={s.contentLoading}>Content unavailable</Text>}
                    </View>
                  )}

                  <View style={{ gap: 10, marginTop: 16 }}>
                    {isStatement && (
                      <TouchableOpacity
                        style={[s.sheetActionBtn, { backgroundColor: color, borderColor: color }]}
                        onPress={() => { setSelectedDoc(null); handleDownload(selectedDoc); }}
                        disabled={downloading === selectedDoc.id}>
                        <Ionicons name="download-outline" size={18} color="#fff" />
                        <Text style={s.sheetActionBtnText}>Download / Print PDF</Text>
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
  title: { color: colors.text, fontSize: 22, fontWeight: "800" },
  subtitle: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  badge: { backgroundColor: colors.red, borderRadius: 999, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "900" },
  markAllBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: colors.cyanDim, borderWidth: 1, borderColor: colors.cyan + "30" },
  markAllText: { color: colors.cyan, fontSize: 11, fontWeight: "700" },
  // SOS panel
  sosPanel: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 10, backgroundColor: colors.redDim, borderRadius: radius.md, borderWidth: 1, borderColor: colors.red + "40", paddingHorizontal: 12, paddingVertical: 10, gap: 10 },
  sosPanelLeft: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  sosIconWrap: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.red + "20", alignItems: "center", justifyContent: "center" },
  sosLabel: { color: colors.red, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  sosBtns: { flexDirection: "row", gap: 8 },
  sosBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, backgroundColor: colors.bg },
  sosBtnText: { fontSize: 12, fontWeight: "800" },
  // Tabs
  topTabs: { flexDirection: "row", marginHorizontal: 16, marginBottom: 6, backgroundColor: colors.bg2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 3, gap: 2 },
  topTab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 9, borderRadius: 10, gap: 6 },
  topTabActive: { backgroundColor: colors.cyanDim },
  topTabText: { color: colors.textMuted, fontWeight: "700", fontSize: 13 },
  topTabTextActive: { color: colors.cyan },
  topTabBadge: { backgroundColor: colors.border, borderRadius: 8, minWidth: 16, height: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  topTabBadgeText: { color: colors.textMuted, fontSize: 8, fontWeight: "900" },
  // Items
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
  // Doc tabs
  tabsScroll: { flexGrow: 0 },
  docTabs: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  docTabBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg2 },
  docTabBtnActive: { backgroundColor: colors.cyanDim, borderColor: colors.cyan },
  docTabText: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  docTabTextActive: { color: colors.cyan },
  // Cards
  card: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, backgroundColor: colors.bg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, position: "relative" },
  unreadDot: { position: "absolute", top: 10, left: 10, width: 7, height: 7, borderRadius: 4 },
  cardTitle: { color: colors.textMuted, fontWeight: "600", fontSize: 14 },
  cardDesc: { color: colors.textMuted, fontSize: 12, marginTop: 3, lineHeight: 16 },
  periodLabel: { color: colors.cyan, fontSize: 10, fontWeight: "700", backgroundColor: colors.cyanDim, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  amount: { color: colors.green, fontSize: 11, fontWeight: "800" },
  ref: { color: colors.textDim, fontSize: 10, fontFamily: "monospace", marginTop: 3 },
  date: { color: colors.textDim, fontSize: 10, marginTop: 3 },
  cardBtnRow: { flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" },
  dlChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg2 },
  dlChipText: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  actionBtn: { padding: 6 },
  // Empty
  empty: { alignItems: "center", paddingTop: 60, paddingHorizontal: 32, gap: 12 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  emptyText: { color: colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 20 },
  emptyAction: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.cyanDim, borderRadius: 12, borderWidth: 1, borderColor: colors.cyan + "50", paddingHorizontal: 18, paddingVertical: 12 },
  emptyActionText: { color: colors.cyan, fontWeight: "700", fontSize: 14 },
  // Sticky gen btn
  stickyGenBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 16, marginBottom: 16, borderRadius: radius.md, borderWidth: 1, padding: 14 },
  stickyGenBtnText: { fontWeight: "700", fontSize: 14 },
  // Sheet
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.bg2, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 48, maxHeight: "85%", borderTopWidth: 1, borderColor: colors.border },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 20 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sheetIconWrap: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  sheetTitle: { color: colors.text, fontSize: 20, fontWeight: "800", marginBottom: 4 },
  sheetDate: { color: colors.textDim, fontSize: 12, marginBottom: 12 },
  sheetMsgBox: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 12 },
  sheetMsg: { color: colors.text, fontSize: 14, lineHeight: 20 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  detailLabel: { color: colors.textMuted, fontSize: 13 },
  detailValue: { color: colors.text, fontSize: 13, fontWeight: "600" },
  contentBlock: { borderRadius: 12, borderWidth: 1, padding: 14, marginVertical: 12 },
  contentBlockTitle: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2, marginBottom: 10 },
  contentLoading: { color: colors.textDim, fontSize: 12, textAlign: "center", paddingVertical: 8 },
  sheetActionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, padding: 16, borderWidth: 1 },
  sheetActionBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 12 },
  deleteBtnText: { fontSize: 13, fontWeight: "700" },
});
