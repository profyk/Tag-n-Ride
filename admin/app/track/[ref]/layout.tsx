import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SafeRide Live Tracking — Tag n Ride",
  description: "Track a Tag n Ride trip live in real time.",
};

export default function TrackLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
