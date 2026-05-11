"use client";
import { useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Table, Tr, Td, Badge, Button, Spinner, Card, Input } from "@/components/ui";
import { useAdmins, useCreateAdmin, useDeleteAdmin } from "@/lib/hooks";
import { formatDate } from "@/lib/utils";
import { getToken } from "@/lib/api";
import { PlusCircle, Trash2 } from "lucide-react";

function isSuperAdmin() {
  try {
    const token = getToken();
    if (!token) return false;
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.role === "superadmin";
  } catch { return false; }
}

export default function AdminsPage() {
  const { data, isLoading } = useAdmins();
  const createAdmin = useCreateAdmin();
  const deleteAdmin = useDeleteAdmin();
  const superAdmin = isSuperAdmin();

  const [showForm, setShowForm] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleCreate = async () => {
    if (!fullName || !email || !password) return;
    await createAdmin.mutateAsync({ full_name: fullName, email, password });
    setFullName(""); setEmail(""); setPassword("");
    setShowForm(false);
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Delete admin ${name}? This cannot be undone.`)) {
      deleteAdmin.mutate(id);
    }
  };

  if (!superAdmin) {
    return (
      <AdminShell title="Admin Accounts">
        <div className="text-textMuted text-center py-16">
          Access restricted to superadmin only.
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Admin Accounts">
      <div className="space-y-6">
        {showForm ? (
          <Card>
            <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest mb-4">New Admin</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-xs font-bold text-textMuted uppercase tracking-widest mb-1.5">Full Name</label>
                <Input placeholder="John Doe" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-textMuted uppercase tracking-widest mb-1.5">Email</label>
                <Input type="email" placeholder="john@tagnride.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-textMuted uppercase tracking-widest mb-1.5">Password</label>
                <Input type="password" placeholder="Min 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-3">
              <Button onClick={handleCreate} loading={createAdmin.isPending}>Create Admin</Button>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </Card>
        ) : (
          <div className="flex justify-end">
            <Button onClick={() => setShowForm(true)}>
              <PlusCircle size={16} /> New Admin
            </Button>
          </div>
        )}

        {isLoading ? <Spinner /> : (
          <Table headers={["Name", "Email", "Role", "Status", "Created", "Actions"]} empty={!data?.length}>
            {data?.map((a) => (
              <Tr key={a.id}>
                <Td className="font-semibold">{a.full_name}</Td>
                <Td className="text-textMuted text-sm">{a.email}</Td>
                <Td><Badge label={a.role} tone={a.role === "superadmin" ? "purple" : "cyan"} /></Td>
                <Td><Badge label={a.is_active ? "Active" : "Inactive"} tone={a.is_active ? "green" : "red"} /></Td>
                <Td className="text-textMuted text-xs">{formatDate(a.created_at)}</Td>
                <Td>
                  {a.role !== "superadmin" && (
                    <Button variant="danger" loading={deleteAdmin.isPending}
                      onClick={() => handleDelete(a.id, a.full_name)}>
                      <Trash2 size={14} /> Delete
                    </Button>
                  )}
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </div>
    </AdminShell>
  );
}
