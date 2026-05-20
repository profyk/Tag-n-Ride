"use client";
import { useState, useEffect } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Table, Tr, Td, Badge, Button, Spinner, Modal, Input, Select, Card } from "@/components/ui";
import { api, AdminUser } from "@/lib/api";
import { formatDate, roleBadgeColor } from "@/lib/utils";
import { isSuperAdmin } from "@/lib/api";
import { PlusCircle, Trash2, ShieldOff, ShieldCheck, LogOut, Edit2, Key } from "lucide-react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

const ROLES = [
  { value: "admin", label: "Admin", desc: "Users, drivers, verification" },
  { value: "finance", label: "Finance", desc: "Withdrawals, payouts, balances" },
  { value: "support", label: "Support", desc: "PIN reset, view data" },
  { value: "cfo", label: "CFO", desc: "Full financial control" },
  { value: "cto", label: "CTO", desc: "System & audit access" },
  { value: "ceo", label: "CEO", desc: "Near-full access" },
];

export default function AdminsPage() {
  const router = useRouter();
  const superAdmin = isSuperAdmin();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModal, setCreateModal] = useState(false);
  const [editModal, setEditModal] = useState<AdminUser | null>(null);
  const [pwModal, setPwModal] = useState<AdminUser | null>(null);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("admin");
  const [editRole, setEditRole] = useState("");
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [newPw, setNewPw] = useState("");

  const load = () => {
    setLoading(true);
    api.listAdmins().then((r) => setAdmins(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!superAdmin) { router.push("/admin/dashboard"); return; }
    load();
  }, []);

  if (!superAdmin) return null;

  const handleCreate = async () => {
    if (!newName || !newEmail || !newPassword) { toast.error("All fields required"); return; }
    try {
      await api.createAdmin({ full_name: newName, email: newEmail, password: newPassword, role: newRole });
      toast.success("Admin created");
      setCreateModal(false);
      setNewName(""); setNewEmail(""); setNewPassword(""); setNewRole("admin");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleEdit = async () => {
    if (!editModal) return;
    try {
      await api.updateAdmin(editModal.id, {
        role: editRole || undefined,
        full_name: editName || undefined,
        email: editEmail || undefined,
      });
      toast.success("Admin updated");
      setEditModal(null);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleSuspend = async (a: AdminUser) => {
    if (!confirm(`${a.is_active ? "Suspend" : "Reactivate"} ${a.full_name}?`)) return;
    try {
      if (a.is_active) await api.suspendAdmin(a.id);
      else await api.reactivateAdmin(a.id);
      toast.success(a.is_active ? "Admin suspended" : "Admin reactivated");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async (a: AdminUser) => {
    if (!confirm(`Delete ${a.full_name}? This cannot be undone.`)) return;
    try { await api.deleteAdmin(a.id); toast.success("Admin deleted"); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  const handleForceLogout = async (a: AdminUser) => {
    try { await api.forceLogout(a.id); toast.success(`${a.full_name} logged out`); }
    catch (e: any) { toast.error(e.message); }
  };

  const handleResetPw = async () => {
    if (!pwModal || newPw.length < 8) { toast.error("Min 8 characters"); return; }
    try {
      await api.resetAdminPassword(pwModal.id, newPw);
      toast.success("Password reset — sessions revoked");
      setPwModal(null); setNewPw("");
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <AdminShell title="Admin Accounts">
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {ROLES.map((r) => (
            <Card key={r.value} className="p-3">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${roleBadgeColor(r.value)} mb-1`}>
                {r.label}
              </span>
              <p className="text-[11px] text-textMuted leading-tight">{r.desc}</p>
            </Card>
          ))}
        </div>

        <div className="flex justify-end">
          <Button onClick={() => setCreateModal(true)}>
            <PlusCircle size={13} /> New Admin
          </Button>
        </div>

        {loading ? <Spinner /> : (
          <Table
            headers={["Name", "Email", "Role", "Status", "Last Login", "Created By", "Actions"]}
            empty={!admins.length}>
            {admins.map((a) => (
              <Tr key={a.id}>
                <Td className="font-semibold">{a.full_name}</Td>
                <Td className="text-textMuted text-sm">{a.email}</Td>
                <Td>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${roleBadgeColor(a.role)}`}>
                    {a.role}
                  </span>
                </Td>
                <Td>
                  <Badge label={a.is_active ? "Active" : "Suspended"} tone={a.is_active ? "green" : "red"} />
                </Td>
                <Td className="text-textMuted text-xs">{a.last_login ? formatDate(a.last_login) : "Never"}</Td>
                <Td className="text-textMuted text-xs">{a.created_by_name || "—"}</Td>
                <Td>
                  {a.role !== "superadmin" && (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" onClick={() => {
                        setEditModal(a); setEditRole(a.role);
                        setEditName(a.full_name); setEditEmail(a.email);
                      }}>
                        <Edit2 size={12} />
                      </Button>
                      <Button variant="ghost" onClick={() => setPwModal(a)}>
                        <Key size={12} />
                      </Button>
                      <Button variant="ghost" onClick={() => handleForceLogout(a)}>
                        <LogOut size={12} />
                      </Button>
                      <Button variant={a.is_active ? "danger" : "secondary"} onClick={() => handleSuspend(a)}>
                        {a.is_active ? <ShieldOff size={12} /> : <ShieldCheck size={12} />}
                      </Button>
                      <Button variant="danger" onClick={() => handleDelete(a)}>
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  )}
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </div>

      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Create Admin">
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Full Name</label>
            <Input placeholder="John Doe" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Email</label>
            <Input type="email" placeholder="john@tagnride.app" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Password</label>
            <Input type="password" placeholder="Min 8 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Role</label>
            <Select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="w-full">
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>)}
            </Select>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" onClick={() => setCreateModal(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create Admin</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!editModal} onClose={() => setEditModal(null)} title={`Edit ${editModal?.full_name}`}>
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Full Name</label>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Email</label>
            <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Role</label>
            <Select value={editRole} onChange={(e) => setEditRole(e.target.value)} className="w-full">
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>)}
            </Select>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" onClick={() => setEditModal(null)}>Cancel</Button>
            <Button onClick={handleEdit}>Save Changes</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!pwModal} onClose={() => { setPwModal(null); setNewPw(""); }}
        title={`Reset Password — ${pwModal?.full_name}`}>
        <div className="space-y-4">
          <p className="text-textMuted text-sm">This will immediately revoke all active sessions.</p>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">New Password</label>
            <Input type="password" placeholder="Min 8 characters" value={newPw}
              onChange={(e) => setNewPw(e.target.value)} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" onClick={() => { setPwModal(null); setNewPw(""); }}>Cancel</Button>
            <Button variant="danger" onClick={handleResetPw}>Reset Password</Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
      }
