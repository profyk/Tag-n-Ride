"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import { Button, Input, Modal } from "@/components/ui";
import { api, Driver } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  ExternalLink, CheckCircle, Star, X, Download, Printer,
  QrCode, ImageOff, RefreshCw, FileText, AlertTriangle,
  ShieldAlert, Search, ChevronRight, Award, TrendingUp,
  Users, UserCheck, Clock, Shield, Phone, Copy, Filter,
} from "lucide-react";
import toast from "react-hot-toast";
import { DangerPinModal, useDangerPin } from "@/components/DangerPinModal";

// ── Avatar ──────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "bg-green/20 text-green border-green/30",
  "bg-cyan/20 text-cyan border-cyan/30",
  "bg-yellow/20 text-yellow border-yellow/30",
  "bg-purple/20 text-purple border-purple/30",
  "bg-orange/20 text-orange border-orange/30",
];
function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length;
  const initials = name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("");
  const sz = size === "sm" ? "w-8 h-8 text-[10px]" : size === "lg" ? "w-14 h-14 text-xl" : "w-9 h-9 text-xs";
  return (
    <div className={`${sz} rounded-full border flex items-center justify-center font-black flex-shrink-0 ${AVATAR_COLORS[idx]}`}>
      {initials}
    </div>
  );
}

// ── Star rating ─────────────────────────────────────────────────────────────
function StarRating({ avg, count }: { avg: number; count: number }) {
  if (count === 0) return <span className="text-textDim text-[10px] italic">New driver</span>;
  return (
    <div className="flex items-center gap-1">
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map(i => (
          <Star key={i} size={10}
            className={i <= Math.round(avg) ? "text-yellow" : "text-bg3"}
            fill={i <= Math.round(avg) ? "currentColor" : "none"} />
        ))}
      </div>
      <span className="text-yellow text-[10px] font-black">{avg.toFixed(1)}</span>
      <span className="text-textDim text-[9px]">({count})</span>
    </div>
  );
}

