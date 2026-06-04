"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Spinner, StatCard, Button } from "@/components/ui";
import { api } from "@/lib/api";
import { formatZAR } from "@/lib/utils";
import { Download, TrendingUp, TrendingDown } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import toast from "react-hot-toast";

const TT = {
  contentStyle: {
    background: "var(--bg2)", border: "1px solid var(--border)",
    borderRadius: 8, color: "var(--text)", fontSize: 12,
  },
};
const PIE_COLORS = ["#00D4FF", "#00E676", "#A064FF", "#FFD60A", "#FF8C42"];

const RANGES = ["7d", "30d", "90d"] as const;
type Range = typeof RANGES[number];

function GrowthBadge({ current, prev }: { current: number; prev: number }) {
  if (!prev) return null;
  const pct = ((current - prev) / prev) * 100;
  const up = pct >= 0;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-bold ${up ? "text-green" : "text-red"}`}>
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>("30d");

  useEffect(() => {
    setLoading(true);
    api.analytics(range).then((r) => setData(r.data)).finally(() => setLoading(false));
  }, [range]);

  if (loading) return <AdminShell title="Analytics"><Spinner /></AdminShell>;

  const daily = data?.daily_volume ?? [];
  const totalRevenue = daily.reduce((s: number, d: any) => s + (d.amount || 0), 0);
  const totalCount = daily.reduce((s: number, d: any) => s + (d.count || 0), 0);
  const prevRevenue = data?.prev_volume ?? 0;
  const prevCount = data?.prev_count ?? 0;

  const byType = data?.transactions_by_type ?? [];
  const totals = byType.reduce((s: any, t: any) => ({ ...s, [t.type]: t.volume }), {} as any);

  return (
    <AdminShell title="Analytics">
      <div className="space-y-6">

        {/* Range selector */}
        <div className="flex items-center justify-between">
          <p className="text-textMuted text-xs">All charts exclude test account data.</p>
          <div className="flex items-center gap-2">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${range === r ? "bg-cyanDim text-cyan border-cyan/20" : "bg-bg2 text-textMuted border-border hover:text-text"}`}
              >
                {r}
              </button>
            ))}
            <Button variant="secondary" onClick={() => {
              if (!daily.length) { return; }
              const rows = [
                ["Date", "Volume (ZAR)", "Transaction Count", "Fees (ZAR)"],
                ...daily.map((d: any) => [
                  d.date || d.day || "",
                  (d.amount || 0).toFixed(2),
                  String(d.count || 0),
                  (d.fees || 0).toFixed(2),
                ]),
              ];
              const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `analytics_${range}_${new Date().toISOString().slice(0, 10)}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}>
              <Download size={13} /> Export Analytics CSV
            </Button>
          </div>
        </div>

        {/* Summary stats with growth indicators */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-bg2 border border-border rounded-xl p-4">
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Total Volume ({range})</p>
            <p className="text-2xl font-black text-cyan">{formatZAR(totalRevenue)}</p>
            <div className="flex items-center gap-2 mt-1">
              <GrowthBadge current={totalRevenue} prev={prevRevenue} />
              <span className="text-[10px] text-textMuted">vs prev period</span>
            </div>
          </div>
          <div className="bg-bg2 border border-border rounded-xl p-4">
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Transactions ({range})</p>
            <p className="text-2xl font-black text-green">{totalCount.toLocaleString()}</p>
            <div className="flex items-center gap-2 mt-1">
              <GrowthBadge current={totalCount} prev={prevCount} />
              <span className="text-[10px] text-textMuted">vs prev period</span>
            </div>
          </div>
          {byType.map((t: any) => (
            <div key={t.type} className="bg-bg2 border border-border rounded-xl p-4">
              <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">{t.type} volume</p>
              <p className="text-2xl font-black text-text">{formatZAR(t.total)}</p>
              <p className="text-[10px] text-textMuted mt-1">{t.count} transactions</p>
            </div>
          ))}
        </div>

        {/* Daily volume */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest">Daily Volume ({range})</h2>
            <div className="flex items-center gap-4 text-xs text-textMuted">
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-cyan inline-block rounded" /> Revenue</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-green inline-block rounded" /> Count</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={daily}>
              <defs>
                <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00D4FF" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#00D4FF" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00E676" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#00E676" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }} />
              <YAxis stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
              <Tooltip {...TT} formatter={(v: number, n: string) => [n === "amount" ? formatZAR(v) : v, n === "amount" ? "Revenue" : "Count"]} />
              <Area type="monotone" dataKey="amount" stroke="#00D4FF" fill="url(#gC)" strokeWidth={2} dot={false} name="Revenue" />
              <Area type="monotone" dataKey="count" stroke="#00E676" fill="url(#gG)" strokeWidth={2} dot={false} name="Count" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Weekly revenue */}
          <Card>
            <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4">Weekly Revenue</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data?.weekly_revenue ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="week" stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }} />
                <YAxis stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                <Tooltip {...TT} formatter={(v: number) => [formatZAR(v), "Revenue"]} />
                <Bar dataKey="amount" fill="#00D4FF" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Transaction type breakdown */}
          <Card>
            <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4">Transaction Type Mix</h2>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={180}>
                <PieChart>
                  <Pie
                    data={byType}
                    dataKey="count"
                    nameKey="type"
                    cx="50%" cy="50%"
                    outerRadius={70}
                    innerRadius={40}
                  >
                    {byType.map((_: any, i: number) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...TT} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {byType.map((t: any, i: number) => (
                  <div key={t.type} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-xs text-textMuted capitalize">{t.type}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-text">{formatZAR(t.total)}</p>
                      <p className="text-[10px] text-textMuted">{t.count} txns</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Driver earnings leaderboard */}
          <Card>
            <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4">Driver Earnings Leaderboard</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data?.driver_leaderboard ?? []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }} width={90} />
                <Tooltip {...TT} formatter={(v: number) => [formatZAR(v), "Earnings"]} />
                <Bar dataKey="earnings" fill="#00E676" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Top passengers */}
          <Card>
            <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4">Top Passengers by Spend</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data?.top_passengers ?? []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }} width={90} />
                <Tooltip {...TT} formatter={(v: number) => [formatZAR(v), "Spent"]} />
                <Bar dataKey="total_spent" fill="#A064FF" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* Withdrawal trend */}
        <Card>
          <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4">Withdrawal Trend (30 days)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data?.withdrawal_trend ?? []}>
              <defs>
                <linearGradient id="gR" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#A064FF" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#A064FF" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }} />
              <YAxis stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
              <Tooltip {...TT} formatter={(v: number) => [formatZAR(v), "Withdrawals"]} />
              <Area type="monotone" dataKey="amount" stroke="#A064FF" fill="url(#gR)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

      </div>
    </AdminShell>
  );
}
