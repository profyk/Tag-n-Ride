"use client";
import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AdminShell } from "@/components/layout/AdminShell";
import { Badge, Button, Spinner, Input, Select, Modal } from "@/components/ui";
import { api, Transaction } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  Search, Download, Copy, X, AlertTriangle, Clock, TrendingUp,
  RefreshCw, ChevronDown, ArrowRight, BarChart2, List,
  CheckCircle2, XCircle, Zap, Hash, Users, DollarSign,
  ArrowUpRight, ArrowDownLeft, Repeat2, Filter,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Legend,
} from "recharts";

// ── Colour maps ────────────────────────────────────────────────────────────
const TYPE_COLOR: Record<string, string> = {
  payment:    "text-green",
  topup:      "text-cyan",
  withdrawal: "text-purple",
  transfer:   "text-yellow",
  refund:     "text-orange",
};
const TYPE_BG: Record<string, string> = {
  payment:    "bg-green/10 border-green/20",
  topup:      "bg-cyan/10 border-cyan/20",
  withdrawal: "bg-purple/10 border-purple/20",
  transfer:   "bg-yellow/10 border-yellow/20",
  refund:     "bg-orange/10 border-orange/20",
};
const TYPE_ICON: Record<string, any> = {
  payment:    ArrowUpRight,
  topup:      ArrowDownLeft,
  withdrawal: Zap,
  transfer:   Repeat2,
  refund:     RefreshCw,
};
const STATUS_COLOR: Record<string, string> = {
  completed: "text-green",
  pending:   "text-yellow",
  failed:    "text-red",
  reversed:  "text-orange",
};
const STATUS_BG: Record<string, string> = {
  completed: "bg-green/10 border-green/20",
  pending:   "bg-yellow/10 border-yellow/20",
  failed:    "bg-red/10 border-red/20",
  reversed:  "bg-orange/10 border-orange/20",
};

// ── Small helpers ──────────────────────────────────────────────────────────
function rel(ts: string) {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return formatDate(ts);
}
function copy(v: string, label = "Copied") {
  navigator.clipboard.writeText(v);
  toast.success(label);
}

// ── Type pill ──────────────────────────────────────────────────────────────
function TypePill({ type }: { type: string }) {
  const Icon = TYPE_ICON[type] || Hash;
  const color = TYPE_COLOR[type] || "text-textMuted";
  const bg    = TYPE_BG[type]    || "bg-bg2 border-border";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${bg} ${color}`}>
      <Icon size={9} /> {type}
    </span>
  );
}

// ── Status pill ────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const color = STATUS_COLOR[status] || "text-textMuted";
  const bg    = STATUS_BG[status]    || "bg-bg2 border-border";
  const icons: Record<string, any> = {
    completed: CheckCircle2, pending: Clock, failed: XCircle, reversed: RefreshCw,
  };
  const Icon = icons[status] || Clock;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${bg} ${color}`}>
      <Icon size={9} /> {status}
    </span>
  );
}

// ── Skeleton row ───────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr className="border-b border-border animate-pulse">
      {[40, 70, 80, 60, 60, 100, 100, 70, 80].map((w, i) => (
        <td key={i} className="py-3 px-4">
          <div className="h-3 bg-bg3 rounded" style={{ width: w }} />
        </td>
      ))}
    </tr>
  );
}

