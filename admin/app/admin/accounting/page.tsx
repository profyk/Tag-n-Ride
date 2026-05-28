"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Spinner, Button, Badge } from "@/components/ui";
import { api } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  Calculator, TrendingUp, TrendingDown, Download, FileText,
  DollarSign, CreditCard, Wallet, BarChart3, RefreshCw,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart, Line,
} from "recharts";
import toast from "react-hot-toast";

const RANGES = ["7d", "30d", "90d"] as const;
type Range = typeof RANGES[number];

const VAT_RATE = 0.15;

const TT = {
  contentStyle: {
    background: "var(--bg2)", border: "1px solid var(--border)",
    borderRadius: 8, color: "var(--text)", fontSize: 12,
  },
};

function PLRow({ label, value, color = "text-text", bold = false, indent = false }: {
  label: string; value: string; color?: string; bold?: boolean; indent?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-2.5 border-b border-border last:border-0 ${indent ? "pl-4" : ""}`}>
      <span className={`text-sm ${bold ? "font-bold text-text" : "text-textMuted"}`}>{label}</span>
      <span className={`text-sm font-bold ${color}`}>{value}</span>
    </div>
  );
}

export default function AccountingPage() {
  const [data, setData] = useState<any>(null);
  const [dash, setDash] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>("30d");

  useEffect(() => {
    setLoading(true);
    Promise.all([api.analytics(range), api.dashboard()])
      .then(([a, d]) => { setData(a.data); setDash(d.data); })
      .catch(() => toast.error("Failed to load accounting data"))
      .finally(() => setLoading(false));
  }, [range]);

  const daily = data?.daily_volume ?? [];
  const weekly = data?.weekly_revenue ?? [];
  const byType = data?.transactions_by_type ?? [];

  const grossRevenue = daily.reduce((s: number, d: any) => s + (d.amount || 0), 0);
  const platformFees = daily.reduce((s: number, d: any) => s + (d.fees || 0), 0);

  // Use byType for fee breakdown
  const paymentVol = byType.find((t: any) => t.type === "payment")?.total || 0;
  const topupVol = byType.find((t: any) => t.type === "topup")?.total || 0;
  const withdrawalCount = byType.find((t: any) => t.type === "withdrawal")?.count || 0;

  const rideFeesEstimate = paymentVol * 0.08;
  const topupFeesEstimate = topupVol * 0.015;
  const withdrawalFeesEstimate = withdrawalCount * 2.50;
  const totalFeeRevenue = rideFeesEstimate + topupFeesEstimate + withdrawalFeesEstimate;

  const vatCollected = totalFeeRevenue * VAT_RATE;
  const netRevenue = totalFeeRevenue - vatCollected;
  const operatingCost = totalFeeRevenue * 0.12; // estimated 12% infrastructure cost
  const netProfit = netRevenue - operatingCost;

  // Monthly P&L data from weekly
  const plData = weekly.map((w: any, i: number) => ({
    period: w.week,
    revenue: w.amount * 0.08,
    costs: w.amount * 0.08 * 0.12,
    profit: w.amount * 0.08 * (1 - 0.12 - VAT_RATE),
  }));

  // Fee breakdown for pie
  const feeBreakdown = [
    { name: "Ride fees (8%)", value: Math.round(rideFeesEstimate), color: "#00D4FF" },
    { name: "Top-up fees (1.5%)", value: Math.round(topupFeesEstimate), color: "#00E676" },
    { name: "Withdrawal fees", value: Math.round(withdrawalFeesEstimate), color: "#A064FF" },
  ];

  const handleExport = async () => {
    try {
      await api.exportTransactions();
      toast.success("Export queued");
    } catch (e: any) { toast.error(e.message); }
  };

  if (loading) return <AdminShell title="Accounting"><Spinner /></AdminShell>;

  return (
    <AdminShell title="Accounting">
      <div className="space-y-6">

        {/* Header + range */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-textMuted text-sm">Financial summary and fee accounting — VAT @ 15%</p>
          </div>
          <div className="flex items-center gap-2">
            {RANGES.map(r => (
              <button key={r} onClick={() => setRange(r)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${range === r ? "bg-cyanDim text-cyan border-cyan/20" : "bg-bg2 text-textMuted border-border hover:text-text"}`}>
                {r}
              </button>
            ))}
            <Button variant="secondary" onClick={handleExport}><Download size={13} /> Export</Button>
          </div>
        </div>

        {/* Top KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: DollarSign, label: "Gross Volume", value: formatZAR(grossRevenue), color: "text-text", border: "border-border" },
            { icon: CreditCard, label: "Fee Revenue", value: formatZAR(totalFeeRevenue), color: "text-cyan", border: "border-cyan/20" },
            { icon: Wallet, label: "VAT Collected", value: formatZAR(vatCollected), color: "text-yellow", border: "border-yellow/20" },
            { icon: TrendingUp, label: "Net Profit", value: formatZAR(netProfit), color: netProfit >= 0 ? "text-green" : "text-red", border: netProfit >= 0 ? "border-green/20" : "border-red/20" },
          ].map(({ icon: Icon, label, value, color, border }) => (
            <Card key={label} className={`border ${border}`}>
              <div className="flex items-center gap-2 mb-2">
                <Icon size={16} className={color} />
                <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest">{label}</p>
              </div>
              <p className={`text-2xl font-black ${color}`}>{value}</p>
            </Card>
          ))}
        </div>

        {/* P&L Chart + Fee Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4 flex items-center gap-2">
              <BarChart3 size={14} className="text-cyan" /> Weekly P&amp;L
            </h2>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={plData}>
                <defs>
                  <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00E676" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#00E676" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="period" stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }} />
                <YAxis stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                <Tooltip {...TT} formatter={(v: number, n: string) => [formatZAR(v), n]} />
                <Bar dataKey="revenue" fill="#00D4FF" radius={[4, 4, 0, 0]} name="Revenue" opacity={0.8} />
                <Bar dataKey="costs" fill="#FF8C42" radius={[4, 4, 0, 0]} name="Costs" opacity={0.8} />
                <Area type="monotone" dataKey="profit" stroke="#00E676" fill="url(#profitGrad)" strokeWidth={2.5} dot={false} name="Net Profit" />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4 flex items-center gap-2">
              <Calculator size={14} className="text-purple" /> Fee Sources
            </h2>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={feeBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} innerRadius={35} paddingAngle={3}>
                  {feeBreakdown.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip {...TT} formatter={(v: number) => [formatZAR(v), ""]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 mt-2">
              {feeBreakdown.map(d => (
                <div key={d.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                    <span className="text-xs text-textMuted">{d.name}</span>
                  </div>
                  <span className="text-xs font-bold text-text">{formatZAR(d.value)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* P&L Statement */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4 flex items-center gap-2">
              <FileText size={14} className="text-green" /> Income Statement ({range})
            </h2>
            <div>
              <div className="mb-2">
                <p className="text-[10px] font-extrabold text-textDim uppercase tracking-widest mb-1">Revenue</p>
                <PLRow label="Gross transaction volume" value={formatZAR(grossRevenue)} indent />
                <PLRow label="Ride payment fees (8%)" value={formatZAR(rideFeesEstimate)} color="text-cyan" indent />
                <PLRow label="Top-up fees (1.5%)" value={formatZAR(topupFeesEstimate)} color="text-cyan" indent />
                <PLRow label="Withdrawal fees (R2.50 each)" value={formatZAR(withdrawalFeesEstimate)} color="text-cyan" indent />
                <PLRow label="Total Fee Revenue" value={formatZAR(totalFeeRevenue)} color="text-cyan" bold />
              </div>
              <div className="mb-2">
                <p className="text-[10px] font-extrabold text-textDim uppercase tracking-widest mb-1 mt-3">Deductions</p>
                <PLRow label="VAT @ 15%" value={`-${formatZAR(vatCollected)}`} color="text-yellow" indent />
                <PLRow label="Operating costs (est. 12%)" value={`-${formatZAR(operatingCost)}`} color="text-orange-400" indent />
              </div>
              <div className="pt-2 border-t border-border mt-2">
                <PLRow label="Net Profit" value={formatZAR(netProfit)} color={netProfit >= 0 ? "text-green" : "text-red"} bold />
                <PLRow label="Profit margin" value={`${totalFeeRevenue > 0 ? ((netProfit / totalFeeRevenue) * 100).toFixed(1) : 0}%`} color={netProfit >= 0 ? "text-green" : "text-red"} />
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4 flex items-center gap-2">
              <RefreshCw size={14} className="text-yellow" /> Fee Rate Schedule
            </h2>
            <div className="space-y-3">
              {[
                { type: "Ride Payment", rate: "8% platform fee", vol: formatZAR(paymentVol), earned: formatZAR(rideFeesEstimate), color: "cyan" },
                { type: "Wallet Top-up", rate: "1.5% processing", vol: formatZAR(topupVol), earned: formatZAR(topupFeesEstimate), color: "green" },
                { type: "Withdrawal (Stitch)", rate: "R2.50 flat / R3.50 instant", vol: `${withdrawalCount} transactions`, earned: formatZAR(withdrawalFeesEstimate), color: "purple" },
              ].map(({ type, rate, vol, earned, color }) => (
                <div key={type} className={`p-4 rounded-xl border border-${color}/20 bg-${color}/5`}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-bold text-sm text-text">{type}</p>
                    <Badge label={rate} tone={color as any} />
                  </div>
                  <div className="flex justify-between text-xs text-textMuted mt-2">
                    <span>Volume: {vol}</span>
                    <span className={`font-bold text-${color}`}>Earned: {earned}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 p-4 rounded-xl bg-yellow/5 border border-yellow/20">
              <p className="text-[10px] font-extrabold text-yellow uppercase tracking-widest mb-2">VAT Summary</p>
              <div className="flex justify-between text-sm">
                <span className="text-textMuted">Fee revenue (excl. VAT)</span>
                <span className="font-bold text-text">{formatZAR(totalFeeRevenue / (1 + VAT_RATE))}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-textMuted">VAT @ 15%</span>
                <span className="font-bold text-yellow">{formatZAR(vatCollected)}</span>
              </div>
              <div className="flex justify-between text-sm mt-1 pt-2 border-t border-yellow/20">
                <span className="font-bold text-text">Total incl. VAT</span>
                <span className="font-bold text-cyan">{formatZAR(totalFeeRevenue)}</span>
              </div>
            </div>
          </Card>
        </div>

      </div>
    </AdminShell>
  );
}
