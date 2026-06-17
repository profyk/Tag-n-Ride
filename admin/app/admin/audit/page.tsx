"use client";
import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Spinner } from "@/components/ui";
import { api, AuditLog, getRole, hasPermission } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import {
  Archive, RefreshCw, AlertTriangle, CheckCircle2, Download,
  X, Shield, Search, ChevronRight, ChevronDown, Copy, Check,
  Activity, Lock, Users, DollarSign, Settings2, Eye,
  XCircle, AlertOctagon, Clock, User,
} from "lucide-react";
import toast from "react-hot-toast";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authH = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

// ── Action categorisation ──────────────────────────────────────────────────
const CATEGORIES: Record<string, { label: string; icon: any; color: string; bg: string; actions: string[] }> = {
  auth: {
    label: "Auth",
    icon: Lock,
    color: "text-blue-400",
    bg: "bg-blue-400/10 border-blue-400/20",
    actions: ["login", "logout", "revoke_session", "force_logout", "reset_pin"],
  },
  users: {
    label: "User Mgmt",
    icon: Users,
    color: "text-purple",
    bg: "bg-purple/10 border-purple/20",
    actions: [
      "block_user", "unblock_user", "delete_user", "flag_user", "unflag_user",
      "kyc_approve", "kyc_reject", "verify_driver", "add_blacklist", "remove_blacklist",
    ],
  },
  finance: {
    label: "Finance",
    icon: DollarSign,
    color: "text-green",
    bg: "bg-green/10 border-green/20",
    actions: [
      "approve_withdrawal", "reject_withdrawal", "process_refund",
      "freeze_wallet", "unfreeze_wallet", "manual_ledger_adjustment",
      "run_reconciliation", "create_chargeback", "update_chargeback",
      "bill_owner_now", "waive_subscription", "STATEMENT_DOWNLOADED",
    ],
  },
  system: {
    label: "System",
    icon: Settings2,
    color: "text-yellow",
    bg: "bg-yellow/10 border-yellow/20",
    actions: [
      "create_admin", "suspend_admin", "update_config",
      "AUDIT_LOGS_ARCHIVED", "archive_audit",
    ],
  },
};

function getCategory(action: string) {
  const a = action.toLowerCase();
  for (const [key, cfg] of Object.entries(CATEGORIES)) {
    if (cfg.actions.some(x => a === x.toLowerCase() || a.includes(x.toLowerCase()))) {
      return { key, ...cfg };
    }
  }
  return { key: "other", label: "Other", icon: Activity, color: "text-textMuted", bg: "bg-bg3 border-border", actions: [] };
}

// ── Sensitive actions set ──────────────────────────────────────────────────
const SENSITIVE = new Set([
  "delete_user", "block_user", "approve_withdrawal", "kyc_approve",
  "reset_pin", "force_logout", "suspend_admin", "AUDIT_LOGS_ARCHIVED",
  "process_refund", "freeze_wallet", "remove_blacklist",
  "manual_ledger_adjustment", "create_admin", "archive_audit",
]);

function isSensitive(action: string) {
  return SENSITIVE.has(action) || SENSITIVE.has(action.toLowerCase());
}

// ── Relative time ──────────────────────────────────────────────────────────
function relTime(ts: string) {
  const ms = Date.now() - new Date(ts).getTime();
  const s  = Math.floor(ms / 1000);
  const m  = Math.floor(s / 60);
  const h  = Math.floor(m / 60);
  const d  = Math.floor(h / 24);
  if (d > 0)  return `${d}d ago`;
  if (h > 0)  return `${h}h ago`;
  if (m > 0)  return `${m}m ago`;
  return `${s}s ago`;
}

// ── Copy button ────────────────────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };
  return (
    <button onClick={copy} className="text-textDim hover:text-cyan transition-colors ml-1 flex-shrink-0" title="Copy">
      {copied ? <Check size={11} className="text-green" /> : <Copy size={11} />}
    </button>
  );
}

