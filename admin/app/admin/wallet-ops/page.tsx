"use client";
import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Button, Spinner, Modal, Input } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  Banknote, Lock, Unlock, PlusCircle, MinusCircle, X, Search,
  Download, RefreshCw, AlertCircle, History, ArrowUpRight,
  ArrowDownLeft, ExternalLink, SortAsc, SortDesc, ArrowUpDown,
  Zap, Shield, Activity, User, Clock, CheckCircle, SendHorizontal,
} from "lucide-react";
import toast from "react-hot-toast";
import Link from "next/link";
import { api, WalletEntry, Transaction, isSuperAdmin, hasPermission } from "@/lib/api";
import { DangerPinModal, useDangerPin } from "@/components/DangerPinModal";

// ── Types ──────────────────────────────────────────────────────────
type RoleFilter = "all" | "driver" | "passenger" | "owner";
type SortField  = "balance" | "name" | "updated";
type SortDir    = "asc" | "desc";

const FREEZE_PRESETS = [
  "Suspicious activity",
  "Fraud investigation",
  "Compliance hold",
  "User requested freeze",
  "Chargeback risk",
  "Account verification required",
];

function txTone(type: string) {
  if (["payment", "ride", "topup"].includes(type)) return "green";
  if (["withdrawal", "cashup", "pay_fuel"].includes(type)) return "yellow";
  if (type === "adjustment") return "purple";
  return "cyan";
}

const ROLE_COLOR: Record<string, string> = {
  driver:    "bg-green/20 text-green border-green/20",
  passenger: "bg-cyan/20 text-cyan border-cyan/20",
  owner:     "bg-purple/20 text-purple border-purple/20",
};

const ROLE_AVATAR: Record<string, string> = {
  driver:    "bg-green/15 text-green",
  passenger: "bg-cyan/15 text-cyan",
  owner:     "bg-purple/15 text-purple",
};

