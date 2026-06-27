"use client";
import { useEffect, useState, useCallback } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Button, Spinner } from "@/components/ui";
import { api, hasPermission } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import {
  TrendingUp, TrendingDown, Wallet, ArrowDown, ArrowUp,
  RefreshCw, Download, Clock, AlertTriangle, CheckCircle,
  Zap, DollarSign, Scale,
} from "lucide-react";
import toast from "react-hot-toast";

const BASE = "https://tag-n-ride-production.up.railway.app";
const h = () => ({ Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}` });
const TT = { contentStyle: { background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 12 } };

function NetBadge({ value }: { value: number }) {
  const pos = value >= 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold ${pos ? "text-green" : "text-red"}`}>
      {pos ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {pos ? "+" : ""}{formatZAR(value)}
    </span>
  );
}

export default function SettlementPage() {
  const [summary, setSummary] = useState<any>(null);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, w, l, a] = await Promise.allSettled([
        fetch(`${BASE}/api/admin/ledger/summary`, { headers: h() }).then(r => r.json()),
        api.withdrawals().then(r => r.data),
        fetch(`${BASE}/api/admin/ledger`, { headers: h() }).then(r => r.json()),
        api.analytics("30d").then(r => r.data),
      ]);
      if (s.status === "fulfilled") setSummary(s.value);
      if (w.status === "fulfilled") setWithdrawals(Array.isArray(w.value) ? w.value : []);
      if (l.status === "fulfilled") setAccounts(l.value?.accounts ?? []);
      if (a.status === "fulfilled") {
        const daily = a.value?.daily_volume ?? [];
        setHistory(daily.map((d: any) => ({
          date: (d.date ?? d.day ?? "").slice(5),
          in: d.amount ?? 0,
          fees: d.fees ?? 0,
          out: 0,
        })));
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const today = summary?.today ?? {};
  const month = summary?.this_month ?? {};
  const balances = summary?.balances ?? {};

  const pendingWithdrawals = withdrawals.filter(w => w.status === "pending");
  const approvedUnpaid = withdrawals.filter(w => w.status === "approved" || w.status === "auto_approved");
  const failedPayouts = withdrawals.filter(w => w.status === "payout_failed");

  const pendingTotal = pendingWithdrawals.reduce((s, w) => s + w.amount, 0);
  const approvedTotal = approvedUnpaid.reduce((s, w) => s + w.amount, 0);
  const failedTotal = failedPayouts.reduce((s, w) => s + w.amount, 0);

  const todayIn = today.topups + today.payments;
  const todayOut = today.withdrawals;
  const todayNet = todayIn - todayOut;

  const exportCSV = () => {
    const rows = [
      ["Metric", "Value"],
      ["Today Top-ups", formatZAR(today.topups ?? 0)],
      ["Today Payments", formatZAR(today.payments ?? 0)],
      ["Today Withdrawals", formatZAR(today.withdrawals ?? 0)],
      ["Today Net", formatZAR(todayNet)],
      ["Month Platform Revenue", formatZAR(month.platform_revenue ?? 0)],
      ["Month Processing Fees", formatZAR(month.processing_fees ?? 0)],
      ["Month Gateway Fees Paid", formatZAR(month.gateway_fees_paid ?? 0)],
      ["Month Net Income", formatZAR(month.net_income ?? 0)],
      ["Pending Withdrawals", formatZAR(pendingTotal)],
      ["Approved (not paid)", formatZAR(approvedTotal)],
      ["Failed Payouts", formatZAR(failedTotal)],
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `settlement-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    toast.success("Settlement report exported");
  };

  return (
    <AdminShell title="Settlement Center">
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-textMuted text-sm">Live cash position · {new Date().toLocaleDateString("en-ZA", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={load} disabled={loading}><RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh</Button>
            <Button variant="secondary" onClick={exportCSV}><Download size={13} /> Export Report</Button>
          </div>
        </div>

        {loading ? <Spinner /> : (
          <>
            {/* Today's Position */}
            <div>
              <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-3">Today's Cash Position</p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-bg2 border border-green/20 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowDown size={14} className="text-green" />
                    <p className="text-[10px] font-bold text-textDim uppercase tracking-widest">Money In</p>
                  </div>
                  <p className="text-2xl font-black text-green">{formatZAR(todayIn)}</p>
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-textDim">Top-ups</span>
                      <span className="text-textMuted">{formatZAR(today.topups ?? 0)}</span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-textDim">Ride payments</span>
                      <span className="text-textMuted">{formatZAR(today.payments ?? 0)}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-bg2 border border-red/20 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowUp size={14} className="text-red" />
                    <p className="text-[10px] font-bold text-textDim uppercase tracking-widest">Money Out</p>
                  </div>
                  <p className="text-2xl font-black text-red">{formatZAR(todayOut)}</p>
                  <p className="text-[10px] text-textDim mt-2">Withdrawals processed today</p>
                </div>

                <div className={`bg-bg2 border rounded-xl p-5 ${todayNet >= 0 ? "border-cyan/20" : "border-red/20"}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Scale size={14} className={todayNet >= 0 ? "text-cyan" : "text-red"} />
                    <p className="text-[10px] font-bold text-textDim uppercase tracking-widest">Net Today</p>
                  </div>
                  <p className={`text-2xl font-black ${todayNet >= 0 ? "text-cyan" : "text-red"}`}>{formatZAR(todayNet)}</p>
                  <p className="text-[10px] text-textDim mt-2">In minus out</p>
                </div>

                <div className="bg-bg2 border border-purple/20 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign size={14} className="text-purple" />
                    <p className="text-[10px] font-bold text-textDim uppercase tracking-widest">Month Net Income</p>
                  </div>
                  <p className="text-2xl font-black text-purple">{formatZAR(month.net_income ?? 0)}</p>
                  <p className="text-[10px] text-textDim mt-2">Revenue minus gateway fees</p>
                </div>
              </div>
            </div>

            {/* Outstanding settlements */}
            {(pendingWithdrawals.length > 0 || approvedUnpaid.length > 0 || failedPayouts.length > 0) && (
              <div>
                <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-3">Outstanding Items</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {pendingWithdrawals.length > 0 && (
                    <a href="/admin/withdrawals">
                      <div className="flex items-center gap-4 p-4 bg-yellow/5 border border-yellow/20 rounded-xl hover:bg-yellow/10 transition-colors cursor-pointer">
                        <Clock size={20} className="text-yellow flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-yellow font-bold text-sm">{pendingWithdrawals.length} Pending Approvals</p>
                          <p className="text-textMuted text-xs">{formatZAR(pendingTotal)} awaiting decision</p>
                        </div>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold bg-yellow/10 border-yellow/20 text-yellow">Action</span>
                      </div>
                    </a>
                  )}
                  {approvedUnpaid.length > 0 && (
                    <a href="/admin/withdrawals">
                      <div className="flex items-center gap-4 p-4 bg-cyan/5 border border-cyan/20 rounded-xl hover:bg-cyan/10 transition-colors cursor-pointer">
                        <Zap size={20} className="text-cyan flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-cyan font-bold text-sm">{approvedUnpaid.length} Processing Payouts</p>
                          <p className="text-textMuted text-xs">{formatZAR(approvedTotal)} being settled</p>
                        </div>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold bg-cyan/10 border-cyan/20 text-cyan">Processing</span>
                      </div>
                    </a>
                  )}
                  {failedPayouts.length > 0 && (
                    <a href="/admin/withdrawals">
                      <div className="flex items-center gap-4 p-4 bg-red/5 border border-red/20 rounded-xl hover:bg-red/10 transition-colors cursor-pointer">
                        <AlertTriangle size={20} className="text-red flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-red font-bold text-sm">{failedPayouts.length} Failed Payouts</p>
                          <p className="text-textMuted text-xs">{formatZAR(failedTotal)} needs retry</p>
                        </div>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold bg-red/10 border-red/20 text-red">Failed</span>
                      </div>
                    </a>
                  )}
                  {pendingWithdrawals.length === 0 && approvedUnpaid.length === 0 && failedPayouts.length === 0 && (
                    <div className="flex items-center gap-3 p-4 bg-green/5 border border-green/20 rounded-xl col-span-3">
                      <CheckCircle size={18} className="text-green" />
                      <p className="text-green font-semibold text-sm">All settlements up to date — no outstanding items</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Volume chart */}
            {history.length > 0 && (
              <div className="bg-bg2 border border-border rounded-xl p-5">
                <h2 className="text-sm font-bold text-text mb-4">30-Day Transaction Volume</h2>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={history}>
                    <defs>
                      <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00D4FF" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#00D4FF" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gFee" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00E676" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#00E676" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--textMuted)" }} />
                    <YAxis tick={{ fontSize: 9, fill: "var(--textMuted)" }} tickFormatter={v => `R${(v/1000).toFixed(0)}k`} />
                    <Tooltip {...TT} formatter={(v: number, n: string) => [formatZAR(v), n === "in" ? "Volume" : "Fees"]} />
                    <Area type="monotone" dataKey="in" stroke="#00D4FF" fill="url(#gIn)" strokeWidth={2} dot={false} name="Volume" />
                    <Area type="monotone" dataKey="fees" stroke="#00E676" fill="url(#gFee)" strokeWidth={2} dot={false} name="Fees" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Platform accounts */}
            <div>
              <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-3">Platform Account Balances</p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {accounts.map((acc: any) => {
                  const bal = balances[acc.account] ?? acc.balance;
                  const isNeg = bal < 0;
                  return (
                    <div key={acc.account} className={`bg-bg2 border rounded-xl p-4 ${isNeg ? "border-red/20" : "border-border"}`}>
                      <p className="text-[9px] font-bold text-textDim uppercase tracking-widest mb-1 truncate">{acc.account.replace(/_/g, " ")}</p>
                      <p className={`text-lg font-black ${isNeg ? "text-red" : bal > 0 ? "text-green" : "text-textMuted"}`}>{formatZAR(bal)}</p>
                      <p className="text-[9px] text-textDim mt-0.5 truncate">{acc.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Month summary */}
            <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h2 className="text-sm font-bold text-text">This Month's Revenue Summary</h2>
              </div>
              <div className="bg-bg">
                {[
                  { label: "Platform Revenue (ride fees)", value: formatZAR(month.platform_revenue ?? 0), color: "text-green" },
                  { label: "Processing Fees Collected", value: formatZAR(month.processing_fees ?? 0), color: "text-cyan" },
                  { label: "Gateway Fees Paid (Stitch)", value: `-${formatZAR(month.gateway_fees_paid ?? 0)}`, color: "text-red" },
                  { label: "Net Platform Income", value: formatZAR(month.net_income ?? 0), color: month.net_income >= 0 ? "text-purple" : "text-red", bold: true },
                ].map((row, i) => (
                  <div key={i} className="flex justify-between items-center px-5 py-3 border-b border-border last:border-0">
                    <span className="text-textMuted text-sm">{row.label}</span>
                    <span className={`font-bold text-sm ${row.color}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}
