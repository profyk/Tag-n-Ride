"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Spinner, Modal, Input } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import { CheckCircle, Clock, AlertTriangle, Search, X, Copy } from "lucide-react";
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

function daysOpen(created: string) {
  return Math.floor((Date.now() - new Date(created).getTime()) / 86400000);
}

export default function DisputesPage() {
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"open" | "resolved" | "all">("open");
  const [search, setSearch] = useState("");
  const [resolveModal, setResolveModal] = useState<any>(null);
  const [resolution, setResolution] = useState("");
  const [viewModal, setViewModal] = useState<any>(null);

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

  const openDisputes = disputes.filter(d => d.status === "open");
  const resolvedDisputes = disputes.filter(d => d.status === "resolved");
  const oldestOpen = openDisputes.length > 0
    ? Math.max(...openDisputes.map(d => daysOpen(d.created_at)))
    : 0;
  const avgResolution = resolvedDisputes.length > 0
    ? Math.round(resolvedDisputes.reduce((s, d) => s + daysOpen(d.created_at), 0) / resolvedDisputes.length)
    : 0;

  const filtered = disputes
    .filter(d => filter === "all" ? true : d.status === filter)
    .filter(d =>
      !search ||
      d.user_name?.toLowerCase().includes(search.toLowerCase()) ||
      d.phone_number?.includes(search) ||
      d.reference?.toLowerCase().includes(search.toLowerCase())
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="text-center">
            <p className={`text-2xl font-extrabold ${openDisputes.length > 0 ? "text-red" : "text-green"}`}>
              {openDisputes.length}
            </p>
            <p className="text-xs text-textMuted mt-1">Open</p>
          </Card>
          <Card className="text-center">
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
              placeholder="Search user, phone, reference..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {search && (
            <Button variant="ghost" onClick={() => setSearch("")}><X size={13} /></Button>
          )}
          <div className="flex gap-2">
            {(["open", "resolved", "all"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all capitalize ${
                  filter === f ? "bg-cyanDim text-cyan border-cyan/20" : "bg-bg2 text-textMuted border-border hover:text-text"
                }`}>
                {f} ({disputes.filter(d => f === "all" ? true : d.status === f).length})
              </button>
            ))}
          </div>
        </div>

        {loading ? <Spinner /> : (
          <Table
            headers={["User", "Phone", "Reference", "Amount", "Days Open", "Status", "Opened", "Actions"]}
            empty={!filtered.length}>
            {filtered.map((d: any) => {
              const days = daysOpen(d.created_at);
              const isUrgent = d.status === "open" && days > 7;
              const isWarning = d.status === "open" && days > 3;
              return (
                <Tr key={d.id} className={isUrgent ? "bg-red/5" : isWarning ? "bg-yellow/5" : ""}>
                  <Td className="font-semibold">{d.user_name}</Td>
                  <Td className="font-mono text-xs text-textMuted">{d.phone_number}</Td>
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
                    <Badge label={d.status} tone={d.status === "open" ? "yellow" : "green"} />
                  </Td>
                  <Td className="text-textMuted text-xs">{formatDate(d.created_at)}</Td>
                  <Td>
                    <div className="flex gap-1.5">
                      <Button variant="ghost" onClick={() => setViewModal(d)}>View</Button>
                      {d.status === "open" && (
                        <Button variant="secondary" onClick={() => setResolveModal(d)}>
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
          <div className="bg-bg2 border border-border rounded-xl p-6 w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-text font-bold text-lg">Dispute Details</h3>
              <button onClick={() => setViewModal(null)} className="text-textMuted hover:text-text text-2xl leading-none">×</button>
            </div>

            <div className="space-y-3 mb-4">
              {[
                { label: "User", value: viewModal.user_name },
                { label: "Phone", value: viewModal.phone_number },
                { label: "Reference", value: viewModal.reference || "—" },
                { label: "Amount", value: viewModal.amount ? formatZAR(viewModal.amount) : "—" },
                { label: "Opened", value: formatDate(viewModal.created_at) },
                { label: "Days open", value: `${daysOpen(viewModal.created_at)}d` },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between py-2 border-b border-border last:border-0">
                  <span className="text-textMuted text-xs">{label}</span>
                  <span className="text-text text-xs font-medium">{value}</span>
                </div>
              ))}
            </div>

            <div className="bg-bg border border-border rounded-lg p-3 mb-4">
              <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">User's Reason</p>
              <p className="text-text text-sm">{viewModal.reason}</p>
            </div>

            {viewModal.resolution && (
              <div className="bg-green/5 border border-green/20 rounded-lg p-3 mb-4">
                <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Resolution</p>
                <p className="text-green text-sm">{viewModal.resolution}</p>
              </div>
            )}

            {viewModal.status === "open" && (
              <Button className="w-full justify-center" onClick={() => { setResolveModal(viewModal); setViewModal(null); }}>
                <CheckCircle size={13} /> Resolve Dispute
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Resolve Modal */}
      <Modal
        open={!!resolveModal}
        onClose={() => { setResolveModal(null); setResolution(""); }}
        title={`Resolve — ${resolveModal?.user_name}`}>
        <div className="space-y-4">
          <div className="bg-bg border border-border rounded-lg p-3">
            <p className="text-textMuted text-xs font-bold uppercase tracking-widest mb-1">User's Reason</p>
            <p className="text-text text-sm">{resolveModal?.reason}</p>
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
              Or custom resolution
            </label>
            <Input
              placeholder="Describe how this was resolved..."
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
            />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => { setResolveModal(null); setResolution(""); }}>Cancel</Button>
            <Button onClick={handleResolve} disabled={!resolution.trim()}>
              <CheckCircle size={13} /> Mark Resolved
            </Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
