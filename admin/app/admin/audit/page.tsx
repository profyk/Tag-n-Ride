"use client";
import { useState, useEffect, useCallback } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Table, Tr, Td, Badge, Button, Spinner, Input, Card, Select } from "@/components/ui";
import { api, AuditLog, getRole } from "@/lib/api";
import { formatDate, roleBadgeColor, actionColor } from "@/lib/utils";
import { Archive, RefreshCw, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, Download, X, Shield, Filter } from "lucide-react";
import toast from "react-hot-toast";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

const SENSITIVE_ACTIONS = [
  "delete_user", "block_user", "approve_withdrawal", "kyc_approve",
  "reset_pin", "force_logout", "suspend_admin", "archive_audit",
  "process_refund", "freeze_wallet", "remove_blacklist",
];

const ACTION_TYPES = [
  "kyc_approve", "kyc_reject", "approve_withdrawal", "reject_withdrawal",
  "block_user", "unblock_user", "reset_pin", "flag_user", "unflag_user",
  "freeze_wallet", "unfreeze_wallet", "delete_user", "verify_driver",
  "create_admin", "suspend_admin", "update_config", "process_refund",
  "revoke_session", "add_blacklist", "remove_blacklist", "login",
];

function isSensitive(action: string) {
  return SENSITIVE_ACTIONS.some(s => action.toLowerCase().includes(s.replace("_", "")));
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [successFilter, setSuccessFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [archiveModal, setArchiveModal] = useState(false);
  const [archiveMonths, setArchiveMonths] = useState(6);
  const [archiving, setArchiving] = useState(false);
  const [archiveResult, setArchiveResult] = useState<any>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedLogs, setArchivedLogs] = useState<any[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const isSuperAdmin = getRole() === "superadmin";

  const load = useCallback(() => {
    api.auditLogs().then((r) => setLogs(r.data)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, load]);

  const filtered = logs.filter((l) => {
    const matchSearch =
      !search ||
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      l.admin_name?.toLowerCase().includes(search.toLowerCase()) ||
      l.target_id?.toLowerCase().includes(search.toLowerCase());
    const matchAction = !actionFilter || l.action === actionFilter;
    const matchSuccess =
      successFilter === "" ? true :
      successFilter === "ok" ? l.success :
      !l.success;
    const matchFrom = !from || new Date(l.created_at) >= new Date(from);
    const matchTo = !to || new Date(l.created_at) <= new Date(to + "T23:59:59");
    return matchSearch && matchAction && matchSuccess && matchFrom && matchTo;
  });

  const sensitiveCount = filtered.filter(l => isSensitive(l.action)).length;
  const failedCount = filtered.filter(l => !l.success).length;

  const handleArchive = async () => {
    setArchiving(true);
    try {
      const res = await fetch(`${BASE}/api/admin/audit/archive`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ months: archiveMonths }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Archive failed");
      setArchiveResult(data);
      toast.success(`Archived ${data.archived} entries`);
      setArchiveModal(false);
      api.auditLogs().then(r => setLogs(r.data));
    } catch (e: any) { toast.error(e.message); }
    finally { setArchiving(false); }
  };

  const loadArchived = async () => {
    setArchivedLoading(true);
    try {
      const res = await fetch(`${BASE}/api/admin/audit/archive`, { headers: authHeaders() });
      const data = await res.json();
      setArchivedLogs(Array.isArray(data) ? data : []);
    } catch (e) {}
    finally { setArchivedLoading(false); }
  };

  const clearFilters = () => {
    setSearch(""); setActionFilter(""); setSuccessFilter(""); setFrom(""); setTo("");
  };

  const hasActiveFilters = search || actionFilter || successFilter || from || to;

  const exportCsv = () => {
    const rows = [
      ["Admin", "Role", "Action", "Target", "IP", "Success", "Date"],
      ...filtered.map(l => [
        l.admin_name || "System",
        l.admin_role || "",
        l.action,
        l.target_id || "",
        l.ip_address || "",
        l.success ? "OK" : "FAIL",
        formatDate(l.created_at),
      ]),
    ];
    const csv = rows.map(r => r.map((c: string | number) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success("Exported");
  };

  return (
    <AdminShell title="Audit Log">
      <div className="space-y-4">

        {/* Summary bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="py-2.5 px-4">
            <p className="text-[10px] text-textMuted font-bold uppercase tracking-widest">Total Logs</p>
            <p className="text-xl font-extrabold text-text">{logs.length.toLocaleString()}</p>
          </Card>
          <Card className="py-2.5 px-4">
            <p className="text-[10px] text-textMuted font-bold uppercase tracking-widest">Showing</p>
            <p className="text-xl font-extrabold text-cyan">{filtered.length.toLocaleString()}</p>
          </Card>
          <Card className={`py-2.5 px-4 ${sensitiveCount > 0 ? "border-yellow/30" : ""}`}>
            <p className="text-[10px] text-textMuted font-bold uppercase tracking-widest">Sensitive</p>
            <p className={`text-xl font-extrabold ${sensitiveCount > 0 ? "text-yellow" : "text-textMuted"}`}>
              {sensitiveCount}
            </p>
          </Card>
          <Card className={`py-2.5 px-4 ${failedCount > 0 ? "border-red/30" : ""}`}>
            <p className="text-[10px] text-textMuted font-bold uppercase tracking-widest">Failed Ops</p>
            <p className={`text-xl font-extrabold ${failedCount > 0 ? "text-red" : "text-green"}`}>
              {failedCount}
            </p>
          </Card>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <Input
              placeholder="Search action, admin, target ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant="secondary" onClick={() => setFiltersOpen(v => !v)}>
            <Filter size={13} /> Filters {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-cyan inline-block ml-0.5" />}
          </Button>
          <Button variant="secondary" onClick={exportCsv}>
            <Download size={13} /> Export
          </Button>
          <Button
            variant={autoRefresh ? "primary" : "secondary"}
            onClick={() => setAutoRefresh(v => !v)}>
            <RefreshCw size={13} className={autoRefresh ? "animate-spin" : ""} />
            {autoRefresh ? "Live" : "Auto"}
          </Button>
          {isSuperAdmin && (
            <Button variant="ghost" onClick={() => setArchiveModal(true)}>
              <Archive size={13} /> Archive
            </Button>
          )}
        </div>

        {/* Expandable filters */}
        {filtersOpen && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-bg2 border border-border rounded-xl">
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Action</label>
              <Select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
                <option value="">All actions</option>
                {ACTION_TYPES.map(a => (
                  <option key={a} value={a}>{a.replace(/_/g, " ")}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Result</label>
              <Select value={successFilter} onChange={(e) => setSuccessFilter(e.target.value)}>
                <option value="">All results</option>
                <option value="ok">Success only</option>
                <option value="fail">Failed only</option>
              </Select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">From</label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">To</label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            {hasActiveFilters && (
              <div className="col-span-full flex justify-end">
                <Button variant="ghost" onClick={clearFilters}><X size={13} /> Clear filters</Button>
              </div>
            )}
          </div>
        )}

        {archiveResult && (
          <div className="flex items-center gap-3 p-3 bg-green/5 border border-green/20 rounded-xl">
            <CheckCircle size={14} className="text-green flex-shrink-0" />
            <p className="text-green text-sm font-bold">{archiveResult.message}</p>
            <button onClick={() => setArchiveResult(null)} className="ml-auto text-textDim hover:text-text text-xs">Dismiss</button>
          </div>
        )}

        {loading ? <Spinner /> : (
          <Table
            headers={["Admin", "Role", "Action", "Target", "IP", "Result", "Date"]}
            empty={!filtered.length}>
            {filtered.map((log) => {
              const sensitive = isSensitive(log.action);
              return (
                <Tr key={log.id} className={sensitive ? "bg-yellow/3" : ""}>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      {sensitive && <Shield size={11} className="text-yellow flex-shrink-0" />}
                      <span className="font-semibold">{log.admin_name || "System"}</span>
                    </div>
                  </Td>
                  <Td>
                    {log.admin_role && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${roleBadgeColor(log.admin_role)}`}>
                        {log.admin_role}
                      </span>
                    )}
                  </Td>
                  <Td>
                    <span className={`font-mono text-xs font-bold ${sensitive ? "text-yellow" : actionColor(log.action)}`}>
                      {log.action.replace(/_/g, " ")}
                    </span>
                  </Td>
                  <Td className="font-mono text-[11px] text-textMuted">
                    {log.target_id ? log.target_id.slice(0, 14) + "..." : "—"}
                  </Td>
                  <Td className="font-mono text-[11px] text-textMuted">
                    {log.ip_address || "—"}
                  </Td>
                  <Td>
                    <Badge label={log.success ? "OK" : "FAIL"} tone={log.success ? "green" : "red"} />
                  </Td>
                  <Td className="text-textMuted text-xs">{formatDate(log.created_at)}</Td>
                </Tr>
              );
            })}
          </Table>
        )}

        {isSuperAdmin && (
          <div>
            <button
              onClick={() => { setShowArchived(v => !v); if (!showArchived) loadArchived(); }}
              className="flex items-center gap-2 text-textMuted hover:text-text transition-colors text-sm font-bold">
              <Archive size={14} />
              View Archive
              {showArchived ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            {showArchived && (
              <div className="mt-3">
                {archivedLoading ? <Spinner /> : archivedLogs.length === 0 ? (
                  <p className="text-textMuted text-sm text-center py-6">No archived logs</p>
                ) : (
                  <Table
                    headers={["Admin", "Action", "Target", "Original Date", "Archived"]}
                    empty={false}>
                    {archivedLogs.map(log => (
                      <Tr key={log.id}>
                        <Td className="font-semibold text-sm">{log.admin_id?.slice(0, 8) || "System"}</Td>
                        <Td>
                          <span className="font-mono text-xs font-bold text-textMuted">
                            {log.action.replace(/_/g, " ")}
                          </span>
                        </Td>
                        <Td className="font-mono text-[11px] text-textMuted">
                          {log.target_id ? log.target_id.slice(0, 14) + "..." : "—"}
                        </Td>
                        <Td className="text-textMuted text-xs">{formatDate(log.original_created_at)}</Td>
                        <Td className="text-textDim text-xs">{formatDate(log.archived_at)}</Td>
                      </Tr>
                    ))}
                  </Table>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {archiveModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-bg2 border border-border rounded-2xl p-6 w-full max-w-sm">
            <div className="w-12 h-12 rounded-xl bg-yellow/10 border border-yellow/20 flex items-center justify-center mx-auto mb-4">
              <Archive size={20} className="text-yellow" />
            </div>
            <h2 className="text-text font-bold text-lg text-center mb-1">Archive Audit Logs</h2>
            <p className="text-textMuted text-sm text-center mb-4">
              Logs are moved to archive — never deleted. This action itself is logged.
            </p>
            <div className="mb-4">
              <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1 block">
                Archive logs older than
              </label>
              <select
                value={archiveMonths}
                onChange={e => setArchiveMonths(parseInt(e.target.value))}
                className="w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-text text-sm focus:outline-none focus:border-yellow">
                <option value={3}>3 months</option>
                <option value={6}>6 months</option>
                <option value={12}>12 months</option>
                <option value={24}>24 months</option>
              </select>
            </div>
            <div className="flex items-start gap-2 p-3 bg-yellow/5 border border-yellow/20 rounded-lg mb-4">
              <AlertTriangle size={13} className="text-yellow flex-shrink-0 mt-0.5" />
              <p className="text-yellow/80 text-xs">
                Archived logs are preserved permanently and can be viewed in the archive tab.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setArchiveModal(false)}
                className="flex-1 py-2.5 bg-bg3 border border-border rounded-xl text-textMuted text-sm font-bold hover:text-text transition-colors">
                Cancel
              </button>
              <button
                onClick={handleArchive}
                disabled={archiving}
                className="flex-1 py-2.5 bg-yellow/20 border border-yellow/30 rounded-xl text-yellow text-sm font-bold disabled:opacity-50 hover:bg-yellow/30 transition-colors">
                {archiving ? "Archiving..." : "Archive"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
