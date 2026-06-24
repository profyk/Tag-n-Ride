"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Badge, Spinner, Button, Card, Modal, Input, PermissionGate } from "@/components/ui";
import client, { api, DriverLocation } from "@/lib/api";
import { LiveMap, MapPin as LiveMapPin } from "@/components/saferide/LiveMap";
import { formatDate, formatZAR } from "@/lib/utils";
import {
  Car, Users, MapPin, RefreshCw, AlertTriangle, ExternalLink,
  Copy, Navigation, Clock, Zap, Shield, ChevronDown, ChevronUp,
  Radio, WifiOff, CheckCircle, X, Flag, Phone, Droplet,
  Activity, Eye, Search, ArrowUpDown,
} from "lucide-react";
import toast from "react-hot-toast";
import Link from "next/link";

const REFRESH_INTERVAL = 30;
const STALE_MS = 5 * 60 * 1000;

type Trip = DriverLocation & { _startedAt?: string };

type Passenger = {
  id: string;
  passenger_name: string;
  passenger_phone: string;
  payment_amount: number;
  boarded_at: string | null;
  blood_type?: string;
  medical_conditions?: string;
  emergency_contact_1_name?: string;
  emergency_contact_1_phone?: string;
  emergency_contact_1_relationship?: string;
};

type IncidentType = "breakdown" | "accident" | "suspicious" | "emergency" | "flagged";

const INCIDENT_TYPES: { value: IncidentType; label: string; color: string }[] = [
  { value: "emergency",  label: "Emergency / SOS",      color: "text-red border-red/40 bg-red/15 font-black" },
  { value: "accident",   label: "Accident",             color: "text-orange-400 border-orange-400/30 bg-orange-400/10" },
  { value: "suspicious", label: "Suspicious Behaviour", color: "text-yellow border-yellow/30 bg-yellow/5" },
  { value: "breakdown",  label: "Vehicle Breakdown",    color: "text-blue-400 border-blue-400/30 bg-blue-400/5" },
  { value: "flagged",    label: "General Flag",         color: "text-textMuted border-border bg-bg3"    },
];

function useDuration(startedAt: string | null | undefined) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function timeAgo(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (d < 10) return "just now";
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  return `${Math.floor(d / 3600)}h ago`;
}

function DurationBadge({ startedAt }: { startedAt?: string }) {
  const dur = useDuration(startedAt ?? null);
  return (
    <span className="flex items-center gap-1 text-xs font-mono text-textMuted">
      <Clock size={10} /> {startedAt ? dur : "—"}
    </span>
  );
}

