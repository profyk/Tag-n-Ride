"use client";
import { useEffect, useState, useCallback } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Spinner, Modal, Input, Select, StatCard } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import {
  MessageCircle, Send, CheckCheck, Check, Clock, XCircle,
  Users, Car, AlertTriangle, Phone, RefreshCw, Copy,
  FileText, UserX, Wifi, WifiOff, ChevronRight, Download,
  BarChart3, UserCheck,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import toast from "react-hot-toast";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

type MsgStatus = "sent" | "delivered" | "read" | "failed" | "pending";
type TabId = "send" | "history" | "templates" | "optouts" | "analytics";

const TEMPLATES = [
  {
    id: "kyc_reminder",
    name: "KYC Reminder",
    category: "UTILITY",
    body: "Hi {{1}}, your Tag-n-Ride account is pending verification. Please submit your driver's licence to start receiving payments. Tap here: {{2}}",
    variables: ["Driver Name", "Verification Link"],
    status: "approved",
  },
  {
    id: "withdrawal_processed",
    name: "Withdrawal Processed",
    category: "TRANSACTIONAL",
    body: "Hi {{1}}, your withdrawal of R{{2}} has been processed. Funds will reflect within 1–2 business days.",
    variables: ["Name", "Amount"],
    status: "approved",
  },
  {
    id: "wallet_topup",
    name: "Wallet Top-Up Confirmation",
    category: "TRANSACTIONAL",
    body: "Hi {{1}}, R{{2}} has been added to your Tag-n-Ride wallet. New balance: R{{3}}.",
    variables: ["Name", "Amount", "Balance"],
    status: "approved",
  },
  {
    id: "account_suspended",
    name: "Account Suspended",
    category: "UTILITY",
    body: "Hi {{1}}, your Tag-n-Ride account has been suspended. Reason: {{2}}. Contact support for help.",
    variables: ["Name", "Reason"],
    status: "approved",
  },
  {
    id: "promo_weekend",
    name: "Weekend Promotion",
    category: "MARKETING",
    body: "Hi {{1}}! 🚗 Drive more this weekend and earn extra. Complete 15 rides and get a R150 bonus. Valid {{2}}.",
    variables: ["Name", "Validity Date"],
    status: "approved",
  },
  {
    id: "security_alert",
    name: "Security Alert",
    category: "UTILITY",
    body: "⚠️ Hi {{1}}, we noticed a login from a new device. If this wasn't you, contact support immediately or reset your PIN.",
    variables: ["Name"],
    status: "pending",
  },
];

const STATUS_CONFIG: Record<MsgStatus, { label: string; icon: any; color: string }> = {
  read:      { label: "Read",      icon: CheckCheck, color: "text-cyan" },
  delivered: { label: "Delivered", icon: CheckCheck, color: "text-green" },
  sent:      { label: "Sent",      icon: Check,      color: "text-textMuted" },
  pending:   { label: "Pending",   icon: Clock,      color: "text-yellow" },
  failed:    { label: "Failed",    icon: XCircle,    color: "text-red" },
};

const CATEGORY_TONE: Record<string, any> = {
  UTILITY: "cyan", TRANSACTIONAL: "green", MARKETING: "purple",
};

function StatusChip({ status }: { status: MsgStatus }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className={`flex items-center gap-1 text-xs font-bold ${cfg.color}`}>
      <Icon size={11} /> {cfg.label}
    </span>
  );
}

