"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Spinner, Input, Button } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import { Search, Star, TrendingUp, TrendingDown, X } from "lucide-react";
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
  const router = useRouter();
  const driverId = params.get("id");

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!driverId) return;
    setLoading(true);
    fetch(`${BASE}/api/admin/drivers/${driverId}/performance`, { headers: authHeaders() })
      .then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, [driverId]);

  const handleSearch = async () => {
    if (!search.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`${BASE}/api/admin/drivers?search=${encodeURIComponent(search.trim())}`, { headers: authHeaders() });
      const raw = await res.json();
      setResults(Array.isArray(raw) ? raw : (raw.data || []));
    } catch {}
    finally { setSearching(false); }
  };

  const thisMonth = data?.monthly?.[0]?.earnings || 0;
  const lastMonth = data?.monthly?.[1]?.earnings || 0;
  const growth = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth * 100).toFixed(1) : null;

  if (!driverId) return (
    <div className="space-y-6">
      <div className="max-w-lg">
        <div className="flex gap-2">
          <Input
            placeholder="Search driver by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <Button onClick={handleSearch} loading={searching}>
            <Search size={13} /> Search
          </Button>
        </div>
      </div>

      {results.length > 0 && (
        <Card>
          <h3 className="text-text font-bold text-sm mb-3">Select a Driver</h3>
          <div className="space-y-2">
            {results.map((d: any) => (
              <button
                key={d.user_id}
                onClick={() => router.push(`/admin/performance?id=${d.user_id}`)}
                className="w-full flex items-center justify-between p-3 bg-bg border border-border rounded-xl hover:border-cyan/30 transition-all text-left">
                <div>
                  <p className="text-text font-semibold text-sm">{d.full_name}</p>
                  <p className="text-textMuted text-xs font-mono">{d.phone_number}</p>
                </div>
                <div className="text-right">
                  <p className="text-green font-bold text-sm">{formatZAR(d.total_earnings)}</p>
                  {d.rating_count > 0 && (
                    <p className="text-yellow text-xs flex items-center gap-1 justify-end">
                      <Star size={10} fill="currentColor" /> {d.rating_avg.toFixed(1)}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {!results.length && !searching && (
        <div className="text-center py-16 text-textMuted">
          <Search size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-bold">Search for a driver to view performance</p>
          <p className="text-sm mt-1">Search by name, phone, or navigate from the Drivers page</p>
        </div>
      )}
    </div>
  );

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      {/* Driver header */}
      {data?.driver && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-text font-bold text-lg">{data.driver.full_name || data.driver.phone_number}</h2>
            <p className="text-textMuted text-sm font-mono">{data.driver.phone_number}</p>
          </div>
          <Button variant="ghost" onClick={() => router.push("/admin/performance")}>
            <X size={13} /> Clear
          </Button>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-bg2 border border-border rounded-xl p-4">
          <p className="text-[9px] font-bold text-textDim uppercase tracking-wider mb-1">Total Earnings</p>
          <p className="text-xl font-black tabular-nums text-green">{formatZAR(data?.driver?.total_earnings || 0)}</p>
        </div>
        <div className="bg-bg2 border border-border rounded-xl p-4">
          <p className="text-[9px] font-bold text-textDim uppercase tracking-wider mb-1">Rating</p>
          <p className="text-xl font-black text-yellow">★ {data?.driver?.rating_avg?.toFixed(1) || "0.0"}</p>
          <p className="text-[10px] text-textDim mt-0.5">{data?.driver?.rating_count || 0} ratings</p>
        </div>
        <div className="bg-bg2 border border-border rounded-xl p-4">
          <p className="text-[9px] font-bold text-textDim uppercase tracking-wider mb-1">This Month</p>
          <p className="text-xl font-black tabular-nums text-cyan">{formatZAR(thisMonth)}</p>
        </div>
        <Card className="flex flex-col items-center justify-center text-center p-4">
          <div className="flex items-center gap-1.5 mb-1">
            {growth !== null ? (
              parseFloat(growth) >= 0
                ? <TrendingUp size={16} className="text-green" />
                : <TrendingDown size={16} className="text-red" />
            ) : null}
            <span className={`font-extrabold text-lg ${
              growth === null ? "text-textMuted" :
              parseFloat(growth) >= 0 ? "text-green" : "text-red"
            }`}>
              {growth !== null ? `${parseFloat(growth) >= 0 ? "+" : ""}${growth}%` : "—"}
            </span>
          </div>
          <p className="text-textDim text-xs">vs Last Month</p>
        </Card>
      </div>

      {/* Daily earnings chart */}
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
            <YAxis stroke="#444466" tick={{ fontSize: 10, fill: "#8888AA" }} tickFormatter={(v) => `R${v}`} />
            <Tooltip {...TT} formatter={(v: number) => [formatZAR(v), "Earnings"]} />
            <Area type="monotone" dataKey="earnings" stroke="#00E676" fill="url(#gE)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Peak hours */}
        <Card>
          <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4">Peak Hours</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data?.peak_hours || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" />
              <XAxis dataKey="hour" stroke="#444466" tick={{ fontSize: 10, fill: "#8888AA" }} tickFormatter={(v) => `${v}:00`} />
              <YAxis stroke="#444466" tick={{ fontSize: 10, fill: "#8888AA" }} />
              <Tooltip {...TT} labelFormatter={(v) => `${v}:00`} />
              <Bar dataKey="trips" fill="#00D4FF" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Ratings breakdown */}
        <Card>
          <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4">Ratings Breakdown</h2>
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
                    <div className="h-full bg-yellow rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-textMuted text-xs w-8 text-right">{count}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs">
            <span className="text-textMuted">Overall average</span>
            <span className="text-yellow font-bold text-base">★ {data?.driver?.rating_avg?.toFixed(2) || "—"}</span>
          </div>
        </Card>
      </div>

      {/* Monthly breakdown */}
      {data?.monthly?.length > 0 && (
        <Card>
          <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4">Monthly Earnings</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr>
                  {["Month", "Earnings", "vs Previous"].map(h => (
                    <th key={h} className="px-4 py-2 text-left text-[10px] font-bold text-textMuted uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.monthly.map((m: any, i: number) => {
                  const prev = data.monthly[i + 1]?.earnings;
                  const change = prev && prev > 0 ? ((m.earnings - prev) / prev * 100).toFixed(1) : null;
                  return (
                    <tr key={m.month} className="hover:bg-bg3 transition-colors">
                      <td className="px-4 py-3 font-semibold">{m.month}</td>
                      <td className="px-4 py-3 text-green font-bold">{formatZAR(m.earnings)}</td>
                      <td className="px-4 py-3">
                        {change !== null && (
                          <span className={`text-xs font-bold flex items-center gap-1 ${parseFloat(change) >= 0 ? "text-green" : "text-red"}`}>
                            {parseFloat(change) >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                            {parseFloat(change) >= 0 ? "+" : ""}{change}%
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
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
