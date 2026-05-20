"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Badge, Button, Spinner, Table, Tr, Td } from "@/components/ui";
import { api, Driver, Transaction } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import { ArrowLeft, CheckCircle, Star } from "lucide-react";
import toast from "react-hot-toast";

export default function DriverDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [driver, setDriver] = useState<Driver | null>(null);
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.drivers().then((r) => r.data.find((d) => d.user_id === id)),
      api.transactions({ search: id }),
    ]).then(([d, t]) => {
      setDriver(d || null);
      setTxns(t.data.filter((tx) =>
        tx.sender_id === id || tx.receiver_id === id
      ));
    }).finally(() => setLoading(false));
  }, [id]);

  const handleVerify = async () => {
    if (!driver) return;
    try {
      await api.verifyDriver(driver.user_id);
      toast.success("Driver verified");
      setDriver({ ...driver, is_verified: true });
    } catch (e: any) { toast.error(e.message); }
  };

  if (loading) return <AdminShell title="Driver Detail"><Spinner /></AdminShell>;
  if (!driver) return (
    <AdminShell title="Driver Detail">
      <p className="text-textMuted">Driver not found.</p>
    </AdminShell>
  );

  return (
    <AdminShell title="Driver Detail">
      <div className="space-y-6 max-w-4xl">

        {/* Back */}
        <button onClick={() => router.back()}
          className="flex items-center gap-2 text-textMuted hover:text-text text-sm transition-colors">
          <ArrowLeft size={16} /> Back to Drivers
        </button>

        {/* Driver card */}
        <Card>
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-text font-extrabold text-xl">{driver.full_name}</h2>
              <p className="text-textMuted font-mono text-sm mt-1">{driver.phone_number}</p>
              {driver.vehicle_plate && (
                <span className="inline-block mt-2 font-mono text-sm bg-yellow/10 text-yellow px-3 py-1 rounded border border-yellow/20">
                  {driver.vehicle_plate}
                </span>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge
                label={driver.is_verified ? "Verified" : "Pending"}
                tone={driver.is_verified ? "green" : "yellow"}
              />
              <Badge
                label={driver.kyc_status || "No KYC"}
                tone={
                  driver.kyc_status === "approved" ? "green"
                  : driver.kyc_status === "pending" ? "yellow"
                  : driver.kyc_status === "rejected" ? "red"
                  : "muted"
                }
              />
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-border">
            <div>
              <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">
                Total Earnings
              </p>
              <p className="text-xl font-extrabold text-green">{formatZAR(driver.total_earnings)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">
                Rating
              </p>
              {driver.rating_count > 0 ? (
                <p className="text-xl font-extrabold text-yellow flex items-center gap-1">
                  <Star size={16} fill="currentColor" />
                  {driver.rating_avg.toFixed(1)}
                  <span className="text-textMuted text-xs font-normal">({driver.rating_count})</span>
                </p>
              ) : (
                <p className="text-textMuted text-sm">No ratings yet</p>
              )}
            </div>
            <div>
              <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">
                TNR Code
              </p>
              <p className="font-mono text-sm text-cyan">{driver.qr_code}</p>
            </div>
          </div>

          {/* Actions */}
          {!driver.is_verified && (
            <div className="mt-4 pt-4 border-t border-border">
              <Button onClick={handleVerify}>
                <CheckCircle size={13} /> Verify Driver
              </Button>
            </div>
          )}
        </Card>

        {/* Transaction history */}
        <Card>
          <h3 className="text-text font-bold mb-4">Transaction History</h3>
          <Table
            headers={["Reference", "Type", "Amount", "Net", "From", "To", "Status", "Date"]}
            empty={!txns.length}>
            {txns.map((t) => (
              <Tr key={t.id}>
                <Td><span className="font-mono text-[11px] text-textMuted">{t.reference}</span></Td>
                <Td>
                  <Badge
                    label={t.type}
                    tone={t.type === "topup" ? "cyan" : t.type === "payment" ? "green" : "purple"}
                  />
                </Td>
                <Td className="font-bold">{formatZAR(t.amount)}</Td>
                <Td className="text-green text-xs font-semibold">
                  {t.driver_net ? formatZAR(t.driver_net) : "—"}
                </Td>
                <Td className="text-textMuted text-xs">{t.sender_name || "—"}</Td>
                <Td className="text-textMuted text-xs">{t.receiver_name || "—"}</Td>
                <Td>
                  <Badge
                    label={t.status}
                    tone={t.status === "completed" ? "green" : t.status === "pending" ? "yellow" : "red"}
                  />
                </Td>
                <Td className="text-textMuted text-xs">{formatDate(t.created_at)}</Td>
              </Tr>
            ))}
          </Table>
        </Card>
      </div>
    </AdminShell>
  );
                }
