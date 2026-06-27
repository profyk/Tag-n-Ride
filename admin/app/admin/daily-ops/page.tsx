"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Button, Spinner, Badge } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  Activity, RefreshCw, CheckCircle, AlertTriangle, Zap, Users, Car,
  Fingerprint, DollarSign, TrendingUp, TrendingDown, Clock,
  ShieldCheck, Play, ArrowRight, Wallet,
} from "lucide-react";
import toast from "react-hot-toast";
import { api, DashboardStats } from "@/lib/api";
import Link from "next/link";

const REFRESH_INTERVAL = 30;

function Metric({ label, value, sub, tone = "default", icon: Icon }: {
  label: string; value: string; sub?: string; tone?: "green" | "red" | "yellow" | "cyan" | "purple" | "default"; icon?: any;
}) {
  const colors: Record<string, string> = {
    green: "text-green", red: "text-red", yellow: "text-yellow",
    cyan: "text-cyan", purple: "text-purple", default: "text-text",
  };
  return (
    <div className="bg-bg3 rounded-xl p-4 flex items-start gap-3">
      {Icon && (
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
          tone === "green" ? "bg-green/10" : tone === "red" ? "bg-red/10" :
          tone === "yellow" ? "bg-yellow/10" : tone === "cyan" ? "bg-cyan/10" :
          tone === "purple" ? "bg-purple/10" : "bg-bg2"
        }`}>
          <Icon size={14} className={colors[tone]} />
        </div>
      )}
      <div>
        <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest">{label}</p>
        <p className={`text-xl font-extrabold ${colors[tone]}`}>{value}</p>
        {sub && <p className="text-[10px] text-textDim mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function QueueItem({ href, label, count, tone, icon: Icon }: {
  href: string; label: string; count: number; tone: "red" | "yellow" | "cyan" | "purple"; icon: any;
}) {
  const colors = {
    red: { bg: "bg-red/5 border-red/20 hover:bg-red/10", text: "text-red", icon: "text-red" },
    yellow: { bg: "bg-yellow/5 border-yellow/20 hover:bg-yellow/10", text: "text-yellow", icon: "text-yellow" },
    cyan: { bg: "bg-cyan/5 border-cyan/20 hover:bg-cyan/10", text: "text-cyan", icon: "text-cyan" },
    purple: { bg: "bg-purple/5 border-purple/20 hover:bg-purple/10", text: "text-purple", icon: "text-purple" },
  };
  const c = colors[tone];
  if (count === 0) return null;
  return (
    <Link href={href}>
      <div className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition-all ${c.bg}`}>
        <Icon size={18} className={c.icon} />
        <div className="flex-1">
          <p className={`text-base font-black leading-none ${c.text}`}>{count}</p>
          <p className="text-[10px] text-textDim mt-0.5">{label}</p>
        </div>
        <ArrowRight size={13} className={`${c.icon} opacity-60`} />
      </div>
    </Link>
  );
}

