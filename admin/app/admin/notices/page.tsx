"use client";
import { useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Button, Input } from "@/components/ui";
import { Mail, Send, Users, User, FileText, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

const TARGET_OPTIONS = [
  { value: "ALL", label: "All Users", icon: Users, desc: "Every active app user" },
  { value: "ALL_DRIVERS", label: "All Drivers", icon: Users, desc: "All drivers only" },
  { value: "ALL_PASSENGERS", label: "All Passengers", icon: Users, desc: "All passengers only" },
  { value: "phone", label: "Specific User (by phone)", icon: User, desc: "Send to one user" },
];

const DOC_TYPES = [
  { value: "notice", label: "Notice", desc: "General system notice or announcement" },
  { value: "contract", label: "Contract", desc: "Contract or legal document" },
];

export default function NoticePage() {
  const [targetType, setTargetType] = useState("ALL");
  const [phone, setPhone] = useState("");
  const [lookupResult, setLookupResult] = useState<{ id: string; full_name: string; role: string } | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [docType, setDocType] = useState("notice");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ count: number } | null>(null);

  const handleLookup = async () => {
    if (!phone.trim()) return;
    setLookupLoading(true);
    setLookupError("");
    setLookupResult(null);
    try {
      const r = await fetch(`${BASE}/api/admin/users?search=${encodeURIComponent(phone.trim())}`, {
        headers: authHeaders(),
      });
      const data = await r.json();
      const users = Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data : [];
      const normalised = phone.trim().replace(/^0/, "27").replace(/^\+/, "");
      const match = users.find((u: any) => {
        const p = (u.phone_number || "").replace(/^\+/, "");
        return p === normalised || u.phone_number === phone.trim();
      });
      if (match) {
        setLookupResult({ id: match.id, full_name: match.full_name, role: match.role });
      } else {
        setLookupError("No user found with that phone number.");
      }
    } catch {
      setLookupError("Could not look up user.");
    } finally {
      setLookupLoading(false);
    }
  };

  const handleSend = async () => {
    if (!title.trim() || !description.trim()) {
      toast.error("Title and message are required."); return;
    }
    if (targetType === "phone" && !phone.trim()) {
      toast.error("Enter a phone number."); return;
    }
    const target = targetType === "phone" ? phone.trim() : targetType;
    setSending(true);
    setSent(null);
    try {
      const res = await fetch(`${BASE}/api/admin/documents/send-notice`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ target, document_type: docType, title: title.trim(), description: description.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.detail || "Failed to send notice");
      }
      const data = await res.json();
      setSent({ count: data.sent_to ?? 1 });
      toast.success(`Notice sent to ${data.sent_to ?? 1} user${(data.sent_to ?? 1) !== 1 ? "s" : ""}.`);
      setTitle(""); setDescription("");
    } catch (e: any) {
      toast.error(e?.message || "Failed to send notice.");
    } finally {
      setSending(false);
    }
  };

  const resetSent = () => setSent(null);

  return (
    <AdminShell title="Send Notice" subtitle="Send a document notice or contract to users via their My Documents inbox">
      <div className="max-w-2xl space-y-6">

        {sent ? (
          <Card>
            <div className="flex flex-col items-center py-10 gap-4">
              <div className="w-16 h-16 rounded-full bg-green/10 border border-green/20 flex items-center justify-center">
                <CheckCircle size={36} className="text-green" />
              </div>
              <p className="text-text font-bold text-xl">Notice Sent</p>
              <p className="text-textMuted text-sm">Delivered to {sent.count} user{sent.count !== 1 ? "s" : ""}</p>
              <Button onClick={resetSent}>Send Another</Button>
            </div>
          </Card>
        ) : (
          <>
            {/* Target */}
            <Card>
              <h2 className="text-text font-bold text-sm mb-4 flex items-center gap-2">
                <Users size={16} className="text-cyan" /> Target Audience
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {TARGET_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  const active = targetType === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => { setTargetType(opt.value); setLookupResult(null); setLookupError(""); }}
                      className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                        active
                          ? "border-cyan bg-cyanDim text-cyan"
                          : "border-border bg-bg text-textMuted hover:border-border/80 hover:bg-bg2"
                      }`}>
                      <Icon size={16} className="mt-0.5 shrink-0" />
                      <div>
                        <p className={`font-semibold text-xs ${active ? "text-cyan" : "text-text"}`}>{opt.label}</p>
                        <p className="text-[11px] text-textMuted mt-0.5">{opt.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {targetType === "phone" && (
                <div className="mt-4">
                  <label className="block text-xs font-bold text-textMuted uppercase tracking-wider mb-2">Phone Number</label>
                  <div className="flex gap-3">
                    <Input
                      value={phone}
                      onChange={e => { setPhone(e.target.value); setLookupResult(null); setLookupError(""); }}
                      placeholder="e.g. 0821234567"
                      className="flex-1"
                    />
                    <Button onClick={handleLookup} disabled={!phone.trim() || lookupLoading} variant="secondary">
                      {lookupLoading ? <Loader2 size={12} className="animate-spin" /> : "Look up"}
                    </Button>
                  </div>
                  {lookupError && (
                    <p className="mt-2 text-xs text-red flex items-center gap-1">
                      <AlertCircle size={12} /> {lookupError}
                    </p>
                  )}
                  {lookupResult && (
                    <div className="mt-3 flex items-center gap-3 p-3 rounded-lg bg-green/10 border border-green/20">
                      <CheckCircle size={16} className="text-green shrink-0" />
                      <div>
                        <p className="text-text font-semibold text-sm">{lookupResult.full_name}</p>
                        <p className="text-textMuted text-xs capitalize">{lookupResult.role}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* Document type */}
            <Card>
              <h2 className="text-text font-bold text-sm mb-4 flex items-center gap-2">
                <FileText size={16} className="text-cyan" /> Document Type
              </h2>
              <div className="flex gap-3">
                {DOC_TYPES.map(dt => {
                  const active = docType === dt.value;
                  return (
                    <button
                      key={dt.value}
                      onClick={() => setDocType(dt.value)}
                      className={`flex-1 p-3 rounded-xl border text-left transition-all ${
                        active ? "border-cyan bg-cyanDim" : "border-border bg-bg hover:bg-bg2"
                      }`}>
                      <p className={`font-semibold text-xs ${active ? "text-cyan" : "text-text"}`}>{dt.label}</p>
                      <p className="text-[11px] text-textMuted mt-0.5">{dt.desc}</p>
                    </button>
                  );
                })}
              </div>
            </Card>

            {/* Content */}
            <Card>
              <h2 className="text-text font-bold text-sm mb-4 flex items-center gap-2">
                <Mail size={16} className="text-cyan" /> Message Content
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-textMuted uppercase tracking-wider mb-2">Title</label>
                  <Input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. Important Account Update"
                    maxLength={200}
                  />
                  <p className="text-[11px] text-textDim mt-1 text-right">{title.length}/200</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-textMuted uppercase tracking-wider mb-2">Message</label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Write the notice or contract message here..."
                    maxLength={1000}
                    rows={5}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-sm text-text placeholder:text-textDim focus:outline-none focus:border-cyan transition-colors resize-none"
                  />
                  <p className="text-[11px] text-textDim mt-1 text-right">{description.length}/1000</p>
                </div>
              </div>
            </Card>

            {/* Preview */}
            {title.trim() && description.trim() && (
              <Card>
                <h2 className="text-text font-bold text-sm mb-4">Preview</h2>
                <div className="bg-bg rounded-xl border border-border p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Mail size={16} className="text-cyan" />
                    <span className="text-text font-semibold text-sm">{title}</span>
                    <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-textMuted bg-bg2 border border-border px-2 py-0.5 rounded-full">
                      {docType}
                    </span>
                  </div>
                  <p className="text-textMuted text-xs leading-relaxed pl-6">{description}</p>
                  <p className="text-textDim text-[11px] pl-6">
                    → {TARGET_OPTIONS.find(t => t.value === targetType)?.label}
                    {targetType === "phone" && lookupResult ? ` · ${lookupResult.full_name}` : ""}
                  </p>
                </div>
              </Card>
            )}

            {/* Send */}
            <div className="flex justify-end gap-3">
              <Button
                onClick={handleSend}
                disabled={sending || !title.trim() || !description.trim()}
                className="flex items-center gap-2">
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={16} />}
                {sending ? "Sending..." : "Send Notice"}
              </Button>
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}
