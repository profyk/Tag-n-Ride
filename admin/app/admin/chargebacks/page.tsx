"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Spinner, Modal, Input, StatCard } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import { AlertOctagon, CheckCircle, XCircle } from "lucide-react";
import toast from "react-hot-toast";
import { api, Chargeback } from "@/lib/api";

const STATUS_TONE: Record<string, "yellow" | "cyan" | "green" | "red" | "muted"> = {
  pending: "yellow", under_review: "cyan", won: "green", lost: "red",
};

export default function ChargebacksPage() {
  const [chargebacks, setChargebacks] = useState<Chargeback[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Chargeback | null>(null);
  const [resolveModal, setResolveModal] = useState(false);
  const [note, setNote] = useState("");
  const [resolveStatus, setResolveStatus] = useState<"won" | "lost" | "under_review">("won");
  const [filter, setFilter] = useState("pending");

  const load = () => {
    setLoading(true);
    api.chargebacks(filter === "all" ? undefined : filter)
      .then((r) => setChargebacks(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filter]);

  const update = async () => {
    if (!selected) return;
    try {
      await api.updateChargeback(selected.id, { status: resolveStatus, resolution_note: note });
      toast.success(`Chargeback marked as ${resolveStatus}`);
      setResolveModal(false);
      setNote("");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const open = chargebacks.filter((c) => c.status === "pending").length;
  const won = chargebacks.filter((c) => c.status === "won").length;
  const totalAmount = chargebacks.reduce((s, c) => s + c.amount, 0);
  const recovered = chargebacks.reduce((s, c) => s + c.amount_recovered, 0);

  return (
    <AdminShell title="Chargebacks">
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Open Chargebacks" value={String(open)} />
          <StatCard label="Won" value={String(won)} />
          <StatCard label="Total Disputed" value={formatZAR(totalAmount)} />
          <StatCard label="Recovered" value={formatZAR(recovered)} />
        </div>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertOctagon size={16} className="text-red" />
              <h2 className="text-text font-bold">Chargeback Cases</h2>
            </div>
            <div className="flex gap-2">
              {(["all", "pending", "under_review", "won", "lost"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded-full text-xs font-bold border transition-all capitalize ${filter === f ? "bg-cyanDim text-cyan border-cyan/20" : "bg-bg2 text-textMuted border-border hover:text-text"}`}>
                  {f === "under_review" ? "Review" : f}
                </button>
              ))}
            </div>
          </div>

          {loading ? <Spinner /> : (
            <Table
              headers={["User", "Amount", "Reason", "Status", "Recovered", "Created", "Actions"]}
              empty={!chargebacks.length}
            >
              {chargebacks.map((c) => (
                <Tr key={c.id}>
                  <Td>
                    <p className="font-semibold">{c.user_name}</p>
                    <p className="text-[10px] text-textMuted font-mono">{c.phone_number}</p>
                  </Td>
                  <Td className="font-bold text-red">{formatZAR(c.amount)}</Td>
                  <Td className="text-textMuted text-xs max-w-[160px] truncate">{c.reason}</Td>
                  <Td><Badge label={c.status} tone={STATUS_TONE[c.status] || "muted"} /></Td>
                  <Td className="font-semibold text-green">{formatZAR(c.amount_recovered)}</Td>
                  <Td className="text-textMuted text-xs">{formatDate(c.created_at)}</Td>
                  <Td>
                    {(c.status === "pending" || c.status === "under_review") && (
                      <div className="flex gap-2">
                        <Button onClick={() => { setSelected(c); setResolveStatus("won"); setNote(""); setResolveModal(true); }}>
                          <CheckCircle size={12} /> Resolve
                        </Button>
                        <Button variant="secondary" onClick={() => { setSelected(c); setResolveStatus("under_review"); setNote(""); setResolveModal(true); }}>
                          Review
                        </Button>
                      </div>
                    )}
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      <Modal open={resolveModal} onClose={() => setResolveModal(false)} title="Resolve Chargeback">
        <div className="space-y-4">
          <p className="text-sm text-textMuted">
            Resolve chargeback for <span className="font-bold text-text">{selected?.user_name}</span> — <span className="text-red font-bold">{selected && formatZAR(selected.amount)}</span>
          </p>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Outcome</label>
            <select value={resolveStatus} onChange={(e) => setResolveStatus(e.target.value as any)}
              className="w-full px-3 py-2 rounded-lg bg-bg3 border border-border text-text text-sm outline-none focus:border-cyan">
              <option value="won">Won — Dispute resolved in our favour</option>
              <option value="lost">Lost — Funds returned to customer</option>
              <option value="under_review">Under Review — Awaiting bank decision</option>
            </select>
          </div>
          {resolveStatus === "won" && (
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Amount Recovered (ZAR)</label>
              <Input type="number" placeholder={String(selected?.amount || 0)} onChange={(e) => setNote(e.target.value)} />
            </div>
          )}
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Resolution Note</label>
            <Input placeholder="Details of resolution..." value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setResolveModal(false)}>Cancel</Button>
            <Button onClick={update}><CheckCircle size={13} /> Submit</Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
