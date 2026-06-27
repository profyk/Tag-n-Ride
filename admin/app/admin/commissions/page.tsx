"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Button, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import type { CommissionRequest } from "@/lib/api";
import toast from "react-hot-toast";
import { formatDate } from "@/lib/utils";
import {
  CheckCircle, XCircle, Clock, Play, Save, Percent,
  Edit2, X, Check, AlertTriangle, Info, Users,
} from "lucide-react";

const STATUS: Record<string, { color: string; icon: any }> = {
  approved: { color: "text-green border-green/20 bg-green/10",   icon: CheckCircle },
  rejected: { color: "text-red border-red/20 bg-red/10",         icon: XCircle     },
  pending:  { color: "text-yellow border-yellow/20 bg-yellow/10", icon: Clock      },
};

const AVATAR_COLORS = [
  "bg-cyan/20 text-cyan border-cyan/30",
  "bg-purple/20 text-purple border-purple/30",
  "bg-green/20 text-green border-green/30",
  "bg-yellow/20 text-yellow border-yellow/30",
  "bg-orange-400/20 text-orange-400 border-orange-400/30",
];
function Avatar({ name }: { name: string }) {
  const idx = (name || "?").charCodeAt(0) % AVATAR_COLORS.length;
  const initials = (name || "?").split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("");
  return (
    <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-[10px] font-black flex-shrink-0 ${AVATAR_COLORS[idx]}`}>
      {initials}
    </div>
  );
}

function SplitBar({ driverPct }: { driverPct: number }) {
  const ownerPct = 100 - driverPct;
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-2 bg-bg3 rounded-full overflow-hidden flex">
        <div className="bg-cyan h-full transition-all" style={{ width: `${driverPct}%` }} />
        <div className="bg-purple h-full transition-all" style={{ width: `${ownerPct}%` }} />
      </div>
      <div className="text-[10px] flex gap-1 whitespace-nowrap">
        <span className="text-cyan font-bold">{driverPct.toFixed(0)}d</span>
        <span className="text-textDim">/</span>
        <span className="text-purple font-bold">{ownerPct.toFixed(0)}o</span>
      </div>
    </div>
  );
}

type FilterKey = "pending" | "approved" | "rejected" | "all";

export default function CommissionsPage() {
  const [rows,            setRows]            = useState<CommissionRequest[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [filter,          setFilter]          = useState<FilterKey>("pending");
  const [acting,          setActing]          = useState<string | null>(null);

  const [cashupTime,      setCashupTime]      = useState("");
  const [savedTime,       setSavedTime]       = useState<string | null>(null);
  const [savingTime,      setSavingTime]      = useState(false);
  const [triggering,      setTriggering]      = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);

  const [defaultPct,      setDefaultPct]      = useState<number>(50);
  const [defaultPctInput, setDefaultPctInput] = useState("50");
  const [savingDefault,   setSavingDefault]   = useState(false);

  const [overrideEdit,    setOverrideEdit]    = useState<string | null>(null);
  const [overridePct,     setOverridePct]     = useState("");
  const [overriding,      setOverriding]      = useState<string | null>(null);

  const load = (status?: string) => {
    setLoading(true);
    api.commissionRequests(status || undefined)
      .then(r => setRows(r.data))
      .catch(() => toast.error("Failed to load commission requests"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(filter === "all" ? undefined : filter);
    api.getPayoutSettings()
      .then(r => {
        const t = r.data.commission_auto_cashup_time || "";
        setCashupTime(t); setSavedTime(t || null);
        const pct = r.data.default_commission_pct ?? 50;
        setDefaultPct(pct); setDefaultPctInput(String(pct));
      })
      .finally(() => setSettingsLoading(false));
  }, [filter]);

  const act = async (id: string, action: "approve" | "reject") => {
    setActing(id);
    try {
      await api.reviewCommission(id, action);
      toast.success(`Commission ${action}d`);
      load(filter === "all" ? undefined : filter);
    } catch (e: any) { toast.error(e?.message || `Failed to ${action}`); }
    finally { setActing(null); }
  };

  const saveTime = async () => {
    setSavingTime(true);
    try {
      await api.updatePayoutSettings({ commission_auto_cashup_time: cashupTime || null });
      setSavedTime(cashupTime || null);
      toast.success(cashupTime ? `Auto-cashup set for ${cashupTime} SAST` : "Auto-cashup disabled");
    } catch { toast.error("Failed to save schedule"); }
    finally { setSavingTime(false); }
  };

  const saveDefaultPct = async () => {
    const val = parseFloat(defaultPctInput);
    if (isNaN(val) || val < 1 || val > 99) { toast.error("Enter 1–99"); return; }
    setSavingDefault(true);
    try {
      await api.updatePayoutSettings({ default_commission_pct: val });
      setDefaultPct(val);
      toast.success(`Standard: driver ${val}% / owner ${100 - val}%`);
    } catch { toast.error("Failed to save"); }
    finally { setSavingDefault(false); }
  };

  const runNow = async () => {
    setTriggering(true);
    try {
      const r = await api.triggerCommissionCashup();
      toast.success(r.data.message || "Auto-cashup triggered");
    } catch { toast.error("Failed to trigger cashup"); }
    finally { setTriggering(false); }
  };

  const submitOverride = async (id: string) => {
    const val = parseFloat(overridePct);
    if (isNaN(val) || val < 1 || val > 99) { toast.error("Enter 1–99"); return; }
    setOverriding(id);
    try {
      await api.overrideCommission(id, val);
      toast.success(`Override set: ${val}% driver / ${100 - val}% owner`);
      setOverrideEdit(null);
      load(filter === "all" ? undefined : filter);
    } catch (e: any) { toast.error(e?.message || "Override failed"); }
    finally { setOverriding(null); }
  };

  const pending  = rows.filter(r => r.commission_status === "pending").length;
  const approved = rows.filter(r => r.commission_status === "approved").length;
  const rejected = rows.filter(r => r.commission_status === "rejected").length;

  const TABS: { key: FilterKey; label: string }[] = [
    { key: "pending",  label: `Pending (${pending})`   },
    { key: "approved", label: `Approved (${approved})` },
    { key: "rejected", label: `Rejected (${rejected})` },
    { key: "all",      label: "All"                    },
  ];

  return (
    <AdminShell title="Commission Split" subtitle="Driver/owner earnings distribution and auto-cashup">
      <div className="space-y-5">

        {/* ── Stats strip ── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Pending Approval", value: pending,  color: "text-yellow", onClick: () => setFilter("pending")  },
            { label: "Approved",         value: approved, color: "text-green",  onClick: () => setFilter("approved") },
            { label: "Rejected",         value: rejected, color: "text-red",    onClick: () => setFilter("rejected") },
          ].map(s => (
            <button key={s.label} onClick={s.onClick}
              className="bg-bg2 border border-border rounded-xl p-4 text-left hover:border-cyan/20 transition-colors">
              <p className="text-[9px] font-bold text-textDim uppercase tracking-wider mb-2">{s.label}</p>
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            </button>
          ))}
        </div>

        {/* ── Pending alert ── */}
        {pending > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-yellow/5 border border-yellow/20 rounded-xl">
            <div className="flex items-center gap-2">
              <AlertTriangle size={13} className="text-yellow" />
              <p className="text-yellow text-xs font-bold">
                {pending} commission proposal{pending !== 1 ? "s" : ""} awaiting approval
              </p>
            </div>
            <button onClick={() => setFilter("pending")}
              className="text-[10px] text-yellow border border-yellow/30 rounded-lg px-3 py-1.5 hover:bg-yellow/10 font-bold transition-all whitespace-nowrap">
              Review
            </button>
          </div>
        )}

        {/* ── Settings panels ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <div className="flex items-center gap-2 mb-1">
              <Clock size={14} className="text-cyan" />
              <p className="font-bold text-text text-sm">Auto Cashup Schedule</p>
            </div>
            <p className="text-textDim text-[11px] mb-4 leading-relaxed">
              Daily SAST time to run automatic cashup. Driver's share is paid to their bank (R3.50 fee deducted); owner's share goes to wallet.
            </p>
            {settingsLoading ? <Spinner /> : (
              <div className="flex items-end gap-3 flex-wrap">
                <div>
                  <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
                    Time (SAST 24h)
                  </label>
                  <input
                    type="time"
                    value={cashupTime}
                    onChange={e => setCashupTime(e.target.value)}
                    className="bg-bg border border-border rounded-lg px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-cyan"
                  />
                </div>
                <Button onClick={saveTime} disabled={savingTime} loading={savingTime}>
                  <Save size={13} /> Save
                </Button>
                {cashupTime && (
                  <button onClick={() => setCashupTime("")}
                    className="text-xs text-red hover:underline font-bold">
                    Clear
                  </button>
                )}
                <Button onClick={runNow} disabled={triggering} loading={triggering} variant="secondary">
                  <Play size={13} /> Run Now
                </Button>
              </div>
            )}
            {savedTime && (
              <div className="mt-3 flex items-center gap-2 text-xs text-green font-bold bg-green/5 border border-green/20 rounded-lg px-3 py-2">
                <Clock size={11} /> Auto-cashup fires daily at {savedTime} SAST
              </div>
            )}
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-1">
              <Percent size={14} className="text-purple" />
              <p className="font-bold text-text text-sm">Standard Commission Split</p>
            </div>
            <p className="text-textDim text-[11px] mb-4 leading-relaxed">
              Platform-wide default driver % used when admin overrides directly. Owners may propose different splits per driver.
            </p>
            {settingsLoading ? <Spinner /> : (
              <div className="flex items-end gap-3 flex-wrap">
                <div>
                  <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
                    Driver keeps (%)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={defaultPctInput}
                      onChange={e => setDefaultPctInput(e.target.value)}
                      className="bg-bg border border-border rounded-lg px-3 py-2 text-sm font-mono text-cyan w-20 focus:outline-none focus:border-cyan"
                    />
                    <span className="text-textDim text-xs">
                      / owner {isNaN(parseFloat(defaultPctInput)) ? "—" : Math.round(100 - parseFloat(defaultPctInput))}%
                    </span>
                  </div>
                </div>
                <Button onClick={saveDefaultPct} disabled={savingDefault} loading={savingDefault}>
                  <Percent size={13} /> Save
                </Button>
              </div>
            )}
            <div className="mt-3 flex items-center gap-2 text-xs font-bold bg-purple/5 border border-purple/20 rounded-lg px-3 py-2">
              <SplitBar driverPct={defaultPct} />
              <span className="text-textMuted">default</span>
            </div>
          </Card>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 border-b border-border">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setFilter(t.key)}
              className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
                filter === t.key ? "text-cyan border-cyan" : "text-textMuted border-transparent hover:text-text"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Table ── */}
        {loading ? <Spinner /> : (
          <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-bg3">
                    {["Owner", "Driver", "Split", "Status", "Date", "Actions"].map(h => (
                      <th key={h} className="text-left py-3 px-4 text-[10px] font-bold text-textDim uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center">
                        <Users size={20} className="mx-auto text-textDim mb-2" />
                        <p className="text-textMuted">No commission requests found</p>
                      </td>
                    </tr>
                  ) : rows.map(r => {
                    const s = STATUS[r.commission_status] || STATUS["pending"];
                    return (
                      <tr key={r.id} className="border-b border-border hover:bg-bg3/50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Avatar name={r.owner_name} />
                            <div>
                              <p className="font-bold text-text">{r.owner_name}</p>
                              <p className="text-textDim text-[10px] font-mono">{r.owner_phone}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Avatar name={r.driver_name} />
                            <div>
                              <p className="font-bold text-text">{r.driver_name}</p>
                              <p className="text-textDim text-[10px] font-mono">{r.driver_phone}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {overrideEdit === r.id ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min={1}
                                max={99}
                                value={overridePct}
                                onChange={e => setOverridePct(e.target.value)}
                                autoFocus
                                className="bg-bg border border-cyan rounded px-2 py-1 text-sm font-mono text-cyan w-16 focus:outline-none"
                              />
                              <span className="text-textDim text-[10px]">%d</span>
                              <button onClick={() => submitOverride(r.id)} disabled={overriding === r.id}
                                className="p-1 rounded text-green hover:bg-green/10 transition-all">
                                {overriding === r.id ? <Spinner /> : <Check size={13} />}
                              </button>
                              <button onClick={() => setOverrideEdit(null)}
                                className="p-1 rounded text-textDim hover:text-text transition-all">
                                <X size={13} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 group">
                              <SplitBar driverPct={r.driver_commission_pct} />
                              <button
                                onClick={() => { setOverrideEdit(r.id); setOverridePct(String(r.driver_commission_pct)); }}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded text-textDim hover:text-cyan transition-all"
                                title="Admin override">
                                <Edit2 size={11} />
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-black capitalize ${s.color}`}>
                            <s.icon size={9} /> {r.commission_status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-textDim whitespace-nowrap">
                          {r.commission_approved_at ? formatDate(r.commission_approved_at) : "—"}
                        </td>
                        <td className="py-3 px-4">
                          {r.commission_status === "pending" && (
                            <div className="flex gap-1.5">
                              <button onClick={() => act(r.id, "approve")} disabled={acting === r.id}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-green/20 text-green text-[10px] font-bold hover:bg-green/10 transition-all">
                                <CheckCircle size={10} /> Approve
                              </button>
                              <button onClick={() => act(r.id, "reject")} disabled={acting === r.id}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red/20 text-red text-[10px] font-bold hover:bg-red/10 transition-all">
                                <XCircle size={10} /> Reject
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── How it works ── */}
        <div className="flex items-start gap-3 px-4 py-4 bg-bg2 border border-border rounded-xl">
          <Info size={14} className="text-cyan flex-shrink-0 mt-0.5" />
          <div className="text-[11px] text-textDim space-y-1 leading-relaxed">
            <p className="text-text font-bold text-xs mb-2">How Commission Split Works</p>
            <p>• Owner proposes a % split per driver, or admin sets it directly using the pencil icon</p>
            <p>• Admin approves proposals here; overrides take effect immediately without approval</p>
            <p>• At cashup time: today's fuel is deducted first, then remaining earnings are split</p>
            <p>• <span className="text-cyan font-bold">Driver's share</span> → paid to bank account (R3.50 gateway fee deducted)</p>
            <p>• <span className="text-purple font-bold">Owner's share</span> → transferred to owner wallet</p>
            <p>• If driver has no bank account on file, their share stays in wallet until added</p>
          </div>
        </div>

      </div>
    </AdminShell>
  );
}
