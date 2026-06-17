"use client";
import { useEffect, useState, useCallback, useRef, Fragment } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  AlertTriangle, CheckCircle2, Clock, RefreshCw, ArrowRight,
  Zap, Shield, ShieldAlert, Fingerprint, Users, Scale,
  Activity, Bell, BadgeAlert, XCircle, Database,
  TrendingUp, RotateCcw, AlertOctagon, ChevronDown, ChevronRight,
  Server, Wifi, Hash, Eye, EyeOff, X,
} from "lucide-react";
import Link from "next/link";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authH = () => ({ Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}` });

// ── Types ──────────────────────────────────────────────────────────────────
type Severity = "critical" | "high" | "medium" | "info";

type AlertItem = {
  id:          string;
  severity:    Severity;
  icon:        any;
  title:       string;
  description: string;
  count:       number;
  href:        string;
  actionLabel: string;
  details?:    { label: string; value: string }[];
  snoozeable?: boolean;
};

type HealthCheck = {
  label:   string;
  value:   string | number;
  ok:      boolean;
  icon:    any;
  detail?: string;
};

// ── Severity config ────────────────────────────────────────────────────────
const SEV: Record<Severity, { label: string; color: string; bg: string; border: string; ring: string }> = {
  critical: { label: "Critical", color: "text-red",    bg: "bg-red/5",     border: "border-red/30",    ring: "bg-red"    },
  high:     { label: "High",     color: "text-yellow", bg: "bg-yellow/5",  border: "border-yellow/30", ring: "bg-yellow" },
  medium:   { label: "Medium",   color: "text-cyan",   bg: "bg-cyan/5",    border: "border-cyan/20",   ring: "bg-cyan"   },
  info:     { label: "Info",     color: "text-purple", bg: "bg-purple/5",  border: "border-purple/20", ring: "bg-purple" },
};

// ── Relative time ──────────────────────────────────────────────────────────
function rel(ts: string) {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}

// ── Alert card ─────────────────────────────────────────────────────────────
function AlertCard({ alert, snoozed, onSnooze }: {
  alert: AlertItem;
  snoozed: Set<string>;
  onSnooze: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (alert.count === 0) return null;
  if (snoozed.has(alert.id)) return null;
  const s = SEV[alert.severity];
  const Icon = alert.icon;

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${s.bg} ${s.border}`}>
      <div className="p-4 flex items-start gap-4">
        {/* Icon */}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${s.bg} border ${s.border}`}>
          <Icon size={18} className={s.color} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <p className="text-text font-bold text-sm">{alert.title}</p>
            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${s.border} ${s.color} ${s.bg}`}>
              {s.label}
            </span>
          </div>
          <p className="text-textMuted text-xs leading-relaxed">{alert.description}</p>
          <p className={`text-3xl font-black mt-2 tabular-nums leading-none ${s.color}`}>{alert.count.toLocaleString()}</p>

          {/* Details (expandable) */}
          {alert.details && alert.details.length > 0 && (
            <div className="mt-3">
              <button onClick={() => setExpanded(v => !v)}
                className={`flex items-center gap-1 text-[10px] font-bold ${s.color} opacity-70 hover:opacity-100 transition-opacity`}>
                {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                {expanded ? "Hide" : "Show"} details
              </button>
              {expanded && (
                <div className="mt-2 space-y-1">
                  {alert.details.map((d, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-1.5 bg-bg/50 rounded-lg">
                      <span className="text-textMuted text-[10px] font-semibold truncate flex-1">{d.label}</span>
                      <span className={`text-[10px] font-bold ${s.color} ml-3`}>{d.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 flex-shrink-0 items-end">
          <Link href={alert.href}>
            <button className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border transition-all whitespace-nowrap ${s.border} ${s.color} hover:opacity-80`}>
              {alert.actionLabel} <ArrowRight size={11} />
            </button>
          </Link>
          {alert.snoozeable && (
            <button onClick={() => onSnooze(alert.id)}
              className="flex items-center gap-1 text-[10px] text-textDim hover:text-textMuted transition-colors">
              <EyeOff size={10} /> Snooze
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── System health item ─────────────────────────────────────────────────────
function HealthItem({ check }: { check: HealthCheck }) {
  const Icon = check.icon;
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border ${
      check.ok ? "bg-green/5 border-green/20" : "bg-red/5 border-red/20"
    }`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
        check.ok ? "bg-green/10" : "bg-red/10"
      }`}>
        <Icon size={14} className={check.ok ? "text-green" : "text-red"} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-text text-xs font-bold">{check.label}</p>
        {check.detail && <p className="text-textDim text-[10px]">{check.detail}</p>}
      </div>
      <div className="text-right flex-shrink-0">
        <p className={`text-sm font-black tabular-nums ${check.ok ? "text-green" : "text-red"}`}>{check.value}</p>
        {check.ok
          ? <CheckCircle2 size={12} className="text-green ml-auto mt-0.5" />
          : <XCircle    size={12} className="text-red ml-auto mt-0.5" />}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function AlertsPage() {
  type Tab = "all" | "urgent" | "compliance" | "health";

  const [alerts,      setAlerts]      = useState<AlertItem[]>([]);
  const [health,      setHealth]      = useState<HealthCheck[]>([]);
  const [compAlerts,  setCompAlerts]  = useState<any>(null);
  const [loading,     setLoading]     = useState(true);
  const [healthLoading, setHealthLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [countdown,   setCountdown]   = useState(30);
  const [snoozed,     setSnoozed]     = useState<Set<string>>(new Set());
  const [activeTab,   setActiveTab]   = useState<Tab>("all");

  const timerRef = useRef<any>(null);

  const snooze = (id: string) => setSnoozed(s => new Set([...s, id]));
  const clearSnooze = () => setSnoozed(new Set());

  // ── Load system health ───────────────────────────────────────────────────
  const loadHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const [h, compliance] = await Promise.allSettled([
        fetch(`${BASE}/api/admin/system/health`, { headers: authH() }).then(r => r.json()),
        fetch(`${BASE}/api/admin/compliance/alerts`, { headers: authH() }).then(r => r.json()),
      ]);

      if (h.status === "fulfilled") {
        const d = h.value;
        setHealth([
          {
            label: "Database",
            value: d.db_connected ? `${d.db_latency_ms}ms` : "DOWN",
            ok: d.db_connected && d.db_latency_ms < 200,
            icon: Database,
            detail: d.db_connected ? `${d.db_latency_ms}ms latency` : "Connection failed",
          },
          {
            label: "Failed Txns Today",
            value: d.stats?.failed_transactions_today ?? 0,
            ok: (d.stats?.failed_transactions_today ?? 0) === 0,
            icon: XCircle,
            detail: "Transactions with failed status today",
          },
          {
            label: "Active Admin Sessions",
            value: d.stats?.active_admin_sessions ?? 0,
            ok: true,
            icon: Users,
            detail: "Admins currently logged in",
          },
          {
            label: "Open Disputes",
            value: d.stats?.open_disputes ?? 0,
            ok: (d.stats?.open_disputes ?? 0) === 0,
            icon: Scale,
            detail: "Unresolved payment disputes",
          },
          {
            label: "Blacklisted Numbers",
            value: d.stats?.blacklisted_numbers ?? 0,
            ok: true,
            icon: Shield,
            detail: "Phone numbers on blocklist",
          },
          {
            label: "API Status",
            value: d.status === "healthy" ? "Online" : "Degraded",
            ok: d.status === "healthy",
            icon: Wifi,
            detail: "Railway backend API",
          },
        ]);
      }
      if (compliance.status === "fulfilled") {
        setCompAlerts(compliance.value);
      }
    } finally { setHealthLoading(false); }
  }, []);

  // ── Load main alerts ─────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dashR, disputesR, riskR, withdrawalsR, refundsR, chargebacksR, velocityR] = await Promise.allSettled([
        api.dashboard().then(r => r.data),
        fetch(`${BASE}/api/admin/disputes`, { headers: authH() }).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
        api.riskUsers().then(r => r.data),
        api.withdrawals().then(r => r.data),
        api.refunds().then(r => r.data),
        api.chargebacks().then(r => r.data),
        fetch(`${BASE}/api/admin/velocity/alerts`, { headers: authH() }).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
      ]);

      const d            = dashR.status          === "fulfilled" ? dashR.value          : null;
      const disputes     = disputesR.status       === "fulfilled" ? disputesR.value      : [];
      const riskUsers    = riskR.status           === "fulfilled" ? riskR.value          : [];
      const withdrawals  = withdrawalsR.status    === "fulfilled" ? withdrawalsR.value   : [];
      const refunds      = refundsR.status        === "fulfilled" ? refundsR.value       : [];
      const chargebacks  = chargebacksR.status    === "fulfilled" ? chargebacksR.value   : [];
      const velocityAlerts = velocityR.status     === "fulfilled" ? velocityR.value      : [];

      // Derived
      const failedPayouts     = withdrawals.filter((w: any) => w.status === "payout_failed");
      const pendingWithdraws  = withdrawals.filter((w: any) => w.status === "pending");
      const openDisputes      = disputes.filter((x: any) => ["open","escalated"].includes(x.status));
      const overdueDisputes   = openDisputes.filter((x: any) => {
        const days = (Date.now() - new Date(x.created_at).getTime()) / 86400000;
        return days > 7;
      });
      const criticalRisk      = riskUsers.filter((u: any) => u.risk_score >= 90);
      const highRisk          = riskUsers.filter((u: any) => u.risk_score >= 75 && u.risk_score < 90);
      const pendingRefunds    = refunds.filter((r: any) => r.status === "pending");
      const openChargebacks   = chargebacks.filter((c: any) => ["pending","under_review"].includes(c.status));
      const staleChargebacks  = openChargebacks.filter((c: any) => {
        const days = (Date.now() - new Date(c.created_at).getTime()) / 86400000;
        return days > 14;
      });
      const unresolvedVelocity = velocityAlerts.filter((v: any) => !v.resolved);
      const overdueRefunds    = pendingRefunds.filter((r: any) => {
        const hrs = (Date.now() - new Date(r.created_at).getTime()) / 3600000;
        return hrs > 24;
      });

      const built: AlertItem[] = ([
        // ─── CRITICAL ───────────────────────────────────────────────────────
        {
          id: "failed-payouts",
          severity: "critical" as Severity,
          icon: Zap,
          title: "Failed Driver Payouts",
          description: "Payouts that failed to reach driver bank accounts. Funds are in limbo — retry or escalate immediately.",
          count: failedPayouts.length,
          href: "/admin/withdrawals",
          actionLabel: "Retry Payouts",
          details: failedPayouts.slice(0, 4).map((w: any) => ({
            label: w.driver_name || w.user_name || "Driver",
            value: formatZAR(w.amount),
          })),
        },
        {
          id: "safety-incidents",
          severity: "critical" as Severity,
          icon: Shield,
          title: "Active Safety Incidents",
          description: "Unresolved SOS or safety alerts. Drivers or passengers may be in danger. Respond immediately.",
          count: d?.active_incidents ?? 0,
          href: "/admin/saferide/incidents",
          actionLabel: "Respond Now",
        },
        {
          id: "critical-risk",
          severity: "critical" as Severity,
          icon: BadgeAlert,
          title: "Critical Risk Accounts (≥90)",
          description: "Users scoring ≥90 on the fraud/risk model. Likely compromised or fraudulent — freeze and investigate.",
          count: criticalRisk.length,
          href: "/admin/risk",
          actionLabel: "Freeze Accounts",
          details: criticalRisk.slice(0, 4).map((u: any) => ({
            label: u.full_name || u.phone_number,
            value: `Score ${u.risk_score}`,
          })),
        },
        {
          id: "velocity-violations",
          severity: "critical" as Severity,
          icon: Activity,
          title: "Velocity Rule Violations",
          description: "Unresolved fraud velocity alerts — users have breached transaction frequency or amount rules.",
          count: unresolvedVelocity.length,
          href: "/admin/velocity",
          actionLabel: "Review Violations",
          details: unresolvedVelocity.slice(0, 4).map((v: any) => ({
            label: v.user_name || v.phone_number || "User",
            value: v.rule_name || "Rule violation",
          })),
        },
        {
          id: "stale-chargebacks",
          severity: "critical" as Severity,
          icon: AlertOctagon,
          title: "Stale Chargebacks (>14 days)",
          description: "Bank chargebacks open for over 14 days. Evidence window is closing — submit to Stitch immediately.",
          count: staleChargebacks.length,
          href: "/admin/chargebacks",
          actionLabel: "Submit Evidence",
        },

        // ─── HIGH ────────────────────────────────────────────────────────────
        {
          id: "pending-withdrawals",
          severity: "high" as Severity,
          icon: Zap,
          title: "Pending Withdrawal Requests",
          description: "Drivers waiting for payout approval. Delays damage trust and retention — clear the queue today.",
          count: pendingWithdraws.length,
          href: "/admin/withdrawals",
          actionLabel: "Approve Now",
          details: pendingWithdraws.slice(0, 4).map((w: any) => ({
            label: w.driver_name || "Driver",
            value: formatZAR(w.amount),
          })),
        },
        {
          id: "overdue-refunds",
          severity: "high" as Severity,
          icon: RotateCcw,
          title: "Overdue Refunds (>24h)",
          description: "Pending refund requests that have been waiting over 24 hours. Likely to escalate to chargebacks.",
          count: overdueRefunds.length,
          href: "/admin/refunds",
          actionLabel: "Process Refunds",
          details: overdueRefunds.slice(0, 4).map((r: any) => ({
            label: r.user_name || "Customer",
            value: formatZAR(r.amount),
          })),
        },
        {
          id: "overdue-disputes",
          severity: "high" as Severity,
          icon: Scale,
          title: "Overdue Disputes (>7 days)",
          description: "Open disputes waiting over a week without resolution. SLA is breached — customer satisfaction at risk.",
          count: overdueDisputes.length,
          href: "/admin/disputes",
          actionLabel: "Resolve Now",
          details: overdueDisputes.slice(0, 4).map((x: any) => ({
            label: x.user_name || "User",
            value: `${Math.floor((Date.now() - new Date(x.created_at).getTime()) / 86400000)}d old`,
          })),
        },
        {
          id: "flagged-accounts",
          severity: "high" as Severity,
          icon: ShieldAlert,
          title: "Flagged Accounts",
          description: "User accounts flagged for suspicious behaviour, reports, or manual review.",
          count: d?.flagged_accounts ?? 0,
          href: "/admin/users",
          actionLabel: "Review Flags",
        },
        {
          id: "open-chargebacks",
          severity: "high" as Severity,
          icon: AlertOctagon,
          title: "Open Chargebacks",
          description: "Bank-initiated payment disputes pending resolution. Each costs TNR the disputed amount + bank fees if lost.",
          count: openChargebacks.length,
          href: "/admin/chargebacks",
          actionLabel: "View Chargebacks",
          details: openChargebacks.slice(0, 4).map((c: any) => ({
            label: c.user_name || "Customer",
            value: formatZAR(c.amount),
          })),
        },

        // ─── MEDIUM ──────────────────────────────────────────────────────────
        {
          id: "pending-kyc",
          severity: "medium" as Severity,
          icon: Fingerprint,
          title: "Pending KYC Reviews",
          description: "Driver ID documents awaiting review. Drivers cannot receive payments until KYC is approved.",
          count: d?.pending_kyc ?? 0,
          href: "/admin/kyc",
          actionLabel: "Review KYC",
        },
        {
          id: "unverified-drivers",
          severity: "medium" as Severity,
          icon: Users,
          title: "Unverified Drivers",
          description: "Drivers who completed onboarding but haven't been verified. They cannot take rides until approved.",
          count: d?.pending_drivers ?? 0,
          href: "/admin/drivers",
          actionLabel: "Verify Drivers",
        },
        {
          id: "open-disputes",
          severity: "medium" as Severity,
          icon: Scale,
          title: "All Open Disputes",
          description: "All open payment or service disputes. Excludes overdue (shown separately above).",
          count: Math.max(0, openDisputes.length - overdueDisputes.length),
          href: "/admin/disputes",
          actionLabel: "View Disputes",
        },
        {
          id: "pending-refunds",
          severity: "medium" as Severity,
          icon: RotateCcw,
          title: "Pending Refunds",
          description: "All pending refund requests. Shows fresh requests not yet overdue.",
          count: Math.max(0, pendingRefunds.length - overdueRefunds.length),
          href: "/admin/refunds",
          actionLabel: "View Refunds",
        },
        {
          id: "high-risk",
          severity: "medium" as Severity,
          icon: ShieldAlert,
          title: "High Risk Users (75–89)",
          description: "Users scoring 75–89. Monitor closely and consider transaction limit restrictions.",
          count: highRisk.length,
          href: "/admin/risk",
          actionLabel: "View Risk",
          details: highRisk.slice(0, 4).map((u: any) => ({
            label: u.full_name || u.phone_number,
            value: `Score ${u.risk_score}`,
          })),
        },

        // ─── INFO ─────────────────────────────────────────────────────────────
        {
          id: "today-signups",
          severity: "info" as Severity,
          icon: Users,
          title: "New Signups Today",
          description: "Users who registered today. Review for unusual registration patterns or bulk sign-ups.",
          count: d?.today_signups ?? 0,
          href: "/admin/users",
          actionLabel: "View Users",
          snoozeable: true,
        },
        {
          id: "today-transactions",
          severity: "info" as Severity,
          icon: TrendingUp,
          title: "Transactions Today",
          description: "Total payments processed today.",
          count: d?.today_transactions ?? 0,
          href: "/admin/transactions",
          actionLabel: "View Transactions",
          snoozeable: true,
        },
      ] as AlertItem[]).filter(a => a.count > 0);

      setAlerts(built);
      setLastUpdated(new Date());
    } finally { setLoading(false); }
  }, []);

  const refreshAll = useCallback(() => {
    load(); loadHealth(); setCountdown(30);
  }, [load, loadHealth]);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown(c => { if (c <= 1) { refreshAll(); return 30; } return c - 1; });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [refreshAll]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const visible       = alerts.filter(a => !snoozed.has(a.id));
  const critical      = visible.filter(a => a.severity === "critical");
  const high          = visible.filter(a => a.severity === "high");
  const medium        = visible.filter(a => a.severity === "medium");
  const info          = visible.filter(a => a.severity === "info");
  const totalUrgent   = critical.length + high.length;
  const totalAlerts   = visible.length;

  const filteredByTab = (tab: Tab) => {
    if (tab === "urgent")     return [...critical, ...high];
    if (tab === "all")        return visible;
    return visible;
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AdminShell title="System Alerts">
      <div className="space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            {totalUrgent > 0 ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-red/10 border border-red/20 rounded-full">
                <AlertTriangle size={13} className="text-red animate-pulse" />
                <span className="text-red text-xs font-bold">{totalUrgent} urgent — action required</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green/10 border border-green/20 rounded-full">
                <CheckCircle2 size={13} className="text-green" />
                <span className="text-green text-xs font-bold">No urgent alerts</span>
              </div>
            )}
            {lastUpdated && (
              <span className="text-textDim text-[10px]">
                Updated {lastUpdated.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
            {snoozed.size > 0 && (
              <button onClick={clearSnooze}
                className="flex items-center gap-1.5 text-[10px] text-textMuted hover:text-cyan border border-border rounded-full px-2 py-1 transition-colors">
                <Eye size={10} /> Show {snoozed.size} snoozed
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Countdown progress */}
            <div className="flex items-center gap-2">
              <div className="w-24 h-1 bg-bg3 rounded-full overflow-hidden">
                <div className="h-full bg-cyan/50 rounded-full transition-all duration-1000"
                  style={{ width: `${(countdown / 30) * 100}%` }} />
              </div>
              <span className="text-textDim text-[10px] w-6">{countdown}s</span>
            </div>
            <button onClick={refreshAll} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-textMuted hover:text-cyan border border-border rounded-lg transition-all">
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
        </div>

        {/* ── System Health strip ── */}
        <div>
          <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Server size={10} /> System Health
          </p>
          {healthLoading ? (
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {[1,2,3,4,5,6].map(i => <div key={i} className="h-16 bg-bg2 animate-pulse rounded-xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              {health.map((c, i) => <HealthItem key={i} check={c} />)}
            </div>
          )}
        </div>

        {/* ── Summary strip ── */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Critical", count: critical.length, s: SEV.critical },
            { label: "High",     count: high.length,     s: SEV.high     },
            { label: "Medium",   count: medium.length,   s: SEV.medium   },
            { label: "Info",     count: info.length,     s: SEV.info     },
          ].map(({ label, count, s }) => (
            <div key={label} className={`border rounded-xl p-4 text-center ${s.bg} ${s.border}`}>
              <p className={`text-3xl font-black tabular-nums ${s.color}`}>{count}</p>
              <p className="text-textMuted text-xs mt-1 font-bold">{label}</p>
              <div className="h-0.5 bg-bg3 rounded-full mt-2 overflow-hidden">
                <div className={`h-full rounded-full ${s.ring}`}
                  style={{ width: totalAlerts > 0 ? `${(count / totalAlerts) * 100}%` : "0%" }} />
              </div>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 border-b border-border">
          {([
            { id: "all",        label: `All (${totalAlerts})`,           icon: Bell   },
            { id: "urgent",     label: `Urgent (${totalUrgent})`,        icon: AlertTriangle, warn: totalUrgent > 0 },
            { id: "compliance", label: "Compliance",                     icon: Shield },
            { id: "health",     label: "System Health",                  icon: Server },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id as Tab)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
                activeTab === t.id ? "text-cyan border-cyan" : "text-textMuted border-transparent hover:text-text"
              }`}>
              <t.icon size={12} />
              {t.label}
              {(t as any).warn && activeTab !== t.id && (
                <span className="w-1.5 h-1.5 rounded-full bg-red animate-pulse" />
              )}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════════════════
            TAB: ALL / URGENT ALERTS
        ════════════════════════════════════════════════════════════════ */}
        {(activeTab === "all" || activeTab === "urgent") && (
          <>
            {loading && alerts.length === 0 ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <div key={i} className="h-24 bg-bg2 animate-pulse rounded-xl" />)}
              </div>
            ) : totalAlerts === 0 ? (
              <div className="bg-green/5 border border-green/20 rounded-2xl p-16 text-center">
                <CheckCircle2 size={52} className="text-green mx-auto mb-4" />
                <p className="text-green text-2xl font-black">All Clear</p>
                <p className="text-textMuted text-sm mt-2">No alerts at this time — platform is running smoothly.</p>
                {snoozed.size > 0 && (
                  <button onClick={clearSnooze} className="mt-4 text-xs text-cyan hover:underline">
                    Show {snoozed.size} snoozed alert{snoozed.size !== 1 ? "s" : ""}
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {critical.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-red uppercase tracking-widest flex items-center gap-2">
                      <AlertTriangle size={11} className="animate-pulse" /> Critical — Immediate Action Required
                    </p>
                    {critical.map(a => <AlertCard key={a.id} alert={a} snoozed={snoozed} onSnooze={snooze} />)}
                  </div>
                )}

                {(activeTab === "all" || activeTab === "urgent") && high.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-yellow uppercase tracking-widest flex items-center gap-2">
                      <Clock size={11} /> High Priority — Action Today
                    </p>
                    {high.map(a => <AlertCard key={a.id} alert={a} snoozed={snoozed} onSnooze={snooze} />)}
                  </div>
                )}

                {activeTab === "all" && medium.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-cyan uppercase tracking-widest flex items-center gap-2">
                      <Bell size={11} /> Medium — Action This Week
                    </p>
                    {medium.map(a => <AlertCard key={a.id} alert={a} snoozed={snoozed} onSnooze={snooze} />)}
                  </div>
                )}

                {activeTab === "all" && info.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-purple uppercase tracking-widest flex items-center gap-2">
                      <Activity size={11} /> Today's Activity
                    </p>
                    {info.map(a => <AlertCard key={a.id} alert={a} snoozed={snoozed} onSnooze={snooze} />)}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB: COMPLIANCE
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === "compliance" && (
          <div className="space-y-5">
            {!compAlerts ? (
              <div className="flex justify-center py-12"><Spinner /></div>
            ) : (
              <>
                {/* Velocity burst users */}
                {compAlerts.velocity_alerts?.length > 0 && (
                  <div className="bg-red/5 border border-red/20 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Zap size={14} className="text-red" />
                        <h3 className="text-sm font-bold text-text">Velocity Burst (5+ txns/hour)</h3>
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-red/10 text-red border border-red/20 rounded-full">
                          {compAlerts.velocity_alerts.length}
                        </span>
                      </div>
                      <Link href="/admin/velocity" className="text-xs text-red font-bold hover:underline flex items-center gap-1">
                        Velocity Rules <ArrowRight size={11} />
                      </Link>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-red/10">
                            {["User", "Phone", "Txns / hr", "Total Volume"].map((h, i) => (
                              <th key={i} className="text-left py-2 px-3 text-textDim text-[10px] font-bold uppercase tracking-wider">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {compAlerts.velocity_alerts.map((u: any, i: number) => (
                            <tr key={i} className="border-b border-red/10 hover:bg-red/5">
                              <td className="py-2.5 px-3 font-semibold text-text">{u.full_name}</td>
                              <td className="py-2.5 px-3 font-mono text-textMuted">{u.phone_number}</td>
                              <td className="py-2.5 px-3 font-black text-red">{u.txn_count}</td>
                              <td className="py-2.5 px-3 font-bold text-yellow">{formatZAR(u.total_amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Large transactions */}
                {compAlerts.large_transactions?.length > 0 && (
                  <div className="bg-yellow/5 border border-yellow/20 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <AlertTriangle size={14} className="text-yellow" />
                        <h3 className="text-sm font-bold text-text">Large Transactions (>R5,000 / 24h)</h3>
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-yellow/10 text-yellow border border-yellow/20 rounded-full">
                          {compAlerts.large_transactions.length}
                        </span>
                      </div>
                      <Link href="/admin/compliance" className="text-xs text-yellow font-bold hover:underline flex items-center gap-1">
                        Compliance <ArrowRight size={11} />
                      </Link>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-yellow/10">
                            {["Reference", "Amount", "Sender", "Receiver", "Status", "Date"].map((h, i) => (
                              <th key={i} className="text-left py-2 px-3 text-textDim text-[10px] font-bold uppercase tracking-wider">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {compAlerts.large_transactions.slice(0, 10).map((t: any) => (
                            <tr key={t.id} className="border-b border-yellow/10 hover:bg-yellow/5">
                              <td className="py-2.5 px-3 font-mono text-textMuted text-[10px]">{t.reference}</td>
                              <td className="py-2.5 px-3 font-black text-yellow">{formatZAR(t.amount)}</td>
                              <td className="py-2.5 px-3 text-textMuted">{t.sender_name || "—"}</td>
                              <td className="py-2.5 px-3 text-textMuted">{t.receiver_name || "—"}</td>
                              <td className="py-2.5 px-3">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                  t.status === "completed" ? "bg-green/10 border-green/20 text-green" :
                                  t.status === "pending"   ? "bg-yellow/10 border-yellow/20 text-yellow" :
                                  "bg-red/10 border-red/20 text-red"
                                }`}>{t.status}</span>
                              </td>
                              <td className="py-2.5 px-3 text-textDim text-[10px]">{formatDate(t.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Round amounts (structuring) */}
                {compAlerts.round_amount_alerts?.length > 0 && (
                  <div className="bg-purple/5 border border-purple/20 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Hash size={14} className="text-purple" />
                      <h3 className="text-sm font-bold text-text">Round-Amount Transactions (possible structuring)</h3>
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-purple/10 text-purple border border-purple/20 rounded-full">
                        {compAlerts.round_amount_alerts.length}
                      </span>
                    </div>
                    <p className="text-textMuted text-xs mb-4">
                      Transactions with amounts that are exact multiples of R1,000 (≥R1,000) in the last 24 hours.
                      Common indicator of structured money movement to avoid reporting thresholds.
                    </p>
                    <div className="space-y-2">
                      {compAlerts.round_amount_alerts.slice(0, 6).map((t: any) => (
                        <div key={t.id} className="flex items-center justify-between px-3 py-2 bg-bg/50 rounded-lg border border-purple/10">
                          <span className="text-textMuted text-xs">{t.sender_name || "Unknown"}</span>
                          <span className="font-black text-purple">{formatZAR(t.amount)}</span>
                          <span className="text-textDim text-[10px]">{formatDate(t.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Blacklist count */}
                {compAlerts.blacklist_count > 0 && (
                  <div className="flex items-center justify-between p-4 bg-bg2 border border-border rounded-xl">
                    <div className="flex items-center gap-3">
                      <Shield size={16} className="text-textMuted" />
                      <div>
                        <p className="text-text text-sm font-bold">Blacklisted Phone Numbers</p>
                        <p className="text-textMuted text-xs">Numbers blocked from registering or transacting</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-2xl font-black text-text">{compAlerts.blacklist_count}</p>
                      <Link href="/admin/compliance">
                        <button className="text-xs text-cyan font-bold border border-cyan/20 px-3 py-1.5 rounded-lg hover:bg-cyan/10 transition-all">
                          View <ArrowRight size={10} className="inline ml-1" />
                        </button>
                      </Link>
                    </div>
                  </div>
                )}

                {!compAlerts.velocity_alerts?.length && !compAlerts.large_transactions?.length && !compAlerts.round_amount_alerts?.length && (
                  <div className="py-16 text-center">
                    <CheckCircle2 size={36} className="text-green mx-auto mb-3" />
                    <p className="text-green font-bold">No compliance alerts</p>
                    <p className="text-textMuted text-xs mt-1">No velocity bursts, large transactions, or structuring patterns detected in the last 24 hours.</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB: SYSTEM HEALTH
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === "health" && (
          <div className="space-y-5">
            {healthLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[1,2,3,4].map(i => <div key={i} className="h-20 bg-bg2 animate-pulse rounded-xl" />)}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {health.map((c, i) => (
                    <div key={i} className={`flex items-center gap-4 p-4 border rounded-xl ${
                      c.ok ? "bg-green/5 border-green/20" : "bg-red/5 border-red/20"
                    }`}>
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${c.ok ? "bg-green/10" : "bg-red/10"}`}>
                        <c.icon size={20} className={c.ok ? "text-green" : "text-red"} />
                      </div>
                      <div className="flex-1">
                        <p className="text-text font-bold text-sm">{c.label}</p>
                        <p className="text-textMuted text-xs mt-0.5">{c.detail}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`text-2xl font-black tabular-nums ${c.ok ? "text-green" : "text-red"}`}>{c.value}</p>
                        <p className={`text-[10px] font-bold ${c.ok ? "text-green" : "text-red"}`}>{c.ok ? "OK" : "ALERT"}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-4 bg-bg2 border border-border rounded-xl text-center">
                  <p className="text-textDim text-xs">
                    System health is checked every refresh. DB latency above 200ms is flagged.
                    Failed transactions include all status=failed entries from today.
                  </p>
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </AdminShell>
  );
}
