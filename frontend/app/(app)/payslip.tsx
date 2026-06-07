import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, Share,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useTheme } from "../../src/ThemeContext";
import { api } from "../../src/api";
import { useAuth } from "../../src/AuthContext";
import { radius } from "../../src/theme";

const PERIOD_TYPES = [
  { key: "1month", label: "1 Month", months: 1 },
  { key: "3months", label: "3 Months", months: 3 },
  { key: "6months", label: "6 Months", months: 6 },
  { key: "12months", label: "12 Months", months: 12 },
] as const;

const MONTH_FULL = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function formatR(val: number) {
  return `R ${val.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function getPeriodRange(periodType: string, year: number, month: number) {
  const months = PERIOD_TYPES.find((p) => p.key === periodType)?.months ?? 1;
  let startM = month - (months - 1);
  let startY = year;
  while (startM <= 0) { startM += 12; startY -= 1; }
  if (months === 1) return `${MONTH_FULL[month - 1]} ${year}`;
  return `${MONTH_FULL[startM - 1]} ${startY} – ${MONTH_FULL[month - 1]} ${year}`;
}

function monthStr(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function buildStatementPDF(p: any): string {
  const showOwner = (p.owner_payouts ?? 0) > 0;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #222; background: #fff; padding: 32px; }
  .header { text-align: center; padding-bottom: 20px; border-bottom: 3px solid #00D4FF; margin-bottom: 24px; }
  .brand { font-size: 28px; font-weight: 900; color: #00D4FF; letter-spacing: 2px; }
  .doc-title { font-size: 14px; font-weight: 700; color: #444; margin-top: 6px; letter-spacing: 1px; }
  .doc-meta { color: #888; font-size: 11px; margin-top: 6px; }
  .section { background: #f5f5f5; border-radius: 10px; padding: 16px; margin-bottom: 18px; }
  .section-title { font-size: 11px; font-weight: 800; letter-spacing: 1.2px; color: #888; text-transform: uppercase; margin-bottom: 10px; }
  .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e5e5e5; }
  .row:last-child { border-bottom: none; }
  .label { color: #555; }
  .value { font-weight: 700; }
  .red { color: #e53e3e; }
  .orange { color: #dd6b20; }
  .net-box { background: #e6faff; border: 2px solid #00D4FF; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 18px; }
  .net-label { font-size: 13px; font-weight: 800; color: #00D4FF; letter-spacing: 1px; text-transform: uppercase; }
  .net-amount { font-size: 36px; font-weight: 900; color: #00D4FF; margin-top: 6px; }
  .perf { display: flex; justify-content: space-around; background: #f5f5f5; border-radius: 10px; padding: 16px; margin-bottom: 18px; text-align: center; }
  .perf-val { font-size: 20px; font-weight: 800; color: #222; }
  .perf-lbl { font-size: 10px; color: #888; margin-top: 4px; }
  .footer { text-align: center; color: #aaa; font-size: 10px; border-top: 1px solid #e5e5e5; padding-top: 16px; margin-top: 8px; line-height: 1.8; }
</style>
</head>
<body>
<div class="header">
  <div class="brand">TAG N RIDE</div>
  <div class="doc-title">EARNINGS STATEMENT</div>
  <div class="doc-meta">${p.period_label} &nbsp;·&nbsp; Generated ${new Date(p.created_at).toLocaleDateString("en-ZA")}</div>
</div>
<div class="section">
  <div class="section-title">Driver Information</div>
  <div class="row"><span class="label">Name</span><span class="value">${p.driver_name ?? ""}</span></div>
  <div class="row"><span class="label">Phone</span><span class="value">${p.driver_phone ?? ""}</span></div>
  ${p.vehicle_plate ? `<div class="row"><span class="label">Vehicle Plate</span><span class="value">${p.vehicle_plate}</span></div>` : ""}
  <div class="row"><span class="label">Statement Period</span><span class="value">${p.period_label}</span></div>
</div>
<div class="section">
  <div class="section-title">Earnings Breakdown</div>
  <div class="row"><span class="label">Gross Fare Collected</span><span class="value">${formatR(p.gross_earnings)}</span></div>
  <div class="row"><span class="label">Platform Fee (3%)</span><span class="value red">− ${formatR(p.platform_fee)}</span></div>
  <div class="row"><span class="label">Total Net</span><span class="value">${formatR(p.total_net)}</span></div>
  ${showOwner ? `<div class="row"><span class="label">Owner Payout</span><span class="value orange">− ${formatR(p.owner_payouts)}</span></div>` : ""}
</div>
<div class="net-box">
  <div class="net-label">Your Net Earnings</div>
  <div class="net-amount">${formatR(p.driver_net_earnings)}</div>
</div>
<div class="section">
  <div class="section-title">Wallet Activity</div>
  <div class="row"><span class="label">Total Cashed to Your Bank</span><span class="value">${formatR(p.driver_cashups_self)}</span></div>
  <div class="row"><span class="label">Remaining Wallet Balance</span><span class="value">${formatR(p.wallet_balance_at_generation)}</span></div>
</div>
<div class="perf">
  <div><div class="perf-val">${p.total_trips}</div><div class="perf-lbl">Total Trips</div></div>
  <div><div class="perf-val" style="color:#00D4FF">${(p.rating_avg ?? 0).toFixed(1)} ★</div><div class="perf-lbl">Avg Rating</div></div>
  <div><div class="perf-val">${p.rating_count}</div><div class="perf-lbl">Total Reviews</div></div>
</div>
<div class="footer">
  <strong>Tag n Ride Pty Ltd</strong><br />
  Pretoria, Gauteng, South Africa &nbsp;·&nbsp; support@tagnride.com<br />
  This document is issued by Tag n Ride Pty Ltd.<br />
  Disclaimer: This is a privately generated earnings statement for personal use.
</div>
</body>
</html>`;
}

