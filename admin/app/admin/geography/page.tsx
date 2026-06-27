"use client";
import { useState, useEffect } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Button, Modal, Input, Spinner } from "@/components/ui";
import { MapPin, Plus, ToggleLeft, ToggleRight, Trash2, Edit2, Save, AlertTriangle, Globe, Zap, ZapOff } from "lucide-react";
import toast from "react-hot-toast";
import { api, CoverageZone } from "@/lib/api";
import { SA_PROVINCES } from "@/lib/utils";

const emptyForm = () => ({ name: "", city: "", province: "", lat: "", lng: "", radius_km: "" });

export default function GeographyPage() {
  const [zones, setZones] = useState<CoverageZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModal, setCreateModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [editTarget, setEditTarget] = useState<CoverageZone | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CoverageZone | null>(null);

  const load = () => {
    setLoading(true);
    api.zones().then((r) => setZones(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toggle = async (z: CoverageZone) => {
    try {
      await api.updateZone(z.id, { active: !z.active } as any);
      toast.success(`${z.name} ${z.active ? "deactivated" : "activated"}`);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const remove = (z: CoverageZone) => { setDeleteTarget(z); };
  const confirmRemove = async () => {
    if (!deleteTarget) return;
    const z = deleteTarget; setDeleteTarget(null);
    try {
      await api.deleteZone(z.id);
      toast.success(`Zone "${z.name}" deleted`);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const openEdit = (z: CoverageZone) => {
    setEditTarget(z);
    setForm({
      name: z.name, city: z.city || "", province: z.province || "",
      lat: z.lat != null ? String(z.lat) : "",
      lng: z.lng != null ? String(z.lng) : "",
      radius_km: z.radius_km != null ? String(z.radius_km) : "",
    });
    setEditModal(true);
  };

  const create = async () => {
    if (!form.name || !form.city || !form.province) { toast.error("Name, city and province required"); return; }
    setSaving(true);
    try {
      await api.createZone({
        name: form.name, city: form.city, province: form.province, country: "ZA",
        lat: form.lat ? parseFloat(form.lat) : undefined,
        lng: form.lng ? parseFloat(form.lng) : undefined,
        radius_km: form.radius_km ? parseFloat(form.radius_km) : undefined,
        active: true,
      } as any);
      toast.success(`Zone "${form.name}" created`);
      setCreateModal(false);
      setForm(emptyForm());
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const saveEdit = async () => {
    if (!editTarget || !form.name) { toast.error("Zone name is required"); return; }
    setSaving(true);
    try {
      await api.updateZone(editTarget.id, {
        name: form.name, city: form.city, province: form.province,
        lat: form.lat ? parseFloat(form.lat) : undefined,
        lng: form.lng ? parseFloat(form.lng) : undefined,
        radius_km: form.radius_km ? parseFloat(form.radius_km) : undefined,
      });
      toast.success(`Zone "${form.name}" updated`);
      setEditModal(false);
      setEditTarget(null);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const active = zones.filter((z) => z.active).length;
  const inactive = zones.length - active;
  const totalDrivers = zones.reduce((s, z) => s + z.driver_count, 0);
  const covered = zones.filter(z => z.lat && z.lng).length;

  const ZoneForm = ({ onSubmit, submitLabel }: { onSubmit: () => void; submitLabel: string }) => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Zone Name *</label>
          <Input placeholder="Johannesburg CBD" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">City *</label>
          <Input placeholder="Johannesburg" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Province *</label>
          <select
            value={form.province}
            onChange={(e) => setForm((f) => ({ ...f, province: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-bg3 border border-border text-text text-sm outline-none focus:border-cyan"
          >
            <option value="">Select province...</option>
            {SA_PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Latitude</label>
          <Input type="number" step="0.0001" placeholder="-26.2041" value={form.lat} onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))} />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Longitude</label>
          <Input type="number" step="0.0001" placeholder="28.0473" value={form.lng} onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))} />
        </div>
        <div className="col-span-2">
          <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Coverage Radius (km)</label>
          <Input type="number" step="1" placeholder="25" value={form.radius_km} onChange={(e) => setForm((f) => ({ ...f, radius_km: e.target.value }))} />
        </div>
      </div>
      <div className="flex gap-3 justify-end">
        <Button variant="secondary" onClick={() => { setCreateModal(false); setEditModal(false); }}>Cancel</Button>
        <Button onClick={onSubmit} loading={saving}>
          <Save size={13} /> {submitLabel}
        </Button>
      </div>
    </div>
  );

  return (
    <AdminShell title="Coverage & Zones">
      <div className="space-y-6">

        {/* Stats strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Active Zones",   value: active,       color: "text-green",  sub: "serving passengers" },
            { label: "Total Zones",    value: zones.length, color: "text-cyan",   sub: "across South Africa" },
            { label: "Total Drivers",  value: totalDrivers, color: "text-purple", sub: "in coverage zones" },
            { label: "Inactive Zones", value: inactive,     color: inactive > 0 ? "text-red" : "text-textDim", sub: inactive > 0 ? "need attention" : "all zones live" },
          ].map(s => (
            <div key={s.label} className="bg-bg2 border border-border rounded-xl p-4">
              <p className="text-[9px] font-bold text-textDim uppercase tracking-wider mb-1">{s.label}</p>
              <p className={`text-2xl font-black tabular-nums ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-textDim mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>

        {covered < zones.length && zones.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-yellow bg-yellow/10 border border-yellow/20 rounded-lg px-4 py-2.5">
            <Globe size={13} />
            {zones.length - covered} zone{zones.length - covered !== 1 ? "s" : ""} missing coordinates — add lat/lng to enable map visualization and precise radius matching.
          </div>
        )}

        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <MapPin size={16} className="text-cyan" />
              <h2 className="text-text font-bold">Coverage Zones</h2>
              {zones.length > 0 && <span className="text-textDim text-xs">{zones.length} total</span>}
            </div>
            <Button onClick={() => { setForm(emptyForm()); setCreateModal(true); }}>
              <Plus size={13} /> Add Zone
            </Button>
          </div>

          {loading ? <Spinner /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-bg3">
                    {["Zone", "City", "Province", "Drivers", "Coordinates", "Radius", "Status", "Actions"].map(h => (
                      <th key={h} className="text-left py-3 px-4 text-[10px] font-bold text-textDim uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {zones.length === 0 ? (
                    <tr><td colSpan={8} className="py-12 text-center text-textMuted">No zones configured — add one to get started</td></tr>
                  ) : zones.map((z) => (
                    <tr key={z.id} className={`border-b border-border hover:bg-bg3/50 transition-colors ${!z.active ? "opacity-60" : ""}`}>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${z.active ? "bg-green" : "bg-red"}`} />
                          <span className="font-bold text-text">{z.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-textMuted">{z.city || "—"}</td>
                      <td className="py-3 px-4 text-textMuted">{z.province || "—"}</td>
                      <td className="py-3 px-4">
                        <span className="font-black text-cyan tabular-nums">{z.driver_count}</span>
                        <span className="text-textDim"> drivers</span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[10px] text-textMuted">
                        {z.lat && z.lng ? `${z.lat.toFixed(4)}, ${z.lng.toFixed(4)}` : <span className="text-textDim italic">No coords</span>}
                      </td>
                      <td className="py-3 px-4 text-textMuted">{z.radius_km ? `${z.radius_km} km` : "—"}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-black ${
                          z.active ? "bg-green/10 border-green/20 text-green" : "bg-red/10 border-red/20 text-red"
                        }`}>
                          {z.active ? <Zap size={8} /> : <ZapOff size={8} />}
                          {z.active ? "active" : "inactive"}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => toggle(z)}
                            className="text-textMuted hover:text-cyan transition-all"
                            title={z.active ? "Deactivate" : "Activate"}
                          >
                            {z.active
                              ? <ToggleRight size={20} className="text-green" />
                              : <ToggleLeft size={20} />}
                          </button>
                          <button
                            onClick={() => openEdit(z)}
                            className="px-2 py-1 rounded-lg border border-border text-textMuted hover:text-cyan hover:border-cyan/30 transition-all"
                            title="Edit zone"
                          >
                            <Edit2 size={11} />
                          </button>
                          <button
                            onClick={() => remove(z)}
                            className="px-2 py-1 rounded-lg border border-border text-textMuted hover:text-red hover:border-red/30 transition-all"
                            title="Delete zone"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Add Coverage Zone">
        <ZoneForm onSubmit={create} submitLabel="Create Zone" />
      </Modal>

      <Modal open={editModal} onClose={() => { setEditModal(false); setEditTarget(null); }} title={`Edit Zone — ${editTarget?.name}`}>
        <ZoneForm onSubmit={saveEdit} submitLabel="Save Changes" />
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Zone">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red/5 border border-red/20 rounded-xl">
            <AlertTriangle size={15} className="text-red flex-shrink-0 mt-0.5" />
            <p className="text-red text-sm">
              Delete zone <strong>"{deleteTarget?.name}"</strong>?
              Any pricing rules linked to this zone will fall back to the default rule.
              This cannot be undone.
            </p>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={confirmRemove}><Trash2 size={12} /> Delete Zone</Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
