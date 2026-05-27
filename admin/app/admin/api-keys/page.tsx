"use client";
import { useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Modal, Input } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { Key, Plus, Trash2, Copy, Eye, EyeOff, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import { DangerPinModal, useDangerPin } from "@/components/DangerPinModal";

type APIKey = {
  id: string;
  name: string;
  prefix: string;
  last4: string;
  scopes: string[];
  created_by: string;
  created_at: string;
  last_used?: string;
  expires_at?: string;
  is_active: boolean;
};

const ALL_SCOPES = [
  "read:users", "write:users", "read:transactions", "read:drivers",
  "read:analytics", "write:notifications", "read:reports", "webhooks:send",
];

const MOCK_KEYS: APIKey[] = [
  { id: "1", name: "Mobile App Production", prefix: "tnr_live", last4: "a7f2", scopes: ["read:users", "read:transactions", "read:drivers"], created_by: "CTO", created_at: "2024-01-01T00:00:00Z", last_used: new Date(Date.now() - 300000).toISOString(), is_active: true },
  { id: "2", name: "Analytics Dashboard", prefix: "tnr_live", last4: "c3d1", scopes: ["read:analytics", "read:reports"], created_by: "Admin", created_at: "2024-02-15T00:00:00Z", last_used: new Date(Date.now() - 3600000).toISOString(), is_active: true },
  { id: "3", name: "Webhook Relay Service", prefix: "tnr_live", last4: "e9b4", scopes: ["webhooks:send", "read:transactions"], created_by: "CTO", created_at: "2024-03-01T00:00:00Z", last_used: new Date(Date.now() - 86400000).toISOString(), expires_at: "2025-03-01T00:00:00Z", is_active: true },
  { id: "4", name: "Old Integration", prefix: "tnr_live", last4: "f0e8", scopes: ["read:users"], created_by: "Admin", created_at: "2023-06-01T00:00:00Z", last_used: new Date(Date.now() - 2592000000).toISOString(), is_active: false },
];

const SCOPE_TONE = (scope: string): any => {
  if (scope.startsWith("write:") || scope === "webhooks:send") return "yellow";
  return "cyan";
};

export default function APIKeysPage() {
  const [keys, setKeys] = useState<APIKey[]>(MOCK_KEYS);
  const [createModal, setCreateModal] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", scopes: [] as string[], expires: "" });
  const [showSecret, setShowSecret] = useState(false);
  const dangerPin = useDangerPin();

  const create = () => {
    if (!form.name || form.scopes.length === 0) { toast.error("Name and at least one scope required"); return; }
    const generated = `tnr_live_${"x".repeat(28)}${Math.random().toString(36).slice(2, 6)}`;
    const newKeyObj: APIKey = {
      id: Date.now().toString(),
      name: form.name,
      prefix: "tnr_live",
      last4: generated.slice(-4),
      scopes: form.scopes,
      created_by: "You",
      created_at: new Date().toISOString(),
      expires_at: form.expires ? new Date(form.expires).toISOString() : undefined,
      is_active: true,
    };
    setKeys((prev) => [newKeyObj, ...prev]);
    setNewKey(generated);
    setCreateModal(false);
    setForm({ name: "", scopes: [], expires: "" });
  };

  const revoke = async (k: APIKey) => {
    const token = await dangerPin.request();
    if (!token) return;
    setKeys((prev) => prev.map((x) => x.id === k.id ? { ...x, is_active: false } : x));
    toast.success(`"${k.name}" revoked`);
  };

  const toggleScope = (scope: string) => {
    setForm((f) => ({
      ...f,
      scopes: f.scopes.includes(scope) ? f.scopes.filter((s) => s !== scope) : [...f.scopes, scope],
    }));
  };

  return (
    <AdminShell title="API Keys">
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
              <button onClick={() => setShowSecret(!showSecret)} className="text-textMuted hover:text-text">
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
          <Card className="text-center">
            <p className="text-2xl font-extrabold text-cyan">{keys.filter((k) => k.is_active).length}</p>
            <p className="text-xs text-textMuted mt-1">Active Keys</p>
          </Card>
          <Card className="text-center">
            <p className="text-2xl font-extrabold text-textMuted">{keys.filter((k) => !k.is_active).length}</p>
            <p className="text-xs text-textMuted mt-1">Revoked</p>
          </Card>
          <Card className="text-center">
            <p className="text-2xl font-extrabold text-yellow">{keys.filter((k) => k.expires_at).length}</p>
            <p className="text-xs text-textMuted mt-1">With Expiry</p>
          </Card>
          <Card className="text-center">
            <p className="text-2xl font-extrabold text-green">
              {keys.filter((k) => k.last_used && Date.now() - new Date(k.last_used).getTime() < 3600000).length}
            </p>
            <p className="text-xs text-textMuted mt-1">Used Last Hour</p>
          </Card>
        </div>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Key size={16} className="text-cyan" />
              <h2 className="text-text font-bold">API Keys</h2>
            </div>
            <Button onClick={() => setCreateModal(true)}>
              <Plus size={13} /> Generate Key
            </Button>
          </div>

          <Table
            headers={["Name", "Key", "Scopes", "Created By", "Last Used", "Expires", "Status", "Actions"]}
            empty={false}
          >
            {keys.map((k) => (
              <Tr key={k.id}>
                <Td className="font-semibold">{k.name}</Td>
                <Td>
                  <code className="text-xs font-mono text-textMuted">
                    {k.prefix}_••••••••{k.last4}
                  </code>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {k.scopes.map((s) => <Badge key={s} label={s} tone={SCOPE_TONE(s)} />)}
                  </div>
                </Td>
                <Td className="text-textMuted text-xs">{k.created_by}</Td>
                <Td className="text-textMuted text-xs">{k.last_used ? formatDate(k.last_used) : "Never"}</Td>
                <Td className="text-textMuted text-xs">{k.expires_at ? formatDate(k.expires_at) : "Never"}</Td>
                <Td><Badge label={k.is_active ? "active" : "revoked"} tone={k.is_active ? "green" : "red"} /></Td>
                <Td>
                  {k.is_active && (
                    <Button variant="danger" onClick={() => revoke(k)}>
                      <Trash2 size={12} /> Revoke
                    </Button>
                  )}
                </Td>
              </Tr>
            ))}
          </Table>
        </Card>
      </div>

      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Generate API Key">
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Key Name *</label>
            <Input placeholder="e.g. Mobile App Staging" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-2">Scopes *</label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.scopes.includes(scope)} onChange={() => toggleScope(scope)} className="w-4 h-4 accent-cyan" />
                  <code className="text-xs font-mono text-textMuted">{scope}</code>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Expiry Date (optional)</label>
            <Input type="date" value={form.expires} onChange={(e) => setForm((f) => ({ ...f, expires: e.target.value }))} />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setCreateModal(false)}>Cancel</Button>
            <Button onClick={create}><Key size={13} /> Generate Key</Button>
          </div>
        </div>
      </Modal>

      <DangerPinModal
        open={dangerPin.open}
        onSuccess={dangerPin.handleSuccess}
        onCancel={dangerPin.handleCancel}
        actionLabel="revoke API key"
      />
    </AdminShell>
  );
}
