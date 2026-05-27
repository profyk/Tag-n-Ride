"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Spinner, StatCard } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import { Users2, Award } from "lucide-react";
import { api, Referral } from "@/lib/api";

const STATUS_TONE: Record<string, "yellow" | "green" | "red" | "muted"> = { pending: "yellow", rewarded: "green", cancelled: "red" };

export default function ReferralsPage() {
  const [data, setData] = useState<{ items: Referral[]; stats: { total: number; rewarded: number; total_rewards: number } }>({
    items: [], stats: { total: 0, rewarded: 0, total_rewards: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    setLoading(true);
    api.referrals(filter === "all" ? {} : { status: filter })
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  }, [filter]);

  const { items, stats } = data;

  return (
    <AdminShell title="Referral Programme">
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Referrals" value={String(stats.total)} />
          <StatCard label="Rewarded" value={String(stats.rewarded)} />
          <StatCard label="Total Rewards Paid" value={formatZAR(stats.total_rewards)} />
          <StatCard label="Conversion Rate" value={stats.total > 0 ? `${Math.round((stats.rewarded / stats.total) * 100)}%` : "—"} />
        </div>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users2 size={16} className="text-cyan" />
              <h2 className="text-text font-bold">Referral Records</h2>
            </div>
            <div className="flex gap-2">
              {(["all", "pending", "rewarded", "cancelled"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded-full text-xs font-bold border transition-all capitalize ${filter === f ? "bg-cyanDim text-cyan border-cyan/20" : "bg-bg2 text-textMuted border-border hover:text-text"}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          {loading ? <Spinner /> : (
            <Table
              headers={["Referrer", "Invitee", "Reward", "Status", "Date"]}
              empty={!items.length}
            >
              {items.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <p className="font-semibold text-sm">{r.referrer_name}</p>
                    <p className="text-[10px] text-textMuted font-mono">{r.referrer_phone}</p>
                  </Td>
                  <Td>
                    <p className="font-semibold text-sm">{r.invitee_name}</p>
                    <p className="text-[10px] text-textMuted font-mono">{r.invitee_phone}</p>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <Award size={12} className="text-yellow" />
                      <span className="font-bold text-yellow">{formatZAR(r.reward_amount)}</span>
                    </div>
                  </Td>
                  <Td><Badge label={r.status} tone={STATUS_TONE[r.status] || "muted"} /></Td>
                  <Td className="text-textMuted text-xs">{formatDate(r.created_at)}</Td>
                </Tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}
