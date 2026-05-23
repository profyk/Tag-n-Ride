"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Spinner } from "@/components/ui";
import { hasPermission } from "@/lib/api";
import { useRouter } from "next/navigation";
import { formatZAR, formatDate } from "@/lib/utils";
import { TrendingUp, TrendingDown, DollarSign, Wallet, ArrowUpRight, ArrowDownLeft, RefreshCw } from "lucide-react";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`, "Content-Type": "application/json" });

const ACCOUNT_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  user_wallets:              { color: "text-cyan",   bg: "bg-cyan/10",     label: "User Wallets" },
  driver_earnings_pending:   { color: "text-yellow", bg: "bg-yellow/10",   label: "Driver Earnings Pending" },
  platform_revenue:          { color: "text-green",  bg: "bg-green/10",    label: "Platform Revenue" },
  processing_fees_collected: { color: "text-purple", bg: "bg-purple/10",   label: "Processing Fees Collected" },
  gateway_fees_paid:         { color: "text-red",    bg: "bg-red/10",      label: "Gateway Fees Paid" },
  operations_income:         { color: "text-cyan",   bg: "bg-cyan/10",     label: "Operations Income" },
  withdrawal_settlements:    { color: "text-orange-400", bg: "bg-orange-400/10", label: "Withdrawal Settlements" },
  refund_reserve:            { color: "text-yellow", bg: "bg-yellow/10",   label: "Refund Reserve" },
};

export default function LedgerPage() {
  const router = useRouter();
  const [ledger, setLedger] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [txnLoading, setTxnLoading] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [refundModal, setRefundModal] = useState(false);
  const [refundUserId, setRefundUserId] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refunding, setRefunding] = useState(false);

  useEffect(() => {
    if (!hasPermission("view_ledger")) { router.push("/admin/dashboard"); return; }
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [l, s] = await Promise.all([
        fetch(`${BASE}/api/admin/ledger`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${BASE}/api/admin/ledger/summary`, { headers: authHeaders() }).then(r => r.json()),
      ]);
      setLedger(l); setSummary(s);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadTransactions = async (account?: string) => {
    setTxnLoading(true);
    const url = account
      ? `${BASE}/api/admin/ledger/transactions?account=${account}&limit=50`
      : `${BASE}/api/admin/ledger/transactions?limit=50`;
    try {
      const data = await fetch(url, { headers: authHeaders() }).then(r => r.json());
      setTransactions(Array.isArray(data) ? data : []);
      setSelectedAccount(account || null);
    } catch (e) {}
    finally { setTxnLoading(false); }
  };

  const handleRefund = async () => {
    if (!refundUserId || !refundAmount || !refundReason) return;
    setRefunding(true);
    try {
      const res = await fetch(`${BASE}/api/admin/ledger/refund`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ user_id: refundUserId, amount: parseFloat(refundAmount), reason: refundReason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Refund failed");
      alert(`Refund processed. Reference: ${data.reference}`);
      setRefundModal(false);
      setRefundUserId(""); setRefundAmount(""); setRefundReason("");
      loadAll();
    } catch (e: any) { alert(e.message); }
    finally { setRefunding(false); }
  };

  if (loading) return <AdminShell title="Ledger"><Spinner /></AdminShell>;

  const canRefund = hasPermission("process_refunds");
  const netIncome = summary?.this_month
    ? summary.this_month.platform_revenue + summary.this_month.processing_fees - summary.this_month.gateway_fees_paid
    : 0;

  return (
    <AdminShell title="Platform Ledger">
      <div className="space-y-6">

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Today Top-Ups", value: formatZAR(summary?.today?.topups || 0), color: "text-cyan" },
            { label: "Today Payments", value: formatZAR(summary?.today?.payments || 0), color: "text-green" },
            { label: "Today Withdrawals", value: formatZAR(summary?.today?.withdrawals || 0), color: "text-yellow" },
            { label: "Month Net Income", value: formatZAR(netIncome), color: netIncome >= 0 ? "text-green" : "text-red" },
          ].map(s => (
            <Card key={s.label}>
              <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">{s.label}</p>
              <p className={`text-xl font-extrabold ${s.color}`}>{s.value}</p>
            </Card>
          ))}
        </div>

        {summary?.this_month && (
          <Card>
            <h2 className="text-text font-bold mb-4">This Month</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Platform Revenue", value: summary.this_month.platform_revenue, note: "3% ride commissions", color: "text-green" },
                { label: "Processing Fees", value: summary.this_month.processing_fees, note: "Top-up fees collected", color: "text-purple" },
                { label: "Gateway Fees Paid", value: summary.this_month.gateway_fees_paid, note: "Paid to PayFast", color: "text-red" },
                { label: "Net Income", value: netIncome, note: "Revenue minus gateway fees", color: netIncome >= 0 ? "text-green" : "text-red" },
              ].map(s => (
                <div key={s.label}>
                  <p className="text-[10px] text-textMuted font-bold uppercase tracking-widest mb-1">{s.label}</p>
                  <p className={`font-extrabold text-lg ${s.color}`}>{formatZAR(s.value)}</p>
                  <p className="text-textDim text-xs">{s.note}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-text font-bold">Account Balances</h2>
            <button onClick={loadAll} className="text-xs text-textMuted hover:text-cyan flex items-center gap-1 transition-colors">
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {ledger?.accounts?.map((acc: any) => {
              const cfg = ACCOUNT_CONFIG[acc.account] || { color: "text-text", bg: "bg-bg3", label: acc.account };
              return (
                <div key={acc.account} onClick={() => loadTransactions(acc.account)}
                  className="flex items-center gap-4 p-4 bg-bg2 border border-border rounded-xl cursor-pointer hover:border-cyan/30 transition-all">
                  <div className={`w-10 h-10 rounded-full ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
                    <DollarSign size={18} className={cfg.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-text font-bold text-sm">{cfg.label}</p>
                    <p className="text-textDim text-xs truncate">{acc.description}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`font-extrabold text-base ${cfg.color}`}>{formatZAR(acc.balance)}</p>
                    <p className="text-textDim text-[10px]">Click for history</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {canRefund && (
          <div className="flex justify-end">
            <button onClick={() => setRefundModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-yellow/10 border border-yellow/20 rounded-lg text-yellow text-sm font-bold hover:bg-yellow/20 transition-all">
              <RefreshCw size={14} /> Process Refund
            </button>
          </div>
        )}

        {(transactions.length > 0 || txnLoading) && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-text font-bold">
                {selectedAccount ? `${ACCOUNT_CONFIG[selectedAccount]?.label || selectedAccount} History` : "Recent Ledger Entries"}
              </h2>
              <div className="flex gap-2">
                {selectedAccount && (
                  <button onClick={() => loadTransactions()} className="text-xs text-textMuted hover:text-cyan transition-colors">Show all</button>
                )}
                <button onClick={() => { setTransactions([]); setSelectedAccount(null); }} className="text-xs text-textMuted hover:text-red transition-colors">Close</button>
              </div>
            </div>
            {txnLoading ? <Spinner /> : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {transactions.map((t: any) => (
                  <div key={t.id} className="flex items-center gap-3 p-3 bg-bg rounded-lg border border-border text-sm">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${t.direction === "credit" ? "bg-green/10" : "bg-red/10"}`}>
                      {t.direction === "credit" ? <ArrowUpRight size={14} className="text-green" /> : <ArrowDownLeft size={14} className="text-red" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-text font-medium text-xs truncate">{t.description}</p>
                      <p className="text-textDim text-[10px]">{t.account} · {formatDate(t.created_at)}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`font-bold text-sm ${t.direction === "credit" ? "text-green" : "text-red"}`}>
                        {t.direction === "credit" ? "+" : "-"}{formatZAR(t.amount)}
                      </p>
                      <p className="text-textDim text-[10px]">Bal: {formatZAR(t.balance_after)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {!transactions.length && !txnLoading && (
          <p className="text-textMuted text-sm text-center py-4">Click any account above to view its transaction history</p>
        )}
      </div>

      {refundModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-bg2 border border-border rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-text font-bold text-lg mb-4">Process Refund</h2>
            <div className="space-y-4">
              {[
                { label: "User ID", value: refundUserId, onChange: setRefundUserId, placeholder: "Paste user ID from Users page" },
                { label: "Amount (ZAR)", value: refundAmount, onChange: (v: string) => setRefundAmount(v.replace(/[^0-9.]/g, "")), placeholder: "0.00" },
              ].map(f => (
                <div key={f.label}>
                  <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1 block">{f.label}</label>
                  <input value={f.value} onChange={e => f.onChange(e.target.value)} placeholder={f.placeholder}
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-text text-sm focus:outline-none focus:border-cyan" />
                </div>
              ))}
              <div>
                <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1 block">Reason</label>
                <textarea value={refundReason} onChange={e => setRefundReason(e.target.value)} placeholder="Reason for refund..." rows={3}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-text text-sm focus:outline-none focus:border-cyan resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setRefundModal(false)}
                className="flex-1 py-2.5 bg-bg3 border border-border rounded-lg text-textMuted text-sm font-bold">Cancel</button>
              <button onClick={handleRefund} disabled={refunding || !refundUserId || !refundAmount || !refundReason}
                className="flex-1 py-2.5 bg-yellow/20 border border-yellow/30 rounded-lg text-yellow text-sm font-bold disabled:opacity-50">
                {refunding ? "Processing..." : "Process Refund"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
  }
