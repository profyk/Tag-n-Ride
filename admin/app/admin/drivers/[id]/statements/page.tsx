"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import { Table, Tr, Td, Badge, Button, Spinner } from "@/components/ui";
import { api, getToken } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import { ArrowLeft, FileText } from "lucide-react";

const BASE_URL = "https://tag-n-ride-production.up.railway.app";

async function fetchDriverPayslips(driverId: string): Promise<any[]> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}/api/admin/drivers/${driverId}/payslips`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to load payslips");
  return res.json();
}

async function fetchDriver(driverId: string): Promise<any> {
  const res = await api.driver(driverId);
  return res.data;
}

const STATUS_TONE: Record<string, string> = {
  generated: "green",
  deleted: "red",
};

export default function DriverStatementsPage() {
  const { id } = useParams<{ id: string }>();
  const [payslips, setPayslips] = useState<any[]>([]);
  const [driver, setDriver] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetchDriverPayslips(id),
      fetchDriver(id).catch(() => null),
    ])
      .then(([slips, drv]) => {
        setPayslips(slips);
        setDriver(drv);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const driverName = driver?.full_name ?? id;

  return (
    <AdminShell title="Driver Statements">
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href={`/admin/drivers/${id}`}>
            <Button variant="ghost">
              <ArrowLeft size={13} /> Back to Driver
            </Button>
          </Link>
          <div>
            <h1 className="text-text font-extrabold text-xl">Earnings Statements</h1>
            <p className="text-textMuted text-xs mt-0.5">{driverName}</p>
          </div>
        </div>

        {loading ? (
          <Spinner />
        ) : error ? (
          <div className="bg-red/10 border border-red/30 rounded-xl p-4 text-red text-sm">{error}</div>
        ) : payslips.length === 0 ? (
          <div className="bg-bg2 border border-border rounded-xl p-10 text-center">
            <FileText size={36} className="text-textDim mx-auto mb-3" />
            <p className="text-text font-semibold">No statements found</p>
            <p className="text-textMuted text-sm mt-1">This driver has not generated any earnings statements yet.</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-textMuted">{payslips.length} statement{payslips.length !== 1 ? "s" : ""} (including deleted — audit view)</p>
            <Table
              headers={["Period", "Type", "Net Earnings", "Fee Charged", "Reference", "Generated", "Status"]}
              empty={false}
            >
              {payslips.map((p) => (
                <>
                  <Tr key={p.id} className="cursor-pointer" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                    <Td>
                      <span className="font-semibold text-text">{p.period_label}</span>
                    </Td>
                    <Td>
                      <span className="text-xs text-textMuted capitalize">{p.period_type}</span>
                    </Td>
                    <Td>
                      <span className="font-bold text-green">{formatZAR(p.driver_net_earnings)}</span>
                    </Td>
                    <Td>
                      <span className="text-textMuted">{formatZAR(p.fee_charged)}</span>
                    </Td>
                    <Td>
                      <span className="font-mono text-xs text-text">{p.reference_number}</span>
                    </Td>
                    <Td className="text-textMuted text-xs">{formatDate(p.created_at)}</Td>
                    <Td>
                      <Badge label={p.status} tone={STATUS_TONE[p.status] ?? "muted"} />
                    </Td>
                  </Tr>
                  {expanded === p.id && (
                    <Tr key={`${p.id}-detail`}>
                      <Td colSpan={7}>
                        <div className="bg-bg border border-border rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-textMuted text-xs mb-1">Gross Earnings</p>
                            <p className="font-bold text-text">{formatZAR(p.gross_earnings)}</p>
                          </div>
                          <div>
                            <p className="text-textMuted text-xs mb-1">Platform Fee (3%)</p>
                            <p className="font-bold text-red">{formatZAR(p.platform_fee)}</p>
                          </div>
                          <div>
                            <p className="text-textMuted text-xs mb-1">Total Net</p>
                            <p className="font-bold text-text">{formatZAR(p.total_net)}</p>
                          </div>
                          <div>
                            <p className="text-textMuted text-xs mb-1">Owner Payouts</p>
                            <p className="font-bold text-text">{formatZAR(p.owner_payouts)}</p>
                          </div>
                          <div>
                            <p className="text-textMuted text-xs mb-1">Driver Cashups (Self)</p>
                            <p className="font-bold text-text">{formatZAR(p.driver_cashups_self)}</p>
                          </div>
                          <div>
                            <p className="text-textMuted text-xs mb-1">Wallet at Generation</p>
                            <p className="font-bold text-text">{formatZAR(p.wallet_balance_at_generation)}</p>
                          </div>
                          <div>
                            <p className="text-textMuted text-xs mb-1">Total Trips</p>
                            <p className="font-bold text-text">{p.total_trips}</p>
                          </div>
                          <div>
                            <p className="text-textMuted text-xs mb-1">Rating</p>
                            <p className="font-bold text-text">{(p.rating_avg ?? 0).toFixed(1)} ★ ({p.rating_count})</p>
                          </div>
                          <div className="col-span-2 md:col-span-4">
                            <p className="text-textMuted text-xs mb-1">Verification URL</p>
                            <a
                              href={`https://tagnride.com/verify?ref=${p.reference_number}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-cyan text-xs font-mono break-all hover:underline"
                            >
                              tagnride.com/verify?ref={p.reference_number}
                            </a>
                          </div>
                        </div>
                      </Td>
                    </Tr>
                  )}
                </>
              ))}
            </Table>
            <p className="text-xs text-textMuted italic">Admin view is read-only for audit compliance. Statements cannot be deleted from the admin panel.</p>
          </>
        )}
      </div>
    </AdminShell>
  );
}
