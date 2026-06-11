"use client";
import { useEffect, useState, useCallback } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Button, Spinner, Input, Modal } from "@/components/ui";
import { hasPermission, isSuperAdmin } from "@/lib/api";
import { Save, ToggleLeft, ToggleRight, FileText, ShieldCheck, Building2, Users, Info, Navigation, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

// ── Types ──────────────────────────────────────────────────────────────────────
type ConfigMap = Record<string, string>;
type PayoutSettings = {
  owner_statement_price: number;
  passenger_statement_price: number;
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatR(v: string | number) {
  const n = parseFloat(String(v));
  return isNaN(n) ? "R 0.00" : `R ${n.toFixed(2)}`;
}

// ── Period price row ───────────────────────────────────────────────────────────
function PeriodRow({
  label, configKey, value, saved, saving, onChange, onSave, disabled,
}: {
  label: string; configKey: string; value: string; saved: boolean; saving: boolean;
  onChange: (v: string) => void; onSave: () => void; disabled: boolean;
}) {
  const changed = value !== saved.toString();
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 shrink-0">
        <p className="text-xs font-bold text-text">{label}</p>
        <p className="text-[10px] text-textDim font-mono">{configKey}</p>
      </div>
      <Input
        type="number"
        min="0"
        step="0.50"
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="w-32"
        placeholder="0.00"
      />
      <span className="text-textMuted text-xs">{formatR(value)}</span>
      <Button
        onClick={onSave}
        loading={saving}
        disabled={!changed || disabled}
        variant={changed ? "primary" : "secondary"}
        className="ml-auto">
        <Save size={12} /> Save
      </Button>
    </div>
  );
}

// ── Toggle row ─────────────────────────────────────────────────────────────────
function EnabledToggle({
  label, enabled, onChange, disabled,
}: {
  label: string; enabled: boolean; onChange: (v: boolean) => void; disabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <p className="text-sm text-text">{label}</p>
      <button
        disabled={disabled}
        onClick={() => onChange(!enabled)}
        className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${enabled ? "bg-green" : "bg-border"}`}>
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${enabled ? "left-5" : "left-0.5"}`} />
      </button>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function DocumentPricingPage() {
  const router = useRouter();
  const canEdit = hasPermission("edit_fees") || isSuperAdmin();

  const [config, setConfig] = useState<ConfigMap>({});
  const [edited, setEdited] = useState<ConfigMap>({});
  const [payoutSettings, setPayoutSettings] = useState<PayoutSettings>({ owner_statement_price: 0, passenger_statement_price: 0 });
  const [editedPayout, setEditedPayout] = useState<PayoutSettings>({ owner_statement_price: 0, passenger_statement_price: 0 });
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savingPayout, setSavingPayout] = useState<string | null>(null);
  const [highFeeConfirm, setHighFeeConfirm] = useState<{ label: string; amount: number; proceed: () => void } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgRes, psRes] = await Promise.all([
        fetch(`${BASE}/api/admin/config`, { headers: authHeaders() }),
        fetch(`${BASE}/api/admin/payout-settings`, { headers: authHeaders() }),
      ]);
      const cfgRows: { key: string; value: string }[] = await cfgRes.json();
      const ps = await psRes.json();

      const map: ConfigMap = {};
      if (Array.isArray(cfgRows)) cfgRows.forEach(r => { map[r.key] = r.value; });
      setConfig(map);
      setEdited(map);

      const payout = {
        owner_statement_price: ps.owner_statement_price ?? 10,
        passenger_statement_price: ps.passenger_statement_price ?? 5,
      };
      setPayoutSettings(payout);
      setEditedPayout(payout);
    } catch { toast.error("Failed to load pricing"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Save a system_config key
  const saveConfigKey = (key: string) => {
    const numVal = parseFloat(edited[key]);
    if (isNaN(numVal) || numVal < 0) { toast.error("Fee must be 0 or more"); return; }
    if (numVal > 500) {
      setHighFeeConfirm({ label: key.replace(/_/g, " "), amount: numVal, proceed: () => doSaveConfigKey(key, numVal) });
      return;
    }
    doSaveConfigKey(key, numVal);
  };
  const doSaveConfigKey = async (key: string, numVal: number) => {
    setSavingKey(key);
    try {
      const res = await fetch(`${BASE}/api/admin/config/${key}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ value: String(numVal) }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Save failed");
      setConfig(prev => ({ ...prev, [key]: String(numVal) }));
      toast.success(`${key.replace(/_/g, " ")} updated`);
    } catch (e: any) { toast.error(e.message); }
    finally { setSavingKey(null); }
  };

  // Save a payout_settings field
  const savePayoutField = (field: keyof PayoutSettings) => {
    const numVal = parseFloat(String(editedPayout[field]));
    if (isNaN(numVal) || numVal < 0) { toast.error("Fee must be 0 or more"); return; }
    if (numVal > 500) {
      setHighFeeConfirm({ label: field.replace(/_/g, " "), amount: numVal, proceed: () => doSavePayoutField(field, numVal) });
      return;
    }
    doSavePayoutField(field, numVal);
  };
  const doSavePayoutField = async (field: keyof PayoutSettings, numVal: number) => {
    setSavingPayout(field);
    try {
      const res = await fetch(`${BASE}/api/admin/payout-settings`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ [field]: numVal }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Save failed");
      setPayoutSettings(prev => ({ ...prev, [field]: numVal }));
      toast.success(`${field.replace(/_/g, " ")} updated`);
    } catch (e: any) { toast.error(e.message); }
    finally { setSavingPayout(null); }
  };

  // Toggle a system_config boolean key
  const toggleConfig = async (key: string, current: boolean) => {
    const newVal = current ? "false" : "true";
    try {
      const res = await fetch(`${BASE}/api/admin/config/${key}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ value: newVal }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Failed");
      setConfig(prev => ({ ...prev, [key]: newVal }));
      setEdited(prev => ({ ...prev, [key]: newVal }));
      toast.success(`${key.replace(/_/g, " ")} ${newVal === "true" ? "enabled" : "disabled"}`);
    } catch (e: any) { toast.error(e.message); }
  };

  const boolVal = (key: string) => config[key] === "true" || config[key] === "1";

  if (loading) return <AdminShell title="Document Pricing"><Spinner /></AdminShell>;

  return (
    <AdminShell
      title="Document Pricing"
      subtitle="Set fees for driver payslips, owner fleet statements, and passenger expense statements">
      <div className="space-y-6 max-w-3xl">

        {/* Access notice */}
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-yellow/5 border border-yellow/20">
          <Info size={14} className="text-yellow mt-0.5 flex-shrink-0" />
          <p className="text-yellow text-xs font-semibold">
            Document fees are deducted from the user's wallet at generation time.
            Setting a fee to <strong>0</strong> makes the document free.
            Disabling a document type prevents all users from generating it.
          </p>
        </div>

        {/* ── Driver Earnings Statement ── */}
        <Card>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-cyanDim border border-cyan/20 flex items-center justify-center">
              <FileText size={16} className="text-cyan" />
            </div>
            <div>
              <h2 className="text-text font-bold text-sm">Driver Earnings Statement</h2>
              <p className="text-textDim text-[11px]">Personal earnings summary — private use</p>
            </div>
            <div className="ml-auto">
              <EnabledToggle
                label="Enabled"
                enabled={boolVal("payslip_enabled")}
                onChange={() => toggleConfig("payslip_enabled", boolVal("payslip_enabled"))}
                disabled={!canEdit}
              />
            </div>
          </div>

          <div className="space-y-4">
            {[
              { key: "payslip_fee_1month",   label: "1 Month" },
              { key: "payslip_fee_3months",  label: "3 Months" },
              { key: "payslip_fee_6months",  label: "6 Months" },
              { key: "payslip_fee_12months", label: "12 Months" },
            ].map(({ key, label }) => (
              <PeriodRow
                key={key}
                label={label}
                configKey={key}
                value={edited[key] ?? config[key] ?? "0"}
                saved={!!(config[key] !== edited[key])}
                saving={savingKey === key}
                onChange={v => setEdited(prev => ({ ...prev, [key]: v }))}
                onSave={() => saveConfigKey(key)}
                disabled={!canEdit}
              />
            ))}
          </div>
        </Card>

        {/* ── Formal Payslip (Bank-Verified) ── */}
        <Card>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-green/10 border border-green/20 flex items-center justify-center">
              <ShieldCheck size={16} className="text-green" />
            </div>
            <div>
              <h2 className="text-text font-bold text-sm">Formal Payslip</h2>
              <p className="text-textDim text-[11px]">Bank-grade document with QR verification — for loans & credit</p>
            </div>
            <div className="ml-auto">
              <EnabledToggle
                label="Enabled"
                enabled={boolVal("formal_payslip_enabled")}
                onChange={() => toggleConfig("formal_payslip_enabled", boolVal("formal_payslip_enabled"))}
                disabled={!canEdit}
              />
            </div>
          </div>

          <div className="space-y-4">
            {[
              { key: "formal_payslip_fee_1month",   label: "1 Month" },
              { key: "formal_payslip_fee_3months",  label: "3 Months" },
              { key: "formal_payslip_fee_6months",  label: "6 Months" },
              { key: "formal_payslip_fee_12months", label: "12 Months" },
            ].map(({ key, label }) => (
              <PeriodRow
                key={key}
                label={label}
                configKey={key}
                value={edited[key] ?? config[key] ?? "0"}
                saved={!!(config[key] !== edited[key])}
                saving={savingKey === key}
                onChange={v => setEdited(prev => ({ ...prev, [key]: v }))}
                onSave={() => saveConfigKey(key)}
                disabled={!canEdit}
              />
            ))}
          </div>
        </Card>

        {/* ── Owner Fleet Statement ── */}
        <Card>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-purple/10 border border-purple/20 flex items-center justify-center">
              <Building2 size={16} className="text-purple" />
            </div>
            <div>
              <h2 className="text-text font-bold text-sm">Owner Fleet Statement</h2>
              <p className="text-textDim text-[11px]">Monthly fleet breakdown — cashups, drivers, subscriptions</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-28 shrink-0">
              <p className="text-xs font-bold text-text">Per Statement</p>
              <p className="text-[10px] text-textDim font-mono">owner_statement_price</p>
            </div>
            <Input
              type="number"
              min="0"
              step="0.50"
              value={String(editedPayout.owner_statement_price)}
              onChange={e => setEditedPayout(prev => ({ ...prev, owner_statement_price: parseFloat(e.target.value) || 0 }))}
              disabled={!canEdit}
              className="w-32"
              placeholder="10.00"
            />
            <span className="text-textMuted text-xs">{formatR(editedPayout.owner_statement_price)}</span>
            <Button
              onClick={() => savePayoutField("owner_statement_price")}
              loading={savingPayout === "owner_statement_price"}
              disabled={editedPayout.owner_statement_price === payoutSettings.owner_statement_price || !canEdit}
              variant={editedPayout.owner_statement_price !== payoutSettings.owner_statement_price ? "primary" : "secondary"}
              className="ml-auto">
              <Save size={12} /> Save
            </Button>
          </div>
          {payoutSettings.owner_statement_price > 0 && (
            <p className="text-[10px] text-textDim mt-2">
              Current saved price: <span className="font-mono text-textMuted">{formatR(payoutSettings.owner_statement_price)}</span> per statement
            </p>
          )}
        </Card>

        {/* ── Passenger Expense Statement ── */}
        <Card>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-orange-400/10 border border-orange-400/20 flex items-center justify-center">
              <Users size={16} className="text-orange-400" />
            </div>
            <div>
              <h2 className="text-text font-bold text-sm">Passenger Expense Statement</h2>
              <p className="text-textDim text-[11px]">Monthly ride spending & top-up history for passengers</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-28 shrink-0">
              <p className="text-xs font-bold text-text">Per Statement</p>
              <p className="text-[10px] text-textDim font-mono">passenger_statement_price</p>
            </div>
            <Input
              type="number"
              min="0"
              step="0.50"
              value={String(editedPayout.passenger_statement_price)}
              onChange={e => setEditedPayout(prev => ({ ...prev, passenger_statement_price: parseFloat(e.target.value) || 0 }))}
              disabled={!canEdit}
              className="w-32"
              placeholder="5.00"
            />
            <span className="text-textMuted text-xs">{formatR(editedPayout.passenger_statement_price)}</span>
            <Button
              onClick={() => savePayoutField("passenger_statement_price")}
              loading={savingPayout === "passenger_statement_price"}
              disabled={editedPayout.passenger_statement_price === payoutSettings.passenger_statement_price || !canEdit}
              variant={editedPayout.passenger_statement_price !== payoutSettings.passenger_statement_price ? "primary" : "secondary"}
              className="ml-auto">
              <Save size={12} /> Save
            </Button>
          </div>
          {payoutSettings.passenger_statement_price > 0 && (
            <p className="text-[10px] text-textDim mt-2">
              Current saved price: <span className="font-mono text-textMuted">{formatR(payoutSettings.passenger_statement_price)}</span> per statement
            </p>
          )}
        </Card>

        {/* ── Track Me Session Fee ── */}
        <Card>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-cyan/10 border border-cyan/20 flex items-center justify-center">
              <Navigation size={16} className="text-cyan" />
            </div>
            <div>
              <h2 className="text-text font-bold text-sm">Track Me</h2>
              <p className="text-textDim text-[11px]">Fee charged per standalone tracking session (passengers, anytime)</p>
            </div>
            <div className="ml-auto">
              <EnabledToggle
                label="Enabled"
                enabled={boolVal("track_me_enabled")}
                onChange={() => toggleConfig("track_me_enabled", boolVal("track_me_enabled"))}
                disabled={!canEdit}
              />
            </div>
          </div>

          <PeriodRow
            label="Per Session"
            configKey="track_me_fee"
            value={edited["track_me_fee"] ?? config["track_me_fee"] ?? "3.00"}
            saved={!!(config["track_me_fee"] !== edited["track_me_fee"])}
            saving={savingKey === "track_me_fee"}
            onChange={v => setEdited(prev => ({ ...prev, track_me_fee: v }))}
            onSave={() => saveConfigKey("track_me_fee")}
            disabled={!canEdit}
          />
          <p className="text-[10px] text-textDim mt-3">
            Free when passenger is already in an active taxi trip. Set to 0 to make it always free.
          </p>
        </Card>

      </div>

      {/* High Fee Warning Confirmation Modal */}
      <Modal open={!!highFeeConfirm} onClose={() => setHighFeeConfirm(null)} title="High Fee Warning">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-yellow/5 border border-yellow/20 rounded-xl">
            <AlertTriangle size={15} className="text-yellow flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="text-yellow font-semibold">This is a very high fee</p>
              <p className="text-textMuted mt-1">
                Setting <strong className="text-text">{highFeeConfirm?.label}</strong> to{" "}
                <strong className="text-yellow">R{highFeeConfirm?.amount.toFixed(2)}</strong> (above R500).
                Users will be charged this amount. Are you sure?
              </p>
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setHighFeeConfirm(null)}>Cancel</Button>
            <Button onClick={() => { highFeeConfirm?.proceed(); setHighFeeConfirm(null); }}>
              <Save size={12} /> Save Anyway
            </Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