// ── KYC pill ────────────────────────────────────────────────────────────────
function KycPill({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    approved: "bg-green/10 border-green/20 text-green",
    pending:  "bg-yellow/10 border-yellow/20 text-yellow",
    rejected: "bg-red/10 border-red/20 text-red",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${cfg[status] || "bg-bg3 border-border text-textDim"}`}>
      {status || "none"}
    </span>
  );
}

// ── Earnings bar ────────────────────────────────────────────────────────────
function EarningsBar({ amount, max }: { amount: number; max: number }) {
  const pct = max > 0 ? Math.min((amount / max) * 100, 100) : 0;
  return (
    <div className="space-y-0.5">
      <p className="text-green font-black text-xs tabular-nums">{formatZAR(amount)}</p>
      <div className="h-1 bg-bg3 rounded-full overflow-hidden w-20">
        <div className="h-full bg-green/60 rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Skeleton row ────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr className="border-b border-border animate-pulse">
      {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
        <td key={i} className="py-3 px-4">
          {i === 0 ? (
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-bg3" />
              <div className="space-y-1"><div className="h-3 w-28 bg-bg3 rounded" /><div className="h-2 w-20 bg-bg3 rounded" /></div>
            </div>
          ) : <div className="h-3 bg-bg3 rounded" style={{ width: [60, 55, 50, 70, 60, 70, 80][i - 1] }} />}
        </td>
      ))}
    </tr>
  );
}

// ── Driver profile modal ─────────────────────────────────────────────────────
function DriverProfileModal({
  driver, maxEarnings, onClose, onVerify, onQr,
}: {
  driver: Driver; maxEarnings: number; onClose: () => void;
  onVerify: () => void; onQr: () => void;
}) {
  const isNew = driver.rating_count === 0;
  return (
    <Modal open onClose={onClose} title="Driver Profile">
      <div className="space-y-5">

        {/* Hero */}
        <div className={`rounded-xl p-5 border flex items-start gap-4 ${
          !driver.is_verified ? "bg-yellow/5 border-yellow/20" : "bg-bg2 border-border"
        }`}>
          <Avatar name={driver.full_name} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-text font-black text-lg leading-tight">{driver.full_name}</p>
              {driver.is_verified
                ? <span className="text-[10px] font-bold px-2 py-0.5 bg-green/10 border border-green/20 rounded-full text-green">✓ VERIFIED</span>
                : <span className="text-[10px] font-bold px-2 py-0.5 bg-yellow/10 border border-yellow/20 rounded-full text-yellow">PENDING</span>}
            </div>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {driver.vehicle_plate && (
                <span className="font-mono text-xs bg-yellow/10 text-yellow px-2.5 py-1 rounded border border-yellow/20 font-bold tracking-wider">
                  {driver.vehicle_plate}
                </span>
              )}
              <KycPill status={driver.kyc_status} />
            </div>
            <div className="flex items-center gap-4 mt-3">
              <div>
                <p className="text-[9px] font-bold text-textDim uppercase tracking-widest">Earnings</p>
                <p className="text-green font-black tabular-nums">{formatZAR(driver.total_earnings)}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-textDim uppercase tracking-widest">Rating</p>
                <StarRating avg={driver.rating_avg} count={driver.rating_count} />
              </div>
              <div>
                <p className="text-[9px] font-bold text-textDim uppercase tracking-widest">Joined</p>
                <p className="text-textMuted text-xs">{driver.created_at ? formatDate(driver.created_at) : "—"}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Earnings bar */}
        <div className="bg-bg2 border border-border rounded-xl p-4">
          <p className="text-[9px] font-bold text-textDim uppercase tracking-widest mb-2">Earnings vs Top Driver</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-bg3 rounded-full overflow-hidden">
              <div className="h-full bg-green rounded-full transition-all"
                style={{ width: `${maxEarnings > 0 ? (driver.total_earnings / maxEarnings) * 100 : 0}%` }} />
            </div>
            <span className="text-green text-xs font-black tabular-nums w-16 text-right">{formatZAR(driver.total_earnings)}</span>
          </div>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "TNR Code", value: driver.qr_code || "Not generated", mono: true },
            { label: "User ID",  value: driver.user_id.slice(0, 12) + "…", mono: true, copy: driver.user_id },
          ].map(row => (
            <div key={row.label} className="bg-bg2 border border-border rounded-xl px-3 py-2.5">
              <p className="text-[9px] font-bold text-textDim uppercase tracking-widest mb-1">{row.label}</p>
              <div className="flex items-center gap-1.5">
                <p className={`text-xs text-text font-semibold truncate ${row.mono ? "font-mono" : ""}`}>{row.value}</p>
                {row.copy && (
                  <button onClick={() => { navigator.clipboard.writeText(row.copy!); toast.success("Copied"); }}
                    className="text-textDim hover:text-textMuted flex-shrink-0">
                    <Copy size={9} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          {!driver.is_verified && (
            <button onClick={onVerify}
              className="col-span-2 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-green/10 border border-green/20 text-green text-sm font-bold hover:bg-green/20 transition-all">
              <CheckCircle size={15} /> Verify Driver
            </button>
          )}
          <button onClick={onQr}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border text-textMuted text-xs font-bold hover:text-cyan hover:border-cyan/30 transition-all">
            <QrCode size={13} /> {driver.qr_code ? "View QR" : "Generate QR"}
          </button>
          <Link href={`/admin/drivers/${driver.user_id}/statements`} onClick={onClose}>
            <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border text-textMuted text-xs font-bold hover:text-text transition-all">
              <FileText size={13} /> Statements
            </button>
          </Link>
          <Link href={`/admin/drivers/${driver.user_id}`} className="col-span-2" onClick={onClose}>
            <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-cyan/10 border border-cyan/20 text-cyan text-xs font-bold hover:bg-cyan/20 transition-all">
              <ExternalLink size={13} /> Open Full Profile
            </button>
          </Link>
        </div>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// QR MODAL (kept from original — unchanged)
// ════════════════════════════════════════════════════════════════════════════
function QrModal({ driver, onClose, onQrGenerated }: { driver: Driver; onClose: () => void; onQrGenerated: (qrCode: string) => void }) {
  const [currentQr, setCurrentQr] = useState(driver.qr_code);
  const [imgStatus, setImgStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [generating, setGenerating] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const [regenModal, setRegenModal] = useState(false);
  const [regenReason, setRegenReason] = useState<"compromised" | "vehicle_change" | "">("");
  const [regenAcknowledged, setRegenAcknowledged] = useState(false);
  const { open: pinOpen, request: requestPin, handleSuccess: pinSuccess, handleCancel: pinCancel } = useDangerPin();

  const qrSrc = (() => {
    const v = currentQr;
    if (!v) return "";
    if (v.startsWith("data:") || v.startsWith("http")) return v;
    return `data:image/png;base64,${v}`;
  })();

  const handleFirstGenerate = async () => {
    setGenerating(true);
    try {
      const res = await api.generateDriverQR(driver.user_id);
      const newQr = res.data.qr_code;
      setCurrentQr(newQr); setImgStatus("loading");
      onQrGenerated(newQr); toast.success("QR code generated");
    } catch (e: any) { toast.error(e.message || "Failed to generate QR code"); }
    finally { setGenerating(false); }
  };

  const doRegenerate = async () => {
    if (!regenReason || !regenAcknowledged) return;
    setRegenModal(false);
    const token = await requestPin();
    if (!token) return;
    setGenerating(true);
    try {
      const res = await api.generateDriverQR(driver.user_id);
      const newQr = res.data.qr_code;
      setCurrentQr(newQr); setImgStatus("loading");
      onQrGenerated(newQr);
      toast.success("QR code regenerated — old code is now permanently invalid");
    } catch (e: any) { toast.error(e.message || "Failed to regenerate QR code"); }
    finally { setGenerating(false); }
  };

  const safeName = driver.full_name.replace(/[^a-zA-Z0-9]/g, "-");

  const handleDownload = async () => {
    if (!qrSrc) return;
    try {
      if (qrSrc.startsWith("data:")) {
        const a = document.createElement("a"); a.href = qrSrc; a.download = `qr-${safeName}.png`; a.click(); return;
      }
      const res = await fetch(qrSrc); const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `qr-${safeName}.png`; a.click();
      URL.revokeObjectURL(url); toast.success("QR code downloaded");
    } catch { toast.error("Download failed"); }
  };

  const handlePrint = () => {
    if (!qrSrc) return;
    const pw = window.open("", "_blank", "width=500,height=600");
    if (!pw) { toast.error("Allow pop-ups to print"); return; }
    pw.document.write(`<!DOCTYPE html><html><head><title>Tag-n-Ride Driver QR Code</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:-apple-system,sans-serif;background:#fff;color:#111;padding:32px}.logo{font-size:13px;font-weight:800;letter-spacing:2px;color:#888;text-transform:uppercase;margin-bottom:24px}.name{font-size:22px;font-weight:700;margin-bottom:6px}.id{font-size:11px;color:#888;font-family:monospace;margin-bottom:24px}img{width:260px;height:260px;display:block}.note{font-size:11px;color:#aaa;margin-top:20px;text-align:center}@media print{@page{margin:0;size:A5}body{padding:16px}}</style>
</head><body><p class="logo">Tag-n-Ride</p><p class="name">${driver.full_name}</p><p class="id">ID: ${driver.user_id}</p>
<img src="${qrSrc}" alt="QR Code"/><p class="note">Scan to identify this driver</p>
<script>window.onload=function(){window.print()}<\/script></body></html>`);
    pw.document.close();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-bg2 border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-text font-bold text-base">{driver.full_name}</h3>
            <p className="text-textDim text-[10px] font-mono mt-0.5">ID: {driver.user_id}</p>
          </div>
          <button onClick={onClose} className="text-textDim hover:text-text transition-colors p-1 rounded-lg hover:bg-bg3"><X size={16} /></button>
        </div>

        <div className="flex items-center justify-center mb-5">
          <div className="relative w-56 h-56 bg-white rounded-2xl p-3 shadow-inner">
            {imgStatus === "loading" && (
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white">
                <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
              </div>
            )}
            {imgStatus === "error" || !qrSrc ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-gray-50 p-4">
                <ImageOff size={24} className="text-gray-400" />
                <p className="text-gray-500 text-xs text-center font-medium">{!qrSrc ? "No QR code yet" : "Failed to load QR code"}</p>
                <button onClick={currentQr ? () => { setRegenReason(""); setRegenAcknowledged(false); setRegenModal(true); } : handleFirstGenerate}
                  disabled={generating}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-black text-white text-xs font-bold rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50">
                  {generating ? <RefreshCw size={11} className="animate-spin" /> : <QrCode size={11} />}
                  {generating ? "Generating…" : (currentQr ? "Regenerate QR" : "Generate QR")}
                </button>
              </div>
            ) : (
              <img ref={imgRef} src={qrSrc} alt={`QR code for ${driver.full_name}`}
                className={`w-full h-full object-contain transition-opacity duration-200 ${imgStatus === "loaded" ? "opacity-100" : "opacity-0"}`}
                onLoad={() => setImgStatus("loaded")} onError={() => setImgStatus("error")} />
            )}
          </div>
        </div>

        {driver.vehicle_plate && (
          <div className="flex justify-center mb-5">
            <span className="font-mono text-sm bg-yellow/10 text-yellow px-3 py-1 rounded-lg border border-yellow/20 font-bold">{driver.vehicle_plate}</span>
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1 justify-center" onClick={handleDownload} disabled={!qrSrc || imgStatus === "error" || generating}>
            <Download size={13} /> Download
          </Button>
          <Button className="flex-1 justify-center" onClick={handlePrint} disabled={!qrSrc || imgStatus === "error" || generating}>
            <Printer size={13} /> Print
          </Button>
        </div>

        {currentQr && (
          <button onClick={() => { setRegenReason(""); setRegenAcknowledged(false); setRegenModal(true); }} disabled={generating}
            className="w-full mt-3 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold text-red/70 border border-red/20 bg-red/5 hover:bg-red/10 hover:text-red transition-all disabled:opacity-40">
            <RefreshCw size={11} /> Regenerate QR Code
          </button>
        )}

        <p className="text-textDim text-[10px] text-center mt-3">Phone number is excluded from this QR code for driver privacy.</p>
      </div>

      {regenModal && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setRegenModal(false)}>
          <div className="bg-bg2 border border-red/30 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red/10 border border-red/20 flex items-center justify-center flex-shrink-0">
                <ShieldAlert size={18} className="text-red" />
              </div>
              <div>
                <h3 className="text-text font-bold text-base">Regenerate QR Code</h3>
                <p className="text-textMuted text-xs mt-0.5">{driver.full_name}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-red/5 border border-red/20 rounded-xl">
              <AlertTriangle size={14} className="text-red flex-shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="text-red font-semibold">The driver's current printed QR code will be permanently invalidated.</p>
                <p className="text-textMuted">Passengers scanning the old QR will receive an error. A new QR must be physically reprinted.</p>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest">Reason <span className="text-red">*</span></p>
              {([
                { value: "compromised",    label: "QR code reported as compromised or stolen",   sub: "Someone may have photographed or duplicated the driver's QR" },
                { value: "vehicle_change", label: "Driver has changed taxi / vehicle",            sub: "New vehicle requires a new QR linked to the correct plate" },
              ] as const).map(({ value, label, sub }) => (
                <label key={value} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${regenReason === value ? "bg-cyan/5 border-cyan/30" : "border-border hover:border-cyan/20"}`}>
                  <input type="radio" name="regenReason" value={value} checked={regenReason === value} onChange={() => setRegenReason(value)} className="mt-0.5 accent-cyan" />
                  <div><p className="text-text text-sm font-semibold">{label}</p><p className="text-textDim text-[11px] mt-0.5">{sub}</p></div>
                </label>
              ))}
            </div>
            <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${regenAcknowledged ? "bg-yellow/5 border-yellow/30" : "border-border hover:border-yellow/20"}`}>
              <input type="checkbox" checked={regenAcknowledged} onChange={e => setRegenAcknowledged(e.target.checked)} className="mt-0.5 w-4 h-4 accent-yellow" />
              <p className="text-textMuted text-xs">I confirm that the current printed QR code will be <strong className="text-text">destroyed and replaced</strong>. The driver has been informed and the old code will no longer function.</p>
            </label>
            <div className="flex gap-3">
              <button onClick={() => setRegenModal(false)} className="flex-1 py-2.5 rounded-xl bg-bg3 border border-border text-textMuted text-sm font-bold hover:text-text transition-colors">Cancel</button>
              <button onClick={doRegenerate} disabled={!regenReason || !regenAcknowledged}
                className="flex-1 py-2.5 rounded-xl bg-red/20 border border-red/30 text-red text-sm font-bold disabled:opacity-40 hover:bg-red/30 transition-colors flex items-center justify-center gap-2">
                <RefreshCw size={13} /> Regenerate QR
              </button>
            </div>
          </div>
        </div>
      )}

      <DangerPinModal open={pinOpen} onSuccess={pinSuccess} onCancel={pinCancel} actionLabel="regenerate this driver's QR code" />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function DriversPage() {
  const [drivers,   setDrivers]   = useState<Driver[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [verFilter, setVerFilter] = useState<"all" | "pending" | "verified">("all");
  const [kycFilter, setKycFilter] = useState<"all" | "approved" | "pending" | "rejected" | "none">("all");
  const [sortBy,    setSortBy]    = useState<"default" | "earnings" | "rating" | "newest">("default");
  const [countdown, setCountdown] = useState(60);

  const [profileDriver, setProfileDriver] = useState<Driver | null>(null);
  const [qrDriver,      setQrDriver]      = useState<Driver | null>(null);

  const timerRef = useRef<any>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.drivers().then(r => setDrivers(r.data)).finally(() => setLoading(false));
  }, []);

  const refresh = useCallback(() => { load(); setCountdown(60); }, [load]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown(c => { if (c <= 1) { refresh(); return 60; } return c - 1; });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [refresh]);

  const handleVerify = useCallback(async (userId: string, name: string) => {
    try {
      await api.verifyDriver(userId);
      toast.success(`${name} verified`);
      setDrivers(prev => prev.map(d => d.user_id === userId ? { ...d, is_verified: true } : d));
      setProfileDriver(prev => prev?.user_id === userId ? { ...prev, is_verified: true } : prev);
    } catch (e: any) { toast.error(e.message); }
  }, []);

  // ── Derived ─────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const verified = drivers.filter(d => d.is_verified);
    const rated    = drivers.filter(d => d.rating_count > 0);
    const totalEarnings = drivers.reduce((s, d) => s + d.total_earnings, 0);
    const avgRating = rated.length > 0
      ? rated.reduce((s, d) => s + d.rating_avg, 0) / rated.length
      : null;
    const kycApproved = drivers.filter(d => d.kyc_status === "approved").length;
    return {
      total: drivers.length,
      verified: verified.length,
      pending: drivers.filter(d => !d.is_verified).length,
      avgRating, totalEarnings, kycApproved,
    };
  }, [drivers]);

  const maxEarnings = useMemo(() =>
    drivers.reduce((m, d) => Math.max(m, d.total_earnings), 0),
  [drivers]);

  const filtered = useMemo(() => drivers
    .filter(d => {
      if (verFilter === "pending")  return !d.is_verified;
      if (verFilter === "verified") return d.is_verified;
      return true;
    })
    .filter(d => {
      if (kycFilter === "none") return !d.kyc_status || d.kyc_status === "none";
      if (kycFilter !== "all")  return d.kyc_status === kycFilter;
      return true;
    })
    .filter(d =>
      !search ||
      d.full_name.toLowerCase().includes(search.toLowerCase()) ||
      d.phone_number.includes(search) ||
      (d.vehicle_plate || "").toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === "earnings") return b.total_earnings - a.total_earnings;
      if (sortBy === "rating")   return (b.rating_avg || 0) - (a.rating_avg || 0);
      if (sortBy === "newest")   return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      return 0;
    }),
  [drivers, verFilter, kycFilter, search, sortBy]);

  const exportCsv = () => {
    const rows = [
      ["Name", "Phone", "Plate", "Earnings", "Rating", "Reviews", "KYC", "Status", "Joined"],
      ...filtered.map(d => [
        d.full_name, d.phone_number, d.vehicle_plate || "",
        formatZAR(d.total_earnings),
        d.rating_count > 0 ? d.rating_avg.toFixed(1) : "—",
        d.rating_count.toString(), d.kyc_status || "none",
        d.is_verified ? "Verified" : "Pending",
        d.created_at ? formatDate(d.created_at) : "",
      ]),
    ];
    const csv = rows.map(r => r.map((c: string) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `drivers-${verFilter}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} drivers`);
  };

  const hasFilters = verFilter !== "all" || kycFilter !== "all" || !!search || sortBy !== "default";

  return (
    <AdminShell title="Driver Management">
      <div className="space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div />
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <div className="w-20 h-1 bg-bg3 rounded-full overflow-hidden">
                <div className="h-full bg-cyan/50 rounded-full transition-all duration-1000"
                  style={{ width: `${(countdown / 60) * 100}%` }} />
              </div>
              <span className="text-textDim text-[10px] w-6">{countdown}s</span>
            </div>
            <button onClick={refresh} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-textMuted hover:text-cyan border border-border rounded-lg transition-all">
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
            <button onClick={exportCsv} disabled={loading || filtered.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-textMuted hover:text-text border border-border rounded-lg transition-all disabled:opacity-40">
              <Download size={12} /> Export CSV
            </button>
          </div>
        </div>

        {/* ── Stats strip ── */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { label: "Total",         value: stats.total,                                          color: "text-text",   click: () => setVerFilter("all")      },
            { label: "Verified",      value: stats.verified,                                       color: "text-green",  click: () => setVerFilter("verified")  },
            { label: "Pending",       value: stats.pending,                                        color: "text-yellow", click: () => setVerFilter("pending")   },
            { label: "KYC Approved",  value: stats.kycApproved,                                   color: "text-cyan",   click: () => setKycFilter("approved")  },
            { label: "Avg Rating",    value: stats.avgRating != null ? `${stats.avgRating.toFixed(1)}★` : "—", color: "text-yellow", click: null },
            { label: "Total Earnings",value: formatZAR(stats.totalEarnings),                      color: "text-green",  click: null },
          ].map(({ label, value, color, click }) => (
            <div key={label}
              onClick={() => click?.()}
              className={`bg-bg2 border border-border rounded-xl px-3 py-3 text-center ${click ? "cursor-pointer hover:border-cyan/40 transition-colors" : ""}`}>
              <p className={`text-lg font-black tabular-nums ${color}`}>{value}</p>
              <p className="text-[9px] font-bold text-textDim uppercase tracking-wider mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* ── Pending action banner ── */}
        {stats.pending > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 bg-yellow/5 border border-yellow/20 rounded-xl">
            <AlertTriangle size={14} className="text-yellow flex-shrink-0" />
            <p className="text-yellow text-xs font-bold flex-1">
              {stats.pending} driver{stats.pending !== 1 ? "s" : ""} waiting for verification — they cannot accept payments until approved.
            </p>
            <button onClick={() => setVerFilter("pending")}
              className="text-[10px] text-yellow border border-yellow/30 rounded-lg px-3 py-1.5 hover:bg-yellow/10 font-bold transition-all whitespace-nowrap">
              View Pending
            </button>
          </div>
        )}

        {/* ── Search + filters ── */}
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-textDim" />
              <input
                placeholder="Search name, phone, plate…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-bg2 border border-border rounded-lg text-sm text-text placeholder:text-textDim focus:outline-none focus:border-cyan/50 transition-colors"
              />
              {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-textDim hover:text-textMuted"><X size={13} /></button>}
            </div>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
              className="bg-bg2 border border-border rounded-lg px-3 py-2 text-xs text-textMuted focus:outline-none focus:border-cyan/50 font-bold">
              <option value="default">Sort: Default</option>
              <option value="earnings">Sort: Top Earners</option>
              <option value="rating">Sort: Best Rated</option>
              <option value="newest">Sort: Newest</option>
            </select>
            {hasFilters && (
              <button onClick={() => { setVerFilter("all"); setKycFilter("all"); setSearch(""); setSortBy("default"); }}
                className="flex items-center gap-1 px-3 py-2 text-xs font-bold text-red border border-red/20 rounded-lg hover:bg-red/5 transition-all">
                <X size={12} /> Clear
              </button>
            )}
          </div>

          {/* Verification tabs */}
          <div className="flex gap-1 border-b border-border">
            {(["all", "verified", "pending"] as const).map(f => (
              <button key={f} onClick={() => setVerFilter(f)}
                className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all capitalize ${
                  verFilter === f
                    ? f === "pending" ? "text-yellow border-yellow" : f === "verified" ? "text-green border-green" : "text-cyan border-cyan"
                    : "text-textMuted border-transparent hover:text-text"
                }`}>
                {f === "all" ? `All (${stats.total})` : f === "verified" ? `Verified (${stats.verified})` : `Pending (${stats.pending})`}
              </button>
            ))}

            {/* KYC filter pills */}
            <div className="ml-auto flex gap-1 items-center pb-1">
              <Filter size={10} className="text-textDim" />
              {(["all", "approved", "pending", "rejected", "none"] as const).map(k => (
                <button key={k} onClick={() => setKycFilter(k)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all capitalize ${
                    kycFilter === k
                      ? k === "approved" ? "bg-green/10 border-green/20 text-green"
                      : k === "rejected" ? "bg-red/10 border-red/20 text-red"
                      : k === "pending"  ? "bg-yellow/10 border-yellow/20 text-yellow"
                      : "bg-cyan/10 border-cyan/20 text-cyan"
                      : "bg-bg2 border-border text-textDim hover:text-textMuted"
                  }`}>
                  KYC: {k}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Showing counter ── */}
        <p className="text-textDim text-[10px]">
          Showing <span className="text-text font-bold">{filtered.length.toLocaleString()}</span> of{" "}
          <span className="text-text font-bold">{drivers.length.toLocaleString()}</span> drivers
          {hasFilters && " (filtered)"}
        </p>

        {/* ── Table ── */}
        <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-bg3">
                  {["Driver", "Plate", "Verification", "KYC", "Earnings", "Rating", "Joined", ""].map(h => (
                    <th key={h} className="text-left py-3 px-4 text-[10px] font-bold text-textDim uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                  : filtered.length === 0
                  ? (
                    <tr><td colSpan={8} className="py-16 text-center text-textMuted text-sm">No drivers match current filters</td></tr>
                  )
                  : filtered.map((d, idx) => {
                      const isTop3 = sortBy === "earnings" && idx < 3;
                      const medals = ["🥇", "🥈", "🥉"];
                      return (
                        <tr key={d.user_id}
                          onClick={() => setProfileDriver(d)}
                          className="border-b border-border cursor-pointer hover:bg-bg3/50 transition-colors">

                          {/* Driver */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="relative">
                                <Avatar name={d.full_name} size="sm" />
                                {isTop3 && (
                                  <span className="absolute -top-1 -right-1 text-[11px]">{medals[idx]}</span>
                                )}
                              </div>
                              <div>
                                <p className="font-bold text-text">{d.full_name}</p>
                                <p className="text-textDim text-[10px] font-mono">{d.user_id.slice(0, 8)}…</p>
                              </div>
                            </div>
                          </td>

                          {/* Plate */}
                          <td className="py-3 px-4">
                            {d.vehicle_plate
                              ? <span className="font-mono text-xs bg-yellow/10 text-yellow px-2 py-0.5 rounded border border-yellow/20 font-bold">{d.vehicle_plate}</span>
                              : <span className="text-textDim text-[10px] italic">No plate</span>}
                          </td>

                          {/* Verification */}
                          <td className="py-3 px-4">
                            {d.is_verified
                              ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold bg-green/10 border-green/20 text-green"><CheckCircle size={9} /> Verified</span>
                              : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold bg-yellow/10 border-yellow/20 text-yellow"><Clock size={9} /> Pending</span>}
                          </td>

                          {/* KYC */}
                          <td className="py-3 px-4"><KycPill status={d.kyc_status} /></td>

                          {/* Earnings */}
                          <td className="py-3 px-4"><EarningsBar amount={d.total_earnings} max={maxEarnings} /></td>

                          {/* Rating */}
                          <td className="py-3 px-4"><StarRating avg={d.rating_avg} count={d.rating_count} /></td>

                          {/* Joined */}
                          <td className="py-3 px-4 text-textDim whitespace-nowrap">{d.created_at ? formatDate(d.created_at) : "—"}</td>

                          {/* Arrow */}
                          <td className="py-3 px-4"><ChevronRight size={13} className="text-textDim" /></td>
                        </tr>
                      );
                    })
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Driver profile modal ── */}
      {profileDriver && (
        <DriverProfileModal
          driver={profileDriver}
          maxEarnings={maxEarnings}
          onClose={() => setProfileDriver(null)}
          onVerify={() => { handleVerify(profileDriver.user_id, profileDriver.full_name); setProfileDriver(null); }}
          onQr={() => { setQrDriver(profileDriver); setProfileDriver(null); }}
        />
      )}

      {/* ── QR modal ── */}
      {qrDriver && (
        <QrModal
          driver={qrDriver}
          onClose={() => setQrDriver(null)}
          onQrGenerated={qrCode => {
            setDrivers(prev => prev.map(d => d.user_id === qrDriver.user_id ? { ...d, qr_code: qrCode } : d));
            setQrDriver(prev => prev ? { ...prev, qr_code: qrCode } : null);
          }}
        />
      )}
    </AdminShell>
  );
}
