"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import { Table, Tr, Td, Badge, Button, Spinner, Input } from "@/components/ui";
import { api, Owner } from "@/lib/api";
import { formatZAR, formatDate, SA_PROVINCES } from "@/lib/utils";
import { ExternalLink, X, Download, Printer, QrCode, ImageOff, RefreshCw, Wallet, Banknote } from "lucide-react";
import toast from "react-hot-toast";
import QRCode from "qrcode";

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
              <img
                src={qrSrc}
                alt={`QR for ${owner.full_name}`}
                className="w-full h-full object-contain"
              />
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OwnersPage() {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [provinceFilter, setProvinceFilter] = useState("all");
  const [qrOwner, setQrOwner] = useState<Owner | null>(null);

  useEffect(() => {
    api.owners().then(r => setOwners(r.data)).finally(() => setLoading(false));
  }, []);

  const filtered = owners.filter(o =>
    (!search ||
      o.full_name.toLowerCase().includes(search.toLowerCase()) ||
      o.phone_number.includes(search) ||
      (o.business_name || "").toLowerCase().includes(search.toLowerCase())) &&
    (provinceFilter === "all" || (o.province || "Unset") === provinceFilter)
  );

  const totalDrivers = owners.reduce((s, o) => s + o.driver_count, 0);
  const totalCashup  = owners.reduce((s, o) => s + o.total_cashup, 0);
  const withBank     = owners.filter(o => o.bank_name).length;

  const exportCsv = () => {
    const rows = [
      ["Name", "Phone", "Business", "Province", "Drivers", "Total Cashup", "Balance", "Cashup Method", "Bank", "Joined"],
      ...filtered.map(o => [
        o.full_name, o.phone_number, o.business_name || "", o.province || "",
        o.driver_count.toString(), formatZAR(o.total_cashup), formatZAR(o.balance),
        o.cashup_method, o.bank_name || "", formatDate(o.created_at),
      ]),
    ];
    const csv = rows.map(r => r.map((c: string | number) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "fleet-owners.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} owners`);
  };

  return (
    <AdminShell title="Fleet Owners">
      <div className="space-y-4">

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Total Owners",    value: owners.length,              color: "text-cyan" },
            { label: "Total Drivers",   value: totalDrivers,               color: "text-purple" },
            { label: "Total Cashup",    value: formatZAR(totalCashup),     color: "text-green" },
            { label: "With Bank Setup", value: `${withBank} / ${owners.length}`, color: "text-yellow" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-bg2 border border-border rounded-xl p-5 text-center">
              <p className={`text-2xl font-extrabold ${color}`}>{value}</p>
              <p className="text-xs text-textMuted mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex gap-3 flex-wrap items-center">
          <div className="flex gap-2 flex-1 min-w-0">
            <Input
              placeholder="Search name, phone, business..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && <Button variant="ghost" onClick={() => setSearch("")}><X size={13} /></Button>}
          </div>
          <select value={provinceFilter} onChange={e => setProvinceFilter(e.target.value)}
            className="bg-bg2 border border-border rounded-lg px-3 py-2 text-xs text-textMuted focus:outline-none focus:border-cyan/50 font-bold">
            <option value="all">All Provinces</option>
            {SA_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
            <option value="Unset">Unset</option>
          </select>
          <Button variant="secondary" onClick={exportCsv} disabled={loading || filtered.length === 0}>
            <Download size={13} /> Export CSV
          </Button>
        </div>

        <p className="text-xs text-textMuted">
          {loading ? "Loading…" : `${filtered.length} owner${filtered.length !== 1 ? "s" : ""}`}
        </p>

        {loading ? <Spinner /> : (
          <Table
            headers={["Owner", "Phone", "Business", "Province", "Drivers", "Total Cashup", "Balance", "Cashup Method", "Bank", "Joined", "Actions"]}
            empty={!filtered.length}>
            {filtered.map(o => (
              <Tr key={o.user_id}>
                <Td><p className="font-semibold">{o.full_name}</p></Td>
                <Td className="font-mono text-xs text-textMuted">{o.phone_number}</Td>
                <Td>{o.business_name
                  ? <span className="text-sm">{o.business_name}</span>
                  : <span className="text-textDim text-xs italic">—</span>}
                </Td>
                <Td className="text-xs text-textMuted">{o.province || "—"}</Td>
                <Td>
                  <span className="font-bold text-purple">{o.driver_count}</span>
                  <span className="text-textMuted text-xs ml-1">driver{o.driver_count !== 1 ? "s" : ""}</span>
                </Td>
                <Td className="font-bold text-green">{formatZAR(o.total_cashup)}</Td>
                <Td className="font-bold text-cyan">{formatZAR(o.balance)}</Td>
                <Td>
                  <Badge
                    label={o.cashup_method === "wallet" ? "Wallet" : "Bank"}
                    tone={o.cashup_method === "wallet" ? "cyan" : "purple"}
                  />
                </Td>
                <Td>
                  {o.bank_name
                    ? <span className="text-xs text-textMuted">{o.bank_name}</span>
                    : <span className="text-textDim text-xs italic">Not set</span>}
                </Td>
                <Td className="text-textMuted text-xs">{formatDate(o.created_at)}</Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" onClick={() => setQrOwner(o)} title={o.qr_code ? "View QR" : "No QR"}>
                      <QrCode size={13} className={o.qr_code ? "" : "text-textDim"} />
                    </Button>
                    <Link href={`/admin/owners/${o.user_id}`}>
                      <Button variant="ghost"><ExternalLink size={13} /> View</Button>
                    </Link>
                  </div>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </div>

      {qrOwner && <QrModal owner={qrOwner} onClose={() => setQrOwner(null)} />}
    </AdminShell>
  );
}
