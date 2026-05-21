"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Badge, Button, Spinner, Table, Tr, Td } from "@/components/ui";
import { api, Driver, Transaction } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import { ArrowLeft, CheckCircle, Star, Printer, Download } from "lucide-react";
import toast from "react-hot-toast";
import QRCode from "qrcode";

export default function DriverDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [driver, setDriver] = useState<Driver | null>(null);
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.drivers().then((r) => r.data.find((d) => d.user_id === id)),
      api.transactions({ search: id }),
    ]).then(async ([d, t]) => {
      setDriver(d || null);
      setTxns(t.data.filter((tx) => tx.sender_id === id || tx.receiver_id === id));
      // Generate QR code
      if (d?.qr_code) {
        const url = await QRCode.toDataURL(d.qr_code, {
          width: 300,
          margin: 2,
          color: { dark: "#000000", light: "#ffffff" },
          errorCorrectionLevel: "H",
        });
        setQrDataUrl(url);
      }
    }).finally(() => setLoading(false));
  }, [id]);

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
              width: 320px;
              box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            }
            .brand {
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 10px;
              margin-bottom: 20px;
            }
            .brand-icon {
              width: 44px;
              height: 44px;
              background: #00D4FF;
              border-radius: 10px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: 900;
              font-size: 14px;
              color: #05050A;
            }
            .brand-name {
              font-size: 18px;
              font-weight: 900;
              color: #05050A;
            }
            .brand-sub {
              font-size: 11px;
              color: #666;
              margin-top: 2px;
            }
            .qr-wrap {
              border: 1px solid #eee;
              border-radius: 12px;
              padding: 12px;
              display: inline-block;
              margin-bottom: 20px;
            }
            .qr-wrap img { display: block; width: 240px; height: 240px; }
            .driver-name {
              font-size: 20px;
              font-weight: 800;
              color: #05050A;
              margin-bottom: 6px;
            }
            .driver-phone {
              font-size: 13px;
              color: #666;
              margin-bottom: 12px;
            }
            .plate {
              display: inline-block;
              background: #FFD60A;
              border: 2px solid #111;
              border-radius: 6px;
              padding: 4px 16px;
              font-weight: 900;
              font-size: 16px;
              letter-spacing: 2px;
              font-family: monospace;
              color: #111;
              margin-bottom: 12px;
            }
            .code-pill {
              display: inline-flex;
              align-items: center;
              gap: 6px;
              background: #EEF9FF;
              border: 1px solid #00D4FF44;
              border-radius: 999px;
              padding: 6px 16px;
              margin-bottom: 12px;
            }
            .code-prefix {
              font-weight: 900;
              font-size: 11px;
              color: #00D4FF;
              letter-spacing: 1px;
            }
            .code-text {
              font-family: monospace;
              font-size: 12px;
              font-weight: 700;
              color: #05050A;
              letter-spacing: 0.5px;
            }
            .hint {
              font-size: 12px;
              color: #888;
              margin-top: 4px;
            }
            .footer {
              margin-top: 20px;
              padding-top: 16px;
              border-top: 1px solid #eee;
              font-size: 11px;
              color: #aaa;
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

            ${driver.vehicle_plate ? `<div class="plate">${driver.vehicle_plate}</div><br/>` : ""}

            <div class="code-pill">
              <span class="code-prefix">TNR</span>
              <span class="code-text">${driver.qr_code}</span>
            </div>

            <div class="hint">Scan to pay this driver instantly</div>

            <div class="footer">
              Tag n Ride · tagnride.app · No cash, no stress
            </div>
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

        {/* Back */}
        <button onClick={() => router.back()}
          className="flex items-center gap-2 text-textMuted hover:text-text text-sm transition-colors">
          <ArrowLeft size={16} /> Back to Drivers
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Left — Driver info */}
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
                <p className="font-mono text-xs text-cyan">{driver.qr_code}</p>
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

          {/* Right — QR Code card */}
          <div className="flex flex-col gap-3">
            {/* White QR card */}
            <div className="bg-white rounded-2xl p-6 flex flex-col items-center shadow-lg">
              {/* Brand header */}
              <div className="flex items-center gap-3 self-start mb-5">
                <div className="w-10 h-10 rounded-lg bg-cyan flex items-center justify-center">
                  <span className="font-black text-sm text-bg">TR</span>
                </div>
                <div>
                  <p className="text-gray-900 font-extrabold text-sm">Tag n Ride</p>
                  <p className="text-gray-500 text-xs">Driver Payment QR Code</p>
                </div>
              </div>

              {/* QR */}
              <div className="border border-gray-100 rounded-xl p-3 mb-4">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="Driver QR Code" className="w-52 h-52" />
                ) : (
                  <div className="w-52 h-52 flex items-center justify-center">
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

              <div className="flex items-center gap-2 mt-3 bg-blue-50 rounded-full px-4 py-2 border border-cyan/20">
                <span className="text-cyan font-black text-xs tracking-wider">TNR</span>
                <span className="font-mono text-xs font-bold text-gray-900">
                  {driver.qr_code}
                </span>
              </div>

              <p className="text-gray-400 text-xs mt-3">Scan to pay this driver instantly</p>
            </div>

            {/* Action buttons */}
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
