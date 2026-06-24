"use client";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import { useEffect } from "react";
import type { MapPin } from "./LiveMap";

const KIND_COLOR: Record<MapPin["kind"], string> = {
  sos: "#ef4444",
  deadman: "#a855f7",
  trip: "#06b6d4",
  trackme: "#3b82f6",
};

function pinIcon(kind: MapPin["kind"]) {
  const color = KIND_COLOR[kind];
  return L.divIcon({
    className: "tnr-map-pin",
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 0 2px ${color}66"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function FitBounds({ pins }: { pins: MapPin[] }) {
  const map = useMap();
  useEffect(() => {
    if (pins.length === 0) return;
    if (pins.length === 1) {
      map.setView([pins[0].lat, pins[0].lng], 14);
      return;
    }
    const bounds = L.latLngBounds(pins.map(p => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins.map(p => `${p.id}:${p.lat},${p.lng}`).join("|")]);
  return null;
}

export default function LiveMapInner({
  pins, route, height,
}: { pins: MapPin[]; route?: [number, number][]; height: number }) {
  const center: [number, number] = pins.length > 0 ? [pins[0].lat, pins[0].lng] : [-26.2041, 28.0473]; // default: Johannesburg

  return (
    <MapContainer center={center} zoom={12} style={{ height, width: "100%", borderRadius: 12 }} scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {route && route.length > 1 && <Polyline positions={route} color="#06b6d4" weight={3} opacity={0.8} />}
      {pins.map(pin => (
        <Marker key={pin.id} position={[pin.lat, pin.lng]} icon={pinIcon(pin.kind)}>
          <Popup>
            <div style={{ fontSize: 12, fontWeight: 700 }}>{pin.label}</div>
            {pin.sublabel && <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{pin.sublabel}</div>}
            {pin.onClick && (
              <button
                onClick={pin.onClick}
                style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: "#06b6d4", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                View details →
              </button>
            )}
          </Popup>
        </Marker>
      ))}
      <FitBounds pins={pins} />
    </MapContainer>
  );
}
