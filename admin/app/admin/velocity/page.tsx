"use client";
import { useEffect, useState, useCallback } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Button, Badge, Modal, Input, Select } from "@/components/ui";
import { hasPermission, isSuperAdmin } from "@/lib/api";
import { formatZAR } from "@/lib/utils";
import {
  Zap, AlertTriangle, Shield, RefreshCw,
  Plus, Trash2, CheckCircle, XCircle,
  Clock, TrendingUp, Activity, Lock,
} from "lucide-react";
import toast from "react-hot-toast";
import client from "@/lib/api";

type VelocityRule = {
  id: number;
  name: string;
  description?: string;
  tx_type: "topup" | "withdrawal" | "payment" | "all";
  window_minutes: number;
  max_count: number;
  max_amount: number;
  action: "flag" | "block";
  active: boolean;
  created_at: string;
};

type VelocityAlert = {
  id: number;
  user_id: number;
  user_name: string;
  user_phone?: string;
  rule_id: number;
  rule_name: string;
  triggered_at: string;
  tx_count: number;
  tx_amount: number;
  action_taken: "flagged" | "blocked";
  resolved: boolean;
};

type NewRule = {
  name: string;
  description: string;
  tx_type: string;
  window_minutes: number;
  max_count: number;
  max_amount: number;
  action: string;
};

const TX_TYPE_LABELS: Record<string, string> = {
  topup: "Top-up", withdrawal: "Withdrawal", payment: "Ride Payment", all: "All Types",
};

const WINDOW_OPTIONS = [
  { label: "5 minutes", value: "5" },
  { label: "15 minutes", value: "15" },
  { label: "30 minutes", value: "30" },
  { label: "1 hour", value: "60" },
  { label: "3 hours", value: "180" },
  { label: "6 hours", value: "360" },
  { label: "12 hours", value: "720" },
  { label: "24 hours", value: "1440" },
];

