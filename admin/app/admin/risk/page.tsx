"use client";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Badge, Button, Modal } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  ShieldAlert, UserX, Snowflake, RefreshCw, AlertTriangle,
  Download, Info, TrendingUp, TrendingDown, Activity, Zap,
  Eye, Copy, ChevronRight, Users, Lock, Unlock,
  Search, X, CheckCircle2, Clock, Flag, Phone,
} from "lucide-react";
import toast from "react-hot-toast";
import { api, RiskUser } from "@/lib/api";
import { DangerPinModal, useDangerPin } from "@/components/DangerPinModal";
import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authH = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const RISK_TIER = (score: number) =>
  score >= 75 ? { label: "HIGH",   color: "text-red",    bg: "bg-red/10    border-red/20"    } :
  score >= 50 ? { label: "MEDIUM", color: "text-yellow", bg: "bg-yellow/10 border-yellow/20" } :
               { label: "LOW",    color: "text-green",  bg: "bg-green/10  border-green/20"  };

const AVATAR_COLORS = [
  "bg-red/20 text-red border-red/30",
  "bg-yellow/20 text-yellow border-yellow/30",
  "bg-purple/20 text-purple border-purple/30",
  "bg-cyan/20 text-cyan border-cyan/30",
  "bg-orange-400/20 text-orange-400 border-orange-400/30",
];
function Avatar({ name }: { name: string }) {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length;
  const initials = name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("");
  return (
    <div className={`w-9 h-9 rounded-full border flex items-center justify-center font-black text-xs flex-shrink-0 ${AVATAR_COLORS[idx]}`}>
      {initials}
    </div>
  );
}

// ── Risk score bar ────────────────────────────────────────────────────────────

function RiskBar({ score }: { score: number }) {
  const tier = RISK_TIER(score);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-bg3 rounded-full overflow-hidden min-w-[64px]">
        <div
          className={`h-full rounded-full transition-all ${
            score >= 75 ? "bg-red" : score >= 50 ? "bg-yellow" : "bg-green"
          }`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={`text-xs font-black tabular-nums w-6 text-right ${tier.color}`}>{score}</span>
    </div>
  );
}

// ── Signal chips ──────────────────────────────────────────────────────────────