function WalletAvatar({ name, role }: { name: string; role: string }) {
  const initials = name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black shrink-0 ${ROLE_AVATAR[role] || "bg-bg3 text-textMuted"}`}>
      {initials}
    </div>
  );
}

// ── Auto-refresh hook ──────────────────────────────────────────────
const AUTO_REFRESH_S = 60;
function useAutoRefresh(fn: () => void, active: boolean) {
  const [countdown, setCountdown] = useState(AUTO_REFRESH_S);
  useEffect(() => {
    if (!active) { setCountdown(AUTO_REFRESH_S); return; }
    const id = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { fn(); return AUTO_REFRESH_S; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [active, fn]);
  return countdown;
}

// ══════════════════════════════════════════════════════════════════
export default function WalletOpsPage() {
  const [allWallets, setAllWallets] = useState<WalletEntry[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [autoRefreshOn, setAutoRefreshOn] = useState(false);

  // Search — debounced 300ms
  const [searchInput, setSearchInput] = useState("");
  const [search,      setSearch]      = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const onSearchInput = (v: string) => {
    setSearchInput(v);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(v), 300);
  };

  // Filters & sort
  const [filterFrozen, setFilterFrozen] = useState<"all" | "frozen" | "active">("all");
  const [filterRole,   setFilterRole]   = useState<RoleFilter>("all");
  const [sortField,    setSortField]    = useState<SortField>("balance");
  const [sortDir,      setSortDir]      = useState<SortDir>("desc");

  // Action tracking — prevents double-clicks
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Modals
  const [selected,           setSelected]          = useState<WalletEntry | null>(null);
  const [adjustModal,        setAdjustModal]       = useState(false);
  const [freezeModal,        setFreezeModal]       = useState(false);
  const [txModal,            setTxModal]           = useState(false);
  const [bulkUnfreezeModal,  setBulkUnfreezeModal] = useState(false);
  const [transferModal,      setTransferModal]     = useState(false);

  // Freeze form
  const [freezeReason, setFreezeReason] = useState("");

  // Adjust form
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNote,   setAdjustNote]   = useState("");
  const [adjustType,   setAdjustType]   = useState<"credit" | "debit">("credit");

  // Tx history
  const [txLoading, setTxLoading] = useState(false);
  const [walletTxns, setWalletTxns] = useState<Transaction[]>([]);

  // Transfer form (superadmin)
  const [txfrToQuery,   setTxfrToQuery]  = useState("");
  const [txfrTo,        setTxfrTo]       = useState<WalletEntry | null>(null);
  const [txfrAmount,    setTxfrAmount]   = useState("");
  const [txfrNote,      setTxfrNote]     = useState("");

  const dangerPin = useDangerPin();
  const canAdjust = hasPermission("adjust_balance");
  const superAdmin = isSuperAdmin();

  // ── Load ────────────────────────────────────────────────────────
  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.wallets()
      .then(r => setAllWallets(r.data))
      .catch((e: Error) => {
        setError(e.message);
        toast.error(`Wallet load failed: ${e.message}`);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const countdown = useAutoRefresh(load, autoRefreshOn);

  // ── Derived lists ────────────────────────────────────────────────
  const wallets = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = allWallets.filter(w => {
      const matchSearch =
        !q ||
        w.full_name.toLowerCase().includes(q) ||
        w.phone_number.includes(q) ||
        w.role.toLowerCase().includes(q);
      const matchFrozen =
        filterFrozen === "all" ||
        (filterFrozen === "frozen" && w.is_frozen) ||
        (filterFrozen === "active" && !w.is_frozen);
      const matchRole = filterRole === "all" || w.role === filterRole;
      return matchSearch && matchFrozen && matchRole;
    });
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === "balance") cmp = a.balance - b.balance;
      else if (sortField === "name") cmp = a.full_name.localeCompare(b.full_name);
      else cmp = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [allWallets, search, filterFrozen, filterRole, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) =>
    sortField === field
      ? sortDir === "desc" ? <SortDesc size={11} className="text-cyan" /> : <SortAsc size={11} className="text-cyan" />
      : <ArrowUpDown size={11} className="text-textDim" />;

  // ── Aggregate stats ──────────────────────────────────────────────
  const totalBalance   = allWallets.reduce((s, w) => s + w.balance, 0);
  const frozenList     = allWallets.filter(w => w.is_frozen);
  const frozenBalance  = frozenList.reduce((s, w) => s + w.balance, 0);
  const activeCount    = allWallets.length - frozenList.length;
  const roleTotal      = (role: string) => allWallets.filter(w => w.role === role).reduce((s, w) => s + w.balance, 0);
  const roleCount      = (role: string) => allWallets.filter(w => w.role === role).length;

  // ── Freeze / Unfreeze ────────────────────────────────────────────
  const toggleFreeze = async (w: WalletEntry) => {
    if (w.is_frozen) {
      const token = await dangerPin.request();
      if (!token) return;
      setActionLoading(`${w.user_id}_unfreeze`);
      try {
        await api.unfreezeWalletAdmin(w.user_id);
        toast.success(`${w.full_name}'s wallet unfrozen`);
        load();
      } catch (e: any) { toast.error(e.message); }
      finally { setActionLoading(null); }
    } else {
      setSelected(w);
      setFreezeReason("");
      setFreezeModal(true);
    }
  };

  const confirmFreeze = async () => {
    if (!freezeReason.trim()) { toast.error("Provide a freeze reason"); return; }
    const token = await dangerPin.request();
    if (!token) return;
    setActionLoading(`${selected!.user_id}_freeze`);
    try {
      await api.freezeWalletAdmin(selected!.user_id, freezeReason);
      toast.success(`${selected!.full_name}'s wallet frozen`);
      setFreezeModal(false);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setActionLoading(null); }
  };

  // ── Adjust ───────────────────────────────────────────────────────
  const handleAdjust = async () => {
    const amt = parseFloat(adjustAmount);
    if (isNaN(amt) || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (!adjustNote.trim())     { toast.error("Provide a reason"); return; }
    if (adjustType === "debit" && amt > (selected?.balance ?? 0)) {
      toast.error(`Cannot debit more than current balance (${formatZAR(selected?.balance ?? 0)})`);
      return;
    }
    const token = await dangerPin.request();
    if (!token) return;
    setActionLoading(`${selected!.user_id}_adjust`);
    try {
      const finalAmt = adjustType === "debit" ? -amt : amt;
      const res = await api.adjustWallet(selected!.user_id, finalAmt, adjustNote);
      toast.success(`${adjustType === "credit" ? "Credited" : "Debited"} ${formatZAR(amt)} — Ref: ${res.data.reference}`);
      setAdjustModal(false);
      setAdjustAmount("");
      setAdjustNote("");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setActionLoading(null); }
  };

  // ── Tx History ───────────────────────────────────────────────────
  const openTxHistory = async (w: WalletEntry) => {
    setSelected(w);
    setWalletTxns([]);
    setTxModal(true);
    setTxLoading(true);
    try {
      const res = await api.transactions({ user_id: w.user_id });
      setWalletTxns(res.data.slice(0, 50));
    } catch (e: any) {
      toast.error(`Transactions failed: ${e.message}`);
    } finally {
      setTxLoading(false);
    }
  };

  // ── Bulk Unfreeze ─────────────────────────────────────────────────
  const doBulkUnfreeze = async () => {
    setBulkUnfreezeModal(false);
    const token = await dangerPin.request();
    if (!token) return;
    setActionLoading("bulk");
    let done = 0;
    for (const w of frozenList) {
      try { await api.unfreezeWalletAdmin(w.user_id); done++; } catch {}
    }
    setActionLoading(null);
    toast.success(`${done}/${frozenList.length} wallets unfrozen`);
    load();
  };

  // ── Transfer funds (superadmin) ──────────────────────────────────
  const handleTransfer = async () => {
    if (!selected || !txfrTo) { toast.error("Select source and destination"); return; }
    if (selected.user_id === txfrTo.user_id) { toast.error("Source and destination must differ"); return; }
    const amt = parseFloat(txfrAmount);
    if (isNaN(amt) || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (amt > selected.balance)  { toast.error(`Insufficient balance: ${formatZAR(selected.balance)}`); return; }
    const token = await dangerPin.request();
    if (!token) return;
    setActionLoading("transfer");
    try {
      const res = await api.transferFunds({ from_user_id: selected.user_id, to_user_id: txfrTo.user_id, amount: amt, note: txfrNote || undefined }, token);
      toast.success(`Transferred ${formatZAR(amt)} — Ref: ${res.data.reference}`);
      setTransferModal(false);
      setTxfrTo(null); setTxfrToQuery(""); setTxfrAmount(""); setTxfrNote("");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setActionLoading(null); }
  };

  // ── CSV Export ───────────────────────────────────────────────────
  const exportCsv = () => {
    const rows = [
      ["Name", "Phone", "Role", "Balance", "Status", "Freeze Reason", "Last Updated"],
      ...wallets.map(w => [
        w.full_name, w.phone_number, w.role,
        formatZAR(w.balance),
        w.is_frozen ? "Frozen" : "Active",
        w.frozen_reason || "",
        formatDate(w.updated_at),
      ]),
    ];
    const csv  = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `wallets-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${wallets.length} wallets`);
  };

  // ── Adjust preview ────────────────────────────────────────────────
  const adjAmt      = parseFloat(adjustAmount) || 0;
  const adjOverdraft = adjustType === "debit" && adjAmt > (selected?.balance ?? 0);
  const previewBal   = selected
    ? (adjustType === "credit" ? selected.balance + adjAmt : selected.balance - adjAmt)
    : 0;

  // ── Transfer "to" wallet suggestions ─────────────────────────────
  const txfrSuggestions = useMemo(() => {
    const q = txfrToQuery.toLowerCase().trim();
    if (!q || q.length < 2) return [];
    return allWallets
      .filter(w => w.user_id !== selected?.user_id && (
        w.full_name.toLowerCase().includes(q) || w.phone_number.includes(q)
      ))
      .slice(0, 8);
  }, [allWallets, txfrToQuery, selected]);

  // ══════════════════════════════════════════════════════════════
  return (
    <AdminShell title="Wallet Operations">
      <div className="space-y-6">

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {[
            { label: "Total Wallets",   value: allWallets.length.toString(),        color: "text-text",  sub: "" },
            { label: "System AUM",      value: formatZAR(totalBalance),             color: "text-green", sub: "" },
            { label: "Frozen",          value: frozenList.length.toString(),         color: frozenList.length > 0 ? "text-red" : "text-textDim", sub: frozenList.length > 0 ? `${formatZAR(frozenBalance)} locked` : "None frozen" },
            { label: "Active Wallets",  value: activeCount.toString(),              color: "text-cyan",  sub: "" },
            { label: "Drivers AUM",     value: formatZAR(roleTotal("driver")),      color: "text-green", sub: `${roleCount("driver")} drivers` },
            { label: "Passengers AUM",  value: formatZAR(roleTotal("passenger")),   color: "text-cyan",  sub: `${roleCount("passenger")} passengers` },
          ].map(s => (
            <div key={s.label} className="bg-bg2 border border-border rounded-xl p-4">
              <p className="text-[9px] font-bold text-textDim uppercase tracking-wider mb-1">{s.label}</p>
              <p className={`text-xl font-black tabular-nums ${s.color}`}>{s.value}</p>
              {s.sub && <p className="text-[10px] text-textDim mt-0.5">{s.sub}</p>}
            </div>
          ))}
        </div>

        {/* ── Frozen alert banner ── */}
        {frozenList.length > 0 && (
          <div className="flex items-center justify-between p-4 bg-red/5 border border-red/20 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-red/10 flex items-center justify-center shrink-0">
                <Lock size={15} className="text-red" />
              </div>
              <div>
                <p className="text-red text-sm font-bold">
                  {frozenList.length} wallet{frozenList.length !== 1 ? "s" : ""} frozen
                </p>
                <p className="text-textMuted text-xs">{formatZAR(frozenBalance)} total locked</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setFilterFrozen("frozen")}>
                <Lock size={13} /> View Frozen
              </Button>
              <Button variant="danger" onClick={() => setBulkUnfreezeModal(true)} disabled={actionLoading === "bulk"}>
                {actionLoading === "bulk"
                  ? <RefreshCw size={13} className="animate-spin" />
                  : <Unlock size={13} />}
                Bulk Unfreeze
              </Button>
            </div>
          </div>
        )}

        <Card>
          {/* ── Toolbar ── */}
          <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-cyanDim flex items-center justify-center">
                <Banknote size={15} className="text-cyan" />
              </div>
              <h2 className="text-text font-bold">Wallet Management</h2>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              {/* Search */}
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-textDim pointer-events-none" />
                <input
                  placeholder="Search name, phone, role…"
                  value={searchInput}
                  onChange={e => onSearchInput(e.target.value)}
                  className="bg-bg border border-border rounded-lg pl-8 pr-8 py-2 text-text text-sm focus:outline-none focus:border-cyan placeholder:text-textDim w-56"
                />
                {searchInput && (
                  <button
                    onClick={() => { setSearchInput(""); setSearch(""); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-textDim hover:text-text"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Frozen filter */}
              <div className="flex gap-1">
                {(["all", "active", "frozen"] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilterFrozen(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all capitalize ${
                      filterFrozen === f
                        ? f === "frozen"
                          ? "bg-red/10 text-red border-red/20"
                          : "bg-cyanDim text-cyan border-cyan/20"
                        : "bg-bg3 text-textMuted border-border hover:text-text"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>

              {/* Auto-refresh */}
              <button
                onClick={() => setAutoRefreshOn(v => !v)}
                title={autoRefreshOn ? `Auto-refresh in ${countdown}s — click to pause` : "Enable auto-refresh"}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                  autoRefreshOn
                    ? "bg-green/10 text-green border-green/20"
                    : "bg-bg3 text-textMuted border-border hover:text-text"
                }`}
              >
                <Activity size={12} />
                {autoRefreshOn ? `${countdown}s` : "Live"}
              </button>

              <Button variant="secondary" onClick={load} title="Refresh now">
                <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
              </Button>
              <Button variant="secondary" onClick={exportCsv} disabled={wallets.length === 0}>
                <Download size={13} /> Export
              </Button>
            </div>
          </div>

          {/* ── Role tabs ── */}
          <div className="flex gap-1 mb-4 border-b border-border pb-3 flex-wrap">
            {([
              { value: "all"       as RoleFilter, label: "All",        count: allWallets.length,    bal: totalBalance },
              { value: "driver"    as RoleFilter, label: "Drivers",    count: roleCount("driver"),  bal: roleTotal("driver") },
              { value: "passenger" as RoleFilter, label: "Passengers", count: roleCount("passenger"), bal: roleTotal("passenger") },
              { value: "owner"     as RoleFilter, label: "Owners",     count: roleCount("owner"),   bal: roleTotal("owner") },
            ]).map(({ value, label, count, bal }) => (
              <button
                key={value}
                onClick={() => setFilterRole(value)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                  filterRole === value
                    ? "bg-cyanDim text-cyan border-cyan/20"
                    : "bg-bg3 text-textMuted border-border hover:text-text"
                }`}
              >
                {label} ({count}) · {formatZAR(bal)}
              </button>
            ))}
          </div>

          {/* ── Count label ── */}
          <p className="text-xs text-textMuted mb-3">
            {loading
              ? "Loading…"
              : `${wallets.length} of ${allWallets.length} wallet${allWallets.length !== 1 ? "s" : ""}`}
          </p>

          {/* ── Content ── */}
          {loading ? (
            <div className="py-16 flex flex-col items-center gap-3">
              <Spinner />
              <p className="text-textMuted text-sm">Loading wallets…</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <div className="w-14 h-14 rounded-full bg-red/10 flex items-center justify-center">
                <AlertCircle size={24} className="text-red" />
              </div>
              <div>
                <p className="text-red font-bold text-sm">{error}</p>
                <p className="text-textMuted text-xs mt-1 max-w-xs">
                  {error.toLowerCase().includes("permission")
                    ? "Your account needs manage_users or freeze_wallet permission."
                    : error.toLowerCase().includes("network")
                    ? "Could not reach the server. Check your internet connection or backend status."
                    : "An unexpected error occurred. Try refreshing."}
                </p>
              </div>
              <Button variant="secondary" onClick={load}>
                <RefreshCw size={13} /> Retry
              </Button>
            </div>
          ) : wallets.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-2 text-center">
              <div className="w-14 h-14 rounded-full bg-bg3 flex items-center justify-center">
                <User size={22} className="text-textDim" />
              </div>
              <p className="text-text text-sm font-medium">No wallets found</p>
              <p className="text-textMuted text-xs">
                {search || filterFrozen !== "all" || filterRole !== "all"
                  ? "Try clearing your filters"
                  : "No wallet entries exist yet"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="border-b border-border">
                    {[
                      { label: "User",    field: "name"    as SortField },
                      { label: "Role",    field: null },
                      { label: "Balance", field: "balance" as SortField },
                      { label: "Status",  field: null },
                      { label: "Updated", field: "updated" as SortField },
                      { label: "Actions", field: null },
                    ].map(col => (
                      <th
                        key={col.label}
                        onClick={() => col.field && toggleSort(col.field)}
                        className={`text-left text-[10px] font-bold uppercase tracking-widest text-textMuted px-3 py-2.5 ${col.field ? "cursor-pointer hover:text-text select-none" : ""}`}
                      >
                        <span className="flex items-center gap-1">
                          {col.label}
                          {col.field && <SortIcon field={col.field} />}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {wallets.map(w => {
                    const isActing = !!actionLoading?.startsWith(w.user_id);
                    return (
                      <tr
                        key={w.user_id}
                        className="border-b border-border/50 hover:bg-bg2/60 transition-colors group"
                      >
                        {/* User */}
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <WalletAvatar name={w.full_name} role={w.role} />
                            <div>
                              <p className="font-semibold text-sm text-text">{w.full_name}</p>
                              <p className="text-[10px] text-textMuted font-mono">{w.phone_number}</p>
                            </div>
                          </div>
                        </td>

                        {/* Role */}
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border capitalize ${ROLE_COLOR[w.role] || "bg-bg3 text-textMuted border-border"}`}>
                            {w.role}
                          </span>
                        </td>

                        {/* Balance */}
                        <td className="px-3 py-3">
                          <span className={`font-black text-base ${w.is_frozen ? "text-textDim line-through" : "text-green"}`}>
                            {formatZAR(w.balance)}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-3 py-3">
                          {w.is_frozen ? (
                            <div>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border bg-red/10 text-red border-red/20">
                                <Lock size={9} /> frozen
                              </span>
                              {w.frozen_reason && (
                                <p
                                  className="text-[10px] text-textMuted mt-0.5 max-w-[140px] truncate"
                                  title={w.frozen_reason}
                                >
                                  {w.frozen_reason}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border bg-green/10 text-green border-green/20">
                              <CheckCircle size={9} /> active
                            </span>
                          )}
                        </td>

                        {/* Updated */}
                        <td className="px-3 py-3 text-textMuted text-xs whitespace-nowrap">
                          {formatDate(w.updated_at)}
                        </td>

                        {/* Actions */}
                        <td className="px-3 py-3">
                          <div className="flex gap-1.5 flex-wrap">
                            {/* History */}
                            <button
                              onClick={() => openTxHistory(w)}
                              title="Transaction history"
                              className="p-1.5 rounded-lg bg-bg3 hover:bg-cyanDim hover:text-cyan text-textMuted transition-colors border border-border hover:border-cyan/20"
                            >
                              <History size={13} />
                            </button>

                            {/* Support link */}
                            <Link href={`/admin/support?q=${encodeURIComponent(w.phone_number)}`}>
                              <button
                                title="View in Support"
                                className="p-1.5 rounded-lg bg-bg3 hover:bg-bg2 text-textMuted transition-colors border border-border"
                              >
                                <ExternalLink size={13} />
                              </button>
                            </Link>

                            {/* Freeze / Unfreeze */}
                            <button
                              onClick={() => toggleFreeze(w)}
                              title={w.is_frozen ? "Unfreeze wallet" : "Freeze wallet"}
                              disabled={isActing}
                              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors disabled:opacity-50 ${
                                w.is_frozen
                                  ? "bg-green/10 text-green border-green/20 hover:bg-green/20"
                                  : "bg-red/10 text-red border-red/20 hover:bg-red/20"
                              }`}
                            >
                              {isActing && actionLoading?.includes("_unfreeze") ? (
                                <RefreshCw size={11} className="animate-spin" />
                              ) : w.is_frozen ? (
                                <Unlock size={11} />
                              ) : (
                                <Lock size={11} />
                              )}
                              {w.is_frozen ? "Unfreeze" : "Freeze"}
                            </button>

                            {/* Adjust (requires adjust_balance perm) */}
                            {canAdjust && (
                              <button
                                onClick={() => {
                                  setSelected(w);
                                  setAdjustModal(true);
                                  setAdjustAmount("");
                                  setAdjustNote("");
                                  setAdjustType("credit");
                                }}
                                disabled={isActing}
                                title="Adjust balance"
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-border bg-bg3 hover:bg-cyanDim hover:text-cyan text-textMuted transition-colors disabled:opacity-50"
                              >
                                <PlusCircle size={11} /> Adjust
                              </button>
                            )}

                            {/* Transfer (superadmin only) */}
                            {superAdmin && (
                              <button
                                onClick={() => {
                                  setSelected(w);
                                  setTxfrTo(null);
                                  setTxfrToQuery("");
                                  setTxfrAmount("");
                                  setTxfrNote("");
                                  setTransferModal(true);
                                }}
                                disabled={isActing}
                                title="Transfer funds"
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-purple/20 bg-purple/10 hover:bg-purple/20 text-purple transition-colors disabled:opacity-50"
                              >
                                <SendHorizontal size={11} /> Transfer
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* ════════════════════════════════════════════════════
          FREEZE MODAL
      ════════════════════════════════════════════════════ */}
      <Modal open={freezeModal} onClose={() => setFreezeModal(false)}
        title={`Freeze ${selected?.full_name}'s Wallet`}>
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-bg3 rounded-xl border border-border">
            {selected && <WalletAvatar name={selected.full_name} role={selected.role} />}
            <div>
              <p className="text-text text-sm font-bold">{selected?.full_name}</p>
              <p className="text-textMuted text-xs">{selected?.phone_number} · {formatZAR(selected?.balance)}</p>
            </div>
          </div>
          <p className="text-textMuted text-sm">
            All transactions on this wallet will be blocked until unfrozen. A freeze reason is required for the audit trail.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {FREEZE_PRESETS.map(p => (
              <button
                key={p}
                onClick={() => setFreezeReason(p)}
                className={`text-[10px] px-2.5 py-1 rounded-md border transition-all ${
                  freezeReason === p
                    ? "bg-red/10 text-red border-red/20"
                    : "bg-bg3 text-textMuted border-border hover:text-text"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
              Freeze Reason *
            </label>
            <Input
              placeholder="Describe the reason for freezing…"
              value={freezeReason}
              onChange={e => setFreezeReason(e.target.value)}
            />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setFreezeModal(false)}>Cancel</Button>
            <Button variant="danger" onClick={confirmFreeze} disabled={!!actionLoading || !freezeReason.trim()}>
              {actionLoading?.endsWith("_freeze")
                ? <RefreshCw size={13} className="animate-spin" />
                : <Lock size={13} />}
              Freeze Wallet
            </Button>
          </div>
        </div>
      </Modal>

      {/* ════════════════════════════════════════════════════
          ADJUST MODAL
      ════════════════════════════════════════════════════ */}
      <Modal open={adjustModal} onClose={() => setAdjustModal(false)}
        title={`Adjust Balance — ${selected?.full_name}`}>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-bg3 rounded-xl border border-border">
            <div className="flex items-center gap-3">
              {selected && <WalletAvatar name={selected.full_name} role={selected.role} />}
              <div>
                <p className="text-text text-sm font-bold">{selected?.full_name}</p>
                <p className="text-textMuted text-xs">{selected?.phone_number}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-textMuted uppercase tracking-widest">Current balance</p>
              <p className="text-green font-black text-lg">{selected && formatZAR(selected.balance)}</p>
            </div>
          </div>

          {/* Credit / Debit toggle */}
          <div className="flex gap-3">
            {(["credit", "debit"] as const).map(t => (
              <button
                key={t}
                onClick={() => setAdjustType(t)}
                className={`flex-1 py-2.5 rounded-xl border text-sm font-bold capitalize transition-all flex items-center justify-center gap-1.5 ${
                  adjustType === t
                    ? t === "credit"
                      ? "bg-green/10 text-green border-green/20"
                      : "bg-red/10 text-red border-red/20"
                    : "bg-bg3 text-textMuted border-border hover:text-text"
                }`}
              >
                {t === "credit"
                  ? <><PlusCircle size={14} /> Credit</>
                  : <><MinusCircle size={14} /> Debit</>}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Amount (ZAR) *</label>
            <Input
              type="number" step="0.01" min="0" placeholder="0.00"
              value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Reason *</label>
            <Input
              placeholder="Reason for adjustment (logged in audit trail)…"
              value={adjustNote} onChange={e => setAdjustNote(e.target.value)}
            />
          </div>

          {adjAmt > 0 && (
            <div className={`flex items-center justify-between p-3 rounded-xl border ${
              adjOverdraft ? "bg-red/5 border-red/20" : "bg-bg3 border-border"
            }`}>
              <span className="text-textMuted text-xs">New balance after {adjustType}</span>
              <span className={`font-black text-lg ${adjOverdraft ? "text-red" : adjustType === "credit" ? "text-green" : "text-yellow"}`}>
                {formatZAR(Math.max(0, previewBal))}
              </span>
            </div>
          )}
          {adjOverdraft && (
            <p className="text-xs text-red flex items-center gap-1.5">
              <AlertCircle size={12} /> Debit exceeds current balance — blocked
            </p>
          )}

          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setAdjustModal(false)}>Cancel</Button>
            <Button onClick={handleAdjust} disabled={!!actionLoading || adjOverdraft || !adjustNote.trim() || adjAmt <= 0}>
              {actionLoading?.endsWith("_adjust")
                ? <RefreshCw size={13} className="animate-spin" />
                : adjustType === "credit" ? <PlusCircle size={13} /> : <MinusCircle size={13} />}
              {adjustType === "credit" ? "Credit" : "Debit"} Wallet
            </Button>
          </div>
        </div>
      </Modal>

      {/* ════════════════════════════════════════════════════
          TX HISTORY MODAL
      ════════════════════════════════════════════════════ */}
      <Modal open={txModal} onClose={() => setTxModal(false)}
        title={`Transactions — ${selected?.full_name}`}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-textMuted">Last 50 transactions</p>
            {selected && (
              <span className="text-xs font-bold text-green">{formatZAR(selected.balance)} balance</span>
            )}
          </div>
          {txLoading ? (
            <div className="py-10 flex flex-col items-center gap-2">
              <Spinner />
              <p className="text-textMuted text-xs">Loading transactions…</p>
            </div>
          ) : walletTxns.length === 0 ? (
            <p className="text-center text-textMuted text-sm py-10">No transactions found</p>
          ) : (
            <div className="space-y-1.5 max-h-[440px] overflow-y-auto pr-1">
              {walletTxns.map(t => {
                const isDebit  = t.sender_id === selected?.user_id;
                const isCredit = t.receiver_id === selected?.user_id ||
                  (!t.sender_id && !t.receiver_id && ["topup", "adjustment"].includes(t.type));
                return (
                  <div key={t.id} className="flex items-center justify-between bg-bg3 rounded-xl px-3 py-2.5 gap-3 border border-border/40">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${
                          t.type === "payment" || t.type === "ride" ? "bg-green/10 text-green border-green/20"
                          : t.type === "withdrawal" ? "bg-yellow/10 text-yellow border-yellow/20"
                          : t.type === "adjustment" ? "bg-purple/10 text-purple border-purple/20"
                          : "bg-cyan/10 text-cyan border-cyan/20"
                        }`}>
                          {t.type}
                        </span>
                        <span className="text-[10px] font-mono text-textDim truncate">{t.reference}</span>
                      </div>
                      {t.note && <p className="text-[10px] text-textMuted mt-0.5 truncate">{t.note}</p>}
                      <p className="text-[10px] text-textDim mt-0.5">{formatDate(t.created_at)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-bold text-sm flex items-center justify-end gap-0.5 ${
                        t.status !== "completed" ? "text-textMuted"
                        : isDebit  ? "text-red"
                        : "text-green"
                      }`}>
                        {t.status === "completed" && (isDebit ? <ArrowUpRight size={12} /> : isCredit ? <ArrowDownLeft size={12} /> : null)}
                        {isDebit ? "−" : isCredit ? "+" : ""}{formatZAR(t.amount)}
                      </p>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${
                        t.status === "completed" ? "bg-green/10 text-green border-green/20"
                        : t.status === "pending"   ? "bg-yellow/10 text-yellow border-yellow/20"
                        : "bg-red/10 text-red border-red/20"
                      }`}>
                        {t.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex justify-between items-center pt-1 border-t border-border">
            <Link
              href={selected ? `/admin/support?q=${encodeURIComponent(selected.phone_number)}` : "#"}
              className="text-xs text-cyan hover:underline flex items-center gap-1"
            >
              <ExternalLink size={11} /> Full profile
            </Link>
            <Button variant="secondary" onClick={() => setTxModal(false)}>Close</Button>
          </div>
        </div>
      </Modal>

      {/* ════════════════════════════════════════════════════
          BULK UNFREEZE MODAL
      ════════════════════════════════════════════════════ */}
      <Modal open={bulkUnfreezeModal} onClose={() => setBulkUnfreezeModal(false)} title="Bulk Unfreeze Wallets">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-yellow/5 border border-yellow/20 rounded-xl">
            <AlertCircle size={16} className="text-yellow shrink-0 mt-0.5" />
            <div>
              <p className="text-yellow text-sm font-bold">
                Unfreeze {frozenList.length} frozen wallet{frozenList.length !== 1 ? "s" : ""}?
              </p>
              <p className="text-textMuted text-xs mt-1">
                {formatZAR(frozenBalance)} in locked funds will immediately become accessible. PIN confirmation required.
              </p>
            </div>
          </div>
          <div className="max-h-32 overflow-y-auto space-y-1 bg-bg3 rounded-xl p-2 border border-border">
            {frozenList.map(w => (
              <div key={w.user_id} className="flex justify-between items-center text-xs px-2 py-1">
                <span className="text-text font-medium">{w.full_name}</span>
                <span className="text-textMuted">{formatZAR(w.balance)}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setBulkUnfreezeModal(false)}>Cancel</Button>
            <Button onClick={doBulkUnfreeze} disabled={actionLoading === "bulk"}>
              {actionLoading === "bulk"
                ? <RefreshCw size={13} className="animate-spin" />
                : <Unlock size={13} />}
              Unfreeze All ({frozenList.length})
            </Button>
          </div>
        </div>
      </Modal>

      {/* ════════════════════════════════════════════════════
          TRANSFER FUNDS MODAL (superadmin only)
      ════════════════════════════════════════════════════ */}
      <Modal open={transferModal} onClose={() => setTransferModal(false)} title="Transfer Funds">
        <div className="space-y-4">
          {/* From */}
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">From</label>
            <div className="flex items-center gap-3 p-3 bg-bg3 rounded-xl border border-border">
              {selected && <WalletAvatar name={selected.full_name} role={selected.role} />}
              <div>
                <p className="text-text text-sm font-bold">{selected?.full_name}</p>
                <p className="text-textMuted text-xs">{selected?.phone_number} · {formatZAR(selected?.balance)}</p>
              </div>
            </div>
          </div>

          {/* To — searchable */}
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">To *</label>
            {txfrTo ? (
              <div className="flex items-center justify-between p-3 bg-green/5 rounded-xl border border-green/20">
                <div className="flex items-center gap-3">
                  <WalletAvatar name={txfrTo.full_name} role={txfrTo.role} />
                  <div>
                    <p className="text-text text-sm font-bold">{txfrTo.full_name}</p>
                    <p className="text-textMuted text-xs">{txfrTo.phone_number}</p>
                  </div>
                </div>
                <button onClick={() => { setTxfrTo(null); setTxfrToQuery(""); }} className="text-textMuted hover:text-text">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-textDim pointer-events-none" />
                <input
                  value={txfrToQuery}
                  onChange={e => setTxfrToQuery(e.target.value)}
                  placeholder="Search recipient by name or phone…"
                  className="w-full bg-bg border border-border rounded-lg pl-8 pr-3 py-2.5 text-text text-sm focus:outline-none focus:border-cyan placeholder:text-textDim"
                />
                {txfrSuggestions.length > 0 && (
                  <div className="absolute z-10 top-full mt-1 w-full bg-bg2 border border-border rounded-xl shadow-xl overflow-hidden">
                    {txfrSuggestions.map(s => (
                      <button
                        key={s.user_id}
                        onClick={() => { setTxfrTo(s); setTxfrToQuery(""); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-bg3 transition-colors text-left border-b border-border/50 last:border-0"
                      >
                        <WalletAvatar name={s.full_name} role={s.role} />
                        <div>
                          <p className="text-text text-sm font-medium">{s.full_name}</p>
                          <p className="text-textMuted text-xs">{s.phone_number} · {formatZAR(s.balance)}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Amount (ZAR) *</label>
            <Input
              type="number" step="0.01" min="0" placeholder="0.00"
              value={txfrAmount} onChange={e => setTxfrAmount(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Note (optional)</label>
            <Input
              placeholder="Reason for transfer…"
              value={txfrNote} onChange={e => setTxfrNote(e.target.value)}
            />
          </div>

          {txfrTo && parseFloat(txfrAmount) > 0 && (
            <div className="flex items-center justify-between p-3 bg-bg3 rounded-xl border border-border text-sm">
              <span className="text-textMuted text-xs">
                {selected?.full_name} → {txfrTo.full_name}
              </span>
              <span className="font-black text-purple">{formatZAR(parseFloat(txfrAmount) || 0)}</span>
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setTransferModal(false)}>Cancel</Button>
            <Button
              onClick={handleTransfer}
              disabled={actionLoading === "transfer" || !txfrTo || parseFloat(txfrAmount) <= 0}
              className="bg-purple/10 text-purple border-purple/20 hover:bg-purple/20"
            >
              {actionLoading === "transfer"
                ? <RefreshCw size={13} className="animate-spin" />
                : <SendHorizontal size={13} />}
              Transfer Funds
            </Button>
          </div>
        </div>
      </Modal>

      <DangerPinModal
        open={dangerPin.open}
        onSuccess={dangerPin.handleSuccess}
        onCancel={dangerPin.handleCancel}
        actionLabel="perform this wallet operation"
      />
    </AdminShell>
  );
}
