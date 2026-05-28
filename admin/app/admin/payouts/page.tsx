"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import { Table, Tr, Td, Badge, Button, Spinner, Card, Input, Select } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import { Download, RefreshCw, ArrowRight, X, Zap, AlertTriangle, CheckCircle } from "lucide-react";
import toast from "react-hot-toast";
import { getToken } from "@/lib/api";

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
