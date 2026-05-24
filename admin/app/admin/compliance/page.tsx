"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Spinner, Modal, Input } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import { AlertTriangle, Plus, Trash2, ShieldOff } from "lucide-react";
import toast from "react-hot-toast";
import { DangerPinModal, useDangerPin } from "@/components/DangerPinModal";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = (dangerToken?: string) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
  ...(dangerToken ? { "X-Danger-Token": dangerToken } : {}),
});

export default function CompliancePage() {
  const [data, setData] = useState<any>(null);
  const [blacklist, setBlacklist] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState(false);
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const dangerPin = useDangerPin();

  const load = async () => {
    setLoading(true);
    try {
      const [alerts, bl] = await Promise.all([
        fetch(`${BASE}/api/admin/compliance/alerts`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${BASE}/api/admin/blacklist`, { headers: authHeaders() }).then(r => r.json()),
      ]);
      setData(alerts);
      setBlacklist(Array.isArray(bl) ? bl : []);
    } catch (e: any) {
      toast.error("Failed to load compliance data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAddBlacklist = async () => {
    if (!phone.trim() || !reason.trim()) { toast.error("Fill all fields"); return; }
    try {
      await fetch(`${BASE}/api/admin/blacklist`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ phone_number: phone.trim(), reason: reason.trim() }),
      });
      toast.success("Added to blacklist");
      setAddModal(false); setPhone(""); setReason("");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleRemove = async (id: string) => {
    if (!confirm("Remove from blacklist? This requires your danger PIN.")) return;
    const token = await dangerPin.request();
    if (!token) return;
    try {
      await fetch(`${BASE}/api/admin/blacklist/${id}`, {
        method: "DELETE",
        headers: authHeaders(token),
      });
      toast.success("Removed from blacklist");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <AdminShell title="Compliance & Risk">
      <div className="space-y-6">
        {loading ? <Spinner /> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="text-center">
                <p className="text-2xl font-extrabold text-red">{data?.velocity_alerts?.length || 0}</p>
                <p className="text-xs text-textMuted mt-1">Velocity Alerts</p>
              </Card>
              <Card className="text-center">
                <p className="text-2xl font-extrabold text-yellow">{data?.large_transactions?.length || 0}</p>
                <p className="text-xs text-textMuted mt-1">Large Txns (24h)</p>
              </Card>
              <Card className="text-center">
                <p className="text-2xl font-extrabold text-purple">{data?.round_amount_alerts?.length || 0}</p>
                <p className="text-xs text-textMuted mt-1">Round Amount Alerts</p>
              </Card>
              <Card className="text-center">
                <p className="text-2xl font-extrabold text-cyan">{data?.blacklist_count || blacklist.length}</p>
                <p className="text-xs text-textMuted mt-1">Blacklisted</p>
              </Card>
            </div>

            {data?.velocity_alerts?.length > 0 && (
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle size={16} className="text-red" />
                  <h2 className="text-text font-bold">Velocity Alerts — High Frequency Users</h2>
                </div>
                <Table headers={["User", "Phone", "Transactions (1hr)", "Total Amount"]} empty={false}>
                  {data.velocity_alerts.map((a: any) => (
                    <Tr key={a.user_id}>
                      <Td className="font-semibold">{a.full_name}</Td>
                      <Td className="font-mono text-xs text-textMuted">{a.phone_number}</Td>
                      <Td><span className="text-red font-bold">{a.txn_count}</span></Td>
                      <Td className="font-bold">{formatZAR(a.total_amount)}</Td>
                    </Tr>
                  ))}
                </Table>
              </Card>
            )}

            <Card>
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle size={16} className="text-yellow" />
                <h2 className="text-text font-bold">Large Transactions — Last 24 Hours</h2>
              </div>
              <Table
                headers={["Reference", "Amount", "Sender", "Receiver", "Date"]}
                empty={!data?.large_transactions?.length}>
                {data?.large_transactions?.map((t: any) => (
                  <Tr key={t.id}>
                    <Td className="font-mono text-xs text-textMuted">{t.reference}</Td>
                    <Td className="font-bold text-yellow">{formatZAR(t.amount)}</Td>
                    <Td className="text-textMuted text-xs">{t.sender_name || "—"}</Td>
                    <Td className="text-textMuted text-xs">{t.receiver_name || "—"}</Td>
                    <Td className="text-textMuted text-xs">{formatDate(t.created_at)}</Td>
                  </Tr>
                ))}
              </Table>
            </Card>

            <Card>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ShieldOff size={16} className="text-red" />
                  <h2 className="text-text font-bold">Blacklist</h2>
                </div>
                <Button onClick={() => setAddModal(true)}>
                  <Plus size={13} /> Add to Blacklist
                </Button>
              </div>
              <Table
                headers={["Phone", "Reason", "Added By", "Date", "Actions"]}
                empty={!blacklist.length}>
                {blacklist.map((b: any) => (
                  <Tr key={b.id}>
                    <Td className="font-mono text-sm">{b.phone_number}</Td>
                    <Td className="text-textMuted text-xs">{b.reason}</Td>
                    <Td className="text-textMuted text-xs">{b.added_by_name || "—"}</Td>
                    <Td className="text-textMuted text-xs">{formatDate(b.created_at)}</Td>
                    <Td>
                      <Button variant="danger" onClick={() => handleRemove(b.id)}>
                        <Trash2 size={12} />
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </Table>
            </Card>
          </>
        )}
      </div>

      <Modal open={addModal} onClose={() => setAddModal(false)} title="Add to Blacklist">
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
              Phone Number
            </label>
            <Input placeholder="+27821234567" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
              Reason
            </label>
            <Input placeholder="Reason for blacklisting..." value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setAddModal(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleAddBlacklist}>Add to Blacklist</Button>
          </div>
        </div>
      </Modal>

      <DangerPinModal
        open={dangerPin.open}
        onSuccess={dangerPin.handleSuccess}
        onCancel={dangerPin.handleCancel}
        actionLabel="remove from blacklist"
      />
    </AdminShell>
  );
}                                                                                                    }
