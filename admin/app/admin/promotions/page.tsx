"use client";
import { useState, useEffect } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Modal, Input, StatCard, Spinner } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import { Tag, Plus, Trash2, Copy, ToggleLeft, ToggleRight } from "lucide-react";
import toast from "react-hot-toast";
import { api, Promotion } from "@/lib/api";

const TYPE_TONE: Record<string, string> = { percent: "cyan", fixed: "green" };
const TYPE_LABELS: Record<string, string> = { percent: "% Discount", fixed: "Fixed Off" };

export default function PromotionsPage() {
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModal, setCreateModal] = useState(false);
  const [form, setForm] = useState({
    code: "", description: "", discount_type: "percent", discount_value: "",
    min_ride_amount: "0", max_uses: "1000", uses_per_user: "1", valid_from: "", valid_to: "",
  });

  const load = () => {
    setLoading(true);
    api.promotions().then((r) => setPromos(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toggle = async (p: Promotion) => {
    try {
      await api.updatePromotion(p.id, { active: !p.active });
      toast.success(`${p.code} ${p.active ? "deactivated" : "activated"}`);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const remove = async (p: Promotion) => {
    if (!confirm(`Delete promo code ${p.code}?`)) return;
    try {
      await api.deletePromotion(p.id);
      toast.success("Promo deleted");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const copy = (code: string) => { navigator.clipboard.writeText(code); toast.success("Copied!"); };

  const create = async () => {
    if (!form.code || !form.discount_value || !form.valid_from || !form.valid_to) {
      toast.error("Fill all required fields"); return;
    }
    try {
      await api.createPromotion({
        code: form.code.toUpperCase(),
        description: form.description,
        discount_type: form.discount_type,
        discount_value: parseFloat(form.discount_value),
        min_ride_amount: parseFloat(form.min_ride_amount) || 0,
        max_uses: parseInt(form.max_uses) || 1000,
        uses_per_user: parseInt(form.uses_per_user) || 1,
        valid_from: form.valid_from,
        valid_to: form.valid_to,
        active: true,
      } as any);
      toast.success(`Promo ${form.code.toUpperCase()} created`);
      setCreateModal(false);
      setForm({ code: "", description: "", discount_type: "percent", discount_value: "", min_ride_amount: "0", max_uses: "1000", uses_per_user: "1", valid_from: "", valid_to: "" });
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const active = promos.filter((p) => p.active).length;
  const totalUses = promos.reduce((s, p) => s + p.total_used, 0);

  return (
    <AdminShell title="Promotions & Vouchers">
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Active Promotions" value={String(active)} />
          <StatCard label="Total Redemptions" value={totalUses.toLocaleString()} />
          <StatCard label="Total Promos" value={String(promos.length)} />
          <StatCard label="Expired" value={String(promos.filter((p) => new Date(p.valid_to) < new Date()).length)} />
        </div>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Tag size={16} className="text-cyan" />
              <h2 className="text-text font-bold">Promo Codes</h2>
            </div>
            <Button onClick={() => setCreateModal(true)}>
              <Plus size={13} /> Create Promo
            </Button>
          </div>

          {loading ? <Spinner /> : (
            <Table
              headers={["Code", "Description", "Type", "Value", "Usage", "Valid To", "Status", "Actions"]}
              empty={!promos.length}
            >
              {promos.map((p) => (
                <Tr key={p.id}>
                  <Td>
                    <div className="flex items-center gap-2">
                      <code className="text-cyan font-bold text-sm tracking-widest">{p.code}</code>
                      <button onClick={() => copy(p.code)} className="text-textDim hover:text-textMuted">
                        <Copy size={11} />
                      </button>
                    </div>
                  </Td>
                  <Td className="text-textMuted text-xs max-w-[160px] truncate">{p.description}</Td>
                  <Td><Badge label={TYPE_LABELS[p.discount_type] || p.discount_type} tone={TYPE_TONE[p.discount_type] || "muted"} /></Td>
                  <Td className="font-bold">
                    {p.discount_type === "percent" ? `${p.discount_value}%` : formatZAR(p.discount_value)}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-bg3">
                        <div className="h-1.5 rounded-full bg-cyan" style={{ width: `${Math.min((p.total_used / p.max_uses) * 100, 100)}%` }} />
                      </div>
                      <span className="text-xs text-textMuted">{p.total_used}/{p.max_uses}</span>
                    </div>
                  </Td>
                  <Td className="text-textMuted text-xs">{formatDate(p.valid_to)}</Td>
                  <Td><Badge label={p.active ? "active" : "inactive"} tone={p.active ? "green" : "red"} /></Td>
                  <Td>
                    <div className="flex gap-2">
                      <button onClick={() => toggle(p)} className="text-textMuted hover:text-cyan transition-all">
                        {p.active ? <ToggleRight size={16} className="text-green" /> : <ToggleLeft size={16} />}
                      </button>
                      <button onClick={() => remove(p)} className="text-textMuted hover:text-red transition-all">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Create Promo Code">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Code *</label>
              <Input placeholder="WELCOME20" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Type *</label>
              <select value={form.discount_type} onChange={(e) => setForm((f) => ({ ...f, discount_type: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-bg3 border border-border text-text text-sm outline-none focus:border-cyan">
                <option value="percent">% Discount</option>
                <option value="fixed">Fixed Amount Off</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Value *</label>
              <Input type="number" placeholder={form.discount_type === "percent" ? "20" : "50"} value={form.discount_value} onChange={(e) => setForm((f) => ({ ...f, discount_value: e.target.value }))} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Min Ride Amount (ZAR)</label>
              <Input type="number" value={form.min_ride_amount} onChange={(e) => setForm((f) => ({ ...f, min_ride_amount: e.target.value }))} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Max Total Uses</label>
              <Input type="number" value={form.max_uses} onChange={(e) => setForm((f) => ({ ...f, max_uses: e.target.value }))} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Uses Per User</label>
              <Input type="number" value={form.uses_per_user} onChange={(e) => setForm((f) => ({ ...f, uses_per_user: e.target.value }))} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Valid From *</label>
              <Input type="date" value={form.valid_from} onChange={(e) => setForm((f) => ({ ...f, valid_from: e.target.value }))} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Valid To *</label>
              <Input type="date" value={form.valid_to} onChange={(e) => setForm((f) => ({ ...f, valid_to: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Description</label>
            <Input placeholder="What is this promo for?" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setCreateModal(false)}>Cancel</Button>
            <Button onClick={create}><Plus size={13} /> Create Promo</Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
