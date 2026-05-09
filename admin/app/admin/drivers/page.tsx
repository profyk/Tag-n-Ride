"use client";
import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import { Table, Tr, Td, Badge, Button, Spinner } from "@/components/ui";
import { useDrivers, useVerifyDriver } from "@/lib/hooks";
import { formatZAR } from "@/lib/utils";
import { ExternalLink } from "lucide-react";

export default function DriversPage() {
  const { data, isLoading } = useDrivers();
  const verify = useVerifyDriver();

  return (
    <AdminShell title="Driver Management">
      {isLoading ? <Spinner /> : (
        <Table headers={["Driver", "Plate", "Earnings", "Rating", "Verified", "Actions"]} empty={!data?.length}>
          {data?.map((d) => (
            <Tr key={d.user_id}>
              <Td>
                <div>
                  <p className="font-semibold">{d.full_name}</p>
                  <p className="text-textMuted text-xs font-mono">{d.phone_number}</p>
                </div>
              </Td>
              <Td>
                <span className="font-mono text-sm bg-yellowDim text-yellow px-2 py-0.5 rounded border border-yellow/20">
                  {d.vehicle_plate || "—"}
                </span>
              </Td>
              <Td className="font-bold text-green">{formatZAR(d.total_earnings)}</Td>
              <Td>
                {d.rating_count > 0
                  ? <span className="text-yellow font-bold">★ {d.rating_avg.toFixed(1)} <span className="text-textMuted font-normal text-xs">({d.rating_count})</span></span>
                  : <span className="text-textMuted">—</span>}
              </Td>
              <Td><Badge label={d.is_verified ? "Verified" : "Pending"} tone={d.is_verified ? "green" : "yellow"} /></Td>
              <Td>
                <div className="flex items-center gap-2">
                  {!d.is_verified && (
                    <Button variant="secondary" loading={verify.isPending} onClick={() => verify.mutate(d.user_id)}>
                      Verify
                    </Button>
                  )}
                  <Link href={`/admin/drivers/${d.user_id}`}>
                    <Button variant="ghost"><ExternalLink size={14} /> View</Button>
                  </Link>
                </div>
              </Td>
            </Tr>
          ))}
        </Table>
      )}
    </AdminShell>
  );
}
