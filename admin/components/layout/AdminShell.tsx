"use client";
import { Sidebar } from "./Sidebar";
import { useEffect, useState, useCallback } from "react";
import { isAuthenticated } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { AlertTriangle, Clock, CheckCircle2, Fingerprint, Wallet, ShieldAlert, Bell } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";

function getTokenExpiryMs(): number | null {
  try {
    const token = typeof window !== "undefined" ? localStorage.getItem("tnr_admin_token") : null;
    if (!token) return null;
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 - Date.now();
  } catch { return null; }
}

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
    const t = setInterval(fetchMetrics, 30_000);
    return () => clearInterval(t);
  }, [fetchMetrics]);

  if (!metrics) return null;

  const allClear =
    metrics.pending_kyc === 0 &&
    metrics.pending_withdrawals === 0 &&
    metrics.flagged_accounts === 0 &&
    metrics.active_incidents === 0;

  const pills = [
    {
      count: metrics.pending_kyc,
      label: "KYC",
      href: "/admin/kyc",
      icon: Fingerprint,
      cls: "bg-yellow/10 text-yellow border-yellow/20",
    },
    {
      count: metrics.pending_withdrawals,
      label: "Withdrawals",
      href: "/admin/withdrawals",
      icon: Wallet,
      cls: "bg-yellow/10 text-yellow border-yellow/20",
    },
    {
      count: metrics.flagged_accounts,
      label: "Flagged",
      href: "/admin/users?status=flagged",
      icon: AlertTriangle,
      cls: "bg-red/10 text-red border-red/20",
    },
    {
      count: metrics.active_incidents,
      label: "Incidents",
      href: "/admin/saferide",
      icon: ShieldAlert,
      cls: "bg-red/10 text-red border-red/20",
    },
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
        <>
          <span className="text-textDim text-[9px] ml-auto">
            Last sync: {lastSync.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
        </>
      )}
    </div>
  );
}

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

          <h1 className="text-text text-2xl font-extrabold tracking-tight mb-1">
            {title}
          </h1>
          {subtitle && (
            <p className="text-textMuted text-sm mb-6">{subtitle}</p>
          )}
          {!subtitle && <div className="mb-6" />}
          {children}
        </div>
      </main>
    </div>
  );
}
