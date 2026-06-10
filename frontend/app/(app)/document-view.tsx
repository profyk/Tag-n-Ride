import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useTheme } from "../../src/ThemeContext";
import { api } from "../../src/api";
import { radius } from "../../src/theme";
import { buildStatementPDF, buildFormalPayslipPDF } from "./payslip";
import { buildPassengerStatementPDF } from "./statement";
import { buildOwnerStatementPDF } from "../owner/statement";

function R(n: number) {
  return `R ${Number(n ?? 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function DocSection({ title, children, colors }: { title: string; children: React.ReactNode; colors: any }) {
  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "800", letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 10 }}>
        {title}
      </Text>
      <View style={{ backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
        {children}
      </View>
    </View>
  );
}

function DocRow({ label, value, green = false, red = false, bold = false, mono = false, colors }: {
  label: string; value: string; green?: boolean; red?: boolean; bold?: boolean; mono?: boolean; colors: any;
}) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border + "55" }}>
      <Text style={{ color: colors.textMuted, fontSize: 13, flex: 1 }}>{label}</Text>
      <Text style={{
        fontSize: 13, fontWeight: bold ? "800" : "600", maxWidth: "55%", textAlign: "right",
        color: green ? colors.green : red ? colors.red : colors.text,
        fontFamily: mono ? "monospace" : undefined,
      }}>{value}</Text>
    </View>
  );
}

function TripRow({ driver, date, amount, colors }: { driver: string; date: string; amount: number; colors: any }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border + "44" }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>{driver || "Driver"}</Text>
        <Text style={{ color: colors.textDim, fontSize: 11, marginTop: 1 }}>{date?.slice(0, 10) ?? ""}</Text>
      </View>
      <Text style={{ color: colors.red, fontSize: 13, fontWeight: "800" }}>-{R(amount)}</Text>
    </View>
  );
}

export default function DocumentViewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [doc, setDoc] = useState<any>(null);
  const [content, setContent] = useState<{ type: string; data: any } | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!id) { setError("No document ID provided."); setLoading(false); return; }
    (async () => {
      try {
        const docMeta = await api.documentGet(id);
        setDoc(docMeta);

        const meta = docMeta.metadata || {};
        const isPassenger = meta.statement_type === "passenger" ||
          (docMeta.document_type === "statement" && !!meta.statement_id && !meta.payslip_id && meta.statement_type !== "owner");
        const isOwner = meta.statement_type === "owner";

        if (isPassenger) {
          const r = await api.getPassengerStatement(meta.statement_id ?? id);
          setContent({ type: "passenger", data: typeof r.data === "string" ? JSON.parse(r.data) : r.data, ref: r.reference });
        } else if (isOwner) {
          const r = await api.getOwnerStatement(meta.statement_id ?? id);
          setContent({ type: "owner", data: typeof r.data === "string" ? JSON.parse(r.data) : r.data, ref: r.reference });
        } else if (docMeta.document_type === "payslip" || docMeta.document_type === "statement") {
          const data = await api.payslipGet(meta.payslip_id ?? id);
          setContent({ type: data.document_type === "payslip" ? "formal_payslip" : "payslip", data });
        } else {
          setContent(null);
        }
      } catch (e: any) {
        setError(e?.message || "Could not load document.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleDownload = async () => {
    if (!doc || !content) return;
    setDownloading(true);
    try {
      let html = "";
      if (content.type === "passenger") {
        html = buildPassengerStatementPDF(content.data, (content as any).ref ?? "");
      } else if (content.type === "owner") {
        html = buildOwnerStatementPDF(content.data, (content as any).ref ?? "");
      } else {
        html = content.type === "formal_payslip"
          ? buildFormalPayslipPDF(content.data)
          : buildStatementPDF(content.data);
      }
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const name = doc.title?.replace(/[^a-zA-Z0-9 ]/g, "-") ?? "TagNRide-Document";
      await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `${name}.pdf`, UTI: "com.adobe.pdf" });
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not generate PDF.");
    } finally {
      setDownloading(false);
    }
  };

  const renderContent = () => {
    if (!content) return null;

    // ── Driver payslip or earnings statement ──────────────────
    if (content.type === "payslip" || content.type === "formal_payslip") {
      const d = content.data;
      const isFormal = content.type === "formal_payslip" || d.document_type === "payslip";
      return (
        <>
          {isFormal && (
            <View style={[styles.badge, { backgroundColor: colors.greenDim, borderColor: colors.green + "50" }]}>
              <Ionicons name="shield-checkmark" size={14} color={colors.green} />
              <Text style={[styles.badgeText, { color: colors.green }]}>Bank-Grade Formal Payslip</Text>
            </View>
          )}

          <DocSection title="Driver Information" colors={colors}>
            {d.driver_name ? <DocRow label="Name" value={d.driver_name} bold colors={colors} /> : null}
            {d.driver_phone ? <DocRow label="Phone" value={d.driver_phone} colors={colors} /> : null}
            {d.id_number ? <DocRow label="ID Number" value={d.id_number} colors={colors} /> : null}
            {d.vehicle_plate ? <DocRow label="Vehicle" value={d.vehicle_plate} colors={colors} /> : null}
          </DocSection>

          <DocSection title="Period" colors={colors}>
            {d.period_label ? <DocRow label="Period" value={d.period_label} bold colors={colors} /> : null}
            {d.period_start ? <DocRow label="From" value={String(d.period_start).slice(0, 10)} colors={colors} /> : null}
            {d.period_end ? <DocRow label="To" value={String(d.period_end).slice(0, 10)} colors={colors} /> : null}
          </DocSection>

          <DocSection title="Earnings Breakdown" colors={colors}>
            <DocRow label="Gross Earnings" value={R(d.gross_earnings)} green colors={colors} />
            <DocRow label="Platform Fee (3%)" value={`-${R(d.platform_fee)}`} colors={colors} />
            {(d.owner_payouts ?? 0) > 0 && <DocRow label="Owner Payouts" value={`-${R(d.owner_payouts)}`} colors={colors} />}
            {(d.driver_cashups_self ?? 0) > 0 && <DocRow label="Driver Cashups (Self)" value={R(d.driver_cashups_self)} green colors={colors} />}
            <DocRow label="Net Earnings" value={R(d.driver_net_earnings ?? d.total_net)} green bold colors={colors} />
          </DocSection>

          <DocSection title="Performance" colors={colors}>
            <DocRow label="Total Trips" value={String(d.total_trips ?? 0)} colors={colors} />
            {(d.rating_count ?? 0) > 0 && (
              <DocRow label="Rating" value={`${Number(d.rating_avg).toFixed(1)} ⭐  (${d.rating_count} ratings)`} colors={colors} />
            )}
            <DocRow label="Wallet Balance at Issue" value={R(d.wallet_balance_at_generation)} colors={colors} />
          </DocSection>

          <DocSection title="Document Details" colors={colors}>
            {d.reference_number ? <DocRow label="Reference" value={d.reference_number} mono colors={colors} /> : null}
            {d.verification_code ? <DocRow label="Verification Code" value={d.verification_code} mono colors={colors} /> : null}
            <DocRow label="Issued By" value="Tag n Ride Pty Ltd" colors={colors} />
          </DocSection>
        </>
      );
    }

    // ── Passenger expense statement ───────────────────────────
    if (content.type === "passenger") {
      const d = content.data;
      const sm = d.summary ?? {};
      return (
        <>
          <DocSection title="Passenger Information" colors={colors}>
            {d.passenger_name ? <DocRow label="Name" value={d.passenger_name} bold colors={colors} /> : null}
            <DocRow label="Period" value={`${d.period_start ?? ""} – ${d.period_end ?? ""}`} colors={colors} />
          </DocSection>

          <DocSection title="Summary" colors={colors}>
            <DocRow label="Total Rides" value={String(sm.total_trips ?? 0)} bold colors={colors} />
            <DocRow label="Total Spent on Rides" value={R(sm.total_spent)} red colors={colors} />
            <DocRow label="Total Wallet Top-Ups" value={`+${R(sm.total_topups)}`} green colors={colors} />
            <DocRow label="Average Trip Cost" value={R(sm.average_trip)} colors={colors} />
          </DocSection>

          {(d.trips ?? []).length > 0 && (
            <DocSection title={`Trips (${d.trips.length})`} colors={colors}>
              {d.trips.map((t: any, i: number) => (
                <TripRow key={i} driver={t.driver} date={t.date} amount={t.amount} colors={colors} />
              ))}
            </DocSection>
          )}

          {(d.topups ?? []).length > 0 && (
            <DocSection title={`Wallet Top-Ups (${d.topups.length})`} colors={colors}>
              {d.topups.map((t: any, i: number) => (
                <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border + "44" }}>
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>{String(t.date ?? "").slice(0, 10)}</Text>
                  <Text style={{ color: colors.green, fontSize: 13, fontWeight: "800" }}>+{R(t.amount)}</Text>
                </View>
              ))}
            </DocSection>
          )}

          {(content as any).ref && (
            <DocSection title="Document Details" colors={colors}>
              <DocRow label="Reference" value={(content as any).ref} mono colors={colors} />
              <DocRow label="Issued By" value="Tag n Ride Pty Ltd" colors={colors} />
            </DocSection>
          )}
        </>
      );
    }

    // ── Owner fleet statement ─────────────────────────────────
    if (content.type === "owner") {
      const d = content.data;
      const sm = d.summary ?? {};
      return (
        <>
          <DocSection title="Fleet Owner" colors={colors}>
            {(d.business_name || d.owner_name) && <DocRow label="Owner / Business" value={d.business_name || d.owner_name} bold colors={colors} />}
            <DocRow label="Period" value={`${d.period_start ?? ""} – ${d.period_end ?? ""}`} colors={colors} />
          </DocSection>

          <DocSection title="Earnings Summary" colors={colors}>
            <DocRow label="Cashup Received from Drivers" value={R(sm.total_cashup_received)} green colors={colors} />
            <DocRow label="Fuel Deducted" value={`-${R(sm.total_fuel_deducted)}`} red colors={colors} />
            <DocRow label="Driver Profit Paid Out" value={`-${R(sm.total_driver_profit)}`} colors={colors} />
            <DocRow label="Subscription Fees" value={`-${R(sm.subscription_fees_paid)}`} red colors={colors} />
            <DocRow label="Withdrawals / Payouts" value={`-${R(sm.total_payouts)}`} colors={colors} />
            <DocRow label="Net Earnings" value={R(sm.net_earnings)} green={sm.net_earnings >= 0} red={sm.net_earnings < 0} bold colors={colors} />
          </DocSection>

          {(d.drivers ?? []).length > 0 && (
            <DocSection title={`Fleet — ${d.drivers.length} Drivers`} colors={colors}>
              {d.drivers.map((dr: any, i: number) => (
                <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border + "44" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>{dr.name}</Text>
                    <Text style={{ color: colors.textDim, fontSize: 11, marginTop: 1 }}>{dr.vehicle_plate || "No plate"} · {dr.payment_mode === "commission_split" ? `${dr.commission_pct}% comm.` : "Daily target"}</Text>
                  </View>
                  <Text style={{ color: colors.green, fontSize: 13, fontWeight: "800" }}>{R(dr.total_earnings)}</Text>
                </View>
              ))}
            </DocSection>
          )}

          {(d.cashup_records ?? []).length > 0 && (
            <DocSection title="Cashup Records" colors={colors}>
              {d.cashup_records.map((r: any, i: number) => (
                <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border + "44" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>{r.driver}</Text>
                    <Text style={{ color: colors.textDim, fontSize: 11, marginTop: 1 }}>{String(r.date ?? "").slice(0, 10)}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ color: colors.green, fontSize: 13, fontWeight: "800" }}>{R(r.owner_received)}</Text>
                    <Text style={{ color: colors.textDim, fontSize: 10, marginTop: 1 }}>earned {R(r.earned)}</Text>
                  </View>
                </View>
              ))}
            </DocSection>
          )}

          {(content as any).ref && (
            <DocSection title="Document Details" colors={colors}>
              <DocRow label="Reference" value={(content as any).ref} mono colors={colors} />
              <DocRow label="Issued By" value="Tag n Ride Pty Ltd" colors={colors} />
            </DocSection>
          )}
        </>
      );
    }

    return null;
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} edges={["top"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.bg2, borderColor: colors.border }]}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            {doc?.title ?? "Document"}
          </Text>
          {doc?.period_label ? (
            <Text style={[styles.headerSub, { color: colors.textMuted }]}>{doc.period_label}</Text>
          ) : null}
        </View>
        {content && (
          <TouchableOpacity
            style={[styles.dlBtn, { backgroundColor: colors.cyan }]}
            onPress={handleDownload}
            disabled={downloading}>
            {downloading
              ? <ActivityIndicator color={colors.bg} size="small" />
              : <Ionicons name="download-outline" size={18} color={colors.bg} />}
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.cyan} size="large" />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading document…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.red} />
          <Text style={[styles.errorText, { color: colors.red }]}>{error}</Text>
          <TouchableOpacity onPress={() => router.back()} style={[styles.retryBtn, { borderColor: colors.border }]}>
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>Go back</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Document header card */}
          <View style={[styles.docHeader, { backgroundColor: colors.bg2, borderColor: colors.border }]}>
            <View style={[styles.docIconWrap, { backgroundColor: colors.cyanDim, borderColor: colors.cyan + "40" }]}>
              <Ionicons name={doc?.document_type === "payslip" ? "shield-checkmark-outline" : "document-text-outline"} size={28} color={colors.cyan} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.docTitle, { color: colors.text }]}>{doc?.title ?? "Document"}</Text>
              {doc?.reference_number && (
                <Text style={[styles.docRef, { color: colors.cyan }]}>{doc.reference_number}</Text>
              )}
              <Text style={[styles.docDate, { color: colors.textDim }]}>
                {doc?.created_at ? new Date(doc.created_at).toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" }) : ""}
              </Text>
            </View>
          </View>

          {renderContent()}

          {/* Download footer */}
          {content && (
            <TouchableOpacity
              style={[styles.downloadFooterBtn, { backgroundColor: colors.cyan }]}
              onPress={handleDownload}
              disabled={downloading}>
              {downloading ? (
                <ActivityIndicator color={colors.bg} />
              ) : (
                <>
                  <Ionicons name="download-outline" size={20} color={colors.bg} />
                  <Text style={[styles.downloadFooterText, { color: colors.bg }]}>Download / Print PDF</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          <Text style={[styles.footer, { color: colors.textDim }]}>Tag n Ride Pty Ltd · Official document</Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12, borderBottomWidth: 1 },
  backBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  headerTitle: { fontSize: 16, fontWeight: "800" },
  headerSub: { fontSize: 11, marginTop: 1 },
  dlBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, paddingBottom: 48 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  loadingText: { fontSize: 14, marginTop: 8 },
  errorText: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  retryBtn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  docHeader: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 14, borderWidth: 1, marginBottom: 20 },
  docIconWrap: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  docTitle: { fontSize: 16, fontWeight: "800", marginBottom: 3 },
  docRef: { fontSize: 11, fontFamily: "monospace", marginBottom: 3 },
  docDate: { fontSize: 11 },
  badge: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, marginBottom: 16 },
  badgeText: { fontSize: 12, fontWeight: "700" },
  downloadFooterBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, borderRadius: 14, marginTop: 8, marginBottom: 16 },
  downloadFooterText: { fontSize: 16, fontWeight: "800" },
  footer: { textAlign: "center", fontSize: 11, marginTop: 4 },
});
