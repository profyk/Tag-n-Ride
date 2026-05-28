"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Spinner, StatCard } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import { DollarSign, TrendingUp, Percent, Download } from "lucide-react";
import toast from "react-hot-toast";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend,
} from "recharts";

const BASE = "https://tag-n-ride-production.up.railway.app";
const h = () => ({ Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}` });

const FEE_TYPES = [
  { type: "ride_payment", label: "Ride Payment", rate: "8%", description: "Standard ride fare commission" },
  { type: "wallet_topup", label: "Wallet Top-up", rate: "1.5%", description: "Topup processing fee" },
  { type: "withdrawal", label: "Withdrawal", rate: "R2.50 flat", description: "Bank payout fee" },
  { type: "instant_payout", label: "Instant Payout", rate: "1%", description: "Express driver payout fee" },
];

export default function RevenuePage() {
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("30d");

  useEffect(() => {
    setLoading(true);
    fetch(`${BASE}/api/admin/analytics?range=${range}`, { headers: h() })
      .then((r) => r.json())
      .then(setAnalytics)
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
              <div className="flex items-center gap-2 mb-4">
                <Percent size={16} className="text-yellow" />
                <h2 className="text-text font-bold">Fee Schedule</h2>
              </div>
              <Table headers={["Transaction Type", "Rate", "Description"]} empty={false}>
                {FEE_TYPES.map((f) => (
                  <Tr key={f.type}>
                    <Td className="font-semibold">{f.label}</Td>
                    <Td><Badge label={f.rate} tone="cyan" /></Td>
                    <Td className="text-textMuted text-xs">{f.description}</Td>
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
