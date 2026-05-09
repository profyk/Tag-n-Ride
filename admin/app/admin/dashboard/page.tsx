"use client";
import { AdminShell } from "@/components/layout/AdminShell";
import { StatCard, Table, Tr, Td, Badge, Spinner } from "@/components/ui";
import { useDashboard } from "@/lib/hooks";
import { formatZAR, formatDate } from "@/lib/utils";

function statusTone(s: string): "green" | "yellow" | "red" {
  if (s === "completed") return "green";
  if (s === "pending") return "yellow";
  return "red";
}

function typeTone(t: string): "cyan" | "green" | "purple" {
  if (t === "topup") return "cyan";
  if (t === "payment") return "green";
  return "purple";
}

export default function DashboardPage() {
  const { data, isLoading } = useDashboard();

  return (
    <AdminShell title="Dashboard">
      {isLoading || !data ? (
        <Spinner />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Users" value={data.total_users.toLocaleString()} tone="cyan" />
            <StatCard label="Total Drivers" value={data.total_drivers.toLocaleString()} tone="green" />
            <StatCard label="Transactions" value={data.total_transactions.toLocaleString()} tone="purple" />
            <StatCard label="Revenue" value={formatZAR(data.total_revenue)} tone="yellow" />
          </div>

          <div>
            <h2 className="text-text font-bold mb-3">Recent Transactions</h2>
            <Table
              headers={["Reference", "Type", "Amount", "Status", "Date"]}
              empty={!data.recent_transactions?.length}>
              {data.recent_transactions?.map((t) => (
                <Tr key={t.id}>
                  <Td><span className="font-mono text-xs text-textMuted">{t.reference}</span></Td>
                  <Td><Badge label={t.type} tone={typeTone(t.type)} /></Td>
                  <Td className="font-bold">{formatZAR(t.amount)}</Td>
                  <Td><Badge label={t.status} tone={statusTone(t.status)} /></Td>
                  <Td className="text-textMuted text-xs">{formatDate(t.created_at)}</Td>
                </Tr>
              ))}
            </Table>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
