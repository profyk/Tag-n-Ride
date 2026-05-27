"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Spinner, Modal, Input, StatCard } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import { RotateCcw, CheckCircle, XCircle } from "lucide-react";
import toast from "react-hot-toast";
import { api, RefundRequest } from "@/lib/api";
import { DangerPinModal, useDangerPin } from "@/components/DangerPinModal";

const STATUS_TONE: Record<string, "yellow" | "green" | "red"> = {
  pending: "yellow", approved: "green", rejected: "red",
};

export default function RefundsPage() {
  const [refunds, setRefunds] = useState<RefundRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [selected, setSelected] = useState<RefundRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectModal, setRejectModal] = useState(false);
  const dangerPin = useDangerPin();

  const load = () => {
    setLoading(true);
    api.refunds(filter === "all" ? undefined : filter)
      .then((r) => setRefunds(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filter]);

  const approve = async (r: RefundRequest) => {
    const token = await dangerPin.request();
    if (!token) return;
    try {
      const res = await api.approveRefund(r.id);
      toast.success(`Refund approved — Ref: ${res.data.reference}`);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const reject = async () => {
    if (!rejectReason.trim()) { toast.error("Provide a rejection reason"); return; }
    try {
      await api.rejectRefund(selected!.id, rejectReason);
      toast.success("Refund rejected");
      setRejectModal(false);
      setRejectReason("");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const pending = refunds.filter((r) => r.status === "pending").length;
  const approved = refunds.filter((r) => r.status === "approved").length;
  const totalAmount = refunds.filter((r) => r.status === "pending").reduce((s, r) => s + r.amount, 0);

  return (
    <AdminShell title="Refund Requests">
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Pending Refunds" value={String(pending)} />
          <StatCard label="Approved" value={String(approved)} />
          <StatCard label="Pending Amount" value={formatZAR(totalAmount)} />
          <StatCard label="Rejected" value={String(refunds.filter((r) => r.status === "rejected").length)} />
        </div>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <RotateCcw size={16} className="text-cyan" />
              <h2 className="text-text font-bold">Refund Queue</h2>
            </div>
            <div className="flex gap-2">
              {(["all", "pending", "approved", "rejected"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded-full text-xs font-bold border transition-all capitalize ${filter === f ? "bg-cyanDim text-cyan border-cyan/20" : "bg-bg2 text-textMuted border-border hover:text-text"}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          {loading ? <Spinner /> : (
            <Table
              headers={["User", "Txn", "Amount", "Reason", "Status", "Date", "Actions"]}
              empty={!refunds.length}
            >
              {refunds.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <p className="font-semibold">{r.user_name}</p>
                    <p className="text-[10px] text-textMuted font-mono">{r.phone_number}</p>
                  </Td>
                  <Td className="text-[10px] font-mono text-textMuted">{r.txn_ref || r.transaction_id?.slice(0, 8) + "…"}</Td>
                  <Td className="font-bold text-red">{formatZAR(r.amount)}</Td>
                  <Td className="text-textMuted text-xs max-w-[160px] truncate">{r.reason}</Td>
                  <Td><Badge label={r.status} tone={STATUS_TONE[r.status] || "muted"} /></Td>
                  <Td className="text-textMuted text-xs">{formatDate(r.created_at)}</Td>
                  <Td>
                    {r.status === "pending" && (
                      <div className="flex gap-2">
                        <Button onClick={() => approve(r)}>
                          <CheckCircle size={12} /> Approve
                        </Button>
                        <Button variant="danger" onClick={() => { setSelected(r); setRejectReason(""); setRejectModal(true); }}>
                          <XCircle size={12} /> Reject
                        </Button>
                      </div>
                    )}
                    {r.resolution_note && r.status !== "pending" && (
                      <span className="text-[10px] text-textMuted italic">{r.resolution_note}</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      <Modal open={rejectModal} onClose={() => setRejectModal(false)} title="Reject Refund">
        <div className="space-y-4">
          <p className="text-sm text-textMuted">
            Rejecting refund of <span className="text-red font-bold">{selected && formatZAR(selected.amount)}</span> for <span className="font-bold text-text">{selected?.user_name}</span>.
          </p>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Rejection Reason *</label>
            <Input placeholder="Reason for rejection..." value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setRejectModal(false)}>Cancel</Button>
            <Button variant="danger" onClick={reject}><XCircle size={13} /> Reject Refund</Button>
          </div>
        </div>
      </Modal>

      <DangerPinModal
        open={dangerPin.open}
        onSuccess={dangerPin.handleSuccess}
        onCancel={dangerPin.handleCancel}
        actionLabel="approve this refund"
      />
    </AdminShell>
  );
}
