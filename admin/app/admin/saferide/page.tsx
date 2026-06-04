"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import { Badge, Spinner } from "@/components/ui";
import client from "@/lib/api";
import { Shield, AlertTriangle, Search, Phone, MapPin, RefreshCw, Users, Car, Radio } from "lucide-react";
import toast from "react-hot-toast";

export default function SafeRidePage() {
  const [searchPlate, setSearchPlate] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<any>(null);

  const [driverLocations, setDriverLocations] = useState<any[]>([]);
  const [loadingDrivers, setLoadingDrivers] = useState(true);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loadingIncidents, setLoadingIncidents] = useState(true);

  const [stats, setStats] = useState({ active_trips: 0, total_passengers: 0, incidents_month: 0, contacts_reached: 0 });
  const driverRefTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [sosList, setSosList] = useState<any[]>([]);
  const [sosLoading, setSosLoading] = useState(true);
  const [sosChargeId, setSosChargeId] = useState<string | null>(null);
  const [sosChargePrice, setSosChargePrice] = useState("");
  const [sosActionLoading, setSosActionLoading] = useState<string | null>(null);
  const [bulkActionLoading, setBulkActionLoading] = useState<string | null>(null);
  const [expandedCluster, setExpandedCluster] = useState<number | null>(null);
  const sosRefTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const knownSosIdsRef = useRef<Set<string> | null>(null);

  const playSosSiren = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sawtooth";
      gain.gain.value = 0.18;
      const t = ctx.currentTime;
      // Three sweeps: 600Hz → 1200Hz → 600Hz each 0.5s
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

  const fetchDriverLocations = useCallback(async () => {
    try {
      const res = await client.get("/api/trips/driver-locations");
      setDriverLocations(res.data || []);
    } catch {}
    finally { setLoadingDrivers(false); }
  }, []);

  const fetchSos = useCallback(async () => {
    try {
      const res = await client.get("/api/admin/saferide/sos");
      setSosList(res.data || []);
    } catch {}
    finally { setSosLoading(false); }
  }, []);

  const handleSosAction = async (sosId: string, status: "help_coming" | "dispatched" | "resolved", notes?: string) => {
    setSosActionLoading(sosId + status);
    try {
      await client.patch(`/api/admin/saferide/sos/${sosId}`, { status, notes });
      toast.success(status === "help_coming" ? "User notified — Help Coming" : status === "dispatched" ? "Marked as dispatched" : "SOS resolved");
      fetchSos();
    } catch (e: any) { toast.error(e.message || "Failed"); }
    finally { setSosActionLoading(null); }
  };

  const handleBulkSosAction = async (sosIds: string[], status: "help_coming" | "resolved", clusterKey: string, notes?: string) => {
    setBulkActionLoading(clusterKey + status);
    try {
      await client.patch("/api/admin/saferide/sos/bulk", { sos_ids: sosIds, status, notes });
      toast.success(status === "help_coming"
        ? `Help Coming sent to all ${sosIds.length} passengers`
        : `${sosIds.length} SOS resolved`);
      fetchSos();
    } catch (e: any) { toast.error(e.message || "Bulk action failed"); }
    finally { setBulkActionLoading(null); }
  };

  const handleSosCharge = async (sosId: string) => {
    const price = parseFloat(sosChargePrice);
    if (!price || price <= 0) { toast.error("Enter a valid price"); return; }
    setSosActionLoading(sosId + "charge");
    try {
      const res = await client.post(`/api/admin/saferide/sos/${sosId}/charge`, { price });
      toast.success(res.data.deducted_from_wallet ? `R${price.toFixed(2)} deducted from wallet` : `R${price.toFixed(2)} recorded — wallet insufficient, follow up manually`);
      setSosChargeId(null);
      setSosChargePrice("");
      fetchSos();
    } catch (e: any) { toast.error(e.message || "Failed"); }
    finally { setSosActionLoading(null); }
  };

  const fetchIncidents = useCallback(async () => {
    try {
      const res = await client.get("/api/admin/incidents");
      const data = res.data || [];
      setIncidents(data);
      const now = new Date();
      const thisMonth = data.filter((i: any) => {
        const d = new Date(i.flagged_at);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      });
      const contactsReached = data.reduce((s: number, i: any) => s + (i.notif_count || 0), 0);
      setStats(prev => ({ ...prev, incidents_month: thisMonth.length, contacts_reached: contactsReached }));
    } catch {}
    finally { setLoadingIncidents(false); }
  }, []);

  useEffect(() => {
    fetchDriverLocations();
    fetchIncidents();
    fetchSos();
    driverRefTimer.current = setInterval(fetchDriverLocations, 30000);
    sosRefTimer.current = setInterval(fetchSos, 10000);
    return () => {
      if (driverRefTimer.current) clearInterval(driverRefTimer.current);
      if (sosRefTimer.current) clearInterval(sosRefTimer.current);
    };
  }, []);

  useEffect(() => {
    setStats(prev => ({ ...prev, active_trips: driverLocations.length, total_passengers: driverLocations.reduce((s, d) => s + (d.passenger_count || 0), 0) }));
  }, [driverLocations]);

  useEffect(() => {
    const activeIds = new Set(
      sosList.filter(s => s.status === "active" || s.status === "help_coming" || s.status === "dispatched").map((s: any) => s.id as string)
    );
    if (knownSosIdsRef.current === null) {
      // First load — record without alarming
      knownSosIdsRef.current = activeIds;
      return;
    }
    const hasNew = [...activeIds].some(id => !knownSosIdsRef.current!.has(id));
    if (hasNew) playSosSiren();
    knownSosIdsRef.current = activeIds;
  }, [sosList]);

  const handleSearch = async () => {
    if (!searchPlate.trim()) return;
    setSearching(true);
    setSearchResult(null);
    try {
      const res = await client.get(`/api/admin/saferide/search?plate=${encodeURIComponent(searchPlate.trim())}`);
      setSearchResult(res.data);
    } catch (e: any) {
      toast.error(e.message || "Search failed");
    } finally { setSearching(false); }
  };

  const handleFlagIncident = async (plate: string) => {
    const description = prompt(`Flag incident for ${plate}. Enter description:`);
    if (!description) return;
    try {
      await client.post("/api/admin/incidents", {
        vehicle_plate: plate,
        incident_type: "accident",
        description,
      });
      toast.success("Incident created — SMS notifications sent");
      fetchIncidents();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    }
  };

  const formatTime = (iso: string) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-ZA", { dateStyle: "short", timeStyle: "short" });
  };

  const activeSos = sosList.filter(s => s.status === "active" || s.status === "help_coming" || s.status === "dispatched");

  // ── Cluster detection: group active SOS within 300 m and 10 min of each other ──
  const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371, toRad = (d: number) => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.asin(Math.sqrt(a));
  };

  const sosClusters: any[][] = (() => {
    const candidates = activeSos.filter(s => s.status === "active");
    const visited = new Set<string>();
    const clusters: any[][] = [];
    for (const anchor of candidates) {
      if (visited.has(anchor.id)) continue;
      const aLat = anchor.latest_lat ?? anchor.latitude;
      const aLng = anchor.latest_lng ?? anchor.longitude;
      if (!aLat || !aLng) continue;
      const group = candidates.filter(other => {
        if (visited.has(other.id) && other.id !== anchor.id) return false;
        const oLat = other.latest_lat ?? other.latitude;
        const oLng = other.latest_lng ?? other.longitude;
        if (!oLat || !oLng) return false;
        const timeDiff = Math.abs(new Date(anchor.created_at).getTime() - new Date(other.created_at).getTime()) / 60000;
        return timeDiff <= 10 && haversineKm(aLat, aLng, oLat, oLng) <= 0.3;
      });
      if (group.length >= 2) {
        group.forEach(s => visited.add(s.id));
        clusters.push(group);
      }
    }
    return clusters;
  })();

  const clusteredIds = new Set(sosClusters.flatMap(c => c.map((s: any) => s.id)));

  return (
    <AdminShell title="SafeRide Command Centre">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red/10 border border-red/20 flex items-center justify-center">
            <Shield size={20} className="text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-text">SafeRide Command Centre</h1>
            <p className="text-xs text-textMuted">Real-time passenger safety and incident management</p>
          </div>
          <Link href="/admin/saferide/incidents" className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg bg-red/10 border border-red/20 text-red-400 text-xs font-bold hover:bg-red/20 transition-colors">
            <AlertTriangle size={14} />
            Incidents
          </Link>
        </div>

        {/* SOS ALERTS */}
        <div className={`rounded-xl border p-5 ${activeSos.length > 0 ? "bg-red-950/30 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.15)]" : "bg-bg2 border-border"}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Radio size={16} className={activeSos.length > 0 ? "text-red-400 animate-pulse" : "text-textMuted"} />
              <h2 className="font-extrabold text-text text-sm uppercase tracking-wider">SOS Distress Signals</h2>
              {activeSos.length > 0 && (
                <span className="animate-pulse bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                  {activeSos.length} ACTIVE
                </span>
              )}
              <span className="text-[10px] text-textDim">(refreshes every 10s)</span>
            </div>
            <button onClick={fetchSos} className="text-textMuted hover:text-red-400 transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>

          {sosLoading ? (
            <div className="flex items-center justify-center py-8"><Spinner size={20} /></div>
          ) : sosList.length === 0 ? (
            <p className="text-textMuted text-sm text-center py-6">No SOS requests</p>
          ) : (
            <div className="space-y-3">

              {/* ── GROUP INCIDENT CLUSTERS ── */}
              {sosClusters.map((cluster, ci) => {
                const clusterKey = cluster.map((s: any) => s.id).join("-");
                const ids = cluster.map((s: any) => s.id);
                const anchor = cluster[0];
                const mapsUrl = (anchor.latest_lat ?? anchor.latitude)
                  ? `https://maps.google.com/?q=${anchor.latest_lat ?? anchor.latitude},${anchor.latest_lng ?? anchor.longitude}`
                  : null;
                const types = [...new Set(cluster.map((s: any) => s.emergency_type as string))];
                const isExpanded = expandedCluster === ci;
                return (
                  <div key={clusterKey} className="rounded-xl border-2 border-orange-500 bg-orange-950/30 shadow-[0_0_16px_rgba(249,115,22,0.2)] p-4">
                    {/* Cluster header */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center flex-shrink-0 animate-pulse">
                          <Users size={18} className="text-orange-400" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-orange-400 font-black text-sm">GROUP INCIDENT DETECTED</span>
                            <span className="bg-orange-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">{cluster.length} PEOPLE</span>
                            {types.map(t => (
                              <span key={t} className={`text-[10px] font-bold px-2 py-0.5 rounded border ${t === "police" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
                                {t?.toUpperCase()}
                              </span>
                            ))}
                          </div>
                          <p className="text-xs text-orange-300/70 mt-0.5">
                            {cluster.map((s: any) => s.user_name || "Unknown").join(" · ")} — same location, within 10 min
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Location */}
                    {mapsUrl && (
                      <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 text-xs text-cyan hover:underline bg-bg border border-border rounded-lg px-3 py-2 mb-3">
                        <MapPin size={12} /> View group location on map
                      </a>
                    )}

                    {/* Expanded passenger list */}
                    {isExpanded && (
                      <div className="mb-3 space-y-1.5">
                        {cluster.map((s: any) => (
                          <div key={s.id} className="flex items-center justify-between bg-bg border border-border rounded-lg px-3 py-2 text-xs">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${s.emergency_type === "police" ? "bg-blue-400" : "bg-red-400"}`} />
                              <span className="text-text font-semibold">{s.user_name || "Unknown"}</span>
                              <a href={`tel:${s.user_phone}`} className="text-cyan hover:underline">{s.user_phone}</a>
                            </div>
                            <span className="text-textDim">{Math.floor((Date.now() - new Date(s.created_at).getTime()) / 60000)}m ago</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <button onClick={() => setExpandedCluster(isExpanded ? null : ci)} className="text-[10px] text-orange-400 hover:underline mb-3 block">
                      {isExpanded ? "Hide passengers" : `Show all ${cluster.length} passengers`}
                    </button>

                    {/* Bulk actions */}
                    <div className="flex flex-wrap gap-2">
                      <button
                        disabled={!!bulkActionLoading}
                        onClick={() => handleBulkSosAction(ids, "help_coming", clusterKey, "Group incident — help dispatched to scene")}
                        className="flex items-center gap-1.5 px-4 py-2 bg-orange-500/20 border border-orange-500/50 text-orange-400 text-xs font-black rounded-lg hover:bg-orange-500/30 transition-colors disabled:opacity-50">
                        {bulkActionLoading === clusterKey + "help_coming" ? <Spinner size={10} /> : <Phone size={12} />}
                        Help Coming — All {cluster.length} People
                      </button>
                      <button
                        disabled={!!bulkActionLoading}
                        onClick={() => handleBulkSosAction(ids, "resolved", clusterKey, "Group incident resolved")}
                        className="flex items-center gap-1.5 px-3 py-2 bg-green/10 border border-green/30 text-green text-xs font-bold rounded-lg hover:bg-green/20 transition-colors disabled:opacity-50">
                        {bulkActionLoading === clusterKey + "resolved" ? <Spinner size={10} /> : null}
                        Resolve All
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* ── INDIVIDUAL SOS CARDS ── */}
              {sosList.map(sos => {
                const isActive = sos.status === "active" || sos.status === "help_coming" || sos.status === "dispatched";
                const typePolice = sos.emergency_type === "police";
                const mapsUrl = sos.latest_lat
                  ? `https://maps.google.com/?q=${sos.latest_lat},${sos.latest_lng}`
                  : sos.latitude ? `https://maps.google.com/?q=${sos.latitude},${sos.longitude}` : null;
                const elapsed = sos.created_at
                  ? Math.floor((Date.now() - new Date(sos.created_at).getTime()) / 60000)
                  : 0;
                return (
                  <div key={sos.id} className={`rounded-xl border p-4 ${isActive ? "border-red-500/50 bg-red-950/20" : "border-border bg-bg"}`}>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${typePolice ? "bg-blue-500/10 border border-blue-500/20" : "bg-red-500/10 border border-red-500/20"}`}>
                          <Radio size={18} className={typePolice ? "text-blue-400" : "text-red-400"} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-extrabold text-text text-sm">{sos.user_name || "Unknown"}</p>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${typePolice ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
                              {sos.emergency_type?.toUpperCase()}
                            </span>
                            <Badge tone={sos.status === "resolved" ? "green" : (sos.status === "help_coming" || sos.status === "dispatched") ? "yellow" : "red"}>
                              {sos.status === "help_coming" ? "HELP COMING" : sos.status}
                            </Badge>
                            {clusteredIds.has(sos.id) && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-orange-500/10 text-orange-400 border-orange-500/20">GROUP</span>
                            )}
                          </div>
                          <a href={`tel:${sos.user_phone}`} className="text-cyan text-xs hover:underline flex items-center gap-1 mt-0.5">
                            <Phone size={10} /> {sos.user_phone || "No phone"}
                          </a>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[10px] text-textDim">{formatTime(sos.created_at)}</p>
                        {isActive && <p className="text-[10px] text-red-400 font-bold">{elapsed}m ago</p>}
                        {sos.charged && <p className="text-[10px] text-green font-bold">R{sos.price?.toFixed(2)} charged</p>}
                      </div>
                    </div>

                    {/* Location */}
                    {mapsUrl && (
                      <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 text-xs text-cyan hover:underline bg-bg border border-border rounded-lg px-3 py-2 mb-3">
                        <MapPin size={12} />
                        {sos.latest_lat ? "Live location — view on map" : "Last known location — view on map"}
                      </a>
                    )}

                    {/* Admin notes */}
                    {sos.admin_notes && (
                      <p className="text-xs text-textMuted bg-bg2 rounded px-3 py-2 mb-3 border border-border">
                        Notes: {sos.admin_notes}
                      </p>
                    )}

                    {/* Actions */}
                    {isActive && (
                      <div className="flex flex-wrap gap-2">
                        {sos.status === "active" && (
                          <button
                            disabled={!!sosActionLoading}
                            onClick={() => handleSosAction(sos.id, "help_coming", "Help is on the way")}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs font-bold rounded-lg hover:bg-yellow-500/20 transition-colors disabled:opacity-50">
                            {sosActionLoading === sos.id + "help_coming" ? <Spinner size={10} /> : <Phone size={11} />}
                            Help Coming
                          </button>
                        )}
                        {sos.status === "help_coming" && (
                          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs font-bold rounded-lg">
                            <Phone size={11} /> Waiting for user confirmation…
                          </span>
                        )}
                        <button
                          disabled={!!sosActionLoading}
                          onClick={() => handleSosAction(sos.id, "resolved")}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-green/10 border border-green/30 text-green text-xs font-bold rounded-lg hover:bg-green/20 transition-colors disabled:opacity-50">
                          {sosActionLoading === sos.id + "resolved" ? <Spinner size={10} /> : null}
                          Mark Resolved
                        </button>
                      </div>
                    )}

                    {/* Charge section */}
                    {sos.status === "resolved" && !sos.charged && (
                      sosChargeId === sos.id ? (
                        <div className="flex items-center gap-2 mt-2">
                          <input
                            type="number"
                            value={sosChargePrice}
                            onChange={e => setSosChargePrice(e.target.value)}
                            placeholder="Amount (R)"
                            className="w-32 bg-bg border border-border rounded-lg px-3 py-1.5 text-xs text-text focus:outline-none focus:border-cyan"
                          />
                          <button
                            disabled={sosActionLoading === sos.id + "charge"}
                            onClick={() => handleSosCharge(sos.id)}
                            className="px-3 py-1.5 bg-cyan/10 border border-cyan/30 text-cyan text-xs font-bold rounded-lg hover:bg-cyan/20 disabled:opacity-50">
                            {sosActionLoading === sos.id + "charge" ? <Spinner size={10} /> : "Charge User"}
                          </button>
                          <button onClick={() => setSosChargeId(null)} className="text-textMuted hover:text-text text-xs">Cancel</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setSosChargeId(sos.id); setSosChargePrice(""); }}
                          className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-cyan/10 border border-cyan/30 text-cyan text-xs font-bold rounded-lg hover:bg-cyan/20 transition-colors">
                          Set Service Fee
                        </button>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Active Trips", value: stats.active_trips, icon: Car, color: "text-cyan" },
            { label: "Passengers Today", value: stats.total_passengers, icon: Users, color: "text-green" },
            { label: "Active SOS", value: activeSos.length, icon: Radio, color: activeSos.length > 0 ? "text-red-400" : "text-textMuted" },
            { label: "Contacts Reached", value: stats.contacts_reached, icon: Phone, color: "text-purple" },
          ].map(stat => (
            <div key={stat.label} className="bg-bg2 border border-border rounded-xl p-4">
              <stat.icon size={18} className={stat.color + " mb-2"} />
              <div className={`text-2xl font-black ${stat.color}`}>{stat.value}</div>
              <div className="text-xs text-textMuted mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* EMERGENCY SEARCH */}
        <div className="bg-bg2 border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Search size={16} className="text-red-400" />
            <h2 className="font-extrabold text-text text-sm uppercase tracking-wider">Emergency Search</h2>
          </div>
          <div className="flex gap-3">
            <input
              value={searchPlate}
              onChange={e => setSearchPlate(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="Search by vehicle plate number — e.g. ND 123 456"
              className="flex-1 bg-bg border border-border rounded-lg px-4 py-3 text-sm text-text placeholder:text-textDim focus:outline-none focus:border-red-400 transition-colors"
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-60">
              {searching ? <Spinner size={14} /> : <Search size={14} />}
              Search
            </button>
          </div>

          {searchResult && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-text text-base">VEHICLE PLATE: {searchResult.plate}</h3>
                <button
                  onClick={() => handleFlagIncident(searchResult.plate)}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-lg transition-colors">
                  <AlertTriangle size={13} />
                  Flag as Incident
                </button>
              </div>

              {/* Driver cards */}
              {searchResult.drivers?.length > 0 && (
                <div>
                  <p className="text-[10px] font-extrabold text-textDim uppercase tracking-widest mb-2">Driver(s)</p>
                  {searchResult.drivers.map((d: any) => (
                    <div key={d.user_id} className="bg-bg border border-border rounded-lg p-4 flex items-start gap-4 mb-3">
                      <div className="w-12 h-12 rounded-full bg-cyanDim border border-cyan/30 flex items-center justify-center flex-shrink-0">
                        <Car size={20} className="text-cyan" />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-text">{d.full_name}</p>
                        <a href={`tel:${d.phone_number}`} className="text-cyan text-sm hover:underline flex items-center gap-1">
                          <Phone size={11} /> {d.phone_number}
                        </a>
                        <p className="text-xs text-textMuted mt-1">{d.vehicle_plate} · Rating {d.rating_avg?.toFixed(1)} ★</p>
                        <Badge tone={d.is_verified ? "green" : "yellow"}>{d.is_verified ? "Verified" : "Unverified"}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* GPS */}
              {searchResult.last_gps && (
                <div className="bg-bg border border-border rounded-lg p-3 flex items-center gap-3">
                  <MapPin size={14} className="text-green" />
                  <div className="flex-1">
                    <p className="text-xs font-bold text-text">Last GPS Location</p>
                    <p className="text-xs text-textMuted">
                      {searchResult.last_gps.latitude?.toFixed(6)}, {searchResult.last_gps.longitude?.toFixed(6)}
                      {searchResult.last_gps.speed > 0 ? ` · ${searchResult.last_gps.speed.toFixed(0)} km/h` : ""}
                    </p>
                    {searchResult.last_gps.recorded_at && (
                      <p className="text-[10px] text-textDim">{formatTime(searchResult.last_gps.recorded_at)}</p>
                    )}
                  </div>
                  {searchResult.last_gps.latitude && (
                    <a
                      href={`https://maps.google.com/?q=${searchResult.last_gps.latitude},${searchResult.last_gps.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-cyan hover:underline">
                      View Map
                    </a>
                  )}
                </div>
              )}

              {/* Passengers */}
              {searchResult.passengers?.length > 0 && (
                <div>
                  <p className="text-[10px] font-extrabold text-textDim uppercase tracking-widest mb-2">
                    PASSENGERS IN THIS VEHICLE TODAY ({searchResult.passengers.length})
                  </p>
                  <div className="space-y-3">
                    {searchResult.passengers.map((p: any, i: number) => (
                      <div key={i} className="bg-bg border border-border rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-bold text-text">{p.passenger_name || "Unknown"}</p>
                            <a href={`tel:${p.passenger_phone}`} className="text-cyan text-xs hover:underline flex items-center gap-1">
                              <Phone size={10} /> {p.passenger_phone}
                            </a>
                            {p.blood_type && (
                              <span className="inline-block bg-red-500/10 text-red-400 text-[10px] font-bold px-2 py-0.5 rounded border border-red-500/20 mt-1">
                                {p.blood_type}
                              </span>
                            )}
                          </div>
                          <Badge tone={p.profile_complete ? "green" : "yellow"}>
                            {p.profile_complete ? "SafeRide ✓" : "No Profile"}
                          </Badge>
                        </div>
                        {p.medical_conditions && (
                          <p className="text-xs text-textMuted bg-bg2 rounded p-2 mb-2">⚕ {p.medical_conditions}</p>
                        )}
                        {/* Emergency contacts */}
                        <div className="space-y-1 mt-2">
                          {[
                            { label: "Primary", name: p.emergency_contact_1_name, phone: p.emergency_contact_1_phone, rel: p.emergency_contact_1_relationship },
                            { label: "Secondary", name: p.emergency_contact_2_name, phone: p.emergency_contact_2_phone, rel: p.emergency_contact_2_relationship },
                            { label: "Next of Kin", name: p.next_of_kin_name, phone: p.next_of_kin_phone, rel: p.next_of_kin_relationship },
                          ].filter(c => c.phone).map(c => (
                            <div key={c.label} className="flex items-center justify-between text-xs bg-bg2 rounded px-3 py-2">
                              <span className="text-textDim">{c.label}{c.rel ? ` · ${c.rel}` : ""}: {c.name}</span>
                              <a href={`tel:${c.phone}`} className="text-cyan hover:underline flex items-center gap-1">
                                <Phone size={10} /> {c.phone}
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {searchResult.passengers?.length === 0 && searchResult.drivers?.length === 0 && (
                <p className="text-textMuted text-sm text-center py-8">No results found for plate {searchResult.plate}</p>
              )}
            </div>
          )}
        </div>

        {/* LIVE DRIVER LOCATIONS */}
        <div className="bg-bg2 border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <MapPin size={16} className="text-cyan" />
              <h2 className="font-extrabold text-text text-sm uppercase tracking-wider">Live Driver Locations</h2>
              <span className="text-[10px] text-textDim">(refreshes every 30s)</span>
            </div>
            <button onClick={fetchDriverLocations} className="text-textMuted hover:text-cyan transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>
          {loadingDrivers ? (
            <div className="flex items-center justify-center py-8"><Spinner size={20} /></div>
          ) : driverLocations.length === 0 ? (
            <p className="text-textMuted text-sm text-center py-8">No active trips right now</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    {["Driver", "Vehicle", "Location", "Speed", "Passengers", "Last Update"].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-textDim font-extrabold uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {driverLocations.map((d, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-bg3">
                      <td className="px-3 py-2 font-semibold text-text">{d.driver_name || d.driver_id?.slice(0, 8)}</td>
                      <td className="px-3 py-2 text-textMuted">{d.vehicle_plate || "—"}</td>
                      <td className="px-3 py-2">
                        {d.latitude != null ? (
                          <a href={`https://maps.google.com/?q=${d.latitude},${d.longitude}`} target="_blank" rel="noopener noreferrer" className="text-cyan hover:underline">
                            {d.latitude.toFixed(4)}, {d.longitude.toFixed(4)}
                          </a>
                        ) : <span className="text-textDim">No GPS</span>}
                      </td>
                      <td className="px-3 py-2 text-textMuted">{d.speed > 0 ? `${Math.round(d.speed)} km/h` : "—"}</td>
                      <td className="px-3 py-2">
                        <span className="font-bold text-cyan">{d.passenger_count}</span>
                      </td>
                      <td className="px-3 py-2 text-textDim">{d.last_update ? formatTime(d.last_update) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* RECENT INCIDENTS */}
        <div className="bg-bg2 border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-400" />
              <h2 className="font-extrabold text-text text-sm uppercase tracking-wider">Recent Incidents</h2>
            </div>
            <Link href="/admin/saferide/incidents" className="text-xs text-cyan hover:underline">View all</Link>
          </div>
          {loadingIncidents ? (
            <div className="flex items-center justify-center py-8"><Spinner size={20} /></div>
          ) : incidents.length === 0 ? (
            <p className="text-textMuted text-sm text-center py-8">No incidents recorded</p>
          ) : (
            <div className="space-y-2">
              {incidents.slice(0, 5).map(inc => (
                <Link key={inc.id} href={`/admin/saferide/incidents/${inc.id}`}
                  className="flex items-center gap-3 p-3 bg-bg border border-border rounded-lg hover:border-cyan/30 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle size={14} className="text-red-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-text truncate">{inc.incident_reference} · {inc.vehicle_plate}</p>
                    <p className="text-[10px] text-textMuted">{inc.incident_type} · {formatTime(inc.flagged_at)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {inc.notifications_sent && (
                      <span className="text-[10px] bg-green/10 text-green border border-green/20 px-2 py-0.5 rounded font-bold">
                        SMS ✓
                      </span>
                    )}
                    <Badge tone={inc.status === "resolved" ? "green" : "red"}>
                      {inc.status === "resolved" ? "Resolved" : "Active"}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
