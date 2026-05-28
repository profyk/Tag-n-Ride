"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Spinner, Modal, Input, Select } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import { getRole, isSuperAdmin } from "@/lib/api";
import { DangerPinModal, useDangerPin, getDangerToken } from "@/components/DangerPinModal";
import toast from "react-hot-toast";
import {
  Users, Plus, Shield, ShieldX, Eye, EyeOff, Lock, Unlock,
  Edit2, UserX, FileText, Phone, Mail, Building, CreditCard,
  Hash, Calendar, CheckCircle, AlertTriangle, Download,
  Search, Star, Briefcase, UserCheck, Clock,
} from "lucide-react";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = (extra?: Record<string, string>) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
  ...(extra || {}),
});

// ── SA Tax helpers ────────────────────────────────────────────────────────────
function calcAnnualPAYE(annualGross: number): number {
  let tax = 0;
  if      (annualGross <= 237_100)   tax = annualGross * 0.18;
  else if (annualGross <= 370_500)   tax = 42_678  + (annualGross - 237_100) * 0.26;
  else if (annualGross <= 512_800)   tax = 77_362  + (annualGross - 370_500) * 0.31;
  else if (annualGross <= 673_000)   tax = 121_475 + (annualGross - 512_800) * 0.36;
  else if (annualGross <= 857_900)   tax = 179_147 + (annualGross - 673_000) * 0.39;
  else if (annualGross <= 1_817_000) tax = 251_258 + (annualGross - 857_900) * 0.41;
  else                               tax = 644_489 + (annualGross - 1_817_000) * 0.45;
  return Math.max(0, tax - 17_235); // minus primary rebate
}
const monthlyPAYE = (monthly: number) => calcAnnualPAYE(monthly * 12) / 12;
const monthlyUIF  = (monthly: number) => Math.min(monthly * 0.01, 177.12);

const DEPARTMENTS = ["Engineering", "Finance", "Operations", "Business Dev", "Support", "Management", "Marketing", "Legal"];
const EMP_TYPES = ["Permanent", "Fixed-term Contract", "Part-time", "Freelance"];
const STATUS_TONE: Record<string, any> = { active: "green", terminated: "red", probation: "yellow", on_leave: "cyan" };
const SA_BANKS = ["ABSA", "FNB", "Nedbank", "Standard Bank", "Capitec", "Discovery Bank", "Investec", "TymeBank", "African Bank"];
const SA_BRANCH: Record<string, string> = { "ABSA": "632005", "FNB": "250655", "Nedbank": "198765", "Standard Bank": "051001", "Capitec": "470010" };

type Staff = {
  id: string;
  full_name: string;
  role_title: string;
  department: string;
  employment_type: string;
  status: string;
  start_date: string;
  end_date?: string;
  gross_salary: number;
  email?: string;
  phone?: string;
  created_at: string;
  // sensitive — only revealed after PIN
  id_number?: string;
  tax_ref?: string;
  bank_name?: string;
  account_number?: string;
  account_type?: string;
  branch_code?: string;
  emergency_name?: string;
  emergency_phone?: string;
};

// ── Access guard ──────────────────────────────────────────────────────────────
function AccessDenied() {
  return (
    <AdminShell title="Human Resources">
      <div className="flex flex-col items-center justify-center h-80 gap-5">
        <div className="w-20 h-20 rounded-2xl bg-red/10 border border-red/20 flex items-center justify-center">
          <ShieldX size={36} className="text-red" />
        </div>
        <div className="text-center">
          <p className="text-red font-extrabold text-xl">Access Restricted</p>
          <p className="text-textMuted text-sm mt-2 max-w-sm">
            This page is classified. Access is limited to <strong>Superadmin</strong>, <strong>CEO</strong>, and <strong>CFO</strong> roles only.
          </p>
          <p className="text-textDim text-xs mt-3">All access attempts are logged and reviewed.</p>
        </div>
      </div>
    </AdminShell>
  );
}

