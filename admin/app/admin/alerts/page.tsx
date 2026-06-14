"use client";
import { useEffect, useState, useCallback } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Spinner, Button } from "@/components/ui";
import { api } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  AlertTriangle, CheckCircle, Clock, RefreshCw, ArrowRight,
  Zap, Shield, ShieldAlert, Fingerprint, Users, Scale,
  Activity, TrendingDown, Bell, BadgeAlert,
} from "lucide-react";
import Link from "next/link";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authH = () => ({ Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}` });

type AlertItem = {
  id: string;
  severity: "critical" | "high" | "medium" | "info";
  icon: any;
  title: string;
  description: string;
  count: number;
  href: string;
  actionLabel: string;
};

function SeverityBadge({ severity }: { severity: AlertItem["severity"] }) {
  const map = {
    critical: "bg-red/10 text-red border-red/20",
    high:     "bg-yellow/10 text-yellow border-yellow/20",
    medium:   "bg-cyan/10 text-cyan border-cyan/20",
    info:     "bg-purple/10 text-purple border-purple/20",
  };
  return (
    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${map[severity]}`}>
      {severity}
    </span>
  );
}

function AlertCard({ alert }: { alert: AlertItem }) {
  if (alert.count === 0) return null;
  const borderMap = { critical: "border-red/30 bg-red/5", high: "border-yellow/30 bg-yellow/5", medium: "border-cyan/10 bg-bg2", info: "border-purple/10 bg-bg2" };
  const numMap = { critical: "text-red", high: "text-yellow", medium: "text-cyan", info: "text-purple" };
  return (
    <div className={`border rounded-xl p-4 flex items-start gap-4 ${borderMap[alert.severity]}`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${numMap[alert.severity]} bg-current/10`}>
        <alert.icon size={18} className={numMap[alert.severity]} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-text font-bold text-sm">{alert.title}</p>
          <SeverityBadge severity={alert.severity} />
        </div>
        <p className="text-textMuted text-xs">{alert.description}</p>
        <p className={`text-2xl font-black mt-1 ${numMap[alert.severity]}`}>{alert.count}</p>
      </div>
      <Link href={alert.href}>
        <button className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border transition-all flex-shrink-0 ${
          alert.severity === "critical" ? "border-red/30 text-red hover:bg-red/10" :
          alert.severity === "high"     ? "border-yellow/30 text-yellow hover:bg-yellow/10" :
          "border-cyan/30 text-cyan hover:bg-cyan/10"
        }`}>
          {alert.actionLabel} <ArrowRight size={11} />
        </button>
      </Link>
    </div>
  );
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dash, disputes, riskData, withdrawals] = await Promise.allSettled([
        api.dashboard().then(r => r.data),
        fetch(`${BASE}/api/admin/disputes?status=open`, { headers: authH() }).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
        api.riskUsers().then(r => r.data),
        api.withdrawals().then(r => r.data),
      ]);

      const d = dash.status === "fulfilled" ? dash.value : null;
      const openDisputes: any[] = (disputes.status === "fulfilled" ? disputes.value : []).filter((d: any) => d.status === "open" || d.status === "escalated");
      const riskUsers: any[] = riskData.status === "fulfilled" ? riskData.value : [];
      const allWithdrawals: any[] = withdrawals.status === "fulfilled" ? withdrawals.value : [];

      const failedPayouts = allWithdrawals.filter(w => w.status === "payout_failed");
      const oldDisputes = openDisputes.filter(d => {
        const days = Math.floor((Date.now() - new Date(d.created_at).getTime()) / 86400000);
        return days > 7;
      });
      const criticalRisk = riskUsers.filter(u => u.risk_score >= 90);
      const highRisk = riskUsers.filter(u => u.risk_score >= 75 && u.risk_score < 90);

      const built: AlertItem[] = ([
        // ── CRITICAL ─────────────────────────────────────────────────
        {
          id: "failed-payouts",
          severity: "critical" as const,
          icon: Zap,
          title: "Failed Payouts",
          description: "Driver payouts that failed to reach their bank accounts. Money is in limbo — needs immediate retry or manual intervention.",
          count: failedPayouts.length,
          href: "/admin/withdrawals",
          actionLabel: "Retry Payouts",
        },
        {
          id: "incidents",
          severity: "critical" as const,
          icon: Shield,
          title: "Active Safety Incidents",
          description: "Unresolved SOS or safety incidents on the platform. Drivers or passengers may be in danger.",
          count: d?.active_incidents ?? 0,
          href: "/admin/saferide/incidents",
          actionLabel: "Respond Now",
        },
        {
          id: "critical-risk",
          severity: "critical" as const,
          icon: BadgeAlert,
          title: "Critical Risk Accounts",
          description: "Users with risk score ≥ 90. Likely fraudulent or compromised accounts requiring immediate freeze.",
          count: criticalRisk.length,
          href: "/admin/risk",
          actionLabel: "Review & Freeze",
        },

        // ── HIGH PRIORITY ────────────────────────────────────────────
        {
          id: "pending-withdrawals",
          severity: "high" as const,
          icon: Zap,
          title: "Pending Withdrawal Requests",
          description: "Drivers waiting for their payout to be approved. Delays damage trust — approve or reject today.",
          count: d?.pending_withdrawals ?? 0,
          href: "/admin/withdrawals",
          actionLabel: "Approve Payouts",
        },
        {
          id: "overdue-disputes",
          severity: "high" as const,
          icon: Scale,
          title: "Overdue Disputes (>7 days)",
          description: "Open disputes that have been waiting over a week without resolution. SLA breached.",
          count: oldDisputes.length,
          href: "/admin/disputes",
          actionLabel: "Resolve Disputes",
        },
        {
          id: "flagged-accounts",
          severity: "high" as const,
          icon: ShieldAlert,
          title: "Flagged Accounts",
          description: "User accounts flagged for suspicious activity, reports, or manual review.",
          count: d?.flagged_accounts ?? 0,
          href: "/admin/users",
          actionLabel: "Review Flags",
        },

        // ── MEDIUM ───────────────────────────────────────────────────
        {
          id: "pending-kyc",
          severity: "medium" as const,
          icon: Fingerprint,
          title: "Pending KYC Reviews",
          description: "Driver identity documents waiting for admin review and approval. Drivers can't receive payments until verified.",
          count: d?.pending_kyc ?? 0,
          href: "/admin/kyc",
          actionLabel: "Review KYC",
        },
        {
          id: "pending-drivers",
          severity: "medium" as const,
          icon: Users,
          title: "Unverified Drivers",
          description: "Drivers who have completed onboarding but haven't been verified yet.",
          count: d?.pending_drivers ?? 0,
          href: "/admin/drivers",
          actionLabel: "Verify Drivers",
        },
        {
          id: "open-disputes",
          severity: "medium" as const,
          icon: Scale,
          title: "Open Disputes (all)",
          description: "All open payment/service disputes requiring resolution.",
          count: openDisputes.length,
          href: "/admin/disputes",
          actionLabel: "View Disputes",
        },
        {
          id: "high-risk",
          severity: "medium" as const,
          icon: ShieldAlert,
          title: "High Risk Users",
          description: "Users with risk score 75–89. Monitor closely and consider restricting transaction limits.",
          count: highRisk.length,
          href: "/admin/risk",
          actionLabel: "View Risk",
        },

        // ── INFO ─────────────────────────────────────────────────────
        {
          id: "new-signups-today",
          severity: "info" as const,
          icon: Users,
          title: "New Signups Today",
          description: "Users who registered today. Review for any unusual registration patterns.",
          count: d?.today_signups ?? 0,
          href: "/admin/users",
          actionLabel: "View Users",
        },
        {
          id: "transactions-today",
          severity: "info" as const,
          icon: Activity,
          title: "Transactions Today",
          description: "Total payments processed today.",
          count: d?.today_transactions ?? 0,
          href: "/admin/transactions",
          actionLabel: "View Transactions",
        },
      ] as AlertItem[]).filter(a => a.count > 0);

      setAlerts(built);
      setLastRefreshed(new Date());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [load]);

  const criticalAlerts = alerts.filter(a => a.severity === "critical");
  const highAlerts = alerts.filter(a => a.severity === "high");
  const mediumAlerts = alerts.filter(a => a.severity === "medium");
  const infoAlerts = alerts.filter(a => a.severity === "info");
  const totalUrgent = criticalAlerts.length + highAlerts.length;

  return (
    <AdminShell title="System Alerts">
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {totalUrgent > 0 ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-red/10 border border-red/20 rounded-full">
                <AlertTriangle size={14} className="text-red" />
                <span className="text-red text-xs font-bold">{totalUrgent} urgent item{totalUrgent !== 1 ? "s" : ""} need attention</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green/10 border border-green/20 rounded-full">
                <CheckCircle size={14} className="text-green" />
                <span className="text-green text-xs font-bold">No urgent alerts</span>
              </div>
            )}
            {lastRefreshed && (
              <span className="text-textDim text-[10px]">
                Updated {lastRefreshed.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-textDim text-[10px]">Auto-refreshes every 30s</span>
            <Button variant="secondary" onClick={load} disabled={loading}>
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
          </div>
        </div>

        {loading && alerts.length === 0 ? <Spinner /> : alerts.length === 0 ? (
          <div className="bg-green/5 border border-green/20 rounded-2xl p-12 text-center">
            <CheckCircle size={48} className="text-green mx-auto mb-4" />
            <p className="text-green text-xl font-black">All Clear</p>
            <p className="text-textMuted text-sm mt-2">No alerts at this time. Platform is running smoothly.</p>
          </div>
        ) : (
          <>
            {/* Summary row */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Critical",   count: criticalAlerts.length, color: "text-red",    bg: "bg-red/10    border-red/20" },
                { label: "High",       count: highAlerts.length,     color: "text-yellow", bg: "bg-yellow/10 border-yellow/20" },
                { label: "Medium",     count: mediumAlerts.length,   color: "text-cyan",   bg: "bg-cyan/10   border-cyan/20" },
                { label: "Info",       count: infoAlerts.length,     color: "text-purple", bg: "bg-purple/10 border-purple/20" },
              ].map(s => (
                <div key={s.label} className={`border rounded-xl p-4 text-center ${s.bg}`}>
                  <p className={`text-2xl font-black ${s.color}`}>{s.count}</p>
                  <p className="text-textMuted text-xs mt-1">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Alert sections */}
            {criticalAlerts.length > 0 && (
              <div className="space-y-3">
                <p className="text-[10px] font-black text-red uppercase tracking-widest flex items-center gap-1.5">
                  <AlertTriangle size={11} /> Critical — Immediate Action Required
                </p>
                {criticalAlerts.map(a => <AlertCard key={a.id} alert={a} />)}
              </div>
            )}

            {highAlerts.length > 0 && (
              <div className="space-y-3">
                <p className="text-[10px] font-black text-yellow uppercase tracking-widest flex items-center gap-1.5">
                  <Clock size={11} /> High Priority — Action Today
                </p>
                {highAlerts.map(a => <AlertCard key={a.id} alert={a} />)}
              </div>
            )}

            {mediumAlerts.length > 0 && (
              <div className="space-y-3">
                <p className="text-[10px] font-black text-cyan uppercase tracking-widest flex items-center gap-1.5">
                  <Bell size={11} /> Medium — Action This Week
                </p>
                {mediumAlerts.map(a => <AlertCard key={a.id} alert={a} />)}
              </div>
            )}

            {infoAlerts.length > 0 && (
              <div className="space-y-3">
                <p className="text-[10px] font-black text-purple uppercase tracking-widest flex items-center gap-1.5">
                  <Activity size={11} /> Today's Activity
                </p>
                {infoAlerts.map(a => <AlertCard key={a.id} alert={a} />)}
              </div>
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}
