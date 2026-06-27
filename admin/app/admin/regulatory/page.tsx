"use client";
import { useEffect, useState, useMemo } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Button, Spinner, Input, Modal, Select, Card } from "@/components/ui";
import { api, isSuperAdmin, hasPermission } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  Download, AlertTriangle, FileText, CheckCircle, Clock,
  Search, X, Shield, Scale, Eye, Plus,
} from "lucide-react";
import toast from "react-hot-toast";

// South African FIC thresholds (FICA 2001)
const CTR_THRESHOLD = 25000;   // R25,000 — Cash Transaction Report threshold
const SAR_NOTE = "Under FICA 2001 & POFA 2017, Tag n Ride must report cash transactions ≥ R25,000 to the Financial Intelligence Centre (FIC) within 2 business days, and file SARs for suspicious activity immediately.";

type SARRecord = {
  id: string;
  date: string;
  subject_name: string;
  subject_phone: string;
  transaction_ref: string;
  amount: number;
  reason: string;
  status: "draft" | "filed" | "no_action";
  filed_date?: string;
  notes?: string;
};

const SAR_STATUS_CLS: Record<string, string> = {
  draft:     "bg-yellow/10 border-yellow/20 text-yellow",
  filed:     "bg-green/10 border-green/20 text-green",
  no_action: "bg-bg3 border-border text-textMuted",
};

function useSARStorage() {
  const key = "tnr_sar_records";
  const load = (): SARRecord[] => {
    try { return JSON.parse(localStorage.getItem(key) ?? "[]"); } catch { return []; }
  };
  const save = (records: SARRecord[]) => {
    localStorage.setItem(key, JSON.stringify(records));
  };
  return { load, save };
}

const SAR_REASONS = [
  "Unusual transaction pattern — amount inconsistent with known income",
  "Round-amount transactions suggesting structuring",
  "High-velocity transactions across multiple sessions",
  "Suspected identity fraud — details don't match",
  "User previously blacklisted or flagged by another institution",
  "Transaction inconsistent with stated business purpose",
  "Multiple accounts linked to same device/identity",
];

