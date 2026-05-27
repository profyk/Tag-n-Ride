"use client";
import { useState, useEffect } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Modal, Input, Spinner } from "@/components/ui";
import { formatZAR } from "@/lib/utils";
import { Zap, Edit2, Save, TrendingUp, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { api, PricingRule } from "@/lib/api";

export default function PricingPage() {
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PricingRule | null>(null);
  const [editModal, setEditModal] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [form, setForm] = useState<Partial<PricingRule>>({});
  const [newForm, setNewForm] = useState({
    vehicle_type: "all", base_fare: "", per_km: "", per_minute: "", min_fare: "",
    surge_multiplier: "1.0", surge_active: false, zone_id: "",
  });

  const load = () => {
    setLoading(true);
    api.pricingRules().then((r) => setRules(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openEdit = (r: PricingRule) => { setEditing(r); setForm({ ...r }); setEditModal(true); };

  const save = async () => {
    if (!editing) return;
    try {
      await api.updatePricingRule(editing.id, {
        base_fare: form.base_fare, per_km: form.per_km, per_minute: form.per_minute,
        min_fare: form.min_fare, surge_multiplier: form.surge_multiplier, surge_active: form.surge_active,
      });
      toast.success("Pricing rule updated");
      setEditModal(false);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const toggleSurge = async (r: PricingRule) => {
    try {
      await api.updatePricingRule(r.id, { surge_active: !r.surge_active });
      toast.success(`Surge ${r.surge_active ? "disabled" : "enabled"} for ${r.vehicle_type}`);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const create = async () => {
    const { vehicle_type, base_fare, per_km, per_minute, min_fare, surge_multiplier, surge_active, zone_id } = newForm;
    if (!base_fare || !per_km || !min_fare) { toast.error("Base fare, per km, and min fare are required"); return; }
    try {
      await api.createPricingRule({
        vehicle_type, base_fare: parseFloat(base_fare), per_km: parseFloat(per_km),
        per_minute: parseFloat(per_minute) || 0, min_fare: parseFloat(min_fare),
        surge_multiplier: parseFloat(surge_multiplier) || 1.0, surge_active,
        zone_id: zone_id || undefined,
      } as any);
      toast.success("Pricing rule created");
      setCreateModal(false);
      setNewForm({ vehicle_type: "all", base_fare: "", per_km: "", per_minute: "", min_fare: "", surge_multiplier: "1.0", surge_active: false, zone_id: "" });
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const remove = async (r: PricingRule) => {
    if (!confirm(`Delete pricing rule for ${r.vehicle_type}?`)) return;
    try {
      await api.deletePricingRule(r.id);
      toast.success("Rule deleted");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const estimate = (r: PricingRule, km: number, mins: number) =>
    Math.max(r.min_fare, (r.base_fare + r.per_km * km + r.per_minute * mins) * (r.surge_active ? r.surge_multiplier : 1));

  return (
    <AdminShell title="Dynamic Pricing">
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="text-center">
            <p className="text-2xl font-extrabold text-cyan">{rules.length}</p>
            <p className="text-xs text-textMuted mt-1">Pricing Rules</p>
          </Card>
          <Card className="text-center">
            <p className="text-2xl font-extrabold text-red">{rules.filter((r) => r.surge_active).length}</p>
            <p className="text-xs text-textMuted mt-1">Surge Active</p>
          </Card>
          <Card className="text-center">
            <p className="text-2xl font-extrabold text-green">{formatZAR(Math.min(...(rules.map((r) => r.per_km) || [0])))}</p>
            <p className="text-xs text-textMuted mt-1">Min Rate / km</p>
          </Card>
          <Card className="text-center">
            <p className="text-2xl font-extrabold text-yellow">
              {rules.length ? Math.max(...rules.map((r) => r.surge_multiplier)).toFixed(1) : "0"}x
            </p>
            <p className="text-xs text-textMuted mt-1">Max Surge</p>
          </Card>
        </div>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-yellow" />
              <h2 className="text-text font-bold">Pricing Rules</h2>
            </div>
            <Button onClick={() => setCreateModal(true)}><Plus size={13} /> Add Rule</Button>
          </div>

          {loading ? <Spinner /> : (
            <Table
              headers={["Vehicle Type", "Zone", "Base Fare", "Per km", "Per min", "Min Fare", "Surge", "Actions"]}
              empty={!rules.length}
            >
              {rules.map((r) => (
                <Tr key={r.id}>
                  <Td><span className="font-semibold text-sm capitalize">{r.vehicle_type}</span></Td>
                  <Td className="text-textMuted text-xs">{r.zone_name || "All Zones"}</Td>
                  <Td className="font-semibold">{formatZAR(r.base_fare)}</Td>
                  <Td className="font-semibold">{formatZAR(r.per_km)}</Td>
                  <Td className="font-semibold">{r.per_minute > 0 ? formatZAR(r.per_minute) : "—"}</Td>
                  <Td className="font-semibold">{formatZAR(r.min_fare)}</Td>
                  <Td>
                    <button
                      onClick={() => toggleSurge(r)}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-bold transition-all ${r.surge_active ? "bg-red/10 text-red border border-red/20" : "bg-bg3 text-textMuted border border-border"}`}
                    >
                      <Zap size={10} />
                      {r.surge_active ? `${r.surge_multiplier}x ON` : "OFF"}
                    </button>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" onClick={() => openEdit(r)}><Edit2 size={12} /> Edit</Button>
                      <Button variant="ghost" onClick={() => remove(r)}><Trash2 size={13} className="text-red" /></Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </Card>

        {!loading && rules.length > 0 && (
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={16} className="text-green" />
              <h2 className="text-text font-bold">Fare Estimator</h2>
            </div>
            <div className="grid md:grid-cols-5 gap-3 items-center">
              {[5, 10, 20, 50, 100].map((km) => (
                <div key={km} className="bg-bg3 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-textMuted uppercase font-bold tracking-widest mb-2">{km} km</p>
                  {rules.map((r) => (
                    <div key={r.id} className="flex justify-between items-center py-0.5">
                      <span className="text-[10px] text-textMuted capitalize">{r.vehicle_type}</span>
                      <span className={`text-xs font-bold ${r.surge_active ? "text-red" : "text-cyan"}`}>
                        {formatZAR(estimate(r, km, Math.round(km / 0.4)))}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <Modal open={editModal} onClose={() => setEditModal(false)} title={`Edit Pricing — ${editing?.vehicle_type}`}>
        <div className="grid grid-cols-2 gap-4">
          {([
            { label: "Base Fare (ZAR)", key: "base_fare" },
            { label: "Per KM Rate (ZAR)", key: "per_km" },
            { label: "Per Minute Rate (ZAR)", key: "per_minute" },
            { label: "Minimum Fare (ZAR)", key: "min_fare" },
            { label: "Surge Multiplier", key: "surge_multiplier" },
          ] as const).map(({ label, key }) => (
            <div key={key}>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">{label}</label>
              <Input type="number" step="0.1" value={String(form[key as keyof PricingRule] ?? "")}
                onChange={(e) => setForm((f) => ({ ...f, [key]: parseFloat(e.target.value) || 0 }))} />
            </div>
          ))}
          <div className="flex items-center gap-3 pt-5">
            <input type="checkbox" checked={!!form.surge_active}
              onChange={(e) => setForm((f) => ({ ...f, surge_active: e.target.checked }))}
              className="w-4 h-4 accent-red" id="surge-check" />
            <label htmlFor="surge-check" className="text-sm text-text cursor-pointer">Surge Active</label>
          </div>
          <div className="col-span-2 flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setEditModal(false)}>Cancel</Button>
            <Button onClick={save}><Save size={13} /> Save</Button>
          </div>
        </div>
      </Modal>

      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Add Pricing Rule">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Vehicle Type</label>
            <select value={newForm.vehicle_type} onChange={(e) => setNewForm((f) => ({ ...f, vehicle_type: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-bg3 border border-border text-text text-sm outline-none focus:border-cyan">
              <option value="all">All</option>
              <option value="taxi">Taxi</option>
              <option value="bus">Bus</option>
              <option value="minibus">Minibus</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Base Fare (ZAR) *</label>
            <Input type="number" step="0.5" value={newForm.base_fare} onChange={(e) => setNewForm((f) => ({ ...f, base_fare: e.target.value }))} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Per KM (ZAR) *</label>
            <Input type="number" step="0.1" value={newForm.per_km} onChange={(e) => setNewForm((f) => ({ ...f, per_km: e.target.value }))} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Per Minute (ZAR)</label>
            <Input type="number" step="0.1" value={newForm.per_minute} onChange={(e) => setNewForm((f) => ({ ...f, per_minute: e.target.value }))} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Min Fare (ZAR) *</label>
            <Input type="number" step="0.5" value={newForm.min_fare} onChange={(e) => setNewForm((f) => ({ ...f, min_fare: e.target.value }))} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Surge Multiplier</label>
            <Input type="number" step="0.1" value={newForm.surge_multiplier} onChange={(e) => setNewForm((f) => ({ ...f, surge_multiplier: e.target.value }))} />
          </div>
          <div className="col-span-2 flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setCreateModal(false)}>Cancel</Button>
            <Button onClick={create}><Plus size={13} /> Create Rule</Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
