"use client";
import { useState, useEffect } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Modal, Input, Spinner } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { ToggleLeft, ToggleRight, Plus, Zap, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { api, FeatureFlag } from "@/lib/api";
import { DangerPinModal, useDangerPin } from "@/components/DangerPinModal";

export default function FeatureFlagsPage() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModal, setCreateModal] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", rollout_pct: "100", enabled: false });
  const dangerPin = useDangerPin();

  const load = () => {
    setLoading(true);
    api.featureFlags().then((r) => setFlags(r.data)).finally(() => setLoading(false));
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
      await api.createFlag({
        name: form.name,
        description: form.description,
        enabled: form.enabled,
        rollout_pct: parseInt(form.rollout_pct) || 100,
      });
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
    <AdminShell title="Feature Flags">
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="text-center">
            <p className="text-2xl font-extrabold text-green">{flags.filter((f) => f.enabled).length}</p>
            <p className="text-xs text-textMuted mt-1">Enabled</p>
          </Card>
          <Card className="text-center">
            <p className="text-2xl font-extrabold text-textMuted">{flags.filter((f) => !f.enabled).length}</p>
            <p className="text-xs text-textMuted mt-1">Disabled</p>
          </Card>
          <Card className="text-center">
            <p className="text-2xl font-extrabold text-yellow">{flags.filter((f) => f.rollout_pct > 0 && f.rollout_pct < 100).length}</p>
            <p className="text-xs text-textMuted mt-1">Partial Rollout</p>
          </Card>
          <Card className="text-center">
            <p className="text-2xl font-extrabold text-cyan">{flags.length}</p>
            <p className="text-xs text-textMuted mt-1">Total Flags</p>
          </Card>
        </div>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-cyan" />
              <h2 className="text-text font-bold">Feature Flags</h2>
              <span className="text-[10px] text-textMuted">(disabling 100% rollout flags requires danger PIN)</span>
            </div>
            <Button onClick={() => setCreateModal(true)}>
              <Plus size={13} /> New Flag
            </Button>
          </div>

          {loading ? <Spinner /> : (
            <Table
              headers={["Flag", "Rollout", "Status", "Updated", "Actions"]}
              empty={!flags.length}
            >
              {flags.map((flag) => (
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
                      <select
                        value={flag.rollout_pct}
                        onChange={(e) => updateRollout(flag, parseInt(e.target.value))}
                        className="text-[10px] bg-bg3 border border-border rounded px-1 py-0.5 text-textMuted"
                      >
                        {[0,10,25,50,75,100].map((p) => <option key={p} value={p}>{p}%</option>)}
                      </select>
                    </div>
                  </Td>
                  <Td>
                    <Badge label={flag.enabled ? "enabled" : "disabled"} tone={flag.enabled ? "green" : "red"} />
                  </Td>
                  <Td className="text-textMuted text-xs">{formatDate(flag.updated_at)}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggle(flag)} className="text-textMuted hover:text-cyan transition-all">
                        {flag.enabled
                          ? <ToggleRight size={22} className="text-green" />
                          : <ToggleLeft size={22} className="text-textDim" />}
                      </button>
                      <Button variant="ghost" onClick={() => remove(flag)}>
                        <Trash2 size={13} className="text-red" />
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Create Feature Flag">
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Name *</label>
            <Input placeholder="My Feature Flag" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Description</label>
            <Input placeholder="What does this flag control?" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Rollout % (0–100)</label>
              <Input type="number" min="0" max="100" value={form.rollout_pct} onChange={(e) => setForm((f) => ({ ...f, rollout_pct: e.target.value }))} />
            </div>
            <div className="flex items-center gap-3 pt-5">
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} className="w-4 h-4 accent-green" id="enabled-check" />
              <label htmlFor="enabled-check" className="text-sm text-text cursor-pointer">Enable immediately</label>
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setCreateModal(false)}>Cancel</Button>
            <Button onClick={create}><Plus size={13} /> Create Flag</Button>
          </div>
        </div>
      </Modal>

      <DangerPinModal
        open={dangerPin.open}
        onSuccess={dangerPin.handleSuccess}
        onCancel={dangerPin.handleCancel}
        actionLabel="perform this action"
      />
    </AdminShell>
  );
}