function RuleCard({
  rule, onToggle, onDelete, canEdit,
}: {
  rule: VelocityRule;
  onToggle: (r: VelocityRule) => void;
  onDelete: (r: VelocityRule) => void;
  canEdit: boolean;
}) {
  const windowLabel = WINDOW_OPTIONS.find(o => Number(o.value) === rule.window_minutes)?.label ?? `${rule.window_minutes}min`;
  return (
    <div className={`border rounded-xl p-4 transition-all ${rule.active ? "bg-bg2 border-border hover:border-cyan/30" : "bg-bg border-border opacity-60"}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-text font-bold text-sm truncate">{rule.name}</p>
            <Badge
              label={rule.action === "block" ? "Block" : "Flag"}
              tone={rule.action === "block" ? "red" : "yellow"}
            />
            <Badge
              label={rule.active ? "Active" : "Inactive"}
              tone={rule.active ? "green" : "muted"}
            />
          </div>
          {rule.description && <p className="text-textDim text-xs mt-0.5">{rule.description}</p>}
        </div>
        {canEdit && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => onToggle(rule)}
              className={`p-1.5 rounded-lg transition-colors ${rule.active ? "text-green hover:bg-green/10" : "text-textDim hover:bg-bg3"}`}
              title={rule.active ? "Deactivate" : "Activate"}
            >
              {rule.active ? <CheckCircle size={14} /> : <XCircle size={14} />}
            </button>
            <button
              onClick={() => onDelete(rule)}
              className="p-1.5 rounded-lg text-textDim hover:text-red hover:bg-red/10 transition-colors"
              title="Delete rule"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { label: "Type", value: TX_TYPE_LABELS[rule.tx_type] || rule.tx_type },
          { label: "Window", value: windowLabel },
          { label: "Max Count", value: `${rule.max_count} txns` },
          { label: "Max Amount", value: formatZAR(rule.max_amount) },
        ].map(stat => (
          <div key={stat.label} className="bg-bg rounded-lg px-3 py-2">
            <p className="text-[9px] font-bold text-textDim uppercase tracking-widest">{stat.label}</p>
            <p className="text-text text-xs font-bold mt-0.5">{stat.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AlertRow({ alert, onResolve }: { alert: VelocityAlert; onResolve: (id: number) => void }) {
  return (
    <tr className="border-b border-border hover:bg-bg3 transition-colors">
      <td className="px-4 py-3">
        <p className="text-text text-sm font-semibold">{alert.user_name}</p>
        {alert.user_phone && <p className="text-textDim text-xs">{alert.user_phone}</p>}
      </td>
      <td className="px-4 py-3 text-textMuted text-sm">{alert.rule_name}</td>
      <td className="px-4 py-3">
        <div>
          <p className="text-text text-sm font-bold">{alert.tx_count} txns</p>
          <p className="text-textDim text-xs">{formatZAR(alert.tx_amount)}</p>
        </div>
      </td>
      <td className="px-4 py-3">
        <Badge
          label={alert.action_taken}
          tone={alert.action_taken === "blocked" ? "red" : "yellow"}
        />
      </td>
      <td className="px-4 py-3 text-textDim text-xs">
        {new Date(alert.triggered_at).toLocaleString()}
      </td>
      <td className="px-4 py-3">
        {alert.resolved ? (
          <Badge label="Resolved" tone="green" />
        ) : (
          <button
            onClick={() => onResolve(alert.id)}
            className="text-xs text-cyan hover:text-cyan/80 font-semibold underline underline-offset-2"
          >
            Resolve
          </button>
        )}
      </td>
    </tr>
  );
}

export default function VelocityPage() {
  const canManage = hasPermission("manage_limits") || isSuperAdmin();
  const [rules, setRules] = useState<VelocityRule[]>([]);
  const [alerts, setAlerts] = useState<VelocityAlert[]>([]);
  const [stats, setStats] = useState({
    activeRules: 0, triggeredToday: 0, blockedToday: 0, flaggedToday: 0,
  });
  const [loading, setLoading] = useState(true);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<"rules" | "alerts">("rules");
  const [form, setForm] = useState<NewRule>({
    name: "", description: "", tx_type: "all",
    window_minutes: 60, max_count: 10, max_amount: 5000, action: "flag",
  });

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.get("/api/admin/velocity/rules");
      const data: VelocityRule[] = res.data || [];
      setRules(data);
      setStats(s => ({ ...s, activeRules: data.filter(r => r.active).length }));
    } catch {
      // fallback to empty — new feature may not be deployed yet
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAlerts = useCallback(async () => {
    setAlertsLoading(true);
    try {
      const res = await client.get("/api/admin/velocity/alerts");
      const data: VelocityAlert[] = res.data?.alerts || res.data || [];
      setAlerts(data);
      const today = new Date().toDateString();
      const todayAlerts = data.filter(a => new Date(a.triggered_at).toDateString() === today);
      setStats(s => ({
        ...s,
        triggeredToday: todayAlerts.length,
        blockedToday: todayAlerts.filter(a => a.action_taken === "blocked").length,
        flaggedToday: todayAlerts.filter(a => a.action_taken === "flagged").length,
      }));
    } catch {
      setAlerts([]);
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRules();
    loadAlerts();
  }, [loadRules, loadAlerts]);

  const handleToggle = async (rule: VelocityRule) => {
    try {
      await client.patch(`/api/admin/velocity/rules/${rule.id}`, { active: !rule.active });
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, active: !r.active } : r));
      toast.success(`Rule ${rule.active ? "deactivated" : "activated"}`);
    } catch {
      toast.error("Failed to update rule");
    }
  };

  const handleDelete = async (rule: VelocityRule) => {
    if (!confirm(`Delete rule "${rule.name}"?`)) return;
    try {
      await client.delete(`/api/admin/velocity/rules/${rule.id}`);
      setRules(prev => prev.filter(r => r.id !== rule.id));
      toast.success("Rule deleted");
    } catch {
      toast.error("Failed to delete rule");
    }
  };

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error("Rule name is required"); return; }
    setCreating(true);
    try {
      const res = await client.post("/api/admin/velocity/rules", {
        ...form,
        window_minutes: Number(form.window_minutes),
        max_count: Number(form.max_count),
        max_amount: Number(form.max_amount),
      });
      setRules(prev => [res.data, ...prev]);
      setShowCreate(false);
      setForm({ name: "", description: "", tx_type: "all", window_minutes: 60, max_count: 10, max_amount: 5000, action: "flag" });
      toast.success("Velocity rule created");
    } catch {
      toast.error("Failed to create rule");
    } finally {
      setCreating(false);
    }
  };

  const handleResolve = async (id: number) => {
    try {
      await client.post(`/api/admin/velocity/alerts/${id}/resolve`);
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, resolved: true } : a));
      toast.success("Alert resolved");
    } catch {
      toast.error("Failed to resolve alert");
    }
  };

  const unresolvedAlerts = alerts.filter(a => !a.resolved);

  return (
    <AdminShell title="Velocity Monitoring" subtitle="Real-time fraud velocity rules and transaction rate controls">
      <div className="space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Active Rules", value: stats.activeRules, icon: Shield, color: "text-cyan" },
            { label: "Triggered Today", value: stats.triggeredToday, icon: Activity, color: "text-yellow" },
            { label: "Blocked Today", value: stats.blockedToday, icon: Lock, color: "text-red" },
            { label: "Flagged Today", value: stats.flaggedToday, icon: AlertTriangle, color: "text-orange-400" },
          ].map(stat => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="bg-bg2 border border-border rounded-xl p-4 flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl bg-bg flex items-center justify-center flex-shrink-0`}>
                  <Icon size={18} className={stat.color} />
                </div>
                <div>
                  <p className="text-[9px] font-bold text-textDim uppercase tracking-widest">{stat.label}</p>
                  <p className={`text-2xl font-black mt-0.5 ${stat.color}`}>{stat.value}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Unresolved alerts banner */}
        {unresolvedAlerts.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 bg-red/5 border border-red/30 rounded-xl">
            <AlertTriangle size={15} className="text-red flex-shrink-0" />
            <p className="text-text text-sm">
              <span className="text-red font-bold">{unresolvedAlerts.length} unresolved alert{unresolvedAlerts.length !== 1 ? "s" : ""}</span>
              {" "}— {unresolvedAlerts.filter(a => a.action_taken === "blocked").length} blocked transactions require review.
            </p>
            <button onClick={() => setTab("alerts")} className="ml-auto text-xs text-red font-bold hover:underline flex-shrink-0">
              View Alerts →
            </button>
          </div>
        )}

        {/* Tabs + Actions */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex bg-bg2 border border-border rounded-xl p-1 gap-1">
            {(["rules", "alerts"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                  tab === t ? "bg-cyan text-bg" : "text-textMuted hover:text-text"
                }`}
              >
                {t === "alerts" && unresolvedAlerts.length > 0
                  ? `Alerts (${unresolvedAlerts.length})`
                  : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { loadRules(); loadAlerts(); }}
              className="p-2 rounded-lg bg-bg2 border border-border text-textMuted hover:text-text transition-colors"
            >
              <RefreshCw size={14} />
            </button>
            {canManage && tab === "rules" && (
              <Button onClick={() => setShowCreate(true)}>
                <Plus size={13} /> New Rule
              </Button>
            )}
          </div>
        </div>

        {/* ── Rules Tab ── */}
        {tab === "rules" && (
          <div>
            {loading ? (
              <div className="flex justify-center py-16">
                <RefreshCw size={20} className="animate-spin text-textDim" />
              </div>
            ) : rules.length === 0 ? (
              <Card>
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Zap size={32} className="text-textDim" />
                  <p className="text-text font-bold">No velocity rules yet</p>
                  <p className="text-textMuted text-sm text-center max-w-xs">
                    Velocity rules protect against fraud by limiting transaction rates. Create your first rule to get started.
                  </p>
                  {canManage && (
                    <Button onClick={() => setShowCreate(true)}>
                      <Plus size={13} /> Create First Rule
                    </Button>
                  )}
                </div>
              </Card>
            ) : (
              <div className="space-y-3">
                {rules.map(rule => (
                  <RuleCard
                    key={rule.id}
                    rule={rule}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                    canEdit={canManage}
                  />
                ))}
              </div>
            )}

            {/* Built-in rules reference */}
            <Card className="mt-4">
              <p className="text-[10px] font-bold text-textDim uppercase tracking-widest mb-3">Platform Default Limits (Always Active)</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { label: "Top-up: max per day", value: "R 10,000", icon: TrendingUp, color: "text-cyan" },
                  { label: "Withdrawal: max per 24h", value: "R 5,000", icon: Clock, color: "text-yellow" },
                  { label: "Payments: max per hour", value: "30 txns", icon: Activity, color: "text-green" },
                ].map(item => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="bg-bg rounded-xl p-3 flex items-center gap-3">
                      <Icon size={16} className={item.color} />
                      <div>
                        <p className="text-textDim text-[10px]">{item.label}</p>
                        <p className={`text-sm font-bold ${item.color}`}>{item.value}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-textDim text-[10px] mt-3">
                These limits are enforced by the <code className="text-cyan bg-cyan/10 px-1 rounded text-[10px]">TxLimits</code> table and the <code className="text-cyan bg-cyan/10 px-1 rounded text-[10px]">/admin/limits</code> page. Custom velocity rules above are additive.
              </p>
            </Card>
          </div>
        )}

        {/* ── Alerts Tab ── */}
        {tab === "alerts" && (
          <Card>
            {alertsLoading ? (
              <div className="flex justify-center py-12">
                <RefreshCw size={20} className="animate-spin text-textDim" />
              </div>
            ) : alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <CheckCircle size={32} className="text-green" />
                <p className="text-text font-bold">No velocity alerts</p>
                <p className="text-textMuted text-sm">All clear — no users have triggered velocity rules.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {["User", "Rule Triggered", "Volume", "Action", "Time", "Status"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-textMuted uppercase tracking-widest">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map(alert => (
                      <AlertRow key={alert.id} alert={alert} onResolve={handleResolve} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {/* ── Create Rule Modal ── */}
        <Modal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          title="New Velocity Rule"
          size="lg"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest block mb-1">Rule Name *</label>
                <Input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. High-frequency top-ups"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest block mb-1">Transaction Type</label>
                <Select
                  value={form.tx_type}
                  onChange={e => setForm(f => ({ ...f, tx_type: e.target.value }))}
                  options={[
                    { label: "All Types", value: "all" },
                    { label: "Top-up only", value: "topup" },
                    { label: "Withdrawal only", value: "withdrawal" },
                    { label: "Ride Payment only", value: "payment" },
                  ]}
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest block mb-1">Description</label>
              <Input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Brief description of what this rule detects"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest block mb-1">Time Window</label>
                <Select
                  value={String(form.window_minutes)}
                  onChange={e => setForm(f => ({ ...f, window_minutes: Number(e.target.value) }))}
                  options={WINDOW_OPTIONS}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest block mb-1">Max Transactions</label>
                <Input
                  type="number" min="1"
                  value={form.max_count}
                  onChange={e => setForm(f => ({ ...f, max_count: Number(e.target.value) }))}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest block mb-1">Max Total Amount (R)</label>
                <Input
                  type="number" min="0"
                  value={form.max_amount}
                  onChange={e => setForm(f => ({ ...f, max_amount: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest block mb-2">Action When Triggered</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: "flag", label: "Flag for Review", desc: "Transaction allowed — user flagged in risk queue", color: "yellow", icon: AlertTriangle },
                  { value: "block", label: "Block Transaction", desc: "Transaction is rejected and user is notified", color: "red", icon: Lock },
                ].map(opt => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setForm(f => ({ ...f, action: opt.value }))}
                      className={`p-4 rounded-xl border text-left transition-all ${
                        form.action === opt.value
                          ? `border-${opt.color} bg-${opt.color}/5`
                          : "border-border hover:border-border/80"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <Icon size={14} className={`text-${opt.color}`} />
                        <p className="text-text font-bold text-xs">{opt.label}</p>
                        {form.action === opt.value && (
                          <CheckCircle size={12} className={`text-${opt.color} ml-auto`} />
                        )}
                      </div>
                      <p className="text-textDim text-[10px]">{opt.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={handleCreate} loading={creating}>
                <Plus size={13} /> Create Rule
              </Button>
            </div>
          </div>
        </Modal>

      </div>
    </AdminShell>
  );
}
