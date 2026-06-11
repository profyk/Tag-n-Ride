"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import { Table, Tr, Td, Badge, Button, Spinner, Input, Select } from "@/components/ui";
import { api, Driver } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import { ExternalLink, CheckCircle, Star, X, Download, Printer, QrCode, ImageOff, RefreshCw, FileText, AlertTriangle, ShieldAlert } from "lucide-react";
import toast from "react-hot-toast";
import { DangerPinModal, useDangerPin } from "@/components/DangerPinModal";

const KYC_TONE: Record<string, any> = { approved: "green", pending: "yellow", rejected: "red" };

// ── QR code modal ─────────────────────────────────────────────────────────────

function QrModal({ driver, onClose, onQrGenerated }: { driver: Driver; onClose: () => void; onQrGenerated: (qrCode: string) => void }) {
  const [currentQr, setCurrentQr] = useState(driver.qr_code);
  const [imgStatus, setImgStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [generating, setGenerating] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Regenerate security flow
  const [regenModal, setRegenModal] = useState(false);
  const [regenReason, setRegenReason] = useState<"compromised" | "vehicle_change" | "">("");
  const [regenAcknowledged, setRegenAcknowledged] = useState(false);
  const { open: pinOpen, request: requestPin, handleSuccess: pinSuccess, handleCancel: pinCancel } = useDangerPin();

  // qr_code may be a Cloudinary/HTTP URL, a data: URI, or raw base64 without prefix
  const qrSrc = (() => {
    const v = currentQr;
    if (!v) return "";
    if (v.startsWith("data:") || v.startsWith("http")) return v;
    return `data:image/png;base64,${v}`;
  })();

  // First-time generation — no existing QR to invalidate
  const handleFirstGenerate = async () => {
    setGenerating(true);
    try {
      const res = await api.generateDriverQR(driver.user_id);
      const newQr = res.data.qr_code;
      setCurrentQr(newQr);
      setImgStatus("loading");
      onQrGenerated(newQr);
      toast.success("QR code generated");
    } catch (e: any) {
      toast.error(e.message || "Failed to generate QR code");
    } finally {
      setGenerating(false);
    }
  };

  // Opens the security confirmation modal for regeneration
  const handleRegenClick = () => {
    setRegenReason("");
    setRegenAcknowledged(false);
    setRegenModal(true);
  };

  // Executes regeneration after reason + acknowledgment + PIN
  const doRegenerate = async () => {
    if (!regenReason || !regenAcknowledged) return;
    setRegenModal(false);
    const token = await requestPin();
    if (!token) return;
    setGenerating(true);
    try {
      const res = await api.generateDriverQR(driver.user_id);
      const newQr = res.data.qr_code;
      setCurrentQr(newQr);
      setImgStatus("loading");
      onQrGenerated(newQr);
      toast.success("QR code regenerated — old code is now permanently invalid");
    } catch (e: any) {
      toast.error(e.message || "Failed to regenerate QR code");
    } finally {
      setGenerating(false);
    }
  };

  const safeName = driver.full_name.replace(/[^a-zA-Z0-9]/g, "-");

  const handleDownload = async () => {
    if (!qrSrc) return;
    try {
      if (qrSrc.startsWith("data:")) {
        const a = document.createElement("a");
        a.href = qrSrc;
        a.download = `qr-${safeName}.png`;
        a.click();
        return;
      }
      const res = await fetch(qrSrc);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `qr-${safeName}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("QR code downloaded");
    } catch {
      toast.error("Download failed");
    }
  };

  const handlePrint = () => {
    if (!qrSrc) return;
    const pw = window.open("", "_blank", "width=500,height=600");
    if (!pw) { toast.error("Allow pop-ups to print"); return; }
    pw.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Tag-n-Ride Driver QR Code</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #fff; color: #111;
      padding: 32px;
    }
    .logo { font-size: 13px; font-weight: 800; letter-spacing: 2px;
            color: #888; text-transform: uppercase; margin-bottom: 24px; }
    .name { font-size: 22px; font-weight: 700; margin-bottom: 6px; }
    .id   { font-size: 11px; color: #888; font-family: monospace;
            margin-bottom: 24px; }
    img   { width: 260px; height: 260px; display: block; }
    .note { font-size: 11px; color: #aaa; margin-top: 20px; text-align: center; }
    @media print {
      @page { margin: 0; size: A5; }
      body { padding: 16px; }
    }
  </style>
</head>
<body>
  <p class="logo">Tag-n-Ride</p>
  <p class="name">${driver.full_name}</p>
  <p class="id">ID: ${driver.user_id}</p>
  <img src="${qrSrc}" alt="QR Code" />
  <p class="note">Scan to identify this driver</p>
  <script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`);
    pw.document.close();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}>
      <div
        className="bg-bg2 border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-text font-bold text-base">{driver.full_name}</h3>
            <p className="text-textDim text-[10px] font-mono mt-0.5">ID: {driver.user_id}</p>
          </div>
          <button
            onClick={onClose}
            className="text-textDim hover:text-text transition-colors p-1 rounded-lg hover:bg-bg3">
            <X size={16} />
          </button>
        </div>

        {/* QR image */}
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
                <p className="text-gray-500 text-xs text-center font-medium">
                  {!qrSrc ? "No QR code yet" : "Failed to load QR code"}
                </p>
                <button
                  onClick={currentQr ? handleRegenClick : handleFirstGenerate}
                  disabled={generating}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-black text-white text-xs font-bold rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50">
                  {generating ? <RefreshCw size={11} className="animate-spin" /> : <QrCode size={11} />}
                  {generating ? "Generating…" : (currentQr ? "Regenerate QR" : "Generate QR")}
                </button>
              </div>
            ) : (
              <img
                ref={imgRef}
                src={qrSrc}
                alt={`QR code for ${driver.full_name}`}
                className={`w-full h-full object-contain transition-opacity duration-200 ${imgStatus === "loaded" ? "opacity-100" : "opacity-0"}`}
                onLoad={() => setImgStatus("loaded")}
                onError={() => setImgStatus("error")}
              />
            )}
          </div>
        </div>

        {/* Plate badge */}
        {driver.vehicle_plate && (
          <div className="flex justify-center mb-5">
            <span className="font-mono text-sm bg-yellow/10 text-yellow px-3 py-1 rounded-lg border border-yellow/20 font-bold">
              {driver.vehicle_plate}
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="flex-1 justify-center"
            onClick={handleDownload}
            disabled={!qrSrc || imgStatus === "error" || generating}>
            <Download size={13} /> Download PNG
          </Button>
          <Button
            className="flex-1 justify-center"
            onClick={handlePrint}
            disabled={!qrSrc || imgStatus === "error" || generating}>
            <Printer size={13} /> Print
          </Button>
        </div>

        {/* Regenerate — only shown when a QR already exists */}
        {currentQr && (
          <button
            onClick={handleRegenClick}
            disabled={generating}
            className="w-full mt-3 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold text-red/70 border border-red/20 bg-red/5 hover:bg-red/10 hover:text-red transition-all disabled:opacity-40">
            <RefreshCw size={11} />
            Regenerate QR Code
          </button>
        )}

        <p className="text-textDim text-[10px] text-center mt-3">
          Phone number is excluded from this QR code for driver privacy.
        </p>
      </div>

      {/* ── Regenerate Security Confirmation ─────────────────────────────── */}
      {regenModal && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setRegenModal(false)}>
          <div
            className="bg-bg2 border border-red/30 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5"
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red/10 border border-red/20 flex items-center justify-center flex-shrink-0">
                <ShieldAlert size={18} className="text-red" />
              </div>
              <div>
                <h3 className="text-text font-bold text-base">Regenerate QR Code</h3>
                <p className="text-textMuted text-xs mt-0.5">{driver.full_name}</p>
              </div>
            </div>

            {/* Warning */}
            <div className="flex items-start gap-3 p-3 bg-red/5 border border-red/20 rounded-xl">
              <AlertTriangle size={14} className="text-red flex-shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="text-red font-semibold">The driver's current printed QR code will be permanently invalidated.</p>
                <p className="text-textMuted">Passengers scanning the old QR will receive an error. A new QR must be physically reprinted and handed to the driver before they can accept payments.</p>
              </div>
            </div>

            {/* Reason selection */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest">Reason for regeneration <span className="text-red">*</span></p>
              {([
                { value: "compromised", label: "QR code reported as compromised or stolen", sub: "Someone may have photographed or duplicated the driver's QR" },
                { value: "vehicle_change", label: "Driver has changed taxi / vehicle", sub: "New vehicle requires a new QR linked to the correct plate" },
              ] as const).map(({ value, label, sub }) => (
                <label
                  key={value}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    regenReason === value
                      ? "bg-cyan/5 border-cyan/30"
                      : "border-border hover:border-cyan/20"
                  }`}>
                  <input
                    type="radio"
                    name="regenReason"
                    value={value}
                    checked={regenReason === value}
                    onChange={() => setRegenReason(value)}
                    className="mt-0.5 accent-cyan"
                  />
                  <div>
                    <p className="text-text text-sm font-semibold">{label}</p>
                    <p className="text-textDim text-[11px] mt-0.5">{sub}</p>
                  </div>
                </label>
              ))}
            </div>

            {/* Acknowledgment */}
            <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
              regenAcknowledged ? "bg-yellow/5 border-yellow/30" : "border-border hover:border-yellow/20"
            }`}>
              <input
                type="checkbox"
                checked={regenAcknowledged}
                onChange={e => setRegenAcknowledged(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-yellow"
              />
              <p className="text-textMuted text-xs">
                I confirm that the current printed QR code will be <strong className="text-text">destroyed and replaced</strong>. The driver has been informed and the old code will no longer function.
              </p>
            </label>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setRegenModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-bg3 border border-border text-textMuted text-sm font-bold hover:text-text transition-colors">
                Cancel
              </button>
              <button
                onClick={doRegenerate}
                disabled={!regenReason || !regenAcknowledged}
                className="flex-1 py-2.5 rounded-xl bg-red/20 border border-red/30 text-red text-sm font-bold disabled:opacity-40 hover:bg-red/30 transition-colors flex items-center justify-center gap-2">
                <RefreshCw size={13} />
                Regenerate QR
              </button>
            </div>
          </div>
        </div>
      )}

      <DangerPinModal
        open={pinOpen}
        onSuccess={pinSuccess}
        onCancel={pinCancel}
        actionLabel="regenerate this driver's QR code"
      />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "verified">("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"default" | "earnings" | "rating" | "newest">("default");
  const [qrDriver, setQrDriver] = useState<Driver | null>(null);

  const load = () => {
    setLoading(true);
    api.drivers().then((r) => setDrivers(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleVerify = async (userId: string, name: string) => {
    try {
      await api.verifyDriver(userId);
      toast.success(`${name} verified`);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const filtered = drivers
    .filter((d) => {
      if (filter === "pending") return !d.is_verified;
      if (filter === "verified") return d.is_verified;
      return true;
    })
    .filter((d) =>
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
    });

  const verified  = drivers.filter((d) => d.is_verified).length;
  const pending   = drivers.filter((d) => !d.is_verified).length;
  const ratedDrivers = drivers.filter((d) => d.rating_count > 0);
  const avgRating = ratedDrivers.length > 0
    ? ratedDrivers.reduce((s, d) => s + d.rating_avg, 0) / ratedDrivers.length
    : null;

  const exportCsv = () => {
    const rows = [
      ["Name", "Phone", "Plate", "Earnings", "Rating", "Reviews", "KYC", "Status", "Joined"],
      ...filtered.map((d) => [
        d.full_name, d.phone_number, d.vehicle_plate || "",
        formatZAR(d.total_earnings),
        d.rating_count > 0 ? d.rating_avg.toFixed(1) : "—", d.rating_count.toString(),
        d.kyc_status || "none",
        d.is_verified ? "Verified" : "Pending",
        d.created_at ? formatDate(d.created_at) : "",
      ]),
    ];
    const csv = rows.map(r => r.map((c: string | number) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `drivers-${filter}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} drivers`);
  };

  return (
    <AdminShell title="Driver Management">
      <div className="space-y-4">

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Total Drivers", value: drivers.length,          color: "text-cyan",   filter: "all"      as const },
            { label: "Verified",      value: verified,                color: "text-green",  filter: "verified" as const },
            { label: "Pending",       value: pending,                 color: "text-yellow", filter: "pending"  as const },
            { label: "Avg Rating",    value: avgRating != null ? `${avgRating.toFixed(1)} ★` : "—", color: "text-yellow", filter: null },
          ].map(({ label, value, color, filter: f }) => (
            <div
              key={label}
              className={`bg-bg2 border border-border rounded-xl p-5 text-center ${f ? "cursor-pointer hover:border-cyan transition-colors" : ""}`}
              onClick={() => f && setFilter(f)}>
              <p className={`text-2xl font-extrabold ${color}`}>{value}</p>
              <p className="text-xs text-textMuted mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex gap-3 flex-wrap items-center">
          <div className="flex gap-2 flex-1 min-w-0">
            <Input
              placeholder="Search name, phone, plate..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <Button variant="ghost" onClick={() => setSearch("")}><X size={13} /></Button>
            )}
          </div>

          <Select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="w-40">
            <option value="default">Sort: Default</option>
            <option value="earnings">Sort: Top Earners</option>
            <option value="rating">Sort: Best Rated</option>
            <option value="newest">Sort: Newest</option>
          </Select>

          <div className="flex gap-2">
            {(["all", "pending", "verified"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all capitalize ${
                  filter === f ? "bg-cyanDim text-cyan border-cyan/20" : "bg-bg2 text-textMuted border-border hover:text-text"
                }`}>
                {f}
              </button>
            ))}
          </div>

          <Button variant="secondary" onClick={exportCsv} disabled={loading || filtered.length === 0}>
            <Download size={13} /> Export CSV
          </Button>
        </div>

        {/* Results count */}
        <p className="text-xs text-textMuted">
          {loading ? "Loading…" : `${filtered.length} driver${filtered.length !== 1 ? "s" : ""}`}
        </p>

        {loading ? <Spinner /> : (
          <Table
            headers={["Driver", "Plate", "Earnings", "Rating", "KYC", "Status", "Joined", "Actions"]}
            empty={!filtered.length}>
            {filtered.map((d) => (
              <Tr key={d.user_id}>
                {/* Name only — phone number removed for security */}
                <Td>
                  <p className="font-semibold">{d.full_name}</p>
                </Td>
                <Td>
                  {d.vehicle_plate ? (
                    <span className="font-mono text-xs bg-yellow/10 text-yellow px-2 py-0.5 rounded border border-yellow/20">
                      {d.vehicle_plate}
                    </span>
                  ) : (
                    <span className="text-textDim text-xs">No plate</span>
                  )}
                </Td>
                <Td className="font-bold text-green">{formatZAR(d.total_earnings)}</Td>
                <Td>
                  {d.rating_count > 0 ? (
                    <span className="flex items-center gap-1 text-yellow text-xs font-bold">
                      <Star size={11} fill="currentColor" />
                      {d.rating_avg.toFixed(1)}
                      <span className="text-textMuted font-normal">({d.rating_count})</span>
                    </span>
                  ) : (
                    <span className="text-textMuted text-xs italic">New</span>
                  )}
                </Td>
                <Td>
                  <Badge label={d.kyc_status || "none"} tone={KYC_TONE[d.kyc_status] || "muted"} />
                </Td>
                <Td>
                  <Badge label={d.is_verified ? "Verified" : "Pending"} tone={d.is_verified ? "green" : "yellow"} />
                </Td>
                <Td className="text-textMuted text-xs">{d.created_at ? formatDate(d.created_at) : "—"}</Td>
                <Td>
                  <div className="flex items-center gap-2">
                    {!d.is_verified && (
                      <Button variant="secondary" onClick={() => handleVerify(d.user_id, d.full_name)}>
                        <CheckCircle size={13} /> Verify
                      </Button>
                    )}
                    <Button variant="ghost" onClick={() => setQrDriver(d)} title={d.qr_code ? "View / Print QR code" : "Generate QR code"}>
                      <QrCode size={13} className={d.qr_code ? "" : "text-textDim"} />
                    </Button>
                    <Link href={`/admin/drivers/${d.user_id}/statements`}>
                      <Button variant="ghost" title="View earnings documents">
                        <FileText size={13} /> Documents
                      </Button>
                    </Link>
                    <Link href={`/admin/drivers/${d.user_id}`}>
                      <Button variant="ghost">
                        <ExternalLink size={13} /> View
                      </Button>
                    </Link>
                  </div>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </div>

      {qrDriver && (
        <QrModal
          driver={qrDriver}
          onClose={() => setQrDriver(null)}
          onQrGenerated={(qrCode) => {
            setDrivers(prev => prev.map(d => d.user_id === qrDriver.user_id ? { ...d, qr_code: qrCode } : d));
            setQrDriver(prev => prev ? { ...prev, qr_code: qrCode } : null);
          }}
        />
      )}
    </AdminShell>
  );
}