export default function RegulatoryPage() {
  const canView = hasPermission("view_audit") || isSuperAdmin();
  const [largeTxns, setLargeTxns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [tab, setTab] = useState<"ctr" | "sar" | "summary">("summary");

  const [sarRecords, setSarRecords] = useState<SARRecord[]>([]);
  const [newSAR, setNewSAR] = useState<Partial<SARRecord>>({});
  const [sarModal, setSarModal] = useState(false);
  const [viewSAR, setViewSAR] = useState<SARRecord | null>(null);

  const { load: loadSAR, save: saveSAR } = useSARStorage();

  useEffect(() => {
    setSarRecords(loadSAR());
    loadLargeTxns();
  }, []);

  const loadLargeTxns = async () => {
    setLoading(true);
    try {
      const r = await api.transactions({ min_amount: CTR_THRESHOLD });
      setLargeTxns(r.data ?? []);
    } finally { setLoading(false); }
  };

  const filtered = useMemo(() => largeTxns.filter(t => {
    if (search) {
      const q = search.toLowerCase();
      if (!t.reference?.toLowerCase().includes(q) && !t.sender_name?.toLowerCase().includes(q) && !t.receiver_name?.toLowerCase().includes(q)) return false;
    }
    if (from && new Date(t.created_at) < new Date(from)) return false;
    if (to && new Date(t.created_at) > new Date(to + "T23:59:59")) return false;
    return true;
  }), [largeTxns, search, from, to]);

  const createSAR = () => {
    if (!newSAR.subject_name || !newSAR.reason) {
      toast.error("Subject name and reason are required"); return;
    }
    const record: SARRecord = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      subject_name: newSAR.subject_name ?? "",
      subject_phone: newSAR.subject_phone ?? "",
      transaction_ref: newSAR.transaction_ref ?? "",
      amount: newSAR.amount ?? 0,
      reason: newSAR.reason ?? "",
      status: "draft",
      notes: newSAR.notes,
    };
    const updated = [record, ...sarRecords];
    setSarRecords(updated);
    saveSAR(updated);
    setSarModal(false);
    setNewSAR({});
    toast.success("SAR draft created");
  };

  const updateSARStatus = (id: string, status: SARRecord["status"]) => {
    const updated = sarRecords.map(r => r.id === id ? { ...r, status, ...(status === "filed" ? { filed_date: new Date().toISOString() } : {}) } : r);
    setSarRecords(updated);
    saveSAR(updated);
    toast.success(`SAR marked as ${status.replace("_", " ")}`);
  };

  const exportSARs = () => {
    const rows = [
      ["Date", "Subject", "Phone", "Transaction Ref", "Amount", "Reason", "Status", "Filed Date"],
      ...sarRecords.map(r => [
        formatDate(r.date), r.subject_name, r.subject_phone, r.transaction_ref,
        formatZAR(r.amount), r.reason, r.status, r.filed_date ? formatDate(r.filed_date) : "",
      ]),
    ];
    const csv = rows.map(row => row.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `tnr-sar-records-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    toast.success("SAR records exported");
  };

  const exportCTR = () => {
    const rows = [
      ["Date", "Reference", "Type", "Amount", "Sender", "Receiver", "Status"],
      ...filtered.map(t => [
        formatDate(t.created_at), t.reference ?? "", t.type ?? "",
        formatZAR(t.amount), t.sender_name ?? "", t.receiver_name ?? "", t.status ?? "",
      ]),
    ];
    const csv = rows.map(row => row.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `tnr-ctr-report-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    toast.success("CTR report exported");
  };

  const draftSARs = sarRecords.filter(r => r.status === "draft").length;
  const filedSARs = sarRecords.filter(r => r.status === "filed").length;
  const ctrCount = largeTxns.length;

  return (
    <AdminShell title="Regulatory Compliance">
      <div className="space-y-5">

        {/* FICA Notice */}
        <div className="flex items-start gap-3 p-4 bg-yellow/5 border border-yellow/20 rounded-xl">
          <AlertTriangle size={16} className="text-yellow flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-yellow text-xs font-bold mb-1">FICA 2001 & FIC Act Compliance Notice</p>
            <p className="text-textMuted text-xs leading-relaxed">{SAR_NOTE}</p>
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="text-center">
            <p className={`text-2xl font-extrabold ${ctrCount > 0 ? "text-yellow" : "text-green"}`}>{ctrCount}</p>
            <p className="text-xs text-textMuted mt-1">CTR Transactions</p>
            <p className="text-[10px] text-textDim mt-0.5">≥ R{CTR_THRESHOLD.toLocaleString()}</p>
          </Card>
          <Card className="text-center">
            <p className={`text-2xl font-extrabold ${draftSARs > 0 ? "text-yellow" : "text-green"}`}>{draftSARs}</p>
            <p className="text-xs text-textMuted mt-1">Draft SARs</p>
            <p className="text-[10px] text-textDim mt-0.5">Needs filing</p>
          </Card>
          <Card className="text-center">
            <p className="text-2xl font-extrabold text-green">{filedSARs}</p>
            <p className="text-xs text-textMuted mt-1">SARs Filed</p>
            <p className="text-[10px] text-textDim mt-0.5">With FIC</p>
          </Card>
          <Card className="text-center">
            <p className="text-2xl font-extrabold text-cyan">{sarRecords.length}</p>
            <p className="text-xs text-textMuted mt-1">Total SAR Records</p>
            <p className="text-[10px] text-textDim mt-0.5">All time</p>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border pb-2">
          {[
            { key: "summary", label: "Summary" },
            { key: "ctr",     label: `CTR Transactions (${ctrCount})` },
            { key: "sar",     label: `SAR Records (${sarRecords.length})` },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              className={`px-4 py-2 text-sm font-bold rounded-t-lg transition-all ${
                tab === t.key ? "text-cyan border-b-2 border-cyan" : "text-textMuted hover:text-text"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* SUMMARY TAB */}
        {tab === "summary" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-bg2 border border-border rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-text flex items-center gap-2"><Scale size={14} className="text-yellow" /> Compliance Checklist</h3>
              {[
                { label: "KYC verification for all drivers", done: true, note: "All drivers must have approved KYC before receiving payments" },
                { label: "Transaction monitoring (velocity)", done: true, note: "High-frequency alerts configured in Compliance & Risk page" },
                { label: "Large transaction reporting (CTR)", done: ctrCount === 0, note: `${ctrCount} transactions ≥ R25,000 require filing` },
                { label: "SAR filings up to date", done: draftSARs === 0, note: `${draftSARs} draft SARs waiting to be filed with FIC` },
                { label: "Blacklist screening active", done: true, note: "Compliance page maintains manual blacklist" },
                { label: "Data retention policy (POPIA)", done: false, note: "Implement 5-year transaction record retention — manual process" },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  {item.done
                    ? <CheckCircle size={15} className="text-green flex-shrink-0 mt-0.5" />
                    : <AlertTriangle size={15} className="text-yellow flex-shrink-0 mt-0.5" />}
                  <div>
                    <p className={`text-xs font-semibold ${item.done ? "text-text" : "text-yellow"}`}>{item.label}</p>
                    <p className="text-textDim text-[10px] mt-0.5">{item.note}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-bg2 border border-border rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-text flex items-center gap-2"><FileText size={14} className="text-cyan" /> Regulatory Reference</h3>
              {[
                { law: "FICA 2001", desc: "Financial Intelligence Centre Act — AML/CFT framework", threshold: "R25,000 CTR, immediate SAR" },
                { law: "POFA 2017", desc: "Prevention of Organised Crime Act — proceeds of crime", threshold: "Any suspicious amount" },
                { law: "POPIA 2013", desc: "Protection of Personal Information Act — data privacy", threshold: "User data handling & retention" },
                { law: "SARB Directive 4", desc: "Reserve Bank payment system oversight", threshold: "All payment service providers" },
                { law: "NPS Act 2023", desc: "National Payment System Act — licensing requirement", threshold: "Fintech PSP registration" },
              ].map((item, i) => (
                <div key={i} className="flex justify-between items-start py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-cyan text-xs font-bold">{item.law}</p>
                    <p className="text-textMuted text-[10px] mt-0.5">{item.desc}</p>
                  </div>
                  <span className="text-textDim text-[10px] text-right max-w-[40%]">{item.threshold}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTR TAB */}
        {tab === "ctr" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 bg-yellow/5 border border-yellow/20 rounded-xl">
              <AlertTriangle size={13} className="text-yellow" />
              <p className="text-yellow text-xs">
                {filtered.length} transaction{filtered.length !== 1 ? "s" : ""} ≥ R{CTR_THRESHOLD.toLocaleString()} must be reported to the FIC within 2 business days.
              </p>
            </div>

            <div className="flex gap-3 flex-wrap items-center">
              <Input placeholder="Search reference, sender, receiver..." value={search} onChange={e => setSearch(e.target.value)} className="flex-1 min-w-0" />
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-36" />
              <span className="text-textDim text-xs">to</span>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-36" />
              {(search || from || to) && <Button variant="ghost" onClick={() => { setSearch(""); setFrom(""); setTo(""); }}><X size={13} /></Button>}
              <Button variant="secondary" onClick={exportCTR} disabled={filtered.length === 0}><Download size={13} /> Export CTR CSV</Button>
            </div>

            {loading ? <Spinner /> : filtered.length === 0 ? (
              <div className="text-center py-12 text-textMuted border border-dashed border-border rounded-xl">
                <p className="font-semibold">No CTR transactions found</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-bg2">
                      {["Date","Reference","Type","Amount","Sender","Receiver","Status","Action"].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-[10px] font-bold text-textMuted uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(t => (
                      <tr key={t.id} className="border-b border-border last:border-0 hover:bg-bg2/50 transition-colors">
                        <td className="px-4 py-3 text-xs text-textMuted">{formatDate(t.created_at)}</td>
                        <td className="px-4 py-3"><span className="font-mono text-[11px] text-cyan">{t.reference?.slice(0, 16) ?? "—"}</span></td>
                        <td className="px-4 py-3"><span className="inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold bg-cyan/10 border-cyan/20 text-cyan">{t.type ?? "—"}</span></td>
                        <td className="px-4 py-3"><span className="font-bold text-yellow">{formatZAR(t.amount)}</span></td>
                        <td className="px-4 py-3 text-xs text-textMuted">{t.sender_name ?? "—"}</td>
                        <td className="px-4 py-3 text-xs text-textMuted">{t.receiver_name ?? "—"}</td>
                        <td className="px-4 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold ${t.status === "completed" ? "bg-green/10 border-green/20 text-green" : "bg-yellow/10 border-yellow/20 text-yellow"}`}>{t.status ?? "—"}</span></td>
                        <td className="px-4 py-3">
                          <Button variant="secondary" onClick={() => {
                            setNewSAR({
                              transaction_ref: t.reference ?? "",
                              amount: t.amount,
                              subject_name: t.sender_name ?? t.receiver_name ?? "",
                              reason: "Large transaction ≥ R25,000 — CTR required",
                            });
                            setSarModal(true);
                          }}>
                            <Plus size={11} /> SAR
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* SAR TAB */}
        {tab === "sar" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-textMuted">
                Suspicious Activity Reports are stored locally. Export and file with the FIC via their goAML portal.
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={exportSARs} disabled={sarRecords.length === 0}><Download size={13} /> Export All</Button>
                <Button onClick={() => { setNewSAR({}); setSarModal(true); }}><Plus size={13} /> New SAR</Button>
              </div>
            </div>

            {sarRecords.length === 0 ? (
              <div className="text-center py-12 text-textMuted border border-dashed border-border rounded-xl">
                <FileText size={32} className="mx-auto mb-3 opacity-40" />
                <p className="font-semibold">No SAR records yet</p>
                <p className="text-xs mt-1">Create a SAR when you identify suspicious activity</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-bg2">
                      {["Date","Subject","Transaction","Amount","Reason","Status","Actions"].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-[10px] font-bold text-textMuted uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sarRecords.map(r => (
                      <tr key={r.id} className="border-b border-border last:border-0 hover:bg-bg2/50 transition-colors">
                        <td className="px-4 py-3 text-xs text-textMuted">{formatDate(r.date)}</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-xs">{r.subject_name}</p>
                          {r.subject_phone && <p className="text-textDim text-[10px] font-mono">{r.subject_phone}</p>}
                        </td>
                        <td className="px-4 py-3"><span className="font-mono text-[10px] text-cyan">{r.transaction_ref || "—"}</span></td>
                        <td className="px-4 py-3 font-bold">{r.amount > 0 ? formatZAR(r.amount) : "—"}</td>
                        <td className="px-4 py-3 text-xs text-textMuted max-w-[200px] truncate">{r.reason}</td>
                        <td className="px-4 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold ${SAR_STATUS_CLS[r.status] ?? SAR_STATUS_CLS.draft}`}>{r.status.replace("_", " ")}</span></td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5">
                            <Button variant="ghost" onClick={() => setViewSAR(r)}><Eye size={12} /></Button>
                            {r.status === "draft" && (
                              <Button variant="secondary" onClick={() => updateSARStatus(r.id, "filed")}>
                                <CheckCircle size={12} /> Filed
                              </Button>
                            )}
                            {r.status === "draft" && (
                              <Button variant="ghost" onClick={() => updateSARStatus(r.id, "no_action")}>No Action</Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* New SAR Modal */}
      <Modal open={sarModal} onClose={() => setSarModal(false)} title="Create Suspicious Activity Report">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest block mb-1.5">Subject Name *</label>
              <Input value={newSAR.subject_name ?? ""} onChange={e => setNewSAR(p => ({ ...p, subject_name: e.target.value }))} placeholder="Full name" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest block mb-1.5">Phone / ID</label>
              <Input value={newSAR.subject_phone ?? ""} onChange={e => setNewSAR(p => ({ ...p, subject_phone: e.target.value }))} placeholder="+27..." />
            </div>
            <div>
              <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest block mb-1.5">Transaction Reference</label>
              <Input value={newSAR.transaction_ref ?? ""} onChange={e => setNewSAR(p => ({ ...p, transaction_ref: e.target.value }))} placeholder="TNR-..." />
            </div>
            <div>
              <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest block mb-1.5">Amount (R)</label>
              <Input type="number" value={newSAR.amount ?? ""} onChange={e => setNewSAR(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))} placeholder="0.00" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest block mb-2">Reason for SAR *</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {SAR_REASONS.map(r => (
                <button key={r} onClick={() => setNewSAR(p => ({ ...p, reason: r }))}
                  className={`text-[10px] px-2.5 py-1 rounded-lg border transition-all text-left ${
                    newSAR.reason === r ? "bg-yellow/10 text-yellow border-yellow/20" : "text-textMuted border-border hover:border-yellow/30"
                  }`}>
                  {r}
                </button>
              ))}
            </div>
            <Input value={newSAR.reason ?? ""} onChange={e => setNewSAR(p => ({ ...p, reason: e.target.value }))} placeholder="Or describe custom reason..." />
          </div>
          <div>
            <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest block mb-1.5">Additional Notes</label>
            <Input value={newSAR.notes ?? ""} onChange={e => setNewSAR(p => ({ ...p, notes: e.target.value }))} placeholder="Supporting detail..." />
          </div>
          <div className="flex gap-3 justify-end border-t border-border pt-3">
            <Button variant="secondary" onClick={() => setSarModal(false)}>Cancel</Button>
            <Button onClick={createSAR}><Plus size={13} /> Create SAR Draft</Button>
          </div>
        </div>
      </Modal>

      {/* View SAR Modal */}
      {viewSAR && (
        <Modal open={!!viewSAR} onClose={() => setViewSAR(null)} title="SAR Record">
          <div className="space-y-3">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold ${SAR_STATUS_CLS[viewSAR.status] ?? SAR_STATUS_CLS.draft}`}>{viewSAR.status.replace("_", " ")}</span>
            {[
              { l: "Date Created", v: formatDate(viewSAR.date) },
              { l: "Subject Name", v: viewSAR.subject_name },
              { l: "Phone / ID", v: viewSAR.subject_phone || "—" },
              { l: "Transaction Ref", v: viewSAR.transaction_ref || "—" },
              { l: "Amount", v: viewSAR.amount > 0 ? formatZAR(viewSAR.amount) : "—" },
              { l: "Filed Date", v: viewSAR.filed_date ? formatDate(viewSAR.filed_date) : "Not yet filed" },
            ].map(row => (
              <div key={row.l} className="flex justify-between py-2 border-b border-border last:border-0">
                <span className="text-textMuted text-xs">{row.l}</span>
                <span className="text-text text-xs font-medium">{row.v}</span>
              </div>
            ))}
            <div className="bg-bg border border-border rounded-lg p-3">
              <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Reason</p>
              <p className="text-text text-sm">{viewSAR.reason}</p>
            </div>
            {viewSAR.notes && (
              <div className="bg-bg border border-border rounded-lg p-3">
                <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Notes</p>
                <p className="text-text text-sm">{viewSAR.notes}</p>
              </div>
            )}
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="secondary" onClick={() => setViewSAR(null)}>Close</Button>
              {viewSAR.status === "draft" && (
                <Button onClick={() => { updateSARStatus(viewSAR.id, "filed"); setViewSAR(null); }}>
                  <CheckCircle size={13} /> Mark as Filed
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </AdminShell>
  );
}
