"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import { Spinner, PermissionGate } from "@/components/ui";
import client, { api } from "@/lib/api";
import { LiveMap, MapPin as LiveMapPin } from "@/components/saferide/LiveMap";
import { useAlertEscalation, notifyNewAlert } from "@/lib/useAlertEscalation";
import {
  Shield, Radio, Navigation, Car, Users, Phone, MapPin,
  RefreshCw, Clock, AlertTriangle, Activity, CheckCircle,
  XCircle, Zap, Eye, AlertCircle,
} from "lucide-react";
import toast from "react-hot-toast";

// ── helpers ──────────────────────────────────────────────────────────────────

function elapsedLabel(isoStr: string | null) {
  if (!isoStr) return "—";
  const ms = Date.now() - new Date(isoStr).getTime();
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ago`;
  return `${m}m ago`;
}

function formatTime(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-ZA", { dateStyle: "short", timeStyle: "short" });
}

// ── status pill ───────────────────────────────────────────────────────────────

function StatusPill({ count, label, color }: { count: number; label: string; color: "red" | "orange" | "purple" | "cyan" | "green" | "textMuted" }) {
  const palette: Record<string, string> = {
    red:      "bg-red-500/10 border-red-500/30 text-red-400",
    orange:   "bg-orange-500/10 border-orange-500/30 text-orange-400",
    purple:   "bg-purple-500/10 border-purple-500/30 text-purple-400",
    cyan:     "bg-cyan/10 border-cyan/30 text-cyan",
    green:    "bg-green/10 border-green/30 text-green",
    textMuted:"bg-bg3 border-border text-textMuted",
  };
  return (
    <div className={`flex flex-col items-center justify-center rounded-xl border p-4 gap-1 ${palette[color]}`}>
      <span className="text-3xl font-black">{count}</span>
      <span className="text-[10px] font-extrabold uppercase tracking-wider opacity-80">{label}</span>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function MonitoringPage() {
  const [sosList, setSosList]           = useState<any[]>([]);
  const [deadManList, setDeadManList]   = useState<any[]>([]);
  const [trackMeList, setTrackMeList]   = useState<any[]>([]);
  const [driverList, setDriverList]     = useState<any[]>([]);

  const [sosLoading, setSosLoading]         = useState(true);
  const [deadManLoading, setDeadManLoading] = useState(true);
  const [trackMeLoading, setTrackMeLoading] = useState(true);
  const [driversLoading, setDriversLoading] = useState(true);

  const [trackMeEndingId, setTrackMeEndingId] = useState<string | null>(null);
  const [sosActionId, setSosActionId]         = useState<string | null>(null);

  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [fetchErrors, setFetchErrors] = useState<string[]>([]);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const knownSosRef = useRef<Set<string> | null>(null);
  const knownDmRef  = useRef<Set<string> | null>(null);

  // ── audio siren ──
  const playSiren = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sawtooth";
      gain.gain.value = 0.18;
      const t = ctx.currentTime;
      for (let i = 0; i < 3; i++) {
        osc.frequency.setValueAtTime(600, t + i * 0.5);
        osc.frequency.linearRampToValueAtTime(1200, t + i * 0.5 + 0.25);
        osc.frequency.linearRampToValueAtTime(600, t + i * 0.5 + 0.5);
      }
      gain.gain.setValueAtTime(0.18, t + 1.3);
      gain.gain.linearRampToValueAtTime(0, t + 1.5);
      osc.start(t);
      osc.stop(t + 1.5);
      osc.onended = () => { ctx.close().catch(() => {}); };
      setTimeout(() => { ctx.close().catch(() => {}); }, 2000);
    } catch {}
  };

  // ── fetchers ──
  const fetchAll = useCallback(async () => {
    const [sosRes, dmRes, tmRes, drRes] = await Promise.allSettled([
      api.sosList(),
      api.deadManList(),
      client.get("/api/admin/track-me"),
      api.driverLocations(),
    ]);
    const errors: string[] = [];
    if (sosRes.status === "fulfilled") { setSosList(sosRes.value.data || []); setSosLoading(false); }
    else errors.push("SOS");
    if (dmRes.status  === "fulfilled") { setDeadManList(dmRes.value.data || []); setDeadManLoading(false); }
    else errors.push("Dead Man");
    if (tmRes.status  === "fulfilled") { setTrackMeList(tmRes.value.data || []); setTrackMeLoading(false); }
    else errors.push("Track Me");
    if (drRes.status  === "fulfilled") { setDriverList(drRes.value.data || []); setDriversLoading(false); }
    else errors.push("Driver Locations");
    setFetchErrors(errors);
    setLastRefresh(new Date());
  }, []);

  useEffect(() => {
    fetchAll();
    timerRef.current = setInterval(fetchAll, 10000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // ── siren on new alerts ──
  useEffect(() => {
    const activeIds = new Set(
      sosList.filter(s => s.status === "active" || s.status === "help_coming" || s.status === "dispatched").map((s: any) => s.id as string)
    );
    if (knownSosRef.current === null) { knownSosRef.current = activeIds; return; }
    if (Array.from(activeIds).some(id => !knownSosRef.current!.has(id))) {
      playSiren();
      notifyNewAlert("🚨 New SOS Alert", "A new SOS distress signal just came in.");
    }
    knownSosRef.current = activeIds;
  }, [sosList]);

  useEffect(() => {
    const activeIds = new Set(
      deadManList.filter(d => d.status === "active" || d.status === "help_coming").map((d: any) => d.id as string)
    );
    if (knownDmRef.current === null) { knownDmRef.current = activeIds; return; }
    if (Array.from(activeIds).some(id => !knownDmRef.current!.has(id))) {
      playSiren();
      notifyNewAlert("🚨 New Dead Man Alert", "A new dead man duress alert just triggered.");
    }
    knownDmRef.current = activeIds;
  }, [deadManList]);

  // ── actions ──
  const handleSosAction = async (sosId: string, status: "help_coming" | "resolved") => {
    setSosActionId(sosId + status);
    try {
      await api.updateSos(sosId, status, noteDrafts[sosId]?.trim() || undefined);
      toast.success(status === "resolved" ? "SOS resolved" : "User notified — Help Coming");
      setNoteDrafts(prev => { const next = { ...prev }; delete next[sosId]; return next; });
      fetchAll();
    } catch (e: any) { toast.error(e.message || "Failed"); }
    finally { setSosActionId(null); }
  };

  const handleEndTrackMe = async (tripId: string) => {
    setTrackMeEndingId(tripId);
    try {
      await client.post(`/api/admin/track-me/${tripId}/end`, {});
      toast.success("Track Me session ended");
      fetchAll();
    } catch (e: any) { toast.error(e.message || "Failed"); }
    finally { setTrackMeEndingId(null); }
  };

  const handleDeadManAction = async (id: string, status: "help_coming" | "resolved") => {
    setSosActionId(id + status);
    try {
      await api.updateSos(id, status, noteDrafts[id]?.trim() || undefined);
      toast.success(status === "resolved" ? "Resolved" : "Marked — help coming");
      setNoteDrafts(prev => { const next = { ...prev }; delete next[id]; return next; });
      fetchAll();
    } catch (e: any) { toast.error(e.message || "Failed"); }
    finally { setSosActionId(null); }
  };

  // ── derived ──
  const activeSos    = sosList.filter(s => ["active", "help_coming", "dispatched"].includes(s.status));
  const resolvedSos  = sosList.filter(s => s.status === "resolved");
  const activeDeadMen = deadManList.filter(d => ["active", "help_coming"].includes(d.status));
  const anyEmergency = activeSos.length > 0 || activeDeadMen.length > 0;

  const mapPins: LiveMapPin[] = useMemo(() => {
    const pins: LiveMapPin[] = [];
    for (const s of activeSos) {
      const lat = s.latest_lat ?? s.latitude, lng = s.latest_lng ?? s.longitude;
      if (lat != null && lng != null) pins.push({ id: `sos-${s.id}`, lat, lng, kind: "sos", label: `${s.user_name || "Unknown"} — ${s.emergency_type}`, sublabel: s.status });
    }
    for (const d of activeDeadMen) {
      const lat = d.latest_lat ?? d.latitude, lng = d.latest_lng ?? d.longitude;
      if (lat != null && lng != null) pins.push({ id: `dm-${d.id}`, lat, lng, kind: "deadman", label: `${d.user_name || "Unknown"} — Dead Man`, sublabel: d.status });
    }
    for (const tm of trackMeList) {
      if (tm.last_lat != null && tm.last_lng != null) pins.push({ id: `tm-${tm.id}`, lat: tm.last_lat, lng: tm.last_lng, kind: "trackme", label: `${tm.user_name || "Unknown"} — Track Me` });
    }
    return pins;
  }, [activeSos, activeDeadMen, trackMeList]);

  useAlertEscalation(anyEmergency);

  return (
    <AdminShell title="Live Monitor">
      <PermissionGate permission="view_audit">
      <div className="p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${anyEmergency ? "bg-red-500/20 border border-red-500/40" : "bg-green/10 border border-green/20"}`}>
            <Activity size={20} className={anyEmergency ? "text-red-400 animate-pulse" : "text-green"} />
          </div>
          <div>
            <h1 className="text-xl font-black text-text">Live Ops Monitor</h1>
            <p className="text-xs text-textMuted">Real-time view of all safety events · refreshes every 10s</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-[10px] text-textDim">Last refresh: {lastRefresh.toLocaleTimeString("en-ZA")}</span>
            <button onClick={fetchAll} className="flex items-center gap-1.5 px-3 py-2 bg-bg2 border border-border rounded-lg text-xs text-textMuted hover:text-cyan hover:border-cyan/30 transition-colors">
              <RefreshCw size={13} /> Refresh Now
            </button>
            <Link href="/admin/saferide" className="flex items-center gap-1.5 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 font-bold hover:bg-red-500/20 transition-colors">
              <Shield size={13} /> Command Centre
            </Link>
          </div>
        </div>

        {/* Stale-data warning — a background poll failed silently otherwise */}
        {fetchErrors.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs font-bold">
            <AlertCircle size={14} className="flex-shrink-0" />
            Failed to refresh: {fetchErrors.join(", ")} — showing last known data from {lastRefresh.toLocaleTimeString("en-ZA")}.
          </div>
        )}

        {/* Live map — all active SOS / Dead Man / Track Me pins together */}
        <div className="bg-bg2 border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <MapPin size={15} className="text-cyan" />
            <h2 className="font-extrabold text-sm uppercase tracking-wider text-text">Live Map</h2>
            <span className="text-[10px] text-textDim">SOS (red) · Dead Man (purple) · Track Me (blue)</span>
          </div>
          <LiveMap pins={mapPins} height={360} emptyMessage="No active SOS, Dead Man, or Track Me locations right now" />
        </div>

        {/* Emergency banner */}
        {anyEmergency && (
          <div className="rounded-xl border-2 border-red-500 bg-red-950/40 px-5 py-3 flex items-center gap-3 shadow-[0_0_24px_rgba(239,68,68,0.2)] animate-pulse">
            <Radio size={18} className="text-red-400 flex-shrink-0" />
            <p className="text-red-300 font-extrabold text-sm">
              ACTIVE EMERGENCY — {activeSos.length} SOS{activeDeadMen.length > 0 ? ` + ${activeDeadMen.length} Dead Man alert${activeDeadMen.length > 1 ? "s" : ""}` : ""}
            </p>
            <Link href="/admin/saferide" className="ml-auto text-red-400 text-xs font-bold hover:underline">Go to Command Centre →</Link>
          </div>
        )}

        {/* Status overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatusPill count={activeSos.length}      label="Active SOS"        color={activeSos.length > 0      ? "red"       : "green"} />
          <StatusPill count={activeDeadMen.length}  label="Dead Man Alerts"   color={activeDeadMen.length > 0  ? "purple"    : "green"} />
          <StatusPill count={trackMeList.length}    label="Track Me Live"     color={trackMeList.length > 0    ? "cyan"      : "textMuted"} />
          <StatusPill count={driverList.length}     label="Drivers On Road"   color={driverList.length > 0     ? "cyan"      : "textMuted"} />
        </div>

        {/* Two-column grid for live events */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Left: Active SOS */}
          <div className={`rounded-xl border p-5 ${activeSos.length > 0 ? "bg-red-950/20 border-red-500/50" : "bg-bg2 border-border"}`}>
            <div className="flex items-center gap-2 mb-4">
              <Radio size={15} className={activeSos.length > 0 ? "text-red-400 animate-pulse" : "text-textMuted"} />
              <h2 className="font-extrabold text-sm uppercase tracking-wider text-text">Active SOS</h2>
              {activeSos.length > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-pulse">{activeSos.length}</span>
              )}
            </div>

            {sosLoading ? (
              <div className="flex justify-center py-6"><Spinner size={18} /></div>
            ) : activeSos.length === 0 ? (
              <div className="flex items-center gap-2 py-6 justify-center text-green text-sm">
                <CheckCircle size={16} /> All clear — no active SOS
              </div>
            ) : (
              <div className="space-y-3">
                {activeSos.map(sos => {
                  const mapsUrl = sos.latest_lat
                    ? `https://maps.google.com/?q=${sos.latest_lat},${sos.latest_lng}`
                    : sos.latitude ? `https://maps.google.com/?q=${sos.latitude},${sos.longitude}` : null;
                  return (
                    <div key={sos.id} className="bg-bg border border-red-500/20 rounded-xl p-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="font-extrabold text-text text-sm">{sos.user_name || "Unknown"}</p>
                          {sos.user_phone ? (
                            <a href={`tel:${sos.user_phone}`} className="text-cyan text-xs hover:underline flex items-center gap-1">
                              <Phone size={9} /> {sos.user_phone}
                            </a>
                          ) : sos.user_email ? (
                            <a href={`mailto:${sos.user_email}`} className="text-cyan text-xs hover:underline">{sos.user_email}</a>
                          ) : (
                            <span className="text-textDim text-xs">No phone or email</span>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold ${sos.status === "help_coming" ? "bg-yellow/10 border-yellow/20 text-yellow" : "bg-red/10 border-red/20 text-red"}`}>{sos.status === "help_coming" ? "HELP COMING" : sos.status.toUpperCase()}</span>
                          <p className="text-[10px] text-red-400 font-bold mt-1">{elapsedLabel(sos.created_at)}</p>
                        </div>
                      </div>
                      {sos.admin_notes && (
                        <p className="text-[10px] text-textMuted bg-bg2 rounded px-2 py-1.5 mb-2 border border-border">
                          {sos.admin_notes.split(" | ").map((line: string, i: number) => <span key={i} className="block">{line}</span>)}
                        </p>
                      )}
                      <input
                        value={noteDrafts[sos.id] || ""}
                        onChange={e => setNoteDrafts(prev => ({ ...prev, [sos.id]: e.target.value }))}
                        placeholder="Add a note for the user (optional)…"
                        className="w-full bg-bg2 border border-border rounded px-2 py-1 text-[10px] text-text placeholder:text-textDim mb-2 focus:outline-none focus:border-red-400"
                      />
                      <div className="flex items-center gap-2 flex-wrap">
                        {mapsUrl && (
                          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[10px] text-cyan hover:underline bg-bg2 border border-border rounded px-2 py-1">
                            <MapPin size={9} /> Location
                          </a>
                        )}
                        {sos.status === "active" && (
                          <button
                            disabled={!!sosActionId && sosActionId.startsWith(sos.id)}
                            onClick={() => handleSosAction(sos.id, "help_coming")}
                            className="flex items-center gap-1 text-[10px] text-yellow-400 border border-yellow-500/30 bg-yellow-500/10 rounded px-2 py-1 hover:bg-yellow-500/20 disabled:opacity-50">
                            {sosActionId === sos.id + "help_coming" ? <Spinner size={8} /> : <Phone size={9} />}
                            Help Coming
                          </button>
                        )}
                        <button
                          disabled={!!sosActionId && sosActionId.startsWith(sos.id)}
                          onClick={() => handleSosAction(sos.id, "resolved")}
                          className="flex items-center gap-1 text-[10px] text-green border border-green/30 bg-green/10 rounded px-2 py-1 hover:bg-green/20 disabled:opacity-50">
                          {sosActionId === sos.id + "resolved" ? <Spinner size={8} /> : null}
                          Resolve
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {resolvedSos.length > 0 && (
              <p className="text-[10px] text-textDim mt-3 text-center">{resolvedSos.length} recently resolved</p>
            )}
          </div>

          {/* Right: Dead Man Alerts */}
          <div className={`rounded-xl border p-5 ${activeDeadMen.length > 0 ? "bg-purple-950/20 border-purple-500/50" : "bg-bg2 border-border"}`}>
            <div className="flex items-center gap-2 mb-4">
              <Shield size={15} className={activeDeadMen.length > 0 ? "text-purple-400 animate-pulse" : "text-textMuted"} />
              <h2 className="font-extrabold text-sm uppercase tracking-wider text-text">Dead Man Alerts</h2>
              {activeDeadMen.length > 0 && (
                <span className="bg-purple-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-pulse">{activeDeadMen.length}</span>
              )}
            </div>

            {deadManLoading ? (
              <div className="flex justify-center py-6"><Spinner size={18} /></div>
            ) : activeDeadMen.length === 0 ? (
              <div className="flex items-center gap-2 py-6 justify-center text-green text-sm">
                <CheckCircle size={16} /> No active Dead Man alerts
              </div>
            ) : (
              <div className="space-y-3">
                {activeDeadMen.map(dm => {
                  const mapsUrl = dm.latest_lat
                    ? `https://maps.google.com/?q=${dm.latest_lat},${dm.latest_lng}`
                    : dm.latitude ? `https://maps.google.com/?q=${dm.latitude},${dm.longitude}` : null;
                  return (
                    <div key={dm.id} className="bg-bg border border-purple-500/20 rounded-xl p-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-extrabold text-text text-sm">{dm.user_name || "Unknown"}</p>
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">DEAD MAN</span>
                          </div>
                          {dm.user_phone ? (
                            <a href={`tel:${dm.user_phone}`} className="text-cyan text-xs hover:underline flex items-center gap-1">
                              <Phone size={9} /> {dm.user_phone}
                            </a>
                          ) : dm.user_email ? (
                            <a href={`mailto:${dm.user_email}`} className="text-cyan text-xs hover:underline">{dm.user_email}</a>
                          ) : (
                            <span className="text-textDim text-xs">No phone or email</span>
                          )}
                        </div>
                        <p className="text-[10px] text-purple-400 font-bold flex-shrink-0">{elapsedLabel(dm.dead_man_triggered_at || dm.created_at)}</p>
                      </div>
                      {dm.admin_notes && (
                        <p className="text-[10px] text-textMuted bg-bg2 rounded px-2 py-1.5 mb-2 border border-border">
                          {dm.admin_notes.split(" | ").map((line: string, i: number) => <span key={i} className="block">{line}</span>)}
                        </p>
                      )}
                      <input
                        value={noteDrafts[dm.id] || ""}
                        onChange={e => setNoteDrafts(prev => ({ ...prev, [dm.id]: e.target.value }))}
                        placeholder="Add a note (optional)…"
                        className="w-full bg-bg2 border border-border rounded px-2 py-1 text-[10px] text-text placeholder:text-textDim mb-2 focus:outline-none focus:border-purple-400"
                      />
                      <div className="flex items-center gap-2 flex-wrap">
                        {mapsUrl && (
                          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[10px] text-purple-400 hover:underline bg-bg2 border border-purple-500/20 rounded px-2 py-1">
                            <MapPin size={9} /> Covert Location
                          </a>
                        )}
                        <button
                          disabled={!!sosActionId && sosActionId.startsWith(dm.id)}
                          onClick={() => handleDeadManAction(dm.id, "help_coming")}
                          className="flex items-center gap-1 text-[10px] text-yellow-400 border border-yellow-500/30 bg-yellow-500/10 rounded px-2 py-1 hover:bg-yellow-500/20 disabled:opacity-50">
                          {sosActionId === dm.id + "help_coming" ? <Spinner size={8} /> : null}
                          Help Coming
                        </button>
                        <button
                          disabled={!!sosActionId && sosActionId.startsWith(dm.id)}
                          onClick={() => handleDeadManAction(dm.id, "resolved")}
                          className="flex items-center gap-1 text-[10px] text-green border border-green/30 bg-green/10 rounded px-2 py-1 hover:bg-green/20 disabled:opacity-50">
                          {sosActionId === dm.id + "resolved" ? <Spinner size={8} /> : null}
                          Resolve
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Active Track Me Sessions */}
        <div className={`rounded-xl border p-5 ${trackMeList.length > 0 ? "bg-cyan-950/20 border-cyan/40" : "bg-bg2 border-border"}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Navigation size={15} className={trackMeList.length > 0 ? "text-cyan animate-pulse" : "text-textMuted"} />
              <h2 className="font-extrabold text-sm uppercase tracking-wider text-text">Active Track Me Sessions</h2>
              {trackMeList.length > 0 && (
                <span className="bg-cyan/80 text-bg text-[10px] font-black px-2 py-0.5 rounded-full">{trackMeList.length} LIVE</span>
              )}
            </div>
          </div>

          {trackMeLoading ? (
            <div className="flex justify-center py-6"><Spinner size={18} /></div>
          ) : trackMeList.length === 0 ? (
            <p className="text-textMuted text-sm text-center py-6">No active Track Me sessions</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {trackMeList.map(tm => {
                const durationMin = tm.created_at
                  ? Math.floor((Date.now() - new Date(tm.created_at).getTime()) / 60000)
                  : 0;
                const lastPingMin = tm.last_ping
                  ? Math.floor((Date.now() - new Date(tm.last_ping).getTime()) / 60000)
                  : null;
                const pingStale = lastPingMin !== null && lastPingMin > 3;
                const mapsUrl = tm.last_lat ? `https://maps.google.com/?q=${tm.last_lat},${tm.last_lng}` : null;
                return (
                  <div key={tm.id} className="bg-bg border border-cyan/20 rounded-xl p-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <p className="font-extrabold text-text text-sm">{tm.user_name || "Unknown"}</p>
                        <a href={`tel:${tm.user_phone}`} className="text-cyan text-xs hover:underline flex items-center gap-1">
                          <Phone size={9} /> {tm.user_phone || "—"}
                        </a>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="flex items-center gap-1 text-green text-xs font-bold justify-end">
                          <Clock size={10} />
                          {durationMin < 60 ? `${durationMin}m` : `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`}
                        </div>
                        <p className={`text-[10px] mt-0.5 ${pingStale ? "text-yellow-400 font-bold" : "text-textDim"}`}>
                          {lastPingMin === null ? "No ping" : lastPingMin === 0 ? "Ping: just now" : `Ping: ${lastPingMin}m ago`}
                          {pingStale && " ⚠"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      {mapsUrl ? (
                        <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[10px] text-cyan hover:underline bg-bg2 border border-cyan/20 rounded px-2 py-1">
                          <MapPin size={9} /> Map
                        </a>
                      ) : (
                        <span className="text-[10px] text-textDim">No GPS yet</span>
                      )}
                      <button
                        disabled={trackMeEndingId === tm.id}
                        onClick={() => handleEndTrackMe(tm.id)}
                        className="flex items-center gap-1 text-[10px] text-red-400 border border-red-500/30 bg-red-500/10 rounded px-2 py-1 hover:bg-red-500/20 disabled:opacity-50 ml-auto">
                        {trackMeEndingId === tm.id ? <Spinner size={8} /> : <XCircle size={9} />}
                        End
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Live Drivers summary */}
        <div className="bg-bg2 border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Car size={15} className="text-cyan" />
              <h2 className="font-extrabold text-sm uppercase tracking-wider text-text">Live Drivers</h2>
              <span className="text-[10px] text-textDim">({driverList.length} on road)</span>
            </div>
            <Link href="/admin/saferide" className="text-xs text-cyan hover:underline">Full view →</Link>
          </div>

          {driversLoading ? (
            <div className="flex justify-center py-6"><Spinner size={18} /></div>
          ) : driverList.length === 0 ? (
            <p className="text-textMuted text-sm text-center py-6">No active drivers</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {driverList.map((d: any, i: number) => {
                const mapsUrl = d.latitude != null
                  ? `https://maps.google.com/?q=${d.latitude},${d.longitude}`
                  : null;
                return (
                  <div key={i} className="bg-bg border border-border rounded-lg p-3">
                    <p className="font-bold text-text text-xs truncate">{d.driver_name || d.driver_id?.slice(0, 8)}</p>
                    <p className="text-[10px] text-textMuted">{d.vehicle_plate || "—"}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] font-bold text-cyan">{d.passenger_count} pax</span>
                      {d.speed > 0 && <span className="text-[10px] text-textDim">{Math.round(d.speed)} km/h</span>}
                      {mapsUrl && (
                        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="ml-auto text-[10px] text-cyan hover:underline">
                          <MapPin size={9} />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick links row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Command Centre",    href: "/admin/saferide",           icon: Shield,        color: "text-red-400 border-red-500/20 hover:border-red-500/40" },
            { label: "Incidents Log",     href: "/admin/saferide/incidents", icon: AlertTriangle, color: "text-orange-400 border-orange-500/20 hover:border-orange-500/40" },
            { label: "Live Trips",        href: "/admin/trips",              icon: Activity,      color: "text-cyan border-cyan/20 hover:border-cyan/40" },
            { label: "Emergency Search",  href: "/admin/saferide",           icon: Eye,           color: "text-green border-green/20 hover:border-green/40" },
          ].map(link => (
            <Link
              key={link.href + link.label}
              href={link.href}
              className={`flex items-center gap-2.5 px-4 py-3 bg-bg2 border rounded-xl text-sm font-bold transition-colors ${link.color}`}>
              <link.icon size={15} />
              {link.label}
            </Link>
          ))}
        </div>

      </div>
      </PermissionGate>
    </AdminShell>
  );
}
