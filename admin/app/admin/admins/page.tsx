"use client";
import { useState, useEffect } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Button, Spinner, Modal, Input, Select, Card } from "@/components/ui";
import { api, AdminUser, isSuperAdmin } from "@/lib/api";
import { formatDate, roleBadgeColor } from "@/lib/utils";
import { PlusCircle, Trash2, ShieldOff, ShieldCheck, LogOut, Edit2, Key, Clock, Activity, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

const ROLES = [
  { value: "admin",     label: "Admin",     desc: "Users, drivers, verification",    color: "text-cyan" },
  { value: "finance",   label: "Finance",   desc: "Withdrawals, payouts, balances",  color: "text-green" },
  { value: "support",   label: "Support",   desc: "PIN reset, view data",            color: "text-purple" },
  { value: "hr",        label: "HR",        desc: "Staff, analytics, statements",    color: "text-pink-400" },
  { value: "cfo",       label: "CFO",       desc: "Full financial control",          color: "text-yellow" },
  { value: "cto",       label: "CTO",       desc: "System & audit access",           color: "text-cyan" },
  { value: "ceo",       label: "CEO",       desc: "Near-full access",                color: "text-orange-400" },
];

function daysSince(date: string | null) {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

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
  const [editExtraRoles, setEditExtraRoles] = useState<string[]>([]);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [newPw, setNewPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [suspendConfirm, setSuspendConfirm] = useState<AdminUser | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<AdminUser | null>(null);
  const [forceLogoutConfirm, setForceLogoutConfirm] = useState<AdminUser | null>(null);

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
    if (newPassword.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    try {
      await api.createAdmin({ full_name: newName, email: newEmail, password: newPassword, role: newRole });
      toast.success("Admin created");
      setCreateModal(false);
      setNewName(""); setNewEmail(""); setNewPassword(""); setNewRole("admin"); setShowPw(false);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleEdit = async () => {
    if (!editModal) return;
    try {
      await api.updateAdmin(editModal.id, {
        role: editRole || undefined,
        extra_roles: editExtraRoles,
        full_name: editName || undefined,
        email: editEmail || undefined,
      });
      toast.success("Admin updated");
      setEditModal(null);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleSuspend = (a: AdminUser) => { setSuspendConfirm(a); };
  const doSuspend = async () => {
    if (!suspendConfirm) return;
    const a = suspendConfirm; setSuspendConfirm(null);
    try {
      if (a.is_active) await api.suspendAdmin(a.id);
      else await api.reactivateAdmin(a.id);
      toast.success(a.is_active ? "Admin suspended" : "Admin reactivated");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = (a: AdminUser) => { setDeleteConfirm(a); };
  const doDelete = async () => {
    if (!deleteConfirm) return;
    const a = deleteConfirm; setDeleteConfirm(null);
    try { await api.deleteAdmin(a.id); toast.success("Admin deleted"); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  const handleForceLogout = (a: AdminUser) => { setForceLogoutConfirm(a); };
  const doForceLogout = async () => {
    if (!forceLogoutConfirm) return;
    const a = forceLogoutConfirm; setForceLogoutConfirm(null);
    try { await api.forceLogout(a.id); toast.success(`${a.full_name} logged out`); }
    catch (e: any) { toast.error(e.message); }
  };

  const handleResetPw = async () => {
    if (!pwModal || newPw.length < 8) { toast.error("Min 8 characters"); return; }
    try {
      await api.resetAdminPassword(pwModal.id, newPw);
      toast.success("Password reset — sessions revoked");
      setPwModal(null); setNewPw(""); setShowPw(false);
    } catch (e: any) { toast.error(e.message); }
  };

  const activeCount = admins.filter(a => a.is_active).length;
  const suspendedCount = admins.filter(a => !a.is_active).length;
  const neverLogged = admins.filter(a => !a.last_login).length;

  return (
    <AdminShell title="Admin Accounts">
      <div className="space-y-6">

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="text-center">
            <p className="text-2xl font-extrabold text-cyan">{admins.length}</p>
            <p className="text-xs text-textMuted mt-1">Total Admins</p>
          </Card>
          <Card className="text-center">
            <p className="text-2xl font-extrabold text-green">{activeCount}</p>
            <p className="text-xs text-textMuted mt-1">Active</p>
          </Card>
          <Card className={`text-center ${suspendedCount > 0 ? "border-red/30" : ""}`}>
            <p className={`text-2xl font-extrabold ${suspendedCount > 0 ? "text-red" : "text-textMuted"}`}>
              {suspendedCount}
            </p>
            <p className="text-xs text-textMuted mt-1">Suspended</p>
          </Card>
          <Card className={`text-center ${neverLogged > 0 ? "border-yellow/30" : ""}`}>
            <p className={`text-2xl font-extrabold ${neverLogged > 0 ? "text-yellow" : "text-textMuted"}`}>
              {neverLogged}
            </p>
            <p className="text-xs text-textMuted mt-1">Never Logged In</p>
          </Card>
        </div>

        {/* Role key */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {ROLES.map((r) => (
            <Card key={r.value} className="p-3">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${roleBadgeColor(r.value)} mb-1`}>
                {r.label}
              </span>
              <p className="text-[11px] text-textMuted leading-tight">{r.desc}</p>
              <p className="text-[10px] text-textDim mt-1 font-bold">
                {admins.filter(a => a.role === r.value).length} account{admins.filter(a => a.role === r.value).length !== 1 ? "s" : ""}
              </p>
            </Card>
          ))}
        </div>

        <div className="flex justify-end">
          <Button onClick={() => setCreateModal(true)}>
            <PlusCircle size={13} /> New Admin
          </Button>
        </div>

        {loading ? <Spinner /> : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border bg-bg3/60">
                  {["Name", "Email", "Role", "Status", "Last Login", "Inactivity", "Created By", "Actions"].map(h => (
                    <th key={h} className="py-2.5 px-4 text-left text-[10px] font-extrabold text-textDim uppercase tracking-widest whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {admins.length === 0 ? (
                  <tr><td colSpan={8} className="py-10 text-center text-textMuted text-sm">No admin accounts</td></tr>
                ) : admins.map((a) => {
                  const lastLoginDays = daysSince(a.last_login ?? null);
                  const stale = lastLoginDays !== null && lastLoginDays > 30;
                  return (
                    <tr key={a.id} className={`border-b border-border/50 hover:bg-bg3/40 transition-colors ${!a.is_active ? "opacity-60" : ""}`}>
                      <td className="py-3 px-4 font-semibold text-text">{a.full_name}</td>
                      <td className="py-3 px-4 text-textMuted text-sm">{a.email}</td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${roleBadgeColor(a.role)}`}>
                            {a.role}
                          </span>
                          {(a.extra_roles || []).map(r => (
                            <span key={r} className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border opacity-70 ${roleBadgeColor(r)}`}>
                              +{r}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold ${a.is_active ? "bg-green/10 border-green/20 text-green" : "bg-red/10 border-red/20 text-red"}`}>
                          {a.is_active ? "Active" : "Suspended"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-textMuted text-xs">
                        {a.last_login ? formatDate(a.last_login) : <span className="text-yellow font-bold text-[10px]">Never</span>}
                      </td>
                      <td className="py-3 px-4">
                        {lastLoginDays === null ? (
                          <span className="text-yellow text-xs">—</span>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Clock size={10} className={stale ? "text-yellow" : "text-textDim"} />
                            <span className={`text-xs ${stale ? "text-yellow font-bold" : "text-textMuted"}`}>{lastLoginDays}d ago</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-textMuted text-xs">{a.created_by_name || "—"}</td>
                      <td className="py-3 px-4">
                        {a.role !== "superadmin" && (
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" onClick={() => {
                              setEditModal(a); setEditRole(a.role);
                              setEditExtraRoles(a.extra_roles || []);
                              setEditName(a.full_name); setEditEmail(a.email);
                            }}>
                              <Edit2 size={12} />
                            </Button>
                            <Button variant="ghost" onClick={() => setPwModal(a)}><Key size={12} /></Button>
                            <Button variant="ghost" onClick={() => handleForceLogout(a)}><LogOut size={12} /></Button>
                            <Button variant={a.is_active ? "danger" : "secondary"} onClick={() => handleSuspend(a)}>
                              {a.is_active ? <ShieldOff size={12} /> : <ShieldCheck size={12} />}
                            </Button>
                            <Button variant="danger" onClick={() => handleDelete(a)}><Trash2 size={12} /></Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={createModal} onClose={() => { setCreateModal(false); setShowPw(false); }} title="Create Admin">
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
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                placeholder="Min 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-textDim hover:text-text text-[10px] font-bold">
                {showPw ? "HIDE" : "SHOW"}
              </button>
            </div>
            {newPassword.length > 0 && newPassword.length < 8 && (
              <p className="text-red text-[10px] mt-1">Min 8 characters ({newPassword.length}/8)</p>
            )}
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
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Primary Role</label>
            <Select value={editRole} onChange={(e) => setEditRole(e.target.value)} className="w-full">
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Additional Roles</label>
            <div className="flex flex-wrap gap-2">
              {ROLES.filter(r => r.value !== editRole).map(r => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setEditExtraRoles(prev =>
                    prev.includes(r.value) ? prev.filter(x => x !== r.value) : [...prev, r.value]
                  )}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                    editExtraRoles.includes(r.value)
                      ? "bg-cyan/10 text-cyan border-cyan/40"
                      : "text-textMuted border-border hover:border-cyan/30"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {editExtraRoles.length > 0 && (
              <p className="text-textMuted text-xs mt-1">
                This admin has combined permissions from: {[editRole, ...editExtraRoles].join(", ")}
              </p>
            )}
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" onClick={() => setEditModal(null)}>Cancel</Button>
            <Button onClick={handleEdit}>Save Changes</Button>
          </div>
        </div>
      </Modal>

      {/* Suspend / Reactivate Modal */}
      <Modal open={!!suspendConfirm} onClose={() => setSuspendConfirm(null)}
        title={suspendConfirm?.is_active ? `Suspend ${suspendConfirm?.full_name}` : `Reactivate ${suspendConfirm?.full_name}`}>
        <div className="space-y-4">
          <p className="text-textMuted text-sm">
            {suspendConfirm?.is_active
              ? `Suspending this account will immediately revoke admin access for ${suspendConfirm?.full_name}.`
              : `Reactivating ${suspendConfirm?.full_name} will restore their admin access.`}
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setSuspendConfirm(null)}>Cancel</Button>
            <Button variant={suspendConfirm?.is_active ? "danger" : "secondary"} onClick={doSuspend}>
              {suspendConfirm?.is_active ? <><ShieldOff size={12} /> Suspend Admin</> : <><ShieldCheck size={12} /> Reactivate Admin</>}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Admin Modal */}
      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title={`Delete ${deleteConfirm?.full_name}`}>
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red/5 border border-red/20 rounded-xl">
            <AlertTriangle size={15} className="text-red flex-shrink-0 mt-0.5" />
            <p className="text-red text-sm">Permanently delete <strong>{deleteConfirm?.full_name}</strong>? Their admin account will be removed. Audit log entries are preserved. This cannot be undone.</p>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="danger" onClick={doDelete}><Trash2 size={12} /> Delete Admin</Button>
          </div>
        </div>
      </Modal>

      {/* Force Logout Modal */}
      <Modal open={!!forceLogoutConfirm} onClose={() => setForceLogoutConfirm(null)} title={`Force Logout ${forceLogoutConfirm?.full_name}`}>
        <div className="space-y-4">
          <p className="text-textMuted text-sm">All active sessions for <strong className="text-text">{forceLogoutConfirm?.full_name}</strong> will be immediately revoked. They will need to log in again.</p>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setForceLogoutConfirm(null)}>Cancel</Button>
            <Button variant="danger" onClick={doForceLogout}><LogOut size={12} /> Force Logout</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!pwModal}
        onClose={() => { setPwModal(null); setNewPw(""); setShowPw(false); }}
        title={`Reset Password — ${pwModal?.full_name}`}>
        <div className="space-y-4">
          <p className="text-textMuted text-sm">This will immediately revoke all active sessions for this admin.</p>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">New Password</label>
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                placeholder="Min 8 characters"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-textDim hover:text-text text-[10px] font-bold">
                {showPw ? "HIDE" : "SHOW"}
              </button>
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" onClick={() => { setPwModal(null); setNewPw(""); setShowPw(false); }}>Cancel</Button>
            <Button variant="danger" onClick={handleResetPw}>Reset Password</Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