function SignalChips({ u }: { u: RiskUser }) {
  const chips = [
    u.flagged              && { label: "Flagged",             color: "text-red    bg-red/10    border-red/20"    },
    u.is_frozen            && { label: "Frozen",              color: "text-purple bg-purple/10 border-purple/20" },
    u.dispute_count > 0    && { label: `${u.dispute_count} dispute${u.dispute_count > 1 ? "s" : ""}`, color: "text-yellow bg-yellow/10 border-yellow/20" },
    u.failed_txns > 3      && { label: `${u.failed_txns} failed txns`,  color: "text-red    bg-red/10    border-red/20"    },
    u.txns_24h > 20        && { label: `${u.txns_24h} txns/24h`,         color: "text-orange-400 bg-orange-400/10 border-orange-400/20" },
    u.volume_24h > 5000    && { label: `R${(u.volume_24h / 1000).toFixed(1)}k/24h`, color: "text-orange-400 bg-orange-400/10 border-orange-400/20" },
  ].filter(Boolean) as { label: string; color: string }[];

  if (!chips.length) return <span className="text-textDim text-[10px] italic">No signals</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map(c => (
        <span key={c.label} className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${c.color}`}>
          {c.label}
        </span>
      ))}
    </div>
  );
}

// ── Risk breakdown score card (what drove the score) ─────────────────────────

function RiskBreakdownModal({ user, onClose, onFreeze, onFlag, freezing, flagging }:
  { user: RiskUser; onClose: () => void;
    onFreeze: (u: RiskUser) => void; onFlag: (u: RiskUser) => void;
    freezing: boolean; flagging: boolean; }) {

  const tier = RISK_TIER(user.risk_score);
  const factors: { label: string; value: string | number; weight: number; bad: boolean }[] = [
    { label: "Transactions (24h)",       value: user.txns_24h,                  weight: Math.min(user.txns_24h / 30, 1) * 30,    bad: user.txns_24h > 15      },
    { label: "Volume (24h)",             value: formatZAR(user.volume_24h),     weight: Math.min(user.volume_24h / 6000, 1) * 25, bad: user.volume_24h > 3000  },
    { label: "Failed transactions",      value: user.failed_txns,               weight: Math.min(user.failed_txns / 10, 1) * 20,  bad: user.failed_txns > 2    },
    { label: "Open disputes",            value: user.dispute_count,             weight: Math.min(user.dispute_count / 5, 1) * 15, bad: user.dispute_count > 0  },
    { label: "Account flags",            value: user.flagged ? "Yes" : "No",   weight: user.flagged ? 10 : 0,                    bad: user.flagged            },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-bg2 border border-border rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className={`flex items-start gap-4 p-5 rounded-t-2xl border-b border-border ${
          user.risk_score >= 75 ? "bg-red/5" : user.risk_score >= 50 ? "bg-yellow/5" : "bg-bg3"
        }`}>
          <Avatar name={user.full_name} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-text font-black text-lg leading-tight">{user.full_name}</p>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${tier.bg} ${tier.color}`}>
                {tier.label} RISK
              </span>
            </div>
            <p className="text-textMuted text-xs font-mono mt-0.5 flex items-center gap-1">
              <Phone size={10} /> {user.phone_number}
            </p>
          </div>
          <button onClick={onClose} className="text-textDim hover:text-text transition-colors p-1"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-5">

          {/* Score ring */}
          <div className="flex items-center gap-4">
            <div className={`w-20 h-20 rounded-full border-4 flex items-center justify-center flex-shrink-0 ${
              user.risk_score >= 75 ? "border-red/50" : user.risk_score >= 50 ? "border-yellow/50" : "border-green/50"
            }`}>
              <div className="text-center">
                <p className={`text-2xl font-black leading-none ${tier.color}`}>{user.risk_score}</p>
                <p className="text-textDim text-[9px] font-bold uppercase tracking-wider">/100</p>
              </div>
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-2">Score Contributors</p>
              <div className="space-y-2">
                {factors.map(f => (
                  <div key={f.label}>
                    <div className="flex justify-between items-center mb-0.5">
                      <span className={`text-[10px] font-bold ${f.bad ? tier.color : "text-textDim"}`}>{f.label}</span>
                      <span className={`text-[10px] font-mono ${f.bad ? tier.color : "text-textDim"}`}>{f.value}</span>
                    </div>
                    <div className="h-1 bg-bg3 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${
                        f.weight > 15 ? "bg-red" : f.weight > 8 ? "bg-yellow" : "bg-green/50"
                      }`} style={{ width: `${Math.round(f.weight)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Wallet + account summary */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Wallet Balance",   value: formatZAR(user.balance),            color: "text-cyan"   },
              { label: "Joined",           value: user.created_at ? formatDate(user.created_at).slice(0, 10) : "—", color: "text-textMuted" },
              { label: "Role",             value: user.role?.toUpperCase() || "—",    color: "text-textMuted" },
            ].map(item => (
              <div key={item.label} className="bg-bg border border-border rounded-xl p-3 text-center">
                <p className={`text-sm font-black ${item.color}`}>{item.value}</p>
                <p className="text-[9px] font-bold text-textDim uppercase tracking-widest mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>

          {/* Active signals */}
          <div>
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-2">Active Risk Signals</p>
            <SignalChips u={user} />
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2 border-t border-border pt-4">
            <button onClick={() => onFreeze(user)} disabled={freezing}
              className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-bold transition-all disabled:opacity-50 ${
                user.is_frozen
                  ? "bg-green/10 border-green/20 text-green hover:bg-green/20"
                  : "bg-cyan/10 border-cyan/20 text-cyan hover:bg-cyan/20"
              }`}>
              {user.is_frozen ? <><Unlock size={12} /> Unfreeze</> : <><Snowflake size={12} /> Freeze Wallet</>}
            </button>
            {!user.flagged ? (
              <button onClick={() => onFlag(user)} disabled={flagging}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border bg-yellow/10 border-yellow/20 text-yellow text-xs font-bold hover:bg-yellow/20 transition-all disabled:opacity-50">
                <Flag size={12} /> Flag User
              </button>
            ) : (
              <button onClick={() => onFlag(user)} disabled={flagging}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border bg-green/10 border-green/20 text-green text-xs font-bold hover:bg-green/20 transition-all disabled:opacity-50">
                <CheckCircle2 size={12} /> Unflag
              </button>
            )}
            <Link href={`/admin/support?q=${user.phone_number}`} className="col-span-2" onClick={onClose}>
              <button className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-border text-textMuted text-xs font-bold hover:text-text hover:border-cyan/30 transition-all">
                <Eye size={12} /> Open in Support Console
              </button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Distribution chart ────────────────────────────────────────────────────────

function ScoreDistributionChart({ users }: { users: RiskUser[] }) {
  const buckets = [
    { label: "0–24",  min: 0,  max: 25,  color: "#22c55e" },
    { label: "25–49", min: 25, max: 50,  color: "#06b6d4" },
    { label: "50–74", min: 50, max: 75,  color: "#fbbf24" },
    { label: "75–89", min: 75, max: 90,  color: "#f97316" },
    { label: "90–100",min: 90, max: 101, color: "#ef4444" },
  ].map(b => ({ ...b, count: users.filter(u => u.risk_score >= b.min && u.risk_score < b.max).length }));

  if (users.length === 0) return null;

  return (
    <div className="bg-bg2 border border-border rounded-xl p-4">
      <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-3 flex items-center gap-1.5">
        <Activity size={11} /> Risk Score Distribution
      </p>
      <ResponsiveContainer width="100%" height={80}>
        <BarChart data={buckets} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#6b7280" }} axisLine={false} tickLine={false} />
          <YAxis hide allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: "#1c1c27", border: "1px solid #2d2d3d", borderRadius: 8, fontSize: 11 }}
            formatter={(v: any) => [v, "Users"]}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {buckets.map((b, i) => <Cell key={i} fill={b.color} fillOpacity={0.8} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════

const REFRESH_S = 120;

export default function RiskPage() {
  const [users,      setUsers]      = useState<RiskUser[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [freezing,   setFreezing]   = useState<string | null>(null);
  const [flagging,   setFlagging]   = useState<string | null>(null);
  const [selected,   setSelected]   = useState<RiskUser | null>(null);
  const [tab,        setTab]        = useState<"all" | "high" | "medium" | "frozen" | "flagged">("all");
  const [search,     setSearch]     = useState("");
  const [countdown,  setCountdown]  = useState(REFRESH_S);
  const [bulkFreezeConfirm, setBulkFreezeConfirm] = useState(false);
  const [bulkActing, setBulkActing] = useState(false);
  const timerRef = useRef<any>(null);

  const { open: pinOpen, request: requestPin, handleSuccess: pinSuccess, handleCancel: pinCancel } = useDangerPin();

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    api.riskUsers().then(r => setUsers(r.data)).finally(() => { if (!silent) setLoading(false); });
  }, []);

  const refresh = useCallback(() => { load(false); setCountdown(REFRESH_S); }, [load]);

  useEffect(() => {
    load();
    const poll = setInterval(() => load(true), REFRESH_S * 1000);
    timerRef.current = setInterval(() => setCountdown(c => c <= 1 ? REFRESH_S : c - 1), 1000);
    return () => { clearInterval(poll); clearInterval(timerRef.current); };
  }, [load]);

  const handleFreeze = useCallback(async (u: RiskUser) => {
    const token = await requestPin();
    if (!token) return;
    setFreezing(u.user_id);
    try {
      if (u.is_frozen) {
        await api.unfreezeWallet(u.user_id);
        toast.success(`Wallet unfrozen — ${u.full_name}`);
      } else {
        await api.freezeWallet(u.user_id, `Risk score ${u.risk_score} — frozen from Risk Dashboard`);
        toast.success(`Wallet frozen — ${u.full_name}`);
      }
      setSelected(prev => prev?.user_id === u.user_id ? { ...prev, is_frozen: !u.is_frozen } : prev);
      load(true);
    } catch (e: any) { toast.error(e.message); }
    finally { setFreezing(null); }
  }, [requestPin, load]);

  const handleFlag = useCallback(async (u: RiskUser) => {
    setFlagging(u.user_id);
    try {
      if (u.flagged) {
        await api.unflagUser(u.user_id);
        toast.success(`${u.full_name} unflagged`);
      } else {
        await api.flagUser(u.user_id, "Flagged via Risk Dashboard");
        toast.success(`${u.full_name} flagged`);
      }
      setSelected(prev => prev?.user_id === u.user_id ? { ...prev, flagged: !u.flagged } : prev);
      load(true);
    } catch (e: any) { toast.error(e.message); }
    finally { setFlagging(null); }
  }, [load]);

  const doBulkFreezeHigh = async () => {
    const targets = users.filter(u => u.risk_score >= 75 && !u.is_frozen);
    setBulkFreezeConfirm(false);
    const token = await requestPin();
    if (!token) return;
    setBulkActing(true);
    let done = 0;
    for (const u of targets) {
      try { await api.freezeWallet(u.user_id, `Bulk freeze — risk score ${u.risk_score}`); done++; } catch {}
    }
    setBulkActing(false);
    toast.success(`${done}/${targets.length} wallets frozen`);
    load();
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    highRisk:    users.filter(u => u.risk_score >= 75).length,
    medRisk:     users.filter(u => u.risk_score >= 50 && u.risk_score < 75).length,
    frozen:      users.filter(u => u.is_frozen).length,
    flagged:     users.filter(u => u.flagged).length,
    avgScore:    users.length > 0 ? Math.round(users.reduce((s, u) => s + u.risk_score, 0) / users.length) : 0,
    highUnfrozen: users.filter(u => u.risk_score >= 75 && !u.is_frozen).length,
  }), [users]);

  const displayed = useMemo(() => {
    let list = [...users];
    if (tab === "high")    list = list.filter(u => u.risk_score >= 75);
    if (tab === "medium")  list = list.filter(u => u.risk_score >= 50 && u.risk_score < 75);
    if (tab === "frozen")  list = list.filter(u => u.is_frozen);
    if (tab === "flagged") list = list.filter(u => u.flagged);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(u =>
        u.full_name?.toLowerCase().includes(q) ||
        u.phone_number?.includes(q)
      );
    }
    return list.sort((a, b) => b.risk_score - a.risk_score);
  }, [users, tab, search]);

  const exportCsv = () => {
    const rows = [
      ["Name", "Phone", "Role", "Risk Score", "Tier", "24h Txns", "24h Volume", "Failed Txns", "Disputes", "Balance", "Frozen", "Flagged", "Joined"],
      ...displayed.map(u => [
        u.full_name, u.phone_number, u.role, u.risk_score,
        u.risk_score >= 75 ? "HIGH" : u.risk_score >= 50 ? "MEDIUM" : "LOW",
        u.txns_24h, formatZAR(u.volume_24h), u.failed_txns, u.dispute_count,
        formatZAR(u.balance), u.is_frozen ? "Yes" : "No", u.flagged ? "Yes" : "No",
        u.created_at?.slice(0, 10) || "",
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `risk-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    toast.success(`Exported ${displayed.length} records`);
  };

  const TABS = [
    { key: "all",     label: `All (${users.length})` },
    { key: "high",    label: `High Risk (${stats.highRisk})` },
    { key: "medium",  label: `Medium (${stats.medRisk})` },
    { key: "frozen",  label: `Frozen (${stats.frozen})` },
    { key: "flagged", label: `Flagged (${stats.flagged})` },
  ] as const;

  return (
    <AdminShell title="Risk & Fraud" subtitle="Real-time risk monitoring and account protection">
      <DangerPinModal open={pinOpen} onSuccess={pinSuccess} onCancel={pinCancel} actionLabel="wallet freeze / unfreeze" />

      <div className="space-y-5">

        {/* ── Stats strip ── */}
        <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
          {[
            { label: "High Risk (≥75)",  value: stats.highRisk,   color: stats.highRisk > 0   ? "text-red"       : "text-textMuted", click: () => setTab("high")    },
            { label: "Medium Risk",      value: stats.medRisk,    color: stats.medRisk > 0    ? "text-yellow"    : "text-textMuted", click: () => setTab("medium")  },
            { label: "Avg Score",        value: stats.avgScore,   color: stats.avgScore >= 50 ? "text-yellow"    : "text-green",     click: null },
            { label: "Frozen Wallets",   value: stats.frozen,     color: stats.frozen > 0     ? "text-purple"    : "text-textMuted", click: () => setTab("frozen")  },
            { label: "Flagged Accounts", value: stats.flagged,    color: stats.flagged > 0    ? "text-orange-400": "text-textMuted", click: () => setTab("flagged") },
          ].map(s => (
            <div key={s.label}
              onClick={() => s.click?.()}
              className={`bg-bg2 border border-border rounded-xl p-4 text-center ${s.click ? "cursor-pointer hover:border-cyan/40 transition-colors" : ""}`}>
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-[9px] font-bold text-textDim uppercase tracking-wider mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Distribution chart ── */}
        {!loading && <ScoreDistributionChart users={users} />}

        {/* ── High-risk alert banner ── */}
        {stats.highUnfrozen > 0 && (
          <div className="flex items-center justify-between gap-3 p-4 bg-red/5 border border-red/20 rounded-xl">
            <div className="flex items-center gap-3">
              <AlertTriangle size={16} className="text-red flex-shrink-0" />
              <div>
                <p className="text-red text-sm font-black">
                  {stats.highUnfrozen} high-risk wallet{stats.highUnfrozen > 1 ? "s are" : " is"} still active
                </p>
                <p className="text-red/70 text-xs">Score ≥75 with unfrozen wallet — consider bulk freeze</p>
              </div>
            </div>
            <button onClick={() => setBulkFreezeConfirm(true)} disabled={bulkActing}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red/10 border border-red/30 text-red text-xs font-bold hover:bg-red/20 transition-all disabled:opacity-50 whitespace-nowrap">
              {bulkActing ? <RefreshCw size={12} className="animate-spin" /> : <Snowflake size={12} />}
              Bulk Freeze ({stats.highUnfrozen})
            </button>
          </div>
        )}

        {/* ── Score explanation ── */}
        <div className="flex items-start gap-2 p-3 bg-bg2 border border-border rounded-xl">
          <Info size={12} className="text-cyan flex-shrink-0 mt-0.5" />
          <p className="text-textDim text-[10px] leading-relaxed">
            Risk score (0–100): high-frequency transactions, failed payment rate, open disputes, large 24h volume, flagged status, account age.{" "}
            <span className="text-red font-bold">≥75 = High</span> ·{" "}
            <span className="text-yellow font-bold">50–74 = Medium</span> ·{" "}
            <span className="text-green font-bold">&lt;50 = Normal</span>. Auto-refreshes every {REFRESH_S}s.
          </p>
        </div>

        {/* ── Tabs + controls ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-1 overflow-x-auto border-b border-border">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
                  tab === t.key
                    ? t.key === "high"    ? "text-red border-red"
                    : t.key === "medium"  ? "text-yellow border-yellow"
                    : t.key === "frozen"  ? "text-purple border-purple"
                    : t.key === "flagged" ? "text-orange-400 border-orange-400"
                    : "text-cyan border-cyan"
                    : "text-textMuted border-transparent hover:text-text"
                }`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-textDim text-[10px]">
              <Clock size={10} />
              <span className="font-mono">{countdown}s</span>
            </div>
            <button onClick={refresh} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-textMuted hover:text-cyan border border-border rounded-lg transition-all">
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            </button>
            <button onClick={exportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-textMuted hover:text-text border border-border rounded-lg transition-all">
              <Download size={12} /> Export
            </button>
          </div>
        </div>

        {/* ── Search ── */}
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-textDim" />
          <input
            placeholder="Search name or phone…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-bg2 border border-border rounded-lg text-sm text-text placeholder:text-textDim focus:outline-none focus:border-cyan/50 transition-colors"
          />
          {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-textDim hover:text-text"><X size={13} /></button>}
        </div>

        {/* ── Table ── */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 bg-bg2 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-16">
            <ShieldAlert size={40} className="mx-auto mb-3 text-textDim opacity-30" />
            <p className="text-textMuted font-bold">No users match this filter</p>
          </div>
        ) : (
          <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-bg3">
                    {["User", "Risk Score", "Risk Signals", "24h Activity", "Wallet", "Status", ""].map(h => (
                      <th key={h} className="text-left py-3 px-4 text-[10px] font-bold text-textDim uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayed.map(u => {
                    const tier = RISK_TIER(u.risk_score);
                    return (
                      <tr key={u.user_id}
                        onClick={() => setSelected(u)}
                        className={`border-b border-border cursor-pointer hover:bg-bg3/60 transition-colors ${
                          u.risk_score >= 75 ? "bg-red/3" : ""
                        }`}>

                        {/* User */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={u.full_name} />
                            <div>
                              <p className="font-bold text-text">{u.full_name}</p>
                              <p className="text-textDim text-[10px] font-mono">{u.phone_number}</p>
                            </div>
                          </div>
                        </td>

                        {/* Risk score */}
                        <td className="py-3 px-4 min-w-[140px]">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full border ${tier.bg} ${tier.color}`}>
                                {tier.label}
                              </span>
                            </div>
                            <RiskBar score={u.risk_score} />
                          </div>
                        </td>

                        {/* Signals */}
                        <td className="py-3 px-4 max-w-[200px]">
                          <SignalChips u={u} />
                        </td>

                        {/* 24h activity */}
                        <td className="py-3 px-4">
                          <p className={`font-bold tabular-nums ${u.txns_24h > 20 ? "text-red" : "text-textMuted"}`}>
                            {u.txns_24h} txns
                          </p>
                          <p className={`text-[10px] tabular-nums ${u.volume_24h > 5000 ? "text-orange-400" : "text-textDim"}`}>
                            {formatZAR(u.volume_24h)}
                          </p>
                        </td>

                        {/* Wallet */}
                        <td className="py-3 px-4">
                          <p className="font-bold text-cyan tabular-nums">{formatZAR(u.balance)}</p>
                        </td>

                        {/* Status badges */}
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-1">
                            {u.is_frozen && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple bg-purple/10 border border-purple/20 px-1.5 py-0.5 rounded-full w-fit">
                                <Snowflake size={9} /> Frozen
                              </span>
                            )}
                            {u.flagged && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-yellow bg-yellow/10 border border-yellow/20 px-1.5 py-0.5 rounded-full w-fit">
                                <Flag size={9} /> Flagged
                              </span>
                            )}
                            {!u.is_frozen && !u.flagged && (
                              <span className="text-textDim text-[10px] italic">Active</span>
                            )}
                          </div>
                        </td>

                        {/* Arrow */}
                        <td className="py-3 px-4">
                          <ChevronRight size={13} className="text-textDim" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="text-textDim text-[10px] text-center">
          {displayed.length.toLocaleString()} of {users.length.toLocaleString()} users shown · click any row for full risk breakdown
        </p>
      </div>

      {/* ── Risk detail modal ── */}
      {selected && (
        <RiskBreakdownModal
          user={selected}
          onClose={() => setSelected(null)}
          onFreeze={handleFreeze}
          onFlag={handleFlag}
          freezing={freezing === selected.user_id}
          flagging={flagging === selected.user_id}
        />
      )}

      {/* ── Bulk freeze confirmation ── */}
      <Modal open={bulkFreezeConfirm} onClose={() => setBulkFreezeConfirm(false)} title="Bulk Freeze High-Risk Wallets">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-red/5 border border-red/20 rounded-xl">
            <AlertTriangle size={15} className="text-red flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red text-sm font-black">Freeze {stats.highUnfrozen} high-risk wallet{stats.highUnfrozen > 1 ? "s" : ""}?</p>
              <p className="text-red/70 text-xs mt-1">All users with risk score ≥75 and an active wallet. Danger PIN required. They cannot transact until manually unfrozen.</p>
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setBulkFreezeConfirm(false)}>Cancel</Button>
            <Button variant="danger" onClick={doBulkFreezeHigh} loading={bulkActing}>
              <Snowflake size={12} /> Freeze All {stats.highUnfrozen}
            </Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
