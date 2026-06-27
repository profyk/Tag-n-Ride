"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Spinner, Input } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { Search, FileText, AlertTriangle, CheckCircle, Clock } from "lucide-react";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}` });

const STATUS_COLORS: Record<string, string> = {
  expired: "bg-red-500/20 text-red-400 border border-red-500/30",
  expiring_soon: "bg-orange-500/20 text-orange-400 border border-orange-500/30",
  valid: "bg-green-500/20 text-green-400 border border-green-500/30",
};

const DOC_LABELS: Record<string, string> = {
  pdp: "PDP", license: "Driver's Licence", roadworthy: "Roadworthy Cert", insurance: "Insurance",
};

export default function FleetDocumentsPage() {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const load = (status = filter) => {
    setLoading(true);
    fetch(`${BASE}/api/admin/fleet/document-expiry?status=${status}`, { headers: authHeaders() })
      .then(r => r.json()).then(d => setDocs(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleFilter = (s: string) => { setFilter(s); load(s); };

  const visible = docs.filter(d =>
    !search || d.driver_name?.toLowerCase().includes(search.toLowerCase()) ||
    d.owner_name?.toLowerCase().includes(search.toLowerCase()) ||
    d.driver_phone?.includes(search)
  );

  const expiredCount = docs.filter(d => d.status === "expired").length;
  const soonCount = docs.filter(d => d.status === "expiring_soon").length;
  const validCount = docs.filter(d => d.status === "valid").length;

  return (
    <AdminShell title="Driver Document Expiry" subtitle="Fleet-wide licence, PDP, roadworthy and insurance tracking">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="text-red-400" size={22} />
          <div>
            <p className="text-red-400 font-black text-2xl">{expiredCount}</p>
            <p className="text-red-400/70 text-xs font-semibold uppercase tracking-wider">Expired</p>
          </div>
        </div>
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 flex items-center gap-3">
          <Clock className="text-orange-400" size={22} />
          <div>
            <p className="text-orange-400 font-black text-2xl">{soonCount}</p>
            <p className="text-orange-400/70 text-xs font-semibold uppercase tracking-wider">Expiring ≤30 days</p>
          </div>
        </div>
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle className="text-green-400" size={22} />
          <div>
            <p className="text-green-400 font-black text-2xl">{validCount}</p>
            <p className="text-green-400/70 text-xs font-semibold uppercase tracking-wider">Valid</p>
          </div>
        </div>
      </div>

      {/* Filters + search */}
      <div className="flex gap-3 mb-4 flex-wrap">
        {["all", "expired", "expiring_soon", "valid"].map(s => (
          <button key={s} onClick={() => handleFilter(s)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${filter === s
              ? "bg-cyan text-bg border-cyan"
              : "bg-bg2 text-muted border-border hover:border-cyan/40"}`}>
            {s === "expiring_soon" ? "Expiring Soon" : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        <div className="flex items-center gap-2 bg-bg2 border border-border rounded-lg px-3 py-1.5 ml-auto">
          <Search size={14} className="text-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search driver, owner…"
            className="bg-transparent text-sm text-text outline-none w-48 placeholder:text-muted" />
        </div>
      </div>

      <Card>
        {loading ? <Spinner /> : visible.length === 0 ? (
          <div className="text-center py-12 text-muted">
            <FileText size={40} className="mx-auto mb-3 opacity-40" />
            <p className="font-semibold">No documents found</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  {["Driver", "Owner", "Document", "Expiry Date", "Days Left", "Status"].map(h => (
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
                      <span className="px-2 py-1 bg-bg rounded text-xs font-bold text-muted uppercase tracking-wider">
                        {DOC_LABELS[d.document_type] || d.document_type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-mono text-text">{d.expiry_date || "—"}</p>
                      {d.notes && <p className="text-xs text-muted mt-1">{d.notes}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {d.days_left !== null ? (
                        <span className={`text-sm font-bold ${d.days_left < 0 ? "text-red-400" : d.days_left <= 30 ? "text-orange-400" : "text-green-400"}`}>
                          {d.days_left < 0 ? `${Math.abs(d.days_left)}d overdue` : d.days_left === 0 ? "Today" : `${d.days_left}d`}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${STATUS_COLORS[d.status] || ""}`}>
                        {d.status === "expiring_soon" ? "EXPIRING SOON" : d.status?.toUpperCase()}
                      </span>
                    </td>
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
