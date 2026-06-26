"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import { Table, Tr, Td, Badge, Button, Spinner, Input, Modal } from "@/components/ui";
import { api, Owner } from "@/lib/api";
import { formatZAR, formatDate, SA_PROVINCES } from "@/lib/utils";
import {
  ExternalLink, X, Download, Printer, QrCode, ImageOff, RefreshCw,
  Wallet, Banknote, Search, Building2, Users, TrendingUp, CheckCircle2,
  ChevronRight, Phone, Mail, MapPin, CreditCard, Car, Receipt, FileText,
  ArrowUpDown, Clock,
} from "lucide-react";
import toast from "react-hot-toast";
import QRCode from "qrcode";

// ── Avatar ────────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-purple/20 text-purple border-purple/30",
  "bg-cyan/20 text-cyan border-cyan/30",
  "bg-green/20 text-green border-green/30",
  "bg-yellow/20 text-yellow border-yellow/30",
  "bg-orange-400/20 text-orange-400 border-orange-400/30",
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

// ── QR modal ──────────────────────────────────────────────────────────────────

async function generateQRWithLogo(text: string): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 400;
  await (QRCode as any).toCanvas(canvas, text, {
    width: 400, margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
    errorCorrectionLevel: "H",
  });
  const ctx = canvas.getContext("2d")!;
  const cx = 200, cy = 200, r = 46;
  ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff"; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#00D4FF"; ctx.fill();
  ctx.fillStyle = "#05050A";
  ctx.font = "900 22px 'Arial Black', Arial, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("TNR", cx, cy);
  return canvas.toDataURL("image/png");
}

