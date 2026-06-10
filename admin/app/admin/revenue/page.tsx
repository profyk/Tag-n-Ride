"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Spinner, StatCard } from "@/components/ui";
import { formatZAR } from "@/lib/utils";
import { DollarSign, TrendingUp, Percent, Download, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const BASE = "https://tag-n-ride-production.up.railway.app";
const h = () => ({ Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`, "Content-Type": "application/json" });

export default function RevenuePage() {
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("30d");
  const [feeConfig, setFeeConfig] = useState<Record<string, string>>({});
  const [payoutCfg, setPayoutCfg] = useState<any>({});

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`${BASE}/api/admin/analytics?range=${range}`, { headers: h() }).then(r => r.json()),
      fetch(`${BASE}/api/admin/config`, { headers: h() }).then(r => r.json()).catch(() => []),
      fetch(`${BASE}/api/admin/payout-settings`, { headers: h() }).then(r => r.json()).catch(() => ({})),
    ]).then(([anal, cfg, ps]) => {
      setAnalytics(anal);
      const cfgMap: Record<string, string> = {};
      if (Array.isArray(cfg)) cfg.forEach((row: any) => { cfgMap[row.key] = row.value; });
      setFeeConfig(cfgMap);
      setPayoutCfg(ps);
    })
    .catch(() => toast.error("Failed to load revenue data"))
    .finally(() => setLoading(false));
  }, [range]);

  const daily = analytics?.daily_volume || [];
  const totalVolume = daily.reduce((s: number, d: any) => s + (d.amount || 0), 0);
  const totalFees = daily.reduce((s: number, d: any) => s + (d.fees || 0), 0);
  const avgFeeRate = totalVolume > 0 ? ((totalFees / totalVolume) * 100).toFixed(2) : "—";

  const chartData = daily.slice(-30).map((d: any) => ({
    date: d.date ? new Date(d.date).toLocaleDateString("en-ZA", { month: "short", day: "numeric" }) : d.day,
    Volume: d.amount || 0,
    Fees: d.fees || 0,
  }));

  return (
    <AdminShell title="Revenue & Fees">
      <div className="space-y-6">
        {loading ? <Spinner /> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Gross Volume" value={formatZAR(totalVolume)} />
              <StatCard label="Fees Collected" value={formatZAR(totalFees)} />
              <StatCard label="Avg Fee Rate" value={`${avgFeeRate}%`} />
              <StatCard label="Transactions" value={daily.reduce((s: number, d: any) => s + (d.count || 0), 0).toLocaleString()} />
            </div>

            {/* Revenue projection */}
            {daily.length >= 7 && (() => {
              const days = daily.length;
              const avgDailyFee = totalFees / days;
              const avgDailyVol = totalVolume / days;
              const now = new Date();
              const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
              const dayOfMonth = now.getDate();
              const daysLeft = daysInMonth - dayOfMonth;
              const thisMonthData = daily.filter((d: any) => {
                const dDate = new Date(d.date ?? d.day ?? "");
                return dDate.getMonth() === now.getMonth() && dDate.getFullYear() === now.getFullYear();
              });
              const mtdFees = thisMonthData.reduce((s: number, d: any) => s + (d.fees || 0), 0);
              const mtdVol = thisMonthData.reduce((s: number, d: any) => s + (d.amount || 0), 0);
              const projectedFees = mtdFees + avgDailyFee * daysLeft;
              const projectedVol = mtdVol + avgDailyVol * daysLeft;
              return (
                <div className="bg-bg2 border border-cyan/10 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <TrendingUp size={10} className="text-cyan" /> Month-to-Date & Projection
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div><p className="text-textDim text-[10px]">MTD Volume</p><p className="text-cyan font-black text-xl">{formatZAR(mtdVol)}</p></div>
                    <div><p className="text-textDim text-[10px]">MTD Fees</p><p className="text-green font-black text-xl">{formatZAR(mtdFees)}</p></div>
                    <div><p className="text-textDim text-[10px]">Days remaining</p><p className="text-yellow font-black text-xl">{daysLeft}</p></div>
                    <div><p className="text-textDim text-[10px]">Projected month fees</p><p className="text-purple font-black text-xl">{formatZAR(projectedFees)}</p></div>
                  </div>
                </div>
              );
            })()}

            <Card>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <TrendingUp size={16} className="text-cyan" />
                  <h2 className="text-text font-bold">Revenue vs Fees — Last 30 Days</h2>
                </div>
                <div className="flex gap-2">
                  {["7d", "30d", "90d"].map((r) => (
                    <button
                      key={r}
                      onClick={() => setRange(r)}
                      className={`px-3 py-1 rounded text-xs font-bold transition-all ${range === r ? "bg-cyanDim text-cyan border border-cyan/20" : "text-textMuted hover:text-text"}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00D4FF" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#00D4FF" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="feeGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00E676" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#00E676" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1A1A2E" />
                    <XAxis dataKey="date" tick={{ fill: "#7777AA", fontSize: 10 }} />
                    <YAxis tick={{ fill: "#7777AA", fontSize: 10 }} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ background: "#0D0D16", border: "1px solid #1A1A2E", borderRadius: 8 }}
                      labelStyle={{ color: "#F0F0FF", fontSize: 11 }}
                      itemStyle={{ color: "#7777AA", fontSize: 11 }}
                      formatter={(v: any) => formatZAR(v)}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#7777AA" }} />
                    <Area type="monotone" dataKey="Volume" stroke="#00D4FF" fill="url(#revGrad)" strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="Fees" stroke="#00E676" fill="url(#feeGrad)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-textMuted text-sm text-center py-10">No chart data available</p>
              )}
            </Card>

            <Card>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Percent size={16} className="text-yellow" />
                  <h2 className="text-text font-bold">Live Fee Schedule</h2>
                  <span className="text-[10px] text-textDim bg-bg border border-border px-2 py-0.5 rounded-full">from admin config</span>
                </div>
                <a href="/admin/settings" className="text-xs text-cyan hover:underline flex items-center gap-1">
                  <RefreshCw size={11} /> Edit fees
                </a>
              </div>
              <Table headers={["Fee Type", "Current Rate", "Description"]} empty={false}>
                {[
                  {
                    label: "Platform Fee (ride payment)",
                    rate: feeConfig["platform_fee_percent"] ? `${feeConfig["platform_fee_percent"]}%` : "—",
                    desc: "Deducted from driver earnings on every ride",
                    key: "platform_fee_percent",
                  },
                  {
                    label: "Top-up Processing Fee",
                    rate: feeConfig["topup_processing_fee_percent"] ? `${feeConfig["topup_processing_fee_percent"]}%` : "—",
                    desc: "Charged to user on wallet top-up",
                    key: "topup_processing_fee_percent",
                  },
                  {
                    label: "Gateway Fee (top-up)",
                    rate: feeConfig["topup_gateway_fee_percent"]
                      ? `${feeConfig["topup_gateway_fee_percent"]}% + R${feeConfig["topup_gateway_fee_fixed"] ?? "0"}`
                      : "—",
                    desc: "Actual gateway cost passed through",
                    key: "topup_gateway_fee_percent",
                  },
                  {
                    label: "Instant Payout Fee",
                    rate: "R3.50 flat",
                    desc: "Stitch payout fee per withdrawal",
                    key: null,
                  },
                  {
                    label: "Owner Statement",
                    rate: payoutCfg.owner_statement_price != null ? `R${parseFloat(payoutCfg.owner_statement_price).toFixed(2)}` : "—",
                    desc: "Per fleet statement generated by owner",
                    key: null,
                  },
                  {
                    label: "Passenger Statement",
                    rate: payoutCfg.passenger_statement_price != null ? `R${parseFloat(payoutCfg.passenger_statement_price).toFixed(2)}` : "—",
                    desc: "Per expense statement generated by passenger",
                    key: null,
                  },
                ].map((f) => (
                  <Tr key={f.label}>
                    <Td className="font-semibold text-sm">{f.label}</Td>
                    <Td>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded border ${
                        f.rate === "—" ? "text-textDim border-border bg-bg" : "text-cyan border-cyan/20 bg-cyanDim"
                      }`}>{f.rate}</span>
                    </Td>
                    <Td className="text-textMuted text-xs">{f.desc}</Td>
                  </Tr>
                ))}
              </Table>
            </Card>

            <div className="flex justify-end">
              <Button onClick={() => window.open(`${BASE}/api/admin/export/transactions`, "_blank")}>
                <Download size={13} /> Export Revenue Report
              </Button>
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}
