"use client";

import { useEffect, useState, useCallback } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Button, Spinner, Modal, Input, Select } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { getRole } from "@/lib/api";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  Calendar, Plus, Check, X as XIcon, Clock, Search,
  Download, Filter, ChevronLeft, AlertTriangle,
  Users, TrendingDown, CheckCircle, Sun, Umbrella,
  Heart, Coffee, FileText, Shield, ShieldX,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authH = (extra?: Record<string, string>) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
  ...(extra || {}),
});

const ALLOWED_ROLES = ["superadmin", "ceo", "cfo", "hr"];

type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";
type LeaveType = "annual" | "sick" | "family_responsibility" | "unpaid" | "maternity" | "study";

interface LeaveRequest {
  id: string;
  staff_id: string;
  employee_name: string;
  department: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  applied_at: string;
  reviewed_by?: string;
  reviewed_at?: string;
  rejection_reason?: string;
}

const LEAVE_TYPE_CONFIG: Record<LeaveType, { label: string; color: string; icon: any; maxDays: number }> = {
  annual:               { label: "Annual Leave",           color: "text-cyan   bg-cyan/10   border-cyan/20",   icon: Sun,       maxDays: 21 },
  sick:                 { label: "Sick Leave",             color: "text-yellow bg-yellow/10 border-yellow/20", icon: Umbrella,  maxDays: 30 },
  family_responsibility:{ label: "Family Responsibility",  color: "text-purple bg-purple/10 border-purple/20", icon: Heart,     maxDays: 3  },
  unpaid:               { label: "Unpaid Leave",           color: "text-red    bg-red/10    border-red/20",    icon: Coffee,    maxDays: 30 },
  maternity:            { label: "Maternity/Paternity",    color: "text-pink-400 bg-pink-400/10 border-pink-400/20", icon: Heart, maxDays: 120 },
  study:                { label: "Study Leave",            color: "text-green  bg-green/10  border-green/20",  icon: FileText,  maxDays: 10 },
};

const STATUS_CONFIG: Record<LeaveStatus, { label: string; color: string }> = {
  pending:   { label: "Pending",   color: "text-yellow bg-yellow/10 border-yellow/20" },
  approved:  { label: "Approved",  color: "text-green  bg-green/10  border-green/20" },
  rejected:  { label: "Rejected",  color: "text-red    bg-red/10    border-red/20" },
  cancelled: { label: "Cancelled", color: "text-textMuted bg-bg3 border-border" },
};