export default function DailyOpsPage() {
  const [data, setData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  const [refreshing, setRefreshing] = useState(false);
  const [cashingUp, setCashingUp] = useState(false);
  const [reconRunning, setReconRunning] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const r = await api.dashboard();
      setData(r.data);
      setLastUpdated(new Date());
      setCountdown(REFRESH_INTERVAL);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(() => {
      setCountdown((c) => { if (c <= 1) { load(true); return REFRESH_INTERVAL; } return c - 1; });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const triggerCashup = async () => {
    setCashingUp(true);
    try {
      const res = await api.triggerCommissionCashup();
      toast.success(res.data.message || "Commission cash-up triggered");
    } catch (e: any) { toast.error(e.message); }
    finally { setCashingUp(false); }
  };

  const runRecon = async () => {
    setReconRunning(true);
    try {
      const res = await api.runReconciliation();
      const r = res.data;
      toast.success(
        r.status === "balanced"
          ? "Reconciliation balanced — no discrepancies"
          : `Reconciliation found ${r.discrepancy_count} discrepancy(s), variance ${formatZAR(r.variance)}`
      );
    } catch (e: any) { toast.error(e.message); }
    finally { setReconRunning(false); }
  };

  if (loading || !data) return <AdminShell title="Daily Operations"><Spinner /></AdminShell>;

  const revVsYesterday = data.yesterday_revenue > 0
    ? ((data.today_revenue - data.yesterday_revenue) / data.yesterday_revenue) * 100
    : 0;
  const txVsYesterday = data.yesterday_transactions > 0
    ? ((data.today_transactions - data.yesterday_transactions) / data.yesterday_transactions) * 100
    : 0;

  const allClear = data.pending_withdrawals === 0 && data.pending_kyc === 0 &&
    data.pending_drivers === 0 && data.flagged_accounts === 0;

  return (
    <AdminShell title="Daily Operations">
      <div className="space-y-6">

        {/* Header bar */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-text font-bold">
              {new Date().toLocaleDateString("en-ZA", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </p>
            <div className="flex items-center gap-2 text-xs text-textMuted mt-1">
              <Clock size={11} />
              <span>Auto-refresh in <span className="text-cyan font-bold">{countdown}s</span></span>
              {lastUpdated && (
                <span className="text-textDim">· Updated {lastUpdated.toLocaleTimeString("en-ZA")}</span>
              )}
            </div>
          </div>
          <Button variant="secondary" onClick={() => load(true)} disabled={refreshing}>
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>

        {/* Today's performance */}
        <div>
          <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-3">Today's Performance</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Metric
              label="Revenue Today"
              value={formatZAR(data.today_revenue)}
              sub={`${revVsYesterday >= 0 ? "+" : ""}${revVsYesterday.toFixed(1)}% vs yesterday (${formatZAR(data.yesterday_revenue)})`}
              tone={revVsYesterday >= 0 ? "green" : "red"}
              icon={revVsYesterday >= 0 ? TrendingUp : TrendingDown}
            />
            <Metric
              label="Transactions"
              value={String(data.today_transactions)}
              sub={`${txVsYesterday >= 0 ? "+" : ""}${txVsYesterday.toFixed(1)}% vs yesterday (${data.yesterday_transactions})`}
              tone={txVsYesterday >= 0 ? "cyan" : "red"}
              icon={Activity}
            />
            <Metric
              label="New Signups"
              value={String(data.today_signups)}
              sub={`vs yesterday: ${data.yesterday_signups}`}
              tone="purple"
              icon={Users}
            />
          </div>
        </div>

        {/* Platform snapshot */}
        <div>
          <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-3">Platform Snapshot</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Total Wallets" value={formatZAR(data.total_wallet_balance)} tone="yellow" icon={Wallet} />
            <Metric label="Active Drivers" value={data.active_drivers != null ? String(data.active_drivers) : "—"} tone="green" icon={Car} />
            <Metric label="Flagged Accounts" value={String(data.flagged_accounts)} tone={data.flagged_accounts > 0 ? "red" : "green"} icon={AlertTriangle} />
            <Metric label="Active Incidents" value={data.active_incidents != null ? String(data.active_incidents) : "—"} tone={data.active_incidents ? "red" : "green"} icon={AlertTriangle} />
          </div>
        </div>

        {/* Action queue */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-cyan" />
              <h2 className="text-text font-bold">Pending Action Queue</h2>
            </div>
            {allClear && (
              <div className="flex items-center gap-1.5 text-green text-xs font-semibold">
                <ShieldCheck size={13} /> All clear
              </div>
            )}
          </div>

          {allClear ? (
            <div className="text-center py-6">
              <ShieldCheck size={32} className="text-green mx-auto mb-2" />
              <p className="text-green font-bold">No pending actions</p>
              <p className="text-textMuted text-xs mt-1">Everything is up to date</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <QueueItem href="/admin/withdrawals" label="Pending Withdrawals" count={data.pending_withdrawals} tone="yellow" icon={DollarSign} />
              <QueueItem href="/admin/kyc" label="KYC Reviews" count={data.pending_kyc} tone="cyan" icon={Fingerprint} />
              <QueueItem href="/admin/drivers" label="Driver Verifications" count={data.pending_drivers} tone="purple" icon={Car} />
              <QueueItem href="/admin/users" label="Flagged Accounts" count={data.flagged_accounts} tone="red" icon={AlertTriangle} />
            </div>
          )}
        </Card>

        {/* Quick actions */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Zap size={16} className="text-yellow" />
            <h2 className="text-text font-bold">Quick Operations</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button
              onClick={triggerCashup}
              disabled={cashingUp}
              className="flex flex-col items-start gap-2 p-4 rounded-xl bg-bg3 border border-border hover:border-cyan/30 hover:bg-cyan/5 transition-all disabled:opacity-50 text-left"
            >
              <div className="w-8 h-8 rounded-lg bg-green/10 flex items-center justify-center">
                <DollarSign size={14} className="text-green" />
              </div>
              <div>
                <p className="text-text text-xs font-bold">Commission Cash-up</p>
                <p className="text-textDim text-[10px] mt-0.5">Run manual commission settlement</p>
              </div>
              {cashingUp && <p className="text-[10px] text-cyan">Running...</p>}
            </button>

            <button
              onClick={runRecon}
              disabled={reconRunning}
              className="flex flex-col items-start gap-2 p-4 rounded-xl bg-bg3 border border-border hover:border-cyan/30 hover:bg-cyan/5 transition-all disabled:opacity-50 text-left"
            >
              <div className="w-8 h-8 rounded-lg bg-cyan/10 flex items-center justify-center">
                <RefreshCw size={14} className={`text-cyan ${reconRunning ? "animate-spin" : ""}`} />
              </div>
              <div>
                <p className="text-text text-xs font-bold">Run Reconciliation</p>
                <p className="text-textDim text-[10px] mt-0.5">Check wallet vs transaction balance</p>
              </div>
            </button>

            <Link href="/admin/withdrawals">
              <div className="flex flex-col items-start gap-2 p-4 rounded-xl bg-bg3 border border-border hover:border-yellow/30 hover:bg-yellow/5 transition-all cursor-pointer h-full">
                <div className="w-8 h-8 rounded-lg bg-yellow/10 flex items-center justify-center">
                  <Wallet size={14} className="text-yellow" />
                </div>
                <div>
                  <p className="text-text text-xs font-bold">Process Withdrawals</p>
                  <p className="text-textDim text-[10px] mt-0.5">
                    {data.pending_withdrawals > 0 ? `${data.pending_withdrawals} waiting approval` : "No pending withdrawals"}
                  </p>
                </div>
              </div>
            </Link>

            <Link href="/admin/kyc">
              <div className="flex flex-col items-start gap-2 p-4 rounded-xl bg-bg3 border border-border hover:border-purple/30 hover:bg-purple/5 transition-all cursor-pointer h-full">
                <div className="w-8 h-8 rounded-lg bg-purple/10 flex items-center justify-center">
                  <Fingerprint size={14} className="text-purple" />
                </div>
                <div>
                  <p className="text-text text-xs font-bold">Review KYC</p>
                  <p className="text-textDim text-[10px] mt-0.5">
                    {data.pending_kyc > 0 ? `${data.pending_kyc} documents pending` : "All reviewed"}
                  </p>
                </div>
              </div>
            </Link>
          </div>
        </Card>

        {/* Pending drivers */}
        {data.pending_driver_list?.length > 0 && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Car size={16} className="text-purple" />
                <h2 className="text-text font-bold">Drivers Awaiting Verification</h2>
              </div>
              <Link href="/admin/drivers">
                <Button variant="ghost"><ArrowRight size={13} /> View All</Button>
              </Link>
            </div>
            <div className="space-y-2">
              {data.pending_driver_list.slice(0, 5).map((d) => {
                const days = Math.floor((Date.now() - new Date(d.created_at).getTime()) / 86400000);
                return (
                  <div key={d.user_id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-bg3">
                    <div>
                      <p className="text-text text-sm font-semibold">{d.full_name}</p>
                      <p className="text-textMuted text-[10px] font-mono">{d.phone_number}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {d.vehicle_plate && (
                        <span className="font-mono text-xs bg-yellow/10 text-yellow px-2 py-0.5 rounded border border-yellow/20">
                          {d.vehicle_plate}
                        </span>
                      )}
                      <span className={`text-xs font-bold ${days > 3 ? "text-red" : days > 1 ? "text-yellow" : "text-textMuted"}`}>
                        {days}d waiting
                      </span>
                    </div>
                  </div>
                );
              })}
              {data.pending_driver_list.length > 5 && (
                <p className="text-xs text-textMuted text-center pt-1">
                  +{data.pending_driver_list.length - 5} more · <Link href="/admin/drivers" className="text-cyan underline">View all</Link>
                </p>
              )}
            </div>
          </Card>
        )}

        {/* Navigation shortcuts */}
        <Card>
          <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-3">Jump To</p>
          <div className="flex flex-wrap gap-2">
            {[
              { href: "/admin/transactions", label: "Transactions" },
              { href: "/admin/settlement", label: "Settlement" },
              { href: "/admin/treasury", label: "Treasury" },
              { href: "/admin/reconciliation", label: "Reconciliation" },
              { href: "/admin/saferide", label: "SafeRide" },
              { href: "/admin/monitoring", label: "Monitoring" },
              { href: "/admin/support", label: "Support" },
              { href: "/admin/audit", label: "Audit Log" },
              { href: "/admin/fee-config", label: "Fee Config" },
              { href: "/admin/pricing", label: "Pricing Rules" },
            ].map((l) => (
              <Link key={l.href} href={l.href}>
                <span className="inline-flex items-center px-3 py-1.5 rounded-full border border-border bg-bg3 text-xs font-semibold text-textMuted hover:text-text hover:border-cyan/20 transition-all">
                  {l.label}
                </span>
              </Link>
            ))}
          </div>
        </Card>

      </div>
    </AdminShell>
  );
}
