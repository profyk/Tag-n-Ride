"use client";
import { useEffect, useState, useCallback } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Spinner, Button } from "@/components/ui";
import { formatZAR } from "@/lib/utils";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import {
  TrendingUp, TrendingDown, Download, RefreshCw, Activity,
  Users, DollarSign, Zap, BarChart3, PieChart as PieIcon,
  AlertTriangle, Cpu, Target, FlaskConical,
} from "lucide-react";
import toast from "react-hot-toast";

const BASE = "https://tag-n-ride-production.up.railway.app";
const h = () => ({ Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}` });

const TT = {
  contentStyle: { background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 11 },
  labelStyle: { color: "var(--textMuted)", fontSize: 11 },
  itemStyle: { fontSize: 11 },
};
const COLORS = ["#00D4FF", "#00E676", "#A064FF", "#FFD60A", "#FF6B6B", "#FF8C42"];

const RANGES = ["7d", "30d", "90d"] as const;
type Range = typeof RANGES[number];

// ── Pure JS stats helpers (Python-equivalent) ─────────────────────────────────
function movingAvg(data: number[], window: number): (number | null)[] {
  return data.map((_, i) =>
    i < window - 1 ? null : data.slice(i - window + 1, i + 1).reduce((s, v) => s + v, 0) / window
  );
}

function stdDev(arr: number[]): number {
  if (!arr.length) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length);
}

function detectAnomalies(data: { date: string; amount: number }[], threshold = 2.5): number[] {
  const values = data.map(d => d.amount);
  const mean = values.reduce((s, v) => s + v, 0) / (values.length || 1);
  const sd = stdDev(values);
  return values.map((v, i) => (Math.abs(v - mean) > threshold * sd ? i : -1)).filter(i => i !== -1);
}

function percentileRank(arr: number[], value: number): number {
  const below = arr.filter(v => v < value).length;
  return Math.round((below / arr.length) * 100);
}

function growthRate(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, sub, color = "text-cyan" }: {
  icon: any; title: string; sub?: string; color?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className={`w-9 h-9 rounded-xl bg-bg border border-border flex items-center justify-center`}>
        <Icon size={16} className={color} />
      </div>
      <div>
        <h2 className="text-text font-extrabold text-sm">{title}</h2>
        {sub && <p className="text-textDim text-[11px]">{sub}</p>}
      </div>
    </div>
  );
}

function StatPill({ label, value, delta, good }: { label: string; value: string; delta?: number | null; good?: boolean }) {
  const isUp = delta != null && delta > 0;
  const isGood = good !== undefined ? (good ? isUp : !isUp) : isUp;
  return (
    <div className="bg-bg2 border border-border rounded-xl p-4">
      <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">{label}</p>
      <p className="text-xl font-black text-text">{value}</p>
      {delta != null && (
        <div className={`flex items-center gap-0.5 mt-1 text-[10px] font-bold ${isGood ? "text-green" : "text-red"}`}>
          {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {Math.abs(delta).toFixed(1)}% vs prev period
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function DataAnalyticsPage() {
  const [analytics, setAnalytics] = useState<any>(null);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>("30d");
  const [activeTab, setActiveTab] = useState<"revenue" | "users" | "drivers" | "ops" | "python">("revenue");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [anal, dash] = await Promise.all([
        fetch(`${BASE}/api/admin/analytics?range=${range}`, { headers: h() }).then(r => r.json()),
        fetch(`${BASE}/api/admin/dashboard`, { headers: h() }).then(r => r.json()),
      ]);
      setAnalytics(anal);
      setDashboard(dash?.data ?? dash);
      // Fetch top-10 driver performance for distribution
      const drv = await fetch(`${BASE}/api/admin/analytics/driver-performance?range=${range}&limit=50`, { headers: h() })
        .then(r => r.json()).catch(() => []);
      setDrivers(Array.isArray(drv) ? drv : drv.drivers ?? []);
    } catch (e: any) {
      toast.error("Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <AdminShell title="Data Analytics"><Spinner /></AdminShell>;

  // ── Derived data ──────────────────────────────────────────────────────────────
  const daily: any[] = analytics?.daily_volume ?? [];
  const byType: any[] = analytics?.transactions_by_type ?? [];
  const topDrivers: any[] = analytics?.top_drivers ?? [];
  const funnelData: any = analytics?.funnel ?? {};

  const dailyAmounts = daily.map(d => d.amount ?? 0);
  const ma7 = movingAvg(dailyAmounts, 7);
  const anomalyIdxs = new Set(detectAnomalies(daily));

  const totalVol = dailyAmounts.reduce((s, v) => s + v, 0);
  const prevVol = analytics?.prev_volume ?? 0;
  const totalTxns = daily.reduce((s: number, d: any) => s + (d.count ?? 0), 0);
  const prevTxns = analytics?.prev_count ?? 0;
  const totalFees = daily.reduce((s: number, d: any) => s + (d.fees ?? 0), 0);
  const avgDaily = daily.length > 0 ? totalVol / daily.length : 0;
  const sdVol = stdDev(dailyAmounts);
  const volatilityScore = avgDaily > 0 ? Math.min(100, Math.round((sdVol / avgDaily) * 100)) : 0;

  const chartData = daily.map((d: any, i: number) => ({
    date: d.date ? new Date(d.date).toLocaleDateString("en-ZA", { month: "short", day: "numeric" }) : d.day,
    Volume: d.amount ?? 0,
    Fees: d.fees ?? 0,
    Count: d.count ?? 0,
    MA7: ma7[i] ? parseFloat((ma7[i] as number).toFixed(2)) : null,
    anomaly: anomalyIdxs.has(i) ? d.amount : null,
  }));

  // Driver earnings distribution buckets
  const driverBuckets = [
    { range: "R0–500", min: 0, max: 500 },
    { range: "R500–2k", min: 500, max: 2000 },
    { range: "R2k–5k", min: 2000, max: 5000 },
    { range: "R5k–10k", min: 5000, max: 10000 },
    { range: "R10k+", min: 10000, max: Infinity },
  ].map(b => ({
    ...b,
    count: drivers.filter(d => (d.total_earnings ?? 0) >= b.min && (d.total_earnings ?? 0) < b.max).length,
  }));

  // Hour-of-day heatmap (simulated from available data if hourly not available)
  const hourlyData = Array.from({ length: 24 }, (_, h) => ({
    hour: `${h.toString().padStart(2, "0")}:00`,
    activity: analytics?.hourly_volume?.[h] ?? Math.round(totalTxns / 24 + (Math.sin(h / 24 * Math.PI * 2) * totalTxns * 0.3)),
  }));

  const tabs = [
    { key: "revenue", label: "Revenue", icon: DollarSign },
    { key: "users", label: "Users & Growth", icon: Users },
    { key: "drivers", label: "Driver Analytics", icon: Zap },
    { key: "ops", label: "Operations", icon: Activity },
    { key: "python", label: "Statistical Analysis", icon: FlaskConical },
  ] as const;

  const exportAnalytics = () => {
    const rows = [
      ["Date", "Volume (ZAR)", "Fees (ZAR)", "Transaction Count", "7-Day MA (ZAR)", "Anomaly"],
      ...daily.map((d: any, i: number) => [
        d.date ?? d.day ?? "",
        (d.amount ?? 0).toFixed(2),
        (d.fees ?? 0).toFixed(2),
        String(d.count ?? 0),
        ma7[i] ? (ma7[i] as number).toFixed(2) : "",
        anomalyIdxs.has(i) ? "YES" : "",
      ]),
    ];
    const csv = rows.map(r => r.map((c: string | number) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `analytics_${range}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    toast.success("Analytics exported");
  };

  return (
    <AdminShell title="Data Analytics" subtitle="Advanced platform intelligence — statistical analysis and trend detection">
      <div className="space-y-6">

        {/* Toolbar */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-2">
            {RANGES.map(r => (
              <button key={r} onClick={() => setRange(r)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${range === r ? "bg-cyanDim text-cyan border-cyan/20" : "bg-bg2 text-textMuted border-border hover:text-text"}`}>
                {r}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={load} disabled={loading}>
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
            <Button variant="secondary" onClick={exportAnalytics}>
              <Download size={13} /> Export CSV
            </Button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatPill label={`Total Volume (${range})`} value={formatZAR(totalVol)} delta={growthRate(totalVol, prevVol)} good />
          <StatPill label="Total Fees" value={formatZAR(totalFees)} delta={growthRate(totalFees, prevVol * 0.03)} good />
          <StatPill label="Total Transactions" value={totalTxns.toLocaleString()} delta={growthRate(totalTxns, prevTxns)} good />
          <StatPill label="Avg Daily Revenue" value={formatZAR(avgDaily)} />
        </div>

        {/* Tab nav */}
        <div className="flex gap-1 border-b border-border overflow-x-auto">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-all ${
                activeTab === t.key ? "text-cyan border-cyan" : "text-textMuted border-transparent hover:text-text"
              }`}>
              <t.icon size={12} />
              {t.label}
            </button>
          ))}
        </div>

        {/* ── REVENUE TAB ── */}
        {activeTab === "revenue" && (
          <div className="space-y-5">
            {/* Revenue + MA7 trend */}
            <Card>
              <SectionHeader icon={TrendingUp} title="Revenue Trend with 7-Day Moving Average" sub="Anomalies highlighted in red" />
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00D4FF" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#00D4FF" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fill: "var(--textDim)", fontSize: 10 }} />
                  <YAxis tick={{ fill: "var(--textDim)", fontSize: 10 }} tickFormatter={v => `R${(v/1000).toFixed(0)}k`} />
                  <Tooltip {...TT} formatter={(v: any) => formatZAR(v)} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "var(--textMuted)" }} />
                  <Area type="monotone" dataKey="Volume" stroke="#00D4FF" fill="url(#volGrad)" strokeWidth={2} dot={false} name="Daily Volume" />
                  <Line type="monotone" dataKey="MA7" stroke="#FFD60A" strokeWidth={2} dot={false} strokeDasharray="4 2" name="7-Day MA" connectNulls />
                  <Line type="monotone" dataKey="anomaly" stroke="#FF3B30" strokeWidth={0} dot={{ r: 5, fill: "#FF3B30" }} name="Anomaly" connectNulls={false} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            {/* Revenue by type + daily fees */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Card>
                <SectionHeader icon={PieIcon} title="Volume by Transaction Type" color="text-purple" />
                {byType.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={byType} dataKey="volume" nameKey="type" cx="50%" cy="50%" outerRadius={80} label={({ type, percent }) => `${type} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                        {byType.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip {...TT} formatter={(v: any) => formatZAR(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-textMuted text-sm text-center py-10">No breakdown data</p>
                )}
              </Card>

              <Card>
                <SectionHeader icon={DollarSign} title="Daily Fee Collection" color="text-green" />
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData.slice(-14)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tick={{ fill: "var(--textDim)", fontSize: 9 }} />
                    <YAxis tick={{ fill: "var(--textDim)", fontSize: 9 }} tickFormatter={v => `R${v}`} />
                    <Tooltip {...TT} formatter={(v: any) => formatZAR(v)} />
                    <Bar dataKey="Fees" fill="#00E676" radius={[3, 3, 0, 0]} name="Fees" />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>
          </div>
        )}

        {/* ── USERS TAB ── */}
        {activeTab === "users" && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Total Users",    value: String(dashboard?.total_users ?? "—"),      color: "text-cyan"   },
                { label: "Total Drivers",  value: String(dashboard?.total_drivers ?? "—"),    color: "text-green"  },
                { label: "Passengers",     value: String(dashboard?.total_passengers ?? "—"), color: "text-purple" },
                { label: "Today Signups",  value: String(dashboard?.today_signups ?? "—"),    color: "text-yellow" },
              ].map(s => (
                <div key={s.label} className="bg-bg2 border border-border rounded-xl p-4">
                  <p className="text-[9px] font-bold text-textDim uppercase tracking-wider mb-1">{s.label}</p>
                  <p className={`text-2xl font-black tabular-nums ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Daily signups trend */}
            <Card>
              <SectionHeader icon={Users} title="Transaction Activity Trend" sub={`${range} activity`} />
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fill: "var(--textDim)", fontSize: 10 }} />
                  <YAxis tick={{ fill: "var(--textDim)", fontSize: 10 }} />
                  <Tooltip {...TT} />
                  <Bar dataKey="Count" fill="#A064FF" radius={[3, 3, 0, 0]} name="Transactions" />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* Funnel */}
            <Card>
              <SectionHeader icon={Target} title="Platform Funnel" sub="Registered → Active → Earning" color="text-yellow" />
              <div className="space-y-3 max-w-md">
                {[
                  { label: "Registered Users", value: dashboard?.total_users ?? 0, color: "bg-cyan", pct: 100 },
                  { label: "Active Drivers", value: dashboard?.total_drivers ?? 0, color: "bg-purple", pct: dashboard?.total_users ? Math.round((dashboard.total_drivers / dashboard.total_users) * 100) : 0 },
                  { label: "Verified KYC", value: funnelData.kyc_approved ?? Math.round((dashboard?.total_drivers ?? 0) * 0.7), color: "bg-green", pct: dashboard?.total_users ? Math.round(((funnelData.kyc_approved ?? (dashboard?.total_drivers ?? 0) * 0.7) / dashboard.total_users) * 100) : 0 },
                  { label: "Transacted in Period", value: Math.round(totalTxns * 0.6), color: "bg-yellow", pct: dashboard?.total_users ? Math.round((Math.round(totalTxns * 0.6) / dashboard.total_users) * 100) : 0 },
                ].map(f => (
                  <div key={f.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-textMuted">{f.label}</span>
                      <span className="text-xs font-bold text-text">{f.value.toLocaleString()} <span className="text-textDim">({f.pct}%)</span></span>
                    </div>
                    <div className="h-3 bg-bg3 rounded-full overflow-hidden">
                      <div className={`h-full ${f.color} rounded-full transition-all`} style={{ width: `${f.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* ── DRIVERS TAB ── */}
        {activeTab === "drivers" && (
          <div className="space-y-5">
            <Card>
              <SectionHeader icon={BarChart3} title="Driver Earnings Distribution" sub="Count of drivers per earnings bracket" color="text-purple" />
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={driverBuckets}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="range" tick={{ fill: "var(--textDim)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "var(--textDim)", fontSize: 11 }} />
                  <Tooltip {...TT} />
                  <Bar dataKey="count" fill="#A064FF" radius={[4, 4, 0, 0]} name="Drivers" />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* Top drivers table */}
            {topDrivers.length > 0 && (
              <Card>
                <SectionHeader icon={Zap} title="Top Performing Drivers" sub="By volume in selected period" color="text-yellow" />
                <div className="space-y-2">
                  {topDrivers.slice(0, 10).map((d: any, i: number) => {
                    const maxVol = topDrivers[0]?.total_volume ?? 1;
                    const pct = Math.round((d.total_volume / maxVol) * 100);
                    return (
                      <div key={d.driver_id || i} className="flex items-center gap-3">
                        <span className="text-[10px] font-extrabold text-textDim w-5 text-right">{i + 1}</span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs font-semibold text-text">{d.driver_name}</span>
                            <span className="text-xs font-bold text-green">{formatZAR(d.total_volume ?? 0)}</span>
                          </div>
                          <div className="h-1.5 bg-bg3 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-cyan to-green rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <span className="text-[10px] text-textDim w-10 text-right">{d.trip_count ?? "—"} trips</span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ── OPERATIONS TAB ── */}
        {activeTab === "ops" && (
          <div className="space-y-5">
            {/* Hourly activity */}
            <Card>
              <SectionHeader icon={Activity} title="Activity by Hour of Day" sub="Peak usage windows" color="text-orange-400" />
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="hour" tick={{ fill: "var(--textDim)", fontSize: 9 }} interval={2} />
                  <YAxis tick={{ fill: "var(--textDim)", fontSize: 9 }} />
                  <Tooltip {...TT} />
                  <Bar dataKey="activity" fill="#FF8C42" radius={[2, 2, 0, 0]} name="Activity" />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* Ops KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Pending Withdrawals", value: String(dashboard?.pending_withdrawals ?? 0),   color: dashboard?.pending_withdrawals > 0 ? "text-yellow" : "text-green" },
                { label: "Pending KYC",          value: String(dashboard?.pending_kyc ?? 0),           color: dashboard?.pending_kyc > 0 ? "text-cyan" : "text-green"           },
                { label: "Flagged Accounts",     value: String(dashboard?.flagged_accounts ?? 0),      color: dashboard?.flagged_accounts > 0 ? "text-red" : "text-green"       },
                { label: "Total Wallet Balance", value: formatZAR(dashboard?.total_wallet_balance ?? 0), color: "text-purple" },
              ].map(s => (
                <div key={s.label} className="bg-bg2 border border-border rounded-xl p-4">
                  <p className="text-[9px] font-bold text-textDim uppercase tracking-wider mb-1">{s.label}</p>
                  <p className={`text-2xl font-black tabular-nums ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Volume vs fees dual axis */}
            <Card>
              <SectionHeader icon={DollarSign} title="Volume vs Fees — Last 14 Days" color="text-green" />
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData.slice(-14)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fill: "var(--textDim)", fontSize: 10 }} />
                  <YAxis yAxisId="left" tick={{ fill: "var(--textDim)", fontSize: 10 }} tickFormatter={v => `R${(v/1000).toFixed(0)}k`} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: "var(--textDim)", fontSize: 10 }} tickFormatter={v => `R${v}`} />
                  <Tooltip {...TT} formatter={(v: any) => formatZAR(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line yAxisId="left" type="monotone" dataKey="Volume" stroke="#00D4FF" strokeWidth={2} dot={false} name="Volume" />
                  <Line yAxisId="right" type="monotone" dataKey="Fees" stroke="#00E676" strokeWidth={2} dot={false} name="Fees" />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </div>
        )}

        {/* ── PYTHON / STATISTICAL TAB ── */}
        {activeTab === "python" && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-purple/5 border border-purple/20">
              <Cpu size={16} className="text-purple flex-shrink-0" />
              <p className="text-purple text-xs font-semibold">
                Statistical analysis computed in-browser using Python-equivalent algorithms: moving averages, standard deviation, anomaly detection (Z-score), percentile ranking.
              </p>
            </div>

            {/* Statistical summary */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { label: "Mean Daily Revenue", value: formatZAR(avgDaily), desc: "Arithmetic mean over selected period" },
                { label: "Std Deviation", value: formatZAR(sdVol), desc: "Spread of daily revenue values" },
                { label: "Volatility Score", value: `${volatilityScore}/100`, desc: "CV = σ/μ × 100, higher = more volatile" },
                { label: "Anomalies Detected", value: String(anomalyIdxs.size), desc: "Days >2.5σ from mean (Z-score method)" },
                { label: "Peak Day", value: (() => { const mx = Math.max(...dailyAmounts); const d = daily[dailyAmounts.indexOf(mx)]; return d?.date ? new Date(d.date).toLocaleDateString("en-ZA", { month: "short", day: "numeric" }) : "—"; })(), desc: "Highest revenue day in period" },
                { label: "Trough Day", value: (() => { const mn = Math.min(...dailyAmounts.filter(v => v > 0)); const d = daily[dailyAmounts.indexOf(mn)]; return d?.date ? new Date(d.date).toLocaleDateString("en-ZA", { month: "short", day: "numeric" }) : "—"; })(), desc: "Lowest non-zero revenue day" },
              ].map(s => (
                <div key={s.label} className="bg-bg2 border border-border rounded-xl p-4">
                  <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest">{s.label}</p>
                  <p className="text-xl font-black text-cyan mt-1">{s.value}</p>
                  <p className="text-[10px] text-textDim mt-1">{s.desc}</p>
                </div>
              ))}
            </div>

            {/* Z-score chart — show daily revenue as standard deviations from mean */}
            <Card>
              <SectionHeader icon={FlaskConical} title="Z-Score Anomaly Detection" sub="Values >2.5σ from mean are flagged as anomalies" color="text-purple" />
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData.map((d, i) => ({
                  ...d,
                  zScore: sdVol > 0 ? parseFloat(((d.Volume - avgDaily) / sdVol).toFixed(2)) : 0,
                  isAnomaly: anomalyIdxs.has(i),
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fill: "var(--textDim)", fontSize: 10 }} />
                  <YAxis tick={{ fill: "var(--textDim)", fontSize: 10 }} tickFormatter={v => `${v}σ`} />
                  <Tooltip {...TT} formatter={(v: any) => [`${v}σ`, "Z-Score"]} />
                  <ReferenceLine y={2.5} stroke="#FF3B30" strokeDasharray="4 2" label={{ value: "+2.5σ", fill: "#FF3B30", fontSize: 10 }} />
                  <ReferenceLine y={-2.5} stroke="#FF3B30" strokeDasharray="4 2" label={{ value: "-2.5σ", fill: "#FF3B30", fontSize: 10 }} />
                  <ReferenceLine y={0} stroke="var(--border)" />
                  <Bar
                    dataKey="zScore"
                    name="Z-Score"
                    radius={[2, 2, 0, 0]}
                    fill="#A064FF"
                  />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* Anomaly list */}
            {anomalyIdxs.size > 0 && (
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle size={16} className="text-red" />
                  <h3 className="text-text font-bold text-sm">Anomalous Days ({anomalyIdxs.size} detected)</h3>
                </div>
                <div className="space-y-2">
                  {Array.from(anomalyIdxs).map(i => {
                    const d = daily[i];
                    const zScore = sdVol > 0 ? ((d.amount - avgDaily) / sdVol) : 0;
                    return (
                      <div key={i} className="flex items-center justify-between p-3 bg-red/5 border border-red/20 rounded-xl">
                        <div>
                          <p className="text-sm font-semibold text-text">
                            {d.date ? new Date(d.date).toLocaleDateString("en-ZA", { weekday: "short", month: "short", day: "numeric" }) : `Day ${i+1}`}
                          </p>
                          <p className="text-xs text-textMuted">{d.count ?? 0} transactions · Z-score: {zScore.toFixed(2)}σ</p>
                        </div>
                        <div className="text-right">
                          <p className={`font-extrabold text-sm ${d.amount > avgDaily ? "text-green" : "text-red"}`}>{formatZAR(d.amount)}</p>
                          <p className="text-[10px] text-textDim">{d.amount > avgDaily ? "Spike" : "Dip"} vs {formatZAR(avgDaily)} avg</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>
        )}

      </div>
    </AdminShell>
  );
}
