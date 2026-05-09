"use client";
import { AdminShell } from "@/components/layout/AdminShell";
import { Table, Tr, Td, Badge, Spinner } from "@/components/ui";
import { usePayouts } from "@/lib/hooks";
import { formatDate, maskAccount } from "@/lib/utils";

export default function PayoutsPage() {
  const { data, isLoading } = usePayouts();
  return (
    <AdminShell title="Payout Accounts">
      {isLoading ? <Spinner /> : (
        <Table headers={["Driver", "Type", "Bank", "Account", "Account Name", "Saved"]} empty={!data?.length}>
          {data?.map((p) => (
            <Tr key={p.id}>
              <Td className="font-semibold">{p.driver_name || p.user_id.slice(0, 10)}</Td>
              <Td><Badge label={p.type} tone={p.type === "self" ? "cyan" : "purple"} /></Td>
              <Td className="text-textMuted">{p.bank_name}</Td>
              <Td className="font-mono text-xs text-textMuted">{maskAccount(p.account_number)}</Td>
              <Td className="text-textMuted">{p.account_name || "—"}</Td>
              <Td className="text-textMuted text-xs">{formatDate(p.created_at)}</Td>
            </Tr>
          ))}
        </Table>
      )}
    </AdminShell>
  );
}
