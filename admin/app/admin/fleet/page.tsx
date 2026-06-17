"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Modal } from "@/components/ui";
import { api, Owner, OwnerDetail, OwnerDriver } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  Download, Search, ChevronRight, RefreshCw, Building2,
  Wallet, Banknote, Star, CheckCircle, Clock, Users,
  TrendingUp, Copy, X, ExternalLink, Award, ChevronDown,
  ChevronUp, FileText,
} from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHdrs = () => ({ Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}` });

// ── Avatar ───────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "bg-cyan/20 text-cyan border-cyan/30",
  "bg-purple/20 text-purple border-purple/30",
  "bg-green/20 text-green border-green/30",
  "bg-yellow/20 text-yellow border-yellow/30",
  "bg-orange/20 text-orange border-orange/30",
];
function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const idx = (name.charCodeAt(0) + (name.charCodeAt(1) || 0)) % AVATAR_COLORS.length;
  const initials = name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("");
  const sz = size === "sm" ? "w-8 h-8 text-[10px]" : size === "lg" ? "w-14 h-14 text-xl" : "w-9 h-9 text-xs";
  return (
    <div className={`${sz} rounded-full border flex items-center justify-center font-black flex-shrink-0 ${AVATAR_COLORS[idx]}`}>
      {initials}
    </div>
  );
}

// ── Cashup method pill ───────────────────────────────────────────────────────
function CashupPill({ method }: { method: string }) {
  return method === "bank"
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold bg-green/10 border-green/20 text-green"><Banknote size={8} /> Bank</span>
    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold bg-cyan/10 border-cyan/20 text-cyan"><Wallet size={8} /> Wallet</span>;
}

// ── Payment mode pill ────────────────────────────────────────────────────────
function PaymentModePill({ mode, pct }: { mode: string; pct: number }) {
  return mode === "commission_split"
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold bg-purple/10 border-purple/20 text-purple">{pct}% split</span>
    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold bg-yellow/10 border-yellow/20 text-yellow">Daily target</span>;
}

// ── Star rating ──────────────────────────────────────────────────────────────
function Stars({ avg, count }: { avg: number; count: number }) {
  if (count === 0) return <span className="text-textDim text-[10px] italic">New</span>;
  return (
    <span className="text-yellow text-[10px] font-black">★ {avg.toFixed(1)}</span>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <div className="border border-border rounded-xl px-4 py-3 bg-bg2 animate-pulse flex items-center gap-3">
      <div className="w-9 h-9 rounded-full bg-bg3 flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-36 bg-bg3 rounded" />
        <div className="h-2 w-24 bg-bg3 rounded" />
      </div>
      <div className="space-y-1.5 text-right">
        <div className="h-3 w-16 bg-bg3 rounded ml-auto" />
        <div className="h-2 w-10 bg-bg3 rounded ml-auto" />
      </div>
      <div className="h-8 w-8 rounded-lg bg-bg3 flex-shrink-0" />
    </div>
  );
}

// ── Owner detail modal ────────────────────────────────────────────────────────
function OwnerDetailModal({
  owner, onClose,
}: { owner: Owner; onClose: () => void }) {
  const [detail, setDetail] = useState<OwnerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    api.ownerDetail(owner.user_id)
      .then(r => setDetail(r.data))
      .catch(() => {})
      .finally(() => setDetailLoading(false));
  }, [owner.user_id]);

  const drivers = detail?.drivers || [];
  const cashups = detail?.cashup_history || [];
  const visibleDrivers = showAll ? drivers : drivers.slice(0, 5);

  return (
    <Modal open onClose={onClose} title="Fleet Owner Profile">
      <div className="space-y-5">

        {/* Hero */}
        <div className="rounded-xl p-5 border border-border bg-bg2 flex items-start gap-4">
          <Avatar name={owner.full_name} size="lg" />
          <div className="flex-1 min-w-0">
            <p className="text-text font-black text-lg leading-tight">{owner.full_name}</p>
            {owner.business_name && (
              <div className="flex items-center gap-1.5 mt-1">
                <Building2 size={11} className="text-textDim" />
                <p className="text-textMuted text-xs font-semibold">{owner.business_name}</p>
              </div>
            )}
            <p className="text-textDim text-xs font-mono mt-1">{owner.phone_number}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <CashupPill method={owner.cashup_method} />
              <span className="text-[10px] text-textDim">Joined {formatDate(owner.created_at)}</span>
            </div>
          </div>
          <button onClick={() => { navigator.clipboard.writeText(owner.user_id); toast.success("ID copied"); }}
            className="text-textDim hover:text-textMuted flex-shrink-0">
            <Copy size={12} />
          </button>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Wallet Balance",  value: formatZAR(owner.balance),      color: "text-cyan"   },
            { label: "Total Cashups",   value: formatZAR(owner.total_cashup),  color: "text-green"  },
            { label: "Drivers",         value: owner.driver_count,             color: "text-text"   },
            { label: "Bank",            value: owner.bank_name || "—",         color: "text-textMuted", small: true },
          ].map(s => (
            <div key={s.label} className="bg-bg border border-border rounded-xl px-3 py-2.5">
              <p className="text-[9px] font-bold text-textDim uppercase tracking-widest mb-1">{s.label}</p>
              <p className={`${s.small ? "text-xs" : "text-sm"} font-black ${s.color} truncate`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Bank account */}
        {owner.cashup_method === "bank" && owner.account_number && (
          <div className="flex items-center justify-between px-4 py-3 bg-green/5 border border-green/20 rounded-xl">
            <div className="flex items-center gap-2">
              <Banknote size={14} className="text-green" />
              <div>
                <p className="text-[9px] font-bold text-textDim uppercase tracking-widest">Account</p>
                <p className="text-text text-sm font-mono font-bold">•••• {owner.account_number.slice(-4)}</p>
              </div>
            </div>
            <span className="text-textMuted text-xs">{owner.bank_name}</span>
          </div>
        )}

        {/* Driver roster */}
        <div>
          <p className="text-[10px] font-bold text-textDim uppercase tracking-widest mb-2">
            Fleet Drivers ({drivers.length})
          </p>
          {detailLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-10 bg-bg3 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : drivers.length === 0 ? (
            <p className="text-textDim text-xs text-center py-4 border border-border rounded-xl">No drivers in this fleet yet</p>
          ) : (
            <div className="space-y-1.5">
              {visibleDrivers.map((d: OwnerDriver) => (
                <div key={d.user_id} className="flex items-center gap-2.5 px-3 py-2 bg-bg border border-border rounded-lg">
                  <Avatar name={d.full_name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-text text-xs font-bold truncate">{d.full_name}</p>
                      {d.is_verified
                        ? <CheckCircle size={9} className="text-green flex-shrink-0" />
                        : <Clock size={9} className="text-yellow flex-shrink-0" />}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {d.vehicle_plate && (
                        <span className="font-mono text-[9px] bg-yellow/10 text-yellow px-1.5 rounded border border-yellow/20">
                          {d.vehicle_plate}
                        </span>
                      )}
                      <PaymentModePill mode={d.payment_mode} pct={d.driver_commission_pct} />
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-green text-xs font-black tabular-nums">{formatZAR(d.total_earnings)}</p>
                    <Stars avg={d.rating_avg} count={d.rating_count} />
                  </div>
                </div>
              ))}
              {drivers.length > 5 && (
                <button onClick={() => setShowAll(s => !s)}
                  className="w-full py-2 text-[11px] font-bold text-textMuted hover:text-cyan transition-colors">
                  {showAll ? "Show less ▲" : `Show all ${drivers.length} drivers ▼`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Recent cashup history */}
        {cashups.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-textDim uppercase tracking-widest mb-2">Recent Cashups</p>
            <div className="space-y-1.5">
              {cashups.slice(0, 4).map(c => (
                <div key={c.id} className="flex items-center justify-between px-3 py-2 bg-bg border border-border rounded-lg">
                  <div>
                    <p className="text-text text-xs font-semibold">{c.driver_name}</p>
                    <p className="text-textDim text-[10px]">{formatDate(c.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-green text-xs font-black">{formatZAR(c.cashup_amount)}</p>
                    <p className="text-textDim text-[10px]">profit {formatZAR(c.driver_profit)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <Link href={`/admin/users?search=${encodeURIComponent(owner.phone_number)}`} onClick={onClose}>
          <button className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-cyan/10 border border-cyan/20 text-cyan text-xs font-bold hover:bg-cyan/20 transition-all">
            <ExternalLink size={13} /> Open in Users
          </button>
        </Link>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function FleetPage() {
  const [owners,    setOwners]    = useState<Owner[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [tab,       setTab]       = useState<"owners" | "leaderboard">("owners");
  const [sortBy,    setSortBy]    = useState<"drivers" | "cashup" | "newest" | "name">("drivers");
  const [countdown, setCountdown] = useState(60);
  const [profileOwner, setProfileOwner] = useState<Owner | null>(null);
  const timerRef = useRef<any>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.allSettled([
      api.owners(),
      fetch(`${BASE}/api/admin/fleet/reports`, { headers: authHdrs() }).then(r => r.json()),
    ]).then(([ownersRes, fleetRes]) => {
      if (ownersRes.status === "fulfilled") setOwners(ownersRes.value.data);
      if (fleetRes.status === "fulfilled") setLeaderboard(fleetRes.value?.fleet_earnings || []);
    }).finally(() => setLoading(false));
  }, []);

  const refresh = useCallback(() => { load(); setCountdown(60); }, [load]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown(c => { if (c <= 1) { refresh(); return 60; } return c - 1; });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [refresh]);

  // ── Derived ─────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const totalDrivers   = owners.reduce((s, o) => s + o.driver_count, 0);
    const totalBalance   = owners.reduce((s, o) => s + o.balance, 0);
    const totalCashup    = owners.reduce((s, o) => s + o.total_cashup, 0);
    const bankCount      = owners.filter(o => o.cashup_method === "bank").length;
    const walletCount    = owners.filter(o => o.cashup_method === "wallet").length;
    const avgDrivers     = owners.length > 0 ? (totalDrivers / owners.length).toFixed(1) : "0";
    return { totalDrivers, totalBalance, totalCashup, bankCount, walletCount, avgDrivers };
  }, [owners]);

  const maxCashup = useMemo(() => owners.reduce((m, o) => Math.max(m, o.total_cashup), 0), [owners]);

  const filtered = useMemo(() => owners
    .filter(o =>
      !search ||
      o.full_name.toLowerCase().includes(search.toLowerCase()) ||
      o.phone_number.includes(search) ||
      (o.business_name || "").toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === "drivers")  return b.driver_count - a.driver_count;
      if (sortBy === "cashup")   return b.total_cashup - a.total_cashup;
      if (sortBy === "newest")   return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === "name")     return a.full_name.localeCompare(b.full_name);
      return 0;
    }),
  [owners, search, sortBy]);

  const lbTotal = useMemo(() => leaderboard.reduce((s: number, f: any) => s + (f.fleet_total_earnings || 0), 0), [leaderboard]);

  const exportCsv = () => {
    if (owners.length === 0) return;
    const rows = [
      ["Name", "Phone", "Business", "Drivers", "Balance", "Total Cashup", "Cashup Method", "Bank", "Joined"],
      ...filtered.map(o => [
        o.full_name, o.phone_number, o.business_name || "",
        o.driver_count, formatZAR(o.balance), formatZAR(o.total_cashup),
        o.cashup_method, o.bank_name || "", formatDate(o.created_at),
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "fleet-owners.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} owners`);
  };

  return (
    <AdminShell title="Fleet Owners">
      <div className="space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div />
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <div className="w-20 h-1 bg-bg3 rounded-full overflow-hidden">
                <div className="h-full bg-cyan/50 rounded-full transition-all duration-1000"
                  style={{ width: `${(countdown / 60) * 100}%` }} />
              </div>
              <span className="text-textDim text-[10px] w-6">{countdown}s</span>
            </div>
            <button onClick={refresh} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-textMuted hover:text-cyan border border-border rounded-lg transition-all">
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
            <button onClick={exportCsv} disabled={loading || owners.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-textMuted hover:text-text border border-border rounded-lg transition-all disabled:opacity-40">
              <Download size={12} /> Export CSV
            </button>
          </div>
        </div>

        {/* ── Stats strip ── */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { label: "Total Owners",    value: owners.length,               color: "text-text"   },
            { label: "Total Drivers",   value: stats.totalDrivers,          color: "text-cyan"   },
            { label: "Avg Drivers",     value: stats.avgDrivers,            color: "text-purple" },
            { label: "Wallet Balances", value: formatZAR(stats.totalBalance), color: "text-yellow" },
            { label: "Total Cashups",   value: formatZAR(stats.totalCashup),  color: "text-green"  },
            { label: "Bank / Wallet",   value: `${stats.bankCount} / ${stats.walletCount}`, color: "text-textMuted" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-bg2 border border-border rounded-xl px-3 py-3 text-center">
              <p className={`text-base font-black tabular-nums ${color}`}>{value}</p>
              <p className="text-[9px] font-bold text-textDim uppercase tracking-wider mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-0 border-b border-border">
          {([
            { key: "owners",      label: `Owners (${owners.length})` },
            { key: "leaderboard", label: "Earnings Leaderboard" },
          ] as const).map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-5 py-3 text-xs font-bold border-b-2 transition-all ${
                tab === key ? "text-cyan border-cyan" : "text-textMuted border-transparent hover:text-text"
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* ════ OWNERS TAB ════ */}
        {tab === "owners" && (
          <>
            {/* Search + sort */}
            <div className="flex gap-2 flex-wrap items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-textDim" />
                <input
                  placeholder="Search name, phone, business…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-bg2 border border-border rounded-lg text-sm text-text placeholder:text-textDim focus:outline-none focus:border-cyan/50 transition-colors"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-textDim hover:text-textMuted">
                    <X size={13} />
                  </button>
                )}
              </div>
              <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
                className="bg-bg2 border border-border rounded-lg px-3 py-2 text-xs text-textMuted focus:outline-none focus:border-cyan/50 font-bold">
                <option value="drivers">Sort: Most Drivers</option>
                <option value="cashup">Sort: Highest Cashup</option>
                <option value="newest">Sort: Newest</option>
                <option value="name">Sort: A → Z</option>
              </select>
            </div>

            <p className="text-textDim text-[10px]">
              Showing <span className="text-text font-bold">{filtered.length}</span> of{" "}
              <span className="text-text font-bold">{owners.length}</span> owners
            </p>

            {/* Owner rows */}
            <div className="space-y-2">
              {loading
                ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
                : filtered.length === 0
                ? <div className="bg-bg2 border border-border rounded-xl py-16 text-center text-textMuted text-sm">No owners match current search</div>
                : filtered.map((o, idx) => {
                    const barPct = maxCashup > 0 ? (o.total_cashup / maxCashup) * 100 : 0;
                    const isTop3 = sortBy === "cashup" && idx < 3;
                    const medals = ["🥇", "🥈", "🥉"];
                    return (
                      <div key={o.user_id}
                        onClick={() => setProfileOwner(o)}
                        className="bg-bg2 border border-border rounded-xl px-4 py-3 cursor-pointer hover:border-cyan/30 hover:bg-bg3/30 transition-all flex items-center gap-3">

                        {/* Avatar */}
                        <div className="relative flex-shrink-0">
                          <Avatar name={o.full_name} />
                          {isTop3 && <span className="absolute -top-1 -right-1 text-[11px]">{medals[idx]}</span>}
                        </div>

                        {/* Name + business */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-text font-bold text-sm">{o.full_name}</p>
                            {o.business_name && (
                              <span className="text-[10px] bg-bg3 border border-border text-textMuted px-2 py-0.5 rounded-full font-semibold truncate max-w-[120px]">
                                {o.business_name}
                              </span>
                            )}
                            <CashupPill method={o.cashup_method} />
                          </div>
                          <div className="flex items-center gap-3 mt-1.5">
                            {/* Cashup bar */}
                            <div className="flex items-center gap-1.5">
                              <div className="w-16 h-1 bg-bg3 rounded-full overflow-hidden">
                                <div className="h-full bg-green/60 rounded-full" style={{ width: `${barPct}%` }} />
                              </div>
                              <p className="text-green text-[10px] font-black tabular-nums">{formatZAR(o.total_cashup)}</p>
                            </div>
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="hidden sm:flex items-center gap-5 flex-shrink-0">
                          <div className="text-center">
                            <p className="text-cyan font-black text-sm">{o.driver_count}</p>
                            <p className="text-textDim text-[9px] font-bold uppercase">Drivers</p>
                          </div>
                          <div className="text-center">
                            <p className="text-yellow font-black text-sm tabular-nums">{formatZAR(o.balance)}</p>
                            <p className="text-textDim text-[9px] font-bold uppercase">Balance</p>
                          </div>
                        </div>

                        <ChevronRight size={14} className="text-textDim flex-shrink-0" />
                      </div>
                    );
                  })
              }
            </div>
          </>
        )}

        {/* ════ LEADERBOARD TAB ════ */}
        {tab === "leaderboard" && (
          <div className="space-y-3">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-20 bg-bg2 border border-border rounded-xl animate-pulse" />
              ))
            ) : leaderboard.length === 0 ? (
              <div className="bg-bg2 border border-border rounded-xl py-16 text-center text-textMuted text-sm">
                No earnings data yet
              </div>
            ) : leaderboard.map((f: any, i: number) => {
              const pct = lbTotal > 0 ? Math.round((f.fleet_total_earnings / lbTotal) * 100) : 0;
              const medalColors = ["bg-yellow/20 text-yellow", "bg-gray-400/20 text-gray-400", "bg-orange/20 text-orange"];
              return (
                <div key={f.owner_id} className="bg-bg2 border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm border ${i < 3 ? medalColors[i] + " border-transparent" : "bg-bg3 text-textMuted border-border"}`}>
                        #{i + 1}
                      </div>
                      <div>
                        <p className="text-text font-bold">{f.owner_name}</p>
                        <p className="text-textMuted text-xs">
                          {f.driver_count} driver{f.driver_count !== 1 ? "s" : ""} · {pct}% of fleet
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-green font-black text-lg tabular-nums">{formatZAR(f.fleet_total_earnings)}</p>
                      <p className="text-textDim text-[10px]">fleet earnings</p>
                    </div>
                  </div>
                  <div className="h-1.5 bg-bg3 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-green to-cyan rounded-full transition-all duration-700"
                      style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}

            {/* Leaderboard summary */}
            {leaderboard.length > 0 && (
              <div className="bg-bg2 border border-border rounded-xl px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp size={14} className="text-green" />
                  <span className="text-textMuted text-xs font-bold">Total Fleet Earnings</span>
                </div>
                <span className="text-green font-black tabular-nums">{formatZAR(lbTotal)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Owner profile modal ── */}
      {profileOwner && (
        <OwnerDetailModal owner={profileOwner} onClose={() => setProfileOwner(null)} />
      )}
    </AdminShell>
  );
}
