"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Button, Spinner, StatCard, Input } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Download, Search, UserX, TrendingDown, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});
const TT = {
  contentStyle: { background: "#0D0D16", border: "1px solid #1A1A2E", borderRadius: 8, color: "#F0F0FF", fontSize: 12 },
};

function daysSince(date: string | null) {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

export default function PassengersPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [spenderSearch, setSpenderSearch] = useState("");
  const [inactiveSearch, setInactiveSearch] = useState("");

  useEffect(() => {
    fetch(`${BASE}/api/admin/passengers/analytics`, { headers: authHeaders() })
      .then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <AdminShell title="Passenger Analytics"><Spinner /></AdminShell>;

  const topSpenders = data?.top_spenders || [];
  const inactive = data?.inactive_passengers || [];

  const totalSpend = topSpenders.reduce((s: number, p: any) => s + p.total_spent, 0);
  const avgLTV = topSpenders.length > 0
    ? Math.round(topSpenders.reduce((s: number, p: any) => s + p.total_spent, 0) / topSpenders.length)
    : 0;
  const atRiskCount = inactive.filter((p: any) => {
    const days = daysSince(p.last_transaction);
    return days !== null && days > 60;
  }).length;

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

  const exportCsv = (rows: any[], filename: string) => {
    const header = Object.keys(rows[0] || {});
    const csv = [header, ...rows.map(r => header.map(k => `"${r[k] ?? ""}"`))].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url); toast.success("Exported");
  };

  return (
    <AdminShell title="Passenger Analytics">
      <div className="space-y-6">

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Top Spenders tracked" value={topSpenders.length} tone="cyan" />
          <StatCard label="Avg LTV (top 20)" value={formatZAR(avgLTV)} tone="green" />
          <StatCard label="Inactive (30+ days)" value={inactive.length} tone="yellow" />
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

        {/* Top-up patterns chart */}
        {(data?.topup_patterns?.length || 0) > 0 && (
          <Card>
            <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4">
              Top-up Patterns (12 weeks)
            </h2>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.topup_patterns}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" />
                <XAxis dataKey="week" stroke="#444466" tick={{ fontSize: 9, fill: "#8888AA" }} />
                <YAxis stroke="#444466" tick={{ fontSize: 10, fill: "#8888AA" }} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                <Tooltip {...TT} formatter={(v: number) => [formatZAR(v), "Top-ups"]} />
                <Bar dataKey="total" fill="#00D4FF" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

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
            headers={["#", "Passenger", "Phone", "Trips", "Total Spent", "Avg Spend", "Last Active", "LTV Score"]}
            empty={!filteredSpenders.length}>
            {filteredSpenders.map((p: any, i: number) => {
              const originalIndex = topSpenders.indexOf(p);
              const ltvScore = p.total_spent > 5000 ? "High" : p.total_spent > 1000 ? "Medium" : "Low";
              const ltvColor = ltvScore === "High" ? "text-green" : ltvScore === "Medium" ? "text-yellow" : "text-textMuted";
              return (
                <Tr key={p.id}>
                  <Td className="text-textDim font-mono text-xs">#{originalIndex + 1}</Td>
                  <Td className="font-semibold">{p.full_name}</Td>
                  <Td className="font-mono text-xs text-textMuted">{p.phone_number}</Td>
                  <Td className="text-cyan font-bold">{p.txn_count}</Td>
                  <Td className="font-bold text-green">{formatZAR(p.total_spent)}</Td>
                  <Td className="text-textMuted text-xs">{formatZAR(p.avg_spend)}</Td>
                  <Td className="text-textMuted text-xs">{p.last_active ? formatDate(p.last_active) : "—"}</Td>
                  <Td>
                    <span className={`text-xs font-bold ${ltvColor}`}>{ltvScore}</span>
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
            headers={["Passenger", "Phone", "Joined", "Last Transaction", "Days Inactive", "Risk"]}
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
                </Tr>
              );
            })}
          </Table>
        </Card>
      </div>
    </AdminShell>
  );
}
