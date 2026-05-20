"use client";
import { useState, useEffect, useCallback } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Table, Tr, Td, Badge, Button, Spinner, Input, Select } from "@/components/ui";
import { api, Transaction } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import { Search, Download } from "lucide-react";

export default function TransactionsPage() {
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [minAmt, setMinAmt] = useState("");
  const [maxAmt, setMaxAmt] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    api.transactions({
      type: type || undefined,
      from_date: from || undefined,
      to_date: to || undefined,
      search: search || undefined,
      min_amount: minAmt ? parseFloat(minAmt) : undefined,
      max_amount: maxAmt ? parseFloat(maxAmt) : undefined,
    }).then((r) => setTxns(r.data)).finally(() => setLoading(false));
  }, [type, from, to, search, minAmt, maxAmt]);

  useEffect(() => { load(); }, []);

  const total = txns.reduce((s, t) => s + t.amount, 0);

  return (
    <AdminShell title="Transactions">
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            <option value="payment">Payment</option>
            <option value="topup">Top-up</option>
            <option value="withdrawal">Withdrawal</option>
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <Input type="number" placeholder="Min amount" value={minAmt}
            onChange={(e) => setMinAmt(e.target.value)} />
          <Input type="number" placeholder="Max amount" value={maxAmt}
            onChange={(e) => setMaxAmt(e.target.value)} />
          <Input placeholder="Search ref/name..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()} />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex gap-3">
            <Button onClick={load}><Search size={13} /> Search</Button>
            <Button variant="secondary" onClick={() => {
              setType(""); setFrom(""); setTo("");
              setSearch(""); setMinAmt(""); setMaxAmt("");
            }}>Clear</Button>
          </div>
          <div className="flex items-center gap-4">
            {txns.length > 0 && (
              <p className="text-textMuted text-xs">
                {txns.length} records · Total:{" "}
                <strong className="text-text">{formatZAR(total)}</strong>
              </p>
            )}
            <Button variant="secondary" onClick={() => api.exportTransactions()}>
              <Download size={13} /> CSV
            </Button>
          </div>
        </div>

        {loading ? <Spinner /> : (
          <Table
            headers={["Reference", "Type", "Amount", "Fee", "Net", "Sender", "Receiver", "Status", "Date"]}
            empty={!txns.length}>
            {txns.map((t) => (
              <Tr key={t.id}>
                <Td><span className="font-mono text-[11px] text-textMuted">{t.reference}</span></Td>
                <Td>
                  <Badge label={t.type}
                    tone={t.type === "topup" ? "cyan" : t.type === "payment" ? "green" : "purple"} />
                </Td>
                <Td className="font-bold">{formatZAR(t.amount)}</Td>
                <Td className="text-textMuted text-xs">
                  {t.platform_fee ? formatZAR(t.platform_fee) : "—"}
                </Td>
                <Td className="text-green text-xs font-semibold">
                  {t.driver_net ? formatZAR(t.driver_net) : "—"}
                </Td>
                <Td className="text-textMuted text-xs">{t.sender_name || "—"}</Td>
                <Td className="text-textMuted text-xs">{t.receiver_name || "—"}</Td>
                <Td>
                  <Badge label={t.status}
                    tone={t.status === "completed" ? "green" : t.status === "pending" ? "yellow" : "red"} />
                </Td>
                <Td className="text-textMuted text-xs">{formatDate(t.created_at)}</Td>
              </Tr>
            ))}
          </Table>
        )}
      </div>
    </AdminShell>
  );
}
