"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Button, Spinner, Input } from "@/components/ui";
import { isSuperAdmin } from "@/lib/api";
import { Save, Settings } from "lucide-react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

const CONFIG_GROUPS = [
  {
  label: "Withdrawal Settings",
  keys: ["auto_approve_withdrawal_limit"],
  descriptions: {
    auto_approve_withdrawal_limit: "Auto-approve withdrawals below this amount in ZAR (set to 0 to disable)",
  },
},
  {
    label: "Platform Fees",
    keys: ["platform_fee_percent"],
    descriptions: {
      platform_fee_percent: "Percentage fee on every payment (e.g. 3.0 = 3%)",
    },
  },
  {
    label: "Transaction Limits",
    keys: ["min_transfer_amount", "max_transfer_amount", "topup_max_amount"],
    descriptions: {
      min_transfer_amount: "Minimum payment amount in ZAR",
      max_transfer_amount: "Maximum single payment amount in ZAR",
      topup_max_amount: "Maximum single top-up amount in ZAR",
    },
  },
  {
    label: "Withdrawal Limits",
    keys: ["min_withdrawal_amount", "max_withdrawal_amount", "withdrawal_daily_limit"],
    descriptions: {
      min_withdrawal_amount: "Minimum withdrawal amount in ZAR",
      max_withdrawal_amount: "Maximum single withdrawal in ZAR",
      withdrawal_daily_limit: "Max total daily withdrawals per user in ZAR",
    },
  },
  {
    label: "App Settings",
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
    keys: ["support_whatsapp", "support_email"],
    descriptions: {
      support_whatsapp: "Support WhatsApp number (digits only, no +)",
      support_email: "Support email address",
    },
  },
];

export default function SettingsPage() {
  const router = useRouter();
  const superAdmin = isSuperAdmin();
  const [config, setConfig] = useState<Record<string, string>>({});
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

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
    setSaving(key);
    try {
      await fetch(`${BASE}/api/admin/config/${key}`, {
        method: "PATCH", headers: authHeaders(),
        body: JSON.stringify({ value: edited[key] }),
      });
      setConfig(prev => ({ ...prev, [key]: edited[key] }));
      toast.success(`${key.replace(/_/g, " ")} updated`);
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(null); }
  };

  const hasChanged = (key: string) => edited[key] !== config[key];
  if (!superAdmin) return null;

  return (
    <AdminShell title="Settings & Configuration">
      <div className="space-y-6 max-w-3xl">
        {loading ? <Spinner /> : (
          <>
            <div className="flex items-center gap-2 p-4 bg-yellow/10 border border-yellow/20 rounded-xl">
              <Settings size={16} className="text-yellow" />
              <p className="text-yellow text-sm font-medium">
                Changes take effect immediately. Superadmin only.
              </p>
            </div>

            {CONFIG_GROUPS.map(group => (
              <Card key={group.label}>
                <h2 className="text-text font-bold mb-4">{group.label}</h2>
                <div className="space-y-5">
                  {group.keys.map(key => (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest">
                          {key.replace(/_/g, " ")}
                        </label>
                        {hasChanged(key) && (
                          <span className="text-[10px] text-yellow font-bold">UNSAVED</span>
                        )}
                      </div>
                      <p className="text-textDim text-xs mb-2">
                        {(group.descriptions as any)[key]}
                      </p>
                      <div className="flex gap-2">
                        <Input
                          value={edited[key] || ""}
                          onChange={(e) => setEdited(prev => ({ ...prev, [key]: e.target.value }))}
                          className={hasChanged(key) ? "border-yellow/50" : ""}
                        />
                        <Button
                          onClick={() => handleSave(key)}
                          loading={saving === key}
                          disabled={!hasChanged(key)}
                          variant={hasChanged(key) ? "primary" : "secondary"}>
                          <Save size={13} /> Save
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </>
        )}
      </div>
    </AdminShell>
  );
}
