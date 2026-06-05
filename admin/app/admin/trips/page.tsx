"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Badge, Spinner } from "@/components/ui";
import client from "@/lib/api";
import { Car, Users, MapPin, RefreshCw, AlertTriangle, ExternalLink } from "lucide-react";
import { formatDate } from "@/lib/utils";

export default function LiveTripsPage() {
  const [trips, setTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const load = useCallback(async () => {
    try {
      const res = await client.get("/api/trips/driver-locations");
      setTrips(res.data || []);
      setLastRefresh(new Date());
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const flagIncident = async (tripId: string, plate: string) => {
    try {
      await client.post("/api/admin/incidents", {
        vehicle_plate: plate,
        trip_id: tripId,
        incident_type: "flagged",
        description: "Flagged from Live Trips dashboard",
      });
      alert("Incident flagged successfully.");
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Failed to flag incident");
    }
  };

  return (
    <AdminShell title="Live Trips" subtitle="All active driver trips right now">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-green animate-pulse" />
          <span className="text-textMuted text-sm">{trips.length} active trip{trips.length !== 1 ? "s" : ""}</span>
          <span className="text-textDim text-xs">· Last updated {lastRefresh.toLocaleTimeString("en-ZA")}</span>
        </div>
        <button
          onClick={() => { setLoading(true); load(); }}
          className="flex items-center gap-2 text-sm text-textMuted hover:text-text border border-border rounded-lg px-3 py-2 bg-bg2">
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {loading && trips.length === 0 ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : trips.length === 0 ? (
        <div className="text-center py-20 text-textMuted">
          <Car size={40} className="mx-auto mb-4 opacity-30" />
          <div className="font-semibold">No active trips right now</div>
          <div className="text-sm mt-1 text-textDim">This page refreshes every 30 seconds</div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 text-textMuted font-semibold text-xs uppercase tracking-wider">Driver</th>
                <th className="text-left py-3 px-4 text-textMuted font-semibold text-xs uppercase tracking-wider">Vehicle</th>
                <th className="text-left py-3 px-4 text-textMuted font-semibold text-xs uppercase tracking-wider">Started</th>
                <th className="text-center py-3 px-4 text-textMuted font-semibold text-xs uppercase tracking-wider">Passengers</th>
                <th className="text-left py-3 px-4 text-textMuted font-semibold text-xs uppercase tracking-wider">Last Location</th>
                <th className="text-right py-3 px-4 text-textMuted font-semibold text-xs uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((trip, i) => {
                const hasLocation = trip.latitude != null && trip.longitude != null;
                const mapsUrl = hasLocation
                  ? `https://maps.google.com/?q=${trip.latitude},${trip.longitude}`
                  : null;

                return (
                  <tr key={trip.trip_id || i} className="border-b border-border/50 hover:bg-bg2 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-text">{trip.driver_name || "—"}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono text-cyan text-sm">{trip.vehicle_plate || "—"}</span>
                    </td>
                    <td className="py-3 px-4 text-textMuted">
                      {trip.last_update ? formatDate(trip.last_update) : "—"}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <Users size={13} className="text-textMuted" />
                        <span className="font-semibold">{trip.passenger_count ?? 0}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {hasLocation ? (
                        <a
                          href={mapsUrl!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-cyan hover:underline">
                          <MapPin size={12} />
                          <span className="text-xs font-mono">{trip.latitude?.toFixed(4)}, {trip.longitude?.toFixed(4)}</span>
                          <ExternalLink size={10} />
                        </a>
                      ) : (
                        <span className="text-textDim text-xs">No GPS data</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        {trip.trip_id && (
                          <a
                            href={`/admin/saferide?trip=${trip.trip_id}`}
                            className="text-xs text-cyan hover:underline border border-cyan/30 rounded px-2 py-1">
                            View
                          </a>
                        )}
                        {trip.vehicle_plate && (
                          <button
                            onClick={() => flagIncident(trip.trip_id, trip.vehicle_plate)}
                            className="flex items-center gap-1 text-xs text-red hover:text-red/80 border border-red/30 rounded px-2 py-1 hover:bg-red/10">
                            <AlertTriangle size={11} />
                            Flag
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
