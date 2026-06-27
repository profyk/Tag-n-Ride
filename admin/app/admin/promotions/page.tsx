"use client";
import { useState, useEffect } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Button, Modal, Input, Spinner } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import { Tag, Plus, Trash2, Copy, ToggleLeft, ToggleRight, AlertTriangle, Zap, TrendingUp, Hash, Clock } from "lucide-react";
import toast from "react-hot-toast";
import { api, Promotion } from "@/lib/api";

const TYPE_TONE: Record<string, "cyan" | "green" | "muted"> = { percent: "cyan", fixed: "green" };
const TYPE_LABELS: Record<string, string> = { percent: "% Discount", fixed: "Fixed Off" };

export default function PromotionsPage() {
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModal, setCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Promotion | null>(null);
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

  const remove = (p: Promotion) => { setDeleteTarget(p); };
  const confirmRemove = async () => {
    if (!deleteTarget) return;
    const p = deleteTarget;
    setDeleteTarget(null);
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

  const expired = promos.filter(p => p.valid_to && new Date(p.valid_to) < new Date()).length;

  return (
    <AdminShell title="Promotions & Vouchers" subtitle="Promo codes, discounts and voucher management">
      <div className="space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Active",      value: String(active),                  color: "text-green",  icon: Zap       },
            { label: "Redemptions", value: totalUses.toLocaleString(),      color: "text-cyan",   icon: TrendingUp },
            { label: "Total Promos",value: String(promos.length),           color: "text-purple", icon: Hash      },
            { label: "Expired",     value: String(expired),                 color: expired > 0 ? "text-red" : "text-textMuted", icon: Clock },
          ].map(s => (
            <div key={s.label} className="bg-bg2 border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] font-bold text-textDim uppercase tracking-wider">{s.label}</p>
                <s.icon size={12} className={s.color} />
              </div>
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tag size={14} className="text-cyan" />
            <p className="font-bold text-text">Promo Codes</p>
          </div>
          <Button onClick={() => setCreateModal(true)}>
            <Plus size={13} /> Create Promo
          </Button>
        </div>

        {loading ? <Spinner /> : (
          <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-bg3">
                    {["Code", "Description", "Type", "Value", "Usage", "Valid To", "Status", ""].map(h => (
                      <th key={h} className="text-left py-3 px-4 text-[10px] font-bold text-textDim uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {promos.length === 0 ? (
                    <tr><td colSpan={8} className="py-12 text-center text-textMuted">No promo codes yet</td></tr>
                  ) : promos.map(p => {
                    const isExpired = p.valid_to && new Date(p.valid_to) < new Date();
                    return (
                      <tr key={p.id} className="border-b border-border hover:bg-bg3/50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <code className="text-cyan font-black tracking-widest">{p.code}</code>
                            <button onClick={() => copy(p.code)} className="text-textDim hover:text-cyan transition-all">
                              <Copy size={10} />
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-textMuted max-w-[140px]">
                          <span className="line-clamp-1">{p.description || "—"}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold ${
                            p.discount_type === "percent"
                              ? "bg-cyan/10 border-cyan/20 text-cyan"
                              : "bg-green/10 border-green/20 text-green"
                          }`}>
                            {TYPE_LABELS[p.discount_type] || p.discount_type}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-black tabular-nums text-text">
                          {p.discount_type === "percent" ? `${p.discount_value}%` : formatZAR(p.discount_value)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-14 h-1.5 rounded-full bg-bg3 overflow-hidden">
                              <div className="h-1.5 rounded-full bg-cyan"
                                style={{ width: p.max_uses ? `${Math.min((p.total_used / p.max_uses) * 100, 100)}%` : "0%" }} />
                            </div>
                            <span className="text-textDim">{p.total_used}{p.max_uses ? `/${p.max_uses}` : ""}</span>
                          </div>
                        </td>
                        <td className={`py-3 px-4 whitespace-nowrap ${isExpired ? "text-red" : "text-textDim"}`}>
                          {formatDate(p.valid_to)}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-black ${
                            p.active && !isExpired
                              ? "bg-green/10 border-green/20 text-green"
                              : "bg-red/10 border-red/20 text-red"
                          }`}>
                            {p.active && !isExpired ? "active" : isExpired ? "expired" : "inactive"}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex gap-2">
                            <button onClick={() => toggle(p)} title={p.active ? "Deactivate" : "Activate"}
                              className="text-textMuted hover:text-cyan transition-all p-1">
                              {p.active ? <ToggleRight size={16} className="text-green" /> : <ToggleLeft size={16} />}
                            </button>
                            <button onClick={() => remove(p)} title="Delete"
                              className="text-textMuted hover:text-red transition-all p-1">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
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
      {/* Delete Promo Confirmation Modal */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Promo Code">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red/5 border border-red/20 rounded-xl">
            <AlertTriangle size={15} className="text-red flex-shrink-0 mt-0.5" />
            <p className="text-red text-sm">Delete promo code <strong className="font-mono tracking-widest">{deleteTarget?.code}</strong>? Any users with this code will no longer be able to redeem it.</p>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={confirmRemove}><Trash2 size={12} /> Delete Promo</Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
