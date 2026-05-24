"use client";
import { useState, useEffect } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Table, Tr, Td, Badge, Spinner, Input } from "@/components/ui";
import { api, AuditLog, hasPermission, getRole } from "@/lib/api";
import { formatDate, roleBadgeColor, actionColor } from "@/lib/utils";
import { Archive, RefreshCw, ChevronDown, ChevronUp, AlertTriangle, CheckCircle } from "lucide-react";
import toast from "react-hot-toast";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [archiveModal, setArchiveModal] = useState(false);
  const [archiveMonths, setArchiveMonths] = useState(6);
  const [archiving, setArchiving] = useState(false);
  const [archiveResult, setArchiveResult] = useState<any>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedLogs, setArchivedLogs] = useState<any[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);

  const isSuperAdmin = getRole() === "superadmin";

  useEffect(() => {
    api.auditLogs().then((r) => setLogs(r.data)).finally(() => setLoading(false));
  }, []);

  const filtered = logs.filter((l) =>
    !search ||
    l.action.toLowerCase().includes(search.toLowerCase()) ||
    l.admin_name?.toLowerCase().includes(search.toLowerCase()) ||
    l.target_id?.toLowerCase().includes(search.toLowerCase())
  );

  const handleArchive = async () => {
    if (!confirm(`Archive all audit logs older than ${archiveMonths} months? They will be moved to the archive (not deleted).`)) return;
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
    } catch (e) { console.error(e); }
    finally { setArchivedLoading(false); }
  };

  return (
    <AdminShell title="Audit Log">
      <div className="space-y-4">

        <div className="flex items-center justify-between gap-4">
          <p className="text-textMuted text-sm">
            All admin actions are logged for compliance and security.
            Showing last {logs.length} entries.
          </p>
          <div className="flex items-center gap-2">
            {isSuperAdmin && (
              <button onClick={() => setArchiveModal(true)}
                className="flex items-center gap-2 px-3 py-2 bg-bg2 border border-border rounded-lg text-textMuted text-xs font-bold hover:text-yellow hover:border-yellow/30 transition-all">
                <Archive size={13} />
                Archive Old Logs
              </button>
            )}
            <Input
              placeholder="Search action, admin, target..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-72"
            />
          </div>
        </div>

        {archiveResult && (
          <div className="flex items-center gap-3 p-3 bg-green/5 border border-green/20 rounded-xl">
            <CheckCircle size={14} className="text-green flex-shrink-0" />
            <p className="text-green text-sm font-bold">
              {archiveResult.message}
            </p>
            <button onClick={() => setArchiveResult(null)} className="ml-auto text-textDim hover:text-text text-xs">Dismiss</button>
          </div>
        )}

        {loading ? <Spinner /> : (
          <Table
            headers={["Admin", "Role", "Action", "Target", "IP", "Success", "Date"]}
            empty={!filtered.length}>
            {filtered.map((log) => (
              <Tr key={log.id}>
                <Td className="font-semibold">{log.admin_name || "System"}</Td>
                <Td>
                  {log.admin_role && (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${roleBadgeColor(log.admin_role)}`}>
                      {log.admin_role}
                    </span>
                  )}
                </Td>
                <Td>
                  <span className={`font-mono text-xs font-bold ${actionColor(log.action)}`}>
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
            ))}
          </Table>
        )}

        {isSuperAdmin && (
          <div>
            <button onClick={() => { setShowArchived(v => !v); if (!showArchived) loadArchived(); }}
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
                        <Td className="font-semibold text-sm">{log.admin_id?.slice(0,8) || "System"}</Td>
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
              <select value={archiveMonths} onChange={e => setArchiveMonths(parseInt(e.target.value))}
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
                They cannot be deleted by anyone.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setArchiveModal(false)}
                className="flex-1 py-2.5 bg-bg3 border border-border rounded-xl text-textMuted text-sm font-bold hover:text-text transition-colors">
                Cancel
              </button>
              <button onClick={handleArchive} disabled={archiving}
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
