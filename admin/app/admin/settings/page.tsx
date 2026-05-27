"use client";
import { useEffect, useState, useMemo } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Button, Spinner, Input } from "@/components/ui";
import { isSuperAdmin, hasPermission } from "@/lib/api";
import { Save, Settings, Lock, RotateCcw, CheckCircle2, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

const CEO_ONLY_KEYS = [
  "topup_processing_fee_percent",
  "topup_gateway_fee_percent",
  "topup_gateway_fee_fixed",
  "platform_fee_percent",
];

const DANGEROUS_KEYS = [
  "maintenance_mode",
  "topup_processing_fee_percent",
  "platform_fee_percent",
];

const CONFIG_GROUPS = [
  {
    label: "Top-Up Processing Fees",
    ceoOnly: true,
    keys: ["topup_processing_fee_percent", "topup_gateway_fee_percent", "topup_gateway_fee_fixed"],
    descriptions: {
      topup_processing_fee_percent: "Fee % charged to user on top-up. e.g. 6.0 means user pays R106 to add R100",
      topup_gateway_fee_percent: "Actual PayFast gateway fee %. Used to calculate operations income e.g. 4.9",
      topup_gateway_fee_fixed: "PayFast fixed fee per transaction in ZAR e.g. 1.00",
    },
  },
  {
    label: "Platform Fees",
    ceoOnly: true,
    keys: ["platform_fee_percent"],
    descriptions: {
      platform_fee_percent: "Percentage fee on every ride payment e.g. 3.0 = 3%",
    },
  },
  {
    label: "Withdrawal Settings",
    ceoOnly: false,
    keys: ["auto_approve_withdrawal_limit"],
    descriptions: {
      auto_approve_withdrawal_limit: "Auto-approve withdrawals below this amount in ZAR. Set to 0 to disable",
    },
  },
  {
    label: "Transaction Limits",
    ceoOnly: false,
    keys: ["min_transfer_amount", "max_transfer_amount", "topup_max_amount"],
    descriptions: {
      min_transfer_amount: "Minimum payment amount in ZAR",
      max_transfer_amount: "Maximum single payment amount in ZAR",
      topup_max_amount: "Maximum single top-up amount in ZAR",
    },
  },
  {
    label: "Withdrawal Limits",
    ceoOnly: false,
    keys: ["min_withdrawal_amount", "max_withdrawal_amount", "withdrawal_daily_limit"],
    descriptions: {
      min_withdrawal_amount: "Minimum withdrawal amount in ZAR",
      max_withdrawal_amount: "Maximum single withdrawal in ZAR",
      withdrawal_daily_limit: "Max total daily withdrawals per user in ZAR",
    },
  },
  {
    label: "App Settings",
    ceoOnly: false,
    keys: ["maintenance_mode", "kyc_required_for_payments", "app_version_android", "app_version_ios"],
    descriptions: {
      maintenance_mode: "Set to true to put app in maintenance mode",
      kyc_required_for_payments: "Set to true to require KYC before drivers receive payments",
      app_version_android: "Minimum required Android app version",
      app_version_ios: "Minimum required iOS app version",
    },
  },
  {
    label: "Support Contact",
    ceoOnly: false,
    keys: ["support_whatsapp", "support_email"],
    descriptions: {
      support_whatsapp: "Support WhatsApp number digits only no +",
      support_email: "Support email address",
    },
  },
];

export default function SettingsPage() {
  const router = useRouter();
  const superAdmin = isSuperAdmin();
  const isCeoOrSuper = superAdmin || hasPermission("edit_fees");
  const [config, setConfig] = useState<Record<string, string>>({});
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!superAdmin) { router.push("/admin/dashboard"); return; }
    fetch(`${BASE}/api/admin/config`, { headers: authHeaders() })
      .then(r => r.json())
      .then((rows: any[]) => {
        const map: Record<string, string> = {};
        if (Array.isArray(rows)) rows.forEach(r => { map[r.key] = r.value; });
        setConfig(map); setEdited(map);
      }).finally(() => setLoading(false));
  }, []);

  const handleSave = async (key: string) => {
    if (CEO_ONLY_KEYS.includes(key) && !isCeoOrSuper) {
      toast.error("Only CEO or Superadmin can edit fee settings");
      return;
    }
    if (DANGEROUS_KEYS.includes(key)) {
      const label = key.replace(/_/g, " ");
      const confirmed = window.confirm(
        `You are about to change "${label}" from "${config[key]}" to "${edited[key]}". This takes effect immediately. Proceed?`
      );
      if (!confirmed) return;
    }
    setSaving(key);
    try {
      await fetch(`${BASE}/api/admin/config/${key}`, {
        method: "PATCH", headers: authHeaders(),
        body: JSON.stringify({ value: edited[key] }),
      });
      setConfig(prev => ({ ...prev, [key]: edited[key] }));
      setSavedKeys(prev => { const s = new Set(prev); s.add(key); return s; });
      setTimeout(() => setSavedKeys(prev => { const s = new Set(prev); s.delete(key); return s; }), 3000);
      toast.success(`${key.replace(/_/g, " ")} updated`);
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(null); }
  };

  const handleSaveAll = async () => {
    const pendingKeys = changedKeys.filter(k => canEdit(k));
    if (!pendingKeys.length) return;
    setSavingAll(true);
    let successCount = 0;
    for (const key of pendingKeys) {
      try {
        await fetch(`${BASE}/api/admin/config/${key}`, {
          method: "PATCH", headers: authHeaders(),
          body: JSON.stringify({ value: edited[key] }),
        });
        setConfig(prev => ({ ...prev, [key]: edited[key] }));
        successCount++;
      } catch { /* continue */ }
    }
    setSavingAll(false);
    toast.success(`Saved ${successCount} of ${pendingKeys.length} settings`);
  };

  const hasChanged = (key: string) => edited[key] !== config[key];
  const canEdit = (key: string) => CEO_ONLY_KEYS.includes(key) ? isCeoOrSuper : superAdmin;

  const changedKeys = useMemo(
    () => Object.keys(edited).filter(k => hasChanged(k)),
    [edited, config]
  );

  const resetKey = (key: string) => setEdited(prev => ({ ...prev, [key]: config[key] }));

  if (!superAdmin) return null;

  return (
    <AdminShell title="Settings & Configuration">
      <div className="space-y-6 max-w-3xl">
        {loading ? <Spinner /> : (
          <>
            {/* Warning banner */}
            <div className="flex items-center gap-2 p-4 bg-yellow/10 border border-yellow/20 rounded-xl">
              <Settings size={16} className="text-yellow" />
              <p className="text-yellow text-sm font-medium">
                Changes take effect immediately. Fee settings require CEO or Superadmin.
              </p>
            </div>

            {/* Unsaved changes bar */}
            {changedKeys.length > 0 && (
              <div className="flex items-center justify-between p-4 bg-cyan/5 border border-cyan/20 rounded-xl">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-cyan" />
                  <p className="text-cyan text-sm font-semibold">
                    {changedKeys.length} unsaved change{changedKeys.length !== 1 ? "s" : ""}
                  </p>
                  <div className="flex gap-1 flex-wrap">
                    {changedKeys.map(k => (
                      <span key={k} className="text-[10px] bg-cyan/10 text-cyan px-2 py-0.5 rounded-full font-mono">
                        {k.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                </div>
                <Button onClick={handleSaveAll} loading={savingAll} variant="primary">
                  <Save size={13} /> Save All
                </Button>
              </div>
            )}

            {CONFIG_GROUPS.map(group => (
              <Card key={group.label}>
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-text font-bold">{group.label}</h2>
                  {group.ceoOnly && (
                    <div className="flex items-center gap-1 px-2 py-0.5 bg-purple/10 border border-purple/20 rounded-full">
                      <Lock size={10} className="text-purple" />
                      <span className="text-[10px] font-bold text-purple">CEO ONLY</span>
                    </div>
                  )}
                </div>
                <div className="space-y-6">
                  {group.keys.map(key => {
                    const editable = canEdit(key);
                    const changed = hasChanged(key);
                    const justSaved = savedKeys.has(key);
                    const isDangerous = DANGEROUS_KEYS.includes(key);
                    return (
                      <div key={key}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest">
                              {key.replace(/_/g, " ")}
                            </label>
                            {isDangerous && (
                              <span className="text-[10px] bg-red/10 text-red border border-red/20 px-1.5 py-0.5 rounded font-bold">
                                HIGH IMPACT
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {!editable && (
                              <span className="text-[10px] text-purple font-bold flex items-center gap-1">
                                <Lock size={9} /> CEO ONLY
                              </span>
                            )}
                            {justSaved && (
                              <span className="text-[10px] text-green font-bold flex items-center gap-1">
                                <CheckCircle2 size={9} /> SAVED
                              </span>
                            )}
                            {changed && editable && !justSaved && (
                              <span className="text-[10px] text-yellow font-bold">UNSAVED</span>
                            )}
                          </div>
                        </div>
                        <p className="text-textDim text-xs mb-2">{(group.descriptions as any)[key]}</p>

                        {/* Current saved value */}
                        {config[key] !== undefined && (
                          <p className="text-[10px] text-textDim mb-1.5 font-mono">
                            Saved:{" "}
                            <span className={`font-bold ${changed ? "text-textMuted line-through" : "text-textMuted"}`}>
                              {config[key] || "—"}
                            </span>
                            {changed && (
                              <span className="text-cyan ml-1">→ {edited[key] || "—"}</span>
                            )}
                          </p>
                        )}

                        <div className="flex gap-2">
                          <Input
                            value={edited[key] ?? ""}
                            onChange={(e) => { if (editable) setEdited(prev => ({ ...prev, [key]: e.target.value })); }}
                            disabled={!editable}
                            className={
                              changed && editable
                                ? isDangerous ? "border-red/40" : "border-yellow/50"
                                : justSaved ? "border-green/30" : ""
                            }
                          />
                          {changed && editable && (
                            <Button
                              variant="ghost"
                              onClick={() => resetKey(key)}
                              title="Reset to saved value">
                              <RotateCcw size={13} />
                            </Button>
                          )}
                          <Button
                            onClick={() => handleSave(key)}
                            loading={saving === key}
                            disabled={!changed || !editable}
                            variant={changed && editable ? (isDangerous ? "danger" : "primary") : "secondary"}>
                            <Save size={13} /> Save
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}
          </>
        )}
      </div>
    </AdminShell>
  );
}
