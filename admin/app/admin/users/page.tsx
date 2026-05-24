"use client";
import { useState, useEffect } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Table, Tr, Td, Badge, Button, Spinner, Input, Modal } from "@/components/ui";
import { api, User, hasPermission, isSuperAdmin } from "@/lib/api";
import { formatDate, roleBadgeColor } from "@/lib/utils";
import { Search, Flag, ShieldOff, ShieldCheck, Key, Trash2, FlaskConical } from "lucide-react";
import toast from "react-hot-toast";
import { DangerPinModal, useDangerPin } from "@/components/DangerPinModal";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = (dangerToken?: string) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
  ...(dangerToken ? { "X-Danger-Token": dangerToken } : {}),
});

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [flagModal, setFlagModal] = useState<User | null>(null);
  const [flagReason, setFlagReason] = useState("");
  const [pinModal, setPinModal] = useState<{ name: string; pin: string } | null>(null);
  const superAdmin = isSuperAdmin();
  const canManageTest = hasPermission("manage_test_users");
  const dangerPin = useDangerPin();

  const load = (q?: string) => {
    setLoading(true);
    api.users(q).then((r) => setUsers(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleBlock = async (u: User) => {
    try {
      if (u.is_active) { await api.blockUser(u.id); toast.success(`${u.full_name} blocked`); }
      else { await api.unblockUser(u.id); toast.success(`${u.full_name} unblocked`); }
      load(query);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleResetPin = async (u: User) => {
    try {
      const res = await api.resetPin(u.id);
      setPinModal({ name: u.full_name, pin: res.data.temporary_pin });
      load(query);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleFlag = async () => {
    if (!flagModal || !flagReason.trim()) return;
    try {
      await api.flagUser(flagModal.id, flagReason.trim());
      toast.success(`${flagModal.full_name} flagged`);
      setFlagModal(null); setFlagReason("");
      load(query);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleUnflag = async (u: User) => {
    try { await api.unflagUser(u.id); toast.success("Account unflagged"); load(query); }
    catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async (u: User) => {
    if (!confirm(`Delete ${u.full_name}? This requires your danger PIN and cannot be undone.`)) return;
    const token = await dangerPin.request();
    if (!token) return;
    try {
      const res = await fetch(`${BASE}/api/admin/users/${u.id}`, {
        method: "DELETE",
        headers: authHeaders(token),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Delete failed");
      toast.success(`${u.full_name} deleted`);
      load(query);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleToggleTest = async (u: any) => {
    const isTest = !u.is_test;
    try {
      const res = await fetch(`${BASE}/api/admin/test-users/${u.id}/mark`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ is_test: isTest }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed");
      toast.success(isTest ? `${u.full_name} marked as test account` : `${u.full_name} unmarked`);
      load(query);
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <AdminShell title="User Management">
      <div className="space-y-4">
        <div className="flex gap-3">
          <Input placeholder="Search by phone or name..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setQuery(search); load(search); } }} />
          <Button onClick={() => { setQuery(search); load(search); }}>
            <Search size={13} /> Search
          </Button>
        </div>

        {loading ? <Spinner /> : (
          <Table
            headers={["Name", "Phone", "Role", "Status", "Joined", "Actions"]}
            empty={!users.length}>
            {users.map((u: any) => (
              <Tr key={u.id}>
                <Td>
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold">{u.full_name}</span>
                    {u.is_test && (
                      <span className="flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 bg-purple/10 border border-purple/20 rounded text-purple uppercase">
                        <FlaskConical size={9} /> TEST
                      </span>
                    )}
                  </div>
                  {u.flagged && <span className="text-[10px] text-red font-bold">⚑ FLAGGED</span>}
                </Td>
                <Td className="font-mono text-xs text-textMuted">{u.phone_number}</Td>
                <Td>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${roleBadgeColor(u.role)}`}>
                    {u.role}
                  </span>
                </Td>
                <Td>
                  <Badge label={u.is_active ? "Active" : "Blocked"} tone={u.is_active ? "green" : "red"} />
                </Td>
                <Td className="text-textMuted text-xs">{formatDate(u.created_at)}</Td>
                <Td>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Button variant={u.is_active ? "danger" : "secondary"} onClick={() => handleBlock(u)}>
                      {u.is_active ? <ShieldOff size={12} /> : <ShieldCheck size={12} />}
                      {u.is_active ? "Block" : "Unblock"}
                    </Button>
                    <Button variant="secondary" onClick={() => handleResetPin(u)}>
                      <Key size={12} /> PIN
                    </Button>
                    {u.flagged ? (
                      <Button variant="ghost" onClick={() => handleUnflag(u)}>
                        <Flag size={12} /> Unflag
                      </Button>
                    ) : (
                      <Button variant="ghost" onClick={() => setFlagModal(u)}>
                        <Flag size={12} /> Flag
                      </Button>
                    )}
                    {canManageTest && (
                      <Button
                        variant="ghost"
                        onClick={() => handleToggleTest(u)}
                        title={u.is_test ? "Unmark as test account" : "Mark as test account"}>
                        <FlaskConical size={12} />
                        {u.is_test ? "Unmark" : "Test"}
                      </Button>
                    )}
                    {superAdmin && (
                      <Button variant="danger" onClick={() => handleDelete(u)}>
                        <Trash2 size={12} />
                      </Button>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </div>

      <Modal open={!!flagModal} onClose={() => { setFlagModal(null); setFlagReason(""); }}
        title={`Flag ${flagModal?.full_name}`}>
        <div className="space-y-4">
          <p className="text-textMuted text-sm">Provide a reason for flagging this account.</p>
          <Input placeholder="Reason for flagging..." value={flagReason}
            onChange={(e) => setFlagReason(e.target.value)} />
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => { setFlagModal(null); setFlagReason(""); }}>Cancel</Button>
            <Button variant="danger" onClick={handleFlag}>Flag Account</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!pinModal} onClose={() => setPinModal(null)} title="Temporary PIN">
        <div className="space-y-4">
          <p className="text-textMuted text-sm">
            Share this temporary PIN with <strong className="text-text">{pinModal?.name}</strong>.
            They should change it immediately.
          </p>
          <div className="bg-bg border border-border rounded-lg p-4 text-center">
            <span className="text-cyan font-mono text-3xl font-black tracking-widest">{pinModal?.pin}</span>
          </div>
          <p className="text-xs text-red text-center">This PIN is shown once. Save it now.</p>
          <Button className="w-full justify-center" onClick={() => setPinModal(null)}>Done</Button>
        </div>
      </Modal>

      <DangerPinModal
        open={dangerPin.open}
        onSuccess={dangerPin.handleSuccess}
        onCancel={dangerPin.handleCancel}
        actionLabel="delete this user"
      />
    </AdminShell>
  );
}
