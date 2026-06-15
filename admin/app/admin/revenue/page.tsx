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
  Building2, Users, ChevronDown, ChevronRight, BarChart2,
  TrendingDown as TrendDown, CheckCircle2, Clock, MinusCircle,
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

interface Stream {
  key: string; label: string; icon: any; color: string; desc: string; rateLabel?: string;
}

const STREAMS: Stream[] = [
  { key: "platform_fees",          label: "Platform Ride Fees",      icon: Car,       color: "#00D4FF", desc: "Commission on every completed ride",       rateLabel: "of ride fare" },
  { key: "subscriptions",          label: "Subscriptions",            icon: Tag,       color: "#00E676", desc: "Monthly per-taxi fleet owner subscription", rateLabel: "per taxi/mo" },
  { key: "topup_fees",             label: "Top-up Fees",              icon: CreditCard,color: "#A064FF", desc: "Processing fee on wallet top-ups",          rateLabel: "of top-up" },
  { key: "sos_fees",               label: "SOS Feature",              icon: Shield,    color: "#FF3B30", desc: "Emergency SOS activations",                 rateLabel: "per activation" },
  { key: "tracking_fees",          label: "Live Tracking",            icon: MapPin,    color: "#FF8C42", desc: "Premium live tracking feature",             rateLabel: "per session" },
  { key: "owner_statements",       label: "Owner Statements",         icon: FileText,  color: "#FFD60A", desc: "Fleet owner financial statement generation", rateLabel: "per statement" },
  { key: "passenger_statements",   label: "Passenger Statements",     icon: Receipt,   color: "#53BDEB", desc: "Passenger expense statement downloads",     rateLabel: "per statement" },
  { key: "payslips",               label: "Payslips",                 icon: FileText,  color: "#B4E033", desc: "Driver payslip generation fees",            rateLabel: "per payslip" },
  { key: "withdrawal_fees",        label: "Withdrawal Fees",          icon: Wallet,    color: "#7777FF", desc: "Instant payout processing fee",             rateLabel: "flat per withdrawal" },
];

