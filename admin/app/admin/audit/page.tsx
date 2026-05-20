"use client";
import { useState, useEffect } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Table, Tr, Td, Badge, Spinner, Input } from "@/components/ui";
import { api, AuditLog } from "@/lib/api";
import { formatDate, roleBadgeColor, actionColor } from "@/lib/utils";

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.auditLogs().then((r) => setLogs(r.data)).finally(() => setLoading(false));
  }, []);

  const filtered = logs.filter((l) =>
    !search ||
    l.action.toLowerCase().includes(search.toLowerCase()) ||
    l.admin_name?.toLowerCase().includes(search.toLowerCase()) ||
    l.target_id?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AdminShell title="Audit Log">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-textMuted text-sm">
            All admin actions are logged for compliance and security.
            Showing last {logs.length} entries.
          </p>
          <Input
            placeholder="Search action, admin, target..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-72"
          />
        </div>

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
      </div>
    </AdminShell>
  );
}