function TripCard({
  trip,
  onFlag,
  trackBase,
  justFlagged,
}: {
  trip: Trip;
  onFlag: (trip: Trip) => void;
  trackBase: string;
  justFlagged: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [passengers, setPassengers] = useState<Passenger[] | null>(null);
  const [loadingPass, setLoadingPass] = useState(false);
  const hasGps = trip.latitude != null && trip.longitude != null;
  const mapsUrl = hasGps
    ? `https://maps.google.com/?q=${trip.latitude},${trip.longitude}`
    : null;
  const trackingUrl = trip.trip_reference
    ? `${trackBase}/track/${trip.trip_reference}`
    : null;

  const staleMs = trip.last_update ? Date.now() - new Date(trip.last_update).getTime() : null;
  const isStale = staleMs !== null && staleMs > STALE_MS;

  const copyLink = () => {
    if (!trackingUrl) return;
    navigator.clipboard.writeText(trackingUrl);
    toast.success("Tracking link copied");
  };

  const loadPassengers = async () => {
    if (passengers !== null) { setExpanded(v => !v); return; }
    setExpanded(true);
    setLoadingPass(true);
    try {
      const res = await client.get(`/api/trips/${trip.trip_id}`);
      setPassengers(res.data.passengers || []);
    } catch {
      setPassengers([]);
      toast.error("Could not load passenger list");
    } finally {
      setLoadingPass(false);
    }
  };

  return (
    <div className={`bg-bg2 border rounded-2xl overflow-hidden transition-all ${
      isStale ? "border-yellow/20" : hasGps ? "border-green/20" : "border-border"
    }`}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
            hasGps ? "bg-green animate-pulse" : "bg-textDim"
          }`} />
          <span className="font-black text-cyan font-mono text-lg tracking-wider">
            {trip.vehicle_plate || "—"}
          </span>
          {isStale && (
            <span className="text-[9px] font-bold text-yellow bg-yellow/10 border border-yellow/20 px-1.5 py-0.5 rounded">
              STALE
            </span>
          )}
          {justFlagged && (
            <span className="flex items-center gap-1 text-[9px] font-bold text-red bg-red/10 border border-red/20 px-1.5 py-0.5 rounded">
              <Flag size={9} /> FLAGGED
            </span>
          )}
        </div>
        <DurationBadge startedAt={trip._startedAt} />
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        {/* Driver */}
        <div className="flex items-center gap-2">
          <Car size={13} className="text-textMuted flex-shrink-0" />
          <span className="text-text font-semibold text-sm">{trip.driver_name || "—"}</span>
        </div>

        {/* Passengers + revenue */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={13} className="text-textMuted flex-shrink-0" />
            <span className="text-sm text-text font-semibold">{trip.passenger_count}</span>
            <span className="text-xs text-textMuted">passenger{trip.passenger_count !== 1 ? "s" : ""}</span>
            {trip.total_revenue > 0 && (
              <span className="text-xs font-bold text-green">{formatZAR(trip.total_revenue)}</span>
            )}
          </div>
          <button
            onClick={loadPassengers}
            className="flex items-center gap-1 text-[11px] text-cyan hover:text-cyan/80 transition-all font-semibold">
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {expanded ? "Hide" : "Manifest"}
          </button>
        </div>

        {/* GPS */}
        {hasGps ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Navigation size={12} className="text-green flex-shrink-0" />
                <span className="font-mono text-xs text-textMuted">
                  {trip.latitude?.toFixed(5)}, {trip.longitude?.toFixed(5)}
                </span>
              </div>
              {trip.speed > 0 && (
                <span className="text-[10px] text-textMuted font-mono">{trip.speed.toFixed(1)} km/h</span>
              )}
            </div>
            <div className="text-[10px] text-textDim flex items-center gap-1">
              <Activity size={9} />
              Updated {timeAgo(trip.last_update)}
              {isStale && <span className="text-yellow ml-1">— GPS may be off</span>}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-textDim text-xs">
            <WifiOff size={12} />
            <span>No GPS signal</span>
          </div>
        )}
      </div>

      {/* Passenger manifest */}
      {expanded && (
        <div className="border-t border-border/60 bg-bg px-4 py-3">
          {loadingPass ? (
            <div className="flex justify-center py-4"><Spinner /></div>
          ) : passengers && passengers.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[10px] font-extrabold text-textDim uppercase tracking-widest mb-2">Passenger Manifest</p>
              {passengers.map((p, i) => (
                <div key={p.id} className="flex items-start justify-between py-2 border-b border-border/40 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-text font-semibold text-sm">{p.passenger_name || "Unknown"}</p>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {p.passenger_phone && (
                        <span className="text-[11px] text-textMuted font-mono flex items-center gap-1">
                          <Phone size={9} /> {p.passenger_phone}
                        </span>
                      )}
                      {p.blood_type && (
                        <span className="text-[11px] text-red flex items-center gap-1">
                          <Droplet size={9} /> {p.blood_type}
                        </span>
                      )}
                      {p.emergency_contact_1_name && (
                        <span className="text-[11px] text-textDim">
                          ICE: {p.emergency_contact_1_name} ({p.emergency_contact_1_phone})
                        </span>
                      )}
                    </div>
                    {p.medical_conditions && (
                      <p className="text-[11px] text-yellow mt-0.5">⚕ {p.medical_conditions}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-xs font-bold text-green">R{Number(p.payment_amount || 0).toFixed(2)}</p>
                    {p.boarded_at && (
                      <p className="text-[10px] text-textDim">{new Date(p.boarded_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-textDim text-xs text-center py-3">No passengers recorded yet</p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-border/60 bg-bg3/40 flex-wrap">
        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-cyan border border-cyan/20 hover:bg-cyan/10 transition-all">
            <MapPin size={11} /> Maps
          </a>
        )}
        {trackingUrl && (
          <button onClick={copyLink}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-textMuted border border-border hover:border-cyan/20 hover:text-cyan transition-all">
            <Copy size={11} /> Share Link
          </button>
        )}
        {trackingUrl && (
          <a href={trackingUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-textMuted border border-border hover:border-cyan/20 hover:text-cyan transition-all">
            <Eye size={11} /> Live View
          </a>
        )}
        <button
          onClick={() => onFlag(trip)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-red border border-red/20 hover:bg-red/10 transition-all ml-auto">
          <Flag size={11} /> Flag Incident
        </button>
      </div>
    </div>
  );
}

export default function LiveTripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [filter, setFilter] = useState<"all" | "gps" | "no-gps">("all");
  const [flagTrip, setFlagTrip] = useState<Trip | null>(null);
  const [incidentType, setIncidentType] = useState<IncidentType>("flagged");
  const [incidentDesc, setIncidentDesc] = useState("");
  const [flagging, setFlagging] = useState(false);
  const [trackBase, setTrackBase] = useState("https://tag-n-ride.vercel.app");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"duration" | "passengers" | "staleness">("duration");
  const [flaggedTripIds, setFlaggedTripIds] = useState<Set<string>>(new Set());
  const countRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setTrackBase(window.location.origin);
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.driverLocations();
      setTrips((res.data || []).map((t: any) => ({
        ...t,
        _startedAt: t.started_at || t.last_update,
      })));
      setLastRefresh(new Date());
      setCountdown(REFRESH_INTERVAL);
    } catch {
      toast.error("Failed to refresh trips");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(() => load(true), REFRESH_INTERVAL * 1000);
    countRef.current = setInterval(() => setCountdown(c => c <= 1 ? REFRESH_INTERVAL : c - 1), 1000);
    return () => { clearInterval(poll); if (countRef.current) clearInterval(countRef.current); };
  }, [load]);

  const submitIncident = async () => {
    if (!flagTrip) return;
    setFlagging(true);
    try {
      await api.createIncident({
        vehicle_plate: flagTrip.vehicle_plate,
        incident_type: incidentType,
        description: incidentDesc || `Flagged from Live Trips — ${flagTrip.vehicle_plate}`,
        latitude: flagTrip.latitude ?? undefined,
        longitude: flagTrip.longitude ?? undefined,
      });
      toast.success("Incident logged");
      setFlaggedTripIds(prev => new Set(prev).add(flagTrip.trip_id));
      setFlagTrip(null);
      setIncidentDesc("");
      setIncidentType("flagged");
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Failed to log incident");
    } finally {
      setFlagging(false);
    }
  };

  const visible = useMemo(() => {
    let list = trips.filter(t =>
      filter === "gps" ? t.latitude != null :
      filter === "no-gps" ? t.latitude == null :
      true
    );
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(t =>
        (t.vehicle_plate || "").toLowerCase().includes(q) ||
        (t.driver_name || "").toLowerCase().includes(q)
      );
    }
    list = [...list].sort((a, b) => {
      if (sortBy === "passengers") return (b.passenger_count || 0) - (a.passenger_count || 0);
      if (sortBy === "staleness") {
        const aMs = a.last_update ? Date.now() - new Date(a.last_update).getTime() : Infinity;
        const bMs = b.last_update ? Date.now() - new Date(b.last_update).getTime() : Infinity;
        return bMs - aMs;
      }
      // duration — longest-running first
      const aStart = a._startedAt ? new Date(a._startedAt).getTime() : 0;
      const bStart = b._startedAt ? new Date(b._startedAt).getTime() : 0;
      return aStart - bStart;
    });
    return list;
  }, [trips, filter, search, sortBy]);

  const mapPins: LiveMapPin[] = useMemo(() => trips
    .filter(t => t.latitude != null && t.longitude != null)
    .map(t => ({
      id: t.trip_id, lat: t.latitude as number, lng: t.longitude as number, kind: "trip" as const,
      label: `${t.vehicle_plate || "—"} — ${t.driver_name || "Unknown"}`,
      sublabel: `${t.passenger_count} passenger${t.passenger_count !== 1 ? "s" : ""}`,
    })), [trips]);

  const totalPassengers = trips.reduce((s, t) => s + (t.passenger_count || 0), 0);
  const withGps = trips.filter(t => t.latitude != null).length;
  const staleCount = trips.filter(t => {
    if (!t.last_update) return false;
    return Date.now() - new Date(t.last_update).getTime() > STALE_MS;
  }).length;

  return (
    <AdminShell title="Live Trips" subtitle="Real-time view of all active driver trips">
      <PermissionGate permission="view_analytics">

      {/* Live map — overview of every active trip's location */}
      <Card className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <MapPin size={15} className="text-cyan" />
          <h2 className="font-extrabold text-sm uppercase tracking-wider text-text">Live Map</h2>
        </div>
        <LiveMap pins={mapPins} height={360} emptyMessage="No active trips with GPS right now" />
      </Card>

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="text-center">
          <p className="text-3xl font-black text-cyan">{trips.length}</p>
          <p className="text-xs text-textMuted mt-1">Active Trips</p>
        </Card>
        <Card className="text-center">
          <p className="text-3xl font-black text-purple">{totalPassengers}</p>
          <p className="text-xs text-textMuted mt-1">Passengers Aboard</p>
        </Card>
        <Card className="text-center">
          <p className="text-3xl font-black text-green">{withGps}</p>
          <p className="text-xs text-textMuted mt-1">GPS Active</p>
        </Card>
        <Card className={`text-center ${staleCount > 0 ? "border-yellow/30" : ""}`}>
          <p className={`text-3xl font-black ${staleCount > 0 ? "text-yellow" : "text-textMuted"}`}>{staleCount}</p>
          <p className="text-xs text-textMuted mt-1">Stale Signal (&gt;5m)</p>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          {/* Live indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-green/5 border border-green/20 rounded-lg">
            <div className="w-2 h-2 rounded-full bg-green animate-pulse" />
            <span className="text-xs font-bold text-green">LIVE</span>
          </div>

          {/* Filter tabs */}
          {(["all", "gps", "no-gps"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filter === f
                  ? "bg-cyanDim text-cyan border border-cyan/20"
                  : "text-textMuted border border-border hover:text-text hover:bg-bg3"
              }`}>
              {f === "all" ? `All (${trips.length})` : f === "gps" ? `GPS (${withGps})` : `No GPS (${trips.length - withGps})`}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-textDim text-xs">
            Next refresh in <span className="text-cyan font-bold font-mono">{countdown}s</span>
          </span>
          <Button variant="secondary" onClick={() => load(false)}>
            <RefreshCw size={13} /> Refresh
          </Button>
        </div>
      </div>

      {/* Search + sort */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-textDim" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by plate or driver…"
            className="w-full bg-bg2 border border-border rounded-lg pl-8 pr-3 py-2 text-xs text-text placeholder:text-textDim focus:outline-none focus:border-cyan"
          />
        </div>
        <div className="flex items-center gap-1.5 text-xs text-textMuted">
          <ArrowUpDown size={12} />
          {(["duration", "passengers", "staleness"] as const).map(s => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`px-2.5 py-1.5 rounded-lg font-bold transition-all ${
                sortBy === s ? "bg-cyanDim text-cyan border border-cyan/20" : "border border-border hover:text-text"
              }`}>
              {s === "duration" ? "Longest running" : s === "passengers" ? "Most passengers" : "Most stale"}
            </button>
          ))}
        </div>
      </div>

      <p className="text-textDim text-xs mb-4">
        Last updated: {lastRefresh.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </p>

      {/* Trip grid */}
      {loading && trips.length === 0 ? (
        <div className="flex justify-center py-24"><Spinner /></div>
      ) : visible.length === 0 ? (
        <div className="text-center py-24 text-textMuted">
          <Car size={48} className="mx-auto mb-4 opacity-20" />
          <p className="font-bold text-lg">
            {filter !== "all" ? "No trips match this filter" : "No active trips right now"}
          </p>
          <p className="text-sm mt-1 text-textDim">This page auto-refreshes every {REFRESH_INTERVAL} seconds</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((trip, i) => (
            <TripCard
              key={trip.trip_id || i}
              trip={trip}
              onFlag={setFlagTrip}
              trackBase={trackBase}
              justFlagged={flaggedTripIds.has(trip.trip_id)}
            />
          ))}
        </div>
      )}

      {/* Incident modal */}
      <Modal
        open={!!flagTrip}
        onClose={() => { setFlagTrip(null); setIncidentDesc(""); setIncidentType("flagged"); }}
        title="Log Incident">
        {flagTrip && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 p-3 bg-bg3 rounded-xl">
              <Car size={15} className="text-cyan" />
              <div>
                <p className="font-bold text-text font-mono">{flagTrip.vehicle_plate}</p>
                <p className="text-textMuted text-xs">{flagTrip.driver_name}</p>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-extrabold text-textMuted uppercase tracking-widest mb-2">Incident Type</label>
              <div className="space-y-2">
                {INCIDENT_TYPES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setIncidentType(t.value)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm font-bold transition-all text-left ${
                      incidentType === t.value
                        ? t.color
                        : "text-textMuted border-border hover:border-cyan/20"
                    }`}>
                    {incidentType === t.value
                      ? <CheckCircle size={14} />
                      : <div className="w-3.5 h-3.5 rounded-full border-2 border-current opacity-40" />}
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-extrabold text-textMuted uppercase tracking-widest mb-1.5">Description (optional)</label>
              <textarea
                value={incidentDesc}
                onChange={e => setIncidentDesc(e.target.value)}
                placeholder="What happened? Any additional details..."
                rows={3}
                className="w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-sm text-text placeholder:text-textDim focus:outline-none focus:border-cyan transition-colors resize-none"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => setFlagTrip(null)}>Cancel</Button>
              <Button variant="danger" onClick={submitIncident} loading={flagging}>
                <Flag size={13} /> Log Incident
              </Button>
            </div>
          </div>
        )}
      </Modal>
      </PermissionGate>
    </AdminShell>
  );
}