function QrModal({ owner, onClose }: { owner: Owner; onClose: () => void }) {
  const [qrSrc, setQrSrc] = useState("");

  useEffect(() => {
    if (!owner.qr_code) { setQrSrc(""); return; }
    setQrSrc("");
    generateQRWithLogo(owner.qr_code).then(setQrSrc).catch(() => setQrSrc("error"));
  }, [owner.qr_code]);

  const imgStatus: "loading" | "loaded" | "error" =
    qrSrc === "error" ? "error" : qrSrc ? "loaded" : "loading";

  const safeName = owner.full_name.replace(/[^a-zA-Z0-9]/g, "-");

  const handleDownload = () => {
    if (!qrSrc || qrSrc === "error") return;
    const a = document.createElement("a");
    a.href = qrSrc; a.download = `qr-${safeName}.png`; a.click();
    toast.success("QR code downloaded");
  };

  const handlePrint = () => {
    if (!qrSrc || qrSrc === "error") return;
    const pw = window.open("", "_blank", "width=500,height=600");
    if (!pw) { toast.error("Allow pop-ups to print"); return; }
    pw.document.write(`<!DOCTYPE html>
<html><head><title>Tag-n-Ride Owner QR</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { display:flex; flex-direction:column; align-items:center; justify-content:center;
         min-height:100vh; font-family:-apple-system,sans-serif; background:#fff; padding:32px; }
  .logo { font-size:13px; font-weight:800; letter-spacing:2px; color:#888;
          text-transform:uppercase; margin-bottom:24px; }
  .name { font-size:22px; font-weight:700; margin-bottom:4px; }
  .biz  { font-size:13px; color:#888; margin-bottom:20px; }
  img   { width:260px; height:260px; display:block; }
  @media print { @page { margin:0; size:A5; } body { padding:16px; } }
</style></head>
<body>
  <p class="logo">Tag-n-Ride</p>
  <p class="name">${owner.full_name}</p>
  ${owner.business_name ? `<p class="biz">${owner.business_name}</p>` : ""}
  <img src="${qrSrc}" alt="QR Code" />
  <script>window.onload=function(){window.print();}<\/script>
</body></html>`);
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
            <h3 className="text-text font-bold text-base">{owner.full_name}</h3>
            {owner.business_name && <p className="text-textMuted text-xs mt-0.5">{owner.business_name}</p>}
            <p className="text-textDim text-[10px] font-mono mt-0.5">{owner.phone_number}</p>
          </div>
          <button onClick={onClose} className="text-textDim hover:text-text transition-colors p-1 rounded-lg hover:bg-bg3">
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center justify-center mb-5">
          <div className="relative w-56 h-56 bg-white rounded-2xl p-3 shadow-inner">
            {!owner.qr_code ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-gray-50 p-4">
                <ImageOff size={24} className="text-gray-400" />
                <p className="text-gray-500 text-xs text-center font-medium">No QR code generated yet</p>
              </div>
            ) : imgStatus === "loading" ? (
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white">
                <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
              </div>
            ) : imgStatus === "error" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-gray-50 p-4">
                <ImageOff size={24} className="text-gray-400" />
                <p className="text-gray-500 text-xs text-center font-medium">Failed to render QR code</p>
              </div>
            ) : (
              <img src={qrSrc} alt={`QR for ${owner.full_name}`} className="w-full h-full object-contain" />
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1 justify-center" onClick={handleDownload} disabled={!qrSrc || imgStatus !== "loaded"}>
            <Download size={13} /> Download
          </Button>
          <Button className="flex-1 justify-center" onClick={handlePrint} disabled={!qrSrc || imgStatus !== "loaded"}>
            <Printer size={13} /> Print
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Owner detail modal ────────────────────────────────────────────────────────

function OwnerDetailModal({ owner, onClose, onQr }: {
  owner: Owner; onClose: () => void; onQr: () => void;
}) {
  const hasBankDetails = owner.bank_name || (owner as any).account_number;
  return (
    <Modal open onClose={onClose} title="Fleet Owner Profile" size="lg">
      <div className="space-y-5">

        {/* Identity hero */}
        <div className="rounded-xl p-5 border bg-bg border-border flex items-start gap-4">
          <Avatar name={owner.full_name} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-text font-black text-lg">{owner.full_name}</p>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                owner.is_active !== false
                  ? "bg-green/10 border-green/20 text-green"
                  : "bg-red/10 border-red/20 text-red"
              }`}>
                {owner.is_active !== false ? "ACTIVE" : "INACTIVE"}
              </span>
            </div>
            {owner.business_name && (
              <p className="text-cyan text-sm font-semibold flex items-center gap-1.5 mt-1">
                <Building2 size={12} /> {owner.business_name}
              </p>
            )}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
              {owner.phone_number && (
                <div className="flex items-center gap-1.5 text-textMuted text-xs">
                  <Phone size={10} /> {owner.phone_number}
                </div>
              )}
              {(owner as any).email && (
                <div className="flex items-center gap-1.5 text-textMuted text-xs">
                  <Mail size={10} /> {(owner as any).email}
                </div>
              )}
              {owner.province && (
                <div className="flex items-center gap-1.5 text-textDim text-xs">
                  <MapPin size={10} /> {owner.province}
                </div>
              )}
              <div className="flex items-center gap-1.5 text-textDim text-xs">
                <Clock size={10} /> Joined {formatDate(owner.created_at)}
              </div>
            </div>
          </div>
        </div>

        {/* Financial summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-bg2 border border-border rounded-xl p-4 text-center">
            <p className="text-[9px] font-bold text-textDim uppercase tracking-widest mb-1">Wallet Balance</p>
            <p className="text-cyan font-black text-xl tabular-nums">{formatZAR(owner.balance)}</p>
          </div>
          <div className="bg-bg2 border border-border rounded-xl p-4 text-center">
            <p className="text-[9px] font-bold text-textDim uppercase tracking-widest mb-1">Total Cashup</p>
            <p className="text-green font-black text-xl tabular-nums">{formatZAR(owner.total_cashup)}</p>
          </div>
          <div className="bg-bg2 border border-border rounded-xl p-4 text-center">
            <p className="text-[9px] font-bold text-textDim uppercase tracking-widest mb-1">Fleet Size</p>
            <p className="text-purple font-black text-xl tabular-nums">{owner.driver_count}</p>
            <p className="text-textDim text-[10px]">driver{owner.driver_count !== 1 ? "s" : ""}</p>
          </div>
        </div>

        {/* Fleet & Cashup */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-bg2 border border-border rounded-xl p-4">
            <p className="text-[10px] font-bold text-textDim uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <Car size={10} /> Fleet Info
            </p>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-textMuted">Cashup Method</span>
                <Badge
                  label={owner.cashup_method === "wallet" ? "Wallet" : "Bank Transfer"}
                  tone={owner.cashup_method === "wallet" ? "cyan" : "purple"}
                />
              </div>
              {(owner as any).subscription_status && (
                <div className="flex justify-between text-xs">
                  <span className="text-textMuted">Subscription</span>
                  <Badge
                    label={(owner as any).subscription_status}
                    tone={(owner as any).subscription_status === "active" ? "green" : "muted"}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Payout Account */}
          <div className="bg-bg2 border border-border rounded-xl p-4">
            <p className="text-[10px] font-bold text-textDim uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <Banknote size={10} /> Payout Account
            </p>
            {hasBankDetails ? (
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-textMuted">Bank</span>
                  <span className="text-text font-semibold">{owner.bank_name || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-textMuted">Account</span>
                  <span className="text-text font-mono font-semibold">{(owner as any).account_number || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-textMuted">Name</span>
                  <span className="text-text font-semibold">{(owner as any).account_name || "—"}</span>
                </div>
              </div>
            ) : (
              <p className="text-textDim text-xs italic">No bank account set up</p>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onQr}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border text-textMuted text-xs font-bold hover:text-cyan hover:border-cyan/30 transition-all">
            <QrCode size={13} /> {owner.qr_code ? "View QR Code" : "No QR Code"}
          </button>
          <Link href={`/admin/owners/${owner.user_id}`} onClick={onClose}>
            <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-cyan/10 border border-cyan/20 text-cyan text-xs font-bold hover:bg-cyan/20 transition-all">
              <ExternalLink size={13} /> Open Full Profile
            </button>
          </Link>
          <Link href={`/admin/transactions?user_id=${owner.user_id}`} onClick={onClose}>
            <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border text-textMuted text-xs font-bold hover:text-text transition-all">
              <Receipt size={13} /> Transactions
            </button>
          </Link>
          <Link href={`/admin/drivers?owner_id=${owner.user_id}`} onClick={onClose}>
            <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border text-textMuted text-xs font-bold hover:text-text transition-all">
              <Users size={13} /> View Drivers ({owner.driver_count})
            </button>
          </Link>
        </div>
      </div>
    </Modal>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type SortKey = "default" | "name" | "fleet" | "cashup" | "newest";

export default function OwnersPage() {
  const [owners, setOwners]           = useState<Owner[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");
  const [provinceFilter, setProvinceFilter] = useState("all");
  const [sortBy, setSortBy]           = useState<SortKey>("default");
  const [countdown, setCountdown]     = useState(30);
  const [refreshing, setRefreshing]   = useState(false);

  const [detailOwner, setDetailOwner] = useState<Owner | null>(null);
  const [qrOwner, setQrOwner]         = useState<Owner | null>(null);

  const timerRef = useRef<any>(null);

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    api.owners()
      .then(r => setOwners(r.data))
      .catch(() => toast.error("Failed to load fleet owners"))
      .finally(() => { setLoading(false); setRefreshing(false); setCountdown(30); });
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(() => {
      setCountdown(c => { if (c <= 1) { load(true); return 30; } return c - 1; });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [load]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const stats = useMemo(() => ({
    total:      owners.length,
    drivers:    owners.reduce((s, o) => s + o.driver_count, 0),
    cashup:     owners.reduce((s, o) => s + o.total_cashup, 0),
    withBank:   owners.filter(o => o.bank_name).length,
    active:     owners.filter(o => o.is_active !== false).length,
  }), [owners]);

  const filtered = useMemo(() => {
    let list = owners.filter(o =>
      (!search ||
        o.full_name.toLowerCase().includes(search.toLowerCase()) ||
        o.phone_number.includes(search) ||
        (o.business_name || "").toLowerCase().includes(search.toLowerCase()) ||
        ((o as any).email || "").toLowerCase().includes(search.toLowerCase())) &&
      (provinceFilter === "all" || (o.province || "Unset") === provinceFilter)
    );
    if (sortBy === "name")    list = [...list].sort((a, b) => a.full_name.localeCompare(b.full_name));
    if (sortBy === "fleet")   list = [...list].sort((a, b) => b.driver_count - a.driver_count);
    if (sortBy === "cashup")  list = [...list].sort((a, b) => b.total_cashup - a.total_cashup);
    if (sortBy === "newest")  list = [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return list;
  }, [owners, search, provinceFilter, sortBy]);

  const exportCsv = () => {
    const rows = [
      ["Name", "Phone", "Email", "Business", "Province", "Drivers", "Total Cashup", "Balance", "Cashup Method", "Bank", "Account No", "Joined"],
      ...filtered.map(o => [
        o.full_name, o.phone_number, (o as any).email || "", o.business_name || "", o.province || "",
        o.driver_count.toString(), formatZAR(o.total_cashup), formatZAR(o.balance),
        o.cashup_method, o.bank_name || "", (o as any).account_number || "", formatDate(o.created_at),
      ]),
    ];
    const csv = rows.map(r => r.map((c: string | number) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "fleet-owners.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} owners`);
  };

  const hasFilters = search || provinceFilter !== "all" || sortBy !== "default";

  return (
    <AdminShell title="Fleet Owners" subtitle="Manage fleet owners, their drivers, and payout accounts">
      <div className="space-y-5">

        {/* ── Stats strip ── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Total Owners",    value: stats.total,                         color: "text-text"   },
            { label: "Active",          value: stats.active,                        color: "text-green"  },
            { label: "Total Drivers",   value: stats.drivers,                       color: "text-purple" },
            { label: "Total Cashup",    value: formatZAR(stats.cashup),             color: "text-green"  },
            { label: "Bank Configured", value: `${stats.withBank} / ${stats.total}`,color: "text-yellow" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-bg2 border border-border rounded-xl px-3 py-3 text-center">
              <p className={`text-xl font-black tabular-nums ${color}`}>{value}</p>
              <p className="text-[9px] font-bold text-textDim uppercase tracking-wider mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* ── Controls ── */}
        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-textDim" />
            <input
              placeholder="Search name, phone, business, email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-bg2 border border-border rounded-lg text-sm text-text placeholder:text-textDim focus:outline-none focus:border-cyan/50 transition-colors"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-textDim hover:text-textMuted">
                <X size={13} />
              </button>
            )}
          </div>

          <select value={sortBy} onChange={e => setSortBy(e.target.value as SortKey)}
            className="bg-bg2 border border-border rounded-lg px-3 py-2 text-xs text-textMuted focus:outline-none focus:border-cyan/50 font-bold">
            <option value="default">Sort: Default</option>
            <option value="name">Sort: Name A–Z</option>
            <option value="fleet">Sort: Fleet Size</option>
            <option value="cashup">Sort: Total Cashup</option>
            <option value="newest">Sort: Newest</option>
          </select>

          <select value={provinceFilter} onChange={e => setProvinceFilter(e.target.value)}
            className="bg-bg2 border border-border rounded-lg px-3 py-2 text-xs text-textMuted focus:outline-none focus:border-cyan/50 font-bold">
            <option value="all">All Provinces</option>
            {SA_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
            <option value="Unset">Unset</option>
          </select>

          {hasFilters && (
            <button onClick={() => { setSearch(""); setProvinceFilter("all"); setSortBy("default"); }}
              className="flex items-center gap-1 px-3 py-2 text-xs font-bold text-red border border-red/20 rounded-lg hover:bg-red/5 transition-all">
              <X size={12} /> Clear
            </button>
          )}

          {/* Refresh countdown */}
          <div className="flex items-center gap-2">
            <div className="w-16 h-1 bg-bg3 rounded-full overflow-hidden">
              <div className="h-full bg-cyan/50 rounded-full transition-all duration-1000"
                style={{ width: `${(countdown / 30) * 100}%` }} />
            </div>
            <span className="text-textDim text-[10px] w-6">{countdown}s</span>
          </div>
          <button onClick={() => load(true)} disabled={loading || refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-textMuted hover:text-cyan border border-border rounded-lg transition-all">
            <RefreshCw size={12} className={(loading || refreshing) ? "animate-spin" : ""} /> Refresh
          </button>
          <Button variant="secondary" onClick={exportCsv} disabled={loading || filtered.length === 0}>
            <Download size={13} /> Export CSV
          </Button>
        </div>

        {/* ── Counter ── */}
        <p className="text-textDim text-[10px]">
          Showing <span className="text-text font-bold">{filtered.length.toLocaleString()}</span> of{" "}
          <span className="text-text font-bold">{owners.length.toLocaleString()}</span> fleet owner{owners.length !== 1 ? "s" : ""}
          {hasFilters ? " (filtered)" : ""}
        </p>

        {/* ── Table ── */}
        {loading ? <Spinner /> : (
          <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-bg3">
                    {["Owner", "Contact", "Province", "Fleet", "Wallet Balance", "Total Cashup", "Cashup Method", "Bank Setup", "Joined", ""].map(h => (
                      <th key={h} className="text-left py-3 px-4 text-[10px] font-bold text-textDim uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-16 text-center text-textMuted text-sm">
                        No fleet owners match current filters
                      </td>
                    </tr>
                  ) : filtered.map(o => (
                    <tr key={o.user_id}
                      onClick={() => setDetailOwner(o)}
                      className="border-b border-border cursor-pointer hover:bg-bg3/50 transition-colors">

                      {/* Owner identity */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={o.full_name} size="sm" />
                          <div>
                            <p className="font-bold text-text">{o.full_name}</p>
                            {o.business_name
                              ? <p className="text-textDim text-[10px] flex items-center gap-0.5"><Building2 size={9} /> {o.business_name}</p>
                              : <p className="text-textDim text-[10px] italic">No business name</p>}
                          </div>
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="py-3 px-4">
                        <p className="font-mono text-[11px] text-textMuted">{o.phone_number || "—"}</p>
                        {(o as any).email && <p className="text-[10px] text-textDim">{(o as any).email}</p>}
                      </td>

                      {/* Province */}
                      <td className="py-3 px-4 text-textMuted text-[11px]">{o.province || "—"}</td>

                      {/* Fleet size */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <Users size={11} className="text-purple" />
                          <span className="font-bold text-purple text-sm">{o.driver_count}</span>
                          <span className="text-textDim text-[10px]">driver{o.driver_count !== 1 ? "s" : ""}</span>
                        </div>
                      </td>

                      {/* Wallet balance */}
                      <td className="py-3 px-4">
                        <p className="font-black text-cyan tabular-nums">{formatZAR(o.balance)}</p>
                      </td>

                      {/* Total cashup */}
                      <td className="py-3 px-4">
                        <p className="font-bold text-green tabular-nums">{formatZAR(o.total_cashup)}</p>
                      </td>

                      {/* Cashup method */}
                      <td className="py-3 px-4">
                        <Badge
                          label={o.cashup_method === "wallet" ? "Wallet" : "Bank"}
                          tone={o.cashup_method === "wallet" ? "cyan" : "purple"}
                        />
                      </td>

                      {/* Bank setup */}
                      <td className="py-3 px-4">
                        {o.bank_name
                          ? <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green">
                              <CheckCircle2 size={10} /> {o.bank_name}
                            </span>
                          : <span className="text-textDim text-[10px] italic">Not set</span>}
                      </td>

                      {/* Joined */}
                      <td className="py-3 px-4 text-textDim whitespace-nowrap">{formatDate(o.created_at)}</td>

                      {/* Arrow */}
                      <td className="py-3 px-4">
                        <ChevronRight size={13} className="text-textDim" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Owner detail modal ── */}
      {detailOwner && (
        <OwnerDetailModal
          owner={detailOwner}
          onClose={() => setDetailOwner(null)}
          onQr={() => { setQrOwner(detailOwner); setDetailOwner(null); }}
        />
      )}

      {/* ── QR modal ── */}
      {qrOwner && <QrModal owner={qrOwner} onClose={() => setQrOwner(null)} />}
    </AdminShell>
  );
}
