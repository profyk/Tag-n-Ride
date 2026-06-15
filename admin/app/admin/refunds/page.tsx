"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Spinner, Modal, Input, StatCard } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  RotateCcw, CheckCircle, XCircle, PlusCircle, Download,
  Search, X, RefreshCw, AlertCircle, Zap,
} from "lucide-react";
import toast from "react-hot-toast";
import { api, RefundRequest, hasPermission } from "@/lib/api";
import { DangerPinModal, useDangerPin } from "@/components/DangerPinModal";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authH = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

const STATUS_TONE: Record<string, "yellow" | "green" | "red"> = {
  pending: "yellow", approved: "green", rejected: "red",
};

const REFUND_REASON_PRESETS = [
  "Driver no-show",
  "Duplicate charge",
  "Service not rendered",
  "Incorrect amount charged",
  "Cancelled ride charged",
  "Technical error",
  "Customer goodwill",
];

const REJECT_PRESETS = [
  "Ride completed successfully",
  "Service was rendered",
  "Amount not eligible",
  "Duplicate request",
  "Outside refund window",
  "Referred to dispute process",
];

function useUserSearch(query: string) {
  const [searching, setSearching] = useState(false);
  const [user, setUser] = useState<{ id: string; full_name: string; phone: string } | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (query.length < 3) { setUser(null); setNotFound(false); return; }
    setSearching(true);
    setNotFound(false);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `${BASE}/api/admin/support/user/${encodeURIComponent(query)}`,
          { headers: authH() }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.user?.id) {
            setUser({ id: data.user.id, full_name: data.user.full_name, phone: data.user.phone_number });
            setNotFound(false);
          } else {
            setUser(null); setNotFound(true);
          }
        } else {
          setUser(null); setNotFound(true);
        }
      } catch { setUser(null); setNotFound(true); }
      finally { setSearching(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [query]);

  return { searching, user, notFound };
}

