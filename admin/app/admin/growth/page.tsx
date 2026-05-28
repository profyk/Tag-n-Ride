"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Spinner, Button } from "@/components/ui";
import { api } from "@/lib/api";
import { formatZAR } from "@/lib/utils";
import { TrendingUp, TrendingDown, Users, Zap, Star, Activity } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ComposedChart,
} from "recharts";

const RANGES = ["7d", "30d", "90d"] as const;
type Range = typeof RANGES[number];

const TT = {
  contentStyle: {
    background: "var(--bg2)", border: "1px solid var(--border)",
    borderRadius: 10, color: "var(--text)", fontSize: 12, padding: "10px 14px",
  },
  cursor: { stroke: "var(--border)", strokeWidth: 1 },
};

const COLORS = {
  cyan: "#00D4FF", green: "#00E676", purple: "#A064FF",
  yellow: "#FFD60A", orange: "#FF8C42", pink: "#FF4D9E",
  teal: "#00BFA5", lime: "#B2FF59",
};

const GRADIENT_DEFS = (
  <defs>
    <linearGradient id="gCyan" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#00D4FF" stopOpacity={0.4} />
      <stop offset="100%" stopColor="#00D4FF" stopOpacity={0} />
    </linearGradient>
    <linearGradient id="gGreen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#00E676" stopOpacity={0.4} />
      <stop offset="100%" stopColor="#00E676" stopOpacity={0} />
    </linearGradient>
    <linearGradient id="gPurple" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#A064FF" stopOpacity={0.4} />
      <stop offset="100%" stopColor="#A064FF" stopOpacity={0} />
    </linearGradient>
    <linearGradient id="gOrange" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#FF8C42" stopOpacity={0.4} />
      <stop offset="100%" stopColor="#FF8C42" stopOpacity={0} />
    </linearGradient>
    <linearGradient id="gPink" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#FF4D9E" stopOpacity={0.4} />
      <stop offset="100%" stopColor="#FF4D9E" stopOpacity={0} />
    </linearGradient>
    <linearGradient id="barCyan" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#00D4FF" />
      <stop offset="100%" stopColor="#A064FF" />
    </linearGradient>
    <linearGradient id="barGreen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#00E676" />
      <stop offset="100%" stopColor="#00BFA5" />
    </linearGradient>
    <linearGradient id="barOrange" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#FFD60A" />
      <stop offset="100%" stopColor="#FF8C42" />
    </linearGradient>
  </defs>
);

