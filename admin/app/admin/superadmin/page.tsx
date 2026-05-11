"use client";
import { useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Button, Spinner, Badge, Input } from "@/components/ui";
import {
  useUsers, useDeleteUser, useFreezeWallet,
  useTransferFunds, useAdjustBalance, useUserWallet,
} from "@/lib/hooks";
import { formatZAR } from "@/lib/utils";
import { getToken } from "@/lib/api";
import { Trash2, Snowflake, ArrowLeftRight, PlusCircle, MinusCircle, Wallet } from "lucide-react";

function isSuperAdmin() {
  try {
    const token = getToken();
    if (!token) return false;
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.role === "superadmin";
  } catch { return false; }
}

function WalletCard({ userId }: { userId: string }) {
  const { data, isLoading } = useUserWallet(userId);
  if (isLoading) return <Spinner />;
  if (!data) return null;
  return (
    <div className="mt-3 p-3 bg-bg rounded-md border border-border text-sm">
      <div className="flex items-center justify-between">
        <span className="text-textMuted">Balance</span>
        <span className="font-bold text-green">{formatZAR(data.wallet.balance)}</span>
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-textMuted">Status</span>
        <Badge label={data.wallet.is_frozen ? "Frozen" : "Active"} tone={data.wallet.is_frozen ? "red" : "green"} />
      </div>
    </div>
  );
}

