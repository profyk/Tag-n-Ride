"use client";
import { useEffect, useState, useCallback } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Spinner, Input, StatCard } from "@/components/ui";
import { formatDate, formatZAR } from "@/lib/utils";
import {
  Scale, AlertTriangle, RotateCcw, Flag, RefreshCw,
  Search, Filter, ChevronDown, ChevronUp, ExternalLink,
  CheckCircle, Clock, XCircle, ArrowRight,
} from "lucide-react";
import toast from "react-hot-toast";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

type TicketType = "dispute" | "refund" | "flagged" | "kyc_rejected";
type TicketStatus = "open" | "pending" | "resolved" | "rejected";

interface Ticket {
  id: string;
  type: TicketType;
  user_id: string;
  user_name: string;
  phone?: string;
  amount?: number;
  reason?: string;
  status: TicketStatus;
  created_at: string;
  updated_at?: string;
  reference?: string;
  priority: "high" | "medium" | "low";
  metadata?: Record<string, any>;
}

const TYPE_CONFIG: Record<TicketType, { label: string; icon: any; tone: string }> = {
  dispute:     { label: "Dispute",      icon: Scale,          tone: "red" },
  refund:      { label: "Refund",       icon: RotateCcw,      tone: "yellow" },
  flagged:     { label: "Flagged User", icon: Flag,           tone: "orange" },
  kyc_rejected:{ label: "KYC Rejected", icon: AlertTriangle,  tone: "purple" },
};

const STATUS_CONFIG: Record<TicketStatus, { tone: string; label: string }> = {
  open:     { tone: "green",  label: "Open" },
  pending:  { tone: "yellow", label: "Pending" },
  resolved: { tone: "cyan",   label: "Resolved" },
  rejected: { tone: "red",    label: "Rejected" },
};

const PRIORITY_CONFIG: Record<string, { tone: string }> = {
  high:   { tone: "red" },
  medium: { tone: "yellow" },
  low:    { tone: "cyan" },
};

