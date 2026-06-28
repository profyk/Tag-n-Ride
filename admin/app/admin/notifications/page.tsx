"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Button, Input, Select, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import {
  Megaphone, Bell, Send, Users, Info,
  AlertTriangle, CheckCircle, Zap, RefreshCw,
  Car, Star,
} from "lucide-react";
import toast from "react-hot-toast";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

type Channel = "push" | "broadcast";
type NotifType = "info" | "warning" | "success" | "error";

const QUICK_TEMPLATES = [
  {
    label: "Maintenance",
    icon: Zap,
    color: "yellow",
    title: "Scheduled Maintenance",
    message: "Tag-n-Ride will be undergoing scheduled maintenance. Services may be temporarily unavailable.",
    type: "warning" as NotifType,
  },
  {
    label: "New Feature",
    icon: Star,
    color: "cyan",
    title: "New Feature Available",
    message: "We've added a new feature to improve your Tag-n-Ride experience. Update your app to try it.",
    type: "info" as NotifType,
  },
  {
    label: "KYC Reminder",
    icon: CheckCircle,
    color: "green",
    title: "Verify Your Account",
    message: "Complete your KYC verification to unlock all Tag-n-Ride features and receive payouts.",
    type: "info" as NotifType,
  },
  {
    label: "Security Alert",
    icon: AlertTriangle,
    color: "red",
    title: "Security Notice",
    message: "We noticed unusual activity on some accounts. Please verify your details in the app.",
    type: "error" as NotifType,
  },
  {
    label: "Driver Bonus",
    icon: Car,
    color: "purple",
    title: "Weekend Bonus Active",
    message: "Complete 15 rides this weekend to earn a R150 bonus. Valid until Sunday midnight.",
    type: "success" as NotifType,
  },
];

const TYPE_ICONS: Record<NotifType, any> = {
  info: Info, warning: AlertTriangle, success: CheckCircle, error: AlertTriangle,
};
const TYPE_CLS: Record<string, string> = {
  info:    "bg-cyan/10 border-cyan/20 text-cyan",
  warning: "bg-yellow/10 border-yellow/20 text-yellow",
  success: "bg-green/10 border-green/20 text-green",
  error:   "bg-red/10 border-red/20 text-red",
};