export function buildFormalPayslipPDF(p: any): string {
  const refUrl = `https://tagnride.com/verify?ref=${encodeURIComponent(p.reference_number)}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(refUrl)}`;
  const showOwner = (p.owner_payouts ?? 0) > 0;
  const issueDate = new Date(p.created_at).toLocaleDateString("en-ZA");
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #222; background: #fff; }
  .top-bar { background: #00D4FF; height: 8px; width: 100%; }
  .bottom-bar { background: #00D4FF; height: 8px; width: 100%; margin-top: 24px; }
  .content { padding: 28px 32px; }
  .company-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 2px solid #e5e5e5; padding-bottom: 20px; }
  .brand { font-size: 26px; font-weight: 900; color: #00D4FF; letter-spacing: 2px; }
  .company-sub { font-size: 11px; color: #666; margin-top: 4px; line-height: 1.7; }
  .payslip-badge { background: #111; color: #fff; font-size: 12px; font-weight: 800; padding: 8px 16px; border-radius: 6px; letter-spacing: 1px; text-align: center; }
  .issued { font-size: 10px; color: #888; margin-top: 6px; text-align: right; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; margin-bottom: 20px; }
  .cell { padding: 10px 14px; border-bottom: 1px solid #eee; border-right: 1px solid #eee; }
  .cell:nth-child(even) { border-right: none; }
  .cell-label { font-size: 10px; color: #888; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 3px; }
  .cell-value { font-size: 13px; font-weight: 700; color: #111; }
  .section-title { font-size: 11px; font-weight: 800; letter-spacing: 1.2px; color: #888; text-transform: uppercase; margin-bottom: 10px; margin-top: 18px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  th { background: #f5f5f5; padding: 8px 12px; font-size: 11px; font-weight: 700; color: #666; text-align: left; border-bottom: 1px solid #ddd; }
  td { padding: 8px 12px; font-size: 12px; border-bottom: 1px solid #eee; }
  td:last-child { text-align: right; font-weight: 700; }
  .red { color: #e53e3e; }
  .orange { color: #dd6b20; }
  .net-row { background: #00D4FF; color: #fff; }
  .net-row td { color: #fff; font-weight: 900; font-size: 14px; border-bottom: none; }
  .bank-box { border: 2px solid #00D4FF; border-radius: 10px; display: flex; justify-content: space-between; padding: 16px 20px; margin-top: 16px; margin-bottom: 16px; }
  .bank-label { font-size: 10px; color: #888; font-weight: 700; text-transform: uppercase; margin-bottom: 4px; }
  .bank-val { font-size: 18px; font-weight: 900; color: #00D4FF; }
  .bank-val-gray { font-size: 18px; font-weight: 900; color: #333; }
  .perf { display: flex; justify-content: space-around; background: #f5f5f5; border-radius: 10px; padding: 16px; margin-bottom: 16px; text-align: center; }
  .perf-val { font-size: 20px; font-weight: 800; color: #222; }
  .perf-lbl { font-size: 10px; color: #888; margin-top: 4px; }
  .verify-box { border: 2px solid #00D4FF; border-radius: 10px; padding: 16px; display: flex; gap: 16px; align-items: flex-start; margin-bottom: 16px; }
  .ref { font-family: monospace; font-size: 12px; font-weight: 700; color: #222; }
  .verify-url { color: #00D4FF; font-size: 11px; margin-top: 4px; word-break: break-all; }
  .verify-note { color: #888; font-size: 10px; margin-top: 6px; }
  .stamp { border: 3px solid #00D4FF; border-radius: 50%; width: 90px; height: 90px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; margin: 0 auto 16px; }
  .stamp-text { font-size: 9px; font-weight: 900; color: #00D4FF; letter-spacing: 0.5px; line-height: 1.4; }
  .footer { text-align: center; color: #aaa; font-size: 10px; border-top: 1px solid #e5e5e5; padding-top: 14px; margin-top: 8px; line-height: 1.9; }
</style>
</head>
<body>
<div class="top-bar"></div>
<div class="content">

<div class="company-header">
  <div>
    <div class="brand">TAG N RIDE</div>
    <div class="company-sub">
      Tag n Ride Pty Ltd<br />
      Pretoria, Gauteng, South Africa<br />
      support@tagnride.com
    </div>
  </div>
  <div>
    <div class="payslip-badge">DRIVER PAYSLIP</div>
    <div class="issued">Issued: ${issueDate}</div>
  </div>
</div>

<div class="grid">
  <div class="cell"><div class="cell-label">Employee Name</div><div class="cell-value">${p.driver_name ?? ""}</div></div>
  <div class="cell"><div class="cell-label">Pay Period</div><div class="cell-value">${p.period_label}</div></div>
  <div class="cell"><div class="cell-label">ID Number</div><div class="cell-value">${p.id_number || "—"}</div></div>
  <div class="cell"><div class="cell-label">Pay Date</div><div class="cell-value">${issueDate}</div></div>
  <div class="cell"><div class="cell-label">Phone Number</div><div class="cell-value">${p.driver_phone ?? ""}</div></div>
  <div class="cell"><div class="cell-label">Vehicle Plate</div><div class="cell-value">${p.vehicle_plate || "—"}</div></div>
  <div class="cell"><div class="cell-label">Period Start</div><div class="cell-value">${new Date(p.period_start).toLocaleDateString("en-ZA")}</div></div>
  <div class="cell"><div class="cell-label">Period End</div><div class="cell-value">${new Date(p.period_end).toLocaleDateString("en-ZA")}</div></div>
</div>

<div class="section-title">Earnings</div>
<table>
  <tr><th>Description</th><th style="text-align:right">Amount</th></tr>
  <tr><td>Gross Fare Collected from Passengers</td><td>${formatR(p.gross_earnings)}</td></tr>
</table>

<div class="section-title">Deductions</div>
<table>
  <tr><th>Description</th><th style="text-align:right">Amount</th></tr>
  <tr><td>Platform Service Fee (3%)</td><td class="red">− ${formatR(p.platform_fee)}</td></tr>
  ${showOwner ? `<tr><td>Owner Payout</td><td class="orange">− ${formatR(p.owner_payouts)}</td></tr>` : ""}
  <tr><td>Payslip Generation Fee</td><td class="red">− ${formatR(p.fee_charged)}</td></tr>
  <tr class="net-row"><td>NET PAY — Driver Take-Home</td><td>${formatR(p.driver_net_earnings)}</td></tr>
</table>

<div class="bank-box">
  <div>
    <div class="bank-label">Total Paid to Your Bank Account</div>
    <div class="bank-val">${formatR(p.driver_cashups_self)}</div>
  </div>
  <div>
    <div class="bank-label">Remaining Wallet Balance</div>
    <div class="bank-val-gray">${formatR(p.wallet_balance_at_generation)}</div>
  </div>
</div>

<div class="perf">
  <div><div class="perf-val">${p.total_trips}</div><div class="perf-lbl">Total Trips</div></div>
  <div><div class="perf-val" style="color:#00D4FF">${(p.rating_avg ?? 0).toFixed(1)} ★</div><div class="perf-lbl">Avg Rating</div></div>
  <div><div class="perf-val">${p.rating_count}</div><div class="perf-lbl">Total Reviews</div></div>
</div>

<div class="verify-box">
  <img src="${qrUrl}" width="80" height="80" style="border-radius:6px;flex-shrink:0;" />
  <div>
    <div class="section-title" style="margin-top:0;margin-bottom:4px;">Verification</div>
    <div class="ref">${p.reference_number}</div>
    <div class="verify-url">tagnride.com/verify?ref=${p.reference_number}</div>
    <div class="verify-note">Scan QR or visit URL to verify this payslip is genuine</div>
  </div>
</div>

<div class="stamp">
  <div class="stamp-text">DIGITALLY<br/>VERIFIED<br/>TAG N RIDE</div>
</div>

<div class="footer">
  This payslip is an official earnings document issued by Tag n Ride Pty Ltd.<br />
  It may be used as proof of income for credit, loan, and financial applications.<br />
  For verification contact support@tagnride.com
</div>
</div>
<div class="bottom-bar"></div>
</body>
</html>`;
}

export default function PayslipScreen() {
  const { colors } = useTheme();
  const { state } = useAuth();
  const router = useRouter();
  const s = makeStyles(colors);
  const docsRef = useRef<ScrollView>(null);

  const now = new Date();

  // Statement state
  const [stmtPeriod, setStmtPeriod] = useState("1month");
  const [stmtYear, setStmtYear] = useState(now.getFullYear());
  const [stmtMonth, setStmtMonth] = useState(now.getMonth() + 1);
  const [stmtPricing, setStmtPricing] = useState<any>(null);
  const [loadingStmtPricing, setLoadingStmtPricing] = useState(true);
  const [generatingStmt, setGeneratingStmt] = useState(false);

  // Formal payslip state
  const [frmPeriod, setFrmPeriod] = useState("1month");
  const [frmYear, setFrmYear] = useState(now.getFullYear());
  const [frmMonth, setFrmMonth] = useState(now.getMonth() + 1);
  const [frmPricing, setFrmPricing] = useState<any>(null);
  const [loadingFrmPricing, setLoadingFrmPricing] = useState(true);
  const [generatingFrm, setGeneratingFrm] = useState(false);

  // Shared state
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [walletBalance, setWalletBalance] = useState(0);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    if (state.status === "authed" && state.user.role !== "driver") {
      router.replace("/(app)/home");
    }
  }, [state.status]);

  const loadAll = useCallback(async () => {
    setLoadingStmtPricing(true);
    setLoadingFrmPricing(true);
    setLoadingHistory(true);
    try {
      const [sp, fp, hist, w] = await Promise.all([
        api.payslipPricing().catch(() => null),
        api.formalPayslipPricing().catch(() => null),
        api.payslipHistory().catch(() => []),
        api.wallet().catch(() => null),
      ]);
      setStmtPricing(sp);
      setFrmPricing(fp);
      setHistory(hist as any[]);
      if (w) setWalletBalance(w.balance);
    } finally {
      setLoadingStmtPricing(false);
      setLoadingFrmPricing(false);
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, []);

  const getFee = (pricing: any, period: string) => {
    if (!pricing) return 0;
    const map: Record<string, number> = {
      "1month": pricing.fee_1month,
      "3months": pricing.fee_3months,
      "6months": pricing.fee_6months,
      "12months": pricing.fee_12months,
    };
    return map[period] ?? 0;
  };

  const shiftMonth = (dir: number, year: number, month: number, setYear: (y: number) => void, setMonth: (m: number) => void) => {
    let m = month + dir;
    let y = year;
    if (m > 12) { m = 1; y += 1; }
    if (m < 1) { m = 12; y -= 1; }
    setMonth(m); setYear(y);
  };

  const handleGenerateStatement = () => {
    const fee = getFee(stmtPricing, stmtPeriod);
    const period = getPeriodRange(stmtPeriod, stmtYear, stmtMonth);
    Alert.alert(
      "Generate Earnings Statement?",
      `Generate ${period} Earnings Statement?\n${formatR(fee)} will be deducted from your wallet.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Generate", onPress: doGenerateStatement },
      ]
    );
  };

  const doGenerateStatement = async () => {
    setGeneratingStmt(true);
    try {
      // Always re-fetch pricing + wallet — never trust cached values for a paid action
      const [fresh, freshWallet] = await Promise.all([
        api.payslipPricing(),
        api.wallet().catch(() => null),
      ]);

      if (!fresh?.enabled) {
        Alert.alert("Unavailable", "Earnings statements are currently disabled by admin.");
        return;
      }

      const fee = getFee(fresh, stmtPeriod);
      if (fee <= 0) {
        Alert.alert("Pricing Error", "Statement pricing has not been configured. Please contact support.");
        return;
      }

      const balance = freshWallet?.balance ?? walletBalance;
      if (freshWallet) setWalletBalance(freshWallet.balance);

      if (balance < fee) {
        Alert.alert(
          "Insufficient Balance",
          `You need ${formatR(fee)} to generate this statement.\n\nYour balance: ${formatR(balance)}\n\nPlease top up your wallet first.`
        );
        return;
      }

      const newEntry = await api.payslipRequest({
        period_type: stmtPeriod,
        month: monthStr(stmtYear, stmtMonth),
      });
      await loadAll();
      Alert.alert("Ready ✓", "Your document is ready. View it in My Documents.", [
        { text: "View Documents", onPress: () => router.push("/(app)/documents") },
        { text: "OK", style: "cancel" },
      ]);
      const idToFetch = newEntry?.id ?? newEntry?.payslip_id;
      if (idToFetch) {
        const data = await api.payslipGet(idToFetch);
        const html = buildStatementPDF(data);
        const { uri } = await Print.printToFileAsync({ html, base64: false });
        const safePeriod = (data.period_label || "Statement").replace(/[^a-zA-Z0-9]/g, "-");
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: `TagNRide-Statement-${safePeriod}.pdf`,
          UTI: "com.adobe.pdf",
        });
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to generate statement.");
    } finally { setGeneratingStmt(false); }
  };

  const handleGenerateFormal = () => {
    const fee = getFee(frmPricing, frmPeriod);
    const period = getPeriodRange(frmPeriod, frmYear, frmMonth);
    Alert.alert(
      "Generate Formal Payslip?",
      `Generate ${period} Formal Payslip?\n${formatR(fee)} will be deducted from your wallet.\n\nThis document is publicly verifiable at tagnride.com/verify`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Generate", onPress: doGenerateFormal },
      ]
    );
  };

  const doGenerateFormal = async () => {
    setGeneratingFrm(true);
    try {
      // Always re-fetch pricing + wallet — never trust cached values for a paid action
      const [fresh, freshWallet] = await Promise.all([
        api.formalPayslipPricing(),
        api.wallet().catch(() => null),
      ]);

      if (!fresh?.enabled) {
        Alert.alert("Unavailable", "Formal payslips are currently disabled by admin.");
        return;
      }

      const fee = getFee(fresh, frmPeriod);
      if (fee <= 0) {
        Alert.alert("Pricing Error", "Payslip pricing has not been configured. Please contact support.");
        return;
      }

      const balance = freshWallet?.balance ?? walletBalance;
      if (freshWallet) setWalletBalance(freshWallet.balance);

      if (balance < fee) {
        Alert.alert(
          "Insufficient Balance",
          `You need ${formatR(fee)} to generate this payslip.\n\nYour balance: ${formatR(balance)}\n\nPlease top up your wallet first.`
        );
        return;
      }

      const newEntry = await api.formalPayslipRequest({
        period_type: frmPeriod,
        month: monthStr(frmYear, frmMonth),
      });
      await loadAll();
      Alert.alert("Ready ✓", "Your document is ready. View it in My Documents.", [
        { text: "View Documents", onPress: () => router.push("/(app)/documents") },
        { text: "OK", style: "cancel" },
      ]);
      const idToFetch = newEntry?.id ?? newEntry?.payslip_id;
      if (idToFetch) {
        const data = await api.payslipGet(idToFetch);
        const html = buildFormalPayslipPDF(data);
        const { uri } = await Print.printToFileAsync({ html, base64: false });
        const safePeriod = (data.period_label || "Payslip").replace(/[^a-zA-Z0-9]/g, "-");
        const safeName = (data.driver_name || "Driver").replace(/[^a-zA-Z0-9]/g, "-");
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: `TagNRide-Payslip-${safePeriod}-${safeName}.pdf`,
          UTI: "com.adobe.pdf",
        });
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to generate payslip.");
    } finally { setGeneratingFrm(false); }
  };

  const handleDownload = async (item: any) => {
    setDownloadingId(item.id);
    try {
      const data = await api.payslipGet(item.id);
      const isPayslip = (data.document_type ?? item.document_type) === "payslip";
      const html = isPayslip ? buildFormalPayslipPDF(data) : buildStatementPDF(data);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const safePeriod = (data.period_label || "Doc").replace(/[^a-zA-Z0-9]/g, "-");
      const safeName = (data.driver_name || "Driver").replace(/[^a-zA-Z0-9]/g, "-");
      const fileName = isPayslip
        ? `TagNRide-Payslip-${safePeriod}-${safeName}.pdf`
        : `TagNRide-Statement-${safePeriod}.pdf`;
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: fileName,
        UTI: "com.adobe.pdf",
      });
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not generate PDF.");
    } finally { setDownloadingId(null); }
  };

  const handleShare = async (item: any) => {
    if (item.document_type === "payslip" && item.reference_number) {
      const url = `https://tagnride.com/verify?ref=${encodeURIComponent(item.reference_number)}`;
      try {
        await Share.share({ message: `View my payslip: ${url}`, url });
      } catch {}
    } else {
      handleDownload(item);
    }
  };

  const handleDelete = (id: string, label: string) => {
    Alert.alert(
      "Remove Document?",
      `This will remove the document for ${label}. The fee is non-refundable.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: async () => {
          try {
            await api.payslipDelete(id);
            setHistory((h) => h.filter((p) => p.id !== id));
          } catch (e: any) {
            Alert.alert("Error", e?.message || "Could not delete.");
          }
        }},
      ]
    );
  };

  if (state.status !== "authed") return null;

  const stmtFee = getFee(stmtPricing, stmtPeriod);
  const frmFee = getFee(frmPricing, frmPeriod);

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <ScrollView ref={docsRef} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>

        <TouchableOpacity onPress={() => router.back()} style={s.backRow}>
          <Ionicons name="arrow-back" size={20} color={colors.cyan} />
          <Text style={s.backText}>Back</Text>
        </TouchableOpacity>

        <Text style={s.title}>Earnings Documents</Text>
        <Text style={s.subtitle}>Request statements and formal payslips for bank applications</Text>

        {/* ── EARNINGS STATEMENT CARD ── */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <View style={[s.cardIconWrap, { backgroundColor: colors.cyanDim }]}>
              <Ionicons name="document-text-outline" size={20} color={colors.cyan} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>Earnings Statement</Text>
              <Text style={s.cardSub}>Personal earnings summary for your records</Text>
            </View>
            <View style={s.priceBadge}>
              <Text style={s.priceBadgeText}>
                from {stmtPricing ? formatR(stmtPricing.fee_1month) : "..."}
              </Text>
            </View>
          </View>

          {loadingStmtPricing ? (
            <ActivityIndicator color={colors.cyan} style={{ marginVertical: 20 }} />
          ) : !stmtPricing?.enabled ? (
            <View style={s.disabledBox}>
              <Ionicons name="close-circle-outline" size={18} color={colors.textMuted} />
              <Text style={s.disabledText}>Earnings statements are currently unavailable.</Text>
            </View>
          ) : (
            <>
              <Text style={s.sectionLabel}>STATEMENT PERIOD</Text>
              <View style={s.periodRow}>
                {PERIOD_TYPES.map((pt) => {
                  const feeMap: Record<string, number> = {
                    "1month": stmtPricing.fee_1month,
                    "3months": stmtPricing.fee_3months,
                    "6months": stmtPricing.fee_6months,
                    "12months": stmtPricing.fee_12months,
                  };
                  const active = stmtPeriod === pt.key;
                  return (
                    <TouchableOpacity
                      key={pt.key}
                      style={[s.periodBtn, active && s.periodBtnActiveCyan]}
                      onPress={() => setStmtPeriod(pt.key)}
                    >
                      <Text style={[s.periodBtnLabel, active && { color: colors.cyan }]}>{pt.label}</Text>
                      <Text style={[s.periodBtnFee, active && { color: colors.cyan }]}>{formatR(feeMap[pt.key])}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={s.sectionLabel}>SELECT MONTH</Text>
              <View style={s.monthRow}>
                <TouchableOpacity style={s.arrowBtn} onPress={() => shiftMonth(-1, stmtYear, stmtMonth, setStmtYear, setStmtMonth)}>
                  <Ionicons name="chevron-back" size={20} color={colors.cyan} />
                </TouchableOpacity>
                <View style={s.monthCenter}>
                  <Text style={s.monthMain}>{MONTH_FULL[stmtMonth - 1]} {stmtYear}</Text>
                  {stmtPeriod !== "1month" && (
                    <Text style={s.monthRange}>{getPeriodRange(stmtPeriod, stmtYear, stmtMonth)}</Text>
                  )}
                </View>
                <TouchableOpacity style={s.arrowBtn} onPress={() => shiftMonth(1, stmtYear, stmtMonth, setStmtYear, setStmtMonth)}>
                  <Ionicons name="chevron-forward" size={20} color={colors.cyan} />
                </TouchableOpacity>
              </View>

              <View style={s.feeInfo}>
                <View style={s.feeRow}>
                  <Text style={s.feeLabel}>Wallet Balance</Text>
                  <Text style={[s.feeValue, { color: walletBalance >= stmtFee ? colors.green : colors.red }]}>{formatR(walletBalance)}</Text>
                </View>
                <View style={s.feeRow}>
                  <Text style={s.feeLabel}>Statement Fee</Text>
                  <Text style={[s.feeValue, { color: colors.cyan }]}>{formatR(stmtFee)}</Text>
                </View>
              </View>

              <TouchableOpacity
                style={[s.generateBtnCyan, generatingStmt && { opacity: 0.6 }]}
                onPress={handleGenerateStatement}
                disabled={generatingStmt}
              >
                {generatingStmt ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="download-outline" size={18} color="#fff" />
                    <Text style={s.generateBtnText}>
                      Generate Statement — {formatR(stmtFee)}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ── FORMAL PAYSLIP CARD ── */}
        <View style={[s.card, { borderColor: "#22c55e", borderWidth: 1.5 }]}>
          <View style={s.cardHeader}>
            <View style={[s.cardIconWrap, { backgroundColor: "#22c55e20" }]}>
              <Ionicons name="shield-checkmark" size={20} color="#22c55e" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={s.cardTitle}>Formal Payslip</Text>
                <View style={s.bankBadge}>
                  <Text style={s.bankBadgeText}>BANK VERIFIED</Text>
                </View>
              </View>
              <Text style={s.cardSub}>Bank-grade document with public QR verification</Text>
            </View>
          </View>

          {loadingFrmPricing ? (
            <ActivityIndicator color="#22c55e" style={{ marginVertical: 20 }} />
          ) : !frmPricing?.enabled ? (
            <View style={s.disabledBox}>
              <Ionicons name="close-circle-outline" size={18} color={colors.textMuted} />
              <Text style={s.disabledText}>Formal payslip feature is currently unavailable.</Text>
            </View>
          ) : (
            <>
              <Text style={s.sectionLabel}>PAYSLIP PERIOD</Text>
              <View style={s.periodRow}>
                {PERIOD_TYPES.map((pt) => {
                  const feeMap: Record<string, number> = {
                    "1month": frmPricing.fee_1month,
                    "3months": frmPricing.fee_3months,
                    "6months": frmPricing.fee_6months,
                    "12months": frmPricing.fee_12months,
                  };
                  const active = frmPeriod === pt.key;
                  return (
                    <TouchableOpacity
                      key={pt.key}
                      style={[s.periodBtn, active && s.periodBtnActiveGreen]}
                      onPress={() => setFrmPeriod(pt.key)}
                    >
                      <Text style={[s.periodBtnLabel, active && { color: "#22c55e" }]}>{pt.label}</Text>
                      <Text style={[s.periodBtnFee, active && { color: "#22c55e" }]}>{formatR(feeMap[pt.key])}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={s.sectionLabel}>SELECT MONTH</Text>
              <View style={[s.monthRow, { borderColor: "#22c55e40" }]}>
                <TouchableOpacity style={s.arrowBtn} onPress={() => shiftMonth(-1, frmYear, frmMonth, setFrmYear, setFrmMonth)}>
                  <Ionicons name="chevron-back" size={20} color="#22c55e" />
                </TouchableOpacity>
                <View style={s.monthCenter}>
                  <Text style={s.monthMain}>{MONTH_FULL[frmMonth - 1]} {frmYear}</Text>
                  {frmPeriod !== "1month" && (
                    <Text style={s.monthRange}>{getPeriodRange(frmPeriod, frmYear, frmMonth)}</Text>
                  )}
                </View>
                <TouchableOpacity style={s.arrowBtn} onPress={() => shiftMonth(1, frmYear, frmMonth, setFrmYear, setFrmMonth)}>
                  <Ionicons name="chevron-forward" size={20} color="#22c55e" />
                </TouchableOpacity>
              </View>

              <View style={s.feeInfo}>
                <View style={s.feeRow}>
                  <Text style={s.feeLabel}>Wallet Balance</Text>
                  <Text style={[s.feeValue, { color: walletBalance >= frmFee ? colors.green : colors.red }]}>{formatR(walletBalance)}</Text>
                </View>
                <View style={s.feeRow}>
                  <Text style={s.feeLabel}>Payslip Fee</Text>
                  <Text style={[s.feeValue, { color: "#22c55e" }]}>{formatR(frmFee)}</Text>
                </View>
              </View>

              <View style={s.verifyNote}>
                <Ionicons name="information-circle-outline" size={14} color="#22c55e" />
                <Text style={[s.verifyNoteText, { color: "#22c55e" }]}>
                  This payslip can be verified at tagnride.com/verify
                </Text>
              </View>

              <TouchableOpacity
                style={[s.generateBtnGreen, generatingFrm && { opacity: 0.6 }]}
                onPress={handleGenerateFormal}
                disabled={generatingFrm}
              >
                {generatingFrm ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="shield-checkmark" size={18} color="#fff" />
                    <Text style={s.generateBtnText}>
                      Generate Formal Payslip — {formatR(frmFee)}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ── MY DOCUMENTS ── */}
        <Text style={s.section}>MY DOCUMENTS</Text>

        {loadingHistory ? (
          <ActivityIndicator color={colors.cyan} style={{ marginVertical: 16 }} />
        ) : history.length === 0 ? (
          <View style={s.emptyBox}>
            <Ionicons name="document-outline" size={40} color={colors.textDim} />
            <Text style={s.emptyTitle}>No documents yet</Text>
            <Text style={s.emptyText}>
              Request your first earnings statement or formal payslip above.
            </Text>
          </View>
        ) : (
          history.map((item) => {
            const isPayslip = item.document_type === "payslip";
            const accentColor = isPayslip ? "#22c55e" : colors.cyan;
            return (
              <View key={item.id} style={[s.historyCard, { borderLeftColor: accentColor, borderLeftWidth: 3 }]}>
                <View style={s.historyTop}>
                  <View style={[s.historyIconWrap, { backgroundColor: isPayslip ? "#22c55e20" : colors.cyanDim }]}>
                    <Ionicons
                      name={isPayslip ? "shield-checkmark" : "document-text-outline"}
                      size={18}
                      color={accentColor}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.historyPeriod}>{item.period_label}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
                      <View style={[s.typeBadge, { backgroundColor: isPayslip ? "#22c55e20" : colors.cyanDim }]}>
                        <Text style={[s.typeBadgeText, { color: accentColor }]}>
                          {isPayslip ? "FORMAL PAYSLIP" : "STATEMENT"}
                        </Text>
                      </View>
                      {isPayslip && (
                        <View style={s.verifiableBadge}>
                          <Ionicons name="checkmark-circle" size={10} color="#22c55e" />
                          <Text style={s.verifiableBadgeText}>Verifiable</Text>
                        </View>
                      )}
                    </View>
                    <Text style={s.historyDate}>
                      Generated {new Date(item.created_at).toLocaleDateString("en-ZA")}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={s.historyNet}>{formatR(item.driver_net_earnings)}</Text>
                    <Text style={s.historyTrips}>{item.total_trips} trips</Text>
                  </View>
                </View>
                <View style={s.historyActions}>
                  <TouchableOpacity
                    style={[s.actionBtn, { backgroundColor: isPayslip ? "#22c55e15" : colors.cyanDim, borderColor: accentColor + "40" }]}
                    onPress={() => handleDownload(item)}
                    disabled={downloadingId === item.id}
                  >
                    {downloadingId === item.id ? (
                      <ActivityIndicator color={accentColor} size="small" />
                    ) : (
                      <>
                        <Ionicons name="download-outline" size={14} color={accentColor} />
                        <Text style={[s.actionBtnText, { color: accentColor }]}>Download</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.actionBtn, { backgroundColor: colors.bg, borderColor: colors.border }]}
                    onPress={() => handleShare(item)}
                  >
                    <Ionicons name="share-outline" size={14} color={colors.textMuted} />
                    <Text style={[s.actionBtnText, { color: colors.textMuted }]}>Share</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.actionBtn, { backgroundColor: colors.red + "15", borderColor: colors.red + "40" }]}
                    onPress={() => handleDelete(item.id, item.period_label)}
                  >
                    <Ionicons name="trash-outline" size={14} color={colors.red} />
                    <Text style={[s.actionBtnText, { color: colors.red }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  backRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  backText: { color: colors.cyan, fontSize: 15, fontWeight: "600" },
  title: { color: colors.text, fontSize: 24, fontWeight: "900", marginBottom: 6 },
  subtitle: { color: colors.textMuted, fontSize: 13, marginBottom: 20 },
  card: { backgroundColor: colors.bg2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 20, marginBottom: 16 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 18 },
  cardIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  cardSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  priceBadge: { backgroundColor: colors.cyanDim, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: colors.cyan + "40" },
  priceBadgeText: { color: colors.cyan, fontSize: 11, fontWeight: "700" },
  bankBadge: { backgroundColor: "#22c55e20", borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: "#22c55e40" },
  bankBadgeText: { color: "#22c55e", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  section: { color: colors.textMuted, fontSize: 12, fontWeight: "700", letterSpacing: 1.4, marginTop: 8, marginBottom: 12 },
  sectionLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 10 },
  periodRow: { flexDirection: "row", gap: 6, marginBottom: 20 },
  periodBtn: { flex: 1, backgroundColor: colors.bg, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingVertical: 10, alignItems: "center" },
  periodBtnActiveCyan: { backgroundColor: colors.cyanDim, borderColor: colors.cyan },
  periodBtnActiveGreen: { backgroundColor: "#22c55e15", borderColor: "#22c55e" },
  periodBtnLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "800" },
  periodBtnFee: { color: colors.textDim, fontSize: 10, marginTop: 3 },
  monthRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: 16, overflow: "hidden" },
  arrowBtn: { padding: 16 },
  monthCenter: { flex: 1, alignItems: "center", paddingVertical: 10 },
  monthMain: { color: colors.text, fontSize: 16, fontWeight: "800" },
  monthRange: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  feeInfo: { backgroundColor: colors.bg, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 14 },
  feeRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
  feeLabel: { color: colors.textMuted, fontSize: 13 },
  feeValue: { fontSize: 13, fontWeight: "800" },
  verifyNote: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 14 },
  verifyNoteText: { fontSize: 12, fontWeight: "600" },
  generateBtnCyan: { backgroundColor: colors.cyan, borderRadius: radius.md, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  generateBtnGreen: { backgroundColor: "#22c55e", borderRadius: radius.md, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  generateBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  disabledBox: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, backgroundColor: colors.bg, borderRadius: radius.sm },
  disabledText: { color: colors.textMuted, fontSize: 13, flex: 1 },
  emptyBox: { alignItems: "center", padding: 40, backgroundColor: colors.bg2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "700", marginTop: 12 },
  emptyText: { color: colors.textMuted, fontSize: 13, marginTop: 4, textAlign: "center" },
  historyCard: { backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 12 },
  historyTop: { flexDirection: "row", alignItems: "flex-start", marginBottom: 14, gap: 12 },
  historyIconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  historyPeriod: { color: colors.text, fontSize: 15, fontWeight: "800" },
  historyDate: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  typeBadge: { borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  typeBadgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  verifiableBadge: { flexDirection: "row", alignItems: "center", gap: 3 },
  verifiableBadgeText: { color: "#22c55e", fontSize: 10, fontWeight: "700" },
  historyNet: { color: "#22c55e", fontSize: 18, fontWeight: "900" },
  historyTrips: { color: colors.textMuted, fontSize: 11, marginTop: 2, textAlign: "right" },
  historyActions: { flexDirection: "row", gap: 8 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: radius.sm, borderWidth: 1 },
  actionBtnText: { fontSize: 12, fontWeight: "700" },
});
