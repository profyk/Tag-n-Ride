"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Spinner } from "@/components/ui";
import { hasPermission } from "@/lib/api";
import { useRouter } from "next/navigation";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, DollarSign, Wallet, ArrowUpRight, ArrowDownLeft,
  RefreshCw, BookOpen, BarChart2, AlertTriangle, CheckCircle2, Shield,
  Download, FileText, Receipt, Layers, PenLine, Clock,
  Search, RotateCcw, CreditCard, Landmark,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

const BASE = "https://tag-n-ride-production.up.railway.app";
const h = () => ({
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
  "Content-Type": "application/json",
});

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${BASE}${path}`, { headers: h(), ...opts });
  if (!r.ok) {
    const b = await r.json().catch(() => ({}));
    throw new Error(b.detail || `HTTP ${r.status}`);
  }
  return r.json();
}

type Tab = "overview" | "transactions" | "adjustments" | "reconciliation";

const TABS: { id: Tab; label: string; icon: any; perm?: string }[] = [
  { id: "overview",       label: "Overview",       icon: BarChart2 },
  { id: "transactions",   label: "Transactions",   icon: Receipt },
  { id: "adjustments",    label: "Adjustments",    icon: PenLine,       perm: "manual_ledger_adjustment" },
  { id: "reconciliation", label: "Reconciliation", icon: CheckCircle2,  perm: "download_statements" },
];

interface AccCfg { color: string; bg: string; label: string; icon: any; desc: string }
const ACC: Record<string, AccCfg> = {
  user_wallets:              { color: "text-cyan",       bg: "bg-cyan/10",        label: "User Wallets",            icon: Wallet,        desc: "Total balance held by all users" },
  driver_earnings_pending:   { color: "text-yellow",     bg: "bg-yellow/10",      label: "Driver Earnings Pending", icon: Clock,         desc: "Earned but unpaid driver commissions" },
  platform_revenue:          { color: "text-green",      bg: "bg-green/10",       label: "Platform Revenue",        icon: TrendingUp,    desc: "Ride commissions & platform fees" },
  processing_fees_collected: { color: "text-purple",     bg: "bg-purple/10",      label: "Processing Fees",         icon: CreditCard,    desc: "Wallet top-up fee collections" },
  gateway_fees_paid:         { color: "text-red",        bg: "bg-red/10",         label: "Gateway Fees Paid",       icon: TrendingDown,  desc: "Fees paid to Stitch gateway" },
  operations_income:         { color: "text-blue-400",   bg: "bg-blue-400/10",    label: "Operations Income",       icon: Landmark,      desc: "Statement, payslip & SOS fees" },
  withdrawal_settlements:    { color: "text-orange-400", bg: "bg-orange-400/10",  label: "Withdrawal Settlements",  icon: ArrowDownLeft, desc: "Funds settled to driver banks" },
  refund_reserve:            { color: "text-pink-400",   bg: "bg-pink-400/10",    label: "Refund Reserve",          icon: RotateCcw,     desc: "Funds held for pending refunds" },
};

const BAR_COLORS = ["#00D4FF","#FFD60A","#00E676","#A064FF","#FF3B30","#53BDEB","#FF8C42","#FF69B4"];
const TT = {
  contentStyle: { background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 },
  labelStyle:   { color: "var(--text)", fontSize: 11 },
  itemStyle:    { color: "var(--textMuted)", fontSize: 11 },
};

// ── Manual Adjust Form ─────────────────────────────────────────────────────
function AdjustForm({ onDone }: { onDone: () => void }) {
  const [account,   setAccount]   = useState("platform_revenue");
  const [direction, setDirection] = useState<"credit"|"debit">("credit");
  const [amount,    setAmount]    = useState("");
  const [reason,    setReason]    = useState("");
  const [busy,      setBusy]      = useState(false);

  const submit = async () => {
    const a = parseFloat(amount);
    if (!a || a <= 0) return toast.error("Enter a valid amount");
    if (reason.trim().length < 5) return toast.error("Reason must be at least 5 characters");
    setBusy(true);
    try {
      const res = await apiFetch("/api/admin/ledger/adjust", {
        method: "POST",
        body: JSON.stringify({ account, direction, amount: a, reason: reason.trim() }),
      });
      toast.success(`Posted. New ${ACC[account]?.label} balance: ${formatZAR(res.new_balance)}`);
      setAmount(""); setReason("");
      onDone();
    } catch (e: any) { toast.error(e.message || "Failed to post adjustment"); }
    finally { setBusy(false); }
  };

  return (
    <Card className="border-yellow/20">
      <h3 className="text-text font-extrabold text-sm mb-4 flex items-center gap-2">
        <PenLine size={14} className="text-yellow" /> Manual Ledger Adjustment
      </h3>
      <p className="text-textDim text-xs mb-4">
        Double-entry correction for misposted amounts, external transactions, or balance reconciliation.
        Full audit trail is preserved.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5 block">Account</label>
          <select value={account} onChange={e => setAccount(e.target.value)}
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text focus:border-yellow/50 outline-none">
            {Object.entries(ACC).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5 block">Direction</label>
          <div className="flex gap-2">
            {(["credit","debit"] as const).map(d => (
              <button key={d} onClick={() => setDirection(d)}
                className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all capitalize ${
                  direction === d
                    ? d === "credit" ? "bg-green/10 border-green/40 text-green" : "bg-red/10 border-red/40 text-red"
                    : "border-border text-textMuted hover:text-text"
                }`}>{d}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5 block">Amount (ZAR)</label>
          <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g,""))}
            placeholder="0.00" type="number" min="0" step="0.01"
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text focus:border-yellow/50 outline-none" />
        </div>
        <div>
          <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5 block">Reason (min 5 chars)</label>
          <input value={reason} onChange={e => setReason(e.target.value)}
            placeholder="e.g. Correct misposted Stitch fee 2024-06-01"
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text focus:border-yellow/50 outline-none" />
        </div>
      </div>
      <div className="flex justify-end mt-4">
        <button onClick={submit} disabled={busy}
          className="flex items-center gap-2 px-5 py-2.5 bg-yellow/10 border border-yellow/30 text-yellow text-sm font-bold rounded-lg hover:bg-yellow/20 disabled:opacity-50 transition-all">
          {busy ? <Spinner /> : <><PenLine size={13} /> Post Adjustment</>}
        </button>
      </div>
    </Card>
  );
}

