"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Button, Spinner, Input, Modal } from "@/components/ui";
import { api } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  ComposedChart, Bar, Line, BarChart, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, AreaChart, Area,
} from "recharts";
import {
  Download, UserX, TrendingDown, AlertTriangle, Users, Crown, Medal,
  Star, RefreshCw, Search, X, Bell, Send, ChevronRight,
  ArrowUpRight, Activity, Wallet, Zap, Target, TrendingUp,
  Phone, Calendar, Clock,
} from "lucide-react";
import toast from "react-hot-toast";
import Link from "next/link";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authH = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

const TT = {
  contentStyle: { background: "#0D0D16", border: "1px solid #1A1A2E", borderRadius: 8, color: "#F0F0FF", fontSize: 12 },
};

const TIER_COLORS = ["#FFD60A", "#C0C0C0", "#CD7F32", "#06b6d4", "#22c55e"];

function daysSince(date: string | null) {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

// ── VIP tier badge ────────────────────────────────────────────────────────────

function VipTier({ spent }: { spent: number }) {
  if (spent >= 10000) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-yellow/10 border border-yellow/30 text-yellow">
      <Crown size={9} /> Platinum
    </span>
  );
  if (spent >= 5000) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-textMuted/10 border border-textMuted/20 text-textMuted">
      <Star size={9} /> Gold
    </span>
  );
  if (spent >= 1000) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-orange-400/10 border border-orange-400/20 text-orange-400">
      <Medal size={9} /> Silver
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-bg3 border border-border text-textDim">
      Bronze
    </span>
  );
}

// ── Avatar initials ───────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-cyan/20 text-cyan border-cyan/30",
  "bg-purple/20 text-purple border-purple/30",
  "bg-green/20 text-green border-green/30",
  "bg-yellow/20 text-yellow border-yellow/30",
  "bg-orange-400/20 text-orange-400 border-orange-400/30",
];
function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length;
  const initials = name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("");
  return (
    <div className={`rounded-full border flex items-center justify-center font-black flex-shrink-0 ${
      size === "md" ? "w-10 h-10 text-sm" : "w-8 h-8 text-[10px]"
    } ${AVATAR_COLORS[idx]}`}>
      {initials}
    </div>
  );
}

// ── Rank badge ────────────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  if (rank === 0) return <span className="text-yellow font-black text-sm">🥇</span>;
  if (rank === 1) return <span className="text-textMuted font-black text-sm">🥈</span>;
  if (rank === 2) return <span className="text-orange-400 font-black text-sm">🥉</span>;
  return <span className="text-textDim font-mono text-xs">#{rank + 1}</span>;
}

// ── Notify modal ──────────────────────────────────────────────────────────────

