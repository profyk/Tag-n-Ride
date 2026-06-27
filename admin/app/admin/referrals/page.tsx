"use client";
import { useEffect, useState, useMemo } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Button, Spinner, Input } from "@/components/ui";
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
    const csv = rows.map(row => row.map((c: string | number) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `referrals_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    toast.success("Exported");
  };

  const conversionRate = stats.total > 0 ? Math.round((stats.rewarded / stats.total) * 100) : 0;

  const STATUS_STYLE: Record<string, string> = {
    pending:   "bg-yellow/10 border-yellow/20 text-yellow",
    rewarded:  "bg-green/10 border-green/20 text-green",
    cancelled: "bg-red/10 border-red/20 text-red",
  };

  return (
    <AdminShell title="Referral Programme" subtitle="Track referrals, rewards, and leaderboard">
      <div className="space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total Referrals",   value: String(stats.total),            color: "text-cyan"   },
            { label: "Rewarded",           value: String(stats.rewarded),         color: "text-green"  },
            { label: "Total Rewards Paid", value: formatZAR(stats.total_rewards), color: "text-yellow" },
            { label: "Conversion Rate",    value: stats.total > 0 ? `${conversionRate}%` : "—", color: "text-purple" },
          ].map(s => (
            <div key={s.label} className="bg-bg2 border border-border rounded-xl p-4">
              <p className="text-[9px] font-bold text-textDim uppercase tracking-wider mb-2">{s.label}</p>
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {suspiciousCount > 0 && (
          <div className="flex items-center gap-3 p-4 bg-red/5 border border-red/20 rounded-xl">
            <AlertTriangle size={14} className="text-red flex-shrink-0" />
            <p className="text-red text-xs font-bold">
              {suspiciousCount} referrer{suspiciousCount > 1 ? "s" : ""} flagged for potential abuse (&gt;10 referrals). Review the Leaderboard tab.
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {[
            { key: "records",     label: "Referral Records" },
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
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex gap-2 flex-wrap">
                {(["all", "pending", "rewarded", "cancelled"] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all capitalize ${
                      filter === f ? "bg-cyanDim text-cyan border-cyan/20" : "bg-bg2 text-textMuted border-border hover:text-text"
                    }`}>
                    {f}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-textDim" />
                  <input placeholder="Search name or phone…" value={search} onChange={e => setSearch(e.target.value)}
                    className="pl-8 pr-4 py-2 bg-bg2 border border-border rounded-lg text-xs text-text placeholder:text-textDim focus:outline-none focus:border-cyan/50 w-48" />
                </div>
                {search && (
                  <button onClick={() => setSearch("")} className="p-2 text-textDim hover:text-text border border-border rounded-lg">
                    <X size={12} />
                  </button>
                )}
                <Button variant="secondary" onClick={exportCsv}><Download size={13} /> Export</Button>
              </div>
            </div>

            {loading ? <Spinner /> : (
              <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-bg3">
                      {["Referrer", "Invitee", "Reward", "Status", "Date"].map(h => (
                        <th key={h} className="text-left py-3 px-4 text-[10px] font-bold text-textDim uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={5} className="py-12 text-center text-textMuted">No referrals found</td></tr>
                    ) : filtered.map(r => (
                      <tr key={r.id} className="border-b border-border hover:bg-bg3/50 transition-colors">
                        <td className="py-3 px-4">
                          <p className="font-bold text-text">{r.referrer_name}</p>
                          <p className="text-textDim text-[10px] font-mono">{r.referrer_phone}</p>
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-bold text-text">{r.invitee_name}</p>
                          <p className="text-textDim text-[10px] font-mono">{r.invitee_phone}</p>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <Award size={11} className="text-yellow" />
                            <span className="font-black text-yellow tabular-nums">{formatZAR(r.reward_amount)}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-black capitalize ${STATUS_STYLE[r.status] || "bg-bg3 border-border text-textMuted"}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-textDim whitespace-nowrap">{formatDate(r.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!loading && filtered.length > 0 && (
              <p className="text-[10px] text-textDim">{filtered.length} record{filtered.length !== 1 ? "s" : ""}</p>
            )}
          </div>
        )}

        {activeTab === "leaderboard" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Trophy size={14} className="text-yellow" />
              <p className="text-text font-bold text-sm">Top Referrers</p>
              <span className="text-textDim text-[10px] ml-auto">🔴 = possible abuse (&gt;10 referrals)</span>
            </div>
            <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-bg3">
                    {["#", "Referrer", "Total", "Rewarded", "Earned", "Status"].map(h => (
                      <th key={h} className="text-left py-3 px-4 text-[10px] font-bold text-textDim uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.length === 0 ? (
                    <tr><td colSpan={6} className="py-12 text-center text-textMuted">No referral data</td></tr>
                  ) : leaderboard.map((l, i) => (
                    <tr key={l.phone} className={`border-b border-border hover:bg-bg3/50 transition-colors ${l.suspicious ? "bg-red/3" : ""}`}>
                      <td className="py-3 px-4">
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : <span className="text-textDim font-mono">#{i + 1}</span>}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-bold text-text">{l.name}</p>
                        <p className="text-textDim text-[10px] font-mono">{l.phone}</p>
                      </td>
                      <td className={`py-3 px-4 font-black tabular-nums ${l.suspicious ? "text-red" : "text-text"}`}>{l.total}</td>
                      <td className="py-3 px-4 font-bold text-green tabular-nums">{l.rewarded}</td>
                      <td className="py-3 px-4 font-black text-yellow tabular-nums">{formatZAR(l.reward_earned)}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-black ${
                          l.suspicious ? "bg-red/10 border-red/20 text-red" : "bg-green/10 border-green/20 text-green"
                        }`}>
                          {l.suspicious ? "Review" : "Normal"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
