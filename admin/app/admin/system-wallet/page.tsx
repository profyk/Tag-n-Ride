"use client";
import { useEffect, useState, useCallback } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Button, Spinner, StatCard } from "@/components/ui";
import { api, WalletEntry } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  Landmark, Wallet, TrendingUp, RefreshCw, AlertCircle,
  Users, Lock, ArrowUpRight, ArrowDownRight, Coins,
  ShieldCheck, Info, Banknote, CreditCard, Receipt,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";

type SystemWallet = {
  balance: number;
  total_fees_collected: number;
  total_salary_paid: number;
  available: number;
};

const TT = {
  contentStyle: { background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 },
  labelStyle: { color: "var(--text)", fontSize: 11 },
};

function BigStat({ label, value, sub, tone = "cyan", icon: Icon }: {
  label: string; value: string; sub?: string; tone?: string; icon: any;
}) {
  const colors: Record<string, string> = {
    cyan: "text-cyan border-cyan/10 bg-cyan/5",
    green: "text-green border-green/10 bg-green/5",
    yellow: "text-yellow border-yellow/10 bg-yellow/5",
    purple: "text-purple border-purple/10 bg-purple/5",
    red: "text-red border-red/10 bg-red/5",
  };
  return (
    <div className={`rounded-2xl border p-5 ${colors[tone]}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={14} className={`text-${tone}`} />
        <p className="text-[10px] font-bold uppercase tracking-widest text-textMuted">{label}</p>
      </div>
      <p className={`text-3xl font-black text-${tone}`}>{value}</p>
      {sub && <p className="text-textDim text-xs mt-1">{sub}</p>}
    </div>
  );
}

export default function SystemWalletPage() {
  const [sw, setSw] = useState<SystemWallet | null>(null);
  const [wallets, setWallets] = useState<WalletEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [swRes, walletsRes] = await Promise.all([
        api.systemWallet(),
        api.wallets(),
      ]);
      setSw(swRes.data);
      setWallets(walletsRes.data);
      setLastRefresh(new Date());
    } catch (e: any) {
      toast.error("Failed to load wallet data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Derived figures ──────────────────────────────────────────────────────────
  const totalUserBalances = wallets.reduce((s, w) => s + w.balance, 0);
  const frozenBalances    = wallets.filter(w => w.is_frozen).reduce((s, w) => s + w.balance, 0);
  const frozenCount       = wallets.filter(w => w.is_frozen).length;
  const activeUserBalance = totalUserBalances - frozenBalances;

  const driverBalances    = wallets.filter(w => w.role === "driver").reduce((s, w) => s + w.balance, 0);
  const passengerBalances = wallets.filter(w => w.role === "passenger").reduce((s, w) => s + w.balance, 0);
  const ownerBalances     = wallets.filter(w => w.role === "owner").reduce((s, w) => s + w.balance, 0);

  const totalInPlatform = (sw?.balance ?? 0) + totalUserBalances;
  const platformOwned   = sw?.balance ?? 0;
  const expenses        = sw ? (sw.total_fees_collected - sw.balance) : 0;

  // Pie: money split by holder
  const pieData = [
    { name: "System Wallet", value: Math.round(platformOwned), color: "#00D4FF" },
    { name: "Driver Wallets", value: Math.round(driverBalances), color: "#00E676" },
    { name: "Passenger Wallets", value: Math.round(passengerBalances), color: "#A064FF" },
    { name: "Owner Wallets", value: Math.round(ownerBalances), color: "#FFD60A" },
  ].filter(p => p.value > 0);

  // Wallet size breakdown
  const brackets = [
    { label: "< R50",    min: 0,    max: 50    },
    { label: "R50–R500", min: 50,   max: 500   },
    { label: "R500–R2k", min: 500,  max: 2000  },
    { label: "R2k–R10k", min: 2000, max: 10000 },
    { label: "> R10k",   min: 10000, max: Infinity },
  ].map(b => ({
    label: b.label,
    count: wallets.filter(w => w.balance >= b.min && w.balance < b.max).length,
    total: wallets.filter(w => w.balance >= b.min && w.balance < b.max).reduce((s, w) => s + w.balance, 0),
  }));

  const topWallets = [...wallets].sort((a, b) => b.balance - a.balance).slice(0, 10);

  return (
    <AdminShell title="System Wallet" subtitle="Real-time view of all money under the platform's custody">
      <div className="space-y-6">

        {/* Refresh bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-textMuted">
            <div className="w-2 h-2 rounded-full bg-green animate-pulse" />
            <span>Live balance</span>
            {lastRefresh && (
              <span className="text-textDim">· updated {lastRefresh.toLocaleTimeString("en-ZA")}</span>
            )}
          </div>
          <Button variant="secondary" onClick={load} disabled={loading}>
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-24"><Spinner /></div>
        ) : (
          <>
            {/* ── HERO: Total money in the platform ─────────────────────────── */}
            <div className="relative overflow-hidden bg-bg2 border border-cyan/20 rounded-2xl p-8">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan/5 via-transparent to-purple/5 pointer-events-none" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-2">
                  <Landmark size={16} className="text-cyan" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-textMuted">Total Money Under Custody</p>
                </div>
                <p className="text-6xl font-black text-cyan tracking-tight">{formatZAR(totalInPlatform)}</p>
                <p className="text-textMuted text-sm mt-2">
                  Includes <span className="text-green font-bold">{formatZAR(platformOwned)}</span> in the platform wallet
                  and <span className="text-cyan font-bold">{formatZAR(totalUserBalances)}</span> held in {wallets.length} user wallets.
                </p>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-border">
                  {[
                    { label: "Platform Wallet",   value: formatZAR(platformOwned),   color: "text-cyan",   sub: "Available to platform" },
                    { label: "User Wallets Total", value: formatZAR(totalUserBalances), color: "text-green", sub: `${wallets.length} wallets` },
                    { label: "Frozen Balances",   value: formatZAR(frozenBalances),  color: "text-red",    sub: `${frozenCount} frozen wallets` },
                    { label: "Available to Users", value: formatZAR(activeUserBalance), color: "text-yellow", sub: "Active, non-frozen" },
                  ].map(s => (
                    <div key={s.label}>
                      <p className="text-[9px] text-textDim uppercase font-bold tracking-widest">{s.label}</p>
                      <p className={`text-xl font-black mt-0.5 ${s.color}`}>{s.value}</p>
                      <p className="text-textDim text-[10px] mt-0.5">{s.sub}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Platform wallet breakdown ──────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <BigStat label="Current Balance"     value={formatZAR(sw?.balance ?? 0)}            sub="Net platform wallet balance"     tone="cyan"   icon={Landmark} />
              <BigStat label="Total Fees Collected" value={formatZAR(sw?.total_fees_collected ?? 0)} sub="All fees earned, all time"       tone="green"  icon={TrendingUp} />
              <BigStat label="Total Salary Paid"    value={formatZAR(sw?.total_salary_paid ?? 0)}   sub="Staff costs deducted"            tone="yellow" icon={CreditCard} />
              <BigStat label="Available Balance"    value={formatZAR(sw?.available ?? 0)}           sub="After pending obligations"       tone="purple" icon={ShieldCheck} />
            </div>

            {/* ── User wallet breakdown ──────────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-bg2 border border-border rounded-xl p-4 flex items-start gap-4">
                <div className="w-10 h-10 bg-green/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Coins size={18} className="text-green" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest">Driver Wallets</p>
                  <p className="text-2xl font-black text-green mt-0.5">{formatZAR(driverBalances)}</p>
                  <p className="text-textDim text-xs mt-1">{wallets.filter(w => w.role === "driver").length} drivers</p>
                </div>
              </div>
              <div className="bg-bg2 border border-border rounded-xl p-4 flex items-start gap-4">
                <div className="w-10 h-10 bg-purple/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Users size={18} className="text-purple" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest">Passenger Wallets</p>
                  <p className="text-2xl font-black text-purple mt-0.5">{formatZAR(passengerBalances)}</p>
                  <p className="text-textDim text-xs mt-1">{wallets.filter(w => w.role === "passenger").length} passengers</p>
                </div>
              </div>
              <div className="bg-bg2 border border-border rounded-xl p-4 flex items-start gap-4">
                <div className="w-10 h-10 bg-yellow/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Banknote size={18} className="text-yellow" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest">Owner Wallets</p>
                  <p className="text-2xl font-black text-yellow mt-0.5">{formatZAR(ownerBalances)}</p>
                  <p className="text-textDim text-xs mt-1">{wallets.filter(w => w.role === "owner").length} owners</p>
                </div>
              </div>
            </div>

            {/* ── Charts row ────────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

              {/* Money distribution pie */}
              <Card>
                <h2 className="text-text font-bold text-sm mb-4 flex items-center gap-2">
                  <Wallet size={14} className="text-cyan" /> Money Distribution
                </h2>
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width={160} height={160}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={44} outerRadius={68}
                        paddingAngle={3} dataKey="value">
                        {pieData.map((p, i) => <Cell key={i} fill={p.color} />)}
                      </Pie>
                      <Tooltip {...TT} formatter={(v: any) => formatZAR(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    {pieData.map(p => {
                      const pct = totalInPlatform > 0 ? ((p.value / totalInPlatform) * 100).toFixed(1) : "0";
                      return (
                        <div key={p.name} className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: p.color }} />
                          <span className="text-textMuted text-xs flex-1 leading-tight">{p.name}</span>
                          <span className="text-text font-bold text-xs">{formatZAR(p.value)}</span>
                          <span className="text-textDim text-[10px] w-10 text-right">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>

              {/* Wallet size brackets */}
              <Card>
                <h2 className="text-text font-bold text-sm mb-4 flex items-center gap-2">
                  <Receipt size={14} className="text-yellow" /> Wallet Balance Brackets
                </h2>
                <div className="space-y-3">
                  {brackets.map(b => {
                    const pct = totalUserBalances > 0 ? (b.total / totalUserBalances) * 100 : 0;
                    return (
                      <div key={b.label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-textMuted font-semibold">{b.label}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-textDim text-[10px]">{b.count} wallets</span>
                            <span className="text-text font-bold text-xs w-24 text-right">{formatZAR(b.total)}</span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-bg3 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-cyan transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>

            {/* ── Top wallet holders ────────────────────────────────────────── */}
            <Card>
              <h2 className="text-text font-bold text-sm mb-4 flex items-center gap-2">
                <ArrowUpRight size={14} className="text-green" /> Top 10 Wallet Balances
              </h2>
              <div className="space-y-2">
                {topWallets.map((w, i) => {
                  const pct = totalUserBalances > 0 ? (w.balance / totalUserBalances) * 100 : 0;
                  return (
                    <div key={w.user_id} className="flex items-center gap-3">
                      <span className="text-[10px] font-black text-textDim w-5 text-right">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-text text-xs font-semibold truncate">{w.full_name}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded border font-bold capitalize"
                              style={{
                                color: w.role === "driver" ? "var(--green)" : w.role === "owner" ? "var(--yellow)" : "var(--purple)",
                                borderColor: w.role === "driver" ? "var(--green)" : w.role === "owner" ? "var(--yellow)" : "var(--purple)",
                                background: w.role === "driver" ? "rgba(0,230,118,0.07)" : w.role === "owner" ? "rgba(255,214,10,0.07)" : "rgba(160,100,255,0.07)",
                              }}>
                              {w.role}
                            </span>
                            {w.is_frozen && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded border font-bold text-red border-red/30 bg-red/5">
                                frozen
                              </span>
                            )}
                          </div>
                          <span className="text-green font-black text-sm flex-shrink-0">{formatZAR(w.balance)}</span>
                        </div>
                        <div className="h-1 bg-bg3 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-green/60" style={{ width: `${Math.min(100, pct * 5)}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* ── Platform P&L snapshot ─────────────────────────────────────── */}
            {sw && (
              <Card>
                <h2 className="text-text font-bold text-sm mb-4 flex items-center gap-2">
                  <TrendingUp size={14} className="text-cyan" /> Platform P&L Snapshot
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-green/5 border border-green/20 rounded-xl">
                    <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest">Total Fees Earned</p>
                    <p className="text-2xl font-black text-green mt-1">{formatZAR(sw.total_fees_collected)}</p>
                    <p className="text-textDim text-xs mt-1">All revenue collected since launch</p>
                  </div>
                  <div className="p-4 bg-red/5 border border-red/20 rounded-xl">
                    <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest">Total Costs</p>
                    <p className="text-2xl font-black text-red mt-1">{formatZAR(expenses > 0 ? expenses : sw.total_salary_paid)}</p>
                    <p className="text-textDim text-xs mt-1">Salaries paid + operational costs</p>
                  </div>
                  <div className="p-4 bg-cyan/5 border border-cyan/20 rounded-xl">
                    <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest">Net Platform Balance</p>
                    <p className="text-2xl font-black text-cyan mt-1">{formatZAR(sw.balance)}</p>
                    <p className="text-textDim text-xs mt-1">What the platform currently holds</p>
                  </div>
                </div>
              </Card>
            )}

            {/* ── Info note ─────────────────────────────────────────────────── */}
            <div className="flex items-start gap-3 px-4 py-3 bg-bg2 border border-border rounded-xl">
              <Info size={14} className="text-textMuted flex-shrink-0 mt-0.5" />
              <div className="text-xs text-textDim space-y-1">
                <p><strong className="text-textMuted">System Wallet:</strong> The platform's own operating balance from collected fees, minus expenses paid out (salaries, refunds, operational costs).</p>
                <p><strong className="text-textMuted">User Wallets:</strong> Money belonging to users (drivers, passengers, owners) that the platform holds in trust. This is a liability — users can withdraw at any time.</p>
                <p><strong className="text-textMuted">Total Under Custody:</strong> The sum of both — the full amount of money the platform is responsible for at this moment.</p>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}
