"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Spinner, Modal, Input } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  CheckCircle, Clock, AlertTriangle, X, Copy, ExternalLink,
  ArrowUpCircle, MessageSquare, Bell, BellOff, Scale,
} from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

const RESOLUTION_PRESETS = [
  "Refund processed — amount credited to wallet",
  "Transaction confirmed valid — dispute closed",
  "Duplicate payment identified and reversed",
  "Driver and passenger reached agreement",
  "Chargeback filed with payment provider",
  "Referred to legal team for further review",
  "User accepted explanation — no action required",
];

const CATEGORY_COLORS: Record<string, string> = {
  "Incorrect amount":          "bg-yellow/10 text-yellow border-yellow/20",
  "Service not provided":      "bg-red/10 text-red border-red/20",
  "Duplicate charge":          "bg-orange/10 text-orange border-orange/20",
  "Unauthorised transaction":  "bg-red/10 text-red border-red/20",
  "Driver did not arrive":     "bg-purple/10 text-purple border-purple/20",
  "Other":                     "bg-bg2 text-textMuted border-border",
};

function CategoryBadge({ category }: { category?: string }) {
  if (!category) return <span className="text-textDim text-xs">—</span>;
  const cls = CATEGORY_COLORS[category] ?? "bg-bg2 text-textMuted border-border";
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cls}`}>{category}</span>
  );
}

function daysOpen(created: string) {
  return Math.floor((Date.now() - new Date(created).getTime()) / 86400000);
}

export default function DisputesPage() {
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"open" | "resolved" | "escalated" | "all">("open");
  const [search, setSearch] = useState("");
  const [resolveModal, setResolveModal] = useState<any>(null);
  const [resolution, setResolution] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [notifyUser, setNotifyUser] = useState(true);
  const [viewModal, setViewModal] = useState<any>(null);
  const [resolving, setResolving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch(`${BASE}/api/admin/disputes`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setDisputes(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleResolve = async (status: "resolved" | "escalated" = "resolved") => {
    if (!resolveModal || !resolution.trim()) return;
    setResolving(true);
    try {
      const res = await fetch(`${BASE}/api/admin/disputes/${resolveModal.id}/resolve`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          resolution: status === "escalated" ? `[ESCALATED] ${resolution.trim()}` : resolution.trim(),
          admin_notes: adminNotes.trim() || undefined,
          notify_user: notifyUser,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(status === "escalated" ? "Dispute escalated" : "Dispute resolved");
      setResolveModal(null); setResolution(""); setAdminNotes(""); setNotifyUser(true);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setResolving(false); }
  };

  const openDisputes = disputes.filter(d => d.status === "open");
  const resolvedDisputes = disputes.filter(d => d.status === "resolved");
  const escalatedDisputes = disputes.filter(d => d.resolution?.startsWith("[ESCALATED]"));
  const oldestOpen = openDisputes.length > 0
    ? Math.max(...openDisputes.map(d => daysOpen(d.created_at)))
    : 0;
  const avgResolution = resolvedDisputes.length > 0
    ? Math.round(resolvedDisputes.reduce((s, d) => s + daysOpen(d.created_at), 0) / resolvedDisputes.length)
    : 0;

  const filtered = disputes
    .filter(d => {
      if (filter === "escalated") return d.resolution?.startsWith("[ESCALATED]");
      if (filter === "all") return true;
      return d.status === filter;
    })
    .filter(d =>
      !search ||
      d.user_name?.toLowerCase().includes(search.toLowerCase()) ||
      d.phone_number?.includes(search) ||
      d.reference?.toLowerCase().includes(search.toLowerCase()) ||
      d.category?.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (filter === "open") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const copyRef = (ref: string) => { navigator.clipboard.writeText(ref); toast.success("Copied"); };

  return (
    <AdminShell title="Dispute Resolution">
      <div className="space-y-4">

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="text-center cursor-pointer" onClick={() => setFilter("open")}>
            <p className={`text-2xl font-extrabold ${openDisputes.length > 0 ? "text-red" : "text-green"}`}>
              {openDisputes.length}
            </p>
            <p className="text-xs text-textMuted mt-1">Open</p>
          </Card>
          <Card className="text-center cursor-pointer" onClick={() => setFilter("escalated")}>
            <p className={`text-2xl font-extrabold ${escalatedDisputes.length > 0 ? "text-orange" : "text-textMuted"}`}>
              {escalatedDisputes.length}
            </p>
            <p className="text-xs text-textMuted mt-1">Escalated</p>
          </Card>
          <Card className="text-center cursor-pointer" onClick={() => setFilter("resolved")}>
            <p className="text-2xl font-extrabold text-green">{resolvedDisputes.length}</p>
            <p className="text-xs text-textMuted mt-1">Resolved</p>
          </Card>
          <Card className={`text-center ${oldestOpen > 7 ? "border-red/30" : oldestOpen > 3 ? "border-yellow/30" : ""}`}>
            <p className={`text-2xl font-extrabold ${oldestOpen > 7 ? "text-red" : oldestOpen > 3 ? "text-yellow" : "text-textMuted"}`}>
              {oldestOpen}d
            </p>
            <p className="text-xs text-textMuted mt-1">Oldest Open</p>
          </Card>
          <Card className="text-center">
            <p className="text-2xl font-extrabold text-cyan">{avgResolution}d</p>
            <p className="text-xs text-textMuted mt-1">Avg Resolution</p>
          </Card>
        </div>

        {oldestOpen > 7 && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red/10 border border-red/20">
            <AlertTriangle size={14} className="text-red" />
            <p className="text-sm text-red font-semibold">
              {openDisputes.filter(d => daysOpen(d.created_at) > 7).length} dispute{openDisputes.filter(d => daysOpen(d.created_at) > 7).length !== 1 ? "s have" : " has"} been open over 7 days. Escalate or resolve urgently.
            </p>
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-3 flex-wrap items-center">
          <div className="flex-1 min-w-0">
            <Input
              placeholder="Search user, phone, reference, category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {search && (
            <Button variant="ghost" onClick={() => setSearch("")}><X size={13} /></Button>
          )}
          <div className="flex gap-2 flex-wrap">
            {(["open", "escalated", "resolved", "all"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all capitalize ${
                  filter === f ? "bg-cyanDim text-cyan border-cyan/20" : "bg-bg2 text-textMuted border-border hover:text-text"
                }`}>
                {f} ({
                  f === "escalated"
                    ? escalatedDisputes.length
                    : disputes.filter(d => f === "all" ? true : d.status === f).length
                })
              </button>
            ))}
          </div>
        </div>

        {loading ? <Spinner /> : (
          <Table
            headers={["User", "Phone", "Category", "Reference", "Amount", "Age", "Status", "Opened", "Actions"]}
            empty={!filtered.length}>
            {filtered.map((d: any) => {
              const days = daysOpen(d.created_at);
              const isUrgent = d.status === "open" && days > 7;
              const isWarning = d.status === "open" && days > 3;
              const isEscalated = d.resolution?.startsWith("[ESCALATED]");
              return (
                <Tr key={d.id} className={isUrgent ? "bg-red/5" : isWarning ? "bg-yellow/5" : isEscalated ? "bg-orange/5" : ""}>
                  <Td className="font-semibold">{d.user_name}</Td>
                  <Td className="font-mono text-xs text-textMuted">{d.phone_number}</Td>
                  <Td><CategoryBadge category={d.category} /></Td>
                  <Td>
                    {d.reference ? (
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px] text-textMuted">{d.reference.slice(0, 12)}…</span>
                        <button onClick={() => copyRef(d.reference)} className="text-textDim hover:text-cyan">
                          <Copy size={10} />
                        </button>
                      </div>
                    ) : "—"}
                  </Td>
                  <Td className="font-bold">{d.amount ? formatZAR(d.amount) : "—"}</Td>
                  <Td>
                    {d.status === "open" && (
                      <div className="flex items-center gap-1.5">
                        <Clock size={11} className={isUrgent ? "text-red" : isWarning ? "text-yellow" : "text-textMuted"} />
                        <span className={`text-xs font-bold ${isUrgent ? "text-red" : isWarning ? "text-yellow" : "text-textMuted"}`}>
                          {days}d {isUrgent ? "⚠" : ""}
                        </span>
                      </div>
                    )}
                  </Td>
                  <Td>
                    {isEscalated ? (
                      <Badge label="escalated" tone="yellow" />
                    ) : (
                      <Badge label={d.status} tone={d.status === "open" ? "yellow" : "green"} />
                    )}
                  </Td>
                  <Td className="text-textMuted text-xs">{formatDate(d.created_at)}</Td>
                  <Td>
                    <div className="flex gap-1.5">
                      <Button variant="ghost" onClick={() => setViewModal(d)}>View</Button>
                      {d.status === "open" && (
                        <Button variant="secondary" onClick={() => { setResolveModal(d); setResolution(""); setAdminNotes(""); setNotifyUser(true); }}>
                          <CheckCircle size={12} /> Resolve
                        </Button>
                      )}
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </Table>
        )}
      </div>

      {/* View Modal */}
      {viewModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setViewModal(null)}>
          <div className="bg-bg2 border border-border rounded-xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-text font-bold text-lg">Dispute Details</h3>
              <button onClick={() => setViewModal(null)} className="text-textMuted hover:text-text text-2xl leading-none">×</button>
            </div>

            {/* Status banner */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border mb-4 ${
              viewModal.resolution?.startsWith("[ESCALATED]")
                ? "bg-orange/10 border-orange/20"
                : viewModal.status === "open"
                  ? "bg-yellow/10 border-yellow/20"
                  : "bg-green/10 border-green/20"
            }`}>
              {viewModal.resolution?.startsWith("[ESCALATED]")
                ? <ArrowUpCircle size={13} className="text-orange" />
                : viewModal.status === "open"
                  ? <Clock size={13} className="text-yellow" />
                  : <CheckCircle size={13} className="text-green" />
              }
              <span className={`text-xs font-bold capitalize ${
                viewModal.resolution?.startsWith("[ESCALATED]") ? "text-orange"
                : viewModal.status === "open" ? "text-yellow" : "text-green"
              }`}>
                {viewModal.resolution?.startsWith("[ESCALATED]") ? "Escalated" : viewModal.status} · {daysOpen(viewModal.created_at)}d old
              </span>
              {viewModal.status === "resolved" && viewModal.resolved_by_name && (
                <span className="text-textDim text-xs ml-auto">Resolved by {viewModal.resolved_by_name}</span>
              )}
            </div>

            {viewModal.category && (
              <div className="mb-3">
                <CategoryBadge category={viewModal.category} />
              </div>
            )}

            <div className="space-y-0 mb-4 bg-bg border border-border rounded-lg overflow-hidden">
              {[
                { label: "User", value: viewModal.user_name },
                { label: "Phone", value: viewModal.phone_number },
                { label: "Amount", value: viewModal.amount ? formatZAR(viewModal.amount) : "—" },
                { label: "Opened", value: formatDate(viewModal.created_at) },
                ...(viewModal.resolved_at ? [{ label: "Resolved", value: formatDate(viewModal.resolved_at) }] : []),
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between px-4 py-2.5 border-b border-border last:border-0">
                  <span className="text-textMuted text-xs">{label}</span>
                  <span className="text-text text-xs font-medium">{value}</span>
                </div>
              ))}
              {viewModal.reference && (
                <div className="flex justify-between items-center px-4 py-2.5">
                  <span className="text-textMuted text-xs">Reference</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-cyan">{viewModal.reference}</span>
                    <button onClick={() => copyRef(viewModal.reference)} className="text-textDim hover:text-cyan"><Copy size={11} /></button>
                    <Link href={`/admin/transactions?search=${encodeURIComponent(viewModal.reference)}`} className="text-textDim hover:text-cyan" title="View transaction">
                      <ExternalLink size={11} />
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-bg border border-border rounded-lg p-3 mb-3">
              <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">User's Complaint</p>
              <p className="text-text text-sm leading-relaxed">{viewModal.reason || "No reason provided"}</p>
            </div>

            {viewModal.admin_notes && (
              <div className="bg-cyan/5 border border-cyan/20 rounded-lg p-3 mb-3">
                <p className="text-[10px] font-bold text-cyan uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                  <MessageSquare size={10} /> Admin Notes
                </p>
                <p className="text-text text-sm">{viewModal.admin_notes}</p>
              </div>
            )}

            {viewModal.resolution && (
              <div className={`border rounded-lg p-3 mb-3 ${
                viewModal.resolution.startsWith("[ESCALATED]")
                  ? "bg-orange/5 border-orange/20"
                  : "bg-green/5 border-green/20"
              }`}>
                <p className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${viewModal.resolution.startsWith("[ESCALATED]") ? "text-orange" : "text-green"}`}>
                  Resolution
                </p>
                <p className={`text-sm ${viewModal.resolution.startsWith("[ESCALATED]") ? "text-orange" : "text-green"}`}>
                  {viewModal.resolution.replace(/^\[ESCALATED\]\s*/, "")}
                </p>
              </div>
            )}

            {viewModal.status === "open" && (
              <div className="flex gap-2 mt-2">
                <Button className="flex-1 justify-center" onClick={() => { setResolveModal(viewModal); setViewModal(null); setResolution(""); setAdminNotes(""); setNotifyUser(true); }}>
                  <CheckCircle size={13} /> Resolve
                </Button>
                <Button variant="danger" className="flex-1 justify-center" onClick={() => {
                  setResolution("Escalated to senior management for review");
                  setResolveModal(viewModal); setViewModal(null); setAdminNotes(""); setNotifyUser(true);
                }}>
                  <ArrowUpCircle size={13} /> Escalate
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Resolve Modal */}
      <Modal
        open={!!resolveModal}
        onClose={() => { setResolveModal(null); setResolution(""); setAdminNotes(""); setNotifyUser(true); }}
        title={`Resolve — ${resolveModal?.user_name}`}>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex-1 bg-bg border border-border rounded-lg p-3">
              <p className="text-textMuted text-xs font-bold uppercase tracking-widest mb-1">User's Complaint</p>
              <p className="text-text text-sm">{resolveModal?.reason}</p>
            </div>
            {resolveModal?.category && (
              <div className="pt-3">
                <CategoryBadge category={resolveModal.category} />
              </div>
            )}
          </div>

          <div>
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-2">Quick Resolution</p>
            <div className="flex flex-wrap gap-2">
              {RESOLUTION_PRESETS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => setResolution(preset)}
                  className={`text-xs px-3 py-1.5 rounded-lg border text-left transition-all ${
                    resolution === preset
                      ? "bg-green/10 text-green border-green/20"
                      : "text-textMuted border-border hover:border-green/30"
                  }`}>
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
              Resolution message <span className="text-red">*</span>
            </label>
            <Input
              placeholder="Describe how this was resolved..."
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
              <MessageSquare size={10} /> Internal admin notes (not shown to user)
            </label>
            <Input
              placeholder="Optional: internal notes for audit trail..."
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
            />
          </div>

          <button
            onClick={() => setNotifyUser(v => !v)}
            className={`flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg border transition-all w-full ${
              notifyUser
                ? "bg-cyan/10 border-cyan/20 text-cyan"
                : "bg-bg border-border text-textMuted"
            }`}>
            {notifyUser ? <Bell size={12} /> : <BellOff size={12} />}
            {notifyUser ? "User will be notified of this resolution" : "Notification to user disabled"}
          </button>

          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => { setResolveModal(null); setResolution(""); setAdminNotes(""); setNotifyUser(true); }}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => handleResolve("escalated")} disabled={!resolution.trim() || resolving}>
              <ArrowUpCircle size={13} /> Escalate
            </Button>
            <Button onClick={() => handleResolve("resolved")} disabled={!resolution.trim() || resolving}>
              <CheckCircle size={13} /> {resolving ? "Resolving…" : "Mark Resolved"}
            </Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
