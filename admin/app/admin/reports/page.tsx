"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Spinner, Button } from "@/components/ui";
import { formatZAR } from "@/lib/utils";
import { Download, TrendingUp, RefreshCw, CheckCircle, AlertTriangle } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
  "Content-Type": "application/json",
});
const TT = {
  contentStyle: {
    background: "#0D0D16", border: "1px solid #1A1A2E",
    borderRadius: 8, color: "#F0F0FF", fontSize: 12,
  },
};

export default function ReportsPage() {
  const [report, setReport] = useState<any>(null);
  const [recon, setRecon] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconResult, setReconResult] = useState<any>(null);
  const [lastReconciled, setLastReconciled] = useState<string | null>(null);

  const loadData = () => {
    setLoading(true);
    setError(null);
    const token = localStorage.getItem("tnr_admin_token");
    Promise.all([
      fetch(`${BASE}/api/admin/reports/financial`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(r => {
        if (!r.ok) throw new Error(`Financial report: ${r.status} ${r.statusText}`);
        return r.json();
      }),
      fetch(`${BASE}/api/admin/reports/reconciliation`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(r => {
        if (!r.ok) throw new Error(`Reconciliation: ${r.status} ${r.statusText}`);
        return r.json();
      }),
    ])
      .then(([r, rc]) => { setReport(r); setRecon(rc); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleReconcile = async () => {
    if (!confirm("Run full reconciliation? This will sync all wallet balances and ledger accounts from actual transactions.")) return;
    setReconciling(true);
    setReconResult(null);
    try {
      // Run all three sync commands in sequence
      const results = await Promise.all([
        fetch(`${BASE}/api/admin/system/run/sync_wallet_balances`, {
          method: "POST", headers: authHeaders(),
        }).then(r => r.json()),
        fetch(`${BASE}/api/admin/system/run/sync_driver_earnings`, {
          method: "POST", headers: authHeaders(),
        }).then(r => r.json()),
        fetch(`${BASE}/api/admin/system/run/fix_ledger_balances`, {
          method: "POST", headers: authHeaders(),
        }).then(r => r.json()),
      ]);
      setReconResult({
        ok: results.every(r => r.ok),
        wallets_fixed: results[0]?.details?.wallets_fixed || 0,
        drivers_fixed: results[1]?.details?.drivers_fixed || 0,
        accounts_fixed: results[2]?.details?.accounts_fixed || 0,
      });
      setLastReconciled(new Date().toLocaleTimeString());
      // Reload data to show updated variance
      loadData();
    } catch (e: any) {
      setReconResult({ ok: false, error: e.message });
    } finally {
      setReconciling(false);
    }
  };

  const exportReport = () =>
    window.open(`${BASE}/api/admin/export/financial-report`, "_blank");

  if (loading) return (
    <AdminShell title="Financial Reports">
      <div className="flex items-center justify-center py-24"><Spinner /></div>
    </AdminShell>
  );

  if (error) return (
    <AdminShell title="Financial Reports">
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-16 h-16 rounded-full bg-red/10 border border-red/20 flex items-center justify-center">
          <TrendingUp size={24} className="text-red" />
        </div>
        <p className="text-text font-bold text-lg">Failed to load reports</p>
        <p className="text-textMuted text-sm font-mono bg-bg2 border border-border px-4 py-2 rounded-lg">{error}</p>
        <Button variant="secondary" onClick={loadData}>Try again</Button>
      </div>
    </AdminShell>
  );

  const growth = report?.summary?.last_month_revenue > 0
    ? (((report.summary.this_month_revenue - report.summary.last_month_revenue)
        / report.summary.last_month_revenue) * 100).toFixed(1)
    : "0";

  const hasVariance = recon && Math.abs(recon.variance) >= 1;

  return (
    <AdminShell title="Financial Reports">
      <div className="space-y-6">

        {/* Top bar */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {hasVariance && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red/10 border border-red/20 rounded-xl">
                <AlertTriangle size={14} className="text-red" />
                <span className="text-red text-xs font-bold">
                  Variance detected — {formatZAR(Math.abs(recon.variance))}
                </span>
              </div>
            )}
            {!hasVariance && recon && (
              <div className="flex items-center gap-2 px-3 py-2 bg-green/10 border border-green/20 rounded-xl">
                <CheckCircle size={14} className="text-green" />
                <span className="text-green text-xs font-bold">Books balanced</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReconcile}
              disabled={reconciling}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all disabled:opacity-50 ${
                hasVariance
                  ? "bg-red/10 border-red/20 text-red hover:bg-red/20"
                  : "bg-bg2 border-border text-textMuted hover:text-cyan hover:border-cyan/30"
              }`}>
              <RefreshCw size={14} className={reconciling ? "animate-spin" : ""} />
              {reconciling ? "Reconciling..." : "Reconcile Now"}
            </button>
            <Button variant="secondary" onClick={exportReport}>
              <Download size={13} /> Export CSV
            </Button>
          </div>
        </div>

        {/* Reconcile result */}
        {reconResult && (
          <div className={`p-4 rounded-xl border ${
            reconResult.ok ? "bg-green/5 border-green/20" : "bg-red/5 border-red/20"
          }`}>
            {reconResult.ok ? (
              <div className="flex items-start gap-3">
                <CheckCircle size={16} className="text-green mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-green font-bold text-sm">Reconciliation complete</p>
                  <p className="text-textMuted text-xs mt-1">
                    {reconResult.wallets_fixed} wallets synced ·{" "}
                    {reconResult.drivers_fixed} driver earnings synced ·{" "}
                    {reconResult.accounts_fixed} ledger accounts corrected
                    {lastReconciled && ` · ${lastReconciled}`}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <AlertTriangle size={16} className="text-red flex-shrink-0" />
                <p className="text-red text-sm font-bold">
                  {reconResult.error || "Reconciliation failed — check System Console"}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Nightly cron status */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-bg2 border border-border rounded-xl">
          <RefreshCw size={12} className="text-textMuted" />
          <p className="text-textMuted text-xs">
            Auto-reconciliation runs nightly at 02:00 SAST via cron job.
            {lastReconciled ? ` Last manual run: ${lastReconciled}` : " Click Reconcile Now to fix any discrepancies."}
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Platform Revenue", value: report?.summary?.total_platform_revenue || 0, color: "text-green" },
            { label: "This Month", value: report?.summary?.this_month_revenue || 0, color: "text-cyan",
              sub: `${parseFloat(growth) >= 0 ? "+" : ""}${growth}% vs last month` },
            { label: "Total Wallet Balance", value: report?.summary?.total_wallet_balance || 0, color: "text-purple" },
            { label: "Total Withdrawn", value: report?.summary?.total_withdrawn || 0, color: "text-yellow" },
          ].map(item => (
            <div key={item.label} className="bg-bg2 border border-border rounded-xl p-4">
              <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-2">{item.label}</p>
              <p className={`text-2xl font-extrabold ${item.color}`}>{formatZAR(item.value)}</p>
              {item.sub && <p className="text-textMuted text-xs mt-1">{item.sub}</p>}
            </div>
          ))}
        </div>

        {/* Reconciliation */}
        {recon && (
          <Card>
            <h2 className="text-text font-bold mb-4">Reconciliation Report</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { label: "Total Top-ups",         value: recon.total_topups,                color: "text-cyan" },
                { label: "Total Payments",         value: recon.total_payments,              color: "text-green" },
                { label: "Total Withdrawn",        value: recon.total_withdrawals_approved,  color: "text-yellow" },
                { label: "Wallet Balance",         value: recon.total_wallet_balance,        color: "text-purple" },
                { label: "Platform Fees",          value: recon.total_platform_fees,         color: "text-green" },
                { label: "Pending Withdrawals",    value: recon.pending_withdrawals,         color: "text-red" },
              ].map(item => (
                <div key={item.label} className="bg-bg border border-border rounded-lg p-4">
                  <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">{item.label}</p>
                  <p className={`text-xl font-extrabold ${item.color}`}>{formatZAR(item.value)}</p>
                </div>
              ))}
            </div>
            <div className={`mt-4 p-3 rounded-lg border flex items-center justify-between ${
              Math.abs(recon.variance) < 1
                ? "bg-green/10 border-green/20"
                : "bg-red/10 border-red/20"
            }`}>
              <p className={`text-sm font-bold ${Math.abs(recon.variance) < 1 ? "text-green" : "text-red"}`}>
                Variance: {formatZAR(Math.abs(recon.variance))}{" "}
                {Math.abs(recon.variance) < 1 ? "✓ Balanced" : "⚠ Discrepancy detected"}
              </p>
              {Math.abs(recon.variance) >= 1 && (
                <button onClick={handleReconcile} disabled={reconciling}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red/20 border border-red/30 rounded-lg text-red text-xs font-bold hover:bg-red/30 transition-colors disabled:opacity-50">
                  <RefreshCw size={11} className={reconciling ? "animate-spin" : ""} />
                  Fix Now
                </button>
              )}
            </div>
          </Card>
        )}

        {/* Daily Fee Revenue chart */}
        {report?.daily_fees?.length > 0 && (
          <Card>
            <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4">
              Daily Fee Revenue (30 days)
            </h2>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={report.daily_fees}>
                <defs>
                  <linearGradient id="gF" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00E676" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#00E676" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" />
                <XAxis dataKey="date" stroke="#444466" tick={{ fontSize: 10, fill: "#8888AA" }} />
                <YAxis stroke="#444466" tick={{ fontSize: 10, fill: "#8888AA" }}
                  tickFormatter={(v) => `R${v}`} />
                <Tooltip {...TT} formatter={(v: number) => [formatZAR(v), "Fee Revenue"]} />
                <Area type="monotone" dataKey="fee_revenue" stroke="#00E676"
                  fill="url(#gF)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Monthly breakdown */}
        {report?.monthly_breakdown?.length > 0 && (
          <Card>
            <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4">
              Monthly Breakdown
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-bg3 border-b border-border">
                  <tr>
                    {["Month", "Gross Volume", "Fee Revenue", "Transactions", "Driver Payouts"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-textMuted uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report.monthly_breakdown.map((m: any) => (
                    <tr key={m.month} className="hover:bg-bg3 transition-colors">
                      <td className="px-4 py-3 font-semibold">{m.month}</td>
                      <td className="px-4 py-3">{formatZAR(m.gross_volume)}</td>
                      <td className="px-4 py-3 text-green font-bold">{formatZAR(m.fee_revenue)}</td>
                      <td className="px-4 py-3 text-cyan">{m.txn_count}</td>
                      <td className="px-4 py-3 text-textMuted">{formatZAR(m.driver_payouts)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Top drivers */}
        {report?.top_drivers?.length > 0 && (
          <Card>
            <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4">
              Top Earning Drivers
            </h2>
            <div className="space-y-2">
              {report.top_drivers.map((d: any, i: number) => (
                <div key={d.phone_number}
                  className="flex items-center justify-between p-3 bg-bg border border-border rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-textDim font-mono text-sm w-6">#{i + 1}</span>
                    <div>
                      <p className="text-text font-semibold text-sm">{d.full_name}</p>
                      <p className="text-textMuted text-xs">{d.phone_number} · {d.trip_count} trips</p>
                    </div>
                  </div>
                  <p className="text-green font-bold">{formatZAR(d.total_earnings)}</p>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </AdminShell>
  );
}
