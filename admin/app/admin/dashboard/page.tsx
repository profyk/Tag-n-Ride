"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { StatCard, Table, Tr, Td, Badge, Spinner, Card, Button } from "@/components/ui";
import { api, DashboardStats } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import { AlertTriangle, Download, CheckCircle } from "lucide-react";
import toast from "react-hot-toast";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    api.dashboard().then((r) => setData(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleVerify = async (userId: string) => {
    try {
      await api.verifyDriver(userId);
      toast.success("Driver verified");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  if (loading || !data) return <AdminShell title="Dashboard"><Spinner /></AdminShell>;

  return (
    <AdminShell title="Dashboard">
      <div className="space-y-6">

        {/* Export buttons */}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => api.exportUsers()}>
            <Download size={13} /> Export Users
          </Button>
          <Button variant="secondary" onClick={() => api.exportTransactions()}>
            <Download size={13} /> Export Transactions
          </Button>
        </div>

        {/* Today stats */}
        <div>
          <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-3">
            Today
          </p>
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Revenue Today" value={formatZAR(data.today_revenue)} tone="green" />
            <StatCard label="Transactions" value={data.today_transactions} tone="cyan" />
            <StatCard label="New Signups" value={data.today_signups} tone="purple" />
          </div>
        </div>

        {/* Overall stats */}
        <div>
          <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-3">
            Overall
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Users" value={data.total_users.toLocaleString()} tone="cyan" />
            <StatCard label="Total Drivers" value={data.total_drivers.toLocaleString()} tone="green" />
            <StatCard label="Total Revenue" value={formatZAR(data.total_revenue)} tone="yellow" />
            <StatCard label="In Wallets" value={formatZAR(data.total_wallet_balance)} tone="purple" />
          </div>
        </div>

        {/* Secondary stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Withdrawn" value={formatZAR(data.total_withdrawn)} tone="red" />
          <StatCard label="Total Passengers" value={data.total_passengers.toLocaleString()} tone="cyan" />
          <StatCard label="Total Transactions" value={data.total_transactions.toLocaleString()} tone="green" />
          <StatCard label="Flagged Accounts" value={data.flagged_accounts} tone="red" />
        </div>

        {/* Alerts */}
        {(data.pending_withdrawals > 0 || data.pending_drivers > 0 ||
          data.pending_kyc > 0 || data.flagged_accounts > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {data.pending_withdrawals > 0 && (
              <div className="flex items-center gap-3 p-4 bg-yellow/10 border border-yellow/20 rounded-xl">
                <AlertTriangle size={18} className="text-yellow flex-shrink-0" />
                <div>
                  <p className="text-yellow font-bold text-sm">
                    {data.pending_withdrawals} Pending Withdrawals
                  </p>
                  <p className="text-textMuted text-xs">Require approval</p>
                </div>
              </div>
            )}
            {data.pending_kyc > 0 && (
              <div className="flex items-center gap-3 p-4 bg-cyan/10 border border-cyan/20 rounded-xl">
                <AlertTriangle size={18} className="text-cyan flex-shrink-0" />
                <div>
                  <p className="text-cyan font-bold text-sm">
                    {data.pending_kyc} KYC Pending
                  </p>
                  <p className="text-textMuted text-xs">Documents to review</p>
                </div>
              </div>
            )}
            {data.pending_drivers > 0 && (
              <div className="flex items-center gap-3 p-4 bg-purple/10 border border-purple/20 rounded-xl">
                <AlertTriangle size={18} className="text-purple flex-shrink-0" />
                <div>
                  <p className="text-purple font-bold text-sm">
                    {data.pending_drivers} Unverified Drivers
                  </p>
                  <p className="text-textMuted text-xs">Need verification</p>
                </div>
              </div>
            )}
            {data.flagged_accounts > 0 && (
              <div className="flex items-center gap-3 p-4 bg-red/10 border border-red/20 rounded-xl">
                <AlertTriangle size={18} className="text-red flex-shrink-0" />
                <div>
                  <p className="text-red font-bold text-sm">
                    {data.flagged_accounts} Flagged Accounts
                  </p>
                  <p className="text-textMuted text-xs">Require review</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Pending driver verification queue */}
        {data.pending_driver_list?.length > 0 && (
          <Card>
            <h2 className="text-text font-bold mb-4">Pending Driver Verification</h2>
            <Table
              headers={["Driver", "Phone", "Plate", "Registered", "Action"]}
              empty={false}>
              {data.pending_driver_list.map((d) => (
                <Tr key={d.user_id}>
                  <Td className="font-semibold">{d.full_name}</Td>
                  <Td className="font-mono text-xs text-textMuted">{d.phone_number}</Td>
                  <Td>
                    {d.vehicle_plate ? (
                      <span className="font-mono text-xs bg-yellow/10 text-yellow px-2 py-0.5 rounded border border-yellow/20">
                        {d.vehicle_plate}
                      </span>
                    ) : "—"}
                  </Td>
                  <Td className="text-textMuted text-xs">{formatDate(d.created_at)}</Td>
                  <Td>
                    <Button
                      variant="secondary"
                      onClick={() => handleVerify(d.user_id)}>
                      <CheckCircle size={13} /> Verify
                    </Button>
                  </Td>
                </Tr>
              ))}
            </Table>
          </Card>
        )}

        {/* Suspicious transactions */}
        {data.suspicious_transactions?.length > 0 && (
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={16} className="text-red" />
              <h2 className="text-text font-bold">
                Flagged Transactions (over R5,000)
              </h2>
            </div>
            <Table
              headers={["Reference", "Amount", "Sender", "Receiver", "Date"]}
              empty={false}>
              {data.suspicious_transactions.map((t) => (
                <Tr key={t.id}>
                  <Td>
                    <span className="font-mono text-xs text-textMuted">{t.reference}</span>
                  </Td>
                  <Td className="font-bold text-red">{formatZAR(t.amount)}</Td>
                  <Td className="text-textMuted text-xs">{t.sender_name || "—"}</Td>
                  <Td className="text-textMuted text-xs">{t.receiver_name || "—"}</Td>
                  <Td className="text-textMuted text-xs">{formatDate(t.created_at)}</Td>
                </Tr>
              ))}
            </Table>
          </Card>
        )}

        {/* Recent transactions */}
        <Card>
          <h2 className="text-text font-bold mb-4">Recent Transactions</h2>
          <Table
            headers={["Reference", "Type", "Amount", "Sender", "Receiver", "Status", "Date"]}
            empty={!data.recent_transactions?.length}>
            {data.recent_transactions?.map((t) => (
              <Tr key={t.id}>
                <Td>
                  <span className="font-mono text-xs text-textMuted">{t.reference}</span>
                </Td>
                <Td>
                  <Badge
                    label={t.type}
                    tone={
                      t.type === "topup" ? "cyan"
                      : t.type === "payment" ? "green"
                      : "purple"
                    }
                  />
                </Td>
                <Td className="font-bold">{formatZAR(t.amount)}</Td>
                <Td className="text-textMuted text-xs">{t.sender_name || "—"}</Td>
                <Td className="text-textMuted text-xs">{t.receiver_name || "—"}</Td>
                <Td>
                  <Badge
                    label={t.status}
                    tone={
                      t.status === "completed" ? "green"
                      : t.status === "pending" ? "yellow"
                      : "red"
                    }
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
