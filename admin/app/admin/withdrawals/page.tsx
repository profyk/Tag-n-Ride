"use client";
import { useState, useEffect } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Table, Tr, Td, Badge, Button, Spinner, Card } from "@/components/ui";
import { api, Withdrawal, hasPermission } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import { CheckCircle, XCircle, Snowflake, Zap, RefreshCw, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import { isSuperAdmin } from "@/lib/api";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

export default function WithdrawalsPage() {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "payout_failed" | "paid" | "all">("pending");
  const [processing, setProcessing] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"withdrawals" | "payouts">("withdrawals");
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

  const handleApprove = async (w: Withdrawal) => {
    if (w.amount > 10000 && !canLarge) {
      toast.error("Withdrawals over R10,000 require Finance/CFO/CEO approval");
      return;
    }
    const PAYOUT_FEE = 3.50;
    const net = w.amount - PAYOUT_FEE;
    if (!confirm(
      `Approve and instantly pay ${w.user_name}?\n\n` +
      `Requested: ${formatZAR(w.amount)}\n` +
      `Payout fee: R${PAYOUT_FEE.toFixed(2)}\n` +
      `Driver receives: ${formatZAR(net)}\n\n` +
      `Money will be sent instantly to ${w.bank_name} ${w.account_number}`
    )) return;

    setProcessing(w.id);
    try {
      const res = await fetch(`${BASE}/api/admin/withdraw/${w.id}/approve/v2`, {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Approval failed");

      if (data.error) {
        toast.error(`Approved but payout failed: ${data.error}. Use retry button.`);
      } else if (data.sandbox) {
        toast.success(`Approved! Sandbox payout of ${formatZAR(net)} simulated ✓`);
      } else {
        toast.success(`Approved! ${formatZAR(net)} sent instantly to driver's bank ⚡`);
      }
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (w: Withdrawal) => {
    if (!confirm(`Reject withdrawal of ${formatZAR(w.amount)}? Amount will be refunded to wallet.`)) return;
    try {
      await api.rejectWithdrawal(w.id);
      toast.success("Withdrawal rejected and refunded");
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleRetry = async (withdrawalId: string) => {
    if (!confirm("Retry the payout for this withdrawal?")) return;
    setProcessing(withdrawalId);
    try {
      const res = await fetch(`${BASE}/api/admin/withdraw/${withdrawalId}/retry-payout`, {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Retry failed");
      toast.success("Payout retry initiated");
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setProcessing(null);
    }
  };

  const filtered = withdrawals.filter(w => filter === "all" ? true : w.status === filter);
  const pendingCount = withdrawals.filter(w => w.status === "pending").length;
  const pendingTotal = withdrawals.filter(w => w.status === "pending").reduce((s, w) => s + w.amount, 0);
  const failedCount = withdrawals.filter(w => w.status === "payout_failed").length;

  const getStatusTone = (status: string) => {
    if (status === "approved" || status === "paid" || status === "completed") return "green";
    if (status === "pending" || status === "processing") return "yellow";
    if (status === "rejected" || status === "failed" || status === "payout_failed") return "red";
    return "muted";
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
            <p className="text-xl font-extrabold text-red">
              {withdrawals.filter(w => w.status === "rejected").length}
            </p>
            <p className="text-xs text-textMuted mt-1">Rejected</p>
          </Card>
          <Card className="text-center">
            <p className={`text-xl font-extrabold ${failedCount > 0 ? "text-red" : "text-textMuted"}`}>
              {failedCount}
            </p>
            <p className="text-xs text-textMuted mt-1">Payout Failed</p>
            {failedCount > 0 && (
              <p className="text-[10px] text-red font-bold mt-1">NEEDS ATTENTION</p>
            )}
          </Card>
        </div>

        {/* Payout fee notice */}
        <div className="flex items-center gap-2 p-3 bg-cyan/5 border border-cyan/20 rounded-xl">
          <Zap size={14} className="text-cyan flex-shrink-0" />
          <p className="text-cyan text-xs font-medium">
            Instant Stitch payouts active — R3.50 fee deducted from driver per withdrawal.
            Money arrives in driver's bank within seconds.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border pb-2">
          {[
            { key: "withdrawals", label: "Withdrawal Requests" },
            { key: "payouts", label: `Payout History (${payouts.length})` },
          ].map(t => (
            <button key={t.key}
              onClick={() => setActiveTab(t.key as any)}
              className={`px-4 py-2 text-sm font-bold rounded-t-lg transition-all ${
                activeTab === t.key
                  ? "text-cyan border-b-2 border-cyan"
                  : "text-textMuted hover:text-text"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Withdrawals tab */}
        {activeTab === "withdrawals" && (
          <>
            <div className="flex gap-2 flex-wrap">
              {(["pending", "approved", "paid", "payout_failed", "rejected", "all"] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all capitalize ${
                    filter === f
                      ? "bg-cyanDim text-cyan border-cyan/20"
                      : "bg-bg2 text-textMuted border-border hover:text-text"
                  }`}>
                  {f.replace("_", " ")}
                  {f === "payout_failed" && failedCount > 0 && (
                    <span className="ml-1 bg-red text-white rounded-full px-1.5 py-0.5 text-[9px]">
                      {failedCount}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {loading ? <Spinner /> : (
              <Table
                headers={["Driver", "Phone", "Amount", "Net Payout", "Bank", "Account", "Wallet", "Status", "Date", "Actions"]}
                empty={!filtered.length}>
                {filtered.map(w => (
                  <Tr key={w.id}>
                    <Td className="font-semibold">{w.user_name || "—"}</Td>
                    <Td className="font-mono text-xs text-textMuted">{w.phone_number || "—"}</Td>
                    <Td>
                      <span className={`font-bold ${w.amount > 10000 ? "text-red" : "text-text"}`}>
                        {formatZAR(w.amount)}
                        {w.amount > 10000 && !canLarge && (
                          <span className="ml-1 text-[9px] text-red block">FINANCE REQ</span>
                        )}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-green font-bold text-xs">
                        {formatZAR(w.amount - 3.50)}
                      </span>
                      <span className="text-textDim text-[10px] block">after R3.50 fee</span>
                    </Td>
                    <Td className="text-textMuted text-xs">{w.bank_name}</Td>
                    <Td className="font-mono text-xs text-textMuted">{w.account_number}</Td>
                    <Td className="text-xs">
                      {w.wallet_balance !== undefined ? (
                        <span className={w.is_frozen ? "text-red" : "text-green"}>
                          {formatZAR(w.wallet_balance)}
                          {w.is_frozen && <Snowflake size={10} className="inline ml-1" />}
                        </span>
                      ) : "—"}
                    </Td>
                    <Td>
                      <Badge label={w.status.replace("_", " ")} tone={getStatusTone(w.status)} />
                    </Td>
                    <Td className="text-textMuted text-xs">{formatDate(w.created_at)}</Td>
                    <Td>
                      {w.status === "pending" && canApprove && (
                        <div className="flex gap-1.5">
                          <Button
                            variant="secondary"
                            onClick={() => handleApprove(w)}
                            loading={processing === w.id}>
                            <Zap size={12} className="text-cyan" />
                            Pay Now
                          </Button>
                          <Button variant="danger" onClick={() => handleReject(w)}>
                            <XCircle size={12} /> Reject
                          </Button>
                        </div>
                      )}
                      {w.status === "payout_failed" && canApprove && (
                        <Button
                          variant="secondary"
                          onClick={() => handleRetry(w.id)}
                          loading={processing === w.id}>
                          <RefreshCw size={12} /> Retry Payout
                        </Button>
                      )}
                      {w.status === "payout_failed" && (
                        <div className="flex items-center gap-1 mt-1">
                          <AlertTriangle size={10} className="text-red" />
                          <span className="text-[10px] text-red">Payout failed</span>
                        </div>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Table>
            )}
          </>
        )}

        {/* Payouts tab */}
        {activeTab === "payouts" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button onClick={load}
                className="flex items-center gap-1 text-xs text-textMuted hover:text-cyan transition-colors">
                <RefreshCw size={12} /> Refresh
              </button>
            </div>
            {loading ? <Spinner /> : payouts.length === 0 ? (
              <div className="text-center py-12 text-textMuted">No payouts yet</div>
            ) : (
              <Table
                headers={["Driver", "Phone", "Requested", "Fee", "Net Paid", "Bank", "Account", "Status", "Stitch ID", "Date"]}
                empty={false}>
                {payouts.map((p: any) => (
                  <Tr key={p.id}>
                    <Td className="font-semibold">{p.driver_name}</Td>
                    <Td className="font-mono text-xs text-textMuted">{p.phone_number}</Td>
                    <Td className="font-bold">{formatZAR(p.amount)}</Td>
                    <Td className="text-red text-xs">R{p.fee?.toFixed(2)}</Td>
                    <Td className="text-green font-bold">{formatZAR(p.net_amount)}</Td>
                    <Td className="text-textMuted text-xs">{p.bank_name}</Td>
                    <Td className="font-mono text-xs text-textMuted">{p.account_number}</Td>
                    <Td>
                      <Badge
                        label={p.status}
                        tone={getStatusTone(p.status)}
                      />
                      {p.failure_reason && (
                        <p className="text-[10px] text-red mt-0.5">{p.failure_reason}</p>
                      )}
                    </Td>
                    <Td>
                      <span className="font-mono text-[10px] text-textDim">
                        {p.stitch_disbursement_id?.slice(0, 16) || "—"}
                      </span>
                    </Td>
                    <Td className="text-textMuted text-xs">{formatDate(p.initiated_at)}</Td>
                  </Tr>
                ))}
              </Table>
            )}
          </div>
        )}
      </div>
    </AdminShell>
  );
 }
