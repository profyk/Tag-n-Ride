"use client";
import { useState, useEffect, useCallback } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Table, Tr, Td, Badge, Button, Spinner, Input, Select, Card } from "@/components/ui";
import { api, Transaction } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import { Search, Download, Copy, X, AlertTriangle, Clock, TrendingUp } from "lucide-react";
import toast from "react-hot-toast";

const TYPE_TONE: Record<string, any> = { topup: "cyan", payment: "green", withdrawal: "purple" };
const STATUS_TONE: Record<string, any> = { completed: "green", pending: "yellow", failed: "red", reversed: "orange" };

const QUICK_FILTERS = [
  { label: "Failed", type: "", status: "failed", icon: AlertTriangle, color: "text-red" },
  { label: "Pending", type: "", status: "pending", icon: Clock, color: "text-yellow" },
  { label: "Large (>R5k)", type: "", status: "", minAmt: "5000", icon: TrendingUp, color: "text-orange" },
  { label: "Payments", type: "payment", status: "", icon: TrendingUp, color: "text-green" },
  { label: "Top-ups", type: "topup", status: "", icon: TrendingUp, color: "text-cyan" },
];

export default function TransactionsPage() {
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [minAmt, setMinAmt] = useState("");
  const [maxAmt, setMaxAmt] = useState("");
  const [activeQuick, setActiveQuick] = useState<string | null>(null);

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

  const applyQuick = (qf: typeof QUICK_FILTERS[0]) => {
    if (activeQuick === qf.label) {
      setType(""); setStatus(""); setMinAmt(""); setActiveQuick(null);
    } else {
      setType(qf.type || ""); setStatus(qf.status || ""); setMinAmt(qf.minAmt || "");
      setActiveQuick(qf.label);
    }
  };

  const clearAll = () => {
    setType(""); setStatus(""); setFrom(""); setTo("");
    setSearch(""); setMinAmt(""); setMaxAmt(""); setActiveQuick(null);
  };

  const copyRef = (ref: string) => { navigator.clipboard.writeText(ref); toast.success("Copied"); };

  const total = txns.reduce((s, t) => s + t.amount, 0);
  const totalFees = txns.reduce((s, t) => s + (t.platform_fee || 0), 0);
  const failed = txns.filter((t) => t.status === "failed").length;

  const filteredByStatus = status ? txns.filter((t) => t.status === status) : txns;

  return (
    <AdminShell title="Transactions">
      <div className="space-y-4">

        {/* Quick filters */}
        <div className="flex gap-2 flex-wrap">
          <span className="text-[10px] font-bold text-textDim uppercase tracking-widest self-center">Quick:</span>
          {QUICK_FILTERS.map((qf) => (
            <button
              key={qf.label}
              onClick={() => applyQuick(qf)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${activeQuick === qf.label ? "bg-cyanDim text-cyan border-cyan/20" : "text-textMuted border-border hover:text-text"}`}
            >
              <qf.icon size={11} className={activeQuick === qf.label ? "" : qf.color} />
              {qf.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            <option value="payment">Payment</option>
            <option value="topup">Top-up</option>
            <option value="withdrawal">Withdrawal</option>
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All status</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <Input type="number" placeholder="Min amount" value={minAmt} onChange={(e) => setMinAmt(e.target.value)} />
          <Input type="number" placeholder="Max amount" value={maxAmt} onChange={(e) => setMaxAmt(e.target.value)} />
        </div>

        <div className="flex gap-3 items-center">
          <Input
            placeholder="Search reference, name, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
          />
          <Button onClick={load}><Search size={13} /> Search</Button>
          <Button variant="secondary" onClick={clearAll}><X size={13} /> Clear</Button>
        </div>

        {/* Summary bar */}
        {!loading && txns.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="py-2 px-4">
              <p className="text-[10px] text-textMuted font-bold uppercase tracking-widest">Records</p>
              <p className="text-lg font-extrabold text-text">{filteredByStatus.length.toLocaleString()}</p>
            </Card>
            <Card className="py-2 px-4">
              <p className="text-[10px] text-textMuted font-bold uppercase tracking-widest">Total Volume</p>
              <p className="text-lg font-extrabold text-cyan">{formatZAR(total)}</p>
            </Card>
            <Card className="py-2 px-4">
              <p className="text-[10px] text-textMuted font-bold uppercase tracking-widest">Fees Collected</p>
              <p className="text-lg font-extrabold text-green">{formatZAR(totalFees)}</p>
            </Card>
            <Card className={`py-2 px-4 ${failed > 0 ? "border-red/30" : ""}`}>
              <p className="text-[10px] text-textMuted font-bold uppercase tracking-widest">Failed</p>
              <p className={`text-lg font-extrabold ${failed > 0 ? "text-red" : "text-green"}`}>{failed}</p>
            </Card>
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="secondary" onClick={() => api.exportTransactions()}>
            <Download size={13} /> Export CSV
          </Button>
        </div>

        {loading ? <Spinner /> : (
          <Table
            headers={["Reference", "Type", "Amount", "Fee", "Net", "Sender", "Receiver", "Status", "Date"]}
            empty={!filteredByStatus.length}
          >
            {filteredByStatus.map((t) => (
              <Tr
                key={t.id}
                className={t.status === "failed" ? "bg-red/5" : t.amount >= 5000 ? "bg-yellow/5" : ""}
              >
                <Td>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[11px] text-textMuted">{t.reference}</span>
                    <button onClick={() => copyRef(t.reference)} className="text-textDim hover:text-textMuted">
                      <Copy size={10} />
                    </button>
                  </div>
                </Td>
                <Td>
                  <Badge label={t.type} tone={TYPE_TONE[t.type] || "cyan"} />
                </Td>
                <Td className={`font-bold ${t.amount >= 5000 ? "text-yellow" : "text-text"}`}>
                  {formatZAR(t.amount)}
                </Td>
                <Td className="text-textMuted text-xs">
                  {t.platform_fee ? formatZAR(t.platform_fee) : "—"}
                </Td>
                <Td className="text-green text-xs font-semibold">
                  {t.driver_net ? formatZAR(t.driver_net) : "—"}
                </Td>
                <Td className="text-textMuted text-xs">{t.sender_name || "—"}</Td>
                <Td className="text-textMuted text-xs">{t.receiver_name || "—"}</Td>
                <Td>
                  <Badge label={t.status} tone={STATUS_TONE[t.status] || "yellow"} />
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
