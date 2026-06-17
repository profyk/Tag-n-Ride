"use client";
import { useEffect, useState, useMemo, useCallback, useRef, Fragment } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Spinner, Modal, Input } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  RotateCcw, CheckCircle2, XCircle, PlusCircle, Download,
  Search, X, RefreshCw, AlertCircle, Zap, Clock,
  ChevronDown, ChevronRight, AlertTriangle, Shield,
} from "lucide-react";
import toast from "react-hot-toast";
import { api, RefundRequest, hasPermission } from "@/lib/api";
import { DangerPinModal, useDangerPin } from "@/components/DangerPinModal";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authH = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

// ── Constants ──────────────────────────────────────────────────────────────
const REFUND_PRESETS = [
  "Driver no-show", "Duplicate charge", "Service not rendered",
  "Incorrect amount charged", "Cancelled ride charged", "Technical error", "Customer goodwill",
];
const REJECT_PRESETS = [
  "Ride completed successfully", "Service was rendered", "Amount not eligible",
  "Duplicate request", "Outside refund window", "Referred to dispute process",
];

// ── Age helpers ────────────────────────────────────────────────────────────
function getAge(ts: string) {
  const ms = Date.now() - new Date(ts).getTime();
  const m  = Math.floor(ms / 60000);
  const h  = Math.floor(m / 60);
  const d  = Math.floor(h / 24);
  const label = d > 0 ? `${d}d ${h % 24}h` : h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
  const urgency: "fresh" | "warn" | "danger" = h < 2 ? "fresh" : h < 24 ? "warn" : "danger";
  return { label, urgency, hours: h };
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
    <div className="w-8 h-8 rounded-full bg-cyan/10 border border-cyan/20 flex items-center justify-center font-black text-cyan text-[10px] flex-shrink-0">
      {ini}
    </div>
  );
}

// ── User search field ──────────────────────────────────────────────────────
function UserField({ value, onChange, result }: { value: string; onChange: (v: string) => void; result: ReturnType<typeof useUserSearch> }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Customer Phone / Name *</label>
      <div className="relative">
        <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-textDim" />
        <Input placeholder="+27821234567 or full name…" value={value} onChange={e => onChange(e.target.value)} className="pl-8" />
      </div>
      {result.searching && <p className="text-textDim text-xs mt-1 flex items-center gap-1"><Spinner /> Searching…</p>}
      {result.user && !result.searching && (
        <div className="mt-1.5 px-3 py-2 bg-green/10 border border-green/20 rounded-lg flex items-center gap-2">
          <CheckCircle2 size={12} className="text-green flex-shrink-0" />
          <div>
            <p className="text-green text-xs font-bold">{result.user.full_name}</p>
            <p className="text-green/70 text-[10px] font-mono">{result.user.phone}</p>
          </div>
        </div>
      )}
      {result.notFound && !result.searching && value.length >= 3 && (
        <p className="text-red text-xs mt-1 flex items-center gap-1"><AlertCircle size={11} /> User not found</p>
      )}
    </div>
  );
}

