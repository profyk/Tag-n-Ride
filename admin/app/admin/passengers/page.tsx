"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Spinner, StatCard } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});
const TT = {
  contentStyle: {
    background: "#0D0D16", border: "1px solid #1A1A2E",
    borderRadius: 8, color: "#F0F0FF", fontSize: 12,
  },
};

export default function PassengersPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BASE}/api/admin/passengers/analytics`, { headers: authHeaders() })
      .then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <AdminShell title="Passenger Analytics"><Spinner /></AdminShell>;

  const totalSpend = data?.top_spenders?.reduce(
    (s: number, p: any) => s + p.total_spent, 0
  ) || 0;

  return (
    <AdminShell title="Passenger Analytics">
      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Top Spenders tracked" value={data?.top_spenders?.length || 0} tone="cyan" />
          <StatCard label="Inactive (30+ days)" value={data?.inactive_passengers?.length || 0} tone="yellow" />
          <StatCard label="Top 20 Total Spend" value={formatZAR(totalSpend)} tone="green" />
        </div>

        <Card>
          <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4">
            Top-up Patterns (12 weeks)
          </h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data?.topup_patterns || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" />
              <XAxis dataKey="week" stroke="#444466" tick={{ fontSize: 9, fill: "#8888AA" }} />
              <YAxis stroke="#444466" tick={{ fontSize: 10, fill: "#8888AA" }}
                tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
              <Tooltip {...TT} formatter={(v: number) => [formatZAR(v), "Top-ups"]} />
              <Bar dataKey="total" fill="#00D4FF" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <h2 className="text-text font-bold mb-4">Top Spenders</h2>
          <Table
            headers={["#", "Passenger", "Phone", "Trips", "Total Spent", "Avg Spend", "Last Active"]}
            empty={!data?.top_spenders?.length}>
            {data?.top_spenders?.map((p: any, i: number) => (
              <Tr key={p.id}>
                <Td className="text-textDim font-mono text-xs">#{i + 1}</Td>
                <Td className="font-semibold">{p.full_name}</Td>
                <Td className="font-mono text-xs text-textMuted">{p.phone_number}</Td>
                <Td className="text-cyan font-bold">{p.txn_count}</Td>
                <Td className="font-bold text-green">{formatZAR(p.total_spent)}</Td>
                <Td className="text-textMuted text-xs">{formatZAR(p.avg_spend)}</Td>
                <Td className="text-textMuted text-xs">
                  {p.last_active ? formatDate(p.last_active) : "—"}
                </Td>
              </Tr>
            ))}
          </Table>
        </Card>

        <Card>
          <h2 className="text-text font-bold mb-4">Inactive Passengers (30+ days)</h2>
          <Table
            headers={["Passenger", "Phone", "Joined", "Last Transaction"]}
            empty={!data?.inactive_passengers?.length}>
            {data?.inactive_passengers?.map((p: any) => (
              <Tr key={p.phone_number}>
                <Td className="font-semibold">{p.full_name}</Td>
                <Td className="font-mono text-xs text-textMuted">{p.phone_number}</Td>
                <Td className="text-textMuted text-xs">{formatDate(p.created_at)}</Td>
                <Td className="text-textMuted text-xs">
                  {p.last_transaction ? formatDate(p.last_transaction) : "Never transacted"}
                </Td>
              </Tr>
            ))}
          </Table>
        </Card>
      </div>
    </AdminShell>
  );
}
