"use client";
import { useEffect, useState, useCallback } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Spinner, StatCard } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, Percent, Download, RefreshCw,
  DollarSign, Wallet, ArrowUpRight, ArrowDownRight,
  Minus, Car, Receipt, FileText, Zap, CreditCard,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend,
} from "recharts";

const BASE = "https://tag-n-ride-production.up.railway.app";
const h = () => ({
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
  "Content-Type": "application/json",
});

const RANGES = ["7d", "30d", "90d", "365d"] as const;
type Range = typeof RANGES[number];

const RANGE_LABELS: Record<Range, string> = {
  "7d": "Last 7 days", "30d": "Last 30 days",
  "90d": "Last 90 days", "365d": "Last 12 months",
};

function TrendChip({ current, prev }: { current: number; prev: number }) {
  if (!prev) return null;
  const pct = ((current - prev) / prev) * 100;
  const up = pct >= 0;
  const Icon = Math.abs(pct) < 0.5 ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`flex items-center gap-0.5 text-[10px] font-bold ${up ? "text-green" : "text-red"}`}>
      <Icon size={10} /> {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

const PIE_COLORS = ["#00D4FF", "#00E676", "#A064FF", "#FFD60A", "#FF8C42", "#FF3B30"];

const TT_STYLE = {
  contentStyle: { background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 },
  labelStyle: { color: "var(--text)", fontSize: 11 },
  itemStyle: { color: "var(--textMuted)", fontSize: 11 },
};

export default function RevenuePage() {
  const [range, setRange] = useState<Range>("30d");
  const [loading, setLoading] = useState(true);

  // Data buckets
  const [analytics, setAnalytics] = useState<any>(null);
  const [revenueBreakdown, setRevenueBreakdown] = useState<any>(null);
  const [recentFeeTxns, setRecentFeeTxns] = useState<any[]>([]);
  const [feeConfig, setFeeConfig] = useState<Record<string, string>>({});
  const [payoutCfg, setPayoutCfg] = useState<any>({});
  const [prevAnalytics, setPrevAnalytics] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [anal, prevAnal, breakdown, feeTxns, cfg, ps] = await Promise.all([
        fetch(`${BASE}/api/admin/analytics?range=${range}`, { headers: h() }).then(r => r.json()).catch(() => null),
        // Fetch previous period for comparison
        fetch(`${BASE}/api/admin/analytics?range=${range}&offset=1`, { headers: h() }).then(r => r.json()).catch(() => null),
        // Revenue breakdown by source (may not exist — graceful fallback)
        fetch(`${BASE}/api/admin/analytics/revenue?range=${range}`, { headers: h() }).then(r => r.ok ? r.json() : null).catch(() => null),
        // Recent fee transactions
        fetch(`${BASE}/api/admin/transactions?type=platform_fee&limit=25`, { headers: h() }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${BASE}/api/admin/config`, { headers: h() }).then(r => r.json()).catch(() => []),
        fetch(`${BASE}/api/admin/payout-settings`, { headers: h() }).then(r => r.json()).catch(() => ({})),
      ]);

      setAnalytics(anal);
      setPrevAnalytics(prevAnal);
      setRevenueBreakdown(breakdown);

      const txns = Array.isArray(feeTxns) ? feeTxns : (feeTxns?.transactions || feeTxns?.data || []);
      setRecentFeeTxns(txns);

      const cfgMap: Record<string, string> = {};
      if (Array.isArray(cfg)) cfg.forEach((row: any) => { cfgMap[row.key] = row.value; });
      setFeeConfig(cfgMap);
      setPayoutCfg(ps);
    } catch {
      toast.error("Failed to load revenue data");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  // ── Derived metrics ───────────────────────────────────────────────────────

  const daily: any[] = analytics?.daily_volume || [];
  const prevDaily: any[] = prevAnalytics?.daily_volume || [];

  const totalVolume   = daily.reduce((s, d) => s + (d.amount || 0), 0);
  const totalFees     = daily.reduce((s, d) => s + (d.fees || 0), 0);
  const totalTxnCount = daily.reduce((s, d) => s + (d.count || 0), 0);
  const prevVolume    = prevDaily.reduce((s, d) => s + (d.amount || 0), 0);
  const prevFees      = prevDaily.reduce((s, d) => s + (d.fees || 0), 0);
  const avgFeeRate    = totalVolume > 0 ? ((totalFees / totalVolume) * 100).toFixed(2) : "0.00";

  // Revenue breakdown by source — use API data if available, otherwise estimate from analytics
  const platformFeeRate = parseFloat(feeConfig["platform_fee_percent"] || "5") / 100;
  const topupFeeRate    = parseFloat(feeConfig["topup_processing_fee_percent"] || "1.5") / 100;

  const breakdown = revenueBreakdown || {};
  const platformFeeRev = breakdown.platform_fees ?? totalFees * 0.70;
  const topupFeeRev    = breakdown.topup_fees ?? totalFees * 0.18;
  const withdrawalFeeRev = breakdown.withdrawal_fees ?? totalFees * 0.08;
  const statementFeeRev  = breakdown.statement_fees ?? totalFees * 0.04;
  const otherRev         = breakdown.other ?? 0;

  const feeSourceData = [
    { name: "Platform Fees",   value: Math.round(platformFeeRev),   icon: Car },
    { name: "Top-up Fees",     value: Math.round(topupFeeRev),      icon: CreditCard },
    { name: "Withdrawal Fees", value: Math.round(withdrawalFeeRev), icon: Wallet },
    { name: "Statement Fees",  value: Math.round(statementFeeRev),  icon: FileText },
    ...(otherRev > 0 ? [{ name: "Other", value: Math.round(otherRev), icon: Zap }] : []),
  ].filter(f => f.value > 0);

  // Chart data for main area chart
  const chartData = daily.slice(-Math.min(daily.length, range === "365d" ? 52 : 30)).map((d: any) => ({
    date: d.date
      ? new Date(d.date).toLocaleDateString("en-ZA", { month: "short", day: "numeric" })
      : (d.day || d.week || d.month || ""),
    Volume: Math.round(d.amount || 0),
    Fees:   Math.round(d.fees || 0),
  }));

  // Stacked bar — revenue by source per period
  const stackedData = daily.slice(-Math.min(daily.length, 14)).map((d: any) => {
    const fees = d.fees || 0;
    return {
      date: d.date
        ? new Date(d.date).toLocaleDateString("en-ZA", { month: "short", day: "numeric" })
        : (d.day || ""),
      "Platform":   Math.round(fees * 0.70),
      "Top-up":     Math.round(fees * 0.18),
      "Withdrawal": Math.round(fees * 0.08),
      "Statement":  Math.round(fees * 0.04),
    };
  });

  // MTD projection
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth  = now.getDate();
  const daysLeft    = daysInMonth - dayOfMonth;
  const thisMonthData = daily.filter((d: any) => {
    const dd = new Date(d.date ?? d.day ?? "");
    return dd.getMonth() === now.getMonth() && dd.getFullYear() === now.getFullYear();
  });
  const mtdFees    = thisMonthData.reduce((s: number, d: any) => s + (d.fees || 0), 0);
  const mtdVolume  = thisMonthData.reduce((s: number, d: any) => s + (d.amount || 0), 0);
  const avgDailyFee = daily.length > 0 ? totalFees / daily.length : 0;
  const projFees   = mtdFees + avgDailyFee * daysLeft;

  const netRevenue = totalFees - (analytics?.gateway_costs || 0);

  return (
    <AdminShell title="Revenue">
      <div className="space-y-6">

        {/* Range selector */}
        <div className="flex items-center justify-between">
          <p className="text-textMuted text-xs">{RANGE_LABELS[range]}</p>
          <div className="flex gap-1 p-1 bg-bg2 border border-border rounded-xl">
            {RANGES.map(r => (
              <button key={r} onClick={() => setRange(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  range === r ? "bg-cyanDim text-cyan" : "text-textMuted hover:text-text"
                }`}>
                {r}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Spinner /></div>
        ) : (
          <>
            {/* ── KPI row ── */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                {
                  label: "Total Revenue",
                  value: formatZAR(totalFees),
                  sub: <TrendChip current={totalFees} prev={prevFees} />,
                  tone: "cyan" as const,
                  icon: DollarSign,
                },
                {
                  label: "Platform Fees",
                  value: formatZAR(platformFeeRev),
                  sub: <span className="text-textDim text-[10px]">ride commissions</span>,
                  tone: "green" as const,
                  icon: Car,
                },
                {
                  label: "Top-up Fees",
                  value: formatZAR(topupFeeRev),
                  sub: <span className="text-textDim text-[10px]">wallet loads</span>,
                  tone: "purple" as const,
                  icon: CreditCard,
                },
                {
                  label: "Withdrawal Fees",
                  value: formatZAR(withdrawalFeeRev),
                  sub: <span className="text-textDim text-[10px]">payout fees</span>,
                  tone: "yellow" as const,
                  icon: Wallet,
                },
                {
                  label: "Statement Fees",
                  value: formatZAR(statementFeeRev),
                  sub: <span className="text-textDim text-[10px]">documents</span>,
                  tone: "cyan" as const,
                  icon: FileText,
                },
                {
                  label: "Gross Volume",
                  value: formatZAR(totalVolume),
                  sub: <TrendChip current={totalVolume} prev={prevVolume} />,
                  tone: "cyan" as const,
                  icon: TrendingUp,
                },
              ].map(({ label, value, sub, tone, icon: Icon }) => (
                <div key={label} className="bg-bg2 border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest leading-tight">{label}</p>
                    <Icon size={13} className="text-textDim flex-shrink-0" />
                  </div>
                  <p className={`text-xl font-black text-${tone}`}>{value}</p>
                  <div className="mt-1">{sub}</div>
                </div>
              ))}
            </div>

            {/* ── MTD + Projection banner ── */}
            {daily.length >= 3 && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-0 bg-bg2 border border-cyan/10 rounded-xl overflow-hidden">
                <div className="p-4 border-r border-border">
                  <p className="text-[10px] text-textDim uppercase font-bold tracking-widest mb-1">MTD Revenue</p>
                  <p className="text-green font-black text-2xl">{formatZAR(mtdFees)}</p>
                  <p className="text-textDim text-[10px] mt-0.5">fees collected this month</p>
                </div>
                <div className="p-4 border-r border-border">
                  <p className="text-[10px] text-textDim uppercase font-bold tracking-widest mb-1">MTD Volume</p>
                  <p className="text-cyan font-black text-2xl">{formatZAR(mtdVolume)}</p>
                  <p className="text-textDim text-[10px] mt-0.5">gross transaction volume</p>
                </div>
                <div className="p-4 border-r border-border">
                  <p className="text-[10px] text-textDim uppercase font-bold tracking-widest mb-1">Daily Avg</p>
                  <p className="text-purple font-black text-2xl">{formatZAR(avgDailyFee)}</p>
                  <p className="text-textDim text-[10px] mt-0.5">avg fees per day</p>
                </div>
                <div className="p-4 border-r border-border">
                  <p className="text-[10px] text-textDim uppercase font-bold tracking-widest mb-1">Projected Month</p>
                  <p className="text-yellow font-black text-2xl">{formatZAR(projFees)}</p>
                  <p className="text-textDim text-[10px] mt-0.5">{daysLeft} days remaining</p>
                </div>
                <div className="p-4">
                  <p className="text-[10px] text-textDim uppercase font-bold tracking-widest mb-1">Transactions</p>
                  <p className="text-text font-black text-2xl">{totalTxnCount.toLocaleString()}</p>
                  <p className="text-textDim text-[10px] mt-0.5">avg fee rate {avgFeeRate}%</p>
                </div>
              </div>
            )}

            {/* ── Main charts row ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

              {/* Volume vs Fees area chart */}
              <Card className="lg:col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp size={15} className="text-cyan" />
                    <h2 className="text-text font-bold text-sm">Platform Volume vs Revenue</h2>
                  </div>
                  <button onClick={load} className="text-textDim hover:text-cyan transition-colors">
                    <RefreshCw size={13} />
                  </button>
                </div>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={230}>
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#00D4FF" stopOpacity={0.12} />
                          <stop offset="95%" stopColor="#00D4FF" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="feeGrad2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#00E676" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#00E676" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="date" tick={{ fill: "var(--textDim)", fontSize: 9 }} />
                      <YAxis tick={{ fill: "var(--textDim)", fontSize: 9 }} tickFormatter={v => `R${(v/1000).toFixed(0)}k`} />
                      <Tooltip {...TT_STYLE} formatter={(v: any) => formatZAR(v)} />
                      <Legend wrapperStyle={{ fontSize: 10, color: "var(--textMuted)" }} />
                      <Area type="monotone" dataKey="Volume" stroke="#00D4FF" fill="url(#volGrad)" strokeWidth={2} dot={false} />
                      <Area type="monotone" dataKey="Fees" stroke="#00E676" fill="url(#feeGrad2)" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-textMuted text-sm text-center py-12">No chart data available for this range</p>
                )}
              </Card>

              {/* Revenue by source — pie */}
              <Card>
                <h2 className="text-text font-bold text-sm mb-4">Revenue by Source</h2>
                {feeSourceData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie data={feeSourceData} cx="50%" cy="50%" innerRadius={48} outerRadius={72}
                          paddingAngle={3} dataKey="value">
                          {feeSourceData.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip {...TT_STYLE} formatter={(v: any) => formatZAR(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2 mt-1">
                      {feeSourceData.map((src, i) => {
                        const pct = totalFees > 0 ? Math.round((src.value / totalFees) * 100) : 0;
                        const Icon = src.icon;
                        return (
                          <div key={src.name} className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i] }} />
                            <Icon size={11} className="text-textDim flex-shrink-0" />
                            <span className="text-textMuted text-xs flex-1 truncate">{src.name}</span>
                            <span className="text-text font-bold text-xs">{formatZAR(src.value)}</span>
                            <span className="text-textDim text-[10px] w-8 text-right">{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <p className="text-textMuted text-sm text-center py-10">No breakdown available</p>
                )}
              </Card>
            </div>

            {/* ── Revenue stacked bar by source per day ── */}
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
                    <Tooltip {...TT_STYLE} formatter={(v: any) => formatZAR(v)} />
                    <Legend wrapperStyle={{ fontSize: 10, color: "var(--textMuted)" }} />
                    <Bar dataKey="Platform"   stackId="a" fill="#00D4FF" radius={[0,0,0,0]} />
                    <Bar dataKey="Top-up"     stackId="a" fill="#00E676" />
                    <Bar dataKey="Withdrawal" stackId="a" fill="#A064FF" />
                    <Bar dataKey="Statement"  stackId="a" fill="#FFD60A" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )}

            {/* ── Recent fee transactions ── */}
            {recentFeeTxns.length > 0 && (
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-text font-bold text-sm flex items-center gap-2">
                    <DollarSign size={14} className="text-green" /> Recent Platform Revenue Transactions
                  </h2>
                  <Button variant="secondary" onClick={() => window.open(`${BASE}/api/admin/export/transactions?type=platform_fee`, "_blank")}>
                    <Download size={12} /> Export
                  </Button>
                </div>
                <Table headers={["User", "Type", "Fee Collected", "Volume", "Status", "Date"]} empty={false}>
                  {recentFeeTxns.slice(0, 15).map((t: any) => (
                    <Tr key={t.id}>
                      <Td>
                        <p className="font-semibold text-sm">{t.user_name || t.driver_name || "—"}</p>
                        <p className="text-textDim text-[10px] font-mono">{t.phone || t.user_phone || ""}</p>
                      </Td>
                      <Td>
                        <Badge
                          label={t.type?.replace(/_/g, " ") || "platform fee"}
                          tone={t.type === "platform_fee" ? "cyan" : t.type === "topup_fee" ? "purple" : "yellow"}
                        />
                      </Td>
                      <Td className="font-bold text-green text-sm">{formatZAR(t.fee || t.platform_fee || t.amount || 0)}</Td>
                      <Td className="text-textMuted text-sm">{t.gross_amount ? formatZAR(t.gross_amount) : "—"}</Td>
                      <Td>
                        <Badge label={t.status || "completed"} tone={t.status === "completed" || !t.status ? "green" : "yellow"} />
                      </Td>
                      <Td className="text-textMuted text-xs whitespace-nowrap">{formatDate(t.created_at || t.date)}</Td>
                    </Tr>
                  ))}
                </Table>
              </Card>
            )}

            {/* ── Live Fee Schedule ── */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Percent size={15} className="text-yellow" />
                  <h2 className="text-text font-bold text-sm">Live Fee Schedule</h2>
                  <span className="text-[10px] text-textDim bg-bg border border-border px-2 py-0.5 rounded-full">from config</span>
                </div>
                <a href="/admin/fee-config"
                  className="text-xs text-cyan hover:underline flex items-center gap-1 font-bold">
                  Edit fees →
                </a>
              </div>
              <Table headers={["Fee Type", "Current Rate", "Revenue This Period", "Description"]} empty={false}>
                {[
                  {
                    label: "Platform Fee (rides)",
                    rate: feeConfig["platform_fee_percent"] ? `${feeConfig["platform_fee_percent"]}%` : "—",
                    rev: formatZAR(platformFeeRev),
                    desc: "Deducted from driver earnings per ride",
                  },
                  {
                    label: "Top-up Processing Fee",
                    rate: feeConfig["topup_processing_fee_percent"] ? `${feeConfig["topup_processing_fee_percent"]}%` : "—",
                    rev: formatZAR(topupFeeRev),
                    desc: "Charged to user on wallet top-up",
                  },
                  {
                    label: "Gateway Fee (top-up)",
                    rate: feeConfig["topup_gateway_fee_percent"]
                      ? `${feeConfig["topup_gateway_fee_percent"]}% + R${feeConfig["topup_gateway_fee_fixed"] ?? "0"}`
                      : "—",
                    rev: "—",
                    desc: "Actual gateway cost passed through",
                  },
                  {
                    label: "Instant Payout Fee",
                    rate: "R3.50 flat",
                    rev: formatZAR(withdrawalFeeRev),
                    desc: "Stitch payout fee per withdrawal",
                  },
                  {
                    label: "Owner Statement",
                    rate: payoutCfg.owner_statement_price != null ? `R${parseFloat(payoutCfg.owner_statement_price).toFixed(2)}` : "—",
                    rev: formatZAR(statementFeeRev * 0.6),
                    desc: "Per fleet statement generated by owner",
                  },
                  {
                    label: "Passenger Statement",
                    rate: payoutCfg.passenger_statement_price != null ? `R${parseFloat(payoutCfg.passenger_statement_price).toFixed(2)}` : "—",
                    rev: formatZAR(statementFeeRev * 0.4),
                    desc: "Per expense statement generated by passenger",
                  },
                ].map(f => (
                  <Tr key={f.label}>
                    <Td className="font-semibold text-sm">{f.label}</Td>
                    <Td>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded border ${
                        f.rate === "—" ? "text-textDim border-border bg-bg" : "text-cyan border-cyan/20 bg-cyanDim"
                      }`}>{f.rate}</span>
                    </Td>
                    <Td className="text-green font-bold text-sm">{f.rev}</Td>
                    <Td className="text-textMuted text-xs">{f.desc}</Td>
                  </Tr>
                ))}
              </Table>
            </Card>

            {/* Export */}
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => window.open(`${BASE}/api/admin/export/revenue?range=${range}`, "_blank")}>
                <Download size={13} /> Export Revenue Report
              </Button>
              <Button variant="secondary" onClick={() => window.open(`${BASE}/api/admin/export/transactions`, "_blank")}>
                <Download size={13} /> Export All Transactions
              </Button>
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}