// ── Reason presets ─────────────────────────────────────────────────────────
function ReasonChips({ presets, value, onChange }: { presets: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {presets.map(p => (
        <button key={p} type="button" onClick={() => onChange(p)}
          className={`text-[10px] px-2 py-1 rounded-md border transition-all ${
            value === p ? "bg-cyan/10 text-cyan border-cyan/20" : "bg-bg3 text-textMuted border-border hover:text-text"
          }`}>{p}</button>
      ))}
    </div>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const cls = status === "approved" ? "bg-green/10 border-green/20 text-green"
            : status === "rejected" ? "bg-red/10 border-red/20 text-red"
            : "bg-yellow/10 border-yellow/20 text-yellow";
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded border capitalize ${cls}`}>{status}</span>;
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function RefundsPage() {
  // ── Data ────────────────────────────────────────────────────────────────
  const [refunds,        setRefunds]        = useState<RefundRequest[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [reserveBalance, setReserveBalance] = useState<number | null>(null);

  // ── UI state ────────────────────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [search,       setSearch]       = useState("");
  const [expanded,     setExpanded]     = useState<string | null>(null);
  const [countdown,    setCountdown]    = useState(30);

  // ── Action busy flags ────────────────────────────────────────────────────
  const [approving,  setApproving]  = useState<string | null>(null);
  const [rejecting,  setRejecting]  = useState(false);
  const [creating,   setCreating]   = useState(false);
  const [instanting, setInstanting] = useState(false);

  // ── Modals ───────────────────────────────────────────────────────────────
  const [selected,        setSelected]        = useState<RefundRequest | null>(null);
  const [rejectModal,     setRejectModal]     = useState(false);
  const [newRefundModal,  setNewRefundModal]  = useState(false);
  const [instantModal,    setInstantModal]    = useState(false);
  const [rejectReason,    setRejectReason]    = useState("");

  // ── New refund form ──────────────────────────────────────────────────────
  const [nrQuery,  setNrQuery]  = useState("");
  const [nrTxnId,  setNrTxnId]  = useState("");
  const [nrAmount, setNrAmount] = useState("");
  const [nrReason, setNrReason] = useState("");
  const nrUser = useUserSearch(nrQuery);

  // ── Instant refund form ──────────────────────────────────────────────────
  const [irQuery,  setIrQuery]  = useState("");
  const [irAmount, setIrAmount] = useState("");
  const [irReason, setIrReason] = useState("");
  const irUser = useUserSearch(irQuery);

  const dangerPin  = useDangerPin();
  const timerRef   = useRef<any>(null);

  const canCreate  = hasPermission("manage_refunds");
  const canApprove = hasPermission("process_refunds");
  const canInstant = hasPermission("process_refunds");

  // ── Load ─────────────────────────────────────────────────────────────────
  // Always load all refunds for accurate stats, filter client-side
  const load = useCallback(() => {
    setLoading(true);
    api.refunds()
      .then(r => setRefunds(r.data))
      .catch(e => toast.error(`Failed to load: ${e.message}`))
      .finally(() => setLoading(false));
  }, []);

  const loadReserve = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/admin/ledger`, { headers: authH() });
      if (!res.ok) return;
      const data = await res.json();
      const acc = data.accounts?.find((a: any) => a.account === "refund_reserve");
      if (acc) setReserveBalance(parseFloat(acc.balance));
    } catch {}
  }, []);

  useEffect(() => { load(); loadReserve(); }, [load]);

  // Auto-refresh every 30s (refunds are time-sensitive)
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown(c => { if (c <= 1) { load(); return 30; } return c - 1; });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [load]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const pending  = useMemo(() => refunds.filter(r => r.status === "pending"),  [refunds]);
  const approved = useMemo(() => refunds.filter(r => r.status === "approved"), [refunds]);
  const rejected = useMemo(() => refunds.filter(r => r.status === "rejected"), [refunds]);

  const pendingAmt   = useMemo(() => pending.reduce((s, r) => s + r.amount, 0), [pending]);
  const approvedAmt  = useMemo(() => approved.reduce((s, r) => s + r.amount, 0), [approved]);
  const stalePending = useMemo(() => pending.filter(r => getAge(r.created_at).urgency === "danger"), [pending]);
  const oldestPending = useMemo(() => [...pending].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0], [pending]);

  const filtered = useMemo(() => {
    let list = statusFilter === "all" ? refunds : refunds.filter(r => r.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.user_name.toLowerCase().includes(q) ||
        r.phone_number.includes(q) ||
        (r.txn_ref || "").toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q)
      );
    }
    return list;
  }, [refunds, statusFilter, search]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const approve = async (r: RefundRequest) => {
    const token = await dangerPin.request();
    if (!token) return;
    setApproving(r.id);
    try {
      const res = await api.approveRefund(r.id);
      toast.success(`Refund approved — Ref: ${res.data.reference}`);
      load(); loadReserve();
    } catch (e: any) { toast.error(e.message); }
    finally { setApproving(null); }
  };

  const reject = async () => {
    if (!rejectReason.trim()) { toast.error("Provide a rejection reason"); return; }
    setRejecting(true);
    try {
      await api.rejectRefund(selected!.id, rejectReason);
      toast.success("Refund rejected");
      setRejectModal(false); setRejectReason(""); load();
    } catch (e: any) { toast.error(e.message); }
    finally { setRejecting(false); }
  };

  const closeNewRefund = () => { setNewRefundModal(false); setNrQuery(""); setNrTxnId(""); setNrAmount(""); setNrReason(""); };

  const createRefundRequest = async () => {
    if (!nrUser.user?.id)                         { toast.error("User not found"); return; }
    if (!nrTxnId.trim())                          { toast.error("Transaction ID required"); return; }
    if (!nrAmount || parseFloat(nrAmount) <= 0)   { toast.error("Valid amount required"); return; }
    if (!nrReason.trim())                         { toast.error("Reason required"); return; }
    setCreating(true);
    try {
      await api.createRefund({ user_id: nrUser.user.id, transaction_id: nrTxnId.trim(), amount: parseFloat(nrAmount), reason: nrReason.trim() });
      toast.success("Refund request submitted — pending approval");
      closeNewRefund(); load();
    } catch (e: any) { toast.error(e.message); }
    finally { setCreating(false); }
  };

  const closeInstant = () => { setInstantModal(false); setIrQuery(""); setIrAmount(""); setIrReason(""); };

  const processInstantRefund = async () => {
    if (!irUser.user?.id)                       { toast.error("User not found"); return; }
    if (!irAmount || parseFloat(irAmount) <= 0) { toast.error("Valid amount required"); return; }
    if (!irReason.trim())                       { toast.error("Reason required"); return; }
    const token = await dangerPin.request();
    if (!token) return;
    setInstanting(true);
    try {
      const res = await fetch(`${BASE}/api/admin/ledger/refund`, {
        method: "POST", headers: authH(),
        body: JSON.stringify({ user_id: irUser.user.id, amount: parseFloat(irAmount), reason: irReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Instant refund failed");
      toast.success(`${formatZAR(parseFloat(irAmount))} credited to ${irUser.user.full_name}${data?.reference ? ` · Ref: ${data.reference}` : ""}`);
      closeInstant(); load(); loadReserve();
    } catch (e: any) { toast.error(e.message); }
    finally { setInstanting(false); }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AdminShell title="Refund Center">
      <div className="space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <p className="text-textMuted text-xs">
            Manage refund requests · Approve, reject or instant-credit customers · Full audit trail
          </p>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-textDim">Auto-refresh in {countdown}s</span>
            <button onClick={() => { load(); loadReserve(); setCountdown(30); }}
              className="text-textDim hover:text-cyan transition-colors">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* ── Stats strip ── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className={pending.length > 0 ? "border-yellow/30" : ""}>
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Pending</p>
            <p className={`text-3xl font-black tabular-nums ${pending.length > 0 ? "text-yellow" : "text-green"}`}>{pending.length}</p>
            <p className="text-textDim text-[10px] mt-1">{pending.length > 0 ? formatZAR(pendingAmt) + " queued" : "Queue clear ✓"}</p>
          </Card>

          <Card className={stalePending.length > 0 ? "border-red/30" : ""}>
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Overdue (&gt;24h)</p>
            <p className={`text-3xl font-black tabular-nums ${stalePending.length > 0 ? "text-red" : "text-green"}`}>{stalePending.length}</p>
            <p className="text-textDim text-[10px] mt-1">{stalePending.length > 0 ? "Action required" : "All on time ✓"}</p>
          </Card>

          <Card>
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Approved</p>
            <p className="text-3xl font-black text-green tabular-nums">{approved.length}</p>
            <p className="text-textDim text-[10px] mt-1">{formatZAR(approvedAmt)} returned</p>
          </Card>

          <Card>
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Rejected</p>
            <p className="text-3xl font-black text-red tabular-nums">{rejected.length}</p>
            <p className="text-textDim text-[10px] mt-1">In current view</p>
          </Card>

          <Card className={reserveBalance !== null && reserveBalance < 1000 ? "border-red/30" : "border-pink-400/20"}>
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Refund Reserve</p>
            {reserveBalance !== null ? (
              <>
                <p className={`text-2xl font-black tabular-nums ${reserveBalance < 1000 ? "text-red" : "text-pink-400"}`}>
                  {formatZAR(reserveBalance)}
                </p>
                <p className="text-textDim text-[10px] mt-1">{reserveBalance < 1000 ? "⚠ Low balance" : "Available"}</p>
              </>
            ) : (
              <p className="text-2xl font-black text-textDim">—</p>
            )}
          </Card>
        </div>

        {/* ── Overdue alert ── */}
        {stalePending.length > 0 && (
          <div className="flex items-center justify-between p-4 bg-red/5 border border-red/20 rounded-xl">
            <div className="flex items-center gap-3">
              <AlertTriangle size={16} className="text-red flex-shrink-0" />
              <div>
                <p className="text-red text-sm font-bold">
                  {stalePending.length} refund{stalePending.length !== 1 ? "s" : ""} overdue — waiting over 24 hours
                </p>
                <p className="text-textMuted text-xs">
                  Oldest: {oldestPending ? getAge(oldestPending.created_at).label + " ago" : "—"}
                  {" "}· Total at risk: {formatZAR(stalePending.reduce((s, r) => s + r.amount, 0))}
                </p>
              </div>
            </div>
            <button onClick={() => setStatusFilter("pending")}
              className="flex items-center gap-2 px-4 py-2 bg-red/10 border border-red/20 text-red text-xs font-bold rounded-lg hover:bg-red/20 transition-all whitespace-nowrap">
              Review Now →
            </button>
          </div>
        )}

        {/* ── Pending alert (light) — only show if not stale, not on pending tab ── */}
        {pending.length > 0 && stalePending.length === 0 && statusFilter !== "pending" && (
          <div className="flex items-center justify-between p-4 bg-yellow/5 border border-yellow/20 rounded-xl">
            <div className="flex items-center gap-3">
              <AlertCircle size={15} className="text-yellow flex-shrink-0" />
              <div>
                <p className="text-yellow text-sm font-bold">
                  {pending.length} refund{pending.length !== 1 ? "s" : ""} awaiting approval
                </p>
                <p className="text-textMuted text-xs">{formatZAR(pendingAmt)} to be returned to customers</p>
              </div>
            </div>
            <button onClick={() => setStatusFilter("pending")}
              className="flex items-center gap-2 px-4 py-2 bg-yellow/10 border border-yellow/20 text-yellow text-xs font-bold rounded-lg hover:bg-yellow/20 transition-all">
              <RotateCcw size={12} /> View Pending
            </button>
          </div>
        )}

        {/* ── Main queue card ── */}
        <Card>
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <RotateCcw size={15} className="text-cyan" />
              <h2 className="text-text font-bold text-sm">Refund Queue</h2>
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              {/* Search */}
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
              {canCreate && (
                <button onClick={() => setNewRefundModal(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-cyan/10 border border-cyan/20 text-cyan text-xs font-bold rounded-lg hover:bg-cyan/20 transition-all">
                  <PlusCircle size={12} /> New Request
                </button>
              )}
              {canInstant && (
                <button onClick={() => setInstantModal(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-red/10 border border-red/20 text-red text-xs font-bold rounded-lg hover:bg-red/20 transition-all">
                  <Zap size={12} /> Instant Refund
                </button>
              )}
              <button onClick={() => window.open(`${BASE}/api/admin/export/refunds`, "_blank")}
                className="flex items-center gap-1.5 px-3 py-2 text-xs text-textMuted hover:text-cyan border border-border rounded-lg transition-all">
                <Download size={12} /> Export
              </button>
            </div>
          </div>

          {/* Status tabs */}
          <div className="flex gap-1 mb-5 pb-4 border-b border-border overflow-x-auto">
            {([
              { key: "pending",  label: "Pending",  count: pending.length,  active: "bg-yellow/10 text-yellow border-yellow/20" },
              { key: "approved", label: "Approved", count: approved.length, active: "bg-green/10 text-green border-green/20" },
              { key: "rejected", label: "Rejected", count: rejected.length, active: "bg-red/10 text-red border-red/20" },
              { key: "all",      label: "All",      count: refunds.length,  active: "bg-cyanDim text-cyan border-cyan/20" },
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
            {loading ? "Loading…" : `${filtered.length} of ${refunds.length} refund${refunds.length !== 1 ? "s" : ""}${search ? ` matching "${search}"` : ""}`}
          </p>

          {loading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <RotateCcw size={32} className="mx-auto mb-3 text-textDim opacity-40" />
              <p className="text-textMuted text-sm font-medium">
                {search ? `No refunds matching "${search}"` : `No ${statusFilter !== "all" ? statusFilter : ""} refunds`}
              </p>
              {!search && statusFilter === "pending" && (
                <p className="text-green text-xs mt-2">Refund queue is clear ✓</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    {["Customer", "Transaction", "Amount", "Reason", "Age / Status", "Reviewed", "Actions", ""].map((h, i) => (
                      <th key={i} className="text-left py-2 px-3 text-textDim font-bold uppercase tracking-wider text-[10px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const age        = getAge(r.created_at);
                    const isExpanded = expanded === r.id;
                    return (
                      <Fragment key={r.id}>
                        <tr className={`border-b border-border/50 hover:bg-bg3/30 transition-colors ${isExpanded ? "bg-bg3/40" : ""}`}>
                          {/* Customer */}
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <Avatar name={r.user_name} />
                              <div>
                                <p className="font-semibold text-text text-xs leading-tight">{r.user_name}</p>
                                <p className="text-[10px] font-mono text-textMuted">{r.phone_number}</p>
                              </div>
                            </div>
                          </td>
                          {/* Transaction */}
                          <td className="py-3 px-3">
                            <p className="text-[10px] font-mono text-textMuted">
                              {r.txn_ref || (r.transaction_id ? r.transaction_id.slice(0, 10) + "…" : "—")}
                            </p>
                            {r.txn_type && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan/10 text-cyan border border-cyan/20">{r.txn_type}</span>
                            )}
                          </td>
                          {/* Amount */}
                          <td className="py-3 px-3">
                            <p className="font-black text-red text-sm tabular-nums">{formatZAR(r.amount)}</p>
                          </td>
                          {/* Reason */}
                          <td className="py-3 px-3 max-w-[140px]">
                            <p className="text-textMuted text-xs truncate" title={r.reason}>{r.reason}</p>
                          </td>
                          {/* Age / Status */}
                          <td className="py-3 px-3">
                            {r.status === "pending" ? (
                              <div className="space-y-1">
                                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border ${AGE_CLS[age.urgency]}`}>
                                  <Clock size={9} /> {age.label} ago
                                </span>
                                <div><StatusBadge status="pending" /></div>
                              </div>
                            ) : (
                              <StatusBadge status={r.status} />
                            )}
                          </td>
                          {/* Reviewed */}
                          <td className="py-3 px-3">
                            {r.reviewed_at
                              ? <p className="text-textDim text-[10px]">{formatDate(r.reviewed_at)}</p>
                              : <p className="text-textDim text-[10px]">—</p>}
                            {r.resolution_note && (
                              <p className="text-textDim text-[10px] italic truncate max-w-[100px]" title={r.resolution_note}>
                                {r.resolution_note}
                              </p>
                            )}
                          </td>
                          {/* Actions */}
                          <td className="py-3 px-3">
                            {r.status === "pending" && (
                              <div className="flex gap-1.5">
                                {canApprove && (
                                  <button onClick={() => approve(r)} disabled={!!approving}
                                    className="flex items-center gap-1 px-2.5 py-1.5 bg-green/10 border border-green/20 text-green text-[10px] font-bold rounded-lg hover:bg-green/20 disabled:opacity-40 transition-all whitespace-nowrap">
                                    {approving === r.id
                                      ? <RefreshCw size={10} className="animate-spin" />
                                      : <CheckCircle2 size={10} />} Approve
                                  </button>
                                )}
                                <button
                                  onClick={() => { setSelected(r); setRejectReason(""); setRejectModal(true); }}
                                  disabled={!!approving}
                                  className="flex items-center gap-1 px-2.5 py-1.5 bg-red/10 border border-red/20 text-red text-[10px] font-bold rounded-lg hover:bg-red/20 disabled:opacity-40 transition-all whitespace-nowrap">
                                  <XCircle size={10} /> Reject
                                </button>
                              </div>
                            )}
                          </td>
                          {/* Expand toggle */}
                          <td className="py-3 px-2">
                            <button onClick={() => setExpanded(isExpanded ? null : r.id)}
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
                                  <p className="text-[10px] font-bold text-textDim uppercase tracking-widest mb-1">Refund ID</p>
                                  <p className="font-mono text-textMuted text-[10px] break-all">{r.id}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold text-textDim uppercase tracking-widest mb-1">Transaction ID</p>
                                  <p className="font-mono text-textMuted text-[10px] break-all">{r.transaction_id || "—"}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold text-textDim uppercase tracking-widest mb-1">Full Reason</p>
                                  <p className="text-textMuted text-xs">{r.reason}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold text-textDim uppercase tracking-widest mb-1">Submitted</p>
                                  <p className="text-textMuted text-xs">{formatDate(r.created_at)}</p>
                                </div>
                                {r.resolution_note && (
                                  <div className="md:col-span-2">
                                    <p className="text-[10px] font-bold text-textDim uppercase tracking-widest mb-1">Resolution Note</p>
                                    <p className="text-textMuted text-xs italic">{r.resolution_note}</p>
                                  </div>
                                )}
                                {r.reviewed_at && (
                                  <div>
                                    <p className="text-[10px] font-bold text-textDim uppercase tracking-widest mb-1">Reviewed At</p>
                                    <p className="text-textMuted text-xs">{formatDate(r.reviewed_at)}</p>
                                  </div>
                                )}
                                {r.status === "pending" && (
                                  <div className="md:col-span-4 pt-2 border-t border-border/50 flex gap-2">
                                    {canApprove && (
                                      <button onClick={() => approve(r)} disabled={!!approving}
                                        className="flex items-center gap-1.5 px-4 py-2 bg-green/10 border border-green/20 text-green text-xs font-bold rounded-lg hover:bg-green/20 disabled:opacity-40 transition-all">
                                        {approving === r.id ? <Spinner /> : <CheckCircle2 size={12} />} Approve Refund
                                      </button>
                                    )}
                                    <button onClick={() => { setSelected(r); setRejectReason(""); setRejectModal(true); }}
                                      disabled={!!approving}
                                      className="flex items-center gap-1.5 px-4 py-2 bg-red/10 border border-red/20 text-red text-xs font-bold rounded-lg hover:bg-red/20 disabled:opacity-40 transition-all">
                                      <XCircle size={12} /> Reject Refund
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
        {!canCreate && !canApprove && (
          <div className="flex items-center gap-3 p-4 bg-bg2 border border-border rounded-xl">
            <Shield size={16} className="text-textDim flex-shrink-0" />
            <p className="text-textMuted text-sm">
              You have read-only access to refunds. Contact a Finance, CFO or CEO admin to process refunds.
            </p>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          REJECT MODAL
      ══════════════════════════════════════════════════════════════════ */}
      <Modal open={rejectModal} onClose={() => setRejectModal(false)} title="Reject Refund">
        <div className="space-y-4">
          <div className="p-3 bg-bg rounded-lg border border-border text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-textMuted">Customer</span>
              <span className="font-bold text-text">{selected?.user_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textMuted">Amount</span>
              <span className="font-black text-red">{selected && formatZAR(selected.amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-textMuted">Reason</span>
              <span className="text-text max-w-[180px] text-right truncate">{selected?.reason}</span>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-2">
              Rejection Reason *
            </label>
            <ReasonChips presets={REJECT_PRESETS} value={rejectReason} onChange={setRejectReason} />
            <div className="mt-2">
              <Input placeholder="Or type a custom reason…" value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <button onClick={() => setRejectModal(false)}
              className="px-4 py-2 text-xs text-textMuted hover:text-text border border-border rounded-lg transition-all">
              Cancel
            </button>
            <button onClick={reject} disabled={rejecting || !rejectReason.trim()}
              className="flex items-center gap-2 px-5 py-2 bg-red/10 border border-red/30 text-red text-xs font-bold rounded-lg hover:bg-red/20 disabled:opacity-50 transition-all">
              {rejecting ? <Spinner /> : <XCircle size={13} />} Reject Refund
            </button>
          </div>
        </div>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════
          NEW REFUND REQUEST MODAL
      ══════════════════════════════════════════════════════════════════ */}
      <Modal open={newRefundModal} onClose={closeNewRefund} title="New Refund Request">
        <div className="space-y-4">
          <div className="p-3 bg-cyan/5 border border-cyan/20 rounded-xl text-xs text-cyan">
            Creates a pending request that enters the approval queue. Finance, CFO or CEO must approve before funds are released.
          </div>

          <UserField value={nrQuery} onChange={setNrQuery} result={nrUser} />

          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Transaction ID *</label>
            <Input placeholder="UUID of the transaction to refund…" value={nrTxnId} onChange={e => setNrTxnId(e.target.value)} />
            <p className="text-textDim text-[10px] mt-1">Find in Support → user profile → Transactions tab</p>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Amount (ZAR) *</label>
            <Input type="number" step="0.01" min="0.01" placeholder="0.00" value={nrAmount} onChange={e => setNrAmount(e.target.value)} />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-2">Reason *</label>
            <ReasonChips presets={REFUND_PRESETS} value={nrReason} onChange={setNrReason} />
            <div className="mt-2">
              <Input placeholder="Or describe the reason…" value={nrReason} onChange={e => setNrReason(e.target.value)} />
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <button onClick={closeNewRefund}
              className="px-4 py-2 text-xs text-textMuted hover:text-text border border-border rounded-lg transition-all">
              Cancel
            </button>
            <button onClick={createRefundRequest}
              disabled={creating || !nrUser.user || !nrTxnId || !nrAmount || !nrReason}
              className="flex items-center gap-2 px-5 py-2 bg-cyanDim border border-cyan/30 text-cyan text-xs font-bold rounded-lg hover:bg-cyan/20 disabled:opacity-50 transition-all">
              {creating ? <Spinner /> : <PlusCircle size={13} />} Submit Request
            </button>
          </div>
        </div>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════
          INSTANT REFUND MODAL
      ══════════════════════════════════════════════════════════════════ */}
      <Modal open={instantModal} onClose={closeInstant} title="Instant Refund">
        <div className="space-y-4">
          <div className="p-3 bg-red/5 border border-red/20 rounded-xl text-xs text-red flex items-start gap-2">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <span>
              Immediately credits the customer wallet from the refund reserve — no approval queue.
              Requires danger PIN. Finance, CFO or CEO only.
              {reserveBalance !== null && (
                <span className="block mt-1 font-bold">
                  Reserve available: {formatZAR(reserveBalance)}
                </span>
              )}
            </span>
          </div>

          <UserField value={irQuery} onChange={setIrQuery} result={irUser} />

          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Amount (ZAR) *</label>
            <Input type="number" step="0.01" min="0.01" placeholder="0.00" value={irAmount} onChange={e => setIrAmount(e.target.value)} />
            {irAmount && reserveBalance !== null && parseFloat(irAmount) > reserveBalance && (
              <p className="text-red text-[10px] mt-1 flex items-center gap-1">
                <AlertTriangle size={10} /> Amount exceeds refund reserve balance
              </p>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-2">Reason *</label>
            <ReasonChips presets={REFUND_PRESETS} value={irReason} onChange={setIrReason} />
            <div className="mt-2">
              <Input placeholder="Or describe the reason…" value={irReason} onChange={e => setIrReason(e.target.value)} />
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <button onClick={closeInstant}
              className="px-4 py-2 text-xs text-textMuted hover:text-text border border-border rounded-lg transition-all">
              Cancel
            </button>
            <button onClick={processInstantRefund}
              disabled={instanting || !irUser.user || !irAmount || !irReason}
              className="flex items-center gap-2 px-5 py-2 bg-red/10 border border-red/30 text-red text-xs font-bold rounded-lg hover:bg-red/20 disabled:opacity-50 transition-all">
              {instanting ? <Spinner /> : <Zap size={13} />} Process Now
            </button>
          </div>
        </div>
      </Modal>

      <DangerPinModal
        open={dangerPin.open}
        onSuccess={dangerPin.handleSuccess}
        onCancel={dangerPin.handleCancel}
        actionLabel="process this refund"
      />
    </AdminShell>
  );
}
