"use client";
import { useState, useEffect } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Spinner, Badge, Button, Modal, Input } from "@/components/ui";
import { api, hasPermission } from "@/lib/api";
import { DangerPinModal, useDangerPin } from "@/components/DangerPinModal";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  Search, Key, Snowflake, Copy, CheckCircle, User,
  Wallet, ArrowLeftRight, ShieldAlert, Bell, FileText,
  Phone, Calendar, Shield, AlertTriangle, RefreshCw,
  XCircle, Flag, Unlock, ChevronDown, ChevronUp,
  MessageCircle, PlusCircle, MinusCircle, RotateCcw,
  Send,
} from "lucide-react";
import toast from "react-hot-toast";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy}
      className="flex items-center gap-1 text-textDim hover:text-cyan transition-colors text-[10px] font-mono">
      {copied ? <CheckCircle size={10} className="text-green" /> : <Copy size={10} />}
      {label || value}
    </button>
  );
}

function InfoRow({ label, value, copy }: { label: string; value: string; copy?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <span className="text-textMuted text-xs">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-text text-xs font-medium">{value}</span>
        {copy && <CopyButton value={value} />}
      </div>
    </div>
  );
}

const TXN_TONE: Record<string, any> = {
  topup: "cyan", payment: "green", withdrawal: "purple",
  cashup: "yellow", refund: "green", failed: "red",
};

