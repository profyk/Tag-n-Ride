"use client";
import { useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Button, Spinner } from "@/components/ui";
import { api, hasPermission, downloadAuthFile } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import {
  Download, FileText, Users, ArrowLeftRight, BarChart3, Wallet,
  Package, Clock, CheckCircle, XCircle, RefreshCw,
  Car, Building, CreditCard, ShieldCheck, Receipt,
} from "lucide-react";
import toast from "react-hot-toast";

type ExportJob = {
  id: string;
  name: string;
  status: "pending" | "ready" | "failed";
  size?: string;
  rows?: number;
  created_at: Date;
  path?: string;
  filename?: string;
};

type ExportDef = {
  id: string;
  label: string;
  desc: string;
  icon: any;
  color: string;
  permission: string;
  action: () => Promise<void>;
  category: string;
};

export default function ExportCenterPage() {
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [running, setRunning] = useState<string | null>(null);

  const addJob = (name: string): string => {
    const id = `${Date.now()}`;
    const job: ExportJob = { id, name, status: "pending", created_at: new Date() };
    setJobs(prev => [job, ...prev.slice(0, 19)]);
    return id;
  };

  const completeJob = (id: string, rows?: number) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, status: "ready", rows } : j));
  };

  const failJob = (id: string) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, status: "failed" } : j));
  };

  const run = async (def: ExportDef) => {
    if (running) return;
    setRunning(def.id);
    const jobId = addJob(def.label);
    try {
      await def.action();
      completeJob(jobId);
      toast.success(`${def.label} exported`);
    } catch (e: any) {
      failJob(jobId);
      toast.error(e?.message || "Export failed");
    } finally {
      setRunning(null);
    }
  };

  const BASE = "https://tag-n-ride-production.up.railway.app";

  const EXPORTS: ExportDef[] = [
    // Users
    {
      id: "users",
      label: "All Users",
      desc: "Full user list with roles, status, registration date",
      icon: Users, color: "text-cyan", category: "Users",
      permission: "export_data",
      action: () => api.exportUsers(),
    },
    {
      id: "drivers",
      label: "Drivers",
      desc: "All drivers with KYC status, plate, earnings, ratings",
      icon: Car, color: "text-green", category: "Users",
      permission: "export_data",
      action: () => downloadAuthFile("/api/admin/export/drivers", "drivers.csv"),
    },
    {
      id: "owners",
      label: "Fleet Owners",
      desc: "Owners with driver count, bank details, cashup method",
      icon: Building, color: "text-purple", category: "Users",
      permission: "export_data",
      action: () => downloadAuthFile("/api/admin/export/owners", "fleet-owners.csv"),
    },
    // Finance
    {
      id: "transactions",
      label: "Transactions",
      desc: "Full transaction ledger — all types, amounts, status, references",
      icon: ArrowLeftRight, color: "text-cyan", category: "Finance",
      permission: "export_data",
      action: () => api.exportTransactions(),
    },
    {
      id: "withdrawals",
      label: "Withdrawals",
      desc: "All withdrawal requests with bank details and status",
      icon: Wallet, color: "text-yellow", category: "Finance",
      permission: "export_data",
      action: () => downloadAuthFile("/api/admin/export/withdrawals", "withdrawals.csv"),
    },
    {
      id: "financial-report",
      label: "Financial Report",
      desc: "Monthly breakdown — gross volume, fees, driver payouts",
      icon: BarChart3, color: "text-green", category: "Finance",
      permission: "export_data",
      action: () => downloadAuthFile("/api/admin/export/financial-report", "financial-report.csv"),
    },
    {
      id: "refunds",
      label: "Refunds",
      desc: "All refund requests with user, amount, reason, and resolution",
      icon: Receipt, color: "text-orange-400", category: "Finance",
      permission: "manage_refunds",
      action: () => downloadAuthFile("/api/admin/export/refunds", "refunds.csv"),
    },
    // Compliance
    {
      id: "kyc",
      label: "KYC Submissions",
      desc: "KYC status for all drivers — approved, pending, rejected",
      icon: ShieldCheck, color: "text-purple", category: "Compliance",
      permission: "review_kyc",
      action: () => downloadAuthFile("/api/admin/export/kyc", "kyc-submissions.csv"),
    },
    {
      id: "flagged",
      label: "Flagged Accounts",
      desc: "All flagged users with flag reason and date",
      icon: XCircle, color: "text-red", category: "Compliance",
      permission: "view_risk",
      action: () => downloadAuthFile("/api/admin/export/flagged", "flagged-accounts.csv"),
    },
    // HR
    {
      id: "hr-staff",
      label: "Staff & HR",
      desc: "Staff directory with departments, salaries, and status",
      icon: FileText, color: "text-yellow", category: "HR",
      permission: "manage_staff",
      action: () => downloadAuthFile("/api/admin/hr/export", "staff.csv"),
    },
    {
      id: "payroll",
      label: "Payroll Summary",
      desc: "Payroll runs with gross, PAYE, UIF, net per employee",
      icon: CreditCard, color: "text-purple", category: "HR",
      permission: "manage_staff",
      action: () => downloadAuthFile("/api/admin/export/payroll", "payroll.csv"),
    },
  ];

  const categories = Array.from(new Set(EXPORTS.map(e => e.category)));

  return (
    <AdminShell title="Export Center" subtitle="Download platform data as CSV files">
      <div className="space-y-6">

        {/* Info banner */}
        <div className="flex items-center gap-3 px-4 py-3 bg-cyan/5 border border-cyan/20 rounded-xl">
          <Package size={16} className="text-cyan flex-shrink-0" />
          <div>
            <p className="text-text text-sm font-semibold">Data exports are generated in real-time.</p>
            <p className="text-textMuted text-xs mt-0.5">All exports include data up to the current moment. Large datasets may take a few seconds to generate.</p>
          </div>
        </div>

        {/* Export grid by category */}
        {categories.map(category => (
          <div key={category}>
            <p className="text-[10px] font-extrabold text-textDim uppercase tracking-widest mb-3">{category}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {EXPORTS.filter(e => e.category === category).map(def => {
                const allowed = hasPermission(def.permission) || hasPermission("export_data");
                const isRunning = running === def.id;
                const Icon = def.icon;
                return (
                  <div
                    key={def.id}
                    className={`bg-bg2 border rounded-xl p-4 flex items-start gap-4 transition-all ${
                      allowed ? "border-border hover:border-cyan/30" : "border-border opacity-50"
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-bg`}>
                      <Icon size={18} className={def.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-text font-bold text-sm">{def.label}</p>
                      <p className="text-textMuted text-xs mt-0.5 leading-relaxed">{def.desc}</p>
                      <div className="mt-3">
                        <Button
                          variant="secondary"
                          onClick={() => allowed && run(def)}
                          disabled={!allowed || !!running}
                          loading={isRunning}
                        >
                          <Download size={12} />
                          {isRunning ? "Generating…" : "Export CSV"}
                        </Button>
                        {!allowed && (
                          <p className="text-[10px] text-red mt-1.5">Insufficient permissions</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Export history */}
        {jobs.length > 0 && (
          <div>
            <p className="text-[10px] font-extrabold text-textDim uppercase tracking-widest mb-3">Session Export History</p>
            <Card>
              <div className="divide-y divide-border">
                {jobs.map(job => (
                  <div key={job.id} className="flex items-center justify-between px-4 py-3 gap-3">
                    <div className="flex items-center gap-3">
                      {job.status === "pending" && <RefreshCw size={14} className="text-yellow animate-spin flex-shrink-0" />}
                      {job.status === "ready" && <CheckCircle size={14} className="text-green flex-shrink-0" />}
                      {job.status === "failed" && <XCircle size={14} className="text-red flex-shrink-0" />}
                      <div>
                        <p className="text-text text-sm font-semibold">{job.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Clock size={9} className="text-textDim" />
                          <p className="text-textDim text-[10px]">{job.created_at.toLocaleTimeString()}</p>
                          {job.rows !== undefined && (
                            <p className="text-textDim text-[10px]">· {job.rows.toLocaleString()} rows</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold ${job.status === "ready" ? "bg-green/10 border-green/20 text-green" : job.status === "failed" ? "bg-red/10 border-red/20 text-red" : "bg-yellow/10 border-yellow/20 text-yellow"}`}>{job.status}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
