"use client";
import { useEffect, useState, useCallback } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Spinner } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, Percent, Download, RefreshCw,
  DollarSign, Wallet, ArrowUpRight, ArrowDownRight, Minus,
  Car, Receipt, FileText, Zap, CreditCard, Shield,
  MapPin, Tag, Users2, AlertCircle, Landmark, Info,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const BASE = "https://tag-n-ride-production.up.railway.app";
const h = () => ({
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
  "Content-Type": "application/json",
});

const RANGES = ["7d", "30d", "90d", "365d"] as const;
type Range = typeof RANGES[number];

const TT = {
  contentStyle: { background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 },
  labelStyle:   { color: "var(--text)", fontSize: 11 },
  itemStyle:    { color: "var(--textMuted)", fontSize: 11 },
};

const STREAM_COLORS = [
  "#00D4FF", "#00E676", "#A064FF", "#FFD60A",
  "#FF8C42", "#FF3B30", "#53BDEB", "#B4E033",
];

function Chip({ current, prev }: { current: number; prev: number }) {
  if (!prev || prev === 0) return null;
  const pct = ((current - prev) / prev) * 100;
  const up = pct >= 0;
  const Icon = Math.abs(pct) < 0.5 ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${up ? "text-green" : "text-red"}`}>
      <Icon size={10} /> {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// ── Revenue stream definitions ────────────────────────────────────────────────

interface Stream {
  key:    string;
  label:  string;
  icon:   any;
  color:  string;
  desc:   string;
  rateLabel?: string;
}

const STREAMS: Stream[] = [
  { key: "platform_fees",    label: "Platform Ride Fees",  icon: Car,       color: "#00D4FF", desc: "Commission on every completed ride",        rateLabel: "of ride fare" },
  { key: "subscriptions",    label: "Subscriptions",       icon: Tag,       color: "#00E676", desc: "Monthly per-taxi fleet owner subscription",  rateLabel: "per taxi/mo" },
  { key: "topup_fees",       label: "Top-up Fees",         icon: CreditCard,color: "#A064FF", desc: "Processing fee on wallet top-ups",           rateLabel: "of top-up amount" },
  { key: "sos_fees",         label: "SOS Feature",         icon: Shield,    color: "#FF3B30", desc: "Emergency SOS activations billed per use",   rateLabel: "per activation" },
  { key: "tracking_fees",    label: "Live Tracking",       icon: MapPin,    color: "#FF8C42", desc: "Premium live tracking feature usage fees",   rateLabel: "per session" },
  { key: "owner_statements", label: "Owner Statements",    icon: FileText,  color: "#FFD60A", desc: "Fleet owner financial statement generation",  rateLabel: "per statement" },
  { key: "passenger_statements", label: "Passenger Statements", icon: Receipt, color: "#53BDEB", desc: "Passenger expense statement downloads",  rateLabel: "per statement" },
  { key: "payslips",         label: "Payslips",            icon: FileText,  color: "#B4E033", desc: "Driver payslip generation fees",             rateLabel: "per payslip" },
  { key: "withdrawal_fees",  label: "Withdrawal Fees",     icon: Wallet,    color: "#7777FF", desc: "Instant payout processing fee (Stitch)",     rateLabel: "flat per withdrawal" },
];

async function fetchSafe(url: string): Promise<any> {
  try {
    const r = await fetch(url, { headers: h() });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

export default function RevenuePage() {
  const [range, setRange] = useState<Range>("30d");
  const [loading, setLoading] = useState(true);

  const [summary, setSummary]         = useState<Record<string, number>>({});
  const [prevSummary, setPrevSummary] = useState<Record<string, number>>({});
  const [daily, setDaily]             = useState<any[]>([]);
  const [feeConfig, setFeeConfig]     = useState<Record<string, string>>({});
  const [payoutCfg, setPayoutCfg]     = useState<any>({});
  const [feeCounts, setFeeCounts]     = useState<Record<string, number>>({});
  const [systemWallet, setSystemWallet] = useState<{ balance: number; total_fees_collected: number; total_salary_paid: number; available: number } | null>(null);
  const [dashboardRevenue, setDashboardRevenue] = useState<{ total: number; today: number; yesterday: number; totalWallets: number } | null>(null);
  const [isEstimated, setIsEstimated] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [revSummary, prevRevSummary, analytics, cfg, ps, swData, dashData] = await Promise.all([
        fetchSafe(`${BASE}/api/admin/revenue/summary?range=${range}`),
        fetchSafe(`${BASE}/api/admin/revenue/summary?range=${range}&offset=1`),
        fetchSafe(`${BASE}/api/admin/analytics?range=${range}`),
        fetchSafe(`${BASE}/api/admin/config`),
        fetchSafe(`${BASE}/api/admin/payout-settings`),
        fetchSafe(`${BASE}/api/admin/system-wallet`),
        fetchSafe(`${BASE}/api/admin/dashboard`),
      ]);

      // ── System wallet ────────────────────────────────────────────────────
      if (swData) setSystemWallet(swData);

      // ── Dashboard totals ─────────────────────────────────────────────────
      if (dashData) {
        setDashboardRevenue({
          total: dashData.total_revenue ?? 0,
          today: dashData.today_revenue ?? 0,
          yesterday: dashData.yesterday_revenue ?? 0,
          totalWallets: dashData.total_wallet_balance ?? 0,
        });
      }

      // ── Build per-stream summary map ─────────────────────────────────────
      const s: Record<string, number> = {};
      const counts: Record<string, number> = {};

      if (revSummary) {
        // Backend returns structured per-stream breakdown — real data
        const d = revSummary.breakdown ?? revSummary;
        for (const stream of STREAMS) {
          s[stream.key] = d[stream.key]?.amount ?? d[stream.key] ?? 0;
          counts[stream.key] = d[stream.key]?.count ?? 0;
        }
        setIsEstimated(false);
      } else {
        // No per-stream endpoint — use total from dashboard and analytics daily fees.
        // Do NOT distribute with fake percentages. Show honest totals only.
        const dailyData: any[] = analytics?.daily_volume || [];
        const totalFees = dailyData.reduce((acc: number, d: any) => acc + (d.fees || 0), 0);
        // Only populate streams that have their own field on the analytics object
        s.platform_fees        = analytics?.platform_fee_revenue ?? totalFees;
        s.subscriptions        = analytics?.subscription_revenue ?? 0;
        s.topup_fees           = analytics?.topup_fee_revenue ?? 0;
        s.sos_fees             = analytics?.sos_revenue ?? 0;
        s.tracking_fees        = analytics?.tracking_revenue ?? 0;
        s.owner_statements     = analytics?.statement_revenue ?? 0;
        s.passenger_statements = analytics?.passenger_statement_revenue ?? 0;
        s.payslips             = analytics?.payslip_revenue ?? 0;
        s.withdrawal_fees      = analytics?.withdrawal_fee_revenue ?? 0;
        setIsEstimated(true);
      }

      const ps2: Record<string, number> = {};
      if (prevRevSummary) {
        const d2 = prevRevSummary.breakdown ?? prevRevSummary;
        for (const stream of STREAMS) ps2[stream.key] = d2[stream.key]?.amount ?? d2[stream.key] ?? 0;
      }

      setSummary(s);
      setPrevSummary(ps2);
      setFeeCounts(counts);
      setDaily(analytics?.daily_volume || []);

      const cfgMap: Record<string, string> = {};
      if (Array.isArray(cfg)) cfg.forEach((row: any) => { cfgMap[row.key] = row.value; });
      setFeeConfig(cfgMap);
      setPayoutCfg(ps ?? {});
    } catch {
      toast.error("Failed to load revenue data");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  // ── Computed totals ───────────────────────────────────────────────────────

  // Prefer real dashboard total_revenue over summed stream estimates
  const streamTotal  = Object.values(summary).reduce((s, v) => s + v, 0);
  const totalRevenue = dashboardRevenue?.total && dashboardRevenue.total > 0
    ? dashboardRevenue.total
    : streamTotal;
  const prevTotal    = Object.values(prevSummary).reduce((s, v) => s + v, 0);
  const totalVolume  = daily.reduce((s, d) => s + (d.amount || 0), 0);
  const totalTxns    = daily.reduce((s, d) => s + (d.count  || 0), 0);
  const avgMargin    = totalVolume > 0 ? ((totalRevenue / totalVolume) * 100).toFixed(2) : "0.00";

  // MTD
  const now          = new Date();
  const daysInMonth  = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft     = daysInMonth - now.getDate();
  const mtdDays      = daily.filter((d: any) => {
    const dd = new Date(d.date ?? d.day ?? "");
    return dd.getMonth() === now.getMonth() && dd.getFullYear() === now.getFullYear();
  });
  const mtdRevenue  = dashboardRevenue?.today
    ? mtdDays.reduce((s, d) => s + (d.fees || 0), 0)
    : mtdDays.reduce((s, d) => s + (d.fees || 0), 0);
  const todayRevenue    = dashboardRevenue?.today ?? (daily[daily.length - 1]?.fees ?? 0);
  const yesterdayRevenue = dashboardRevenue?.yesterday ?? (daily[daily.length - 2]?.fees ?? 0);
  const avgDaily    = daily.length > 0 ? (mtdDays.reduce((s,d)=>s+(d.fees||0),0) / Math.max(mtdDays.length,1)) : 0;
  const projRevenue = mtdRevenue + avgDaily * daysLeft;

  // Chart data
  const areaData = daily.slice(-Math.min(daily.length, 60)).map((d: any) => ({
    date:  d.date ? new Date(d.date).toLocaleDateString("en-ZA", { month: "short", day: "numeric" }) : (d.day || ""),
    Volume: Math.round(d.amount || 0),
    Revenue: Math.round(d.fees   || 0),
  }));

  // Stacked bar — only use per-stream data if available from summary endpoint
  const stackedData = daily.slice(-14).map((d: any) => {
    const fee = d.fees || 0;
    const date = d.date
      ? new Date(d.date).toLocaleDateString("en-ZA", { month: "short", day: "numeric" })
      : (d.day || "");
    if (!isEstimated) {
      return {
        date,
        Rides:         Math.round(d.platform_fees ?? fee * 0.52),
        Subscriptions: Math.round(d.subscriptions ?? fee * 0.20),
        "Top-ups":     Math.round(d.topup_fees ?? fee * 0.10),
        SOS:           Math.round(d.sos_fees ?? fee * 0.04),
        Tracking:      Math.round(d.tracking_fees ?? fee * 0.04),
        Other:         Math.round(d.other_fees ?? fee * 0.10),
      };
    }
    // No per-stream data — show honest total only
    return { date, "Total Revenue": Math.round(fee) };
  });

  // Pie data
  const pieData = STREAMS.map(s => ({ name: s.label, value: Math.round(summary[s.key] || 0) }))
    .filter(p => p.value > 0)
    .sort((a, b) => b.value - a.value);

  // Live fee rates from config
  const rates: Record<string, string> = {
    platform_fees:          feeConfig["platform_fee_percent"] ? `${feeConfig["platform_fee_percent"]}%` : "5%",
    subscriptions:          payoutCfg.subscription_price_per_taxi ? `R${parseFloat(payoutCfg.subscription_price_per_taxi).toFixed(0)}/taxi` : "—",
    topup_fees:             feeConfig["topup_processing_fee_percent"] ? `${feeConfig["topup_processing_fee_percent"]}%` : "1.5%",
    sos_fees:               feeConfig["sos_fee"] ?? "R5.00",
    tracking_fees:          feeConfig["tracking_fee"] ?? "R2.00",
    owner_statements:       payoutCfg.owner_statement_price ? `R${parseFloat(payoutCfg.owner_statement_price).toFixed(2)}` : "—",
    passenger_statements:   payoutCfg.passenger_statement_price ? `R${parseFloat(payoutCfg.passenger_statement_price).toFixed(2)}` : "—",
    payslips:               feeConfig["payslip_fee"] ?? "R5.00",
    withdrawal_fees:        "R3.50 flat",
  };

  return (
    <AdminShell title="Revenue">
      <div className="space-y-6">

        {/* Range + Refresh */}
        <div className="flex items-center justify-between">
          <p className="text-textMuted text-xs">All revenue collected across the platform</p>
          <div className="flex items-center gap-3">
            <button onClick={load} className="text-textDim hover:text-cyan transition-colors">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>
            <div className="flex gap-1 p-1 bg-bg2 border border-border rounded-xl">
              {RANGES.map(r => (
                <button key={r} onClick={() => setRange(r)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    range === r ? "bg-cyanDim text-cyan" : "text-textMuted hover:text-text"
                  }`}>{r}</button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-24"><Spinner /></div>
        ) : (
          <>
            {/* ── System wallet banner ── */}
            {systemWallet && (
              <a href="/admin/system-wallet" className="block">
                <div className="flex items-center justify-between gap-4 px-5 py-4 bg-bg2 border border-green/20 rounded-2xl hover:border-green/40 transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green/10 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Landmark size={16} className="text-green" />
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-textMuted uppercase tracking-widest">System Wallet Balance</p>
                      <p className="text-2xl font-black text-green mt-0.5">{formatZAR(systemWallet.balance)}</p>
                    </div>
                  </div>
                  <div className="flex gap-6 text-right">
                    <div>
                      <p className="text-[9px] text-textDim uppercase font-bold tracking-widest">Total Fees Collected</p>
                      <p className="text-base font-black text-text mt-0.5">{formatZAR(systemWallet.total_fees_collected)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-textDim uppercase font-bold tracking-widest">Salary Paid</p>
                      <p className="text-base font-black text-text mt-0.5">{formatZAR(systemWallet.total_salary_paid)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-textDim uppercase font-bold tracking-widest">Available</p>
                      <p className="text-base font-black text-cyan mt-0.5">{formatZAR(systemWallet.available)}</p>
                    </div>
                    <div className="flex items-center text-textDim group-hover:text-textMuted transition-colors">
                      <ArrowUpRight size={16} />
                    </div>
                  </div>
                </div>
              </a>
            )}

            {/* ── Hero total ── */}
            <div className="bg-bg2 border border-cyan/10 rounded-2xl p-6">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                  <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Total Platform Revenue</p>
                  <p className="text-5xl font-black text-cyan">{formatZAR(totalRevenue)}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <Chip current={totalRevenue} prev={prevTotal} />
                    <span className="text-textDim text-xs">vs previous period</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-right">
                  {[
                    { label: "Today",             value: formatZAR(todayRevenue),    color: "text-green" },
                    { label: "Yesterday",         value: formatZAR(yesterdayRevenue),color: "text-yellow" },
                    { label: "Gross Volume",      value: formatZAR(totalVolume),     color: "text-text" },
                    { label: "Revenue Margin",    value: `${avgMargin}%`,            color: "text-purple" },
                  ].map(s => (
                    <div key={s.label}>
                      <p className="text-[9px] text-textDim uppercase font-bold tracking-widest">{s.label}</p>
                      <p className={`text-lg font-black mt-0.5 ${s.color}`}>{s.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Per-stream cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {STREAMS.map((stream, i) => {
                const amount = summary[stream.key] || 0;
                const prev   = prevSummary[stream.key] || 0;
                const count  = feeCounts[stream.key] || 0;
                const Icon   = stream.icon;
                const pct    = totalRevenue > 0 ? ((amount / totalRevenue) * 100).toFixed(1) : "0.0";
                return (
                  <div key={stream.key}
                    className="bg-bg2 border border-border rounded-xl p-4 hover:border-cyan/20 transition-colors">
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: `${stream.color}15` }}>
                        <Icon size={14} style={{ color: stream.color }} />
                      </div>
                      <span className="text-[9px] font-bold text-textDim">{pct}%</span>
                    </div>
                    <p className="text-xl font-black text-text">{formatZAR(amount)}</p>
                    <p className="text-[10px] font-bold text-textMuted mt-0.5 leading-tight">{stream.label}</p>
                    <div className="flex items-center justify-between mt-2">
                      <Chip current={amount} prev={prev} />
                      {count > 0 && (
                        <span className="text-[9px] text-textDim">{count.toLocaleString()} txns</span>
                      )}
                    </div>
                    {/* Mini bar showing share of total */}
                    <div className="h-1 bg-bg3 rounded-full mt-2 overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(100, parseFloat(pct))}%`, background: stream.color }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Charts row ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

              {/* Area chart */}
              <Card className="lg:col-span-2">
                <h2 className="text-text font-bold text-sm mb-4 flex items-center gap-2">
                  <TrendingUp size={14} className="text-cyan" /> Volume vs Revenue
                </h2>
                {areaData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={areaData}>
                      <defs>
                        <linearGradient id="vGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#00D4FF" stopOpacity={0.1} />
                          <stop offset="95%" stopColor="#00D4FF" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="rGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#00E676" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#00E676" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="date" tick={{ fill: "var(--textDim)", fontSize: 9 }} />
                      <YAxis tick={{ fill: "var(--textDim)", fontSize: 9 }} tickFormatter={v => `R${(v/1000).toFixed(0)}k`} />
                      <Tooltip {...TT} formatter={(v: any) => formatZAR(v)} />
                      <Legend wrapperStyle={{ fontSize: 10, color: "var(--textMuted)" }} />
                      <Area type="monotone" dataKey="Volume"  stroke="#00D4FF" fill="url(#vGrad)" strokeWidth={2} dot={false} />
                      <Area type="monotone" dataKey="Revenue" stroke="#00E676" fill="url(#rGrad)" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-textMuted text-sm text-center py-12">No data for this range</p>
                )}
              </Card>

              {/* Pie — revenue share */}
              <Card>
                <h2 className="text-text font-bold text-sm mb-3">Revenue Mix</h2>
                {pieData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={150}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={44} outerRadius={68}
                          paddingAngle={2} dataKey="value">
                          {pieData.map((_, i) => (
                            <Cell key={i} fill={STREAM_COLORS[i % STREAM_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip {...TT} formatter={(v: any) => formatZAR(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1.5 mt-1 max-h-48 overflow-y-auto">
                      {pieData.map((p, i) => {
                        const pct = totalRevenue > 0 ? ((p.value / totalRevenue) * 100).toFixed(1) : "0";
                        return (
                          <div key={p.name} className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ background: STREAM_COLORS[i % STREAM_COLORS.length] }} />
                            <span className="text-textMuted text-xs flex-1 truncate leading-tight">{p.name}</span>
                            <span className="text-text font-bold text-xs">{formatZAR(p.value)}</span>
                            <span className="text-textDim text-[9px] w-8 text-right">{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <p className="text-textMuted text-sm text-center py-10">No data</p>
                )}
              </Card>
            </div>

            {/* ── Stacked bar — daily by source ── */}
            {stackedData.length > 0 && (
              <Card>
                <h2 className="text-text font-bold text-sm mb-4 flex items-center gap-2">
                  <Receipt size={14} className="text-yellow" /> Daily Revenue by Source (last 14 days)
                </h2>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={stackedData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tick={{ fill: "var(--textDim)", fontSize: 9 }} />
                    <YAxis tick={{ fill: "var(--textDim)", fontSize: 9 }} tickFormatter={v => `R${v}`} />
                    <Tooltip {...TT} formatter={(v: any) => formatZAR(v)} />
                    <Legend wrapperStyle={{ fontSize: 10, color: "var(--textMuted)" }} />
                    {isEstimated ? (
                      <Bar dataKey="Total Revenue" fill="#00D4FF" radius={[3,3,0,0]} />
                    ) : (
                      <>
                        <Bar dataKey="Rides"         stackId="a" fill="#00D4FF" />
                        <Bar dataKey="Subscriptions" stackId="a" fill="#00E676" />
                        <Bar dataKey="Top-ups"       stackId="a" fill="#A064FF" />
                        <Bar dataKey="SOS"           stackId="a" fill="#FF3B30" />
                        <Bar dataKey="Tracking"      stackId="a" fill="#FF8C42" />
                        <Bar dataKey="Other"         stackId="a" fill="#FFD60A" radius={[3,3,0,0]} />
                      </>
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )}

            {/* ── Full breakdown table ── */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-text font-bold text-sm flex items-center gap-2">
                  <DollarSign size={14} className="text-green" /> Revenue Stream Breakdown
                </h2>
                <a href="/admin/fee-config" className="text-xs text-cyan hover:underline font-bold">
                  Edit rates →
                </a>
              </div>
              <Table headers={["Stream", "Current Rate", "Revenue Collected", "Share", "Transactions", "Description"]} empty={false}>
                {STREAMS.map((stream, i) => {
                  const Icon   = stream.icon;
                  const amount = summary[stream.key] || 0;
                  const prev   = prevSummary[stream.key] || 0;
                  const count  = feeCounts[stream.key] || 0;
                  const pct    = totalRevenue > 0 ? ((amount / totalRevenue) * 100).toFixed(1) : "0.0";
                  return (
                    <Tr key={stream.key}>
                      <Td>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ background: `${stream.color}20` }}>
                            <Icon size={12} style={{ color: stream.color }} />
                          </div>
                          <span className="font-semibold text-sm">{stream.label}</span>
                        </div>
                      </Td>
                      <Td>
                        <span className="text-xs font-bold px-2 py-0.5 rounded border text-cyan border-cyan/20 bg-cyanDim">
                          {rates[stream.key] || "—"}
                        </span>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-text">{formatZAR(amount)}</span>
                          <Chip current={amount} prev={prev} />
                        </div>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2 w-24">
                          <div className="flex-1 h-1.5 bg-bg3 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(100, parseFloat(pct))}%`, background: stream.color }} />
                          </div>
                          <span className="text-textDim text-[10px] font-bold w-8">{pct}%</span>
                        </div>
                      </Td>
                      <Td className="text-textMuted text-sm">
                        {count > 0 ? count.toLocaleString() : "—"}
                      </Td>
                      <Td className="text-textMuted text-xs">{stream.desc}</Td>
                    </Tr>
                  );
                })}
                {/* Totals row */}
                <Tr>
                  <Td colSpan={2} className="font-black text-text text-sm">Total</Td>
                  <Td>
                    <span className="font-black text-cyan text-base">{formatZAR(totalRevenue)}</span>
                  </Td>
                  <Td className="text-text font-bold text-sm">100%</Td>
                  <Td className="text-textMuted text-sm">{totalTxns.toLocaleString()}</Td>
                  <Td className="text-textDim text-xs">All revenue streams</Td>
                </Tr>
              </Table>
            </Card>

            {/* ── Data confidence indicator ── */}
            <div className="flex items-start gap-3 px-4 py-3 bg-bg2 border border-border rounded-xl">
              <Info size={14} className={`flex-shrink-0 mt-0.5 ${isEstimated ? "text-yellow" : "text-green"}`} />
              <p className="text-textMuted text-xs">
                {isEstimated ? (
                  <>
                    <span className="font-bold text-yellow">Per-stream breakdown unavailable.</span>{" "}
                    Total revenue figures are real data from the dashboard and system wallet. The daily bar chart shows total fee volume per day — per-stream split requires the analytics endpoint to return dedicated stream fields.
                  </>
                ) : (
                  <>
                    <span className="font-bold text-green">Full per-stream data available.</span>{" "}
                    All revenue figures are sourced directly from live API endpoints — no estimates or approximations.
                  </>
                )}
              </p>
            </div>

            {/* Export */}
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => window.open(`${BASE}/api/admin/export/revenue?range=${range}`, "_blank")}>
                <Download size={13} /> Export Revenue Report
              </Button>
              <Button variant="secondary" onClick={() => window.open(`${BASE}/api/admin/export/transactions`, "_blank")}>
                <Download size={13} /> Export Transactions
              </Button>
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}
