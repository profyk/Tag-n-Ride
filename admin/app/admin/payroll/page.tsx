"use client";
import { useEffect, useState, useCallback } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Spinner, Modal, Input } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import { getRole } from "@/lib/api";
import { DangerPinModal, useDangerPin, getDangerToken } from "@/components/DangerPinModal";
import toast from "react-hot-toast";
import {
  ShieldX, Shield, Users, CheckCircle, AlertTriangle,
  Eye, Download, Plus, Clock, FileText, Send,
  UserCheck, Banknote, CreditCard, Hash, RefreshCw,
  TrendingUp, TrendingDown, X, ChevronRight, Building,
  Play, Pause, RotateCcw,
} from "lucide-react";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = (extra?: Record<string, string>) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
  ...(extra || {}),
});

// ── SA Tax helpers ─────────────────────────────────────────────────────────────
function calcAnnualPAYE(annualGross: number): number {
  let tax = 0;
  if      (annualGross <= 237_100)   tax = annualGross * 0.18;
  else if (annualGross <= 370_500)   tax = 42_678  + (annualGross - 237_100) * 0.26;
  else if (annualGross <= 512_800)   tax = 77_362  + (annualGross - 370_500) * 0.31;
  else if (annualGross <= 673_000)   tax = 121_475 + (annualGross - 512_800) * 0.36;
  else if (annualGross <= 857_900)   tax = 179_147 + (annualGross - 673_000) * 0.39;
  else if (annualGross <= 1_817_000) tax = 251_258 + (annualGross - 857_900) * 0.41;
  else                               tax = 644_489 + (annualGross - 1_817_000) * 0.45;
  return Math.max(0, tax - 17_235);
}
const monthlyPAYE = (m: number) => calcAnnualPAYE(m * 12) / 12;
const monthlyUIF  = (m: number) => Math.min(m * 0.01, 177.12);
const monthlySDL  = (m: number) => m * 0.01;

