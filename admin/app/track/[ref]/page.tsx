"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

const API = "https://tag-n-ride-production.up.railway.app";
const POLL_INTERVAL = 30;

function timeAgo(isoStr: string | null | undefined): string {
  if (!isoStr) return "—";
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diff < 10) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function formatTime(isoStr: string | null | undefined): string {
  if (!isoStr) return "—";
  return new Date(isoStr).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
}

export default function TrackPage() {
  const params = useParams();
  const ref = params?.ref as string;

  const [trip, setTrip] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [countdown, setCountdown] = useState(POLL_INTERVAL);
  const [refreshing, setRefreshing] = useState(false);
  const [ticker, setTicker] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async (silent = false) => {
    if (!ref) return;
    if (silent) setRefreshing(true);
    try {
      const res = await fetch(`${API}/api/trips/track/${encodeURIComponent(ref)}`);
      if (res.status === 404) { setNotFound(true); setLoading(false); setRefreshing(false); return; }
      if (!res.ok) { setNotFound(true); setLoading(false); setRefreshing(false); return; }
      const data = await res.json();
      setTrip(data);
      setNotFound(false);
      // Stop polling once trip is completed
      if (data.status !== "active") {
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
        if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
      }
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setCountdown(POLL_INTERVAL);
    }
  };

  // "X ago" live updates
  useEffect(() => {
    const t = setInterval(() => setTicker(v => v + 1), 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!ref) return;
    load();
    intervalRef.current = setInterval(() => load(true), POLL_INTERVAL * 1000);
    countdownRef.current = setInterval(() => {
      setCountdown(c => (c <= 1 ? POLL_INTERVAL : c - 1));
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [ref]);

  const hasLocation = trip?.last_latitude != null && trip?.last_longitude != null;
  const mapsUrl = hasLocation
    ? `https://maps.google.com/?q=${trip.last_latitude},${trip.last_longitude}`
    : null;
  const staticMapUrl = hasLocation
    ? `https://staticmap.openstreetmap.de/staticmap.php?center=${trip.last_latitude},${trip.last_longitude}&zoom=15&size=600x300&markers=${trip.last_latitude},${trip.last_longitude},red-pushpin`
    : null;

  const isActive = trip?.status === "active";

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#070A0F", color: "#fff", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

      {/* Header */}
      <div style={{ backgroundColor: "#0D1117", borderBottom: "1px solid #1a2030", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,229,255,0.12)", border: "1.5px solid rgba(0,229,255,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
            🛡️
          </div>
          <div>
            <div style={{ color: "#00E5FF", fontWeight: 800, fontSize: 17, letterSpacing: 0.3 }}>TAG N RIDE SafeRide</div>
            <div style={{ color: "#444", fontSize: 11, marginTop: 1 }}>Live trip tracking</div>
          </div>
        </div>
        {/* Live badge or completed */}
        {trip && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 12px", borderRadius: 999,
            backgroundColor: isActive ? "rgba(74,222,128,0.1)" : "rgba(100,100,100,0.1)",
            border: `1px solid ${isActive ? "rgba(74,222,128,0.3)" : "rgba(100,100,100,0.2)"}`,
          }}>
            <div style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: isActive ? "#4ade80" : "#555", flexShrink: 0 }} />
            <span style={{ color: isActive ? "#4ade80" : "#666", fontWeight: 700, fontSize: 12 }}>
              {isActive ? "LIVE" : "COMPLETED"}
            </span>
          </div>
        )}
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px 60px" }}>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", color: "#444", padding: "80px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            <div style={{ fontSize: 14 }}>Loading trip…</div>
          </div>
        )}

        {/* Not found */}
        {!loading && notFound && (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{ fontSize: 44, marginBottom: 16 }}>🔍</div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 20, marginBottom: 8 }}>Trip not found</div>
            <div style={{ color: "#444", fontSize: 13 }}>This tracking link may have expired or is invalid.</div>
          </div>
        )}

        {/* Trip data */}
        {!loading && trip && (
          <>
            {/* Status card */}
            <div style={{
              display: "flex", alignItems: "flex-start", gap: 12,
              backgroundColor: isActive ? "rgba(74,222,128,0.06)" : "rgba(100,100,100,0.06)",
              border: `1px solid ${isActive ? "rgba(74,222,128,0.2)" : "rgba(100,100,100,0.15)"}`,
              borderRadius: 14, padding: "14px 16px", marginBottom: 16,
            }}>
              <div style={{ fontSize: 24, marginTop: 1 }}>{isActive ? "🚌" : "✅"}</div>
              <div style={{ flex: 1 }}>
                <div style={{ color: isActive ? "#4ade80" : "#aaa", fontWeight: 700, fontSize: 14 }}>
                  {isActive ? "Trip is active — your family member is on the road" : "This trip has been completed"}
                </div>
                {trip.started_at && (
                  <div style={{ color: "#555", fontSize: 12, marginTop: 4 }}>
                    Started at {formatTime(trip.started_at)}
                    {trip.ended_at && ` · Ended at ${formatTime(trip.ended_at)}`}
                  </div>
                )}
              </div>
            </div>

            {/* Vehicle & driver info */}
            <div style={{ backgroundColor: "#0D1117", border: "1px solid #1a2030", borderRadius: 14, padding: "16px 18px", marginBottom: 16 }}>
              <InfoRow label="Vehicle" value={trip.vehicle_plate || "—"} mono />
              <InfoRow label="Driver" value={trip.driver_name || "—"} />
              <InfoRow label="Passengers in vehicle" value={String(trip.passenger_count ?? 0)} />
              {trip.last_location_update && (
                <InfoRow
                  label="Location updated"
                  value={`${timeAgo(trip.last_location_update)}`}
                  valueColor={isActive ? "#4ade80" : "#666"}
                  last
                />
              )}
            </div>

            {/* Map / Location */}
            {hasLocation ? (
              <div style={{ backgroundColor: "#0D1117", border: "1px solid #1a2030", borderRadius: 14, overflow: "hidden", marginBottom: 16 }}>
                {staticMapUrl && (
                  <img
                    src={staticMapUrl}
                    alt="Trip location"
                    style={{ width: "100%", display: "block", maxHeight: 240, objectFit: "cover" }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                )}
                <div style={{ padding: "14px 16px" }}>
                  <div style={{ color: "#555", fontSize: 11, marginBottom: 10, fontFamily: "monospace" }}>
                    📍 {trip.last_latitude?.toFixed(5)}, {trip.last_longitude?.toFixed(5)}
                    {trip.last_location_update && (
                      <span style={{ color: "#333", marginLeft: 8 }}>· {timeAgo(trip.last_location_update)}</span>
                    )}
                  </div>
                  <a
                    href={mapsUrl!}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 8,
                      backgroundColor: "#00E5FF", color: "#000",
                      fontWeight: 800, fontSize: 14, textDecoration: "none",
                      borderRadius: 10, padding: "10px 20px",
                    }}>
                    🗺️ Open in Google Maps
                  </a>
                </div>
              </div>
            ) : (
              <div style={{ backgroundColor: "#0D1117", border: "1px solid #1a2030", borderRadius: 14, padding: "24px 18px", marginBottom: 16, textAlign: "center" }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>📡</div>
                <div style={{ color: "#555", fontSize: 14, fontWeight: 600 }}>Waiting for location</div>
                <div style={{ color: "#333", fontSize: 12, marginTop: 6 }}>GPS location will appear here as the driver moves</div>
              </div>
            )}

            {/* Safety note */}
            <div style={{ backgroundColor: "rgba(10,26,15,0.8)", border: "1px solid rgba(74,222,128,0.12)", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
              <div style={{ color: "#4ade80", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>🛡️ Tracked by Tag n Ride SafeRide</div>
              <div style={{ color: "#555", fontSize: 12, lineHeight: 1.8 }}>
                Emergency: <strong style={{ color: "#ff5555" }}>10111</strong> Police · <strong style={{ color: "#ff5555" }}>10177</strong> Ambulance<br />
                Support: <strong style={{ color: "#666" }}>support@tagnride.com</strong>
              </div>
            </div>

            {/* Auto-refresh footer (active trips only) */}
            {isActive && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {refreshing ? (
                  <span style={{ color: "#4ade80", fontSize: 12, fontWeight: 600 }}>↻ Refreshing…</span>
                ) : (
                  <span style={{ color: "#333", fontSize: 12 }}>
                    Next update in <span style={{ color: "#555", fontWeight: 700 }}>{countdown}s</span>
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono, last, valueColor }: {
  label: string; value: string; mono?: boolean; last?: boolean; valueColor?: string;
}) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      paddingBottom: last ? 0 : 12, marginBottom: last ? 0 : 12,
      borderBottom: last ? "none" : "1px solid #141c28",
    }}>
      <span style={{ color: "#444", fontSize: 12 }}>{label}</span>
      <span style={{
        color: valueColor || "#fff", fontWeight: 600, fontSize: 14,
        fontFamily: mono ? "monospace" : "inherit",
      }}>{value}</span>
    </div>
  );
}
