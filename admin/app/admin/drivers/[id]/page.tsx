"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Badge, Button, Spinner, Table, Tr, Td } from "@/components/ui";
import { api, Driver, Transaction, TaxiAssociation, hasPermission } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import { ArrowLeft, CheckCircle, Star, Printer, Download, Building2, X } from "lucide-react";
import toast from "react-hot-toast";
import QRCode from "qrcode";

async function generateQRWithLogo(text: string): Promise<string> {
  return new Promise(async (resolve) => {
    // Step 1 — generate base QR as data URL
    const baseUrl = await QRCode.toDataURL(text, {
      width: 400,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
      errorCorrectionLevel: "H",
    });

    // Step 2 — draw QR onto canvas
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext("2d")!;

    const qrImg = new Image();
    qrImg.onload = () => {
      // Draw QR code
      ctx.drawImage(qrImg, 0, 0, 400, 400);

      const cx = 200;
      const cy = 200;
      const r = 46;

      // White ring around logo
      ctx.beginPath();
      ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();

      // Cyan circle
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = "#00D4FF";
      ctx.fill();

      // TNR text
      ctx.fillStyle = "#05050A";
      ctx.font = "900 22px 'Arial Black', Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("TNR", cx, cy);

      resolve(canvas.toDataURL("image/png"));
    };
    qrImg.src = baseUrl;
  });
}

