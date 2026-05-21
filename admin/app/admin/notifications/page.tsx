"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Spinner, Modal, Input, Select } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { Bell, Send } from "lucide-react";
import toast from "react-hot-toast";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendModal, setSendModal] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("info");
  const [target, setTarget] = useState("all");
  const [targetRole, setTargetRole] = useState("");
  const [sending, setSending] = useState(false);

  const load = () => {
    setLoading(true);
    fetch(`${BASE}/api/admin/notifications`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setNotifications(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) { toast.error("Title and message required"); return; }
    setSending(true);
    try {
      await fetch(`${BASE}/api/admin/notifications/send`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({
          title, message, type, target,
          target_role: targetRole || undefined,
        }),
      });
      toast.success("Notification sent");
      setSendModal(false);
      setTitle(""); setMessage(""); setType("info"); setTarget("all"); setTargetRole("");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSending(false); }
  };

  const typeTone = (t: string) =>
    t === "info" ? "cyan" : t === "warning" ? "yellow" : t === "success" ? "green" : "red";

  return (
    <AdminShell title="Notifications">
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <p className="text-textMuted text-sm">{notifications.length} notifications sent</p>
          <Button onClick={() => setSendModal(true)}>
            <Bell size={13} /> Send Notification
          </Button>
        </div>

        {loading ? <Spinner /> : (
          <Table
            headers={["Title", "Message", "Type", "Target", "Sent By", "Date"]}
            empty={!notifications.length}>
            {notifications.map((n: any) => (
              <Tr key={n.id}>
                <Td className="font-semibold">{n.title}</Td>
                <Td className="text-textMuted text-xs max-w-xs truncate">{n.message}</Td>
                <Td>
                  <Badge label={n.type} tone={typeTone(n.type) as any} />
                </Td>
                <Td>
                  <Badge
                    label={n.target === "role" ? n.target_role || "role" : n.target}
                    tone={n.target === "all" ? "cyan" : "purple"}
                  />
                </Td>
                <Td className="text-textMuted text-xs">{n.sent_by_name || "System"}</Td>
                <Td className="text-textMuted text-xs">{formatDate(n.sent_at)}</Td>
              </Tr>
            ))}
          </Table>
        )}
      </div>

      <Modal open={sendModal} onClose={() => setSendModal(false)} title="Send Notification">
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
              Title
            </label>
            <Input placeholder="Notification title..."
              value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
              Message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Notification message..."
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-text text-sm placeholder:text-textDim focus:outline-none focus:border-cyan transition-colors resize-none h-24"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
                Type
              </label>
              <Select value={type} onChange={(e) => setType(e.target.value)} className="w-full">
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="success">Success</option>
                <option value="error">Alert</option>
              </Select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
                Target
              </label>
              <Select value={target} onChange={(e) => setTarget(e.target.value)} className="w-full">
                <option value="all">All Users</option>
                <option value="role">By Role</option>
              </Select>
            </div>
          </div>
          {target === "role" && (
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
                Role
              </label>
              <Select value={targetRole} onChange={(e) => setTargetRole(e.target.value)} className="w-full">
                <option value="">Select role...</option>
                <option value="passenger">Passenger</option>
                <option value="driver">Driver</option>
                <option value="owner">Fleet Owner</option>
              </Select>
            </div>
          )}
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" onClick={() => setSendModal(false)}>Cancel</Button>
            <Button onClick={handleSend} loading={sending}>
              <Send size={13} /> Send
            </Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
