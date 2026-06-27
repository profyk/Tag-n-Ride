"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Button, Modal, Spinner } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { CheckCircle, Clock, TrendingDown, AlertTriangle, RefreshCw, Phone } from "lucide-react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

function daysAgo(date: string) {
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

const AVATAR_COLORS = [
  "bg-cyan/20 text-cyan",
  "bg-purple/20 text-purple",
  "bg-green/20 text-green",
  "bg-yellow/20 text-yellow",
  "bg-orange-400/20 text-orange-400",
];

function Avatar({ name }: { name: string }) {
  const idx = (name?.charCodeAt(0) ?? 0) % 5;
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${AVATAR_COLORS[idx]}`}>
      {name?.slice(0, 2).toUpperCase() || "??"}
    </div>
  );
}

const KYC_CLS: Record<string, string> = {
  approved: "bg-green/10 border-green/20 text-green",
  pending:  "bg-yellow/10 border-yellow/20 text-yellow",
  rejected: "bg-red/10 border-red/20 text-red",
};

const ROLE_CLS: Record<string, string> = {
  driver:    "bg-cyan/10 border-cyan/20 text-cyan",
  passenger: "bg-purple/10 border-purple/20 text-purple",
  owner:     "bg-yellow/10 border-yellow/20 text-yellow",
};

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
  const [selected, setSelected] = useState<any | null>(null);

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
      setSelected(null);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const funnel = data?.funnel;
  const conversionRate = funnel?.total_drivers_registered > 0
    ? Math.round((funnel.fully_verified / funnel.total_drivers_registered) * 100)
    : 0;

  const pending = data?.pending_verification || [];
  const stuckInKyc = pending.filter((d: any) => d.kyc_status === "pending" && daysAgo(d.registered) > 3);
  const newThisWeek = (data?.recent_signups || []).filter((u: any) => daysAgo(u.created_at) <= 7).length;
  const sorted = [...pending].sort((a: any, b: any) => new Date(a.registered).getTime() - new Date(b.registered).getTime());

  return (
    <AdminShell title="Onboarding Pipeline">
      <div className="space-y-6">

        {stuckInKyc.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-yellow/10 border border-yellow/20 flex-wrap">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-yellow" />
              <p className="text-sm text-yellow font-semibold">
                {stuckInKyc.length} driver{stuckInKyc.length !== 1 ? "s have" : " has"} been stuck in KYC for over 3 days.
              </p>
            </div>
            <a href="/admin/kyc">
              <button className="text-xs font-bold px-3 py-1.5 rounded-lg border border-yellow/30 text-yellow hover:bg-yellow/10 transition-colors">
                Review KYC →
              </button>
            </a>
          </div>
        )}

        {/* Stats strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Pending Verification", value: pending.length,        color: pending.length > 0 ? "text-yellow" : "text-green" },
            { label: "Stuck in KYC (3d+)",   value: stuckInKyc.length,    color: stuckInKyc.length > 0 ? "text-red" : "text-green" },
            { label: "Conversion Rate",       value: `${conversionRate}%`, color: conversionRate >= 70 ? "text-green" : conversionRate >= 40 ? "text-yellow" : "text-red" },
            { label: "New Signups This Week", value: newThisWeek,           color: "text-cyan" },
          ].map(s => (
            <div key={s.label} className="bg-bg2 border border-border rounded-xl p-4">
              <p className="text-[9px] font-bold text-textDim uppercase tracking-wider mb-1">{s.label}</p>
              <p className={`text-2xl font-black tabular-nums ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Funnel */}
        {funnel && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <h2 className="text-text font-bold mb-4">Driver Onboarding Funnel</h2>
              <div className="space-y-3">
                {[
                  { label: "Registered",     value: funnel.total_drivers_registered, color: "bg-cyan",   textColor: "text-cyan" },
                  { label: "KYC Submitted",  value: funnel.kyc_submitted,            color: "bg-yellow", textColor: "text-yellow" },
                  { label: "KYC Approved",   value: funnel.kyc_approved,             color: "bg-purple", textColor: "text-purple" },
                  { label: "Fully Verified", value: funnel.fully_verified,           color: "bg-green",  textColor: "text-green" },
                ].map((step) => {
                  const pct = funnel.total_drivers_registered > 0
                    ? Math.round((step.value / funnel.total_drivers_registered) * 100) : 0;
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
                        <div className={`h-full ${step.color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card>
              <h2 className="text-text font-bold mb-4">Drop-off Analysis</h2>
              <div className="space-y-1">
                <DropoffRate from={funnel.total_drivers_registered} to={funnel.kyc_submitted} label="Registration → KYC submission" />
                <DropoffRate from={funnel.kyc_submitted} to={funnel.kyc_approved} label="KYC submitted → KYC approved" />
                <DropoffRate from={funnel.kyc_approved} to={funnel.fully_verified} label="KYC approved → fully verified" />
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
                <button onClick={load} className="flex items-center gap-1.5 text-xs text-textMuted hover:text-cyan transition-colors">
                  <RefreshCw size={12} /> Refresh
                </button>
              </div>
            </Card>
          </div>
        )}

        {/* Pending verification table */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-text font-bold">Pending Driver Verification</h2>
              {sorted.length > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow/10 border border-yellow/20 text-yellow font-black">
                  {sorted.length} pending
                </span>
              )}
            </div>
            <button onClick={load} className="flex items-center gap-1.5 text-xs text-textMuted hover:text-cyan transition-colors">
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
          {loading ? <Spinner /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-bg3">
                    {["Driver", "Phone", "Plate", "KYC Status", "Waiting", "Registered", "Action"].map(h => (
                      <th key={h} className="text-left py-3 px-4 text-[10px] font-bold text-textDim uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.length === 0 ? (
                    <tr><td colSpan={7} className="py-12 text-center text-textMuted">No pending verifications</td></tr>
                  ) : sorted.map((d: any) => {
                    const days = daysAgo(d.registered);
                    const isStuck = days > 3;
                    return (
                      <tr
                        key={d.user_id}
                        className={`border-b border-border hover:bg-bg3/50 transition-colors cursor-pointer ${isStuck ? "bg-yellow/3" : ""}`}
                        onClick={() => setSelected(d)}
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Avatar name={d.full_name} />
                            <span className="font-bold text-text">{d.full_name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-textMuted">{d.phone_number}</td>
                        <td className="py-3 px-4">
                          {d.vehicle_plate ? (
                            <span className="font-mono text-xs bg-yellow/10 text-yellow px-2 py-0.5 rounded border border-yellow/20">
                              {d.vehicle_plate}
                            </span>
                          ) : <span className="text-textDim">No plate</span>}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-black capitalize ${
                            KYC_CLS[d.kyc_status] || "bg-bg3 border-border text-textMuted"
                          }`}>
                            {d.kyc_status}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1">
                            <Clock size={10} className={isStuck ? "text-yellow" : "text-textDim"} />
                            <span className={`font-bold ${isStuck ? "text-yellow" : "text-textMuted"}`}>{days}d</span>
                            {isStuck && <span className="text-[9px] text-yellow/70">stuck</span>}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-textMuted">{formatDate(d.registered)}</td>
                        <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                          <button
                            disabled={d.kyc_status !== "approved"}
                            onClick={() => handleVerify(d.user_id, d.full_name)}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[10px] font-bold transition-all ${
                              d.kyc_status === "approved"
                                ? "border-green/30 text-green bg-green/5 hover:bg-green/10"
                                : "border-border text-textDim cursor-not-allowed"
                            }`}
                          >
                            <CheckCircle size={10} />
                            {d.kyc_status === "approved" ? "Verify" : "Awaiting KYC"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Recent signups */}
        <Card>
          <h2 className="text-text font-bold mb-4">Recent Signups (7 days)</h2>
          {loading ? <Spinner /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-bg3">
                    {["Name", "Phone", "Role", "Balance", "Joined"].map(h => (
                      <th key={h} className="text-left py-3 px-4 text-[10px] font-bold text-textDim uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {!data?.recent_signups?.length ? (
                    <tr><td colSpan={5} className="py-10 text-center text-textMuted">No recent signups</td></tr>
                  ) : data.recent_signups.map((u: any) => (
                    <tr key={u.id} className="border-b border-border hover:bg-bg3/50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Avatar name={u.full_name} />
                          <span className="font-bold text-text">{u.full_name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-textMuted">{u.phone_number}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-black capitalize ${
                          ROLE_CLS[u.role] || "bg-bg3 border-border text-textMuted"
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={u.balance > 0 ? "font-bold text-green tabular-nums" : "text-textMuted"}>
                          R{u.balance?.toFixed(2) || "0.00"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-textMuted">{formatDate(u.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Driver detail modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title="Driver Detail">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-bg3 rounded-xl border border-border">
              <Avatar name={selected.full_name} />
              <div className="min-w-0">
                <p className="text-text font-bold text-base">{selected.full_name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Phone size={10} className="text-textDim" />
                  <p className="text-textMuted text-xs font-mono">{selected.phone_number}</p>
                </div>
              </div>
              <div className="ml-auto flex-shrink-0">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-black capitalize ${
                  KYC_CLS[selected.kyc_status] || "bg-bg3 border-border text-textMuted"
                }`}>
                  KYC: {selected.kyc_status}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-bg3 rounded-xl border border-border">
                <p className="text-[10px] text-textDim uppercase tracking-widest font-bold mb-1">Vehicle Plate</p>
                {selected.vehicle_plate ? (
                  <span className="font-mono text-sm bg-yellow/10 text-yellow px-2 py-0.5 rounded border border-yellow/20">
                    {selected.vehicle_plate}
                  </span>
                ) : <p className="text-textDim text-sm">Not set</p>}
              </div>
              <div className="p-3 bg-bg3 rounded-xl border border-border">
                <p className="text-[10px] text-textDim uppercase tracking-widest font-bold mb-1">Waiting Time</p>
                <p className={`text-sm font-bold ${daysAgo(selected.registered) > 3 ? "text-yellow" : "text-text"}`}>
                  {daysAgo(selected.registered)} days
                  {daysAgo(selected.registered) > 3 && <span className="text-yellow/70 text-xs font-normal ml-1">— stuck</span>}
                </p>
              </div>
              <div className="p-3 bg-bg3 rounded-xl border border-border col-span-2">
                <p className="text-[10px] text-textDim uppercase tracking-widest font-bold mb-1">Registered</p>
                <p className="text-sm text-text">{formatDate(selected.registered)}</p>
              </div>
            </div>

            {selected.kyc_status === "approved" ? (
              <div className="flex gap-3 justify-end pt-1">
                <Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>
                <Button onClick={() => handleVerify(selected.user_id, selected.full_name)}>
                  <CheckCircle size={13} /> Approve & Verify Driver
                </Button>
              </div>
            ) : (
              <div className="flex items-start gap-3 p-3 bg-yellow/5 border border-yellow/20 rounded-xl">
                <AlertTriangle size={13} className="text-yellow flex-shrink-0 mt-0.5" />
                <p className="text-yellow text-xs">
                  {selected.kyc_status === "pending"
                    ? "KYC documents are under review. Visit the KYC page to approve before verifying this driver."
                    : "KYC was rejected. Driver needs to resubmit documents before verification is possible."}
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </AdminShell>
  );
}