export default function RefundsPage() {
  const [refunds, setRefunds] = useState<RefundRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [search, setSearch] = useState("");

  // Action loading states
  const [approving, setApproving] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [instanting, setInstanting] = useState(false);

  // Modals
  const [selected, setSelected] = useState<RefundRequest | null>(null);
  const [rejectModal, setRejectModal] = useState(false);
  const [newRefundModal, setNewRefundModal] = useState(false);
  const [instantModal, setInstantModal] = useState(false);

  // Reject form
  const [rejectReason, setRejectReason] = useState("");

  // New refund request form
  const [nrQuery, setNrQuery] = useState("");
  const [nrTxnId, setNrTxnId] = useState("");
  const [nrAmount, setNrAmount] = useState("");
  const [nrReason, setNrReason] = useState("");
  const nrUser = useUserSearch(nrQuery);

  // Instant refund form
  const [irQuery, setIrQuery] = useState("");
  const [irAmount, setIrAmount] = useState("");
  const [irReason, setIrReason] = useState("");
  const irUser = useUserSearch(irQuery);

  const dangerPin = useDangerPin();

  const canCreate = hasPermission("manage_refunds");
  const canApprove = hasPermission("process_refunds");
  const canInstant = hasPermission("process_refunds");

  const load = useCallback(() => {
    setLoading(true);
    api.refunds(statusFilter === "all" ? undefined : statusFilter)
      .then(r => setRefunds(r.data))
      .catch(e => toast.error(`Failed to load: ${e.message}`))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return refunds;
    const q = search.toLowerCase();
    return refunds.filter(r =>
      r.user_name.toLowerCase().includes(q) ||
      r.phone_number.includes(q) ||
      (r.txn_ref || "").toLowerCase().includes(q) ||
      r.reason.toLowerCase().includes(q)
    );
  }, [refunds, search]);

  const pending = refunds.filter(r => r.status === "pending");
  const approved = refunds.filter(r => r.status === "approved");
  const rejected = refunds.filter(r => r.status === "rejected");
  const pendingAmt = pending.reduce((s, r) => s + r.amount, 0);
  const approvedAmt = approved.reduce((s, r) => s + r.amount, 0);

  const approve = async (r: RefundRequest) => {
    const token = await dangerPin.request();
    if (!token) return;
    setApproving(r.id);
    try {
      const res = await api.approveRefund(r.id);
      toast.success(`Refund approved — Ref: ${res.data.reference}`);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setApproving(null); }
  };

  const reject = async () => {
    if (!rejectReason.trim()) { toast.error("Provide a rejection reason"); return; }
    setRejecting(true);
    try {
      await api.rejectRefund(selected!.id, rejectReason);
      toast.success("Refund rejected");
      setRejectModal(false);
      setRejectReason("");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setRejecting(false); }
  };

  const closeNewRefund = () => {
    setNewRefundModal(false);
    setNrQuery(""); setNrTxnId(""); setNrAmount(""); setNrReason("");
  };

  const createRefundRequest = async () => {
    if (!nrUser.user?.id) { toast.error("User not found"); return; }
    if (!nrTxnId.trim()) { toast.error("Transaction ID required"); return; }
    if (!nrAmount || parseFloat(nrAmount) <= 0) { toast.error("Valid amount required"); return; }
    if (!nrReason.trim()) { toast.error("Reason required"); return; }
    setCreating(true);
    try {
      await api.createRefund({
        user_id: nrUser.user.id,
        transaction_id: nrTxnId.trim(),
        amount: parseFloat(nrAmount),
        reason: nrReason.trim(),
      });
      toast.success("Refund request submitted — pending approval");
      closeNewRefund();
      if (statusFilter === "pending" || statusFilter === "all") load();
    } catch (e: any) { toast.error(e.message); }
    finally { setCreating(false); }
  };

  const closeInstant = () => {
    setInstantModal(false);
    setIrQuery(""); setIrAmount(""); setIrReason("");
  };

  const processInstantRefund = async () => {
    if (!irUser.user?.id) { toast.error("User not found"); return; }
    if (!irAmount || parseFloat(irAmount) <= 0) { toast.error("Valid amount required"); return; }
    if (!irReason.trim()) { toast.error("Reason required"); return; }
    const token = await dangerPin.request();
    if (!token) return;
    setInstanting(true);
    try {
      const res = await fetch(`${BASE}/api/admin/ledger/refund`, {
        method: "POST",
        headers: authH(),
        body: JSON.stringify({
          user_id: irUser.user.id,
          amount: parseFloat(irAmount),
          reason: irReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Instant refund failed");
      toast.success(
        `R${parseFloat(irAmount).toFixed(2)} credited to ${irUser.user.full_name}` +
        (data?.reference ? ` · Ref: ${data.reference}` : "")
      );
      closeInstant();
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setInstanting(false); }
  };

  return (
    <AdminShell title="Refund Center">
      <div className="space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Pending Refunds"
            value={String(pending.length)}
            tone={pending.length > 0 ? "yellow" : "green"}
            sub={pending.length > 0 ? `${formatZAR(pendingAmt)} queued` : "Queue clear"}
          />
          <StatCard
            label="Approved"
            value={String(approved.length)}
            tone="green"
            sub={`${formatZAR(approvedAmt)} returned`}
          />
          <StatCard
            label="Rejected"
            value={String(rejected.length)}
            tone="red"
          />
          <StatCard
            label="Total in View"
            value={String(refunds.length)}
            tone="cyan"
          />
        </div>

        {/* Pending alert banner */}
        {pending.length > 0 && statusFilter !== "pending" && (
          <div className="flex items-center justify-between p-4 bg-yellow/5 border border-yellow/20 rounded-xl">
            <div className="flex items-center gap-3">
              <AlertCircle size={15} className="text-yellow flex-shrink-0" />
              <div>
                <p className="text-yellow text-sm font-bold">
                  {pending.length} refund{pending.length !== 1 ? "s" : ""} awaiting approval
                </p>
                <p className="text-textMuted text-xs">{formatZAR(pendingAmt)} pending to be returned</p>
              </div>
            </div>
            <Button variant="secondary" onClick={() => setStatusFilter("pending")}>
              <RotateCcw size={13} /> View Pending
            </Button>
          </div>
        )}

        <Card>
          {/* Header */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <RotateCcw size={16} className="text-cyan" />
              <h2 className="text-text font-bold">Refund Queue</h2>
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-textDim" />
                <input
                  placeholder="Name, phone, txn ref, reason..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="bg-bg border border-border rounded-lg pl-8 pr-8 py-2 text-text text-sm focus:outline-none focus:border-cyan placeholder:text-textDim w-56"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-textDim hover:text-text">
                    <X size={12} />
                  </button>
                )}
              </div>

              <Button variant="secondary" onClick={load}>
                <RefreshCw size={13} /> Refresh
              </Button>

              {canCreate && (
                <Button variant="secondary" onClick={() => setNewRefundModal(true)}>
                  <PlusCircle size={13} /> New Request
                </Button>
              )}

              {canInstant && (
                <Button variant="danger" onClick={() => setInstantModal(true)}>
                  <Zap size={13} /> Instant Refund
                </Button>
              )}

              <Button
                variant="secondary"
                onClick={() => window.open(`${BASE}/api/admin/export/refunds`, "_blank")}
              >
                <Download size={13} /> Export
              </Button>
            </div>
          </div>

          {/* Status filter tabs */}
          <div className="flex gap-1 mb-4 border-b border-border pb-3 flex-wrap">
            {(["pending", "approved", "rejected", "all"] as const).map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold border transition-all capitalize ${
                  statusFilter === f
                    ? f === "pending"
                      ? "bg-yellow/10 text-yellow border-yellow/20"
                      : f === "approved"
                      ? "bg-green/10 text-green border-green/20"
                      : f === "rejected"
                      ? "bg-red/10 text-red border-red/20"
                      : "bg-cyanDim text-cyan border-cyan/20"
                    : "bg-bg3 text-textMuted border-border hover:text-text"
                }`}
              >
                {f === "pending" ? `Pending (${pending.length})` :
                 f === "approved" ? `Approved (${approved.length})` :
                 f === "rejected" ? `Rejected (${rejected.length})` :
                 `All (${refunds.length})`}
              </button>
            ))}
          </div>

          <p className="text-xs text-textMuted mb-3">
            {loading
              ? "Loading…"
              : `${filtered.length} of ${refunds.length} refund${refunds.length !== 1 ? "s" : ""}`
              + (search ? ` matching "${search}"` : "")}
          </p>

          {loading ? (
            <Spinner />
          ) : filtered.length === 0 ? (
            <div className="py-14 text-center text-textMuted">
              <RotateCcw size={28} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">
                {search ? "No refunds match your search" : `No ${statusFilter !== "all" ? statusFilter : ""} refunds`}
              </p>
              {!search && statusFilter === "pending" && (
                <p className="text-xs mt-1 text-green">Refund queue is clear</p>
              )}
            </div>
          ) : (
            <Table
              headers={["Customer", "Transaction", "Amount", "Reason", "Status", "Reviewed", "Actions"]}
              empty={false}
            >
              {filtered.map(r => (
                <Tr key={r.id}>
                  <Td>
                    <p className="font-semibold">{r.user_name}</p>
                    <p className="text-[10px] text-textMuted font-mono">{r.phone_number}</p>
                  </Td>
                  <Td>
                    <p className="text-[10px] font-mono text-textMuted">
                      {r.txn_ref || (r.transaction_id ? r.transaction_id.slice(0, 8) + "…" : "—")}
                    </p>
                    {r.txn_type && <Badge label={r.txn_type} tone="cyan" />}
                  </Td>
                  <Td className="font-bold text-red">{formatZAR(r.amount)}</Td>
                  <Td className="text-textMuted text-xs max-w-[160px]">
                    <span className="block truncate" title={r.reason}>{r.reason}</span>
                  </Td>
                  <Td><Badge label={r.status} tone={STATUS_TONE[r.status] || "muted"} /></Td>
                  <Td className="text-xs">
                    {r.reviewed_at
                      ? <span className="text-textMuted text-[10px]">{formatDate(r.reviewed_at)}</span>
                      : <span className="text-textDim text-[10px]">Pending</span>}
                    {r.resolution_note && (
                      <p className="text-[10px] text-textDim italic mt-0.5 max-w-[120px] truncate" title={r.resolution_note}>
                        {r.resolution_note}
                      </p>
                    )}
                  </Td>
                  <Td>
                    {r.status === "pending" ? (
                      <div className="flex gap-1.5 flex-wrap">
                        {canApprove && (
                          <Button onClick={() => approve(r)} disabled={approving === r.id}>
                            {approving === r.id
                              ? <RefreshCw size={12} className="animate-spin" />
                              : <CheckCircle size={12} />}
                            Approve
                          </Button>
                        )}
                        <Button
                          variant="danger"
                          onClick={() => { setSelected(r); setRejectReason(""); setRejectModal(true); }}
                          disabled={!!approving}
                        >
                          <XCircle size={12} /> Reject
                        </Button>
                      </div>
                    ) : (
                      <span className="text-[10px] text-textDim">—</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      {/* ── New Refund Request Modal ── */}
      <Modal open={newRefundModal} onClose={closeNewRefund} title="New Refund Request">
        <div className="space-y-4">
          <div className="p-3 bg-cyan/5 border border-cyan/20 rounded-xl text-xs text-cyan">
            Creates a pending request. Requires approval by finance before the customer is credited.
          </div>

          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
              Customer Phone / Name *
            </label>
            <Input
              placeholder="+27821234567 or full name..."
              value={nrQuery}
              onChange={e => setNrQuery(e.target.value)}
            />
            {nrUser.searching && <p className="text-textDim text-xs mt-1">Searching…</p>}
            {nrUser.user && !nrUser.searching && (
              <div className="mt-1.5 px-3 py-2 bg-green/10 border border-green/20 rounded-lg flex items-center gap-2">
                <CheckCircle size={12} className="text-green" />
                <span className="text-green text-xs font-bold">Found: {nrUser.user.full_name}</span>
              </div>
            )}
            {nrUser.notFound && !nrUser.searching && nrQuery.length >= 3 && (
              <p className="text-red text-xs mt-1 flex items-center gap-1">
                <AlertCircle size={11} /> User not found
              </p>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
              Transaction ID *
            </label>
            <Input
              placeholder="UUID of the transaction to refund..."
              value={nrTxnId}
              onChange={e => setNrTxnId(e.target.value)}
            />
            <p className="text-textDim text-[10px] mt-1">Find this in Support → Transactions tab → Copy Reference</p>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
              Amount (ZAR) *
            </label>
            <Input
              type="number" step="0.01" min="0.01" placeholder="0.00"
              value={nrAmount}
              onChange={e => setNrAmount(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
              Reason *
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {REFUND_REASON_PRESETS.map(p => (
                <button key={p} onClick={() => setNrReason(p)}
                  className={`text-[10px] px-2 py-1 rounded-md border transition-all ${
                    nrReason === p
                      ? "bg-cyan/10 text-cyan border-cyan/20"
                      : "bg-bg3 text-textMuted border-border hover:text-text"
                  }`}>
                  {p}
                </button>
              ))}
            </div>
            <Input
              placeholder="Reason for refund..."
              value={nrReason}
              onChange={e => setNrReason(e.target.value)}
            />
          </div>

          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={closeNewRefund}>Cancel</Button>
            <Button
              onClick={createRefundRequest}
              disabled={creating || !nrUser.user || !nrTxnId || !nrAmount || !nrReason}
            >
              {creating
                ? <RefreshCw size={13} className="animate-spin" />
                : <PlusCircle size={13} />}
              Submit Request
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Instant Refund Modal ── */}
      <Modal open={instantModal} onClose={closeInstant} title="Instant Refund">
        <div className="space-y-4">
          <div className="p-3 bg-red/5 border border-red/20 rounded-xl text-xs text-red flex items-start gap-2">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <span>
              Immediately credits the customer wallet from the refund reserve.
              Bypasses the approval queue. Requires danger PIN. Finance / CFO / CEO only.
            </span>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
              Customer Phone / Name *
            </label>
            <Input
              placeholder="+27821234567 or full name..."
              value={irQuery}
              onChange={e => setIrQuery(e.target.value)}
            />
            {irUser.searching && <p className="text-textDim text-xs mt-1">Searching…</p>}
            {irUser.user && !irUser.searching && (
              <div className="mt-1.5 px-3 py-2 bg-green/10 border border-green/20 rounded-lg flex items-center gap-2">
                <CheckCircle size={12} className="text-green" />
                <span className="text-green text-xs font-bold">Found: {irUser.user.full_name}</span>
              </div>
            )}
            {irUser.notFound && !irUser.searching && irQuery.length >= 3 && (
              <p className="text-red text-xs mt-1 flex items-center gap-1">
                <AlertCircle size={11} /> User not found
              </p>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
              Amount (ZAR) *
            </label>
            <Input
              type="number" step="0.01" min="0.01" placeholder="0.00"
              value={irAmount}
              onChange={e => setIrAmount(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
              Reason *
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {REFUND_REASON_PRESETS.map(p => (
                <button key={p} onClick={() => setIrReason(p)}
                  className={`text-[10px] px-2 py-1 rounded-md border transition-all ${
                    irReason === p
                      ? "bg-cyan/10 text-cyan border-cyan/20"
                      : "bg-bg3 text-textMuted border-border hover:text-text"
                  }`}>
                  {p}
                </button>
              ))}
            </div>
            <Input
              placeholder="Reason for refund..."
              value={irReason}
              onChange={e => setIrReason(e.target.value)}
            />
          </div>

          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={closeInstant}>Cancel</Button>
            <Button
              variant="danger"
              onClick={processInstantRefund}
              disabled={instanting || !irUser.user || !irAmount || !irReason}
            >
              {instanting
                ? <RefreshCw size={13} className="animate-spin" />
                : <Zap size={13} />}
              Process Now
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Reject Modal ── */}
      <Modal open={rejectModal} onClose={() => setRejectModal(false)} title="Reject Refund">
        <div className="space-y-4">
          <p className="text-sm text-textMuted">
            Rejecting refund of{" "}
            <span className="text-red font-bold">{selected && formatZAR(selected.amount)}</span>{" "}
            for <span className="font-bold text-text">{selected?.user_name}</span>.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {REJECT_PRESETS.map(p => (
              <button key={p} onClick={() => setRejectReason(p)}
                className={`text-[10px] px-2 py-1 rounded-md border transition-all ${
                  rejectReason === p
                    ? "bg-red/10 text-red border-red/20"
                    : "bg-bg3 text-textMuted border-border hover:text-text"
                }`}>
                {p}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
              Rejection Reason *
            </label>
            <Input
              placeholder="Reason for rejection..."
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
            />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setRejectModal(false)}>Cancel</Button>
            <Button variant="danger" onClick={reject} disabled={rejecting || !rejectReason.trim()}>
              {rejecting
                ? <RefreshCw size={13} className="animate-spin" />
                : <XCircle size={13} />}
              Reject Refund
            </Button>
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
