"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Spinner, Button, StatCard } from "@/components/ui";
import { formatZAR } from "@/lib/utils";
import { Download } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
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

  useEffect(() => {
    Promise.all([
      fetch(`${BASE}/api/admin/reports/financial`, { headers: authHeaders() }).then(r => r.json()),
      fetch(`${BASE}/api/admin/reports/reconciliation`, { headers: authHeaders() }).then(r => r.json()),
    ]).then(([r, rc]) => { setReport(r); setRecon(rc); })
      .finally(() => setLoading(false));
  }, []);

  const exportReport = () =>
    window.open(`${BASE}/api/admin/export/financial-report`, "_blank");

  if (loading) return <AdminShell title="Financial Reports"><Spinner /></AdminShell>;

  const growth = report?.summary?.last_month_revenue > 0
    ? (((report.summary.this_month_revenue - report.summary.last_month_revenue)
        / report.summary.last_month_revenue) * 100).toFixed(1)
    : "0";

  return (
    <AdminShell title="Financial Reports">
      <div className="space-y-6">
        <div className="flex justify-end">
          <Button variant="secondary" onClick={exportReport}>
            <Download size={13} /> Export CSV
          </Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Platform Revenue"
            value={formatZAR(report?.summary?.total_platform_revenue || 0)} tone="green" />
          <StatCard label="This Month"
            value={formatZAR(report?.summary?.this_month_revenue || 0)} tone="cyan"
            sub={`${parseFloat(growth) >= 0 ? "+" : ""}${growth}% vs last month`} />
          <StatCard label="Total Wallet Balance"
            value={formatZAR(report?.summary?.total_wallet_balance || 0)} tone="purple" />
          <StatCard label="Total Withdrawn"
            value={formatZAR(report?.summary?.total_withdrawn || 0)} tone="yellow" />
        </div>

        {recon && (
          <Card>
            <h2 className="text-text font-bold mb-4">Reconciliation Report</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { label: "Total Top-ups", value: recon.total_topups, tone: "cyan" },
                { label: "Total Payments", value: recon.total_payments, tone: "green" },
                { label: "Total Withdrawn", value: recon.total_withdrawals_approved, tone: "yellow" },
                { label: "Wallet Balance", value: recon.total_wallet_balance, tone: "purple" },
                { label: "Platform Fees", value: recon.total_platform_fees, tone: "green" },
                { label: "Pending Withdrawals", value: recon.pending_withdrawals, tone: "red" },
              ].map((item) => (
                <div key={item.label} className="bg-bg border border-border rounded-lg p-4">
                  <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">
                    {item.label}
                  </p>
                  <p className={`text-xl font-extrabold text-${item.tone}`}>
                    {formatZAR(item.value)}
                  </p>
                </div>
              ))}
            </div>
            <div className={`mt-4 p-3 rounded-lg border ${
              Math.abs(recon.variance) < 1
                ? "bg-green/10 border-green/20"
                : "bg-red/10 border-red/20"
            }`}>
              <p className={`text-sm font-bold ${
                Math.abs(recon.variance) < 1 ? "text-green" : "text-red"
              }`}>
                Variance: {formatZAR(Math.abs(recon.variance))}{" "}
                {Math.abs(recon.variance) < 1 ? "✓ Balanced" : "⚠ Discrepancy detected"}
              </p>
            </div>
          </Card>
        )}

        <Card>
          <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4">
            Daily Fee Revenue (30 days)
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={report?.daily_fees || []}>
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

        <Card>
          <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4">
            Monthly Breakdown
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-bg3 border-b border-border">
                <tr>
                  {["Month", "Gross Volume", "Fee Revenue", "Transactions", "Driver Payouts"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-textMuted uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {report?.monthly_breakdown?.map((m: any) => (
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

        <Card>
          <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4">
            Top Earning Drivers
          </h2>
          <div className="space-y-2">
            {report?.top_drivers?.map((d: any, i: number) => (
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
      </div>
    </AdminShell>
  );
}
