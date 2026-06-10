"use client";
import { useEffect, useState, useMemo } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Spinner, Modal, Input, StatCard } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  Banknote, Lock, Unlock, PlusCircle, MinusCircle, X,
  Search, Download, RefreshCw, AlertCircle, History,
} from "lucide-react";
import toast from "react-hot-toast";
import { api, WalletEntry, Transaction } from "@/lib/api";
import { DangerPinModal, useDangerPin } from "@/components/DangerPinModal";

type RoleFilter = "all" | "driver" | "passenger" | "owner";

function txTone(type: string) {
  if (["payment", "ride", "topup"].includes(type)) return "green";
  if (["withdrawal", "cashup", "pay_fuel"].includes(type)) return "yellow";
  if (type === "adjustment") return "purple";
  return "cyan";
}

export default function WalletOpsPage() {
  const [allWallets, setAllWallets] = useState<WalletEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterFrozen, setFilterFrozen] = useState<"all" | "frozen" | "active">("all");
  const [filterRole, setFilterRole] = useState<RoleFilter>("all");

  // Modals
  const [selected, setSelected] = useState<WalletEntry | null>(null);
  const [adjustModal, setAdjustModal] = useState(false);
  const [freezeModal, setFreezeModal] = useState(false);
  const [txModal, setTxModal] = useState(false);

  // Adjust form
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustType, setAdjustType] = useState<"credit" | "debit">("credit");

  // Freeze form
  const [freezeReason, setFreezeReason] = useState("");

  // Tx history
  const [txLoading, setTxLoading] = useState(false);
  const [walletTxns, setWalletTxns] = useState<Transaction[]>([]);

  const dangerPin = useDangerPin();

  const load = () => {
    setLoading(true);
    setError(null);
    api.wallets({})
      .then((r) => setAllWallets(r.data))
      .catch((e: Error) => {
        setError(e.message);
        toast.error(`Failed to load wallets: ${e.message}`);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const wallets = useMemo(() => allWallets.filter((w) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      w.full_name.toLowerCase().includes(q) ||
      w.phone_number.includes(q) ||
      w.role.toLowerCase().includes(q);
    const matchesFrozen =
      filterFrozen === "all" ||
      (filterFrozen === "frozen" && w.is_frozen) ||
      (filterFrozen === "active" && !w.is_frozen);
    const matchesRole = filterRole === "all" || w.role === filterRole;
    return matchesSearch && matchesFrozen && matchesRole;
  }), [allWallets, search, filterFrozen, filterRole]);

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

  const openTxHistory = async (w: WalletEntry) => {
    setSelected(w);
    setWalletTxns([]);
    setTxModal(true);
    setTxLoading(true);
    try {
      const res = await api.transactions({ user_id: w.user_id });
      setWalletTxns(res.data.slice(0, 30));
    } catch (e: any) {
      toast.error(`Failed to load transactions: ${e.message}`);
    } finally {
      setTxLoading(false);
    }
  };

  const exportCsv = () => {
    const rows = [
      ["Name", "Phone", "Role", "Balance", "Status", "Freeze Reason", "Last Updated"],
      ...wallets.map((w) => [
        w.full_name, w.phone_number, w.role,
        formatZAR(w.balance),
        w.is_frozen ? "Frozen" : "Active",
        w.frozen_reason || "",
        formatDate(w.updated_at),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "wallets.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${wallets.length} wallets`);
  };

  const totalBalance = allWallets.reduce((s, w) => s + w.balance, 0);
  const frozenList = allWallets.filter((w) => w.is_frozen);
  const frozenBalance = frozenList.reduce((s, w) => s + w.balance, 0);

  const roleCount = (role: string) => allWallets.filter((w) => w.role === role).length;

  return (
    <AdminShell title="Wallet Operations">
      <div className="space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Wallets" value={allWallets.length.toString()} />
          <StatCard label="Total Balance" value={formatZAR(totalBalance)} tone="green" />
          <StatCard
            label="Frozen Wallets"
            value={String(frozenList.length)}
            tone="red"
            sub={frozenList.length > 0 ? `${formatZAR(frozenBalance)} locked` : undefined}
          />
          <StatCard label="Active Wallets" value={String(allWallets.length - frozenList.length)} tone="cyan" />
        </div>

        {frozenList.length > 0 && (
          <div className="flex items-center justify-between p-4 bg-red/5 border border-red/20 rounded-xl">
            <div className="flex items-center gap-3">
              <Lock size={15} className="text-red" />
              <div>
                <p className="text-red text-sm font-bold">{frozenList.length} wallet{frozenList.length !== 1 ? "s" : ""} frozen</p>
                <p className="text-textMuted text-xs">{formatZAR(frozenBalance)} total locked balance</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setFilterFrozen("frozen")}>
                <Lock size={13} /> View Frozen
              </Button>
              <Button variant="danger" onClick={async () => {
                if (!confirm(`Unfreeze all ${frozenList.length} frozen wallets?`)) return;
                const token = await dangerPin.request();
                if (!token) return;
                let done = 0;
                for (const w of frozenList) {
                  try { await api.unfreezeWallet(w.user_id, token); done++; } catch {}
                }
                toast.success(`${done}/${frozenList.length} wallets unfrozen`);
                const r = await api.wallets(); setAllWallets(r.data);
              }}>
                <Unlock size={13} /> Bulk Unfreeze All
              </Button>
            </div>
          </div>
        )}

        <Card>
          {/* Header row */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Banknote size={16} className="text-cyan" />
              <h2 className="text-text font-bold">Wallet Management</h2>
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              {/* Search */}
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-textDim" />
                <input
                  placeholder="Search name, phone, role..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-bg border border-border rounded-lg pl-8 pr-8 py-2 text-text text-sm focus:outline-none focus:border-cyan placeholder:text-textDim w-56"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-textDim hover:text-text"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Status filter */}
              <div className="flex gap-1">
                {(["all", "active", "frozen"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilterFrozen(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all capitalize ${
                      filterFrozen === f
                        ? f === "frozen"
                          ? "bg-red/10 text-red border-red/20"
                          : "bg-cyanDim text-cyan border-cyan/20"
                        : "bg-bg3 text-textMuted border-border hover:text-text"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>

              <Button variant="secondary" onClick={load} title="Refresh">
                <RefreshCw size={13} /> Refresh
              </Button>
              <Button variant="secondary" onClick={exportCsv} disabled={wallets.length === 0}>
                <Download size={13} /> Export CSV
              </Button>
            </div>
          </div>

          {/* Role tabs */}
          <div className="flex gap-1 mb-4 border-b border-border pb-3 flex-wrap">
            {([
              { value: "all", label: `All (${allWallets.length})` },
              { value: "driver", label: `Drivers (${roleCount("driver")})` },
              { value: "passenger", label: `Passengers (${roleCount("passenger")})` },
              { value: "owner", label: `Owners (${roleCount("owner")})` },
            ] as { value: RoleFilter; label: string }[]).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setFilterRole(value)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                  filterRole === value
                    ? "bg-cyanDim text-cyan border-cyan/20"
                    : "bg-bg3 text-textMuted border-border hover:text-text"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <p className="text-xs text-textMuted mb-3">
            {loading
              ? "Loading…"
              : `${wallets.length} of ${allWallets.length} wallet${allWallets.length !== 1 ? "s" : ""}`}
          </p>

          {loading ? (
            <Spinner />
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-14 text-center">
              <AlertCircle size={28} className="text-red" />
              <p className="text-red font-semibold text-sm">{error}</p>
              <p className="text-textMuted text-xs max-w-xs">
                This usually means the admin account lacks <code className="text-textDim">manage_users</code> or{" "}
                <code className="text-textDim">freeze_wallet</code> permission.
              </p>
              <Button variant="secondary" onClick={load}>
                <RefreshCw size={13} /> Retry
              </Button>
            </div>
          ) : wallets.length === 0 ? (
            <div className="py-14 text-center text-textMuted">
              <p className="text-sm font-medium">No wallets found</p>
              <p className="text-xs mt-1">
                {search || filterFrozen !== "all" || filterRole !== "all"
                  ? "Try adjusting your filters"
                  : "No wallets exist yet"}
              </p>
            </div>
          ) : (
            <Table
              headers={["User", "Role", "Balance", "Status", "Last Updated", "Actions"]}
              empty={false}
            >
              {wallets.map((w) => (
                <Tr key={w.user_id}>
                  <Td>
                    <p className="font-semibold">{w.full_name}</p>
                    <p className="text-[10px] text-textMuted font-mono">{w.phone_number}</p>
                  </Td>
                  <Td>
                    <Badge
                      label={w.role}
                      tone={w.role === "driver" ? "green" : w.role === "owner" ? "purple" : "cyan"}
                    />
                  </Td>
                  <Td
                    className={`font-bold text-lg ${
                      w.is_frozen ? "text-textMuted line-through" : "text-green"
                    }`}
                  >
                    {formatZAR(w.balance)}
                  </Td>
                  <Td>
                    {w.is_frozen ? (
                      <div>
                        <Badge label="frozen" tone="red" />
                        {w.frozen_reason && (
                          <p
                            className="text-[10px] text-textMuted mt-0.5 max-w-[150px] truncate"
                            title={w.frozen_reason}
                          >
                            {w.frozen_reason}
                          </p>
                        )}
                      </div>
                    ) : (
                      <Badge label="active" tone="green" />
                    )}
                  </Td>
                  <Td className="text-textMuted text-xs">{formatDate(w.updated_at)}</Td>
                  <Td>
                    <div className="flex gap-1.5">
                      <Button
                        variant="ghost"
                        onClick={() => openTxHistory(w)}
                        title="View transaction history"
                      >
                        <History size={13} />
                      </Button>
                      <Button
                        variant={w.is_frozen ? "secondary" : "ghost"}
                        onClick={() => toggleFreeze(w)}
                        title={w.is_frozen ? "Unfreeze wallet" : "Freeze wallet"}
                      >
                        {w.is_frozen ? (
                          <Unlock size={13} />
                        ) : (
                          <Lock size={13} className="text-red" />
                        )}
                        {w.is_frozen ? "Unfreeze" : "Freeze"}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setSelected(w);
                          setAdjustModal(true);
                          setAdjustAmount("");
                          setAdjustNote("");
                          setAdjustType("credit");
                        }}
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

      {/* Freeze modal */}
      <Modal
        open={freezeModal}
        onClose={() => setFreezeModal(false)}
        title={`Freeze ${selected?.full_name}'s Wallet`}
      >
        <div className="space-y-4">
          <p className="text-sm text-textMuted">
            This will prevent all transactions on the wallet until unfrozen.
          </p>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
              Freeze Reason *
            </label>
            <Input
              placeholder="Suspicious activity, compliance hold..."
              value={freezeReason}
              onChange={(e) => setFreezeReason(e.target.value)}
            />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setFreezeModal(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmFreeze}>
              <Lock size={13} /> Freeze Wallet
            </Button>
          </div>
        </div>
      </Modal>

      {/* Adjust modal */}
      <Modal
        open={adjustModal}
        onClose={() => setAdjustModal(false)}
        title={`Adjust Wallet — ${selected?.full_name}`}
      >
        <div className="space-y-4">
          <p className="text-sm text-textMuted">
            Current balance:{" "}
            <span className="text-green font-bold">
              {selected && formatZAR(selected.balance)}
            </span>
          </p>
          <div className="flex gap-3">
            {(["credit", "debit"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setAdjustType(t)}
                className={`flex-1 py-2 rounded-lg border text-sm font-bold capitalize transition-all ${
                  adjustType === t
                    ? t === "credit"
                      ? "bg-green/10 text-green border-green/20"
                      : "bg-red/10 text-red border-red/20"
                    : "bg-bg3 text-textMuted border-border"
                }`}
              >
                {t === "credit" ? (
                  <PlusCircle size={14} className="inline mr-1" />
                ) : (
                  <MinusCircle size={14} className="inline mr-1" />
                )}
                {t}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
              Amount (ZAR) *
            </label>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={adjustAmount}
              onChange={(e) => setAdjustAmount(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
              Reason *
            </label>
            <Input
              placeholder="Reason for adjustment..."
              value={adjustNote}
              onChange={(e) => setAdjustNote(e.target.value)}
            />
          </div>
          {adjustType === "debit" && adjustAmount && parseFloat(adjustAmount) > (selected?.balance ?? 0) && (
            <p className="text-xs text-red flex items-center gap-1.5">
              <AlertCircle size={12} />
              Amount exceeds current balance ({formatZAR(selected?.balance ?? 0)})
            </p>
          )}
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setAdjustModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdjust}>
              {adjustType === "credit" ? (
                <PlusCircle size={13} />
              ) : (
                <MinusCircle size={13} />
              )}
              {adjustType === "credit" ? "Credit" : "Debit"} Wallet
            </Button>
          </div>
        </div>
      </Modal>

      {/* Transaction history modal */}
      <Modal
        open={txModal}
        onClose={() => setTxModal(false)}
        title={`Transactions — ${selected?.full_name}`}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-textMuted">Last 30 transactions</p>
            {selected && (
              <span className="text-xs font-bold text-green">{formatZAR(selected.balance)} balance</span>
            )}
          </div>
          {txLoading ? (
            <Spinner />
          ) : walletTxns.length === 0 ? (
            <p className="text-center text-textMuted text-sm py-8">No transactions found</p>
          ) : (
            <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
              {walletTxns.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between bg-bg3 rounded-lg px-3 py-2.5 gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge label={t.type} tone={txTone(t.type)} />
                      <span className="text-[10px] font-mono text-textDim truncate">{t.reference}</span>
                    </div>
                    {t.note && (
                      <p className="text-[10px] text-textMuted mt-0.5 truncate">{t.note}</p>
                    )}
                    <p className="text-[10px] text-textDim mt-0.5">{formatDate(t.created_at)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={`font-bold text-sm ${
                        t.status === "completed" ? "text-green" : "text-textMuted"
                      }`}
                    >
                      {formatZAR(t.amount)}
                    </p>
                    <Badge
                      label={t.status}
                      tone={
                        t.status === "completed" ? "green" : t.status === "pending" ? "yellow" : "red"
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end pt-1 border-t border-border">
            <Button variant="secondary" onClick={() => setTxModal(false)}>
              Close
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
