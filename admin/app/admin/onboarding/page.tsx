"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Spinner } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { CheckCircle } from "lucide-react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

export default function OnboardingPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch(`${BASE}/api/admin/onboarding/pipeline`, { headers: authHeaders() })
      .then(r => r.json()).then(setData).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleVerify = async (userId: string, name: string) => {
    try {
      await api.verifyDriver(userId);
      toast.success(`${name} verified`);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const funnel = data?.funnel;

  return (
    <AdminShell title="Onboarding Pipeline">
      <div className="space-y-6">

        {funnel && (
          <Card>
            <h2 className="text-text font-bold mb-4">Driver Onboarding Funnel</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              {[
                { label: "Registered", value: funnel.total_drivers_registered, color: "text-cyan" },
                { label: "KYC Submitted", value: funnel.kyc_submitted, color: "text-yellow" },
                { label: "KYC Approved", value: funnel.kyc_approved, color: "text-purple" },
                { label: "Fully Verified", value: funnel.fully_verified, color: "text-green" },
              ].map((f, i) => (
                <div key={f.label} className="text-center">
                  <p className={`text-3xl font-extrabold ${f.color}`}>{f.value}</p>
                  <p className="text-xs text-textMuted mt-1 font-semibold">{f.label}</p>
                  {i > 0 && funnel.total_drivers_registered > 0 && (
                    <p className="text-[10px] text-textDim mt-1">
                      {Math.round((f.value / funnel.total_drivers_registered) * 100)}% of registered
                    </p>
                  )}
                </div>
              ))}
            </div>
            {funnel.total_drivers_registered > 0 && (
              <div className="h-2 bg-bg3 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan via-purple to-green rounded-full transition-all"
                  style={{
                    width: `${Math.round(
                      (funnel.fully_verified / funnel.total_drivers_registered) * 100
                    )}%`,
                  }}
                />
              </div>
            )}
          </Card>
        )}

        <Card>
          <h2 className="text-text font-bold mb-4">
            Pending Driver Verification
            {data?.pending_verification?.length > 0 && (
              <span className="ml-2 text-sm text-yellow font-normal">
                ({data.pending_verification.length} pending)
              </span>
            )}
          </h2>
          {loading ? <Spinner /> : (
            <Table
              headers={["Driver", "Phone", "Plate", "KYC", "Registered", "Action"]}
              empty={!data?.pending_verification?.length}>
              {data?.pending_verification?.map((d: any) => (
                <Tr key={d.user_id}>
                  <Td className="font-semibold">{d.full_name}</Td>
                  <Td className="font-mono text-xs text-textMuted">{d.phone_number}</Td>
                  <Td>
                    {d.vehicle_plate ? (
                      <span className="font-mono text-xs bg-yellow/10 text-yellow px-2 py-0.5 rounded border border-yellow/20">
                        {d.vehicle_plate}
                      </span>
                    ) : "—"}
                  </Td>
                  <Td>
                    <Badge label={d.kyc_status}
                      tone={
                        d.kyc_status === "approved" ? "green"
                        : d.kyc_status === "pending" ? "yellow"
                        : d.kyc_status === "rejected" ? "red"
                        : "muted"
                      }
                    />
                  </Td>
                  <Td className="text-textMuted text-xs">{formatDate(d.registered)}</Td>
                  <Td>
                    <Button variant="secondary"
                      onClick={() => handleVerify(d.user_id, d.full_name)}>
                      <CheckCircle size={12} /> Verify
                    </Button>
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </Card>

        <Card>
          <h2 className="text-text font-bold mb-4">Recent Signups (7 days)</h2>
          <Table
            headers={["Name", "Phone", "Role", "Balance", "Joined"]}
            empty={!data?.recent_signups?.length}>
            {data?.recent_signups?.map((u: any) => (
              <Tr key={u.id}>
                <Td className="font-semibold">{u.full_name}</Td>
                <Td className="font-mono text-xs text-textMuted">{u.phone_number}</Td>
                <Td>
                  <Badge label={u.role}
                    tone={
                      u.role === "driver" ? "cyan"
                      : u.role === "owner" ? "purple"
                      : "muted"
                    }
                  />
                </Td>
                <Td className={u.balance > 0 ? "text-green font-semibold" : "text-textMuted text-xs"}>
                  R {u.balance?.toFixed(2) || "0.00"}
                </Td>
                <Td className="text-textMuted text-xs">{formatDate(u.created_at)}</Td>
              </Tr>
            ))}
          </Table>
        </Card>
      </div>
    </AdminShell>
  );
}