// ── Role badge ─────────────────────────────────────────────────────────────
const ROLE_CLS: Record<string, string> = {
  superadmin: "bg-red/10 border-red/20 text-red",
  admin:      "bg-cyan/10 border-cyan/20 text-cyan",
  finance:    "bg-green/10 border-green/20 text-green",
  support:    "bg-purple/10 border-purple/20 text-purple",
  viewer:     "bg-bg3 border-border text-textMuted",
};
function RoleBadge({ role }: { role?: string }) {
  if (!role) return null;
  const cls = ROLE_CLS[role] || "bg-bg3 border-border text-textMuted";
  return <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-widest ${cls}`}>{role}</span>;
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function AuditPage() {
  type Tab = "feed" | "security" | "archive";

  // ── Data ─────────────────────────────────────────────────────────────────
  const [logs,         setLogs]         = useState<AuditLog[]>([]);
  const [archivedLogs, setArchivedLogs] = useState<any[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveLoaded,  setArchiveLoaded]  = useState(false);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [activeTab,     setActiveTab]     = useState<Tab>("feed");
  const [search,        setSearch]        = useState("");
  const [catFilter,     setCatFilter]     = useState("all");
  const [resultFilter,  setResultFilter]  = useState<"all"|"ok"|"fail">("all");
  const [adminFilter,   setAdminFilter]   = useState("");
  const [from,          setFrom]          = useState("");
  const [to,            setTo]            = useState("");
  const [expanded,      setExpanded]      = useState<string | null>(null);
  const [filtersOpen,   setFiltersOpen]   = useState(false);
  const [countdown,     setCountdown]     = useState(60);
  const [archiveModal,  setArchiveModal]  = useState(false);
  const [archiveMonths, setArchiveMonths] = useState(6);
  const [archiving,     setArchiving]     = useState(false);

  const isSuperAdmin = getRole() === "superadmin";
  const canExport    = hasPermission("archive_audit_logs");
  const timerRef     = useRef<any>(null);

  // ── Load ─────────────────────────────────────────────────────────────────
  const load = useCallback(() => {
    setLoading(true);
    api.auditLogs()
      .then(r => setLogs(Array.isArray(r.data) ? r.data : []))
      .catch(e => toast.error(`Failed to load: ${e.message}`))
      .finally(() => setLoading(false));
  }, []);

  const loadArchive = useCallback(() => {
    if (archiveLoaded) return;
    setArchiveLoading(true);
    fetch(`${BASE}/api/admin/audit/archive`, { headers: authH() })
      .then(r => r.json())
      .then(d => { setArchivedLogs(Array.isArray(d) ? d : []); setArchiveLoaded(true); })
      .catch(() => toast.error("Failed to load archive"))
      .finally(() => setArchiveLoading(false));
  }, [archiveLoaded]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (activeTab === "archive") loadArchive();
  }, [activeTab, loadArchive]);

  // 60s auto-refresh
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown(c => { if (c <= 1) { load(); return 60; } return c - 1; });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [load]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const uniqueAdmins = useMemo(() => Array.from(new Set(logs.map(l => l.admin_name).filter((n): n is string => Boolean(n)))), [logs]);

  const todayLogs = useMemo(() => {
    const today = new Date().toDateString();
    return logs.filter(l => new Date(l.created_at).toDateString() === today);
  }, [logs]);

  const sensitiveAll = useMemo(() => logs.filter(l => isSensitive(l.action)), [logs]);
  const failedAll    = useMemo(() => logs.filter(l => !l.success),             [logs]);

  // IP abuse detection: IPs with >2 failures
  const suspiciousIPs = useMemo(() => {
    const map: Record<string, number> = {};
    logs.filter(l => !l.success && l.ip_address).forEach(l => {
      map[l.ip_address!] = (map[l.ip_address!] || 0) + 1;
    });
    return Object.entries(map).filter(([, n]) => n > 2).sort((a, b) => b[1] - a[1]);
  }, [logs]);

  // Top admins by action count
  const topAdmins = useMemo(() => {
    const map: Record<string, number> = {};
    logs.forEach(l => { if (l.admin_name) map[l.admin_name] = (map[l.admin_name] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [logs]);

  // Filtered logs
  const filtered = useMemo(() => {
    let list = activeTab === "security"
      ? logs.filter(l => !l.success || isSensitive(l.action))
      : logs;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(l =>
        l.action.toLowerCase().includes(q) ||
        (l.admin_name || "").toLowerCase().includes(q) ||
        (l.target_id || "").toLowerCase().includes(q) ||
        (l.target_type || "").toLowerCase().includes(q) ||
        (l.ip_address || "").includes(q) ||
        JSON.stringify(l.metadata).toLowerCase().includes(q)
      );
    }
    if (catFilter !== "all") {
      const cfg = CATEGORIES[catFilter];
      list = list.filter(l => cfg?.actions.some(a => l.action.toLowerCase().includes(a.toLowerCase())));
    }
    if (resultFilter !== "all")  list = list.filter(l => resultFilter === "ok" ? l.success : !l.success);
    if (adminFilter)             list = list.filter(l => l.admin_name === adminFilter);
    if (from)                    list = list.filter(l => new Date(l.created_at) >= new Date(from));
    if (to)                      list = list.filter(l => new Date(l.created_at) <= new Date(to + "T23:59:59"));
    return list;
  }, [logs, activeTab, search, catFilter, resultFilter, adminFilter, from, to]);

  const hasFilters = search || catFilter !== "all" || resultFilter !== "all" || adminFilter || from || to;

  const clearFilters = () => {
    setSearch(""); setCatFilter("all"); setResultFilter("all"); setAdminFilter(""); setFrom(""); setTo("");
  };

  // ── Export (client-side CSV from filtered list) ───────────────────────────
  const exportCsv = () => {
    const rows = [
      ["Timestamp", "Admin", "Role", "Action", "Category", "Target ID", "Target Type", "IP", "Result", "Metadata"],
      ...filtered.map(l => {
        const cat = getCategory(l.action);
        return [
          formatDate(l.created_at),
          l.admin_name || "System",
          l.admin_role || "",
          l.action,
          cat.label,
          l.target_id || "",
          l.target_type || "",
          l.ip_address || "",
          l.success ? "OK" : "FAIL",
          JSON.stringify(l.metadata || {}),
        ];
      }),
    ];
    const csv = rows.map(r => r.map((c: string) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} records`);
  };

  // ── Archive ───────────────────────────────────────────────────────────────
  const handleArchive = async () => {
    setArchiving(true);
    try {
      const res  = await fetch(`${BASE}/api/admin/audit/archive`, {
        method: "POST", headers: authH(),
        body: JSON.stringify({ months: archiveMonths }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Archive failed");
      toast.success(`Archived ${data.archived} entries`);
      setArchiveModal(false);
      setArchiveLoaded(false); // force reload next visit
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setArchiving(false); }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AdminShell title="Audit Log">
      <div className="space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <p className="text-textMuted text-xs">
            Immutable record of every admin action · Logs are never deleted — only archived
          </p>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-textDim">Refresh in {countdown}s</span>
            <button onClick={() => { load(); setCountdown(60); }} className="text-textDim hover:text-cyan transition-colors">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* ── Stats strip ── */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Card>
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Total Loaded</p>
            <p className="text-2xl font-black text-text tabular-nums">{logs.length.toLocaleString()}</p>
            <p className="text-textDim text-[10px] mt-1">Latest 500 entries</p>
          </Card>

          <Card>
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Today</p>
            <p className="text-2xl font-black text-cyan tabular-nums">{todayLogs.length}</p>
            <p className="text-textDim text-[10px] mt-1">Actions today</p>
          </Card>

          <Card>
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Admins Active</p>
            <p className="text-2xl font-black text-purple tabular-nums">{uniqueAdmins.length}</p>
            <p className="text-textDim text-[10px] mt-1">In this dataset</p>
          </Card>

          <Card className={sensitiveAll.length > 0 ? "border-yellow/20" : ""}>
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Sensitive</p>
            <p className={`text-2xl font-black tabular-nums ${sensitiveAll.length > 0 ? "text-yellow" : "text-textMuted"}`}>
              {sensitiveAll.length}
            </p>
            <p className="text-textDim text-[10px] mt-1">High-risk actions</p>
          </Card>

          <Card className={failedAll.length > 0 ? "border-red/20" : ""}>
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Failed Ops</p>
            <p className={`text-2xl font-black tabular-nums ${failedAll.length > 0 ? "text-red" : "text-green"}`}>
              {failedAll.length}
            </p>
            <p className="text-textDim text-[10px] mt-1">{failedAll.length === 0 ? "All good ✓" : "Require review"}</p>
          </Card>

          <Card className={suspiciousIPs.length > 0 ? "border-red/20" : ""}>
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Suspect IPs</p>
            <p className={`text-2xl font-black tabular-nums ${suspiciousIPs.length > 0 ? "text-red" : "text-green"}`}>
              {suspiciousIPs.length}
            </p>
            <p className="text-textDim text-[10px] mt-1">3+ failures from IP</p>
          </Card>
        </div>

        {/* ── Security alert: suspicious IPs ── */}
        {suspiciousIPs.length > 0 && (
          <div className="p-4 bg-red/5 border border-red/20 rounded-xl space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <AlertOctagon size={14} className="text-red" />
              <p className="text-red text-sm font-bold">Suspicious IP activity detected</p>
            </div>
            {suspiciousIPs.map(([ip, count]) => (
              <div key={ip} className="flex items-center justify-between px-3 py-2 bg-red/5 rounded-lg">
                <span className="font-mono text-red text-xs">{ip}</span>
                <span className="text-red text-xs font-bold">{count} failures</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Main card ── */}
        <Card>
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-cyan" />
              <h2 className="text-sm font-bold text-text">Audit Log</h2>
              {filtered.length !== logs.length && (
                <span className="text-[10px] font-bold px-2 py-0.5 bg-cyan/10 text-cyan rounded border border-cyan/20">
                  {filtered.length.toLocaleString()} / {logs.length.toLocaleString()}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Search */}
              <div className="relative">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-textDim" />
                <input
                  placeholder="Action, admin, target, IP, metadata…"
                  value={search} onChange={e => setSearch(e.target.value)}
                  className="bg-bg border border-border rounded-lg pl-8 pr-7 py-2 text-text text-xs focus:outline-none focus:border-cyan placeholder:text-textDim w-52"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-textDim hover:text-text">
                    <X size={11} />
                  </button>
                )}
              </div>
              {/* Filters toggle */}
              <button onClick={() => setFiltersOpen(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border rounded-lg transition-all ${
                  filtersOpen || hasFilters
                    ? "bg-cyan/10 border-cyan/20 text-cyan"
                    : "border-border text-textMuted hover:text-text"
                }`}>
                <Eye size={12} /> Filters
                {hasFilters && <span className="w-1.5 h-1.5 rounded-full bg-cyan" />}
              </button>
              {/* Export */}
              <button onClick={exportCsv}
                className="flex items-center gap-1.5 px-3 py-2 text-xs text-textMuted hover:text-cyan border border-border rounded-lg transition-all">
                <Download size={12} /> Export CSV
              </button>
              {/* Archive (superadmin only) */}
              {isSuperAdmin && (
                <button onClick={() => setArchiveModal(true)}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs text-yellow border border-yellow/20 rounded-lg hover:bg-yellow/10 transition-all">
                  <Archive size={12} /> Archive
                </button>
              )}
            </div>
          </div>

          {/* Filters panel */}
          {filtersOpen && (
            <div className="mb-4 p-4 bg-bg border border-border rounded-xl space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* Category */}
                <div>
                  <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Category</label>
                  <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
                    className="w-full bg-bg2 border border-border rounded-lg px-2.5 py-2 text-text text-xs focus:outline-none focus:border-cyan">
                    <option value="all">All categories</option>
                    {Object.entries(CATEGORIES).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
                {/* Result */}
                <div>
                  <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Result</label>
                  <select value={resultFilter} onChange={e => setResultFilter(e.target.value as any)}
                    className="w-full bg-bg2 border border-border rounded-lg px-2.5 py-2 text-text text-xs focus:outline-none focus:border-cyan">
                    <option value="all">All results</option>
                    <option value="ok">Success only</option>
                    <option value="fail">Failed only</option>
                  </select>
                </div>
                {/* Admin */}
                <div>
                  <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Admin</label>
                  <select value={adminFilter} onChange={e => setAdminFilter(e.target.value)}
                    className="w-full bg-bg2 border border-border rounded-lg px-2.5 py-2 text-text text-xs focus:outline-none focus:border-cyan">
                    <option value="">All admins</option>
                    {uniqueAdmins.map(a => <option key={a} value={a!}>{a}</option>)}
                  </select>
                </div>
                {/* Date range */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">From</label>
                    <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                      className="w-full bg-bg2 border border-border rounded-lg px-2 py-2 text-text text-xs focus:outline-none focus:border-cyan" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">To</label>
                    <input type="date" value={to} onChange={e => setTo(e.target.value)}
                      className="w-full bg-bg2 border border-border rounded-lg px-2 py-2 text-text text-xs focus:outline-none focus:border-cyan" />
                  </div>
                </div>
              </div>
              {hasFilters && (
                <div className="flex justify-end">
                  <button onClick={clearFilters}
                    className="flex items-center gap-1.5 text-xs text-textMuted hover:text-red border border-border px-3 py-1.5 rounded-lg transition-all">
                    <X size={11} /> Clear all filters
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 mb-4 border-b border-border">
            {([
              { id: "feed",     label: "Live Feed",   icon: Activity,  count: logs.length },
              { id: "security", label: "Security",    icon: Shield,    count: failedAll.length + sensitiveAll.length, warn: failedAll.length > 0 || sensitiveAll.length > 0 },
              ...(isSuperAdmin ? [{ id: "archive", label: "Archive", icon: Archive, count: archivedLogs.length }] : []),
            ] as const).map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id as Tab)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
                  activeTab === t.id ? "text-cyan border-cyan" : "text-textMuted border-transparent hover:text-text"
                }`}>
                <t.icon size={12} />
                {t.label}
                {(t as any).warn && activeTab !== t.id && (
                  <span className="w-1.5 h-1.5 rounded-full bg-red" />
                )}
              </button>
            ))}
          </div>

          {/* ── FEED / SECURITY LOG TABLE ── */}
          {(activeTab === "feed" || activeTab === "security") && (
            <>
              {loading ? (
                <div className="flex justify-center py-12"><Spinner /></div>
              ) : filtered.length === 0 ? (
                <div className="py-16 text-center">
                  <Activity size={32} className="mx-auto mb-3 text-textDim opacity-30" />
                  <p className="text-textMuted text-sm">{hasFilters ? "No logs match your filters" : "No audit logs"}</p>
                  {hasFilters && <button onClick={clearFilters} className="mt-2 text-xs text-cyan hover:underline">Clear filters</button>}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        {["Admin", "Action", "Category", "Target", "IP", "Result", "When", ""].map((h, i) => (
                          <th key={i} className="text-left py-2 px-3 text-textDim font-bold uppercase tracking-wider text-[10px]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(log => {
                        const cat         = getCategory(log.action);
                        const sensitive   = isSensitive(log.action);
                        const isExpanded  = expanded === log.id;
                        const hasMeta     = log.metadata && Object.keys(log.metadata).length > 0;
                        return (
                          <Fragment key={log.id}>
                            <tr className={`border-b border-border/40 hover:bg-bg3/30 transition-colors ${
                              !log.success ? "bg-red/3" : sensitive ? "bg-yellow/3" : ""
                            } ${isExpanded ? "bg-bg3/40" : ""}`}>
                              {/* Admin */}
                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-1.5">
                                  {sensitive && <Shield size={10} className="text-yellow flex-shrink-0" />}
                                  <div>
                                    <p className="font-semibold text-text text-xs leading-tight">
                                      {log.admin_name || "System"}
                                    </p>
                                    {log.admin_role && <RoleBadge role={log.admin_role} />}
                                  </div>
                                </div>
                              </td>
                              {/* Action */}
                              <td className="py-2.5 px-3">
                                <span className={`font-mono text-xs font-bold ${
                                  sensitive ? "text-yellow" : cat.color
                                }`}>
                                  {log.action.replace(/_/g, " ")}
                                </span>
                              </td>
                              {/* Category */}
                              <td className="py-2.5 px-3">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${cat.bg} ${cat.color}`}>
                                  {cat.label}
                                </span>
                              </td>
                              {/* Target */}
                              <td className="py-2.5 px-3">
                                {log.target_id ? (
                                  <div className="flex items-center gap-1">
                                    <span className="font-mono text-[10px] text-textMuted truncate max-w-[100px]" title={log.target_id}>
                                      {log.target_id.length > 12 ? log.target_id.slice(0, 10) + "…" : log.target_id}
                                    </span>
                                    <CopyBtn text={log.target_id} />
                                  </div>
                                ) : (
                                  <span className="text-textDim text-[10px]">—</span>
                                )}
                                {log.target_type && (
                                  <p className="text-textDim text-[10px]">{log.target_type}</p>
                                )}
                              </td>
                              {/* IP */}
                              <td className="py-2.5 px-3">
                                <span className={`font-mono text-[10px] ${
                                  suspiciousIPs.some(([ip]) => ip === log.ip_address) ? "text-red font-bold" : "text-textMuted"
                                }`}>
                                  {log.ip_address || "—"}
                                </span>
                              </td>
                              {/* Result */}
                              <td className="py-2.5 px-3">
                                {log.success
                                  ? <span className="flex items-center gap-1 text-green text-[10px] font-bold"><CheckCircle2 size={11} /> OK</span>
                                  : <span className="flex items-center gap-1 text-red text-[10px] font-bold"><XCircle size={11} /> FAIL</span>}
                              </td>
                              {/* When */}
                              <td className="py-2.5 px-3">
                                <p className="text-textMuted text-[10px] whitespace-nowrap">{relTime(log.created_at)}</p>
                                <p className="text-textDim text-[10px] whitespace-nowrap">{formatDate(log.created_at)}</p>
                              </td>
                              {/* Expand */}
                              <td className="py-2.5 px-2">
                                {hasMeta && (
                                  <button onClick={() => setExpanded(isExpanded ? null : log.id)}
                                    className="text-textDim hover:text-cyan transition-colors p-1 rounded">
                                    {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                  </button>
                                )}
                              </td>
                            </tr>

                            {/* Expanded metadata row */}
                            {isExpanded && hasMeta && (
                              <tr className="bg-bg3/50 border-b border-border/30">
                                <td colSpan={8} className="px-6 py-4">
                                  <div className="space-y-2">
                                    <p className="text-[10px] font-bold text-textDim uppercase tracking-widest">Metadata</p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                      {Object.entries(log.metadata).map(([k, v]) => (
                                        <div key={k} className="flex items-start gap-2 p-2 bg-bg rounded-lg border border-border">
                                          <span className="font-mono text-textDim text-[10px] font-bold min-w-[100px]">{k}</span>
                                          <span className="text-text text-[10px] break-all">{JSON.stringify(v)}</span>
                                        </div>
                                      ))}
                                    </div>
                                    {log.target_id && (
                                      <div className="flex items-center gap-2 pt-2">
                                        <span className="text-textDim text-[10px] font-bold">Full Target ID:</span>
                                        <span className="font-mono text-textMuted text-[10px]">{log.target_id}</span>
                                        <CopyBtn text={log.target_id} />
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="text-textDim text-[10px] text-center mt-3">
                    Showing {filtered.length.toLocaleString()} of {logs.length.toLocaleString()} loaded logs
                    {logs.length >= 500 && " (500 max — archive older entries to see more)"}
                  </p>
                </div>
              )}
            </>
          )}

          {/* ── ARCHIVE TAB ── */}
          {activeTab === "archive" && (
            <>
              {archiveLoading ? (
                <div className="flex justify-center py-12"><Spinner /></div>
              ) : archivedLogs.length === 0 ? (
                <div className="py-16 text-center">
                  <Archive size={32} className="mx-auto mb-3 text-textDim opacity-30" />
                  <p className="text-textMuted text-sm">No archived logs yet</p>
                  <p className="text-textDim text-xs mt-1">Use the Archive button to move old logs here</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        {["Admin", "Action", "Target", "Original Date", "Archived"].map((h, i) => (
                          <th key={i} className="text-left py-2 px-3 text-textDim font-bold uppercase tracking-wider text-[10px]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {archivedLogs.map(log => (
                        <tr key={log.id} className="border-b border-border/40 hover:bg-bg3/30 transition-colors">
                          <td className="py-2.5 px-3">
                            <p className="font-semibold text-text">{log.admin_name || log.admin_id?.slice(0, 8) || "System"}</p>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-mono text-textMuted text-xs">{log.action?.replace(/_/g, " ")}</span>
                          </td>
                          <td className="py-2.5 px-3">
                            {log.target_id ? (
                              <div className="flex items-center gap-1">
                                <span className="font-mono text-[10px] text-textMuted">{log.target_id.slice(0, 12)}…</span>
                                <CopyBtn text={log.target_id} />
                              </div>
                            ) : "—"}
                          </td>
                          <td className="py-2.5 px-3 text-textMuted text-xs">{formatDate(log.original_created_at)}</td>
                          <td className="py-2.5 px-3 text-textDim text-xs">{formatDate(log.archived_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-textDim text-[10px] text-center mt-3">
                    {archivedLogs.length} archived records (latest 200 shown)
                  </p>
                </div>
              )}
            </>
          )}
        </Card>

        {/* ── Admin Activity Breakdown ── */}
        {topAdmins.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <User size={14} className="text-cyan" />
                <h3 className="text-sm font-bold text-text">Most Active Admins</h3>
                <span className="text-textDim text-[10px]">(in this dataset)</span>
              </div>
              <div className="space-y-2">
                {topAdmins.map(([name, count], i) => {
                  const pct = Math.round((count / logs.length) * 100);
                  return (
                    <div key={name}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-textDim text-[10px] w-4 text-right">{i + 1}.</span>
                          <span className="text-text text-xs font-semibold">{name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-textMuted text-[10px]">{pct}%</span>
                          <span className="text-cyan text-xs font-bold tabular-nums">{count}</span>
                        </div>
                      </div>
                      <div className="h-1 bg-bg3 rounded-full overflow-hidden">
                        <div className="h-full bg-cyan/50 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card>
              <div className="flex items-center gap-2 mb-4">
                <Activity size={14} className="text-cyan" />
                <h3 className="text-sm font-bold text-text">Action Breakdown</h3>
              </div>
              <div className="space-y-2">
                {Object.entries(CATEGORIES).map(([key, cfg]) => {
                  const count = logs.filter(l => cfg.actions.some(a => l.action.toLowerCase().includes(a.toLowerCase()))).length;
                  if (count === 0) return null;
                  const pct = Math.round((count / logs.length) * 100);
                  const Icon = cfg.icon;
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Icon size={11} className={cfg.color} />
                          <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-textMuted text-[10px]">{pct}%</span>
                          <span className={`text-xs font-bold tabular-nums ${cfg.color}`}>{count}</span>
                        </div>
                      </div>
                      <div className="h-1 bg-bg3 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${cfg.color.replace("text-", "bg-")} opacity-50`}
                          style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          ARCHIVE MODAL
      ══════════════════════════════════════════════════════════════════ */}
      {archiveModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-bg2 border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="w-12 h-12 rounded-xl bg-yellow/10 border border-yellow/20 flex items-center justify-center mx-auto mb-4">
              <Archive size={20} className="text-yellow" />
            </div>
            <h2 className="text-text font-bold text-lg text-center mb-1">Archive Audit Logs</h2>
            <p className="text-textMuted text-sm text-center mb-5">
              Logs are moved to archive — never deleted. This action itself is permanently logged.
            </p>

            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-2">
              Archive logs older than
            </label>
            <select value={archiveMonths} onChange={e => setArchiveMonths(parseInt(e.target.value))}
              className="w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-text text-sm focus:outline-none focus:border-yellow mb-4">
              <option value={3}>3 months</option>
              <option value={6}>6 months</option>
              <option value={12}>12 months</option>
              <option value={24}>24 months</option>
            </select>

            <div className="flex items-start gap-2 p-3 bg-yellow/5 border border-yellow/20 rounded-lg mb-5">
              <AlertTriangle size={13} className="text-yellow flex-shrink-0 mt-0.5" />
              <p className="text-yellow/80 text-xs">
                Archived logs are permanently preserved and can be viewed under the Archive tab.
                This cannot be undone.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setArchiveModal(false)}
                className="flex-1 py-2.5 bg-bg3 border border-border rounded-xl text-textMuted text-sm font-bold hover:text-text transition-colors">
                Cancel
              </button>
              <button onClick={handleArchive} disabled={archiving}
                className="flex-1 py-2.5 bg-yellow/20 border border-yellow/30 rounded-xl text-yellow text-sm font-bold disabled:opacity-50 hover:bg-yellow/30 transition-colors flex items-center justify-center gap-2">
                {archiving ? <><Spinner /> Archiving…</> : "Archive"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
