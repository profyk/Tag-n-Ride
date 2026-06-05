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

  const mapUrl = trip?.last_latitude && trip?.last_longitude
    ? `https://maps.google.com/maps?q=${trip.last_latitude},${trip.last_longitude}&z=15&output=embed`
    : null;

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0a0a0a", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ backgroundColor: "#111", borderBottom: "1px solid #222", padding: "16px 24px", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#00E5FF20", border: "1px solid #00E5FF50", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
          🛡️
        </div>
        <div>
          <div style={{ color: "#00E5FF", fontWeight: 800, fontSize: 18 }}>TAG N RIDE SafeRide</div>
          <div style={{ color: "#888", fontSize: 12, marginTop: 2 }}>Family trip tracking · powered by SafeRide</div>
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px" }}>
        {loading && (
          <div style={{ textAlign: "center", color: "#888", padding: "60px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            <div>Loading trip…</div>
          </div>
        )}

        {!loading && notFound && (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 20, marginBottom: 8 }}>Trip not found</div>
            <div style={{ color: "#888", fontSize: 14 }}>This link may have expired or is invalid.</div>
          </div>
        )}

        {!loading && trip && (
          <>
            <div style={{ backgroundColor: "#111", border: "1px solid #222", borderRadius: 16, padding: "16px 20px", marginBottom: 16 }}>
              <div style={{ color: "#888", fontSize: 12, fontWeight: 700, letterSpacing: 1.2, marginBottom: 12 }}>YOUR FAMILY MEMBER IS ON A SAFERIDE TRIP</div>

              <InfoRow label="Vehicle" value={trip.vehicle_plate || "—"} />
              <InfoRow label="Driver" value={trip.driver_name || "—"} />
              <InfoRow label="Started" value={trip.started_at ? new Date(trip.started_at).toLocaleString("en-ZA") : "—"} />
              <InfoRow
                label="Status"
                value={trip.status === "active" ? "ACTIVE" : "COMPLETED"}
                valueColor={trip.status === "active" ? "#00E5FF" : "#888"}
              />
              <InfoRow label="Passengers in vehicle" value={String(trip.passenger_count ?? 0)} />
              {trip.last_location_update && (
                <InfoRow label="Last location update" value={new Date(trip.last_location_update).toLocaleTimeString("en-ZA")} />
              )}
            </div>

            {mapUrl && (
              <div style={{ backgroundColor: "#111", border: "1px solid #222", borderRadius: 16, overflow: "hidden", marginBottom: 16 }}>
                <iframe
                  src={mapUrl}
                  width="100%"
                  height="300"
                  style={{ border: "none", display: "block" }}
                  loading="lazy"
                  title="Trip location"
                />
              </div>
            )}

            {!mapUrl && trip.last_latitude && (
              <div style={{ backgroundColor: "#111", border: "1px solid #222", borderRadius: 16, padding: "16px 20px", marginBottom: 16, textAlign: "center" }}>
                <div style={{ color: "#00E5FF", fontSize: 13 }}>📍 Last known location</div>
                <div style={{ color: "#888", fontSize: 12, marginTop: 4 }}>{trip.last_latitude}, {trip.last_longitude}</div>
                <a
                  href={`https://maps.google.com/?q=${trip.last_latitude},${trip.last_longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "inline-block", marginTop: 10, color: "#00E5FF", fontSize: 13, textDecoration: "none", border: "1px solid #00E5FF40", borderRadius: 8, padding: "6px 14px" }}>
                  Open in Google Maps
                </a>
              </div>
            )}

            <div style={{ backgroundColor: "#111", border: "1px solid #1a2e1a", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
              <div style={{ color: "#4ade80", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>🛡️ This trip is being tracked by Tag n Ride SafeRide</div>
              <div style={{ color: "#888", fontSize: 12, lineHeight: 1.6 }}>
                In case of emergency call <strong style={{ color: "#ff4444" }}>10111</strong><br />
                For Tag n Ride support: <strong>support@tagnride.com</strong>
              </div>
            </div>

            {trip.status === "active" && (
              <div style={{ color: "#555", fontSize: 11, textAlign: "center" }}>This page refreshes automatically every 30 seconds</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 10, marginBottom: 10, borderBottom: "1px solid #1e1e1e" }}>
      <span style={{ color: "#888", fontSize: 12 }}>{label}</span>
      <span style={{ color: valueColor || "#fff", fontWeight: 600, fontSize: 14 }}>{value}</span>
    </div>
  );
}
