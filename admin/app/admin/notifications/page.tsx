"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Spinner, Modal, Input, Select } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { Bell, Send, Users, MessageSquare, CheckCircle, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

const TEMPLATES = [
  { label: "Maintenance", title: "Scheduled Maintenance", message: "We'll be performing maintenance tonight from 02:00 to 04:00 SAST. Transactions may be temporarily unavailable." },
  { label: "New Feature", title: "New Feature Available", message: "We've launched an exciting new feature! Update your app to the latest version to access it." },
  { label: "KYC Reminder", title: "Complete Your Verification", message: "Your account is pending KYC verification. Please submit your driver's licence to receive payments." },
  { label: "Promo", title: "Special Offer This Weekend", message: "Enjoy reduced platform fees this weekend only. Drive more and earn more!" },
  { label: "Security", title: "Important Security Notice", message: "We've updated our security measures. Please review your account settings and ensure your PIN is secure." },
];

const MAX_MSG = 160;

function typeTone(t: string): any {
  return t === "info" ? "cyan" : t === "warning" ? "yellow" : t === "success" ? "green" : "red";
}

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
  const [preview, setPreview] = useState(false);

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
          title: title.trim(),
          message: message.trim(),
          type,
          target,
          target_role: targetRole || undefined,
        }),
      });
      toast.success("Notification sent");
      setSendModal(false);
      setTitle(""); setMessage(""); setType("info"); setTarget("all"); setTargetRole(""); setPreview(false);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSending(false); }
  };

  const applyTemplate = (t: typeof TEMPLATES[0]) => {
    setTitle(t.title); setMessage(t.message);
  };

  const byType = notifications.reduce((acc: Record<string, number>, n) => {
    acc[n.type] = (acc[n.type] || 0) + 1;
    return acc;
  }, {});

  const audienceLabel = target === "all" ? "All users" : targetRole ? `All ${targetRole}s` : "By role";

  return (
    <AdminShell title="Notifications">
      <div className="space-y-4">

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="text-center">
            <p className="text-2xl font-extrabold text-cyan">{notifications.length}</p>
            <p className="text-xs text-textMuted mt-1">Total Sent</p>
          </Card>
          <Card className="text-center">
            <p className="text-2xl font-extrabold text-green">{byType.success || 0}</p>
            <p className="text-xs text-textMuted mt-1">Success</p>
          </Card>
          <Card className="text-center">
            <p className="text-2xl font-extrabold text-yellow">{byType.warning || 0}</p>
            <p className="text-xs text-textMuted mt-1">Warnings</p>
          </Card>
          <Card className="text-center">
            <p className="text-2xl font-extrabold text-red">{byType.error || 0}</p>
            <p className="text-xs text-textMuted mt-1">Alerts</p>
          </Card>
        </div>

        <div className="flex justify-between items-center">
          <p className="text-textMuted text-sm">{notifications.length} notification{notifications.length !== 1 ? "s" : ""} sent</p>
          <Button onClick={() => setSendModal(true)}>
            <Bell size={13} /> Send Notification
          </Button>
        </div>

        {loading ? <Spinner /> : (
          <Table
            headers={["Title", "Message", "Type", "Audience", "Sent By", "Date"]}
            empty={!notifications.length}>
            {notifications.map((n: any) => (
              <Tr key={n.id}>
                <Td className="font-semibold">{n.title}</Td>
                <Td className="text-textMuted text-xs max-w-xs truncate">{n.message}</Td>
                <Td>
                  <Badge label={n.type} tone={typeTone(n.type)} />
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

      <Modal open={sendModal} onClose={() => { setSendModal(false); setPreview(false); }} title="Send Notification">
        <div className="space-y-4">

          {/* Templates */}
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-2">Quick Templates</label>
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.label}
                  onClick={() => applyTemplate(t)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-border text-textMuted hover:border-cyan/30 hover:text-cyan transition-all">
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Title</label>
            <Input placeholder="Notification title..." value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
              Message
              <span className={`ml-2 font-normal normal-case ${message.length > MAX_MSG ? "text-red" : "text-textDim"}`}>
                {message.length}/{MAX_MSG}
              </span>
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
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Type</label>
              <Select value={type} onChange={(e) => setType(e.target.value)} className="w-full">
                <option value="info">ℹ Info</option>
                <option value="warning">⚠ Warning</option>
                <option value="success">✓ Success</option>
                <option value="error">⚡ Alert</option>
              </Select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Audience</label>
              <Select value={target} onChange={(e) => setTarget(e.target.value)} className="w-full">
                <option value="all">All Users</option>
                <option value="role">By Role</option>
              </Select>
            </div>
          </div>

          {target === "role" && (
            <div>
              <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Role</label>
              <Select value={targetRole} onChange={(e) => setTargetRole(e.target.value)} className="w-full">
                <option value="">Select role...</option>
                <option value="passenger">Passenger</option>
                <option value="driver">Driver</option>
                <option value="owner">Fleet Owner</option>
              </Select>
            </div>
          )}

          {/* Preview toggle */}
          <button
            onClick={() => setPreview(v => !v)}
            className="flex items-center gap-2 text-xs text-textMuted hover:text-cyan transition-colors">
            <MessageSquare size={12} />
            {preview ? "Hide preview" : "Preview notification"}
          </button>

          {preview && title && (
            <div className={`p-4 rounded-xl border ${
              type === "success" ? "bg-green/5 border-green/20" :
              type === "warning" ? "bg-yellow/5 border-yellow/20" :
              type === "error" ? "bg-red/5 border-red/20" :
              "bg-cyan/5 border-cyan/20"
            }`}>
              <div className="flex items-start gap-3">
                {type === "success" ? <CheckCircle size={16} className="text-green mt-0.5" /> :
                 type === "error" ? <AlertCircle size={16} className="text-red mt-0.5" /> :
                 <Bell size={16} className={type === "warning" ? "text-yellow mt-0.5" : "text-cyan mt-0.5"} />}
                <div>
                  <p className={`font-bold text-sm ${
                    type === "success" ? "text-green" :
                    type === "warning" ? "text-yellow" :
                    type === "error" ? "text-red" : "text-cyan"
                  }`}>{title}</p>
                  {message && <p className="text-textMuted text-xs mt-1">{message}</p>}
                  <p className="text-textDim text-[10px] mt-2 flex items-center gap-1">
                    <Users size={9} /> {audienceLabel}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" onClick={() => { setSendModal(false); setPreview(false); }}>Cancel</Button>
            <Button
              onClick={handleSend}
              loading={sending}
              disabled={!title.trim() || !message.trim() || message.length > MAX_MSG}>
              <Send size={13} /> Send to {audienceLabel}
            </Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
