"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Spinner } from "@/components/ui";
import { api, DashboardStats, getToken, getRole } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  AlertTriangle, Download, CheckCircle2, RefreshCw, TrendingUp, TrendingDown,
  ArrowRight, Copy, Clock, ShieldCheck, Zap, Users, Activity,
  BarChart3, Shield, Wallet, CreditCard, Car, FileCheck,
  RotateCcw, AlertOctagon, Building, Receipt, BookOpen,
  Wrench, Landmark, Scale, ChevronRight, Check, ArrowDownLeft,
} from "lucide-react";
import toast from "react-hot-toast";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";

// ── Helpers ────────────────────────────────────────────────────────────────
function getAdminName(): string {
  try {
    const t = getToken();
    if (!t) return "Admin";
    const p = JSON.parse(atob(t.split(".")[1]));
    return p.full_name || p.name || p.email?.split("@")[0] || "Admin";
  } catch { return "Admin"; }
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function trendPct(current: number, prev: number) {
  if (!prev || prev === 0) return null;
  return ((current - prev) / prev) * 100;
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="text-textDim hover:text-cyan transition-colors flex-shrink-0">
      {copied ? <Check size={11} className="text-green" /> : <Copy size={11} />}
    </button>
  );
}

const TT = {
  contentStyle: { background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 },
  labelStyle:   { color: "var(--text)", fontSize: 11 },
};

// ── Action queue tile ──────────────────────────────────────────────────────
function QueueTile({
  href, icon: Icon, label, count, color, bg, border, checkColor = "text-green",
}: {
  href: string; icon: any; label: string; count: number;
  color: string; bg: string; border: string; checkColor?: string;
}) {
  const hasItems = count > 0;
  return (
    <Link href={href}>
      <div className={`flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition-all hover:scale-[1.02] ${
        hasItems ? `${bg} ${border}` : "bg-bg2 border-border"
      }`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
          hasItems ? bg : "bg-bg3"
        }`}>
          <Icon size={18} className={hasItems ? color : "text-textDim"} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-2xl font-black leading-none tabular-nums ${hasItems ? color : "text-textMuted"}`}>
            {count}
          </p>
          <p className="text-[10px] text-textDim mt-0.5 font-semibold">{label}</p>
        </div>
        {hasItems
          ? <ChevronRight size={14} className={`${color} opacity-60 flex-shrink-0`} />
          : <ShieldCheck size={14} className="text-green flex-shrink-0 opacity-70" />}
      </div>
    </Link>
  );
}

// ── Stat card ──────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = "text-text", border = "border-border" }: {
  label: string; value: string | number; sub?: string; color?: string; border?: string;
}) {
  return (
    <div className={`bg-bg2 border ${border} rounded-xl p-4`}>
      <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-2xl font-black tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-textDim text-[10px] mt-1">{sub}</p>}
    </div>
  );
}

