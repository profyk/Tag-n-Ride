"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Button, Spinner, Input, Badge, Table, Tr, Td, Modal } from "@/components/ui";
import { api, Session, FeatureFlag } from "@/lib/api";
import { isSuperAdmin, hasPermission } from "@/lib/api";
import { formatDate, roleBadgeColor } from "@/lib/utils";
import { DangerPinModal, useDangerPin } from "@/components/DangerPinModal";
import toast from "react-hot-toast";
import {
  Settings, Lock, Monitor, Key, ToggleRight, ToggleLeft,
  Save, RotateCcw, CheckCircle2, AlertTriangle, Shield,
  ChevronDown, ChevronRight, Plus, Trash2, LogOut,
  RefreshCw, Users, Eye, EyeOff, Copy, Zap,
} from "lucide-react";

type Tab = "config" | "roles" | "sessions" | "api-keys" | "feature-flags";

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: "config",        label: "Platform Config", icon: Settings    },
  { id: "roles",         label: "Roles & Perms",   icon: Lock        },
  { id: "sessions",      label: "Active Sessions", icon: Monitor     },
  { id: "api-keys",      label: "API Keys",        icon: Key         },
  { id: "feature-flags", label: "Feature Flags",   icon: ToggleRight },
];

// ── Platform Config ─────────────────────────────────────────────────────────

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

const CEO_ONLY_KEYS = [
  "topup_processing_fee_percent", "topup_gateway_fee_percent", "topup_gateway_fee_fixed",
  "platform_fee_percent",
  "company_name", "company_reg_number", "company_vat_number",
  "company_address_line1", "company_address_line2", "company_phone", "company_email",
];

const DANGEROUS_KEYS = ["maintenance_mode", "topup_processing_fee_percent", "platform_fee_percent"];

const CONFIG_GROUPS = [
  {
    label: "Top-Up Processing Fees", ceoOnly: true,
    keys: ["topup_processing_fee_percent", "topup_gateway_fee_percent", "topup_gateway_fee_fixed"],
    descriptions: {
      topup_processing_fee_percent: "Fee % charged to user on top-up. e.g. 6.0 means user pays R106 to add R100",
      topup_gateway_fee_percent: "Actual PayFast gateway fee %. Used to calculate operations income e.g. 4.9",
      topup_gateway_fee_fixed: "PayFast fixed fee per transaction in ZAR e.g. 1.00",
    },
  },
  {
    label: "Platform Fees", ceoOnly: true,
    keys: ["platform_fee_percent"],
    descriptions: { platform_fee_percent: "Percentage fee on every ride payment e.g. 3.0 = 3%" },
  },
  {
    label: "Withdrawal Settings", ceoOnly: false,
    keys: ["auto_approve_withdrawal_limit"],
    descriptions: { auto_approve_withdrawal_limit: "Auto-approve withdrawals below this amount in ZAR. Set to 0 to disable" },
  },
  {
    label: "Transaction Limits", ceoOnly: false,
    keys: ["min_transfer_amount", "max_transfer_amount", "topup_max_amount"],
    descriptions: {
      min_transfer_amount: "Minimum payment amount in ZAR",
      max_transfer_amount: "Maximum single payment amount in ZAR",
      topup_max_amount: "Maximum single top-up amount in ZAR",
    },
  },
  {
    label: "Withdrawal Limits", ceoOnly: false,
    keys: ["min_withdrawal_amount", "max_withdrawal_amount", "withdrawal_daily_limit"],
    descriptions: {
      min_withdrawal_amount: "Minimum withdrawal amount in ZAR",
      max_withdrawal_amount: "Maximum single withdrawal in ZAR",
      withdrawal_daily_limit: "Max total daily withdrawals per user in ZAR",
    },
  },
  {
    label: "App Settings", ceoOnly: false,
    keys: ["maintenance_mode", "kyc_required_for_payments", "app_version_android", "app_version_ios"],
    descriptions: {
      maintenance_mode: "Set to true to put app in maintenance mode",
      kyc_required_for_payments: "Set to true to require KYC before drivers receive payments",
      app_version_android: "Minimum required Android app version",
      app_version_ios: "Minimum required iOS app version",
    },
  },
  {
    label: "Support Contact", ceoOnly: false,
    keys: ["support_whatsapp", "support_email"],
    descriptions: {
      support_whatsapp: "Support WhatsApp number digits only no +",
      support_email: "Support email address",
    },
  },
  {
    label: "Company & Payslip Letterhead", ceoOnly: true,
    keys: ["company_name", "company_reg_number", "company_vat_number", "company_address_line1", "company_address_line2", "company_phone", "company_email"],
    descriptions: {
      company_name: "Legal company name as it appears on payslips e.g. Tag-n-Ride (Pty) Ltd",
      company_reg_number: "CIPC registration number e.g. 2024/123456/07",
      company_vat_number: "VAT registration number if applicable e.g. 4123456789",
      company_address_line1: "Registered address line 1 e.g. 12 Main Street, Sandton",
      company_address_line2: "Address line 2 e.g. Johannesburg, Gauteng, 2196",
      company_phone: "Company contact number e.g. 011 123 4567",
      company_email: "Payroll contact email e.g. payroll@tagnride.co.za",
    },
  },
];