export default function SuperAdminPage() {
  const superAdmin = isSuperAdmin();
  const { data: users, isLoading } = useUsers();
  const deleteUser = useDeleteUser();
  const freezeWallet = useFreezeWallet();
  const transferFunds = useTransferFunds();
  const adjustBalance = useAdjustBalance();

  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferNote, setTransferNote] = useState("");

  const [adjustUserId, setAdjustUserId] = useState("");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustType, setAdjustType] = useState<"credit" | "debit">("credit");

  if (!superAdmin) {
    return (
      <AdminShell title="Superadmin Controls">
        <div className="text-textMuted text-center py-16">
          Access restricted to superadmin only.
        </div>
      </AdminShell>
    );
  }

  const regularUsers = users?.filter((u) => !["admin", "superadmin"].includes(u.role)) ?? [];

  const handleTransfer = async () => {
    const amount = parseFloat(transferAmount);
    if (!transferFrom || !transferTo || !amount) return;
    if (confirm(`Transfer ${formatZAR(amount)} between users?`)) {
      await transferFunds.mutateAsync({
        from_user_id: transferFrom,
        to_user_id: transferTo,
        amount,
        note: transferNote || undefined,
      });
      setTransferFrom(""); setTransferTo(""); setTransferAmount(""); setTransferNote("");
    }
  };

  const handleAdjust = async () => {
    const amount = parseFloat(adjustAmount);
    if (!adjustUserId || !amount) return;
    const finalAmount = adjustType === "debit" ? -amount : amount;
    if (confirm(`${adjustType === "credit" ? "Credit" : "Debit"} ${formatZAR(amount)} ${adjustType === "credit" ? "to" : "from"} wallet?`)) {
      await adjustBalance.mutateAsync({
        user_id: adjustUserId,
        amount: finalAmount,
        note: adjustNote || undefined,
      });
      setAdjustAmount(""); setAdjustNote("");
    }
  };

  return (
    <AdminShell title="Superadmin Controls">
      <div className="space-y-6">

        {/* Transfer Funds */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <ArrowLeftRight size={18} className="text-cyan" />
            <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest">Transfer Funds</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-bold text-textMuted uppercase tracking-widest mb-1.5">From User</label>
              <select value={transferFrom} onChange={(e) => setTransferFrom(e.target.value)}
                className="w-full bg-bg border border-border rounded-md px-3 py-2 text-text text-sm focus:outline-none focus:border-cyan">
                <option value="">Select user...</option>
                {regularUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name} — {u.phone_number}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-textMuted uppercase tracking-widest mb-1.5">To User</label>
              <select value={transferTo} onChange={(e) => setTransferTo(e.target.value)}
                className="w-full bg-bg border border-border rounded-md px-3 py-2 text-text text-sm focus:outline-none focus:border-cyan">
                <option value="">Select user...</option>
                {regularUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name} — {u.phone_number}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-textMuted uppercase tracking-widest mb-1.5">Amount (ZAR)</label>
              <Input type="number" placeholder="0.00" value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-bold text-textMuted uppercase tracking-widest mb-1.5">Note (optional)</label>
              <Input placeholder="Reason for transfer" value={transferNote}
                onChange={(e) => setTransferNote(e.target.value)} />
            </div>
          </div>
          <Button onClick={handleTransfer} loading={transferFunds.isPending}>
            <ArrowLeftRight size={14} /> Transfer Funds
          </Button>
        </Card>

        {/* Adjust Balance */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Wallet size={18} className="text-purple" />
            <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest">Adjust Balance</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-bold text-textMuted uppercase tracking-widest mb-1.5">User</label>
              <select value={adjustUserId} onChange={(e) => setAdjustUserId(e.target.value)}
                className="w-full bg-bg border border-border rounded-md px-3 py-2 text-text text-sm focus:outline-none focus:border-cyan">
                <option value="">Select user...</option>
                {regularUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name} — {u.phone_number}</option>
                ))}
              </select>
              {adjustUserId && <WalletCard userId={adjustUserId} />}
            </div>
            <div>
              <label className="block text-xs font-bold text-textMuted uppercase tracking-widest mb-1.5">Type</label>
              <div className="flex gap-3">
                <button onClick={() => setAdjustType("credit")}
                  className={`flex-1 py-2 rounded-md text-sm font-bold border transition-all ${adjustType === "credit" ? "bg-greenDim text-green border-green/20" : "bg-bg border-border text-textMuted"}`}>
                  <PlusCircle size={14} className="inline mr-1" /> Credit
                </button>
                <button onClick={() => setAdjustType("debit")}
                  className={`flex-1 py-2 rounded-md text-sm font-bold border transition-all ${adjustType === "debit" ? "bg-redDim text-red border-red/20" : "bg-bg border-border text-textMuted"}`}>
                  <MinusCircle size={14} className="inline mr-1" /> Debit
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-textMuted uppercase tracking-widest mb-1.5">Amount (ZAR)</label>
              <Input type="number" placeholder="0.00" value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-bold text-textMuted uppercase tracking-widest mb-1.5">Note (optional)</label>
              <Input placeholder="Reason for adjustment" value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)} />
            </div>
          </div>
          <Button onClick={handleAdjust} loading={adjustBalance.isPending}
            variant={adjustType === "debit" ? "danger" : "primary"}>
            {adjustType === "credit" ? <PlusCircle size={14} /> : <MinusCircle size={14} />}
            {adjustType === "credit" ? "Credit Wallet" : "Debit Wallet"}
          </Button>
        </Card>

        {/* User Controls */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Trash2 size={18} className="text-red" />
            <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest">User Controls</h2>
          </div>
          {isLoading ? <Spinner /> : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-bg3 border-b border-border">
                  <tr>
                    {["Name", "Phone", "Role", "Status", "Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-textMuted font-bold text-xs uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {regularUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-bg3 transition-colors">
                      <td className="px-4 py-3 font-semibold text-text">{u.full_name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-textMuted">{u.phone_number}</td>
                      <td className="px-4 py-3"><Badge label={u.role} tone={u.role === "driver" ? "cyan" : "muted"} /></td>
                      <td className="px-4 py-3"><Badge label={u.is_active ? "Active" : "Blocked"} tone={u.is_active ? "green" : "red"} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Button variant="secondary" loading={freezeWallet.isPending}
                            onClick={() => freezeWallet.mutate({ id: u.id, freeze: true })}>
                            <Snowflake size={14} /> Freeze
                          </Button>
                          <Button variant="ghost" loading={freezeWallet.isPending}
                            onClick={() => freezeWallet.mutate({ id: u.id, freeze: false })}>
                            Unfreeze
                          </Button>
                          <Button variant="danger" loading={deleteUser.isPending}
                            onClick={() => {
                              if (confirm(`Delete ${u.full_name}? This cannot be undone.`)) {
                                deleteUser.mutate(u.id);
                              }
                            }}>
                            <Trash2 size={14} /> Delete
                          </Button>
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
    </AdminShell>
  );
                                                                            }
