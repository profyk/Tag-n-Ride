"use client";
import { useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import QRCode from "qrcode";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Badge, Button, Spinner } from "@/components/ui";
import { useDriverDetail } from "@/lib/hooks";
import { formatZAR } from "@/lib/utils";
import { Download, Printer } from "lucide-react";

export default function DriverDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: driver, isLoading } = useDriverDetail(id);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (driver?.qr_code && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, driver.qr_code, {
        width: 240, margin: 2,
        color: { dark: "#0A0A0F", light: "#F0F0FF" },
      });
    }
  }, [driver]);

  function downloadQR() {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `qr-${driver?.full_name?.replace(/\s/g, "-")}.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  }

  function printQR() {
    if (!canvasRef.current) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html><body style="display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;">
      <div style="text-align:center;">
        <img src="${canvasRef.current.toDataURL()}" width="240"/>
        <p style="font-family:sans-serif;margin-top:12px;">${driver?.full_name}</p>
      </div></body></html>`);
    win.print();
  }

  if (isLoading) return <AdminShell title="Driver Detail"><Spinner /></AdminShell>;
  if (!driver) return <AdminShell title="Driver Detail"><p className="text-textMuted">Driver not found.</p></AdminShell>;

  return (
    <AdminShell title={`Driver · ${driver.full_name}`}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <h2 className="text-xs font-bold text-textMuted uppercase tracking-widest mb-4">Driver Info</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {[
                ["Full Name", driver.full_name],
                ["Phone", driver.phone_number],
                ["Vehicle Plate", driver.vehicle_plate || "Not set"],
                ["Total Earnings", formatZAR(driver.total_earnings)],
                ["Rating", driver.rating_count ? `★ ${driver.rating_avg.toFixed(1)} (${driver.rating_count})` : "No ratings"],
                ["Status", driver.is_verified ? "Verified" : "Pending"],
              ].map(([label, val]) => (
                <div key={label}>
                  <p className="text-textMuted text-xs">{label}</p>
                  <p className="text-text font-semibold mt-0.5">{val}</p>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <h2 className="text-xs font-bold text-textMuted uppercase tracking-widest mb-2">QR Code Value</h2>
            <p className="font-mono text-xs text-cyan break-all">{driver.qr_code}</p>
          </Card>
        </div>
        <Card className="flex flex-col items-center gap-4">
          <h2 className="text-xs font-bold text-textMuted uppercase tracking-widest self-start">QR Code</h2>
          <div className="bg-text p-3 rounded-lg"><canvas ref={canvasRef} /></div>
          <div className="flex gap-2 w-full">
            <Button variant="secondary" className="flex-1" onClick={downloadQR}><Download size={14} /> Download</Button>
            <Button variant="secondary" className="flex-1" onClick={printQR}><Printer size={14} /> Print</Button>
          </div>
          <Badge label={driver.is_verified ? "Verified Driver" : "Pending Verification"} tone={driver.is_verified ? "green" : "yellow"} />
        </Card>
      </div>
    </AdminShell>
  );
}
