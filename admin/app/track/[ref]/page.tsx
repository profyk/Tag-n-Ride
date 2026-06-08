"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";

const API = "https://tag-n-ride-production.up.railway.app";
const POLL_INTERVAL = 30;

// ── helpers ──────────────────────────────────────────────────────────────────

function timeAgo(isoStr: string | null | undefined): string {
  if (!isoStr) return "—";
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diff < 10) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m ago`;
}

function formatTime(isoStr: string | null | undefined): string {
  if (!isoStr) return "—";
  return new Date(isoStr).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
}

function useDuration(startedAt: string | null | undefined): string {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  if (!startedAt) return "—";
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ── styles (inline to avoid any CSS conflicts) ────────────────────────────────

const C = {
  bg:       "#070A0F",
  bg2:      "#0D1117",
  bg3:      "#111820",
  border:   "#1a2030",
  border2:  "#222c40",
  cyan:     "#00E5FF",
  cyanDim:  "rgba(0,229,255,0.08)",
  green:    "#4ade80",
  greenDim: "rgba(74,222,128,0.08)",
  red:      "#ff5555",
  yellow:   "#fbbf24",
  text:     "#f0f4ff",
  textMut:  "#64748b",
  textDim:  "#334155",
};

// ── sub-components ────────────────────────────────────────────────────────────

function Row({ label, value, mono, last, accent }: {
  label: string; value: string; mono?: boolean; last?: boolean; accent?: string;
}) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      paddingBottom: last ? 0 : 12, marginBottom: last ? 0 : 12,
      borderBottom: last ? "none" : `1px solid ${C.border}`,
    }}>
      <span style={{ color: C.textMut, fontSize: 12 }}>{label}</span>
      <span style={{
        color: accent || C.text, fontWeight: 600, fontSize: 13,
        fontFamily: mono ? "monospace" : "inherit",
      }}>{value}</span>
    </div>
  );
}

function Pill({ color, bg, label }: { color: string; bg: string; label: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      backgroundColor: bg, color, fontWeight: 700, fontSize: 11,
      borderRadius: 999, padding: "4px 10px",
      border: `1px solid ${color}40`,
    }}>
      {label}
    </span>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function TrackPage() {
  const params = useParams();
  const ref = params?.ref as string;

  const [trip, setTrip] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [countdown, setCountdown] = useState(POLL_INTERVAL);
  const [refreshing, setRefreshing] = useState(false);
  const [shared, setShared] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cdRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!ref) return;
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch(`${API}/api/trips/track/${encodeURIComponent(ref)}`);
      if (!res.ok) { setNotFound(true); return; }
      const data = await res.json();
      setTrip(data);
      setNotFound(false);
      if (data.status !== "active") {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        if (cdRef.current) { clearInterval(cdRef.current); cdRef.current = null; }
      }
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setCountdown(POLL_INTERVAL);
    }
  }, [ref]);

  useEffect(() => {
    if (!ref) return;
    load();
    pollRef.current = setInterval(() => load(true), POLL_INTERVAL * 1000);
    cdRef.current = setInterval(() => setCountdown(c => c <= 1 ? POLL_INTERVAL : c - 1), 1000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (cdRef.current) clearInterval(cdRef.current);
    };
  }, [load]);

  const duration = useDuration(trip?.started_at);
  const hasLocation = trip?.last_latitude != null && trip?.last_longitude != null;
  const isActive = trip?.status === "active";

  const googleMapsUrl = hasLocation
    ? `https://maps.google.com/?q=${trip.last_latitude},${trip.last_longitude}`
    : null;
  const appleMapsUrl = hasLocation
    ? `https://maps.apple.com/?ll=${trip.last_latitude},${trip.last_longitude}&z=15`
    : null;
  const staticMapUrl = hasLocation
    ? `https://staticmap.openstreetmap.de/staticmap.php?center=${trip.last_latitude},${trip.last_longitude}&zoom=15&size=600x280&markers=${trip.last_latitude},${trip.last_longitude},red-pushpin`
    : null;

  const shareLink = typeof window !== "undefined" ? window.location.href : "";

  const handleShare = async () => {
    const plate = trip?.vehicle_plate ? ` (${trip.vehicle_plate})` : "";
    const text = `🛡️ Live tracking — Tag n Ride SafeRide${plate}\n\n${shareLink}`;
    if (navigator.share) {
      try { await navigator.share({ title: "SafeRide Live Tracking", text, url: shareLink }); }
      catch { /* cancelled */ }
    } else {
      navigator.clipboard.writeText(text);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    }
  };

  // ── render helpers ────────────────────────────────────────────────────────

  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    backgroundColor: C.bg,
    color: C.text,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    WebkitFontSmoothing: "antialiased",
  };

  const cardStyle = (accent?: string): React.CSSProperties => ({
    backgroundColor: C.bg2,
    border: `1px solid ${accent || C.border}`,
    borderRadius: 16,
    padding: "16px 18px",
    marginBottom: 12,
  });

  return (
    <div style={pageStyle}>

      {/* ── Header ── */}
      <div style={{
        backgroundColor: C.bg2, borderBottom: `1px solid ${C.border}`,
        padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 10,
        backdropFilter: "blur(12px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: `linear-gradient(135deg, ${C.cyanDim}, rgba(0,229,255,0.04))`,
            border: `1.5px solid ${C.cyan}40`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
          }}>🛡️</div>
          <div>
            <div style={{ color: C.cyan, fontWeight: 900, fontSize: 16, letterSpacing: 0.3 }}>
              SafeRide
            </div>
            <div style={{ color: C.textDim, fontSize: 11, marginTop: 1 }}>Tag n Ride · Live Tracking</div>
          </div>
        </div>

        {trip && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 12px", borderRadius: 999,
            backgroundColor: isActive ? C.greenDim : "rgba(100,100,100,0.1)",
            border: `1px solid ${isActive ? C.green + "40" : "#33333340"}`,
          }}>
            <div style={{
              width: 7, height: 7, borderRadius: 4,
              backgroundColor: isActive ? C.green : "#555",
              animation: isActive ? "pulse 2s infinite" : "none",
            }} />
            <span style={{ color: isActive ? C.green : "#666", fontWeight: 700, fontSize: 12 }}>
              {isActive ? "LIVE" : "ENDED"}
            </span>
          </div>
        )}
      </div>

      {/* pulse keyframe injected once */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px 80px" }}>

        {/* ── Loading ── */}
        {loading && (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{
              width: 40, height: 40, border: `3px solid ${C.border}`,
              borderTop: `3px solid ${C.cyan}`, borderRadius: "50%",
              animation: "spin 1s linear infinite", margin: "0 auto 16px",
            }} />
            <div style={{ color: C.textMut, fontSize: 14 }}>Loading trip…</div>
          </div>
        )}

        {/* ── Not found ── */}
        {!loading && notFound && (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🔍</div>
            <div style={{ color: C.text, fontWeight: 800, fontSize: 22, marginBottom: 8 }}>Trip not found</div>
            <div style={{ color: C.textMut, fontSize: 13, lineHeight: 1.7 }}>
              This tracking link may have expired or is invalid.<br />
              Active tracking links are valid for the duration of the trip.
            </div>
          </div>
        )}

        {/* ── Trip data ── */}
        {!loading && trip && (
          <>
            {/* Status card */}
            <div style={{
              ...cardStyle(isActive ? C.green + "30" : C.border),
              background: isActive ? `linear-gradient(135deg, rgba(74,222,128,0.05), ${C.bg2})` : C.bg2,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 32 }}>{isActive ? "🚌" : "✅"}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: isActive ? C.green : "#aaa", fontWeight: 800, fontSize: 15 }}>
                    {isActive
                      ? (trip.is_personal_track ? "Live location active" : "Your person is on the road")
                      : (trip.is_personal_track ? "Tracking session ended" : "Trip has been completed safely")}
                  </div>
                  <div style={{ color: C.textMut, fontSize: 12, marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {trip.started_at && (
                      <span>Started {formatTime(trip.started_at)}</span>
                    )}
                    {trip.ended_at && (
                      <span>Ended {formatTime(trip.ended_at)}</span>
                    )}
                    {isActive && trip.started_at && (
                      <span style={{ color: C.cyan, fontWeight: 700 }}>⏱ {duration}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Vehicle + driver / Person */}
            <div style={cardStyle()}>
              {trip.is_personal_track ? (
                <>
                  <Row label="Person being tracked" value={trip.driver_name || "—"} />
                </>
              ) : (
                <>
                  <Row label="Vehicle" value={trip.vehicle_plate || "Not recorded"} mono accent={C.cyan} />
                  <Row label="Driver" value={trip.driver_name || "—"} />
                  <Row label="Passengers in vehicle" value={String(trip.passenger_count ?? 0)} />
                </>
              )}
              {hasLocation && (
                <Row
                  label="Location updated"
                  value={timeAgo(trip.last_location_update)}
                  accent={isActive ? C.green : C.textMut}
                  last
                />
              )}
            </div>

            {/* Map / Location */}
            {hasLocation ? (
              <div style={{ ...cardStyle(), padding: 0, overflow: "hidden" }}>
                {staticMapUrl && (
                  <div style={{ position: "relative" }}>
                    <img
                      src={staticMapUrl}
                      alt="Trip location map"
                      style={{ width: "100%", display: "block", maxHeight: 260, objectFit: "cover" }}
                      onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }}
                    />
                    {isActive && (
                      <div style={{
                        position: "absolute", top: 10, right: 10,
                        backgroundColor: C.bg2 + "ee", border: `1px solid ${C.green}40`,
                        borderRadius: 8, padding: "4px 10px",
                        color: C.green, fontSize: 11, fontWeight: 700,
                        display: "flex", alignItems: "center", gap: 5,
                      }}>
                        <div style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.green, animation: "pulse 2s infinite" }} />
                        LIVE
                      </div>
                    )}
                  </div>
                )}
                <div style={{ padding: "14px 18px" }}>
                  <div style={{ color: C.textDim, fontSize: 11, fontFamily: "monospace", marginBottom: 12 }}>
                    📍 {trip.last_latitude?.toFixed(5)}, {trip.last_longitude?.toFixed(5)}
                    <span style={{ marginLeft: 8, color: C.textDim }}>· {timeAgo(trip.last_location_update)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <a href={googleMapsUrl!} target="_blank" rel="noopener noreferrer" style={{
                      display: "inline-flex", alignItems: "center", gap: 7,
                      backgroundColor: C.cyan, color: "#000",
                      fontWeight: 800, fontSize: 13, textDecoration: "none",
                      borderRadius: 10, padding: "10px 18px",
                    }}>🗺️ Google Maps</a>
                    <a href={appleMapsUrl!} target="_blank" rel="noopener noreferrer" style={{
                      display: "inline-flex", alignItems: "center", gap: 7,
                      backgroundColor: C.bg3, color: C.text,
                      border: `1px solid ${C.border2}`,
                      fontWeight: 700, fontSize: 13, textDecoration: "none",
                      borderRadius: 10, padding: "10px 18px",
                    }}> Maps</a>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ ...cardStyle(), textAlign: "center", padding: "28px 18px" }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>📡</div>
                <div style={{ color: C.textMut, fontWeight: 700, fontSize: 14 }}>Waiting for GPS location</div>
                <div style={{ color: C.textDim, fontSize: 12, marginTop: 6 }}>
                  {trip?.is_personal_track
                    ? "Location will appear once the person's device sends a GPS ping"
                    : "Location will appear once the driver's device sends a GPS ping"}
                </div>
              </div>
            )}

            {/* Share this link */}
            {isActive && (
              <div style={cardStyle()}>
                <div style={{ color: C.text, fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
                  📤 Share this tracking link
                </div>
                <div style={{
                  backgroundColor: C.bg3, border: `1px solid ${C.border2}`,
                  borderRadius: 10, padding: "10px 12px",
                  color: C.textMut, fontSize: 11, fontFamily: "monospace",
                  wordBreak: "break-all", marginBottom: 12,
                }}>
                  {shareLink}
                </div>
                <button
                  onClick={handleShare}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    backgroundColor: shared ? C.green + "20" : C.cyanDim,
                    color: shared ? C.green : C.cyan,
                    border: `1px solid ${shared ? C.green + "40" : C.cyan + "40"}`,
                    borderRadius: 10, padding: "10px 18px",
                    fontWeight: 700, fontSize: 13, cursor: "pointer",
                    transition: "all 0.2s",
                  }}>
                  {shared ? "✓ Copied!" : "Copy & Share"}
                </button>
              </div>
            )}

            {/* Emergency & safety */}
            <div style={{
              ...cardStyle(C.red + "20"),
              background: `linear-gradient(135deg, rgba(255,85,85,0.04), ${C.bg2})`,
            }}>
              <div style={{ color: C.red, fontWeight: 800, fontSize: 13, marginBottom: 10 }}>
                🚨 Emergency Numbers (South Africa)
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { label: "Police",      number: "10111" },
                  { label: "Ambulance",   number: "10177" },
                  { label: "Crime Line",  number: "08600 10111" },
                  { label: "ER24",        number: "084 124" },
                ].map(e => (
                  <a key={e.label} href={`tel:${e.number.replace(/\s/g, "")}`} style={{
                    display: "flex", flexDirection: "column",
                    backgroundColor: C.bg3, border: `1px solid ${C.border2}`,
                    borderRadius: 10, padding: "10px 12px", textDecoration: "none",
                  }}>
                    <span style={{ color: C.textMut, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{e.label}</span>
                    <span style={{ color: C.red, fontWeight: 900, fontSize: 16, fontFamily: "monospace", marginTop: 3 }}>{e.number}</span>
                  </a>
                ))}
              </div>
              <div style={{ marginTop: 12, color: C.textDim, fontSize: 11, lineHeight: 1.6 }}>
                Tag n Ride Support: <a href="mailto:support@tagnride.co.za" style={{ color: C.textMut, textDecoration: "underline" }}>support@tagnride.co.za</a>
              </div>
            </div>

            {/* SafeRide footer */}
            <div style={{ ...cardStyle(), background: `linear-gradient(135deg, rgba(0,229,255,0.03), ${C.bg2})` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 22 }}>🛡️</span>
                <div>
                  <div style={{ color: C.cyan, fontWeight: 800, fontSize: 13 }}>Powered by Tag n Ride SafeRide</div>
                  <div style={{ color: C.textDim, fontSize: 11, marginTop: 2 }}>
                    Your safety is our priority. This link updates every {POLL_INTERVAL} seconds.
                  </div>
                </div>
              </div>
            </div>

            {/* Auto-refresh footer */}
            {isActive && (
              <div style={{ textAlign: "center", marginTop: 8 }}>
                {refreshing ? (
                  <span style={{ color: C.cyan, fontSize: 12, fontWeight: 600 }}>↻ Updating location…</span>
                ) : (
                  <span style={{ color: C.textDim, fontSize: 12 }}>
                    Next update in <span style={{ color: C.textMut, fontWeight: 700 }}>{countdown}s</span>
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
