"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Button, Modal, Input, Spinner } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  AlertTriangle, Plus, Trash2, ShieldOff, RefreshCw, Clock,
  ExternalLink, Copy, Search, X, ShieldCheck, Zap,
  TrendingUp, Users, Ban,
} from "lucide-react";
import toast from "react-hot-toast";
import Link from "next/link";
import { DangerPinModal, useDangerPin } from "@/components/DangerPinModal";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = (dangerToken?: string) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
  ...(dangerToken ? { "X-Danger-Token": dangerToken } : {}),
});

const BLACKLIST_REASONS = [
  "Confirmed fraudulent activity",
  "Multiple chargeback attempts",
  "Identity fraud detected",
  "Violent or threatening behaviour",
  "Repeated terms of service violations",
];

const AVATAR_COLORS = [
  "bg-red/20 text-red border-red/30",
  "bg-orange-400/20 text-orange-400 border-orange-400/30",
  "bg-yellow/20 text-yellow border-yellow/30",
  "bg-purple/20 text-purple border-purple/30",
  "bg-cyan/20 text-cyan border-cyan/30",
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

type Tab = "velocity" | "large" | "round" | "blacklist";

export default function CompliancePage() {
  const [data,              setData]            = useState<any>(null);
  const [blacklist,         setBlacklist]       = useState<any[]>([]);
  const [loading,           setLoading]         = useState(true);
  const [tab,               setTab]             = useState<Tab>("velocity");
  const [lastRefreshed,     setLastRefreshed]   = useState<Date | null>(null);
  const [countdown,         setCountdown]       = useState(60);
  const [addModal,          setAddModal]        = useState(false);
  const [phone,             setPhone]           = useState("");
  const [reason,            setReason]          = useState("");
  const [blacklistSearch,   setBlacklistSearch] = useState("");
  const [removeConfirm,     setRemoveConfirm]   = useState<string | null>(null);
  const dangerPin = useDangerPin();
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setCountdown(60);
    try {
      const [alerts, bl] = await Promise.all([
        fetch(`${BASE}/api/admin/compliance/alerts`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${BASE}/api/admin/blacklist`, { headers: authHeaders() }).then(r => r.json()),
      ]);
      setData(alerts);
      setBlacklist(Array.isArray(bl) ? bl : []);
      setLastRefreshed(new Date());
    } catch {
      toast.error("Failed to load compliance data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    timerRef.current = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => {
      clearInterval(interval);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [load]);

  const handleAddBlacklist = async () => {
    if (!phone.trim() || !reason.trim()) { toast.error("Fill all fields"); return; }
    try {
      await fetch(`${BASE}/api/admin/blacklist`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ phone_number: phone.trim(), reason: reason.trim() }),
      });
      toast.success("Added to blacklist");
      setAddModal(false); setPhone(""); setReason("");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const doRemove = async () => {
    if (!removeConfirm) return;
    const id = removeConfirm;
    setRemoveConfirm(null);
    const token = await dangerPin.request();
    if (!token) return;
    try {
      await fetch(`${BASE}/api/admin/blacklist/${id}`, {
        method: "DELETE",
        headers: authHeaders(token),
      });
      toast.success("Removed from blacklist");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const copyPhone = (p: string) => { navigator.clipboard.writeText(p); toast.success("Copied"); };

  const velocityAlerts: any[]   = data?.velocity_alerts  || [];
  const largeTxns: any[]        = data?.large_transactions || [];
  const roundAlerts: any[]      = data?.round_amount_alerts || [];

  const filteredBlacklist = blacklist.filter(b =>
    !blacklistSearch ||
    b.phone_number?.includes(blacklistSearch) ||
    b.reason?.toLowerCase().includes(blacklistSearch.toLowerCase())
  );

  const TABS: { key: Tab; label: string; count: number; color?: string }[] = [
    { key: "velocity",   label: "Velocity Alerts",  count: velocityAlerts.length,  color: velocityAlerts.length > 0 ? "text-red" : undefined    },
    { key: "large",      label: "Large Txns (24h)", count: largeTxns.length,        color: largeTxns.length > 0 ? "text-yellow" : undefined       },
    { key: "round",      label: "Round Amounts",    count: roundAlerts.length,      color: roundAlerts.length > 0 ? "text-purple" : undefined      },
    { key: "blacklist",  label: "Blacklist",         count: blacklist.length,        color: blacklist.length > 0 ? "text-red" : undefined           },
  ];

  return (
    <AdminShell title="Compliance & Risk" subtitle="Live monitoring, AML signals, and access controls">
      <div className="space-y-5">

        {/* ── Stats strip ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {
              label: "Velocity Alerts",
              value: velocityAlerts.length.toString(),
              sub: velocityAlerts.length > 0 ? "Unusual tx frequency" : "All clear",
              color: velocityAlerts.length > 0 ? "text-red" : "text-green",
              icon: Zap,
            },
            {
              label: "Large Txns (24h)",
              value: largeTxns.length.toString(),
              sub: "High-value transactions",
              color: largeTxns.length > 0 ? "text-yellow" : "text-textMuted",
              icon: TrendingUp,
            },
            {
              label: "Round Amount Flags",
              value: roundAlerts.length.toString(),
              sub: "Potential structuring",
              color: roundAlerts.length > 0 ? "text-purple" : "text-textMuted",
              icon: AlertTriangle,
            },
            {
              label: "Blacklisted Users",
              value: blacklist.length.toString(),
              sub: "Platform access denied",
              color: blacklist.length > 0 ? "text-red" : "text-textMuted",
              icon: Ban,
            },
          ].map(s => (
            <div key={s.label} className="bg-bg2 border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] font-bold text-textDim uppercase tracking-wider">{s.label}</p>
                <s.icon size={12} className={s.color} />
              </div>
              <p className={`text-2xl font-black tabular-nums ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-textDim mt-1">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Critical alert banner ── */}
        {velocityAlerts.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-red/5 border border-red/20 rounded-xl">
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-red" />
              <p className="text-red text-xs font-bold">
                {velocityAlerts.length} velocity alert{velocityAlerts.length !== 1 ? "s" : ""} require immediate review — unusual transaction frequency detected
              </p>
            </div>
            <button onClick={() => setTab("velocity")}
              className="text-[10px] text-red border border-red/30 rounded-lg px-3 py-1.5 hover:bg-red/10 font-bold transition-all whitespace-nowrap">
              Review Now
            </button>
          </div>
        )}

        {/* ── Tabs + refresh ── */}
        <div className="flex gap-1 border-b border-border overflow-x-auto">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
                tab === t.key ? "text-cyan border-cyan" : "text-textMuted border-transparent hover:text-text"
              }`}>
              <span className={tab !== t.key && t.color ? t.color : ""}>{t.label}</span>
              <span className={`ml-1 ${t.count > 0 ? (tab === t.key ? "text-cyan" : (t.color || "text-textDim")) : "text-textDim"}`}>
                ({t.count})
              </span>
            </button>
          ))}
          <div className="ml-auto flex items-center gap-3 pb-1 pl-3">
            <span className="text-[10px] text-textDim flex items-center gap-1">
              <Clock size={10} /> {countdown}s
            </span>
            <button onClick={load} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-textMuted hover:text-cyan border border-border rounded-lg transition-all">
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {loading && !data ? <Spinner /> : (
          <>
            {/* ═══════════════════════════════════════════════ VELOCITY ══ */}
            {tab === "velocity" && (
              velocityAlerts.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 border border-green/20 bg-green/5 rounded-xl">
                  <ShieldCheck size={28} className="text-green" />
                  <p className="text-green font-bold">No velocity alerts</p>
                  <p className="text-textDim text-sm">No unusual transaction frequency detected</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {velocityAlerts.map((a: any) => (
                    <div key={a.user_id} className="bg-bg2 border border-red/20 rounded-xl p-4 flex items-center gap-4">
                      <Avatar name={a.full_name} />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-text">{a.full_name}</p>
                        <p className="text-textDim text-[11px] font-mono">{a.phone_number}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-red font-black text-xl tabular-nums">{a.txn_count}</p>
                        <p className="text-[9px] text-textDim uppercase font-bold">txns/hr</p>
                      </div>
                      <div className="text-center">
                        <p className="text-yellow font-bold tabular-nums">{formatZAR(a.total_amount)}</p>
                        <p className="text-[9px] text-textDim uppercase font-bold">total</p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => copyPhone(a.phone_number)}
                          className="p-2 rounded-lg border border-border text-textDim hover:text-cyan transition-all">
                          <Copy size={12} />
                        </button>
                        <Link href={`/admin/support?q=${encodeURIComponent(a.phone_number)}`}>
                          <button className="flex items-center gap-1 px-3 py-2 rounded-lg border border-red/20 text-red text-[10px] font-bold hover:bg-red/10 transition-all">
                            <ExternalLink size={11} /> Investigate
                          </button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* ═══════════════════════════════════════════════ LARGE TXNS ══ */}
            {tab === "large" && (
              largeTxns.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 border border-border rounded-xl">
                  <ShieldCheck size={28} className="text-textDim" />
                  <p className="text-textMuted font-bold">No large transactions in the last 24 hours</p>
                </div>
              ) : (
                <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-bg3">
                          {["Reference", "Amount", "Sender", "Receiver", "Date"].map(h => (
                            <th key={h} className="text-left py-3 px-4 text-[10px] font-bold text-textDim uppercase tracking-wider">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {largeTxns.map((t: any) => (
                          <tr key={t.id} className="border-b border-border hover:bg-bg3/50 transition-colors">
                            <td className="py-3 px-4 font-mono text-[11px] text-textMuted">{t.reference}</td>
                            <td className="py-3 px-4 font-black text-yellow tabular-nums">{formatZAR(t.amount)}</td>
                            <td className="py-3 px-4 text-textMuted">{t.sender_name || "—"}</td>
                            <td className="py-3 px-4 text-textMuted">{t.receiver_name || "—"}</td>
                            <td className="py-3 px-4 text-textDim whitespace-nowrap">{formatDate(t.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            )}

            {/* ═══════════════════════════════════════════════ ROUND AMOUNTS ══ */}
            {tab === "round" && (
              roundAlerts.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 border border-border rounded-xl">
                  <ShieldCheck size={28} className="text-textDim" />
                  <p className="text-textMuted font-bold">No round-amount anomalies detected</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 px-4 py-3 bg-purple/5 border border-purple/20 rounded-xl">
                    <AlertTriangle size={13} className="text-purple" />
                    <p className="text-purple text-xs font-bold">
                      Round-amount transactions may indicate structured payments designed to avoid reporting thresholds.
                    </p>
                  </div>
                  <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border bg-bg3">
                            {["Reference", "Amount", "Sender", "Receiver", "Date"].map(h => (
                              <th key={h} className="text-left py-3 px-4 text-[10px] font-bold text-textDim uppercase tracking-wider">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {roundAlerts.map((t: any) => (
                            <tr key={t.id} className="border-b border-border hover:bg-bg3/50 transition-colors">
                              <td className="py-3 px-4 font-mono text-[11px] text-textMuted">{t.reference}</td>
                              <td className="py-3 px-4 font-black text-purple tabular-nums">{formatZAR(t.amount)}</td>
                              <td className="py-3 px-4 text-textMuted">{t.sender_name || "—"}</td>
                              <td className="py-3 px-4 text-textMuted">{t.receiver_name || "—"}</td>
                              <td className="py-3 px-4 text-textDim whitespace-nowrap">{formatDate(t.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )
            )}

            {/* ═══════════════════════════════════════════════ BLACKLIST ══ */}
            {tab === "blacklist" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="relative flex-1 min-w-[200px] max-w-xs">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-textDim" />
                    <input
                      placeholder="Search phone or reason…"
                      value={blacklistSearch}
                      onChange={e => setBlacklistSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-bg2 border border-border rounded-lg text-sm text-text placeholder:text-textDim focus:outline-none focus:border-cyan/50 transition-colors"
                    />
                    {blacklistSearch && (
                      <button onClick={() => setBlacklistSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-textDim hover:text-text">
                        <X size={13} />
                      </button>
                    )}
                  </div>
                  <Button onClick={() => setAddModal(true)}>
                    <Plus size={13} /> Add to Blacklist
                  </Button>
                </div>

                {filteredBlacklist.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-12 border border-border rounded-xl">
                    <ShieldCheck size={28} className="text-textDim" />
                    <p className="text-textMuted font-bold">
                      {blacklistSearch ? "No matching entries" : "Blacklist is empty"}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredBlacklist.map((b: any) => (
                      <div key={b.id} className="bg-bg2 border border-red/10 rounded-xl p-4 flex items-center gap-4">
                        <div className="w-8 h-8 rounded-full bg-red/10 border border-red/20 flex items-center justify-center flex-shrink-0">
                          <Ban size={14} className="text-red" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm text-text">{b.phone_number}</span>
                            <button onClick={() => copyPhone(b.phone_number)} className="text-textDim hover:text-cyan">
                              <Copy size={11} />
                            </button>
                          </div>
                          <p className="text-textDim text-[11px] mt-0.5">{b.reason}</p>
                        </div>
                        <div className="text-right text-[10px] text-textDim">
                          <p>{b.added_by_name || "System"}</p>
                          <p>{formatDate(b.created_at)}</p>
                        </div>
                        <button onClick={() => setRemoveConfirm(b.id)}
                          className="p-2 rounded-lg border border-red/20 text-red hover:bg-red/10 transition-all flex-shrink-0">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Add to blacklist modal */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="Add to Blacklist">
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Phone Number</label>
            <Input placeholder="+27821234567" value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-2">Reason</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {BLACKLIST_REASONS.map(r => (
                <button key={r} onClick={() => setReason(r)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                    reason === r ? "bg-red/10 text-red border-red/20" : "text-textMuted border-border hover:border-red/30"
                  }`}>
                  {r}
                </button>
              ))}
            </div>
            <Input placeholder="Or type a custom reason…" value={reason} onChange={e => setReason(e.target.value)} />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setAddModal(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleAddBlacklist} disabled={!phone.trim() || !reason.trim()}>
              <Ban size={13} /> Add to Blacklist
            </Button>
          </div>
        </div>
      </Modal>

      {/* Remove confirm */}
      <Modal open={!!removeConfirm} onClose={() => setRemoveConfirm(null)} title="Remove from Blacklist?">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-yellow/5 border border-yellow/20 rounded-xl">
            <AlertTriangle size={15} className="text-yellow flex-shrink-0 mt-0.5" />
            <p className="text-yellow text-sm">This user will regain full platform access. Danger PIN required.</p>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setRemoveConfirm(null)}>Cancel</Button>
            <Button onClick={doRemove}>
              <ShieldOff size={12} /> Remove from Blacklist
            </Button>
          </div>
        </div>
      </Modal>

      <DangerPinModal
        open={dangerPin.open}
        onSuccess={dangerPin.handleSuccess}
        onCancel={dangerPin.handleCancel}
        actionLabel="remove from blacklist"
      />
    </AdminShell>
  );
}
