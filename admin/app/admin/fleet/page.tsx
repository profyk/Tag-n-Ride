"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { AdminShell } from "@/components/ui/AdminShell";
import { api, Owner, OwnerDetail, OwnerDriver, CommissionRequest } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  Download, Search, ChevronRight, RefreshCw, Building2,
  Wallet, Banknote, CheckCircle, Clock, TrendingUp, Copy,
  X, ExternalLink, Printer, QrCode as QrCodeIcon, AlertTriangle,
  Star, Users, BadgeDollarSign, CreditCard, ShieldCheck,
  ThumbsUp, ThumbsDown, ReceiptText, Filter,
} from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";
import QRCode from "qrcode";

async function generateQRWithLogo(text: string): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      const baseUrl = await QRCode.toDataURL(text, {
        width: 400, margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
        errorCorrectionLevel: "H",
      });
      const canvas = document.createElement("canvas");
      canvas.width = 400; canvas.height = 400;
      const ctx = canvas.getContext("2d")!;
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, 400, 400);
        const cx = 200, cy = 200, r = 46;
        ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff"; ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = "#00D4FF"; ctx.fill();
        ctx.fillStyle = "#05050A";
        ctx.font = "900 22px 'Arial Black', Arial, sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("TNR", cx, cy);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = reject;
      img.src = baseUrl;
    } catch (e) { reject(e); }
  });
}

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHdrs = () => ({ Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}` });

// ── Avatar ───────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "bg-cyan/20 text-cyan border-cyan/30",
  "bg-purple/20 text-purple border-purple/30",
  "bg-green/20 text-green border-green/30",
  "bg-yellow/20 text-yellow border-yellow/30",
  "bg-orange/20 text-orange border-orange/30",
];
function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const idx = (name.charCodeAt(0) + (name.charCodeAt(1) || 0)) % AVATAR_COLORS.length;
  const initials = name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("");
  const sz = size === "sm" ? "w-8 h-8 text-[10px]" : size === "lg" ? "w-14 h-14 text-xl" : "w-9 h-9 text-xs";
  return (
    <div className={`${sz} rounded-full border flex items-center justify-center font-black flex-shrink-0 ${AVATAR_COLORS[idx]}`}>
      {initials}
    </div>
  );
}

function CashupPill({ method }: { method: string }) {
  return method === "bank"
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold bg-green/10 border-green/20 text-green"><Banknote size={8} /> Bank</span>
    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold bg-cyan/10 border-cyan/20 text-cyan"><Wallet size={8} /> Wallet</span>;
}

function PaymentModePill({ mode, pct, target }: { mode: string; pct: number; target: number }) {
  return mode === "commission_split"
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold bg-purple/10 border-purple/20 text-purple">{pct}% split</span>
    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold bg-yellow/10 border-yellow/20 text-yellow">R{target}/day</span>;
}

function SkeletonRow() {
  return (
    <div className="border border-border rounded-xl px-4 py-3 bg-bg2 animate-pulse flex items-center gap-3">
      <div className="w-9 h-9 rounded-full bg-bg3 flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-40 bg-bg3 rounded" />
        <div className="h-2 w-28 bg-bg3 rounded" />
      </div>
      <div className="hidden sm:flex gap-5">
        <div className="space-y-1"><div className="h-4 w-8 bg-bg3 rounded" /><div className="h-2 w-12 bg-bg3 rounded" /></div>
        <div className="space-y-1"><div className="h-4 w-16 bg-bg3 rounded" /><div className="h-2 w-12 bg-bg3 rounded" /></div>
      </div>
      <div className="h-5 w-5 rounded bg-bg3 flex-shrink-0" />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// OWNER DETAIL MODAL
// ════════════════════════════════════════════════════════════════════════════
function OwnerModal({ owner, onClose }: { owner: Owner; onClose: () => void }) {
  const [detail,        setDetail]        = useState<OwnerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [qrDataUrl,     setQrDataUrl]     = useState("");
  const [qrCode,        setQrCode]        = useState(owner.qr_code);
  const [showAllDrivers,setShowAllDrivers] = useState(false);
  const [showAllCashups,setShowAllCashups] = useState(false);
  const [billing,       setBilling]       = useState(false);

  useEffect(() => {
    api.ownerDetail(owner.user_id)
      .then(r => setDetail(r.data))
      .catch(() => {})
      .finally(() => setDetailLoading(false));
  }, [owner.user_id]);

  useEffect(() => {
    if (!qrCode) { setQrDataUrl(""); return; }
    setQrDataUrl("");
    generateQRWithLogo(qrCode).then(setQrDataUrl).catch(() => setQrDataUrl("error"));
  }, [qrCode]);

  const drivers   = detail?.drivers || [];
  const cashups   = detail?.cashup_history || [];
  const verified  = drivers.filter(d => d.is_verified).length;
  const topEarner = [...drivers].sort((a, b) => b.total_earnings - a.total_earnings)[0];
  const fleetEarnings = drivers.reduce((s, d) => s + d.total_earnings, 0);
  const safeName  = owner.full_name.replace(/[^a-zA-Z0-9]/g, "-");

  const handleDownload = () => {
    if (!qrDataUrl || qrDataUrl === "error") return;
    const a = document.createElement("a");
    a.href = qrDataUrl; a.download = `qr-owner-${safeName}.png`; a.click();
    toast.success("Downloaded");
  };

  const handlePrint = () => {
    if (!qrDataUrl || qrDataUrl === "error") return;
    const pw = window.open("", "_blank", "width=480,height=580");
    if (!pw) { toast.error("Allow pop-ups to print"); return; }
    pw.document.write(`<!DOCTYPE html><html><head><title>Tag-n-Ride Owner QR</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:-apple-system,sans-serif;background:#fff;padding:32px}.logo{font-size:12px;font-weight:800;letter-spacing:2px;color:#888;text-transform:uppercase;margin-bottom:20px}.name{font-size:20px;font-weight:900;color:#111;margin-bottom:4px}.biz{font-size:13px;color:#888;margin-bottom:20px}img{width:240px;height:240px}.note{font-size:11px;color:#aaa;margin-top:16px;text-align:center}@media print{@page{margin:0;size:A5}body{padding:16px}}</style>
</head><body><p class="logo">Tag-n-Ride Fleet Owner</p><p class="name">${owner.full_name}</p>${owner.business_name ? `<p class="biz">${owner.business_name}</p>` : ""}
<img src="${qrDataUrl}" alt="QR"/><p class="note">Fleet Owner Payment QR · tagnride.app</p>
<script>window.onload=function(){window.print()}<\/script></body></html>`);
    pw.document.close();
  };

  const handleBillNow = async () => {
    if (!confirm(`Bill ${owner.full_name} subscription now?`)) return;
    setBilling(true);
    try {
      await api.billOwnerNow(owner.user_id);
      toast.success("Subscription billed successfully");
    } catch (e: any) { toast.error(e.message || "Billing failed"); }
    finally { setBilling(false); }
  };

  const handleWaive = async () => {
    if (!confirm(`Waive this month's subscription for ${owner.full_name}?`)) return;
    setBilling(true);
    try {
      await api.waiveSubscription(owner.user_id);
      toast.success("Subscription waived");
    } catch (e: any) { toast.error(e.message || "Waive failed"); }
    finally { setBilling(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-bg2 border border-border rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}>

        {/* Sticky header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-text font-black text-base">Fleet Owner Profile</h2>
          <button onClick={onClose} className="text-textDim hover:text-text transition-colors p-1 rounded-lg hover:bg-bg3">
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">

          {/* ── Hero ── */}
          <div className="rounded-xl p-4 border border-border bg-bg flex items-start gap-3">
            <Avatar name={owner.full_name} size="lg" />
            <div className="flex-1 min-w-0">
              <p className="text-text font-black text-base">{owner.full_name}</p>
              {owner.business_name && (
                <div className="flex items-center gap-1 mt-0.5">
                  <Building2 size={10} className="text-textDim" />
                  <p className="text-textMuted text-xs">{owner.business_name}</p>
                </div>
              )}
              <p className="text-textDim text-xs font-mono mt-0.5">{owner.phone_number}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <CashupPill method={owner.cashup_method} />
                <span className="text-[10px] text-textDim">Joined {formatDate(owner.created_at)}</span>
              </div>
            </div>
            <button onClick={() => { navigator.clipboard.writeText(owner.user_id); toast.success("ID copied"); }}
              className="text-textDim hover:text-textMuted p-1 flex-shrink-0"><Copy size={11} /></button>
          </div>

          {/* ── Financial stats ── */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Balance",     value: formatZAR(owner.balance),      color: "text-cyan"  },
              { label: "Total Paid",  value: formatZAR(owner.total_cashup), color: "text-green" },
              { label: "Drivers",     value: owner.driver_count,            color: "text-text"  },
            ].map(s => (
              <div key={s.label} className="bg-bg border border-border rounded-xl px-3 py-2.5 text-center">
                <p className={`text-sm font-black ${s.color}`}>{s.value}</p>
                <p className="text-[9px] font-bold text-textDim uppercase tracking-widest mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* ── Fleet health ── */}
          {!detailLoading && drivers.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-bg border border-border rounded-xl px-3 py-2.5 text-center">
                <p className="text-sm font-black text-green">{verified}/{drivers.length}</p>
                <p className="text-[9px] font-bold text-textDim uppercase tracking-widest mt-0.5">Verified</p>
              </div>
              <div className="bg-bg border border-border rounded-xl px-3 py-2.5 text-center">
                <p className="text-sm font-black text-yellow truncate" title={topEarner?.full_name}>
                  {topEarner ? topEarner.full_name.split(" ")[0] : "—"}
                </p>
                <p className="text-[9px] font-bold text-textDim uppercase tracking-widest mt-0.5">Top Earner</p>
              </div>
              <div className="bg-bg border border-border rounded-xl px-3 py-2.5 text-center">
                <p className="text-sm font-black text-purple tabular-nums">{formatZAR(fleetEarnings)}</p>
                <p className="text-[9px] font-bold text-textDim uppercase tracking-widest mt-0.5">Fleet Total</p>
              </div>
            </div>
          )}

          {/* ── QR Code ── */}
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-bg3 border-b border-border">
              <div className="w-6 h-6 rounded bg-cyan flex items-center justify-center flex-shrink-0">
                <span className="font-black text-[9px] text-bg">TNR</span>
              </div>
              <p className="text-text text-xs font-bold flex-1">Payment QR Code</p>
              <span className="text-textDim text-[10px]">Scan to pay this owner</span>
            </div>
            <div className="p-4 flex flex-col items-center bg-bg2">
              {qrCode ? (
                <>
                  <div className="bg-white rounded-xl p-3 mb-3 shadow-inner">
                    {qrDataUrl && qrDataUrl !== "error" ? (
                      <img src={qrDataUrl} alt="QR" className="w-44 h-44 block" />
                    ) : qrDataUrl === "error" ? (
                      <div className="w-44 h-44 flex flex-col items-center justify-center gap-2">
                        <QrCodeIcon size={24} className="text-gray-300" />
                        <p className="text-gray-400 text-[10px]">Render failed</p>
                        <button onClick={() => { setQrDataUrl(""); generateQRWithLogo(qrCode).then(setQrDataUrl).catch(() => setQrDataUrl("error")); }}
                          className="text-[10px] text-cyan underline">Retry</button>
                      </div>
                    ) : (
                      <div className="w-44 h-44 flex items-center justify-center">
                        <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-cyan/10 border border-cyan/20 rounded-full mb-3">
                    <span className="text-cyan font-black text-[10px]">TNR</span>
                    <span className="font-mono text-[10px] font-bold text-text">{qrCode}</span>
                    <button onClick={() => { navigator.clipboard.writeText(qrCode); toast.success("Copied"); }}>
                      <Copy size={8} className="text-textDim hover:text-textMuted" />
                    </button>
                  </div>
                  <div className="flex gap-2 w-full">
                    <button onClick={handleDownload} disabled={!qrDataUrl || qrDataUrl === "error"}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-bg3 border border-border text-textMuted text-xs font-bold hover:text-text transition-colors disabled:opacity-40">
                      <Download size={12} /> Download
                    </button>
                    <button onClick={handlePrint} disabled={!qrDataUrl || qrDataUrl === "error"}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-cyan/10 border border-cyan/20 text-cyan text-xs font-bold hover:bg-cyan/20 transition-colors disabled:opacity-40">
                      <Printer size={12} /> Print
                    </button>
                  </div>
                </>
              ) : (
                <div className="w-full py-5 flex flex-col items-center gap-3">
                  <QrCodeIcon size={36} className="text-bg3" />
                  <p className="text-textDim text-xs">No QR code assigned yet</p>
                  <button onClick={async () => {
                    try {
                      const res = await api.generateDriverQR(owner.user_id);
                      setQrCode(res.data.qr_code);
                      toast.success("QR generated");
                    } catch (e: any) { toast.error(e.message || "Failed"); }
                  }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-cyan/10 border border-cyan/20 text-cyan text-xs font-bold rounded-lg hover:bg-cyan/20 transition-colors">
                    <QrCodeIcon size={12} /> Generate QR
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Bank account ── */}
          {owner.cashup_method === "bank" && owner.account_number && (
            <div className="flex items-center justify-between px-4 py-3 bg-green/5 border border-green/20 rounded-xl">
              <div className="flex items-center gap-2">
                <Banknote size={14} className="text-green" />
                <div>
                  <p className="text-[9px] font-bold text-textDim uppercase tracking-widest">Bank Account</p>
                  <p className="text-text text-sm font-mono font-bold">•••• {owner.account_number.slice(-4)}</p>
                </div>
              </div>
              <span className="text-textMuted text-xs font-semibold">{owner.bank_name}</span>
            </div>
          )}

          {/* ── Subscription actions ── */}
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-bg3 border-b border-border">
              <p className="text-text text-xs font-bold">Subscription</p>
            </div>
            <div className="p-3 flex gap-2">
              <button onClick={handleBillNow} disabled={billing}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-purple/10 border border-purple/20 text-purple text-xs font-bold hover:bg-purple/20 transition-colors disabled:opacity-50">
                <CreditCard size={12} /> Bill Now
              </button>
              <button onClick={handleWaive} disabled={billing}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-bg3 border border-border text-textMuted text-xs font-bold hover:text-text transition-colors disabled:opacity-50">
                <ShieldCheck size={12} /> Waive Month
              </button>
            </div>
          </div>

          {/* ── Fleet drivers ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-textDim uppercase tracking-widest">
                Fleet Drivers ({drivers.length})
              </p>
              {drivers.length > 0 && (
                <span className="text-[10px] text-green font-bold">{verified} verified</span>
              )}
            </div>
            {detailLoading ? (
              <div className="space-y-2">{[0,1,2].map(i => <div key={i} className="h-11 bg-bg3 rounded-xl animate-pulse" />)}</div>
            ) : drivers.length === 0 ? (
              <p className="text-textDim text-xs text-center py-4 border border-border rounded-xl">No drivers yet</p>
            ) : (
              <>
                <div className="space-y-1.5">
                  {(showAllDrivers ? drivers : drivers.slice(0, 5)).map((d: OwnerDriver) => (
                    <div key={d.user_id} className="flex items-center gap-2.5 px-3 py-2 bg-bg border border-border rounded-lg">
                      <Avatar name={d.full_name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-text text-xs font-bold truncate">{d.full_name}</p>
                          {d.is_verified
                            ? <CheckCircle size={9} className="text-green flex-shrink-0" />
                            : <Clock size={9} className="text-yellow flex-shrink-0" />}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {d.vehicle_plate && (
                            <span className="font-mono text-[9px] bg-yellow/10 text-yellow px-1.5 rounded border border-yellow/20">
                              {d.vehicle_plate}
                            </span>
                          )}
                          <PaymentModePill mode={d.payment_mode} pct={d.driver_commission_pct} target={d.daily_target} />
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-green text-xs font-black tabular-nums">{formatZAR(d.total_earnings)}</p>
                        {d.rating_count > 0 && <p className="text-yellow text-[10px]">★ {d.rating_avg.toFixed(1)}</p>}
                      </div>
                    </div>
                  ))}
                </div>
                {drivers.length > 5 && (
                  <button onClick={() => setShowAllDrivers(s => !s)}
                    className="w-full mt-1.5 py-2 text-[11px] font-bold text-textMuted hover:text-cyan transition-colors text-center">
                    {showAllDrivers ? "Show less ▲" : `Show all ${drivers.length} drivers ▼`}
                  </button>
                )}
              </>
            )}
          </div>

          {/* ── Cashup history ── */}
          {cashups.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-textDim uppercase tracking-widest mb-2">
                Cashup History ({cashups.length})
              </p>
              <div className="space-y-1.5">
                {(showAllCashups ? cashups : cashups.slice(0, 5)).map(c => (
                  <div key={c.id} className="flex items-center justify-between px-3 py-2 bg-bg border border-border rounded-lg">
                    <div>
                      <p className="text-text text-xs font-semibold">{c.driver_name}</p>
                      <p className="text-textDim text-[10px]">{formatDate(c.created_at)} · {c.cashup_method}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-green text-xs font-black tabular-nums">{formatZAR(c.cashup_amount)}</p>
                      <p className="text-textDim text-[10px]">net {formatZAR(c.driver_profit)}</p>
                    </div>
                  </div>
                ))}
              </div>
              {cashups.length > 5 && (
                <button onClick={() => setShowAllCashups(s => !s)}
                  className="w-full mt-1.5 py-2 text-[11px] font-bold text-textMuted hover:text-cyan transition-colors text-center">
                  {showAllCashups ? "Show less ▲" : `Show all ${cashups.length} cashups ▼`}
                </button>
              )}
            </div>
          )}

          {/* ── Actions ── */}
          <Link href={`/admin/users?search=${encodeURIComponent(owner.phone_number)}`} onClick={onClose}>
            <button className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-bg3 border border-border text-textMuted text-xs font-bold hover:text-cyan hover:border-cyan/30 transition-all">
              <ExternalLink size={13} /> Open in Users
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// COMMISSION REQUESTS TAB
// ════════════════════════════════════════════════════════════════════════════
function CommissionTab() {
  const [requests, setRequests]   = useState<CommissionRequest[]>([]);
  const [loading,  setLoading]    = useState(true);
  const [filter,   setFilter]     = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [acting,   setActing]     = useState<string | null>(null);

  const load = useCallback((f = filter) => {
    setLoading(true);
    api.commissionRequests(f === "all" ? undefined : f)
      .then(r => setRequests(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, []);

  const handleReview = async (id: string, action: "approve" | "reject") => {
    setActing(id);
    try {
      await api.reviewCommission(id, action);
      toast.success(`Commission ${action}d`);
      setRequests(prev => prev.map(r => r.id === id ? { ...r, commission_status: action === "approve" ? "approved" : "rejected" } : r));
    } catch (e: any) { toast.error(e.message || "Action failed"); }
    finally { setActing(null); }
  };

  const handleFilter = (f: typeof filter) => { setFilter(f); load(f); };

  const counts = useMemo(() => ({
    pending:  requests.filter(r => r.commission_status === "pending").length,
    approved: requests.filter(r => r.commission_status === "approved").length,
    rejected: requests.filter(r => r.commission_status === "rejected").length,
  }), [requests]);

  return (
    <div className="space-y-4">
      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap">
        {([
          { key: "pending",  label: `Pending (${counts.pending})`,   color: filter === "pending"  ? "bg-yellow/10 border-yellow/30 text-yellow" : "" },
          { key: "approved", label: `Approved (${counts.approved})`, color: filter === "approved" ? "bg-green/10 border-green/30 text-green"   : "" },
          { key: "rejected", label: `Rejected (${counts.rejected})`, color: filter === "rejected" ? "bg-red/10 border-red/30 text-red"         : "" },
          { key: "all",      label: `All (${requests.length})`,      color: filter === "all"      ? "bg-cyan/10 border-cyan/30 text-cyan"       : "" },
        ] as const).map(f => (
          <button key={f.key} onClick={() => handleFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${f.color || "bg-bg2 border-border text-textMuted hover:text-text"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({length:4}).map((_,i) => <div key={i} className="h-20 bg-bg2 border border-border rounded-xl animate-pulse" />)}</div>
      ) : requests.length === 0 ? (
        <div className="bg-bg2 border border-border rounded-xl py-14 text-center">
          <ReceiptText size={32} className="text-textDim mx-auto mb-3" />
          <p className="text-textMuted text-sm">No commission requests</p>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map(r => (
            <div key={r.id} className="bg-bg2 border border-border rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-text font-bold text-sm">{r.driver_name}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      r.commission_status === "pending"  ? "bg-yellow/10 border-yellow/20 text-yellow" :
                      r.commission_status === "approved" ? "bg-green/10 border-green/20 text-green" :
                                                           "bg-red/10 border-red/20 text-red"
                    }`}>{r.commission_status}</span>
                  </div>
                  <p className="text-textMuted text-xs mt-0.5">Owner: <span className="text-text font-semibold">{r.owner_name}</span></p>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <PaymentModePill mode={r.payment_mode} pct={r.driver_commission_pct} target={r.daily_target} />
                    <span className="text-textDim text-[10px] font-mono">{r.driver_phone}</span>
                  </div>
                </div>
                {r.commission_status === "pending" && (
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => handleReview(r.id, "approve")} disabled={acting === r.id}
                      className="flex items-center gap-1 px-3 py-2 rounded-lg bg-green/10 border border-green/20 text-green text-xs font-bold hover:bg-green/20 transition-colors disabled:opacity-50">
                      <ThumbsUp size={11} /> Approve
                    </button>
                    <button onClick={() => handleReview(r.id, "reject")} disabled={acting === r.id}
                      className="flex items-center gap-1 px-3 py-2 rounded-lg bg-red/10 border border-red/20 text-red text-xs font-bold hover:bg-red/20 transition-colors disabled:opacity-50">
                      <ThumbsDown size={11} /> Reject
                    </button>
                  </div>
                )}
              </div>
              {r.commission_approved_at && (
                <p className="text-textDim text-[10px] mt-2">
                  Actioned {formatDate(r.commission_approved_at)} by {r.commission_approved_by || "admin"}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function FleetPage() {
  const [owners,      setOwners]      = useState<Owner[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [tab,         setTab]         = useState<"owners" | "commissions" | "leaderboard">("owners");
  const [sortBy,      setSortBy]      = useState<"drivers" | "cashup" | "balance" | "newest" | "name">("drivers");
  const [cashupFilter,setCashupFilter]= useState<"all" | "bank" | "wallet">("all");
  const [countdown,   setCountdown]   = useState(60);
  const [profileOwner,setProfileOwner]= useState<Owner | null>(null);
  const [pendingCount,setPendingCount]= useState(0);
  const timerRef = useRef<any>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.allSettled([
      api.owners(),
      fetch(`${BASE}/api/admin/fleet/reports`, { headers: authHdrs() }).then(r => r.json()),
      api.commissionRequests("pending"),
    ]).then(([ownersRes, fleetRes, commRes]) => {
      if (ownersRes.status === "fulfilled") setOwners(ownersRes.value.data);
      if (fleetRes.status  === "fulfilled") setLeaderboard(fleetRes.value?.fleet_earnings || []);
      if (commRes.status   === "fulfilled") setPendingCount(commRes.value.data.length);
    }).finally(() => setLoading(false));
  }, []);

  const refresh = useCallback(() => { load(); setCountdown(60); }, [load]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown(c => { if (c <= 1) { refresh(); return 60; } return c - 1; });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [refresh]);

  const stats = useMemo(() => {
    const totalDrivers = owners.reduce((s, o) => s + o.driver_count, 0);
    const totalBalance = owners.reduce((s, o) => s + o.balance, 0);
    const totalCashup  = owners.reduce((s, o) => s + o.total_cashup, 0);
    const bankCount    = owners.filter(o => o.cashup_method === "bank").length;
    const walletCount  = owners.filter(o => o.cashup_method === "wallet").length;
    const avgDrivers   = owners.length > 0 ? (totalDrivers / owners.length).toFixed(1) : "0";
    return { totalDrivers, totalBalance, totalCashup, bankCount, walletCount, avgDrivers };
  }, [owners]);

  const maxCashup = useMemo(() => owners.reduce((m, o) => Math.max(m, o.total_cashup), 0), [owners]);
  const lbTotal   = useMemo(() => leaderboard.reduce((s: number, f: any) => s + (f.fleet_total_earnings || 0), 0), [leaderboard]);

  const filtered = useMemo(() => owners
    .filter(o => cashupFilter === "all" || o.cashup_method === cashupFilter)
    .filter(o => !search ||
      o.full_name.toLowerCase().includes(search.toLowerCase()) ||
      o.phone_number.includes(search) ||
      (o.business_name || "").toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === "drivers")  return b.driver_count - a.driver_count;
      if (sortBy === "cashup")   return b.total_cashup - a.total_cashup;
      if (sortBy === "balance")  return b.balance - a.balance;
      if (sortBy === "newest")   return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === "name")     return a.full_name.localeCompare(b.full_name);
      return 0;
    }),
  [owners, search, sortBy, cashupFilter]);

  const exportCsv = () => {
    if (!filtered.length) return;
    const rows = [
      ["Name","Phone","Business","Drivers","Balance","Total Paid","Cashup Method","Bank","Joined"],
      ...filtered.map(o => [
        o.full_name, o.phone_number, o.business_name || "",
        o.driver_count, formatZAR(o.balance), formatZAR(o.total_cashup),
        o.cashup_method, o.bank_name || "", formatDate(o.created_at),
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "fleet-owners.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} owners`);
  };

  return (
    <AdminShell title="Fleet Owners">
      <div className="space-y-5">

        {/* ── Toolbar ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div />
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div className="w-20 h-1 bg-bg3 rounded-full overflow-hidden">
                <div className="h-full bg-cyan/50 rounded-full transition-all duration-1000" style={{ width: `${(countdown / 60) * 100}%` }} />
              </div>
              <span className="text-textDim text-[10px] w-5">{countdown}s</span>
            </div>
            <button onClick={refresh} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-textMuted hover:text-cyan border border-border rounded-lg transition-all">
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
            <button onClick={exportCsv} disabled={loading || !filtered.length}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-textMuted hover:text-text border border-border rounded-lg transition-all disabled:opacity-40">
              <Download size={12} /> Export
            </button>
          </div>
        </div>

        {/* ── Stats strip ── */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { label: "Owners",        value: owners.length,                  color: "text-text",     click: () => { setTab("owners"); setCashupFilter("all"); } },
            { label: "Total Drivers", value: stats.totalDrivers,             color: "text-cyan",     click: null },
            { label: "Avg Drivers",   value: stats.avgDrivers,               color: "text-purple",   click: null },
            { label: "Balances",      value: formatZAR(stats.totalBalance),  color: "text-yellow",   click: () => setSortBy("balance") },
            { label: "Total Paid",    value: formatZAR(stats.totalCashup),   color: "text-green",    click: () => setSortBy("cashup") },
            { label: "Bank / Wallet", value: `${stats.bankCount} / ${stats.walletCount}`, color: "text-textMuted", click: null },
          ].map(({ label, value, color, click }) => (
            <div key={label} onClick={() => click?.()}
              className={`bg-bg2 border border-border rounded-xl px-3 py-3 text-center ${click ? "cursor-pointer hover:border-cyan/40 transition-colors" : ""}`}>
              <p className={`text-base font-black tabular-nums ${color}`}>{value}</p>
              <p className="text-[9px] font-bold text-textDim uppercase tracking-wider mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div className="flex border-b border-border">
          {([
            { key: "owners",      label: `Owners (${owners.length})`,    badge: 0 },
            { key: "commissions", label: "Commission Requests",           badge: pendingCount },
            { key: "leaderboard", label: "Leaderboard",                   badge: 0 },
          ] as const).map(({ key, label, badge }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`relative px-5 py-3 text-xs font-bold border-b-2 transition-all ${
                tab === key ? "text-cyan border-cyan" : "text-textMuted border-transparent hover:text-text"
              }`}>
              {label}
              {badge > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-yellow text-bg text-[9px] font-black flex items-center justify-center">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ════ OWNERS TAB ════ */}
        {tab === "owners" && (
          <>
            {/* Search + filters */}
            <div className="space-y-2">
              <div className="flex gap-2 flex-wrap items-center">
                <div className="relative flex-1 min-w-[200px]">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-textDim" />
                  <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search name, phone, business…"
                    className="w-full pl-9 pr-8 py-2 bg-bg2 border border-border rounded-lg text-sm text-text placeholder:text-textDim focus:outline-none focus:border-cyan/50 transition-colors" />
                  {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-textDim hover:text-textMuted"><X size={13} /></button>}
                </div>
                <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
                  className="bg-bg2 border border-border rounded-lg px-3 py-2 text-xs text-textMuted focus:outline-none focus:border-cyan/50 font-bold">
                  <option value="drivers">Most Drivers</option>
                  <option value="cashup">Highest Paid</option>
                  <option value="balance">Highest Balance</option>
                  <option value="newest">Newest</option>
                  <option value="name">A → Z</option>
                </select>
              </div>

              {/* Cashup method filter */}
              <div className="flex items-center gap-2">
                <Filter size={11} className="text-textDim" />
                {([
                  { key: "all",    label: "All" },
                  { key: "bank",   label: `Bank (${stats.bankCount})` },
                  { key: "wallet", label: `Wallet (${stats.walletCount})` },
                ] as const).map(f => (
                  <button key={f.key} onClick={() => setCashupFilter(f.key)}
                    className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-all ${
                      cashupFilter === f.key
                        ? f.key === "bank" ? "bg-green/10 border-green/30 text-green"
                        : f.key === "wallet" ? "bg-cyan/10 border-cyan/30 text-cyan"
                        : "bg-bg3 border-border text-text"
                        : "bg-bg2 border-border text-textMuted hover:text-text"
                    }`}>
                    {f.label}
                  </button>
                ))}
                <span className="ml-auto text-textDim text-[10px]">
                  {filtered.length} / {owners.length} owners
                </span>
              </div>
            </div>

            {/* Owner rows */}
            <div className="space-y-2">
              {loading
                ? Array.from({length:6}).map((_,i) => <SkeletonRow key={i} />)
                : filtered.length === 0
                ? <div className="bg-bg2 border border-border rounded-xl py-14 text-center text-textMuted text-sm">No owners match filters</div>
                : filtered.map((o, idx) => {
                    const barPct  = maxCashup > 0 ? (o.total_cashup / maxCashup) * 100 : 0;
                    const isTop3  = sortBy === "cashup" && idx < 3;
                    const medals  = ["🥇", "🥈", "🥉"];
                    return (
                      <div key={o.user_id} onClick={() => setProfileOwner(o)}
                        className="bg-bg2 border border-border rounded-xl px-4 py-3 cursor-pointer hover:border-cyan/30 hover:bg-bg3/30 transition-all group flex items-center gap-3">

                        <div className="relative flex-shrink-0">
                          <Avatar name={o.full_name} />
                          {isTop3 && <span className="absolute -top-1 -right-1 text-[11px]">{medals[idx]}</span>}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-text font-bold text-sm group-hover:text-cyan transition-colors">{o.full_name}</p>
                            {o.business_name && (
                              <span className="text-[10px] bg-bg3 border border-border text-textMuted px-2 py-0.5 rounded-full font-semibold truncate max-w-[140px]">
                                {o.business_name}
                              </span>
                            )}
                            <CashupPill method={o.cashup_method} />
                          </div>
                          <div className="flex items-center gap-2 mt-1.5">
                            <div className="w-20 h-1 bg-bg3 rounded-full overflow-hidden">
                              <div className="h-full bg-green/60 rounded-full" style={{ width: `${barPct}%` }} />
                            </div>
                            <p className="text-green text-[10px] font-black tabular-nums">{formatZAR(o.total_cashup)}</p>
                          </div>
                        </div>

                        <div className="hidden sm:flex items-center gap-5 flex-shrink-0">
                          <div className="text-center">
                            <p className="text-cyan font-black text-sm">{o.driver_count}</p>
                            <p className="text-textDim text-[9px] font-bold uppercase tracking-wider">Drivers</p>
                          </div>
                          <div className="text-center">
                            <p className="text-yellow font-black text-sm tabular-nums">{formatZAR(o.balance)}</p>
                            <p className="text-textDim text-[9px] font-bold uppercase tracking-wider">Balance</p>
                          </div>
                        </div>

                        <ChevronRight size={14} className="text-textDim group-hover:text-cyan transition-colors flex-shrink-0" />
                      </div>
                    );
                  })
              }
            </div>
          </>
        )}

        {/* ════ COMMISSIONS TAB ════ */}
        {tab === "commissions" && <CommissionTab />}

        {/* ════ LEADERBOARD TAB ════ */}
        {tab === "leaderboard" && (
          <div className="space-y-3">
            {loading
              ? Array.from({length:5}).map((_,i) => <div key={i} className="h-20 bg-bg2 border border-border rounded-xl animate-pulse" />)
              : leaderboard.length === 0
              ? <div className="bg-bg2 border border-border rounded-xl py-14 text-center text-textMuted text-sm">No earnings data yet</div>
              : leaderboard.map((f: any, i: number) => {
                  const pct = lbTotal > 0 ? Math.round((f.fleet_total_earnings / lbTotal) * 100) : 0;
                  const medalStyle = i === 0 ? "bg-yellow/20 text-yellow border-yellow/20"
                    : i === 1 ? "bg-gray-400/20 text-gray-400 border-gray-400/20"
                    : i === 2 ? "bg-orange/20 text-orange border-orange/20"
                    : "bg-bg3 text-textMuted border-border";
                  const owner = owners.find(o => o.user_id === f.owner_id);
                  return (
                    <div key={f.owner_id}
                      onClick={() => owner && setProfileOwner(owner)}
                      className={`bg-bg2 border border-border rounded-xl p-4 ${owner ? "cursor-pointer hover:border-cyan/30 transition-colors" : ""}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm border flex-shrink-0 ${medalStyle}`}>
                            #{i + 1}
                          </div>
                          {owner
                            ? <Avatar name={owner.full_name} size="sm" />
                            : <div className="w-8 h-8 rounded-full bg-bg3 flex-shrink-0" />}
                          <div>
                            <p className="text-text font-bold">{f.owner_name}</p>
                            <p className="text-textMuted text-xs">
                              {f.driver_count} driver{f.driver_count !== 1 ? "s" : ""} · {pct}% of total
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-green font-black text-lg tabular-nums">{formatZAR(f.fleet_total_earnings)}</p>
                          <p className="text-textDim text-[10px]">fleet earnings</p>
                        </div>
                      </div>
                      <div className="h-1.5 bg-bg3 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-green to-cyan rounded-full transition-all duration-700"
                          style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })
            }
            {leaderboard.length > 0 && (
              <div className="bg-bg2 border border-border rounded-xl px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp size={14} className="text-green" />
                  <span className="text-textMuted text-xs font-bold">Total Fleet Earnings</span>
                </div>
                <span className="text-green font-black tabular-nums">{formatZAR(lbTotal)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {profileOwner && <OwnerModal owner={profileOwner} onClose={() => setProfileOwner(null)} />}
    </AdminShell>
  );
}
