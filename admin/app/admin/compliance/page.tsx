"use client";
import { useEffect, useState, useCallback } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Modal, Input, Spinner } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import { AlertTriangle, Plus, Trash2, ShieldOff, RefreshCw, Clock, ExternalLink, Copy } from "lucide-react";
import toast from "react-hot-toast";
import Link from "next/link";
import { DangerPinModal, useDangerPin } from "@/components/DangerPinModal";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = (dangerToken?: string) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
  ...(dangerToken ? { "X-Danger-Token": dangerToken } : {}),
});

const BLACKLIST_REASONS = [
  "Confirmed fraudulent activity",
  "Multiple chargeback attempts",
  "Identity fraud detected",
  "Violent or threatening behaviour",
  "Repeated terms of service violations",
];

export default function CompliancePage() {
  const [data, setData] = useState<any>(null);
  const [blacklist, setBlacklist] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [addModal, setAddModal] = useState(false);
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [blacklistSearch, setBlacklistSearch] = useState("");
  const dangerPin = useDangerPin();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [alerts, bl] = await Promise.all([
        fetch(`${BASE}/api/admin/compliance/alerts`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${BASE}/api/admin/blacklist`, { headers: authHeaders() }).then(r => r.json()),
      ]);
      setData(alerts);
      setBlacklist(Array.isArray(bl) ? bl : []);
      setLastRefreshed(new Date());
    } catch (e: any) {
      toast.error("Failed to load compliance data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [load]);

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

  const copyPhone = (p: string) => { navigator.clipboard.writeText(p); toast.success("Copied"); };

  const filteredBlacklist = blacklist.filter(b =>
    !blacklistSearch ||
    b.phone_number?.includes(blacklistSearch) ||
    b.reason?.toLowerCase().includes(blacklistSearch.toLowerCase())
  );

  return (
    <AdminShell title="Compliance & Risk">
      <div className="space-y-6">

        {/* Header with auto-refresh indicator */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-textMuted">
            <RefreshCw size={11} className="animate-spin opacity-60" />
            <span>Auto-refreshes every 60s</span>
            {lastRefreshed && (
              <span className="flex items-center gap-1">
                <Clock size={10} /> Last: {lastRefreshed.toLocaleTimeString()}
              </span>
            )}
          </div>
          <Button variant="secondary" onClick={load}>
            <RefreshCw size={13} /> Refresh Now
          </Button>
        </div>

        {loading && !data ? <Spinner /> : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className={`text-center ${(data?.velocity_alerts?.length || 0) > 0 ? "border-red/30" : ""}`}>
                <p className={`text-2xl font-extrabold ${(data?.velocity_alerts?.length || 0) > 0 ? "text-red" : "text-textMuted"}`}>
                  {data?.velocity_alerts?.length || 0}
                </p>
                <p className="text-xs text-textMuted mt-1">Velocity Alerts</p>
                {(data?.velocity_alerts?.length || 0) > 0 && (
                  <p className="text-[10px] text-red font-bold mt-1">REVIEW NOW</p>
                )}
              </Card>
              <Card className={`text-center ${(data?.large_transactions?.length || 0) > 0 ? "border-yellow/30" : ""}`}>
                <p className={`text-2xl font-extrabold ${(data?.large_transactions?.length || 0) > 0 ? "text-yellow" : "text-textMuted"}`}>
                  {data?.large_transactions?.length || 0}
                </p>
                <p className="text-xs text-textMuted mt-1">Large Txns (24h)</p>
              </Card>
              <Card className="text-center">
                <p className="text-2xl font-extrabold text-purple">{data?.round_amount_alerts?.length || 0}</p>
                <p className="text-xs text-textMuted mt-1">Round Amount Flags</p>
              </Card>
              <Card className="text-center">
                <p className={`text-2xl font-extrabold ${blacklist.length > 0 ? "text-red" : "text-textMuted"}`}>
                  {data?.blacklist_count || blacklist.length}
                </p>
                <p className="text-xs text-textMuted mt-1">Blacklisted</p>
              </Card>
            </div>

            {/* Velocity Alerts */}
            {data?.velocity_alerts?.length > 0 && (
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle size={16} className="text-red" />
                  <h2 className="text-text font-bold">Velocity Alerts — High Frequency Users</h2>
                  <span className="text-xs text-textMuted">(unusually high transaction rate in 1hr)</span>
                </div>
                <Table headers={["User", "Phone", "Transactions (1hr)", "Total Amount", "Actions"]} empty={false}>
                  {data.velocity_alerts.map((a: any) => (
                    <Tr key={a.user_id}>
                      <Td className="font-semibold">{a.full_name}</Td>
                      <Td>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs text-textMuted">{a.phone_number}</span>
                          <button onClick={() => copyPhone(a.phone_number)} className="text-textDim hover:text-cyan">
                            <Copy size={10} />
                          </button>
                        </div>
                      </Td>
                      <Td>
                        <span className="text-red font-bold text-sm">{a.txn_count}</span>
                        <span className="text-textMuted text-xs ml-1">txns</span>
                      </Td>
                      <Td className="font-bold text-yellow">{formatZAR(a.total_amount)}</Td>
                      <Td>
                        <Link href={`/admin/support?q=${encodeURIComponent(a.phone_number)}`}>
                          <Button variant="ghost">
                            <ExternalLink size={12} /> View User
                          </Button>
                        </Link>
                      </Td>
                    </Tr>
                  ))}
                </Table>
              </Card>
            )}

            {/* Round Amount Alerts */}
            {data?.round_amount_alerts?.length > 0 && (
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle size={16} className="text-purple" />
                  <h2 className="text-text font-bold">Round Amount Alerts</h2>
                  <span className="text-xs text-textMuted">(suspicious round-number transactions — potential structuring)</span>
                </div>
                <Table
                  headers={["Reference", "Amount", "Sender", "Receiver", "Date"]}
                  empty={!data.round_amount_alerts.length}>
                  {data.round_amount_alerts.map((t: any) => (
                    <Tr key={t.id}>
                      <Td className="font-mono text-xs text-textMuted">{t.reference}</Td>
                      <Td className="font-bold text-purple">{formatZAR(t.amount)}</Td>
                      <Td className="text-textMuted text-xs">{t.sender_name || "—"}</Td>
                      <Td className="text-textMuted text-xs">{t.receiver_name || "—"}</Td>
                      <Td className="text-textMuted text-xs">{formatDate(t.created_at)}</Td>
                    </Tr>
                  ))}
                </Table>
              </Card>
            )}

            {/* Large Transactions */}
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

            {/* Blacklist */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ShieldOff size={16} className="text-red" />
                  <h2 className="text-text font-bold">Blacklist</h2>
                  <span className="text-xs text-textMuted">({blacklist.length} numbers)</span>
                </div>
                <Button onClick={() => setAddModal(true)}>
                  <Plus size={13} /> Add to Blacklist
                </Button>
              </div>

              <div className="mb-3">
                <Input
                  placeholder="Search phone number or reason..."
                  value={blacklistSearch}
                  onChange={(e) => setBlacklistSearch(e.target.value)}
                />
              </div>

              <Table
                headers={["Phone", "Reason", "Added By", "Date", "Actions"]}
                empty={!filteredBlacklist.length}>
                {filteredBlacklist.map((b: any) => (
                  <Tr key={b.id}>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-sm">{b.phone_number}</span>
                        <button onClick={() => copyPhone(b.phone_number)} className="text-textDim hover:text-cyan">
                          <Copy size={10} />
                        </button>
                      </div>
                    </Td>
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
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Phone Number</label>
            <Input placeholder="+27821234567" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-2">Reason</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {BLACKLIST_REASONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setReason(r)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                    reason === r ? "bg-red/10 text-red border-red/20" : "text-textMuted border-border hover:border-red/30"
                  }`}>
                  {r}
                </button>
              ))}
            </div>
            <Input placeholder="Or type a custom reason..." value={reason} onChange={(e) => setReason(e.target.value)} />
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
}
