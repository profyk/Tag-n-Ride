"use client";
import { useState, useEffect } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Table, Tr, Td, Badge, Button, Spinner } from "@/components/ui";
import { api, Session } from "@/lib/api";
import { formatDate, roleBadgeColor } from "@/lib/utils";
import { LogOut, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { isSuperAdmin } from "@/lib/api";
import { useRouter } from "next/navigation";

export default function SessionsPage() {
  const router = useRouter();
  const superAdmin = isSuperAdmin();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.sessions().then((r) => setSessions(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!superAdmin) { router.push("/admin/dashboard"); return; }
    load();
  }, []);

  const handleRevoke = async (id: string, name: string) => {
    if (!confirm(`Revoke session for ${name}?`)) return;
    try { await api.revokeSession(id); toast.success("Session revoked"); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  if (!superAdmin) return null;

  return (
    <AdminShell title="Active Sessions">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-textMuted text-sm">
            {sessions.length} active admin session{sessions.length !== 1 ? "s" : ""}
          </p>
          <Button variant="secondary" onClick={load}>
            <RefreshCw size={13} /> Refresh
          </Button>
        </div>

        {loading ? <Spinner /> : (
          <Table
            headers={["Admin", "Email", "Role", "IP Address", "Started", "Expires", "Actions"]}
            empty={!sessions.length}>
            {sessions.map((s) => (
              <Tr key={s.id}>
                <Td className="font-semibold">{s.full_name}</Td>
                <Td className="text-textMuted text-sm">{s.email}</Td>
                <Td>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${roleBadgeColor(s.role)}`}>
                    {s.role}
                  </span>
                </Td>
                <Td className="font-mono text-xs text-textMuted">{s.ip_address || "—"}</Td>
                <Td className="text-textMuted text-xs">{formatDate(s.created_at)}</Td>
                <Td className="text-textMuted text-xs">{formatDate(s.expires_at)}</Td>
                <Td>
                  <Button variant="danger" onClick={() => handleRevoke(s.id, s.full_name)}>
                    <LogOut size={12} /> Revoke
                  </Button>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </div>
    </AdminShell>
  );
}
