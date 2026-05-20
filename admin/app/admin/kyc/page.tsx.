"use client";
import { useState, useEffect } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Table, Tr, Td, Badge, Button, Spinner, Modal, Input } from "@/components/ui";
import { api, KYCDocument } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Eye, CheckCircle, XCircle } from "lucide-react";
import toast from "react-hot-toast";

export default function KYCPage() {
  const [docs, setDocs] = useState<KYCDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [viewDoc, setViewDoc] = useState<KYCDocument | null>(null);
  const [rejectModal, setRejectModal] = useState<KYCDocument | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = () => {
    setLoading(true);
    api.kycList().then((r) => setDocs(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleView = async (doc: KYCDocument) => {
    try {
      const res = await api.kycDetail(doc.user_id);
      setViewDoc(res.data);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleApprove = async (doc: KYCDocument) => {
    try {
      await api.kycReview(doc.user_id, "approve");
      toast.success("KYC approved — driver verified");
      setViewDoc(null);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleReject = async () => {
    if (!rejectModal || !rejectReason.trim()) return;
    try {
      await api.kycReview(rejectModal.user_id, "reject", rejectReason.trim());
      toast.success("KYC rejected");
      setRejectModal(null);
      setRejectReason("");
      setViewDoc(null);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const filtered = docs.filter((d) => filter === "all" ? true : d.status === filter);
  const toneFn = (s: string) =>
    s === "approved" ? "green" : s === "pending" ? "yellow" : s === "rejected" ? "red" : "muted";

  return (
    <AdminShell title="KYC Review">
      <div className="space-y-4">

        {/* Filter tabs */}
        <div className="flex gap-2">
          {(["pending", "approved", "rejected", "all"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all capitalize
                ${filter === f
                  ? "bg-cyanDim text-cyan border-cyan/20"
                  : "bg-bg2 text-textMuted border-border hover:text-text"}`}>
              {f} {f !== "all" && `(${docs.filter((d) => d.status === f).length})`}
            </button>
          ))}
        </div>

        {loading ? <Spinner /> : (
          <Table
            headers={["Name", "Phone", "Status", "Submitted", "Reviewed", "Actions"]}
            empty={!filtered.length}>
            {filtered.map((doc) => (
              <Tr key={doc.id}>
                <Td className="font-semibold">{doc.full_name || "—"}</Td>
                <Td className="font-mono text-xs text-textMuted">{doc.phone_number || "—"}</Td>
                <Td><Badge label={doc.status} tone={toneFn(doc.status) as any} /></Td>
                <Td className="text-textMuted text-xs">{formatDate(doc.submitted_at)}</Td>
                <Td className="text-textMuted text-xs">
                  {doc.reviewed_at ? formatDate(doc.reviewed_at) : "—"}
                </Td>
                <Td>
                  <Button variant="secondary" onClick={() => handleView(doc)}>
                    <Eye size={12} /> Review
                  </Button>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </div>

      {/* View KYC Modal */}
      {viewDoc && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setViewDoc(null)}>
          <div
            className="bg-bg2 border border-border rounded-xl p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>

            <div className="flex items-center justify-between mb-4">
              <h3 className="text-text font-bold text-lg">
                {viewDoc.full_name} — KYC Review
              </h3>
              <button
                onClick={() => setViewDoc(null)}
                className="text-textMuted hover:text-text text-xl">
                ×
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-2">
                  Selfie
                </p>
                {viewDoc.selfie_url ? (
                  <img
                    src={
                      viewDoc.selfie_url.startsWith("data:")
                        ? viewDoc.selfie_url
                        : `data:image/jpeg;base64,${viewDoc.selfie_url}`
                    }
                    alt="Selfie"
                    className="w-full aspect-square object-cover rounded-xl border border-border"
                  />
                ) : (
                  <div className="w-full aspect-square bg-bg3 rounded-xl border border-border flex items-center justify-center text-textDim text-sm">
                    No image
                  </div>
                )}
              </div>
              <div>
                <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-2">
                  Driver's Licence
                </p>
                {viewDoc.licence_front_url ? (
                  <img
                    src={
                      viewDoc.licence_front_url.startsWith("data:")
                        ? viewDoc.licence_front_url
                        : `data:image/jpeg;base64,${viewDoc.licence_front_url}`
                    }
                    alt="Licence"
                    className="w-full aspect-[4/3] object-cover rounded-xl border border-border"
                  />
                ) : (
                  <div className="w-full aspect-[4/3] bg-bg3 rounded-xl border border-border flex items-center justify-center text-textDim text-sm">
                    No image
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 mb-3">
              <Badge label={viewDoc.status} tone={toneFn(viewDoc.status) as any} />
              <span className="text-textMuted text-xs">
                Submitted {formatDate(viewDoc.submitted_at)}
              </span>
            </div>

            {viewDoc.rejection_reason && (
              <div className="bg-red/10 border border-red/20 rounded-lg p-3 mb-4 text-sm text-red">
                Rejection reason: {viewDoc.rejection_reason}
              </div>
            )}

            {viewDoc.status === "pending" && (
              <div className="flex gap-3 mt-4">
                <Button
                  className="flex-1 justify-center"
                  onClick={() => handleApprove(viewDoc)}>
                  <CheckCircle size={13} /> Approve & Verify Driver
                </Button>
                <Button
                  variant="danger"
                  className="flex-1 justify-center"
                  onClick={() => { setRejectModal(viewDoc); setViewDoc(null); }}>
                  <XCircle size={13} /> Reject
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reject Modal */}
      <Modal
        open={!!rejectModal}
        onClose={() => { setRejectModal(null); setRejectReason(""); }}
        title="Reject KYC">
        <div className="space-y-4">
          <p className="text-textMuted text-sm">
            Provide a reason — this will be shown to the driver.
          </p>
          <Input
            placeholder="e.g. Licence text not readable, please resubmit"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <div className="flex gap-3 justify-end">
            <Button
              variant="secondary"
              onClick={() => { setRejectModal(null); setRejectReason(""); }}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleReject}>
              Reject KYC
            </Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
