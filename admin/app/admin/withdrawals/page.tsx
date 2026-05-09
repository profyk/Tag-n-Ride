"use client";
import { AdminShell } from "@/components/layout/AdminShell";
import { Table, Tr, Td, Badge, Button, Spinner } from "@/components/ui";
import { useWithdrawals, useWithdrawalAction } from "@/lib/hooks";
import { formatZAR, formatDate, maskAccount } from "@/lib/utils";
import { CheckCircle, XCircle } from "lucide-react";

export default function WithdrawalsPage() {
  const { data, isLoading } = useWithdrawals();
  const action = useWithdrawalAction();
  const pending = data?.filter((w) => w.status === "pending") ?? [];
  const processed = data?.filter((w) => w.status !== "pending") ?? [];

  return (
    <AdminShell title="Withdrawals & CashUp">
      <div className="space-y-6">
        {isLoading ? <Spinner /> : (
          <>
            <div>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-text font-bold">Pending</h2>
                {pending.length > 0 && <span className="bg-yellowDim text-yellow text-xs font-bold px-2 py-0.5 rounded border border-yellow/20">{pending.length}</span>}
              </div>
              <Table headers={["Driver", "Amount", "Bank", "Account", "Date", "Actions"]} empty={!pending.length}>
                {pending.map((w) => (
                  <Tr key={w.id}>
                    <Td className="font-semibold">{w.user_name || w.user_id.slice(0, 10)}</Td>
                    <Td className="font-bold text-green">{formatZAR(w.amount)}</Td>
                    <Td className="text-textMuted">{w.bank_name}</Td>
                    <Td className="font-mono text-xs text-textMuted">{maskAccount(w.account_number)}</Td>
                    <Td className="text-textMuted text-xs">{formatDate(w.created_at)}</Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Button variant="secondary" loading={action.isPending} onClick={() => action.mutate({ id: w.id, action: "approve" })}>
                          <CheckCircle size={14} className="text-green" /> Approve
                        </Button>
                        <Button variant="danger" loading={action.isPending} onClick={() => action.mutate({ id: w.id, action: "reject" })}>
                          <XCircle size={14} /> Reject
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Table>
            </div>
            <div>
              <h2 className="text-text font-bold mb-3">Processed</h2>
              <Table headers={["Driver", "Amount", "Bank", "Account", "Status", "Date"]} empty={!processed.length}>
                {processed.map((w) => (
                  <Tr key={w.id}>
                    <Td className="font-semibold">{w.user_name || w.user_id.slice(0, 10)}</Td>
                    <Td className="font-bold">{formatZAR(w.amount)}</Td>
                    <Td className="text-textMuted">{w.bank_name}</Td>
                    <Td className="font-mono text-xs text-textMuted">{maskAccount(w.account_number)}</Td>
                    <Td><Badge label={w.status} tone={w.status === "approved" ? "green" : "red"} /></Td>
                    <Td className="text-textMuted text-xs">{formatDate(w.created_at)}</Td>
                  </Tr>
                ))}
              </Table>
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}
