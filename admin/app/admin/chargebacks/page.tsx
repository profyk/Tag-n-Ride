"use client";
import { useEffect, useState, useMemo, useCallback, useRef, Fragment } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Spinner, Modal, Input } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  AlertOctagon, CheckCircle2, XCircle, PlusCircle, Download,
  Search, X, RefreshCw, Clock, ChevronDown, ChevronRight,
  Shield, Trophy, TrendingUp, AlertTriangle, DollarSign,
} from "lucide-react";
import toast from "react-hot-toast";
import { api, Chargeback, hasPermission } from "@/lib/api";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authH = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

// ── Constants ──────────────────────────────────────────────────────────────
const CHARGEBACK_REASONS = [
  "Customer claims no authorisation",
  "Duplicate transaction",
  "Card not present fraud",
  "Service not received",
  "Incorrect amount",
  "Subscription cancelled",
  "Technical error / double charge",
];

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  pending:      { label: "Pending",      cls: "bg-yellow/10 border-yellow/20 text-yellow" },
  under_review: { label: "Under Review", cls: "bg-cyan/10 border-cyan/20 text-cyan" },
  won:          { label: "Won",          cls: "bg-green/10 border-green/20 text-green" },
  lost:         { label: "Lost",         cls: "bg-red/10 border-red/20 text-red" },
};

// ── Age helper ─────────────────────────────────────────────────────────────
function getAge(ts: string) {
  const ms = Date.now() - new Date(ts).getTime();
  const m  = Math.floor(ms / 60000);
  const h  = Math.floor(m / 60);
  const d  = Math.floor(h / 24);
  const label = d > 0 ? `${d}d ${h % 24}h` : h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
  const urgency: "fresh" | "warn" | "danger" = d < 1 ? "fresh" : d < 7 ? "warn" : "danger";
  return { label, urgency };
}
const AGE_CLS = {
  fresh:  "bg-green/10 border-green/20 text-green",
  warn:   "bg-yellow/10 border-yellow/20 text-yellow",
  danger: "bg-red/10 border-red/20 text-red",
};