export default function DriverDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [driver, setDriver] = useState<Driver | null>(null);
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  const [associations, setAssociations] = useState<TaxiAssociation[]>([]);
  const [assocId, setAssocId] = useState<string>("");
  const [savingAssoc, setSavingAssoc] = useState(false);
  const canManage = hasPermission("manage_drivers");

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.driver(id).then((r) => r.data).catch(() => null),
      api.transactions({ search: id }),
      api.taxiAssociations().catch(() => ({ data: [] })),
    ]).then(async ([d, t, assocs]) => {
      setDriver(d || null);
      setTxns(t.data.filter((tx) => tx.sender_id === id || tx.receiver_id === id));
      setAssociations((assocs as any).data || []);
      if (d?.taxi_association_id) setAssocId(d.taxi_association_id);
      if (d?.qr_code) {
        const url = await generateQRWithLogo(d.qr_code);
        setQrDataUrl(url);
      }
    }).finally(() => setLoading(false));
  }, [id]);

  const saveAssociation = async () => {
    if (!driver) return;
    setSavingAssoc(true);
    try {
      await api.updateDriverAssociation(driver.user_id, assocId || null);
      const assocName = associations.find(a => a.id === assocId)?.name;
      toast.success(assocId ? `Linked to ${assocName}` : "Association removed");
      setDriver({ ...driver, taxi_association_id: assocId || null });
    } catch (e: any) { toast.error(e.message); }
    finally { setSavingAssoc(false); }
  };

  const handleVerify = async () => {
    if (!driver) return;
    try {
      await api.verifyDriver(driver.user_id);
      toast.success("Driver verified");
      setDriver({ ...driver, is_verified: true });
    } catch (e: any) { toast.error(e.message); }
  };

  const handlePrint = () => {
    if (!driver || !qrDataUrl) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Tag n Ride — ${driver.full_name} QR Code</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: Arial, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              background: #fff;
            }
            .card {
              border: 2px solid #000;
              border-radius: 16px;
              padding: 32px;
              text-align: center;
              width: 340px;
              box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            }
            .brand {
              display: flex;
              align-items: center;
              gap: 10px;
              margin-bottom: 20px;
            }
            .brand-icon {
              width: 44px; height: 44px;
              background: #00D4FF;
              border-radius: 10px;
              display: flex; align-items: center; justify-content: center;
              font-weight: 900; font-size: 14px; color: #05050A;
              flex-shrink: 0;
            }
            .brand-name { font-size: 18px; font-weight: 900; color: #05050A; }
            .brand-sub { font-size: 11px; color: #666; margin-top: 2px; }
            .qr-wrap {
              border: 1px solid #eee; border-radius: 12px;
              padding: 12px; display: inline-block; margin-bottom: 20px;
            }
            .qr-wrap img { display: block; width: 260px; height: 260px; }
            .driver-name { font-size: 22px; font-weight: 800; color: #05050A; margin-bottom: 6px; }
            .driver-phone { font-size: 13px; color: #666; margin-bottom: 12px; }
            .plate {
              display: inline-block; background: #FFD60A;
              border: 2px solid #111; border-radius: 6px;
              padding: 4px 16px; font-weight: 900; font-size: 16px;
              letter-spacing: 2px; font-family: monospace;
              color: #111; margin-bottom: 12px;
            }
            .code-pill {
              display: inline-flex; align-items: center; gap: 6px;
              background: #EEF9FF; border: 1px solid #00D4FF44;
              border-radius: 999px; padding: 6px 16px; margin-bottom: 12px;
            }
            .code-prefix { font-weight: 900; font-size: 11px; color: #00D4FF; letter-spacing: 1px; }
            .code-text { font-family: monospace; font-size: 12px; font-weight: 700; color: #05050A; }
            .hint { font-size: 12px; color: #888; margin-top: 4px; }
            .footer {
              margin-top: 20px; padding-top: 16px;
              border-top: 1px solid #eee; font-size: 11px; color: #aaa;
            }
            @media print {
              body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="brand">
              <div class="brand-icon">TR</div>
              <div>
                <div class="brand-name">Tag n Ride</div>
                <div class="brand-sub">Driver Payment QR Code</div>
              </div>
            </div>
            <div class="qr-wrap">
              <img src="${qrDataUrl}" alt="QR Code" />
            </div>
            <div class="driver-name">${driver.full_name}</div>
            <div class="driver-phone">${driver.phone_number || ""}</div>
            ${driver.vehicle_plate
              ? `<div class="plate">${driver.vehicle_plate}</div><br/>`
              : ""}
            <div class="code-pill">
              <span class="code-prefix">TNR</span>
              <span class="code-text">${driver.qr_code}</span>
            </div>
            <div class="hint">Scan to pay this driver instantly</div>
            <div class="footer">Tag n Ride · tagnride.app · No cash, no stress</div>
          </div>
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleDownload = () => {
    if (!qrDataUrl || !driver) return;
    const link = document.createElement("a");
    link.download = `tagnride-qr-${driver.full_name.replace(/\s+/g, "-").toLowerCase()}.png`;
    link.href = qrDataUrl;
    link.click();
  };

  if (loading) return <AdminShell title="Driver Detail"><Spinner /></AdminShell>;
  if (!driver) return (
    <AdminShell title="Driver Detail">
      <p className="text-textMuted">Driver not found.</p>
    </AdminShell>
  );

  return (
    <AdminShell title="Driver Detail">
      <div className="space-y-6 max-w-4xl">

        <button onClick={() => router.back()}
          className="flex items-center gap-2 text-textMuted hover:text-text text-sm transition-colors">
          <ArrowLeft size={16} /> Back to Drivers
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Driver info */}
          <Card>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-text font-extrabold text-xl">{driver.full_name}</h2>
                <p className="text-textMuted font-mono text-sm mt-1">{driver.phone_number}</p>
                {driver.vehicle_plate && (
                  <span className="inline-block mt-2 font-mono text-sm bg-yellow/10 text-yellow px-3 py-1 rounded border border-yellow/20">
                    {driver.vehicle_plate}
                  </span>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge
                  label={driver.is_verified ? "Verified" : "Pending"}
                  tone={driver.is_verified ? "green" : "yellow"}
                />
                <Badge
                  label={driver.kyc_status || "No KYC"}
                  tone={
                    driver.kyc_status === "approved" ? "green"
                    : driver.kyc_status === "pending" ? "yellow"
                    : driver.kyc_status === "rejected" ? "red"
                    : "muted"
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-border">
              <div>
                <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">
                  Total Earnings
                </p>
                <p className="text-xl font-extrabold text-green">
                  {formatZAR(driver.total_earnings)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">
                  Rating
                </p>
                {driver.rating_count > 0 ? (
                  <p className="text-xl font-extrabold text-yellow flex items-center gap-1">
                    <Star size={16} fill="currentColor" />
                    {driver.rating_avg.toFixed(1)}
                    <span className="text-textMuted text-xs font-normal">
                      ({driver.rating_count})
                    </span>
                  </p>
                ) : (
                  <p className="text-textMuted text-sm">No ratings</p>
                )}
              </div>
              <div>
                <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">
                  TNR Code
                </p>
                <p className="font-mono text-xs text-cyan break-all">{driver.qr_code}</p>
              </div>
            </div>

            {!driver.is_verified && (
              <div className="mt-4 pt-4 border-t border-border">
                <Button onClick={handleVerify}>
                  <CheckCircle size={13} /> Verify Driver
                </Button>
              </div>
            )}
          </Card>

          {/* QR Code card */}
          <div className="flex flex-col gap-3">
            <div className="bg-white rounded-2xl p-6 flex flex-col items-center shadow-lg">

              {/* Brand */}
              <div className="flex items-center gap-3 self-start mb-5">
                <div className="w-10 h-10 rounded-lg bg-[#00D4FF] flex items-center justify-center">
                  <span className="font-black text-sm text-[#05050A]">TR</span>
                </div>
                <div>
                  <p className="text-gray-900 font-extrabold text-sm">Tag n Ride</p>
                  <p className="text-gray-500 text-xs">Driver Payment QR Code</p>
                </div>
              </div>

              {/* QR with TNR logo */}
              <div className="border border-gray-100 rounded-xl p-3 mb-4">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="Driver QR Code"
                    className="w-56 h-56"
                  />
                ) : (
                  <div className="w-56 h-56 flex items-center justify-center">
                    <Spinner />
                  </div>
                )}
              </div>

              <p className="text-gray-900 font-extrabold text-lg">{driver.full_name}</p>
              <p className="text-gray-500 text-sm mt-1">{driver.phone_number}</p>

              {driver.vehicle_plate && (
                <div className="mt-3 px-4 py-1 bg-yellow-400 rounded border-2 border-gray-900">
                  <span className="font-black text-gray-900 font-mono tracking-widest text-sm">
                    {driver.vehicle_plate}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2 mt-3 bg-blue-50 rounded-full px-4 py-2 border border-[#00D4FF33]">
                <span className="text-[#00D4FF] font-black text-xs tracking-wider">TNR</span>
                <span className="font-mono text-xs font-bold text-gray-900">
                  {driver.qr_code}
                </span>
              </div>

              <p className="text-gray-400 text-xs mt-3">Scan to pay this driver instantly</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button onClick={handlePrint} className="justify-center">
                <Printer size={14} /> Print QR
              </Button>
              <Button variant="secondary" onClick={handleDownload} className="justify-center">
                <Download size={14} /> Download PNG
              </Button>
            </div>
          </div>
        </div>

        {/* Taxi Association */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Building2 size={16} className="text-cyan" />
            <h3 className="text-text font-bold">Taxi Association</h3>
          </div>
          {driver.taxi_association_id && !assocId ? (
            <p className="text-textMuted text-sm mb-3">
              Currently linked to: <span className="text-cyan font-semibold">
                {associations.find(a => a.id === driver.taxi_association_id)?.name || driver.taxi_association_id}
              </span>
            </p>
          ) : null}
          <div className="flex items-center gap-3">
            <select
              value={assocId}
              onChange={e => setAssocId(e.target.value)}
              disabled={!canManage}
              className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-cyan/40 disabled:opacity-50">
              <option value="">— No association —</option>
              {associations.map(a => (
                <option key={a.id} value={a.id}>{a.name}{a.city ? ` (${a.city})` : ""}</option>
              ))}
            </select>
            {canManage && (
              <Button onClick={saveAssociation} disabled={savingAssoc} className="flex-shrink-0">
                {savingAssoc ? <Spinner /> : <CheckCircle size={13} />}
                {assocId ? "Link" : "Unlink"}
              </Button>
            )}
          </div>
          {associations.length === 0 && (
            <p className="text-textDim text-xs mt-2">
              No associations created yet. <a href="/admin/taxi-associations" className="text-cyan hover:underline">Create one here.</a>
            </p>
          )}
        </Card>

        {/* Transaction history */}
        <Card>
          <h3 className="text-text font-bold mb-4">Transaction History</h3>
          <Table
            headers={["Reference", "Type", "Amount", "Net", "From", "To", "Status", "Date"]}
            empty={!txns.length}>
            {txns.map((t) => (
              <Tr key={t.id}>
                <Td><span className="font-mono text-[11px] text-textMuted">{t.reference}</span></Td>
                <Td>
                  <Badge label={t.type}
                    tone={t.type === "topup" ? "cyan" : t.type === "payment" ? "green" : "purple"} />
                </Td>
                <Td className="font-bold">{formatZAR(t.amount)}</Td>
                <Td className="text-green text-xs font-semibold">
                  {t.driver_net ? formatZAR(t.driver_net) : "—"}
                </Td>
                <Td className="text-textMuted text-xs">{t.sender_name || "—"}</Td>
                <Td className="text-textMuted text-xs">{t.receiver_name || "—"}</Td>
                <Td>
                  <Badge label={t.status}
                    tone={t.status === "completed" ? "green" : t.status === "pending" ? "yellow" : "red"} />
                </Td>
                <Td className="text-textMuted text-xs">{formatDate(t.created_at)}</Td>
              </Tr>
            ))}
          </Table>
        </Card>
      </div>
    </AdminShell>
  );
}
