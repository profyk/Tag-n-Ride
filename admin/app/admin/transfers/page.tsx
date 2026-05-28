"use client";
import { useState, useEffect } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Table, Tr, Td, Badge, Button, Spinner, Modal, Select, Input } from "@/components/ui";
import { api, DriverTransfer, ContactAttempt } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { ArrowRightLeft, Phone, MessageSquare, Mail, Users, CheckCircle, XCircle, RefreshCw, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";

const STATUS_COLORS: Record<string, "green" | "yellow" | "red" | "cyan" | "muted" | "orange"> = {
  pending_old_owner: "yellow",
  pending_new_owner: "yellow",
  escalated_to_admin: "orange",
  completed: "green",
  rejected_by_old_owner: "red",
  rejected_by_new_owner: "red",
  cancelled: "muted",
};

const STATUS_LABELS: Record<string, string> = {
  pending_old_owner: "Pending Old Owner",
  pending_new_owner: "Pending New Owner",
  escalated_to_admin: "Escalated",
  completed: "Completed",
  rejected_by_old_owner: "Rejected (Old Owner)",
  rejected_by_new_owner: "Rejected (New Owner)",
  cancelled: "Cancelled",
};

const CONTACT_METHODS = ["phone", "whatsapp", "email", "in_person"];
const CONTACT_OUTCOMES = ["reached", "no_answer", "declined", "agreed"];

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<DriverTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("escalated_to_admin");
  const [selected, setSelected] = useState<DriverTransfer | null>(null);
  const [attempts, setAttempts] = useState<ContactAttempt[]>([]);
  const [loadingAttempts, setLoadingAttempts] = useState(false);
  const [contactMethod, setContactMethod] = useState("phone");
  const [contactOutcome, setContactOutcome] = useState("no_answer");
  const [contactNotes, setContactNotes] = useState("");
  const [loggingContact, setLoggingContact] = useState(false);
  const [overrideNote, setOverrideNote] = useState("");
  const [actioning, setActioning] = useState(false);

  const load = (s?: string) => {
    setLoading(true);
    api.adminTransfers(s || statusFilter || undefined)
      .then(r => setTransfers(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openDetail = async (t: DriverTransfer) => {
    setSelected(t);
    setLoadingAttempts(true);
    setAttempts([]);
    try {
      const res = await api.adminTransferContactAttempts(t.id);
      setAttempts(res.data);
    } catch {} finally { setLoadingAttempts(false); }
  };

  const handleLogContact = async () => {
    if (!selected) return;
    setLoggingContact(true);
    try {
      await api.adminLogContact(selected.id, { contact_method: contactMethod, outcome: contactOutcome, notes: contactNotes || undefined });
      toast.success("Contact attempt logged");
      setContactNotes("");
      const res = await api.adminTransferContactAttempts(selected.id);
      setAttempts(res.data);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoggingContact(false); }
  };

  const handleApprove = async () => {
    if (!selected || !overrideNote.trim()) { toast.error("Enter a note before overriding"); return; }
    setActioning(true);
    try {
      await api.adminTransferApprove(selected.id, overrideNote.trim());
      toast.success("Transfer approved — moved to new owner review");
      setSelected(null); setOverrideNote(""); load();
    } catch (e: any) { toast.error(e.message); }
    finally { setActioning(false); }
  };

  const handleReject = async () => {
    if (!selected || !overrideNote.trim()) { toast.error("Enter a note before rejecting"); return; }
    setActioning(true);
    try {
      await api.adminTransferReject(selected.id, overrideNote.trim());
      toast.success("Transfer closed");
      setSelected(null); setOverrideNote(""); load();
    } catch (e: any) { toast.error(e.message); }
    finally { setActioning(false); }
  };

  const applyFilter = (v: string) => {
    setStatusFilter(v);
    load(v || undefined);
  };

  const methodIcon = (m: string) => {
    if (m === "phone") return <Phone size={12} />;
    if (m === "whatsapp") return <MessageSquare size={12} />;
    if (m === "email") return <Mail size={12} />;
    return <Users size={12} />;
  };

  const canAct = selected && ["escalated_to_admin", "pending_old_owner", "pending_new_owner"].includes(selected.status);
  const needsContact = canAct && attempts.length === 0;

  return (
    <AdminShell title="Driver Transfers">
      <div className="space-y-4">

        <div className="flex gap-3 flex-wrap items-center">
          <Select value={statusFilter} onChange={e => applyFilter(e.target.value)} className="w-52">
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
          <Button variant="secondary" onClick={() => load()}>
            <RefreshCw size={13} /> Refresh
          </Button>
          <p className="text-xs text-textMuted ml-auto">
            {loading ? "Loading…" : `${transfers.length} transfer${transfers.length !== 1 ? "s" : ""}`}
          </p>
        </div>

        {loading ? <Spinner /> : (
          <Table
            headers={["Driver", "From Fleet", "To Fleet", "Status", "Escalated", "Actions"]}
            empty={!transfers.length}
          >
            {transfers.map(t => (
              <Tr key={t.id}>
                <Td>
                  <p className="font-semibold">{t.driver_name}</p>
                  <p className="text-xs text-textDim font-mono">{t.driver_phone}</p>
                </Td>
                <Td className="text-sm text-textMuted">{t.old_owner_name || "—"}</Td>
                <Td className="text-sm">{t.new_owner_name}</Td>
                <Td>
                  <Badge label={STATUS_LABELS[t.status] || t.status} tone={STATUS_COLORS[t.status] || "muted"} />
                </Td>
                <Td className="text-xs text-textMuted">
                  {t.escalated_at ? formatDate(t.escalated_at) : "—"}
                </Td>
                <Td>
                  <Button variant="secondary" onClick={() => openDetail(t)}>
                    <ArrowRightLeft size={12} /> Review
                  </Button>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </div>

      {/* Detail modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title="Transfer Review">
        {selected && (
          <div className="space-y-4">
            {/* Info grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-bg rounded-lg p-3">
                <p className="text-textMuted text-xs font-bold uppercase tracking-wide mb-1">Driver</p>
                <p className="font-semibold">{selected.driver_name}</p>
                <p className="text-textDim text-xs">{selected.driver_phone}</p>
              </div>
              <div className="bg-bg rounded-lg p-3">
                <p className="text-textMuted text-xs font-bold uppercase tracking-wide mb-1">Status</p>
                <Badge label={STATUS_LABELS[selected.status] || selected.status} tone={STATUS_COLORS[selected.status] || "muted"} />
              </div>
              <div className="bg-bg rounded-lg p-3">
                <p className="text-textMuted text-xs font-bold uppercase tracking-wide mb-1">From Fleet</p>
                <p className="font-semibold">{selected.old_owner_name || "Unlinked"}</p>
              </div>
              <div className="bg-bg rounded-lg p-3">
                <p className="text-textMuted text-xs font-bold uppercase tracking-wide mb-1">To Fleet</p>
                <p className="font-semibold">{selected.new_owner_name}</p>
              </div>
              {selected.escalated_at && (
                <div className="bg-bg rounded-lg p-3 col-span-2">
                  <p className="text-textMuted text-xs font-bold uppercase tracking-wide mb-1">Escalated</p>
                  <p className="text-sm">{formatDate(selected.escalated_at)}</p>
                </div>
              )}
              {(selected.old_owner_reject_reason || selected.new_owner_reject_reason) && (
                <div className="bg-bg rounded-lg p-3 col-span-2">
                  <p className="text-textMuted text-xs font-bold uppercase tracking-wide mb-1">Rejection Reason</p>
                  <p className="text-sm text-red">{selected.old_owner_reject_reason || selected.new_owner_reject_reason}</p>
                </div>
              )}
              {selected.admin_override_note && (
                <div className="bg-bg rounded-lg p-3 col-span-2">
                  <p className="text-textMuted text-xs font-bold uppercase tracking-wide mb-1">Admin Note</p>
                  <p className="text-sm">{selected.admin_override_note}</p>
                </div>
              )}
            </div>

            {/* Contact attempts */}
            <div>
              <p className="text-sm font-bold text-text mb-2">Contact Attempts ({attempts.length})</p>
              {loadingAttempts ? <Spinner /> : attempts.length === 0 ? (
                <p className="text-xs text-textMuted italic">No contact attempts logged yet.</p>
              ) : (
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {attempts.map(a => (
                    <div key={a.id} className="flex items-start gap-2 text-xs bg-bg rounded-lg px-3 py-2">
                      <span className="text-textMuted shrink-0">{methodIcon(a.contact_method)}</span>
                      <div className="flex-1">
                        <span className="font-semibold capitalize">{a.contact_method}</span>
                        <span className="text-textMuted"> · {a.outcome}</span>
                        {a.notes && <span className="text-textDim"> — {a.notes}</span>}
                      </div>
                      <span className="text-textDim shrink-0">{formatDate(a.attempted_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Log contact form */}
            {canAct && (
              <div className="space-y-2 border border-border rounded-xl p-3">
                <p className="text-xs font-bold text-textMuted uppercase tracking-wide">Log Contact Attempt</p>
                <div className="flex gap-2">
                  <Select value={contactMethod} onChange={e => setContactMethod(e.target.value)} className="flex-1 text-xs">
                    {CONTACT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </Select>
                  <Select value={contactOutcome} onChange={e => setContactOutcome(e.target.value)} className="flex-1 text-xs">
                    {CONTACT_OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
                  </Select>
                </div>
                <Input
                  placeholder="Notes (optional)"
                  value={contactNotes}
                  onChange={e => setContactNotes(e.target.value)}
                />
                <Button variant="secondary" onClick={handleLogContact}>
                  {loggingContact ? "Logging…" : <><Phone size={12} /> Log Contact</>}
                </Button>
              </div>
            )}

            {/* Admin override */}
            {canAct && (
              <div className="space-y-2 border border-border rounded-xl p-3">
                <p className="text-xs font-bold text-textMuted uppercase tracking-wide">Admin Override</p>
                {needsContact && (
                  <p className="text-xs text-yellow">Log at least one contact attempt before overriding.</p>
                )}
                <Input
                  placeholder="Override note (required — explain what happened)"
                  value={overrideNote}
                  onChange={e => setOverrideNote(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button variant="danger" onClick={handleReject}>
                    <XCircle size={12} /> Close Transfer
                  </Button>
                  <Button
                    onClick={handleApprove}
                  >
                    <CheckCircle size={12} /> Approve & Forward
                  </Button>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setSelected(null)}>Done</Button>
            </div>
          </div>
        )}
      </Modal>
    </AdminShell>
  );
}
