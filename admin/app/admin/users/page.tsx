"use client";
import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AdminShell } from "@/components/layout/AdminShell";
import { Badge, Button, Spinner, Input, Modal } from "@/components/ui";
import { api, User, hasPermission, isSuperAdmin } from "@/lib/api";
import { formatDate, SA_PROVINCES } from "@/lib/utils";
import {
  Search, Flag, ShieldOff, ShieldCheck, Key, Trash2, Copy,
  Download, X, AlertTriangle, RefreshCw, Users, UserCheck,
  UserX, Filter, ChevronRight, Wallet, Activity, Phone,
  Mail, Hash, Calendar, Shield, Star, Clock,
} from "lucide-react";
import toast from "react-hot-toast";
import { DangerPinModal, useDangerPin } from "@/components/DangerPinModal";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authH = (danger?: string | null) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
  ...(danger ? { "X-Danger-Token": danger } : {}),
});

// ── Presets ────────────────────────────────────────────────────────────────
const FLAG_PRESETS = [
  "Suspicious transaction pattern", "Multiple failed PIN attempts",
  "Reported by another user",       "Potential fraudulent activity",
  "Account sharing suspected",      "Velocity limit exceeded",
];
const BLOCK_REASONS = [
  "Fraudulent activity confirmed",  "Chargeback filed",
  "Terms of service violation",     "Failed identity verification",
  "Unresolved dispute",             "Velocity limit breached",
];

// ── Avatar ─────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "bg-cyan/20 text-cyan border-cyan/30",
  "bg-green/20 text-green border-green/30",
  "bg-purple/20 text-purple border-purple/30",
  "bg-yellow/20 text-yellow border-yellow/30",
  "bg-orange/20 text-orange border-orange/30",
];
function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length;
  const initials = name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("");
  const sz = size === "sm" ? "w-7 h-7 text-[10px]" : size === "lg" ? "w-14 h-14 text-xl" : "w-9 h-9 text-xs";
  return (
    <div className={`${sz} rounded-full border flex items-center justify-center font-black flex-shrink-0 ${AVATAR_COLORS[idx]}`}>
      {initials}
    </div>
  );
}

// ── Role pill ──────────────────────────────────────────────────────────────
const ROLE_STYLE: Record<string, string> = {
  passenger: "bg-cyan/10 border-cyan/20 text-cyan",
  driver:    "bg-green/10 border-green/20 text-green",
  owner:     "bg-purple/10 border-purple/20 text-purple",
  admin:     "bg-yellow/10 border-yellow/20 text-yellow",
};
function RolePill({ role }: { role: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${ROLE_STYLE[role] || "bg-bg3 border-border text-textMuted"}`}>
      {role}
    </span>
  );
}

// ── Risk score bar ─────────────────────────────────────────────────────────
function RiskBar({ score }: { score?: number }) {
  if (score == null) return <span className="text-textDim text-[10px]">—</span>;
  const color = score >= 75 ? "bg-red" : score >= 50 ? "bg-yellow" : "bg-green";
  const label = score >= 75 ? "text-red" : score >= 50 ? "text-yellow" : "text-green";
  return (
    <div className="flex items-center gap-1.5 min-w-[70px]">
      <div className="flex-1 h-1 bg-bg3 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-[10px] font-black tabular-nums ${label}`}>{score}</span>
    </div>
  );
}

// ── Skeleton row ───────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr className="border-b border-border animate-pulse">
      <td className="py-3 px-4"><div className="w-3.5 h-3.5 bg-bg3 rounded" /></td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-bg3" />
          <div className="space-y-1"><div className="h-3 w-28 bg-bg3 rounded" /><div className="h-2 w-16 bg-bg3 rounded" /></div>
        </div>
      </td>
      {[60, 55, 50, 55, 70, 60, 80].map((w, i) => (
        <td key={i} className="py-3 px-4"><div className="h-3 bg-bg3 rounded" style={{ width: w }} /></td>
      ))}
    </tr>
  );
}

