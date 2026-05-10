"use client";
import { useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Table, Tr, Td, Badge, Button, Spinner, Input } from "@/components/ui";
import { useUsers, useBlockUser, useResetPin } from "@/lib/hooks";
import { formatDate } from "@/lib/utils";
import { Search } from "lucide-react";
import toast from "react-hot-toast";

export default function UsersPage() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const { data, isLoading } = useUsers(query || undefined);
  const blockUser = useBlockUser();
  const resetPin = useResetPin();

  async function handleResetPin(id: string, name: string) {
    try {
      const result = await resetPin.mutateAsync(id);
      alert(`PIN reset for ${name}\n\nTemporary PIN: ${result.data.temporary_pin}\n\nGive this to the client and ask them to change it.`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to reset PIN");
    }
  }

  return (
    <AdminShell title="User Management">
      <div className="space-y-4">
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
            <Input placeholder="Search by phone..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setQuery(search)}
              className="pl-9" />
          </div>
          <Button variant="secondary" onClick={() => setQuery(search)}>Search</Button>
          {query && <Button variant="ghost" onClick={() => { setQuery(""); setSearch(""); }}>Clear</Button>}
        </div>
        {isLoading ? <Spinner /> : (
          <Table headers={["Name", "Phone", "Role", "Status", "Joined", "Actions"]} empty={!data?.length}>
            {data?.map((u) => (
              <Tr key={u.id}>
                <Td className="font-semibold">{u.full_name}</Td>
                <Td className="font-mono text-xs text-textMuted">{u.phone_number}</Td>
                <Td><Badge label={u.role} tone={u.role === "admin" ? "purple" : u.role === "driver" ? "cyan" : "muted"} /></Td>
                <Td><Badge label={u.is_active ? "Active" : "Blocked"} tone={u.is_active ? "green" : "red"} /></Td>
                <Td className="text-textMuted text-xs">{formatDate(u.created_at)}</Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <Button variant={u.is_active ? "danger" : "secondary"} loading={blockUser.isPending}
                      onClick={() => blockUser.mutate({ id: u.id, block: u.is_active })}>
                      {u.is_active ? "Block" : "Unblock"}
                    </Button>
                    <Button variant="ghost" loading={resetPin.isPending}
                      onClick={() => handleResetPin(u.id, u.full_name)}>
                      Reset PIN
                    </Button>
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
