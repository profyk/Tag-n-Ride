"use client";
import { useState, useEffect } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Modal, Input, Spinner } from "@/components/ui";
import { formatZAR } from "@/lib/utils";
import { Gauge, Edit2, Save, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import { api, TxLimit } from "@/lib/api";

const ROLE_TONE: Record<string, string> = {
  passenger: "cyan", driver: "green", new_user: "yellow", owner: "purple",
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
            <Table
              headers={["Role", "Daily Limit", "Single Txn", "Monthly Limit", "Min Topup", "Max Topup", "Max Withdrawal", "Min Withdrawal", "Status", "Actions"]}
              empty={!limits.length}
            >
              {limits.map((l) => (
                <Tr key={l.id}>
                  <Td><Badge label={l.role} tone={ROLE_TONE[l.role] || "muted"} /></Td>
                  <Td className="font-semibold">{formatZAR(l.daily_limit)}</Td>
                  <Td className="font-semibold">{formatZAR(l.single_txn_limit)}</Td>
                  <Td className="font-semibold">{formatZAR(l.monthly_limit)}</Td>
                  <Td className="text-textMuted text-xs">{formatZAR(l.min_topup)}</Td>
                  <Td className="text-textMuted text-xs">{formatZAR(l.max_topup)}</Td>
                  <Td className="text-textMuted text-xs">{l.max_withdrawal > 0 ? formatZAR(l.max_withdrawal) : "—"}</Td>
                  <Td className="text-textMuted text-xs">{l.min_withdrawal > 0 ? formatZAR(l.min_withdrawal) : "—"}</Td>
                  <Td><Badge label={l.enabled ? "enabled" : "disabled"} tone={l.enabled ? "green" : "red"} /></Td>
                  <Td>
                    <Button variant="secondary" onClick={() => openEdit(l)}>
                      <Edit2 size={12} /> Edit
                    </Button>
                  </Td>
                </Tr>
              ))}
            </Table>
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