function buildTicketsFromAPIs(disputes: any[], refunds: any[], flagged: any[]): Ticket[] {
  const tickets: Ticket[] = [];

  disputes.forEach((d: any) => {
    tickets.push({
      id: d.id,
      type: "dispute",
      user_id: d.user_id || d.passenger_id || "",
      user_name: d.user_name || d.passenger_name || "Unknown",
      phone: d.phone,
      amount: d.amount,
      reason: d.description || d.reason,
      status: d.status === "resolved" ? "resolved" : d.status === "rejected" ? "rejected" : d.status === "pending" ? "pending" : "open",
      created_at: d.created_at,
      updated_at: d.updated_at,
      reference: d.reference || d.transaction_id,
      priority: d.amount && d.amount > 500 ? "high" : "medium",
      metadata: d,
    });
  });

  refunds.forEach((r: any) => {
    if (r.status === "approved" || r.status === "paid") return;
    tickets.push({
      id: r.id,
      type: "refund",
      user_id: r.user_id || "",
      user_name: r.user_name || "Unknown",
      phone: r.phone,
      amount: r.amount,
      reason: r.reason,
      status: r.status === "pending" ? "pending" : r.status === "rejected" ? "rejected" : "open",
      created_at: r.created_at,
      updated_at: r.updated_at,
      reference: r.transaction_id,
      priority: r.amount && r.amount > 300 ? "high" : "low",
      metadata: r,
    });
  });

  flagged.forEach((u: any) => {
    tickets.push({
      id: `flag-${u.id}`,
      type: "flagged",
      user_id: u.id,
      user_name: u.full_name || u.name || u.phone_number || "Unknown",
      phone: u.phone_number,
      reason: u.flag_reason || "Flagged for review",
      status: "open",
      created_at: u.flagged_at || u.created_at,
      priority: "medium",
      metadata: u,
    });
  });

  return tickets.sort((a, b) => {
    const pOrder = { high: 0, medium: 1, low: 2 };
    const pDiff = pOrder[a.priority] - pOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TicketType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "all">("open");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [disputes, refunds, users] = await Promise.all([
        fetch(`${BASE}/api/admin/disputes`, { headers: authHeaders() })
          .then(r => r.json()).then(d => Array.isArray(d) ? d : (d.disputes || d.data || [])).catch(() => []),
        fetch(`${BASE}/api/admin/refunds?status=pending`, { headers: authHeaders() })
          .then(r => r.json()).then(d => Array.isArray(d) ? d : (d.refunds || d.data || [])).catch(() => []),
        fetch(`${BASE}/api/admin/users?flagged=true&limit=50`, { headers: authHeaders() })
          .then(r => r.json()).then(d => Array.isArray(d) ? d : (d.users || d.data || [])).catch(() => []),
      ]);
      setTickets(buildTicketsFromAPIs(disputes, refunds, users));
    } catch (e: any) { toast.error("Failed to load tickets"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const handleResolve = async (ticket: Ticket) => {
    setResolvingId(ticket.id);
    try {
      if (ticket.type === "dispute") {
        await fetch(`${BASE}/api/admin/disputes/${ticket.id}`, {
          method: "PATCH", headers: authHeaders(),
          body: JSON.stringify({ status: "resolved" }),
        });
      } else if (ticket.type === "refund") {
        await fetch(`${BASE}/api/admin/refunds/${ticket.id}/approve`, {
          method: "POST", headers: authHeaders(),
        });
      } else if (ticket.type === "flagged") {
        await fetch(`${BASE}/api/admin/users/${ticket.user_id}/unflag`, {
          method: "POST", headers: authHeaders(),
        });
      }
      toast.success(`${TYPE_CONFIG[ticket.type].label} resolved`);
      setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, status: "resolved" } : t));
    } catch (e: any) { toast.error(e.message || "Failed to resolve"); }
    finally { setResolvingId(null); }
  };

  const filtered = tickets.filter(t => {
    if (typeFilter !== "all" && t.type !== typeFilter) return false;
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return t.user_name.toLowerCase().includes(q) ||
        t.phone?.includes(q) ||
        t.reason?.toLowerCase().includes(q) ||
        t.reference?.toLowerCase().includes(q);
    }
    return true;
  });

  const counts = {
    open: tickets.filter(t => t.status === "open").length,
    pending: tickets.filter(t => t.status === "pending").length,
    disputes: tickets.filter(t => t.type === "dispute").length,
    refunds: tickets.filter(t => t.type === "refund").length,
    flagged: tickets.filter(t => t.type === "flagged").length,
    high: tickets.filter(t => t.priority === "high" && t.status !== "resolved").length,
  };

  return (
    <AdminShell title="Support Tickets">
      <div className="space-y-5">

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <StatCard label="Open" value={counts.open.toString()} tone={counts.open > 0 ? "red" : "green"} />
          <StatCard label="Pending" value={counts.pending.toString()} tone="yellow" />
          <StatCard label="High Priority" value={counts.high.toString()} tone={counts.high > 0 ? "red" : "cyan"} />
          <StatCard label="Disputes" value={counts.disputes.toString()} tone="red" />
          <StatCard label="Refunds" value={counts.refunds.toString()} tone="yellow" />
          <StatCard label="Flagged" value={counts.flagged.toString()} tone="purple" />
        </div>

        <Card>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-48">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-textDim" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search user, reason, reference..."
                className="w-full pl-7 pr-3 py-2 bg-bg3 border border-border rounded-lg text-sm text-text placeholder:text-textDim focus:outline-none focus:border-cyan" />
            </div>

            <div className="flex gap-2 flex-wrap">
              {(["all", "open", "pending", "resolved"] as const).map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border capitalize transition-all ${
                    statusFilter === s ? "bg-cyanDim border-cyan/30 text-cyan" : "bg-bg border-border text-textMuted"
                  }`}>
                  {s}{s === "open" && counts.open > 0 ? ` (${counts.open})` : ""}
                  {s === "pending" && counts.pending > 0 ? ` (${counts.pending})` : ""}
                </button>
              ))}
            </div>

            <div className="flex gap-2 flex-wrap">
              {(["all", "dispute", "refund", "flagged"] as const).map(t => (
                <button key={t} onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all capitalize ${
                    typeFilter === t ? "bg-cyanDim border-cyan/30 text-cyan" : "bg-bg border-border text-textMuted"
                  }`}>
                  {t === "all" ? "All Types" : TYPE_CONFIG[t as TicketType].label}
                </button>
              ))}
            </div>

            <button onClick={load} className="text-textDim hover:text-cyan transition-colors ml-auto">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>

          {loading ? <Spinner /> : filtered.length === 0 ? (
            <div className="text-center py-16">
              <CheckCircle size={32} className="text-green mx-auto mb-3" />
              <p className="text-text font-bold">All clear</p>
              <p className="text-textMuted text-sm mt-1">No tickets match your filters</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(t => {
                const Cfg = TYPE_CONFIG[t.type];
                const Icon = Cfg.icon;
                const isExp = expanded === t.id;
                const isRes = t.status === "resolved" || t.status === "rejected";

                return (
                  <div key={t.id} className={`border rounded-xl overflow-hidden transition-all ${
                    t.priority === "high" && !isRes ? "border-red/30" : "border-border"
                  }`}>
                    <div
                      onClick={() => setExpanded(isExp ? null : t.id)}
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-bg3 transition-colors">

                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 bg-${Cfg.tone}/10`}>
                        <Icon size={14} className={`text-${Cfg.tone}`} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-text font-bold text-sm">{t.user_name}</span>
                          <Badge label={Cfg.label} tone={Cfg.tone as any} />
                          <Badge label={STATUS_CONFIG[t.status].label} tone={STATUS_CONFIG[t.status].tone as any} />
                          {t.priority === "high" && !isRes && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-red/10 text-red border border-red/20">HIGH</span>
                          )}
                        </div>
                        <p className="text-textMuted text-xs mt-0.5 truncate">
                          {t.reason || "No description"}{t.amount ? ` — ${formatZAR(t.amount)}` : ""}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-textDim text-[10px] whitespace-nowrap">{formatDate(t.created_at)}</span>
                        {!isRes && (
                          <Button
                            onClick={e => { e.stopPropagation(); handleResolve(t); }}
                            loading={resolvingId === t.id}
                            className="text-xs py-1 px-3">
                            Resolve
                          </Button>
                        )}
                        {isExp ? <ChevronUp size={14} className="text-textDim" /> : <ChevronDown size={14} className="text-textDim" />}
                      </div>
                    </div>

                    {isExp && (
                      <div className="px-4 pb-3 pt-1 bg-bg2 border-t border-border">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-xs mb-3">
                          <div><span className="text-textMuted">User ID</span><p className="text-text font-mono text-[10px] truncate">{t.user_id}</p></div>
                          {t.phone && <div><span className="text-textMuted">Phone</span><p className="text-text font-mono">{t.phone}</p></div>}
                          {t.reference && <div><span className="text-textMuted">Reference</span><p className="text-text font-mono text-[10px]">{t.reference}</p></div>}
                          {t.amount && <div><span className="text-textMuted">Amount</span><p className="text-cyan font-bold">{formatZAR(t.amount)}</p></div>}
                          {t.updated_at && <div><span className="text-textMuted">Last updated</span><p className="text-text">{formatDate(t.updated_at)}</p></div>}
                        </div>
                        {t.reason && (
                          <div className="p-2.5 bg-bg border border-border rounded-lg mb-3">
                            <p className="text-textDim text-[10px] font-bold uppercase mb-1">Reason / Description</p>
                            <p className="text-text text-xs">{t.reason}</p>
                          </div>
                        )}
                        <div className="flex gap-2 flex-wrap">
                          <a href={`/admin/support?q=${encodeURIComponent(t.phone || t.user_id)}`} target="_blank"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cyan/20 bg-cyan/10 text-cyan text-xs font-bold hover:bg-cyan/20 transition-colors">
                            <ExternalLink size={11} /> View User Account
                          </a>
                          {t.type === "dispute" && (
                            <a href="/admin/disputes" target="_blank"
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-textMuted text-xs font-bold hover:border-cyan/20 hover:text-cyan transition-colors">
                              <Scale size={11} /> Open in Disputes
                            </a>
                          )}
                          {t.type === "refund" && (
                            <a href="/admin/refunds" target="_blank"
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-textMuted text-xs font-bold hover:border-cyan/20 hover:text-cyan transition-colors">
                              <RotateCcw size={11} /> Open in Refunds
                            </a>
                          )}
                          {!isRes && (
                            <button
                              onClick={() => handleResolve(t)}
                              disabled={resolvingId === t.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-green/20 bg-green/10 text-green text-xs font-bold hover:bg-green/20 transition-colors disabled:opacity-50">
                              <CheckCircle size={11} />
                              {resolvingId === t.id ? "Resolving..." : `Mark ${t.type === "refund" ? "Approved" : "Resolved"}`}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <p className="text-textDim text-xs mt-3">{filtered.length} ticket{filtered.length !== 1 ? "s" : ""} shown</p>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}
