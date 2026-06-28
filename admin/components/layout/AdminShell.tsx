"use client";
import { Sidebar } from "./Sidebar";
import { useEffect, useState, useCallback } from "react";
import { isAuthenticated } from "@/lib/auth";
import { useRouter, usePathname } from "next/navigation";
import { AlertTriangle, Clock, CheckCircle2, Fingerprint, Wallet, ShieldAlert, Bell, ChevronRight, Home } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";

// ── Token expiry ───────────────────────────────────────────────────────────────
function getTokenExpiryMs(): number | null {
  try {
    const token = typeof window !== "undefined" ? localStorage.getItem("tnr_admin_token") : null;
    if (!token) return null;
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 - Date.now();
  } catch { return null; }
}

// ── Breadcrumbs ────────────────────────────────────────────────────────────────
const SEG_LABELS: Record<string, string> = {
  admin: "Admin",
  dashboard: "Dashboard",
  drivers: "Drivers",
  owners: "Fleet Owners",
  users: "Users",
  passengers: "Passengers",
  kyc: "KYC Review",
  transactions: "Transactions",
  withdrawals: "Withdrawals",
  analytics: "Analytics",
  "data-analytics": "Data Analytics",
  saferide: "SafeRide",
  incidents: "Incidents",
  "dead-man-resets": "Dead Man Resets",
  compliance: "Compliance",
  regulatory: "Regulatory",
  risk: "Risk & Fraud",
  audit: "Audit Log",
  settings: "Settings",
  fleet: "Fleet",
  documents: "Documents",
  deductions: "Deductions",
  statements: "Statements",
  payroll: "Payroll",
  hr: "Human Resources",
  support: "Support",
  tickets: "Tickets",
  "whatsapp-support": "WhatsApp Support",
  whatsapp: "WhatsApp",
  refunds: "Refunds",
  chargebacks: "Chargebacks",
  ledger: "Ledger",
  reconciliation: "Reconciliation",
  settlement: "Settlement",
  treasury: "Treasury",
  revenue: "Revenue",
  "export-center": "Export Center",
  "fee-config": "Fee Config",
  "fee-simulator": "Fee Simulator",
  pricing: "Pricing",
  "system-wallet": "System Wallet",
  "wallet-ops": "Wallet Ops",
  velocity: "Velocity",
  limits: "Tx Limits",
  gdpr: "GDPR",
  disputes: "Disputes",
  "daily-ops": "Daily Ops",
  geography: "Coverage Zones",
  health: "System Health",
  monitoring: "Live Monitor",
  trips: "Live Trips",
  routes: "Routes",
  growth: "Growth",
  provinces: "Provinces",
  performance: "Performance",
  commissions: "Commissions",
  promotions: "Promotions",
  referrals: "Referrals",
  marketing: "Marketing",
  feedback: "Feedback",
  notifications: "Announcements",
  admins: "Admin Accounts",
  superadmin: "Superadmin Tools",
  console: "System Console",
  database: "Database",
  "test-users": "Test Users",
  manual: "System Manual",
  alerts: "Alerts",
  intelligence: "Intelligence",
  onboarding: "Onboarding",
  "taxi-associations": "Taxi Associations",
  transfers: "Driver Transfers",
  "document-pricing": "Document Pricing",
  "feature-flags": "Feature Flags",
  "api-keys": "API Keys",
  sessions: "Sessions",
  roles: "Roles",
  subscriptions: "Subscriptions",
  reports: "Reports",
  notices: "Notices",
  broadcast: "Broadcast",
};

function isUUID(s: string) {
  return /^[0-9a-f-]{32,36}$/i.test(s);
}

function Breadcrumbs({ title }: { title: string }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  // Build crumb list, skipping "admin" root prefix and dynamic ID segments
  type Crumb = { label: string; href: string };
  const crumbs: Crumb[] = [];
  let href = "";
  for (const seg of segments) {
    href += "/" + seg;
    if (seg === "admin") continue;
    const label = isUUID(seg) ? "Detail" : (SEG_LABELS[seg] ?? seg.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()));
    crumbs.push({ label, href });
  }

  if (crumbs.length <= 1) return null;

  return (
    <nav className="flex items-center gap-1 text-[10px] text-textDim mb-2 flex-wrap" aria-label="Breadcrumb">
      <Link href="/admin/dashboard" className="hover:text-cyan transition-colors flex items-center gap-0.5">
        <Home size={9} />
      </Link>
      {crumbs.map((crumb, i) => (
        <span key={crumb.href} className="flex items-center gap-1">
          <ChevronRight size={9} className="opacity-40" />
          {i === crumbs.length - 1
            ? <span className="text-textMuted font-semibold">{title}</span>
            : <Link href={crumb.href} className="hover:text-cyan transition-colors">{crumb.label}</Link>}
        </span>
      ))}
    </nav>
  );
}

