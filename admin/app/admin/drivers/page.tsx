"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import { Table, Tr, Td, Badge, Button, Spinner } from "@/components/ui";
import { api, Driver } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import { ExternalLink, CheckCircle, Star } from "lucide-react";
import toast from "react-hot-toast";

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "verified">("all");

  const load = () => {
    setLoading(true);
    api.drivers().then((r) => setDrivers(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleVerify = async (userId: string, name: string) => {
    try {
      await api.verifyDriver(userId);
      toast.success(`${name} verified`);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const filtered = drivers.filter((d) => {
    if (filter === "pending") return !d.is_verified;
    if (filter === "verified") return d.is_verified;
    return true;
  });

  const kycTone = (s: string) =>
    s === "approved" ? "green"
    : s === "pending" ? "yellow"
    : s === "rejected" ? "red"
    : "muted";

  return (
    <AdminShell title="Driver Management">
      <div className="space-y-4">

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          <div
            className="bg-bg2 border border-border rounded-xl p-5 text-center cursor-pointer hover:border-cyan transition-colors"
            onClick={() => setFilter("all")}>
            <p className="text-2xl font-extrabold text-cyan">{drivers.length}</p>
            <p className="text-xs text-textMuted mt-1">Total Drivers</p>
          </div>
          <div
            className="bg-bg2 border border-border rounded-xl p-5 text-center cursor-pointer hover:border-green transition-colors"
            onClick={() => setFilter("verified")}>
            <p className="text-2xl font-extrabold text-green">
              {drivers.filter((d) => d.is_verified).length}
            </p>
            <p className="text-xs text-textMuted mt-1">Verified</p>
          </div>
          <div
            className="bg-bg2 border border-border rounded-xl p-5 text-center cursor-pointer hover:border-yellow transition-colors"
            onClick={() => setFilter("pending")}>
            <p className="text-2xl font-extrabold text-yellow">
              {drivers.filter((d) => !d.is_verified).length}
            </p>
            <p className="text-xs text-textMuted mt-1">Pending</p>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2">
          {(["all", "pending", "verified"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all capitalize
                ${filter === f
                  ? "bg-cyanDim text-cyan border-cyan/20"
                  : "bg-bg2 text-textMuted border-border hover:text-text"}`}>
              {f}
            </button>
          ))}
        </div>

        {loading ? <Spinner /> : (
          <Table
            headers={["Driver", "Plate", "Earnings", "Rating", "KYC", "Verified", "Actions"]}
            empty={!filtered.length}>
            {filtered.map((d) => (
              <Tr key={d.user_id}>
                <Td>
                  <div>
                    <p className="font-semibold">{d.full_name}</p>
                    <p className="text-textMuted text-xs font-mono">{d.phone_number}</p>
                  </div>
                </Td>
                <Td>
                  {d.vehicle_plate ? (
                    <span className="font-mono text-xs bg-yellow/10 text-yellow px-2 py-0.5 rounded border border-yellow/20">
                      {d.vehicle_plate}
                    </span>
                  ) : "—"}
                </Td>
                <Td className="font-bold text-green">{formatZAR(d.total_earnings)}</Td>
                <Td>
                  {d.rating_count > 0 ? (
                    <span className="flex items-center gap-1 text-yellow text-xs font-bold">
                      <Star size={11} fill="currentColor" />
                      {d.rating_avg.toFixed(1)}
                      <span className="text-textMuted font-normal">({d.rating_count})</span>
                    </span>
                  ) : (
                    <span className="text-textMuted text-xs">New</span>
                  )}
                </Td>
                <Td>
                  <Badge label={d.kyc_status || "none"} tone={kycTone(d.kyc_status) as any} />
                </Td>
                <Td>
                  <Badge
                    label={d.is_verified ? "Verified" : "Pending"}
                    tone={d.is_verified ? "green" : "yellow"}
                  />
                </Td>
                <Td>
                  <div className="flex items-center gap-2">
                    {!d.is_verified && (
                      <Button
                        variant="secondary"
                        onClick={() => handleVerify(d.user_id, d.full_name)}>
                        <CheckCircle size={13} /> Verify
                      </Button>
                    )}
                    <Link href={`/admin/drivers/${d.user_id}`}>
                      <Button variant="ghost">
                        <ExternalLink size={13} /> View
                      </Button>
                    </Link>
                  </div>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </div>
    </AdminShell>
  );
}