function workingDays(start: string, end: string): number {
  if (!start || !end) return 0;
  let count = 0;
  const s = new Date(start);
  const e = new Date(end);
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

function AccessDenied() {
  return (
    <AdminShell title="Leave Management">
      <div className="flex flex-col items-center justify-center h-80 gap-5">
        <div className="w-20 h-20 rounded-2xl bg-red/10 border border-red/20 flex items-center justify-center">
          <ShieldX size={36} className="text-red" />
        </div>
        <div className="text-center">
          <p className="text-red font-extrabold text-xl">Access Restricted</p>
          <p className="text-textMuted text-sm mt-2 max-w-sm">Leave management is limited to HR, CFO, CEO, and Superadmin roles.</p>
        </div>
      </div>
    </AdminShell>
  );
}

export default function LeaveManagementPage() {
  const role = getRole() || "";
  if (!ALLOWED_ROLES.includes(role)) return <AccessDenied />;

  return <LeaveInner />;
}

function LeaveInner() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<LeaveType | "">("");
  const [statusFilter, setStatusFilter] = useState<LeaveStatus | "">("");
  const [rejectModal, setRejectModal] = useState<LeaveRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [applyModal, setApplyModal] = useState(false);
  const [viewModal, setViewModal] = useState<LeaveRequest | null>(null);
  const [saving, setSaving] = useState(false);

  const [staff, setStaff] = useState<{ id: string; full_name: string; department: string }[]>([]);

  const emptyForm = {
    staff_id: "",
    leave_type: "annual" as LeaveType,
    start_date: "",
    end_date: "",
    reason: "",
  };
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/admin/hr/leave`, { headers: authH() });
      const d = await res.json();
      setRequests(Array.isArray(d) ? d : (d.requests ?? []));
    } catch { setRequests([]); }
    finally { setLoading(false); }
  }, []);

  const loadStaff = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/admin/hr/staff`, { headers: authH() });
      const d = await res.json();
      const list = Array.isArray(d) ? d : (d.staff ?? []);
      setStaff(list.filter((s: any) => s.status === "active" || s.status === "probation"));
    } catch { setStaff([]); }
  }, []);

  useEffect(() => { load(); loadStaff(); }, [load, loadStaff]);

  const handleApprove = async (req: LeaveRequest) => {
    try {
      const res = await fetch(`${BASE}/api/admin/hr/leave/${req.id}/approve`, { method: "POST", headers: authH() });
      if (!res.ok) throw new Error("Failed to approve");
      toast.success(`Leave approved for ${req.employee_name}`);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleReject = async () => {
    if (!rejectModal || !rejectReason.trim()) { toast.error("Rejection reason is required"); return; }
    try {
      const res = await fetch(`${BASE}/api/admin/hr/leave/${rejectModal.id}/reject`, {
        method: "POST", headers: authH(),
        body: JSON.stringify({ reason: rejectReason }),
      });
      if (!res.ok) throw new Error("Failed to reject");
      toast.success("Leave request rejected");
      setRejectModal(null); setRejectReason("");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleSubmit = async () => {
    if (!form.staff_id || !form.start_date || !form.end_date || !form.reason.trim()) {
      toast.error("All fields are required"); return;
    }
    if (new Date(form.end_date) < new Date(form.start_date)) {
      toast.error("End date must be after start date"); return;
    }
    setSaving(true);
    try {
      const days = workingDays(form.start_date, form.end_date);
      const res = await fetch(`${BASE}/api/admin/hr/leave`, {
        method: "POST", headers: authH(),
        body: JSON.stringify({ ...form, days }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || "Failed to submit");
      }
      toast.success("Leave request submitted");
      setApplyModal(false);
      setForm(emptyForm);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const filtered = requests.filter(r =>
    (!search || r.employee_name.toLowerCase().includes(search.toLowerCase()) || r.department?.toLowerCase().includes(search.toLowerCase())) &&
    (!typeFilter || r.leave_type === typeFilter) &&
    (!statusFilter || r.status === statusFilter)
  );

  // KPIs
  const pending = requests.filter(r => r.status === "pending").length;
  const approved = requests.filter(r => r.status === "approved").length;
  const thisMonthDays = requests
    .filter(r => r.status === "approved" && new Date(r.start_date).getMonth() === new Date().getMonth())
    .reduce((s, r) => s + (r.days || 0), 0);

  const formDays = form.start_date && form.end_date ? workingDays(form.start_date, form.end_date) : 0;

  return (
    <AdminShell title="Leave Management">
      <div className="space-y-5">

        {/* Security banner */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-yellow/5 border border-yellow/20">
          <Shield size={15} className="text-yellow flex-shrink-0" />
          <p className="text-yellow text-xs font-semibold">
            <strong>CONFIDENTIAL</strong> — Leave records contain personal information protected under POPIA. All access is logged.
          </p>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Pending Requests", value: pending, color: "text-yellow", border: "border-yellow/20", icon: Clock },
            { label: "Approved This Year", value: approved, color: "text-green", border: "border-green/20", icon: CheckCircle },
            { label: "Days Off This Month", value: thisMonthDays, color: "text-cyan", border: "border-cyan/20", icon: Calendar },
            { label: "Total Requests", value: requests.length, color: "text-purple", border: "border-purple/20", icon: Users },
          ].map(({ label, value, color, border, icon: Ic }) => (
            <div key={label} className={`bg-bg2 border rounded-xl p-4 ${border}`}>
              <div className="flex items-center gap-2 mb-2">
                <Ic size={14} className={color} />
                <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest">{label}</p>
              </div>
              <p className={`text-2xl font-black ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Leave type legend */}
        <div className="flex flex-wrap gap-2">
          {Object.entries(LEAVE_TYPE_CONFIG).map(([type, cfg]) => (
            <div key={type} className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold", cfg.color)}>
              <cfg.icon size={10} />{cfg.label} · max {cfg.maxDays}d
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-textDim" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee or department…"
              className="w-full bg-bg2 border border-border rounded-lg pl-8 pr-3 py-2 text-xs text-text placeholder:text-textDim focus:outline-none focus:border-cyan" />
          </div>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)}
            className="bg-bg2 border border-border rounded-lg px-3 py-2 text-xs text-text focus:outline-none focus:border-cyan">
            <option value="">All Types</option>
            {Object.entries(LEAVE_TYPE_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
            className="bg-bg2 border border-border rounded-lg px-3 py-2 text-xs text-text focus:outline-none focus:border-cyan">
            <option value="">All Status</option>
            {Object.entries(STATUS_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
          </select>
          <div className="ml-auto">
            <Button onClick={() => setApplyModal(true)}>
              <Plus size={13} />Apply for Leave
            </Button>
          </div>
        </div>

        {/* Leave requests table */}
        {loading ? <Spinner /> : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-bg3 border border-border flex items-center justify-center">
              <Calendar size={28} className="text-textDim" />
            </div>
            <p className="text-textMuted text-sm">{requests.length === 0 ? "No leave requests yet" : "No requests match your filter"}</p>
            <Button onClick={() => setApplyModal(true)}><Plus size={13} />Submit First Request</Button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border bg-bg3/60">
                  {["Employee", "Type", "Period", "Days", "Reason", "Status", "Applied", "Actions"].map(h => (
                    <th key={h} className="py-2.5 px-4 text-left text-[10px] font-extrabold text-textDim uppercase tracking-widest whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const ltc = LEAVE_TYPE_CONFIG[r.leave_type];
                  const sc = STATUS_CONFIG[r.status];
                  return (
                    <tr key={r.id} onClick={() => setViewModal(r)} className="border-b border-border/50 hover:bg-bg3/40 transition-colors cursor-pointer">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-cyanDim border border-cyan/20 flex items-center justify-center text-[10px] font-extrabold text-cyan">
                            {r.employee_name.split(" ").map(n => n[0]).slice(0, 2).join("")}
                          </div>
                          <div>
                            <p className="font-semibold text-text text-xs">{r.employee_name}</p>
                            <p className="text-[10px] text-textDim">{r.department || "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold", ltc.color)}>
                          <ltc.icon size={9} />{ltc.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-textMuted whitespace-nowrap">
                        <p>{new Date(r.start_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}</p>
                        <p className="text-textDim">→ {new Date(r.end_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}</p>
                      </td>
                      <td className="py-3 px-4 text-xs font-bold text-text">{r.days || workingDays(r.start_date, r.end_date)} days</td>
                      <td className="py-3 px-4 text-xs text-textMuted max-w-[180px]">
                        <p className="truncate">{r.reason}</p>
                      </td>
                      <td className="py-3 px-4">
                        <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold", sc.color)}>{sc.label}</span>
                      </td>
                      <td className="py-3 px-4 text-[10px] text-textDim whitespace-nowrap">{formatDate(r.applied_at)}</td>
                      <td className="py-3 px-4">
                        <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                          {r.status === "pending" && (
                            <>
                              <button onClick={() => handleApprove(r)} title="Approve"
                                className="p-1.5 rounded-lg border border-border text-textDim hover:text-green hover:border-green/30 transition-all">
                                <Check size={11} />
                              </button>
                              <button onClick={() => { setRejectModal(r); setRejectReason(""); }} title="Reject"
                                className="p-1.5 rounded-lg border border-border text-textDim hover:text-red hover:border-red/30 transition-all">
                                <XIcon size={11} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* View Leave Modal */}
      <Modal open={!!viewModal} onClose={() => setViewModal(null)} title="Leave Request Details">
        {viewModal && (() => {
          const ltc = LEAVE_TYPE_CONFIG[viewModal.leave_type];
          const sc = STATUS_CONFIG[viewModal.status];
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-4 pb-3 border-b border-border">
                <div className="w-12 h-12 rounded-2xl bg-cyanDim border border-cyan/20 flex items-center justify-center text-base font-extrabold text-cyan">
                  {viewModal.employee_name.split(" ").map(n => n[0]).slice(0, 2).join("")}
                </div>
                <div>
                  <p className="text-text font-extrabold">{viewModal.employee_name}</p>
                  <p className="text-textMuted text-sm">{viewModal.department || "—"}</p>
                  <div className="flex gap-2 mt-1">
                    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold", ltc.color)}>
                      <ltc.icon size={9} />{ltc.label}
                    </span>
                    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold", sc.color)}>{sc.label}</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-bg rounded-xl border border-border p-3 text-center">
                  <p className="text-[10px] text-textDim uppercase tracking-widest">Start</p>
                  <p className="text-xs font-bold text-text mt-1">{new Date(viewModal.start_date).toLocaleDateString("en-ZA", { dateStyle: "medium" })}</p>
                </div>
                <div className="bg-bg rounded-xl border border-border p-3 text-center">
                  <p className="text-[10px] text-textDim uppercase tracking-widest">End</p>
                  <p className="text-xs font-bold text-text mt-1">{new Date(viewModal.end_date).toLocaleDateString("en-ZA", { dateStyle: "medium" })}</p>
                </div>
                <div className="bg-bg rounded-xl border border-cyan/20 p-3 text-center">
                  <p className="text-[10px] text-textDim uppercase tracking-widest">Days</p>
                  <p className="text-xl font-black text-cyan mt-0.5">{viewModal.days || workingDays(viewModal.start_date, viewModal.end_date)}</p>
                </div>
              </div>
              <div className="bg-bg rounded-xl border border-border p-3">
                <p className="text-[10px] font-extrabold text-textDim uppercase tracking-widest mb-1">Reason</p>
                <p className="text-sm text-text">{viewModal.reason}</p>
              </div>
              {viewModal.reviewed_by && (
                <div className="bg-bg rounded-xl border border-border p-3">
                  <p className="text-[10px] font-extrabold text-textDim uppercase tracking-widest mb-1">Review</p>
                  <p className="text-xs text-textMuted">By {viewModal.reviewed_by} · {viewModal.reviewed_at ? formatDate(viewModal.reviewed_at) : "—"}</p>
                  {viewModal.rejection_reason && <p className="text-xs text-red mt-1">{viewModal.rejection_reason}</p>}
                </div>
              )}
              <div className="flex gap-3 justify-end">
                {viewModal.status === "pending" && (
                  <>
                    <Button onClick={() => { handleApprove(viewModal); setViewModal(null); }}><Check size={13} />Approve</Button>
                    <Button variant="danger" onClick={() => { setRejectModal(viewModal); setViewModal(null); setRejectReason(""); }}><XIcon size={13} />Reject</Button>
                  </>
                )}
                <Button variant="secondary" onClick={() => setViewModal(null)}>Close</Button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Reject Modal */}
      <Modal open={!!rejectModal} onClose={() => { setRejectModal(null); setRejectReason(""); }} title="Reject Leave Request">
        {rejectModal && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-red/5 border border-red/20 rounded-xl">
              <AlertTriangle size={15} className="text-red flex-shrink-0" />
              <p className="text-sm text-textMuted">Rejecting {LEAVE_TYPE_CONFIG[rejectModal.leave_type].label} for <strong className="text-text">{rejectModal.employee_name}</strong></p>
            </div>
            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-textDim mb-1">Rejection Reason *</label>
              <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                placeholder="Reason for rejection (required)..."
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-textDim focus:outline-none focus:border-red resize-none h-20" />
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => { setRejectModal(null); setRejectReason(""); }}>Cancel</Button>
              <Button variant="danger" onClick={handleReject}><XIcon size={13} />Reject Leave</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Apply for Leave Modal */}
      <Modal open={applyModal} onClose={() => { setApplyModal(false); setForm(emptyForm); }} title="Submit Leave Request" size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-textDim mb-1">Employee *</label>
              <select value={form.staff_id} onChange={e => setForm(f => ({ ...f, staff_id: e.target.value }))}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs text-text focus:outline-none focus:border-cyan">
                <option value="">Select employee…</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.full_name} — {s.department}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-textDim mb-1">Leave Type *</label>
              <select value={form.leave_type} onChange={e => setForm(f => ({ ...f, leave_type: e.target.value as LeaveType }))}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs text-text focus:outline-none focus:border-cyan">
                {Object.entries(LEAVE_TYPE_CONFIG).map(([v, c]) => (
                  <option key={v} value={v}>{c.label} (max {c.maxDays} days)</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-textDim mb-1">Start Date *</label>
              <Input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
            </div>
            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-textDim mb-1">End Date *</label>
              <Input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
            </div>
          </div>
          {formDays > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-cyan/5 border border-cyan/20 rounded-lg">
              <Calendar size={12} className="text-cyan" />
              <p className="text-xs text-cyan font-semibold">{formDays} working day{formDays !== 1 ? "s" : ""}</p>
              {formDays > LEAVE_TYPE_CONFIG[form.leave_type].maxDays && (
                <p className="text-xs text-yellow ml-2 flex items-center gap-1"><AlertTriangle size={10} />Exceeds max {LEAVE_TYPE_CONFIG[form.leave_type].maxDays} days</p>
              )}
            </div>
          )}
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-textDim mb-1">Reason *</label>
            <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="Briefly explain the reason for leave..."
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-textDim focus:outline-none focus:border-cyan resize-none h-20" />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => { setApplyModal(false); setForm(emptyForm); }}>Cancel</Button>
            <Button onClick={handleSubmit} loading={saving}><Plus size={13} />Submit Request</Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
