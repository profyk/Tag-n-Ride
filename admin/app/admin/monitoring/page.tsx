"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import { Badge, Spinner } from "@/components/ui";
import client from "@/lib/api";
import {
  Shield, Radio, Navigation, Car, Users, Phone, MapPin,
  RefreshCw, Clock, AlertTriangle, Activity, CheckCircle,
  XCircle, Zap, Eye,
} from "lucide-react";
import toast from "react-hot-toast";

// ── helpers ──────────────────────────────────────────────────────────────────

function elapsedLabel(isoStr: string | null) {
  if (!isoStr) return "—";
  const ms = Date.now() - new Date(isoStr).getTime();
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
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
    } catch {}
  };

  // ── fetchers ──
  const fetchAll = useCallback(async () => {
    const [sosRes, dmRes, tmRes, drRes] = await Promise.allSettled([
      client.get("/api/admin/saferide/sos"),
      client.get("/api/admin/saferide/deadman"),
      client.get("/api/admin/track-me"),
      client.get("/api/trips/driver-locations"),
    ]);
    if (sosRes.status === "fulfilled") { setSosList(sosRes.value.data || []); setSosLoading(false); }
    if (dmRes.status  === "fulfilled") { setDeadManList(dmRes.value.data || []); setDeadManLoading(false); }
    if (tmRes.status  === "fulfilled") { setTrackMeList(tmRes.value.data || []); setTrackMeLoading(false); }
    if (drRes.status  === "fulfilled") { setDriverList(drRes.value.data || []); setDriversLoading(false); }
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
    if (Array.from(activeIds).some(id => !knownSosRef.current!.has(id))) playSiren();
    knownSosRef.current = activeIds;
  }, [sosList]);

  useEffect(() => {
    const activeIds = new Set(
      deadManList.filter(d => d.status === "active" || d.status === "help_coming").map((d: any) => d.id as string)
    );
    if (knownDmRef.current === null) { knownDmRef.current = activeIds; return; }
    if (Array.from(activeIds).some(id => !knownDmRef.current!.has(id))) playSiren();
    knownDmRef.current = activeIds;
  }, [deadManList]);

  // ── actions ──
  const handleSosAction = async (sosId: string, status: "help_coming" | "resolved") => {
    setSosActionId(sosId + status);
    try {
      await client.patch(`/api/admin/saferide/sos/${sosId}`, { status });
      toast.success(status === "resolved" ? "SOS resolved" : "User notified — Help Coming");
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
      await client.patch(`/api/admin/saferide/sos/${id}`, { status });
      toast.success(status === "resolved" ? "Resolved" : "Marked — help coming");
      fetchAll();
    } catch (e: any) { toast.error(e.message || "Failed"); }
    finally { setSosActionId(null); }
  };

  // ── derived ──
  const activeSos    = sosList.filter(s => ["active", "help_coming", "dispatched"].includes(s.status));
  const resolvedSos  = sosList.filter(s => s.status === "resolved");
  const activeDeadMen = deadManList.filter(d => ["active", "help_coming"].includes(d.status));
  const anyEmergency = activeSos.length > 0 || activeDeadMen.length > 0;

  return (
    <AdminShell title="Live Monitor">
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
                          <a href={`tel:${sos.user_phone}`} className="text-cyan text-xs hover:underline flex items-center gap-1">
                            <Phone size={9} /> {sos.user_phone}
                          </a>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <Badge tone={sos.status === "help_coming" ? "yellow" : "red"}>{sos.status === "help_coming" ? "HELP COMING" : sos.status.toUpperCase()}</Badge>
                          <p className="text-[10px] text-red-400 font-bold mt-1">{elapsedLabel(sos.created_at)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {mapsUrl && (
                          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[10px] text-cyan hover:underline bg-bg2 border border-border rounded px-2 py-1">
                            <MapPin size={9} /> Location
                          </a>
                        )}
                        {sos.status === "active" && (
                          <button
                            disabled={!!sosActionId}
                            onClick={() => handleSosAction(sos.id, "help_coming")}
                            className="flex items-center gap-1 text-[10px] text-yellow-400 border border-yellow-500/30 bg-yellow-500/10 rounded px-2 py-1 hover:bg-yellow-500/20 disabled:opacity-50">
                            {sosActionId === sos.id + "help_coming" ? <Spinner size={8} /> : <Phone size={9} />}
                            Help Coming
                          </button>
                        )}
                        <button
                          disabled={!!sosActionId}
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
              <p className="text-[10px] text-textDim mt-3 text-center">{resolvedSos.length} resolved today</p>
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
                          <a href={`tel:${dm.user_phone}`} className="text-cyan text-xs hover:underline flex items-center gap-1">
                            <Phone size={9} /> {dm.user_phone}
                          </a>
                        </div>
                        <p className="text-[10px] text-purple-400 font-bold flex-shrink-0">{elapsedLabel(dm.dead_man_triggered_at || dm.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {mapsUrl && (
                          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[10px] text-purple-400 hover:underline bg-bg2 border border-purple-500/20 rounded px-2 py-1">
                            <MapPin size={9} /> Covert Location
                          </a>
                        )}
                        <button
                          disabled={!!sosActionId}
                          onClick={() => handleDeadManAction(dm.id, "help_coming")}
                          className="flex items-center gap-1 text-[10px] text-yellow-400 border border-yellow-500/30 bg-yellow-500/10 rounded px-2 py-1 hover:bg-yellow-500/20 disabled:opacity-50">
                          {sosActionId === dm.id + "help_coming" ? <Spinner size={8} /> : null}
                          Help Coming
                        </button>
                        <button
                          disabled={!!sosActionId}
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
    </AdminShell>
  );
}
