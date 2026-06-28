"use client";
import { useState, useEffect, useCallback } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Spinner } from "@/components/ui";
import client, { hasPermission } from "@/lib/api";
import { CheckCircle, XCircle, RefreshCw, User, Phone } from "lucide-react";
import toast from "react-hot-toast";

type ResetRequest = {
  id: string;
  user_id: string;
  user_name: string;
  user_phone: string;
  user_role: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  admin_name?: string;
  admin_reason?: string;
  created_at: string;
  updated_at: string;
};

const STATUS_BADGE: Record<string, string> = {
  pending:  "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  approved: "bg-green/10 text-green border-green/20",
  rejected: "bg-red/10 text-red border-red/20",
};

export default function DeadManResetsPage() {
  const canAct = hasPermission("approve_deadman_reset");
  const [requests, setRequests] = useState<ResetRequest[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [acting, setActing]     = useState<string | null>(null);

  // Review modal
  const [reviewTarget, setReviewTarget] = useState<ResetRequest | null>(null);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject" | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.get<ResetRequest[]>(
        filter === "all"
          ? "/api/admin/deadman-reset-requests"
          : `/api/admin/deadman-reset-requests?status=${filter}`
      );
      setRequests(res.data);
    } catch {
      toast.error("Failed to load requests");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const openReview = (req: ResetRequest, action: "approve" | "reject") => {
    setReviewTarget(req);
    setReviewAction(action);
    setReviewReason("");
  };

  const submitReview = async () => {
    if (!reviewTarget || !reviewAction) return;
    if (reviewReason.trim().length < 10) {
      toast.error("Please provide a detailed reason (at least 10 characters).");
      return;
    }
    setReviewSubmitting(true);
    try {
      await client.post(`/api/admin/deadman-reset-requests/${reviewTarget.id}/${reviewAction}`, {
        reason: reviewReason.trim(),
      });
      toast.success(`Request ${reviewAction === "approve" ? "approved" : "rejected"} — CEO/Superadmin notified.`);
      setReviewTarget(null);
      setReviewAction(null);
      setReviewReason("");
      load();
    } catch (e: any) {
      toast.error(e.message || "Action failed");
    } finally {
      setReviewSubmitting(false);
    }
  };

  const pending = requests.filter(r => r.status === "pending").length;

  return (
    <AdminShell title="Dead Man Code Resets" subtitle="User-submitted requests to clear their dead man code">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          {pending > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-yellow-500/10 text-yellow-400 text-xs font-bold border border-yellow-500/20">
              {pending} pending
            </span>
          )}
          <button onClick={load} className="p-2 rounded-lg border border-border hover:border-cyan text-textMuted hover:text-cyan transition-colors">
            <RefreshCw size={14} />
          </button>
        </div>

        {/* Security notice */}
        <div className="p-4 rounded-xl bg-red/5 border border-red/20">
          <p className="text-red text-xs font-bold mb-1">⚠ HIGH-SENSITIVITY ACTIONS</p>
          <p className="text-textMuted text-xs leading-relaxed">
            The dead man code is a covert safety feature. Resetting it changes a user's emergency duress behaviour.
            Every approval or rejection is logged to the audit trail and reported to the CEO and Superadmin automatically.
            You <span className="text-text font-bold">must</span> provide a valid reason for every decision.
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2">
          {(["pending", "approved", "rejected", "all"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                filter === f
                  ? "bg-cyan/10 text-cyan border-cyan/30"
                  : "text-textMuted border-border hover:border-cyan/30 hover:text-cyan"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : requests.length === 0 ? (
          <div className="text-center py-12 text-textMuted text-sm">No {filter !== "all" ? filter : ""} requests</div>
        ) : (
          <div className="space-y-3">
            {requests.map(req => (
              <div key={req.id} className="rounded-xl border border-border bg-bg2 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    {/* User info */}
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-cyanDim border border-cyan/20 flex items-center justify-center">
                        <User size={14} className="text-cyan" />
                      </div>
                      <div>
                        <p className="text-text font-bold text-sm">{req.user_name || "Unknown"}</p>
                        <div className="flex items-center gap-1.5 text-xs text-textMuted">
                          <Phone size={10} />
                          <span>{req.user_phone || "—"}</span>
                          <span className="text-border">·</span>
                          <span className="uppercase font-semibold">{req.user_role}</span>
                        </div>
                      </div>
                      <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_BADGE[req.status]}`}>
                        {req.status}
                      </span>
                    </div>

                    {/* User's reason */}
                    <div className="bg-bg rounded-lg p-3 border border-border">
                      <p className="text-[10px] text-textMuted font-bold mb-1 uppercase tracking-wide">User's reason</p>
                      <p className="text-text text-sm leading-relaxed">{req.reason}</p>
                    </div>

                    {/* Admin decision (if actioned) */}
                    {req.admin_reason && (
                      <div className={`rounded-lg p-3 border ${req.status === "approved" ? "bg-green/5 border-green/20" : "bg-red/5 border-red/20"}`}>
                        <p className={`text-[10px] font-bold mb-1 uppercase tracking-wide ${req.status === "approved" ? "text-green" : "text-red"}`}>
                          Admin {req.status === "approved" ? "approval" : "rejection"} reason
                        </p>
                        <p className="text-textMuted text-xs leading-relaxed">{req.admin_reason}</p>
                        {req.admin_name && <p className="text-textDim text-[10px] mt-1">— {req.admin_name}</p>}
                      </div>
                    )}

                    <p className="text-[10px] text-textDim">
                      Submitted: {new Date(req.created_at).toLocaleString()}
                      {req.status !== "pending" && ` · Actioned: ${new Date(req.updated_at).toLocaleString()}`}
                    </p>
                  </div>
                </div>

                {/* Action buttons */}
                {req.status === "pending" && canAct && (
                  <div className="flex gap-2 mt-4 pt-4 border-t border-border">
                    <button
                      onClick={() => openReview(req, "approve")}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-green/10 border border-green/20 text-green text-xs font-bold hover:bg-green/20 transition-colors"
                    >
                      <CheckCircle size={14} />
                      Approve & Clear Code
                    </button>
                    <button
                      onClick={() => openReview(req, "reject")}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-red/10 border border-red/20 text-red text-xs font-bold hover:bg-red/20 transition-colors"
                    >
                      <XCircle size={14} />
                      Reject Request
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Review modal */}
      {reviewTarget && reviewAction && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-bg2 rounded-2xl border border-border w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center gap-3">
              {reviewAction === "approve"
                ? <CheckCircle size={20} className="text-green" />
                : <XCircle size={20} className="text-red" />}
              <h2 className="text-text font-black text-lg">
                {reviewAction === "approve" ? "Approve Reset Request" : "Reject Reset Request"}
              </h2>
            </div>

            {reviewAction === "approve" && (
              <div className="p-3 rounded-lg bg-green/5 border border-green/20 text-xs text-green leading-relaxed">
                Approving will <strong>clear the user's dead man code</strong> immediately. They will be able to set a new one.
                This action and your reason will be reported to the CEO and Superadmin.
              </div>
            )}

            <div>
              <p className="text-xs text-textMuted font-bold mb-2 uppercase tracking-wide">
                {reviewAction === "approve" ? "Reason for approval *" : "Reason for rejection *"}
              </p>
              <textarea
                className="w-full bg-bg border border-border rounded-xl p-3 text-text text-sm placeholder:text-textMuted resize-none focus:outline-none focus:border-cyan"
                rows={4}
                maxLength={500}
                placeholder={
                  reviewAction === "approve"
                    ? "e.g. User identity verified via support call, legitimate reason confirmed..."
                    : "e.g. Insufficient justification, possible social engineering attempt..."
                }
                value={reviewReason}
                onChange={e => setReviewReason(e.target.value)}
              />
              <p className="text-textDim text-[10px] text-right mt-1">{reviewReason.length}/500</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setReviewTarget(null); setReviewAction(null); }}
                className="flex-1 py-2.5 rounded-xl border border-border text-textMuted text-sm font-bold hover:border-cyan hover:text-cyan transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitReview}
                disabled={reviewSubmitting}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                  reviewAction === "approve"
                    ? "bg-green/10 border border-green/20 text-green hover:bg-green/20"
                    : "bg-red/10 border border-red/20 text-red hover:bg-red/20"
                } disabled:opacity-50`}
              >
                {reviewSubmitting ? "Submitting..." : reviewAction === "approve" ? "Confirm Approval" : "Confirm Rejection"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