export default function AnnouncementsPage() {
  const [channel, setChannel] = useState<Channel>("broadcast");
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // Push notification form
  const [pushTitle, setPushTitle] = useState("");
  const [pushMessage, setPushMessage] = useState("");
  const [pushType, setPushType] = useState<NotifType>("info");
  const [pushTarget, setPushTarget] = useState("all");

  // Broadcast form
  const [bTitle, setBTitle] = useState("");
  const [bMessage, setBMessage] = useState("");
  const [bTarget, setBTarget] = useState("all");
  const [bRole, setBRole] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.broadcasts();
      setBroadcasts(Array.isArray(r.data) ? r.data : []);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const applyTemplate = (t: typeof QUICK_TEMPLATES[0]) => {
    if (channel === "push") {
      setPushTitle(t.title); setPushMessage(t.message); setPushType(t.type);
    } else {
      setBTitle(t.title); setBMessage(t.message);
    }
  };

  const handleSendPush = async () => {
    if (!pushTitle.trim() || !pushMessage.trim()) { toast.error("Title and message required"); return; }
    if (pushMessage.length > 160) { toast.error("Message must be 160 characters or less"); return; }
    setSending(true);
    try {
      await fetch(`${BASE}/api/admin/notifications/send`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          title: pushTitle.trim(),
          message: pushMessage.trim(),
          type: pushType,
          target: pushTarget,
        }),
      });
      toast.success("In-app notification sent");
      setPushTitle(""); setPushMessage(""); setPushType("info"); setPushTarget("all");
      load();
    } catch (e: any) { toast.error(e.message || "Failed to send notification"); }
    finally { setSending(false); }
  };

  const handleSendBroadcast = async () => {
    if (!bTitle.trim() || !bMessage.trim()) { toast.error("Title and message required"); return; }
    setSending(true);
    try {
      await api.sendBroadcast({
        title: bTitle.trim(),
        message: bMessage.trim(),
        target: bTarget,
        target_role: bRole || undefined,
      });
      toast.success("Broadcast sent");
      setBTitle(""); setBMessage(""); setBTarget("all"); setBRole("");
      load();
    } catch (e: any) { toast.error(e.message || "Failed to send broadcast"); }
    finally { setSending(false); }
  };

  const handleSend = channel === "push" ? handleSendPush : handleSendBroadcast;

  return (
    <AdminShell title="Announcements">
      <div className="space-y-6 max-w-4xl">

        {/* Channel selector */}
        <div className="flex gap-3">
          {([
            { id: "broadcast", label: "Broadcast", desc: "Push to all users or by role via notification center", icon: Megaphone },
            { id: "push",      label: "In-App Push", desc: "Targeted in-app push notification with type badge", icon: Bell },
          ] as const).map(({ id, label, desc, icon: Icon }) => (
            <button key={id} onClick={() => setChannel(id)}
              className={`flex-1 flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
                channel === id
                  ? "bg-cyanDim border-cyan/30 text-cyan"
                  : "bg-bg2 border-border text-textMuted hover:border-cyan/20 hover:text-text"
              }`}>
              <Icon size={18} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm">{label}</p>
                <p className="text-[10px] leading-tight mt-0.5 opacity-70">{desc}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Quick templates */}
        <div>
          <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-2">Quick Templates</p>
          <div className="flex gap-2 flex-wrap">
            {QUICK_TEMPLATES.map(t => (
              <button key={t.label} onClick={() => applyTemplate(t)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all bg-bg2 border-border text-textMuted hover:border-cyan/30 hover:text-cyan">
                <t.icon size={11} /> {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Compose panel */}
          <Card>
            <h2 className="text-text font-bold mb-4 flex items-center gap-2">
              {channel === "push" ? <Bell size={16} className="text-cyan" /> : <Megaphone size={16} className="text-cyan" />}
              {channel === "push" ? "Send Push Notification" : "Send Broadcast"}
            </h2>

            {channel === "push" && (
              <div className="mb-4">
                <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-2">Notification Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["info", "warning", "success", "error"] as NotifType[]).map(t => {
                    const Icon = TYPE_ICONS[t];
                    return (
                      <button key={t} onClick={() => setPushType(t)}
                        className={`flex items-center gap-2 py-2 px-3 rounded-lg border text-xs font-bold capitalize transition-all ${
                          pushType === t ? TYPE_CLS[t] : "bg-bg border-border text-textMuted"
                        }`}>
                        <Icon size={12} /> {t}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Title *</label>
                <Input
                  placeholder="Announcement title..."
                  value={channel === "push" ? pushTitle : bTitle}
                  onChange={e => channel === "push" ? setPushTitle(e.target.value) : setBTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
                  Message *
                  {channel === "push" && (
                    <span className={`ml-2 font-normal normal-case ${pushMessage.length > 160 ? "text-red" : pushMessage.length > 130 ? "text-yellow" : "text-textDim"}`}>
                      {pushMessage.length}/160
                    </span>
                  )}
                </label>
                <textarea
                  rows={4}
                  value={channel === "push" ? pushMessage : bMessage}
                  onChange={e => channel === "push" ? setPushMessage(e.target.value) : setBMessage(e.target.value)}
                  placeholder={channel === "push" ? "Message text (160 char max)..." : "Message body..."}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-text text-sm placeholder:text-textDim focus:outline-none focus:border-cyan resize-none"
                />
              </div>

              {channel === "push" && (
                <div>
                  <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Target</label>
                  <Select value={pushTarget} onChange={e => setPushTarget(e.target.value)} className="w-full">
                    <option value="all">All Users</option>
                    <option value="drivers">Drivers</option>
                    <option value="passengers">Passengers</option>
                    <option value="owners">Fleet Owners</option>
                  </Select>
                </div>
              )}

              {channel === "broadcast" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Audience</label>
                    <Select value={bTarget} onChange={e => setBTarget(e.target.value)} className="w-full">
                      <option value="all">All Users</option>
                      <option value="role">By Role</option>
                    </Select>
                  </div>
                  {bTarget === "role" && (
                    <div>
                      <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Role</label>
                      <Select value={bRole} onChange={e => setBRole(e.target.value)} className="w-full">
                        <option value="">Select...</option>
                        <option value="passenger">Passengers</option>
                        <option value="driver">Drivers</option>
                        <option value="owner">Owners</option>
                      </Select>
                    </div>
                  )}
                </div>
              )}
            </div>

            {channel === "broadcast" && bTarget === "all" && (
              <div className="flex items-center gap-2 p-3 bg-yellow/5 border border-yellow/20 rounded-lg mb-4">
                <AlertTriangle size={13} className="text-yellow flex-shrink-0" />
                <p className="text-yellow text-xs">This will broadcast to all app users. Review the message carefully.</p>
              </div>
            )}

            <Button onClick={handleSend} loading={sending}
              disabled={channel === "push" ? (!pushTitle || !pushMessage) : (!bTitle || !bMessage)}
              className="w-full">
              <Send size={13} />
              {channel === "push" ? "Send Push Notification" : "Send Broadcast"}
            </Button>
          </Card>

          {/* Preview panel */}
          <Card>
            <h2 className="text-text font-bold mb-4">Preview</h2>
            {channel === "push" ? (
              <div className="bg-bg3 border border-border rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-bg2 border border-border flex items-center justify-center flex-shrink-0">
                    {(() => { const I = TYPE_ICONS[pushType]; return <I size={16} className="text-cyan" />; })()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-text font-bold text-sm leading-tight">
                      {pushTitle || <span className="text-textDim opacity-50">Notification title</span>}
                    </p>
                    <p className="text-textMuted text-xs mt-1 leading-relaxed">
                      {pushMessage || <span className="opacity-50">Your message will appear here...</span>}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold ${TYPE_CLS[pushType] || "bg-cyan/10 border-cyan/20 text-cyan"}`}>{pushType}</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold bg-cyan/10 border-cyan/20 text-cyan">{pushTarget}</span>
                      <span className="text-textDim text-[10px]">just now</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-bg3 border border-border rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-bg2 border border-border flex items-center justify-center flex-shrink-0">
                    <Megaphone size={16} className="text-cyan" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-text font-bold text-sm leading-tight">
                      {bTitle || <span className="text-textDim opacity-50">Announcement title</span>}
                    </p>
                    <p className="text-textMuted text-xs mt-1 leading-relaxed">
                      {bMessage || <span className="opacity-50">Your message will appear here...</span>}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold bg-cyan/10 border-cyan/20 text-cyan">{bTarget === "role" ? (bRole || "role") : "all users"}</span>
                      <span className="text-textDim text-[10px]">just now</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <p className="text-textDim text-[10px] mt-3 text-center">Preview is approximate — actual appearance varies by device</p>
          </Card>
        </div>

        {/* History */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-textMuted uppercase tracking-widest">Broadcast History</h2>
            <button onClick={load} className="text-textDim hover:text-cyan transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>
          {loading ? <Spinner /> : broadcasts.length === 0 ? (
            <div className="text-center py-12 border border-border rounded-xl">
              <Megaphone size={28} className="text-textDim mx-auto mb-3" />
              <p className="text-textMuted font-bold">No broadcasts sent yet</p>
              <p className="text-textDim text-sm mt-1">Broadcasts you send will appear here</p>
            </div>
          ) : (
            <div className="space-y-2">
              {broadcasts.slice(0, 20).map((b: any) => {
                const audience = b.target === "role" ? (b.target_role || "role") : (b.target || "all");
                return (
                  <div key={b.id} className="bg-bg2 border border-border rounded-xl px-4 py-3 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-cyanDim border border-cyan/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Megaphone size={13} className="text-cyan" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-text text-sm">{b.title}</p>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold bg-cyan/10 border-cyan/20 text-cyan">{audience}</span>
                      </div>
                      <p className="text-textMuted text-xs mt-0.5 line-clamp-1">{b.body || b.message}</p>
                    </div>
                    <div className="text-right text-[10px] text-textDim flex-shrink-0">
                      <p>{b.sent_by_name || "System"}</p>
                      <p>{formatDate(b.sent_at || b.created_at)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </AdminShell>
  );
}
