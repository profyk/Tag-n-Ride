"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Button, Spinner, StatCard, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  ComposedChart, Bar, Line, BarChart, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";
import {
  Download, UserX, TrendingDown, AlertTriangle, Users, Crown, Medal, ArrowUpRight,
} from "lucide-react";
import toast from "react-hot-toast";

const TT = {
  contentStyle: { background: "#0D0D16", border: "1px solid #1A1A2E", borderRadius: 8, color: "#F0F0FF", fontSize: 12 },
};

const SPENDER_BAR_COLORS = ["#00D4FF", "#22D3A8", "#B388FF", "#FFD166", "#FF8A65"];

function daysSince(date: string | null) {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 0) return <Crown size={13} className="text-yellow" />;
  if (rank === 1) return <Medal size={13} className="text-textMuted" />;
  if (rank === 2) return <Medal size={13} className="text-orange" />;
  return <span className="text-textDim font-mono text-xs">#{rank + 1}</span>;
}

export default function PassengersPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [spenderSearch, setSpenderSearch] = useState("");
  const [inactiveSearch, setInactiveSearch] = useState("");

  useEffect(() => {
    api.passengerAnalytics().then(r => setData(r.data)).catch(() => toast.error("Failed to load passenger analytics")).finally(() => setLoading(false));
  }, []);

  if (loading) return <AdminShell title="Passenger Analytics"><Spinner /></AdminShell>;

  const topSpenders: any[] = data?.top_spenders || [];
  const inactive: any[] = data?.inactive_passengers || [];
  const topupPatterns: any[] = data?.topup_patterns || [];

  const totalPassengers = data?.total_passengers ?? 0;
  const newThisWeek = data?.new_this_week ?? 0;
  const active7d = data?.active_7d ?? 0;
  const totalWalletBalance = data?.total_wallet_balance ?? 0;

  const avgLTV = topSpenders.length > 0
    ? Math.round(topSpenders.reduce((s: number, p: any) => s + p.total_spent, 0) / topSpenders.length)
    : 0;
  const atRiskCount = inactive.filter((p: any) => {
    const days = daysSince(p.last_transaction);
    return days !== null && days > 60;
  }).length;
  const activePct = totalPassengers > 0 ? Math.round((active7d / totalPassengers) * 100) : 0;

  const filteredSpenders = topSpenders.filter((p: any) =>
    !spenderSearch ||
    p.full_name?.toLowerCase().includes(spenderSearch.toLowerCase()) ||
    p.phone_number?.includes(spenderSearch)
  );

  const filteredInactive = inactive.filter((p: any) =>
    !inactiveSearch ||
    p.full_name?.toLowerCase().includes(inactiveSearch.toLowerCase()) ||
    p.phone_number?.includes(inactiveSearch)
  );

  const top10Chart = topSpenders.slice(0, 10).map((p: any) => ({
    name: p.full_name?.split(" ")[0] || p.phone_number,
    total_spent: p.total_spent,
  }));

  const exportCsv = (rows: any[], filename: string) => {
    if (!rows.length) { toast.error("Nothing to export"); return; }
    const header = Object.keys(rows[0]);
    const csv = [header, ...rows.map(r => header.map(k => `"${r[k] ?? ""}"`))].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url); toast.success("Exported");
  };

  return (
    <AdminShell title="Passenger Analytics">
      <div className="space-y-6">

        {/* Header action */}
        <div className="flex items-center justify-end">
          <Link href="/admin/users?role=passenger">
            <Button variant="secondary">
              <Users size={13} /> Manage Passenger Accounts <ArrowUpRight size={13} />
            </Button>
          </Link>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard label="Total Passengers" value={totalPassengers.toLocaleString()} tone="cyan" />
          <StatCard label="New This Week" value={newThisWeek.toLocaleString()} tone="green"
            sub={newThisWeek > 0 ? "Growing" : undefined} />
          <StatCard label="Active (7d)" value={active7d.toLocaleString()} tone="purple" sub={`${activePct}% of base`} />
          <StatCard label="Total Wallet Balance" value={formatZAR(totalWalletBalance)} tone="yellow" />
          <StatCard label="Avg LTV (top 20)" value={formatZAR(avgLTV)} tone="green" />
          <Card className={`text-center p-4 ${atRiskCount > 0 ? "border-red/30" : ""}`}>
            <p className={`text-2xl font-extrabold ${atRiskCount > 0 ? "text-red" : "text-textMuted"}`}>
              {atRiskCount}
            </p>
            <p className="text-xs text-textMuted mt-1">At Risk (60+ days)</p>
          </Card>
        </div>

        {atRiskCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red/10 border border-red/20">
            <AlertTriangle size={14} className="text-red" />
            <p className="text-sm text-red font-semibold">
              {atRiskCount} passenger{atRiskCount !== 1 ? "s have" : " has"} been inactive for over 60 days — consider a re-engagement campaign.
            </p>
          </div>
        )}

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Top-up patterns chart */}
          {topupPatterns.length > 0 && (
            <Card>
              <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4">
                Top-up Patterns (12 weeks)
              </h2>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={topupPatterns}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" />
                  <XAxis dataKey="week" stroke="#444466" tick={{ fontSize: 9, fill: "#8888AA" }} />
                  <YAxis yAxisId="left" stroke="#444466" tick={{ fontSize: 10, fill: "#8888AA" }} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                  <YAxis yAxisId="right" orientation="right" stroke="#444466" tick={{ fontSize: 10, fill: "#8888AA" }} allowDecimals={false} />
                  <Tooltip {...TT} formatter={(v: number, n: string) => [n === "total" ? formatZAR(v) : v, n === "total" ? "Amount" : "Top-up count"]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="total" name="Amount" fill="#00D4FF" radius={[3, 3, 0, 0]} />
                  <Line yAxisId="right" dataKey="topups" name="Count" stroke="#FFD166" strokeWidth={2} dot={{ r: 2 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* Top 10 spenders chart */}
          {top10Chart.length > 0 && (
            <Card>
              <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4">
                Top 10 Spenders
              </h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={top10Chart} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" horizontal={false} />
                  <XAxis type="number" stroke="#444466" tick={{ fontSize: 10, fill: "#8888AA" }} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" stroke="#444466" tick={{ fontSize: 10, fill: "#8888AA" }} width={70} />
                  <Tooltip {...TT} formatter={(v: number) => [formatZAR(v), "Total spent"]} />
                  <Bar dataKey="total_spent" radius={[0, 3, 3, 0]}>
                    {top10Chart.map((_, i) => (
                      <Cell key={i} fill={SPENDER_BAR_COLORS[i % SPENDER_BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}
        </div>

        {/* Top spenders */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-text font-bold">Top Spenders</h2>
            <div className="flex gap-2 items-center">
              <div className="w-48">
                <Input
                  placeholder="Search..."
                  value={spenderSearch}
                  onChange={(e) => setSpenderSearch(e.target.value)}
                />
              </div>
              <Button variant="secondary" onClick={() => exportCsv(topSpenders, "top-spenders.csv")}>
                <Download size={13} /> Export
              </Button>
            </div>
          </div>
          <Table
            headers={["Rank", "Passenger", "Phone", "Trips", "Total Spent", "Avg Spend", "Last Active", "LTV Score", ""]}
            empty={!filteredSpenders.length}>
            {filteredSpenders.map((p: any) => {
              const originalIndex = topSpenders.indexOf(p);
              const ltvScore = p.total_spent > 5000 ? "High" : p.total_spent > 1000 ? "Medium" : "Low";
              const ltvColor = ltvScore === "High" ? "text-green" : ltvScore === "Medium" ? "text-yellow" : "text-textMuted";
              return (
                <Tr key={p.id}>
                  <Td><RankBadge rank={originalIndex} /></Td>
                  <Td className="font-semibold">{p.full_name}</Td>
                  <Td className="font-mono text-xs text-textMuted">{p.phone_number}</Td>
                  <Td className="text-cyan font-bold">{p.txn_count}</Td>
                  <Td className="font-bold text-green">{formatZAR(p.total_spent)}</Td>
                  <Td className="text-textMuted text-xs">{formatZAR(p.avg_spend)}</Td>
                  <Td className="text-textMuted text-xs">{p.last_active ? formatDate(p.last_active) : "—"}</Td>
                  <Td>
                    <span className={`text-xs font-bold ${ltvColor}`}>{ltvScore}</span>
                  </Td>
                  <Td>
                    <Link href={`/admin/users?role=passenger&search=${encodeURIComponent(p.phone_number)}`}>
                      <Button variant="ghost">Manage</Button>
                    </Link>
                  </Td>
                </Tr>
              );
            })}
          </Table>
        </Card>

        {/* Inactive passengers */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <UserX size={16} className="text-yellow" />
              <h2 className="text-text font-bold">Inactive Passengers (30+ days)</h2>
            </div>
            <div className="flex gap-2 items-center">
              <div className="w-48">
                <Input
                  placeholder="Search..."
                  value={inactiveSearch}
                  onChange={(e) => setInactiveSearch(e.target.value)}
                />
              </div>
              <Button variant="secondary" onClick={() => exportCsv(inactive, "inactive-passengers.csv")}>
                <Download size={13} /> Export
              </Button>
            </div>
          </div>
          <Table
            headers={["Passenger", "Phone", "Joined", "Last Transaction", "Days Inactive", "Risk", ""]}
            empty={!filteredInactive.length}>
            {filteredInactive.map((p: any) => {
              const days = daysSince(p.last_transaction);
              const isAtRisk = days !== null && days > 60;
              return (
                <Tr key={p.phone_number} className={isAtRisk ? "bg-red/5" : ""}>
                  <Td className="font-semibold">{p.full_name}</Td>
                  <Td className="font-mono text-xs text-textMuted">{p.phone_number}</Td>
                  <Td className="text-textMuted text-xs">{formatDate(p.created_at)}</Td>
                  <Td className="text-textMuted text-xs">
                    {p.last_transaction ? formatDate(p.last_transaction) : "Never transacted"}
                  </Td>
                  <Td>
                    {days !== null ? (
                      <div className="flex items-center gap-1">
                        <TrendingDown size={10} className={isAtRisk ? "text-red" : "text-yellow"} />
                        <span className={`text-xs font-bold ${isAtRisk ? "text-red" : "text-yellow"}`}>
                          {days}d
                        </span>
                      </div>
                    ) : "—"}
                  </Td>
                  <Td>
                    <span className={`text-xs font-bold ${isAtRisk ? "text-red" : "text-yellow"}`}>
                      {isAtRisk ? "Churned" : "At Risk"}
                    </span>
                  </Td>
                  <Td>
                    <Link href={`/admin/users?role=passenger&search=${encodeURIComponent(p.phone_number)}`}>
                      <Button variant="ghost">Manage</Button>
                    </Link>
                  </Td>
                </Tr>
              );
            })}
          </Table>
        </Card>
      </div>
    </AdminShell>
  );
}