// ── Live metrics command bar ───────────────────────────────────────────────────
type MetricsStrip = {
  pending_kyc: number;
  pending_withdrawals: number;
  flagged_accounts: number;
  active_incidents: number;
};

function CommandBar() {
  const [metrics, setMetrics] = useState<MetricsStrip | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      const r = await api.dashboard();
      const d = r.data;
      setMetrics({
        pending_kyc:         d.pending_kyc        ?? 0,
        pending_withdrawals: d.pending_withdrawals ?? 0,
        flagged_accounts:    d.flagged_accounts    ?? 0,
        active_incidents:    d.active_incidents    ?? 0,
      });
      setLastSync(new Date());
    } catch { /* silent — bar just doesn't render */ }
  }, []);

  useEffect(() => {
    fetchMetrics();
    // 60s matches the dashboard's own refresh — avoids double-hammering the API
    const t = setInterval(fetchMetrics, 60_000);
    return () => clearInterval(t);
  }, [fetchMetrics]);

  if (!metrics) return null;

  const allClear =
    metrics.pending_kyc === 0 &&
    metrics.pending_withdrawals === 0 &&
    metrics.flagged_accounts === 0 &&
    metrics.active_incidents === 0;

  const pills = [
    { count: metrics.pending_kyc,         label: "KYC",          href: "/admin/kyc",               icon: Fingerprint, cls: "bg-yellow/10 text-yellow border-yellow/20" },
    { count: metrics.pending_withdrawals,  label: "Withdrawals",  href: "/admin/withdrawals",        icon: Wallet,      cls: "bg-yellow/10 text-yellow border-yellow/20" },
    { count: metrics.flagged_accounts,     label: "Flagged",      href: "/admin/users?status=flagged", icon: AlertTriangle, cls: "bg-red/10 text-red border-red/20" },
    { count: metrics.active_incidents,     label: "Incidents",    href: "/admin/saferide",           icon: ShieldAlert, cls: "bg-red/10 text-red border-red/20" },
  ].filter(p => p.count > 0);

  return (
    <div className="flex items-center gap-2 py-2 px-3 rounded-xl border border-border bg-bg2 mb-3 flex-wrap">
      <Bell size={11} className="text-textDim flex-shrink-0" />

      {allClear ? (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green">
          <CheckCircle2 size={10} /> All clear
        </span>
      ) : (
        pills.map(p => (
          <Link key={p.label} href={p.href}>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full border cursor-pointer hover:opacity-80 transition-opacity ${p.cls}`}>
              <p.icon size={9} />
              {p.count} {p.label}
            </span>
          </Link>
        ))
      )}

      {lastSync && (
        <span className="text-textDim text-[9px] ml-auto">
          Synced {lastSync.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
        </span>
      )}
    </div>
  );
}

// ── AdminShell ─────────────────────────────────────────────────────────────────
export function AdminShell({
  title, subtitle, children,
}: {
  title: string; subtitle?: string; children: React.ReactNode;
}) {
  const router = useRouter();
  const [expiryWarning, setExpiryWarning] = useState<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) { router.push("/login"); return; }
    const check = () => {
      const ms = getTokenExpiryMs();
      if (ms !== null && ms < 30 * 60 * 1000) setExpiryWarning(Math.max(0, Math.floor(ms / 60000)));
      else setExpiryWarning(null);
    };
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, [router]);

  return (
    <div className="min-h-screen bg-bg flex">
      <Sidebar />
      <main className="flex-1 ml-[220px] p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">

          {/* Session expiry warning */}
          {expiryWarning !== null && (
            <div className="flex items-center gap-3 mb-4 px-4 py-3 rounded-xl bg-yellow/5 border border-yellow/20">
              <Clock size={14} className="text-yellow flex-shrink-0" />
              <p className="text-yellow text-xs font-semibold flex-1">
                {expiryWarning <= 0
                  ? "Your session has expired. Please log in again."
                  : `Your session expires in ${expiryWarning} minute${expiryWarning !== 1 ? "s" : ""}. Save your work.`}
              </p>
              <button
                onClick={() => router.push("/login")}
                className="text-xs font-bold text-yellow hover:text-yellow/80 underline">
                Re-login
              </button>
            </div>
          )}

          {/* Live metrics command bar */}
          <CommandBar />

          {/* Breadcrumbs */}
          <Breadcrumbs title={title} />

          <h1 className="text-text text-2xl font-extrabold tracking-tight mb-1">{title}</h1>
          {subtitle
            ? <p className="text-textMuted text-sm mb-6">{subtitle}</p>
            : <div className="mb-6" />}

          {children}
        </div>
      </main>
    </div>
  );
}
