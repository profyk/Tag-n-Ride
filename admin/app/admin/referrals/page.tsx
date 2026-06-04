"use client";
import { useEffect, useState, useMemo } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Spinner, StatCard, Input } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import { Users2, Award, Download, Search, X, AlertTriangle, Trophy } from "lucide-react";
import { api, Referral } from "@/lib/api";
import toast from "react-hot-toast";

const STATUS_TONE: Record<string, "yellow" | "green" | "red" | "muted"> = {
  pending: "yellow", rewarded: "green", cancelled: "red",
};

export default function ReferralsPage() {
  const [data, setData] = useState<{ items: Referral[]; stats: { total: number; rewarded: number; total_rewards: number } }>({
    items: [], stats: { total: 0, rewarded: 0, total_rewards: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"records" | "leaderboard">("records");

  useEffect(() => {
    setLoading(true);
    api.referrals(filter === "all" ? {} : { status: filter })
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  }, [filter]);

  const { items, stats } = data;

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(r =>
      r.referrer_name?.toLowerCase().includes(q) ||
      r.referrer_phone?.includes(q) ||
      r.invitee_name?.toLowerCase().includes(q) ||
      r.invitee_phone?.includes(q)
    );
  }, [items, search]);

  // Build leaderboard from referral records
  const leaderboard = useMemo(() => {
    const map: Record<string, { name: string; phone: string; total: number; rewarded: number; reward_earned: number; suspicious: boolean }> = {};
    items.forEach(r => {
      if (!map[r.referrer_phone]) {
        map[r.referrer_phone] = { name: r.referrer_name, phone: r.referrer_phone, total: 0, rewarded: 0, reward_earned: 0, suspicious: false };
      }
      map[r.referrer_phone].total++;
      if (r.status === "rewarded") { map[r.referrer_phone].rewarded++; map[r.referrer_phone].reward_earned += r.reward_amount; }
    });
    const list = Object.values(map).sort((a, b) => b.total - a.total);
    // Flag as suspicious if >10 referrals in same period (potential abuse)
    list.forEach(l => { if (l.total > 10) l.suspicious = true; });
    return list;
  }, [items]);

  const suspiciousCount = leaderboard.filter(l => l.suspicious).length;

  const exportCsv = () => {
    const rows = [
      ["Referrer", "Referrer Phone", "Invitee", "Invitee Phone", "Reward", "Status", "Date"],
      ...filtered.map(r => [
        r.referrer_name, r.referrer_phone, r.invitee_name, r.invitee_phone,
        formatZAR(r.reward_amount), r.status, formatDate(r.created_at),
      ]),
    ];
    const csv = rows.map(row => row.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `referrals_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    toast.success("Exported");
  };

  return (
    <AdminShell title="Referral Programme">
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Referrals" value={String(stats.total)} tone="cyan" />
          <StatCard label="Rewarded" value={String(stats.rewarded)} tone="green" />
          <StatCard label="Total Rewards Paid" value={formatZAR(stats.total_rewards)} tone="yellow" />
          <StatCard label="Conversion Rate" value={stats.total > 0 ? `${Math.round((stats.rewarded / stats.total) * 100)}%` : "—"} tone="purple" />
        </div>

        {suspiciousCount > 0 && (
          <div className="flex items-center gap-3 p-4 bg-red/5 border border-red/20 rounded-xl">
            <AlertTriangle size={16} className="text-red flex-shrink-0" />
            <p className="text-red text-sm font-semibold">
              {suspiciousCount} referrer{suspiciousCount > 1 ? "s" : ""} flagged for potential abuse (&gt;10 referrals). Review the Leaderboard tab.
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {[
            { key: "records", label: "Referral Records" },
            { key: "leaderboard", label: `Leaderboard (${leaderboard.length})` },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key as any)}
              className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${
                activeTab === t.key ? "text-cyan border-cyan" : "text-textMuted border-transparent hover:text-text"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === "records" && (
          <Card>
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <div className="flex gap-2 flex-wrap">
                {(["all", "pending", "rewarded", "cancelled"] as const).map((f) => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-3 py-1 rounded-full text-xs font-bold border transition-all capitalize ${filter === f ? "bg-cyanDim text-cyan border-cyan/20" : "bg-bg2 text-textMuted border-border hover:text-text"}`}>
                    {f}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-textDim" />
                  <Input placeholder="Search name or phone..." value={search} onChange={e => setSearch(e.target.value)} className="pl-7 w-52" />
                </div>
                {search && (
                  <Button variant="ghost" onClick={() => setSearch("")}><X size={13} /></Button>
                )}
                <Button variant="secondary" onClick={exportCsv}><Download size={13} /> Export</Button>
              </div>
            </div>

            {loading ? <Spinner /> : (
              <Table headers={["Referrer", "Invitee", "Reward", "Status", "Date"]} empty={!filtered.length}>
                {filtered.map((r) => (
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
            {!loading && filtered.length > 0 && (
              <p className="text-xs text-textDim mt-2">{filtered.length} record{filtered.length !== 1 ? "s" : ""} shown</p>
            )}
          </Card>
        )}

        {activeTab === "leaderboard" && (
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <Trophy size={16} className="text-yellow" />
              <h2 className="text-text font-bold">Top Referrers</h2>
              <span className="text-textDim text-xs ml-auto">Red = possible abuse (&gt;10 referrals)</span>
            </div>
            <Table headers={["#", "Referrer", "Total Refs", "Rewarded", "Earned", "Status"]} empty={!leaderboard.length}>
              {leaderboard.map((l, i) => (
                <Tr key={l.phone}>
                  <Td className="text-textDim text-xs font-bold">{i + 1}</Td>
                  <Td>
                    <p className="font-semibold">{l.name}</p>
                    <p className="text-[10px] font-mono text-textMuted">{l.phone}</p>
                  </Td>
                  <Td className={`font-bold ${l.suspicious ? "text-red" : "text-text"}`}>{l.total}</Td>
                  <Td className="text-green font-bold">{l.rewarded}</Td>
                  <Td className="text-yellow font-bold">{formatZAR(l.reward_earned)}</Td>
                  <Td>
                    {l.suspicious
                      ? <Badge label="Review" tone="red" />
                      : <Badge label="Normal" tone="green" />}
                  </Td>
                </Tr>
              ))}
            </Table>
          </Card>
        )}
      </div>
    </AdminShell>
  );
}