export default function SupportPage() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [pinResult, setPinResult] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [expandedTxn, setExpandedTxn] = useState<string | null>(null);
  const [txnSearch, setTxnSearch] = useState("");

  // Wallet adjustment modal
  const [adjustModal, setAdjustModal] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustType, setAdjustType] = useState<"credit" | "debit">("credit");
  const [adjusting, setAdjusting] = useState(false);

  // Freeze wallet modal (replaces browser prompt)
  const [freezeModal, setFreezeModal] = useState(false);
  const [freezeReason, setFreezeReason] = useState("");
  const [freezing, setFreezing] = useState(false);

  // Flag user modal (replaces browser prompt)
  const [flagModal, setFlagModal] = useState(false);
  const [flagReason, setFlagReason] = useState("");
  const [flagging, setFlagging] = useState(false);

  // Create refund modal
  const [refundModal, setRefundModal] = useState(false);
  const [refundTxnId, setRefundTxnId] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refunding, setRefunding] = useState(false);

  // Send notification modal
  const [notifModal, setNotifModal] = useState(false);
  const [notifTitle, setNotifTitle] = useState("");
  const [notifMsg, setNotifMsg] = useState("");
  const [notifType, setNotifType] = useState("info");
  const [notifying, setNotifying] = useState(false);

  const canManage = hasPermission("manage_users");
  const canFreeze = hasPermission("freeze_wallet");
  const canReset = hasPermission("reset_pin");
  const { open: pinOpen, request: requestPin, handleSuccess: pinSuccess, handleCancel: pinCancel } = useDangerPin();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setQuery(q);
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResult(null);
    setPinResult(null);
    setActiveTab("overview");
    try {
      const res = await api.supportLookup(query.trim());
      setResult(res.data);
    } catch (e: any) {
      toast.error(e.message || "User not found");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPin = async () => {
    if (!result?.user?.id) return;
    setActionLoading("pin");
    try {
      const res = await api.resetPin(result.user.id);
      setPinResult(res.data.temporary_pin);
      toast.success("PIN reset successfully");
    } catch (e: any) { toast.error(e.message); }
    finally { setActionLoading(null); }
  };

  const handleBlock = async () => {
    if (!result?.user?.id) return;
    const isBlocked = !result.user.is_active;
    if (!confirm(`${isBlocked ? "Unblock" : "Block"} ${result.user.full_name}?`)) return;
    setActionLoading("block");
    try {
      if (isBlocked) {
        await api.unblockUser(result.user.id);
        toast.success("User unblocked");
      } else {
        await api.blockUser(result.user.id);
        toast.success("User blocked");
      }
      handleSearch();
    } catch (e: any) { toast.error(e.message); }
    finally { setActionLoading(null); }
  };

  // Opens freeze modal with PIN confirmation flow
  const confirmFreeze = async () => {
    if (!freezeReason.trim()) { toast.error("Freeze reason is required"); return; }
    const token = await requestPin();
    if (!token) return;
    setFreezing(true);
    try {
      await api.freezeWallet(result.user.id, freezeReason.trim());
      toast.success("Wallet frozen");
      setFreezeModal(false);
      setFreezeReason("");
      handleSearch();
    } catch (e: any) { toast.error(e.message); }
    finally { setFreezing(false); }
  };

  const handleUnfreeze = async () => {
    const token = await requestPin();
    if (!token) return;
    setActionLoading("freeze");
    try {
      await api.unfreezeWallet(result.user.id);
      toast.success("Wallet unfrozen");
      handleSearch();
    } catch (e: any) { toast.error(e.message); }
    finally { setActionLoading(null); }
  };

  const confirmFlag = async () => {
    if (!flagReason.trim()) { toast.error("Flag reason is required"); return; }
    setFlagging(true);
    try {
      await api.flagUser(result.user.id, flagReason.trim());
      toast.success("User flagged");
      setFlagModal(false);
      setFlagReason("");
      handleSearch();
    } catch (e: any) { toast.error(e.message); }
    finally { setFlagging(false); }
  };

  const handleUnflag = async () => {
    setActionLoading("flag");
    try {
      await api.unflagUser(result.user.id);
      toast.success("User unflagged");
      handleSearch();
    } catch (e: any) { toast.error(e.message); }
    finally { setActionLoading(null); }
  };

  const handleSaveNote = async () => {
    if (!noteText.trim() || !result?.user?.id) return;
    setSavingNote(true);
    try {
      await fetch(`${BASE}/api/admin/support/note/${result.user.id}`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ note: noteText }),
      });
      toast.success("Note saved");
      setNoteText("");
      handleSearch();
    } catch (e: any) { toast.error(e.message || "Could not save note"); }
    finally { setSavingNote(false); }
  };

  const handleWalletAdjust = async () => {
    if (!result?.user?.id || !adjustAmount.trim()) return;
    const amt = parseFloat(adjustAmount);
    if (isNaN(amt) || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (!adjustNote.trim()) { toast.error("Note is required"); return; }
    const token = await requestPin();
    if (!token) return;
    setAdjusting(true);
    try {
      const res = await fetch(`${BASE}/api/admin/wallets/${result.user.id}/adjust`, {
        method: "POST",
        headers: { ...authHeaders(), "X-Danger-Token": token },
        body: JSON.stringify({ amount: adjustType === "credit" ? amt : -amt, note: adjustNote }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Adjustment failed");
      toast.success(`Wallet ${adjustType === "credit" ? "credited" : "debited"} ${formatZAR(amt)}`);
      setAdjustModal(false); setAdjustAmount(""); setAdjustNote("");
      handleSearch();
    } catch (e: any) { toast.error(e.message); }
    finally { setAdjusting(false); }
  };

  const handleCreateRefund = async () => {
    if (!result?.user?.id) return;
    if (!refundTxnId.trim()) { toast.error("Transaction ID required"); return; }
    if (!refundAmount || parseFloat(refundAmount) <= 0) { toast.error("Valid amount required"); return; }
    if (!refundReason.trim()) { toast.error("Reason required"); return; }
    setRefunding(true);
    try {
      await api.createRefund({
        user_id: result.user.id,
        transaction_id: refundTxnId.trim(),
        amount: parseFloat(refundAmount),
        reason: refundReason.trim(),
      });
      toast.success("Refund request created — pending approval");
      setRefundModal(false);
      setRefundTxnId(""); setRefundAmount(""); setRefundReason("");
    } catch (e: any) { toast.error(e.message); }
    finally { setRefunding(false); }
  };

  const handleSendNotification = async () => {
    if (!notifTitle.trim() || !notifMsg.trim()) { toast.error("Title and message required"); return; }
    if (!result?.user?.id) return;
    setNotifying(true);
    try {
      await fetch(`${BASE}/api/admin/notifications/send`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          title: notifTitle.trim(),
          message: notifMsg.trim(),
          type: notifType,
          target: "user",
          user_id: result.user.id,
        }),
      });
      toast.success(`Notification sent to ${result.user.full_name}`);
      setNotifModal(false);
      setNotifTitle(""); setNotifMsg(""); setNotifType("info");
    } catch (e: any) { toast.error(e.message || "Failed to send notification"); }
    finally { setNotifying(false); }
  };

  const TABS = [
    { key: "overview",     label: "Overview",     icon: User },
    { key: "transactions", label: `Transactions${result?.recent_transactions?.length ? ` (${result.recent_transactions.length})` : ""}`, icon: ArrowLeftRight },
    { key: "withdrawals",  label: "Withdrawals",  icon: Wallet },
    { key: "audit",        label: "Audit Trail",  icon: FileText },
    { key: "notes",        label: "Notes",        icon: Bell },
  ];

  return (
    <AdminShell title="Support">
      <DangerPinModal open={pinOpen} onSuccess={pinSuccess} onCancel={pinCancel} actionLabel="wallet operation" />

      <div className="space-y-5 max-w-3xl">

        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
            <input value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="Search by phone number, name, or user ID..."
              className="w-full bg-bg2 border border-border rounded-xl pl-9 pr-4 py-3 text-text text-sm focus:outline-none focus:border-cyan placeholder:text-textDim" />
          </div>
          <button onClick={handleSearch} disabled={loading || !query.trim()}
            className="flex items-center gap-2 px-5 py-3 bg-cyan text-bg rounded-xl text-sm font-bold hover:bg-cyan/90 transition-colors disabled:opacity-50">
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
            Search
          </button>
        </div>

        {loading && <div className="flex items-center justify-center py-12"><Spinner /></div>}

        {result && (
          <>
            <Card>
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-cyanDim border border-cyan/20 flex items-center justify-center flex-shrink-0">
                  <User size={20} className="text-cyan" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-text font-extrabold text-lg">{result.user.full_name}</h2>
                    <Badge label={result.user.role} tone="cyan" />
                    <Badge label={result.user.is_active ? "Active" : "Blocked"} tone={result.user.is_active ? "green" : "red"} />
                    {result.user.flagged && <Badge label="Flagged" tone="yellow" />}
                    {result.wallet?.is_frozen && <Badge label="Wallet Frozen" tone="red" />}
                  </div>
                  <div className="flex items-center gap-4 mt-1 flex-wrap">
                    <div className="flex items-center gap-1.5 text-textMuted text-xs">
                      <Phone size={11} />
                      <CopyButton value={result.user.phone_number} label={result.user.phone_number} />
                    </div>
                    <div className="flex items-center gap-1.5 text-textMuted text-xs">
                      <Calendar size={11} />
                      <span>Joined {formatDate(result.user.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-textMuted text-xs">
                      <Shield size={11} />
                      <CopyButton value={result.user.id} label={`ID: ${result.user.id.slice(0, 8)}...`} />
                    </div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-cyan font-extrabold text-xl">{formatZAR(result.wallet?.balance || 0)}</p>
                  <p className="text-textMuted text-xs">wallet balance</p>
                  {result.wallet?.is_frozen && (
                    <div className="flex items-center gap-1 justify-end mt-1">
                      <Snowflake size={11} className="text-red" />
                      <span className="text-red text-[10px] font-bold">FROZEN</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 mt-4 flex-wrap">
                <a
                  href={`/admin/whatsapp-support?phone=${encodeURIComponent(result.user.phone_number)}`}
                  target="_blank"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green/10 border border-green/20 rounded-lg text-green text-xs font-bold hover:bg-green/20 transition-colors">
                  <MessageCircle size={12} /> WhatsApp
                </a>

                {canFreeze && (
                  <button onClick={() => setAdjustModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple/10 border border-purple/20 rounded-lg text-purple text-xs font-bold hover:bg-purple/20 transition-colors">
                    <Wallet size={12} /> Adjust Wallet
                  </button>
                )}

                {/* Send notification to this user */}
                <button onClick={() => setNotifModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan/10 border border-cyan/20 rounded-lg text-cyan text-xs font-bold hover:bg-cyan/20 transition-colors">
                  <Bell size={12} /> Notify User
                </button>

                {/* Create refund */}
                <button onClick={() => setRefundModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow/10 border border-yellow/20 rounded-lg text-yellow text-xs font-bold hover:bg-yellow/20 transition-colors">
                  <RotateCcw size={12} /> Create Refund
                </button>

                {canReset && (
                  <button onClick={handleResetPin} disabled={actionLoading === "pin"}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple/10 border border-purple/20 rounded-lg text-purple text-xs font-bold hover:bg-purple/20 transition-colors disabled:opacity-50">
                    <Key size={12} />
                    {actionLoading === "pin" ? "Resetting..." : "Reset PIN"}
                  </button>
                )}

                {canFreeze && (
                  result.wallet?.is_frozen ? (
                    <button onClick={handleUnfreeze} disabled={actionLoading === "freeze"}
                      className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-bold transition-colors disabled:opacity-50 bg-green/10 border-green/20 text-green hover:bg-green/20">
                      <Unlock size={12} /> Unfreeze Wallet
                    </button>
                  ) : (
                    <button onClick={() => { setFreezeReason(""); setFreezeModal(true); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-bold transition-colors bg-cyan/10 border-cyan/20 text-cyan hover:bg-cyan/20">
                      <Snowflake size={12} /> Freeze Wallet
                    </button>
                  )
                )}

                {canManage && (
                  <button onClick={handleBlock} disabled={actionLoading === "block"}
                    className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-bold transition-colors disabled:opacity-50 ${
                      !result.user.is_active
                        ? "bg-green/10 border-green/20 text-green hover:bg-green/20"
                        : "bg-red/10 border-red/20 text-red hover:bg-red/20"}`}>
                    {!result.user.is_active
                      ? <><CheckCircle size={12} /> Unblock User</>
                      : <><XCircle size={12} /> Block User</>}
                  </button>
                )}

                {canManage && (
                  result.user.flagged ? (
                    <button onClick={handleUnflag} disabled={actionLoading === "flag"}
                      className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-bold transition-colors disabled:opacity-50 bg-green/10 border-green/20 text-green hover:bg-green/20">
                      <Flag size={12} /> Unflag
                    </button>
                  ) : (
                    <button onClick={() => { setFlagReason(""); setFlagModal(true); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-bold transition-colors bg-yellow/10 border-yellow/20 text-yellow hover:bg-yellow/20">
                      <Flag size={12} /> Flag User
                    </button>
                  )
                )}
              </div>

              {pinResult && (
                <div className="mt-4 p-4 bg-purple/5 border border-purple/20 rounded-xl">
                  <p className="text-purple text-xs font-bold mb-2">TEMPORARY PIN — Share with user</p>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-3xl font-black text-cyan tracking-widest">{pinResult}</span>
                    <div className="flex items-center gap-2">
                      <CopyButton value={pinResult} label="Copy" />
                      <button onClick={() => setPinResult(null)} className="text-textDim hover:text-text transition-colors">
                        <XCircle size={14} />
                      </button>
                    </div>
                  </div>
                  <p className="text-red text-[10px] font-bold mt-2">Shown once only. Advise user to change PIN immediately.</p>
                </div>
              )}

              {result.outstanding_balance > 0 && (
                <div className="flex items-center gap-3 mt-4 p-3 bg-yellow/5 border border-yellow/20 rounded-xl">
                  <AlertTriangle size={14} className="text-yellow flex-shrink-0" />
                  <p className="text-yellow text-xs">
                    <span className="font-bold">Outstanding balance:</span> Driver owes {formatZAR(result.outstanding_balance)} to fleet owner
                  </p>
                </div>
              )}
            </Card>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-border overflow-x-auto">
              {TABS.map(t => (
                <button key={t.key} onClick={() => setActiveTab(t.key)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-all ${
                    activeTab === t.key ? "text-cyan border-cyan" : "text-textMuted border-transparent hover:text-text"
                  }`}>
                  <t.icon size={12} />
                  {t.label}
                </button>
              ))}
            </div>

            {/* Overview tab */}
            {activeTab === "overview" && (
              <div className="space-y-4">
                <Card>
                  <h3 className="text-text font-bold text-sm mb-3">Account Details</h3>
                  <InfoRow label="Full name" value={result.user.full_name} copy />
                  <InfoRow label="Phone" value={result.user.phone_number} copy />
                  <InfoRow label="User ID" value={result.user.id} copy />
                  <InfoRow label="Role" value={result.user.role} />
                  <InfoRow label="Status" value={result.user.is_active ? "Active" : "Blocked"} />
                  <InfoRow label="Joined" value={formatDate(result.user.created_at)} />
                  {result.user.vehicle_plate && <InfoRow label="Vehicle plate" value={result.user.vehicle_plate} copy />}
                </Card>
                <Card>
                  <h3 className="text-text font-bold text-sm mb-3">Wallet</h3>
                  <InfoRow label="Balance" value={formatZAR(result.wallet?.balance || 0)} />
                  <InfoRow label="Status" value={result.wallet?.is_frozen ? "Frozen" : "Active"} />
                  {result.wallet?.total_earnings > 0 && (
                    <InfoRow label="Total earnings" value={formatZAR(result.wallet.total_earnings)} />
                  )}
                </Card>
                {result.kyc && (
                  <Card>
                    <h3 className="text-text font-bold text-sm mb-3">KYC Status</h3>
                    <InfoRow label="Status" value={result.kyc.status} />
                    {result.kyc.submitted_at && <InfoRow label="Submitted" value={formatDate(result.kyc.submitted_at)} />}
                    {result.kyc.reviewed_at && <InfoRow label="Reviewed" value={formatDate(result.kyc.reviewed_at)} />}
                    {result.kyc.rejection_reason && <InfoRow label="Rejection reason" value={result.kyc.rejection_reason} />}
                  </Card>
                )}
              </div>
            )}

            {/* Transactions tab */}
            {activeTab === "transactions" && (() => {
              const txns: any[] = result.recent_transactions ?? [];
              const filtered = txnSearch.trim()
                ? txns.filter((t: any) => `${t.reference} ${t.type} ${t.status} ${t.note || ""}`.toLowerCase().includes(txnSearch.toLowerCase()))
                : txns;
              return (
                <Card>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-text font-bold text-sm">
                      Recent Transactions ({txns.length})
                      {txnSearch && <span className="ml-2 text-cyan text-xs font-normal">— {filtered.length} matching</span>}
                    </h3>
                  </div>
                  <div className="flex gap-2 mb-3">
                    <div className="relative flex-1">
                      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-textDim" />
                      <input value={txnSearch} onChange={e => setTxnSearch(e.target.value)}
                        placeholder="Filter by reference, type, status..."
                        className="w-full pl-7 pr-3 py-1.5 bg-bg border border-border rounded-lg text-xs text-text placeholder:text-textDim focus:outline-none focus:border-cyan" />
                    </div>
                    {txnSearch && (
                      <button onClick={() => setTxnSearch("")} className="text-textDim hover:text-text px-2">
                        <XCircle size={14} />
                      </button>
                    )}
                  </div>
                  {!txns.length ? (
                    <p className="text-textMuted text-sm text-center py-8">No transactions found</p>
                  ) : (
                    <div className="space-y-2">
                      {filtered.map((t: any) => (
                        <div key={t.id || t.reference}>
                          <div onClick={() => setExpandedTxn(expandedTxn === t.id ? null : t.id)}
                            className="flex items-center gap-3 p-3 bg-bg rounded-xl border border-border cursor-pointer hover:border-cyan/20 transition-colors">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${t.direction === "in" ? "bg-green/10" : "bg-red/10"}`}>
                              <ArrowLeftRight size={13} className={t.direction === "in" ? "text-green" : "text-red"} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <Badge label={t.type} tone={TXN_TONE[t.type] ?? "cyan"} />
                                <span className="font-mono text-[10px] text-textDim truncate">{t.reference}</span>
                              </div>
                              <p className="text-textMuted text-xs mt-0.5">{formatDate(t.created_at)}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className={`font-bold text-sm ${t.direction === "in" ? "text-green" : "text-text"}`}>
                                {t.direction === "in" ? "+" : "-"}{formatZAR(t.amount)}
                              </p>
                              <Badge label={t.status} tone={t.status === "completed" ? "green" : t.status === "failed" ? "red" : "yellow"} />
                            </div>
                            {expandedTxn === t.id ? <ChevronUp size={12} className="text-textDim" /> : <ChevronDown size={12} className="text-textDim" />}
                          </div>
                          {expandedTxn === t.id && (
                            <div className="mx-3 mb-2 p-3 bg-bg2 border border-border border-t-0 rounded-b-xl text-xs space-y-1.5">
                              <div className="flex justify-between">
                                <span className="text-textMuted">Reference</span>
                                <CopyButton value={t.reference} label={t.reference} />
                              </div>
                              {t.note && <div className="flex justify-between"><span className="text-textMuted">Note</span><span className="text-text">{t.note}</span></div>}
                              {t.counterparty_name && <div className="flex justify-between"><span className="text-textMuted">Counterparty</span><span className="text-text">{t.counterparty_name}</span></div>}
                              {t.platform_fee > 0 && <div className="flex justify-between"><span className="text-textMuted">Platform fee</span><span className="text-text">{formatZAR(t.platform_fee)}</span></div>}
                              {/* Quick refund shortcut */}
                              <div className="pt-1.5 border-t border-border">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setRefundTxnId(t.id || t.reference); setRefundAmount(String(t.amount)); setRefundModal(true); }}
                                  className="text-yellow text-[10px] font-bold flex items-center gap-1 hover:text-yellow/80 transition-colors">
                                  <RotateCcw size={10} /> Create refund for this transaction
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })()}

            {/* Withdrawals tab */}
            {activeTab === "withdrawals" && (
              <Card>
                <h3 className="text-text font-bold text-sm mb-4">Withdrawal History</h3>
                {!result.withdrawals?.length ? (
                  <p className="text-textMuted text-sm text-center py-8">No withdrawals found</p>
                ) : (
                  <div className="space-y-2">
                    {result.withdrawals.map((w: any) => (
                      <div key={w.id} className="flex items-center gap-3 p-3 bg-bg rounded-xl border border-border">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-text font-bold text-sm">{formatZAR(w.amount)}</span>
                            <Badge label={w.status} tone={w.status === "approved" || w.status === "paid" ? "green" : w.status === "pending" ? "yellow" : "red"} />
                          </div>
                          <p className="text-textMuted text-xs">{w.bank_name} · ****{w.account_number?.slice(-4)}</p>
                          <p className="text-textDim text-[10px]">{formatDate(w.created_at)}</p>
                        </div>
                        <CopyButton value={w.id} label="Copy ID" />
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {/* Audit trail tab */}
            {activeTab === "audit" && (
              <Card>
                <h3 className="text-text font-bold text-sm mb-4">Admin Actions on This User</h3>
                {!result.audit_logs?.length ? (
                  <p className="text-textMuted text-sm text-center py-8">No admin actions recorded</p>
                ) : (
                  <div className="space-y-2">
                    {result.audit_logs.map((a: any) => (
                      <div key={a.id} className="flex items-start gap-3 p-3 bg-bg rounded-xl border border-border">
                        <div className="w-7 h-7 rounded-full bg-purple/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <ShieldAlert size={13} className="text-purple" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-text font-bold text-xs">{a.action.replace(/_/g, " ")}</p>
                          <p className="text-textMuted text-[10px] mt-0.5">by {a.admin_name || "Admin"} · {formatDate(a.created_at)}</p>
                          {a.metadata && Object.keys(a.metadata).length > 0 && (
                            <p className="text-textDim text-[10px] mt-1 font-mono">{JSON.stringify(a.metadata).slice(0, 100)}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {/* Notes tab */}
            {activeTab === "notes" && (
              <div className="space-y-4">
                <Card>
                  <h3 className="text-text font-bold text-sm mb-3">Add Internal Note</h3>
                  <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
                    placeholder="Add a note visible to all support agents..."
                    rows={3}
                    className="w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-text text-sm focus:outline-none focus:border-cyan resize-none mb-3" />
                  <button onClick={handleSaveNote} disabled={savingNote || !noteText.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-cyan text-bg rounded-lg text-xs font-bold disabled:opacity-50 hover:bg-cyan/90 transition-colors">
                    {savingNote ? <RefreshCw size={12} className="animate-spin" /> : <Bell size={12} />}
                    {savingNote ? "Saving..." : "Save Note"}
                  </button>
                </Card>
                {result.support_notes?.length > 0 && (
                  <Card>
                    <h3 className="text-text font-bold text-sm mb-3">Previous Notes</h3>
                    <div className="space-y-3">
                      {result.support_notes.map((n: any) => (
                        <div key={n.id} className="p-3 bg-bg rounded-xl border border-border">
                          <p className="text-text text-sm">{n.note}</p>
                          <p className="text-textDim text-[10px] mt-1">{n.admin_name} · {formatDate(n.created_at)}</p>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            )}
          </>
        )}

        {!loading && !result && (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-bg2 border border-border flex items-center justify-center mx-auto mb-4">
              <Search size={24} className="text-textDim" />
            </div>
            <p className="text-text font-bold">Look up a user</p>
            <p className="text-textMuted text-sm mt-1">Search by phone number, full name, or user ID</p>
            <div className="flex items-center justify-center gap-4 mt-4 text-textDim text-xs">
              <span>+27821234567</span><span>·</span><span>John Doe</span><span>·</span><span>uuid-...</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Wallet Adjustment Modal ── */}
      <Modal open={adjustModal} onClose={() => setAdjustModal(false)} title="Wallet Adjustment">
        <div className="space-y-4">
          <p className="text-textMuted text-xs">Adjusting wallet for <strong className="text-text">{result?.user?.full_name}</strong></p>
          <div className="flex gap-2">
            <button onClick={() => setAdjustType("credit")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold border transition-all ${adjustType === "credit" ? "bg-green/10 border-green/20 text-green" : "bg-bg text-textMuted border-border"}`}>
              <PlusCircle size={13} /> Credit
            </button>
            <button onClick={() => setAdjustType("debit")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold border transition-all ${adjustType === "debit" ? "bg-red/10 border-red/20 text-red" : "bg-bg text-textMuted border-border"}`}>
              <MinusCircle size={13} /> Debit
            </button>
          </div>
          <div>
            <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest block mb-1.5">Amount (ZAR)</label>
            <Input type="number" min="0.01" step="0.01" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest block mb-1.5">Note (required)</label>
            <Input value={adjustNote} onChange={e => setAdjustNote(e.target.value)} placeholder="Reason for adjustment..." />
          </div>
          <div className="flex items-center gap-2 p-3 bg-yellow/5 border border-yellow/20 rounded-lg">
            <AlertTriangle size={13} className="text-yellow flex-shrink-0" />
            <p className="text-yellow text-xs">Requires Danger PIN. All adjustments are logged.</p>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setAdjustModal(false)}>Cancel</Button>
            <Button
              onClick={handleWalletAdjust} loading={adjusting}
              disabled={!adjustAmount || !adjustNote}
              className={adjustType === "credit" ? "bg-green text-bg hover:bg-green/90" : "bg-red text-white hover:bg-red/90"}>
              {adjustType === "credit" ? "Credit" : "Debit"} Wallet
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Freeze Wallet Modal ── */}
      <Modal open={freezeModal} onClose={() => setFreezeModal(false)} title="Freeze Wallet">
        <div className="space-y-4">
          <p className="text-textMuted text-sm">Freeze the wallet for <strong className="text-text">{result?.user?.full_name}</strong>. The user will be unable to make payments or receive funds.</p>
          <div>
            <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest block mb-1.5">Reason *</label>
            <Input placeholder="e.g. Suspicious activity detected, compliance hold..." value={freezeReason} onChange={e => setFreezeReason(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 p-3 bg-red/5 border border-red/20 rounded-lg">
            <Snowflake size={13} className="text-red flex-shrink-0" />
            <p className="text-red text-xs">Requires Danger PIN confirmation. The reason is logged in the audit trail.</p>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setFreezeModal(false)}>Cancel</Button>
            <Button variant="danger" onClick={confirmFreeze} loading={freezing} disabled={!freezeReason.trim()}>
              <Snowflake size={13} /> Freeze Wallet
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Flag User Modal ── */}
      <Modal open={flagModal} onClose={() => setFlagModal(false)} title="Flag User">
        <div className="space-y-4">
          <p className="text-textMuted text-sm">Flag <strong className="text-text">{result?.user?.full_name}</strong> for review. Flagged users appear in the risk dashboard.</p>
          <div>
            <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest block mb-1.5">Reason *</label>
            <Input placeholder="e.g. Multiple failed payments, reported by driver..." value={flagReason} onChange={e => setFlagReason(e.target.value)} />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setFlagModal(false)}>Cancel</Button>
            <Button variant="danger" onClick={confirmFlag} loading={flagging} disabled={!flagReason.trim()}>
              <Flag size={13} /> Flag User
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Create Refund Modal ── */}
      <Modal open={refundModal} onClose={() => setRefundModal(false)} title="Create Refund Request">
        <div className="space-y-4">
          <p className="text-textMuted text-sm">Create a refund for <strong className="text-text">{result?.user?.full_name}</strong>. The refund will be queued for approval.</p>
          <div>
            <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest block mb-1.5">Transaction ID *</label>
            <Input placeholder="Transaction ID or reference..." value={refundTxnId} onChange={e => setRefundTxnId(e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest block mb-1.5">Amount (ZAR) *</label>
            <Input type="number" step="0.01" min="0.01" placeholder="0.00" value={refundAmount} onChange={e => setRefundAmount(e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest block mb-1.5">Reason *</label>
            <Input placeholder="Reason for refund..." value={refundReason} onChange={e => setRefundReason(e.target.value)} />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setRefundModal(false)}>Cancel</Button>
            <Button onClick={handleCreateRefund} loading={refunding} disabled={!refundTxnId || !refundAmount || !refundReason}>
              <RotateCcw size={13} /> Submit Refund
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Send Notification Modal ── */}
      <Modal open={notifModal} onClose={() => setNotifModal(false)} title={`Notify ${result?.user?.full_name || "User"}`}>
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest block mb-1.5">Type</label>
            <select value={notifType} onChange={e => setNotifType(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-bg3 border border-border text-text text-sm outline-none focus:border-cyan">
              <option value="info">ℹ Info</option>
              <option value="warning">⚠ Warning</option>
              <option value="success">✓ Success</option>
              <option value="error">⚡ Alert</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest block mb-1.5">Title *</label>
            <Input placeholder="Notification title..." value={notifTitle} onChange={e => setNotifTitle(e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest block mb-1.5">Message *</label>
            <textarea value={notifMsg} onChange={e => setNotifMsg(e.target.value)} placeholder="Message to show the user..."
              rows={3} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-text text-sm placeholder:text-textDim focus:outline-none focus:border-cyan resize-none" />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setNotifModal(false)}>Cancel</Button>
            <Button onClick={handleSendNotification} loading={notifying} disabled={!notifTitle || !notifMsg}>
              <Send size={13} /> Send Notification
            </Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