function NotifyModal({ passenger, onClose }: { passenger: any; onClose: () => void }) {
  const [title, setTitle]   = useState("");
  const [msg, setMsg]       = useState("");
  const [type, setType]     = useState("info");
  const [sending, setSending] = useState(false);

  const PRESETS = [
    { label: "We miss you!", type: "info",    title: "Come back to Tag-n-Ride!",  msg: "It's been a while. Top up your wallet and get moving again — we've missed you!" },
    { label: "Special offer", type: "success", title: "Exclusive offer just for you", msg: "As a valued passenger, you've unlocked a special promotion. Open the app to see your offer!" },
    { label: "Balance reminder", type: "info", title: "Don't forget your wallet",  msg: "You have an unused balance in your Tag-n-Ride wallet. Use it on your next ride!" },
  ];

  const send = async () => {
    if (!title.trim() || !msg.trim()) { toast.error("Title and message required"); return; }
    setSending(true);
    try {
      await fetch(`${BASE}/api/admin/notifications/send`, {
        method: "POST",
        headers: authH(),
        body: JSON.stringify({
          title: title.trim(), message: msg.trim(), type,
          target: "user", target_user_id: passenger.id || passenger.user_id,
        }),
      });
      toast.success(`Notification sent to ${passenger.full_name}`);
      onClose();
    } catch (e: any) { toast.error(e?.message || "Send failed"); }
    finally { setSending(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Notify ${passenger.full_name}`}>
      <div className="space-y-4">
        <div>
          <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-2">Quick presets</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => { setTitle(p.title); setMsg(p.msg); setType(p.type); }}
                className="px-3 py-1.5 rounded-lg border border-border text-textMuted text-xs font-bold hover:text-text hover:border-cyan/30 transition-all">
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest block mb-1.5">Type</label>
          <select value={type} onChange={e => setType(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-bg3 border border-border text-text text-sm outline-none focus:border-cyan">
            <option value="info">ℹ Info</option>
            <option value="success">✓ Good news</option>
            <option value="warning">⚠ Warning</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest block mb-1.5">Title *</label>
          <Input placeholder="Notification title…" value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest block mb-1.5">Message *</label>
          <textarea value={msg} onChange={e => setMsg(e.target.value)} placeholder="Message body…"
            rows={3} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-text text-sm placeholder:text-textDim focus:outline-none focus:border-cyan resize-none" />
        </div>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={send} loading={sending} disabled={!title || !msg}>
            <Send size={13} /> Send
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════

type Tab = "overview" | "vip" | "inactive" | "churn";

export default function PassengersPage() {
  const [data,      setData]    = useState<any>(null);
  const [loading,   setLoading] = useState(true);
  const [tab,       setTab]     = useState<Tab>("overview");
  const [vipSearch, setVipSearch]      = useState("");
  const [inSearch,  setInSearch]       = useState("");
  const [notifyTarget, setNotifyTarget] = useState<any | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.passengerAnalytics()
      .then(r => setData(r.data))
      .catch(() => toast.error("Failed to load passenger analytics"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const topSpenders: any[]  = data?.top_spenders || [];
  const inactive: any[]     = data?.inactive_passengers || [];
  const topupPatterns: any[] = data?.topup_patterns || [];

  const totalPassengers  = data?.total_passengers ?? 0;
  const newThisWeek      = data?.new_this_week ?? 0;
  const active7d         = data?.active_7d ?? 0;
  const totalWalletBal   = data?.total_wallet_balance ?? 0;
  const activePct        = totalPassengers > 0 ? Math.round((active7d / totalPassengers) * 100) : 0;

  const avgLTV = topSpenders.length > 0
    ? Math.round(topSpenders.reduce((s: number, p: any) => s + p.total_spent, 0) / topSpenders.length)
    : 0;

  const churnedPassengers = inactive.filter((p: any) => {
    const d = daysSince(p.last_transaction);
    return d !== null && d > 90;
  });
  const atRiskPassengers = inactive.filter((p: any) => {
    const d = daysSince(p.last_transaction);
    return d !== null && d >= 30 && d <= 90;
  });

  const filteredVip = useMemo(() =>
    topSpenders.filter((p: any) =>
      !vipSearch ||
      p.full_name?.toLowerCase().includes(vipSearch.toLowerCase()) ||
      p.phone_number?.includes(vipSearch)
    ), [topSpenders, vipSearch]);

  const filteredInactive = useMemo(() =>
    inactive.filter((p: any) =>
      !inSearch ||
      p.full_name?.toLowerCase().includes(inSearch.toLowerCase()) ||
      p.phone_number?.includes(inSearch)
    ), [inactive, inSearch]);

  const top10Chart = topSpenders.slice(0, 10).map((p: any) => ({
    name: p.full_name?.split(" ")[0] || p.phone_number?.slice(-4),
    total_spent: p.total_spent,
  }));

  const engagementData = [
    { label: "Total",    value: totalPassengers, fill: "#06b6d4" },
    { label: "Active 7d",value: active7d,         fill: "#22c55e" },
    { label: "At Risk",  value: atRiskPassengers.length, fill: "#fbbf24" },
    { label: "Churned",  value: churnedPassengers.length, fill: "#ef4444" },
  ];

  const exportCsv = (rows: any[], filename: string) => {
    if (!rows.length) { toast.error("Nothing to export"); return; }
    const header = Object.keys(rows[0]);
    const csv = [header, ...rows.map(r => header.map(k => `"${r[k] ?? ""}"`))].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    URL.revokeObjectURL(a.href); toast.success("Exported");
  };

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: "overview", label: "Overview"                                },
    { key: "vip",      label: `VIP Spenders (${topSpenders.length})`   },
    { key: "inactive", label: `At Risk (${atRiskPassengers.length})`   },
    { key: "churn",    label: `Churned (${churnedPassengers.length})`  },
  ];

  if (loading) return (
    <AdminShell title="Passengers" subtitle="Passenger analytics and engagement">
      <Spinner />
    </AdminShell>
  );

  return (
    <AdminShell title="Passengers" subtitle="Passenger analytics and engagement">
      <div className="space-y-5">

        {/* ── Stats strip ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Total Passengers",   value: totalPassengers.toLocaleString(), color: "text-cyan",   icon: Users        },
            { label: "New This Week",      value: newThisWeek.toLocaleString(),     color: "text-green",  icon: TrendingUp   },
            { label: "Active (7d)",        value: `${active7d.toLocaleString()} (${activePct}%)`, color: "text-purple", icon: Activity },
            { label: "Total Wallet Held",  value: formatZAR(totalWalletBal),        color: "text-yellow", icon: Wallet       },
            { label: "Avg LTV (Top 20)",   value: formatZAR(avgLTV),               color: "text-green",  icon: Target       },
            { label: "At-risk / Churned",  value: `${atRiskPassengers.length} / ${churnedPassengers.length}`,
              color: churnedPassengers.length > 0 ? "text-red" : "text-textMuted", icon: AlertTriangle },
          ].map(s => (
            <div key={s.label} className="bg-bg2 border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] font-bold text-textDim uppercase tracking-wider">{s.label}</p>
                <s.icon size={12} className={s.color} />
              </div>
              <p className={`text-xl font-black tabular-nums ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* ── Alerts ── */}
        {atRiskPassengers.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-yellow/5 border border-yellow/20 rounded-xl">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-yellow" />
              <p className="text-yellow text-xs font-bold">
                {atRiskPassengers.length} passenger{atRiskPassengers.length !== 1 ? "s" : ""} inactive for 30–90 days — prime re-engagement window
              </p>
            </div>
            <button onClick={() => setTab("inactive")}
              className="text-[10px] text-yellow border border-yellow/30 rounded-lg px-3 py-1.5 hover:bg-yellow/10 font-bold transition-all whitespace-nowrap">
              View At-Risk
            </button>
          </div>
        )}
        {churnedPassengers.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red/5 border border-red/20 rounded-xl">
            <UserX size={14} className="text-red" />
            <p className="text-red text-xs font-bold">
              {churnedPassengers.length} passenger{churnedPassengers.length !== 1 ? "s are" : " is"} likely churned (90+ days inactive)
            </p>
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="flex gap-1 border-b border-border overflow-x-auto">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
                tab === t.key ? "text-cyan border-cyan" : "text-textMuted border-transparent hover:text-text"
              }`}>
              {t.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 pb-1">
            <button onClick={load} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-textMuted hover:text-cyan border border-border rounded-lg transition-all">
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            </button>
            <Link href="/admin/users?role=passenger">
              <Button variant="secondary">
                <Users size={12} /> All Accounts <ArrowUpRight size={11} />
              </Button>
            </Link>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════ OVERVIEW ══ */}
        {tab === "overview" && (
          <div className="space-y-5">

            {/* Engagement funnel */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Card>
                <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-4 flex items-center gap-1.5">
                  <Activity size={11} /> Engagement Funnel
                </p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={engagementData} layout="vertical" margin={{ left: 10 }}>
                    <XAxis type="number" tick={{ fontSize: 9, fill: "#6b7280" }} axisLine={false} tickLine={false}
                      tickFormatter={v => v.toLocaleString()} />
                    <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }} width={65} axisLine={false} tickLine={false} />
                    <Tooltip {...TT} formatter={(v: any) => [v.toLocaleString(), "Passengers"]} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {engagementData.map((d, i) => <Cell key={i} fill={d.fill} fillOpacity={0.8} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              {/* Top-up patterns */}
              {topupPatterns.length > 0 && (
                <Card>
                  <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-4 flex items-center gap-1.5">
                    <Zap size={11} /> Top-up Patterns (12 weeks)
                  </p>
                  <ResponsiveContainer width="100%" height={160}>
                    <ComposedChart data={topupPatterns}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" />
                      <XAxis dataKey="week" tick={{ fontSize: 9, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="l" tick={{ fontSize: 9, fill: "#6b7280" }} tickFormatter={v => `R${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 9, fill: "#6b7280" }} allowDecimals={false} axisLine={false} tickLine={false} />
                      <Tooltip {...TT} formatter={(v: number, n: string) => [n === "total" ? formatZAR(v) : v, n === "total" ? "Amount" : "Count"]} />
                      <Bar yAxisId="l" dataKey="total" fill="#06b6d4" fillOpacity={0.7} radius={[3, 3, 0, 0]} />
                      <Line yAxisId="r" dataKey="topups" stroke="#fbbf24" strokeWidth={2} dot={{ r: 2 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </Card>
              )}
            </div>

            {/* Top 10 chart */}
            {top10Chart.length > 0 && (
              <Card>
                <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-4 flex items-center gap-1.5">
                  <Crown size={11} /> Top 10 Spenders
                </p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={top10Chart} layout="vertical" margin={{ left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 9, fill: "#6b7280" }} axisLine={false} tickLine={false}
                      tickFormatter={v => `R${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#9ca3af" }} width={70} axisLine={false} tickLine={false} />
                    <Tooltip {...TT} formatter={(v: number) => [formatZAR(v), "Total spent"]} />
                    <Bar dataKey="total_spent" radius={[0, 4, 4, 0]}>
                      {top10Chart.map((_, i) => <Cell key={i} fill={TIER_COLORS[i % TIER_COLORS.length]} fillOpacity={0.8} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )}

            {/* Segment summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Platinum",  min: 10000, color: "text-yellow",    border: "border-yellow/20",    bg: "bg-yellow/5"   },
                { label: "Gold",      min: 5000,  max: 10000, color: "text-textMuted", border: "border-border", bg: ""           },
                { label: "Silver",    min: 1000,  max: 5000,  color: "text-orange-400",border: "border-orange-400/20", bg: "bg-orange-400/5" },
                { label: "Bronze",    min: 0,     max: 1000,  color: "text-textDim",   border: "border-border", bg: ""           },
              ].map(seg => {
                const count = topSpenders.filter((p: any) =>
                  p.total_spent >= seg.min && (seg.max === undefined || p.total_spent < seg.max)
                ).length;
                return (
                  <div key={seg.label} className={`rounded-xl border p-4 text-center ${seg.border} ${seg.bg}`}>
                    <p className={`text-2xl font-black ${seg.color}`}>{count}</p>
                    <p className={`text-[10px] font-bold uppercase tracking-widest mt-0.5 ${seg.color}`}>{seg.label}</p>
                    <p className="text-textDim text-[10px]">≥ {seg.min >= 1000 ? `R${seg.min/1000}k` : "R0"}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════ VIP ══ */}
        {tab === "vip" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-textDim" />
                <input placeholder="Search VIP passengers…" value={vipSearch} onChange={e => setVipSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-bg2 border border-border rounded-lg text-sm text-text placeholder:text-textDim focus:outline-none focus:border-cyan/50 transition-colors" />
                {vipSearch && <button onClick={() => setVipSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-textDim hover:text-text"><X size={13} /></button>}
              </div>
              <Button variant="secondary" onClick={() => exportCsv(topSpenders, "vip-passengers.csv")}>
                <Download size={13} /> Export
              </Button>
            </div>

            <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-bg3">
                      {["Rank", "Passenger", "Tier", "Trips", "Total Spent", "Avg Spend", "Last Active", "Actions"].map(h => (
                        <th key={h} className="text-left py-3 px-4 text-[10px] font-bold text-textDim uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVip.length === 0 ? (
                      <tr><td colSpan={8} className="py-12 text-center text-textMuted">No VIP passengers found</td></tr>
                    ) : filteredVip.map((p: any) => {
                      const rank = topSpenders.indexOf(p);
                      const days = daysSince(p.last_active);
                      const isRecent = days !== null && days < 7;
                      return (
                        <tr key={p.id} className="border-b border-border hover:bg-bg3/50 transition-colors">
                          <td className="py-3 px-4"><RankBadge rank={rank} /></td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <Avatar name={p.full_name} />
                              <div>
                                <p className="font-bold text-text">{p.full_name}</p>
                                <p className="text-textDim text-[10px] font-mono flex items-center gap-1">
                                  <Phone size={8} /> {p.phone_number}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4"><VipTier spent={p.total_spent} /></td>
                          <td className="py-3 px-4 font-bold text-cyan tabular-nums">{p.txn_count}</td>
                          <td className="py-3 px-4 font-black text-green tabular-nums">{formatZAR(p.total_spent)}</td>
                          <td className="py-3 px-4 text-textMuted tabular-nums">{formatZAR(p.avg_spend)}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1">
                              <div className={`w-1.5 h-1.5 rounded-full ${isRecent ? "bg-green" : "bg-textDim"}`} />
                              <span className={`text-[10px] ${isRecent ? "text-green font-bold" : "text-textDim"}`}>
                                {p.last_active ? (isRecent ? `${days}d ago` : formatDate(p.last_active)) : "—"}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => setNotifyTarget(p)}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-cyan border border-cyan/20 hover:bg-cyan/10 transition-all">
                                <Bell size={10} /> Notify
                              </button>
                              <Link href={`/admin/support?q=${p.phone_number}`}>
                                <button className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-textMuted border border-border hover:text-text transition-all">
                                  <ChevronRight size={10} />
                                </button>
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════ AT RISK ══ */}
        {tab === "inactive" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-4 py-3 bg-yellow/5 border border-yellow/20 rounded-xl">
              <Clock size={13} className="text-yellow" />
              <p className="text-yellow text-xs font-bold">
                30–90 days inactive. These passengers are still reachable — a well-timed notification can bring them back.
              </p>
            </div>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-textDim" />
                <input placeholder="Search inactive passengers…" value={inSearch} onChange={e => setInSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-bg2 border border-border rounded-lg text-sm text-text placeholder:text-textDim focus:outline-none focus:border-cyan/50 transition-colors" />
                {inSearch && <button onClick={() => setInSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-textDim hover:text-text"><X size={13} /></button>}
              </div>
              <Button variant="secondary" onClick={() => exportCsv(atRiskPassengers, "at-risk-passengers.csv")}>
                <Download size={13} /> Export
              </Button>
            </div>
            <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-bg3">
                      {["Passenger", "Joined", "Last Ride", "Days Inactive", "Wallet Balance", "Actions"].map(h => (
                        <th key={h} className="text-left py-3 px-4 text-[10px] font-bold text-textDim uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInactive.filter((p: any) => { const d = daysSince(p.last_transaction); return d !== null && d >= 30 && d <= 90; }).length === 0 ? (
                      <tr><td colSpan={6} className="py-12 text-center text-textMuted">No at-risk passengers right now</td></tr>
                    ) : filteredInactive
                        .filter((p: any) => { const d = daysSince(p.last_transaction); return d !== null && d >= 30 && d <= 90; })
                        .sort((a: any, b: any) => (daysSince(b.last_transaction) || 0) - (daysSince(a.last_transaction) || 0))
                        .map((p: any) => {
                          const days = daysSince(p.last_transaction);
                          return (
                            <tr key={p.phone_number} className="border-b border-border hover:bg-bg3/50 transition-colors">
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2.5">
                                  <Avatar name={p.full_name} />
                                  <div>
                                    <p className="font-bold text-text">{p.full_name}</p>
                                    <p className="text-textDim text-[10px] font-mono">{p.phone_number}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-textDim text-[11px]">{formatDate(p.created_at)}</td>
                              <td className="py-3 px-4 text-textMuted text-[11px]">
                                {p.last_transaction ? formatDate(p.last_transaction) : "Never"}
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-1.5">
                                  <TrendingDown size={11} className="text-yellow" />
                                  <span className="text-yellow font-black">{days}d</span>
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <span className={`font-bold tabular-nums ${(p.wallet_balance || 0) > 0 ? "text-cyan" : "text-textDim"}`}>
                                  {formatZAR(p.wallet_balance || 0)}
                                </span>
                                {(p.wallet_balance || 0) > 0 && (
                                  <p className="text-[9px] text-textDim">unused balance</p>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                <button onClick={() => setNotifyTarget(p)}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-yellow border border-yellow/20 hover:bg-yellow/10 transition-all">
                                  <Bell size={10} /> Re-engage
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════ CHURNED ══ */}
        {tab === "churn" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-4 py-3 bg-red/5 border border-red/20 rounded-xl">
              <UserX size={13} className="text-red" />
              <p className="text-red text-xs font-bold">
                90+ days inactive. These passengers may have churned to competing platforms.
              </p>
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => exportCsv(churnedPassengers, "churned-passengers.csv")}>
                <Download size={13} /> Export
              </Button>
            </div>
            <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-bg3">
                      {["Passenger", "Last Transaction", "Days Inactive", "Historical Spend", "Wallet Balance", ""].map(h => (
                        <th key={h} className="text-left py-3 px-4 text-[10px] font-bold text-textDim uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {churnedPassengers.length === 0 ? (
                      <tr><td colSpan={6} className="py-12 text-center text-green font-bold">No churned passengers — great retention! ✓</td></tr>
                    ) : churnedPassengers
                        .sort((a: any, b: any) => (daysSince(b.last_transaction) || 0) - (daysSince(a.last_transaction) || 0))
                        .map((p: any) => {
                          const days = daysSince(p.last_transaction);
                          return (
                            <tr key={p.phone_number} className="border-b border-border hover:bg-bg3/50 transition-colors bg-red/3">
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2.5">
                                  <Avatar name={p.full_name} />
                                  <div>
                                    <p className="font-bold text-text">{p.full_name}</p>
                                    <p className="text-textDim text-[10px] font-mono">{p.phone_number}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-textMuted text-[11px]">
                                {p.last_transaction ? formatDate(p.last_transaction) : "Never transacted"}
                              </td>
                              <td className="py-3 px-4">
                                <span className="font-black text-red">{days}d</span>
                              </td>
                              <td className="py-3 px-4 font-bold text-textMuted tabular-nums">
                                {p.total_spent ? formatZAR(p.total_spent) : "—"}
                              </td>
                              <td className="py-3 px-4 font-bold tabular-nums text-textMuted">
                                {formatZAR(p.wallet_balance || 0)}
                              </td>
                              <td className="py-3 px-4">
                                <button onClick={() => setNotifyTarget(p)}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-red border border-red/20 hover:bg-red/10 transition-all">
                                  <Send size={10} /> Win back
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Notify modal ── */}
      {notifyTarget && (
        <NotifyModal passenger={notifyTarget} onClose={() => setNotifyTarget(null)} />
      )}
    </AdminShell>
  );
}