// ── User detail modal ──────────────────────────────────────────────────────
function UserDetailModal({
  user, riskScore, onClose, onBlock, onUnblock, onFlag, onUnflag,
  onResetPin, onDelete, superAdmin,
}: {
  user: User; riskScore?: number; onClose: () => void;
  onBlock: () => void; onUnblock: () => void;
  onFlag: () => void;  onUnflag: () => void;
  onResetPin: () => void; onDelete: () => void;
  superAdmin: boolean;
}) {
  const [wallet, setWallet]   = useState<any>(null);
  const [txns, setTxns]       = useState<any[]>([]);
  const [wLoading, setWLoading] = useState(true);

  useEffect(() => {
    // Load wallet + recent txns via support lookup
    const token = localStorage.getItem("tnr_admin_token");
    Promise.allSettled([
      fetch(`${BASE}/api/admin/support/user/${encodeURIComponent(user.phone_number)}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json()),
      api.transactions({ user_id: user.id }).then(r => r.data),
    ]).then(([supportR, txnR]) => {
      if (supportR.status === "fulfilled" && supportR.value?.wallet) {
        setWallet(supportR.value.wallet);
        if (supportR.value.recent_transactions) setTxns(supportR.value.recent_transactions.slice(0, 5));
      }
      if (txnR.status === "fulfilled" && txns.length === 0) setTxns(txnR.value.slice(0, 5));
    }).finally(() => setWLoading(false));
  }, [user.id, user.phone_number]);

  const fmt = (n: number) => `R ${Number(n).toFixed(2)}`;

  return (
    <Modal open onClose={onClose} title="User Profile">
      <div className="space-y-5">
        {/* Identity hero */}
        <div className={`rounded-xl p-5 border flex items-start gap-4 ${
          !user.is_active ? "bg-red/5 border-red/20" : user.flagged ? "bg-yellow/5 border-yellow/20" : "bg-bg2 border-border"
        }`}>
          <Avatar name={user.full_name} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-text font-black text-lg">{user.full_name}</p>
              <RolePill role={user.role} />
              {!user.is_active && (
                <span className="text-[10px] font-bold px-2 py-0.5 bg-red/10 border border-red/20 rounded-full text-red">BLOCKED</span>
              )}
              {user.flagged && (
                <span className="text-[10px] font-bold px-2 py-0.5 bg-yellow/10 border border-yellow/20 rounded-full text-yellow">⚑ FLAGGED</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
              <div className="flex items-center gap-1.5 text-textMuted text-xs">
                <Phone size={10} /> {user.phone_number}
              </div>
              {(user as any).email && (
                <div className="flex items-center gap-1.5 text-textMuted text-xs">
                  <Mail size={10} /> {(user as any).email}
                </div>
              )}
              <div className="flex items-center gap-1.5 text-textDim text-xs font-mono">
                <Hash size={10} />
                <button onClick={() => { navigator.clipboard.writeText(user.id); toast.success("ID copied"); }}
                  className="hover:text-textMuted transition-colors flex items-center gap-1">
                  {user.id.slice(0, 12)}… <Copy size={9} />
                </button>
              </div>
              <div className="flex items-center gap-1.5 text-textDim text-xs">
                <Calendar size={10} /> Joined {formatDate(user.created_at)}
              </div>
            </div>
          </div>
        </div>

        {/* Wallet + Risk */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-bg2 border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Wallet size={12} className="text-cyan" />
              <p className="text-[10px] font-bold text-textDim uppercase tracking-widest">Wallet</p>
            </div>
            {wLoading ? <div className="h-5 w-20 bg-bg3 animate-pulse rounded" /> : (
              <>
                <p className="text-xl font-black text-cyan tabular-nums">{wallet ? fmt(wallet.balance ?? 0) : "—"}</p>
                {wallet?.is_frozen && (
                  <span className="text-[10px] font-bold text-red bg-red/10 border border-red/20 px-2 py-0.5 rounded-full mt-1 inline-block">FROZEN</span>
                )}
              </>
            )}
          </div>
          <div className="bg-bg2 border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield size={12} className="text-purple" />
              <p className="text-[10px] font-bold text-textDim uppercase tracking-widest">Risk Score</p>
            </div>
            {riskScore != null ? (
              <>
                <p className={`text-xl font-black tabular-nums ${riskScore >= 75 ? "text-red" : riskScore >= 50 ? "text-yellow" : "text-green"}`}>
                  {riskScore}
                </p>
                <div className="h-1.5 bg-bg3 rounded-full overflow-hidden mt-1">
                  <div className={`h-full rounded-full ${riskScore >= 75 ? "bg-red" : riskScore >= 50 ? "bg-yellow" : "bg-green"}`}
                    style={{ width: `${riskScore}%` }} />
                </div>
              </>
            ) : (
              <p className="text-textDim text-sm">No risk data</p>
            )}
          </div>
        </div>

        {/* Recent transactions */}
        {txns.length > 0 && (
          <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
            <p className="text-[10px] font-bold text-textDim uppercase tracking-widest px-4 py-2.5 border-b border-border flex items-center gap-1.5">
              <Activity size={10} /> Recent Transactions
            </p>
            <div className="divide-y divide-border">
              {txns.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between px-4 py-2">
                  <div>
                    <p className="text-text text-xs font-semibold capitalize">{t.type}</p>
                    <p className="text-textDim text-[10px]">{t.reference}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xs font-bold ${t.status === "failed" ? "text-red" : "text-text"}`}>R {Number(t.amount).toFixed(2)}</p>
                    <p className={`text-[10px] ${t.status === "completed" ? "text-green" : t.status === "pending" ? "text-yellow" : "text-red"}`}>{t.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button onClick={user.is_active ? onBlock : onUnblock}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold transition-all ${
              user.is_active
                ? "bg-red/5 border-red/20 text-red hover:bg-red/10"
                : "bg-green/5 border-green/20 text-green hover:bg-green/10"
            }`}>
            {user.is_active ? <><ShieldOff size={13} /> Block Account</> : <><ShieldCheck size={13} /> Unblock Account</>}
          </button>
          <button onClick={user.flagged ? onUnflag : onFlag}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold transition-all ${
              user.flagged
                ? "bg-bg2 border-border text-textMuted hover:text-text"
                : "bg-yellow/5 border-yellow/20 text-yellow hover:bg-yellow/10"
            }`}>
            <Flag size={13} /> {user.flagged ? "Remove Flag" : "Flag Account"}
          </button>
          {hasPermission("reset_pin") && (
            <button onClick={onResetPin}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border text-xs font-bold text-textMuted hover:text-cyan hover:border-cyan/30 transition-all">
              <Key size={13} /> Reset PIN
            </button>
          )}
          {superAdmin && (
            <button onClick={onDelete}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red/20 text-xs font-bold text-red hover:bg-red/5 transition-all">
              <Trash2 size={13} /> Delete Account
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function UsersPage() {
  return (
    <Suspense fallback={<AdminShell title="User Management"><Spinner /></AdminShell>}>
      <UsersPageInner />
    </Suspense>
  );
}

function UsersPageInner() {
  const params = useSearchParams();
  const initialRole   = params.get("role") || "all";
  const initialSearch  = params.get("search") || "";

  const [users,       setUsers]       = useState<User[]>([]);
  const [riskMap,     setRiskMap]     = useState<Record<string, number>>({});
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState(initialSearch);
  const [query,       setQuery]       = useState(initialSearch);
  const [roleTab,     setRoleTab]     = useState(initialRole);
  const [statusTab,   setStatusTab]   = useState("all");
  const [provinceTab, setProvinceTab] = useState("all");
  const [countdown,   setCountdown]   = useState(60);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBlocking, setBulkBlocking] = useState(false);

  // Modals
  const [detailUser,  setDetailUser]  = useState<User | null>(null);
  const [blockModal,  setBlockModal]  = useState<User | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [flagModal,   setFlagModal]   = useState<User | null>(null);
  const [flagReason,  setFlagReason]  = useState("");
  const [pinModal,    setPinModal]    = useState<{ name: string; pin: string } | null>(null);
  const [unblockTarget, setUnblockTarget] = useState<User | null>(null);
  const [deleteTarget,  setDeleteTarget]  = useState<User | null>(null);
  const [bulkBlockConfirm, setBulkBlockConfirm] = useState(false);

  const superAdmin = isSuperAdmin();
  const dangerPin  = useDangerPin();
  const timerRef   = useRef<any>(null);

  // ── Load ──────────────────────────────────────────────────────────────
  const load = useCallback((q?: string) => {
    setLoading(true);
    Promise.allSettled([
      api.users(q ?? query),
      api.riskUsers(),
    ]).then(([usersR, riskR]) => {
      if (usersR.status === "fulfilled") setUsers(usersR.value.data);
      if (riskR.status === "fulfilled") {
        const m: Record<string, number> = {};
        riskR.value.data.forEach((r: any) => { m[r.user_id] = r.risk_score; });
        setRiskMap(m);
      }
    }).finally(() => setLoading(false));
  }, [query]);

  const refresh = useCallback(() => { load(); setCountdown(60); }, [load]);

  useEffect(() => { load(initialSearch); }, []);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown(c => { if (c <= 1) { refresh(); return 60; } return c - 1; });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [refresh]);

  // ── Client-side filtering ─────────────────────────────────────────────
  const filtered = useMemo(() => users.filter(u => {
    if (roleTab !== "all" && u.role !== roleTab) return false;
    if (statusTab === "active"  && !u.is_active)  return false;
    if (statusTab === "blocked" && u.is_active)   return false;
    if (statusTab === "flagged" && !u.flagged)    return false;
    if (provinceTab !== "all" && (u.province || "Unset") !== provinceTab) return false;
    return true;
  }), [users, roleTab, statusTab, provinceTab]);

  const stats = useMemo(() => ({
    total:      users.length,
    active:     users.filter(u => u.is_active).length,
    blocked:    users.filter(u => !u.is_active).length,
    flagged:    users.filter(u => u.flagged).length,
    passengers: users.filter(u => u.role === "passenger").length,
    drivers:    users.filter(u => u.role === "driver").length,
    owners:     users.filter(u => u.role === "owner").length,
  }), [users]);

  const statusCounts = useMemo(() => {
    const base = roleTab === "all" ? users : users.filter(u => u.role === roleTab);
    return {
      all:     base.length,
      active:  base.filter(u => u.is_active).length,
      blocked: base.filter(u => !u.is_active).length,
      flagged: base.filter(u => u.flagged).length,
    };
  }, [users, roleTab]);

  // ── Actions ────────────────────────────────────────────────────────────
  const doSearch = () => { setQuery(search); load(search); };

  const clearAll = () => {
    setSearch(""); setQuery(""); setRoleTab("all"); setStatusTab("all"); setProvinceTab("all");
    load("");
  };

  const handleBlock = async () => {
    if (!blockModal) return;
    const u = blockModal;
    try {
      await api.blockUser(u.id, blockReason || undefined);
      toast.success(`${u.full_name} blocked`);
      setBlockModal(null); setBlockReason(""); setDetailUser(null);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleUnblock = async (u: User) => {
    try {
      await api.unblockUser(u.id);
      toast.success(`${u.full_name} unblocked`);
      setUnblockTarget(null); setDetailUser(null);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleResetPin = async (u: User) => {
    try {
      const res = await api.resetPin(u.id);
      setPinModal({ name: u.full_name, pin: res.data.temporary_pin });
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleFlag = async () => {
    if (!flagModal || !flagReason.trim()) return;
    try {
      await api.flagUser(flagModal.id, flagReason.trim());
      toast.success(`${flagModal.full_name} flagged`);
      setFlagModal(null); setFlagReason(""); setDetailUser(null);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleUnflag = async (u: User) => {
    try {
      await api.unflagUser(u.id);
      toast.success("Account unflagged");
      setDetailUser(null); load();
    } catch (e: any) { toast.error(e.message); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const u = deleteTarget; setDeleteTarget(null);
    const token = await dangerPin.request();
    if (!token) return;
    try {
      const res = await fetch(`${BASE}/api/admin/users/${u.id}`, { method: "DELETE", headers: authH(token) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Delete failed");
      toast.success(`${u.full_name} deleted`);
      setDetailUser(null); load();
    } catch (e: any) { toast.error(e.message); }
  };

  const confirmBulkBlock = async () => {
    setBulkBlockConfirm(false); setBulkBlocking(true);
    let done = 0;
    for (const id of Array.from(selectedIds)) {
      try { await api.blockUser(id, "Bulk block action"); done++; } catch {}
    }
    toast.success(`${done} user${done !== 1 ? "s" : ""} blocked`);
    setSelectedIds(new Set()); setBulkBlocking(false); load();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(Array.from(prev));
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const allSelected = filtered.length > 0 && filtered.every(u => selectedIds.has(u.id));
  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(u => u.id)));
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <AdminShell title="User Management">
      <div className="space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <>
                <span className="text-cyan text-xs font-bold">{selectedIds.size} selected</span>
                <button onClick={() => setBulkBlockConfirm(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red border border-red/20 rounded-lg hover:bg-red/5 transition-all">
                  <ShieldOff size={11} /> Block All
                </button>
                <button onClick={() => setSelectedIds(new Set())}
                  className="text-textDim hover:text-textMuted text-xs flex items-center gap-1">
                  <X size={11} /> Deselect
                </button>
              </>
            )}
          </div>
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
            <button onClick={() => api.exportUsers().catch(() => toast.error("Export failed"))}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-textMuted hover:text-text border border-border rounded-lg transition-all">
              <Download size={12} /> Export CSV
            </button>
          </div>
        </div>

        {/* ── Stats strip ── */}
        <div className="grid grid-cols-3 md:grid-cols-7 gap-2">
          {[
            { label: "Total",       value: stats.total,      color: "text-text"   },
            { label: "Active",      value: stats.active,     color: "text-green"  },
            { label: "Blocked",     value: stats.blocked,    color: "text-red"    },
            { label: "Flagged",     value: stats.flagged,    color: "text-yellow" },
            { label: "Passengers",  value: stats.passengers, color: "text-cyan"   },
            { label: "Drivers",     value: stats.drivers,    color: "text-green"  },
            { label: "Owners",      value: stats.owners,     color: "text-purple" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-bg2 border border-border rounded-xl px-3 py-3 text-center">
              <p className={`text-xl font-black tabular-nums ${color}`}>{value.toLocaleString()}</p>
              <p className="text-[9px] font-bold text-textDim uppercase tracking-wider mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* ── Search bar ── */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-textDim" />
            <input
              placeholder="Search by name or phone number…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === "Enter" && doSearch()}
              className="w-full pl-9 pr-4 py-2 bg-bg2 border border-border rounded-lg text-sm text-text placeholder:text-textDim focus:outline-none focus:border-cyan/50 transition-colors"
            />
          </div>
          <Button onClick={doSearch}><Search size={13} /> Search</Button>
          <select
            value={provinceTab}
            onChange={e => setProvinceTab(e.target.value)}
            className="px-3 py-2 bg-bg2 border border-border rounded-lg text-xs font-bold text-textMuted focus:outline-none focus:border-cyan/50">
            <option value="all">All Provinces</option>
            {SA_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
            <option value="Unset">Unset</option>
          </select>
          {(query || roleTab !== "all" || statusTab !== "all" || provinceTab !== "all") && (
            <button onClick={clearAll}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-red border border-red/20 rounded-lg hover:bg-red/5 transition-all">
              <X size={12} /> Clear
            </button>
          )}
        </div>

        {/* ── Role tabs ── */}
        <div className="flex gap-1 border-b border-border overflow-x-auto">
          {([
            { id: "all",       label: `All (${stats.total})`,            icon: Users    },
            { id: "passenger", label: `Passengers (${stats.passengers})`, icon: Users    },
            { id: "driver",    label: `Drivers (${stats.drivers})`,       icon: UserCheck},
            { id: "owner",     label: `Owners (${stats.owners})`,         icon: Shield   },
          ] as const).map(t => (
            <button key={t.id} onClick={() => { setRoleTab(t.id); setStatusTab("all"); }}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
                roleTab === t.id ? "text-cyan border-cyan" : "text-textMuted border-transparent hover:text-text"
              }`}>
              <t.icon size={11} /> {t.label}
            </button>
          ))}
        </div>

        {/* ── Status tabs ── */}
        <div className="flex gap-1">
          {([
            { id: "all",     label: `All`,                             color: "" },
            { id: "active",  label: `Active (${statusCounts.active})`, color: "text-green" },
            { id: "blocked", label: `Blocked (${statusCounts.blocked})`, color: "text-red" },
            { id: "flagged", label: `Flagged (${statusCounts.flagged})`, color: "text-yellow" },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setStatusTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                statusTab === t.id
                  ? `${t.color || "text-cyan"} border-current bg-current/5`
                  : "text-textMuted border-border hover:text-text"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Showing counter ── */}
        <div className="flex items-center justify-between">
          <p className="text-textDim text-[10px]">
            Showing <span className="text-text font-bold">{filtered.length.toLocaleString()}</span> user{filtered.length !== 1 ? "s" : ""}
            {query && <span> matching "<span className="text-cyan">{query}</span>"</span>}
          </p>
        </div>

        {/* ── Table ── */}
        <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-bg3">
                  <th className="py-3 px-4 w-10">
                    <input type="checkbox" className="w-3.5 h-3.5 accent-cyan"
                      checked={allSelected} onChange={toggleAll} />
                  </th>
                  {["User", "Phone", "Role", "Province", "Status", "Risk", "Joined", ""].map(h => (
                    <th key={h} className="text-left py-3 px-4 text-[10px] font-bold text-textDim uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                  : filtered.length === 0
                  ? (
                    <tr>
                      <td colSpan={9} className="py-16 text-center text-textMuted text-sm">
                        No users match current filters
                      </td>
                    </tr>
                  )
                  : filtered.map(u => (
                    <tr key={u.id}
                      className={`border-b border-border transition-colors cursor-pointer hover:bg-bg3/50 ${
                        !u.is_active ? "bg-red/3" : u.flagged ? "bg-yellow/3" : ""
                      }`}
                      onClick={() => setDetailUser(u)}>

                      {/* Checkbox */}
                      <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" className="w-3.5 h-3.5 accent-cyan"
                          checked={selectedIds.has(u.id)}
                          onChange={() => toggleSelect(u.id)} />
                      </td>

                      {/* Avatar + name */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={u.full_name} size="sm" />
                          <div>
                            <p className="font-bold text-text text-xs">{u.full_name}</p>
                            <p className="font-mono text-[9px] text-textDim">{u.id.slice(0, 8)}…</p>
                          </div>
                          {u.flagged && <span className="text-yellow text-[9px] font-black">⚑</span>}
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="py-3 px-4 font-mono text-[11px] text-textMuted">{u.phone_number}</td>

                      {/* Role */}
                      <td className="py-3 px-4"><RolePill role={u.role} /></td>

                      {/* Province */}
                      <td className="py-3 px-4 text-textMuted text-[11px]">{u.province || "—"}</td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${
                          u.is_active ? "bg-green/10 border-green/20 text-green" : "bg-red/10 border-red/20 text-red"
                        }`}>
                          {u.is_active ? <UserCheck size={9} /> : <UserX size={9} />}
                          {u.is_active ? "Active" : "Blocked"}
                        </span>
                      </td>

                      {/* Risk */}
                      <td className="py-3 px-4">
                        <RiskBar score={riskMap[u.id]} />
                      </td>

                      {/* Joined */}
                      <td className="py-3 px-4 text-textDim whitespace-nowrap">{formatDate(u.created_at)}</td>

                      {/* Arrow */}
                      <td className="py-3 px-4">
                        <ChevronRight size={13} className="text-textDim" />
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ══ User detail modal ══ */}
      {detailUser && (
        <UserDetailModal
          user={detailUser}
          riskScore={riskMap[detailUser.id]}
          onClose={() => setDetailUser(null)}
          onBlock={() => { setBlockModal(detailUser); setDetailUser(null); }}
          onUnblock={() => { setUnblockTarget(detailUser); setDetailUser(null); }}
          onFlag={() => { setFlagModal(detailUser); setDetailUser(null); }}
          onUnflag={() => handleUnflag(detailUser)}
          onResetPin={() => { handleResetPin(detailUser); setDetailUser(null); }}
          onDelete={() => { setDeleteTarget(detailUser); setDetailUser(null); }}
          superAdmin={superAdmin}
        />
      )}

      {/* ══ Block modal ══ */}
      <Modal open={!!blockModal} onClose={() => { setBlockModal(null); setBlockReason(""); }}
        title={`Block ${blockModal?.full_name}`}>
        <div className="space-y-4">
          <p className="text-textMuted text-sm">Select a reason for blocking this account.</p>
          <div className="flex flex-wrap gap-2">
            {BLOCK_REASONS.map(r => (
              <button key={r} onClick={() => setBlockReason(r)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${blockReason === r ? "bg-red/10 text-red border-red/20" : "text-textMuted border-border hover:border-red/30"}`}>
                {r}
              </button>
            ))}
          </div>
          <Input placeholder="Or type a custom reason…" value={blockReason} onChange={e => setBlockReason(e.target.value)} />
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => { setBlockModal(null); setBlockReason(""); }}>Cancel</Button>
            <Button variant="danger" onClick={handleBlock}><ShieldOff size={12} /> Block Account</Button>
          </div>
        </div>
      </Modal>

      {/* ══ Flag modal ══ */}
      <Modal open={!!flagModal} onClose={() => { setFlagModal(null); setFlagReason(""); }}
        title={`Flag ${flagModal?.full_name}`}>
        <div className="space-y-4">
          <p className="text-textMuted text-sm">Select a preset or enter a custom reason.</p>
          <div className="flex flex-wrap gap-2">
            {FLAG_PRESETS.map(p => (
              <button key={p} onClick={() => setFlagReason(p)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${flagReason === p ? "bg-yellow/10 text-yellow border-yellow/20" : "text-textMuted border-border hover:border-yellow/30"}`}>
                {p}
              </button>
            ))}
          </div>
          <Input placeholder="Custom reason…" value={flagReason} onChange={e => setFlagReason(e.target.value)} />
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => { setFlagModal(null); setFlagReason(""); }}>Cancel</Button>
            <Button variant="danger" onClick={handleFlag}><Flag size={12} /> Flag Account</Button>
          </div>
        </div>
      </Modal>

      {/* ══ PIN modal ══ */}
      <Modal open={!!pinModal} onClose={() => setPinModal(null)} title="Temporary PIN">
        <div className="space-y-4">
          <p className="text-textMuted text-sm">
            Share this PIN with <strong className="text-text">{pinModal?.name}</strong>. They must change it immediately after logging in.
          </p>
          <div className="bg-bg border border-cyan/20 rounded-xl p-6 text-center">
            <span className="text-cyan font-mono text-4xl font-black tracking-[0.5em]">{pinModal?.pin}</span>
          </div>
          <div className="flex gap-3">
            <Button className="flex-1 justify-center"
              onClick={() => { navigator.clipboard.writeText(pinModal?.pin || ""); toast.success("PIN copied!"); }}>
              <Copy size={13} /> Copy PIN
            </Button>
            <Button variant="secondary" className="flex-1 justify-center" onClick={() => setPinModal(null)}>Done</Button>
          </div>
          <p className="text-xs text-red text-center font-semibold">This PIN is shown only once.</p>
        </div>
      </Modal>

      {/* ══ Unblock confirm ══ */}
      <Modal open={!!unblockTarget} onClose={() => setUnblockTarget(null)}
        title={`Unblock ${unblockTarget?.full_name}`}>
        <div className="space-y-4">
          <p className="text-textMuted text-sm">This will restore full platform access. The user will be able to log in and transact again.</p>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setUnblockTarget(null)}>Cancel</Button>
            <Button onClick={() => unblockTarget && handleUnblock(unblockTarget)}>
              <ShieldCheck size={12} /> Unblock Account
            </Button>
          </div>
        </div>
      </Modal>

      {/* ══ Delete confirm ══ */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.full_name}`}>
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red/5 border border-red/20 rounded-xl">
            <AlertTriangle size={15} className="text-red flex-shrink-0 mt-0.5" />
            <p className="text-red text-sm">This is <strong>permanent and irreversible</strong>. All user data, wallet balance, and history will be deleted. You will be required to enter your Danger PIN.</p>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={confirmDelete}><Trash2 size={12} /> Delete Account</Button>
          </div>
        </div>
      </Modal>

      {/* ══ Bulk block confirm ══ */}
      <Modal open={bulkBlockConfirm} onClose={() => setBulkBlockConfirm(false)}
        title={`Block ${selectedIds.size} Users`}>
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red/5 border border-red/20 rounded-xl">
            <AlertTriangle size={15} className="text-red flex-shrink-0 mt-0.5" />
            <p className="text-red text-sm">You are about to block <strong>{selectedIds.size} user{selectedIds.size !== 1 ? "s" : ""}</strong>. They will immediately lose platform access.</p>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setBulkBlockConfirm(false)}>Cancel</Button>
            <Button variant="danger" onClick={confirmBulkBlock} loading={bulkBlocking}>
              <ShieldOff size={12} /> Block {selectedIds.size} Users
            </Button>
          </div>
        </div>
      </Modal>

      <DangerPinModal
        open={dangerPin.open}
        onSuccess={dangerPin.handleSuccess}
        onCancel={dangerPin.handleCancel}
        actionLabel="delete this user"
      />
    </AdminShell>
  );
}