// ── Nav tile ───────────────────────────────────────────────────────────────
function NavTile({ href, icon: Icon, label, desc, color, badge }: {
  href: string; icon: any; label: string; desc: string; color: string; badge?: number;
}) {
  return (
    <Link href={href}>
      <div className="group flex items-center gap-3 p-3 bg-bg2 border border-border rounded-xl hover:border-cyan/30 hover:bg-bg3/50 transition-all cursor-pointer">
        <div className={`w-8 h-8 rounded-lg bg-current/10 flex items-center justify-center flex-shrink-0`}
          style={{ backgroundColor: "transparent" }}>
          <Icon size={15} className={color} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-text text-xs font-bold leading-tight truncate">{label}</p>
            {badge != null && badge > 0 && (
              <span className="flex-shrink-0 text-[9px] font-black px-1.5 py-0.5 bg-red/10 text-red border border-red/20 rounded-full leading-none">
                {badge}
              </span>
            )}
          </div>
          <p className="text-textDim text-[10px] leading-tight mt-0.5 truncate">{desc}</p>
        </div>
        <ArrowRight size={11} className="text-textDim group-hover:text-cyan flex-shrink-0 transition-colors" />
      </div>
    </Link>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function DashboardPage() {
  const [data,         setData]         = useState<DashboardStats | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [lastUpdated,  setLastUpdated]  = useState<Date | null>(null);
  const [countdown,    setCountdown]    = useState(60);
  const [verifyingId,  setVerifyingId]  = useState<string | null>(null);
  const [liveActivity, setLiveActivity] = useState<any[]>([]);
  const timerRef = useRef<any>(null);

  const adminName = getAdminName();
  const role      = getRole();

  const rel = (ts: string) => {
    const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  };

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const r = await api.dashboard();
      setData(r.data);
      setLastUpdated(new Date());
      setCountdown(60);
    } catch (e: any) {
      toast.error(`Failed to load dashboard: ${e.message}`);
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(() => {
      setCountdown(c => { if (c <= 1) { load(true); return 60; } return c - 1; });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const pollLive = async () => {
      try {
        const r = await api.transactions({});
        const txns = Array.isArray(r?.data) ? r.data : (Array.isArray(r) ? r : []);
        setLiveActivity(txns.slice(0, 15));
      } catch {}
    };
    pollLive();
    const id = setInterval(pollLive, 5000);
    return () => clearInterval(id);
  }, []);

  const verifyDriver = async (userId: string, name: string) => {
    setVerifyingId(userId);
    try {
      await api.verifyDriver(userId);
      toast.success(`${name} verified`);
      load(true);
    } catch (e: any) { toast.error(e.message); }
    finally { setVerifyingId(null); }
  };

  if (loading || !data) {
    return (
      <AdminShell title="Dashboard">
        <div className="space-y-5 animate-pulse">
          <div className="h-24 bg-bg2 rounded-2xl" />
          <div className="grid grid-cols-3 gap-4">
            {[1,2,3].map(i => <div key={i} className="h-20 bg-bg2 rounded-xl" />)}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1,2,3,4].map(i => <div key={i} className="h-24 bg-bg2 rounded-xl" />)}
          </div>
          <div className="h-64 bg-bg2 rounded-xl" />
        </div>
      </AdminShell>
    );
  }

  // ── Derived ────────────────────────────────────────────────────────────
  const totalPending = data.pending_withdrawals + data.pending_kyc + data.pending_drivers + data.flagged_accounts;
  const healthScore  = Math.max(0, 100 - totalPending * 5);
  const healthLabel  = healthScore === 100 ? "All systems operational" : healthScore > 80 ? "Minor items need attention" : "Action required";
  const healthColor  = healthScore === 100 ? "text-green" : healthScore > 80 ? "text-yellow" : "text-red";
  const healthBar    = healthScore === 100 ? "bg-green" : healthScore > 80 ? "bg-yellow" : "bg-red";

  const revTrend  = trendPct(data.today_revenue,      data.yesterday_revenue      ?? 0);
  const txnTrend  = trendPct(data.today_transactions,  data.yesterday_transactions ?? 0);
  const sigTrend  = trendPct(data.today_signups,       data.yesterday_signups      ?? 0);

  const chartData = [
    { label: "Yesterday", revenue: data.yesterday_revenue ?? 0, txns: data.yesterday_transactions ?? 0, signups: data.yesterday_signups ?? 0 },
    { label: "Today",     revenue: data.today_revenue,          txns: data.today_transactions,          signups: data.today_signups          },
  ];

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <AdminShell title="Dashboard">
      <div className="space-y-6">

        {/* ══════════════════════════════════════════════════════════════
            HERO — GREETING + HEALTH
        ══════════════════════════════════════════════════════════════ */}
        <div className="bg-bg2 border border-border rounded-2xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <p className="text-textMuted text-xs mb-1">{greeting()},</p>
              <h1 className="text-text text-2xl font-black leading-tight">{adminName}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                  role === "superadmin" ? "bg-red/10 border-red/20 text-red" :
                  role === "finance"    ? "bg-green/10 border-green/20 text-green" :
                  "bg-cyan/10 border-cyan/20 text-cyan"
                } uppercase tracking-widest`}>{role}</span>
                <span className="text-textDim text-[10px]">
                  {new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {lastUpdated && (
                <p className="text-textDim text-[10px]">
                  Updated {lastUpdated.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </p>
              )}
              <span className="text-[10px] text-textDim bg-bg border border-border px-2 py-1 rounded-lg">
                <Clock size={9} className="inline mr-1" />
                {countdown}s
              </span>
              <button onClick={() => load(true)} disabled={refreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-textMuted hover:text-cyan border border-border rounded-lg transition-all">
                <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} /> Refresh
              </button>
            </div>
          </div>

          {/* Platform health bar */}
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                {healthScore === 100
                  ? <ShieldCheck size={13} className="text-green" />
                  : <AlertTriangle size={13} className="text-yellow" />}
                <span className={`text-xs font-bold ${healthColor}`}>{healthLabel}</span>
              </div>
              <span className={`text-xs font-black ${healthColor}`}>{healthScore}%</span>
            </div>
            <div className="h-1.5 bg-bg3 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-1000 ${healthBar}`}
                style={{ width: `${healthScore}%` }} />
            </div>
            {totalPending > 0 && (
              <p className="text-textDim text-[10px] mt-1">
                {totalPending} item{totalPending !== 1 ? "s" : ""} pending across{" "}
                {[
                  data.pending_withdrawals > 0 && "withdrawals",
                  data.pending_kyc > 0 && "KYC",
                  data.pending_drivers > 0 && "driver verification",
                  data.flagged_accounts > 0 && "flagged accounts",
                ].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            TODAY'S PULSE — 3 metrics + mini bar chart
        ══════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 3 today metrics */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest">Today's Pulse</p>
            {[
              { label: "Revenue",         value: formatZAR(data.today_revenue),              trend: revTrend, color: "text-green",  prev: formatZAR(data.yesterday_revenue ?? 0),    sub: "vs yesterday" },
              { label: "Transactions",    value: String(data.today_transactions),             trend: txnTrend, color: "text-cyan",   prev: String(data.yesterday_transactions ?? 0),  sub: "vs yesterday" },
              { label: "New Signups",     value: String(data.today_signups),                  trend: sigTrend, color: "text-purple", prev: String(data.yesterday_signups ?? 0),       sub: "vs yesterday" },
              { label: "Weekly Revenue",  value: (data as any).week_revenue != null ? formatZAR((data as any).week_revenue) : "—", trend: null, color: "text-yellow", prev: "", sub: "7-day rolling" },
            ].map(m => (
              <div key={m.label} className="flex items-center justify-between p-4 bg-bg2 border border-border rounded-xl">
                <div>
                  <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest">{m.label}</p>
                  <p className={`text-2xl font-black tabular-nums ${m.color}`}>{m.value}</p>
                </div>
                <div className="text-right">
                  {m.trend !== null ? (
                    <div className={`flex items-center gap-1 justify-end text-xs font-bold ${m.trend >= 0 ? "text-green" : "text-red"}`}>
                      {m.trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {Math.abs(m.trend).toFixed(1)}%
                    </div>
                  ) : null}
                  <p className="text-textDim text-[10px] mt-0.5">
                    {m.prev ? `Yesterday: ${m.prev}` : m.sub}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Bar chart: today vs yesterday */}
          <div className="bg-bg2 border border-border rounded-xl p-4">
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-4">Yesterday vs Today</p>
            <ResponsiveContainer width="100%" height={80}>
              <BarChart data={chartData} barCategoryGap="30%" barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "var(--textMuted)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip {...TT} formatter={(v: number) => [`R${v.toFixed(0)}`, "Revenue"]} />
                <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                  <Cell fill="#00E676" opacity={0.5} />
                  <Cell fill="#00E676" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3 space-y-2">
              {[
                { label: "Transactions", today: data.today_transactions, yesterday: data.yesterday_transactions ?? 0, color: "bg-cyan" },
                { label: "Signups",      today: data.today_signups,      yesterday: data.yesterday_signups      ?? 0, color: "bg-purple" },
              ].map(m => {
                const max = Math.max(m.today, m.yesterday, 1);
                return (
                  <div key={m.label}>
                    <div className="flex justify-between mb-0.5">
                      <span className="text-textDim text-[10px]">{m.label}</span>
                      <span className="text-textMuted text-[10px] font-bold">{m.today} <span className="font-normal opacity-50">/ {m.yesterday}</span></span>
                    </div>
                    <div className="flex gap-1 h-1.5">
                      <div className={`rounded-full opacity-40 ${m.color}`} style={{ width: `${(m.yesterday / max) * 100}%` }} />
                      <div className={`rounded-full ${m.color}`} style={{ width: `${(m.today / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            ACTION QUEUE
        ══════════════════════════════════════════════════════════════ */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest flex items-center gap-1.5">
              <Activity size={11} /> Action Queue
            </p>
            {totalPending === 0 && (
              <div className="flex items-center gap-1.5">
                <ShieldCheck size={12} className="text-green" />
                <span className="text-green text-[10px] font-bold">All clear</span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <QueueTile href="/admin/withdrawals"  icon={Wallet}        label="Withdrawals"      count={data.pending_withdrawals} color="text-yellow" bg="bg-yellow/10" border="border-yellow/20" />
            <QueueTile href="/admin/kyc"          icon={FileCheck}     label="KYC Reviews"      count={data.pending_kyc}         color="text-cyan"   bg="bg-cyan/10"   border="border-cyan/20"   />
            <QueueTile href="/admin/drivers"      icon={Car}           label="Driver Verif."    count={data.pending_drivers}     color="text-purple" bg="bg-purple/10" border="border-purple/20" />
            <QueueTile href="/admin/users"        icon={AlertTriangle} label="Flagged Accts"    count={data.flagged_accounts}    color="text-red"    bg="bg-red/10"    border="border-red/20"    />
            <QueueTile href="/admin/refunds"      icon={RotateCcw}     label="Refunds"          count={0}                        color="text-pink-400" bg="bg-pink-400/10" border="border-pink-400/20" />
            <QueueTile href="/admin/chargebacks"  icon={AlertOctagon}  label="Chargebacks"      count={0}                        color="text-orange-400" bg="bg-orange-400/10" border="border-orange-400/20" />
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            PLATFORM TOTALS
        ══════════════════════════════════════════════════════════════ */}
        <div>
          <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-3">Platform Totals</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <StatCard label="Total Users"    value={data.total_users.toLocaleString()}       sub="All registered accounts"    color="text-text" />
            <StatCard label="Drivers"        value={data.total_drivers.toLocaleString()}     sub={`${data.verified_drivers ?? 0} verified`} color="text-cyan" border="border-cyan/10" />
            <StatCard label="Passengers"     value={data.total_passengers.toLocaleString()}  sub="Active passenger accounts"  color="text-purple" border="border-purple/10" />
            <StatCard label="Fleet Owners"   value={(data.total_owners ?? 0).toLocaleString()} sub="Registered fleet operators" color="text-yellow" border="border-yellow/10" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total Revenue"      value={formatZAR(data.total_revenue)}          sub="All-time platform commissions" color="text-green"  border="border-green/10" />
            <StatCard label="In Wallets"         value={formatZAR(data.total_wallet_balance)}   sub="User-held wallet balances"     color="text-cyan"   border="border-cyan/10" />
            <StatCard label="Total Withdrawn"    value={formatZAR(data.total_withdrawn)}        sub="Approved payouts to date"      color="text-orange-400" border="border-orange-400/10" />
            <StatCard label="All Transactions"   value={data.total_transactions.toLocaleString()} sub="Lifetime transaction count"  color="text-text" />
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            QUICK NAVIGATION
        ══════════════════════════════════════════════════════════════ */}
        <div>
          <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-3">Quick Navigation</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

            {/* Operations */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-cyan uppercase tracking-widest flex items-center gap-1.5 px-1">
                <Activity size={10} /> Operations
              </p>
              <NavTile href="/admin/support"      icon={Users}       label="Support Lookup"    desc="Search any user"          color="text-cyan"   />
              <NavTile href="/admin/drivers"      icon={Car}         label="Drivers"           desc="Verify & manage drivers"  color="text-purple" badge={data.pending_drivers} />
              <NavTile href="/admin/kyc"          icon={FileCheck}   label="KYC Review"        desc="Identity verification"    color="text-cyan"   badge={data.pending_kyc} />
              <NavTile href="/admin/daily-ops"    icon={BarChart3}   label="Daily Ops"         desc="Operational overview"     color="text-green"  />
              <NavTile href="/admin/saferide"     icon={Shield}      label="SafeRide"          desc="Safety incidents"         color="text-red"    badge={data.active_incidents} />
            </div>

            {/* Finance */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-green uppercase tracking-widest flex items-center gap-1.5 px-1">
                <CreditCard size={10} /> Finance
              </p>
              <NavTile href="/admin/withdrawals"  icon={Wallet}      label="Withdrawals"       desc="Approve pending payouts"  color="text-yellow" badge={data.pending_withdrawals} />
              <NavTile href="/admin/refunds"      icon={RotateCcw}   label="Refunds"           desc="Process & track refunds"  color="text-pink-400" />
              <NavTile href="/admin/chargebacks"  icon={AlertOctagon} label="Chargebacks"      desc="Bank dispute management"  color="text-orange-400" />
              <NavTile href="/admin/ledger"       icon={BookOpen}    label="Ledger"            desc="Double-entry accounts"    color="text-green"  />
              <NavTile href="/admin/revenue"      icon={TrendingUp}  label="Revenue & Fees"    desc="Income analytics"         color="text-green"  />
            </div>

            {/* Compliance & Risk */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-red uppercase tracking-widest flex items-center gap-1.5 px-1">
                <Shield size={10} /> Compliance
              </p>
              <NavTile href="/admin/compliance"   icon={Shield}      label="Compliance"        desc="AML / FICA checks"        color="text-red"    />
              <NavTile href="/admin/velocity"     icon={Zap}         label="Velocity"          desc="Fraud velocity rules"     color="text-red"    />
              <NavTile href="/admin/risk"         icon={AlertTriangle} label="Risk"            desc="Risk flags & scores"      color="text-yellow" badge={data.flagged_accounts} />
              <NavTile href="/admin/audit"        icon={Activity}    label="Audit Log"         desc="All admin actions"        color="text-purple" />
              <NavTile href="/admin/subscriptions" icon={Building}   label="Subscriptions"     desc="Fleet billing & plans"    color="text-cyan"   />
            </div>

            {/* Tools & Config */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-yellow uppercase tracking-widest flex items-center gap-1.5 px-1">
                <Wrench size={10} /> Tools
              </p>
              <NavTile href="/admin/fee-simulator" icon={BarChart3}  label="Fee Simulator"     desc="Calculate fees live"      color="text-cyan"   />
              <NavTile href="/admin/transactions"  icon={Receipt}    label="Transactions"      desc="Full transaction feed"    color="text-text"   />
              <NavTile href="/admin/payroll"       icon={Landmark}   label="Payroll"           desc="Driver payroll runs"      color="text-green"  />
              <NavTile href="/admin/analytics"     icon={BarChart3}  label="Analytics"         desc="Platform metrics"         color="text-purple" />
              <NavTile href="/admin/export-center" icon={Download}   label="Export Center"     desc="Download platform data"   color="text-textMuted" />
            </div>

          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            PENDING DRIVER VERIFICATION
        ══════════════════════════════════════════════════════════════ */}
        {data.pending_driver_list?.length > 0 && (
          <div className="bg-bg2 border border-purple/20 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Car size={15} className="text-purple" />
                <h2 className="text-sm font-bold text-text">Pending Driver Verification</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-purple/10 text-purple border border-purple/20 rounded-full">
                  {data.pending_driver_list.length}
                </span>
              </div>
              <Link href="/admin/drivers" className="flex items-center gap-1 text-xs text-textMuted hover:text-cyan transition-colors font-bold">
                View All <ArrowRight size={11} />
              </Link>
            </div>
            <div className="space-y-2">
              {data.pending_driver_list.slice(0, 5).map(d => {
                const waitDays = Math.floor((Date.now() - new Date(d.created_at).getTime()) / 86400000);
                return (
                  <div key={d.user_id} className="flex items-center gap-3 p-3 bg-bg border border-border rounded-xl">
                    <div className="w-8 h-8 rounded-full bg-purple/10 border border-purple/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-purple text-[10px] font-black">
                        {d.full_name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-text text-xs font-semibold truncate">{d.full_name}</p>
                      <p className="text-textMuted text-[10px] font-mono">{d.phone_number}</p>
                    </div>
                    {d.vehicle_plate && (
                      <span className="text-[10px] font-mono font-bold px-2 py-1 bg-yellow/10 text-yellow border border-yellow/20 rounded">
                        {d.vehicle_plate}
                      </span>
                    )}
                    <span className={`text-[10px] font-bold ${
                      waitDays > 3 ? "text-red" : waitDays > 1 ? "text-yellow" : "text-textMuted"
                    }`}>
                      {waitDays}d
                    </span>
                    <button
                      onClick={() => verifyDriver(d.user_id, d.full_name)}
                      disabled={!!verifyingId}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green/10 border border-green/20 text-green text-[10px] font-bold rounded-lg hover:bg-green/20 transition-all disabled:opacity-50 whitespace-nowrap">
                      {verifyingId === d.user_id ? <Spinner /> : <CheckCircle2 size={11} />} Verify
                    </button>
                  </div>
                );
              })}
              {data.pending_driver_list.length > 5 && (
                <Link href="/admin/drivers">
                  <div className="text-center py-2 text-xs text-cyan hover:underline font-bold">
                    +{data.pending_driver_list.length - 5} more → view all
                  </div>
                </Link>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            HIGH-VALUE TRANSACTIONS
        ══════════════════════════════════════════════════════════════ */}
        {data.suspicious_transactions?.length > 0 && (
          <div className="bg-bg2 border border-red/10 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle size={15} className="text-red" />
                <h2 className="text-sm font-bold text-text">High-Value Transactions (7 days)</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-red/10 text-red border border-red/20 rounded-full">
                  {data.suspicious_transactions.length}
                </span>
              </div>
              <Link href="/admin/compliance" className="flex items-center gap-1 text-xs text-textMuted hover:text-cyan transition-colors font-bold">
                Compliance <ArrowRight size={11} />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    {["Reference", "Amount", "Sender", "Receiver", "Status", "Date"].map((h, i) => (
                      <th key={i} className="text-left py-2 px-3 text-textDim font-bold uppercase tracking-wider text-[10px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.suspicious_transactions.map(t => (
                    <tr key={t.id} className="border-b border-border/40 hover:bg-bg3/30">
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-textMuted text-[10px]">{t.reference}</span>
                          <CopyBtn text={t.reference} />
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-black text-red">{formatZAR(t.amount)}</td>
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

        {/* ══════════════════════════════════════════════════════════════
            RECENT TRANSACTIONS
        ══════════════════════════════════════════════════════════════ */}
        <div className="bg-bg2 border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Receipt size={15} className="text-cyan" />
              <h2 className="text-sm font-bold text-text">Recent Transactions</h2>
            </div>
            <Link href="/admin/transactions" className="flex items-center gap-1 text-xs text-textMuted hover:text-cyan transition-colors font-bold">
              View All <ArrowRight size={11} />
            </Link>
          </div>

          {!data.recent_transactions?.length ? (
            <p className="text-textMuted text-sm text-center py-6">No transactions yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    {["Reference", "Type", "Amount", "Fee", "Sender → Receiver", "Status", "Date"].map((h, i) => (
                      <th key={i} className="text-left py-2 px-3 text-textDim font-bold uppercase tracking-wider text-[10px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.recent_transactions.map(t => (
                    <tr key={t.id} className="border-b border-border/40 hover:bg-bg3/30 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] text-textMuted">{t.reference}</span>
                          <CopyBtn text={t.reference} />
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          t.type === "topup"   ? "bg-cyan/10 border-cyan/20 text-cyan" :
                          t.type === "payment" ? "bg-green/10 border-green/20 text-green" :
                          "bg-purple/10 border-purple/20 text-purple"
                        }`}>{t.type}</span>
                      </td>
                      <td className="py-2.5 px-3 font-bold text-text">{formatZAR(t.amount)}</td>
                      <td className="py-2.5 px-3 text-textMuted">{t.platform_fee ? formatZAR(t.platform_fee) : "—"}</td>
                      <td className="py-2.5 px-3">
                        <span className="text-textMuted">{t.sender_name || "—"}</span>
                        <span className="text-textDim mx-1">→</span>
                        <span className="text-textMuted">{t.receiver_name || "—"}</span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          t.status === "completed" ? "bg-green/10 border-green/20 text-green" :
                          t.status === "pending"   ? "bg-yellow/10 border-yellow/20 text-yellow" :
                          "bg-red/10 border-red/20 text-red"
                        }`}>{t.status}</span>
                      </td>
                      <td className="py-2.5 px-3 text-textDim text-[10px] whitespace-nowrap">{formatDate(t.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════
            LIVE ACTIVITY FEED — 5s polling
        ══════════════════════════════════════════════════════════════ */}
        <div className="bg-bg2 border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan"></span>
              </span>
              <h2 className="text-sm font-bold text-text">Live Activity Feed</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-cyan/10 text-cyan border border-cyan/20 rounded-full">
                5s refresh
              </span>
            </div>
            <Link href="/admin/transactions" className="flex items-center gap-1 text-xs text-textMuted hover:text-cyan transition-colors font-bold">
              Full Feed <ArrowRight size={11} />
            </Link>
          </div>

          {liveActivity.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-textDim text-xs gap-2">
              <Spinner /> Waiting for activity…
            </div>
          ) : (
            <div className="space-y-1.5">
              {liveActivity.map((t, i) => (
                <div key={t.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  i === 0 ? "bg-cyan/5 border border-cyan/10" : "hover:bg-bg3/40"
                }`}>
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    t.type === "topup"    ? "bg-cyan/10"   :
                    t.type === "payment"  ? "bg-green/10"  :
                    "bg-purple/10"
                  }`}>
                    {t.type === "topup"   ? <ArrowDownLeft size={12} className="text-cyan" />   :
                     t.type === "payment" ? <CreditCard    size={12} className="text-green" />  :
                                           <Wallet        size={12} className="text-purple" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-text font-semibold truncate">
                      {t.sender_name || "—"} → {t.receiver_name || "—"}
                    </p>
                    <p className="text-[10px] text-textDim font-mono truncate">{t.reference}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-xs font-black tabular-nums ${
                      t.type === "topup" ? "text-cyan" : t.type === "payment" ? "text-green" : "text-purple"
                    }`}>{formatZAR(t.amount)}</p>
                    <p className="text-[10px] text-textDim">{rel(t.created_at)}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border flex-shrink-0 ${
                    t.status === "completed" ? "bg-green/10 border-green/20 text-green" :
                    t.status === "pending"   ? "bg-yellow/10 border-yellow/20 text-yellow" :
                    "bg-red/10 border-red/20 text-red"
                  }`}>{t.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </AdminShell>
  );
}
