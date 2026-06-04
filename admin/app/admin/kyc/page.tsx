"use client";
import { useState, useEffect, useCallback } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Table, Tr, Td, Badge, Button, Spinner, Modal, Input, Card } from "@/components/ui";
import { api, KYCDocument } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import {
  Eye, CheckCircle, XCircle, Clock, AlertTriangle,
  ZoomIn, Download, ChevronLeft, ChevronRight, X,
  ImageOff, RefreshCw, ExternalLink, User, Trash2,
} from "lucide-react";
import toast from "react-hot-toast";

// ── Cloudinary helpers ────────────────────────────────────────────────────────

function cldTransform(url: string | undefined, transforms: string): string {
  if (!url) return "";
  if (url.includes("cloudinary.com")) {
    return url.replace("/upload/", `/upload/${transforms}/`);
  }
  return url;
}

const thumb  = (url?: string) => cldTransform(url, "w_80,h_80,c_fill,q_auto,f_auto");
const preview= (url?: string) => cldTransform(url, "w_900,q_auto,f_auto");

// ── Constants ─────────────────────────────────────────────────────────────────

const REJECTION_PRESETS = [
  "Licence text not readable — please resubmit a clearer photo",
  "Selfie does not match licence photo",
  "Licence appears expired — please submit a valid licence",
  "Document is partially cropped — ensure full document is visible",
  "Image is blurry — please retake in good lighting",
  "Wrong document submitted — please submit a driver's licence",
  "Handwritten licence not accepted — must be a government-issued card",
];

const TONE = (s: string): any =>
  s === "approved" ? "green" : s === "pending" ? "yellow" : s === "rejected" ? "red" : "muted";

function waitDays(submitted: string) {
  return Math.floor((Date.now() - new Date(submitted).getTime()) / 86400000);
}

// ── Image component ───────────────────────────────────────────────────────────

