"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Spinner, StatCard } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

export default function FleetPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BASE}/api/admin/fleet/reports`, { headers: authHeaders() })
      .then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <AdminShell title="Fleet Owner Reports"><Spinner /></AdminShell>;

  const totalEarnings = data?.fleet_earnings?.reduce(
    (s: number, f: any) => s + f.fleet_total_earnings, 0
  ) || 0;
  const totalDrivers = data?.owners?.reduce(
    (s: number, o: any) => s + (o.driver_count || 0), 0
  ) || 0;

  return (
    <AdminShell title="Fleet Owner Reports">
      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Total Fleet Owners" value={data?.owners?.length || 0} tone="cyan" />
          <StatCard label="Total Fleet Drivers" value={totalDrivers} tone="green" />
          <StatCard label="Total Fleet Earnings" value={formatZAR(totalEarnings)} tone="yellow" />
        </div>

        <Card>
          <h2 className="text-text font-bold mb-4">Fleet Earnings Leaderboard</h2>
          <div className="space-y-3">
            {data?.fleet_earnings?.length > 0 ? data.fleet_earnings.map((f: any, i: number) => (
              <div key={f.owner_id}
                className="flex items-center justify-between p-4 bg-bg border border-border rounded-xl">
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
                    <p className="text-textMuted text-xs">{f.driver_count} drivers</p>
                  </div>
                </div>
                <p className="text-green font-extrabold text-lg">
                  {formatZAR(f.fleet_total_earnings)}
                </p>
              </div>
            )) : (
              <p className="text-textMuted text-center py-8">No fleet data yet</p>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="text-text font-bold mb-4">All Fleet Owners</h2>
          <Table
            headers={["Owner", "Phone", "Business", "Drivers", "Joined"]}
            empty={!data?.owners?.length}>
            {data?.owners?.map((o: any) => (
              <Tr key={o.id}>
                <Td className="font-semibold">{o.full_name}</Td>
                <Td className="font-mono text-xs text-textMuted">{o.phone_number}</Td>
                <Td className="text-textMuted text-sm">{o.business_name || "—"}</Td>
                <Td className="text-cyan font-bold">{o.driver_count}</Td>
                <Td className="text-textMuted text-xs">{formatDate(o.created_at)}</Td>
              </Tr>
            ))}
          </Table>
        </Card>
      </div>
    </AdminShell>
  );
}
