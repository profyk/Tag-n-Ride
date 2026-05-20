"use client";
import { useState, useEffect } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Table, Tr, Td, Spinner, Card, Button } from "@/components/ui";
import { api } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import { Download } from "lucide-react";

export default function PayoutsPage() {
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.withdrawals()
      .then((r) => setPayouts(r.data.filter((w: any) => w.status === "approved")))
      .finally(() => setLoading(false));
  }, []);

  const total = payouts.reduce((s, p) => s + p.amount, 0);
  const thisMonth = payouts.filter((p) => {
    const d = new Date(p.created_at);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const thisMonthTotal = thisMonth.reduce((s, p) => s + p.amount, 0);

  return (
    <AdminShell title="Payouts">
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Total Paid Out</p>
            <p className="text-2xl font-extrabold text-green">{formatZAR(total)}</p>
            <p className="text-xs text-textMuted mt-1">All time</p>
          </Card>
          <Card>
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">This Month</p>
            <p className="text-2xl font-extrabold text-cyan">{formatZAR(thisMonthTotal)}</p>
            <p className="text-xs text-textMuted mt-1">{thisMonth.length} payouts</p>
          </Card>
          <Card>
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Total Payouts</p>
            <p className="text-2xl font-extrabold text-purple">{payouts.length}</p>
            <p className="text-xs text-textMuted mt-1">Approved withdrawals</p>
          </Card>
        </div>

        <div className="flex justify-end">
          <Button variant="secondary" onClick={() => api.exportTransactions()}>
            <Download size={13} /> Export CSV
          </Button>
        </div>

        {loading ? <Spinner /> : (
          <Table
            headers={["User", "Phone", "Amount", "Bank", "Account Number", "Account Name", "Date"]}
            empty={!payouts.length}>
            {payouts.map((p) => (
              <Tr key={p.id}>
                <Td className="font-semibold">{p.user_name || "—"}</Td>
                <Td className="font-mono text-xs text-textMuted">{p.phone_number || "—"}</Td>
                <Td className="font-bold text-green">{formatZAR(p.amount)}</Td>
                <Td className="text-textMuted text-xs">{p.bank_name}</Td>
                <Td className="font-mono text-xs text-textMuted">{p.account_number}</Td>
                <Td className="text-textMuted text-xs">{p.account_name || "—"}</Td>
                <Td className="text-textMuted text-xs">{formatDate(p.created_at)}</Td>
              </Tr>
            ))}
          </Table>
        )}
      </div>
    </AdminShell>
  );
}
