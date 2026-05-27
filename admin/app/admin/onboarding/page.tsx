"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Spinner } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { CheckCircle, Clock, TrendingDown, AlertTriangle, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

function daysAgo(date: string) {
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

function DropoffRate({ from, to, label }: { from: number; to: number; label: string }) {
  if (!from) return null;
  const rate = Math.round(((from - to) / from) * 100);
  return (
    <div className="flex items-center justify-between text-xs py-1">
      <span className="text-textMuted">{label}</span>
      <div className="flex items-center gap-1.5">
        <TrendingDown size={11} className={rate > 50 ? "text-red" : rate > 25 ? "text-yellow" : "text-green"} />
        <span className={`font-bold ${rate > 50 ? "text-red" : rate > 25 ? "text-yellow" : "text-green"}`}>
          {rate}% drop-off
        </span>
      </div>
    </div>
  );
}

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
  const conversionRate = funnel?.total_drivers_registered > 0
    ? Math.round((funnel.fully_verified / funnel.total_drivers_registered) * 100)
    : 0;

  const stuckInKyc = data?.pending_verification?.filter(
    (d: any) => d.kyc_status === "pending" && daysAgo(d.registered) > 3
  ) || [];

  return (
    <AdminShell title="Onboarding Pipeline">
      <div className="space-y-6">

        {/* Action needed banner */}
        {stuckInKyc.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-yellow/10 border border-yellow/20">
            <AlertTriangle size={14} className="text-yellow" />
            <p className="text-sm text-yellow font-semibold">
              {stuckInKyc.length} driver{stuckInKyc.length !== 1 ? "s have" : " has"} been stuck in KYC for over 3 days — review pending submissions.
            </p>
          </div>
        )}

        {/* Funnel */}
        {funnel && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <h2 className="text-text font-bold mb-4">Driver Onboarding Funnel</h2>
              <div className="space-y-3">
                {[
                  { label: "Registered", value: funnel.total_drivers_registered, color: "bg-cyan", textColor: "text-cyan" },
                  { label: "KYC Submitted", value: funnel.kyc_submitted, color: "bg-yellow", textColor: "text-yellow" },
                  { label: "KYC Approved", value: funnel.kyc_approved, color: "bg-purple", textColor: "text-purple" },
                  { label: "Fully Verified", value: funnel.fully_verified, color: "bg-green", textColor: "text-green" },
                ].map((step, i, arr) => {
                  const pct = funnel.total_drivers_registered > 0
                    ? Math.round((step.value / funnel.total_drivers_registered) * 100)
                    : 0;
                  return (
                    <div key={step.label}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-text text-sm font-semibold">{step.label}</span>
                        <div className="flex items-center gap-2">
                          <span className={`font-extrabold text-sm ${step.textColor}`}>{step.value}</span>
                          <span className="text-textMuted text-xs">{pct}%</span>
                        </div>
                      </div>
                      <div className="h-2 bg-bg3 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${step.color} rounded-full transition-all`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card>
              <h2 className="text-text font-bold mb-4">Drop-off Analysis</h2>
              <div className="space-y-1">
                <DropoffRate
                  from={funnel.total_drivers_registered}
                  to={funnel.kyc_submitted}
                  label="Registration → KYC submission"
                />
                <DropoffRate
                  from={funnel.kyc_submitted}
                  to={funnel.kyc_approved}
                  label="KYC submitted → KYC approved"
                />
                <DropoffRate
                  from={funnel.kyc_approved}
                  to={funnel.fully_verified}
                  label="KYC approved → fully verified"
                />
              </div>

              <div className="mt-6 pt-4 border-t border-border">
                <p className="text-[10px] text-textMuted uppercase tracking-widest font-bold mb-3">Overall Health</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-3 bg-bg3 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan via-purple to-green rounded-full transition-all"
                      style={{ width: `${conversionRate}%` }}
                    />
                  </div>
                  <span className={`font-extrabold text-sm ${conversionRate > 50 ? "text-green" : conversionRate > 25 ? "text-yellow" : "text-red"}`}>
                    {conversionRate}%
                  </span>
                </div>
                <p className="text-textDim text-xs mt-1">of registered drivers fully verified</p>
              </div>

              <div className="flex justify-end mt-4">
                <Button variant="secondary" onClick={load}>
                  <RefreshCw size={13} /> Refresh
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Pending verification table */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-text font-bold">Pending Driver Verification</h2>
              {data?.pending_verification?.length > 0 && (
                <span className="text-sm text-yellow font-normal">
                  ({data.pending_verification.length} pending)
                </span>
              )}
            </div>
          </div>
          {loading ? <Spinner /> : (
            <Table
              headers={["Driver", "Phone", "Plate", "KYC", "Waiting", "Registered", "Action"]}
              empty={!data?.pending_verification?.length}>
              {data?.pending_verification
                ?.sort((a: any, b: any) => new Date(a.registered).getTime() - new Date(b.registered).getTime())
                .map((d: any) => {
                  const days = daysAgo(d.registered);
                  const isStuck = days > 3;
                  return (
                    <Tr key={d.user_id} className={isStuck ? "bg-yellow/3" : ""}>
                      <Td className="font-semibold">{d.full_name}</Td>
                      <Td className="font-mono text-xs text-textMuted">{d.phone_number}</Td>
                      <Td>
                        {d.vehicle_plate ? (
                          <span className="font-mono text-xs bg-yellow/10 text-yellow px-2 py-0.5 rounded border border-yellow/20">
                            {d.vehicle_plate}
                          </span>
                        ) : <span className="text-textDim text-xs">No plate</span>}
                      </Td>
                      <Td>
                        <Badge
                          label={d.kyc_status}
                          tone={d.kyc_status === "approved" ? "green" : d.kyc_status === "pending" ? "yellow" : d.kyc_status === "rejected" ? "red" : "muted"}
                        />
                      </Td>
                      <Td>
                        <div className="flex items-center gap-1">
                          <Clock size={10} className={isStuck ? "text-yellow" : "text-textDim"} />
                          <span className={`text-xs ${isStuck ? "text-yellow font-bold" : "text-textMuted"}`}>
                            {days}d
                          </span>
                        </div>
                      </Td>
                      <Td className="text-textMuted text-xs">{formatDate(d.registered)}</Td>
                      <Td>
                        <Button
                          variant={d.kyc_status === "approved" ? "secondary" : "ghost"}
                          disabled={d.kyc_status !== "approved"}
                          onClick={() => handleVerify(d.user_id, d.full_name)}>
                          <CheckCircle size={12} />
                          {d.kyc_status === "approved" ? "Verify" : "Awaiting KYC"}
                        </Button>
                      </Td>
                    </Tr>
                  );
                })}
            </Table>
          )}
        </Card>

        {/* Recent signups */}
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
                  <Badge
                    label={u.role}
                    tone={u.role === "driver" ? "cyan" : u.role === "owner" ? "purple" : "muted"}
                  />
                </Td>
                <Td className={u.balance > 0 ? "text-green font-semibold" : "text-textMuted text-xs"}>
                  R{u.balance?.toFixed(2) || "0.00"}
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
