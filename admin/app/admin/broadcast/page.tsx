"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Spinner, Modal, Input, StatCard } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { Megaphone, Send, Users, Car } from "lucide-react";
import toast from "react-hot-toast";
import { api, Broadcast } from "@/lib/api";

const AUD_TONE: Record<string, "cyan" | "purple" | "muted"> = { all: "cyan", role: "purple" };

export default function BroadcastPage() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [composeModal, setComposeModal] = useState(false);
  const [form, setForm] = useState({ title: "", message: "", target: "all", target_role: "" });
  const [sending, setSending] = useState(false);

  const load = () => {
    setLoading(true);
    api.broadcasts().then((r) => setBroadcasts(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const send = async () => {
    if (!form.title.trim() || !form.message.trim()) { toast.error("Title and message are required"); return; }
    setSending(true);
    try {
      await api.sendBroadcast({
        title: form.title, message: form.message,
        target: form.target,
        target_role: form.target === "role" ? form.target_role : undefined,
      });
      toast.success("Broadcast sent successfully");
      setComposeModal(false);
      setForm({ title: "", message: "", target: "all", target_role: "" });
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSending(false); }
  };

  return (
    <AdminShell title="Broadcast Messages">
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Broadcasts" value={broadcasts.length.toString()} />
          <StatCard label="Global Blasts" value={broadcasts.filter((b) => b.target === "all").length.toString()} />
          <StatCard label="Role-targeted" value={broadcasts.filter((b) => b.target === "role").length.toString()} />
          <StatCard label="Sent Today" value={broadcasts.filter((b) => new Date(b.sent_at).toDateString() === new Date().toDateString()).length.toString()} />
        </div>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Megaphone size={16} className="text-cyan" />
              <h2 className="text-text font-bold">Message History</h2>
            </div>
            <Button onClick={() => setComposeModal(true)}>
              <Send size={13} /> Compose
            </Button>
          </div>

          {loading ? <Spinner /> : (
            <Table
              headers={["Title", "Message", "Audience", "Sent By", "Date"]}
              empty={!broadcasts.length}
            >
              {broadcasts.map((b) => (
                <Tr key={b.id}>
                  <Td className="font-semibold">{b.title}</Td>
                  <Td className="text-textMuted text-xs max-w-[200px] truncate">{b.body}</Td>
                  <Td>
                    <Badge
                      label={b.target === "role" ? (b.target_role || "role") : b.target}
                      tone={AUD_TONE[b.target] || "muted"}
                    />
                  </Td>
                  <Td className="text-textMuted text-xs">{b.sent_by_name || "—"}</Td>
                  <Td className="text-textMuted text-xs">{formatDate(b.sent_at)}</Td>
                </Tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      <Modal open={composeModal} onClose={() => setComposeModal(false)} title="Compose Broadcast">
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Title *</label>
            <Input placeholder="Service update..." value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Message *</label>
            <textarea
              className="w-full px-3 py-2 rounded-lg bg-bg3 border border-border text-text text-sm outline-none focus:border-cyan resize-none"
              rows={4}
              placeholder="Your message to users..."
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Audience</label>
            <select value={form.target} onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-bg3 border border-border text-text text-sm outline-none focus:border-cyan">
              <option value="all">All Users</option>
              <option value="role">By Role</option>
            </select>
          </div>
          {form.target === "role" && (
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Target Role</label>
              <select value={form.target_role} onChange={(e) => setForm((f) => ({ ...f, target_role: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-bg3 border border-border text-text text-sm outline-none focus:border-cyan">
                <option value="">Select role...</option>
                <option value="passenger">Passengers</option>
                <option value="driver">Drivers</option>
                <option value="owner">Owners</option>
              </select>
            </div>
          )}
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setComposeModal(false)}>Cancel</Button>
            <Button onClick={send} disabled={sending}>
              <Send size={13} /> {sending ? "Sending..." : "Send Now"}
            </Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
