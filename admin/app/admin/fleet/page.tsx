"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Spinner, StatCard, Input } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import { Download, Search, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

export default function FleetPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedOwner, setExpandedOwner] = useState<string | null>(null);
  const [ownerDrivers, setOwnerDrivers] = useState<Record<string, any[]>>({});
  const [loadingDrivers, setLoadingDrivers] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BASE}/api/admin/fleet/reports`, { headers: authHeaders() })
      .then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, []);

  const loadOwnerDrivers = async (ownerId: string) => {
    if (ownerDrivers[ownerId]) return;
    setLoadingDrivers(ownerId);
    try {
      const res = await fetch(`${BASE}/api/admin/fleet/${ownerId}/drivers`, { headers: authHeaders() });
      const d = await res.json();
      setOwnerDrivers(prev => ({ ...prev, [ownerId]: Array.isArray(d) ? d : (d.drivers || []) }));
    } catch {}
    finally { setLoadingDrivers(null); }
  };

  const toggleOwner = (ownerId: string) => {
    if (expandedOwner === ownerId) {
      setExpandedOwner(null);
    } else {
      setExpandedOwner(ownerId);
      loadOwnerDrivers(ownerId);
    }
  };

  if (loading) return <AdminShell title="Fleet Owner Reports"><Spinner /></AdminShell>;

  const owners = data?.owners || [];
  const fleetEarnings = data?.fleet_earnings || [];
  const totalEarnings = fleetEarnings.reduce((s: number, f: any) => s + f.fleet_total_earnings, 0);
  const totalDrivers = owners.reduce((s: number, o: any) => s + (o.driver_count || 0), 0);
  const avgDriversPerOwner = owners.length > 0 ? (totalDrivers / owners.length).toFixed(1) : "0";

  const filteredOwners = owners.filter((o: any) =>
    !search ||
    o.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    o.phone_number?.includes(search) ||
    o.business_name?.toLowerCase().includes(search.toLowerCase())
  );

  const exportCsv = () => {
    const rows = owners.map((o: any) => ({
      Name: o.full_name,
      Phone: o.phone_number,
      Business: o.business_name || "",
      Drivers: o.driver_count,
      Joined: formatDate(o.created_at),
    }));
    const header = Object.keys(rows[0] || {});
    const csv = [header, ...rows.map((r: any) => header.map(k => `"${r[k] ?? ""}"`))].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "fleet-owners.csv"; a.click();
    URL.revokeObjectURL(url); toast.success("Exported");
  };

  return (
    <AdminShell title="Fleet Owner Reports">
      <div className="space-y-6">

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Fleet Owners" value={owners.length} tone="cyan" />
          <StatCard label="Total Fleet Drivers" value={totalDrivers} tone="green" />
          <StatCard label="Total Fleet Earnings" value={formatZAR(totalEarnings)} tone="yellow" />
          <Card className="p-4 text-center">
            <p className="text-2xl font-extrabold text-purple">{avgDriversPerOwner}</p>
            <p className="text-xs text-textMuted mt-1">Avg Drivers / Owner</p>
          </Card>
        </div>

        {/* Leaderboard */}
        <Card>
          <h2 className="text-text font-bold mb-4">Fleet Earnings Leaderboard</h2>
          <div className="space-y-3">
            {fleetEarnings.length > 0 ? fleetEarnings.map((f: any, i: number) => {
              const pct = totalEarnings > 0 ? Math.round((f.fleet_total_earnings / totalEarnings) * 100) : 0;
              return (
                <div key={f.owner_id} className="p-4 bg-bg border border-border rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm
                        ${i === 0 ? "bg-yellow/20 text-yellow"
                          : i === 1 ? "bg-gray-400/20 text-gray-400"
                          : i === 2 ? "bg-orange-400/20 text-orange-400"
                          : "bg-bg3 text-textMuted"}`}>
                        #{i + 1}
                      </div>
                      <div>
                        <p className="text-text font-bold">{f.owner_name}</p>
                        <p className="text-textMuted text-xs">{f.driver_count} driver{f.driver_count !== 1 ? "s" : ""}</p>
                      </div>
                    </div>
                    <p className="text-green font-extrabold text-lg">{formatZAR(f.fleet_total_earnings)}</p>
                  </div>
                  <div className="h-1.5 bg-bg3 rounded-full overflow-hidden">
                    <div className="h-full bg-green rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-textDim text-[10px] mt-1">{pct}% of total fleet earnings</p>
                </div>
              );
            }) : (
              <p className="text-textMuted text-center py-8">No fleet earnings data yet</p>
            )}
          </div>
        </Card>

        {/* Fleet owners table with expandable driver roster */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-text font-bold">All Fleet Owners</h2>
            <div className="flex gap-2 items-center">
              <div className="w-52">
                <Input
                  placeholder="Search owner, phone, business..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button variant="secondary" onClick={exportCsv}>
                <Download size={13} /> Export
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            {filteredOwners.length === 0 ? (
              <p className="text-textMuted text-center py-8 text-sm">No fleet owners found</p>
            ) : filteredOwners.map((o: any) => {
              const isExpanded = expandedOwner === o.id;
              const drivers = ownerDrivers[o.id] || [];
              return (
                <div key={o.id} className="border border-border rounded-xl overflow-hidden">
                  <div
                    className="flex items-center justify-between px-4 py-3 bg-bg2 cursor-pointer hover:bg-bg3 transition-colors"
                    onClick={() => toggleOwner(o.id)}>
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-text font-semibold text-sm">{o.full_name}</p>
                          {o.business_name && (
                            <span className="text-[10px] text-textMuted bg-bg3 border border-border px-2 py-0.5 rounded-full">
                              {o.business_name}
                            </span>
                          )}
                        </div>
                        <p className="text-textMuted text-xs font-mono">{o.phone_number}</p>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <div className="text-center">
                          <p className="text-cyan font-bold">{o.driver_count}</p>
                          <p className="text-textDim text-[10px]">Drivers</p>
                        </div>
                        <div className="text-center">
                          <p className="text-textMuted text-xs">{formatDate(o.created_at)}</p>
                          <p className="text-textDim text-[10px]">Joined</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Link href={`/admin/users?search=${encodeURIComponent(o.phone_number)}`} onClick={e => e.stopPropagation()}>
                        <Button variant="ghost"><ExternalLink size={12} /></Button>
                      </Link>
                      {isExpanded ? <ChevronUp size={14} className="text-textMuted" /> : <ChevronDown size={14} className="text-textMuted" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border bg-bg p-3">
                      {loadingDrivers === o.id ? (
                        <div className="flex justify-center py-4"><Spinner /></div>
                      ) : drivers.length === 0 ? (
                        <p className="text-textMuted text-xs text-center py-4">No drivers in this fleet yet</p>
                      ) : (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border">
                              {["Driver", "Phone", "Plate", "Earnings", "Rating", "KYC"].map(h => (
                                <th key={h} className="px-3 py-2 text-left text-[10px] font-bold text-textMuted uppercase tracking-wider">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {drivers.map((d: any) => (
                              <tr key={d.user_id} className="hover:bg-bg2 transition-colors">
                                <td className="px-3 py-2 font-semibold">{d.full_name}</td>
                                <td className="px-3 py-2 font-mono text-textMuted">{d.phone_number}</td>
                                <td className="px-3 py-2">
                                  {d.vehicle_plate ? (
                                    <span className="font-mono bg-yellow/10 text-yellow px-1.5 py-0.5 rounded border border-yellow/20">
                                      {d.vehicle_plate}
                                    </span>
                                  ) : "—"}
                                </td>
                                <td className="px-3 py-2 text-green font-bold">{formatZAR(d.total_earnings || 0)}</td>
                                <td className="px-3 py-2 text-yellow">
                                  {d.rating_count > 0 ? `★ ${d.rating_avg?.toFixed(1)}` : "—"}
                                </td>
                                <td className="px-3 py-2">
                                  <Badge
                                    label={d.kyc_status || "none"}
                                    tone={d.kyc_status === "approved" ? "green" : d.kyc_status === "pending" ? "yellow" : "red"}
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}
