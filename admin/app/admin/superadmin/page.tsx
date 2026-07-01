"use client";
import { useState, useEffect } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Button, Spinner, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { formatZAR } from "@/lib/utils";
import { ArrowLeftRight, PlusCircle, MinusCircle, Snowflake, Wallet, Trash2, Search, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import { isSuperAdmin } from "@/lib/api";
import { useRouter } from "next/navigation";
import { DangerPinModal, useDangerPin } from "@/components/DangerPinModal";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = (dangerToken?: string | null) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
  ...(dangerToken ? { "X-Danger-Token": dangerToken } : {}),
});

export default function SuperAdminPage() {
  const router = useRouter();
  const superAdmin = isSuperAdmin();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteSearch, setDeleteSearch] = useState("");

  const [fromUser, setFromUser] = useState("");
  const [toUser, setToUser] = useState("");
  const [transferAmt, setTransferAmt] = useState("");
  const [transferNote, setTransferNote] = useState("");

  const [adjustUser, setAdjustUser] = useState("");
  const [adjustAmt, setAdjustAmt] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustType, setAdjustType] = useState<"credit" | "debit">("credit");

  const [walletUserId, setWalletUserId] = useState("");
  const [walletData, setWalletData] = useState<any>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [freezeReason, setFreezeReason] = useState("");

  const [pinAction, setPinAction] = useState<"transfer" | "adjust" | "delete" | "freeze" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const { open: pinOpen, request: requestPin, handleSuccess: pinSuccess, handleCancel: pinCancel } = useDangerPin();

  useEffect(() => {
    if (!superAdmin) { router.push("/admin/dashboard"); return; }
    api.users().then((r) => setUsers(
      r.data.filter((u: any) =>
        !["admin", "superadmin", "finance", "support", "ceo", "cto", "cfo"].includes(u.role)
      )
    )).finally(() => setLoading(false));
  }, []);

  const handleTransfer = async () => {
    const amount = parseFloat(transferAmt);
    if (!fromUser || !toUser || !amount) { toast.error("Fill all fields"); return; }
    if (fromUser === toUser) { toast.error("Cannot transfer to same account"); return; }
    if (!transferNote.trim()) { toast.error("Note is required for fund transfers"); return; }
    setPinAction("transfer");
    const token = await requestPin();
    if (!token) return;
    try {
      const res = await api.transferFunds({
        from_user_id: fromUser, to_user_id: toUser,
        amount, note: transferNote,
      }, token);
      toast.success(`Transferred — Ref: ${res.data.reference}`);
      setFromUser(""); setToUser(""); setTransferAmt(""); setTransferNote("");
    } catch (e: any) { toast.error(e.message); }
    finally { setPinAction(null); }
  };

  const handleAdjust = async () => {
    const amount = parseFloat(adjustAmt);
    if (!adjustUser || !amount) { toast.error("Fill all fields"); return; }
    if (!adjustNote.trim()) { toast.error("Note is required for balance adjustments"); return; }
    setPinAction("adjust");
    const token = await requestPin();
    if (!token) return;
    const finalAmount = adjustType === "debit" ? -amount : amount;
    try {
      const res = await api.adjustBalance({
        user_id: adjustUser, amount: finalAmount,
        note: adjustNote,
      }, token);
      toast.success(`Balance updated. New balance: ${formatZAR(res.data.new_balance)}`);
      setAdjustAmt(""); setAdjustNote("");
    } catch (e: any) { toast.error(e.message); }
    finally { setPinAction(null); }
  };

  const handleViewWallet = async () => {
    if (!walletUserId) return;
    setWalletLoading(true);
    try {
      const res = await api.getUserWallet(walletUserId);
      setWalletData(res.data);
    } catch (e: any) { toast.error(e.message); }
    finally { setWalletLoading(false); }
  };

  const handleFreeze = async (freeze: boolean) => {
    if (!walletUserId) return;
    if (freeze && !freezeReason.trim()) { toast.error("Freeze reason required"); return; }
    setPinAction("freeze");
    const token = await requestPin();
    if (!token) return;
    try {
      if (freeze) await api.freezeWallet(walletUserId, freezeReason.trim(), token);
      else await api.unfreezeWallet(walletUserId, token);
      toast.success(freeze ? "Wallet frozen" : "Wallet unfrozen");
      setFreezeReason("");
      handleViewWallet();
    } catch (e: any) { toast.error(e.message); }
    finally { setPinAction(null); }
  };

  const initiateDelete = (userId: string, name: string) => {
    setPendingDelete({ id: userId, name });
    setPinAction("delete");
    requestPin().then(async (token) => {
      if (!token) { setPendingDelete(null); return; }
      try {
        await api.deleteUser(userId, token);
        toast.success(`${name} deleted`);
        api.users().then((r) => setUsers(r.data));
      } catch (e: any) { toast.error(e.message); }
      finally { setPendingDelete(null); setPinAction(null); }
    });
  };

  if (!superAdmin) return null;

  const userSelect = (value: string, onChange: (v: string) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-text text-sm focus:outline-none focus:border-cyan">
      <option value="">Select user...</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>{u.full_name} — {u.phone_number}</option>
      ))}
    </select>
  );

  const filteredDeleteUsers = users.filter(u =>
    !deleteSearch ||
    u.full_name?.toLowerCase().includes(deleteSearch.toLowerCase()) ||
    u.phone_number?.includes(deleteSearch)
  );

  const pinLabel =
    pinAction === "delete" ? `permanently delete ${pendingDelete?.name}`
    : pinAction === "transfer" ? "transfer funds between wallets"
    : pinAction === "adjust" ? `${adjustType} wallet balance`
    : "freeze/unfreeze wallet";

  return (
    <AdminShell title="Superadmin Controls">
      <DangerPinModal
        open={pinOpen}
        onSuccess={pinSuccess}
        onCancel={pinCancel}
        actionLabel={pinLabel}
      />

      <div className="space-y-6">

        {/* Quick links */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Document Studio", href: "/admin/superadmin/document-studio", color: "text-purple bg-purple/10 border-purple/20", desc: "Advanced doc editor & templates" },
            { label: "Admin Accounts", href: "/admin/admins", color: "text-cyan bg-cyan/10 border-cyan/20", desc: "Manage admin users & permissions" },
            { label: "Settings & Config", href: "/admin/settings", color: "text-yellow bg-yellow/10 border-yellow/20", desc: "System configuration & fees" },
            { label: "Database", href: "/admin/database", color: "text-red bg-red/10 border-red/20", desc: "Direct database management" },
          ].map(l => (
            <a key={l.href} href={l.href} className={`flex flex-col gap-1.5 p-4 rounded-xl border transition-all hover:opacity-80 ${l.color}`}>
              <p className="text-xs font-extrabold">{l.label}</p>
              <p className="text-[10px] opacity-70">{l.desc}</p>
            </a>
          ))}
        </div>

        {/* Transfer Funds */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <ArrowLeftRight size={16} className="text-cyan" />
            <h2 className="text-text font-bold">Transfer Funds</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">From User</label>
              {userSelect(fromUser, setFromUser)}
            </div>
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">To User</label>
              {userSelect(toUser, setToUser)}
            </div>
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Amount (ZAR)</label>
              <Input type="number" placeholder="0.00" value={transferAmt}
                onChange={(e) => setTransferAmt(e.target.value)} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
                Note <span className="text-red text-[9px]">REQUIRED</span>
              </label>
              <Input placeholder="Reason for transfer" value={transferNote}
                onChange={(e) => setTransferNote(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleTransfer}>
              <ArrowLeftRight size={13} /> Transfer Funds
            </Button>
            <p className="text-textDim text-xs flex items-center gap-1">
              <AlertTriangle size={11} className="text-yellow" /> Requires danger PIN
            </p>
          </div>
        </Card>

        {/* Adjust Balance */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Wallet size={16} className="text-purple" />
            <h2 className="text-text font-bold">Adjust Balance</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">User</label>
              {userSelect(adjustUser, setAdjustUser)}
            </div>
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Type</label>
              <div className="flex gap-3">
                <button onClick={() => setAdjustType("credit")}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-all
                    ${adjustType === "credit"
                      ? "bg-green/10 text-green border-green/20"
                      : "bg-bg border-border text-textMuted"}`}>
                  <PlusCircle size={13} className="inline mr-1" /> Credit
                </button>
                <button onClick={() => setAdjustType("debit")}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-all
                    ${adjustType === "debit"
                      ? "bg-red/10 text-red border-red/20"
                      : "bg-bg border-border text-textMuted"}`}>
                  <MinusCircle size={13} className="inline mr-1" /> Debit
                </button>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Amount (ZAR)</label>
              <Input type="number" placeholder="0.00" value={adjustAmt}
                onChange={(e) => setAdjustAmt(e.target.value)} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
                Note <span className="text-red text-[9px]">REQUIRED</span>
              </label>
              <Input placeholder="Reason for adjustment" value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant={adjustType === "debit" ? "danger" : "primary"} onClick={handleAdjust}>
              {adjustType === "credit" ? <PlusCircle size={13} /> : <MinusCircle size={13} />}
              {adjustType === "credit" ? "Credit Wallet" : "Debit Wallet"}
            </Button>
            <p className="text-textDim text-xs flex items-center gap-1">
              <AlertTriangle size={11} className="text-yellow" /> Requires danger PIN
            </p>
          </div>
        </Card>

        {/* Wallet Control */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Snowflake size={16} className="text-cyan" />
            <h2 className="text-text font-bold">Wallet Control</h2>
          </div>
          <div className="flex gap-3 mb-4">
            <div className="flex-1">
              {userSelect(walletUserId, setWalletUserId)}
            </div>
            <Button variant="secondary" onClick={handleViewWallet}>View Wallet</Button>
          </div>

          {walletLoading && <Spinner />}

          {walletData && (
            <div className="space-y-4">
              <div className="bg-bg border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-text font-bold">{walletData.user.full_name}</p>
                    <p className="text-textMuted text-xs">{walletData.user.phone_number}</p>
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold ${walletData.wallet.is_frozen ? "bg-red/10 border-red/20 text-red" : "bg-green/10 border-green/20 text-green"}`}>
                    {walletData.wallet.is_frozen ? "Frozen" : "Active"}
                  </span>
                </div>
                <p className="text-3xl font-extrabold text-cyan">
                  {formatZAR(walletData.wallet.balance)}
                </p>
              </div>
              {!walletData.wallet.is_frozen ? (
                <div className="space-y-2">
                  <Input
                    placeholder="Reason for freezing..."
                    value={freezeReason}
                    onChange={(e) => setFreezeReason(e.target.value)}
                  />
                  <div className="flex items-center gap-3">
                    <Button variant="danger" onClick={() => handleFreeze(true)}>
                      <Snowflake size={13} /> Freeze Wallet
                    </Button>
                    <p className="text-textDim text-xs flex items-center gap-1">
                      <AlertTriangle size={11} className="text-yellow" /> Requires danger PIN
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Button variant="secondary" onClick={() => handleFreeze(false)}>
                    <Snowflake size={13} /> Unfreeze Wallet
                  </Button>
                  <p className="text-textDim text-xs flex items-center gap-1">
                    <AlertTriangle size={11} className="text-yellow" /> Requires danger PIN
                  </p>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Delete Users */}
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <Trash2 size={16} className="text-red" />
            <h2 className="text-text font-bold">Delete User</h2>
          </div>
          <div className="flex items-center gap-2 px-4 py-3 bg-red/10 border border-red/20 rounded-xl mb-4">
            <AlertTriangle size={14} className="text-red flex-shrink-0" />
            <p className="text-red text-sm font-semibold">
              Permanently deletes user and all their data. Cannot be undone. Requires danger PIN.
            </p>
          </div>
          <div className="mb-4">
            <Input
              placeholder="Search by name or phone..."
              value={deleteSearch}
              onChange={(e) => setDeleteSearch(e.target.value)}
            />
          </div>
          {loading ? <Spinner /> : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {filteredDeleteUsers.length === 0 ? (
                <p className="text-textMuted text-center py-6 text-sm">No users match your search</p>
              ) : filteredDeleteUsers.map((u) => (
                <div key={u.id}
                  className="flex items-center justify-between p-3 bg-bg border border-border rounded-lg hover:border-red/20 transition-colors">
                  <div>
                    <p className="text-text font-semibold text-sm">{u.full_name}</p>
                    <p className="text-textMuted text-xs font-mono">{u.phone_number}
                      <span className="ml-2 text-textDim">· {u.role}</span>
                    </p>
                  </div>
                  <Button
                    variant="danger"
                    loading={pendingDelete?.id === u.id}
                    onClick={() => initiateDelete(u.id, u.full_name)}>
                    <Trash2 size={12} /> Delete
                  </Button>
                </div>
              ))}
            </div>
          )}
          {filteredDeleteUsers.length > 0 && (
            <p className="text-textDim text-xs mt-3">{filteredDeleteUsers.length} user{filteredDeleteUsers.length !== 1 ? "s" : ""} shown</p>
          )}
        </Card>

      </div>
    </AdminShell>
  );
}
