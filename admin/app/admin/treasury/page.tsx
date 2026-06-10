"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Button, Spinner } from "@/components/ui";
import { api, hasPermission, isSuperAdmin } from "@/lib/api";
import { formatZAR } from "@/lib/utils";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  TrendingUp, DollarSign, Wallet, Users, ArrowRight, Percent,
  FileText, RefreshCw, Building, CreditCard, AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const TT = {
  contentStyle: {
    background: "var(--bg2)", border: "1px solid var(--border)",
    borderRadius: 8, color: "var(--text)", fontSize: 12,
  },
};

const FEE_COLORS = ["#00D4FF", "#00E676", "#A064FF", "#FFD60A", "#FF8C42"];

function InfoRow({ label, value, color = "text-text", sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0">
      <div>
        <p className="text-text text-xs font-medium">{label}</p>
        {sub && <p className="text-textDim text-[10px] mt-0.5">{sub}</p>}
      </div>
      <span className={`font-bold text-sm font-mono ${color}`}>{value}</span>
    </div>
  );
}

export default function TreasuryPage() {
  const router = useRouter();
  const [wallet, setWallet] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [subRevenue, setSubRevenue] = useState<any>(null);
  const [payoutSettings, setPayoutSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const canView = hasPermission("view_ledger") || isSuperAdmin();

  useEffect(() => {
    if (!canView) { router.replace("/admin/dashboard"); return; }
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [w, a, sr, ps] = await Promise.allSettled([
        api.systemWallet().then(r => r.data),
        api.analytics("90d").then(r => r.data),
        api.subscriptionRevenue().then(r => r.data),
        api.getPayoutSettings().then(r => r.data),
      ]);
      if (w.status === "fulfilled") setWallet(w.value);
      if (a.status === "fulfilled") setAnalytics(a.value);
      if (sr.status === "fulfilled") setSubRevenue(sr.value);
      if (ps.status === "fulfilled") setPayoutSettings(ps.value);
    } finally { setLoading(false); }
  };

  if (loading) return <AdminShell title="Platform Treasury"><Spinner /></AdminShell>;

  const daily = (analytics?.daily_volume ?? []) as any[];
  const dailyFees = daily.map(d => ({
    date: (d.date ?? d.day ?? "").slice(5),
    fees: d.fees ?? (d.amount * 0.03),
    volume: d.amount ?? 0,
  }));

  const totalFeesLast90 = dailyFees.reduce((s, d) => s + (d.fees ?? 0), 0);
  const avgDailyFee = dailyFees.length > 0 ? totalFeesLast90 / dailyFees.length : 0;
  const projectedMonthly = avgDailyFee * 30;
  const totalFees = wallet?.total_fees_collected ?? 0;
  const totalSalaries = wallet?.total_salary_paid ?? 0;
  const available = wallet?.available ?? (totalFees - totalSalaries);
  const byType = (analytics?.transactions_by_type ?? []) as any[];
  const maxVolume = Math.max(...byType.map((t: any) => t.total), 1);

  return (
    <AdminShell title="Platform Treasury">
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-textMuted text-sm">Tag n Ride · Platform financial position</p>
          <Button variant="secondary" onClick={load}><RefreshCw size={13} /> Refresh</Button>
        </div>

        {/* Core KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Fees Collected", value: formatZAR(totalFees), sub: "All-time platform revenue", color: "text-green", border: "border-green/20", icon: TrendingUp, iconBg: "bg-green/10" },
            { label: "Total Salaries Paid", value: formatZAR(totalSalaries), sub: "Staff payroll (all-time)", color: "text-text", border: "border-border", icon: Users, iconBg: "bg-red/10" },
            { label: "Net Available", value: formatZAR(available), sub: "Fees minus payroll", color: available >= 0 ? "text-cyan" : "text-red", border: available >= 0 ? "border-cyan/20" : "border-red/20", icon: Wallet, iconBg: "bg-cyan/10" },
            { label: "Projected Monthly", value: formatZAR(projectedMonthly), sub: "Based on 90-day avg", color: "text-purple", border: "border-purple/20", icon: DollarSign, iconBg: "bg-purple/10" },
          ].map(kpi => (
            <div key={kpi.label} className={`bg-bg2 border ${kpi.border} rounded-xl p-5`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-lg ${kpi.iconBg} flex items-center justify-center`}>
                  <kpi.icon size={14} className={kpi.color} />
                </div>
                <p className="text-[9px] font-bold text-textDim uppercase tracking-widest">{kpi.label}</p>
              </div>
              <p className={`text-2xl font-black ${kpi.color}`}>{kpi.value}</p>
              <p className="text-xs text-textDim mt-1">{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* Revenue trend chart */}
        <div className="bg-bg2 border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-text">Platform Fee Revenue — 90 Days</h2>
              <p className="text-textMuted text-xs mt-0.5">
                Total: <span className="text-green font-bold">{formatZAR(totalFeesLast90)}</span>
                {" · "}Daily avg: <span className="text-cyan font-bold">{formatZAR(avgDailyFee)}</span>
              </p>
            </div>
            <Link href="/admin/accounting">
              <button className="flex items-center gap-1 text-xs text-cyan hover:underline">Full P&L <ArrowRight size={11} /></button>
            </Link>
          </div>
          {dailyFees.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={dailyFees}>
                <defs>
                  <linearGradient id="gFee" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00E676" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#00E676" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }} />
                <YAxis stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }} tickFormatter={v => `R${v.toFixed(0)}`} />
                <Tooltip {...TT} formatter={(v: number) => [formatZAR(v), "Fee Income"]} />
                <Area type="monotone" dataKey="fees" stroke="#00E676" fill="url(#gFee)" strokeWidth={2.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-40 text-textMuted text-sm">No revenue data yet</div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Rate card */}
          <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Percent size={14} className="text-yellow" />
                <h2 className="text-sm font-bold text-text">Revenue Rate Card</h2>
              </div>
              <Link href="/admin/document-pricing">
                <span className="text-[10px] text-cyan hover:underline flex items-center gap-1">Edit rates <ArrowRight size={10} /></span>
              </Link>
            </div>
            <div className="bg-bg">
              <InfoRow label="Ride Payment Fee" value="3%" sub="Deducted from every trip payment" color="text-yellow" />
              <InfoRow label="Stitch Instant Payout Fee" value="R3.50" sub="Per withdrawal to driver's bank account" color="text-yellow" />
              <InfoRow
                label="Driver Statement (1 month)"
                value={payoutSettings ? `R${payoutSettings.passenger_statement_price ?? "5.00"}` : "—"}
                sub="Per earnings statement request"
                color="text-yellow"
              />
              <InfoRow
                label="Fleet Owner Statement"
                value={payoutSettings ? `R${payoutSettings.owner_statement_price ?? "25.00"}` : "—"}
                sub="Per fleet earnings statement"
                color="text-yellow"
              />
              <InfoRow
                label="Fleet Subscription"
                value={payoutSettings ? `R${payoutSettings.subscription_price_per_taxi ?? "0"}/taxi` : "—"}
                sub="Monthly per-taxi subscription fee"
                color="text-yellow"
              />
            </div>
          </div>

          {/* Subscription revenue + volume */}
          <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Building size={14} className="text-purple" />
                <h2 className="text-sm font-bold text-text">Subscription Revenue</h2>
              </div>
              <Link href="/admin/subscriptions">
                <span className="text-[10px] text-cyan hover:underline flex items-center gap-1">View all <ArrowRight size={10} /></span>
              </Link>
            </div>
            <div className="px-5 py-4 space-y-3">
              {subRevenue ? (
                <>
                  {[
                    { label: "This month", value: formatZAR(subRevenue.this_month_revenue ?? subRevenue.current_month ?? 0), color: "text-cyan" },
                    { label: "Last month", value: formatZAR(subRevenue.last_month_revenue ?? subRevenue.previous_month ?? 0), color: "text-textMuted" },
                    { label: "All-time subscription income", value: formatZAR(subRevenue.total_revenue ?? subRevenue.total ?? 0), color: "text-purple" },
                    { label: "Active subscriptions", value: String(subRevenue.active_count ?? subRevenue.active_owners ?? 0), color: "text-green" },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between">
                      <span className="text-textMuted text-xs">{row.label}</span>
                      <span className={`font-bold text-sm ${row.color}`}>{row.value}</span>
                    </div>
                  ))}
                </>
              ) : (
                <p className="text-textMuted text-sm text-center py-3">Subscription data unavailable</p>
              )}

              {byType.length > 0 && (
                <div className="pt-3 mt-3 border-t border-border">
                  <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-3">Transaction Volume Breakdown (90d)</p>
                  <div className="space-y-2">
                    {byType.map((t: any, i: number) => (
                      <div key={t.type} className="flex items-center gap-3">
                        <span className="text-textMuted text-[10px] w-20 capitalize">{t.type}</span>
                        <div className="flex-1 h-2 bg-bg rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{
                            width: `${Math.round((t.total / maxVolume) * 100)}%`,
                            backgroundColor: FEE_COLORS[i % FEE_COLORS.length],
                          }} />
                        </div>
                        <span className="text-textMuted text-[10px] w-24 text-right font-mono">{formatZAR(t.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Quick navigation */}
        <div>
          <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-3">Related Pages</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { href: "/admin/accounting",    label: "P&L Statement",       icon: FileText,   color: "text-cyan" },
              { href: "/admin/payroll",        label: "Payroll",             icon: Users,      color: "text-yellow" },
              { href: "/admin/subscriptions",  label: "Subscriptions",       icon: CreditCard, color: "text-purple" },
              { href: "/admin/withdrawals",    label: "Withdrawals & Payouts", icon: Wallet,   color: "text-green" },
            ].map(item => (
              <Link key={item.href} href={item.href}>
                <div className="bg-bg2 border border-border rounded-xl p-4 flex items-center gap-3 hover:border-cyan/30 transition-colors cursor-pointer">
                  <item.icon size={15} className={item.color} />
                  <span className="text-text text-xs font-semibold flex-1">{item.label}</span>
                  <ArrowRight size={12} className="text-textDim" />
                </div>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </AdminShell>
  );
}
