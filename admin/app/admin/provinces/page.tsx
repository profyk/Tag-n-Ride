"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Spinner, Table, Tr, Td } from "@/components/ui";
import { api } from "@/lib/api";
import { formatZAR } from "@/lib/utils";
import { MapPin, Users, Car, Building2, TrendingUp } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";

const RANGES = ["7d", "30d", "90d", "all"] as const;
type Range = typeof RANGES[number];

const TT = {
  contentStyle: {
    background: "var(--bg2)", border: "1px solid var(--border)",
    borderRadius: 10, color: "var(--text)", fontSize: 12, padding: "10px 14px",
  },
};

const TREND_COLORS = ["#00D4FF", "#00E676", "#A064FF", "#FFD60A", "#FF8C42"];

type ProvinceRow = {
  province: string; passengers: number; drivers: number; owners: number;
  rides: number; gross_revenue: number; platform_fees: number; driver_net: number;
};

export default function ProvincesPage() {
  const [data, setData] = useState<{
    provinces: ProvinceRow[];
    signup_trend: Record<string, number | string>[];
    total_users: number;
    unset_count: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>("30d");

  useEffect(() => {
    setLoading(true);
    api.provincesOverview(range).then(r => setData(r.data)).finally(() => setLoading(false));
  }, [range]);

  if (loading || !data) return <AdminShell title="Province Analytics"><Spinner /></AdminShell>;

  const provinces = data.provinces;
  const topByUsers = [...provinces].sort((a, b) =>
    (b.passengers + b.drivers + b.owners) - (a.passengers + a.drivers + a.owners));
  const topByRevenue = [...provinces].filter(p => p.rides > 0).sort((a, b) => b.gross_revenue - a.gross_revenue);
  const leadingProvince = topByUsers[0];
  const totalRides = provinces.reduce((s, p) => s + p.rides, 0);
  const totalRevenue = provinces.reduce((s, p) => s + p.gross_revenue, 0);

  const userMixData = topByUsers.map(p => ({
    province: p.province, Passengers: p.passengers, Drivers: p.drivers, Owners: p.owners,
  }));

  const revenueData = topByRevenue.map(p => ({ province: p.province, Revenue: p.gross_revenue, Rides: p.rides }));

  // Adoption trend — top 5 provinces by current user count, plotted over time
  const topNames = topByUsers.slice(0, 5).map(p => p.province);
  const trendData = data.signup_trend.map(row => {
    const out: Record<string, number | string> = { date: row.date };
    topNames.forEach(name => { out[name] = row[name] || 0; });
    return out;
  });

  return (
    <AdminShell title="Province Analytics">
      <div className="space-y-6">

        <div className="flex items-center justify-between">
          <p className="text-textMuted text-sm">Adoption and sales breakdown by South African province</p>
          <div className="flex items-center gap-2">
            {RANGES.map(r => (
              <button key={r} onClick={() => setRange(r)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${range === r ? "bg-gradient-to-r from-cyan/20 to-purple/20 text-cyan border-cyan/30" : "bg-bg2 text-textMuted border-border hover:text-text"}`}>
                {r === "all" ? "All time" : r}
              </button>
            ))}
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <Users size={16} className="text-cyan" />
            </div>
            <p className="text-2xl font-extrabold text-cyan">{data.total_users.toLocaleString()}</p>
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest">Total Users</p>
          </Card>
          <Card className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <MapPin size={16} className="text-green" />
            </div>
            <p className="text-2xl font-extrabold text-green truncate">{leadingProvince?.province || "—"}</p>
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest">Leading Province</p>
          </Card>
          <Card className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <Car size={16} className="text-purple" />
            </div>
            <p className="text-2xl font-extrabold text-purple">{totalRides.toLocaleString()}</p>
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest">Rides ({range === "all" ? "all time" : range})</p>
          </Card>
          <Card className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <TrendingUp size={16} className="text-yellow" />
            </div>
            <p className="text-2xl font-extrabold text-yellow">{formatZAR(totalRevenue)}</p>
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest">Gross Revenue ({range === "all" ? "all time" : range})</p>
          </Card>
        </div>

        {data.unset_count > 0 && (
          <div className="flex items-center gap-2 text-xs text-yellow bg-yellow/10 border border-yellow/20 rounded-lg px-4 py-2.5">
            <Building2 size={13} />
            {data.unset_count.toLocaleString()} user{data.unset_count !== 1 ? "s" : ""} have no province set yet (registered before this field existed, or skipped it).
          </div>
        )}

        {/* User mix by province */}
        <Card>
          <h2 className="text-sm font-extrabold text-textMuted uppercase tracking-widest mb-5">
            User Adoption by Province
          </h2>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={userMixData} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }} />
              <YAxis type="category" dataKey="province" stroke="var(--textDim)" tick={{ fontSize: 11, fill: "var(--textMuted)" }} width={110} />
              <Tooltip {...TT} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Passengers" stackId="a" fill="#00D4FF" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Drivers" stackId="a" fill="#00E676" />
              <Bar dataKey="Owners" stackId="a" fill="#A064FF" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Adoption trend over time */}
        <Card>
          <h2 className="text-sm font-extrabold text-textMuted uppercase tracking-widest mb-5">
            Signup Trend — Top 5 Provinces
          </h2>
          {trendData.length === 0 ? (
            <p className="text-textMuted text-sm text-center py-10">No signups in this period</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" stroke="var(--textDim)" tick={{ fontSize: 9, fill: "var(--textMuted)" }} />
                <YAxis stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }} allowDecimals={false} />
                <Tooltip {...TT} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {topNames.map((name, i) => (
                  <Line key={name} type="monotone" dataKey={name} stroke={TREND_COLORS[i % TREND_COLORS.length]} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Revenue by province */}
        <Card>
          <h2 className="text-sm font-extrabold text-textMuted uppercase tracking-widest mb-5">
            Sales by Province ({range === "all" ? "all time" : range})
          </h2>
          {revenueData.length === 0 ? (
            <p className="text-textMuted text-sm text-center py-10">No completed rides in this period</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="province" stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }} />
                <YAxis stroke="var(--textDim)" tick={{ fontSize: 10, fill: "var(--textMuted)" }} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                <Tooltip {...TT} formatter={(v: number, n: string) => [n === "Revenue" ? formatZAR(v) : v, n]} />
                <Bar dataKey="Revenue" radius={[6, 6, 0, 0]}>
                  {revenueData.map((_, i) => (
                    <Cell key={i} fill={TREND_COLORS[i % TREND_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Full breakdown table */}
        <Card>
          <h2 className="text-sm font-extrabold text-textMuted uppercase tracking-widest mb-4">
            Full Breakdown
          </h2>
          <Table
            headers={["Province", "Passengers", "Drivers", "Owners", "Total Users", "Rides", "Gross Revenue", "Platform Fees", "Driver Net"]}
            empty={!topByUsers.length}>
            {topByUsers.map(p => (
              <Tr key={p.province}>
                <Td className="font-semibold">{p.province}</Td>
                <Td className="text-cyan">{p.passengers.toLocaleString()}</Td>
                <Td className="text-green">{p.drivers.toLocaleString()}</Td>
                <Td className="text-purple">{p.owners.toLocaleString()}</Td>
                <Td className="font-bold">{(p.passengers + p.drivers + p.owners).toLocaleString()}</Td>
                <Td>{p.rides.toLocaleString()}</Td>
                <Td className="font-bold text-yellow">{formatZAR(p.gross_revenue)}</Td>
                <Td className="text-textMuted">{formatZAR(p.platform_fees)}</Td>
                <Td className="text-textMuted">{formatZAR(p.driver_net)}</Td>
              </Tr>
            ))}
          </Table>
        </Card>

      </div>
    </AdminShell>
  );
}
