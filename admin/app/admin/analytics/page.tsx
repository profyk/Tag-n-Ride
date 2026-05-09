"use client";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Spinner } from "@/components/ui";
import { useAnalytics } from "@/lib/hooks";
import { formatZAR } from "@/lib/utils";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

const tooltipStyle = { contentStyle: { background: "#1A1A24", border: "1px solid #2A2A3E", borderRadius: 8, color: "#F0F0FF", fontFamily: "Syne, sans-serif", fontSize: 12 } };

export default function AnalyticsPage() {
  const { data, isLoading } = useAnalytics();
  if (isLoading) return <AdminShell title="Analytics"><Spinner /></AdminShell>;
  return (
    <AdminShell title="Analytics">
      <div className="space-y-6">
        <Card>
          <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4">Daily Transaction Volume</h2>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data?.daily_volume ?? []}>
              <defs>
                <linearGradient id="gradCyan" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00D4FF" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#00D4FF" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradGreen" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00E676" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#00E676" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" />
              <XAxis dataKey="date" stroke="#444466" tick={{ fontSize: 11, fill: "#8888AA" }} />
              <YAxis stroke="#444466" tick={{ fontSize: 11, fill: "#8888AA" }} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
              <Tooltip {...tooltipStyle} formatter={(v: number, n: string) => [n === "amount" ? formatZAR(v) : v, n === "amount" ? "Revenue" : "Count"]} />
              <Legend formatter={(v) => v === "amount" ? "Revenue" : "Count"} wrapperStyle={{ color: "#8888AA", fontSize: 12 }} />
              <Area type="monotone" dataKey="amount" stroke="#00D4FF" fill="url(#gradCyan)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="count" stroke="#00E676" fill="url(#gradGreen)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4">Driver Earnings Leaderboard</h2>
          {data?.driver_leaderboard?.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.driver_leaderboard} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" horizontal={false} />
                <XAxis type="number" stroke="#444466" tick={{ fontSize: 11, fill: "#8888AA" }} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" stroke="#444466" tick={{ fontSize: 11, fill: "#8888AA" }} width={100} />
                <Tooltip {...tooltipStyle} formatter={(v: number) => [formatZAR(v), "Earnings"]} />
                <Bar dataKey="earnings" fill="#00D4FF" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-textMuted text-sm text-center py-8">No driver data yet</p>}
        </Card>
      </div>
    </AdminShell>
  );
}