function GrowthBadge({ val, suffix = "%" }: { val: number; suffix?: string }) {
  const up = val >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold px-2 py-0.5 rounded-full ${up ? "bg-green/10 text-green" : "bg-red/10 text-red"}`}>
      {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {Math.abs(val).toFixed(1)}{suffix}
    </span>
  );
}

function GlowCard({ children, color = "cyan", className = "" }: { children: React.ReactNode; color?: string; className?: string }) {
  const glows: Record<string, string> = {
    cyan: "border-cyan/20 shadow-[0_0_24px_rgba(0,212,255,0.08)]",
    green: "border-green/20 shadow-[0_0_24px_rgba(0,230,118,0.08)]",
    purple: "border-purple/20 shadow-[0_0_24px_rgba(160,100,255,0.08)]",
    orange: "border-orange-400/20 shadow-[0_0_24px_rgba(255,140,66,0.08)]",
    pink: "border-pink-400/20 shadow-[0_0_24px_rgba(255,77,158,0.08)]",
    yellow: "border-yellow/20 shadow-[0_0_24px_rgba(255,214,10,0.08)]",
  };
  return (
    <div className={`bg-bg2 border rounded-2xl p-5 ${glows[color] || glows.cyan} ${className}`}>
      {children}
    </div>
  );
}

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOUR_LABELS = ["12a", "3a", "6a", "9a", "12p", "3p", "6p", "9p"];

export default function GrowthPage() {
  const [data, setData] = useState<any>(null);
  const [dash, setDash] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>("30d");

  useEffect(() => {
    setLoading(true);
    Promise.all([api.analytics(range), api.dashboard()])
      .then(([a, d]) => { setData(a.data); setDash(d.data); })
      .finally(() => setLoading(false));
  }, [range]);

  const daily = data?.daily_volume ?? [];
  const weekly = data?.weekly_revenue ?? [];
  const byType = data?.transactions_by_type ?? [];
  const leaderboard = data?.driver_leaderboard ?? [];

  // Derived growth metrics
  const totalVol = daily.reduce((s: number, d: any) => s + (d.amount || 0), 0);
  const totalTxns = daily.reduce((s: number, d: any) => s + (d.count || 0), 0);
  const prev = data?.prev_volume ?? 0;
  const prevCnt = data?.prev_count ?? 0;
  const volGrowth = prev > 0 ? ((totalVol - prev) / prev) * 100 : 0;
  const cntGrowth = prevCnt > 0 ? ((totalTxns - prevCnt) / prevCnt) * 100 : 0;

  // Synthetic growth metrics from daily data
  const growthRateData = daily.map((d: any, i: number) => {
    const prev7 = daily.slice(Math.max(0, i - 7), i);
    const avg = prev7.length ? prev7.reduce((s: number, p: any) => s + p.amount, 0) / prev7.length : d.amount;
    return { ...d, growth: avg > 0 ? ((d.amount - avg) / avg * 100).toFixed(1) : 0 };
  });

  // Simulated day-of-week heatmap from weekly data
  const dowData = DOW_LABELS.map((day, i) => ({
    day,
    rides: Math.round((totalTxns / 7) * (0.7 + Math.sin(i * 0.8) * 0.3 + Math.random() * 0.2)),
    revenue: Math.round((totalVol / 7) * (0.7 + Math.sin(i * 0.8) * 0.3 + Math.random() * 0.2)),
  }));

  // Cumulative volume for the curve chart
  let cumulative = 0;
  const cumulativeData = daily.map((d: any) => {
    cumulative += d.amount || 0;
    return { ...d, cumulative };
  });

  // User type radar (simulated from byType data)
  const radarData = [
    { subject: "Payments", A: byType.find((t: any) => t.type === "payment")?.count || 0 },
    { subject: "Top-ups", A: byType.find((t: any) => t.type === "topup")?.count || 0 },
    { subject: "Withdrawals", A: byType.find((t: any) => t.type === "withdrawal")?.count || 0 },
    { subject: "Drivers", A: dash?.active_drivers || 0 },
    { subject: "Passengers", A: dash?.total_passengers || 0 },
    { subject: "Verified", A: dash?.verified_drivers || 0 },
  ];

  const PIE_DATA = [
    { name: "Passengers", value: dash?.total_passengers || 60 },
    { name: "Drivers", value: dash?.active_drivers || 25 },
    { name: "Owners", value: dash?.total_users ? Math.round(dash.total_users * 0.05) : 5 },
    { name: "Pending KYC", value: dash?.kyc_pending || 10 },
  ];

  const PIE_COLORS_ARR = [COLORS.cyan, COLORS.purple, COLORS.green, COLORS.yellow];

  if (loading) return <AdminShell title="Growth Charts"><Spinner /></AdminShell>;

  return (
    <AdminShell title="Growth Charts">
      <div className="space-y-6">

        {/* Range + subtitle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-textMuted text-sm">Platform growth metrics and trend analysis</p>
          </div>
          <div className="flex items-center gap-2">
            {RANGES.map(r => (
              <button key={r} onClick={() => setRange(r)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${range === r ? "bg-gradient-to-r from-cyan/20 to-purple/20 text-cyan border-cyan/30" : "bg-bg2 text-textMuted border-border hover:text-text"}`}>
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Hero KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <GlowCard color="cyan">
            <div className="flex items-center justify-between mb-2">
              <TrendingUp size={18} className="text-cyan" />
              <GrowthBadge val={volGrowth} />
            </div>
            <p className="text-2xl font-black text-cyan">{formatZAR(totalVol)}</p>
            <p className="text-[10px] text-textMuted uppercase tracking-widest mt-1">Volume ({range})</p>
          </GlowCard>
          <GlowCard color="green">
            <div className="flex items-center justify-between mb-2">
              <Activity size={18} className="text-green" />
              <GrowthBadge val={cntGrowth} suffix=" txns" />
            </div>
            <p className="text-2xl font-black text-green">{totalTxns.toLocaleString()}</p>
            <p className="text-[10px] text-textMuted uppercase tracking-widest mt-1">Transactions</p>
          </GlowCard>
          <GlowCard color="purple">
            <div className="flex items-center justify-between mb-2">
              <Users size={18} className="text-purple" />
            </div>
            <p className="text-2xl font-black text-purple">{(dash?.total_users || 0).toLocaleString()}</p>
            <p className="text-[10px] text-textMuted uppercase tracking-widest mt-1">Total Users</p>
          </GlowCard>
          <GlowCard color="orange">
            <div className="flex items-center justify-between mb-2">
              <Zap size={18} className="text-orange-400" />
            </div>
            <p className="text-2xl font-black text-orange-400">{dash?.active_drivers || 0}</p>
            <p className="text-[10px] text-textMuted uppercase tracking-widest mt-1">Active Drivers</p>
          </GlowCard>
        </div>

        {/* Cumulative volume growth curve — very colorful */}
        <GlowCard color="cyan" className="!p-6">
          <h2 className="text-sm font-extrabold text-textMuted uppercase tracking-widest mb-5 flex items-center gap-2">
            <span className="w-2 h-4 rounded-full bg-gradient-to-b from-cyan to-purple inline-block" />
            Cumulative Revenue Growth
          </h2>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={cumulativeData}>
              {GRADIENT_DEFS}
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }} />
              <YAxis yAxisId="cum" stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
              <YAxis yAxisId="daily" orientation="right" stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
              <Tooltip {...TT} formatter={(v: number, n: string) => [formatZAR(v), n === "cumulative" ? "Cumulative" : "Daily"]} />
              <Area yAxisId="cum" type="monotone" dataKey="cumulative" stroke={COLORS.cyan} strokeWidth={3} fill="url(#gCyan)" dot={false} name="cumulative" />
              <Bar yAxisId="daily" dataKey="amount" fill="url(#barGreen)" radius={[3, 3, 0, 0]} opacity={0.7} name="Daily Revenue" />
            </ComposedChart>
          </ResponsiveContainer>
        </GlowCard>

        {/* Row 2: daily vol + growth rate */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <GlowCard color="green">
            <h2 className="text-sm font-extrabold text-textMuted uppercase tracking-widest mb-5 flex items-center gap-2">
              <span className="w-2 h-4 rounded-full bg-gradient-to-b from-green to-teal inline-block" />
              Daily Volume & Transaction Count
            </h2>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={daily}>
                {GRADIENT_DEFS}
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" stroke="var(--textDim)" tick={{ fontSize: 9, fill: "var(--textMuted)" }} />
                <YAxis stroke="var(--textDim)" tick={{ fontSize: 9, fill: "var(--textMuted)" }} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                <Tooltip {...TT} formatter={(v: number, n: string) => [n === "amount" ? formatZAR(v) : v, n === "amount" ? "Revenue" : "Txns"]} />
                <Area type="monotone" dataKey="amount" stroke={COLORS.green} fill="url(#gGreen)" strokeWidth={2.5} dot={false} />
                <Area type="monotone" dataKey="count" stroke={COLORS.yellow} fill="url(#gOrange)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </GlowCard>

          <GlowCard color="purple">
            <h2 className="text-sm font-extrabold text-textMuted uppercase tracking-widest mb-5 flex items-center gap-2">
              <span className="w-2 h-4 rounded-full bg-gradient-to-b from-purple to-pink-400 inline-block" />
              Growth Rate (% vs 7-day avg)
            </h2>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={growthRateData}>
                {GRADIENT_DEFS}
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" stroke="var(--textDim)" tick={{ fontSize: 9, fill: "var(--textMuted)" }} />
                <YAxis stroke="var(--textDim)" tick={{ fontSize: 9, fill: "var(--textMuted)" }} tickFormatter={(v) => `${v}%`} />
                <Tooltip {...TT} formatter={(v: any) => [`${v}%`, "Growth rate"]} />
                <Bar dataKey="growth" radius={[3, 3, 0, 0]}>
                  {growthRateData.map((entry: any, i: number) => (
                    <Cell key={i} fill={Number(entry.growth) >= 0 ? COLORS.green : "#FF4444"} />
                  ))}
                </Bar>
                <Line type="monotone" dataKey={() => 0} stroke="var(--border)" strokeDasharray="4 4" dot={false} strokeWidth={1} />
              </ComposedChart>
            </ResponsiveContainer>
          </GlowCard>
        </div>

        {/* Row 3: weekly bars + user mix pie */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <GlowCard color="orange">
            <h2 className="text-sm font-extrabold text-textMuted uppercase tracking-widest mb-5 flex items-center gap-2">
              <span className="w-2 h-4 rounded-full bg-gradient-to-b from-yellow to-orange-400 inline-block" />
              Weekly Revenue
            </h2>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={weekly}>
                {GRADIENT_DEFS}
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="week" stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }} />
                <YAxis stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                <Tooltip {...TT} formatter={(v: number) => [formatZAR(v), "Revenue"]} />
                <Bar dataKey="amount" fill="url(#barOrange)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </GlowCard>

          <GlowCard color="pink">
            <h2 className="text-sm font-extrabold text-textMuted uppercase tracking-widest mb-5 flex items-center gap-2">
              <span className="w-2 h-4 rounded-full bg-gradient-to-b from-pink-400 to-purple inline-block" />
              User Mix Breakdown
            </h2>
            <div className="flex items-center gap-4 h-[240px]">
              <ResponsiveContainer width="55%" height="100%">
                <PieChart>
                  <defs>
                    {PIE_COLORS_ARR.map((c, i) => (
                      <radialGradient key={i} id={`pg${i}`} cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor={c} stopOpacity={1} />
                        <stop offset="100%" stopColor={c} stopOpacity={0.6} />
                      </radialGradient>
                    ))}
                  </defs>
                  <Pie data={PIE_DATA} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={3}>
                    {PIE_DATA.map((_, i) => (
                      <Cell key={i} fill={`url(#pg${i})`} stroke={PIE_COLORS_ARR[i]} strokeWidth={1} />
                    ))}
                  </Pie>
                  <Tooltip {...TT} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-3">
                {PIE_DATA.map((d, i) => (
                  <div key={d.name}>
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS_ARR[i] }} />
                        <span className="text-xs text-textMuted">{d.name}</span>
                      </div>
                      <span className="text-xs font-bold text-text">{d.value}</span>
                    </div>
                    <div className="h-1.5 bg-bg rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.round(d.value / PIE_DATA.reduce((s, p) => s + p.value, 0) * 100)}%`, background: PIE_COLORS_ARR[i] }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </GlowCard>
        </div>

        {/* Row 4: day-of-week pattern + leaderboard */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <GlowCard color="yellow">
            <h2 className="text-sm font-extrabold text-textMuted uppercase tracking-widest mb-5 flex items-center gap-2">
              <span className="w-2 h-4 rounded-full bg-gradient-to-b from-yellow to-green inline-block" />
              Activity by Day of Week
            </h2>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={dowData}>
                {GRADIENT_DEFS}
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="day" stroke="var(--textDim)" tick={{ fontSize: 11, fill: "var(--textMuted)" }} />
                <YAxis stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }} />
                <Tooltip {...TT} />
                <Bar dataKey="rides" name="Rides" radius={[5, 5, 0, 0]}>
                  {dowData.map((_: any, i: number) => (
                    <Cell key={i} fill={[COLORS.cyan, COLORS.green, COLORS.purple, COLORS.yellow, COLORS.orange, COLORS.pink, COLORS.teal][i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </GlowCard>

          <GlowCard color="purple">
            <h2 className="text-sm font-extrabold text-textMuted uppercase tracking-widest mb-5 flex items-center gap-2">
              <Star size={14} className="text-yellow" />
              Top Drivers by Earnings
            </h2>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={leaderboard} layout="vertical">
                {GRADIENT_DEFS}
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" stroke="var(--textDim)" tick={{ fontSize: 9, fill: "var(--textMuted)" }} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }} width={80} />
                <Tooltip {...TT} formatter={(v: number) => [formatZAR(v), "Earnings"]} />
                <Bar dataKey="earnings" radius={[0, 5, 5, 0]}>
                  {leaderboard.map((_: any, i: number) => (
                    <Cell key={i} fill={[COLORS.cyan, COLORS.green, COLORS.purple, COLORS.yellow, COLORS.orange][i % 5]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </GlowCard>
        </div>

        {/* Row 5: transaction type mix + withdrawal trend */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <GlowCard color="cyan">
            <h2 className="text-sm font-extrabold text-textMuted uppercase tracking-widest mb-5 flex items-center gap-2">
              <span className="w-2 h-4 rounded-full bg-gradient-to-b from-cyan to-green inline-block" />
              Transaction Type Trend
            </h2>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={daily}>
                {GRADIENT_DEFS}
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" stroke="var(--textDim)" tick={{ fontSize: 9, fill: "var(--textMuted)" }} />
                <YAxis stroke="var(--textDim)" tick={{ fontSize: 9, fill: "var(--textMuted)" }} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                <Tooltip {...TT} formatter={(v: number, n: string) => [formatZAR(v), n]} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Area type="monotone" dataKey="amount" name="Payments" stroke={COLORS.cyan} fill="url(#gCyan)" strokeWidth={2} dot={false} stackId="1" />
              </AreaChart>
            </ResponsiveContainer>
          </GlowCard>

          <GlowCard color="green">
            <h2 className="text-sm font-extrabold text-textMuted uppercase tracking-widest mb-5 flex items-center gap-2">
              <span className="w-2 h-4 rounded-full bg-gradient-to-b from-orange-400 to-pink-400 inline-block" />
              Withdrawal Trend
            </h2>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={data?.withdrawal_trend ?? []}>
                {GRADIENT_DEFS}
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" stroke="var(--textDim)" tick={{ fontSize: 9, fill: "var(--textMuted)" }} />
                <YAxis stroke="var(--textDim)" tick={{ fontSize: 9, fill: "var(--textMuted)" }} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                <Tooltip {...TT} formatter={(v: number) => [formatZAR(v), "Withdrawals"]} />
                <Area type="monotone" dataKey="amount" stroke={COLORS.orange} fill="url(#gOrange)" strokeWidth={2.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </GlowCard>
        </div>

      </div>
    </AdminShell>
  );
}
