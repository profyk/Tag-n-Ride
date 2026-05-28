"use client";
import { useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Badge, Button, Modal, Input } from "@/components/ui";
import { Lock, Plus, Trash2, Shield, ChevronDown, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";

const ALL_PERMISSIONS = [
  { key: "manage_users",       label: "Manage Users",         category: "Users" },
  { key: "reset_pin",          label: "Reset PIN",            category: "Users" },
  { key: "manage_drivers",     label: "Manage Drivers",       category: "Drivers" },
  { key: "review_kyc",         label: "Review KYC",           category: "Drivers" },
  { key: "approve_withdrawals",label: "Approve Withdrawals",  category: "Finance" },
  { key: "view_ledger",        label: "View Ledger",          category: "Finance" },
  { key: "download_statements",label: "Download Statements",  category: "Finance" },
  { key: "view_analytics",     label: "View Analytics",       category: "Analytics" },
  { key: "view_audit",         label: "View Audit Log",       category: "Compliance" },
  { key: "manage_compliance",  label: "Manage Compliance",    category: "Compliance" },
  { key: "manage_disputes",    label: "Manage Disputes",      category: "Support" },
  { key: "manage_notifications",label:"Manage Notifications", category: "System" },
  { key: "manage_promotions",  label: "Manage Promotions",    category: "Growth" },
  { key: "manage_pricing",     label: "Manage Pricing",       category: "System" },
  { key: "manage_refunds",     label: "Manage Refunds",       category: "Finance" },
  { key: "view_risk",          label: "View Risk Dashboard",  category: "Compliance" },
  { key: "manage_limits",      label: "Manage Limits",        category: "System" },
  { key: "broadcast_messages", label: "Broadcast Messages",   category: "System" },
  { key: "export_data",        label: "Export Data",          category: "Analytics" },
  { key: "flag_accounts",      label: "Flag Accounts",        category: "Users" },
  { key: "manage_staff",       label: "Manage Staff / HR",    category: "System" },
];

type RoleConfig = { label: string; color: string; permissions: string[] };

const DEFAULT_ROLES: Record<string, RoleConfig> = {
  superadmin: { label: "Superadmin", color: "purple", permissions: ALL_PERMISSIONS.map((p) => p.key) },
  ceo: { label: "CEO", color: "purple", permissions: ALL_PERMISSIONS.map((p) => p.key) },
  cfo: { label: "CFO", color: "cyan", permissions: ["view_analytics", "view_ledger", "download_statements", "approve_withdrawals", "manage_refunds", "view_risk", "view_audit"] },
  cto: { label: "CTO", color: "cyan", permissions: ["view_analytics", "view_audit", "manage_compliance", "manage_limits", "manage_pricing", "manage_notifications"] },
  admin: { label: "Admin", color: "green", permissions: ["manage_users", "manage_drivers", "review_kyc", "approve_withdrawals", "reset_pin", "view_analytics", "manage_disputes"] },
  finance: { label: "Finance", color: "yellow", permissions: ["approve_withdrawals", "view_ledger", "download_statements", "view_analytics", "manage_refunds"] },
  support: { label: "Support", color: "orange", permissions: ["manage_users", "reset_pin", "manage_disputes", "view_analytics"] },
  hr: { label: "HR", color: "purple", permissions: ["view_audit", "view_analytics", "export_data", "manage_users", "flag_accounts", "download_statements", "manage_staff"] },
};

const TONE_MAP: Record<string, any> = {
  purple: "purple", cyan: "cyan", green: "green", yellow: "yellow", orange: "orange",
};

const categories = Array.from(new Set(ALL_PERMISSIONS.map((p) => p.category)));

export default function RolesPage() {
  const [roles, setRoles] = useState(DEFAULT_ROLES);
  const [selectedRole, setSelectedRole] = useState<string>("admin");
  const [expanded, setExpanded] = useState<string[]>(categories);
  const [addModal, setAddModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");

  const togglePermission = (roleKey: string, perm: string) => {
    setRoles((prev) => {
      const role = prev[roleKey];
      const has = role.permissions.includes(perm);
      return {
        ...prev,
        [roleKey]: { ...role, permissions: has ? role.permissions.filter((p) => p !== perm) : [...role.permissions, perm] },
      };
    });
    toast.success("Permission updated (local — save to persist)");
  };

  const saveRole = async () => {
    toast.success("Role configuration saved");
  };

  const createRole = () => {
    const key = newRoleName.toLowerCase().replace(/\s+/g, "_");
    if (!key || roles[key]) { toast.error("Invalid or duplicate role name"); return; }
    setRoles((prev) => ({ ...prev, [key]: { label: newRoleName, color: "green", permissions: [] } }));
    setSelectedRole(key);
    setAddModal(false);
    setNewRoleName("");
    toast.success("Role created");
  };

  const toggleCategory = (cat: string) => {
    setExpanded((prev) => prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]);
  };

  const role = roles[selectedRole];

  return (
    <AdminShell title="Roles & Permissions">
      <div className="flex gap-6 h-full">
        {/* Roles list */}
        <div className="w-56 shrink-0 space-y-2">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-extrabold text-textDim uppercase tracking-widest">Roles</p>
            <button onClick={() => setAddModal(true)} className="text-cyan hover:text-cyan/70 transition-all">
              <Plus size={14} />
            </button>
          </div>
          {Object.entries(roles).map(([key, r]) => (
            <button
              key={key}
              onClick={() => setSelectedRole(key)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left ${selectedRole === key ? "bg-cyanDim text-cyan border border-cyan/20" : "text-textMuted hover:text-text hover:bg-bg3"}`}
            >
              <Shield size={13} />
              {r.label}
            </button>
          ))}
        </div>

        {/* Permission matrix */}
        <div className="flex-1 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Lock size={16} className="text-cyan" />
              <h2 className="text-text font-bold text-lg">{role?.label} Permissions</h2>
              <Badge label={`${role?.permissions.length} / ${ALL_PERMISSIONS.length}`} tone={TONE_MAP[role?.color] || "cyan"} />
            </div>
            <Button onClick={saveRole}>Save Changes</Button>
          </div>

          {categories.map((cat) => {
            const perms = ALL_PERMISSIONS.filter((p) => p.category === cat);
            const isExpanded = expanded.includes(cat);
            return (
              <Card key={cat} className="overflow-hidden">
                <button
                  onClick={() => toggleCategory(cat)}
                  className="w-full flex items-center justify-between py-1 text-left"
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? <ChevronDown size={14} className="text-textMuted" /> : <ChevronRight size={14} className="text-textMuted" />}
                    <span className="text-text font-bold text-sm">{cat}</span>
                    <span className="text-[10px] text-textMuted">
                      {perms.filter((p) => role?.permissions.includes(p.key)).length}/{perms.length}
                    </span>
                  </div>
                </button>
                {isExpanded && (
                  <div className="mt-3 space-y-1 pl-5">
                    {perms.map((perm) => {
                      const has = role?.permissions.includes(perm.key);
                      return (
                        <label key={perm.key} className="flex items-center gap-3 py-2 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={has}
                            onChange={() => togglePermission(selectedRole, perm.key)}
                            className="w-4 h-4 accent-cyan cursor-pointer"
                          />
                          <span className={`text-sm font-medium transition-all ${has ? "text-text" : "text-textMuted"}`}>
                            {perm.label}
                          </span>
                          <code className="text-[9px] text-textDim font-mono ml-auto">{perm.key}</code>
                        </label>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      <Modal open={addModal} onClose={() => setAddModal(false)} title="Create New Role">
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Role Name</label>
            <Input placeholder="e.g. Compliance Officer" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setAddModal(false)}>Cancel</Button>
            <Button onClick={createRole}>Create Role</Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
