"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Spinner, StatCard } from "@/components/ui";
import { formatZAR } from "@/lib/utils";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});
const TT = {
  contentStyle: {
    background: "#0D0D16", border: "1px solid #1A1A2E",
    borderRadius: 8, color: "#F0F0FF", fontSize: 12,
  },
};

function PerformanceContent() {
  const params = useSearchParams();
  const driverId = params.get("id");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!driverId) { setLoading(false); return; }
    fetch(`${BASE}/api/admin/drivers/${driverId}/performance`, { headers: authHeaders() })
      .then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, [driverId]);

  if (!driverId) return (
    <div className="text-textMuted text-center py-16">
      No driver selected. Navigate here from the Drivers page.
    </div>
  );

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Earnings"
          value={formatZAR(data?.driver?.total_earnings || 0)} tone="green" />
        <StatCard label="Rating"
          value={`★ ${data?.driver?.rating_avg?.toFixed(1) || "0.0"}`} tone="yellow"
          sub={`${data?.driver?.rating_count || 0} ratings`} />
        <StatCard label="Phone" value={data?.driver?.phone_number || "—"} tone="cyan" />
        <StatCard label="This Month"
          value={formatZAR(data?.monthly?.[0]?.earnings || 0)} tone="purple" />
      </div>

      <Card>
        <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4">
          Daily Earnings (30 days)
        </h2>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data?.daily || []}>
            <defs>
              <linearGradient id="gE" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00E676" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#00E676" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" />
            <XAxis dataKey="date" stroke="#444466" tick={{ fontSize: 10, fill: "#8888AA" }} />
            <YAxis stroke="#444466" tick={{ fontSize: 10, fill: "#8888AA" }}
              tickFormatter={(v) => `R${v}`} />
            <Tooltip {...TT} formatter={(v: number) => [formatZAR(v), "Earnings"]} />
            <Area type="monotone" dataKey="earnings" stroke="#00E676"
              fill="url(#gE)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4">
            Peak Hours
          </h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data?.peak_hours || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" />
              <XAxis dataKey="hour" stroke="#444466" tick={{ fontSize: 10, fill: "#8888AA" }}
                tickFormatter={(v) => `${v}:00`} />
              <YAxis stroke="#444466" tick={{ fontSize: 10, fill: "#8888AA" }} />
              <Tooltip {...TT} labelFormatter={(v) => `${v}:00`} />
              <Bar dataKey="trips" fill="#00D4FF" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4">
            Ratings Breakdown
          </h2>
          <div className="space-y-3">
            {[5, 4, 3, 2, 1].map(star => {
              const r = data?.ratings_breakdown?.find((x: any) => x.stars === star);
              const count = r?.count || 0;
              const total = data?.driver?.rating_count || 1;
              const pct = Math.round((count / total) * 100);
              return (
                <div key={star} className="flex items-center gap-3">
                  <span className="text-yellow text-sm font-bold w-4">{star}★</span>
                  <div className="flex-1 h-2 bg-bg3 rounded-full overflow-hidden">
                    <div className="h-full bg-yellow rounded-full transition-all"
                      style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-textMuted text-xs w-8">{count}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function PerformancePage() {
  return (
    <AdminShell title="Driver Performance">
      <Suspense fallback={<Spinner />}>
        <PerformanceContent />
      </Suspense>
    </AdminShell>
  );
}
