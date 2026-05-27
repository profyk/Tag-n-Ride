"use client";
import { useState, useEffect } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Modal, Input, StatCard, Spinner } from "@/components/ui";
import { MapPin, Plus, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { api, CoverageZone } from "@/lib/api";

export default function GeographyPage() {
  const [zones, setZones] = useState<CoverageZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModal, setCreateModal] = useState(false);
  const [form, setForm] = useState({ name: "", city: "", province: "", lat: "", lng: "", radius_km: "" });

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

  const remove = async (z: CoverageZone) => {
    if (!confirm(`Delete zone "${z.name}"?`)) return;
    try {
      await api.deleteZone(z.id);
      toast.success("Zone deleted");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const create = async () => {
    if (!form.name || !form.city || !form.province) { toast.error("Name, city and province required"); return; }
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
      setForm({ name: "", city: "", province: "", lat: "", lng: "", radius_km: "" });
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const active = zones.filter((z) => z.active).length;
  const totalDrivers = zones.reduce((s, z) => s + z.driver_count, 0);

  return (
    <AdminShell title="Coverage & Zones">
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Active Zones" value={String(active)} />
          <StatCard label="Total Zones" value={String(zones.length)} />
          <StatCard label="Total Drivers" value={String(totalDrivers)} />
          <StatCard label="Inactive Zones" value={String(zones.length - active)} />
        </div>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <MapPin size={16} className="text-cyan" />
              <h2 className="text-text font-bold">Coverage Zones</h2>
            </div>
            <Button onClick={() => setCreateModal(true)}><Plus size={13} /> Add Zone</Button>
          </div>

          {loading ? <Spinner /> : (
            <Table
              headers={["Zone", "City", "Province", "Drivers", "Coordinates", "Status", "Actions"]}
              empty={!zones.length}
            >
              {zones.map((z) => (
                <Tr key={z.id}>
                  <Td className="font-semibold">{z.name}</Td>
                  <Td className="text-textMuted text-xs">{z.city || "—"}</Td>
                  <Td className="text-textMuted text-xs">{z.province || "—"}</Td>
                  <Td>
                    <span className="font-bold text-cyan">{z.driver_count}</span>
                    <span className="text-textMuted text-xs"> drivers</span>
                  </Td>
                  <Td className="text-textMuted text-[10px] font-mono">
                    {z.lat && z.lng ? `${z.lat.toFixed(4)}, ${z.lng.toFixed(4)}` : "—"}
                    {z.radius_km ? ` (${z.radius_km}km)` : ""}
                  </Td>
                  <Td><Badge label={z.active ? "active" : "inactive"} tone={z.active ? "green" : "red"} /></Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggle(z)} className="text-textMuted hover:text-cyan transition-all">
                        {z.active ? <ToggleRight size={20} className="text-green" /> : <ToggleLeft size={20} />}
                      </button>
                      <Button variant="ghost" onClick={() => remove(z)}>
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

      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Add Coverage Zone">
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
              <Input placeholder="Gauteng" value={form.province} onChange={(e) => setForm((f) => ({ ...f, province: e.target.value }))} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Latitude</label>
              <Input type="number" step="0.0001" placeholder="-26.2041" value={form.lat} onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Longitude</label>
              <Input type="number" step="0.0001" placeholder="28.0473" value={form.lng} onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Radius (km)</label>
              <Input type="number" step="1" placeholder="25" value={form.radius_km} onChange={(e) => setForm((f) => ({ ...f, radius_km: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setCreateModal(false)}>Cancel</Button>
            <Button onClick={create}><Plus size={13} /> Create Zone</Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
