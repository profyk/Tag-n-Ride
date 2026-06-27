"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Spinner, Modal, Button } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import {
  Search, Send, CheckCheck, Check, Clock, MessageCircle,
  Phone, User, RefreshCw, ChevronDown, MoreVertical,
  CheckCircle, XCircle, AlertCircle, Paperclip, Smile,
  ExternalLink, Archive, Ban, Tag, StickyNote, AlertTriangle,
  CheckSquare,
} from "lucide-react";
import toast from "react-hot-toast";

const BASE = "https://tag-n-ride-production.up.railway.app";
const SUPPORT_NUMBER = "0832789333";
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

type ConvStatus = "open" | "pending" | "resolved";
type MsgDir = "inbound" | "outbound";

interface Conversation {
  id: string;
  contact_name: string | null;
  phone: string;
  last_message: string;
  last_message_at: string;
  status: ConvStatus;
  unread_count: number;
  user_id: string | null;
  assigned_to: string | null;
}

interface Message {
  id: string;
  direction: MsgDir;
  body: string;
  sent_at: string;
  status: "sent" | "delivered" | "read" | "failed";
  agent_name?: string;
}

const QUICK_REPLIES = [
  { label: "Greeting", text: "Hi! Thank you for contacting Tag-n-Ride support. How can I help you today? 😊" },
  { label: "Hold on", text: "I'm looking into this for you right now, please hold on." },
  { label: "Ask phone", text: "Could you please confirm your registered phone number so I can pull up your account?" },
  { label: "Withdrawal", text: "Your withdrawal has been processed and should reflect within 1–2 business days." },
  { label: "Resolved?", text: "Your issue has been resolved. Is there anything else I can help you with?" },
  { label: "Update app", text: "Please update your Tag-n-Ride app to the latest version and try again." },
  { label: "KYC", text: "To verify your account, please submit your driver's licence in the app under Profile → Verification." },
  { label: "Closing", text: "Thank you for reaching out! We've resolved your query. Have a great day! 🚗" },
];

const STATUS_CONFIG: Record<ConvStatus, { label: string; icon: any }> = {
  open:     { label: "Open",     icon: MessageCircle },
  pending:  { label: "Pending",  icon: Clock },
  resolved: { label: "Resolved", icon: CheckCircle },
};

const STATUS_CLS: Record<ConvStatus, string> = {
  open:     "bg-green/10 border-green/20 text-green",
  pending:  "bg-yellow/10 border-yellow/20 text-yellow",
  resolved: "bg-bg3 border-border text-textMuted",
};

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return formatDate(iso);
}

function initials(name: string | null, phone: string) {
  if (name) return name.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
  return phone.slice(-2);
}

function MsgTick({ status }: { status: Message["status"] }) {
  if (status === "read")      return <CheckCheck size={12} className="text-[#53BDEB]" />;
  if (status === "delivered") return <CheckCheck size={12} className="text-white/50" />;
  if (status === "failed")    return <XCircle size={12} className="text-red" />;
  return <Check size={12} className="text-white/50" />;
}

