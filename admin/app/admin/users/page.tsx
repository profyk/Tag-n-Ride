"use client";
import { useState, useEffect } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Table, Tr, Td, Badge, Button, Spinner, Input, Modal, Select } from "@/components/ui";
import { api, User, hasPermission, isSuperAdmin } from "@/lib/api";
import { formatDate, roleBadgeColor } from "@/lib/utils";
import { Search, Flag, ShieldOff, ShieldCheck, Key, Trash2, Copy, Download, X, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import { DangerPinModal, useDangerPin } from "@/components/DangerPinModal";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = (dangerToken?: string) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
  ...(dangerToken ? { "X-Danger-Token": dangerToken } : {}),
});

const FLAG_PRESETS = [
  "Suspicious transaction pattern",
  "Multiple failed PIN attempts",
  "Reported by another user",
  "Potential fraudulent activity",
  "Account sharing suspected",
  "Velocity limit exceeded",
];

const BLOCK_REASONS = [
  "Fraudulent activity confirmed",
  "Chargeback filed",
  "Terms of service violation",
  "Failed identity verification",
  "Unresolved dispute",
];

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [flagModal, setFlagModal] = useState<User | null>(null);
  const [flagReason, setFlagReason] = useState("");
  const [blockModal, setBlockModal] = useState<User | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBlocking, setBulkBlocking] = useState(false);
  const [pinModal, setPinModal] = useState<{ name: string; pin: string } | null>(null);
  const [unblockTarget, setUnblockTarget] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [bulkBlockConfirm, setBulkBlockConfirm] = useState(false);
  const superAdmin = isSuperAdmin();
  const dangerPin = useDangerPin();

  const load = (q?: string) => {
    setLoading(true);
    api.users(q).then((r) => setUsers(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleBlock = async () => {
    if (!blockModal) return;
    const u = blockModal;
    try {
      await api.blockUser(u.id, blockReason || undefined);
      toast.success(`${u.full_name} blocked`);
      setBlockModal(null); setBlockReason("");
      load(query);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleUnblock = (u: User) => { setUnblockTarget(u); };
  const confirmUnblock = async () => {
    if (!unblockTarget) return;
    const u = unblockTarget; setUnblockTarget(null);
    try {
      await api.unblockUser(u.id);
      toast.success(`${u.full_name} unblocked`);
      load(query);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleResetPin = async (u: User) => {
    try {
      const res = await api.resetPin(u.id);
      setPinModal({ name: u.full_name, pin: res.data.temporary_pin });
      load(query);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleFlag = async () => {
    if (!flagModal || !flagReason.trim()) return;
    try {
      await api.flagUser(flagModal.id, flagReason.trim());
      toast.success(`${flagModal.full_name} flagged`);
      setFlagModal(null); setFlagReason("");
      load(query);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleUnflag = async (u: User) => {
    try { await api.unflagUser(u.id); toast.success("Account unflagged"); load(query); }
    catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = (u: User) => { setDeleteTarget(u); };
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const u = deleteTarget; setDeleteTarget(null);
    const token = await dangerPin.request();
    if (!token) return;
    try {
      const res = await fetch(`${BASE}/api/admin/users/${u.id}`, { method: "DELETE", headers: authHeaders(token) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Delete failed");
      toast.success(`${u.full_name} deleted`);
      load(query);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleBulkBlock = () => { setBulkBlockConfirm(true); };
  const confirmBulkBlock = async () => {
    setBulkBlockConfirm(false);
    setBulkBlocking(true);
    let done = 0;
    for (const id of Array.from(selectedIds)) {
      try { await api.blockUser(id, "Bulk block action"); done++; } catch {}
    }
    toast.success(`${done} user${done !== 1 ? "s" : ""} blocked`);
    setSelectedIds(new Set());
    setBulkBlocking(false);
    load();
  };

  const doSearch = () => { setQuery(search); load(search); };
  const clearAll = () => { setSearch(""); setQuery(""); setRoleFilter(""); setStatusFilter(""); load(""); };

  const filtered = users.filter((u: any) => {
    if (roleFilter && u.role !== roleFilter) return false;
    if (statusFilter === "active" && !u.is_active) return false;
    if (statusFilter === "blocked" && u.is_active) return false;
    if (statusFilter === "flagged" && !u.flagged) return false;
    return true;
  });

  return (
    <AdminShell title="User Management">
      <div className="space-y-4">

        {/* Search + filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="flex gap-2 flex-1 min-w-0">
            <Input
              placeholder="Search by phone or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
            />
            <Button onClick={doSearch}><Search size={13} /> Search</Button>
          </div>
          <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="w-36">
            <option value="">All roles</option>
            <option value="passenger">Passenger</option>
            <option value="driver">Driver</option>
            <option value="owner">Owner</option>
          </Select>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-36">
            <option value="">All status</option>
            <option value="active">Active</option>
            <option value="blocked">Blocked</option>
            <option value="flagged">Flagged</option>
          </Select>
          {(query || roleFilter || statusFilter) && (
            <Button variant="ghost" onClick={clearAll}><X size={13} /> Clear</Button>
          )}
        </div>

        {/* Results bar + bulk actions */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-textMuted">
            {loading ? "Loading…" : `${filtered.length} user${filtered.length !== 1 ? "s" : ""}${query ? ` matching "${query}"` : ""}`}
            {selectedIds.size > 0 && <span className="ml-2 text-cyan font-bold">{selectedIds.size} selected</span>}
          </p>
          <div className="flex gap-2 items-center flex-wrap">
            {selectedIds.size > 0 && (
              <>
                <Button variant="danger" loading={bulkBlocking} onClick={handleBulkBlock}>
                  <ShieldOff size={13} /> Block {selectedIds.size}
                </Button>
                <Button variant="ghost" onClick={() => setSelectedIds(new Set())}><X size={13} /> Clear</Button>
              </>
            )}
            <Button variant="secondary" onClick={() => api.exportUsers()}>
              <Download size={13} /> Export CSV
            </Button>
          </div>
        </div>

        {loading ? <Spinner /> : (
          <Table
            headers={[
              <input key="chk-all" type="checkbox" className="w-3.5 h-3.5 accent-cyan"
                checked={filtered.length > 0 && filtered.every(u => selectedIds.has(u.id))}
                onChange={() => {
                  if (filtered.every(u => selectedIds.has(u.id))) setSelectedIds(new Set());
                  else setSelectedIds(new Set(filtered.map(u => u.id)));
                }} />,
              "Name", "Phone", "Role", "Status", "Joined", "Actions"
            ]}
            empty={!filtered.length}
          >
            {filtered.map((u: any) => (
              <Tr key={u.id}>
                <Td>
                  <input type="checkbox" className="w-3.5 h-3.5 accent-cyan"
                    checked={selectedIds.has(u.id)}
                    onChange={() => setSelectedIds(prev => {
                      const next = new Set(prev);
                      next.has(u.id) ? next.delete(u.id) : next.add(u.id);
                      return next;
                    })} />
                </Td>
                <Td>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold">{u.full_name}</span>
                    {u.flagged && (
                      <span className="text-[10px] text-red font-bold">⚑ FLAGGED</span>
                    )}
                  </div>
                  <p className="text-[10px] text-textDim font-mono">{u.id.slice(0, 8)}…</p>
                </Td>
                <Td className="font-mono text-xs text-textMuted">{u.phone_number}</Td>
                <Td>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${roleBadgeColor(u.role)}`}>
                    {u.role}
                  </span>
                </Td>
                <Td>
                  <Badge label={u.is_active ? "Active" : "Blocked"} tone={u.is_active ? "green" : "red"} />
                </Td>
                <Td className="text-textMuted text-xs">{formatDate(u.created_at)}</Td>
                <Td>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Button
                      variant={u.is_active ? "danger" : "secondary"}
                      onClick={() => {
                        if (u.is_active) setBlockModal(u);
                        else handleUnblock(u);
                      }}
                    >
                      {u.is_active ? <><ShieldOff size={12} /> Block</> : <><ShieldCheck size={12} /> Unblock</>}
                    </Button>
                    <Button variant="secondary" onClick={() => handleResetPin(u)}>
                      <Key size={12} /> PIN
                    </Button>
                    {u.flagged ? (
                      <Button variant="ghost" onClick={() => handleUnflag(u)}>
                        <Flag size={12} /> Unflag
                      </Button>
                    ) : (
                      <Button variant="ghost" onClick={() => setFlagModal(u)}>
                        <Flag size={12} /> Flag
                      </Button>
                    )}
                    {superAdmin && (
                      <Button variant="danger" onClick={() => handleDelete(u)}>
                        <Trash2 size={12} />
                      </Button>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </div>

      {/* Block Modal with reason */}
      <Modal open={!!blockModal} onClose={() => { setBlockModal(null); setBlockReason(""); }} title={`Block ${blockModal?.full_name}`}>
        <div className="space-y-4">
          <p className="text-textMuted text-sm">Select a reason for blocking this account.</p>
          <div className="flex flex-wrap gap-2">
            {BLOCK_REASONS.map((r) => (
              <button
                key={r}
                onClick={() => setBlockReason(r)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${blockReason === r ? "bg-red/10 text-red border-red/20" : "text-textMuted border-border hover:border-red/30"}`}
              >
                {r}
              </button>
            ))}
          </div>
          <Input placeholder="Or type a custom reason..." value={blockReason} onChange={(e) => setBlockReason(e.target.value)} />
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => { setBlockModal(null); setBlockReason(""); }}>Cancel</Button>
            <Button variant="danger" onClick={handleBlock}><ShieldOff size={12} /> Block Account</Button>
          </div>
        </div>
      </Modal>

      {/* Flag Modal with presets */}
      <Modal open={!!flagModal} onClose={() => { setFlagModal(null); setFlagReason(""); }} title={`Flag ${flagModal?.full_name}`}>
        <div className="space-y-4">
          <p className="text-textMuted text-sm">Select a preset or enter a custom reason.</p>
          <div className="flex flex-wrap gap-2">
            {FLAG_PRESETS.map((preset) => (
              <button
                key={preset}
                onClick={() => setFlagReason(preset)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${flagReason === preset ? "bg-yellow/10 text-yellow border-yellow/20" : "text-textMuted border-border hover:border-yellow/30"}`}
              >
                {preset}
              </button>
            ))}
          </div>
          <Input placeholder="Custom reason..." value={flagReason} onChange={(e) => setFlagReason(e.target.value)} />
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => { setFlagModal(null); setFlagReason(""); }}>Cancel</Button>
            <Button variant="danger" onClick={handleFlag}><Flag size={12} /> Flag Account</Button>
          </div>
        </div>
      </Modal>

      {/* PIN Modal with copy */}
      <Modal open={!!pinModal} onClose={() => setPinModal(null)} title="Temporary PIN">
        <div className="space-y-4">
          <p className="text-textMuted text-sm">
            Share this temporary PIN with <strong className="text-text">{pinModal?.name}</strong>.
            They must change it immediately after logging in.
          </p>
          <div className="bg-bg border border-cyan/20 rounded-xl p-5 text-center relative">
            <span className="text-cyan font-mono text-4xl font-black tracking-[0.5em]">
              {pinModal?.pin}
            </span>
          </div>
          <div className="flex gap-3">
            <Button
              className="flex-1 justify-center"
              onClick={() => { navigator.clipboard.writeText(pinModal?.pin || ""); toast.success("PIN copied!"); }}
            >
              <Copy size={13} /> Copy PIN
            </Button>
            <Button variant="secondary" className="flex-1 justify-center" onClick={() => setPinModal(null)}>
              Done
            </Button>
          </div>
          <p className="text-xs text-red text-center font-semibold">This PIN is shown only once.</p>
        </div>
      </Modal>

      {/* Unblock Confirmation Modal */}
      <Modal open={!!unblockTarget} onClose={() => setUnblockTarget(null)} title={`Unblock ${unblockTarget?.full_name}`}>
        <div className="space-y-4">
          <p className="text-textMuted text-sm">This will restore full platform access. The user will be able to log in and transact again.</p>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setUnblockTarget(null)}>Cancel</Button>
            <Button onClick={confirmUnblock}><ShieldCheck size={12} /> Unblock Account</Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title={`Delete ${deleteTarget?.full_name}`}>
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red/5 border border-red/20 rounded-xl">
            <AlertTriangle size={15} className="text-red flex-shrink-0 mt-0.5" />
            <p className="text-red text-sm">This action is <strong>permanent and irreversible</strong>. All user data, wallet balance, and history will be deleted. You will be required to enter your Danger PIN to proceed.</p>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={confirmDelete}><Trash2 size={12} /> Delete Account</Button>
          </div>
        </div>
      </Modal>

      {/* Bulk Block Confirmation Modal */}
      <Modal open={bulkBlockConfirm} onClose={() => setBulkBlockConfirm(false)} title={`Block ${selectedIds.size} Users`}>
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red/5 border border-red/20 rounded-xl">
            <AlertTriangle size={15} className="text-red flex-shrink-0 mt-0.5" />
            <p className="text-red text-sm">You are about to block <strong>{selectedIds.size} user{selectedIds.size !== 1 ? "s" : ""}</strong>. They will immediately lose access to the platform.</p>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setBulkBlockConfirm(false)}>Cancel</Button>
            <Button variant="danger" onClick={confirmBulkBlock} loading={bulkBlocking}><ShieldOff size={12} /> Block {selectedIds.size} Users</Button>
          </div>
        </div>
      </Modal>

      <DangerPinModal
        open={dangerPin.open}
        onSuccess={dangerPin.handleSuccess}
        onCancel={dangerPin.handleCancel}
        actionLabel="delete this user"
      />
    </AdminShell>
  );
}
