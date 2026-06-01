"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import { Table, Tr, Td, Badge, Button, Spinner, Card, Input, Select } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import { Download, RefreshCw, ArrowRight, X, Zap, AlertTriangle, CheckCircle, Settings, Save, ShieldCheck, Fuel } from "lucide-react";
import toast from "react-hot-toast";
import { getToken, hasPermission } from "@/lib/api";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${getToken()}`,
});

function statusTone(s: string) {
  if (s === "completed" || s === "paid" || s === "success") return "green";
  if (s === "pending" || s === "processing") return "yellow";
  if (s === "failed" || s === "payout_failed") return "red";
  return "muted";
}

// ── Payout Settings Panel ─────────────────────────────────────────────────────

function PayoutSettingsPanel() {
  const canEdit = hasPermission("edit_system");
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

  useEffect(() => { loadSettings(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/admin/payout-settings`, {
        method: "PATCH",
        headers: authHeaders(),
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
    <div className="bg-bg2 border border-border rounded-2xl overflow-hidden">
      {/* Header — always visible */}
      <button
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-bg3 transition-colors"
        onClick={() => setOpen(o => !o)}>
        <div className="flex items-center gap-2.5">
          <Settings size={15} className="text-cyan" />
          <span className="text-text font-semibold text-sm">Payout Approval Settings</span>
          <div className="flex items-center gap-2 ml-2">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              requireApproval ? "text-yellow bg-yellow/10 border-yellow/20" : "text-green bg-green/10 border-green/20"
            }`}>
              {requireApproval ? "Approval Required" : "Auto-Approve On"}
            </span>
            {!payFuelEnabled && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border text-red bg-red/10 border-red/20">
                Pay Fuel Disabled
              </span>
            )}
          </div>
        </div>
        <span className="text-textDim text-xs">{open ? "▲ Hide" : "▼ Edit"}</span>
      </button>

      {/* Expandable settings */}
      {open && (
        <div className="border-t border-border px-5 pb-5 pt-4 space-y-5">
          {loadingSettings ? <Spinner /> : (
            <>
              <div className="grid grid-cols-2 gap-6">

                {/* Left: Approval gate */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldCheck size={14} className="text-cyan" />
                    <p className="text-xs font-bold text-text uppercase tracking-wide">Approval Gate</p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-text font-medium">Require Admin Approval</p>
                      <p className="text-xs text-textMuted mt-0.5">All payouts go to queue before EFT</p>
                    </div>
                    <button
                      disabled={!canEdit}
                      onClick={() => setRequireApproval(v => !v)}
                      className={`relative w-11 h-6 rounded-full transition-colors ${requireApproval ? "bg-yellow" : "bg-green"} disabled:opacity-50`}>
                      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${requireApproval ? "left-0.5" : "left-5"}`} />
                    </button>
                  </div>

                  <div>
                    <label className="text-xs text-textMuted block mb-1.5">
                      Auto-Approve Limit (R) <span className="text-textDim">— 0 = disabled</span>
                    </label>
                    <Input
                      type="number"
                      min="0"
                      value={autoApproveLimit}
                      onChange={e => setAutoApproveLimit(e.target.value)}
                      disabled={!canEdit}
                      placeholder="0"
                    />
                    <p className="text-[10px] text-textDim mt-1">Payouts ≤ this amount auto-approve and go straight to gateway</p>
                  </div>
                </div>

                {/* Right: Pay Fuel limits */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Fuel size={14} className="text-orange-400" />
                    <p className="text-xs font-bold text-text uppercase tracking-wide">Pay Fuel Limits</p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-text font-medium">Pay Fuel Enabled</p>
                      <p className="text-xs text-textMuted mt-0.5">Allow drivers to withdraw for fuel instantly</p>
                    </div>
                    <button
                      disabled={!canEdit}
                      onClick={() => setPayFuelEnabled(v => !v)}
                      className={`relative w-11 h-6 rounded-full transition-colors ${payFuelEnabled ? "bg-green" : "bg-red"} disabled:opacity-50`}>
                      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${payFuelEnabled ? "left-5" : "left-0.5"}`} />
                    </button>
                  </div>

                  <div>
                    <label className="text-xs text-textMuted block mb-1.5">
                      Max per Transaction (R) <span className="text-textDim">— 0 = no limit</span>
                    </label>
                    <Input
                      type="number"
                      min="0"
                      value={payFuelMaxPerTxn}
                      onChange={e => setPayFuelMaxPerTxn(e.target.value)}
                      disabled={!canEdit}
                      placeholder="500"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-textMuted block mb-1.5">
                      Daily Limit per Driver (R) <span className="text-textDim">— 0 = no limit</span>
                    </label>
                    <Input
                      type="number"
                      min="0"
                      value={payFuelDailyLimit}
                      onChange={e => setPayFuelDailyLimit(e.target.value)}
                      disabled={!canEdit}
                      placeholder="1000"
                    />
                  </div>
                </div>
              </div>

              {canEdit && (
                <div className="flex justify-end pt-1 border-t border-border">
                  <Button onClick={save} disabled={saving}>
                    <Save size={13} /> {saving ? "Saving…" : "Save Changes"}
                  </Button>
                </div>
              )}
              {!canEdit && (
                <p className="text-xs text-textDim text-center pt-1">You need <code>edit_system</code> permission to change payout settings.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PayoutsPage() {
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "largest">("newest");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/admin/payouts`, { headers: authHeaders() });
      const data = await res.json();
      setPayouts(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load payouts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = payouts.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!p.driver_name?.toLowerCase().includes(q) && !p.phone_number?.includes(q)) return false;
      }
      if (from && new Date(p.initiated_at || p.created_at) < new Date(from)) return false;
      if (to && new Date(p.initiated_at || p.created_at) > new Date(to + "T23:59:59")) return false;
      return true;
    });
    if (sortBy === "newest") list = [...list].sort((a, b) => new Date(b.initiated_at || b.created_at).getTime() - new Date(a.initiated_at || a.created_at).getTime());
    else if (sortBy === "oldest") list = [...list].sort((a, b) => new Date(a.initiated_at || a.created_at).getTime() - new Date(b.initiated_at || b.created_at).getTime());
    else if (sortBy === "largest") list = [...list].sort((a, b) => b.amount - a.amount);
    return list;
  }, [payouts, statusFilter, search, from, to, sortBy]);

  const totalPaid = payouts.filter(p => p.status === "completed" || p.status === "paid" || p.status === "success").reduce((s, p) => s + (p.net_amount ?? p.amount), 0);
  const totalFees = payouts.reduce((s, p) => s + (p.fee ?? 0), 0);
  const failedCount = payouts.filter(p => p.status === "failed" || p.status === "payout_failed").length;

  const now = new Date();
  const thisMonthPayouts = payouts.filter(p => {
    const d = new Date(p.initiated_at || p.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const thisMonthTotal = thisMonthPayouts.reduce((s, p) => s + (p.net_amount ?? p.amount), 0);

  const exportCsv = () => {
    const rows = [
      ["Driver", "Phone", "Requested", "Fee", "Net Paid", "Bank", "Account", "Status", "Stitch ID", "Date"],
      ...filtered.map(p => [
        p.driver_name || "", p.phone_number || "",
        formatZAR(p.amount), `R${(p.fee ?? 0).toFixed(2)}`, formatZAR(p.net_amount ?? p.amount),
        p.bank_name || "", p.account_number || "",
        p.status, p.stitch_disbursement_id || "",
        formatDate(p.initiated_at || p.created_at),
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "payouts.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported");
  };

  return (
    <AdminShell title="Payout History">
      <div className="space-y-4">

        <PayoutSettingsPanel />

        {/* Link to withdrawals for approvals */}
        <Link href="/admin/withdrawals">
          <div className="flex items-center justify-between p-3 bg-cyan/5 border border-cyan/20 rounded-xl hover:bg-cyan/10 transition-colors cursor-pointer">
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-cyan" />
              <p className="text-cyan text-xs font-semibold">
                Need to approve or reject withdrawal requests? Go to Withdrawals
              </p>
            </div>
            <ArrowRight size={13} className="text-cyan" />
          </div>
        </Link>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="text-center">
            <p className="text-xl font-extrabold text-green">{formatZAR(totalPaid)}</p>
            <p className="text-xs text-textMuted mt-1">Total Paid Out</p>
            <p className="text-[10px] text-textMuted mt-0.5">All time (net)</p>
          </Card>
          <Card className="text-center">
            <p className="text-xl font-extrabold text-cyan">{formatZAR(thisMonthTotal)}</p>
            <p className="text-xs text-textMuted mt-1">This Month</p>
            <p className="text-[10px] text-textMuted mt-0.5">{thisMonthPayouts.length} payouts</p>
          </Card>
          <Card className="text-center">
            <p className="text-xl font-extrabold text-purple">{payouts.length}</p>
            <p className="text-xs text-textMuted mt-1">Total Payouts</p>
            <p className="text-[10px] text-textMuted mt-0.5">{formatZAR(totalFees)} in fees collected</p>
          </Card>
          <Card className={`text-center ${failedCount > 0 ? "border-red/30" : ""}`}>
            <p className={`text-xl font-extrabold ${failedCount > 0 ? "text-red" : "text-green"}`}>
              {failedCount > 0 ? failedCount : <CheckCircle size={22} className="mx-auto" />}
            </p>
            <p className="text-xs text-textMuted mt-1">Failed Payouts</p>
            {failedCount > 0 && (
              <Link href="/admin/withdrawals">
                <p className="text-[10px] text-red font-bold mt-1 flex items-center justify-center gap-1">
                  <AlertTriangle size={9} /> Retry in Withdrawals
                </p>
              </Link>
            )}
          </Card>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap items-center">
          <div className="flex-1 min-w-0">
            <Input
              placeholder="Search driver name or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36" />
          <span className="text-textDim text-xs">to</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36" />
          <Select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="w-36">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="largest">Largest first</option>
          </Select>
          {(search || from || to) && (
            <Button variant="ghost" onClick={() => { setSearch(""); setFrom(""); setTo(""); }}>
              <X size={13} /> Clear
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            {["all", "completed", "paid", "pending", "processing", "failed"].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all capitalize ${
                  statusFilter === s ? "bg-cyanDim text-cyan border-cyan/20" : "bg-bg2 text-textMuted border-border hover:text-text"
                }`}>
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="flex items-center gap-1 text-xs text-textMuted hover:text-cyan transition-colors">
              <RefreshCw size={12} /> Refresh
            </button>
            <Button variant="secondary" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download size={13} /> Export CSV
            </Button>
          </div>
        </div>

        <p className="text-xs text-textMuted">
          {loading ? "Loading…" : `${filtered.length} of ${payouts.length} payouts`}
        </p>

        {loading ? <Spinner /> : filtered.length === 0 ? (
          <div className="text-center py-16 text-textMuted">
            <p className="text-sm font-medium">No payouts found</p>
            <p className="text-xs mt-1">Payouts appear here after withdrawals are approved and processed</p>
          </div>
        ) : (
          <Table
            headers={["Driver", "Phone", "Requested", "Fee", "Net Paid", "Bank", "Account", "Status", "Stitch ID", "Date"]}
            empty={false}>
            {filtered.map((p: any) => (
              <Tr key={p.id}>
                <Td className="font-semibold">{p.driver_name || "—"}</Td>
                <Td className="font-mono text-xs text-textMuted">{p.phone_number || "—"}</Td>
                <Td className="font-bold">{formatZAR(p.amount)}</Td>
                <Td className="text-red text-xs">R{(p.fee ?? 0).toFixed(2)}</Td>
                <Td className="text-green font-bold">{formatZAR(p.net_amount ?? p.amount)}</Td>
                <Td className="text-textMuted text-xs">{p.bank_name || "—"}</Td>
                <Td className="font-mono text-xs text-textMuted">{p.account_number || "—"}</Td>
                <Td>
                  <Badge label={p.status} tone={statusTone(p.status)} />
                  {p.failure_reason && (
                    <p className="text-[10px] text-red mt-0.5">{p.failure_reason}</p>
                  )}
                </Td>
                <Td>
                  <span className="font-mono text-[10px] text-textDim">
                    {p.stitch_disbursement_id?.slice(0, 16) || "—"}
                  </span>
                </Td>
                <Td className="text-textMuted text-xs">
                  {formatDate(p.initiated_at || p.created_at)}
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </div>
    </AdminShell>
  );
}
