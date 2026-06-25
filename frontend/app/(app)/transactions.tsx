import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, RefreshControl,
  TouchableOpacity, Alert, Modal, ScrollView, Pressable, TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { api, Txn, Dispute } from "../../src/api";
import { useAuth } from "../../src/AuthContext";
import { useTheme } from "../../src/ThemeContext";
import { Pill } from "../../src/ui";
import { ConfirmDialog } from "../../src/ConfirmDialog";
import { formatZAR, formatDate, radius } from "../../src/theme";

type Filter = "all" | "in" | "out" | "topup" | "withdrawal";

const DISPUTE_CATEGORIES = [
  "Incorrect amount",
  "Service not provided",
  "Duplicate charge",
  "Unauthorised transaction",
  "Driver did not arrive",
  "Other",
];

export default function Transactions() {
  const { state } = useAuth();
  const { colors } = useTheme();
  const [items, setItems] = useState<Txn[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [period, setPeriod] = useState<"all" | "today" | "week" | "month">("all");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Txn | null>(null);
  const [undone, setUndone] = useState<{ txn: Txn; index: number } | null>(null);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const undoTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [disputeCategory, setDisputeCategory] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, d] = await Promise.all([api.transactions(), api.myDisputes().catch(() => [])]);
      setItems(t);
      setDisputes(d);
    } catch {}
    finally { setRefreshing(false); setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Hiding a transaction is permanent on this passenger's account — it's
  // recorded server-side (per-user) so it never resurfaces on any device,
  // while the underlying transaction row stays untouched for audit purposes.
  const handleHide = async (id: string) => {
    const index = items.findIndex(t => t.id === id);
    const txn = items[index];
    if (!txn) return;
    setItems(prev => prev.filter(t => t.id !== id));
    if (selected?.id === id) setSelected(null);
    try { await api.hideTransactions([id]); } catch { /* still hidden locally; safe to retry via undo/reload */ }

    setUndone({ txn, index });
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setUndone(null), 4000);
  };

  const handleUndoHide = async () => {
    if (!undone) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const { txn, index } = undone;
    setUndone(null);
    try {
      await api.unhideTransaction(txn.id);
      setItems(prev => {
        const next = [...prev];
        next.splice(Math.min(index, next.length), 0, txn);
        return next;
      });
    } catch {}
  };

  const handleSubmitDispute = async () => {
    if (!selected || !disputeReason.trim() || disputeReason.trim().length < 10) return;
    setDisputeSubmitting(true);
    try {
      await api.submitDispute({
        transaction_id: selected.id,
        reason: disputeReason.trim(),
        category: disputeCategory || undefined,
      });
      const updated = await api.myDisputes().catch(() => disputes);
      setDisputes(updated);
      setShowDisputeForm(false);
      setDisputeCategory("");
      setDisputeReason("");
      Alert.alert("Dispute submitted", "Your dispute has been logged. Our team will review it within 24–48 hours.");
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || "Failed to submit dispute";
      Alert.alert("Error", msg);
    } finally {
      setDisputeSubmitting(false);
    }
  };

  const handleClearAll = () => {
    if (!items.length) return;
    setShowClearAllConfirm(true);
  };

  const confirmClearAll = async () => {
    setShowClearAllConfirm(false);
    const allIds = items.map(t => t.id);
    setItems([]);
    setSelected(null);
    try { await api.hideTransactions(allIds); } catch { load(); }
  };

  const now = new Date();
  const todayStr = now.toDateString();
  const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date(now); monthAgo.setMonth(monthAgo.getMonth() - 1);

  const periodItems = items.filter(t => {
    if (period === "today") return new Date(t.created_at).toDateString() === todayStr;
    if (period === "week") return new Date(t.created_at) >= weekAgo;
    if (period === "month") return new Date(t.created_at) >= monthAgo;
    return true;
  });

  const filtered = periodItems.filter(t => {
    if (filter === "all") return true;
    if (filter === "topup") return t.type === "topup";
    if (filter === "withdrawal") return t.type === "withdrawal";
    if (filter === "in") return t.direction === "in";
    if (filter === "out") return t.direction === "out";
    return true;
  });

  const isDriver = state.status === "authed" && state.user.role === "driver";
  const filters: Filter[] = isDriver ? ["all", "in", "withdrawal"] : ["all", "out", "topup"];

  const statEarned = filtered.filter(t => t.direction === "in" && t.status === "completed").reduce((s, t) => s + (t.gross_amount ?? t.amount), 0);
  const statSpent = filtered.filter(t => t.direction === "out" && t.type === "payment" && t.status === "completed").reduce((s, t) => s + t.amount, 0);
  const statTrips = filtered.filter(t => t.type === "payment" && t.status === "completed").length;
  const statAvg = statTrips > 0 ? (isDriver ? statEarned : statSpent) / statTrips : 0;
  const s = makeStyles(colors);

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="transactions-screen">
      <View style={s.header}>
        <Text style={s.title}>Transactions</Text>
        {filtered.length > 0 && (
          <TouchableOpacity onPress={handleClearAll} style={s.clearBtn}>
            <Ionicons name="trash-outline" size={14} color={colors.red} />
            <Text style={s.clearText}>Clear all</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Period selector */}
      <View style={s.periodRow}>
        {(["all", "today", "week", "month"] as const).map(p => (
          <TouchableOpacity key={p} onPress={() => setPeriod(p)}
            style={[s.periodBtn, period === p && s.periodBtnActive]}>
            <Text style={[s.periodText, period === p && s.periodTextActive]}>
              {p === "all" ? "All" : p === "today" ? "Today" : p === "week" ? "7 Days" : "30 Days"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Summary stats bar */}
      {filtered.length > 0 && (
        <View style={s.statsBar}>
          <View style={s.statItem}>
            <Text style={s.statLabel}>{isDriver ? "EARNED" : "SPENT"}</Text>
            <Text style={[s.statVal, { color: isDriver ? colors.green : colors.cyan }]}>
              {formatZAR(isDriver ? statEarned : statSpent)}
            </Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Text style={s.statLabel}>TRIPS</Text>
            <Text style={[s.statVal, { color: "#A064FF" }]}>{statTrips}</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Text style={s.statLabel}>AVG</Text>
            <Text style={[s.statVal, { color: colors.text }]}>{statAvg > 0 ? formatZAR(statAvg) : "—"}</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Text style={s.statLabel}>TOTAL TXN</Text>
            <Text style={[s.statVal, { color: colors.textMuted }]}>{filtered.length}</Text>
          </View>
        </View>
      )}

      {/* Type filter chips */}
      <View style={s.filterRow}>
        {filters.map((f) => (
          <TouchableOpacity key={f} onPress={() => setFilter(f)}
            style={[s.filter, filter === f && s.filterActive]} testID={`filter-${f}`}>
            <Text style={[s.filterText, filter === f && s.filterTextActive]}>
              {f === "all" ? "All"
                : f === "in" ? "Received"
                : f === "out" ? "Paid"
                : f === "topup" ? "Top-ups"
                : "Withdrawals"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: 20, paddingBottom: undone ? 80 : 40, gap: 10 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={colors.cyan}
          />
        }
        removeClippedSubviews
        maxToRenderPerBatch={15}
        initialNumToRender={20}
        windowSize={10}
        renderItem={({ item: t }) => {
          const isIn = t.direction === "in" || t.type === "topup";
          const isWithdraw = t.type === "withdrawal";
          const sign = isIn ? "+" : "-";
          const color = isIn ? colors.green : colors.text;
          const icon = t.type === "topup" ? "arrow-down"
            : isWithdraw ? "cash-outline"
            : isIn ? "arrow-down-circle" : "arrow-up-circle";
          const title = t.type === "topup" ? "Wallet top-up"
            : isWithdraw ? "Withdrawal"
            : t.counterparty_name || "Transfer";
          return (
            <View style={{ position: "relative" }}>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => setSelected(t)}
                style={s.row}
                testID={`txn-row-${t.id}`}>
                <View style={[s.icon, { backgroundColor: isIn ? colors.greenDim : colors.cyanDim }]}>
                  <Ionicons name={icon as any} size={20} color={isIn ? colors.green : colors.cyan} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>{title}</Text>
                  <Text style={s.rowSub}>{formatDate(t.created_at)} · {t.reference}</Text>
                  {t.note ? <Text style={s.note}>{t.note}</Text> : null}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[s.amt, { color }]}>{sign}{formatZAR(t.amount)}</Text>
                  <View style={{ marginTop: 6 }}>
                    <Pill
                      label={t.status}
                      tone={t.status === "completed" ? "green" : t.status === "pending" ? "yellow" : "red"}
                    />
                  </View>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleHide(t.id)}
                style={s.hideBtn}
                testID={`hide-txn-${t.id}`}>
                <Ionicons name="eye-off-outline" size={16} color={colors.textDim} />
              </TouchableOpacity>
            </View>
          );
        }}
        ListEmptyComponent={!loading ? (
          <View style={s.empty}>
            <Ionicons name="receipt-outline" size={36} color={colors.textDim} />
            <Text style={s.emptyTxt}>
              {items.length > 0 ? "No transactions match this filter" : "No transactions yet"}
            </Text>
          </View>
        ) : null}
      />

      {/* Transaction detail sheet */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => { setSelected(null); setShowDisputeForm(false); setDisputeCategory(""); setDisputeReason(""); }}>
        <Pressable style={s.backdrop} onPress={() => { setSelected(null); setShowDisputeForm(false); setDisputeCategory(""); setDisputeReason(""); }}>
          <Pressable style={s.sheet} onPress={() => {}}>
            {selected && (() => {
              const isIn = selected.direction === "in" || selected.type === "topup";
              const isWithdraw = selected.type === "withdrawal";
              const sign = isIn ? "+" : "-";
              const amtColor = isIn ? colors.green : colors.text;
              const icon = selected.type === "topup" ? "arrow-down"
                : isWithdraw ? "cash-outline"
                : isIn ? "arrow-down-circle" : "arrow-up-circle";
              const title = selected.type === "topup" ? "Wallet top-up"
                : isWithdraw ? "Withdrawal"
                : selected.counterparty_name || "Transfer";
              return (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={s.sheetHandle} />

                  <View style={s.sheetTop}>
                    <View style={[s.sheetIcon, { backgroundColor: isIn ? colors.greenDim : colors.cyanDim }]}>
                      <Ionicons name={icon as any} size={28} color={isIn ? colors.green : colors.cyan} />
                    </View>
                    <TouchableOpacity onPress={() => { setSelected(null); setShowDisputeForm(false); setDisputeCategory(""); setDisputeReason(""); }} style={s.closeBtn}>
                      <Ionicons name="close" size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>

                  <Text style={s.sheetName}>{title}</Text>
                  <Text style={[s.sheetAmt, { color: amtColor }]}>{sign}{formatZAR(selected.amount)}</Text>

                  <View style={s.pillRow}>
                    <Pill
                      label={selected.status}
                      tone={selected.status === "completed" ? "green" : selected.status === "pending" ? "yellow" : "red"}
                    />
                    <Pill label={selected.type} tone="cyan" />
                  </View>

                  <View style={s.detailBox}>
                    <DetailRow label="Reference" value={selected.reference} copyable colors={colors} />
                    <DetailRow label="Date" value={formatDate(selected.created_at)} colors={colors} />
                    {selected.counterparty_name && (
                      <DetailRow label={isIn ? "From" : "To"} value={selected.counterparty_name} colors={colors} />
                    )}
                    {selected.platform_fee ? (
                      <DetailRow label="Platform fee" value={`-${formatZAR(selected.platform_fee)}`} colors={colors} />
                    ) : null}
                    {selected.driver_net ? (
                      <DetailRow label="Net received" value={formatZAR(selected.driver_net)} colors={colors} />
                    ) : null}
                    {selected.gross_amount ? (
                      <DetailRow label="Gross amount" value={formatZAR(selected.gross_amount)} colors={colors} />
                    ) : null}
                    {selected.note ? (
                      <DetailRow label="Note" value={selected.note} colors={colors} />
                    ) : null}
                  </View>

                  {showDisputeForm ? (
                    // ── Inline dispute form ──
                    <View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }}>
                        <TouchableOpacity onPress={() => { setShowDisputeForm(false); setDisputeCategory(""); setDisputeReason(""); }} style={{ padding: 4 }}>
                          <Ionicons name="arrow-back" size={20} color={colors.textMuted} />
                        </TouchableOpacity>
                        <View>
                          <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16 }}>Raise a Dispute</Text>
                          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}>Ref: {selected.reference}</Text>
                        </View>
                      </View>

                      <Text style={{ color: colors.textDim, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Category</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                        <View style={{ flexDirection: "row", gap: 8 }}>
                          {DISPUTE_CATEGORIES.map(cat => (
                            <TouchableOpacity
                              key={cat}
                              onPress={() => setDisputeCategory(cat)}
                              style={{
                                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                                borderWidth: 1,
                                borderColor: disputeCategory === cat ? colors.cyan : colors.border,
                                backgroundColor: disputeCategory === cat ? colors.cyanDim : colors.bg,
                              }}>
                              <Text style={{ color: disputeCategory === cat ? colors.cyan : colors.textMuted, fontWeight: "700", fontSize: 12 }}>
                                {cat}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </ScrollView>

                      <Text style={{ color: colors.textDim, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Describe the issue</Text>
                      <TextInput
                        value={disputeReason}
                        onChangeText={setDisputeReason}
                        placeholder="What went wrong? (minimum 10 characters)"
                        placeholderTextColor={colors.textDim}
                        multiline
                        numberOfLines={4}
                        style={{
                          backgroundColor: colors.bg,
                          borderWidth: 1, borderColor: colors.border,
                          borderRadius: 12, padding: 14,
                          color: colors.text, fontSize: 14,
                          minHeight: 100, textAlignVertical: "top",
                          marginBottom: 16,
                        }}
                      />

                      <TouchableOpacity
                        onPress={handleSubmitDispute}
                        disabled={disputeSubmitting || disputeReason.trim().length < 10}
                        style={{
                          backgroundColor: disputeReason.trim().length >= 10 ? colors.red : colors.bg3 ?? colors.border,
                          borderRadius: 12, paddingVertical: 14,
                          alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8,
                          opacity: disputeSubmitting ? 0.6 : 1, marginBottom: 8,
                        }}>
                        <Ionicons name="alert-circle-outline" size={16} color={disputeReason.trim().length >= 10 ? "#fff" : colors.textDim} />
                        <Text style={{ color: disputeReason.trim().length >= 10 ? "#fff" : colors.textDim, fontWeight: "800", fontSize: 14 }}>
                          {disputeSubmitting ? "Submitting…" : "Submit Dispute"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    // ── Normal detail bottom section ──
                    <>
                      {(() => {
                        const canDispute = selected.type === "payment" && selected.status === "completed";
                        const existingDispute = disputes.find(d => d.transaction_id === selected.id);
                        if (!canDispute) return null;
                        if (existingDispute) {
                          const isResolved = existingDispute.status === "resolved";
                          return (
                            <View style={[s.disputeStatus, {
                              backgroundColor: isResolved ? colors.greenDim : colors.cyanDim,
                              borderColor: isResolved ? colors.green + "40" : colors.cyan + "40",
                            }]}>
                              <Ionicons
                                name={isResolved ? "checkmark-circle-outline" : "time-outline"}
                                size={15}
                                color={isResolved ? colors.green : colors.cyan}
                              />
                              <View style={{ flex: 1 }}>
                                <Text style={{ color: isResolved ? colors.green : colors.cyan, fontWeight: "700", fontSize: 13 }}>
                                  {isResolved ? "Dispute resolved" : "Dispute under review"}
                                </Text>
                                {isResolved && existingDispute.resolution ? (
                                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{existingDispute.resolution}</Text>
                                ) : !isResolved ? (
                                  <Text style={{ color: colors.textDim, fontSize: 11, marginTop: 2 }}>Our team is reviewing your dispute</Text>
                                ) : null}
                              </View>
                            </View>
                          );
                        }
                        return (
                          <TouchableOpacity
                            onPress={() => setShowDisputeForm(true)}
                            style={[s.disputeBtn, { borderColor: colors.red + "30", backgroundColor: colors.redDim }]}>
                            <Ionicons name="alert-circle-outline" size={15} color={colors.red} />
                            <Text style={{ color: colors.red, fontWeight: "700", fontSize: 13 }}>Raise a Dispute</Text>
                          </TouchableOpacity>
                        );
                      })()}

                      <TouchableOpacity
                        onPress={() => handleHide(selected.id)}
                        style={s.hideSheetBtn}>
                        <Ionicons name="eye-off-outline" size={15} color={colors.textMuted} />
                        <Text style={[s.hideSheetBtnText, { color: colors.textMuted }]}>Hide from history</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </ScrollView>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Undo hide banner */}
      {undone && (
        <View style={[s.undoBanner, { backgroundColor: colors.bg2, borderColor: colors.border }]}>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>Transaction hidden</Text>
          <TouchableOpacity onPress={handleUndoHide} style={{ paddingHorizontal: 12, paddingVertical: 4 }}>
            <Text style={{ color: colors.cyan, fontSize: 13, fontWeight: "700" }}>Undo</Text>
          </TouchableOpacity>
        </View>
      )}

      <ConfirmDialog
        visible={showClearAllConfirm}
        title="Clear all transactions?"
        message={`All ${items.length} transaction${items.length === 1 ? "" : "s"} will be permanently removed from your history on every device. This can't be undone from here — contact support to restore it.`}
        confirmLabel="Clear all"
        cancelLabel="Cancel"
        destructive
        onConfirm={confirmClearAll}
        onCancel={() => setShowClearAllConfirm(false)}
      />
    </SafeAreaView>
  );
}

function DetailRow({ label, value, copyable, colors }: { label: string; value: string; copyable?: boolean; colors: any }) {
  return (
    <View style={detailRowStyle.row}>
      <Text style={[detailRowStyle.label, { color: colors.textDim }]}>{label}</Text>
      <View style={detailRowStyle.valRow}>
        <Text style={[detailRowStyle.value, { color: colors.text }]} selectable>{value}</Text>
        {copyable && (
          <TouchableOpacity onPress={() => Clipboard.setStringAsync(value)} style={detailRowStyle.copyBtn}>
            <Ionicons name="copy-outline" size={13} color={colors.textDim} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const detailRowStyle = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10 },
  label: { fontSize: 12, fontWeight: "600" },
  valRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  value: { fontSize: 13, fontWeight: "600", textAlign: "right", maxWidth: 200 },
  copyBtn: { padding: 2 },
});

const makeStyles = (colors: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  undoBanner: {
    position: "absolute", bottom: 20, left: 16, right: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 14, borderRadius: 12, borderWidth: 1,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, elevation: 4,
  },
  header: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", padding: 20, paddingBottom: 8,
  },
  title: { color: colors.text, fontSize: 24, fontWeight: "800" },
  clearBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: colors.redDim, borderWidth: 1, borderColor: colors.red + "40",
  },
  clearText: { color: colors.red, fontSize: 11, fontWeight: "700" },
  periodRow: {
    flexDirection: "row", paddingHorizontal: 20, gap: 6, paddingTop: 4, paddingBottom: 4,
  },
  periodBtn: {
    flex: 1, paddingVertical: 7, borderRadius: radius.pill ?? 999,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg2,
    alignItems: "center",
  },
  periodBtnActive: { borderColor: colors.cyan, backgroundColor: colors.cyanDim },
  periodText: { color: colors.textMuted, fontWeight: "700", fontSize: 11 },
  periodTextActive: { color: colors.cyan },
  statsBar: {
    flexDirection: "row", marginHorizontal: 20, marginBottom: 6,
    backgroundColor: colors.bg2, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, paddingVertical: 10,
  },
  statItem: { flex: 1, alignItems: "center" },
  statLabel: { color: colors.textMuted, fontSize: 8, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  statVal: { fontSize: 13, fontWeight: "800", marginTop: 3 },
  statDivider: { width: 1, backgroundColor: colors.border },
  filterRow: { flexDirection: "row", paddingHorizontal: 20, gap: 8, paddingVertical: 8 },
  filter: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg2,
  },
  filterActive: { borderColor: colors.cyan, backgroundColor: colors.cyanDim },
  filterText: { color: colors.textMuted, fontWeight: "700", fontSize: 12 },
  filterTextActive: { color: colors.cyan },
  row: {
    flexDirection: "row", alignItems: "center", padding: 14, paddingRight: 44,
    backgroundColor: colors.bg2, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, gap: 12,
  },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  rowTitle: { color: colors.text, fontWeight: "700", fontSize: 14 },
  rowSub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  note: { color: colors.textDim, fontSize: 11, marginTop: 4, fontStyle: "italic" },
  amt: { fontWeight: "800", fontSize: 15 },
  hideBtn: { position: "absolute", top: 14, right: 12, padding: 4 },
  empty: { padding: 40, alignItems: "center" },
  emptyTxt: { color: colors.textMuted, marginTop: 8, fontWeight: "600" },
  // Sheet
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.bg2,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40, maxHeight: "85%",
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.border, alignSelf: "center", marginBottom: 20,
  },
  sheetTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  sheetIcon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.bg3 ?? colors.border,
    alignItems: "center", justifyContent: "center",
  },
  sheetName: { color: colors.text, fontSize: 18, fontWeight: "700", marginBottom: 4 },
  sheetAmt: { fontSize: 32, fontWeight: "900", marginBottom: 12 },
  pillRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  detailBox: {
    backgroundColor: colors.bg,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 16, marginBottom: 20,
    gap: 0,
  },
  hideSheetBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 12, justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, backgroundColor: colors.bg,
    marginBottom: 8,
  },
  hideSheetBtnText: { fontSize: 13, fontWeight: "600" },
  disputeBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 12, justifyContent: "center",
    borderWidth: 1, borderRadius: radius.md, marginBottom: 8,
  },
  disputeStatus: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderRadius: radius.md, marginBottom: 8,
  },
});
