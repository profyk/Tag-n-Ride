"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import { Badge, Spinner } from "@/components/ui";
import client from "@/lib/api";
import { Shield, AlertTriangle, Search, Phone, MapPin, RefreshCw, Users, Car } from "lucide-react";
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

  const fetchDriverLocations = useCallback(async () => {
    try {
      const res = await client.get("/api/trips/driver-locations");
      setDriverLocations(res.data || []);
    } catch {}
    finally { setLoadingDrivers(false); }
  }, []);

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
    driverRefTimer.current = setInterval(fetchDriverLocations, 30000);
    return () => { if (driverRefTimer.current) clearInterval(driverRefTimer.current); };
  }, []);

  useEffect(() => {
    setStats(prev => ({ ...prev, active_trips: driverLocations.length, total_passengers: driverLocations.reduce((s, d) => s + (d.passenger_count || 0), 0) }));
  }, [driverLocations]);

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

  return (
    <AdminShell>
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

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Active Trips", value: stats.active_trips, icon: Car, color: "text-cyan" },
            { label: "Passengers Today", value: stats.total_passengers, icon: Users, color: "text-green" },
            { label: "Incidents This Month", value: stats.incidents_month, icon: AlertTriangle, color: "text-red-400" },
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
