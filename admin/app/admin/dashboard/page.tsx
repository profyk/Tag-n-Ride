"use client";
import { useEffect, useState, useRef } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { StatCard, Table, Tr, Td, Badge, Spinner, Card, Button } from "@/components/ui";
import { api, DashboardStats } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  AlertTriangle, Download, CheckCircle, RefreshCw, TrendingUp, TrendingDown,
  ArrowRight, Copy, Clock, ShieldCheck, Zap, Users, Activity,
  Calculator, BarChart3, Brain, Shield, Wallet, CreditCard,
} from "lucide-react";
import toast from "react-hot-toast";
import Link from "next/link";

const REFRESH_INTERVAL = 60;

function TrendBadge({ value, prev }: { value: number; prev?: number }) {
  if (!prev || prev === 0) return null;
  const pct = ((value - prev) / prev) * 100;
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${up ? "text-green" : "text-red"}`}>
      {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function AlertBanner({ href, tone, count, label, sub }: {
  href: string; tone: string; count: number; label: string; sub: string;
}) {
  const colors: Record<string, string> = {
    yellow: "bg-yellow/10 border-yellow/20 text-yellow",
    cyan: "bg-cyan/10 border-cyan/20 text-cyan",
    purple: "bg-purple/10 border-purple/20 text-purple",
    red: "bg-red/10 border-red/20 text-red",
  };
  return (
    <Link href={href}>
      <div className={`flex items-center justify-between gap-3 p-4 border rounded-xl cursor-pointer hover:opacity-80 transition-all ${colors[tone]}`}>
        <div className="flex items-center gap-3">
          <AlertTriangle size={18} className="flex-shrink-0" />
          <div>
            <p className="font-bold text-sm">{count} {label}</p>
            <p className="text-xs opacity-70">{sub}</p>
          </div>
        </div>
        <ArrowRight size={14} className="opacity-60 flex-shrink-0" />
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const r = await api.dashboard();
      setData(r.data);
      setLastRefreshed(new Date());
      setCountdown(REFRESH_INTERVAL);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { load(true); return REFRESH_INTERVAL; }
        return c - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const copyRef = (ref: string) => { navigator.clipboard.writeText(ref); toast.success("Copied"); };

  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  if (loading || !data) return <AdminShell title="Dashboard"><Spinner /></AdminShell>;

  const hasAlerts = data.pending_withdrawals > 0 || data.pending_drivers > 0 || data.pending_kyc > 0 || data.flagged_accounts > 0;

  return (
    <AdminShell title="Dashboard">
      <div className="space-y-6">

        {/* Header actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-textMuted">
            <div className="flex items-center gap-1.5">
              <Clock size={12} />
              <span>Refresh in <span className="text-cyan font-bold">{countdown}s</span></span>
            </div>
            {lastRefreshed && (
              <span className="text-textDim">
                Last updated {lastRefreshed.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => load(true)} disabled={refreshing}>
              <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} /> Refresh
            </Button>
            <Button variant="secondary" onClick={() => api.exportUsers()}>
              <Download size={13} /> Export Users
            </Button>
            <Button variant="secondary" onClick={() => api.exportTransactions()}>
              <Download size={13} /> Export Txns
            </Button>
          </div>
        </div>

        {/* Quick links */}
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { href: "/admin/withdrawals",   label: "Withdrawals",    color: "text-yellow border-yellow/20 hover:bg-yellow/5" },
            { href: "/admin/kyc",           label: "KYC Review",     color: "text-cyan border-cyan/20 hover:bg-cyan/5" },
            { href: "/admin/drivers",       label: "Drivers",        color: "text-purple border-purple/20 hover:bg-purple/5" },
            { href: "/admin/support",       label: "Support Lookup", color: "text-green border-green/20 hover:bg-green/5" },
            { href: "/admin/transactions",  label: "Transactions",   color: "text-textMuted border-border hover:bg-bg2" },
            { href: "/admin/payroll",       label: "Payroll",        color: "text-textMuted border-border hover:bg-bg2" },
            { href: "/admin/fee-simulator", label: "Fee Simulator",  color: "text-textMuted border-border hover:bg-bg2" },
            { href: "/admin/velocity",      label: "Velocity",       color: "text-red/80 border-red/20 hover:bg-red/5" },
            { href: "/admin/export-center", label: "Export Center",  color: "text-textMuted border-border hover:bg-bg2" },
          ].map(l => (
            <Link key={l.href} href={l.href}>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all ${l.color}`}>
                {l.label}
              </span>
            </Link>
          ))}
        </div>

        {/* Tools row */}
        <div>
          <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-3">Platform Tools</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { href: "/admin/fee-simulator", label: "Fee Simulator", desc: "Calculate fees interactively", icon: Calculator, color: "text-cyan", bg: "bg-cyan/10" },
              { href: "/admin/intelligence",  label: "AI Intelligence", desc: "Ask AI, system pulse", icon: Brain, color: "text-purple", bg: "bg-purple/10" },
              { href: "/admin/velocity",      label: "Velocity Monitor", desc: "Fraud velocity rules", icon: Zap, color: "text-red", bg: "bg-red/10" },
              { href: "/admin/export-center", label: "Export Center", desc: "Download platform data", icon: Download, color: "text-green", bg: "bg-green/10" },
            ].map(tool => {
              const Icon = tool.icon;
              return (
                <Link key={tool.href} href={tool.href}>
                  <div className="flex items-center gap-3 p-3 bg-bg2 border border-border rounded-xl hover:border-cyan/20 cursor-pointer transition-all group">
                    <div className={`w-9 h-9 rounded-xl ${tool.bg} flex items-center justify-center flex-shrink-0`}>
                      <Icon size={16} className={tool.color} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-text text-xs font-bold leading-tight">{tool.label}</p>
                      <p className="text-textDim text-[10px] leading-tight mt-0.5 truncate">{tool.desc}</p>
                    </div>
                    <ArrowRight size={12} className="text-textDim ml-auto group-hover:text-textMuted flex-shrink-0 transition-colors" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Today stats */}
        <div>
          <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-3">Today</p>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-bg2 border border-border rounded-xl p-4">
              <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Revenue Today</p>
              <p className="text-2xl font-black text-green">{formatZAR(data.today_revenue)}</p>
              <div className="flex items-center gap-2 mt-1">
                <TrendBadge value={data.today_revenue} prev={data.yesterday_revenue ?? 0} />
                <span className="text-[10px] text-textMuted">vs yesterday</span>
              </div>
            </div>
            <div className="bg-bg2 border border-border rounded-xl p-4">
              <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Transactions</p>
              <p className="text-2xl font-black text-cyan">{data.today_transactions}</p>
              <div className="flex items-center gap-2 mt-1">
                <TrendBadge value={data.today_transactions} prev={data.yesterday_transactions ?? 0} />
                <span className="text-[10px] text-textMuted">vs yesterday</span>
              </div>
            </div>
            <div className="bg-bg2 border border-border rounded-xl p-4">
              <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">New Signups</p>
              <p className="text-2xl font-black text-purple">{data.today_signups}</p>
              <div className="flex items-center gap-2 mt-1">
                <TrendBadge value={data.today_signups} prev={data.yesterday_signups ?? 0} />
                <span className="text-[10px] text-textMuted">vs yesterday</span>
              </div>
            </div>
          </div>
        </div>

        {/* Overall stats */}
        <div>
          <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-3">Platform Totals</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Users" value={data.total_users.toLocaleString()} tone="cyan" />
            <StatCard label="Drivers" value={`${data.total_drivers.toLocaleString()}${data.verified_drivers != null ? ` (${data.verified_drivers} verified)` : ""}`} tone="green" />
            <StatCard label="Passengers" value={data.total_passengers.toLocaleString()} tone="cyan" />
            {data.total_owners != null
              ? <StatCard label="Fleet Owners" value={data.total_owners.toLocaleString()} tone="purple" />
              : <StatCard label="All Transactions" value={data.total_transactions.toLocaleString()} tone="green" />}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Revenue" value={formatZAR(data.total_revenue)} tone="yellow" />
          <StatCard label="In Wallets" value={formatZAR(data.total_wallet_balance)} tone="purple" />
          <StatCard label="Total Withdrawn" value={formatZAR(data.total_withdrawn)} tone="red" />
          <StatCard label="Flagged Accounts" value={String(data.flagged_accounts)} tone="red" />
        </div>

        {/* Action queue — always visible, shows "all clear" state */}
        <div>
          <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-3 flex items-center gap-2">
            <Activity size={11} /> Action Queue
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Link href="/admin/withdrawals">
              <div className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition-all hover:opacity-80 ${
                data.pending_withdrawals > 0 ? "bg-yellow/5 border-yellow/20" : "bg-bg2 border-border"
              }`}>
                <Zap size={16} className={data.pending_withdrawals > 0 ? "text-yellow" : "text-textDim"} />
                <div>
                  <p className={`text-lg font-black leading-none ${data.pending_withdrawals > 0 ? "text-yellow" : "text-textMuted"}`}>
                    {data.pending_withdrawals}
                  </p>
                  <p className="text-[10px] text-textDim mt-0.5">Withdrawals</p>
                </div>
                {data.pending_withdrawals === 0 && <ShieldCheck size={12} className="text-green ml-auto" />}
              </div>
            </Link>
            <Link href="/admin/kyc">
              <div className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition-all hover:opacity-80 ${
                data.pending_kyc > 0 ? "bg-cyan/5 border-cyan/20" : "bg-bg2 border-border"
              }`}>
                <CheckCircle size={16} className={data.pending_kyc > 0 ? "text-cyan" : "text-textDim"} />
                <div>
                  <p className={`text-lg font-black leading-none ${data.pending_kyc > 0 ? "text-cyan" : "text-textMuted"}`}>
                    {data.pending_kyc}
                  </p>
                  <p className="text-[10px] text-textDim mt-0.5">KYC Reviews</p>
                </div>
                {data.pending_kyc === 0 && <ShieldCheck size={12} className="text-green ml-auto" />}
              </div>
            </Link>
            <Link href="/admin/drivers">
              <div className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition-all hover:opacity-80 ${
                data.pending_drivers > 0 ? "bg-purple/5 border-purple/20" : "bg-bg2 border-border"
              }`}>
                <Users size={16} className={data.pending_drivers > 0 ? "text-purple" : "text-textDim"} />
                <div>
                  <p className={`text-lg font-black leading-none ${data.pending_drivers > 0 ? "text-purple" : "text-textMuted"}`}>
                    {data.pending_drivers}
                  </p>
                  <p className="text-[10px] text-textDim mt-0.5">Driver Verif.</p>
                </div>
                {data.pending_drivers === 0 && <ShieldCheck size={12} className="text-green ml-auto" />}
              </div>
            </Link>
            <Link href="/admin/users">
              <div className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition-all hover:opacity-80 ${
                data.flagged_accounts > 0 ? "bg-red/5 border-red/20" : "bg-bg2 border-border"
              }`}>
                <AlertTriangle size={16} className={data.flagged_accounts > 0 ? "text-red" : "text-textDim"} />
                <div>
                  <p className={`text-lg font-black leading-none ${data.flagged_accounts > 0 ? "text-red" : "text-textMuted"}`}>
                    {data.flagged_accounts}
                  </p>
                  <p className="text-[10px] text-textDim mt-0.5">Flagged</p>
                </div>
                {data.flagged_accounts === 0 && <ShieldCheck size={12} className="text-green ml-auto" />}
              </div>
            </Link>
          </div>
          {!hasAlerts && (
            <div className="flex items-center gap-2 mt-2 px-1">
              <ShieldCheck size={12} className="text-green" />
              <p className="text-green text-xs font-semibold">All clear — no pending actions</p>
            </div>
          )}
        </div>

        {/* Pending driver verification queue */}
        {data.pending_driver_list?.length > 0 && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-text font-bold">Pending Driver Verification</h2>
              <Link href="/admin/drivers">
                <Button variant="ghost"><ArrowRight size={13} /> View All</Button>
              </Link>
            </div>
            <Table headers={["Driver", "Phone", "Plate", "Registered", "Waiting", "Action"]} empty={false}>
              {data.pending_driver_list.map((d) => {
                const waitDays = Math.floor((Date.now() - new Date(d.created_at).getTime()) / 86400000);
                return (
                  <Tr key={d.user_id}>
                    <Td className="font-semibold">{d.full_name}</Td>
                    <Td className="font-mono text-xs text-textMuted">{d.phone_number}</Td>
                    <Td>
                      {d.vehicle_plate ? (
                        <span className="font-mono text-xs bg-yellow/10 text-yellow px-2 py-0.5 rounded border border-yellow/20">
                          {d.vehicle_plate}
                        </span>
                      ) : "—"}
                    </Td>
                    <Td className="text-textMuted text-xs">{formatDate(d.created_at)}</Td>
                    <Td>
                      <span className={`text-xs font-bold ${waitDays > 3 ? "text-red" : waitDays > 1 ? "text-yellow" : "text-textMuted"}`}>
                        {waitDays}d
                      </span>
                    </Td>
                    <Td>
                      <Button
                        variant="secondary"
                        loading={verifyingId === d.user_id}
                        disabled={!!verifyingId}
                        onClick={async () => {
                          setVerifyingId(d.user_id);
                          try { await api.verifyDriver(d.user_id); toast.success(`${d.full_name} verified`); load(); }
                          catch (e: any) { toast.error(e.message); }
                          finally { setVerifyingId(null); }
                        }}>
                        <CheckCircle size={13} /> Verify
                      </Button>
                    </Td>
                  </Tr>
                );
              })}
            </Table>
          </Card>
        )}

        {/* Suspicious / flagged transactions */}
        {data.suspicious_transactions?.length > 0 && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-red" />
                <h2 className="text-text font-bold">High-Value Transactions (over R5,000)</h2>
              </div>
              <Link href="/admin/compliance">
                <Button variant="ghost"><ArrowRight size={13} /> Compliance</Button>
              </Link>
            </div>
            <Table headers={["Reference", "Amount", "Sender", "Receiver", "Status", "Date"]} empty={false}>
              {data.suspicious_transactions.map((t) => (
                <Tr key={t.id}>
                  <Td>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-textMuted">{t.reference}</span>
                      <button onClick={() => copyRef(t.reference)} className="text-textDim hover:text-textMuted">
                        <Copy size={10} />
                      </button>
                    </div>
                  </Td>
                  <Td className="font-bold text-red">{formatZAR(t.amount)}</Td>
                  <Td className="text-textMuted text-xs">{t.sender_name || "—"}</Td>
                  <Td className="text-textMuted text-xs">{t.receiver_name || "—"}</Td>
                  <Td>
                    <Badge label={t.status} tone={t.status === "completed" ? "green" : t.status === "pending" ? "yellow" : "red"} />
                  </Td>
                  <Td className="text-textMuted text-xs">{formatDate(t.created_at)}</Td>
                </Tr>
              ))}
            </Table>
          </Card>
        )}

        {/* Recent transactions */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-text font-bold">Recent Transactions</h2>
            <Link href="/admin/transactions">
              <Button variant="ghost"><ArrowRight size={13} /> View All</Button>
            </Link>
          </div>
          <Table
            headers={["Reference", "Type", "Amount", "Fee", "Sender", "Receiver", "Status", "Date"]}
            empty={!data.recent_transactions?.length}
          >
            {data.recent_transactions?.map((t) => (
              <Tr key={t.id}>
                <Td>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-textMuted">{t.reference}</span>
                    <button onClick={() => copyRef(t.reference)} className="text-textDim hover:text-textMuted">
                      <Copy size={10} />
                    </button>
                  </div>
                </Td>
                <Td>
                  <Badge label={t.type} tone={t.type === "topup" ? "cyan" : t.type === "payment" ? "green" : "purple"} />
                </Td>
                <Td className="font-bold">{formatZAR(t.amount)}</Td>
                <Td className="text-textMuted text-xs">{t.platform_fee ? formatZAR(t.platform_fee) : "—"}</Td>
                <Td className="text-textMuted text-xs">{t.sender_name || "—"}</Td>
                <Td className="text-textMuted text-xs">{t.receiver_name || "—"}</Td>
                <Td>
                  <Badge label={t.status} tone={t.status === "completed" ? "green" : t.status === "pending" ? "yellow" : "red"} />
                </Td>
                <Td className="text-textMuted text-xs">{formatDate(t.created_at)}</Td>
              </Tr>
            ))}
          </Table>
        </Card>

      </div>
    </AdminShell>
  );
}