// ── Permission wall ────────────────────────────────────────────────────────
function PermWall({ label }: { label: string }) {
  return (
    <Card>
      <div className="flex flex-col items-center py-12 gap-3">
        <Shield size={40} className="text-textDim" />
        <p className="text-text font-bold">{label}</p>
        <p className="text-textMuted text-sm">Contact your administrator to request access.</p>
      </div>
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════
export default function LedgerPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  // Core data
  const [ledger,  setLedger]  = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);

  // Transactions
  const [allTxns,   setAllTxns]   = useState<any[]>([]);
  const [txnAcct,   setTxnAcct]   = useState("");
  const [txnDir,    setTxnDir]    = useState("");
  const [txnSearch, setTxnSearch] = useState("");
  const [txnLimit,  setTxnLimit]  = useState(50);

  // Adjustments / corrections
  const [corrections, setCorrections] = useState<any[]>([]);

  // Reconciliation
  const [reconBatches,    setReconBatches]    = useState<any[]>([]);
  const [discrepancies,   setDiscrepancies]   = useState<any[]>([]);
  const [unresolvedOnly,  setUnresolvedOnly]  = useState(true);

  // Loading flags
  const [loading,      setLoading]      = useState(true);
  const [txnLoading,   setTxnLoading]   = useState(false);
  const [corrLoading,  setCorrLoading]  = useState(false);
  const [reconLoading, setReconLoading] = useState(false);
  const [reconRunning, setReconRunning] = useState(false);

  // Reverse entry modal
  const [reverseEntry,  setReverseEntry]  = useState<any>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [reverseBusy,   setReverseBusy]   = useState(false);

  // Resolve discrepancy modal
  const [resolveDisc, setResolveDisc] = useState<any>(null);
  const [resolveNote, setResolveNote] = useState("");
  const [resolveBusy, setResolveBusy] = useState(false);

  // Auto-refresh countdown
  const [countdown, setCountdown] = useState(60);
  const timerRef = useRef<any>(null);

  // Permissions
  const canAdjust  = hasPermission("manual_ledger_adjustment");
  const canReverse = hasPermission("reverse_ledger_entry");
  const canRecon   = hasPermission("download_statements");
  const visibleTabs = TABS.filter(t => !t.perm || hasPermission(t.perm));

  // ── Load functions ────────────────────────────────────────────────────
  const loadCore = useCallback(async () => {
    setLoading(true);
    try {
      const [l, s] = await Promise.all([
        apiFetch("/api/admin/ledger"),
        apiFetch("/api/admin/ledger/summary"),
      ]);
      setLedger(l); setSummary(s);
    } catch (e: any) { toast.error(e.message || "Failed to load ledger"); }
    finally { setLoading(false); }
  }, []);

  const loadTxns = useCallback(async () => {
    setTxnLoading(true);
    try {
      const p = new URLSearchParams();
      if (txnAcct) p.set("account", txnAcct);
      p.set("limit", String(txnLimit));
      const data = await apiFetch(`/api/admin/ledger/transactions?${p}`);
      setAllTxns(Array.isArray(data) ? data : []);
    } catch (e: any) { toast.error(e.message || "Failed to load transactions"); }
    finally { setTxnLoading(false); }
  }, [txnAcct, txnLimit]);

  const loadCorrections = useCallback(async () => {
    if (!canAdjust) return;
    setCorrLoading(true);
    try {
      const data = await apiFetch("/api/admin/ledger/corrections");
      setCorrections(Array.isArray(data) ? data : []);
    } catch (e: any) { toast.error(e.message || "Failed to load corrections"); }
    finally { setCorrLoading(false); }
  }, [canAdjust]);

  const loadRecon = useCallback(async () => {
    if (!canRecon) return;
    setReconLoading(true);
    try {
      const [batches, discs] = await Promise.all([
        apiFetch("/api/admin/reconciliation/batches"),
        apiFetch(`/api/admin/reconciliation/discrepancies${unresolvedOnly ? "?resolved=false" : ""}`),
      ]);
      setReconBatches(Array.isArray(batches) ? batches : []);
      setDiscrepancies(Array.isArray(discs) ? discs : []);
    } catch (e: any) { toast.error(e.message || "Failed to load reconciliation data"); }
    finally { setReconLoading(false); }
  }, [canRecon, unresolvedOnly]);

  // ── Effects ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hasPermission("view_ledger")) { router.push("/admin/dashboard"); return; }
    loadCore();
  }, []);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown(c => { if (c <= 1) { loadCore(); return 60; } return c - 1; });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [loadCore]);

  useEffect(() => {
    if (activeTab === "transactions") loadTxns();
  }, [activeTab, txnAcct, txnLimit]);

  useEffect(() => {
    if (activeTab === "adjustments") loadCorrections();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "reconciliation") loadRecon();
  }, [activeTab, unresolvedOnly]);

  // ── Derived / computed ─────────────────────────────────────────────────
  const netIncome = summary?.this_month
    ? (summary.this_month.platform_revenue || 0) + (summary.this_month.processing_fees || 0) - (summary.this_month.gateway_fees_paid || 0)
    : 0;

  const totalBalance = ledger?.accounts?.reduce((s: number, a: any) => s + (a.balance || 0), 0) || 0;

  const chartData = Object.entries(ACC).map(([k, v], i) => {
    const acc = ledger?.accounts?.find((a: any) => a.account === k);
    return { name: v.label, value: Math.round((acc?.balance || 0) * 100) / 100, color: BAR_COLORS[i] };
  }).filter(d => d.value !== 0);

  // Client-side filtered transactions
  const transactions = allTxns
    .filter(t => !txnDir    || t.direction === txnDir)
    .filter(t => !txnSearch || [t.description, t.reference_id, t.reference_type]
      .some(f => f?.toLowerCase().includes(txnSearch.toLowerCase())));

  // ── Actions ────────────────────────────────────────────────────────────
  const runReconciliation = async () => {
    setReconRunning(true);
    try {
      const res = await apiFetch("/api/admin/reconciliation/run", { method: "POST" });
      toast.success(
        res.status === "balanced"
          ? `Reconciliation balanced ✓ Variance: ${formatZAR(Math.abs(res.variance))}`
          : `${res.discrepancy_count} discrepancy(ies) found — variance: ${formatZAR(Math.abs(res.variance))}`
      );
      loadRecon();
    } catch (e: any) { toast.error(e.message || "Reconciliation failed"); }
    finally { setReconRunning(false); }
  };

  const submitReverse = async () => {
    if (!reverseEntry) return;
    if (reverseReason.trim().length < 5) return toast.error("Reason must be at least 5 chars");
    setReverseBusy(true);
    try {
      await apiFetch(`/api/admin/ledger/reverse/${reverseEntry.id}`, {
        method: "POST",
        body: JSON.stringify({ reason: reverseReason.trim() }),
      });
      toast.success("Entry reversed and audit trail updated");
      setReverseEntry(null); setReverseReason("");
      loadCorrections(); loadCore(); loadTxns();
    } catch (e: any) { toast.error(e.message || "Reversal failed"); }
    finally { setReverseBusy(false); }
  };

  const submitResolve = async () => {
    if (!resolveDisc || !resolveNote.trim()) return toast.error("Resolution note required");
    setResolveBusy(true);
    try {
      await apiFetch(`/api/admin/reconciliation/discrepancies/${resolveDisc.id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ resolution_note: resolveNote.trim() }),
      });
      toast.success("Discrepancy marked as resolved");
      setResolveDisc(null); setResolveNote("");
      loadRecon();
    } catch (e: any) { toast.error(e.message || "Failed to resolve discrepancy"); }
    finally { setResolveBusy(false); }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  if (loading && !ledger) {
    return <AdminShell title="Platform Ledger"><div className="flex justify-center py-24"><Spinner /></div></AdminShell>;
  }

  return (
    <AdminShell title="Platform Ledger">
      <div className="space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-textMuted text-xs">
            Double-entry accounting ledger · {new Date().toLocaleDateString("en-ZA", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-textDim">Refresh in {countdown}s</span>
            <button onClick={() => { loadCore(); setCountdown(60); }}
              className="text-textDim hover:text-cyan transition-colors" title="Refresh now">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-bg2 border border-border rounded-xl overflow-x-auto">
          {visibleTabs.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                  activeTab === t.id ? "bg-cyanDim text-cyan" : "text-textMuted hover:text-text"
                }`}>
                <Icon size={12} /> {t.label}
              </button>
            );
          })}
        </div>

        {/* ══════════════════════════════════ OVERVIEW ══════════════════════════════════ */}
        {activeTab === "overview" && (
          <>
            {/* Today strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Today Top-Ups",     value: summary?.today?.topups || 0,      color: "text-cyan",   icon: ArrowUpRight },
                { label: "Today Payments",    value: summary?.today?.payments || 0,    color: "text-green",  icon: DollarSign },
                { label: "Today Withdrawals", value: summary?.today?.withdrawals || 0, color: "text-yellow", icon: ArrowDownLeft },
                { label: "Month Net Income",  value: netIncome,                         color: netIncome >= 0 ? "text-green" : "text-red", icon: TrendingUp },
              ].map(s => {
                const Icon = s.icon;
                return (
                  <Card key={s.label}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest">{s.label}</p>
                      <Icon size={13} className={s.color} />
                    </div>
                    <p className={`text-2xl font-extrabold ${s.color} tabular-nums`}>{formatZAR(s.value)}</p>
                  </Card>
                );
              })}
            </div>

            {/* Monthly income + ledger health */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {summary?.this_month && (
                <Card>
                  <h2 className="text-text font-extrabold text-sm mb-5 flex items-center gap-2">
                    <BookOpen size={14} className="text-cyan" /> Monthly Income Statement
                  </h2>
                  <div className="space-y-3">
                    <div className="text-[10px] font-black text-textDim uppercase tracking-widest mb-2">INCOME</div>
                    {[
                      { label: "Platform Revenue",  value: summary.this_month.platform_revenue,  color: "text-green",  note: "Ride commissions & platform fees" },
                      { label: "Processing Fees",   value: summary.this_month.processing_fees,   color: "text-purple", note: "Top-up fee collections" },
                    ].map(row => (
                      <div key={row.label} className="flex items-center justify-between pl-4">
                        <div>
                          <p className="text-sm text-textMuted">{row.label}</p>
                          <p className="text-[10px] text-textDim">{row.note}</p>
                        </div>
                        <p className={`font-extrabold text-sm tabular-nums ${row.color}`}>{formatZAR(row.value)}</p>
                      </div>
                    ))}
                    <div className="text-[10px] font-black text-textDim uppercase tracking-widest mt-3 mb-2">EXPENSES</div>
                    <div className="flex items-center justify-between pl-4">
                      <div>
                        <p className="text-sm text-textMuted">Gateway Fees Paid</p>
                        <p className="text-[10px] text-textDim">Outgoing to Stitch payment gateway</p>
                      </div>
                      <p className="font-extrabold text-sm tabular-nums text-red">
                        ({formatZAR(summary.this_month.gateway_fees_paid)})
                      </p>
                    </div>
                    <div className="flex justify-between items-center pt-3 border-t border-border mt-2">
                      <p className="font-extrabold text-text text-sm">Net Income</p>
                      <p className={`font-black text-lg tabular-nums ${netIncome >= 0 ? "text-green" : "text-red"}`}>
                        {netIncome < 0 ? `(${formatZAR(Math.abs(netIncome))})` : formatZAR(netIncome)}
                      </p>
                    </div>
                  </div>
                </Card>
              )}

              <Card>
                <h2 className="text-text font-extrabold text-sm mb-5 flex items-center gap-2">
                  <Layers size={14} className="text-purple" /> Ledger Health
                </h2>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-textMuted text-sm">Total Ledger Entries</span>
                    <span className="font-bold text-text">{(ledger?.total_entries || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-textMuted text-sm">Today Credit Volume</span>
                    <span className="font-bold text-cyan tabular-nums">{formatZAR(ledger?.today_volume || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-textMuted text-sm">Total Assets Under Management</span>
                    <span className="font-bold text-green tabular-nums">{formatZAR(totalBalance)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-textMuted text-sm">Active Accounts</span>
                    <span className="font-bold text-text">{ledger?.accounts?.length || 0} / 8</span>
                  </div>
                  <div className="pt-3 border-t border-border flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green animate-pulse" />
                    <span className="text-[11px] text-green font-bold">Ledger Operational</span>
                  </div>
                </div>
              </Card>
            </div>

            {/* Account balances grid */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-text font-bold text-sm flex items-center gap-2">
                  <Wallet size={14} className="text-cyan" /> Platform Account Balances
                </h2>
                <button onClick={() => setActiveTab("transactions")} className="text-xs text-cyan hover:underline">
                  View all transactions →
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(ACC).map(([k, cfg], i) => {
                  const acc = ledger?.accounts?.find((a: any) => a.account === k);
                  const bal = acc?.balance || 0;
                  const pct = totalBalance > 0 ? (bal / totalBalance) * 100 : 0;
                  const Icon = cfg.icon;
                  return (
                    <div key={k} onClick={() => { setActiveTab("transactions"); setTxnAcct(k); }}
                      className="bg-bg2 border border-border rounded-xl p-4 hover:border-cyan/30 cursor-pointer transition-all group">
                      <div className="flex items-center gap-2 mb-3">
                        <div className={`w-7 h-7 rounded-lg ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
                          <Icon size={13} className={cfg.color} />
                        </div>
                        <p className="text-text text-xs font-bold truncate leading-tight">{cfg.label}</p>
                      </div>
                      <p className={`text-lg font-black tabular-nums ${cfg.color}`}>{formatZAR(bal)}</p>
                      <div className="mt-2">
                        <div className="h-1 bg-bg3 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: BAR_COLORS[i] }} />
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-textDim text-[9px]">{pct.toFixed(1)}% of AUM</span>
                          <span className="text-textDim text-[9px] group-hover:text-cyan transition-colors">History →</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bar chart */}
            {chartData.length > 0 && (
              <Card>
                <h2 className="text-text font-bold text-sm mb-4 flex items-center gap-2">
                  <BarChart2 size={14} className="text-cyan" /> Account Balance Distribution
                </h2>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 56 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fill: "var(--textDim)", fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
                    <YAxis tick={{ fill: "var(--textDim)", fontSize: 9 }} tickFormatter={v => `R${(v/1000).toFixed(0)}k`} />
                    <Tooltip {...TT} formatter={(v: any) => formatZAR(v)} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )}

            {/* Quick actions */}
            <div className="flex flex-wrap gap-3">
              <a href="/admin/refunds"
                className="flex items-center gap-2 px-4 py-2 bg-yellow/10 border border-yellow/20 rounded-lg text-yellow text-xs font-bold hover:bg-yellow/20 transition-all">
                <RotateCcw size={13} /> Refund Center
              </a>
              <a href="/admin/revenue"
                className="flex items-center gap-2 px-4 py-2 bg-green/10 border border-green/20 rounded-lg text-green text-xs font-bold hover:bg-green/20 transition-all">
                <TrendingUp size={13} /> Revenue Dashboard
              </a>
              <button onClick={() => window.open(`${BASE}/api/admin/export/transactions`, "_blank")}
                className="flex items-center gap-2 px-4 py-2 bg-cyan/10 border border-cyan/20 rounded-lg text-cyan text-xs font-bold hover:bg-cyan/20 transition-all">
                <Download size={13} /> Export Transactions CSV
              </button>
              {canRecon && (
                <button onClick={() => setActiveTab("reconciliation")}
                  className="flex items-center gap-2 px-4 py-2 bg-purple/10 border border-purple/20 rounded-lg text-purple text-xs font-bold hover:bg-purple/20 transition-all">
                  <CheckCircle2 size={13} /> Run Reconciliation
                </button>
              )}
              {canAdjust && (
                <button onClick={() => setActiveTab("adjustments")}
                  className="flex items-center gap-2 px-4 py-2 bg-yellow/10 border border-yellow/20 rounded-lg text-yellow text-xs font-bold hover:bg-yellow/20 transition-all">
                  <PenLine size={13} /> Manual Adjustment
                </button>
              )}
              <a href="/admin/refunds"
                className="flex items-center gap-2 px-4 py-2 bg-orange-400/10 border border-orange-400/20 rounded-lg text-orange-400 text-xs font-bold hover:bg-orange-400/20 transition-all">
                <RotateCcw size={13} /> Refund Center
              </a>
            </div>
          </>
        )}

        {/* ══════════════════════════════════ TRANSACTIONS ══════════════════════════════════ */}
        {activeTab === "transactions" && (
          <>
            {/* Filter bar */}
            <Card>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-40">
                  <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5 block">Account</label>
                  <select value={txnAcct} onChange={e => setTxnAcct(e.target.value)}
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs text-text focus:border-cyan/50 outline-none">
                    <option value="">All Accounts</option>
                    {Object.entries(ACC).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5 block">Direction</label>
                  <select value={txnDir} onChange={e => setTxnDir(e.target.value)}
                    className="bg-bg border border-border rounded-lg px-3 py-2 text-xs text-text focus:border-cyan/50 outline-none">
                    <option value="">Both</option>
                    <option value="credit">Credits only</option>
                    <option value="debit">Debits only</option>
                  </select>
                </div>
                <div className="flex-1 min-w-52">
                  <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5 block">Search</label>
                  <div className="relative">
                    <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-textDim" />
                    <input value={txnSearch} onChange={e => setTxnSearch(e.target.value)}
                      placeholder="Description, ref type..."
                      className="w-full bg-bg border border-border rounded-lg pl-8 pr-3 py-2 text-xs text-text focus:border-cyan/50 outline-none" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5 block">Rows</label>
                  <select value={txnLimit} onChange={e => setTxnLimit(Number(e.target.value))}
                    className="bg-bg border border-border rounded-lg px-3 py-2 text-xs text-text focus:border-cyan/50 outline-none">
                    {[50, 100, 200, 500].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <button onClick={loadTxns}
                  className="flex items-center gap-1.5 px-3 py-2 bg-cyan/10 border border-cyan/20 text-cyan text-xs font-bold rounded-lg hover:bg-cyan/20 transition-all">
                  <RefreshCw size={12} /> Refresh
                </button>
                <button onClick={() => window.open(`${BASE}/api/admin/export/transactions`, "_blank")}
                  className="flex items-center gap-1.5 px-3 py-2 bg-bg3 border border-border text-textMuted text-xs rounded-lg hover:text-cyan transition-all">
                  <Download size={12} /> Export
                </button>
              </div>
            </Card>

            {txnLoading ? (
              <div className="flex justify-center py-12"><Spinner /></div>
            ) : (
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-text font-bold text-sm">
                    {txnAcct ? ACC[txnAcct]?.label || txnAcct : "All Ledger Entries"}
                    <span className="text-textDim font-normal ml-2">({transactions.length} of {allTxns.length})</span>
                  </h2>
                </div>

                {transactions.length === 0 ? (
                  <p className="text-textMuted text-sm text-center py-10">No entries match your filters</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border">
                          {["","Amount","Balance After","Account","Description","Ref Type","Date"].map(h => (
                            <th key={h} className="text-left py-2 px-2 text-textDim font-bold uppercase tracking-wider text-[10px]">{h}</th>
                          ))}
                          {canReverse && <th className="py-2 px-2 text-[10px]" />}
                        </tr>
                      </thead>
                      <tbody>
                        {transactions.map((t: any) => (
                          <tr key={t.id} className="border-b border-border/50 hover:bg-bg3/30 transition-colors">
                            <td className="py-2.5 px-2">
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center ${t.direction === "credit" ? "bg-green/10" : "bg-red/10"}`}>
                                {t.direction === "credit"
                                  ? <ArrowUpRight size={12} className="text-green" />
                                  : <ArrowDownLeft size={12} className="text-red" />}
                              </div>
                            </td>
                            <td className={`py-2.5 px-2 font-extrabold tabular-nums ${t.direction === "credit" ? "text-green" : "text-red"}`}>
                              {t.direction === "credit" ? "+" : "−"}{formatZAR(t.amount)}
                            </td>
                            <td className="py-2.5 px-2 text-textMuted tabular-nums">{formatZAR(t.balance_after)}</td>
                            <td className="py-2.5 px-2">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${ACC[t.account]?.bg || "bg-bg3"} ${ACC[t.account]?.color || "text-text"}`}>
                                {ACC[t.account]?.label || t.account}
                              </span>
                            </td>
                            <td className="py-2.5 px-2 text-textMuted max-w-xs truncate">{t.description}</td>
                            <td className="py-2.5 px-2">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                t.reference_type === "manual_adjustment" ? "bg-yellow/10 border-yellow/20 text-yellow" :
                                t.reference_type === "reversal"          ? "bg-orange-400/10 border-orange-400/20 text-orange-400" :
                                "bg-bg3 border-border text-textMuted"
                              }`}>{t.reference_type || "—"}</span>
                            </td>
                            <td className="py-2.5 px-2 text-textDim whitespace-nowrap">{formatDate(t.created_at)}</td>
                            {canReverse && (
                              <td className="py-2.5 px-2">
                                {t.reference_type !== "reversal" && !t.description?.includes("[REVERSED]") && (
                                  <button onClick={() => { setReverseEntry(t); setReverseReason(""); }}
                                    className="text-[10px] px-2 py-1 rounded border border-orange-400/20 text-orange-400 hover:bg-orange-400/10 transition-all whitespace-nowrap">
                                    Reverse
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )}

            {/* Reverse entry panel */}
            {reverseEntry && (
              <Card className="border-orange-400/30">
                <h3 className="text-text font-extrabold text-sm mb-3 flex items-center gap-2">
                  <RotateCcw size={14} className="text-orange-400" /> Reverse Ledger Entry
                </h3>
                <div className="bg-bg rounded-lg p-3 mb-4 space-y-1.5 text-xs">
                  {[
                    ["Entry ID",     reverseEntry.id.slice(0, 16) + "…"],
                    ["Account",      ACC[reverseEntry.account]?.label || reverseEntry.account],
                    ["Direction",    reverseEntry.direction],
                    ["Amount",       formatZAR(reverseEntry.amount)],
                    ["Description",  reverseEntry.description],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-textMuted">{k}</span>
                      <span className="font-bold text-text text-right max-w-[240px] truncate">{v}</span>
                    </div>
                  ))}
                </div>
                <p className="text-textDim text-xs mb-3">
                  A reversal creates an equal and opposite entry preserving the full audit trail. The original is marked [REVERSED]. This cannot be undone.
                </p>
                <input value={reverseReason} onChange={e => setReverseReason(e.target.value)}
                  placeholder="Reason for reversal (min 5 chars)"
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text focus:border-orange-400/50 outline-none mb-4" />
                <div className="flex gap-3 justify-end">
                  <button onClick={() => setReverseEntry(null)}
                    className="px-4 py-2 text-xs text-textMuted hover:text-text border border-border rounded-lg transition-all">
                    Cancel
                  </button>
                  <button onClick={submitReverse} disabled={reverseBusy}
                    className="flex items-center gap-2 px-5 py-2 bg-orange-400/10 border border-orange-400/30 text-orange-400 text-xs font-bold rounded-lg hover:bg-orange-400/20 disabled:opacity-50 transition-all">
                    {reverseBusy ? <Spinner /> : <><RotateCcw size={12} /> Confirm Reversal</>}
                  </button>
                </div>
              </Card>
            )}
          </>
        )}

        {/* ══════════════════════════════════ ADJUSTMENTS ══════════════════════════════════ */}
        {activeTab === "adjustments" && (
          <>
            {canAdjust ? (
              <>
                <AdjustForm onDone={() => { loadCorrections(); loadCore(); }} />

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-text font-bold text-sm flex items-center gap-2">
                      <FileText size={14} className="text-purple" /> Adjustments & Reversals Log
                    </h2>
                    <button onClick={loadCorrections}
                      className="flex items-center gap-1 text-xs text-textMuted hover:text-cyan transition-colors">
                      <RefreshCw size={11} /> Refresh
                    </button>
                  </div>

                  {corrLoading ? (
                    <div className="flex justify-center py-12"><Spinner /></div>
                  ) : corrections.length === 0 ? (
                    <Card><p className="text-textMuted text-sm text-center py-8">No manual adjustments recorded yet</p></Card>
                  ) : (
                    <Card>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border">
                              {["Type","Account","Direction","Amount","Balance After","Admin","Description","Date"].map(h => (
                                <th key={h} className="text-left py-2 px-2 text-textDim font-bold uppercase tracking-wider text-[10px]">{h}</th>
                              ))}
                              {canReverse && <th className="py-2 px-2 text-[10px]" />}
                            </tr>
                          </thead>
                          <tbody>
                            {corrections.map((c: any) => (
                              <tr key={c.id} className="border-b border-border/50 hover:bg-bg3/30 transition-colors">
                                <td className="py-2.5 px-2">
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                    c.reference_type === "manual_adjustment" ? "bg-yellow/10 border-yellow/20 text-yellow" : "bg-orange-400/10 border-orange-400/20 text-orange-400"
                                  }`}>{c.reference_type === "manual_adjustment" ? "Manual" : "Reversal"}</span>
                                </td>
                                <td className={`py-2.5 px-2 text-xs font-bold ${ACC[c.account]?.color || "text-text"}`}>
                                  {ACC[c.account]?.label || c.account}
                                </td>
                                <td className={`py-2.5 px-2 font-bold capitalize ${c.direction === "credit" ? "text-green" : "text-red"}`}>{c.direction}</td>
                                <td className={`py-2.5 px-2 font-extrabold tabular-nums ${c.direction === "credit" ? "text-green" : "text-red"}`}>{formatZAR(c.amount)}</td>
                                <td className="py-2.5 px-2 text-textMuted tabular-nums">{formatZAR(c.balance_after)}</td>
                                <td className="py-2.5 px-2 text-textMuted">{c.admin_name}</td>
                                <td className="py-2.5 px-2 text-textDim max-w-xs truncate">{c.description}</td>
                                <td className="py-2.5 px-2 text-textDim whitespace-nowrap">{formatDate(c.created_at)}</td>
                                {canReverse && (
                                  <td className="py-2.5 px-2">
                                    {c.reference_type === "manual_adjustment" && !c.description?.includes("[REVERSED]") && (
                                      <button onClick={() => { setReverseEntry(c); setReverseReason(""); setActiveTab("transactions"); }}
                                        className="text-[10px] px-2 py-1 rounded border border-orange-400/20 text-orange-400 hover:bg-orange-400/10 transition-all whitespace-nowrap">
                                        Reverse
                                      </button>
                                    )}
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  )}
                </div>
              </>
            ) : (
              <PermWall label="Manual Adjustment Permission Required — CFO, CEO or Superadmin only" />
            )}
          </>
        )}

        {/* ══════════════════════════════════ RECONCILIATION ══════════════════════════════════ */}
        {activeTab === "reconciliation" && (
          <>
            {canRecon ? (
              <>
                {/* Run button */}
                <Card className="border-purple/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-text font-extrabold text-sm flex items-center gap-2 mb-1">
                        <CheckCircle2 size={14} className="text-purple" /> Run Reconciliation
                      </h2>
                      <p className="text-textMuted text-xs max-w-lg">
                        Compares total top-ups against payments, withdrawals, and wallet balances to detect variances.
                        Also checks for stale pending withdrawals older than 7 days.
                      </p>
                    </div>
                    <button onClick={runReconciliation} disabled={reconRunning}
                      className="flex items-center gap-2 px-5 py-2.5 bg-purple/10 border border-purple/30 text-purple text-sm font-bold rounded-lg hover:bg-purple/20 disabled:opacity-50 transition-all whitespace-nowrap ml-6">
                      {reconRunning ? <><Spinner /> Running…</> : <><CheckCircle2 size={14} /> Run Now</>}
                    </button>
                  </div>
                </Card>

                {/* Discrepancies */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-text font-bold text-sm flex items-center gap-2">
                      <AlertTriangle size={14} className="text-yellow" /> Discrepancies
                    </h2>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-xs text-textMuted cursor-pointer">
                        <input type="checkbox" checked={unresolvedOnly} onChange={e => setUnresolvedOnly(e.target.checked)} className="rounded" />
                        Unresolved only
                      </label>
                      <button onClick={loadRecon}
                        className="flex items-center gap-1 text-xs text-textMuted hover:text-cyan transition-colors">
                        <RefreshCw size={11} /> Refresh
                      </button>
                    </div>
                  </div>

                  {reconLoading ? (
                    <div className="flex justify-center py-12"><Spinner /></div>
                  ) : discrepancies.length === 0 ? (
                    <Card>
                      <div className="flex flex-col items-center py-10 gap-3">
                        <CheckCircle2 size={36} className="text-green" />
                        <p className="text-green font-bold text-sm">No discrepancies found</p>
                        <p className="text-textMuted text-xs">All reconciliation batches are balanced.</p>
                      </div>
                    </Card>
                  ) : (
                    <div className="space-y-3">
                      {discrepancies.map((d: any) => (
                        <Card key={d.id} className={d.resolved ? "" : "border-yellow/20"}>
                          <div className="flex items-start gap-4">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${d.resolved ? "bg-green/10" : "bg-yellow/10"}`}>
                              {d.resolved ? <CheckCircle2 size={16} className="text-green" /> : <AlertTriangle size={16} className="text-yellow" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-3 mb-1">
                                <p className="text-text font-bold text-sm">{d.description}</p>
                                {d.resolved && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green/10 border border-green/20 text-green whitespace-nowrap">Resolved</span>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-textMuted mb-2">
                                <span>Type: <strong className="text-text">{d.type}</strong></span>
                                <span>Amount: <strong className="text-yellow">{formatZAR(d.amount)}</strong></span>
                                <span>Expected: <strong className="text-text">{formatZAR(d.expected)}</strong></span>
                                <span>Actual: <strong className="text-text">{formatZAR(d.actual)}</strong></span>
                              </div>
                              {d.resolved && d.resolution_note && (
                                <p className="text-textDim text-xs mb-1">Resolution: {d.resolution_note}</p>
                              )}
                              <p className="text-textDim text-[10px]">{formatDate(d.created_at)}</p>
                            </div>
                            {!d.resolved && (
                              <button onClick={() => { setResolveDisc(d); setResolveNote(""); }}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-green/10 border border-green/20 text-green rounded-lg hover:bg-green/20 transition-all whitespace-nowrap flex-shrink-0">
                                <CheckCircle2 size={12} /> Resolve
                              </button>
                            )}
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>

                {/* Resolve discrepancy panel */}
                {resolveDisc && (
                  <Card className="border-green/30">
                    <h3 className="text-text font-extrabold text-sm mb-3 flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-green" /> Resolve Discrepancy
                    </h3>
                    <p className="text-textMuted text-xs mb-3">{resolveDisc.description} — {formatZAR(resolveDisc.amount)}</p>
                    <input value={resolveNote} onChange={e => setResolveNote(e.target.value)}
                      placeholder="Describe how this was resolved or investigated…"
                      className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text focus:border-green/50 outline-none mb-4" />
                    <div className="flex gap-3 justify-end">
                      <button onClick={() => setResolveDisc(null)}
                        className="px-4 py-2 text-xs text-textMuted hover:text-text border border-border rounded-lg transition-all">
                        Cancel
                      </button>
                      <button onClick={submitResolve} disabled={resolveBusy}
                        className="flex items-center gap-2 px-5 py-2 bg-green/10 border border-green/30 text-green text-xs font-bold rounded-lg hover:bg-green/20 disabled:opacity-50 transition-all">
                        {resolveBusy ? <Spinner /> : <><CheckCircle2 size={12} /> Mark Resolved</>}
                      </button>
                    </div>
                  </Card>
                )}

                {/* Batch history */}
                <div>
                  <h2 className="text-text font-bold text-sm mb-3 flex items-center gap-2">
                    <Clock size={14} className="text-textMuted" /> Reconciliation History
                  </h2>
                  {reconBatches.length === 0 ? (
                    <Card><p className="text-textMuted text-sm text-center py-6">No reconciliation batches yet. Run your first one above.</p></Card>
                  ) : (
                    <Card>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border">
                              {["Status","Period","Top-Ups","Payments","Fees","Withdrawals","Wallet Total","Variance","Issues","Run By","Date"].map(col => (
                                <th key={col} className="text-left py-2 px-2 text-textDim font-bold uppercase tracking-wider text-[10px]">{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {reconBatches.map((b: any) => (
                              <tr key={b.id} className="border-b border-border/50 hover:bg-bg3/30 transition-colors">
                                <td className="py-2.5 px-2">
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                    b.status === "balanced" ? "bg-green/10 border-green/20 text-green" : "bg-yellow/10 border-yellow/20 text-yellow"
                                  }`}>{b.status}</span>
                                </td>
                                <td className="py-2.5 px-2 text-textDim text-[10px] whitespace-nowrap">
                                  {new Date(b.period_start).toLocaleDateString("en-ZA", { month: "short", day: "numeric" })} →{" "}
                                  {new Date(b.period_end).toLocaleDateString("en-ZA", { month: "short", day: "numeric" })}
                                </td>
                                <td className="py-2.5 px-2 text-cyan tabular-nums">{formatZAR(b.total_topups)}</td>
                                <td className="py-2.5 px-2 text-green tabular-nums">{formatZAR(b.total_payments)}</td>
                                <td className="py-2.5 px-2 text-purple tabular-nums">{formatZAR(b.total_fees)}</td>
                                <td className="py-2.5 px-2 text-yellow tabular-nums">{formatZAR(b.total_withdrawals)}</td>
                                <td className="py-2.5 px-2 text-text font-bold tabular-nums">{formatZAR(b.total_wallets)}</td>
                                <td className={`py-2.5 px-2 font-extrabold tabular-nums ${Math.abs(b.variance) < 0.01 ? "text-green" : "text-red"}`}>
                                  {Math.abs(b.variance) < 0.01 ? "R0.00" : formatZAR(Math.abs(b.variance))}
                                </td>
                                <td className={`py-2.5 px-2 font-bold ${b.discrepancy_count > 0 ? "text-yellow" : "text-green"}`}>{b.discrepancy_count}</td>
                                <td className="py-2.5 px-2 text-textMuted">{b.run_by_name || "—"}</td>
                                <td className="py-2.5 px-2 text-textDim whitespace-nowrap">{formatDate(b.created_at)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  )}
                </div>
              </>
            ) : (
              <PermWall label="Reconciliation Access Required — Finance, CFO, CEO or Superadmin only" />
            )}
          </>
        )}


      </div>
    </AdminShell>
  );
}