export default function WhatsAppPage() {
  const [tab, setTab] = useState<TabId>("send");
  const [apiStatus, setApiStatus] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [optouts, setOptouts] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingOptouts, setLoadingOptouts] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [apiTemplates, setApiTemplates] = useState<typeof TEMPLATES | null>(null);
  const [removingOptout, setRemovingOptout] = useState<string | null>(null);

  // Send form
  const [recipientType, setRecipientType] = useState<"phone" | "audience">("phone");
  const [phone, setPhone] = useState("");
  const [audience, setAudience] = useState<"drivers" | "passengers" | "all">("drivers");
  const [msgType, setMsgType] = useState<"template" | "freetext">("template");
  const [selectedTemplate, setSelectedTemplate] = useState(TEMPLATES[0]);
  const [templateVars, setTemplateVars] = useState<string[]>([]);
  const [freeText, setFreeText] = useState("");
  const [sending, setSending] = useState(false);

  // History filters
  const [histSearch, setHistSearch] = useState("");
  const [histStatus, setHistStatus] = useState<MsgStatus | "all">("all");

  // Opt-out filters
  const [optSearch, setOptSearch] = useState("");

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const r = await fetch(`${BASE}/api/admin/whatsapp/status`, { headers: authHeaders() });
      const d = await r.json();
      setApiStatus(d);
    } catch { setApiStatus(null); }
    finally { setStatusLoading(false); }
  }, []);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const r = await fetch(`${BASE}/api/admin/whatsapp/messages`, { headers: authHeaders() });
      const d = await r.json();
      setMessages(Array.isArray(d) ? d : (d.messages || []));
    } catch { setMessages([]); }
    finally { setLoadingHistory(false); }
  }, []);

  const loadOptouts = useCallback(async () => {
    setLoadingOptouts(true);
    try {
      const r = await fetch(`${BASE}/api/admin/whatsapp/optouts`, { headers: authHeaders() });
      const d = await r.json();
      setOptouts(Array.isArray(d) ? d : (d.optouts || []));
    } catch { setOptouts([]); }
    finally { setLoadingOptouts(false); }
  }, []);

  // Fetch templates from backend; fall back to hardcoded if unavailable
  const loadTemplates = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/admin/whatsapp/templates`, { headers: authHeaders() });
      if (r.ok) {
        const d = await r.json();
        const items = Array.isArray(d) ? d : d.templates;
        if (Array.isArray(items) && items.length > 0) setApiTemplates(items);
      }
    } catch { /* use hardcoded fallback */ }
  }, []);

  useEffect(() => { loadStatus(); loadTemplates(); }, []);
  useEffect(() => {
    if (tab === "history") loadHistory();
    if (tab === "optouts") loadOptouts();
  }, [tab]);

  const previewBody = () => {
    if (msgType === "freetext") return freeText;
    let body = selectedTemplate.body;
    (templateVars || []).forEach((v, i) => {
      body = body.replace(`{{${i + 1}}}`, v || `[${selectedTemplate.variables[i]}]`);
    });
    return body;
  };

  const handleSend = async () => {
    if (recipientType === "phone" && !phone.trim()) { toast.error("Enter a phone number"); return; }
    if (msgType === "freetext" && !freeText.trim()) { toast.error("Enter a message"); return; }
    setSending(true);
    try {
      const payload =
        recipientType === "phone"
          ? {
              to: phone.trim(),
              type: msgType,
              template_id: msgType === "template" ? selectedTemplate.id : undefined,
              variables: msgType === "template" ? templateVars : undefined,
              message: msgType === "freetext" ? freeText.trim() : undefined,
            }
          : {
              audience,
              type: "template",
              template_id: selectedTemplate.id,
              variables: templateVars,
            };

      const res = await fetch(`${BASE}/api/admin/whatsapp/send`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || `Send failed (${res.status})`);
      }
      toast.success(recipientType === "phone" ? `Message sent to ${phone}` : `Broadcast queued for ${audience}`);
      setPhone(""); setFreeText(""); setTemplateVars([]);
      loadStatus();
    } catch (e: any) { toast.error(e.message || "Failed to send"); }
    finally { setSending(false); }
  };

  const copyTemplate = (body: string) => {
    navigator.clipboard.writeText(body);
    toast.success("Copied to clipboard");
  };

  const handleRemoveOptout = async (phone: string) => {
    if (!confirm(`Re-subscribe ${phone}? They will start receiving messages again.`)) return;
    setRemovingOptout(phone);
    try {
      const res = await fetch(`${BASE}/api/admin/whatsapp/optouts/${encodeURIComponent(phone)}`, {
        method: "DELETE", headers: authHeaders(),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "Failed");
      toast.success(`${phone} re-subscribed`);
      setOptouts(prev => prev.filter(o => o.phone !== phone));
    } catch (e: any) { toast.error(e.message); }
    finally { setRemovingOptout(null); }
  };

  const exportHistory = () => {
    if (!messages.length) { toast.error("No messages to export"); return; }
    const rows = [
      ["Recipient", "Phone", "Template/Message", "Type", "Status", "Sent At", "Sent By"],
      ...messages.map(m => [
        m.recipient_name ?? "", m.to ?? "",
        m.template_name ?? m.message_preview ?? "",
        m.message_type ?? "template",
        m.status, m.sent_at, m.sent_by_name ?? "System",
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `whatsapp_history_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    toast.success("History exported");
  };

  // Use API templates if fetched, otherwise fall back to hardcoded
  const activeTemplates = apiTemplates ?? TEMPLATES;

  const filteredMessages = messages.filter(m =>
    (histStatus === "all" || m.status === histStatus) &&
    (!histSearch || m.to?.includes(histSearch) || m.recipient_name?.toLowerCase().includes(histSearch.toLowerCase()))
  );

  const filteredOptouts = optouts.filter(o =>
    !optSearch ||
    o.phone?.includes(optSearch) ||
    o.name?.toLowerCase().includes(optSearch.toLowerCase())
  );

  const todayMessages = messages.filter(m => {
    const d = new Date(m.sent_at);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  });
  const readRate = messages.length > 0
    ? Math.round((messages.filter(m => m.status === "read").length / messages.length) * 100)
    : 0;

  const TABS: { id: TabId; label: string; icon: any }[] = [
    { id: "send",      label: "Send",      icon: Send },
    { id: "history",   label: "History",   icon: MessageCircle },
    { id: "templates", label: "Templates", icon: FileText },
    { id: "optouts",   label: "Opt-outs",  icon: UserX },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
  ];

  const connected = apiStatus?.status === "connected";

  return (
    <AdminShell title="WhatsApp Business">
      <div className="space-y-6">

        {/* API Status + Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className={`col-span-2 md:col-span-1 ${connected ? "border-green/20" : "border-red/20"}`}>
            {statusLoading ? (
              <div className="flex justify-center py-2"><Spinner /></div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">API Status</p>
                  <div className="flex items-center gap-2">
                    {connected
                      ? <><div className="w-2 h-2 rounded-full bg-green animate-pulse" /><span className="text-green font-bold">Connected</span></>
                      : <><div className="w-2 h-2 rounded-full bg-red" /><span className="text-red font-bold">Disconnected</span></>}
                  </div>
                  {apiStatus?.phone_number && (
                    <p className="text-textDim text-[10px] font-mono mt-1">{apiStatus.phone_number}</p>
                  )}
                </div>
                {connected
                  ? <Wifi size={20} className="text-green" />
                  : <WifiOff size={20} className="text-red" />}
              </div>
            )}
          </Card>
          <StatCard label="Messages Today" value={todayMessages.length.toString()} tone="cyan" />
          <StatCard label="Read Rate" value={`${readRate}%`} tone="green" />
          <StatCard label="Opted Out" value={optouts.length.toString()} tone="yellow" />
        </div>

        {/* Disconnected alert */}
        {!statusLoading && !connected && (
          <div className="flex items-center gap-3 px-4 py-3 bg-red/10 border border-red/20 rounded-xl">
            <AlertTriangle size={15} className="text-red flex-shrink-0" />
            <div className="flex-1">
              <p className="text-red text-sm font-semibold">WhatsApp Business API is not connected</p>
              <p className="text-red/70 text-xs mt-0.5">Messages cannot be sent until the API is reconnected. Check your Meta Business credentials.</p>
            </div>
            <Button variant="ghost" onClick={loadStatus}>
              <RefreshCw size={13} /> Retry
            </Button>
          </div>
        )}

        {/* Quota bar */}
        {apiStatus?.quota_used !== undefined && (
          <Card>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest">Monthly Message Quota</p>
              <p className="text-xs font-bold text-textMuted">
                {apiStatus.quota_used.toLocaleString()} / {(apiStatus.quota_limit || 100000).toLocaleString()}
              </p>
            </div>
            <div className="h-2 bg-bg3 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  (apiStatus.quota_used / (apiStatus.quota_limit || 100000)) > 0.9 ? "bg-red" :
                  (apiStatus.quota_used / (apiStatus.quota_limit || 100000)) > 0.75 ? "bg-yellow" : "bg-green"
                }`}
                style={{ width: `${Math.min(100, (apiStatus.quota_used / (apiStatus.quota_limit || 100000)) * 100)}%` }}
              />
            </div>
            <p className="text-textDim text-[10px] mt-1">Resets on the 1st of each month</p>
          </Card>
        )}

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-bg2 border border-border rounded-xl w-fit">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  tab === t.id ? "bg-cyanDim text-cyan" : "text-textMuted hover:text-text"
                }`}>
                <Icon size={13} /> {t.label}
              </button>
            );
          })}
        </div>

        {/* ─── SEND TAB ─── */}
        {tab === "send" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <h2 className="text-text font-bold mb-4">Compose Message</h2>

              {/* Recipient type */}
              <div className="mb-4">
                <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-2">Send To</label>
                <div className="flex gap-2">
                  {([
                    { value: "phone",    label: "Single User",  icon: Phone },
                    { value: "audience", label: "Broadcast",    icon: Users },
                  ] as const).map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      onClick={() => setRecipientType(value)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold border transition-all ${
                        recipientType === value ? "bg-cyanDim text-cyan border-cyan/20" : "bg-bg text-textMuted border-border"
                      }`}>
                      <Icon size={13} /> {label}
                    </button>
                  ))}
                </div>
              </div>

              {recipientType === "phone" ? (
                <div className="mb-4">
                  <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Phone Number</label>
                  <Input
                    placeholder="+27821234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                  <p className="text-textDim text-[10px] mt-1">Include country code. e.g. +27 for South Africa</p>
                </div>
              ) : (
                <div className="mb-4">
                  <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Audience</label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { value: "drivers",    label: "Drivers",    icon: Car },
                      { value: "passengers", label: "Passengers", icon: Users },
                      { value: "all",        label: "Everyone",   icon: Users },
                    ] as const).map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        onClick={() => setAudience(value)}
                        className={`flex flex-col items-center gap-1 py-3 rounded-lg text-xs font-bold border transition-all ${
                          audience === value ? "bg-cyanDim text-cyan border-cyan/20" : "bg-bg text-textMuted border-border"
                        }`}>
                        <Icon size={14} /> {label}
                      </button>
                    ))}
                  </div>
                  {audience === "all" && (
                    <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-yellow/10 border border-yellow/20 rounded-lg">
                      <AlertTriangle size={12} className="text-yellow" />
                      <p className="text-yellow text-xs">This broadcasts to all app users. Review carefully.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Message type — freetext only available for single phone */}
              {recipientType === "phone" && (
                <div className="mb-4">
                  <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-2">Message Type</label>
                  <div className="flex gap-2">
                    {([
                      { value: "template", label: "Template" },
                      { value: "freetext", label: "Free Text" },
                    ] as const).map(({ value, label }) => (
                      <button
                        key={value}
                        onClick={() => setMsgType(value)}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${
                          msgType === value ? "bg-cyanDim text-cyan border-cyan/20" : "bg-bg text-textMuted border-border"
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {msgType === "freetext" && (
                    <p className="text-textDim text-[10px] mt-1.5">Free text only works within the 24-hour customer service window.</p>
                  )}
                </div>
              )}

              {/* Template picker */}
              {(msgType === "template" || recipientType === "audience") && (
                <div className="mb-4">
                  <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Template</label>
                  <Select
                    value={selectedTemplate.id}
                    onChange={(e) => {
                      const t = activeTemplates.find(t => t.id === e.target.value);
                      if (t) { setSelectedTemplate(t); setTemplateVars([]); }
                    }}
                    className="w-full">
                    {activeTemplates.filter(t => t.status === "approved").map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </Select>

                  {selectedTemplate.variables.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest">Template Variables</label>
                      {selectedTemplate.variables.map((v, i) => (
                        <Input
                          key={i}
                          placeholder={v}
                          value={templateVars[i] || ""}
                          onChange={(e) => {
                            const next = [...templateVars];
                            next[i] = e.target.value;
                            setTemplateVars(next);
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Free text */}
              {msgType === "freetext" && recipientType === "phone" && (
                <div className="mb-4">
                  <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
                    Message
                    <span className={`ml-2 font-normal normal-case ${freeText.length > 4096 ? "text-red" : "text-textDim"}`}>
                      {freeText.length}/4096
                    </span>
                  </label>
                  <textarea
                    value={freeText}
                    onChange={(e) => setFreeText(e.target.value)}
                    placeholder="Type your message..."
                    rows={5}
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-text text-sm placeholder:text-textDim focus:outline-none focus:border-cyan transition-colors resize-none"
                  />
                </div>
              )}

              <Button onClick={handleSend} loading={sending} disabled={!connected} className="w-full">
                <Send size={13} />
                {recipientType === "phone"
                  ? `Send to ${phone || "recipient"}`
                  : `Broadcast to ${audience === "all" ? "Everyone" : audience}`}
              </Button>
              {!connected && (
                <p className="text-red text-xs text-center mt-2">API disconnected — cannot send</p>
              )}
            </Card>

            {/* Preview */}
            <Card>
              <h2 className="text-text font-bold mb-4">Message Preview</h2>
              <div className="bg-[#ECE5DD] dark:bg-[#1A1A1A] rounded-2xl p-4 min-h-48">
                <div className="flex justify-end">
                  <div className="max-w-[80%] bg-[#DCF8C6] dark:bg-[#1F5C35] rounded-tl-2xl rounded-tr-sm rounded-bl-2xl rounded-br-2xl px-3 py-2.5 shadow-sm">
                    <p className="text-[#111] dark:text-white text-sm leading-relaxed whitespace-pre-wrap break-words">
                      {previewBody() || (
                        <span className="opacity-40">Your message will appear here...</span>
                      )}
                    </p>
                    <div className="flex items-center gap-1 justify-end mt-1">
                      <span className="text-[10px] text-[#666] dark:text-white/50">
                        {new Date().toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <CheckCheck size={11} className="text-[#53BDEB]" />
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-textDim text-[10px] mt-3 text-center">Preview is approximate — actual formatting may vary by device</p>

              {msgType === "template" && (
                <div className="mt-4 p-3 bg-bg border border-border rounded-xl">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-textMuted uppercase tracking-widest">Template Raw</span>
                    <button onClick={() => copyTemplate(selectedTemplate.body)} className="text-textDim hover:text-cyan transition-colors">
                      <Copy size={12} />
                    </button>
                  </div>
                  <p className="text-textMuted text-xs font-mono leading-relaxed">{selectedTemplate.body}</p>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ─── HISTORY TAB ─── */}
        {tab === "history" && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-text font-bold">Message History ({filteredMessages.length})</h2>
              <div className="flex gap-2 items-center">
                <button onClick={exportHistory} title="Export CSV"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-textMuted text-xs font-bold hover:text-green hover:border-green/30 transition-all">
                  <Download size={12} /> Export
                </button>
                <div className="w-48">
                  <Input
                    placeholder="Search phone or name..."
                    value={histSearch}
                    onChange={(e) => setHistSearch(e.target.value)}
                  />
                </div>
                <Select value={histStatus} onChange={(e) => setHistStatus(e.target.value as any)} className="text-xs">
                  <option value="all">All Status</option>
                  <option value="read">Read</option>
                  <option value="delivered">Delivered</option>
                  <option value="sent">Sent</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                </Select>
                <button onClick={loadHistory} className="text-textMuted hover:text-cyan transition-colors">
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>

            {loadingHistory ? <Spinner /> : (
              <Table
                headers={["Recipient", "Template / Message", "Type", "Status", "Sent At", "Sent By"]}
                empty={!filteredMessages.length}>
                {filteredMessages.map((m: any) => (
                  <Tr key={m.id}>
                    <Td>
                      <p className="font-semibold text-sm">{m.recipient_name || "—"}</p>
                      <p className="text-textDim text-[10px] font-mono">{m.to}</p>
                    </Td>
                    <Td className="text-textMuted text-xs max-w-[180px] truncate">{m.template_name || m.message_preview || "—"}</Td>
                    <Td>
                      <Badge label={m.message_type || "template"} tone={m.message_type === "freetext" ? "purple" : "cyan"} />
                    </Td>
                    <Td><StatusChip status={m.status} /></Td>
                    <Td className="text-textMuted text-xs whitespace-nowrap">{formatDate(m.sent_at)}</Td>
                    <Td className="text-textMuted text-xs">{m.sent_by_name || "System"}</Td>
                  </Tr>
                ))}
              </Table>
            )}

            {!loadingHistory && filteredMessages.length === 0 && messages.length > 0 && (
              <p className="text-textMuted text-center py-6 text-sm">No messages match your filters</p>
            )}
            {!loadingHistory && messages.length === 0 && (
              <div className="text-center py-12">
                <MessageCircle size={32} className="text-textDim mx-auto mb-3" />
                <p className="text-textMuted font-bold">No messages sent yet</p>
                <p className="text-textDim text-sm mt-1">Messages you send will appear here</p>
              </div>
            )}
          </Card>
        )}

        {/* ─── TEMPLATES TAB ─── */}
        {tab === "templates" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-textMuted text-sm">{activeTemplates.length} templates — {activeTemplates.filter(t => t.status === "approved").length} approved{apiTemplates ? " (live from API)" : " (local)"}</p>
              <div className="flex items-center gap-2 text-xs text-textDim">
                <span className="w-2 h-2 rounded-full bg-green inline-block" /> Approved
                <span className="w-2 h-2 rounded-full bg-yellow inline-block ml-2" /> Pending
                <span className="w-2 h-2 rounded-full bg-red inline-block ml-2" /> Rejected
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeTemplates.map((t) => (
                <Card key={t.id} className={`${t.status === "pending" ? "border-yellow/20" : t.status === "rejected" ? "border-red/20" : ""}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-text font-bold text-sm">{t.name}</h3>
                        <div className={`w-2 h-2 rounded-full ${t.status === "approved" ? "bg-green" : t.status === "pending" ? "bg-yellow" : "bg-red"}`} />
                      </div>
                      <Badge label={t.category} tone={CATEGORY_TONE[t.category] || "cyan"} />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => copyTemplate(t.body)}
                        className="text-textDim hover:text-cyan transition-colors p-1"
                        title="Copy template body">
                        <Copy size={13} />
                      </button>
                      {t.status === "approved" && (
                        <button
                          onClick={() => { setSelectedTemplate(t as any); setTemplateVars([]); setTab("send"); }}
                          className="text-textDim hover:text-cyan transition-colors p-1"
                          title="Use this template">
                          <ChevronRight size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="bg-bg border border-border rounded-lg p-3">
                    <p className="text-textMuted text-xs leading-relaxed font-mono">{t.body}</p>
                  </div>
                  {t.variables.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {t.variables.map((v, i) => (
                        <span key={i} className="text-[10px] bg-cyan/10 text-cyan px-2 py-0.5 rounded font-mono">
                          {"{{" + (i + 1) + "}}"} = {v}
                        </span>
                      ))}
                    </div>
                  )}
                  {t.status === "pending" && (
                    <p className="text-yellow text-[10px] mt-2 flex items-center gap-1">
                      <Clock size={9} /> Awaiting Meta approval — cannot be used yet
                    </p>
                  )}
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* ─── OPT-OUTS TAB ─── */}
        {tab === "optouts" && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-text font-bold">WhatsApp Opt-outs</h2>
                <p className="text-textDim text-xs mt-0.5">Users who replied STOP or unsubscribed</p>
              </div>
              <div className="flex gap-2 items-center">
                <div className="w-52">
                  <Input
                    placeholder="Search name or phone..."
                    value={optSearch}
                    onChange={(e) => setOptSearch(e.target.value)}
                  />
                </div>
                <button onClick={loadOptouts} className="text-textMuted hover:text-cyan transition-colors">
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>

            {loadingOptouts ? <Spinner /> : (
              <>
                {filteredOptouts.length === 0 ? (
                  <div className="text-center py-12">
                    <UserX size={32} className="text-textDim mx-auto mb-3" />
                    <p className="text-textMuted font-bold">
                      {optouts.length === 0 ? "No opt-outs recorded" : "No matches found"}
                    </p>
                    <p className="text-textDim text-sm mt-1">
                      {optouts.length === 0
                        ? "Users who reply STOP to your messages will appear here"
                        : "Try a different search"}
                    </p>
                  </div>
                ) : (
                  <Table
                    headers={["User", "Phone", "Opted Out", "Reason", "Action"]}
                    empty={false}>
                    {filteredOptouts.map((o: any) => (
                      <Tr key={o.phone}>
                        <Td className="font-semibold">{o.name || "—"}</Td>
                        <Td className="font-mono text-xs text-textMuted">{o.phone}</Td>
                        <Td className="text-textMuted text-xs whitespace-nowrap">{formatDate(o.opted_out_at)}</Td>
                        <Td>
                          <span className="text-xs text-red font-bold">{o.reason || "STOP reply"}</span>
                        </Td>
                        <Td>
                          <button
                            onClick={() => handleRemoveOptout(o.phone)}
                            disabled={removingOptout === o.phone}
                            title="Re-subscribe this contact"
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-green/30 text-green text-[10px] font-bold hover:bg-green/10 transition-all disabled:opacity-50">
                            <UserCheck size={10} />
                            {removingOptout === o.phone ? "…" : "Re-subscribe"}
                          </button>
                        </Td>
                      </Tr>
                    ))}
                  </Table>
                )}
                <p className="text-textDim text-xs mt-3">{filteredOptouts.length} record{filteredOptouts.length !== 1 ? "s" : ""}</p>
              </>
            )}
          </Card>
        )}

        {/* ─── ANALYTICS TAB ─── */}
        {tab === "analytics" && (() => {
          const statuses: MsgStatus[] = ["read", "delivered", "sent", "pending", "failed"];
          const deliveryData = statuses.map(s => ({
            status: s,
            count: messages.filter(m => m.status === s).length,
          })).filter(d => d.count > 0);

          const deliveryColors: Record<string, string> = {
            read: "#00D4FF", delivered: "#00E676", sent: "#7777AA", pending: "#FFD60A", failed: "#FF3B30",
          };

          // Daily volume (last 14 days)
          const last14: Record<string, number> = {};
          messages.forEach(m => {
            if (!m.sent_at) return;
            const day = m.sent_at.slice(0, 10);
            last14[day] = (last14[day] || 0) + 1;
          });
          const dailyData = Object.entries(last14)
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-14)
            .map(([date, count]) => ({
              date: new Date(date).toLocaleDateString("en-ZA", { month: "short", day: "numeric" }),
              count,
            }));

          return (
            <div className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {statuses.map(s => {
                  const cnt = messages.filter(m => m.status === s).length;
                  const pct = messages.length > 0 ? Math.round(cnt / messages.length * 100) : 0;
                  return (
                    <div key={s} className="bg-bg2 border border-border rounded-xl p-3 text-center">
                      <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest capitalize mb-1">{s}</p>
                      <p className="text-xl font-black" style={{ color: deliveryColors[s] }}>{cnt}</p>
                      <p className="text-textDim text-[10px]">{pct}%</p>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="bg-bg2 border border-border rounded-xl p-5">
                  <p className="text-xs font-bold text-textMuted uppercase tracking-widest mb-4">Delivery Status Breakdown</p>
                  {deliveryData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={deliveryData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                        <XAxis type="number" tick={{ fill: "var(--textDim)", fontSize: 10 }} />
                        <YAxis type="category" dataKey="status" tick={{ fill: "var(--textMuted)", fontSize: 11 }} width={60} />
                        <Tooltip contentStyle={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }} />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]} name="Messages">
                          {deliveryData.map((d, i) => <Cell key={i} fill={deliveryColors[d.status as MsgStatus] ?? "#777"} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-textDim text-sm text-center py-8">No data</p>
                  )}
                </div>

                <div className="bg-bg2 border border-border rounded-xl p-5">
                  <p className="text-xs font-bold text-textMuted uppercase tracking-widest mb-4">Messages Sent — Last 14 Days</p>
                  {dailyData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={dailyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="date" tick={{ fill: "var(--textDim)", fontSize: 9 }} />
                        <YAxis tick={{ fill: "var(--textDim)", fontSize: 9 }} />
                        <Tooltip contentStyle={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }} />
                        <Bar dataKey="count" fill="#00D4FF" radius={[3, 3, 0, 0]} name="Sent" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-textDim text-sm text-center py-8">Load history first to see chart</p>
                  )}
                </div>
              </div>

              <div className="bg-bg2 border border-border rounded-xl p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest">Total Sent</p>
                    <p className="text-2xl font-black text-cyan mt-1">{messages.length}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest">Read Rate</p>
                    <p className={`text-2xl font-black mt-1 ${readRate >= 70 ? "text-green" : readRate >= 40 ? "text-yellow" : "text-red"}`}>{readRate}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest">Opt-out Rate</p>
                    <p className={`text-2xl font-black mt-1 ${optouts.length / Math.max(messages.length, 1) < 0.02 ? "text-green" : "text-yellow"}`}>
                      {messages.length > 0 ? (optouts.length / messages.length * 100).toFixed(1) : "0.0"}%
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      </div>
    </AdminShell>
  );
}