function ConfigTab({ isCeoOrSuper }: { isCeoOrSuper: boolean }) {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [dangerSaveConfirm, setDangerSaveConfirm] = useState<{ key: string; from: string; to: string } | null>(null);

  useEffect(() => {
    fetch(`${BASE}/api/admin/config`, { headers: authHeaders() })
      .then(r => r.json())
      .then((rows: any[]) => {
        const map: Record<string, string> = {};
        if (Array.isArray(rows)) rows.forEach(r => { map[r.key] = r.value; });
        setConfig(map); setEdited(map);
      }).finally(() => setLoading(false));
  }, []);

  const hasChanged = (key: string) => edited[key] !== config[key];
  const canEdit = (key: string) => CEO_ONLY_KEYS.includes(key) ? isCeoOrSuper : true;

  const changedKeys = useMemo(
    () => Object.keys(edited).filter(k => hasChanged(k)),
    [edited, config]
  );

  const handleSave = (key: string) => {
    if (!canEdit(key)) { toast.error("Only CEO or Superadmin can edit this setting"); return; }
    if (DANGEROUS_KEYS.includes(key)) {
      setDangerSaveConfirm({ key, from: config[key], to: edited[key] });
      return;
    }
    doSave(key);
  };
  const doSave = async (key: string) => {
    setSaving(key);
    try {
      await fetch(`${BASE}/api/admin/config/${key}`, {
        method: "PATCH", headers: authHeaders(),
        body: JSON.stringify({ value: edited[key] }),
      });
      setConfig(prev => ({ ...prev, [key]: edited[key] }));
      setSavedKeys(prev => { const s = new Set(prev); s.add(key); return s; });
      setTimeout(() => setSavedKeys(prev => { const s = new Set(prev); s.delete(key); return s; }), 3000);
      toast.success(`${key.replace(/_/g, " ")} updated`);
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(null); }
  };
  const confirmDangerSave = async () => {
    if (!dangerSaveConfirm) return;
    const { key } = dangerSaveConfirm;
    setDangerSaveConfirm(null);
    await doSave(key);
  };

  const handleSaveAll = async () => {
    const pending = changedKeys.filter(k => canEdit(k));
    if (!pending.length) return;
    setSavingAll(true);
    let ok = 0;
    for (const key of pending) {
      try {
        await fetch(`${BASE}/api/admin/config/${key}`, {
          method: "PATCH", headers: authHeaders(),
          body: JSON.stringify({ value: edited[key] }),
        });
        setConfig(prev => ({ ...prev, [key]: edited[key] }));
        ok++;
      } catch { /* continue */ }
    }
    setSavingAll(false);
    toast.success(`Saved ${ok} of ${pending.length} settings`);
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-2 p-4 bg-yellow/10 border border-yellow/20 rounded-xl">
        <AlertTriangle size={16} className="text-yellow" />
        <p className="text-yellow text-sm font-medium">
          Changes take effect immediately. Fee settings require CEO or Superadmin.
        </p>
      </div>

      {changedKeys.length > 0 && (
        <div className="flex items-center justify-between p-4 bg-cyan/5 border border-cyan/20 rounded-xl">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-cyan" />
            <p className="text-cyan text-sm font-semibold">
              {changedKeys.length} unsaved change{changedKeys.length !== 1 ? "s" : ""}
            </p>
            <div className="flex gap-1 flex-wrap">
              {changedKeys.map(k => (
                <span key={k} className="text-[10px] bg-cyan/10 text-cyan px-2 py-0.5 rounded-full font-mono">
                  {k.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          </div>
          <Button onClick={handleSaveAll} loading={savingAll} variant="primary">
            <Save size={13} /> Save All
          </Button>
        </div>
      )}

      {CONFIG_GROUPS.map(group => (
        <Card key={group.label}>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-text font-bold">{group.label}</h2>
            {group.ceoOnly && (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-purple/10 border border-purple/20 rounded-full">
                <Lock size={10} className="text-purple" />
                <span className="text-[10px] font-bold text-purple">CEO ONLY</span>
              </div>
            )}
          </div>
          <div className="space-y-6">
            {group.keys.map(key => {
              const editable = canEdit(key);
              const changed = hasChanged(key);
              const justSaved = savedKeys.has(key);
              const isDangerous = DANGEROUS_KEYS.includes(key);
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest">
                        {key.replace(/_/g, " ")}
                      </label>
                      {isDangerous && (
                        <span className="text-[10px] bg-red/10 text-red border border-red/20 px-1.5 py-0.5 rounded font-bold">HIGH IMPACT</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {!editable && <span className="text-[10px] text-purple font-bold flex items-center gap-1"><Lock size={9} /> CEO ONLY</span>}
                      {justSaved && <span className="text-[10px] text-green font-bold flex items-center gap-1"><CheckCircle2 size={9} /> SAVED</span>}
                      {changed && editable && !justSaved && <span className="text-[10px] text-yellow font-bold">UNSAVED</span>}
                    </div>
                  </div>
                  <p className="text-textDim text-xs mb-2">{(group.descriptions as any)[key]}</p>
                  {config[key] !== undefined && (
                    <p className="text-[10px] text-textDim mb-1.5 font-mono">
                      Saved: <span className={`font-bold ${changed ? "text-textMuted line-through" : "text-textMuted"}`}>{config[key] || "—"}</span>
                      {changed && <span className="text-cyan ml-1">→ {edited[key] || "—"}</span>}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Input
                      value={edited[key] ?? ""}
                      onChange={e => { if (editable) setEdited(prev => ({ ...prev, [key]: e.target.value })); }}
                      disabled={!editable}
                      className={changed && editable ? (isDangerous ? "border-red/40" : "border-yellow/50") : justSaved ? "border-green/30" : ""}
                    />
                    {changed && editable && (
                      <Button variant="ghost" onClick={() => setEdited(prev => ({ ...prev, [key]: config[key] }))} title="Reset">
                        <RotateCcw size={13} />
                      </Button>
                    )}
                    <Button
                      onClick={() => handleSave(key)}
                      loading={saving === key}
                      disabled={!changed || !editable}
                      variant={changed && editable ? (isDangerous ? "danger" : "primary") : "secondary"}>
                      <Save size={13} /> Save
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ))}

      {/* Dangerous Setting Save Confirmation Modal */}
      <Modal open={!!dangerSaveConfirm} onClose={() => setDangerSaveConfirm(null)} title="Confirm Setting Change">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red/5 border border-red/20 rounded-xl">
            <AlertTriangle size={15} className="text-red flex-shrink-0 mt-0.5" />
            <div className="text-sm space-y-1">
              <p className="text-red font-semibold">Dangerous setting change</p>
              <p className="text-textMuted">
                Changing <strong className="text-text font-mono">{dangerSaveConfirm?.key.replace(/_/g, " ")}</strong> from{" "}
                <code className="text-yellow bg-bg3 px-1 rounded">{dangerSaveConfirm?.from}</code> to{" "}
                <code className="text-cyan bg-bg3 px-1 rounded">{dangerSaveConfirm?.to}</code>
              </p>
              <p className="text-textMuted text-xs">This takes effect immediately for all active users.</p>
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setDangerSaveConfirm(null)}>Cancel</Button>
            <Button variant="danger" onClick={confirmDangerSave}><Save size={12} /> Apply Change</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Roles & Permissions ─────────────────────────────────────────────────────

const ALL_PERMISSIONS = [
  { key: "manage_users",        label: "Manage Users",        category: "Users"      },
  { key: "reset_pin",           label: "Reset PIN",           category: "Users"      },
  { key: "flag_accounts",       label: "Flag Accounts",       category: "Users"      },
  { key: "manage_drivers",      label: "Manage Drivers",      category: "Drivers"    },
  { key: "review_kyc",          label: "Review KYC",          category: "Drivers"    },
  { key: "approve_withdrawals", label: "Approve Withdrawals", category: "Finance"    },
  { key: "view_ledger",         label: "View Ledger",         category: "Finance"    },
  { key: "download_statements", label: "Download Statements", category: "Finance"    },
  { key: "manage_refunds",      label: "Manage Refunds",      category: "Finance"    },
  { key: "view_analytics",      label: "View Analytics",      category: "Analytics"  },
  { key: "export_data",         label: "Export Data",         category: "Analytics"  },
  { key: "view_audit",          label: "View Audit Log",      category: "Compliance" },
  { key: "manage_compliance",   label: "Manage Compliance",   category: "Compliance" },
  { key: "view_risk",           label: "View Risk Dashboard", category: "Compliance" },
  { key: "manage_disputes",     label: "Manage Disputes",     category: "Support"    },
  { key: "manage_notifications",label: "Manage Notifications",category: "System"     },
  { key: "manage_promotions",   label: "Manage Promotions",   category: "Growth"     },
  { key: "manage_pricing",      label: "Manage Pricing",      category: "System"     },
  { key: "manage_limits",       label: "Manage Limits",       category: "System"     },
  { key: "broadcast_messages",  label: "Broadcast Messages",  category: "System"     },
  { key: "manage_staff",        label: "Manage Staff / HR",   category: "System"     },
  { key: "edit_fees",           label: "Edit Fees",           category: "System"     },
];

type RoleConfig = { label: string; color: string; permissions: string[] };

const DEFAULT_ROLES: Record<string, RoleConfig> = {
  superadmin: { label: "Superadmin", color: "purple", permissions: ALL_PERMISSIONS.map(p => p.key) },
  ceo:        { label: "CEO",        color: "purple", permissions: ALL_PERMISSIONS.map(p => p.key) },
  cfo:        { label: "CFO",        color: "cyan",   permissions: ["view_analytics","view_ledger","download_statements","approve_withdrawals","manage_refunds","view_risk","view_audit","edit_fees"] },
  cto:        { label: "CTO",        color: "cyan",   permissions: ["view_analytics","view_audit","manage_compliance","manage_limits","manage_pricing","manage_notifications"] },
  admin:      { label: "Admin",      color: "green",  permissions: ["manage_users","manage_drivers","review_kyc","approve_withdrawals","reset_pin","view_analytics","manage_disputes","flag_accounts"] },
  finance:    { label: "Finance",    color: "yellow", permissions: ["approve_withdrawals","view_ledger","download_statements","view_analytics","manage_refunds"] },
  support:    { label: "Support",    color: "orange", permissions: ["manage_users","reset_pin","manage_disputes","view_analytics"] },
  hr:         { label: "HR",         color: "purple", permissions: ["view_audit","view_analytics","export_data","manage_users","flag_accounts","download_statements","manage_staff"] },
};

const PERM_CATEGORIES = Array.from(new Set(ALL_PERMISSIONS.map(p => p.category)));

function RolesTab() {
  const [roles, setRoles] = useState(DEFAULT_ROLES);
  const [selected, setSelected] = useState<string>("admin");
  const [expanded, setExpanded] = useState<string[]>(PERM_CATEGORIES);
  const [addModal, setAddModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");

  const togglePerm = (roleKey: string, perm: string) => {
    setRoles(prev => {
      const role = prev[roleKey];
      const has = role.permissions.includes(perm);
      return { ...prev, [roleKey]: { ...role, permissions: has ? role.permissions.filter(p => p !== perm) : [...role.permissions, perm] } };
    });
  };

  const saveRole = async () => {
    try {
      await fetch(`${BASE}/api/admin/roles/${selected}`, {
        method: "PUT", headers: authHeaders(),
        body: JSON.stringify({ permissions: roles[selected].permissions }),
      });
      toast.success(`${roles[selected].label} permissions saved`);
    } catch {
      toast.success("Saved locally (backend endpoint not yet available)");
    }
  };

  const createRole = () => {
    const key = newRoleName.toLowerCase().replace(/\s+/g, "_");
    if (!key || roles[key]) { toast.error("Invalid or duplicate role name"); return; }
    setRoles(prev => ({ ...prev, [key]: { label: newRoleName, color: "green", permissions: [] } }));
    setSelected(key);
    setAddModal(false);
    setNewRoleName("");
    toast.success("Role created");
  };

  const role = roles[selected];
  const TONE: Record<string, any> = { purple: "purple", cyan: "cyan", green: "green", yellow: "yellow", orange: "orange" };

  return (
    <div className="flex gap-6">
      <div className="w-52 shrink-0 space-y-1">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-extrabold text-textDim uppercase tracking-widest">Roles</p>
          <button onClick={() => setAddModal(true)} className="text-cyan hover:text-cyan/70 transition-all"><Plus size={14} /></button>
        </div>
        {Object.entries(roles).map(([key, r]) => (
          <button
            key={key}
            onClick={() => setSelected(key)}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left ${selected === key ? "bg-cyanDim text-cyan border border-cyan/20" : "text-textMuted hover:text-text hover:bg-bg3"}`}>
            <Shield size={13} />{r.label}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Lock size={16} className="text-cyan" />
            <h2 className="text-text font-bold text-lg">{role?.label} Permissions</h2>
            <Badge label={`${role?.permissions.length} / ${ALL_PERMISSIONS.length}`} tone={TONE[role?.color] || "cyan"} />
          </div>
          <Button onClick={saveRole}>Save Changes</Button>
        </div>

        {PERM_CATEGORIES.map(cat => {
          const perms = ALL_PERMISSIONS.filter(p => p.category === cat);
          const isOpen = expanded.includes(cat);
          const checked = perms.filter(p => role?.permissions.includes(p.key)).length;
          return (
            <Card key={cat} className="overflow-hidden">
              <button onClick={() => setExpanded(prev => isOpen ? prev.filter(c => c !== cat) : [...prev, cat])}
                className="w-full flex items-center justify-between py-1 text-left">
                <div className="flex items-center gap-2">
                  {isOpen ? <ChevronDown size={14} className="text-textMuted" /> : <ChevronRight size={14} className="text-textMuted" />}
                  <span className="text-text font-bold text-sm">{cat}</span>
                  <span className="text-[10px] text-textMuted">{checked}/{perms.length}</span>
                </div>
              </button>
              {isOpen && (
                <div className="mt-3 space-y-1 pl-5">
                  {perms.map(perm => {
                    const has = role?.permissions.includes(perm.key);
                    return (
                      <label key={perm.key} className="flex items-center gap-3 py-2 cursor-pointer group">
                        <input type="checkbox" checked={has} onChange={() => togglePerm(selected, perm.key)} className="w-4 h-4 accent-cyan cursor-pointer" />
                        <span className={`text-sm font-medium transition-all ${has ? "text-text" : "text-textMuted"}`}>{perm.label}</span>
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

      <Modal open={addModal} onClose={() => setAddModal(false)} title="Create New Role">
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Role Name</label>
            <Input placeholder="e.g. Compliance Officer" value={newRoleName} onChange={e => setNewRoleName(e.target.value)} />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setAddModal(false)}>Cancel</Button>
            <Button onClick={createRole}>Create Role</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Active Sessions ─────────────────────────────────────────────────────────

function SessionsTab() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokeConfirm, setRevokeConfirm] = useState<{ id: string; name: string } | null>(null);
  const [revokeAllConfirm, setRevokeAllConfirm] = useState(false);

  const load = () => {
    setLoading(true);
    api.sessions().then(r => setSessions(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleRevoke = (id: string, name: string) => { setRevokeConfirm({ id, name }); };
  const doRevoke = async () => {
    if (!revokeConfirm) return;
    const { id } = revokeConfirm;
    setRevokeConfirm(null);
    setRevoking(id);
    try {
      await api.revokeSession(id);
      toast.success("Session revoked");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setRevoking(null); }
  };

  const handleRevokeAll = () => {
    const others = sessions.slice(1);
    if (!others.length) { toast.error("No other sessions to revoke"); return; }
    setRevokeAllConfirm(true);
  };
  const doRevokeAll = async () => {
    const others = sessions.slice(1);
    setRevokeAllConfirm(false);
    try {
      await Promise.all(others.map(s => api.revokeSession(s.id)));
      toast.success(`${others.length} sessions revoked`);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const byRole = sessions.reduce((acc: Record<string, number>, s) => {
    acc[s.role] = (acc[s.role] || 0) + 1; return acc;
  }, {});

  const sharedIps = sessions.map(s => s.ip_address).filter(ip => ip && sessions.filter(s2 => s2.ip_address === ip).length > 1);
  const hasSuspicious = sharedIps.length > 0;

  return (
    <div className="space-y-4">
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
          <p className={`text-2xl font-extrabold ${hasSuspicious ? "text-yellow" : "text-textMuted"}`}>{hasSuspicious ? sharedIps.length : 0}</p>
          <p className="text-xs text-textMuted mt-1">Shared IPs</p>
        </Card>
      </div>

      {hasSuspicious && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-yellow/10 border border-yellow/20">
          <AlertTriangle size={14} className="text-yellow" />
          <p className="text-sm text-yellow font-semibold">Multiple sessions from same IP — possible shared network or suspicious activity.</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-textMuted text-sm">{sessions.length} active admin session{sessions.length !== 1 ? "s" : ""}</p>
        <div className="flex gap-2">
          {sessions.length > 1 && (
            <Button variant="danger" onClick={handleRevokeAll}><LogOut size={13} /> Revoke All Others</Button>
          )}
          <Button variant="secondary" onClick={load}><RefreshCw size={13} /> Refresh</Button>
        </div>
      </div>

      {loading ? <Spinner /> : (
        <Table headers={["Admin", "Email", "Role", "IP Address", "Device", "Started", "Expires", "Actions"]} empty={!sessions.length}>
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
                    <span className={`font-mono text-xs ${sharedIp ? "text-yellow" : "text-textMuted"}`}>{s.ip_address || "—"}</span>
                  </div>
                </Td>
                <Td>
                  <div className="flex items-center gap-1 text-textDim">
                    <Monitor size={11} />
                    <span className="text-[10px]">{(s as any).user_agent ? ((s as any).user_agent.includes("Mobile") ? "Mobile" : "Desktop") : "Unknown"}</span>
                  </div>
                </Td>
                <Td className="text-textMuted text-xs">{formatDate(s.created_at)}</Td>
                <Td className="text-textMuted text-xs">{formatDate(s.expires_at)}</Td>
                <Td>
                  {i !== 0 && (
                    <Button variant="danger" onClick={() => handleRevoke(s.id, s.full_name)} loading={revoking === s.id}>
                      <LogOut size={12} /> Revoke
                    </Button>
                  )}
                </Td>
              </Tr>
            );
          })}
        </Table>
      )}

      {sessions.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Users size={14} className="text-textMuted" />
            <h3 className="text-text font-bold text-sm">Sessions by Role</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(byRole).map(([role, count]) => (
              <div key={role} className="flex items-center gap-2 px-3 py-1.5 bg-bg border border-border rounded-lg">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${roleBadgeColor(role)}`}>{role}</span>
                <span className="text-text font-bold text-sm">{count}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Revoke Session Confirmation Modal */}
      <Modal open={!!revokeConfirm} onClose={() => setRevokeConfirm(null)} title="Revoke Session">
        <div className="space-y-4">
          <p className="text-textMuted text-sm">Revoke the active session for <strong className="text-text">{revokeConfirm?.name}</strong>? They will be logged out immediately.</p>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setRevokeConfirm(null)}>Cancel</Button>
            <Button variant="danger" onClick={doRevoke}><LogOut size={12} /> Revoke Session</Button>
          </div>
        </div>
      </Modal>

      {/* Revoke All Sessions Confirmation Modal */}
      <Modal open={revokeAllConfirm} onClose={() => setRevokeAllConfirm(false)} title="Revoke All Other Sessions">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red/5 border border-red/20 rounded-xl">
            <AlertTriangle size={15} className="text-red flex-shrink-0 mt-0.5" />
            <p className="text-red text-sm">Revoke all <strong>{sessions.slice(1).length}</strong> other active sessions? All other logged-in admins will be forced to re-authenticate.</p>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setRevokeAllConfirm(false)}>Cancel</Button>
            <Button variant="danger" onClick={doRevokeAll}><LogOut size={12} /> Revoke All Others</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── API Keys ────────────────────────────────────────────────────────────────

type APIKey = {
  id: string; name: string; prefix: string; last4: string;
  scopes: string[]; created_by: string; created_at: string;
  last_used?: string; expires_at?: string; is_active: boolean;
};

const ALL_SCOPES = [
  "read:users", "write:users", "read:transactions", "read:drivers",
  "read:analytics", "write:notifications", "read:reports", "webhooks:send",
];

const MOCK_KEYS: APIKey[] = [
  { id: "1", name: "Mobile App Production",  prefix: "tnr_live", last4: "a7f2", scopes: ["read:users","read:transactions","read:drivers"], created_by: "CTO",   created_at: "2024-01-01T00:00:00Z", last_used: new Date(Date.now()-300000).toISOString(),    is_active: true },
  { id: "2", name: "Analytics Dashboard",    prefix: "tnr_live", last4: "c3d1", scopes: ["read:analytics","read:reports"],                created_by: "Admin", created_at: "2024-02-15T00:00:00Z", last_used: new Date(Date.now()-3600000).toISOString(),   is_active: true },
  { id: "3", name: "Webhook Relay Service",  prefix: "tnr_live", last4: "e9b4", scopes: ["webhooks:send","read:transactions"],            created_by: "CTO",   created_at: "2024-03-01T00:00:00Z", last_used: new Date(Date.now()-86400000).toISOString(),  expires_at: "2025-03-01T00:00:00Z", is_active: true },
  { id: "4", name: "Old Integration",        prefix: "tnr_live", last4: "f0e8", scopes: ["read:users"],                                  created_by: "Admin", created_at: "2023-06-01T00:00:00Z", last_used: new Date(Date.now()-2592000000).toISOString(), is_active: false },
];

function scopeTone(scope: string): any {
  return scope.startsWith("write:") || scope === "webhooks:send" ? "yellow" : "cyan";
}

function APIKeysTab() {
  const [keys, setKeys] = useState<APIKey[]>(MOCK_KEYS);
  const [createModal, setCreateModal] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", scopes: [] as string[], expires: "" });
  const [showSecret, setShowSecret] = useState(false);
  const dangerPin = useDangerPin();

  const create = () => {
    if (!form.name || form.scopes.length === 0) { toast.error("Name and at least one scope required"); return; }
    const generated = `tnr_live_${"x".repeat(28)}${Math.random().toString(36).slice(2, 6)}`;
    setKeys(prev => [{
      id: Date.now().toString(), name: form.name, prefix: "tnr_live",
      last4: generated.slice(-4), scopes: form.scopes, created_by: "You",
      created_at: new Date().toISOString(),
      expires_at: form.expires ? new Date(form.expires).toISOString() : undefined,
      is_active: true,
    }, ...prev]);
    setNewKey(generated);
    setCreateModal(false);
    setForm({ name: "", scopes: [], expires: "" });
  };

  const revoke = async (k: APIKey) => {
    const token = await dangerPin.request();
    if (!token) return;
    setKeys(prev => prev.map(x => x.id === k.id ? { ...x, is_active: false } : x));
    toast.success(`"${k.name}" revoked`);
  };

  const toggleScope = (scope: string) => {
    setForm(f => ({ ...f, scopes: f.scopes.includes(scope) ? f.scopes.filter(s => s !== scope) : [...f.scopes, scope] }));
  };

  return (
    <div className="space-y-6">
      {newKey && (
        <div className="bg-green/10 border border-green/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={15} className="text-yellow" />
            <p className="text-sm font-bold text-green">New API Key Created — Copy it now. It won't be shown again.</p>
          </div>
          <div className="flex items-center gap-3 bg-bg3 rounded-lg px-4 py-3">
            <code className="flex-1 text-cyan font-mono text-sm tracking-widest">
              {showSecret ? newKey : `${newKey.slice(0, 16)}${"•".repeat(24)}${newKey.slice(-4)}`}
            </code>
            <button onClick={() => setShowSecret(v => !v)} className="text-textMuted hover:text-text">
              {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button onClick={() => { navigator.clipboard.writeText(newKey); toast.success("Copied!"); }} className="text-textMuted hover:text-cyan">
              <Copy size={14} />
            </button>
          </div>
          <Button variant="secondary" onClick={() => setNewKey(null)} className="mt-3">Dismiss</Button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="text-center"><p className="text-2xl font-extrabold text-cyan">{keys.filter(k => k.is_active).length}</p><p className="text-xs text-textMuted mt-1">Active Keys</p></Card>
        <Card className="text-center"><p className="text-2xl font-extrabold text-textMuted">{keys.filter(k => !k.is_active).length}</p><p className="text-xs text-textMuted mt-1">Revoked</p></Card>
        <Card className="text-center"><p className="text-2xl font-extrabold text-yellow">{keys.filter(k => k.expires_at).length}</p><p className="text-xs text-textMuted mt-1">With Expiry</p></Card>
        <Card className="text-center"><p className="text-2xl font-extrabold text-green">{keys.filter(k => k.last_used && Date.now()-new Date(k.last_used).getTime()<3600000).length}</p><p className="text-xs text-textMuted mt-1">Used Last Hour</p></Card>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2"><Key size={16} className="text-cyan" /><h2 className="text-text font-bold">API Keys</h2></div>
          <Button onClick={() => setCreateModal(true)}><Plus size={13} /> Generate Key</Button>
        </div>
        <Table headers={["Name", "Key", "Scopes", "Created By", "Last Used", "Expires", "Status", "Actions"]} empty={false}>
          {keys.map(k => (
            <Tr key={k.id}>
              <Td className="font-semibold">{k.name}</Td>
              <Td><code className="text-xs font-mono text-textMuted">{k.prefix}_••••••••{k.last4}</code></Td>
              <Td><div className="flex flex-wrap gap-1">{k.scopes.map(s => <Badge key={s} label={s} tone={scopeTone(s)} />)}</div></Td>
              <Td className="text-textMuted text-xs">{k.created_by}</Td>
              <Td className="text-textMuted text-xs">{k.last_used ? formatDate(k.last_used) : "Never"}</Td>
              <Td className="text-textMuted text-xs">{k.expires_at ? formatDate(k.expires_at) : "Never"}</Td>
              <Td><Badge label={k.is_active ? "active" : "revoked"} tone={k.is_active ? "green" : "red"} /></Td>
              <Td>{k.is_active && <Button variant="danger" onClick={() => revoke(k)}><Trash2 size={12} /> Revoke</Button>}</Td>
            </Tr>
          ))}
        </Table>
      </Card>

      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Generate API Key">
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Key Name *</label>
            <Input placeholder="e.g. Mobile App Staging" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-2">Scopes *</label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_SCOPES.map(scope => (
                <label key={scope} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.scopes.includes(scope)} onChange={() => toggleScope(scope)} className="w-4 h-4 accent-cyan" />
                  <code className="text-xs font-mono text-textMuted">{scope}</code>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Expiry Date (optional)</label>
            <Input type="date" value={form.expires} onChange={e => setForm(f => ({ ...f, expires: e.target.value }))} />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setCreateModal(false)}>Cancel</Button>
            <Button onClick={create}><Key size={13} /> Generate Key</Button>
          </div>
        </div>
      </Modal>

      <DangerPinModal open={dangerPin.open} onSuccess={dangerPin.handleSuccess} onCancel={dangerPin.handleCancel} actionLabel="revoke API key" />
    </div>
  );
}

// ── Feature Flags ───────────────────────────────────────────────────────────

function FeatureFlagsTab() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModal, setCreateModal] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", rollout_pct: "100", enabled: false });
  const dangerPin = useDangerPin();

  const load = () => {
    setLoading(true);
    api.featureFlags().then(r => setFlags(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toggle = async (flag: FeatureFlag) => {
    if (flag.rollout_pct === 100 && flag.enabled) {
      const token = await dangerPin.request();
      if (!token) return;
    }
    try {
      await api.updateFlag(flag.id, { enabled: !flag.enabled });
      toast.success(`${flag.name} ${flag.enabled ? "disabled" : "enabled"}`);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const updateRollout = async (flag: FeatureFlag, pct: number) => {
    try {
      await api.updateFlag(flag.id, { rollout_pct: pct });
      toast.success(`Rollout updated to ${pct}%`);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const create = async () => {
    if (!form.name) { toast.error("Name required"); return; }
    try {
      await api.createFlag({ name: form.name, description: form.description, enabled: form.enabled, rollout_pct: parseInt(form.rollout_pct) || 100 });
      toast.success("Feature flag created");
      setCreateModal(false);
      setForm({ name: "", description: "", rollout_pct: "100", enabled: false });
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const remove = async (flag: FeatureFlag) => {
    const token = await dangerPin.request();
    if (!token) return;
    try {
      await api.deleteFlag(flag.id);
      toast.success(`${flag.name} deleted`);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="text-center"><p className="text-2xl font-extrabold text-green">{flags.filter(f => f.enabled).length}</p><p className="text-xs text-textMuted mt-1">Enabled</p></Card>
        <Card className="text-center"><p className="text-2xl font-extrabold text-textMuted">{flags.filter(f => !f.enabled).length}</p><p className="text-xs text-textMuted mt-1">Disabled</p></Card>
        <Card className="text-center"><p className="text-2xl font-extrabold text-yellow">{flags.filter(f => f.rollout_pct > 0 && f.rollout_pct < 100).length}</p><p className="text-xs text-textMuted mt-1">Partial Rollout</p></Card>
        <Card className="text-center"><p className="text-2xl font-extrabold text-cyan">{flags.length}</p><p className="text-xs text-textMuted mt-1">Total Flags</p></Card>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-cyan" />
            <h2 className="text-text font-bold">Feature Flags</h2>
            <span className="text-[10px] text-textMuted">(disabling 100% rollout flags requires danger PIN)</span>
          </div>
          <Button onClick={() => setCreateModal(true)}><Plus size={13} /> New Flag</Button>
        </div>

        {loading ? <Spinner /> : (
          <Table headers={["Flag", "Rollout", "Status", "Updated", "Actions"]} empty={!flags.length}>
            {flags.map(flag => (
              <Tr key={flag.id}>
                <Td>
                  <p className="font-semibold text-sm">{flag.name}</p>
                  <p className="text-[10px] text-textMuted max-w-[280px] truncate">{flag.description}</p>
                </Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 rounded-full bg-bg3">
                      <div className="h-1.5 rounded-full bg-cyan" style={{ width: `${flag.rollout_pct}%` }} />
                    </div>
                    <span className="text-xs text-textMuted">{flag.rollout_pct}%</span>
                    <select value={flag.rollout_pct} onChange={e => updateRollout(flag, parseInt(e.target.value))}
                      className="text-[10px] bg-bg3 border border-border rounded px-1 py-0.5 text-textMuted">
                      {[0,10,25,50,75,100].map(p => <option key={p} value={p}>{p}%</option>)}
                    </select>
                  </div>
                </Td>
                <Td><Badge label={flag.enabled ? "enabled" : "disabled"} tone={flag.enabled ? "green" : "red"} /></Td>
                <Td className="text-textMuted text-xs">{formatDate(flag.updated_at)}</Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggle(flag)} className="text-textMuted hover:text-cyan transition-all">
                      {flag.enabled ? <ToggleRight size={22} className="text-green" /> : <ToggleLeft size={22} className="text-textDim" />}
                    </button>
                    <Button variant="ghost" onClick={() => remove(flag)}><Trash2 size={13} className="text-red" /></Button>
                  </div>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Create Feature Flag">
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Name *</label>
            <Input placeholder="My Feature Flag" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Description</label>
            <Input placeholder="What does this flag control?" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Rollout % (0–100)</label>
              <Input type="number" min="0" max="100" value={form.rollout_pct} onChange={e => setForm(f => ({ ...f, rollout_pct: e.target.value }))} />
            </div>
            <div className="flex items-center gap-3 pt-5">
              <input type="checkbox" checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} className="w-4 h-4 accent-green" id="ff-enabled" />
              <label htmlFor="ff-enabled" className="text-sm text-text cursor-pointer">Enable immediately</label>
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setCreateModal(false)}>Cancel</Button>
            <Button onClick={create}><Plus size={13} /> Create Flag</Button>
          </div>
        </div>
      </Modal>

      <DangerPinModal open={dangerPin.open} onSuccess={dangerPin.handleSuccess} onCancel={dangerPin.handleCancel} actionLabel="perform this action" />
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter();
  const superAdmin = isSuperAdmin();
  const isCeoOrSuper = superAdmin || hasPermission("edit_fees");
  const [tab, setTab] = useState<Tab>("config");

  useEffect(() => {
    if (!superAdmin) router.push("/admin/dashboard");
  }, []);

  const switchTab = (t: Tab) => setTab(t);

  if (!superAdmin) return null;

  return (
    <AdminShell title="Settings & Security">
      {/* Tab bar */}
      <div className="flex gap-1 mb-6 p-1 bg-bg2 border border-border rounded-xl w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => switchTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              tab === id
                ? "bg-cyanDim text-cyan border border-cyan/20"
                : "text-textMuted hover:text-text hover:bg-bg3"
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {tab === "config"        && <ConfigTab isCeoOrSuper={isCeoOrSuper} />}
      {tab === "roles"         && <RolesTab />}
      {tab === "sessions"      && <SessionsTab />}
      {tab === "api-keys"      && <APIKeysTab />}
      {tab === "feature-flags" && <FeatureFlagsTab />}
    </AdminShell>
  );
}
