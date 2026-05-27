"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Spinner, Modal, Input, StatCard } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import { Banknote, Lock, Unlock, PlusCircle, MinusCircle, X } from "lucide-react";
import toast from "react-hot-toast";
import { api, WalletEntry } from "@/lib/api";
import { DangerPinModal, useDangerPin } from "@/components/DangerPinModal";

export default function WalletOpsPage() {
  const [wallets, setWallets] = useState<WalletEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<WalletEntry | null>(null);
  const [adjustModal, setAdjustModal] = useState(false);
  const [freezeModal, setFreezeModal] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustType, setAdjustType] = useState<"credit" | "debit">("credit");
  const [freezeReason, setFreezeReason] = useState("");
  const dangerPin = useDangerPin();

  const load = () => {
    setLoading(true);
    api.wallets(search ? { search } : {}).then((r) => setWallets(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toggleFreeze = async (w: WalletEntry) => {
    if (w.is_frozen) {
      const token = await dangerPin.request();
      if (!token) return;
      try {
        await api.unfreezeWalletAdmin(w.user_id);
        toast.success(`${w.full_name}'s wallet unfrozen`);
        load();
      } catch (e: any) { toast.error(e.message); }
    } else {
      setSelected(w);
      setFreezeReason("");
      setFreezeModal(true);
    }
  };

  const confirmFreeze = async () => {
    if (!freezeReason.trim()) { toast.error("Provide a freeze reason"); return; }
    const token = await dangerPin.request();
    if (!token) return;
    try {
      await api.freezeWalletAdmin(selected!.user_id, freezeReason);
      toast.success(`${selected!.full_name}'s wallet frozen`);
      setFreezeModal(false);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleAdjust = async () => {
    const amt = parseFloat(adjustAmount);
    if (isNaN(amt) || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (!adjustNote.trim()) { toast.error("Provide a reason"); return; }
    const token = await dangerPin.request();
    if (!token) return;
    try {
      const finalAmt = adjustType === "debit" ? -amt : amt;
      const res = await api.adjustWallet(selected!.user_id, finalAmt, adjustNote);
      toast.success(`Wallet ${adjustType === "credit" ? "credited" : "debited"} ${formatZAR(amt)} — Ref: ${res.data.reference}`);
      setAdjustModal(false);
      setAdjustAmount("");
      setAdjustNote("");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const totalBalance = wallets.reduce((s, w) => s + w.balance, 0);
  const frozen = wallets.filter((w) => w.is_frozen).length;

  return (
    <AdminShell title="Wallet Operations">
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Wallets" value={wallets.length.toString()} />
          <StatCard label="Total Balance" value={formatZAR(totalBalance)} />
          <StatCard label="Frozen Wallets" value={String(frozen)} />
          <StatCard label="Active Wallets" value={String(wallets.filter((w) => !w.is_frozen).length)} />
        </div>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Banknote size={16} className="text-cyan" />
              <h2 className="text-text font-bold">Wallet Management</h2>
            </div>
            <div className="flex gap-2 items-center">
              <Input
                placeholder="Search user..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-48"
              />
              <Button onClick={load}>Search</Button>
              {search && <Button variant="ghost" onClick={() => { setSearch(""); }}><X size={13} /></Button>}
            </div>
          </div>

          {loading ? <Spinner /> : (
            <Table
              headers={["User", "Role", "Balance", "Status", "Actions"]}
              empty={!wallets.length}
            >
              {wallets.map((w) => (
                <Tr key={w.user_id}>
                  <Td>
                    <p className="font-semibold">{w.full_name}</p>
                    <p className="text-[10px] text-textMuted font-mono">{w.phone_number}</p>
                  </Td>
                  <Td><Badge label={w.role} tone={w.role === "driver" ? "green" : "cyan"} /></Td>
                  <Td className={`font-bold text-lg ${w.is_frozen ? "text-textMuted" : "text-green"}`}>
                    {formatZAR(w.balance)}
                  </Td>
                  <Td>
                    {w.is_frozen ? (
                      <div>
                        <Badge label="frozen" tone="red" />
                        {w.freeze_reason && <p className="text-[10px] text-textMuted mt-0.5 max-w-[120px] truncate">{w.freeze_reason}</p>}
                      </div>
                    ) : (
                      <Badge label="active" tone="green" />
                    )}
                  </Td>
                  <Td>
                    <div className="flex gap-2">
                      <Button
                        variant={w.is_frozen ? "secondary" : "ghost"}
                        onClick={() => toggleFreeze(w)}
                        title={w.is_frozen ? "Unfreeze wallet" : "Freeze wallet"}
                      >
                        {w.is_frozen ? <Unlock size={13} /> : <Lock size={13} className="text-red" />}
                        {w.is_frozen ? "Unfreeze" : "Freeze"}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => { setSelected(w); setAdjustModal(true); setAdjustAmount(""); setAdjustNote(""); setAdjustType("credit"); }}
                      >
                        <PlusCircle size={13} /> Adjust
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      <Modal open={freezeModal} onClose={() => setFreezeModal(false)} title={`Freeze ${selected?.full_name}'s Wallet`}>
        <div className="space-y-4">
          <p className="text-sm text-textMuted">This will prevent all transactions on the wallet until unfrozen.</p>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Freeze Reason *</label>
            <Input placeholder="Suspicious activity, compliance hold..." value={freezeReason} onChange={(e) => setFreezeReason(e.target.value)} />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setFreezeModal(false)}>Cancel</Button>
            <Button onClick={confirmFreeze}><Lock size={13} /> Freeze Wallet</Button>
          </div>
        </div>
      </Modal>

      <Modal open={adjustModal} onClose={() => setAdjustModal(false)} title={`Adjust Wallet — ${selected?.full_name}`}>
        <div className="space-y-4">
          <p className="text-sm text-textMuted">
            Current balance: <span className="text-green font-bold">{selected && formatZAR(selected.balance)}</span>
          </p>
          <div className="flex gap-3">
            {(["credit", "debit"] as const).map((t) => (
              <button key={t} onClick={() => setAdjustType(t)}
                className={`flex-1 py-2 rounded-lg border text-sm font-bold capitalize transition-all ${adjustType === t ? (t === "credit" ? "bg-green/10 text-green border-green/20" : "bg-red/10 text-red border-red/20") : "bg-bg3 text-textMuted border-border"}`}>
                {t === "credit" ? <PlusCircle size={14} className="inline mr-1" /> : <MinusCircle size={14} className="inline mr-1" />}
                {t}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Amount (ZAR) *</label>
            <Input type="number" step="0.01" min="0" placeholder="0.00" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Reason *</label>
            <Input placeholder="Reason for adjustment..." value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setAdjustModal(false)}>Cancel</Button>
            <Button onClick={handleAdjust}>
              {adjustType === "credit" ? <PlusCircle size={13} /> : <MinusCircle size={13} />}
              {adjustType === "credit" ? "Credit" : "Debit"} Wallet
            </Button>
          </div>
        </div>
      </Modal>

      <DangerPinModal
        open={dangerPin.open}
        onSuccess={dangerPin.handleSuccess}
        onCancel={dangerPin.handleCancel}
        actionLabel="perform this wallet operation"
      />
    </AdminShell>
  );
}
