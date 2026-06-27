"use client";
import { useState, useEffect } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Button, Modal, Input, Spinner } from "@/components/ui";
import { formatZAR } from "@/lib/utils";
import { Gauge, Edit2, Save, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import { api, TxLimit } from "@/lib/api";

const ROLE_STYLE: Record<string, string> = {
  passenger: "bg-cyan/10 border-cyan/20 text-cyan",
  driver:    "bg-green/10 border-green/20 text-green",
  new_user:  "bg-yellow/10 border-yellow/20 text-yellow",
  owner:     "bg-purple/10 border-purple/20 text-purple",
};

export default function LimitsPage() {
  const [limits, setLimits] = useState<TxLimit[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TxLimit | null>(null);
  const [editModal, setEditModal] = useState(false);
  const [form, setForm] = useState<Partial<TxLimit>>({});

  const load = () => {
    setLoading(true);
    api.txLimits().then((r) => setLimits(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openEdit = (l: TxLimit) => { setEditing(l); setForm({ ...l }); setEditModal(true); };

  const save = async () => {
    if (!editing) return;
    try {
      await api.updateTxLimit(editing.id, {
        daily_limit: form.daily_limit, single_txn_limit: form.single_txn_limit,
        monthly_limit: form.monthly_limit, min_topup: form.min_topup,
        max_topup: form.max_topup, max_withdrawal: form.max_withdrawal,
        min_withdrawal: form.min_withdrawal, enabled: form.enabled,
      } as any);
      toast.success(`Limits updated for ${editing.role}`);
      setEditModal(false);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const fld = (key: keyof TxLimit) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }));

  return (
    <AdminShell title="Transaction Limits">
      <div className="space-y-6">
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-yellow/10 border border-yellow/20">
          <AlertTriangle size={16} className="text-yellow" />
          <p className="text-sm text-yellow">Changes take effect immediately and apply to all new transactions. Existing transactions are not affected.</p>
        </div>

        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Gauge size={16} className="text-cyan" />
            <h2 className="text-text font-bold">Transaction Limits by Role</h2>
          </div>

          {loading ? <Spinner /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-bg3">
                    {["Role", "Daily", "Single Txn", "Monthly", "Min Topup", "Max Topup", "Max Withdrawal", "Min Withdrawal", "Status", ""].map(h => (
                      <th key={h} className="text-left py-3 px-4 text-[10px] font-bold text-textDim uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {limits.length === 0 ? (
                    <tr><td colSpan={10} className="py-12 text-center text-textMuted">No limits configured</td></tr>
                  ) : limits.map(l => (
                    <tr key={l.id} className="border-b border-border hover:bg-bg3/50 transition-colors">
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-black capitalize ${ROLE_STYLE[l.role] || "bg-bg3 border-border text-textMuted"}`}>
                          {l.role.replace("_", " ")}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-text tabular-nums">{formatZAR(l.daily_limit)}</td>
                      <td className="py-3 px-4 font-bold text-text tabular-nums">{formatZAR(l.single_txn_limit)}</td>
                      <td className="py-3 px-4 font-bold text-text tabular-nums">{formatZAR(l.monthly_limit)}</td>
                      <td className="py-3 px-4 text-textMuted tabular-nums">{formatZAR(l.min_topup)}</td>
                      <td className="py-3 px-4 text-textMuted tabular-nums">{formatZAR(l.max_topup)}</td>
                      <td className="py-3 px-4 text-textMuted tabular-nums">{l.max_withdrawal > 0 ? formatZAR(l.max_withdrawal) : "—"}</td>
                      <td className="py-3 px-4 text-textMuted tabular-nums">{l.min_withdrawal > 0 ? formatZAR(l.min_withdrawal) : "—"}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-black ${
                          l.enabled ? "bg-green/10 border-green/20 text-green" : "bg-red/10 border-red/20 text-red"
                        }`}>
                          {l.enabled ? "enabled" : "disabled"}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <button onClick={() => openEdit(l)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-textMuted text-[10px] font-bold hover:text-cyan hover:border-cyan/30 transition-all">
                          <Edit2 size={10} /> Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Modal open={editModal} onClose={() => setEditModal(false)} title={`Edit Limits — ${editing?.role}`}>
        <div className="grid grid-cols-2 gap-4">
          {([
            { label: "Daily Limit (ZAR)", key: "daily_limit" },
            { label: "Single Transaction Max (ZAR)", key: "single_txn_limit" },
            { label: "Monthly Limit (ZAR)", key: "monthly_limit" },
            { label: "Min Top-up (ZAR)", key: "min_topup" },
            { label: "Max Top-up (ZAR)", key: "max_topup" },
            { label: "Max Withdrawal (ZAR)", key: "max_withdrawal" },
            { label: "Min Withdrawal (ZAR)", key: "min_withdrawal" },
          ] as const).map(({ label, key }) => (
            <div key={key}>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">{label}</label>
              <Input type="number" step="100" value={String(form[key as keyof TxLimit] ?? "")} onChange={fld(key as keyof TxLimit)} />
            </div>
          ))}
          <div className="flex items-center gap-3 pt-5">
            <input type="checkbox" checked={!!form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              className="w-4 h-4 accent-green" id="enabled-lim" />
            <label htmlFor="enabled-lim" className="text-sm text-text cursor-pointer">Limits Enabled</label>
          </div>
          <div className="col-span-2 flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setEditModal(false)}>Cancel</Button>
            <Button onClick={save}><Save size={13} /> Save Limits</Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
