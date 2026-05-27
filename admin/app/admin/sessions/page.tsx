"use client";
import { useState, useEffect } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Table, Tr, Td, Badge, Button, Spinner, Card } from "@/components/ui";
import { api, Session } from "@/lib/api";
import { formatDate, roleBadgeColor } from "@/lib/utils";
import { LogOut, RefreshCw, Shield, Monitor, Wifi, AlertTriangle, Users } from "lucide-react";
import toast from "react-hot-toast";
import { isSuperAdmin } from "@/lib/api";
import { useRouter } from "next/navigation";

export default function SessionsPage() {
  const router = useRouter();
  const superAdmin = isSuperAdmin();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

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
    setRevoking(id);
    try {
      await api.revokeSession(id);
      toast.success("Session revoked");
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRevoking(null);
    }
  };

  const handleRevokeAll = async () => {
    const others = sessions.slice(1);
    if (!others.length) { toast.error("No other sessions to revoke"); return; }
    if (!confirm(`Revoke all ${others.length} other active sessions?`)) return;
    try {
      await Promise.all(others.map(s => api.revokeSession(s.id)));
      toast.success(`${others.length} sessions revoked`);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  if (!superAdmin) return null;

  const byRole = sessions.reduce((acc: Record<string, number>, s) => {
    acc[s.role] = (acc[s.role] || 0) + 1;
    return acc;
  }, {});

  const suspiciousIps = sessions
    .map(s => s.ip_address)
    .filter(ip => ip && sessions.filter(s2 => s2.ip_address === ip).length > 1);

  const hasSuspicious = suspiciousIps.length > 0;

  return (
    <AdminShell title="Active Sessions">
      <div className="space-y-4">

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="text-center">
            <p className="text-2xl font-extrabold text-cyan">{sessions.length}</p>
            <p className="text-xs text-textMuted mt-1">Active Sessions</p>
          </Card>
          <Card className="text-center">
            <p className="text-2xl font-extrabold text-purple">{byRole["superadmin"] || 0}</p>
            <p className="text-xs text-textMuted mt-1">Superadmin</p>
          </Card>
          <Card className="text-center">
            <p className="text-2xl font-extrabold text-green">{Object.keys(byRole).length}</p>
            <p className="text-xs text-textMuted mt-1">Unique Roles</p>
          </Card>
          <Card className={`text-center ${hasSuspicious ? "border-yellow/30" : ""}`}>
            <p className={`text-2xl font-extrabold ${hasSuspicious ? "text-yellow" : "text-textMuted"}`}>
              {hasSuspicious ? suspiciousIps.length : 0}
            </p>
            <p className="text-xs text-textMuted mt-1">Shared IPs</p>
          </Card>
        </div>

        {hasSuspicious && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-yellow/10 border border-yellow/20">
            <AlertTriangle size={14} className="text-yellow" />
            <p className="text-sm text-yellow font-semibold">
              Multiple sessions from same IP detected — possible shared network or suspicious activity.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-textMuted text-sm">
            {sessions.length} active admin session{sessions.length !== 1 ? "s" : ""}
          </p>
          <div className="flex gap-2">
            {sessions.length > 1 && (
              <Button variant="danger" onClick={handleRevokeAll}>
                <LogOut size={13} /> Revoke All Others
              </Button>
            )}
            <Button variant="secondary" onClick={load}>
              <RefreshCw size={13} /> Refresh
            </Button>
          </div>
        </div>

        {loading ? <Spinner /> : (
          <Table
            headers={["Admin", "Email", "Role", "IP Address", "Device", "Started", "Expires", "Actions"]}
            empty={!sessions.length}>
            {sessions.map((s, i) => {
              const sharedIp = s.ip_address && sessions.filter(s2 => s2.ip_address === s.ip_address).length > 1;
              return (
                <Tr key={s.id} className={i === 0 ? "bg-cyan/3" : ""}>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      {i === 0 && <span className="text-[9px] text-cyan font-bold bg-cyan/10 border border-cyan/20 rounded px-1.5 py-0.5">YOU</span>}
                      <span className="font-semibold">{s.full_name}</span>
                    </div>
                  </Td>
                  <Td className="text-textMuted text-sm">{s.email}</Td>
                  <Td>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${roleBadgeColor(s.role)}`}>
                      {s.role}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      {sharedIp && <AlertTriangle size={10} className="text-yellow flex-shrink-0" />}
                      <span className={`font-mono text-xs ${sharedIp ? "text-yellow" : "text-textMuted"}`}>
                        {s.ip_address || "—"}
                      </span>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1 text-textDim">
                      <Monitor size={11} />
                      <span className="text-[10px]">
                        {(s as any).user_agent
                          ? (s as any).user_agent.includes("Mobile") ? "Mobile" : "Desktop"
                          : "Unknown"}
                      </span>
                    </div>
                  </Td>
                  <Td className="text-textMuted text-xs">{formatDate(s.created_at)}</Td>
                  <Td className="text-textMuted text-xs">{formatDate(s.expires_at)}</Td>
                  <Td>
                    {i !== 0 && (
                      <Button
                        variant="danger"
                        onClick={() => handleRevoke(s.id, s.full_name)}
                        loading={revoking === s.id}>
                        <LogOut size={12} /> Revoke
                      </Button>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </Table>
        )}

        {/* Role breakdown */}
        {sessions.length > 0 && (
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Users size={14} className="text-textMuted" />
              <h3 className="text-text font-bold text-sm">Sessions by Role</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(byRole).map(([role, count]) => (
                <div key={role} className="flex items-center gap-2 px-3 py-1.5 bg-bg border border-border rounded-lg">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${roleBadgeColor(role)}`}>
                    {role}
                  </span>
                  <span className="text-text font-bold text-sm">{count}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </AdminShell>
  );
}