// ── Detail modal ───────────────────────────────────────────────────────────
function TxnModal({ txn, onClose }: { txn: Transaction; onClose: () => void }) {
  const isLarge = txn.amount >= 5000;
  return (
    <Modal open onClose={onClose} title="Transaction Details">
      <div className="space-y-4">
        {/* Amount hero */}
        <div className={`rounded-xl py-6 px-4 text-center border ${
          txn.status === "failed" ? "bg-red/5 border-red/20"
          : isLarge             ? "bg-yellow/5 border-yellow/20"
          : "bg-bg2 border-border"
        }`}>
          <p className={`text-4xl font-black tabular-nums ${
            txn.status === "failed" ? "text-red" : isLarge ? "text-yellow" : "text-text"
          }`}>{formatZAR(txn.amount)}</p>
          <div className="flex justify-center gap-2 mt-3">
            <TypePill type={txn.type} />
            <StatusPill status={txn.status} />
          </div>
          {isLarge && txn.status !== "failed" && (
            <div className="flex items-center justify-center gap-1.5 mt-2 text-yellow text-[10px] font-bold">
              <AlertTriangle size={10} /> Large transaction — flag if unusual
            </div>
          )}
        </div>

        {/* Reference */}
        <div className="flex items-center justify-between px-4 py-3 bg-bg2 border border-border rounded-xl">
          <div>
            <p className="text-[9px] font-bold text-textDim uppercase tracking-widest">Reference</p>
            <p className="font-mono text-sm text-text mt-0.5">{txn.reference}</p>
          </div>
          <button onClick={() => copy(txn.reference, "Reference copied")}
            className="p-2 hover:bg-bg3 rounded-lg transition-colors">
            <Copy size={13} className="text-textMuted" />
          </button>
        </div>

        {/* Parties */}
        {(txn.sender_name || txn.receiver_name) && (
          <div className="grid grid-cols-2 gap-2">
            {txn.sender_name && (
              <div className="px-4 py-3 bg-bg2 border border-border rounded-xl">
                <p className="text-[9px] font-bold text-textDim uppercase tracking-widest mb-1">From</p>
                <p className="text-sm font-bold text-text">{txn.sender_name}</p>
                {txn.sender_id && (
                  <button onClick={() => copy(txn.sender_id!, "ID copied")}
                    className="text-[10px] font-mono text-textDim hover:text-textMuted flex items-center gap-1 mt-0.5">
                    {txn.sender_id.slice(0, 8)}… <Copy size={9} />
                  </button>
                )}
              </div>
            )}
            {txn.receiver_name && (
              <div className="px-4 py-3 bg-bg2 border border-border rounded-xl">
                <p className="text-[9px] font-bold text-textDim uppercase tracking-widest mb-1">To</p>
                <p className="text-sm font-bold text-text">{txn.receiver_name}</p>
                {txn.receiver_id && (
                  <button onClick={() => copy(txn.receiver_id!, "ID copied")}
                    className="text-[10px] font-mono text-textDim hover:text-textMuted flex items-center gap-1 mt-0.5">
                    {txn.receiver_id.slice(0, 8)}… <Copy size={9} />
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Breakdown */}
        <div className="bg-bg2 border border-border rounded-xl divide-y divide-border">
          {[
            { label: "Date",         value: formatDate(txn.created_at) },
            txn.platform_fee != null ? { label: "Platform Fee", value: formatZAR(txn.platform_fee) } : null,
            txn.driver_net   != null ? { label: "Driver Net",   value: formatZAR(txn.driver_net) }   : null,
            txn.note                 ? { label: "Note",         value: txn.note }                     : null,
          ].filter(Boolean).map((row: any, i) => (
            <div key={i} className="flex justify-between items-center px-4 py-2.5">
              <span className="text-[10px] font-bold text-textDim uppercase tracking-widest">{row.label}</span>
              <span className="text-sm text-text font-semibold">{row.value}</span>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          {txn.sender_id && (
            <a href={`/admin/users?id=${txn.sender_id}`}>
              <Button variant="secondary">View Sender <ArrowRight size={11} /></Button>
            </a>
          )}
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Analytics tab ──────────────────────────────────────────────────────────
function AnalyticsTab() {
  const [range, setRange]   = useState<"7d" | "30d" | "90d">("30d");
  const [data, setData]     = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const token = typeof window !== "undefined" ? localStorage.getItem("tnr_admin_token") : null;
    fetch(`https://tag-n-ride-production.up.railway.app/api/admin/analytics?period=${range}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async r => {
        const json = await r.json();
        if (!r.ok) throw new Error(json?.detail || `HTTP ${r.status}`);
        setData(json);
      })
      .catch(e => setError(e?.message || "Failed to load analytics"))
      .finally(() => setLoading(false));
  }, [range]);

  if (loading) return (
    <div className="space-y-4">
      {[1,2,3].map(i => <div key={i} className="h-48 bg-bg2 animate-pulse rounded-xl" />)}
    </div>
  );
  if (error || !data) return (
    <div className="py-12 text-center">
      <p className="text-red font-bold text-sm">{error || "No data returned"}</p>
      <p className="text-textDim text-xs mt-1">Check that your role has the <code className="bg-bg3 px-1 rounded">view_analytics</code> permission.</p>
    </div>
  );

  const TYPE_COLORS_PIE: Record<string, string> = {
    payment: "#22c55e", topup: "#06b6d4", withdrawal: "#a855f7", transfer: "#eab308",
  };

  return (
    <div className="space-y-6">
      {/* Range selector */}
      <div className="flex justify-end">
        <div className="flex gap-1 bg-bg2 border border-border rounded-lg p-1">
          {(["7d", "30d", "90d"] as const).map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                range === r ? "bg-cyan/20 text-cyan border border-cyan/20" : "text-textMuted hover:text-text"
              }`}>{r}</button>
          ))}
        </div>
      </div>

      {/* Daily volume chart */}
      {data.daily_volume?.length > 0 && (
        <div className="bg-bg2 border border-border rounded-xl p-5">
          <p className="text-text font-bold text-sm mb-4 flex items-center gap-2">
            <BarChart2 size={14} className="text-cyan" /> Daily Transaction Volume
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.daily_volume} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#6b7280" }}
                tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fontSize: 9, fill: "#6b7280" }}
                tickFormatter={v => `R${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: "#1c1c27", border: "1px solid #2d2d3d", borderRadius: 8, fontSize: 11 }}
                formatter={(v: any) => [formatZAR(v), "Volume"]}
                labelFormatter={l => `Date: ${l}`}
              />
              <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                {data.daily_volume.map((_: any, i: number) => (
                  <Cell key={i} fill="#06b6d4" fillOpacity={0.7 + (i % 3) * 0.1} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Type breakdown + Top passengers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* By type */}
        {data.transactions_by_type?.length > 0 && (
          <div className="bg-bg2 border border-border rounded-xl p-5">
            <p className="text-text font-bold text-sm mb-4 flex items-center gap-2">
              <Hash size={14} className="text-purple" /> By Transaction Type
            </p>
            <div className="space-y-3">
              {data.transactions_by_type.map((t: any) => {
                const color = TYPE_COLOR[t.type] || "text-textMuted";
                const max = Math.max(...data.transactions_by_type.map((x: any) => x.volume));
                const pct = max > 0 ? (t.volume / max) * 100 : 0;
                return (
                  <div key={t.type}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className={`font-bold ${color} capitalize`}>{t.type}</span>
                      <span className="text-textMuted font-semibold">{t.count.toLocaleString()} txns — {formatZAR(t.volume)}</span>
                    </div>
                    <div className="h-1.5 bg-bg3 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${color.replace("text-", "bg-")}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Top passengers */}
        {data.top_passengers?.length > 0 && (
          <div className="bg-bg2 border border-border rounded-xl p-5">
            <p className="text-text font-bold text-sm mb-4 flex items-center gap-2">
              <Users size={14} className="text-green" /> Top Passengers by Spend
            </p>
            <div className="space-y-2">
              {data.top_passengers.slice(0, 8).map((p: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-green/10 border border-green/20 flex items-center justify-center text-[10px] font-black text-green">
                      {i + 1}
                    </div>
                    <span className="text-text text-xs font-semibold">{p.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-green text-xs font-bold">{formatZAR(p.total_spent)}</p>
                    <p className="text-textDim text-[10px]">{p.txn_count} txns</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Driver leaderboard */}
      {data.driver_leaderboard?.length > 0 && (
        <div className="bg-bg2 border border-border rounded-xl p-5">
          <p className="text-text font-bold text-sm mb-4 flex items-center gap-2">
            <DollarSign size={14} className="text-yellow" /> Driver Earnings Leaderboard
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.driver_leaderboard.slice(0, 9).map((d: any, i: number) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5 bg-bg border border-border rounded-lg">
                <span className={`text-sm font-black w-6 text-center ${
                  i === 0 ? "text-yellow" : i === 1 ? "text-textMuted" : i === 2 ? "text-orange" : "text-textDim"
                }`}>#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-text text-xs font-bold truncate">{d.name}</p>
                </div>
                <p className="text-yellow text-xs font-black">{formatZAR(d.earnings)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN CONTENT
// ════════════════════════════════════════════════════════════════════════════
function TransactionsContent() {
  const params = useSearchParams();
  type Tab = "feed" | "analytics";

  const [txns,        setTxns]        = useState<Transaction[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [type,        setType]        = useState("");
  const [statusTab,   setStatusTab]   = useState("all");
  const [from,        setFrom]        = useState(params.get("from") ?? "");
  const [to,          setTo]          = useState(params.get("to")   ?? "");
  const [search,      setSearch]      = useState("");
  const [minAmt,      setMinAmt]      = useState("");
  const [maxAmt,      setMaxAmt]      = useState("");
  const [selected,    setSelected]    = useState<Transaction | null>(null);
  const [tab,         setTab]         = useState<Tab>("feed");
  const [countdown,   setCountdown]   = useState(60);
  const [showFilters, setShowFilters] = useState(false);
  const timerRef = useRef<any>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.transactions({
      type:       type    || undefined,
      from_date:  from    || undefined,
      to_date:    to      || undefined,
      search:     search  || undefined,
      min_amount: minAmt  ? parseFloat(minAmt) : undefined,
      max_amount: maxAmt  ? parseFloat(maxAmt) : undefined,
    }).then(r => setTxns(r.data)).finally(() => setLoading(false));
  }, [type, from, to, search, minAmt, maxAmt]);

  useEffect(() => { load(); }, [type, from, to, minAmt, maxAmt]);

  const refresh = useCallback(() => { load(); setCountdown(60); }, [load]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown(c => { if (c <= 1) { refresh(); return 60; } return c - 1; });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [refresh]);

  const clearAll = () => {
    setType(""); setStatusTab("all"); setFrom(""); setTo("");
    setSearch(""); setMinAmt(""); setMaxAmt("");
  };

  // ── Client-side status filter ─────────────────────────────────────────
  const displayed = useMemo(() =>
    statusTab === "all" ? txns : txns.filter(t => t.status === statusTab),
  [txns, statusTab]);

  // ── Summary stats ─────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const vol     = displayed.reduce((s, t) => s + t.amount, 0);
    const fees    = displayed.reduce((s, t) => s + (t.platform_fee || 0), 0);
    const failed  = displayed.filter(t => t.status === "failed").length;
    const completed = displayed.filter(t => t.status === "completed").length;
    const successPct = displayed.length > 0 ? Math.round((completed / displayed.length) * 100) : 0;
    const avg     = displayed.length > 0 ? vol / displayed.length : 0;
    const largest = displayed.reduce((m, t) => Math.max(m, t.amount), 0);
    return { vol, fees, failed, successPct, avg, largest };
  }, [displayed]);

  const statusCounts = useMemo(() => {
    const m: Record<string, number> = {};
    txns.forEach(t => { m[t.status] = (m[t.status] || 0) + 1; });
    return m;
  }, [txns]);

  const hasFilters = !!(type || from || to || search || minAmt || maxAmt || statusTab !== "all");

  return (
    <AdminShell title="Transactions">
      <div className="space-y-5">

        {/* ── Header bar ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-1 bg-bg2 border border-border rounded-lg p-1">
            {([
              { id: "feed",      label: "Live Feed",  icon: List      },
              { id: "analytics", label: "Analytics",  icon: BarChart2 },
            ] as const).map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                  tab === t.id ? "bg-cyan/20 text-cyan border border-cyan/20" : "text-textMuted hover:text-text"
                }`}>
                <t.icon size={12} /> {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {tab === "feed" && (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1 bg-bg3 rounded-full overflow-hidden">
                    <div className="h-full bg-cyan/50 rounded-full transition-all duration-1000"
                      style={{ width: `${(countdown / 60) * 100}%` }} />
                  </div>
                  <span className="text-textDim text-[10px] w-6">{countdown}s</span>
                </div>
                <button onClick={refresh} disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-textMuted hover:text-cyan border border-border rounded-lg transition-all">
                  <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
                </button>
              </>
            )}
            <button onClick={() => api.exportTransactions().catch(() => toast.error("Export failed"))}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-textMuted hover:text-text border border-border rounded-lg transition-all">
              <Download size={12} /> Export CSV
            </button>
          </div>
        </div>

        {/* ── Analytics tab ── */}
        {tab === "analytics" && <AnalyticsTab />}

        {/* ── Live Feed tab ── */}
        {tab === "feed" && (
          <>
            {/* Filter bar */}
            <div className="space-y-3">
              <div className="flex gap-2 flex-wrap items-center">
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-textDim" />
                    <input
                      placeholder="Search reference, name, phone…"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && load()}
                      className="w-full pl-9 pr-4 py-2 bg-bg2 border border-border rounded-lg text-sm text-text placeholder:text-textDim focus:outline-none focus:border-cyan/50 transition-colors"
                    />
                  </div>
                </div>
                <button onClick={() => setShowFilters(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border rounded-lg transition-all ${
                    showFilters || hasFilters ? "text-cyan border-cyan/30 bg-cyan/5" : "text-textMuted border-border hover:text-text"
                  }`}>
                  <Filter size={12} /> Filters
                  {hasFilters && <span className="w-1.5 h-1.5 rounded-full bg-cyan" />}
                </button>
                {hasFilters && (
                  <button onClick={clearAll}
                    className="flex items-center gap-1 px-3 py-2 text-xs font-bold text-red border border-red/20 rounded-lg hover:bg-red/5 transition-all">
                    <X size={12} /> Clear
                  </button>
                )}
                <Button onClick={load}>
                  <Search size={13} /> Search
                </Button>
              </div>

              {showFilters && (
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 p-4 bg-bg2 border border-border rounded-xl">
                  <div>
                    <p className="text-[9px] font-bold text-textDim uppercase tracking-widest mb-1">Type</p>
                    <Select value={type} onChange={e => setType(e.target.value)}>
                      <option value="">All types</option>
                      <option value="payment">Payment</option>
                      <option value="topup">Top-up</option>
                      <option value="withdrawal">Withdrawal</option>
                      <option value="transfer">Transfer</option>
                      <option value="refund">Refund</option>
                    </Select>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-textDim uppercase tracking-widest mb-1">From date</p>
                    <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-textDim uppercase tracking-widest mb-1">To date</p>
                    <Input type="date" value={to}   onChange={e => setTo(e.target.value)} />
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-textDim uppercase tracking-widest mb-1">Min amount</p>
                    <Input type="number" placeholder="e.g. 1000" value={minAmt} onChange={e => setMinAmt(e.target.value)} />
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-textDim uppercase tracking-widest mb-1">Max amount</p>
                    <Input type="number" placeholder="e.g. 50000" value={maxAmt} onChange={e => setMaxAmt(e.target.value)} />
                  </div>
                </div>
              )}
            </div>

            {/* Status tabs */}
            <div className="flex gap-1 border-b border-border overflow-x-auto">
              {(["all", "completed", "pending", "failed", "reversed"] as const).map(s => {
                const cnt = s === "all" ? txns.length : (statusCounts[s] || 0);
                return (
                  <button key={s} onClick={() => setStatusTab(s)}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
                      statusTab === s
                        ? s === "failed"    ? "text-red border-red"
                        : s === "pending"   ? "text-yellow border-yellow"
                        : s === "completed" ? "text-green border-green"
                        : "text-cyan border-cyan"
                        : "text-textMuted border-transparent hover:text-text"
                    }`}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                    {cnt > 0 && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black ${
                        statusTab === s ? "bg-current/20" : "bg-bg3"
                      }`}>{cnt}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Stats strip */}
            {!loading && txns.length > 0 && (
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                {[
                  { label: "Records",       value: displayed.length.toLocaleString(), color: "text-text" },
                  { label: "Total Volume",  value: formatZAR(stats.vol),             color: "text-cyan"  },
                  { label: "Fees Collected",value: formatZAR(stats.fees),            color: "text-green" },
                  { label: "Success Rate",  value: `${stats.successPct}%`,           color: stats.successPct >= 95 ? "text-green" : stats.successPct >= 80 ? "text-yellow" : "text-red" },
                  { label: "Failed",        value: stats.failed.toString(),           color: stats.failed > 0 ? "text-red" : "text-green" },
                  { label: "Avg. Txn",      value: formatZAR(stats.avg),             color: "text-purple" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-bg2 border border-border rounded-xl px-4 py-3">
                    <p className="text-[9px] font-bold text-textDim uppercase tracking-widest">{label}</p>
                    <p className={`text-lg font-black tabular-nums mt-0.5 ${color}`}>{value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Showing counter */}
            {!loading && (
              <div className="flex items-center justify-between">
                <p className="text-textDim text-[10px]">
                  Showing <span className="text-text font-bold">{displayed.length.toLocaleString()}</span> of{" "}
                  <span className="text-text font-bold">{txns.length.toLocaleString()}</span> transactions
                  {hasFilters && " (filtered)"}
                </p>
              </div>
            )}

            {/* Table */}
            <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-bg3">
                      {["Reference", "Type", "Amount", "Fee", "Net", "From → To", "Status", "When"].map(h => (
                        <th key={h} className="text-left py-3 px-4 text-[10px] font-bold text-textDim uppercase tracking-wider whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading
                      ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                      : displayed.length === 0
                      ? (
                        <tr>
                          <td colSpan={8} className="py-16 text-center text-textMuted text-sm">
                            No transactions match current filters
                          </td>
                        </tr>
                      )
                      : displayed.map(t => {
                          const isLarge  = t.amount >= 5000;
                          const isFailed = t.status === "failed";
                          return (
                            <tr key={t.id}
                              onClick={() => setSelected(t)}
                              className={`border-b border-border cursor-pointer transition-colors hover:bg-bg3/50 ${
                                isFailed ? "bg-red/3" : isLarge ? "bg-yellow/3" : ""
                              }`}>

                              {/* Reference */}
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-[10px] text-textMuted">{t.reference.slice(0, 12)}…</span>
                                  <button onClick={e => { e.stopPropagation(); copy(t.reference); }}
                                    className="text-textDim hover:text-textMuted transition-colors">
                                    <Copy size={9} />
                                  </button>
                                </div>
                              </td>

                              {/* Type */}
                              <td className="py-3 px-4">
                                <TypePill type={t.type} />
                              </td>

                              {/* Amount */}
                              <td className={`py-3 px-4 font-black tabular-nums ${isLarge ? "text-yellow" : "text-text"}`}>
                                {formatZAR(t.amount)}
                                {isLarge && <AlertTriangle size={9} className="inline ml-1 text-yellow" />}
                              </td>

                              {/* Fee */}
                              <td className="py-3 px-4 text-textMuted tabular-nums">
                                {t.platform_fee ? formatZAR(t.platform_fee) : "—"}
                              </td>

                              {/* Net */}
                              <td className="py-3 px-4 text-green font-semibold tabular-nums">
                                {t.driver_net ? formatZAR(t.driver_net) : "—"}
                              </td>

                              {/* From → To */}
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-1 text-textMuted max-w-[180px]">
                                  <span className="truncate">{t.sender_name || "—"}</span>
                                  <ArrowRight size={9} className="flex-shrink-0 text-textDim" />
                                  <span className="truncate">{t.receiver_name || "—"}</span>
                                </div>
                              </td>

                              {/* Status */}
                              <td className="py-3 px-4">
                                <StatusPill status={t.status} />
                              </td>

                              {/* When */}
                              <td className="py-3 px-4 text-textDim whitespace-nowrap">
                                {rel(t.created_at)}
                              </td>
                            </tr>
                          );
                        })
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Transaction detail modal */}
      {selected && <TxnModal txn={selected} onClose={() => setSelected(null)} />}
    </AdminShell>
  );
}

// ── Page wrapper (Suspense for useSearchParams) ────────────────────────────
export default function TransactionsPage() {
  return (
    <Suspense fallback={<AdminShell title="Transactions"><Spinner /></AdminShell>}>
      <TransactionsContent />
    </Suspense>
  );
}