function KycImage({
  src, alt, className, onClick,
}: {
  src: string | undefined; alt: string; className?: string; onClick?: () => void;
}) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");

  useEffect(() => { setStatus("loading"); }, [src]);

  if (!src) return (
    <div className={`flex flex-col items-center justify-center gap-2 bg-bg3 border border-border rounded-xl ${className}`}>
      <ImageOff size={20} className="text-textDim" />
      <p className="text-textDim text-xs">No image</p>
    </div>
  );

  return (
    <div className={`relative overflow-hidden rounded-xl border border-border bg-bg3 ${className} ${onClick ? "cursor-zoom-in" : ""}`} onClick={onClick}>
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg3">
          <div className="w-5 h-5 border-2 border-cyan/30 border-t-cyan rounded-full animate-spin" />
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-bg3">
          <ImageOff size={18} className="text-textDim" />
          <p className="text-textDim text-[10px]">Failed to load</p>
          <button
            onClick={e => { e.stopPropagation(); setStatus("loading"); }}
            className="text-[10px] text-cyan hover:underline flex items-center gap-1">
            <RefreshCw size={9} /> Retry
          </button>
        </div>
      )}
      <img
        src={src}
        alt={alt}
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("error")}
        className={`w-full h-full object-cover transition-opacity duration-200 ${status === "loaded" ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}

// ── Fullscreen lightbox ───────────────────────────────────────────────────────

function Lightbox({
  images, index, onClose, onPrev, onNext,
}: {
  images: { src: string; label: string }[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const current = images[index];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  if (!current) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95" onClick={onClose}>
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-3 z-10">
        <span className="text-white/70 text-sm font-bold">{current.label}</span>
        <span className="text-white/30 text-xs">{index + 1} / {images.length}</span>
      </div>

      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <a
          href={current.src}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white">
          <ExternalLink size={16} />
        </a>
        <a
          href={current.src}
          download
          onClick={e => e.stopPropagation()}
          className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white">
          <Download size={16} />
        </a>
        <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white">
          <X size={16} />
        </button>
      </div>

      {images.length > 1 && (
        <>
          <button
            onClick={e => { e.stopPropagation(); onPrev(); }}
            className="absolute left-4 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white z-10">
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onNext(); }}
            className="absolute right-4 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white z-10">
            <ChevronRight size={20} />
          </button>
        </>
      )}

      <img
        src={preview(current.src)}
        alt={current.label}
        className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
        onClick={e => e.stopPropagation()}
      />

      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10" onClick={e => e.stopPropagation()}>
          {images.map((img, i) => (
            <button
              key={img.label}
              onClick={() => {
                if (i < index) onPrev();
                else if (i > index) onNext();
              }}
              className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${i === index ? "border-cyan scale-110" : "border-white/20 opacity-60 hover:opacity-100"}`}>
              <img src={thumb(img.src)} alt={img.label} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function KYCPage() {
  const [docs, setDocs] = useState<KYCDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [viewDoc, setViewDoc] = useState<KYCDocument | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [rejectModal, setRejectModal] = useState<KYCDocument | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [approving, setApproving] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [deletingDocs, setDeletingDocs] = useState(false);

  const [imageTab, setImageTab] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    api.kycList().then((r) => setDocs(r.data)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!viewDoc) return;
    const onKey = (e: KeyboardEvent) => {
      if (lightboxOpen) {
        if (e.key === "Escape") { e.preventDefault(); setLightboxOpen(false); }
        return;
      }
      if (e.key === "a" || e.key === "A") { if (viewDoc.status === "pending") handleApprove(viewDoc); }
      if (e.key === "r" || e.key === "R") { if (viewDoc.status === "pending") { setRejectModal(viewDoc); setViewDoc(null); } }
      if (e.key === "Escape") setViewDoc(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewDoc, lightboxOpen]);

  const handleView = async (doc: KYCDocument) => {
    setImageTab(0);
    setLoadingDetail(true);
    setViewDoc(doc);
    try {
      const res = await api.kycDetail(doc.user_id);
      setViewDoc(res.data);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoadingDetail(false); }
  };

  const handleApprove = async (doc: KYCDocument) => {
    setApproving(doc.user_id);
    try {
      await api.kycReview(doc.user_id, "approve");
      toast.success("KYC approved — driver verified");
      setViewDoc(null);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setApproving(null); }
  };

  const handleReject = async () => {
    if (!rejectModal || !rejectReason.trim()) return;
    setRejecting(true);
    try {
      await api.kycReview(rejectModal.user_id, "reject", rejectReason.trim());
      toast.success("KYC rejected — driver notified");
      setRejectModal(null); setRejectReason(""); setViewDoc(null);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setRejecting(false); }
  };

  const handleDeleteDocuments = async (doc: KYCDocument) => {
    if (!confirm(`Delete all KYC documents for ${doc.full_name} from Cloudinary storage? This cannot be undone.`)) return;
    setDeletingDocs(true);
    try {
      await api.deleteKycDocuments(doc.user_id);
      toast.success("Documents deleted from Cloudinary");
      setViewDoc(null);
      load();
    } catch (e: any) { toast.error(e.message || "Failed to delete documents"); }
    finally { setDeletingDocs(false); }
  };

  const filtered = docs.filter((d) => filter === "all" || d.status === filter);
  const pendingDocs = docs.filter((d) => d.status === "pending");
  const oldestWait = pendingDocs.length > 0
    ? Math.max(...pendingDocs.map((d) => waitDays(d.submitted_at)))
    : 0;
  const avgWait = pendingDocs.length > 0
    ? Math.round(pendingDocs.reduce((s, d) => s + waitDays(d.submitted_at), 0) / pendingDocs.length)
    : 0;

  const lightboxImages = viewDoc
    ? [
        viewDoc.selfie_url       ? { src: viewDoc.selfie_url,        label: "Selfie" }         : null,
        viewDoc.licence_front_url? { src: viewDoc.licence_front_url,  label: "Licence Front" }  : null,
        viewDoc.licence_back_url ? { src: viewDoc.licence_back_url,   label: "Licence Back" }   : null,
      ].filter(Boolean) as { src: string; label: string }[]
    : [];

  const openLightbox = (tabIndex: number) => {
    setLightboxIndex(tabIndex);
    setLightboxOpen(true);
  };

  const imageTabs = viewDoc ? [
    { key: "selfie",  label: "Selfie",         src: viewDoc.selfie_url },
    { key: "front",   label: "Licence Front",  src: viewDoc.licence_front_url },
    { key: "back",    label: "Licence Back",   src: viewDoc.licence_back_url },
  ].filter(t => t.src) : [];

  return (
    <AdminShell title="KYC Review">
      <div className="space-y-4">

        {/* SLA metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="text-center">
            <p className="text-2xl font-extrabold text-yellow">{pendingDocs.length}</p>
            <p className="text-xs text-textMuted mt-1">Pending Review</p>
          </Card>
          <Card className="text-center">
            <p className="text-2xl font-extrabold text-green">{docs.filter((d) => d.status === "approved").length}</p>
            <p className="text-xs text-textMuted mt-1">Approved</p>
          </Card>
          <Card className={`text-center ${avgWait > 2 ? "border-yellow/30" : ""}`}>
            <p className={`text-2xl font-extrabold ${avgWait > 2 ? "text-yellow" : "text-cyan"}`}>{avgWait}d</p>
            <p className="text-xs text-textMuted mt-1">Avg Wait Time</p>
          </Card>
          <Card className={`text-center ${oldestWait > 5 ? "border-red/30" : ""}`}>
            <p className={`text-2xl font-extrabold ${oldestWait > 5 ? "text-red" : "text-textMuted"}`}>{oldestWait}d</p>
            <p className="text-xs text-textMuted mt-1">Oldest Submission</p>
          </Card>
        </div>

        {oldestWait > 5 && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red/10 border border-red/20">
            <AlertTriangle size={14} className="text-red" />
            <p className="text-sm text-red font-semibold">
              {pendingDocs.filter((d) => waitDays(d.submitted_at) > 5).length} submission
              {pendingDocs.filter((d) => waitDays(d.submitted_at) > 5).length !== 1 ? "s have" : " has"} been waiting over 5 days. Review urgently.
            </p>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-2 flex-wrap">
          {(["pending", "approved", "rejected", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all capitalize ${
                filter === f ? "bg-cyanDim text-cyan border-cyan/20" : "bg-bg2 text-textMuted border-border hover:text-text"
              }`}>
              {f} ({docs.filter((d) => f === "all" || d.status === f).length})
            </button>
          ))}
        </div>

        {loading ? <Spinner /> : (
          <Table
            headers={["", "Name", "Phone", "Status", "Submitted", "Waiting", "Reviewed By", "Actions"]}
            empty={!filtered.length}>
            {filtered
              .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime())
              .map((doc) => {
                const days = waitDays(doc.submitted_at);
                const thumbSrc = thumb(doc.selfie_url);
                const isApprovingThis = approving === doc.user_id;
                return (
                  <Tr key={doc.id}>
                    {/* Selfie thumbnail */}
                    <Td>
                      {thumbSrc ? (
                        <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-border flex-shrink-0">
                          <img
                            src={thumbSrc}
                            alt="Selfie"
                            className="w-full h-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-bg3 border border-border flex items-center justify-center">
                          <User size={14} className="text-textDim" />
                        </div>
                      )}
                    </Td>
                    <Td className="font-semibold">{doc.full_name || "—"}</Td>
                    <Td className="font-mono text-xs text-textMuted">{doc.phone_number || "—"}</Td>
                    <Td><Badge label={doc.status} tone={TONE(doc.status)} /></Td>
                    <Td className="text-textMuted text-xs whitespace-nowrap">{formatDate(doc.submitted_at)}</Td>
                    <Td>
                      {doc.status === "pending" && (
                        <div className="flex items-center gap-1.5">
                          <Clock size={11} className={days > 5 ? "text-red" : days > 2 ? "text-yellow" : "text-textMuted"} />
                          <span className={`text-xs font-bold ${days > 5 ? "text-red" : days > 2 ? "text-yellow" : "text-textMuted"}`}>
                            {days}d
                          </span>
                        </div>
                      )}
                    </Td>
                    <Td className="text-textMuted text-xs">{doc.reviewed_by || (doc.reviewed_at ? formatDate(doc.reviewed_at) : "—")}</Td>
                    <Td>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {doc.status === "pending" && (
                          <>
                            <Button
                              variant="secondary"
                              onClick={() => handleApprove(doc)}
                              loading={isApprovingThis}
                              className="text-green border-green/20 bg-green/5 hover:bg-green/10">
                              <CheckCircle size={12} /> Approve
                            </Button>
                            <Button
                              variant="danger"
                              onClick={() => setRejectModal(doc)}>
                              <XCircle size={12} /> Reject
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          onClick={() => handleView(doc)}
                          title="View documents">
                          <Eye size={12} /> View
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                );
              })}
          </Table>
        )}
      </div>

      {/* ── KYC Detail Modal ── */}
      {viewDoc && (
        <div
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setViewDoc(null)}>
          <div
            className="bg-bg2 border border-border rounded-2xl w-full max-w-3xl shadow-2xl max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}>

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-3">
                {viewDoc.selfie_url ? (
                  <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-border flex-shrink-0">
                    <img src={thumb(viewDoc.selfie_url)} alt="Selfie" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-full bg-bg3 border border-border flex items-center justify-center">
                    <User size={18} className="text-textDim" />
                  </div>
                )}
                <div>
                  <h3 className="text-text font-bold text-lg">{viewDoc.full_name}</h3>
                  <p className="text-textMuted text-xs font-mono">{viewDoc.phone_number}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge label={viewDoc.status} tone={TONE(viewDoc.status)} />
                <span className="text-textDim text-xs hidden sm:block">
                  {formatDate(viewDoc.submitted_at)}
                  {viewDoc.status === "pending" && (
                    <span className={`ml-2 font-bold ${waitDays(viewDoc.submitted_at) > 3 ? "text-red" : "text-yellow"}`}>
                      · {waitDays(viewDoc.submitted_at)}d waiting
                    </span>
                  )}
                </span>
                <button
                  onClick={() => setViewDoc(null)}
                  className="text-textDim hover:text-text transition-colors p-1 rounded-lg hover:bg-bg3">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Action bar — always visible at top for pending */}
            {viewDoc.status === "pending" && (
              <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-bg3/50 flex-shrink-0">
                <Button
                  className="flex-1 justify-center"
                  onClick={() => handleApprove(viewDoc)}
                  loading={approving === viewDoc.user_id}>
                  <CheckCircle size={13} /> Approve & Verify Driver
                </Button>
                <Button
                  variant="danger"
                  className="flex-1 justify-center"
                  onClick={() => { setRejectModal(viewDoc); setViewDoc(null); }}>
                  <XCircle size={13} /> Reject
                </Button>
                <p className="text-textDim text-[10px] hidden lg:block">
                  <kbd className="px-1 py-0.5 bg-bg border border-border rounded text-[9px]">A</kbd> approve ·{" "}
                  <kbd className="px-1 py-0.5 bg-bg border border-border rounded text-[9px]">R</kbd> reject
                </p>
              </div>
            )}

            {/* Scrollable body */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1">

              {loadingDetail && (
                <div className="flex items-center justify-center py-4">
                  <RefreshCw size={14} className="text-cyan animate-spin mr-2" />
                  <span className="text-textMuted text-sm">Loading full resolution...</span>
                </div>
              )}

              {/* Image tab selector */}
              {imageTabs.length > 0 && (
                <div className="flex gap-1 p-1 bg-bg border border-border rounded-xl w-fit">
                  {imageTabs.map((t, i) => (
                    <button
                      key={t.key}
                      onClick={() => setImageTab(i)}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        imageTab === i ? "bg-cyanDim text-cyan" : "text-textMuted hover:text-text"
                      }`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Main image display */}
              {imageTabs.length > 0 && (() => {
                const active = imageTabs[imageTab];
                const lbIdx = lightboxImages.findIndex(img => img.src === active?.src);
                return (
                  <div className="relative">
                    <KycImage
                      src={active?.src}
                      alt={active?.label ?? ""}
                      className={`w-full ${imageTab === 0 ? "aspect-square max-h-96" : "aspect-[4/3] max-h-80"}`}
                      onClick={() => lbIdx >= 0 && openLightbox(lbIdx)}
                    />
                    {active?.src && (
                      <div className="absolute top-3 right-3 flex gap-2">
                        <button
                          onClick={() => lbIdx >= 0 && openLightbox(lbIdx)}
                          title="Zoom in"
                          className="p-2 bg-black/60 hover:bg-black/80 rounded-lg transition-colors text-white">
                          <ZoomIn size={14} />
                        </button>
                        <a
                          href={active.src}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open original"
                          className="p-2 bg-black/60 hover:bg-black/80 rounded-lg transition-colors text-white">
                          <ExternalLink size={14} />
                        </a>
                        <a
                          href={active.src}
                          download
                          title="Download"
                          className="p-2 bg-black/60 hover:bg-black/80 rounded-lg transition-colors text-white">
                          <Download size={14} />
                        </a>
                      </div>
                    )}
                    {imageTabs.length > 1 && (
                      <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-white/60 bg-black/50 px-2 py-1 rounded-full">
                        Click to zoom · {imageTab + 1} of {imageTabs.length}
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Thumbnail strip */}
              {imageTabs.length > 1 && (
                <div className="flex gap-3">
                  {imageTabs.map((t, i) => (
                    <button
                      key={t.key}
                      onClick={() => setImageTab(i)}
                      className="flex flex-col items-center gap-1.5 flex-1 transition-all">
                      <div className={`w-full aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                        imageTab === i ? "border-cyan ring-1 ring-cyan/30" : "border-border opacity-60 hover:opacity-100"
                      }`}>
                        <KycImage src={thumb(t.src)} alt={t.label} className="w-full h-full" />
                      </div>
                      <span className={`text-[10px] font-bold ${imageTab === i ? "text-cyan" : "text-textDim"}`}>
                        {t.label}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {imageTabs.length === 0 && !loadingDetail && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <ImageOff size={32} className="text-textDim" />
                  <p className="text-textMuted font-bold">No documents uploaded</p>
                  <p className="text-textDim text-sm">The driver has not submitted any KYC documents yet</p>
                </div>
              )}

              {/* Rejection reason */}
              {viewDoc.rejection_reason && (
                <div className="flex items-start gap-2 bg-red/10 border border-red/20 rounded-xl p-4">
                  <XCircle size={14} className="text-red flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-red text-xs font-bold mb-0.5">Rejection Reason</p>
                    <p className="text-red/80 text-sm">{viewDoc.rejection_reason}</p>
                  </div>
                </div>
              )}

              {viewDoc.reviewed_by && (
                <p className="text-textDim text-[10px] text-center">
                  Reviewed by <span className="font-bold text-textMuted">{viewDoc.reviewed_by}</span>
                  {viewDoc.reviewed_at && <> on {formatDate(viewDoc.reviewed_at)}</>}
                </p>
              )}

              {/* Delete documents from Cloudinary */}
              {(viewDoc.selfie_url || viewDoc.licence_front_url || viewDoc.licence_back_url) && (
                <div className="border-t border-border pt-4">
                  <p className="text-textDim text-[10px] mb-2 font-bold uppercase tracking-widest">Danger Zone</p>
                  <Button
                    variant="danger"
                    onClick={() => handleDeleteDocuments(viewDoc)}
                    loading={deletingDocs}
                    className="w-full justify-center">
                    <Trash2 size={13} /> Delete Documents from Cloudinary
                  </Button>
                  <p className="text-textDim text-[10px] mt-2 text-center">
                    Permanently deletes selfie, licence front, and back from Cloudinary storage. Irreversible.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Lightbox ── */}
      {lightboxOpen && lightboxImages.length > 0 && (
        <Lightbox
          images={lightboxImages}
          index={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
          onPrev={() => setLightboxIndex(i => (i - 1 + lightboxImages.length) % lightboxImages.length)}
          onNext={() => setLightboxIndex(i => (i + 1) % lightboxImages.length)}
        />
      )}

      {/* ── Reject modal ── */}
      <Modal
        open={!!rejectModal}
        onClose={() => { setRejectModal(null); setRejectReason(""); }}
        title={`Reject KYC — ${rejectModal?.full_name}`}>
        <div className="space-y-4">
          <p className="text-textMuted text-sm">
            Select a preset reason or type a custom one. This message will be sent to the driver.
          </p>
          <div className="flex flex-wrap gap-2">
            {REJECTION_PRESETS.map((preset) => (
              <button
                key={preset}
                onClick={() => setRejectReason(preset)}
                className={`text-xs px-3 py-1.5 rounded-lg border text-left transition-all ${
                  rejectReason === preset
                    ? "bg-red/10 text-red border-red/20"
                    : "text-textMuted border-border hover:border-red/30 hover:text-text"
                }`}>
                {preset}
              </button>
            ))}
          </div>
          <Input
            placeholder="Or type a custom rejection reason..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => { setRejectModal(null); setRejectReason(""); }}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleReject}
              loading={rejecting}
              disabled={!rejectReason.trim()}>
              <XCircle size={13} /> Reject KYC
            </Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