function formatMonth(iso: string) {
  if (!iso) return "—";
  const [y, m] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m) - 1]} ${y}`;
}

// ── Types ──────────────────────────────────────────────────────────────────────
type PayrollRun = {
  id: string;
  period_month: string;
  status: "draft" | "submitted" | "approved" | "executed" | "cancelled";
  total_gross: number;
  total_paye: number;
  total_uif_employee: number;
  total_uif_employer: number;
  total_sdl: number;
  total_net: number;
  employee_count: number;
  created_by_name?: string;
  submitted_by_name?: string;
  submitted_at?: string;
  approved_by_name?: string;
  approved_at?: string;
  executed_by_name?: string;
  executed_at?: string;
  rejection_note?: string;
  notes?: string;
  lines?: PayslipLine[];
  created_at: string;
};

type PayslipLine = {
  staff_id: string;
  full_name: string;
  role_title: string;
  department: string;
  gross_salary: number;
  paye: number;
  uif_employee: number;
  uif_employer: number;
  sdl: number;
  net_pay: number;
  bank_name?: string;
  account_number?: string;
  branch_code?: string;
};

type StaffBasic = {
  id: string;
  full_name: string;
  role_title: string;
  department: string;
  gross_salary: number;
  status: string;
};

type CompanyConfig = {
  company_name?: string;
  company_reg_number?: string;
  company_vat_number?: string;
  company_address_line1?: string;
  company_address_line2?: string;
  company_phone?: string;
  company_email?: string;
};

const STATUS_TONE: Record<string, any> = {
  draft: "cyan", submitted: "yellow", approved: "purple", executed: "green", cancelled: "red",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", submitted: "Pending Approval", approved: "Approved",
  executed: "Executed", cancelled: "Cancelled",
};

const WORKFLOW_STEPS = ["Draft", "Submitted", "Approved", "Executed"];
const STEP_IDX: Record<string, number> = { draft: 0, submitted: 1, approved: 2, executed: 3, cancelled: -1 };

// ── Access guard ───────────────────────────────────────────────────────────────
function AccessDenied() {
  return (
    <AdminShell title="Payroll">
      <div className="flex flex-col items-center justify-center h-80 gap-5">
        <div className="w-20 h-20 rounded-2xl bg-red/10 border border-red/20 flex items-center justify-center">
          <ShieldX size={36} className="text-red" />
        </div>
        <div className="text-center">
          <p className="text-red font-extrabold text-xl">Access Restricted</p>
          <p className="text-textMuted text-sm mt-2 max-w-sm">
            Payroll is classified. Access is limited to <strong>Superadmin</strong>, <strong>CEO</strong>, and <strong>CFO</strong> roles only.
          </p>
          <p className="text-textDim text-xs mt-3">All access attempts are logged and reviewed.</p>
        </div>
      </div>
    </AdminShell>
  );
}

// ── Workflow step bar ──────────────────────────────────────────────────────────
function WorkflowBar({ status }: { status: string }) {
  const idx = STEP_IDX[status] ?? 0;
  const cancelled = status === "cancelled";
  return (
    <div className="flex items-center gap-0 w-full">
      {WORKFLOW_STEPS.map((step, i) => {
        const done = !cancelled && i < idx;
        const active = !cancelled && i === idx;
        return (
          <div key={step} className="flex items-center flex-1 last:flex-none">
            <div className={`flex flex-col items-center gap-1 ${i < WORKFLOW_STEPS.length - 1 ? "flex-1" : ""}`}>
              <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-extrabold transition-all ${
                done    ? "bg-green border-green text-white" :
                active  ? "bg-cyanDim border-cyan text-cyan" :
                cancelled && i <= idx ? "bg-red/10 border-red/30 text-red" :
                "bg-bg2 border-border text-textDim"
              }`}>
                {done ? <CheckCircle size={13} /> : i + 1}
              </div>
              <span className={`text-[9px] font-bold uppercase tracking-wider ${
                done ? "text-green" : active ? "text-cyan" : "text-textDim"
              }`}>{step}</span>
            </div>
            {i < WORKFLOW_STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mb-4 mx-1 rounded-full transition-all ${
                !cancelled && i < idx ? "bg-green" :
                !cancelled && i === idx - 1 ? "bg-green" :
                "bg-border"
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Payslip print preview ──────────────────────────────────────────────────────
function PayslipModal({ line, period, company, onClose }: {
  line: PayslipLine;
  period: string;
  company: CompanyConfig;
  onClose: () => void;
}) {
  const employerCost = line.gross_salary + line.uif_employer + line.sdl;
  const hasCompany = company.company_name || company.company_address_line1;
  return (
    <Modal open onClose={onClose} title={`Payslip — ${line.full_name}`}>
      <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">

        {/* Letterhead */}
        {hasCompany && (
          <div className="rounded-xl border border-border bg-bg2 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                {company.company_name && (
                  <p className="font-extrabold text-text text-sm">{company.company_name}</p>
                )}
                {company.company_address_line1 && (
                  <p className="text-textMuted text-[11px] mt-0.5">{company.company_address_line1}</p>
                )}
                {company.company_address_line2 && (
                  <p className="text-textMuted text-[11px]">{company.company_address_line2}</p>
                )}
              </div>
              <div className="text-right shrink-0 space-y-0.5">
                {company.company_reg_number && (
                  <p className="text-[10px] text-textDim">Reg: <span className="text-textMuted font-mono">{company.company_reg_number}</span></p>
                )}
                {company.company_vat_number && (
                  <p className="text-[10px] text-textDim">VAT: <span className="text-textMuted font-mono">{company.company_vat_number}</span></p>
                )}
                {company.company_phone && (
                  <p className="text-[10px] text-textDim">Tel: <span className="text-textMuted">{company.company_phone}</span></p>
                )}
                {company.company_email && (
                  <p className="text-[10px] text-textDim">Email: <span className="text-textMuted">{company.company_email}</span></p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Employee header */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-cyanDim border border-cyan/20">
          <div>
            <p className="font-extrabold text-text text-base">{line.full_name}</p>
            <p className="text-textMuted text-xs mt-0.5">{line.role_title} · {line.department}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-textDim uppercase tracking-widest">Period</p>
            <p className="font-extrabold text-cyan text-sm">{formatMonth(period)}</p>
          </div>
        </div>

        {/* Earnings */}
        <div className="bg-bg rounded-xl border border-border p-4">
          <p className="text-[10px] font-extrabold text-textDim uppercase tracking-widest mb-3">Earnings</p>
          <div className="flex justify-between py-2 border-b border-border/50">
            <span className="text-sm text-textMuted">Basic Salary</span>
            <span className="text-sm font-bold text-text">{formatZAR(line.gross_salary)}</span>
          </div>
          <div className="flex justify-between py-2 font-extrabold">
            <span className="text-sm text-text">Gross Income</span>
            <span className="text-sm text-green">{formatZAR(line.gross_salary)}</span>
          </div>
        </div>

        {/* Deductions */}
        <div className="bg-bg rounded-xl border border-border p-4">
          <p className="text-[10px] font-extrabold text-textDim uppercase tracking-widest mb-3">Deductions</p>
          {[
            { label: "PAYE (Income Tax)", value: line.paye, color: "text-yellow", note: "SARS 2024/25 brackets" },
            { label: "UIF — Employee (1%)", value: line.uif_employee, color: "text-purple", note: "capped at R177.12" },
          ].map(d => (
            <div key={d.label} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
              <div>
                <p className="text-sm text-textMuted">{d.label}</p>
                <p className="text-[10px] text-textDim">{d.note}</p>
              </div>
              <span className={`text-sm font-bold ${d.color}`}>- {formatZAR(d.value)}</span>
            </div>
          ))}
          <div className="flex justify-between py-2 font-extrabold border-t border-border mt-1">
            <span className="text-sm text-text">Total Deductions</span>
            <span className="text-sm text-red">- {formatZAR(line.paye + line.uif_employee)}</span>
          </div>
        </div>

        {/* Net pay hero */}
        <div className="p-5 rounded-xl bg-green/5 border border-green/30 text-center">
          <p className="text-[10px] font-extrabold text-textDim uppercase tracking-widest mb-1">Net Pay</p>
          <p className="text-3xl font-black text-green">{formatZAR(line.net_pay)}</p>
          <p className="text-textDim text-xs mt-1">To be paid to employee's bank account</p>
        </div>

        {/* Employer contributions */}
        <div className="bg-bg rounded-xl border border-yellow/20 p-4">
          <p className="text-[10px] font-extrabold text-yellow uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Building size={10} /> Employer Contributions (not deducted from employee)
          </p>
          {[
            { label: "UIF — Employer (1%)", value: line.uif_employer, note: "capped at R177.12" },
            { label: "SDL — Skills Levy (1%)", value: line.sdl, note: "payable to SARS" },
          ].map(d => (
            <div key={d.label} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
              <div>
                <p className="text-xs text-textMuted">{d.label}</p>
                <p className="text-[10px] text-textDim">{d.note}</p>
              </div>
              <span className="text-xs font-bold text-yellow">{formatZAR(d.value)}</span>
            </div>
          ))}
          <div className="flex justify-between py-2 border-t border-border mt-1">
            <span className="text-xs font-bold text-text">Total Cost to Company</span>
            <span className="text-xs font-extrabold text-orange-400">{formatZAR(employerCost)}</span>
          </div>
        </div>

        {/* Banking */}
        {(line.bank_name || line.account_number) && (
          <div className="bg-bg rounded-xl border border-border p-4">
            <p className="text-[10px] font-extrabold text-textDim uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <CreditCard size={10} /> Banking Details
            </p>
            {line.bank_name && (
              <div className="flex justify-between py-1.5">
                <span className="text-xs text-textMuted">Bank</span>
                <span className="text-xs font-bold text-text">{line.bank_name}</span>
              </div>
            )}
            {line.account_number && (
              <div className="flex justify-between py-1.5">
                <span className="text-xs text-textMuted">Account</span>
                <span className="text-xs font-mono text-text">{line.account_number}</span>
              </div>
            )}
            {line.branch_code && (
              <div className="flex justify-between py-1.5">
                <span className="text-xs text-textMuted">Branch Code</span>
                <span className="text-xs font-mono text-text">{line.branch_code}</span>
              </div>
            )}
          </div>
        )}

        <Button variant="secondary" onClick={onClose} className="w-full">Close Payslip</Button>
      </div>
    </Modal>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function PayrollPage() {
  const role = getRole() || "";
  if (!["superadmin", "ceo", "cfo"].includes(role)) return <AccessDenied />;
  return <PayrollPageInner />;
}

function PayrollPageInner() {
  const role = getRole() || "";
  const canApprove = ["superadmin", "ceo"].includes(role);
  const { open: pinOpen, request: requestPin, handleSuccess: pinSuccess, handleCancel: pinCancel } = useDangerPin();

  const [runs, setRuns]     = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [staff, setStaff]   = useState<StaffBasic[]>([]);
  const [company, setCompany] = useState<CompanyConfig>({});

  // Selected run for detail
  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null);
  const [runLoading, setRunLoading]   = useState(false);

  // Payslip preview
  const [payslipLine, setPayslipLine] = useState<PayslipLine | null>(null);

  // New run modal
  const [newModal, setNewModal]       = useState(false);
  const [newMonth, setNewMonth]       = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [newNotes, setNewNotes]       = useState("");
  const [creating, setCreating]       = useState(false);

  // Reject modal
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectNote, setRejectNote]   = useState("");
  const [rejecting, setRejecting]     = useState(false);

  // Action loading
  const [actionLoading, setActionLoading] = useState(false);

  // ── Load runs ──
  const loadRuns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/admin/payroll/runs`, { headers: authHeaders() });
      const d = await res.json();
      setRuns(Array.isArray(d) ? d : (d.runs ?? []));
    } catch { setRuns([]); }
    finally { setLoading(false); }
  }, []);

  // ── Load staff for new run ──
  const loadStaff = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/admin/hr/staff`, { headers: authHeaders() });
      const d = await res.json();
      setStaff(Array.isArray(d) ? d : (d.staff ?? []));
    } catch { setStaff([]); }
  }, []);

  // ── Load company config for letterhead ──
  const loadCompany = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/admin/config`, { headers: authHeaders() });
      const rows: { key: string; value: string }[] = await res.json();
      const keys: (keyof CompanyConfig)[] = [
        "company_name", "company_reg_number", "company_vat_number",
        "company_address_line1", "company_address_line2", "company_phone", "company_email",
      ];
      const cfg: CompanyConfig = {};
      if (Array.isArray(rows)) {
        rows.forEach(r => { if (keys.includes(r.key as keyof CompanyConfig)) (cfg as any)[r.key] = r.value; });
      }
      setCompany(cfg);
    } catch { /* letterhead optional */ }
  }, []);

  useEffect(() => { loadRuns(); loadStaff(); loadCompany(); }, [loadRuns, loadStaff, loadCompany]);

  // ── Load run detail ──
  const openRun = async (run: PayrollRun) => {
    setSelectedRun(run);
    if (run.lines) return;
    setRunLoading(true);
    try {
      const res = await fetch(`${BASE}/api/admin/payroll/runs/${run.id}`, { headers: authHeaders() });
      const d = await res.json();
      setSelectedRun({ ...run, lines: d.lines ?? [] });
    } catch { toast.error("Failed to load payroll lines"); }
    finally { setRunLoading(false); }
  };

  // ── Create new run ──
  const handleCreate = async () => {
    if (!newMonth) { toast.error("Select a period"); return; }
    const existing = runs.find(r => r.period_month === newMonth && r.status !== "cancelled");
    if (existing) { toast.error(`A ${STATUS_LABEL[existing.status].toLowerCase()} run already exists for ${formatMonth(newMonth)}`); return; }
    setCreating(true);
    try {
      const res = await fetch(`${BASE}/api/admin/payroll/runs`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ period_month: newMonth, notes: newNotes }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Failed to create");
      toast.success(`Payroll run created for ${formatMonth(newMonth)}`);
      setNewModal(false); setNewNotes("");
      loadRuns();
    } catch (e: any) { toast.error(e.message); }
    finally { setCreating(false); }
  };

  // ── Submit for approval ──
  const handleSubmit = async (run: PayrollRun) => {
    setActionLoading(true);
    try {
      const res = await fetch(`${BASE}/api/admin/payroll/runs/${run.id}/submit`, {
        method: "POST", headers: authHeaders(),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Failed to submit");
      toast.success("Payroll submitted for CEO/Superadmin approval");
      loadRuns();
      setSelectedRun(prev => prev?.id === run.id ? { ...prev, status: "submitted" } : prev);
    } catch (e: any) { toast.error(e.message); }
    finally { setActionLoading(false); }
  };

  // ── Approve ──
  const handleApprove = async (run: PayrollRun) => {
    setActionLoading(true);
    try {
      const res = await fetch(`${BASE}/api/admin/payroll/runs/${run.id}/approve`, {
        method: "POST", headers: authHeaders(),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Failed to approve");
      toast.success("Payroll approved — ready to execute");
      loadRuns();
      setSelectedRun(prev => prev?.id === run.id ? { ...prev, status: "approved" } : prev);
    } catch (e: any) { toast.error(e.message); }
    finally { setActionLoading(false); }
  };

  // ── Reject (back to draft) ──
  const handleReject = async (run: PayrollRun) => {
    if (!rejectNote.trim()) { toast.error("Enter a rejection reason"); return; }
    setRejecting(true);
    try {
      const res = await fetch(`${BASE}/api/admin/payroll/runs/${run.id}/reject`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ note: rejectNote }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Failed to reject");
      toast.success("Payroll returned to draft");
      setRejectModal(false); setRejectNote("");
      loadRuns();
      setSelectedRun(prev => prev?.id === run.id ? { ...prev, status: "draft", rejection_note: rejectNote } : prev);
    } catch (e: any) { toast.error(e.message); }
    finally { setRejecting(false); }
  };

  // ── Execute (Danger PIN required) ──
  const handleExecute = async (run: PayrollRun) => {
    const token = await requestPin();
    if (!token) return;
    setActionLoading(true);
    try {
      const res = await fetch(`${BASE}/api/admin/payroll/runs/${run.id}/execute`, {
        method: "POST",
        headers: authHeaders({ "X-Danger-Token": token }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Execution failed");
      toast.success(`Payroll executed — ${run.employee_count} salary transfers initiated`, { duration: 5000 });
      loadRuns();
      setSelectedRun(prev => prev?.id === run.id ? { ...prev, status: "executed" } : prev);
    } catch (e: any) { toast.error(e.message); }
    finally { setActionLoading(false); }
  };

  // ── Export ──
  const handleExport = async (run: PayrollRun) => {
    try {
      const res = await fetch(`${BASE}/api/admin/payroll/runs/${run.id}/export`, { headers: authHeaders() });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `payroll_${run.period_month}.csv`;
      a.click(); URL.revokeObjectURL(url);
      toast.success("Payroll exported");
    } catch (e: any) { toast.error(e.message); }
  };

  // ── Derived KPIs ──
  const latestExecuted = runs.find(r => r.status === "executed");
  const pending = runs.filter(r => ["draft", "submitted", "approved"].includes(r.status)).length;
  const totalPaid = runs.filter(r => r.status === "executed").reduce((s, r) => s + r.total_net, 0);
  const activeEmployees = staff.filter(s => s.status === "active").length;

  // ── Preview lines for new run ──
  const activeStaff = staff.filter(s => s.status === "active");
  const previewLines: PayslipLine[] = activeStaff.map(s => {
    const paye = monthlyPAYE(s.gross_salary);
    const uifE = monthlyUIF(s.gross_salary);
    const uifR = monthlyUIF(s.gross_salary);
    const sdl  = monthlySDL(s.gross_salary);
    return {
      staff_id: s.id, full_name: s.full_name, role_title: s.role_title,
      department: s.department, gross_salary: s.gross_salary,
      paye, uif_employee: uifE, uif_employer: uifR, sdl,
      net_pay: s.gross_salary - paye - uifE,
    };
  });
  const previewGross = previewLines.reduce((s, l) => s + l.gross_salary, 0);
  const previewNet   = previewLines.reduce((s, l) => s + l.net_pay, 0);
  const previewPAYE  = previewLines.reduce((s, l) => s + l.paye, 0);

  return (
    <AdminShell title="Payroll · Salary Management">
      <DangerPinModal open={pinOpen} onSuccess={pinSuccess} onCancel={pinCancel} actionLabel="execute payroll transfers" />

      <div className="space-y-5">

        {/* Security banner */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-yellow/5 border border-yellow/20">
          <Shield size={15} className="text-yellow flex-shrink-0" />
          <p className="text-yellow text-xs font-semibold">
            <strong>RESTRICTED</strong> — Payroll operations are subject to POPIA and SA labour law.
            All actions are audited. Salary transfers require multi-step approval and Danger PIN.
          </p>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Users, label: "Active Employees", value: activeEmployees, color: "text-cyan", border: "border-cyan/20" },
            { icon: Banknote, label: "Total Paid (All Runs)", value: formatZAR(totalPaid), color: "text-green", border: "border-green/20" },
            { icon: Clock, label: "Pending Runs", value: pending, color: "text-yellow", border: "border-yellow/20" },
            {
              icon: TrendingUp, label: "Last Payroll Gross",
              value: latestExecuted ? formatZAR(latestExecuted.total_gross) : "—",
              color: "text-purple", border: "border-purple/20",
            },
          ].map(({ icon: Ic, label, value, color, border }) => (
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
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-extrabold text-textMuted uppercase tracking-widest">Payroll Runs</h2>
          <Button onClick={() => setNewModal(true)}><Plus size={13} /> New Payroll Run</Button>
        </div>

        {/* Runs table */}
        {loading ? <Spinner /> : !runs.length ? (
          <div className="flex flex-col items-center justify-center py-24 gap-5">
            <div className="w-20 h-20 rounded-3xl bg-cyanDim border border-cyan/20 flex items-center justify-center">
              <FileText size={34} className="text-cyan" />
            </div>
            <div className="text-center">
              <p className="text-text font-extrabold text-lg">No payroll runs yet</p>
              <p className="text-textMuted text-sm mt-1">Create your first payroll run to get started.</p>
            </div>
            <Button onClick={() => setNewModal(true)}><Plus size={13} /> New Payroll Run</Button>
          </div>
        ) : (
          <Table
            headers={["Period", "Employees", "Gross Payroll", "PAYE", "Net Pay", "Status", "Created By", "Last Updated", ""]}
            empty={false}>
            {runs.map(run => (
              <Tr key={run.id} onClick={() => openRun(run)}>
                <Td>
                  <div>
                    <p className="font-extrabold text-text text-sm">{formatMonth(run.period_month)}</p>
                    <p className="text-textDim text-[10px]">{run.period_month}</p>
                  </div>
                </Td>
                <Td className="text-text font-bold">{run.employee_count}</Td>
                <Td className="font-bold text-text">{formatZAR(run.total_gross)}</Td>
                <Td className="text-yellow text-xs">{formatZAR(run.total_paye)}</Td>
                <Td className="font-extrabold text-green">{formatZAR(run.total_net)}</Td>
                <Td><Badge label={STATUS_LABEL[run.status] || run.status} tone={STATUS_TONE[run.status] || "cyan"} /></Td>
                <Td className="text-textMuted text-xs">{run.created_by_name || "—"}</Td>
                <Td className="text-textDim text-xs">
                  {run.executed_at ? formatDate(run.executed_at) :
                   run.approved_at ? formatDate(run.approved_at) :
                   run.submitted_at ? formatDate(run.submitted_at) :
                   formatDate(run.created_at)}
                </Td>
                <Td>
                  <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openRun(run)}
                      className="p-1.5 rounded-lg border border-border text-textDim hover:text-cyan hover:border-cyan/30 transition-all">
                      <Eye size={11} />
                    </button>
                    {run.status === "executed" && (
                      <button onClick={() => handleExport(run)}
                        className="p-1.5 rounded-lg border border-border text-textDim hover:text-green hover:border-green/30 transition-all">
                        <Download size={11} />
                      </button>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </div>

      {/* ── Run Detail Modal ── */}
      <Modal
        open={!!selectedRun}
        onClose={() => setSelectedRun(null)}
        title={selectedRun ? `Payroll — ${formatMonth(selectedRun.period_month)}` : ""}>
        {selectedRun && (
          <div className="space-y-5 max-h-[80vh] overflow-y-auto pr-1">

            {/* Workflow bar */}
            {selectedRun.status !== "cancelled" && (
              <WorkflowBar status={selectedRun.status} />
            )}

            {/* Status + summary row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Gross Payroll", value: formatZAR(selectedRun.total_gross), color: "text-text" },
                { label: "PAYE (SARS)", value: formatZAR(selectedRun.total_paye), color: "text-yellow" },
                { label: "UIF + SDL", value: formatZAR(selectedRun.total_uif_employer + selectedRun.total_sdl), color: "text-orange-400" },
                { label: "Net Pay Out", value: formatZAR(selectedRun.total_net), color: "text-green" },
              ].map(k => (
                <div key={k.label} className="bg-bg border border-border rounded-xl p-3 text-center">
                  <p className="text-[10px] text-textDim uppercase tracking-widest">{k.label}</p>
                  <p className={`font-extrabold mt-1 ${k.color}`}>{k.value}</p>
                </div>
              ))}
            </div>

            {/* Audit trail */}
            <div className="bg-bg rounded-xl border border-border p-4">
              <p className="text-[10px] font-extrabold text-textDim uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Clock size={10} /> Audit Trail
              </p>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-textMuted">Created by</span>
                  <span className="font-bold text-text">{selectedRun.created_by_name || "—"} · {formatDate(selectedRun.created_at)}</span>
                </div>
                {selectedRun.submitted_at && (
                  <div className="flex justify-between text-xs">
                    <span className="text-textMuted">Submitted by</span>
                    <span className="font-bold text-yellow">{selectedRun.submitted_by_name || "—"} · {formatDate(selectedRun.submitted_at)}</span>
                  </div>
                )}
                {selectedRun.approved_at && (
                  <div className="flex justify-between text-xs">
                    <span className="text-textMuted">Approved by</span>
                    <span className="font-bold text-purple">{selectedRun.approved_by_name || "—"} · {formatDate(selectedRun.approved_at)}</span>
                  </div>
                )}
                {selectedRun.executed_at && (
                  <div className="flex justify-between text-xs">
                    <span className="text-textMuted">Executed by</span>
                    <span className="font-bold text-green">{selectedRun.executed_by_name || "—"} · {formatDate(selectedRun.executed_at)}</span>
                  </div>
                )}
                {selectedRun.rejection_note && (
                  <div className="mt-2 p-2 rounded-lg bg-red/5 border border-red/20">
                    <p className="text-[10px] text-red font-bold uppercase tracking-widest mb-1">Rejection Note</p>
                    <p className="text-xs text-textMuted">{selectedRun.rejection_note}</p>
                  </div>
                )}
                {selectedRun.notes && (
                  <div className="mt-2 p-2 rounded-lg bg-bg2 border border-border">
                    <p className="text-[10px] text-textDim font-bold uppercase tracking-widest mb-1">Notes</p>
                    <p className="text-xs text-textMuted">{selectedRun.notes}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Payslip lines */}
            <div>
              <p className="text-[10px] font-extrabold text-textDim uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <FileText size={10} /> Employee Payslip Lines ({selectedRun.employee_count})
              </p>
              {runLoading ? (
                <div className="flex justify-center py-8"><Spinner /></div>
              ) : !selectedRun.lines?.length ? (
                <div className="text-center py-8 text-textMuted text-sm">No payslip lines found</div>
              ) : (
                <div className="space-y-2">
                  {selectedRun.lines.map(line => (
                    <div key={line.staff_id}
                      className="flex items-center justify-between p-3 rounded-xl bg-bg border border-border hover:border-cyan/30 cursor-pointer transition-all group"
                      onClick={() => setPayslipLine(line)}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-cyanDim border border-cyan/20 flex items-center justify-center text-[10px] font-extrabold text-cyan">
                          {line.full_name.split(" ").map(n => n[0]).slice(0, 2).join("")}
                        </div>
                        <div>
                          <p className="text-text font-semibold text-xs">{line.full_name}</p>
                          <p className="text-textDim text-[10px]">{line.role_title} · {line.department}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <p className="text-[10px] text-textDim">Gross</p>
                          <p className="text-xs font-bold text-text">{formatZAR(line.gross_salary)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-textDim">PAYE</p>
                          <p className="text-xs font-bold text-yellow">-{formatZAR(line.paye)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-textDim">Net Pay</p>
                          <p className="text-xs font-extrabold text-green">{formatZAR(line.net_pay)}</p>
                        </div>
                        <ChevronRight size={12} className="text-textDim group-hover:text-cyan transition-colors" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="pt-2 border-t border-border flex flex-wrap gap-2 justify-end">
              {selectedRun.status === "executed" && (
                <Button variant="secondary" onClick={() => handleExport(selectedRun)}>
                  <Download size={13} /> Export CSV
                </Button>
              )}

              {/* CFO can submit */}
              {selectedRun.status === "draft" && (
                <Button onClick={() => handleSubmit(selectedRun)} loading={actionLoading}>
                  <Send size={13} /> Submit for Approval
                </Button>
              )}

              {/* CEO/SA can approve or reject */}
              {selectedRun.status === "submitted" && canApprove && (
                <>
                  <button onClick={() => setRejectModal(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-red/30 text-red text-xs font-bold hover:bg-red/10 transition-all">
                    <X size={13} /> Reject
                  </button>
                  <Button onClick={() => handleApprove(selectedRun)} loading={actionLoading}>
                    <CheckCircle size={13} /> Approve Payroll
                  </Button>
                </>
              )}

              {/* CEO/SA can execute (Danger PIN) */}
              {selectedRun.status === "approved" && canApprove && (
                <>
                  <button onClick={() => setRejectModal(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-red/30 text-red text-xs font-bold hover:bg-red/10 transition-all">
                    <RotateCcw size={13} /> Return to Draft
                  </button>
                  <button
                    onClick={() => handleExecute(selectedRun)}
                    disabled={actionLoading}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green text-white text-sm font-extrabold disabled:opacity-50 hover:bg-green/90 transition-all shadow-[0_0_16px_rgba(0,230,118,0.3)]">
                    {actionLoading ? "Processing…" : <><Play size={13} /> Execute Payroll</>}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ── Reject / Return to Draft Modal ── */}
      <Modal open={rejectModal} onClose={() => { setRejectModal(false); setRejectNote(""); }} title="Return to Draft">
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-red/5 border border-red/20">
            <AlertTriangle size={18} className="text-red flex-shrink-0" />
            <p className="text-red text-sm font-semibold">
              This payroll run will be returned to <strong>Draft</strong> for revision. The CFO will need to resubmit.
            </p>
          </div>
          <div>
            <label className="label-sm">Reason / Notes for CFO</label>
            <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)}
              placeholder="Explain what needs to be corrected..."
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-textDim focus:outline-none focus:border-red resize-none h-20" />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => { setRejectModal(false); setRejectNote(""); }}>Cancel</Button>
            <button
              onClick={() => selectedRun && handleReject(selectedRun)}
              disabled={rejecting || !rejectNote.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red text-white text-sm font-bold disabled:opacity-50 hover:bg-red/90 transition-all">
              {rejecting ? "Processing…" : <><RotateCcw size={13} /> Return to Draft</>}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── New Payroll Run Modal ── */}
      <Modal open={newModal} onClose={() => { setNewModal(false); setNewNotes(""); }} title="New Payroll Run">
        <div className="space-y-5">
          <div>
            <label className="label-sm">Payroll Period (Month)</label>
            <Input type="month" value={newMonth} onChange={e => setNewMonth(e.target.value)} className="w-full" />
          </div>

          {/* Preview */}
          {activeStaff.length > 0 && (
            <div className="bg-bg rounded-xl border border-border p-4">
              <p className="text-[10px] font-extrabold text-textDim uppercase tracking-widest mb-3">
                Preview — {activeStaff.length} active employees
              </p>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: "Gross Payroll", value: formatZAR(previewGross), color: "text-text" },
                  { label: "PAYE (est.)", value: formatZAR(previewPAYE), color: "text-yellow" },
                  { label: "Net Pay Out", value: formatZAR(previewNet), color: "text-green" },
                ].map(k => (
                  <div key={k.label} className="bg-bg2 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-textDim">{k.label}</p>
                    <p className={`font-extrabold mt-1 text-sm ${k.color}`}>{k.value}</p>
                  </div>
                ))}
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1.5">
                {previewLines.map(l => (
                  <div key={l.staff_id} className="flex items-center justify-between text-xs px-1 py-1.5 border-b border-border/50 last:border-0">
                    <span className="text-text font-semibold">{l.full_name}</span>
                    <div className="flex gap-3 text-right">
                      <span className="text-textMuted">Gross: {formatZAR(l.gross_salary)}</span>
                      <span className="text-green font-bold">Net: {formatZAR(l.net_pay)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeStaff.length === 0 && !loading && (
            <div className="p-4 rounded-xl bg-yellow/5 border border-yellow/20 text-center">
              <p className="text-yellow text-sm font-semibold">No active employees found.</p>
              <p className="text-textMuted text-xs mt-1">Add staff in HR before running payroll.</p>
            </div>
          )}

          <div>
            <label className="label-sm">Notes (optional)</label>
            <textarea value={newNotes} onChange={e => setNewNotes(e.target.value)}
              placeholder="Any notes for this payroll run..."
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-textDim focus:outline-none focus:border-cyan resize-none h-16" />
          </div>

          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => { setNewModal(false); setNewNotes(""); }}>Cancel</Button>
            <Button onClick={handleCreate} loading={creating} disabled={!activeStaff.length}>
              <Plus size={13} /> Create Payroll Run
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Payslip Preview Modal ── */}
      {payslipLine && selectedRun && (
        <PayslipModal
          line={payslipLine}
          period={selectedRun.period_month}
          company={company}
          onClose={() => setPayslipLine(null)}
        />
      )}

      <style>{`.label-sm { display: block; font-size: 10px; font-weight: 700; color: var(--textMuted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; }`}</style>
    </AdminShell>
  );
}