// ── Masked field ──────────────────────────────────────────────────────────────
function MaskedField({ value, label, icon: Icon }: { value?: string; label: string; icon: any }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2">
        <Icon size={12} className="text-textDim" />
        <span className="text-[11px] text-textMuted font-semibold">{label}</span>
      </div>
      <span className="text-xs font-mono text-text">{value}</span>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyHR({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-5">
      <div className="w-20 h-20 rounded-3xl bg-cyanDim border border-cyan/20 flex items-center justify-center">
        <Users size={34} className="text-cyan" />
      </div>
      <div className="text-center">
        <p className="text-text font-extrabold text-lg">No staff records yet</p>
        <p className="text-textMuted text-sm mt-1">Add your first employee to get started.</p>
      </div>
      <Button onClick={onAdd}><Plus size={13} /> Add First Employee</Button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function HRPage() {
  const role = getRole() || "";
  if (!["superadmin", "ceo", "cfo"].includes(role)) return <AccessDenied />;

  return <HRPageInner />;
}

function HRPageInner() {
  const { open: pinOpen, request: requestPin, handleSuccess: pinSuccess, handleCancel: pinCancel } = useDangerPin();

  const [staff, setStaff]   = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Modals
  const [addModal, setAddModal]   = useState(false);
  const [viewStaff, setViewStaff] = useState<Staff | null>(null);
  const [editStaff, setEditStaff] = useState<Staff | null>(null);
  const [termStaff, setTermStaff] = useState<Staff | null>(null);
  const [termReason, setTermReason] = useState("");
  const [termDate, setTermDate]   = useState("");

  // Revealed sensitive data — cleared on unmount / new reveal
  const [revealed, setRevealed]   = useState<Record<string, Partial<Staff>>>({});

  // Add / Edit form state
  const emptyForm: Partial<Staff> = {
    full_name: "", role_title: "", department: DEPARTMENTS[0],
    employment_type: EMP_TYPES[0], status: "active",
    start_date: new Date().toISOString().split("T")[0],
    gross_salary: 0, email: "", phone: "",
    id_number: "", tax_ref: "", bank_name: SA_BANKS[0],
    account_number: "", account_type: "Current",
    branch_code: "", emergency_name: "", emergency_phone: "",
  };
  const [form, setForm] = useState<Partial<Staff>>(emptyForm);
  const [saving, setSaving]       = useState(false);
  const [terminating, setTerminating] = useState(false);

  // Clear revealed data after 5 min
  useEffect(() => {
    const t = setTimeout(() => setRevealed({}), 5 * 60 * 1000);
    return () => clearTimeout(t);
  }, [revealed]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/admin/hr/staff`, { headers: authHeaders() });
      const d = await res.json();
      setStaff(Array.isArray(d) ? d : (d.staff ?? []));
    } catch { setStaff([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Reveal sensitive data ──
  const handleReveal = async (s: Staff) => {
    if (revealed[s.id]) { setRevealed(prev => { const n = { ...prev }; delete n[s.id]; return n; }); return; }
    const token = await requestPin();
    if (!token) return;
    try {
      const res = await fetch(`${BASE}/api/admin/hr/staff/${s.id}/reveal-sensitive`, {
        method: "POST",
        headers: authHeaders({ "X-Danger-Token": token }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Failed to reveal");
      setRevealed(prev => ({ ...prev, [s.id]: d }));
      toast.success("Sensitive data revealed — auto-hides in 5 min", { duration: 4000 });
    } catch (e: any) { toast.error(e.message); }
  };

  // ── Save staff ──
  const handleSave = async () => {
    if (!form.full_name?.trim() || !form.role_title?.trim() || !form.gross_salary) {
      toast.error("Name, title, and salary are required"); return;
    }
    setSaving(true);
    try {
      const token = editStaff ? getDangerToken() : await requestPin();
      if (!token) { setSaving(false); return; }
      const url = editStaff
        ? `${BASE}/api/admin/hr/staff/${editStaff.id}`
        : `${BASE}/api/admin/hr/staff`;
      const res = await fetch(url, {
        method: editStaff ? "PATCH" : "POST",
        headers: authHeaders({ "X-Danger-Token": token }),
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Failed to save");
      toast.success(editStaff ? "Staff record updated" : "Employee added");
      setAddModal(false); setEditStaff(null);
      setForm(emptyForm); load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  // ── Terminate ──
  const handleTerminate = async () => {
    if (!termStaff || !termReason.trim() || !termDate) {
      toast.error("Reason and date are required"); return;
    }
    const token = await requestPin();
    if (!token) return;
    setTerminating(true);
    try {
      const res = await fetch(`${BASE}/api/admin/hr/staff/${termStaff.id}/terminate`, {
        method: "POST",
        headers: authHeaders({ "X-Danger-Token": token }),
        body: JSON.stringify({ reason: termReason, end_date: termDate }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Failed to terminate");
      toast.success(`${termStaff.full_name} has been terminated`);
      setTermStaff(null); setTermReason(""); setTermDate(""); load();
    } catch (e: any) { toast.error(e.message); }
    finally { setTerminating(false); }
  };

  // ── Export ──
  const handleExport = async () => {
    const token = await requestPin();
    if (!token) return;
    try {
      const res = await fetch(`${BASE}/api/admin/hr/export`, {
        headers: authHeaders({ "X-Danger-Token": token }),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `hr_staff_${new Date().toISOString().split("T")[0]}.csv`;
      a.click(); URL.revokeObjectURL(url);
      toast.success("Export downloaded — store securely");
    } catch (e: any) { toast.error(e.message); }
  };

  // ── Derived metrics ──
  const active = staff.filter(s => s.status === "active").length;
  const totalPayroll = staff.filter(s => s.status === "active").reduce((sum, s) => sum + s.gross_salary, 0);
  const totalPAYE = staff.filter(s => s.status === "active").reduce((sum, s) => sum + monthlyPAYE(s.gross_salary), 0);
  const totalUIF  = staff.filter(s => s.status === "active").reduce((sum, s) => sum + monthlyUIF(s.gross_salary), 0);

  const filtered = staff.filter(s =>
    (!search || s.full_name.toLowerCase().includes(search.toLowerCase()) || s.role_title.toLowerCase().includes(search.toLowerCase())) &&
    (!deptFilter || s.department === deptFilter) &&
    (!statusFilter || s.status === statusFilter)
  );

  const depts = Array.from(new Set(staff.map(s => s.department)));

  const openAdd = () => { setForm(emptyForm); setAddModal(true); };
  const openEdit = (s: Staff) => { setForm({ ...s }); setEditStaff(s); };

  return (
    <AdminShell title="HR · Staff Management">
      <DangerPinModal open={pinOpen} onSuccess={pinSuccess} onCancel={pinCancel} actionLabel="access HR data" />

      <div className="space-y-5">

        {/* Security banner */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-yellow/5 border border-yellow/20">
          <Shield size={15} className="text-yellow flex-shrink-0" />
          <p className="text-yellow text-xs font-semibold">
            <strong>CONFIDENTIAL</strong> — This page contains sensitive personal and financial data protected under POPIA.
            All access is logged, timestamped, and reviewed. Viewing sensitive fields requires Danger PIN verification.
          </p>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Active Employees", value: active, color: "text-cyan", border: "border-cyan/20", icon: UserCheck },
            { label: "Monthly Payroll", value: formatZAR(totalPayroll), color: "text-green", border: "border-green/20", icon: CreditCard },
            { label: "PAYE Liability", value: formatZAR(totalPAYE), color: "text-yellow", border: "border-yellow/20", icon: Hash },
            { label: "UIF (Employee)", value: formatZAR(totalUIF), color: "text-purple", border: "border-purple/20", icon: Shield },
          ].map(({ label, value, color, border, icon: Ic }) => (
            <div key={label} className={`bg-bg2 border rounded-xl p-4 ${border}`}>
              <div className="flex items-center gap-2 mb-2">
                <Ic size={14} className={color} />
                <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest">{label}</p>
              </div>
              <p className={`text-xl font-black ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-textDim" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, title..."
              className="w-full bg-bg2 border border-border rounded-lg pl-8 pr-3 py-2 text-xs text-text placeholder:text-textDim focus:outline-none focus:border-cyan" />
          </div>
          <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
            className="bg-bg2 border border-border rounded-lg px-3 py-2 text-xs text-text focus:outline-none focus:border-cyan">
            <option value="">All Departments</option>
            {depts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="bg-bg2 border border-border rounded-lg px-3 py-2 text-xs text-text focus:outline-none focus:border-cyan">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="probation">Probation</option>
            <option value="on_leave">On Leave</option>
            <option value="terminated">Terminated</option>
          </select>
          <div className="flex gap-2 ml-auto">
            <Button variant="secondary" onClick={handleExport}><Download size={13} /> Export</Button>
            <Button onClick={openAdd}><Plus size={13} /> Add Employee</Button>
          </div>
        </div>

        {/* Staff table */}
        {loading ? <Spinner /> : !filtered.length ? (
          staff.length === 0 ? <EmptyHR onAdd={openAdd} /> : (
            <div className="text-center py-12 text-textMuted">No employees match the filter</div>
          )
        ) : (
          <Table headers={["Employee", "Department", "Role", "Type", "Gross Salary", "PAYE", "UIF", "Status", "Start", ""]}
            empty={false}>
            {filtered.map(s => {
              const paye = monthlyPAYE(s.gross_salary);
              const uif  = monthlyUIF(s.gross_salary);
              const net  = s.gross_salary - paye - uif;
              const isRevealed = !!revealed[s.id];
              return (
                <Tr key={s.id} onClick={() => setViewStaff(s)}>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-cyanDim border border-cyan/20 flex items-center justify-center text-[11px] font-extrabold text-cyan">
                        {s.full_name.split(" ").map(n => n[0]).slice(0, 2).join("")}
                      </div>
                      <div>
                        <p className="font-semibold text-text text-xs">{s.full_name}</p>
                        <p className="text-textDim text-[10px]">{s.email || "—"}</p>
                      </div>
                    </div>
                  </Td>
                  <Td className="text-textMuted text-xs">{s.department}</Td>
                  <Td className="text-textMuted text-xs">{s.role_title}</Td>
                  <Td><Badge label={s.employment_type} tone="cyan" /></Td>
                  <Td className="font-bold text-green">{formatZAR(s.gross_salary)}</Td>
                  <Td className="text-yellow text-xs">{formatZAR(paye)}</Td>
                  <Td className="text-purple text-xs">{formatZAR(uif)}</Td>
                  <Td><Badge label={s.status} tone={STATUS_TONE[s.status] || "cyan"} /></Td>
                  <Td className="text-textDim text-xs">{formatDate(s.start_date)}</Td>
                  <Td onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleReveal(s)}
                        title={isRevealed ? "Hide sensitive data" : "Reveal sensitive data"}
                        className={`p-1.5 rounded-lg border transition-all ${isRevealed ? "bg-yellow/10 border-yellow/30 text-yellow" : "border-border text-textDim hover:text-yellow hover:border-yellow/30"}`}>
                        {isRevealed ? <Unlock size={11} /> : <Lock size={11} />}
                      </button>
                      <button onClick={() => openEdit(s)}
                        className="p-1.5 rounded-lg border border-border text-textDim hover:text-cyan hover:border-cyan/30 transition-all">
                        <Edit2 size={11} />
                      </button>
                      {s.status !== "terminated" && (
                        <button onClick={() => setTermStaff(s)}
                          className="p-1.5 rounded-lg border border-border text-textDim hover:text-red hover:border-red/30 transition-all">
                          <UserX size={11} />
                        </button>
                      )}
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </Table>
        )}
      </div>

      {/* ── View Staff Modal ── */}
      <Modal open={!!viewStaff} onClose={() => setViewStaff(null)} title="Employee Record">
        {viewStaff && (() => {
          const paye = monthlyPAYE(viewStaff.gross_salary);
          const uif  = monthlyUIF(viewStaff.gross_salary);
          const net  = viewStaff.gross_salary - paye - uif;
          const rev  = revealed[viewStaff.id] || {};
          const isRevealed = !!revealed[viewStaff.id];
          return (
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {/* Header */}
              <div className="flex items-center gap-4 pb-4 border-b border-border">
                <div className="w-14 h-14 rounded-2xl bg-cyanDim border border-cyan/20 flex items-center justify-center text-xl font-extrabold text-cyan">
                  {viewStaff.full_name.split(" ").map(n => n[0]).slice(0, 2).join("")}
                </div>
                <div>
                  <p className="text-text font-extrabold text-base">{viewStaff.full_name}</p>
                  <p className="text-textMuted text-sm">{viewStaff.role_title} · {viewStaff.department}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge label={viewStaff.status} tone={STATUS_TONE[viewStaff.status] || "cyan"} />
                    <Badge label={viewStaff.employment_type} tone="purple" />
                  </div>
                </div>
              </div>

              {/* Pay breakdown */}
              <div className="bg-bg rounded-xl border border-border p-4">
                <p className="text-[10px] font-extrabold text-textDim uppercase tracking-widest mb-3">Compensation</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { l: "Gross Salary", v: formatZAR(viewStaff.gross_salary), c: "text-text" },
                    { l: "PAYE (est.)", v: `- ${formatZAR(paye)}`, c: "text-yellow" },
                    { l: "UIF (1%)", v: `- ${formatZAR(uif)}`, c: "text-purple" },
                    { l: "Net Pay", v: formatZAR(net), c: "text-green" },
                  ].map(item => (
                    <div key={item.l} className="bg-bg2 rounded-lg p-3">
                      <p className="text-[10px] text-textDim uppercase tracking-widest">{item.l}</p>
                      <p className={`font-extrabold mt-1 ${item.c}`}>{item.v}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Basic info */}
              <div className="bg-bg rounded-xl border border-border p-4">
                <p className="text-[10px] font-extrabold text-textDim uppercase tracking-widest mb-3">Details</p>
                <MaskedField value={viewStaff.email}  label="Work Email"  icon={Mail} />
                <MaskedField value={viewStaff.phone}  label="Phone"       icon={Phone} />
                <MaskedField value={formatDate(viewStaff.start_date)} label="Start Date" icon={Calendar} />
                {viewStaff.end_date && <MaskedField value={formatDate(viewStaff.end_date)} label="End Date" icon={Calendar} />}
              </div>

              {/* Sensitive data */}
              <div className={`rounded-xl border p-4 ${isRevealed ? "bg-yellow/5 border-yellow/30" : "bg-bg border-border"}`}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-extrabold text-textDim uppercase tracking-widest flex items-center gap-1.5">
                    <Lock size={10} /> Sensitive Information
                  </p>
                  <button
                    onClick={() => handleReveal(viewStaff)}
                    className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${
                      isRevealed ? "bg-yellow/10 border-yellow/30 text-yellow" : "border-border text-textMuted hover:border-cyan/30 hover:text-cyan"
                    }`}>
                    {isRevealed ? <><Unlock size={11} /> Hide</> : <><Lock size={11} /> Reveal (PIN)</>}
                  </button>
                </div>
                {isRevealed ? (
                  <>
                    <MaskedField value={rev.id_number}      label="SA ID Number"    icon={Hash} />
                    <MaskedField value={rev.tax_ref}        label="SARS Tax Ref"    icon={FileText} />
                    <MaskedField value={rev.bank_name}      label="Bank"            icon={Building} />
                    <MaskedField value={rev.account_number} label="Account Number"  icon={CreditCard} />
                    <MaskedField value={rev.account_type}   label="Account Type"    icon={Briefcase} />
                    <MaskedField value={rev.branch_code}    label="Branch Code"     icon={Hash} />
                    <MaskedField value={rev.emergency_name} label="Emergency Contact" icon={Phone} />
                    <MaskedField value={rev.emergency_phone}label="Emergency Phone" icon={Phone} />
                    <div className="mt-3 flex items-center gap-1.5 text-[10px] text-yellow">
                      <Clock size={10} /> Auto-hidden in 5 minutes
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-4">
                    <Lock size={24} className="text-textDim" />
                    <p className="text-textMuted text-xs">Enter Danger PIN to reveal sensitive fields</p>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="secondary" onClick={() => { setViewStaff(null); openEdit(viewStaff); }}>
                  <Edit2 size={13} /> Edit
                </Button>
                {viewStaff.status !== "terminated" && (
                  <Button variant="secondary" onClick={() => { setViewStaff(null); setTermStaff(viewStaff); }}>
                    <UserX size={13} /> Terminate
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setViewStaff(null)}>Close</Button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* ── Add / Edit Modal ── */}
      <Modal
        open={addModal || !!editStaff}
        onClose={() => { setAddModal(false); setEditStaff(null); setForm(emptyForm); }}
        title={editStaff ? "Edit Employee" : "Add Employee"}>
        <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">

          {/* Basic info */}
          <div>
            <p className="text-[10px] font-extrabold text-textDim uppercase tracking-widest mb-3">Basic Information</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-sm">Full Name</label>
                  <Input value={form.full_name || ""} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Jane Smith" />
                </div>
                <div>
                  <label className="label-sm">Job Title</label>
                  <Input value={form.role_title || ""} onChange={e => setForm(f => ({ ...f, role_title: e.target.value }))} placeholder="Senior Developer" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-sm">Department</label>
                  <Select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} className="w-full">
                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </Select>
                </div>
                <div>
                  <label className="label-sm">Employment Type</label>
                  <Select value={form.employment_type} onChange={e => setForm(f => ({ ...f, employment_type: e.target.value }))} className="w-full">
                    {EMP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-sm">Status</label>
                  <Select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full">
                    <option value="active">Active</option>
                    <option value="probation">Probation</option>
                    <option value="on_leave">On Leave</option>
                  </Select>
                </div>
                <div>
                  <label className="label-sm">Start Date</label>
                  <Input type="date" value={form.start_date || ""} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-sm">Work Email</label>
                  <Input type="email" value={form.email || ""} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@tag-n-ride.co.za" />
                </div>
                <div>
                  <label className="label-sm">Phone</label>
                  <Input value={form.phone || ""} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="071 234 5678" />
                </div>
              </div>
            </div>
          </div>

          {/* Compensation */}
          <div>
            <p className="text-[10px] font-extrabold text-textDim uppercase tracking-widest mb-3">Compensation</p>
            <div>
              <label className="label-sm">Monthly Gross Salary (ZAR)</label>
              <Input type="number" value={form.gross_salary || ""} onChange={e => setForm(f => ({ ...f, gross_salary: parseFloat(e.target.value) || 0 }))} placeholder="25000" />
              {(form.gross_salary || 0) > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {[
                    { l: "PAYE est.", v: formatZAR(monthlyPAYE(form.gross_salary || 0)), c: "text-yellow" },
                    { l: "UIF (1%)", v: formatZAR(monthlyUIF(form.gross_salary || 0)), c: "text-purple" },
                    { l: "Net Pay", v: formatZAR((form.gross_salary || 0) - monthlyPAYE(form.gross_salary || 0) - monthlyUIF(form.gross_salary || 0)), c: "text-green" },
                  ].map(i => (
                    <div key={i.l} className="bg-bg rounded-lg border border-border p-2 text-center">
                      <p className="text-[10px] text-textDim">{i.l}</p>
                      <p className={`text-sm font-bold mt-0.5 ${i.c}`}>{i.v}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sensitive info — locked behind warning */}
          <div className="border border-yellow/20 rounded-xl p-4 bg-yellow/5">
            <p className="text-[10px] font-extrabold text-yellow uppercase tracking-widest mb-1 flex items-center gap-1.5">
              <Lock size={10} /> Sensitive Data — Stored Encrypted
            </p>
            <p className="text-textDim text-[10px] mb-3">This data is encrypted at rest and requires Danger PIN to view.</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-sm">SA ID Number</label>
                  <Input value={form.id_number || ""} onChange={e => setForm(f => ({ ...f, id_number: e.target.value }))} placeholder="8001015009087" maxLength={13} />
                </div>
                <div>
                  <label className="label-sm">SARS Tax Ref No.</label>
                  <Input value={form.tax_ref || ""} onChange={e => setForm(f => ({ ...f, tax_ref: e.target.value }))} placeholder="1234567890" maxLength={10} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-sm">Bank Name</label>
                  <Select value={form.bank_name} onChange={e => {
                    const b = e.target.value;
                    setForm(f => ({ ...f, bank_name: b, branch_code: SA_BRANCH[b] || "" }));
                  }} className="w-full">
                    {SA_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                  </Select>
                </div>
                <div>
                  <label className="label-sm">Account Type</label>
                  <Select value={form.account_type} onChange={e => setForm(f => ({ ...f, account_type: e.target.value }))} className="w-full">
                    <option value="Current">Current / Cheque</option>
                    <option value="Savings">Savings</option>
                    <option value="Transmission">Transmission</option>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-sm">Account Number</label>
                  <Input value={form.account_number || ""} onChange={e => setForm(f => ({ ...f, account_number: e.target.value }))} placeholder="1234567890" />
                </div>
                <div>
                  <label className="label-sm">Branch Code</label>
                  <Input value={form.branch_code || ""} onChange={e => setForm(f => ({ ...f, branch_code: e.target.value }))} placeholder="470010" maxLength={6} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-sm">Emergency Contact Name</label>
                  <Input value={form.emergency_name || ""} onChange={e => setForm(f => ({ ...f, emergency_name: e.target.value }))} placeholder="John Smith" />
                </div>
                <div>
                  <label className="label-sm">Emergency Phone</label>
                  <Input value={form.emergency_phone || ""} onChange={e => setForm(f => ({ ...f, emergency_phone: e.target.value }))} placeholder="082 345 6789" />
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" onClick={() => { setAddModal(false); setEditStaff(null); setForm(emptyForm); }}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>
              {editStaff ? <><Edit2 size={13} /> Save Changes</> : <><Plus size={13} /> Add Employee</>}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Terminate Modal ── */}
      <Modal open={!!termStaff} onClose={() => { setTermStaff(null); setTermReason(""); setTermDate(""); }} title="Terminate Employee">
        {termStaff && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-red/5 border border-red/20">
              <AlertTriangle size={18} className="text-red flex-shrink-0" />
              <div>
                <p className="font-bold text-red text-sm">You are about to terminate:</p>
                <p className="text-text font-extrabold">{termStaff.full_name}</p>
                <p className="text-textMuted text-xs">{termStaff.role_title} · {termStaff.department}</p>
              </div>
            </div>
            <div>
              <label className="label-sm">Termination Date</label>
              <Input type="date" value={termDate} onChange={e => setTermDate(e.target.value)} />
            </div>
            <div>
              <label className="label-sm">Reason for Termination</label>
              <textarea value={termReason} onChange={e => setTermReason(e.target.value)}
                placeholder="Reason for termination (required for compliance)..."
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-textDim focus:outline-none focus:border-red resize-none h-20" />
            </div>
            <p className="text-textDim text-xs flex items-center gap-1.5">
              <Shield size={10} /> Requires Danger PIN verification. Action is irreversible.
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => { setTermStaff(null); setTermReason(""); setTermDate(""); }}>Cancel</Button>
              <button onClick={handleTerminate} disabled={terminating || !termReason.trim() || !termDate}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red text-white text-sm font-bold disabled:opacity-50 hover:bg-red/90 transition-all">
                {terminating ? "Processing…" : <><UserX size={13} /> Terminate & Confirm</>}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Global style helper */}
      <style>{`.label-sm { display: block; font-size: 10px; font-weight: 700; color: var(--textMuted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; }`}</style>
    </AdminShell>
  );
}
