"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Spinner } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Activity, Users, TrendingUp, Clock } from "lucide-react";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}` });
const TT = { contentStyle: { background: "#0D0D16", border: "1px solid #1A1A2E", borderRadius: 8, color: "#F0F0FF", fontSize: 12 } };

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

  const formatDuration = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m`;
    return `${h}hr ${m}m`;
  };

  return (
    <AdminShell title="Routes & Trips">
      <div className="space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Active Routes", value: stats?.active_routes || 0, icon: Activity, color: "text-green" },
            { label: "Routes Today", value: stats?.today_routes || 0, icon: TrendingUp, color: "text-cyan" },
            { label: "Passengers Today", value: stats?.today_passengers || 0, icon: Users, color: "text-purple" },
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

        {/* Hourly chart */}
        {stats?.hourly_today?.length > 0 && (
          <Card>
            <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4">Today's Routes by Hour</h2>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={stats.hourly_today}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" />
                <XAxis dataKey="hour" stroke="#444466" tick={{ fontSize: 10, fill: "#8888AA" }}
                  tickFormatter={(v) => `${v}:00`} />
                <YAxis stroke="#444466" tick={{ fontSize: 10, fill: "#8888AA" }} />
                <Tooltip {...TT} labelFormatter={(v) => `${v}:00`} />
                <Bar dataKey="routes" fill="#00D4FF" radius={[3, 3, 0, 0]} name="Routes" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* On Duty now */}
        {onDuty.length > 0 && (
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-green animate-pulse" />
              <h2 className="text-text font-bold">On Duty Now ({onDuty.length})</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {onDuty.map((d: any) => (
                <div key={d.route_id}
                  className="flex items-center justify-between p-3 bg-bg border border-green/20 rounded-xl">
                  <div>
                    <p className="text-text font-bold text-sm">{d.driver_name}</p>
                    <p className="text-textMuted text-xs">{d.phone_number}</p>
                    {d.vehicle_plate && (
                      <span className="text-[10px] font-mono bg-yellow/10 text-yellow px-2 py-0.5 rounded mt-1 inline-block">
                        {d.vehicle_plate}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-green font-bold text-sm">{formatDuration(d.duration_mins)}</p>
                    <p className="text-textMuted text-xs">{d.total_passengers} passengers</p>
                    {d.fare > 0 && <p className="text-textDim text-xs">R{d.fare} fare</p>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex gap-2">
            {(["all", "active", "ended"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all capitalize
                  ${filter === f ? "bg-cyanDim text-cyan border-cyan/20" : "bg-bg2 text-textMuted border-border"}`}>
                {f}
              </button>
            ))}
          </div>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="bg-bg2 border border-border rounded-lg px-3 py-1.5 text-text text-xs focus:outline-none focus:border-cyan"
          />
          {dateFilter && (
            <button onClick={() => setDateFilter("")}
              className="text-xs text-textMuted hover:text-red transition-colors">
              Clear date
            </button>
          )}
        </div>

        {/* Routes table */}
        {loading ? <Spinner /> : (
          <Table
            headers={["Driver", "Phone", "Plate", "Fare", "Started", "Duration", "App", "Cash", "Total", "Collected", "Status"]}
            empty={!routes.length}>
            {routes.map((r: any) => (
              <Tr key={r.id}>
                <Td className="font-semibold">{r.driver_name}</Td>
                <Td className="font-mono text-xs text-textMuted">{r.phone_number}</Td>
                <Td>
                  {r.vehicle_plate ? (
                    <span className="font-mono text-xs bg-yellow/10 text-yellow px-2 py-0.5 rounded">
                      {r.vehicle_plate}
                    </span>
                  ) : "—"}
                </Td>
                <Td className="text-textMuted text-xs">
                  {r.fare > 0 ? `R${r.fare}` : "—"}
                </Td>
                <Td className="text-textMuted text-xs">{formatDate(r.started_at)}</Td>
                <Td className="text-textMuted text-xs">{formatDuration(r.duration_mins)}</Td>
                <Td className="text-cyan font-bold">{r.app_count}</Td>
                <Td className="text-yellow font-bold">{r.cash_count}</Td>
                <Td className="font-bold">{r.total_passengers}</Td>
                <Td className="text-green font-bold">{formatZAR(r.total_collected)}</Td>
                <Td>
                  <Badge
                    label={r.status}
                    tone={r.status === "active" ? "green" : "muted"}
                  />
                </Td>
              </Tr>
            ))}
          </Table>
        )}

        {/* Summary stats */}
        {!loading && routes.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="text-center">
              <p className="text-2xl font-extrabold text-cyan">{routes.length}</p>
              <p className="text-xs text-textMuted mt-1">Routes shown</p>
            </Card>
            <Card className="text-center">
              <p className="text-2xl font-extrabold text-purple">
                {routes.reduce((s, r) => s + r.total_passengers, 0)}
              </p>
              <p className="text-xs text-textMuted mt-1">Total passengers</p>
            </Card>
            <Card className="text-center">
              <p className="text-2xl font-extrabold text-yellow">
                {routes.reduce((s, r) => s + r.cash_count, 0)}
              </p>
              <p className="text-xs text-textMuted mt-1">Cash passengers</p>
            </Card>
            <Card className="text-center">
              <p className="text-2xl font-extrabold text-green">
                {formatZAR(routes.reduce((s, r) => s + r.total_collected, 0))}
              </p>
              <p className="text-xs text-textMuted mt-1">Total collected</p>
            </Card>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
