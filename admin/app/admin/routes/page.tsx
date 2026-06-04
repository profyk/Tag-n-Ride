"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Spinner, Input, Button } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Activity, Users, TrendingUp, Clock, MapPin, RefreshCw, Download, Search, X } from "lucide-react";
import toast from "react-hot-toast";

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
  const [search, setSearch] = useState("");

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

  const filteredRoutes = routes.filter(r =>
    !search ||
    r.driver_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.phone_number?.includes(search) ||
    r.vehicle_plate?.toLowerCase().includes(search.toLowerCase())
  );

  const exportCsv = () => {
    const rows = [
      ["Driver", "Phone", "Plate", "Fare", "Started", "Duration (min)", "App Passengers", "Cash Passengers", "Total Passengers", "Collected", "Status"],
      ...filteredRoutes.map(r => [
        r.driver_name, r.phone_number, r.vehicle_plate || "",
        r.fare || 0, formatDate(r.started_at), r.duration_mins,
        r.app_count, r.cash_count, r.total_passengers,
        r.total_collected, r.status,
      ]),
    ];
    const csv = rows.map(r => r.map((c: string | number) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `routes-${dateFilter || new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url); toast.success("Exported");
  };

  return (
    <AdminShell title="Routes and Trips">
      <div className="space-y-6">

        {/* Top stats */}
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

        {/* Secondary stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card>
            <p className="text-[10px] text-textMuted font-bold uppercase tracking-widest mb-1">Avg Passengers / Route</p>
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

        {/* Hourly chart */}
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

        {/* On duty now */}
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
                    {d.fare > 0 && <p className="text-cyan text-xs font-bold">R{d.fare} fare</p>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Filters + search */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex gap-2">
            {(["all", "active", "ended"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all capitalize ${filter === f ? "bg-cyanDim text-cyan border-cyan/20" : "bg-bg2 text-textMuted border-border"}`}>
                {f}
              </button>
            ))}
          </div>
          <div className="flex-1 min-w-36">
            <Input
              placeholder="Search driver, phone, plate..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="bg-bg2 border border-border rounded-lg px-3 py-2 text-text text-xs focus:outline-none focus:border-cyan"
          />
          {(search || dateFilter) && (
            <Button variant="ghost" onClick={() => { setSearch(""); setDateFilter(""); }}>
              <X size={13} /> Clear
            </Button>
          )}
          <button onClick={load} className="text-xs text-textMuted hover:text-cyan flex items-center gap-1 transition-colors">
            <RefreshCw size={12} /> Refresh
          </button>
          <Button variant="secondary" onClick={exportCsv}>
            <Download size={13} /> Export
          </Button>
        </div>

        {loading ? <Spinner /> : (
          <>
            <Card>
              <div className="overflow-x-auto">
                {filteredRoutes.length === 0 ? (
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
                      {filteredRoutes.map((r: any) => (
                        <tr key={r.id} className="border-b border-border/50 hover:bg-bg3/30 transition-colors">
                          <td className="py-3 px-3">
                            <p className="text-text font-semibold text-xs">{r.driver_name}</p>
                            <p className="text-textDim text-[10px]">{r.phone_number}</p>
                          </td>
                          <td className="py-3 px-3">
                            {r.vehicle_plate
                              ? <span className="font-mono text-[10px] bg-yellow/10 text-yellow px-2 py-0.5 rounded">{r.vehicle_plate}</span>
                              : <span className="text-textDim">—</span>}
                          </td>
                          <td className="py-3 px-3 text-textMuted text-xs">{r.fare > 0 ? `R${r.fare}` : "—"}</td>
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

            {filteredRoutes.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Routes shown", value: filteredRoutes.length, color: "text-cyan" },
                  { label: "Total passengers", value: filteredRoutes.reduce((s, r) => s + r.total_passengers, 0), color: "text-purple" },
                  { label: "App passengers", value: filteredRoutes.reduce((s, r) => s + r.app_count, 0), color: "text-cyan" },
                  { label: "Total collected", value: formatZAR(filteredRoutes.reduce((s, r) => s + r.total_collected, 0)), color: "text-green" },
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