// ── User search hook ────────────────────────────────────────────────────────
function useUserSearch(query: string) {
  const [searching, setSearching] = useState(false);
  const [user, setUser] = useState<{ id: string; full_name: string; phone: string } | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (query.length < 3) { setUser(null); setNotFound(false); return; }
    setSearching(true); setNotFound(false);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${BASE}/api/admin/support/user/${encodeURIComponent(query)}`, { headers: authH() });
        if (res.ok) {
          const data = await res.json();
          if (data.user?.id) { setUser({ id: data.user.id, full_name: data.user.full_name, phone: data.user.phone_number }); setNotFound(false); }
          else { setUser(null); setNotFound(true); }
        } else { setUser(null); setNotFound(true); }
      } catch { setUser(null); setNotFound(true); }
      finally { setSearching(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [query]);

  return { searching, user, notFound };
}

// ── Initials avatar ────────────────────────────────────────────────────────
function Avatar({ name }: { name: string }) {
  const ini = name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  return (
    <div className="w-8 h-8 rounded-full bg-red/10 border border-red/20 flex items-center justify-center font-black text-red text-[10px] flex-shrink-0">
      {ini}
    </div>
  );
}

// ── Reason chips ───────────────────────────────────────────────────────────
function ReasonChips({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CHARGEBACK_REASONS.map(r => (
        <button key={r} type="button" onClick={() => onChange(r)}
          className={`text-[10px] px-2 py-1 rounded-md border transition-all ${
            value === r ? "bg-red/10 text-red border-red/20" : "bg-bg3 text-textMuted border-border hover:text-text"
          }`}>{r}</button>
      ))}
    </div>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] || { label: status, cls: "bg-bg3 border-border text-textMuted" };
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${cfg.cls}`}>{cfg.label}</span>;
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function ChargebacksPage() {
  // ── Data ────────────────────────────────────────────────────────────────
  const [chargebacks, setChargebacks] = useState<Chargeback[]>([]);
  const [loading,     setLoading]     = useState(true);

  // ── UI state ────────────────────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<"pending" | "under_review" | "won" | "lost" | "all">("pending");
  const [search,       setSearch]       = useState("");
  const [expanded,     setExpanded]     = useState<string | null>(null);
  const [countdown,    setCountdown]    = useState(60);

  // ── Action states ────────────────────────────────────────────────────────
  const [resolving, setResolving] = useState(false);
  const [creating,  setCreating]  = useState(false);

  // ── Resolve modal ────────────────────────────────────────────────────────
  const [selected,       setSelected]       = useState<Chargeback | null>(null);
  const [resolveModal,   setResolveModal]   = useState(false);
  const [resolveStatus,  setResolveStatus]  = useState<"won" | "lost" | "under_review">("won");
  const [resolveNote,    setResolveNote]    = useState("");
  const [resolveAmount,  setResolveAmount]  = useState("");   // separate from note — fixes the bug

  // ── Log new chargeback modal ─────────────────────────────────────────────
  const [logModal,   setLogModal]   = useState(false);
  const [logQuery,   setLogQuery]   = useState("");
  const [logTxnId,   setLogTxnId]   = useState("");
  const [logAmount,  setLogAmount]  = useState("");
  const [logReason,  setLogReason]  = useState("");
  const logUser = useUserSearch(logQuery);

  const timerRef = useRef<any>(null);
  const canManage = hasPermission("manage_refunds");

  // ── Load ─────────────────────────────────────────────────────────────────
  // Load all for accurate stats, filter client-side
  const load = useCallback(() => {
    setLoading(true);
    api.chargebacks()
      .then(r => setChargebacks(r.data))
      .catch(e => toast.error(`Failed to load: ${e.message}`))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // 60s auto-refresh
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown(c => { if (c <= 1) { load(); return 60; } return c - 1; });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [load]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const pending     = useMemo(() => chargebacks.filter(c => c.status === "pending"),      [chargebacks]);
  const underReview = useMemo(() => chargebacks.filter(c => c.status === "under_review"), [chargebacks]);
  const won         = useMemo(() => chargebacks.filter(c => c.status === "won"),          [chargebacks]);
  const lost        = useMemo(() => chargebacks.filter(c => c.status === "lost"),         [chargebacks]);

  const totalDisputed  = useMemo(() => chargebacks.reduce((s, c) => s + c.amount, 0),          [chargebacks]);
  const totalRecovered = useMemo(() => chargebacks.reduce((s, c) => s + c.amount_recovered, 0), [chargebacks]);
  const recoveryRate   = totalDisputed > 0 ? (totalRecovered / totalDisputed) * 100 : 0;
  const staleOpen      = useMemo(() => [...pending, ...underReview].filter(c => getAge(c.created_at).urgency === "danger"), [pending, underReview]);

  const filtered = useMemo(() => {
    let list = statusFilter === "all" ? chargebacks : chargebacks.filter(c => c.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.user_name.toLowerCase().includes(q) ||
        c.phone_number.includes(q) ||
        c.reason.toLowerCase().includes(q) ||
        (c.txn_ref || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [chargebacks, statusFilter, search]);

  // ── Open resolve modal ────────────────────────────────────────────────────
  const openResolve = (c: Chargeback, defaultStatus: "won" | "lost" | "under_review" = "won") => {
    setSelected(c);
    setResolveStatus(defaultStatus);
    setResolveNote(c.resolution_note || "");
    setResolveAmount(c.amount_recovered > 0 ? String(c.amount_recovered) : String(c.amount));
    setResolveModal(true);
  };

  // ── Submit resolve ────────────────────────────────────────────────────────
  const submitResolve = async () => {
    if (!selected) return;
    setResolving(true);
    try {
      await api.updateChargeback(selected.id, {
        status:           resolveStatus,
        resolution_note:  resolveNote.trim() || undefined,
        amount_recovered: resolveStatus === "won" ? (parseFloat(resolveAmount) || 0) : 0,
      });
      toast.success(`Chargeback marked as ${resolveStatus}`);
      setResolveModal(false);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setResolving(false); }
  };

  // ── Close log modal ───────────────────────────────────────────────────────
  const closeLog = () => { setLogModal(false); setLogQuery(""); setLogTxnId(""); setLogAmount(""); setLogReason(""); };

  // ── Submit new chargeback ─────────────────────────────────────────────────
  const submitLog = async () => {
    if (!logUser.user?.id)                          { toast.error("Customer not found"); return; }
    if (!logAmount || parseFloat(logAmount) <= 0)   { toast.error("Valid disputed amount required"); return; }
    if (!logReason.trim())                          { toast.error("Reason required"); return; }
    setCreating(true);
    try {
      await api.createChargeback({
        user_id:        logUser.user.id,
        transaction_id: logTxnId.trim() || undefined,
        amount:         parseFloat(logAmount),
        reason:         logReason.trim(),
      });
      toast.success("Chargeback logged and entered the pending queue");
      closeLog();
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setCreating(false); }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AdminShell title="Chargebacks">
      <div className="space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <p className="text-textMuted text-xs">
            Bank-initiated payment disputes · Track, fight and record outcomes · Requires evidence submission to Stitch
          </p>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-textDim">Refresh in {countdown}s</span>
            <button onClick={() => { load(); setCountdown(60); }} className="text-textDim hover:text-cyan transition-colors">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* ── Stats strip ── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className={pending.length > 0 ? "border-yellow/30" : ""}>
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Open Cases</p>
            <p className={`text-3xl font-black tabular-nums ${pending.length > 0 ? "text-yellow" : "text-green"}`}>
              {pending.length + underReview.length}
            </p>
            <p className="text-textDim text-[10px] mt-1">
              {pending.length} pending · {underReview.length} in review
            </p>
          </Card>

          <Card className={staleOpen.length > 0 ? "border-red/30" : ""}>
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Overdue (&gt;7d)</p>
            <p className={`text-3xl font-black tabular-nums ${staleOpen.length > 0 ? "text-red" : "text-green"}`}>
              {staleOpen.length}
            </p>
            <p className="text-textDim text-[10px] mt-1">{staleOpen.length > 0 ? "Needs evidence urgently" : "All on time ✓"}</p>
          </Card>

          <Card>
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Won</p>
            <p className="text-3xl font-black text-green tabular-nums">{won.length}</p>
            <p className="text-textDim text-[10px] mt-1">{formatZAR(won.reduce((s, c) => s + c.amount_recovered, 0))} recovered</p>
          </Card>

          <Card>
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Total Disputed</p>
            <p className="text-2xl font-black text-red tabular-nums">{formatZAR(totalDisputed)}</p>
            <p className="text-textDim text-[10px] mt-1">{chargebacks.length} cases total</p>
          </Card>

          <Card className={recoveryRate >= 70 ? "border-green/20" : recoveryRate >= 40 ? "border-yellow/20" : "border-red/20"}>
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Recovery Rate</p>
            <p className={`text-3xl font-black tabular-nums ${recoveryRate >= 70 ? "text-green" : recoveryRate >= 40 ? "text-yellow" : "text-red"}`}>
              {recoveryRate.toFixed(0)}%
            </p>
            <div className="mt-2 h-1 bg-bg3 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, recoveryRate)}%`, background: recoveryRate >= 70 ? "#00E676" : recoveryRate >= 40 ? "#FFD60A" : "#FF3B30" }} />
            </div>
            <p className="text-textDim text-[10px] mt-1">{formatZAR(totalRecovered)} of {formatZAR(totalDisputed)}</p>
          </Card>
        </div>

        {/* ── Stale open alert ── */}
        {staleOpen.length > 0 && (
          <div className="flex items-center justify-between p-4 bg-red/5 border border-red/20 rounded-xl">
            <div className="flex items-center gap-3">
              <AlertTriangle size={16} className="text-red flex-shrink-0" />
              <div>
                <p className="text-red text-sm font-bold">
                  {staleOpen.length} chargeback{staleOpen.length !== 1 ? "s" : ""} open for over 7 days
                </p>
                <p className="text-textMuted text-xs">
                  Banks typically close disputes within 30–45 days. Submit evidence to Stitch immediately.
                </p>
              </div>
            </div>
            <button onClick={() => setStatusFilter("pending")}
              className="flex items-center gap-2 px-4 py-2 bg-red/10 border border-red/20 text-red text-xs font-bold rounded-lg hover:bg-red/20 transition-all whitespace-nowrap">
              Review Now →
            </button>
          </div>
        )}

        {/* ── Main card ── */}
        <Card>
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <AlertOctagon size={15} className="text-red" />
              <h2 className="text-text font-bold text-sm">Chargeback Cases</h2>
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <div className="relative">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-textDim" />
                <input
                  placeholder="Name, phone, ref, reason…"
                  value={search} onChange={e => setSearch(e.target.value)}
                  className="bg-bg border border-border rounded-lg pl-8 pr-7 py-2 text-text text-xs focus:outline-none focus:border-cyan placeholder:text-textDim w-52"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-textDim hover:text-text">
                    <X size={11} />
                  </button>
                )}
              </div>
              {canManage && (
                <button onClick={() => setLogModal(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-red/10 border border-red/20 text-red text-xs font-bold rounded-lg hover:bg-red/20 transition-all">
                  <PlusCircle size={12} /> Log Chargeback
                </button>
              )}
              <button onClick={() => window.open(`${BASE}/api/admin/export/transactions`, "_blank")}
                className="flex items-center gap-1.5 px-3 py-2 text-xs text-textMuted hover:text-cyan border border-border rounded-lg transition-all">
                <Download size={12} /> Export
              </button>
            </div>
          </div>

          {/* Status tabs */}
          <div className="flex gap-1 mb-5 pb-4 border-b border-border overflow-x-auto">
            {([
              { key: "pending",      label: "Pending",      count: pending.length,     active: "bg-yellow/10 text-yellow border-yellow/20" },
              { key: "under_review", label: "Under Review", count: underReview.length, active: "bg-cyan/10 text-cyan border-cyan/20" },
              { key: "won",          label: "Won",          count: won.length,          active: "bg-green/10 text-green border-green/20" },
              { key: "lost",         label: "Lost",         count: lost.length,         active: "bg-red/10 text-red border-red/20" },
              { key: "all",          label: "All",          count: chargebacks.length,  active: "bg-cyanDim text-cyan border-cyan/20" },
            ] as const).map(t => (
              <button key={t.key} onClick={() => setStatusFilter(t.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all whitespace-nowrap ${
                  statusFilter === t.key ? t.active : "bg-bg3 text-textMuted border-border hover:text-text"
                }`}>
                {t.label} ({t.count})
              </button>
            ))}
          </div>

          <p className="text-xs text-textMuted mb-3">
            {loading ? "Loading…" : `${filtered.length} of ${chargebacks.length} case${chargebacks.length !== 1 ? "s" : ""}${search ? ` matching "${search}"` : ""}`}
          </p>

          {loading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <AlertOctagon size={32} className="mx-auto mb-3 text-textDim opacity-40" />
              <p className="text-textMuted text-sm font-medium">
                {search ? `No cases matching "${search}"` : `No ${statusFilter !== "all" ? statusFilter.replace("_", " ") : ""} chargebacks`}
              </p>
              {!search && statusFilter === "pending" && (
                <p className="text-green text-xs mt-2">No open chargebacks ✓</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    {["Customer", "Transaction", "Disputed", "Reason", "Age / Status", "Recovered", "Actions", ""].map((h, i) => (
                      <th key={i} className="text-left py-2 px-3 text-textDim font-bold uppercase tracking-wider text-[10px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => {
                    const age        = getAge(c.created_at);
                    const isExpanded = expanded === c.id;
                    const isOpen     = c.status === "pending" || c.status === "under_review";
                    return (
                      <Fragment key={c.id}>
                        <tr className={`border-b border-border/50 hover:bg-bg3/30 transition-colors ${isExpanded ? "bg-bg3/40" : ""}`}>
                          {/* Customer */}
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <Avatar name={c.user_name} />
                              <div>
                                <p className="font-semibold text-text text-xs leading-tight">{c.user_name}</p>
                                <p className="text-[10px] font-mono text-textMuted">{c.phone_number}</p>
                              </div>
                            </div>
                          </td>
                          {/* Transaction */}
                          <td className="py-3 px-3">
                            <p className="text-[10px] font-mono text-textMuted">
                              {c.txn_ref || (c.transaction_id ? c.transaction_id.slice(0, 10) + "…" : "—")}
                            </p>
                            {c.txn_amount > 0 && c.txn_amount !== c.amount && (
                              <p className="text-textDim text-[10px]">txn: {formatZAR(c.txn_amount)}</p>
                            )}
                          </td>
                          {/* Disputed amount */}
                          <td className="py-3 px-3">
                            <p className="font-black text-red text-sm tabular-nums">{formatZAR(c.amount)}</p>
                          </td>
                          {/* Reason */}
                          <td className="py-3 px-3 max-w-[150px]">
                            <p className="text-textMuted text-xs truncate" title={c.reason}>{c.reason}</p>
                          </td>
                          {/* Age / Status */}
                          <td className="py-3 px-3">
                            {isOpen ? (
                              <div className="space-y-1">
                                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border ${AGE_CLS[age.urgency]}`}>
                                  <Clock size={9} /> {age.label}
                                </span>
                                <div><StatusBadge status={c.status} /></div>
                              </div>
                            ) : (
                              <StatusBadge status={c.status} />
                            )}
                          </td>
                          {/* Recovered */}
                          <td className="py-3 px-3">
                            {c.amount_recovered > 0 ? (
                              <div>
                                <p className="font-bold text-green tabular-nums">{formatZAR(c.amount_recovered)}</p>
                                <p className="text-textDim text-[10px]">
                                  {((c.amount_recovered / c.amount) * 100).toFixed(0)}% of disputed
                                </p>
                              </div>
                            ) : (
                              <p className="text-textDim text-[10px]">—</p>
                            )}
                          </td>
                          {/* Actions */}
                          <td className="py-3 px-3">
                            {isOpen && canManage && (
                              <div className="flex gap-1.5">
                                <button onClick={() => openResolve(c, "won")}
                                  className="flex items-center gap-1 px-2.5 py-1.5 bg-green/10 border border-green/20 text-green text-[10px] font-bold rounded-lg hover:bg-green/20 transition-all whitespace-nowrap">
                                  <Trophy size={10} /> Won
                                </button>
                                <button onClick={() => openResolve(c, "lost")}
                                  className="flex items-center gap-1 px-2.5 py-1.5 bg-red/10 border border-red/20 text-red text-[10px] font-bold rounded-lg hover:bg-red/20 transition-all whitespace-nowrap">
                                  <XCircle size={10} /> Lost
                                </button>
                                <button onClick={() => openResolve(c, "under_review")}
                                  className="flex items-center gap-1 px-2.5 py-1.5 bg-cyan/10 border border-cyan/20 text-cyan text-[10px] font-bold rounded-lg hover:bg-cyan/20 transition-all whitespace-nowrap">
                                  <RefreshCw size={10} /> Review
                                </button>
                              </div>
                            )}
                            {!isOpen && canManage && (
                              <button onClick={() => openResolve(c, c.status as any)}
                                className="text-[10px] px-2.5 py-1.5 border border-border text-textMuted rounded-lg hover:text-cyan hover:border-cyan/20 transition-all">
                                Edit
                              </button>
                            )}
                          </td>
                          {/* Expand */}
                          <td className="py-3 px-2">
                            <button onClick={() => setExpanded(isExpanded ? null : c.id)}
                              className="text-textDim hover:text-cyan transition-colors p-1 rounded">
                              {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                            </button>
                          </td>
                        </tr>

                        {/* Expanded detail row */}
                        {isExpanded && (
                          <tr className="bg-bg3/40 border-b border-border/30">
                            <td colSpan={8} className="px-4 py-4">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                  <p className="text-[10px] font-bold text-textDim uppercase tracking-widest mb-1">Chargeback ID</p>
                                  <p className="font-mono text-textMuted text-[10px] break-all">{c.id}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold text-textDim uppercase tracking-widest mb-1">Transaction ID</p>
                                  <p className="font-mono text-textMuted text-[10px] break-all">{c.transaction_id || "—"}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold text-textDim uppercase tracking-widest mb-1">Full Reason</p>
                                  <p className="text-textMuted text-xs">{c.reason}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold text-textDim uppercase tracking-widest mb-1">Logged</p>
                                  <p className="text-textMuted text-xs">{formatDate(c.created_at)}</p>
                                </div>
                                {c.resolution_note && (
                                  <div className="md:col-span-2">
                                    <p className="text-[10px] font-bold text-textDim uppercase tracking-widest mb-1">Resolution Note</p>
                                    <p className="text-textMuted text-xs italic">{c.resolution_note}</p>
                                  </div>
                                )}
                                <div>
                                  <p className="text-[10px] font-bold text-textDim uppercase tracking-widest mb-1">Last Updated</p>
                                  <p className="text-textMuted text-xs">{formatDate(c.updated_at)}</p>
                                </div>
                                {isOpen && canManage && (
                                  <div className="md:col-span-4 pt-2 border-t border-border/50 flex gap-2 flex-wrap">
                                    <button onClick={() => openResolve(c, "won")}
                                      className="flex items-center gap-1.5 px-4 py-2 bg-green/10 border border-green/20 text-green text-xs font-bold rounded-lg hover:bg-green/20 transition-all">
                                      <Trophy size={12} /> Mark Won
                                    </button>
                                    <button onClick={() => openResolve(c, "lost")}
                                      className="flex items-center gap-1.5 px-4 py-2 bg-red/10 border border-red/20 text-red text-xs font-bold rounded-lg hover:bg-red/20 transition-all">
                                      <XCircle size={12} /> Mark Lost
                                    </button>
                                    <button onClick={() => openResolve(c, "under_review")}
                                      className="flex items-center gap-1.5 px-4 py-2 bg-cyan/10 border border-cyan/20 text-cyan text-xs font-bold rounded-lg hover:bg-cyan/20 transition-all">
                                      <RefreshCw size={12} /> Move to Review
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* ── Permission notice ── */}
        {!canManage && (
          <div className="flex items-center gap-3 p-4 bg-bg2 border border-border rounded-xl">
            <Shield size={16} className="text-textDim flex-shrink-0" />
            <p className="text-textMuted text-sm">Read-only access. Finance, CFO or CEO required to log or resolve chargebacks.</p>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          RESOLVE MODAL
      ══════════════════════════════════════════════════════════════════ */}
      <Modal open={resolveModal} onClose={() => setResolveModal(false)} title="Update Chargeback">
        <div className="space-y-4">
          {/* Context */}
          <div className="p-3 bg-bg rounded-lg border border-border text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-textMuted">Customer</span>
              <span className="font-bold text-text">{selected?.user_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textMuted">Disputed Amount</span>
              <span className="font-black text-red">{selected && formatZAR(selected.amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textMuted">Reason</span>
              <span className="text-text max-w-[200px] text-right">{selected?.reason}</span>
            </div>
          </div>

          {/* Outcome */}
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-2">Outcome</label>
            <div className="flex gap-2">
              {([
                { val: "won",          label: "Won",          cls: "bg-green/10 border-green/30 text-green",   hov: "hover:bg-green/20" },
                { val: "lost",         label: "Lost",         cls: "bg-red/10 border-red/30 text-red",         hov: "hover:bg-red/20" },
                { val: "under_review", label: "Under Review", cls: "bg-cyan/10 border-cyan/30 text-cyan",      hov: "hover:bg-cyan/20" },
              ] as const).map(o => (
                <button key={o.val} onClick={() => setResolveStatus(o.val)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${
                    resolveStatus === o.val ? o.cls : `border-border text-textMuted ${o.hov}`
                  }`}>{o.label}</button>
              ))}
            </div>
          </div>

          {/* Amount recovered — only when Won */}
          {resolveStatus === "won" && (
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
                Amount Recovered (ZAR)
              </label>
              <Input
                type="number" step="0.01" min="0"
                placeholder={String(selected?.amount || "0.00")}
                value={resolveAmount}
                onChange={e => setResolveAmount(e.target.value)}
              />
              <p className="text-textDim text-[10px] mt-1">
                Partial recovery is valid. Defaults to full disputed amount.
              </p>
            </div>
          )}

          {/* Resolution note */}
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
              Resolution Note {resolveStatus === "under_review" ? "(bank timeline, evidence ref…)" : "(outcome details, bank ref…)"}
            </label>
            <Input
              placeholder={
                resolveStatus === "won"          ? "e.g. Evidence submitted to Stitch on 2024-06-10, dispute closed in our favour" :
                resolveStatus === "lost"         ? "e.g. Customer's bank sided with cardholder, R250 reversed" :
                "e.g. Awaiting bank decision, evidence submitted 2024-06-08"
              }
              value={resolveNote}
              onChange={e => setResolveNote(e.target.value)}
            />
          </div>

          <div className="flex gap-3 justify-end">
            <button onClick={() => setResolveModal(false)}
              className="px-4 py-2 text-xs text-textMuted hover:text-text border border-border rounded-lg transition-all">
              Cancel
            </button>
            <button onClick={submitResolve} disabled={resolving}
              className={`flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-lg border transition-all disabled:opacity-50 ${
                resolveStatus === "won"          ? "bg-green/10 border-green/30 text-green hover:bg-green/20" :
                resolveStatus === "lost"         ? "bg-red/10 border-red/30 text-red hover:bg-red/20" :
                "bg-cyan/10 border-cyan/30 text-cyan hover:bg-cyan/20"
              }`}>
              {resolving ? <Spinner /> : <CheckCircle2 size={13} />}
              Save Outcome
            </button>
          </div>
        </div>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════
          LOG NEW CHARGEBACK MODAL
      ══════════════════════════════════════════════════════════════════ */}
      <Modal open={logModal} onClose={closeLog} title="Log Chargeback from Bank">
        <div className="space-y-4">
          <div className="p-3 bg-red/5 border border-red/20 rounded-xl text-xs text-red flex gap-2">
            <AlertOctagon size={14} className="flex-shrink-0 mt-0.5" />
            <span>
              Use this when Stitch notifies TNR of a bank dispute. Log it here to start tracking and submit evidence.
              Chargebacks enter as <strong>Pending</strong> and must be resolved within the bank&apos;s window (typically 30–45 days).
            </span>
          </div>

          {/* User search */}
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Customer Phone / Name *</label>
            <div className="relative">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-textDim" />
              <Input placeholder="+27821234567 or full name…" value={logQuery} onChange={e => setLogQuery(e.target.value)} className="pl-8" />
            </div>
            {logUser.searching && <p className="text-textDim text-xs mt-1 flex items-center gap-1"><Spinner /> Searching…</p>}
            {logUser.user && !logUser.searching && (
              <div className="mt-1.5 px-3 py-2 bg-green/10 border border-green/20 rounded-lg flex items-center gap-2">
                <CheckCircle2 size={12} className="text-green flex-shrink-0" />
                <div>
                  <p className="text-green text-xs font-bold">{logUser.user.full_name}</p>
                  <p className="text-green/70 text-[10px] font-mono">{logUser.user.phone}</p>
                </div>
              </div>
            )}
            {logUser.notFound && !logUser.searching && logQuery.length >= 3 && (
              <p className="text-red text-xs mt-1 flex items-center gap-1"><AlertOctagon size={11} /> User not found</p>
            )}
          </div>

          {/* Transaction ID */}
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
              Transaction ID <span className="normal-case text-textDim font-normal">(optional — from Stitch notification)</span>
            </label>
            <Input placeholder="UUID of the original transaction…" value={logTxnId} onChange={e => setLogTxnId(e.target.value)} />
            <p className="text-textDim text-[10px] mt-1">Find in Support → user profile → Transactions tab, or in Stitch dashboard</p>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Disputed Amount (ZAR) *</label>
            <Input type="number" step="0.01" min="0.01" placeholder="0.00" value={logAmount} onChange={e => setLogAmount(e.target.value)} />
            <p className="text-textDim text-[10px] mt-1">Enter the amount the bank has put on hold</p>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-2">Reason *</label>
            <ReasonChips value={logReason} onChange={setLogReason} />
            <div className="mt-2">
              <Input placeholder="Or describe the dispute reason…" value={logReason} onChange={e => setLogReason(e.target.value)} />
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <button onClick={closeLog}
              className="px-4 py-2 text-xs text-textMuted hover:text-text border border-border rounded-lg transition-all">
              Cancel
            </button>
            <button onClick={submitLog}
              disabled={creating || !logUser.user || !logAmount || !logReason}
              className="flex items-center gap-2 px-5 py-2 bg-red/10 border border-red/30 text-red text-xs font-bold rounded-lg hover:bg-red/20 disabled:opacity-50 transition-all">
              {creating ? <Spinner /> : <PlusCircle size={13} />} Log Chargeback
            </button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