export default function WhatsAppSupportPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ConvStatus | "all">("open");
  const [search, setSearch] = useState("");
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [internalNote, setInternalNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [internalNotes, setInternalNotes] = useState<Record<string, { text: string; by: string; at: string }[]>>({});
  const [showNotes, setShowNotes] = useState(false);
  const [blockingPhone, setBlockingPhone] = useState<string | null>(null);
  const [blockConfirmPhone, setBlockConfirmPhone] = useState<string | null>(null);
  const [bulkResolving, setBulkResolving] = useState(false);
  const [bulkResolveConfirm, setBulkResolveConfirm] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedConv = conversations.find(c => c.id === selectedId) ?? null;

  const loadConversations = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/admin/whatsapp/support/conversations`, { headers: authHeaders() });
      if (!r.ok) { setLoadingConvs(false); return; }
      const d = await r.json();
      setConversations(Array.isArray(d) ? d : (d.conversations || []));
    } catch { /* API unavailable */ }
    finally { setLoadingConvs(false); }
  }, []);

  const loadMessages = useCallback(async (convId: string) => {
    setLoadingMsgs(true);
    try {
      const r = await fetch(`${BASE}/api/admin/whatsapp/support/conversations/${convId}/messages`, { headers: authHeaders() });
      const d = await r.json();
      setMessages(Array.isArray(d) ? d : (d.messages || []));
    } catch { setMessages([]); }
    finally { setLoadingMsgs(false); }
  }, []);

  useEffect(() => { loadConversations(); }, []);

  useEffect(() => {
    if (!selectedId) return;
    loadMessages(selectedId);
    // Load persisted internal notes
    fetch(`${BASE}/api/admin/whatsapp/support/conversations/${selectedId}/notes`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => {
        const items: any[] = Array.isArray(d) ? d : (d.notes || []);
        setInternalNotes(prev => ({
          ...prev,
          [selectedId]: items.map(n => ({ text: n.note || n.text || "", by: n.admin_name || n.by || "Admin", at: n.created_at || n.at || new Date().toISOString() })),
        }));
      })
      .catch(() => {});
    // Mark as read when opened
    fetch(`${BASE}/api/admin/whatsapp/support/conversations/${selectedId}/read`, {
      method: "POST", headers: authHeaders(),
    }).catch(() => {});
    // Mark unread_count = 0 locally
    setConversations(prev => prev.map(c => c.id === selectedId ? { ...c, unread_count: 0 } : c));
    // Poll for new messages every 15s
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => loadMessages(selectedId), 15000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [selectedId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!replyText.trim() || !selectedId) return;
    const text = replyText.trim();
    setSending(true);
    // Optimistic insert
    const optimistic: Message = {
      id: `opt-${Date.now()}`,
      direction: "outbound",
      body: text,
      sent_at: new Date().toISOString(),
      status: "sent",
      agent_name: "You",
    };
    setMessages(prev => [...prev, optimistic]);
    setReplyText("");
    setShowQuickReplies(false);
    try {
      await fetch(`${BASE}/api/admin/whatsapp/support/conversations/${selectedId}/reply`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ message: text }),
      });
      // Update last message in conv list
      setConversations(prev => prev.map(c =>
        c.id === selectedId ? { ...c, last_message: text, last_message_at: new Date().toISOString() } : c
      ));
      // Reload to get real message id + status
      setTimeout(() => loadMessages(selectedId), 1500);
    } catch (e: any) {
      toast.error(e.message || "Failed to send");
      setMessages(prev => prev.map(m => m.id === optimistic.id ? { ...m, status: "failed" } : m));
    } finally {
      setSending(false);
      replyRef.current?.focus();
    }
  };

  const handleStatusChange = async (status: ConvStatus) => {
    if (!selectedId) return;
    setUpdatingStatus(true);
    try {
      await fetch(`${BASE}/api/admin/whatsapp/support/conversations/${selectedId}/status`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ status }),
      });
      setConversations(prev => prev.map(c => c.id === selectedId ? { ...c, status } : c));
      toast.success(`Conversation marked as ${status}`);
    } catch { toast.error("Failed to update status"); }
    finally { setUpdatingStatus(false); }
  };

  const handleSaveNote = async () => {
    if (!selectedId || !internalNote.trim()) return;
    setSavingNote(true);
    const noteText = internalNote.trim();
    try {
      const r = await fetch(`${BASE}/api/admin/whatsapp/support/conversations/${selectedId}/notes`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ note: noteText }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || "Failed to save");
      const note = { text: noteText, by: "Admin", at: new Date().toISOString() };
      setInternalNotes(prev => ({
        ...prev,
        [selectedId]: [...(prev[selectedId] ?? []), note],
      }));
      setInternalNote("");
      toast.success("Internal note saved");
    } catch (e: any) { toast.error(e.message || "Could not save note"); }
    finally { setSavingNote(false); }
  };

  const handleBlockContact = (phone: string) => { setBlockConfirmPhone(phone); };
  const doBlockContact = async () => {
    if (!blockConfirmPhone) return;
    const phone = blockConfirmPhone; setBlockConfirmPhone(null);
    setBlockingPhone(phone);
    try {
      const res = await fetch(`${BASE}/api/admin/whatsapp/support/block`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "Block failed");
      toast.success(`${phone} blocked from support`);
      setConversations(prev => prev.filter(c => c.phone !== phone));
      setSelectedId(null);
    } catch (e: any) { toast.error(e.message); }
    finally { setBlockingPhone(null); }
  };

  const handleBulkResolve = () => {
    const open = conversations.filter(c => c.status === "open" || c.status === "pending");
    if (!open.length) { toast.error("No open conversations to resolve"); return; }
    setBulkResolveConfirm(true);
  };

  const doBulkResolve = async () => {
    const open = conversations.filter(c => c.status === "open" || c.status === "pending");
    setBulkResolveConfirm(false);
    setBulkResolving(true);
    let done = 0;
    for (const c of open) {
      try {
        await fetch(`${BASE}/api/admin/whatsapp/support/conversations/${c.id}/status`, {
          method: "PATCH", headers: authHeaders(),
          body: JSON.stringify({ status: "resolved" }),
        });
        done++;
      } catch {}
    }
    setBulkResolving(false);
    toast.success(`${done} conversations resolved`);
    loadConversations();
    setSelectedId(null);
  };

  // SLA: minutes since last inbound message
  const slaMinutes = (conv: Conversation | null): number | null => {
    if (!conv) return null;
    const lastInbound = messages.filter(m => m.direction === "inbound").slice(-1)[0];
    if (!lastInbound) return null;
    return Math.floor((Date.now() - new Date(lastInbound.sent_at).getTime()) / 60000);
  };

  const filteredConvs = conversations.filter(c =>
    (statusFilter === "all" || c.status === statusFilter) &&
    (!search ||
      c.contact_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search))
  );

  const counts: Record<string, number> = {
    all: conversations.length,
    open: conversations.filter(c => c.status === "open").length,
    pending: conversations.filter(c => c.status === "pending").length,
    resolved: conversations.filter(c => c.status === "resolved").length,
  };

  const totalUnread = conversations.reduce((s, c) => s + c.unread_count, 0);

  return (
    <AdminShell title={`WhatsApp Support${totalUnread > 0 ? ` (${totalUnread})` : ""}`}>
      {/* Full-height split pane */}
      <div className="flex border border-border rounded-xl overflow-hidden" style={{ height: "calc(100vh - 140px)" }}>

        {/* ─── LEFT: Conversation List ─── */}
        <div className="w-80 flex-shrink-0 flex flex-col border-r border-border bg-bg2">

          {/* Support number banner */}
          <div className="px-3 py-2.5 border-b border-border bg-bg3 flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-green/20 flex items-center justify-center flex-shrink-0">
              <MessageCircle size={12} className="text-green" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-text font-bold text-xs">Support Inbox</p>
              <p className="text-textDim text-[9px] font-mono">{SUPPORT_NUMBER}</p>
            </div>
            <button
              title="Bulk resolve all open"
              onClick={handleBulkResolve}
              disabled={bulkResolving}
              className="p-1 text-textDim hover:text-green transition-colors">
              {bulkResolving ? <RefreshCw size={12} className="animate-spin" /> : <CheckSquare size={12} />}
            </button>
            <button onClick={loadConversations} className="text-textDim hover:text-cyan transition-colors p-1">
              <RefreshCw size={13} />
            </button>
          </div>

          {/* Search */}
          <div className="px-3 py-2 border-b border-border">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-textDim" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search conversations..."
                className="w-full bg-bg border border-border rounded-lg pl-7 pr-3 py-1.5 text-text text-xs focus:outline-none focus:border-cyan placeholder:text-textDim"
              />
            </div>
          </div>

          {/* Status filter tabs */}
          <div className="flex border-b border-border">
            {(["open", "pending", "resolved", "all"] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`flex-1 py-2 text-[10px] font-bold capitalize transition-all relative ${
                  statusFilter === s ? "text-cyan border-b-2 border-cyan -mb-px" : "text-textDim hover:text-textMuted"
                }`}>
                {s}
                {counts[s] > 0 && (
                  <span className={`ml-1 px-1 py-0.5 rounded text-[9px] font-black ${
                    s === "open" && counts[s] > 0 ? "bg-green/20 text-green" :
                    s === "pending" ? "bg-yellow/20 text-yellow" : "bg-bg3 text-textDim"
                  }`}>{counts[s]}</span>
                )}
              </button>
            ))}
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            {loadingConvs ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : filteredConvs.length === 0 ? (
              <div className="text-center py-12 px-4">
                <MessageCircle size={28} className="text-textDim mx-auto mb-2" />
                <p className="text-textMuted text-xs font-bold">No conversations</p>
                <p className="text-textDim text-[10px] mt-1">
                  {statusFilter === "open" ? "All caught up!" : `No ${statusFilter} conversations`}
                </p>
              </div>
            ) : filteredConvs.map(conv => (
              <button
                key={conv.id}
                onClick={() => setSelectedId(conv.id)}
                className={`w-full flex items-start gap-3 px-3 py-3 border-b border-border/50 transition-all text-left hover:bg-bg3 ${
                  selectedId === conv.id ? "bg-cyanDim border-l-2 border-l-cyan" : ""
                }`}>
                {/* Avatar */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black ${
                  conv.status === "open" ? "bg-green/20 text-green" :
                  conv.status === "pending" ? "bg-yellow/20 text-yellow" :
                  "bg-bg3 text-textDim"
                }`}>
                  {initials(conv.contact_name, conv.phone)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className={`text-xs font-bold truncate ${conv.unread_count > 0 ? "text-text" : "text-textMuted"}`}>
                      {conv.contact_name || conv.phone}
                    </p>
                    <span className="text-[9px] text-textDim flex-shrink-0 ml-1">{timeAgo(conv.last_message_at)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className={`text-[10px] truncate ${conv.unread_count > 0 ? "text-textMuted" : "text-textDim"}`}>
                      {conv.last_message}
                    </p>
                    {conv.unread_count > 0 && (
                      <span className="ml-1 min-w-[18px] h-[18px] rounded-full bg-green text-bg text-[9px] font-black flex items-center justify-center flex-shrink-0">
                        {conv.unread_count > 9 ? "9+" : conv.unread_count}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {conv.status !== "open" && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold ${STATUS_CLS[conv.status]}`}>{conv.status}</span>
                    )}
                    {conv.status === "open" && (() => {
                      const mins = Math.floor((Date.now() - new Date(conv.last_message_at).getTime()) / 60000);
                      if (mins > 60) return <span className="text-[9px] font-bold text-red">{Math.floor(mins/60)}h SLA</span>;
                      if (mins > 30) return <span className="text-[9px] font-bold text-yellow">{mins}m</span>;
                      return null;
                    })()}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ─── RIGHT: Chat Thread ─── */}
        {!selectedId ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-bg text-center px-8">
            <div className="w-20 h-20 rounded-full bg-bg2 border border-border flex items-center justify-center mb-4">
              <MessageCircle size={32} className="text-textDim" />
            </div>
            <p className="text-text font-bold text-lg mb-1">WhatsApp Support Inbox</p>
            <p className="text-textMuted text-sm mb-1">Select a conversation to start replying</p>
            <p className="text-textDim text-xs font-mono">{SUPPORT_NUMBER}</p>
            {totalUnread > 0 && (
              <div className="mt-4 px-4 py-2 bg-green/10 border border-green/20 rounded-xl">
                <p className="text-green text-sm font-bold">{totalUnread} unread message{totalUnread !== 1 ? "s" : ""}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col bg-bg min-w-0">

            {/* Thread header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-bg2 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0 ${
                  selectedConv?.status === "open" ? "bg-green/20 text-green" : "bg-bg3 text-textDim"
                }`}>
                  {initials(selectedConv?.contact_name ?? null, selectedConv?.phone ?? "")}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-text font-bold text-sm">
                      {selectedConv?.contact_name || selectedConv?.phone}
                    </p>
                    {selectedConv?.status && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold ${STATUS_CLS[selectedConv.status]}`}>{selectedConv.status}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <p className="text-textDim text-[10px] font-mono">{selectedConv?.phone}</p>
                    {(() => {
                      const sla = slaMinutes(selectedConv);
                      if (sla === null) return null;
                      const color = sla > 60 ? "text-red" : sla > 30 ? "text-yellow" : "text-green";
                      const label = sla > 60 ? `${Math.floor(sla/60)}h ${sla%60}m waiting` : `${sla}m waiting`;
                      return <span className={`text-[9px] font-bold ${color} flex items-center gap-0.5`}><Clock size={8} /> {label}</span>;
                    })()}
                    {selectedId && internalNotes[selectedId]?.length > 0 && (
                      <span className="text-[9px] text-yellow font-bold">{internalNotes[selectedId].length} note{internalNotes[selectedId].length > 1 ? "s" : ""}</span>
                    )}
                    {selectedConv?.user_id && (
                      <Link
                        href={`/admin/support?q=${selectedConv.phone}`}
                        className="flex items-center gap-0.5 text-[10px] text-cyan hover:underline"
                        target="_blank">
                        <ExternalLink size={9} /> View account
                      </Link>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                {selectedConv?.status !== "resolved" && (
                  <button
                    onClick={() => handleStatusChange("resolved")}
                    disabled={updatingStatus}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green/10 border border-green/20 text-green text-xs font-bold rounded-lg hover:bg-green/20 transition-colors disabled:opacity-50">
                    <CheckCircle size={12} /> Resolve
                  </button>
                )}
                {selectedConv?.status === "resolved" && (
                  <button
                    onClick={() => handleStatusChange("open")}
                    disabled={updatingStatus}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan/10 border border-cyan/20 text-cyan text-xs font-bold rounded-lg hover:bg-cyan/20 transition-colors disabled:opacity-50">
                    <MessageCircle size={12} /> Reopen
                  </button>
                )}
                {selectedConv?.status === "open" && (
                  <button
                    onClick={() => handleStatusChange("pending")}
                    disabled={updatingStatus}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow/10 border border-yellow/20 text-yellow text-xs font-bold rounded-lg hover:bg-yellow/20 transition-colors disabled:opacity-50">
                    <Clock size={12} /> Pending
                  </button>
                )}
                <button
                  onClick={() => setShowNotes(v => !v)}
                  title="Internal notes"
                  className={`text-textDim hover:text-yellow p-1.5 rounded-lg hover:bg-bg3 transition-colors ${showNotes ? "text-yellow bg-yellow/10" : ""}`}>
                  <StickyNote size={14} />
                  {selectedId && internalNotes[selectedId]?.length > 0 && (
                    <span className="sr-only">{internalNotes[selectedId].length} notes</span>
                  )}
                </button>
                <button
                  onClick={() => selectedConv && handleBlockContact(selectedConv.phone)}
                  disabled={blockingPhone === selectedConv?.phone}
                  title="Block this contact"
                  className="text-textDim hover:text-red p-1.5 rounded-lg hover:bg-bg3 transition-colors">
                  <Ban size={14} />
                </button>
                <button
                  onClick={() => loadMessages(selectedId)}
                  className="text-textDim hover:text-cyan transition-colors p-1.5 rounded-lg hover:bg-bg3">
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>

            {/* Messages area */}
            <div
              className="flex-1 overflow-y-auto px-4 py-4 space-y-2"
              style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #1a1a2e 1px, transparent 0)", backgroundSize: "20px 20px" }}>

              {loadingMsgs ? (
                <div className="flex justify-center py-12"><Spinner /></div>
              ) : messages.length === 0 ? (
                <div className="text-center py-12">
                  <MessageCircle size={24} className="text-textDim mx-auto mb-2" />
                  <p className="text-textMuted text-sm">No messages yet</p>
                </div>
              ) : (
                <>
                  {/* Date separator at top */}
                  <div className="flex items-center justify-center my-2">
                    <div className="px-3 py-1 bg-bg3 border border-border rounded-full text-[10px] text-textDim">
                      Conversation started
                    </div>
                  </div>

                  {messages.map((msg, i) => {
                    const isOut = msg.direction === "outbound";
                    const prevMsg = messages[i - 1];
                    const showDateSep = prevMsg &&
                      new Date(msg.sent_at).toDateString() !== new Date(prevMsg.sent_at).toDateString();

                    return (
                      <div key={msg.id}>
                        {showDateSep && (
                          <div className="flex items-center justify-center my-3">
                            <div className="px-3 py-1 bg-bg3 border border-border rounded-full text-[10px] text-textDim">
                              {new Date(msg.sent_at).toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" })}
                            </div>
                          </div>
                        )}
                        <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[70%] group relative`}>
                            {/* Agent name for outbound */}
                            {isOut && msg.agent_name && (
                              <p className="text-[9px] text-textDim text-right mb-0.5 mr-1">{msg.agent_name}</p>
                            )}
                            <div className={`px-3 py-2 rounded-2xl shadow-sm ${
                              isOut
                                ? "bg-[#1F5C35] text-white rounded-tr-sm"
                                : "bg-bg2 border border-border text-text rounded-tl-sm"
                            }`}>
                              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.body}</p>
                              <div className={`flex items-center gap-1 mt-1 ${isOut ? "justify-end" : "justify-start"}`}>
                                <span className={`text-[10px] ${isOut ? "text-white/50" : "text-textDim"}`}>
                                  {new Date(msg.sent_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                                </span>
                                {isOut && <MsgTick status={msg.status} />}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Quick replies panel */}
            {showQuickReplies && (
              <div className="border-t border-border bg-bg2 px-3 py-2 flex-shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest">Quick Replies</p>
                  <button onClick={() => setShowQuickReplies(false)} className="text-textDim hover:text-text transition-colors">
                    <ChevronDown size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
                  {QUICK_REPLIES.map((r) => (
                    <button
                      key={r.label}
                      onClick={() => { setReplyText(r.text); setShowQuickReplies(false); replyRef.current?.focus(); }}
                      className="text-left px-3 py-2 bg-bg border border-border rounded-lg text-xs hover:border-cyan/30 hover:text-cyan transition-all">
                      <p className="font-bold text-textMuted text-[10px] mb-0.5">{r.label}</p>
                      <p className="text-textDim truncate">{r.text}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Internal notes panel */}
            {showNotes && selectedId && (
              <div className="border-t border-yellow/20 bg-yellow/5 px-3 py-3 flex-shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold text-yellow uppercase tracking-widest flex items-center gap-1.5">
                    <StickyNote size={10} /> Internal Notes (not visible to customer)
                  </p>
                  <button onClick={() => setShowNotes(false)} className="text-textDim hover:text-text"><XCircle size={12} /></button>
                </div>
                {(internalNotes[selectedId] ?? []).map((n, i) => (
                  <div key={i} className="mb-1.5 px-2.5 py-1.5 bg-yellow/10 border border-yellow/20 rounded-lg text-xs">
                    <p className="text-text">{n.text}</p>
                    <p className="text-textDim text-[9px] mt-0.5">{n.by} · {new Date(n.at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                ))}
                <div className="flex gap-2 mt-2">
                  <input
                    value={internalNote}
                    onChange={e => setInternalNote(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleSaveNote(); } }}
                    placeholder="Add internal note..."
                    className="flex-1 bg-bg border border-yellow/30 rounded-lg px-3 py-1.5 text-text text-xs focus:outline-none focus:border-yellow"
                  />
                  <button onClick={handleSaveNote} disabled={!internalNote.trim() || savingNote}
                    className="px-3 py-1.5 bg-yellow text-bg rounded-lg text-xs font-bold disabled:opacity-50 hover:bg-yellow/90 transition-colors">
                    Save
                  </button>
                </div>
              </div>
            )}

            {/* Resolved notice */}
            {selectedConv?.status === "resolved" && (
              <div className="flex items-center gap-2 px-4 py-2 bg-bg3 border-t border-border flex-shrink-0">
                <Archive size={12} className="text-textDim" />
                <p className="text-textDim text-xs">This conversation is resolved. Reply to reopen it.</p>
              </div>
            )}

            {/* Reply input */}
            <div className="flex-shrink-0 border-t border-border bg-bg2 px-3 py-3">
              <div className="flex items-end gap-2">
                <button
                  onClick={() => setShowQuickReplies(v => !v)}
                  title="Quick replies"
                  className={`p-2 rounded-lg transition-colors flex-shrink-0 mb-0.5 ${
                    showQuickReplies ? "bg-cyanDim text-cyan" : "text-textDim hover:text-cyan hover:bg-bg3"
                  }`}>
                  <Smile size={16} />
                </button>
                <div className="flex-1 relative">
                  <textarea
                    ref={replyRef}
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
                    }}
                    placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
                    rows={1}
                    style={{ resize: "none" }}
                    className="w-full bg-bg border border-border rounded-2xl px-4 py-2.5 text-text text-sm placeholder:text-textDim focus:outline-none focus:border-cyan transition-colors"
                    onInput={e => {
                      const el = e.currentTarget;
                      el.style.height = "auto";
                      el.style.height = Math.min(el.scrollHeight, 120) + "px";
                    }}
                  />
                </div>
                <button
                  onClick={handleSend}
                  disabled={!replyText.trim() || sending}
                  className="w-10 h-10 rounded-full bg-green flex items-center justify-center flex-shrink-0 hover:bg-green/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed mb-0.5">
                  {sending
                    ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <Send size={15} className="text-white" />}
                </button>
              </div>
              <p className="text-[9px] text-textDim mt-1.5 px-2">
                Sending from {SUPPORT_NUMBER} · Enter to send · Shift+Enter for new line
              </p>
            </div>
          </div>
        )}
      </div>
      {/* Block Contact Confirmation Modal */}
      <Modal open={!!blockConfirmPhone} onClose={() => setBlockConfirmPhone(null)} title="Block Contact">
        <div className="space-y-4">
          <p className="text-textMuted text-sm">
            Block <span className="text-text font-bold font-mono">{blockConfirmPhone}</span> from WhatsApp support?
            They will be unable to send messages to the support number.
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setBlockConfirmPhone(null)}>Cancel</Button>
            <Button variant="danger" onClick={doBlockContact} loading={blockingPhone === blockConfirmPhone}>
              <Ban size={12} /> Block Contact
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk Resolve Confirmation Modal */}
      <Modal open={bulkResolveConfirm} onClose={() => setBulkResolveConfirm(false)} title="Resolve All Conversations">
        <div className="space-y-4">
          <p className="text-textMuted text-sm">
            Mark <span className="text-cyan font-bold">
              {conversations.filter(c => c.status === "open" || c.status === "pending").length}
            </span> open conversations as resolved?
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setBulkResolveConfirm(false)}>Cancel</Button>
            <Button onClick={doBulkResolve} loading={bulkResolving}>
              <CheckSquare size={12} /> Resolve All
            </Button>
          </div>
        </div>
      </Modal>

    </AdminShell>
  );
}
