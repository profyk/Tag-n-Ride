"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Spinner, Modal, Input } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import { CheckCircle } from "lucide-react";
import toast from "react-hot-toast";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

export default function DisputesPage() {
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"open" | "resolved" | "all">("open");
  const [resolveModal, setResolveModal] = useState<any>(null);
  const [resolution, setResolution] = useState("");

  const load = () => {
    setLoading(true);
    fetch(`${BASE}/api/admin/disputes`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setDisputes(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleResolve = async () => {
    if (!resolveModal || !resolution.trim()) return;
    try {
      await fetch(`${BASE}/api/admin/disputes/${resolveModal.id}/resolve`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ resolution: resolution.trim() }),
      });
      toast.success("Dispute resolved");
      setResolveModal(null); setResolution(""); load();
    } catch (e: any) { toast.error(e.message); }
  };

  const filtered = disputes.filter(d =>
    filter === "all" ? true : d.status === filter
  );

  return (
    <AdminShell title="Dispute Resolution">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <Card className="text-center">
            <p className="text-2xl font-extrabold text-red">
              {disputes.filter(d => d.status === "open").length}
            </p>
            <p className="text-xs text-textMuted mt-1">Open</p>
          </Card>
          <Card className="text-center">
            <p className="text-2xl font-extrabold text-green">
              {disputes.filter(d => d.status === "resolved").length}
            </p>
            <p className="text-xs text-textMuted mt-1">Resolved</p>
          </Card>
          <Card className="text-center">
            <p className="text-2xl font-extrabold text-cyan">{disputes.length}</p>
            <p className="text-xs text-textMuted mt-1">Total</p>
          </Card>
        </div>

        <div className="flex gap-2">
          {(["open", "resolved", "all"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all capitalize
                ${filter === f
                  ? "bg-cyanDim text-cyan border-cyan/20"
                  : "bg-bg2 text-textMuted border-border"}`}>
              {f}
            </button>
          ))}
        </div>

        {loading ? <Spinner /> : (
          <Table
            headers={["User", "Phone", "Transaction", "Amount", "Reason", "Status", "Date", "Actions"]}
            empty={!filtered.length}>
            {filtered.map((d: any) => (
              <Tr key={d.id}>
                <Td className="font-semibold">{d.user_name}</Td>
                <Td className="font-mono text-xs text-textMuted">{d.phone_number}</Td>
                <Td className="font-mono text-xs text-textMuted">{d.reference || "—"}</Td>
                <Td className="font-bold">{d.amount ? formatZAR(d.amount) : "—"}</Td>
                <Td className="text-textMuted text-xs max-w-xs truncate">{d.reason}</Td>
                <Td>
                  <Badge label={d.status} tone={d.status === "open" ? "yellow" : "green"} />
                </Td>
                <Td className="text-textMuted text-xs">{formatDate(d.created_at)}</Td>
                <Td>
                  {d.status === "open" && (
                    <Button variant="secondary" onClick={() => setResolveModal(d)}>
                      <CheckCircle size={12} /> Resolve
                    </Button>
                  )}
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </div>

      <Modal
        open={!!resolveModal}
        onClose={() => { setResolveModal(null); setResolution(""); }}
        title={`Resolve — ${resolveModal?.user_name}`}>
        <div className="space-y-4">
          <div className="bg-bg border border-border rounded-lg p-3">
            <p className="text-textMuted text-xs font-bold uppercase tracking-widest mb-1">
              User's Reason
            </p>
            <p className="text-text text-sm">{resolveModal?.reason}</p>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
              Resolution
            </label>
            <Input placeholder="How was this resolved..."
              value={resolution} onChange={(e) => setResolution(e.target.value)} />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary"
              onClick={() => { setResolveModal(null); setResolution(""); }}>
              Cancel
            </Button>
            <Button onClick={handleResolve}>
              <CheckCircle size={13} /> Mark Resolved
            </Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
