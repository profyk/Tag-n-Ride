"use client";
import { useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Table, Tr, Td, Badge, Spinner, Select, Input } from "@/components/ui";
import { useTransactions } from "@/lib/hooks";
import { formatZAR, formatDate } from "@/lib/utils";

export default function TransactionsPage() {
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data, isLoading } = useTransactions({ type: type || undefined, from: from || undefined, to: to || undefined });

  return (
    <AdminShell title="Transactions">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3 items-center">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            <option value="payment">Payment</option>
            <option value="topup">Top-up</option>
            <option value="withdrawal">Withdrawal</option>
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
          <span className="text-textMuted text-sm">to</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" />
        </div>
        {isLoading ? <Spinner /> : (
          <Table headers={["Reference", "Type", "Amount", "Sender", "Receiver", "Status", "Date"]} empty={!data?.length}>
            {data?.map((t) => (
              <Tr key={t.id}>
                <Td><span className="font-mono text-xs text-textMuted">{t.reference}</span></Td>
                <Td><Badge label={t.type} tone={t.type === "topup" ? "cyan" : t.type === "payment" ? "green" : "purple"} /></Td>
                <Td className="font-bold">{formatZAR(t.amount)}</Td>
                <Td className="text-textMuted text-xs">{t.sender_name || t.sender_id?.slice(0, 8) || "—"}</Td>
                <Td className="text-textMuted text-xs">{t.receiver_name || t.receiver_id?.slice(0, 8) || "—"}</Td>
                <Td><Badge label={t.status} tone={t.status === "completed" ? "green" : t.status === "pending" ? "yellow" : "red"} /></Td>
                <Td className="text-textMuted text-xs">{formatDate(t.created_at)}</Td>
              </Tr>
            ))}
          </Table>
        )}
        {data && <p className="text-textMuted text-xs">{data.length} records · Total: <strong className="text-text">{formatZAR(data.reduce((s, t) => s + t.amount, 0))}</strong></p>}
      </div>
    </AdminShell>
  );
}
