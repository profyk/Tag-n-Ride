"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const BASE_URL = "https://tag-n-ride-production.up.railway.app";

async function verifyPayslip(ref: string): Promise<any> {
  const res = await fetch(`${BASE_URL}/api/driver/payslip/verify?ref=${encodeURIComponent(ref)}`);
  return res.json();
}

function formatZAR(n: number) {
  return `R ${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function VerifyContent() {
  const params = useSearchParams();
  const ref = params.get("ref") ?? "";

  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ref) { setLoading(false); return; }
    verifyPayslip(ref)
      .then(setResult)
      .catch(() => setResult({ valid: false }))
      .finally(() => setLoading(false));
  }, [ref]);

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center p-6">
      {/* Branding */}
      <div className="mb-8 text-center">
        <p className="text-[#00D4FF] font-black text-2xl tracking-widest">TAG N RIDE</p>
        <p className="text-[#666] text-xs tracking-wider mt-1">DOCUMENT VERIFICATION PORTAL</p>
      </div>

      <div className="w-full max-w-md bg-[#111118] border border-[#222230] rounded-2xl p-8 shadow-2xl">
        {!ref ? (
          <div className="text-center">
            <div className="text-5xl mb-4">🔍</div>
            <p className="text-white font-bold text-lg">No Reference Provided</p>
            <p className="text-[#888] text-sm mt-2">
              Please scan the QR code on the earnings statement or visit the URL printed on the document.
            </p>
          </div>
        ) : loading ? (
          <div className="text-center py-8">
            <div className="w-10 h-10 border-2 border-[#00D4FF] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-[#888] text-sm">Verifying document…</p>
          </div>
        ) : result?.valid ? (
          <div className="text-center">
            <div className="text-6xl mb-4">✅</div>
            <p className="text-[#22c55e] font-black text-xl tracking-wide mb-1">VERIFIED DOCUMENT</p>
            <p className="text-[#00D4FF] font-bold text-sm mb-6">TAG N RIDE PTY LTD · Official Earnings Statement</p>

            <div className="bg-[#0d0d15] border border-[#1a1a2e] rounded-xl p-5 text-left space-y-3 mb-6">
              <Row label="Driver" value={result.driver_name} />
              <Row label="Phone" value={result.phone} />
              <Row label="Period" value={result.period_label} />
              <Row label="Net Earnings" value={formatZAR(result.driver_net_earnings)} highlight />
              <Row label="Total Trips" value={String(result.total_trips)} />
              <Row label="Issued by" value={result.issued_by} />
              <Row
                label="Verified at"
                value={new Date(result.verified_at).toLocaleString("en-ZA", {
                  dateStyle: "medium", timeStyle: "short",
                })}
              />
            </div>

            <div className="bg-[#00D4FF]/10 border border-[#00D4FF]/30 rounded-xl p-4">
              <p className="text-[#00D4FF] text-xs font-bold tracking-wider mb-1">REFERENCE NUMBER</p>
              <p className="font-mono text-white text-sm break-all">{ref}</p>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <div className="text-6xl mb-4">❌</div>
            <p className="text-red-400 font-black text-xl tracking-wide mb-2">DOCUMENT NOT FOUND</p>
            <p className="text-[#888] text-sm mb-4">
              This reference number is not recognised. The document may be fake or expired.
            </p>
            <div className="bg-red-900/20 border border-red-800/40 rounded-xl p-4">
              <p className="text-[#aaa] text-xs font-mono break-all">{ref}</p>
            </div>
            <p className="text-[#555] text-xs mt-5">
              Contact{" "}
              <a href="mailto:support@tagnride.com" className="text-[#00D4FF] hover:underline">
                support@tagnride.com
              </a>{" "}
              if you believe this is an error.
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-[#444] text-xs space-y-1">
        <p className="font-bold text-[#555]">Tag n Ride Pty Ltd</p>
        <p>Pretoria, Gauteng, South Africa</p>
        <p>
          <a href="mailto:support@tagnride.com" className="hover:text-[#00D4FF] transition-colors">
            support@tagnride.com
          </a>
        </p>
        <p className="mt-2 text-[#333]">
          This portal verifies documents digitally issued by Tag n Ride Pty Ltd.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[#666] text-xs">{label}</span>
      <span className={`font-bold text-sm ${highlight ? "text-[#00D4FF]" : "text-white"}`}>{value}</span>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-[#00D4FF] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <VerifyContent />
    </Suspense>
  );
}
