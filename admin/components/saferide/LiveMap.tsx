"use client";
import dynamic from "next/dynamic";
import { Spinner } from "@/components/ui";

export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  kind: "sos" | "deadman" | "trip" | "trackme";
  label: string;
  sublabel?: string;
  onClick?: () => void;
};

const LiveMapInner = dynamic(() => import("./LiveMapInner"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center bg-bg2 border border-border rounded-xl" style={{ height: 420 }}>
      <Spinner size={24} />
    </div>
  ),
});

export function LiveMap({
  pins, route, height = 420, emptyMessage = "No locations to display",
}: { pins: MapPin[]; route?: [number, number][]; height?: number; emptyMessage?: string }) {
  if (pins.length === 0 && (!route || route.length === 0)) {
    return (
      <div
        className="flex items-center justify-center bg-bg2 border border-border rounded-xl text-textMuted text-sm"
        style={{ height }}>
        {emptyMessage}
      </div>
    );
  }
  return <LiveMapInner pins={pins} route={route} height={height} />;
}
