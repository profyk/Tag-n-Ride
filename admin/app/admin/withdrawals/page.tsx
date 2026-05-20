"use client";
import { useState, useEffect } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Table, Tr, Td, Badge, Button, Spinner, Card } from "@/components/ui";
import { api, Withdrawal } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import { CheckCircle, XCircle, Snowflake } from "lucide-react";
import toast from "react-hot-toast";
import { isSuperAdmin } from "@/lib/api";

export default function WithdrawalsPage() {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const superAdmin = isSuperAdmin();

  const load = () => {
    setLoading(true);
    api.withdrawals().then((r) => setWithdrawals(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleApprove = async (w: Withdrawal) => {
    if (w.amount > 10000 && !superAdmin) {
      toast.error("Withdrawals over R10,000 require superadmin approval");
      return;
    }
    if (!confirm(`Approve withdrawal of ${formatZAR(w.amount)} for ${w.user_name}?`)) return;
    try { await api.approveWithdrawal(w.id); toast.success("Withdrawal approved"); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  const handleReject = async (w: Withdrawal) => {
    if (!confirm(`Reject withdrawal of ${formatZAR(w.amount)}? Amount will be refunded.`)) return;
    try { await api.rejectWithdrawal(w.id); toast.success("Withdrawal rejected and refunded"); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  const filtered = withdrawals.filter((w) => filter === "all" ? true : w.status === filter);
  const pendingTotal = withdrawals.filter((w) => w.status === "pending").reduce((s, w) => s + w.amount, 0);

  return (
    <AdminShell title="Withdrawals">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <Card className="text-center">
            <p className="text-xl font-extrabold text-yellow">
              {withdrawals.filter((w) => w.status === "pending").length}
            </p>
            <p className="text-xs text-textMuted mt-1">Pending</p>
            <p className="text-xs font-bold text-yellow mt-1">{formatZAR(pendingTotal)}</p>
          </Card>
          <Card className="text-center">
            <p className="text-xl font-extrabold text-green">
              {withdrawals.filter((w) => w.status === "approved").length}
            </p>
            <p className="text-xs text-textMuted mt-1">Approved</p>
          </Card>
          <Card className="text-center">
            <p className="text-xl font-extrabold text-red">
              {withdrawals.filter((w) => w.status === "rejected").length}
            </p>
            <p className="text-xs text-textMuted mt-1">Rejected</p>
          </Card>
        </div>

        <div className="flex gap-2">
          {(["pending", "approved", "rejected", "all"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all capitalize
                ${filter === f
                  ? "bg-cyanDim text-cyan border-cyan/20"
                  : "bg-bg2 text-textMuted border-border hover:text-text"}`}>
              {f}
            </button>
          ))}
        </div>

        {loading ? <Spinner /> : (
          <Table
            headers={["User", "Phone", "Amount", "Bank", "Account", "Wallet", "Status", "Date", "Actions"]}
            empty={!filtered.length}>
            {filtered.map((w) => (
              <Tr key={w.id}>
                <Td className="font-semibold">{w.user_name || "—"}</Td>
                <Td className="font-mono text-xs text-textMuted">{w.phone_number || "—"}</Td>
                <Td>
                  <span className={`font-bold ${w.amount > 10000 ? "text-red" : "text-text"}`}>
                    {formatZAR(w.amount)}
                    {w.amount > 10000 && !superAdmin && (
                      <span className="ml-1 text-[9px] text-red block">SA REQUIRED</span>
                    )}
                  </span>
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
                  <Badge label={w.status}
                    tone={w.status === "approved" ? "green" : w.status === "pending" ? "yellow" : "red"} />
                </Td>
                <Td className="text-textMuted text-xs">{formatDate(w.created_at)}</Td>
                <Td>
                  {w.status === "pending" && (
                    <div className="flex gap-1.5">
                      <Button variant="secondary" onClick={() => handleApprove(w)}>
                        <CheckCircle size={12} /> Approve
                      </Button>
                      <Button variant="danger" onClick={() => handleReject(w)}>
                        <XCircle size={12} /> Reject
                      </Button>
                    </div>
                  )}
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </div>
    </AdminShell>
  );
}
