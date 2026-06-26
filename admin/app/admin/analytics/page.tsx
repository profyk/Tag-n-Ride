"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Spinner, Button } from "@/components/ui";
import { api } from "@/lib/api";
import { formatZAR } from "@/lib/utils";
import { Download, TrendingUp, TrendingDown, Zap, BarChart2, Activity, Percent, AlertTriangle } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart, Line,
} from "recharts";

const TT = {
  contentStyle: {
    background: "var(--bg2)", border: "1px solid var(--border)",
    borderRadius: 8, color: "var(--text)", fontSize: 12,
  },
};
const PIE_COLORS = ["#00D4FF", "#00E676", "#A064FF", "#FFD60A", "#FF8C42"];

const RANGES = ["7d", "30d", "90d"] as const;
type Range = typeof RANGES[number];

const RANGE_DAYS: Record<Range, number> = { "7d": 7, "30d": 30, "90d": 90 };

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
  const totalCount   = daily.reduce((s: number, d: any) => s + (d.count || 0), 0);
  const totalFees    = daily.reduce((s: number, d: any) => s + (d.fees || 0), 0);
  const prevRevenue  = data?.prev_volume ?? 0;
  const prevCount    = data?.prev_count ?? 0;
  const avgValue     = totalCount > 0 ? totalRevenue / totalCount : 0;
  const days         = RANGE_DAYS[range];
  const avgDaily     = days > 0 ? totalRevenue / days : 0;
  const takeRate     = totalRevenue > 0 ? (totalFees / totalRevenue) * 100 : 0;

  const peakDay      = daily.reduce((best: any, d: any) => (!best || d.amount > best.amount ? d : best), null);
  const peakCountDay = daily.reduce((best: any, d: any) => (!best || d.count > best.count ? d : best), null);
  const zeroDays     = daily.filter((d: any) => !d.amount || d.amount === 0).length;

  const byType = data?.transactions_by_type ?? [];

  const revGrowthPct = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;

  const exportCsv = () => {
    if (!daily.length) return;
    const rows = [
      ["Date", "Volume (ZAR)", "Transaction Count", "Fees (ZAR)"],
      ...daily.map((d: any) => [
        d.date || d.day || "",
        (d.amount || 0).toFixed(2),
        String(d.count || 0),
        (d.fees || 0).toFixed(2),
      ]),
    ];
    const csv = rows.map(r => r.map((c: string | number) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `analytics_${range}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminShell title="Analytics" subtitle="Platform performance metrics and transaction insights">
      <div className="space-y-6">

        {/* ── Range selector + export ── */}
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
            <Button variant="secondary" onClick={exportCsv}>
              <Download size={13} /> Export CSV
            </Button>
          </div>
        </div>

        {/* ── Hero summary cards ── */}
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
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Fee Revenue ({range})</p>
            <p className="text-2xl font-black text-green">{formatZAR(totalFees)}</p>
            <p className="text-[10px] text-textMuted mt-1">{takeRate.toFixed(2)}% take rate</p>
          </div>

          <div className="bg-bg2 border border-border rounded-xl p-4">
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Transactions ({range})</p>
            <p className="text-2xl font-black text-purple">{totalCount.toLocaleString()}</p>
            <div className="flex items-center gap-2 mt-1">
              <GrowthBadge current={totalCount} prev={prevCount} />
              <span className="text-[10px] text-textMuted">vs prev period</span>
            </div>
          </div>

          <div className="bg-bg2 border border-border rounded-xl p-4">
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Avg Transaction Value</p>
            <p className="text-2xl font-black text-yellow">{formatZAR(avgValue)}</p>
            <p className="text-[10px] text-textMuted mt-1">per payment</p>
          </div>
        </div>

        {/* ── Growth Momentum banner ── */}
        {prevRevenue > 0 && (
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-bold ${
            revGrowthPct > 0
              ? "bg-green/5 border-green/20 text-green"
              : revGrowthPct < 0
              ? "bg-red/5 border-red/20 text-red"
              : "bg-bg2 border-border text-textMuted"
          }`}>
            {revGrowthPct > 0
              ? <TrendingUp size={15} className="flex-shrink-0" />
              : revGrowthPct < 0
              ? <TrendingDown size={15} className="flex-shrink-0" />
              : <Activity size={15} className="flex-shrink-0" />}
            {revGrowthPct > 0
              ? `Revenue grew ${revGrowthPct.toFixed(1)}% vs the previous ${range} period`
              : revGrowthPct < 0
              ? `Revenue declined ${Math.abs(revGrowthPct).toFixed(1)}% vs the previous ${range} period`
              : `Revenue is flat vs the previous ${range} period`}
          </div>
        )}

        {/* ── Daily Volume — ComposedChart with secondary Y for count ── */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest">Daily Volume ({range})</h2>
            <div className="flex items-center gap-4 text-xs text-textMuted">
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-cyan inline-block rounded" /> Revenue</span>
              {totalFees > 0 && <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-green inline-block rounded" /> Fees</span>}
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-purple inline-block rounded border-dashed" /> Txn Count</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart
              data={daily}
              onClick={(e) => {
                if (e?.activePayload?.[0]?.payload?.date) {
                  const d = e.activePayload[0].payload.date;
                  window.location.href = `/admin/transactions?from=${d}&to=${d}`;
                }
              }}
              style={{ cursor: "pointer" }}>
              <defs>
                <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00D4FF" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#00D4FF" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gF" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00E676" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#00E676" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }} />
              <YAxis yAxisId="left" stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
              <YAxis yAxisId="right" orientation="right" stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }} />
              <Tooltip {...TT} formatter={(v: number, n: string) => {
                if (n === "amount") return [formatZAR(v), "Revenue"];
                if (n === "fees")   return [formatZAR(v), "Fees"];
                return [v, "Txn Count"];
              }} />
              <Area yAxisId="left" type="monotone" dataKey="amount" stroke="#00D4FF" fill="url(#gC)" strokeWidth={2} dot={false} name="amount" />
              {totalFees > 0 && (
                <Area yAxisId="left" type="monotone" dataKey="fees" stroke="#00E676" fill="url(#gF)" strokeWidth={1.5} dot={false} name="fees" />
              )}
              <Line yAxisId="right" type="monotone" dataKey="count" stroke="#A064FF" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="count" />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-textDim mt-2 text-center">Click any point to view transactions for that date</p>
        </Card>

        {/* ── 2-column charts row ── */}
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
                  <Pie data={byType} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
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

        {/* ── Fee Breakdown card ── */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Percent size={15} className="text-green" />
            <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest">Fee & Revenue Breakdown</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Gross Volume</p>
              <p className="text-xl font-black text-cyan">{formatZAR(totalRevenue)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Fee Revenue</p>
              <p className="text-xl font-black text-green">{formatZAR(totalFees)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Take Rate</p>
              <p className="text-xl font-black text-yellow">{takeRate.toFixed(2)}%</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Passed to Drivers</p>
              <p className="text-xl font-black text-purple">{formatZAR(totalRevenue - totalFees)}</p>
            </div>
          </div>
          {/* Take rate bar */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-textDim">Fee portion</span>
              <span className="text-[10px] text-textDim">Driver net</span>
            </div>
            <div className="h-3 bg-bg3 rounded-full overflow-hidden flex">
              <div className="h-full bg-green/70 rounded-l-full transition-all" style={{ width: `${Math.min(takeRate, 100)}%` }} />
              <div className="h-full bg-cyan/30 flex-1 rounded-r-full" />
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-green font-bold">{takeRate.toFixed(2)}% platform fee</span>
              <span className="text-[10px] text-cyan font-bold">{(100 - takeRate).toFixed(2)}% to drivers</span>
            </div>
          </div>
        </Card>

        {/* ── Platform Performance section ── */}
        <div>
          <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <BarChart2 size={11} /> Platform Performance ({range})
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-bg2 border border-border rounded-xl p-4">
              <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Avg Daily Revenue</p>
              <p className="text-xl font-black text-cyan">{formatZAR(avgDaily)}</p>
              <p className="text-[10px] text-textDim mt-0.5">per day over {days}d</p>
            </div>

            <div className="bg-bg2 border border-border rounded-xl p-4">
              <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Peak Revenue Day</p>
              {peakDay ? (
                <>
                  <p className="text-xl font-black text-green">{formatZAR(peakDay.amount)}</p>
                  <p className="text-[10px] text-textDim mt-0.5">{peakDay.date}</p>
                </>
              ) : <p className="text-textDim text-sm">—</p>}
            </div>

            <div className="bg-bg2 border border-border rounded-xl p-4">
              <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Busiest Day</p>
              {peakCountDay ? (
                <>
                  <p className="text-xl font-black text-purple">{peakCountDay.count?.toLocaleString()}</p>
                  <p className="text-[10px] text-textDim mt-0.5">txns on {peakCountDay.date}</p>
                </>
              ) : <p className="text-textDim text-sm">—</p>}
            </div>

            <div className={`bg-bg2 border rounded-xl p-4 ${zeroDays > 0 ? "border-yellow/20" : "border-border"}`}>
              <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Quiet Days</p>
              <p className={`text-xl font-black ${zeroDays > 0 ? "text-yellow" : "text-green"}`}>{zeroDays}</p>
              <p className="text-[10px] text-textDim mt-0.5">days with no volume</p>
              {zeroDays > 3 && (
                <div className="flex items-center gap-1 mt-1">
                  <AlertTriangle size={9} className="text-yellow" />
                  <span className="text-[9px] text-yellow font-bold">Review gaps</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Withdrawal trend ── */}
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
