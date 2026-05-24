"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Spinner, Badge } from "@/components/ui";
import { hasPermission } from "@/lib/api";
import { useRouter } from "next/navigation";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  Plus, RefreshCw, Wallet, Trash2, CheckCircle,
  AlertTriangle, User, Car, Users, FlaskConical, Shield,
} from "lucide-react";
import toast from "react-hot-toast";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

const ROLE_ICONS: Record<string, any> = {
  passenger: User, driver: Car, owner: Users,
};
const ROLE_COLORS: Record<string, string> = {
  passenger: "text-cyan", driver: "text-green", owner: "text-purple",
};export default function TestUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [fundingId, setFundingId] = useState<string | null>(null);
  const [fundAmount, setFundAmount] = useState("100");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({
    full_name: "", role: "passenger", initial_balance: 100,
  });
  const [createdResult, setCreatedResult] = useState<any>(null);

  useEffect(() => {
    if (!hasPermission("manage_test_users")) {
      router.push("/admin/dashboard");
      return;
    }
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/admin/test-users`, { headers: authHeaders() });
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleCreate = async () => {
    if (!newUser.full_name.trim()) { toast.error("Name required"); return; }
    setCreating(true);
    try {
      const res = await fetch(`${BASE}/api/admin/test-users/create`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify(newUser),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed");
      setCreatedResult(data);
      setShowCreate(false);
      setNewUser({ full_name: "", role: "passenger", initial_balance: 100 });
      toast.success(`Test ${data.role} created!`);
      loadUsers();
    } catch (e: any) { toast.error(e.message); }
    finally { setCreating(false); }
  };

  const handleFund = async (userId: string) => {
    const amount = parseFloat(fundAmount);
    if (!amount || amount <= 0) { toast.error("Enter valid amount"); return; }
    try {
      const res = await fetch(`${BASE}/api/admin/test-users/${userId}/fund`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed");
      toast.success(`R${amount} added to wallet`);
      setFundingId(null);
      setFundAmount("100");
      loadUsers();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async (userId: string, name: string) => {
    if (!confirm(`Delete test user "${name}"? This cannot be undone.`)) return;
    setDeletingId(userId);
    try {
      const res = await fetch(`${BASE}/api/admin/test-users/${userId}`, {
        method: "DELETE", headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed");
      toast.success(`${name} deleted`);
      loadUsers();
    } catch (e: any) { toast.error(e.message); }
    finally { setDeletingId(null); }
  };return (
    <AdminShell title="Test Users">
      <div className="space-y-6 max-w-4xl">

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 p-4 bg-purple/5 border border-purple/20 rounded-xl flex-1">
            <FlaskConical size={18} className="text-purple flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-purple font-bold text-sm">Test Accounts — Safe in Production</p>
              <p className="text-purple/70 text-xs mt-1">
                Test users can log into the mobile app normally. Their transactions are excluded
                from all financial reports and reconciliation. Max R5,000 wallet funding per day.
              </p>
            </div>
          </div>
          <button onClick={() => setShowCreate(v => !v)}
            className="flex items-center gap-2 px-4 py-3 bg-cyan text-bg rounded-xl text-sm font-bold hover:bg-cyan/90 transition-all flex-shrink-0">
            <Plus size={14} />
            New Test User
          </button>
        </div>

        {showCreate && (
          <Card>
            <h3 className="text-text font-bold mb-4">Create Test User</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1 block">Full Name</label>
                <input value={newUser.full_name}
                  onChange={e => setNewUser(p => ({ ...p, full_name: e.target.value }))}
                  placeholder="Test Passenger 1"
                  className="w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-text text-sm focus:outline-none focus:border-cyan" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1 block">Role</label>
                <select value={newUser.role}
                  onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}
                  className="w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-text text-sm focus:outline-none focus:border-cyan">
                  <option value="passenger">Passenger</option>
                  <option value="driver">Driver</option>
                  <option value="owner">Fleet Owner</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1 block">Initial Balance (R)</label>
                <input type="number" min="0" max="5000"
                  value={newUser.initial_balance}
                  onChange={e => setNewUser(p => ({ ...p, initial_balance: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-text text-sm focus:outline-none focus:border-cyan" />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowCreate(false)}
                className="px-4 py-2 bg-bg3 border border-border rounded-xl text-textMuted text-sm font-bold hover:text-text transition-colors">
                Cancel
              </button>
              <button onClick={handleCreate} disabled={creating || !newUser.full_name.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-cyan text-bg rounded-xl text-sm font-bold disabled:opacity-50 hover:bg-cyan/90 transition-colors">
                {creating ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={13} />}
                {creating ? "Creating..." : "Create Test User"}
              </button>
            </div>
          </Card>
        )}

        {createdResult && (
          <div className="p-4 bg-green/5 border border-green/20 rounded-xl">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <CheckCircle size={18} className="text-green mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-green font-bold">Test user created successfully</p>
                  <p className="text-textMuted text-sm mt-1">Share these credentials for mobile app testing:</p>
                  <div className="mt-2 p-3 bg-bg rounded-xl border border-border font-mono text-xs space-y-1">
                    <p><span className="text-textMuted">Phone:</span> <span className="text-cyan">{createdResult.phone}</span></p>
                    <p><span className="text-textMuted">PIN:</span> <span className="text-cyan">{createdResult.pin}</span></p>
                    <p><span className="text-textMuted">Role:</span> <span className="text-text">{createdResult.role}</span></p>
                    <p><span className="text-textMuted">Balance:</span> <span className="text-green">{formatZAR(createdResult.initial_balance)}</span></p>
                  </div>
                  <p className="text-yellow text-[10px] mt-2 font-bold">Advise tester to change PIN after first login.</p>
                </div>
              </div>
              <button onClick={() => setCreatedResult(null)} className="text-textDim hover:text-text transition-colors text-xs">Dismiss</button>
            </div>
          </div>
        )}{loading ? <Spinner /> : users.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-bg2 border border-border flex items-center justify-center mx-auto mb-4">
              <FlaskConical size={24} className="text-textDim" />
            </div>
            <p className="text-text font-bold">No test users yet</p>
            <p className="text-textMuted text-sm mt-1">Create your first test account to start testing</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-text font-bold">{users.length} Test Account{users.length !== 1 ? "s" : ""}</h2>
              <button onClick={loadUsers} className="text-xs text-textMuted hover:text-cyan flex items-center gap-1 transition-colors">
                <RefreshCw size={11} /> Refresh
              </button>
            </div>
            {users.map(u => {
              const RoleIcon = ROLE_ICONS[u.role] || User;
              const isFunding = fundingId === u.id;
              const isDeleting = deletingId === u.id;
              return (
                <Card key={u.id}>
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-purple/10 border border-purple/20 flex items-center justify-center flex-shrink-0">
                      <RoleIcon size={16} className={ROLE_COLORS[u.role] || "text-textMuted"} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-text font-bold">{u.full_name}</span>
                        <Badge label="TEST" tone="purple" />
                        <Badge label={u.role} tone={(u.role === "passenger" ? "cyan" : u.role === "driver" ? "green" : "purple") as any} />
                        {!u.is_active && <Badge label="Inactive" tone="red" />}
                      </div>
                      <p className="text-textMuted text-xs font-mono">{u.phone_number}</p>
                      <div className="flex items-center gap-4 mt-1 text-xs text-textDim">
                        <span>{u.txn_count} transactions</span>
                        <span>Created {formatDate(u.created_at)}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-cyan font-extrabold text-lg">{formatZAR(u.balance)}</p>
                      <p className="text-textDim text-xs">wallet</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <button onClick={() => setFundingId(isFunding ? null : u.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green/10 border border-green/20 rounded-lg text-green text-xs font-bold hover:bg-green/20 transition-colors">
                      <Wallet size={12} />
                      {isFunding ? "Cancel" : "Fund Wallet"}
                    </button>
                    <button onClick={() => handleDelete(u.id, u.full_name)} disabled={isDeleting}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red/10 border border-red/20 rounded-lg text-red text-xs font-bold hover:bg-red/20 transition-colors disabled:opacity-50">
                      <Trash2 size={12} />
                      {isDeleting ? "Deleting..." : "Delete"}
                    </button>
                  </div>

                  {isFunding && (
                    <div className="mt-3 p-3 bg-bg rounded-xl border border-border">
                      <p className="text-textMuted text-xs mb-2">Add test balance (max R5,000/day)</p>
                      <div className="flex gap-2 flex-wrap">
                        {[50, 100, 500, 1000].map(amt => (
                          <button key={amt} onClick={() => setFundAmount(String(amt))}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                              fundAmount === String(amt)
                                ? "bg-green/20 border-green/30 text-green"
                                : "bg-bg3 border-border text-textMuted hover:text-text"
                            }`}>
                            R{amt}
                          </button>
                        ))}
                        <input type="number" value={fundAmount}
                          onChange={e => setFundAmount(e.target.value)}
                          className="w-24 bg-bg2 border border-border rounded-lg px-2 py-1.5 text-text text-xs focus:outline-none focus:border-green"
                          placeholder="Custom" />
                        <button onClick={() => handleFund(u.id)}
                          className="flex items-center gap-1 px-4 py-1.5 bg-green text-bg rounded-lg text-xs font-bold hover:bg-green/90 transition-colors">
                          <CheckCircle size={12} /> Add
                        </button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        <div className="p-4 bg-bg2 border border-border rounded-xl">
          <div className="flex items-start gap-3">
            <Shield size={14} className="text-textMuted flex-shrink-0 mt-0.5" />
            <div className="text-xs text-textDim space-y-1">
              <p>Test transactions are excluded from all financial reports, ledger, and reconciliation.</p>
              <p>To reset all test data go to <strong className="text-textMuted">System Console → Danger Zone → Reset Test Accounts</strong>.</p>
              <p>Test users can log into the mobile app using their phone number and PIN 0000.</p>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
