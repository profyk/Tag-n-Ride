"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const API = "https://tag-n-ride-production.up.railway.app";

export default function TrackPage() {
  const params = useParams();
  const ref = params?.ref as string;

  const [trip, setTrip] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = async () => {
    if (!ref) return;
    try {
      const res = await fetch(`${API}/api/trips/track/${encodeURIComponent(ref)}`);
      if (res.status === 404) { setNotFound(true); setLoading(false); return; }
      if (!res.ok) { setNotFound(true); setLoading(false); return; }
      const data = await res.json();
      setTrip(data);
    } catch { setNotFound(true); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [ref]);

  const hasLocation = trip?.last_latitude != null && trip?.last_longitude != null;
  const mapsOpenUrl = hasLocation
    ? `https://maps.google.com/?q=${trip.last_latitude},${trip.last_longitude}`
    : null;
  const staticMapUrl = hasLocation
    ? `https://staticmap.openstreetmap.de/staticmap.php?center=${trip.last_latitude},${trip.last_longitude}&zoom=15&size=600x300&markers=${trip.last_latitude},${trip.last_longitude},red-pushpin`
    : null;

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0a0a0a", color: "#fff", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      {/* Header */}
      <div style={{ backgroundColor: "#0f1217", borderBottom: "1px solid #1e2530", padding: "14px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,229,255,0.12)", border: "1.5px solid rgba(0,229,255,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
          🛡️
        </div>
        <div>
          <div style={{ color: "#00E5FF", fontWeight: 800, fontSize: 17, letterSpacing: 0.3 }}>TAG N RIDE SafeRide</div>
          <div style={{ color: "#555", fontSize: 11, marginTop: 1 }}>Live trip tracking · powered by SafeRide</div>
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px 40px" }}>
        {loading && (
          <div style={{ textAlign: "center", color: "#555", padding: "60px 0" }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>⏳</div>
            <div style={{ fontSize: 14 }}>Loading trip…</div>
          </div>
        )}

        {!loading && notFound && (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>🔍</div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 20, marginBottom: 8 }}>Trip not found</div>
            <div style={{ color: "#555", fontSize: 13 }}>This link may have expired or is invalid.</div>
          </div>
        )}

        {!loading && trip && (
          <>
            {/* Status banner */}
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              backgroundColor: trip.status === "active" ? "rgba(74,222,128,0.08)" : "rgba(100,100,100,0.08)",
              border: `1px solid ${trip.status === "active" ? "rgba(74,222,128,0.25)" : "rgba(100,100,100,0.2)"}`,
              borderRadius: 12, padding: "12px 16px", marginBottom: 16,
            }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: trip.status === "active" ? "#4ade80" : "#666", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ color: trip.status === "active" ? "#4ade80" : "#888", fontWeight: 700, fontSize: 13 }}>
                  {trip.status === "active" ? "SAFERIDE ACTIVE — Your family member is on a trip" : "TRIP COMPLETED"}
                </div>
                {trip.started_at && (
                  <div style={{ color: "#555", fontSize: 11, marginTop: 2 }}>
                    Started {new Date(trip.started_at).toLocaleString("en-ZA")}
                  </div>
                )}
              </div>
            </div>

            {/* Trip info card */}
            <div style={{ backgroundColor: "#0f1217", border: "1px solid #1e2530", borderRadius: 14, padding: "16px 18px", marginBottom: 16 }}>
              <Row label="Vehicle" value={trip.vehicle_plate || "—"} mono />
              <Row label="Driver" value={trip.driver_name || "—"} />
              <Row label="Passengers in vehicle" value={String(trip.passenger_count ?? 0)} />
              {trip.last_location_update && (
                <Row label="Location last updated" value={new Date(trip.last_location_update).toLocaleTimeString("en-ZA")} last />
              )}
            </div>

            {/* Map section */}
            {hasLocation ? (
              <div style={{ backgroundColor: "#0f1217", border: "1px solid #1e2530", borderRadius: 14, overflow: "hidden", marginBottom: 16 }}>
                {/* Static map image via OpenStreetMap */}
                {staticMapUrl && (
                  <img
                    src={staticMapUrl}
                    alt="Trip location map"
                    style={{ width: "100%", display: "block", maxHeight: 220, objectFit: "cover" }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                )}
                <div style={{ padding: "12px 16px" }}>
                  <div style={{ color: "#888", fontSize: 11, marginBottom: 8 }}>
                    📍 Last known location
                    <span style={{ color: "#444", marginLeft: 8, fontFamily: "monospace", fontSize: 10 }}>
                      {trip.last_latitude?.toFixed(5)}, {trip.last_longitude?.toFixed(5)}
                    </span>
                  </div>
                  <a
                    href={mapsOpenUrl!}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      backgroundColor: "#00E5FF", color: "#000",
                      fontWeight: 700, fontSize: 13, textDecoration: "none",
                      borderRadius: 8, padding: "9px 16px",
                    }}>
                    🗺️ Open in Google Maps
                  </a>
                </div>
              </div>
            ) : (
              <div style={{ backgroundColor: "#0f1217", border: "1px solid #1e2530", borderRadius: 14, padding: "20px 18px", marginBottom: 16, textAlign: "center" }}>
                <div style={{ color: "#444", fontSize: 13 }}>No GPS location available yet</div>
                <div style={{ color: "#333", fontSize: 11, marginTop: 4 }}>Location will appear here once the driver starts moving</div>
              </div>
            )}

            {/* Safety note */}
            <div style={{ backgroundColor: "#0a1a0f", border: "1px solid rgba(74,222,128,0.15)", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
              <div style={{ color: "#4ade80", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>🛡️ This trip is tracked by Tag n Ride SafeRide</div>
              <div style={{ color: "#666", fontSize: 12, lineHeight: 1.7 }}>
                In case of emergency call <strong style={{ color: "#ff5555" }}>10111</strong> (Police) or <strong style={{ color: "#ff5555" }}>10177</strong> (Ambulance)<br />
                Tag n Ride support: <strong style={{ color: "#888" }}>support@tagnride.com</strong>
              </div>
            </div>

            {trip.status === "active" && (
              <div style={{ color: "#333", fontSize: 11, textAlign: "center" }}>
                🔄 This page refreshes automatically every 30 seconds
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, mono, last }: { label: string; value: string; mono?: boolean; last?: boolean }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      paddingBottom: last ? 0 : 10, marginBottom: last ? 0 : 10,
      borderBottom: last ? "none" : "1px solid #1a1f2a",
    }}>
      <span style={{ color: "#555", fontSize: 12 }}>{label}</span>
      <span style={{ color: "#fff", fontWeight: 600, fontSize: 14, fontFamily: mono ? "monospace" : "inherit" }}>{value}</span>
    </div>
  );
}
