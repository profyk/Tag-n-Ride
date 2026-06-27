"use client";
import { useState, useEffect, useMemo } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Button, Spinner, Card, Input, Select, Modal } from "@/components/ui";
import { api, Withdrawal, hasPermission } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import { CheckCircle, XCircle, Snowflake, Zap, RefreshCw, AlertTriangle, Search, X, Download, Settings, Save, ShieldCheck, Fuel } from "lucide-react";
import toast from "react-hot-toast";
import { isSuperAdmin } from "@/lib/api";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

// ── Payout Settings Panel ─────────────────────────────────────────────────────
function PayoutSettingsPanel() {
  const canEdit = hasPermission("edit_fees") || isSuperAdmin();
  const [open, setOpen] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [requireApproval, setRequireApproval] = useState(true);
  const [autoApproveLimit, setAutoApproveLimit] = useState("0");
  const [payFuelEnabled, setPayFuelEnabled] = useState(true);
  const [payFuelMaxPerTxn, setPayFuelMaxPerTxn] = useState("500");
  const [payFuelDailyLimit, setPayFuelDailyLimit] = useState("1000");

  const loadSettings = async () => {
    setLoadingSettings(true);
    try {
      const res = await fetch(`${BASE}/api/admin/payout-settings`, { headers: authHeaders() });
      const data = await res.json();
      setRequireApproval(data.require_approval ?? true);
      setAutoApproveLimit(String(data.auto_approve_limit ?? 0));
      setPayFuelEnabled(data.pay_fuel_enabled ?? true);
      setPayFuelMaxPerTxn(String(data.pay_fuel_max_per_txn ?? 500));
      setPayFuelDailyLimit(String(data.pay_fuel_daily_limit ?? 1000));
    } catch { toast.error("Failed to load payout settings"); }
    finally { setLoadingSettings(false); }
  };

  useEffect(() => { if (open) loadSettings(); }, [open]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/admin/payout-settings`, {
        method: "PATCH", headers: authHeaders(),
        body: JSON.stringify({
          require_approval: requireApproval,
          auto_approve_limit: parseFloat(autoApproveLimit) || 0,
          pay_fuel_enabled: payFuelEnabled,
          pay_fuel_max_per_txn: parseFloat(payFuelMaxPerTxn) || 0,
          pay_fuel_daily_limit: parseFloat(payFuelDailyLimit) || 0,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Failed");
      toast.success("Payout settings saved");
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
      <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-bg3 transition-colors" onClick={() => setOpen(o => !o)}>
        <div className="flex items-center gap-2.5">
          <Settings size={14} className="text-cyan" />
          <span className="text-text font-semibold text-sm">Payout Settings</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ml-2 ${requireApproval ? "text-yellow bg-yellow/10 border-yellow/20" : "text-green bg-green/10 border-green/20"}`}>
            {requireApproval ? "Manual Approval On" : "Auto-Approve On"}
          </span>
        </div>
        <span className="text-textDim text-xs">{open ? "▲ Hide" : "▼ Configure"}</span>
      </button>
      {open && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
          {loadingSettings ? <div className="py-4 flex justify-center"><div className="w-5 h-5 border-2 border-cyan border-t-transparent rounded-full animate-spin" /></div> : (
            <>
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-3">
                  <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest flex items-center gap-1.5"><ShieldCheck size={11} className="text-cyan" /> Approval Gate</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-text">Require Admin Approval</p>
                      <p className="text-xs text-textMuted">Payouts queue before EFT</p>
                    </div>
                    <button disabled={!canEdit} onClick={() => setRequireApproval(v => !v)}
                      className={`relative w-10 h-5 rounded-full transition-colors ${requireApproval ? "bg-yellow" : "bg-green"} disabled:opacity-40`}>
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${requireApproval ? "left-0.5" : "left-5"}`} />
                    </button>
                  </div>
                  <div>
                    <label className="text-xs text-textMuted block mb-1">Auto-Approve up to (R) — 0 = off</label>
                    <Input type="number" min="0" value={autoApproveLimit} onChange={e => setAutoApproveLimit(e.target.value)} disabled={!canEdit} placeholder="0" />
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest flex items-center gap-1.5"><Fuel size={11} className="text-orange-400" /> Pay Fuel Limits</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-text">Pay Fuel Enabled</p>
                      <p className="text-xs text-textMuted">Instant fuel withdrawals</p>
                    </div>
                    <button disabled={!canEdit} onClick={() => setPayFuelEnabled(v => !v)}
                      className={`relative w-10 h-5 rounded-full transition-colors ${payFuelEnabled ? "bg-green" : "bg-red"} disabled:opacity-40`}>
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${payFuelEnabled ? "left-5" : "left-0.5"}`} />
                    </button>
                  </div>
                  <div>
                    <label className="text-xs text-textMuted block mb-1">Max per txn (R)</label>
                    <Input type="number" min="0" value={payFuelMaxPerTxn} onChange={e => setPayFuelMaxPerTxn(e.target.value)} disabled={!canEdit} placeholder="500" />
                  </div>
                  <div>
                    <label className="text-xs text-textMuted block mb-1">Daily limit per driver (R)</label>
                    <Input type="number" min="0" value={payFuelDailyLimit} onChange={e => setPayFuelDailyLimit(e.target.value)} disabled={!canEdit} placeholder="1000" />
                  </div>
                </div>
              </div>
              {canEdit ? (
                <div className="flex justify-end border-t border-border pt-3">
                  <Button onClick={save} disabled={saving}><Save size={12} /> {saving ? "Saving…" : "Save Settings"}</Button>
                </div>
              ) : (
                <p className="text-xs text-textDim text-center">Finance / CEO / Superadmin permission required to edit.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const W_STATUS_CLS: Record<string, string> = {
  approved:      "bg-green/10 border-green/20 text-green",
  paid:          "bg-green/10 border-green/20 text-green",
  completed:     "bg-green/10 border-green/20 text-green",
  pending:       "bg-yellow/10 border-yellow/20 text-yellow",
  processing:    "bg-yellow/10 border-yellow/20 text-yellow",
  rejected:      "bg-red/10 border-red/20 text-red",
  failed:        "bg-red/10 border-red/20 text-red",
  payout_failed: "bg-red/10 border-red/20 text-red",
};

export default function WithdrawalsPage() {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "payout_failed" | "paid" | "all">("pending");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [minAmt, setMinAmt] = useState("");
  const [maxAmt, setMaxAmt] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "largest">("oldest");
  const [processing, setProcessing] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"withdrawals" | "payouts" | "settings">("withdrawals");
  const [payoutSearch, setPayoutSearch] = useState("");
  const [payoutStatus, setPayoutStatus] = useState("all");
  const [payoutFrom, setPayoutFrom] = useState("");
  const [payoutTo, setPayoutTo] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);
  const [approveConfirm, setApproveConfirm] = useState<Withdrawal | null>(null);
  const [rejectConfirm, setRejectConfirm] = useState<Withdrawal | null>(null);
  const [retryConfirm, setRetryConfirm] = useState<string | null>(null);
  const [bulkApproveModal, setBulkApproveModal] = useState(false);
  const superAdmin = isSuperAdmin();
  const canApprove = hasPermission("approve_withdrawals");
  const canLarge = hasPermission("large_withdrawals");

  const load = async () => {
    setLoading(true);
    try {
      const [w, p] = await Promise.all([
        api.withdrawals().then(r => r.data),
        fetch(`${BASE}/api/admin/payouts`, { headers: authHeaders() }).then(r => r.json()),
      ]);
      setWithdrawals(w);
      setPayouts(Array.isArray(p) ? p : []);
    } catch (e) {}
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleApprove = (w: Withdrawal) => {
    if (w.amount > 10000 && !canLarge) {
      toast.error("Withdrawals over R10,000 require Finance/CFO/CEO approval");
      return;
    }
    setApproveConfirm(w);
  };

  const doApprove = async () => {
    if (!approveConfirm) return;
    const w = approveConfirm;
    setApproveConfirm(null);
    const PAYOUT_FEE = 3.50;
    const net = w.amount - PAYOUT_FEE;
    setProcessing(w.id);
    try {
      const res = await fetch(`${BASE}/api/admin/withdraw/${w.id}/approve/v2`, {
        method: "POST", headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Approval failed");
      if (data.error) toast.error(`Approved but payout failed: ${data.error}. Use retry button.`);
      else if (data.sandbox) toast.success(`Approved! Sandbox payout of ${formatZAR(net)} simulated ✓`);
      else toast.success(`Approved! ${formatZAR(net)} sent instantly to driver's bank ⚡`);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setProcessing(null); }
  };

  const handleReject = (w: Withdrawal) => { setRejectConfirm(w); };
  const doReject = async () => {
    if (!rejectConfirm) return;
    const w = rejectConfirm; setRejectConfirm(null);
    try {
      await api.rejectWithdrawal(w.id);
      toast.success("Withdrawal rejected and refunded to wallet");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleRetry = (withdrawalId: string) => { setRetryConfirm(withdrawalId); };
  const doRetry = async () => {
    if (!retryConfirm) return;
    const wId = retryConfirm; setRetryConfirm(null);
    setProcessing(wId);
    try {
      const res = await fetch(`${BASE}/api/admin/withdraw/${wId}/retry-payout`, {
        method: "POST", headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Retry failed");
      toast.success("Payout retry initiated");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setProcessing(null); }
  };

  const openBulkApprove = () => {
    const pending = filteredAndSorted.filter(w => selected.has(w.id) && w.status === "pending");
    if (!pending.length) { toast.error("No pending withdrawals selected"); return; }
    setBulkApproveModal(true);
  };

  const doBulkApprove = async () => {
    const pending = filteredAndSorted.filter(w => selected.has(w.id) && w.status === "pending");
    setBulkApproveModal(false);
    setBulkApproving(true);
    let done = 0;
    const failed: { name: string; reason: string }[] = [];
    for (const w of pending) {
      try {
        const res = await fetch(`${BASE}/api/admin/withdraw/${w.id}/approve/v2`, {
          method: "POST", headers: authHeaders(),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          failed.push({ name: w.user_name || w.id, reason: d.detail || `HTTP ${res.status}` });
          continue;
        }
        done++;
      } catch (e: any) {
        failed.push({ name: w.user_name || w.id, reason: "Network error" });
      }
    }
    setBulkApproving(false);
    setSelected(new Set());
    if (done > 0) toast.success(`${done}/${pending.length} approved ⚡`);
    if (failed.length > 0) {
      const names = failed.slice(0, 3).map(f => `${f.name} (${f.reason})`).join(", ");
      toast.error(`${failed.length} failed: ${names}${failed.length > 3 ? ` +${failed.length - 3} more` : ""}`, { duration: 10000 });
    }
    load();
  };

  const filteredAndSorted = useMemo(() => {
    let list = withdrawals.filter(w => {
      if (filter !== "all" && w.status !== filter) return false;
      if (search && !w.user_name?.toLowerCase().includes(search.toLowerCase()) && !w.phone_number?.includes(search)) return false;
      if (from && new Date(w.created_at) < new Date(from)) return false;
      if (to && new Date(w.created_at) > new Date(to + "T23:59:59")) return false;
      if (minAmt && w.amount < parseFloat(minAmt)) return false;
      if (maxAmt && w.amount > parseFloat(maxAmt)) return false;
      return true;
    });
    if (sortBy === "oldest") list = [...list].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    else if (sortBy === "newest") list = [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    else if (sortBy === "largest") list = [...list].sort((a, b) => b.amount - a.amount);
    return list;
  }, [withdrawals, filter, search, from, to, minAmt, sortBy]);

  const pendingCount = withdrawals.filter(w => w.status === "pending").length;
  const pendingTotal = withdrawals.filter(w => w.status === "pending").reduce((s, w) => s + w.amount, 0);
  const failedCount = withdrawals.filter(w => w.status === "payout_failed").length;
  const selectedPending = filteredAndSorted.filter(w => selected.has(w.id) && w.status === "pending");

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const pendingIds = filteredAndSorted.filter(w => w.status === "pending").map(w => w.id);
    if (pendingIds.every(id => selected.has(id))) setSelected(new Set());
    else setSelected(new Set(pendingIds));
  };

  const exportCsv = () => {
    const rows = [
      ["Driver", "Phone", "Amount", "Net", "Bank", "Account", "Status", "Date"],
      ...filteredAndSorted.map(w => [
        w.user_name || "", w.phone_number || "",
        formatZAR(w.amount), formatZAR(w.amount - 3.5),
        w.bank_name || "", w.account_number || "",
        w.status, formatDate(w.created_at),
      ]),
    ];
    const csv = rows.map(r => r.map((c: string | number) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "withdrawals.csv"; a.click();
    URL.revokeObjectURL(url); toast.success("Exported");
  };

  return (
    <AdminShell title="Withdrawals & Payouts">
      <div className="space-y-4">

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="text-center">
            <p className="text-xl font-extrabold text-yellow">{pendingCount}</p>
            <p className="text-xs text-textMuted mt-1">Pending</p>
            <p className="text-xs font-bold text-yellow mt-1">{formatZAR(pendingTotal)}</p>
          </Card>
          <Card className="text-center">
            <p className="text-xl font-extrabold text-green">
              {withdrawals.filter(w => w.status === "approved" || w.status === "paid").length}
            </p>
            <p className="text-xs text-textMuted mt-1">Approved / Paid</p>
          </Card>
          <Card className="text-center">
            <p className="text-xl font-extrabold text-red">{withdrawals.filter(w => w.status === "rejected").length}</p>
            <p className="text-xs text-textMuted mt-1">Rejected</p>
          </Card>
          <Card className={`text-center ${failedCount > 0 ? "border-red/30" : ""}`}>
            <p className={`text-xl font-extrabold ${failedCount > 0 ? "text-red" : "text-textMuted"}`}>{failedCount}</p>
            <p className="text-xs text-textMuted mt-1">Payout Failed</p>
            {failedCount > 0 && <p className="text-[10px] text-red font-bold mt-1">NEEDS ATTENTION</p>}
          </Card>
        </div>

        {/* Payout fee notice */}
        <div className="flex items-center gap-2 p-3 bg-cyan/5 border border-cyan/20 rounded-xl">
          <Zap size={14} className="text-cyan flex-shrink-0" />
          <p className="text-cyan text-xs font-medium">
            Instant Stitch payouts active — R3.50 fee deducted per withdrawal. Money arrives within seconds.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border pb-2">
          {[
            { key: "withdrawals", label: `Withdrawal Requests${pendingCount > 0 ? ` (${pendingCount})` : ""}` },
            { key: "payouts", label: `Payout History (${payouts.length})` },
            { key: "settings", label: "⚙ Payout Settings" },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key as any)}
              className={`px-4 py-2 text-sm font-bold rounded-t-lg transition-all ${
                activeTab === t.key ? "text-cyan border-b-2 border-cyan" : "text-textMuted hover:text-text"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === "withdrawals" && (
          <>
            {/* Filters */}
            <div className="space-y-3">
              <div className="flex gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <Input
                    placeholder="Search driver name or phone..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36" />
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36" />
                <Input type="number" placeholder="Min amount" value={minAmt} onChange={(e) => setMinAmt(e.target.value)} className="w-32" />
                <Input type="number" placeholder="Max amount" value={maxAmt} onChange={(e) => setMaxAmt(e.target.value)} className="w-32" />
                <Select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="w-36">
                  <option value="oldest">Oldest first</option>
                  <option value="newest">Newest first</option>
                  <option value="largest">Largest first</option>
                </Select>
                {(search || from || to || minAmt || maxAmt) && (
                  <Button variant="ghost" onClick={() => { setSearch(""); setFrom(""); setTo(""); setMinAmt(""); setMaxAmt(""); }}>
                    <X size={13} /> Clear
                  </Button>
                )}
              </div>

              <div className="flex items-center justify-between">
                <div className="flex gap-2 flex-wrap">
                  {(["pending", "approved", "paid", "payout_failed", "rejected", "all"] as const).map(f => (
                    <button key={f} onClick={() => { setFilter(f); setSelected(new Set()); }}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all capitalize ${
                        filter === f ? "bg-cyanDim text-cyan border-cyan/20" : "bg-bg2 text-textMuted border-border hover:text-text"
                      }`}>
                      {f.replace("_", " ")}
                      {f === "payout_failed" && failedCount > 0 && (
                        <span className="ml-1 bg-red text-white rounded-full px-1.5 py-0.5 text-[9px]">{failedCount}</span>
                      )}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 items-center">
                  {canApprove && filter === "pending" && filteredAndSorted.length > 0 && (
                    <Button
                      variant="secondary"
                      onClick={openBulkApprove}
                      loading={bulkApproving}
                      disabled={selectedPending.length === 0}>
                      <Zap size={13} className="text-cyan" />
                      Approve Selected ({selectedPending.length})
                    </Button>
                  )}
                  <Button variant="secondary" onClick={exportCsv}>
                    <Download size={13} /> Export
                  </Button>
                </div>
              </div>
            </div>

            {loading ? <Spinner /> : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-bg3/60">
                      {canApprove && filter === "pending" && (
                        <th className="py-2.5 px-4">
                          <input
                            type="checkbox"
                            className="w-3.5 h-3.5 accent-cyan"
                            checked={filteredAndSorted.filter(w => w.status === "pending").length > 0 &&
                              filteredAndSorted.filter(w => w.status === "pending").every(w => selected.has(w.id))}
                            onChange={toggleSelectAll}
                            title="Select all pending"
                          />
                        </th>
                      )}
                      {["Driver", "Phone", "Amount", "Net Payout", "Bank", "Account", "Wallet", "Status", "Date", "Actions"].map(h => (
                        <th key={h} className="py-2.5 px-4 text-left text-[10px] font-extrabold text-textDim uppercase tracking-widest whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAndSorted.length === 0 ? (
                      <tr><td colSpan={canApprove && filter === "pending" ? 11 : 10} className="py-10 text-center text-textMuted text-sm">No records found</td></tr>
                    ) : filteredAndSorted.map(w => (
                      <tr key={w.id} className="border-b border-border/50 hover:bg-bg3/40 transition-colors">
                        {canApprove && filter === "pending" && (
                          <td className="py-3 px-4">
                            {w.status === "pending" && (
                              <input
                                type="checkbox"
                                checked={selected.has(w.id)}
                                onChange={() => toggleSelect(w.id)}
                                className="w-3.5 h-3.5 accent-cyan"
                              />
                            )}
                          </td>
                        )}
                        <td className="py-3 px-4 font-semibold text-text text-xs">{w.user_name || "—"}</td>
                        <td className="py-3 px-4 font-mono text-xs text-textMuted">{w.phone_number || "—"}</td>
                        <td className="py-3 px-4">
                          <span className={`font-bold text-xs ${w.amount > 10000 ? "text-red" : "text-text"}`}>
                            {formatZAR(w.amount)}
                            {w.amount > 10000 && !canLarge && (
                              <span className="ml-1 text-[9px] text-red block">FINANCE REQ</span>
                            )}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-green font-bold text-xs">{formatZAR(w.amount - 3.50)}</span>
                          <span className="text-textDim text-[10px] block">after R3.50 fee</span>
                        </td>
                        <td className="py-3 px-4 text-textMuted text-xs">{w.bank_name}</td>
                        <td className="py-3 px-4 font-mono text-xs text-textMuted">{w.account_number}</td>
                        <td className="py-3 px-4 text-xs">
                          {w.wallet_balance !== undefined ? (
                            <span className={w.is_frozen ? "text-red" : "text-green"}>
                              {formatZAR(w.wallet_balance)}
                              {w.is_frozen && <Snowflake size={10} className="inline ml-1" />}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold ${W_STATUS_CLS[w.status] || "bg-bg3 border-border text-textDim"}`}>
                            {w.status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-textMuted text-xs">{formatDate(w.created_at)}</td>
                        <td className="py-3 px-4">
                          {w.status === "pending" && canApprove && (
                            <div className="flex gap-1.5">
                              <Button variant="secondary" onClick={() => handleApprove(w)} loading={processing === w.id}>
                                <Zap size={12} className="text-cyan" /> Pay Now
                              </Button>
                              <Button variant="danger" onClick={() => handleReject(w)}>
                                <XCircle size={12} /> Reject
                              </Button>
                            </div>
                          )}
                          {w.status === "payout_failed" && canApprove && (
                            <Button variant="secondary" onClick={() => handleRetry(w.id)} loading={processing === w.id}>
                              <RefreshCw size={12} /> Retry
                            </Button>
                          )}
                          {w.status === "payout_failed" && (
                            <div className="flex items-center gap-1 mt-1">
                              <AlertTriangle size={10} className="text-red" />
                              <span className="text-[10px] text-red">Payout failed</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {activeTab === "payouts" && (() => {
          const filteredPayouts = payouts.filter(p => {
            if (payoutStatus !== "all" && p.status !== payoutStatus) return false;
            if (payoutSearch) {
              const q = payoutSearch.toLowerCase();
              if (!p.driver_name?.toLowerCase().includes(q) && !p.phone_number?.includes(q)) return false;
            }
            if (payoutFrom && new Date(p.initiated_at || p.created_at) < new Date(payoutFrom)) return false;
            if (payoutTo && new Date(p.initiated_at || p.created_at) > new Date(payoutTo + "T23:59:59")) return false;
            return true;
          });
          const totalPaidOut = filteredPayouts.filter(p => p.status === "completed" || p.status === "paid").reduce((s: number, p: any) => s + (p.net_amount ?? p.amount), 0);
          return (
            <div className="space-y-3">
              <div className="flex gap-3 flex-wrap items-center">
                <Input placeholder="Search driver or phone..." value={payoutSearch} onChange={e => setPayoutSearch(e.target.value)} className="flex-1 min-w-0" />
                <Input type="date" value={payoutFrom} onChange={e => setPayoutFrom(e.target.value)} className="w-36" />
                <span className="text-textDim text-xs">to</span>
                <Input type="date" value={payoutTo} onChange={e => setPayoutTo(e.target.value)} className="w-36" />
                {(payoutSearch || payoutFrom || payoutTo) && (
                  <Button variant="ghost" onClick={() => { setPayoutSearch(""); setPayoutFrom(""); setPayoutTo(""); }}><X size={13} /> Clear</Button>
                )}
              </div>
              <div className="flex items-center justify-between">
                <div className="flex gap-2 flex-wrap">
                  {["all", "completed", "paid", "pending", "failed"].map(s => (
                    <button key={s} onClick={() => setPayoutStatus(s)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all capitalize ${payoutStatus === s ? "bg-cyanDim text-cyan border-cyan/20" : "bg-bg2 text-textMuted border-border hover:text-text"}`}>
                      {s}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-textMuted">{filteredPayouts.length} payouts · {formatZAR(totalPaidOut)} paid</span>
              </div>
              {loading ? <Spinner /> : filteredPayouts.length === 0 ? (
                <div className="text-center py-12 text-textMuted text-sm">No payouts found</div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-border bg-bg3/60">
                        {["Driver", "Phone", "Requested", "Fee", "Net Paid", "Bank", "Account", "Status", "Stitch ID", "Date"].map(h => (
                          <th key={h} className="py-2.5 px-4 text-left text-[10px] font-extrabold text-textDim uppercase tracking-widest whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPayouts.map((p: any) => (
                        <tr key={p.id} className="border-b border-border/50 hover:bg-bg3/40 transition-colors">
                          <td className="py-3 px-4 font-semibold text-text text-xs">{p.driver_name || "—"}</td>
                          <td className="py-3 px-4 font-mono text-xs text-textMuted">{p.phone_number || "—"}</td>
                          <td className="py-3 px-4 font-bold text-text text-xs">{formatZAR(p.amount)}</td>
                          <td className="py-3 px-4 text-red text-xs">R{(p.fee ?? 0).toFixed(2)}</td>
                          <td className="py-3 px-4 text-green font-bold text-xs">{formatZAR(p.net_amount ?? p.amount)}</td>
                          <td className="py-3 px-4 text-textMuted text-xs">{p.bank_name || "—"}</td>
                          <td className="py-3 px-4 font-mono text-xs text-textMuted">{p.account_number || "—"}</td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold ${W_STATUS_CLS[p.status] || "bg-bg3 border-border text-textDim"}`}>
                              {p.status}
                            </span>
                            {p.failure_reason && <p className="text-[10px] text-red mt-0.5">{p.failure_reason}</p>}
                          </td>
                          <td className="py-3 px-4"><span className="font-mono text-[10px] text-textDim">{p.stitch_disbursement_id?.slice(0, 16) || "—"}</span></td>
                          <td className="py-3 px-4 text-textMuted text-xs">{formatDate(p.initiated_at || p.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}

        {activeTab === "settings" && <PayoutSettingsPanel />}
      </div>

      {/* Approve Confirmation Modal */}
      <Modal open={!!approveConfirm} onClose={() => setApproveConfirm(null)} title="Approve Payout">
        {approveConfirm && (() => {
          const PAYOUT_FEE = 3.50;
          const net = approveConfirm.amount - PAYOUT_FEE;
          return (
            <div className="space-y-4">
              <div className="bg-bg border border-border rounded-xl divide-y divide-border">
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-textMuted text-sm">Driver</span>
                  <span className="text-text font-semibold">{approveConfirm.user_name}</span>
                </div>
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-textMuted text-sm">Requested</span>
                  <span className="text-text font-bold">{formatZAR(approveConfirm.amount)}</span>
                </div>
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-textMuted text-sm">Payout fee</span>
                  <span className="text-red font-semibold">- R{PAYOUT_FEE.toFixed(2)}</span>
                </div>
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-textMuted text-sm">Driver receives</span>
                  <span className="text-green font-extrabold text-lg">{formatZAR(net)}</span>
                </div>
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-textMuted text-sm">Bank</span>
                  <span className="text-textMuted text-xs font-mono">{approveConfirm.bank_name} · {approveConfirm.account_number}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 bg-cyan/5 border border-cyan/20 rounded-xl">
                <Zap size={13} className="text-cyan flex-shrink-0" />
                <p className="text-cyan text-xs font-medium">Money will be sent instantly via Stitch</p>
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setApproveConfirm(null)}>Cancel</Button>
                <Button onClick={doApprove} loading={!!processing}>
                  <Zap size={13} /> Pay {formatZAR(net)}
                </Button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Reject Confirmation Modal */}
      <Modal open={!!rejectConfirm} onClose={() => setRejectConfirm(null)} title="Reject Withdrawal">
        {rejectConfirm && (
          <div className="space-y-4">
            <p className="text-textMuted text-sm">
              Reject withdrawal of{" "}
              <span className="text-text font-bold">{formatZAR(rejectConfirm.amount)}</span>{" "}
              for <span className="text-text font-bold">{rejectConfirm.user_name}</span>?
              The full amount will be refunded to their wallet.
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => setRejectConfirm(null)}>Cancel</Button>
              <Button variant="danger" onClick={doReject}>
                <XCircle size={13} /> Reject & Refund
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Retry Confirmation Modal */}
      <Modal open={!!retryConfirm} onClose={() => setRetryConfirm(null)} title="Retry Payout">
        <div className="space-y-4">
          <p className="text-textMuted text-sm">Retry the Stitch payout for this withdrawal? The same bank account will be used.</p>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setRetryConfirm(null)}>Cancel</Button>
            <Button onClick={doRetry} loading={!!processing}>
              <RefreshCw size={13} /> Retry Payout
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk Approve Confirmation Modal */}
      <Modal open={bulkApproveModal} onClose={() => setBulkApproveModal(false)} title="Bulk Approve Payouts">
        <div className="space-y-4">
          <p className="text-textMuted text-sm">
            Approve{" "}
            <span className="text-cyan font-bold">{selectedPending.length} withdrawal{selectedPending.length !== 1 ? "s" : ""}</span>{" "}
            totalling{" "}
            <span className="text-cyan font-bold">{formatZAR(selectedPending.reduce((s, w) => s + w.amount, 0))}</span>?
          </p>
          <div className="flex items-center gap-2 p-3 bg-cyan/5 border border-cyan/20 rounded-xl">
            <Zap size={13} className="text-cyan flex-shrink-0" />
            <p className="text-cyan text-xs">Money will be sent instantly via Stitch. R3.50 fee is deducted per payout.</p>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setBulkApproveModal(false)}>Cancel</Button>
            <Button onClick={doBulkApprove} loading={bulkApproving}>
              <Zap size={13} /> Approve All {selectedPending.length}
            </Button>
          </div>
        </div>
      </Modal>

    </AdminShell>
  );
}
