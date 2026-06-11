"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Spinner, Modal, Input, StatCard } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  DollarSign, Plus, Edit2, Trash2, Save, Zap, ZapOff, AlertTriangle,
} from "lucide-react";
import toast from "react-hot-toast";
import { api, PricingRule } from "@/lib/api";

const VEHICLE_TYPES = ["minibus_taxi", "sedan", "suv", "motorcycle", "tuk_tuk", "bus"];

const VEH_TONE: Record<string, "cyan" | "green" | "yellow" | "purple" | "red" | "muted"> = {
  minibus_taxi: "cyan", sedan: "green", suv: "purple", motorcycle: "yellow", tuk_tuk: "orange" as any, bus: "red",
};

const emptyForm = (): Partial<PricingRule> => ({
  vehicle_type: "minibus_taxi",
  zone_id: "",
  base_fare: 0,
  per_km: 0,
  per_minute: 0,
  min_fare: 0,
  surge_multiplier: 1.0,
  surge_active: false,
});

export default function PricingPage() {
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<PricingRule | null>(null);
  const [form, setForm] = useState<Partial<PricingRule>>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PricingRule | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [surgeTarget, setSurgeTarget] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.pricingRules().then((r) => setRules(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setModal(true); };
  const openEdit = (r: PricingRule) => { setEditing(r); setForm({ ...r }); setModal(true); };

  const save = async () => {
    if (!form.vehicle_type) { toast.error("Vehicle type required"); return; }
    if (!form.base_fare || form.base_fare <= 0) { toast.error("Base fare must be greater than 0"); return; }
    setSaving(true);
    try {
      if (editing) {
        await api.updatePricingRule(editing.id, form);
        toast.success("Pricing rule updated");
      } else {
        await api.createPricingRule(form as any);
        toast.success("Pricing rule created");
      }
      setModal(false);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deletePricingRule(deleteTarget.id);
      toast.success("Pricing rule deleted");
      setDeleteTarget(null);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setDeleting(false); }
  };

  const toggleSurge = async (r: PricingRule) => {
    setSurgeTarget(r.id);
    try {
      await api.updatePricingRule(r.id, { surge_active: !r.surge_active });
      toast.success(`Surge ${r.surge_active ? "deactivated" : "activated"} for ${r.vehicle_type}`);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSurgeTarget(null); }
  };

  const num = (key: keyof PricingRule) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: parseFloat(e.target.value) || 0 }));

  const surgeActive = rules.filter((r) => r.surge_active).length;
  const avgBase = rules.length ? rules.reduce((s, r) => s + r.base_fare, 0) / rules.length : 0;
  const avgPerKm = rules.length ? rules.reduce((s, r) => s + r.per_km, 0) / rules.length : 0;

  return (
    <AdminShell title="Pricing Rules">
      <div className="space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Active Rules" value={String(rules.length)} tone="cyan" />
          <StatCard label="Surge Active" value={String(surgeActive)} tone={surgeActive > 0 ? "red" : "green"} />
          <StatCard label="Avg Base Fare" value={formatZAR(avgBase)} tone="yellow" />
          <StatCard label="Avg / km" value={formatZAR(avgPerKm)} tone="purple" />
        </div>

        {/* Surge alert */}
        {surgeActive > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red/10 border border-red/20">
            <Zap size={16} className="text-red" />
            <p className="text-sm text-red font-semibold">
              Surge pricing is currently active on {surgeActive} rule{surgeActive > 1 ? "s" : ""}. Fares are multiplied.
            </p>
          </div>
        )}

        {/* Rules table */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <DollarSign size={16} className="text-cyan" />
              <h2 className="text-text font-bold">Fare Rules</h2>
            </div>
            <Button onClick={openCreate}>
              <Plus size={13} /> New Rule
            </Button>
          </div>

          {loading ? <Spinner /> : (
            <Table
              headers={["Vehicle Type", "Zone", "Base Fare", "Per km", "Per min", "Min Fare", "Surge", "Updated", "Actions"]}
              empty={!rules.length}
            >
              {rules.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <Badge label={r.vehicle_type.replace(/_/g, " ")} tone={VEH_TONE[r.vehicle_type] || "muted"} />
                  </Td>
                  <Td className="text-textMuted text-xs">{r.zone_name || "Default"}</Td>
                  <Td className="font-bold text-green">{formatZAR(r.base_fare)}</Td>
                  <Td className="text-text font-semibold">{formatZAR(r.per_km)}</Td>
                  <Td className="text-textMuted text-xs">{formatZAR(r.per_minute)}</Td>
                  <Td className="text-textMuted text-xs">{formatZAR(r.min_fare)}</Td>
                  <Td>
                    {r.surge_active ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red bg-red/10 border border-red/20 px-2 py-0.5 rounded-full">
                        <Zap size={9} /> {r.surge_multiplier}×
                      </span>
                    ) : (
                      <span className="text-[10px] text-textDim">Off</span>
                    )}
                  </Td>
                  <Td className="text-textMuted text-xs">{formatDate(r.updated_at)}</Td>
                  <Td>
                    <div className="flex gap-1.5">
                      <Button
                        variant={r.surge_active ? "danger" : "secondary"}
                        loading={surgeTarget === r.id}
                        onClick={() => toggleSurge(r)}
                        title={r.surge_active ? "Deactivate surge" : "Activate surge"}
                      >
                        {r.surge_active ? <ZapOff size={12} /> : <Zap size={12} />}
                      </Button>
                      <Button variant="secondary" onClick={() => openEdit(r)}>
                        <Edit2 size={12} />
                      </Button>
                      <Button variant="danger" onClick={() => setDeleteTarget(r)}>
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </Card>

        {/* Info card */}
        <Card className="bg-bg3">
          <h3 className="text-text font-bold text-sm mb-3">How Fare Calculation Works</h3>
          <div className="grid md:grid-cols-3 gap-4 text-xs text-textMuted">
            <div>
              <p className="font-bold text-textMuted mb-1 uppercase text-[10px] tracking-widest">Base Formula</p>
              <p className="font-mono text-text bg-bg2 rounded px-2 py-1 text-[11px]">
                fare = base_fare + (km × per_km) + (min × per_minute)
              </p>
              <p className="mt-1">Clamped to min_fare if result is lower.</p>
            </div>
            <div>
              <p className="font-bold text-textMuted mb-1 uppercase text-[10px] tracking-widest">Surge Pricing</p>
              <p className="font-mono text-text bg-bg2 rounded px-2 py-1 text-[11px]">
                final = fare × surge_multiplier
              </p>
              <p className="mt-1">Only applied when surge_active is toggled on.</p>
            </div>
            <div>
              <p className="font-bold text-textMuted mb-1 uppercase text-[10px] tracking-widest">Zone Override</p>
              <p className="mt-1">Zone-specific rules take precedence over default rules for the same vehicle type.</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Create / Edit Modal */}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editing ? `Edit Rule — ${editing.vehicle_type.replace(/_/g, " ")}` : "Create Pricing Rule"}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Vehicle Type *</label>
              <select
                value={form.vehicle_type}
                onChange={(e) => setForm((f) => ({ ...f, vehicle_type: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-bg3 border border-border text-text text-sm outline-none focus:border-cyan"
              >
                {VEHICLE_TYPES.map((v) => (
                  <option key={v} value={v}>{v.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Zone ID (optional)</label>
              <Input
                placeholder="Leave blank for default"
                value={form.zone_id || ""}
                onChange={(e) => setForm((f) => ({ ...f, zone_id: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Base Fare (ZAR) *</label>
              <Input type="number" step="0.50" min="0" value={String(form.base_fare ?? "")} onChange={num("base_fare")} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Per km (ZAR)</label>
              <Input type="number" step="0.10" min="0" value={String(form.per_km ?? "")} onChange={num("per_km")} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Per Minute (ZAR)</label>
              <Input type="number" step="0.05" min="0" value={String(form.per_minute ?? "")} onChange={num("per_minute")} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Minimum Fare (ZAR)</label>
              <Input type="number" step="0.50" min="0" value={String(form.min_fare ?? "")} onChange={num("min_fare")} />
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-3">Surge Pricing</p>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="surge-active"
                  checked={!!form.surge_active}
                  onChange={(e) => setForm((f) => ({ ...f, surge_active: e.target.checked }))}
                  className="w-4 h-4 accent-red"
                />
                <label htmlFor="surge-active" className="text-sm text-text cursor-pointer">Surge Active</label>
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Multiplier</label>
                <Input
                  type="number"
                  step="0.1"
                  min="1"
                  max="5"
                  value={String(form.surge_multiplier ?? 1)}
                  onChange={num("surge_multiplier")}
                />
              </div>
            </div>
          </div>

          {/* Live preview */}
          {(form.base_fare ?? 0) > 0 && (
            <div className="bg-bg3 rounded-lg p-3 border border-border">
              <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-2">Example Fare Preview (5km, 15min trip)</p>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-textMuted">Normal:</span>
                <span className="font-bold text-green">
                  {formatZAR(
                    Math.max(
                      (form.base_fare ?? 0) + 5 * (form.per_km ?? 0) + 15 * (form.per_minute ?? 0),
                      form.min_fare ?? 0
                    )
                  )}
                </span>
                {form.surge_active && (
                  <>
                    <span className="text-textMuted">Surge ({form.surge_multiplier}×):</span>
                    <span className="font-bold text-red">
                      {formatZAR(
                        Math.max(
                          (form.base_fare ?? 0) + 5 * (form.per_km ?? 0) + 15 * (form.per_minute ?? 0),
                          form.min_fare ?? 0
                        ) * (form.surge_multiplier ?? 1)
                      )}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
            <Button onClick={save} loading={saving}>
              <Save size={13} /> {editing ? "Save Changes" : "Create Rule"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Pricing Rule">
        <div className="space-y-4">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red/10 border border-red/20">
            <AlertTriangle size={16} className="text-red" />
            <p className="text-sm text-red">
              This will permanently delete the <strong>{deleteTarget?.vehicle_type.replace(/_/g, " ")}</strong>
              {deleteTarget?.zone_name ? ` (${deleteTarget.zone_name})` : " (default)"} pricing rule.
            </p>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={confirmDelete} loading={deleting}>
              <Trash2 size={13} /> Delete Rule
            </Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
