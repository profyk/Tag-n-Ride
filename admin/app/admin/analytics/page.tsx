"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Spinner, StatCard } from "@/components/ui";
import { api } from "@/lib/api";
import { formatZAR } from "@/lib/utils";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const TT = {
  contentStyle: {
    background: "var(--bg2)", border: "1px solid var(--border)",
    borderRadius: 8, color: "var(--text)", fontSize: 12,
  },
};
const PIE_COLORS = ["#00D4FF", "#00E676", "#A064FF", "#FFD60A"];

export default function AnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.analytics().then((r) => setData(r.data)).finally(() => setLoading(false));
  }, []);

  if (loading) return <AdminShell title="Analytics"><Spinner /></AdminShell>;

  return (
    <AdminShell title="Analytics">
      <div className="space-y-6">

        {data?.transactions_by_type?.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {data.transactions_by_type.map((t: any) => (
              <StatCard key={t.type}
                label={`${t.type} transactions`}
                value={formatZAR(t.total)}
                sub={`${t.count} total`}
                tone={t.type === "topup" ? "cyan" : t.type === "payment" ? "green" : "purple"}
              />
            ))}
          </div>
        )}

        <Card>
          <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4">
            Daily Volume (30 days)
          </h2>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={data?.daily_volume ?? []}>
              <defs>
                <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00D4FF" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#00D4FF" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }} />
              <YAxis stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }}
                tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
              <Tooltip {...TT} formatter={(v: number, n: string) => [
                n === "amount" ? formatZAR(v) : v,
                n === "amount" ? "Revenue" : "Count"
              ]} />
              <Legend wrapperStyle={{ color: "var(--textMuted)", fontSize: 12 }} />
              <Area type="monotone" dataKey="amount" stroke="#00D4FF" fill="url(#gC)"
                strokeWidth={2} dot={false} name="Revenue" />
              <Area type="monotone" dataKey="count" stroke="#00E676" fill="none"
                strokeWidth={2} dot={false} name="Count" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4">
              Weekly Revenue
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data?.weekly_revenue ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="week" stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }} />
                <YAxis stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }}
                  tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                <Tooltip {...TT} formatter={(v: number) => [formatZAR(v), "Revenue"]} />
                <Bar dataKey="amount" fill="#00D4FF" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4">
              Transaction Types
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={data?.transactions_by_type ?? []} dataKey="count" nameKey="type"
                  cx="50%" cy="50%" outerRadius={70}
                  label={({ type, percent }: any) => `${type} ${(percent * 100).toFixed(0)}%`}>
                  {(data?.transactions_by_type ?? []).map((_: any, i: number) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip {...TT} />
              </PieChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4">
              Driver Earnings Leaderboard
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data?.driver_leaderboard ?? []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }}
                  tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" stroke="var(--textDim)"
                  tick={{ fontSize: 10, fill: "var(--textMuted)" }} width={80} />
                <Tooltip {...TT} formatter={(v: number) => [formatZAR(v), "Earnings"]} />
                <Bar dataKey="earnings" fill="#00E676" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4">
              Top Passengers by Spend
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data?.top_passengers ?? []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }}
                  tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" stroke="var(--textDim)"
                  tick={{ fontSize: 10, fill: "var(--textMuted)" }} width={80} />
                <Tooltip {...TT} formatter={(v: number) => [formatZAR(v), "Spent"]} />
                <Bar dataKey="total_spent" fill="#A064FF" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>

        <Card>
          <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4">
            Withdrawal Trend (30 days)
          </h2>
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
              <YAxis stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }}
                tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
              <Tooltip {...TT} formatter={(v: number) => [formatZAR(v), "Withdrawals"]} />
              <Area type="monotone" dataKey="amount" stroke="#A064FF" fill="url(#gR)"
                strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <p className="text-textDim text-xs text-center">
          All charts exclude test account data.
        </p>
      </div>
    </AdminShell>
  );
}
