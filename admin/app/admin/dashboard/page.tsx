"use client";
import { useEffect, useState, useRef } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { StatCard, Table, Tr, Td, Badge, Spinner, Card, Button } from "@/components/ui";
import { api, DashboardStats } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  AlertTriangle, Download, CheckCircle, RefreshCw, TrendingUp, TrendingDown,
  ArrowRight, Copy, Clock,
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
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const r = await api.dashboard();
      setData(r.data);
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

  if (loading || !data) return <AdminShell title="Dashboard"><Spinner /></AdminShell>;

  const hasAlerts = data.pending_withdrawals > 0 || data.pending_drivers > 0 || data.pending_kyc > 0 || data.flagged_accounts > 0;

  return (
    <AdminShell title="Dashboard">
      <div className="space-y-6">

        {/* Header actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-textMuted">
            <Clock size={12} />
            <span>Auto-refresh in <span className="text-cyan font-bold">{countdown}s</span></span>
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
            <StatCard label="Total Drivers" value={data.total_drivers.toLocaleString()} tone="green" />
            <StatCard label="Total Revenue" value={formatZAR(data.total_revenue)} tone="yellow" />
            <StatCard label="In Wallets" value={formatZAR(data.total_wallet_balance)} tone="purple" />
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Withdrawn" value={formatZAR(data.total_withdrawn)} tone="red" />
          <StatCard label="Passengers" value={data.total_passengers.toLocaleString()} tone="cyan" />
          <StatCard label="All Transactions" value={data.total_transactions.toLocaleString()} tone="green" />
          <StatCard label="Flagged Accounts" value={String(data.flagged_accounts)} tone="red" />
        </div>

        {/* Action alerts — clickable, link to relevant page */}
        {hasAlerts && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {data.pending_withdrawals > 0 && (
              <AlertBanner href="/admin/withdrawals" tone="yellow" count={data.pending_withdrawals} label="Pending Withdrawals" sub="Require approval" />
            )}
            {data.pending_kyc > 0 && (
              <AlertBanner href="/admin/kyc" tone="cyan" count={data.pending_kyc} label="KYC Pending" sub="Documents to review" />
            )}
            {data.pending_drivers > 0 && (
              <AlertBanner href="/admin/drivers" tone="purple" count={data.pending_drivers} label="Unverified Drivers" sub="Need verification" />
            )}
            {data.flagged_accounts > 0 && (
              <AlertBanner href="/admin/users" tone="red" count={data.flagged_accounts} label="Flagged Accounts" sub="Require review" />
            )}
          </div>
        )}

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
                      <Button variant="secondary" onClick={async () => {
                        try { await api.verifyDriver(d.user_id); toast.success(`${d.full_name} verified`); load(); }
                        catch (e: any) { toast.error(e.message); }
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
