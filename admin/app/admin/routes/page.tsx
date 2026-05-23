"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Spinner } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Activity, Users, TrendingUp, Clock, MapPin, RefreshCw } from "lucide-react";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}` });
const TT = { contentStyle: { background: "#0D0D16", border: "1px solid #1A1A2E", borderRadius: 8, color: "#F0F0FF", fontSize: 12 } };

function formatDuration(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}hr ${m}m`;
}

export default function RoutesPage() {
  const [stats, setStats] = useState<any>(null);
  const [routes, setRoutes] = useState<any[]>([]);
  const [onDuty, setOnDuty] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "ended">("all");
  const [dateFilter, setDateFilter] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("status", filter);
      if (dateFilter) params.set("date", dateFilter);
      const [s, r, o] = await Promise.all([
        fetch(`${BASE}/api/admin/routes/stats`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${BASE}/api/admin/routes?${params}`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${BASE}/api/admin/drivers/on-duty`, { headers: authHeaders() }).then(r => r.json()),
      ]);
      setStats(s); setRoutes(Array.isArray(r) ? r : []); setOnDuty(Array.isArray(o) ? o : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filter, dateFilter]);

  return (
    <AdminShell title="Routes and Trips">
      <div className="space-y-6">

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Active Routes", value: stats?.active_routes ?? 0, icon: Activity, color: "text-green" },
            { label: "Routes Today", value: stats?.today_routes ?? 0, icon: TrendingUp, color: "text-cyan" },
            { label: "Passengers Today", value: stats?.today_passengers ?? 0, icon: Users, color: "text-purple" },
            { label: "Collected Today", value: formatZAR(stats?.today_collected || 0), icon: Clock, color: "text-yellow" },
          ].map(s => (
            <Card key={s.label}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest">{s.label}</p>
                <s.icon size={16} className={s.color} />
              </div>
              <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card>
            <p className="text-[10px] text-textMuted font-bold uppercase tracking-widest mb-1">Avg Passengers per Route</p>
            <p className="text-xl font-extrabold text-cyan">{stats?.avg_passengers_per_route ?? 0}</p>
          </Card>
          <Card>
            <p className="text-[10px] text-textMuted font-bold uppercase tracking-widest mb-1">Avg Route Duration</p>
            <p className="text-xl font-extrabold text-cyan">{formatDuration(Math.round(stats?.avg_duration_mins || 0))}</p>
          </Card>
          <Card>
            <p className="text-[10px] text-textMuted font-bold uppercase tracking-widest mb-1">Total Routes All Time</p>
            <p className="text-xl font-extrabold text-cyan">{stats?.total_routes ?? 0}</p>
          </Card>
        </div>

        {stats?.hourly_today?.length > 0 && (
          <Card>
            <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4">Today Routes by Hour</h2>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={stats.hourly_today}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" />
                <XAxis dataKey="hour" stroke="#444466" tick={{ fontSize: 10, fill: "#8888AA" }} tickFormatter={(v) => `${v}:00`} />
                <YAxis stroke="#444466" tick={{ fontSize: 10, fill: "#8888AA" }} />
                <Tooltip {...TT} labelFormatter={(v) => `${v}:00`} />
                <Bar dataKey="routes" fill="#00D4FF" radius={[3, 3, 0, 0]} name="Routes" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {onDuty.length > 0 && (
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-green animate-pulse" />
              <h2 className="text-text font-bold">On Duty Now ({onDuty.length})</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {onDuty.map((d: any) => (
                <div key={d.route_id} className="flex items-center justify-between p-3 bg-bg border border-green/20 rounded-xl">
                  <div>
                    <p className="text-text font-bold text-sm">{d.driver_name}</p>
                    <p className="text-textMuted text-xs">{d.phone_number}</p>
                    {d.vehicle_plate && (
                      <span className="text-[10px] font-mono bg-yellow/10 text-yellow px-2 py-0.5 rounded mt-1 inline-block">{d.vehicle_plate}</span>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-green font-bold text-sm">{formatDuration(d.duration_mins)}</p>
                    <p className="text-textMuted text-xs">{d.total_passengers} passengers</p>
                    <p className="text-textDim text-xs">{d.app_count} app · {d.cash_count} cash</p>
                    {d.fare > 0 && <p className="text-textDim text-xs">R{d.fare} fare</p>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex gap-2">
            {(["all", "active", "ended"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all capitalize ${filter === f ? "bg-cyanDim text-cyan border-cyan/20" : "bg-bg2 text-textMuted border-border"}`}>
                {f}
              </button>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}
              className="bg-bg2 border border-border rounded-lg px-3 py-1.5 text-text text-xs focus:outline-none focus:border-cyan" />
            {dateFilter && <button onClick={() => setDateFilter("")} className="text-xs text-textMuted hover:text-red transition-colors">Clear</button>}
            <button onClick={load} className="text-xs text-textMuted hover:text-cyan flex items-center gap-1 transition-colors">
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
        </div>

        {loading ? <Spinner /> : (
          <>
            <Card>
              <div className="overflow-x-auto">
                {routes.length === 0 ? (
                  <div className="text-center py-12">
                    <MapPin size={32} className="text-textDim mx-auto mb-3" />
                    <p className="text-textMuted font-bold">No routes found</p>
                    <p className="text-textDim text-sm mt-1">Try changing the filters</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        {["Driver", "Plate", "Fare", "Started", "Duration", "App", "Cash", "Total", "Collected", "Status"].map(h => (
                          <th key={h} className="text-left py-3 px-3 text-[10px] font-bold text-textMuted uppercase tracking-widest whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {routes.map((r: any) => (
                        <tr key={r.id} className="border-b border-border/50 hover:bg-bg3/30 transition-colors">
                          <td className="py-3 px-3">
                            <p className="text-text font-semibold text-xs">{r.driver_name}</p>
                            <p className="text-textDim text-[10px]">{r.phone_number}</p>
                          </td>
                          <td className="py-3 px-3">
                            {r.vehicle_plate ? <span className="font-mono text-[10px] bg-yellow/10 text-yellow px-2 py-0.5 rounded">{r.vehicle_plate}</span> : <span className="text-textDim">-</span>}
                          </td>
                          <td className="py-3 px-3 text-textMuted text-xs">{r.fare > 0 ? `R${r.fare}` : "-"}</td>
                          <td className="py-3 px-3 text-textMuted text-xs whitespace-nowrap">{formatDate(r.started_at)}</td>
                          <td className="py-3 px-3 text-textMuted text-xs whitespace-nowrap">{formatDuration(r.duration_mins)}</td>
                          <td className="py-3 px-3 text-cyan font-bold text-xs">{r.app_count}</td>
                          <td className="py-3 px-3 text-yellow font-bold text-xs">{r.cash_count}</td>
                          <td className="py-3 px-3 font-bold text-xs">{r.total_passengers}</td>
                          <td className="py-3 px-3 text-green font-bold text-xs whitespace-nowrap">{formatZAR(r.total_collected)}</td>
                          <td className="py-3 px-3">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${r.status === "active" ? "bg-green/10 text-green border-green/20" : "bg-bg3 text-textMuted border-border"}`}>
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Card>

            {routes.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Routes shown", value: routes.length, color: "text-cyan" },
                  { label: "Total passengers", value: routes.reduce((s, r) => s + r.total_passengers, 0), color: "text-purple" },
                  { label: "Cash passengers", value: routes.reduce((s, r) => s + r.cash_count, 0), color: "text-yellow" },
                  { label: "Total collected", value: formatZAR(routes.reduce((s, r) => s + r.total_collected, 0)), color: "text-green" },
                ].map(s => (
                  <Card key={s.label} className="text-center">
                    <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-textMuted mt-1">{s.label}</p>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}
