"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Spinner, Input } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import { Search, MinusCircle, CheckCircle2, XCircle, Clock } from "lucide-react";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}` });

const TYPE_COLORS: Record<string, string> = {
  fuel: "bg-orange-500/20 text-orange-400",
  damage: "bg-red-500/20 text-red-400",
  advance: "bg-blue-500/20 text-blue-400",
  fine: "bg-yellow-500/20 text-yellow-400",
  manual: "bg-purple-500/20 text-purple-400",
};

const STATUS_ICONS: Record<string, any> = {
  pending: <Clock size={13} className="text-yellow-400" />,
  applied: <CheckCircle2 size={13} className="text-green-400" />,
  cancelled: <XCircle size={13} className="text-muted" />,
};

export default function FleetDeductionsPage() {
  const [deductions, setDeductions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const load = (status = filter) => {
    setLoading(true);
    fetch(`${BASE}/api/admin/fleet/deductions?status=${status}`, { headers: authHeaders() })
      .then(r => r.json()).then(d => setDeductions(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleFilter = (s: string) => { setFilter(s); load(s); };

  const visible = deductions.filter(d =>
    !search ||
    d.driver_name?.toLowerCase().includes(search.toLowerCase()) ||
    d.owner_name?.toLowerCase().includes(search.toLowerCase()) ||
    d.reason?.toLowerCase().includes(search.toLowerCase())
  );

  const pendingCount = deductions.filter(d => d.status === "pending").length;
  const appliedCount = deductions.filter(d => d.status === "applied").length;
  const pendingTotal = deductions.filter(d => d.status === "pending").reduce((s, d) => s + d.amount, 0);
  const appliedTotal = deductions.filter(d => d.status === "applied").reduce((s, d) => s + d.amount, 0);

  return (
    <AdminShell title="Driver Deductions" subtitle="Fleet-wide view of owner-set driver deductions (fuel, damage, advances, fines)">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
          <p className="text-yellow-400 font-black text-2xl">{pendingCount}</p>
          <p className="text-yellow-400/70 text-xs font-semibold uppercase tracking-wider mt-1">Pending</p>
          <p className="text-yellow-400 text-sm font-bold mt-1">{formatZAR(pendingTotal)}</p>
        </div>
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
          <p className="text-green-400 font-black text-2xl">{appliedCount}</p>
          <p className="text-green-400/70 text-xs font-semibold uppercase tracking-wider mt-1">Applied</p>
          <p className="text-green-400 text-sm font-bold mt-1">{formatZAR(appliedTotal)}</p>
        </div>
        <div className="bg-bg2 border border-border rounded-xl p-4">
          <p className="text-text font-black text-2xl">{deductions.length}</p>
          <p className="text-muted text-xs font-semibold uppercase tracking-wider mt-1">Total</p>
        </div>
        <div className="bg-bg2 border border-border rounded-xl p-4">
          <p className="text-cyan font-black text-2xl">{formatZAR(deductions.reduce((s, d) => s + d.amount, 0))}</p>
          <p className="text-muted text-xs font-semibold uppercase tracking-wider mt-1">All Time</p>
        </div>
      </div>

      {/* Filters + Search */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        {["all", "pending", "applied", "cancelled"].map(s => (
          <button key={s} onClick={() => handleFilter(s)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${filter === s
              ? "bg-cyan text-bg border-cyan"
              : "bg-bg2 text-muted border-border hover:border-cyan/40"}`}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        <div className="flex items-center gap-2 bg-bg2 border border-border rounded-lg px-3 py-1.5 ml-auto">
          <Search size={14} className="text-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search driver, owner, reason…"
            className="bg-transparent text-sm text-text outline-none w-52 placeholder:text-muted" />
        </div>
      </div>

      <Card>
        {loading ? <Spinner /> : visible.length === 0 ? (
          <div className="text-center py-12 text-muted">
            <MinusCircle size={40} className="mx-auto mb-3 opacity-40" />
            <p className="font-semibold">No deductions found</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  {["Driver", "Owner", "Type", "Amount", "Reason", "Status", "Date"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-textMuted uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map(d => (
                  <tr key={d.id} className="border-b border-border last:border-0 hover:bg-bg3 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-bold text-text">{d.driver_name}</p>
                      <p className="text-xs text-muted">{d.driver_phone}</p>
                    </td>
                    <td className="px-4 py-3"><p className="text-sm text-text">{d.owner_name}</p></td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-bold capitalize ${TYPE_COLORS[d.deduction_type] || "bg-bg text-muted"}`}>
                        {d.deduction_type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-purple-400 font-black text-base">
                        {formatZAR(d.amount)}
                      </span>
                    </td>
                    <td className="px-4 py-3"><p className="text-sm text-muted max-w-[180px] truncate" title={d.reason}>{d.reason}</p></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {STATUS_ICONS[d.status]}
                        <span className={`text-xs font-bold capitalize ${d.status === "pending" ? "text-yellow-400" : d.status === "applied" ? "text-green-400" : "text-muted"}`}>
                          {d.status}
                        </span>
                      </div>
                      {d.applied_at && (
                        <p className="text-xs text-muted mt-1">Applied {formatDate(d.applied_at)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3"><p className="text-xs text-muted">{formatDate(d.created_at)}</p></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AdminShell>
  );
}