async function fetchSafe(url: string): Promise<any> {
  try {
    const r = await fetch(url, { headers: h() });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

function PnLRow({
  label, value, sub, color = "text-text", indent = false, bold = false, border = false,
}: {
  label: string; value: number; sub?: string; color?: string; indent?: boolean; bold?: boolean; border?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-2.5 ${indent ? "pl-6" : ""} ${border ? "border-t border-border mt-1 pt-3" : ""}`}>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${bold ? "font-extrabold text-text" : "text-textMuted"}`}>{label}</p>
        {sub && <p className="text-[10px] text-textDim mt-0.5">{sub}</p>}
      </div>
      <p className={`font-extrabold text-sm tabular-nums ${color} ${bold ? "text-base" : ""}`}>
        {value < 0 ? `(${formatZAR(Math.abs(value))})` : formatZAR(value)}
      </p>
    </div>
  );
}

const RANGE_LABELS: Record<string, string> = {
  "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days", "365d": "Last 12 months"
};

export default function RevenuePage() {
  const [range, setRange] = useState<Range>("30d");
  const [loading, setLoading] = useState(true);
  const [showAssocBreakdown, setShowAssocBreakdown] = useState(false);

  const [summary, setSummary]         = useState<Record<string, number>>({});
  const [prevSummary, setPrevSummary] = useState<Record<string, number>>({});
  const [daily, setDaily]             = useState<any[]>([]);
  const [feeConfig, setFeeConfig]     = useState<Record<string, string>>({});
  const [payoutCfg, setPayoutCfg]     = useState<any>({});
  const [feeCounts, setFeeCounts]     = useState<Record<string, number>>({});
  const [systemWallet, setSystemWallet] = useState<any | null>(null);
  const [dashboardRevenue, setDashboardRevenue] = useState<any | null>(null);
  const [isEstimated, setIsEstimated] = useState(false);
  const [pnl, setPnl] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [revSummary, prevRevSummary, analytics, cfg, ps, swData, dashData, pnlData] = await Promise.all([
        fetchSafe(`${BASE}/api/admin/revenue/summary?range=${range}`),
        fetchSafe(`${BASE}/api/admin/revenue/summary?range=${range}&offset=1`),
        fetchSafe(`${BASE}/api/admin/analytics?range=${range}`),
        fetchSafe(`${BASE}/api/admin/config`),
        fetchSafe(`${BASE}/api/admin/payout-settings`),
        fetchSafe(`${BASE}/api/admin/system-wallet`),
        fetchSafe(`${BASE}/api/admin/dashboard`),
        fetchSafe(`${BASE}/api/admin/revenue/pnl?range=${range}`),
      ]);

      if (swData) setSystemWallet(swData);
      if (pnlData) setPnl(pnlData);

      if (dashData) {
        setDashboardRevenue({
          total: dashData.total_revenue ?? 0,
          today: dashData.today_revenue ?? 0,
          yesterday: dashData.yesterday_revenue ?? 0,
          totalWallets: dashData.total_wallet_balance ?? 0,
        });
      }

      const s: Record<string, number> = {};
      const counts: Record<string, number> = {};

      if (revSummary) {
        const d = revSummary.breakdown ?? revSummary;
        for (const stream of STREAMS) {
          s[stream.key] = d[stream.key]?.amount ?? d[stream.key] ?? 0;
          counts[stream.key] = d[stream.key]?.count ?? 0;
        }
        setIsEstimated(false);
      } else {
        const dailyData: any[] = analytics?.daily_volume || [];
        const totalFees = dailyData.reduce((acc: number, d: any) => acc + (d.fees || 0), 0);
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

  const streamTotal  = Object.values(summary).reduce((s, v) => s + v, 0);
  const totalRevenue = pnl?.gross_revenue
    ? pnl.gross_revenue
    : (dashboardRevenue?.total && dashboardRevenue.total > 0 ? dashboardRevenue.total : streamTotal);
  const prevTotal    = Object.values(prevSummary).reduce((s, v) => s + v, 0);
  const totalVolume  = daily.reduce((s, d) => s + (d.amount || 0), 0);
  const totalTxns    = daily.reduce((s, d) => s + (d.count  || 0), 0);
  const avgMargin    = totalVolume > 0 ? ((totalRevenue / totalVolume) * 100).toFixed(2) : "0.00";

  const now         = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft    = daysInMonth - now.getDate();
  const mtdDays     = daily.filter((d: any) => {
    const dd = new Date(d.date ?? d.day ?? "");
    return dd.getMonth() === now.getMonth() && dd.getFullYear() === now.getFullYear();
  });
  const todayRevenue     = dashboardRevenue?.today ?? (daily[daily.length - 1]?.fees ?? 0);
  const yesterdayRevenue = dashboardRevenue?.yesterday ?? (daily[daily.length - 2]?.fees ?? 0);
  const avgDaily   = mtdDays.length > 0 ? (mtdDays.reduce((s, d) => s + (d.fees || 0), 0) / mtdDays.length) : 0;
  const projRevenue = mtdDays.reduce((s,d)=>s+(d.fees||0),0) + avgDaily * daysLeft;

  const areaData = daily.slice(-Math.min(daily.length, 60)).map((d: any) => ({
    date: d.date ? new Date(d.date).toLocaleDateString("en-ZA", { month: "short", day: "numeric" }) : (d.day || ""),
    Volume: Math.round(d.amount || 0),
    Revenue: Math.round(d.fees || 0),
  }));

  const stackedData = daily.slice(-14).map((d: any) => {
    const fee = d.fees || 0;
    const date = d.date
      ? new Date(d.date).toLocaleDateString("en-ZA", { month: "short", day: "numeric" })
      : (d.day || "");
    if (!isEstimated) {
      return {
        date,
        Rides: Math.round(d.platform_fees ?? fee * 0.52),
        Subscriptions: Math.round(d.subscriptions ?? fee * 0.20),
        "Top-ups": Math.round(d.topup_fees ?? fee * 0.10),
        Other: Math.round(d.other_fees ?? fee * 0.18),
      };
    }
    return { date, "Total Revenue": Math.round(fee) };
  });

  const pieData = STREAMS.map(s => ({ name: s.label, value: Math.round(summary[s.key] || 0) }))
    .filter(p => p.value > 0)
    .sort((a, b) => b.value - a.value);

  const rates: Record<string, string> = {
    platform_fees:        feeConfig["platform_fee_percent"] ? `${feeConfig["platform_fee_percent"]}%` : "5%",
    subscriptions:        payoutCfg.subscription_price_per_taxi ? `R${parseFloat(payoutCfg.subscription_price_per_taxi).toFixed(0)}/taxi` : "—",
    topup_fees:           feeConfig["topup_processing_fee_percent"] ? `${feeConfig["topup_processing_fee_percent"]}%` : "1.5%",
    sos_fees:             feeConfig["sos_fee"] ?? "R5.00",
    tracking_fees:        feeConfig["tracking_fee"] ?? "R2.00",
    owner_statements:     payoutCfg.owner_statement_price ? `R${parseFloat(payoutCfg.owner_statement_price).toFixed(2)}` : "—",
    passenger_statements: payoutCfg.passenger_statement_price ? `R${parseFloat(payoutCfg.passenger_statement_price).toFixed(2)}` : "—",
    payslips:             feeConfig["payslip_fee"] ?? "R5.00",
    withdrawal_fees:      "R3.50 flat",
  };

  const netProfit = pnl?.net_profit ?? 0;
  const totalExpenses = pnl?.expenses?.total ?? 0;
  const profitMargin = pnl?.profit_margin ?? 0;

  return (
    <AdminShell title="Revenue">
      <div className="space-y-6">

        {/* Range + Refresh */}
        <div className="flex items-center justify-between">
          <p className="text-textMuted text-xs">Platform revenue, expenses &amp; profitability · {RANGE_LABELS[range]}</p>
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
            {/* ══════════════════════════════════════════════════
                P&L INCOME STATEMENT
            ══════════════════════════════════════════════════ */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

              {/* Left: Full P&L statement */}
              <Card className="lg:col-span-2">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-text font-extrabold text-base flex items-center gap-2">
                    <BarChart2 size={16} className="text-cyan" />
                    Profit &amp; Loss — {RANGE_LABELS[range]}
                  </h2>
                  <span className={`text-xs font-extrabold px-2 py-1 rounded-lg ${
                    netProfit >= 0 ? "bg-green/10 text-green border border-green/20" : "bg-red/10 text-red border border-red/20"
                  }`}>
                    {profitMargin.toFixed(1)}% margin
                  </span>
                </div>

                {/* Income */}
                <div className="mb-1">
                  <p className="text-[10px] font-black text-textDim uppercase tracking-widest mb-1">INCOME</p>
                  {pnl ? (
                    <>
                      <PnLRow label="Platform Ride Fees"   value={pnl.income.platform_fees}    color="text-cyan"   indent sub="Commission on completed rides" />
                      <PnLRow label="Subscriptions"         value={pnl.income.subscriptions}    color="text-green"  indent sub="Fleet owner monthly subscriptions" />
                      <PnLRow label="Statement Fees"        value={pnl.income.statement_fees}   color="text-yellow" indent sub="Owner & passenger statements" />
                      {pnl.income.topup_fees > 0 && <PnLRow label="Top-up Fees" value={pnl.income.topup_fees} color="text-purple" indent sub="Wallet top-up processing" />}
                      {pnl.income.sos_fees > 0 && <PnLRow label="SOS Fees" value={pnl.income.sos_fees} color="text-red" indent sub="Emergency SOS activations" />}
                      {pnl.income.maintenance_fees > 0 && <PnLRow label="Maintenance Fees" value={pnl.income.maintenance_fees} color="text-orange-400" indent sub="Monthly account maintenance" />}
                      {pnl.income.withdrawal_fees > 0 && <PnLRow label="Withdrawal Fees" value={pnl.income.withdrawal_fees} color="text-purple" indent sub="Payout processing fees" />}
                    </>
                  ) : (
                    <PnLRow label="Total Income" value={totalRevenue} color="text-cyan" indent />
                  )}
                  <div className="flex items-center justify-between py-2 mt-1 border-t border-border bg-cyan/5 rounded-lg px-3">
                    <p className="font-extrabold text-text text-sm">Total Revenue</p>
                    <p className="font-black text-cyan text-lg tabular-nums">{formatZAR(totalRevenue)}</p>
                  </div>
                </div>

                {/* Expenses */}
                <div className="mt-5 mb-1">
                  <p className="text-[10px] font-black text-textDim uppercase tracking-widest mb-1">EXPENSES</p>

                  {/* Association payouts */}
                  <div>
                    <button
                      onClick={() => setShowAssocBreakdown(v => !v)}
                      className="w-full flex items-center justify-between py-2.5 pl-6 hover:bg-bg3/50 rounded-lg transition-colors">
                      <div className="flex items-center gap-2">
                        <Building2 size={13} className="text-orange-400" />
                        <div className="text-left">
                          <p className="text-sm text-textMuted">Taxi Association Payouts</p>
                          <p className="text-[10px] text-textDim">Monthly payments to taxi associations</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="font-extrabold text-sm text-orange-400 tabular-nums">
                          ({formatZAR(pnl?.expenses?.association_payouts ?? 0)})
                        </p>
                        {showAssocBreakdown ? <ChevronDown size={13} className="text-textDim" /> : <ChevronRight size={13} className="text-textDim" />}
                      </div>
                    </button>
                    {showAssocBreakdown && pnl?.association_breakdown?.length > 0 && (
                      <div className="ml-10 mb-2 space-y-1">
                        {pnl.association_breakdown.filter((a: any) => a.total_paid > 0).map((a: any, i: number) => (
                          <div key={i} className="flex justify-between text-xs text-textMuted py-1 border-b border-border/50">
                            <span className="flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" />
                              {a.name}
                              <span className="text-textDim">({a.payout_count} payouts)</span>
                            </span>
                            <span className="font-semibold text-orange-400">({formatZAR(a.total_paid)})</span>
                          </div>
                        ))}
                        {pnl.association_breakdown.every((a: any) => a.total_paid === 0) && (
                          <p className="text-textDim text-xs py-1">No paid payouts in this period.</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Employee salaries */}
                  <div className="flex items-center justify-between py-2.5 pl-6">
                    <div className="flex items-center gap-2">
                      <Users size={13} className="text-purple" />
                      <div>
                        <p className="text-sm text-textMuted">Employee Salaries</p>
                        <p className="text-[10px] text-textDim">Staff payroll paid</p>
                      </div>
                    </div>
                    <p className="font-extrabold text-sm text-purple tabular-nums">
                      ({formatZAR(pnl?.expenses?.salary_paid ?? (systemWallet?.total_salary_paid ?? 0))})
                    </p>
                  </div>

                  <div className="flex items-center justify-between py-2 mt-1 border-t border-border bg-red/5 rounded-lg px-3">
                    <p className="font-extrabold text-text text-sm">Total Expenses</p>
                    <p className="font-black text-red text-lg tabular-nums">({formatZAR(totalExpenses)})</p>
                  </div>
                </div>

                {/* Net Profit */}
                <div className={`mt-4 p-4 rounded-xl border-2 ${
                  netProfit >= 0 ? "border-green/30 bg-green/5" : "border-red/30 bg-red/5"
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-textMuted">NET PROFIT</p>
                      <p className="text-[10px] text-textDim mt-0.5">{RANGE_LABELS[range]}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-3xl font-black tabular-nums ${netProfit >= 0 ? "text-green" : "text-red"}`}>
                        {netProfit < 0 ? `(${formatZAR(Math.abs(netProfit))})` : formatZAR(netProfit)}
                      </p>
                      <p className={`text-xs font-bold mt-0.5 ${netProfit >= 0 ? "text-green" : "text-red"}`}>
                        {profitMargin.toFixed(1)}% profit margin
                      </p>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Right: Summary cards */}
              <div className="flex flex-col gap-4">

                {/* Revenue today */}
                <Card>
                  <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-3">Today vs Yesterday</p>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-textMuted text-sm">Today</span>
                      <span className="font-extrabold text-cyan">{formatZAR(todayRevenue)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-textMuted text-sm">Yesterday</span>
                      <span className="font-extrabold text-text">{formatZAR(yesterdayRevenue)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-border">
                      <span className="text-textMuted text-sm">Month projection</span>
                      <span className="font-extrabold text-yellow">{formatZAR(projRevenue)}</span>
                    </div>
                  </div>
                </Card>

                {/* Pending obligations */}
                {pnl?.pending && (
                  <Card className="border-yellow/20">
                    <p className="text-[10px] font-bold text-yellow uppercase tracking-widest mb-3 flex items-center gap-1">
                      <Clock size={10} /> Pending Obligations
                    </p>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm text-textMuted">Association payouts</p>
                          <p className="text-textDim text-[10px]">{pnl.pending.association_count} pending</p>
                        </div>
                        <span className="font-extrabold text-orange-400">{formatZAR(pnl.pending.association_payouts)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm text-textMuted">Salary payments</p>
                          <p className="text-textDim text-[10px]">{pnl.pending.salary_count} pending</p>
                        </div>
                        <span className="font-extrabold text-purple">{formatZAR(pnl.pending.salary)}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-border">
                        <span className="text-text font-bold text-sm">Total owed</span>
                        <span className="font-black text-yellow">{formatZAR(pnl.pending.total)}</span>
                      </div>
                    </div>
                  </Card>
                )}

                {/* All-time payouts */}
                {pnl?.all_time && (
                  <Card>
                    <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-3">All-Time Paid Out</p>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-1.5">
                          <Building2 size={12} className="text-orange-400" />
                          <span className="text-textMuted text-sm">Associations</span>
                        </div>
                        <span className="font-extrabold text-orange-400">{formatZAR(pnl.all_time.association_payouts)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-1.5">
                          <Users size={12} className="text-purple" />
                          <span className="text-textMuted text-sm">Employees</span>
                        </div>
                        <span className="font-extrabold text-purple">{formatZAR(pnl.all_time.salary_paid)}</span>
                      </div>
                    </div>
                  </Card>
                )}

                {/* System wallet */}
                {systemWallet && (
                  <a href="/admin/system-wallet">
                    <Card className="hover:border-cyan/30 transition-colors cursor-pointer">
                      <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-3 flex items-center gap-1">
                        <Landmark size={10} className="text-green" /> System Wallet
                      </p>
                      <p className="text-2xl font-black text-green mb-3">{formatZAR(systemWallet.balance)}</p>
                      <div className="space-y-1.5 text-xs text-textMuted">
                        <div className="flex justify-between"><span>Total fees collected</span><span className="font-bold text-text">{formatZAR(systemWallet.total_fees_collected)}</span></div>
                        <div className="flex justify-between"><span>Total salary paid</span><span className="font-bold text-text">{formatZAR(systemWallet.total_salary_paid)}</span></div>
                        <div className="flex justify-between border-t border-border pt-1.5 mt-1.5"><span>Available</span><span className="font-extrabold text-cyan">{formatZAR(systemWallet.available)}</span></div>
                      </div>
                    </Card>
                  </a>
                )}
              </div>
            </div>

            {/* ══════════════════════════════════════════════════
                HERO TOTALS STRIP
            ══════════════════════════════════════════════════ */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Gross Revenue",     value: totalRevenue,   color: "text-cyan",       bg: "bg-cyan/10",       sub: RANGE_LABELS[range] },
                { label: "Total Expenses",    value: totalExpenses,  color: "text-red",        bg: "bg-red/10",        sub: "Associations + salaries" },
                { label: "Net Profit",        value: netProfit,      color: netProfit >= 0 ? "text-green" : "text-red", bg: netProfit >= 0 ? "bg-green/10" : "bg-red/10", sub: `${profitMargin.toFixed(1)}% margin` },
                { label: "Gross Volume",      value: totalVolume,    color: "text-yellow",     bg: "bg-yellow/10",     sub: "Total transaction volume" },
              ].map(s => (
                <Card key={s.label} className={`border-border`}>
                  <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-2">{s.label}</p>
                  <p className={`text-2xl font-black tabular-nums ${s.color}`}>
                    {s.value < 0 ? `(${formatZAR(Math.abs(s.value))})` : formatZAR(s.value)}
                  </p>
                  <p className="text-textDim text-[10px] mt-1">{s.sub}</p>
                  {s.label === "Gross Revenue" && <Chip current={totalRevenue} prev={prevTotal} />}
                </Card>
              ))}
            </div>

            {/* ══════════════════════════════════════════════════
                PER-STREAM CARDS
            ══════════════════════════════════════════════════ */}
            <div>
              <h2 className="text-text font-bold text-sm mb-3 flex items-center gap-2">
                <DollarSign size={14} className="text-green" /> Revenue by Source
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {STREAMS.map((stream) => {
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
                        {count > 0 && <span className="text-[9px] text-textDim">{count.toLocaleString()} txns</span>}
                      </div>
                      <div className="h-1 bg-bg3 rounded-full mt-2 overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${Math.min(100, parseFloat(pct))}%`, background: stream.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ══════════════════════════════════════════════════
                CHARTS
            ══════════════════════════════════════════════════ */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
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

              <Card>
                <h2 className="text-text font-bold text-sm mb-3">Revenue Mix</h2>
                {pieData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={150}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={44} outerRadius={68}
                          paddingAngle={2} dataKey="value">
                          {pieData.map((_, i) => <Cell key={i} fill={STREAM_COLORS[i % STREAM_COLORS.length]} />)}
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
                            <span className="text-textMuted text-xs flex-1 truncate">{p.name}</span>
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

            {/* Daily bar chart */}
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
                        <Bar dataKey="Other"         stackId="a" fill="#FFD60A" radius={[3,3,0,0]} />
                      </>
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )}

            {/* ══════════════════════════════════════════════════
                FULL STREAM BREAKDOWN TABLE
            ══════════════════════════════════════════════════ */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-text font-bold text-sm flex items-center gap-2">
                  <DollarSign size={14} className="text-green" /> Revenue Stream Breakdown
                </h2>
                <a href="/admin/fee-config" className="text-xs text-cyan hover:underline font-bold">Edit rates →</a>
              </div>
              <Table headers={["Stream", "Rate", "Revenue", "Share", "Txns", "Description"]} empty={false}>
                {STREAMS.map((stream) => {
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
                            <div className="h-full rounded-full"
                              style={{ width: `${Math.min(100, parseFloat(pct))}%`, background: stream.color }} />
                          </div>
                          <span className="text-textDim text-[10px] font-bold w-8">{pct}%</span>
                        </div>
                      </Td>
                      <Td className="text-textMuted text-sm">{count > 0 ? count.toLocaleString() : "—"}</Td>
                      <Td className="text-textMuted text-xs">{stream.desc}</Td>
                    </Tr>
                  );
                })}
                <Tr>
                  <Td colSpan={2} className="font-black text-text text-sm">Total</Td>
                  <Td><span className="font-black text-cyan text-base">{formatZAR(totalRevenue)}</span></Td>
                  <Td className="text-text font-bold text-sm">100%</Td>
                  <Td className="text-textMuted text-sm">{totalTxns.toLocaleString()}</Td>
                  <Td className="text-textDim text-xs">All revenue streams</Td>
                </Tr>
              </Table>
            </Card>

            {/* Export */}
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => window.open(`${BASE}/api/admin/export/financial-report`, "_blank")}>
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
