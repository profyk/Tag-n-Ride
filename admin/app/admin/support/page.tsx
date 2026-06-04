"use client";
import { useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Spinner, Badge } from "@/components/ui";
import { api, hasPermission } from "@/lib/api";
import { DangerPinModal, useDangerPin } from "@/components/DangerPinModal";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  Search, Key, Snowflake, Copy, CheckCircle, User,
  Wallet, ArrowLeftRight, ShieldAlert, Bell, FileText,
  Phone, Calendar, Shield, AlertTriangle, RefreshCw,
  XCircle, Flag, Unlock, ChevronDown, ChevronUp,
  MessageCircle, PlusCircle, MinusCircle, ExternalLink,
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
};export default function SupportPage() {
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
  const [adjustModal, setAdjustModal] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustType, setAdjustType] = useState<"credit" | "debit">("credit");
  const [adjusting, setAdjusting] = useState(false);

  const canManage = hasPermission("manage_users");
  const canFreeze = hasPermission("freeze_wallet");
  const canReset = hasPermission("reset_pin");
  const { open: pinOpen, request: requestPin, handleSuccess: pinSuccess, handleCancel: pinCancel } = useDangerPin();

  // Pre-fill from ?q= param (e.g. deep-linked from Risk page)
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

  const handleFreeze = async () => {
    if (!result?.user?.id) return;
    const isFrozen = result.wallet?.is_frozen;
    const token = await requestPin();
    if (!token) return;
    setActionLoading("freeze");
    try {
      if (isFrozen) {
        await api.unfreezeWallet(result.user.id);
        toast.success("Wallet unfrozen");
      } else {
        const reason = prompt(`Freeze reason for ${result.user.full_name} (required):`);
        if (!reason?.trim()) { setActionLoading(null); return; }
        await api.freezeWallet(result.user.id, reason.trim());
        toast.success("Wallet frozen");
      }
      handleSearch();
    } catch (e: any) { toast.error(e.message); }
    finally { setActionLoading(null); }
  };

  const handleFlag = async () => {
    if (!result?.user?.id) return;
    const isFlagged = result.user.flagged;
    if (!confirm(`${isFlagged ? "Unflag" : "Flag"} ${result.user.full_name}?`)) return;
    setActionLoading("flag");
    try {
      if (isFlagged) {
        await api.unflagUser(result.user.id);
        toast.success("User unflagged");
      } else {
        const reason = prompt("Reason for flagging:");
        if (!reason) { setActionLoading(null); return; }
        await api.flagUser(result.user.id, reason);
        toast.success("User flagged");
      }
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
    const token = await requestPin();
    if (!token) return;
    setAdjusting(true);
    try {
      const res = await fetch(`${BASE}/api/admin/wallets/${result.user.id}/adjust`, {
        method: "POST",
        headers: { ...authHeaders(), "X-Danger-Token": token },
        body: JSON.stringify({ amount: adjustType === "credit" ? amt : -amt, note: adjustNote || `Support ${adjustType}` }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Adjustment failed");
      toast.success(`Wallet ${adjustType === "credit" ? "credited" : "debited"} ${formatZAR(amt)}`);
      setAdjustModal(false); setAdjustAmount(""); setAdjustNote("");
      handleSearch();
    } catch (e: any) { toast.error(e.message); }
    finally { setAdjusting(false); }
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
      <DangerPinModal open={pinOpen} onSuccess={pinSuccess} onCancel={pinCancel} actionLabel="wallet freeze/unfreeze" />
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

              <div className="flex gap-2 mt-4 flex-wrap">
                {/* WhatsApp shortcut */}
                <a
                  href={`/admin/whatsapp-support?phone=${encodeURIComponent(result.user.phone_number)}`}
                  target="_blank"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green/10 border border-green/20 rounded-lg text-green text-xs font-bold hover:bg-green/20 transition-colors">
                  <MessageCircle size={12} /> WhatsApp
                </a>
                {/* Wallet adjustment */}
                {canFreeze && (
                  <button onClick={() => setAdjustModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple/10 border border-purple/20 rounded-lg text-purple text-xs font-bold hover:bg-purple/20 transition-colors">
                    <Wallet size={12} /> Adjust Wallet
                  </button>
                )}
                {canReset && (
                  <button onClick={handleResetPin} disabled={actionLoading === "pin"}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple/10 border border-purple/20 rounded-lg text-purple text-xs font-bold hover:bg-purple/20 transition-colors disabled:opacity-50">
                    <Key size={12} />
                    {actionLoading === "pin" ? "Resetting..." : "Reset PIN"}
                  </button>
                )}
                {canFreeze && (
                  <button onClick={handleFreeze} disabled={actionLoading === "freeze"}
                    className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-bold transition-colors disabled:opacity-50 ${
                      result.wallet?.is_frozen
                        ? "bg-green/10 border-green/20 text-green hover:bg-green/20"
                        : "bg-cyan/10 border-cyan/20 text-cyan hover:bg-cyan/20"}`}>
                    {result.wallet?.is_frozen
                      ? <><Unlock size={12} /> Unfreeze Wallet</>
                      : <><Snowflake size={12} /> Freeze Wallet</>}
                  </button>
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
                  <button onClick={handleFlag} disabled={actionLoading === "flag"}
                    className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-bold transition-colors disabled:opacity-50 ${
                      result.user.flagged
                        ? "bg-green/10 border-green/20 text-green hover:bg-green/20"
                        : "bg-yellow/10 border-yellow/20 text-yellow hover:bg-yellow/20"}`}>
                    <Flag size={12} />
                    {result.user.flagged ? "Unflag" : "Flag User"}
                  </button>
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
            </Card><div className="flex gap-1 border-b border-border overflow-x-auto">
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
                {result.outstanding_balance > 0 && (
                  <div className="flex items-center gap-3 p-4 bg-yellow/5 border border-yellow/20 rounded-xl">
                    <AlertTriangle size={16} className="text-yellow" />
                    <div>
                      <p className="text-yellow font-bold text-sm">Outstanding Balance</p>
                      <p className="text-yellow/70 text-xs">Driver owes {formatZAR(result.outstanding_balance)} to fleet owner</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "transactions" && (() => {
              const txns: any[] = result.recent_transactions ?? [];
              const filtered = txnSearch.trim()
                ? txns.filter((t: any) => {
                    const q = txnSearch.toLowerCase();
                    return `${t.reference} ${t.type} ${t.status} ${t.note || ""}`.toLowerCase().includes(q);
                  })
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
                    <input
                      value={txnSearch}
                      onChange={e => setTxnSearch(e.target.value)}
                      placeholder="Filter by reference, type, status..."
                      className="w-full pl-7 pr-3 py-1.5 bg-bg border border-border rounded-lg text-xs text-text placeholder:text-textDim focus:outline-none focus:border-cyan"
                    />
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
                            <Badge
                              label={t.status}
                              tone={t.status === "completed" ? "green" : t.status === "failed" ? "red" : "yellow"}
                            />
                          </div>
                          {expandedTxn === t.id
                            ? <ChevronUp size={12} className="text-textDim" />
                            : <ChevronDown size={12} className="text-textDim" />}
                        </div>
                        {expandedTxn === t.id && (
                          <div className="mx-3 mb-2 p-3 bg-bg2 border border-border border-t-0 rounded-b-xl text-xs space-y-1.5">
                            <div className="flex justify-between">
                              <span className="text-textMuted">Reference</span>
                              <CopyButton value={t.reference} label={t.reference} />
                            </div>
                            {t.note && (
                              <div className="flex justify-between">
                                <span className="text-textMuted">Note</span>
                                <span className="text-text">{t.note}</span>
                              </div>
                            )}
                            {t.counterparty_name && (
                              <div className="flex justify-between">
                                <span className="text-textMuted">Counterparty</span>
                                <span className="text-text">{t.counterparty_name}</span>
                              </div>
                            )}
                            {t.platform_fee > 0 && (
                              <div className="flex justify-between">
                                <span className="text-textMuted">Platform fee</span>
                                <span className="text-text">{formatZAR(t.platform_fee)}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
              );
            })()}
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
                            <Badge
                              label={w.status}
                              tone={w.status === "approved" || w.status === "paid" ? "green" : w.status === "pending" ? "yellow" : "red"}
                            />
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
                          <p className="text-textMuted text-[10px] mt-0.5">
                            by {a.admin_name || "Admin"} · {formatDate(a.created_at)}
                          </p>
                          {a.metadata && Object.keys(a.metadata).length > 0 && (
                            <p className="text-textDim text-[10px] mt-1 font-mono">
                              {JSON.stringify(a.metadata).slice(0, 100)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

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
                          <p className="text-textDim text-[10px] mt-1">
                            {n.admin_name} · {formatDate(n.created_at)}
                          </p>
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
              <span>+27821234567</span>
              <span>·</span>
              <span>John Doe</span>
              <span>·</span>
              <span>uuid-...</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Wallet Adjustment Modal ── */}
      {adjustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-bg2 border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-text font-extrabold">Wallet Adjustment</h2>
              <button onClick={() => setAdjustModal(false)} className="text-textDim hover:text-text">
                <XCircle size={18} />
              </button>
            </div>
            <p className="text-textMuted text-xs">Adjusting wallet for <strong className="text-text">{result?.user?.full_name}</strong></p>

            {/* Credit / Debit toggle */}
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
              <input
                type="number" min="0.01" step="0.01"
                value={adjustAmount}
                onChange={e => setAdjustAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-text text-sm focus:outline-none focus:border-cyan"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest block mb-1.5">Note (required)</label>
              <input
                value={adjustNote}
                onChange={e => setAdjustNote(e.target.value)}
                placeholder="Reason for adjustment..."
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-text text-sm focus:outline-none focus:border-cyan"
              />
            </div>

            <div className="flex items-center gap-3 p-3 bg-yellow/5 border border-yellow/20 rounded-lg">
              <AlertTriangle size={13} className="text-yellow flex-shrink-0" />
              <p className="text-yellow text-xs">Requires Danger PIN. All adjustments are logged in the audit trail.</p>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setAdjustModal(false)} className="flex-1 py-2.5 rounded-lg border border-border text-textMuted text-sm font-bold hover:bg-bg3 transition-colors">Cancel</button>
              <button
                onClick={handleWalletAdjust}
                disabled={adjusting || !adjustAmount || !adjustNote}
                className={`flex-1 py-2.5 rounded-lg text-white text-sm font-bold disabled:opacity-50 transition-colors ${adjustType === "credit" ? "bg-green hover:bg-green/90" : "bg-red hover:bg-red/90"}`}>
                {adjusting ? "Processing…" : `${adjustType === "credit" ? "Credit" : "Debit"} Wallet`}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
