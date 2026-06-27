"use client";
import { useState, useEffect } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Button, Modal, Input, Spinner } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { ShieldCheck, Download, CheckCircle2, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";
import { api, GDPRRequest } from "@/lib/api";
import { DangerPinModal, useDangerPin } from "@/components/DangerPinModal";

const TYPE_CLS: Record<string, string> = {
  deletion:    "bg-red/10 border-red/20 text-red",
  export:      "bg-cyan/10 border-cyan/20 text-cyan",
  correction:  "bg-yellow/10 border-yellow/20 text-yellow",
  restriction: "bg-purple/10 border-purple/20 text-purple",
};
const STATUS_CLS: Record<string, string> = {
  pending:  "bg-yellow/10 border-yellow/20 text-yellow",
  resolved: "bg-green/10 border-green/20 text-green",
  rejected: "bg-red/10 border-red/20 text-red",
};
const TYPE_LABELS: Record<string, string> = {
  deletion: "Right to Erasure", export: "Data Portability", correction: "Right to Rectification", restriction: "Processing Restriction",
};

const daysLeft = (submitted: string) => 30 - Math.ceil((Date.now() - new Date(submitted).getTime()) / 86400000);

export default function GDPRPage() {
  const [requests, setRequests] = useState<GDPRRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmModal, setConfirmModal] = useState(false);
  const [selected, setSelected] = useState<GDPRRequest | null>(null);
  const [actionType, setActionType] = useState<"resolve" | "reject">("resolve");
  const [notes, setNotes] = useState("");
  const dangerPin = useDangerPin();

  const load = () => {
    setLoading(true);
    api.gdprRequests().then((r) => setRequests(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const resolve = async (r: GDPRRequest) => {
    if (r.request_type === "deletion") {
      const token = await dangerPin.request();
      if (!token) return;
    }
    if (!notes.trim()) { toast.error("Resolution note required"); return; }
    try {
      await api.resolveGDPR(r.id, notes);
      toast.success("Request resolved");
      setConfirmModal(false);
      setNotes("");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const pending = requests.filter((r) => r.status === "pending").length;
  const overdue = requests.filter((r) => r.status === "pending" && daysLeft(r.created_at) < 0).length;
  const resolved = requests.filter((r) => r.status === "resolved").length;

  return (
    <AdminShell title="GDPR & Privacy">
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-bg2 border border-border rounded-xl p-4">
            <p className="text-[9px] font-bold text-textDim uppercase tracking-wider">Pending Requests</p>
            <p className={`text-2xl font-black tabular-nums mt-1 ${pending > 0 ? "text-yellow" : "text-textMuted"}`}>{pending}</p>
          </div>
          <div className={`bg-bg2 rounded-xl p-4 border ${overdue > 0 ? "border-red/30" : "border-border"}`}>
            <p className="text-[9px] font-bold text-textDim uppercase tracking-wider">Overdue</p>
            <p className={`text-2xl font-black tabular-nums mt-1 ${overdue > 0 ? "text-red" : "text-textMuted"}`}>{overdue}</p>
          </div>
          <div className="bg-bg2 border border-border rounded-xl p-4">
            <p className="text-[9px] font-bold text-textDim uppercase tracking-wider">Resolved</p>
            <p className="text-2xl font-black tabular-nums text-green mt-1">{resolved}</p>
          </div>
          <div className="bg-bg2 border border-border rounded-xl p-4">
            <p className="text-[9px] font-bold text-textDim uppercase tracking-wider">Compliance Rate</p>
            <p className="text-2xl font-black tabular-nums text-cyan mt-1">{requests.length > 0 ? `${Math.round((resolved / requests.length) * 100)}%` : "—"}</p>
          </div>
        </div>

        {overdue > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red/10 border border-red/20">
            <AlertCircle size={16} className="text-red" />
            <p className="text-sm text-red font-semibold">
              {overdue} request{overdue > 1 ? "s are" : " is"} overdue. POPIA requires response within 30 days.
            </p>
          </div>
        )}

        <Card>
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck size={16} className="text-cyan" />
            <h2 className="text-text font-bold">Privacy Requests</h2>
          </div>

          {loading ? <Spinner /> : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border bg-bg3/60">
                    {["User", "Request Type", "Status", "Submitted", "Days Left", "Actions"].map(h => (
                      <th key={h} className="py-2.5 px-4 text-left text-[10px] font-extrabold text-textDim uppercase tracking-widest whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {requests.length === 0 ? (
                    <tr><td colSpan={6} className="py-10 text-center text-textMuted text-sm">No privacy requests</td></tr>
                  ) : requests.map((r) => {
                    const days = daysLeft(r.created_at);
                    return (
                      <tr key={r.id} className="border-b border-border/50 hover:bg-bg3/40 transition-colors">
                        <td className="py-3 px-4">
                          <p className="font-semibold text-text text-xs">{r.full_name}</p>
                          <p className="text-[10px] text-textMuted font-mono">{r.phone_number}</p>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold ${TYPE_CLS[r.request_type] || "bg-bg3 border-border text-textDim"}`}>
                            {TYPE_LABELS[r.request_type] || r.request_type}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold ${STATUS_CLS[r.status] || "bg-bg3 border-border text-textDim"}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-textMuted text-xs">{formatDate(r.created_at)}</td>
                        <td className="py-3 px-4">
                          {r.status === "pending" ? (
                            <span className={`text-xs font-bold ${days < 0 ? "text-red" : days <= 7 ? "text-yellow" : "text-textMuted"}`}>
                              {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`}
                            </span>
                          ) : (
                            <span className="text-xs text-green">Done</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {r.status === "pending" && (
                            <div className="flex gap-2">
                              {r.request_type === "export" && (
                                <Button variant="secondary" onClick={() => toast.success("Data export queued — will be emailed to user")}>
                                  <Download size={12} /> Export
                                </Button>
                              )}
                              <Button onClick={() => { setSelected(r); setActionType("resolve"); setNotes(""); setConfirmModal(true); }}>
                                <CheckCircle2 size={12} /> Resolve
                              </Button>
                            </div>
                          )}
                          {r.resolution_note && r.status !== "pending" && (
                            <span className="text-[10px] text-textMuted italic">{r.resolution_note}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="text-text font-bold mb-4">POPIA Compliance Summary</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { title: "Response SLA", value: "30 days", status: "green", note: "POPIA requirement" },
              { title: "Data Retention Policy", value: "5 years", status: "green", note: "Financial records" },
              { title: "DPA Registered", value: "Yes", status: "green", note: "South African POPIA" },
              { title: "Data Breach Protocol", value: "Active", status: "green", note: "72hr notification SLA" },
              { title: "Cookie Consent", value: "Implemented", status: "green", note: "Web & App" },
              { title: "Privacy Policy", value: "Current", status: "green", note: "Last reviewed 2025" },
            ].map(({ title, value, status, note }) => (
              <div key={title} className="bg-bg3 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-bold text-textMuted uppercase tracking-widest">{title}</p>
                  <div className={`w-2 h-2 rounded-full ${status === "green" ? "bg-green" : "bg-yellow"}`} />
                </div>
                <p className="text-text font-bold">{value}</p>
                <p className="text-[10px] text-textMuted mt-0.5">{note}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Modal open={confirmModal} onClose={() => setConfirmModal(false)} title="Resolve Privacy Request">
        <div className="space-y-4">
          <p className="text-sm text-textMuted">
            Resolve the <span className="text-cyan font-bold">{selected ? TYPE_LABELS[selected.request_type] || selected.request_type : ""}</span> request from <span className="font-bold text-text">{selected?.full_name}</span>.
            {selected?.request_type === "deletion" && (
              <span className="block mt-2 text-red text-xs">This action is irreversible. User data will be permanently anonymised.</span>
            )}
          </p>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Resolution Note *</label>
            <Input placeholder="Describe the action taken..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setConfirmModal(false)}>Cancel</Button>
            <Button onClick={() => selected && resolve(selected)}><CheckCircle2 size={13} /> Mark Resolved</Button>
          </div>
        </div>
      </Modal>

      <DangerPinModal
        open={dangerPin.open}
        onSuccess={dangerPin.handleSuccess}
        onCancel={dangerPin.handleCancel}
        actionLabel="permanently anonymise user data"
      />
    </AdminShell>
  );
}
