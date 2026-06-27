"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Button, Spinner, Input } from "@/components/ui";
import { formatZAR } from "@/lib/utils";
import {
  Save, Settings, DollarSign, Fuel, Clock, AlertTriangle, RefreshCw, CheckCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";

type PayoutSettings = {
  require_approval: boolean;
  auto_approve_limit: number;
  pay_fuel_enabled: boolean;
  pay_fuel_max_per_txn: number;
  pay_fuel_daily_limit: number;
  commission_auto_cashup_time: string | null;
  default_commission_pct: number;
  subscription_price_per_taxi: number;
  subscription_free_taxis: number;
  owner_statement_price: number;
  passenger_statement_price: number;
  updated_at: string | null;
};

const FIELD_LABEL: Record<string, string> = {
  auto_approve_limit: "Auto-approve Limit (ZAR)",
  pay_fuel_max_per_txn: "Max Fuel per Transaction (ZAR)",
  pay_fuel_daily_limit: "Daily Fuel Limit (ZAR)",
  default_commission_pct: "Default Driver Commission (%)",
  subscription_price_per_taxi: "Subscription Price per Taxi (ZAR/month)",
  subscription_free_taxis: "Free Taxis (per owner plan)",
  owner_statement_price: "Owner Statement Fee (ZAR)",
  passenger_statement_price: "Passenger Statement Fee (ZAR)",
};

export default function FeeConfigPage() {
  const [settings, setSettings] = useState<PayoutSettings | null>(null);
  const [form, setForm] = useState<Partial<PayoutSettings>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cashingUp, setCashingUp] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = () => {
    setLoading(true);
    api.getPayoutSettings()
      .then((r) => { setSettings(r.data); setForm(r.data); setDirty(false); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const set = (key: keyof PayoutSettings, val: unknown) => {
    setForm((f) => ({ ...f, [key]: val }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.updatePayoutSettings(form as Record<string, unknown>);
      toast.success("Fee configuration saved");
      setDirty(false);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const triggerCashup = async () => {
    setCashingUp(true);
    try {
      const res = await api.triggerCommissionCashup();
      toast.success(res.data.message || "Commission cash-up triggered");
    } catch (e: any) { toast.error(e.message); }
    finally { setCashingUp(false); }
  };

  if (loading) return <AdminShell title="Fee & Payout Config"><Spinner /></AdminShell>;

  return (
    <AdminShell title="Fee & Payout Config">
      <div className="space-y-6">

        {/* Stats overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Auto-approve Limit",   value: formatZAR(settings?.auto_approve_limit ?? 0),          color: "text-cyan"   },
            { label: "Driver Commission",     value: `${settings?.default_commission_pct ?? 0}%`,            color: "text-green"  },
            { label: "Subscription / Taxi",   value: formatZAR(settings?.subscription_price_per_taxi ?? 0), color: "text-yellow" },
            { label: "Fuel Payments",         value: settings?.pay_fuel_enabled ? "Enabled" : "Disabled",   color: settings?.pay_fuel_enabled ? "text-green" : "text-red" },
          ].map(s => (
            <div key={s.label} className="bg-bg2 border border-border rounded-xl p-4">
              <p className="text-[9px] font-bold text-textDim uppercase tracking-wider mb-1">{s.label}</p>
              <p className={`text-xl font-black tabular-nums ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Warning banner */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-yellow/10 border border-yellow/20">
          <AlertTriangle size={16} className="text-yellow" />
          <p className="text-sm text-yellow">Changes take effect immediately for all new transactions and withdrawal approvals.</p>
        </div>

        {/* Withdrawal settings */}
        <Card>
          <div className="flex items-center gap-2 mb-5">
            <DollarSign size={16} className="text-cyan" />
            <h2 className="text-text font-bold">Withdrawal Approval</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <input
                  type="checkbox"
                  id="require-approval"
                  checked={!!form.require_approval}
                  onChange={(e) => set("require_approval", e.target.checked)}
                  className="w-4 h-4 accent-cyan"
                />
                <label htmlFor="require-approval" className="text-sm text-text cursor-pointer font-semibold">
                  Require manual approval for withdrawals
                </label>
              </div>
              <p className="text-xs text-textMuted ml-7">
                When disabled, withdrawals under the auto-approve limit are processed instantly.
              </p>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
                {FIELD_LABEL.auto_approve_limit}
              </label>
              <Input
                type="number"
                step="100"
                min="0"
                value={String(form.auto_approve_limit ?? "")}
                onChange={(e) => set("auto_approve_limit", parseFloat(e.target.value) || 0)}
              />
              <p className="text-[10px] text-textMuted mt-1">
                Withdrawals below this amount are auto-approved when manual approval is off.
              </p>
            </div>
          </div>
        </Card>

        {/* Fuel payments */}
        <Card>
          <div className="flex items-center gap-2 mb-5">
            <Fuel size={16} className="text-yellow" />
            <h2 className="text-text font-bold">Fuel Payments (Pay-at-Pump)</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <input
                  type="checkbox"
                  id="fuel-enabled"
                  checked={!!form.pay_fuel_enabled}
                  onChange={(e) => set("pay_fuel_enabled", e.target.checked)}
                  className="w-4 h-4 accent-yellow"
                />
                <label htmlFor="fuel-enabled" className="text-sm text-text cursor-pointer font-semibold">
                  Enable Fuel Payments
                </label>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
                {FIELD_LABEL.pay_fuel_max_per_txn}
              </label>
              <Input
                type="number"
                step="50"
                min="0"
                value={String(form.pay_fuel_max_per_txn ?? "")}
                onChange={(e) => set("pay_fuel_max_per_txn", parseFloat(e.target.value) || 0)}
                disabled={!form.pay_fuel_enabled}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
                {FIELD_LABEL.pay_fuel_daily_limit}
              </label>
              <Input
                type="number"
                step="100"
                min="0"
                value={String(form.pay_fuel_daily_limit ?? "")}
                onChange={(e) => set("pay_fuel_daily_limit", parseFloat(e.target.value) || 0)}
                disabled={!form.pay_fuel_enabled}
              />
            </div>
          </div>
        </Card>

        {/* Commission settings */}
        <Card>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Settings size={16} className="text-purple" />
              <h2 className="text-text font-bold">Commission & Cash-up</h2>
            </div>
            <Button variant="secondary" onClick={triggerCashup} loading={cashingUp}>
              <RefreshCw size={13} className={cashingUp ? "animate-spin" : ""} />
              Trigger Cash-up Now
            </Button>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
                {FIELD_LABEL.default_commission_pct}
              </label>
              <div className="relative">
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  value={String(form.default_commission_pct ?? "")}
                  onChange={(e) => set("default_commission_pct", parseFloat(e.target.value) || 0)}
                />
              </div>
              <p className="text-[10px] text-textMuted mt-1">
                Drivers keep this percentage; owners receive the rest after platform fee.
              </p>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
                Auto Cash-up Time (24h format, e.g. 23:00)
              </label>
              <Input
                type="text"
                placeholder="23:00 or leave blank to disable"
                value={form.commission_auto_cashup_time || ""}
                onChange={(e) => set("commission_auto_cashup_time", e.target.value || null)}
              />
              <p className="text-[10px] text-textMuted mt-1">
                Daily automatic commission settlement time. Leave blank to run manually only.
              </p>
            </div>
          </div>
        </Card>

        {/* Subscription pricing */}
        <Card>
          <div className="flex items-center gap-2 mb-5">
            <DollarSign size={16} className="text-green" />
            <h2 className="text-text font-bold">Subscription Pricing</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
                {FIELD_LABEL.subscription_price_per_taxi}
              </label>
              <Input
                type="number"
                step="10"
                min="0"
                value={String(form.subscription_price_per_taxi ?? "")}
                onChange={(e) => set("subscription_price_per_taxi", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
                {FIELD_LABEL.subscription_free_taxis}
              </label>
              <Input
                type="number"
                step="1"
                min="0"
                value={String(form.subscription_free_taxis ?? "")}
                onChange={(e) => set("subscription_free_taxis", parseInt(e.target.value) || 0)}
              />
              <p className="text-[10px] text-textMuted mt-1">
                Number of taxis included for free before per-taxi billing applies.
              </p>
            </div>
          </div>
        </Card>

        {/* Statement fees */}
        <Card>
          <div className="flex items-center gap-2 mb-5">
            <DollarSign size={16} className="text-textMuted" />
            <h2 className="text-text font-bold">Statement Fees</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
                {FIELD_LABEL.owner_statement_price}
              </label>
              <Input
                type="number"
                step="1"
                min="0"
                value={String(form.owner_statement_price ?? "")}
                onChange={(e) => set("owner_statement_price", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
                {FIELD_LABEL.passenger_statement_price}
              </label>
              <Input
                type="number"
                step="1"
                min="0"
                value={String(form.passenger_statement_price ?? "")}
                onChange={(e) => set("passenger_statement_price", parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
        </Card>

        {/* Save bar */}
        <div className={`sticky bottom-4 flex items-center justify-between px-5 py-3 rounded-xl border transition-all ${
          dirty ? "bg-cyan/10 border-cyan/30" : "bg-bg2 border-border"
        }`}>
          <div className="flex items-center gap-2">
            {dirty ? (
              <>
                <AlertTriangle size={14} className="text-yellow" />
                <span className="text-sm text-yellow font-semibold">Unsaved changes</span>
              </>
            ) : (
              <>
                <CheckCircle size={14} className="text-green" />
                <span className="text-sm text-textMuted">All settings saved</span>
                {settings?.updated_at && (
                  <span className="text-xs text-textDim">· Last saved: {new Date(settings.updated_at).toLocaleString("en-ZA")}</span>
                )}
              </>
            )}
          </div>
          <div className="flex gap-2">
            {dirty && (
              <Button variant="secondary" onClick={() => { setForm(settings ?? {}); setDirty(false); }}>
                Discard
              </Button>
            )}
            <Button onClick={save} loading={saving} disabled={!dirty}>
              <Save size={13} /> Save Configuration
            </Button>
          </div>
        </div>

      </div>
    </AdminShell>
  );
}
