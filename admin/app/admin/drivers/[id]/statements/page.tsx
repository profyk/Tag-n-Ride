"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import { Table, Tr, Td, Badge, Button, Spinner, Modal } from "@/components/ui";
import { api, getToken } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  ArrowLeft, FileText, ShieldCheck, Printer, Download,
  Share2, Trash2, Copy, Check, AlertTriangle, X,
} from "lucide-react";
import toast from "react-hot-toast";

const BASE_URL = "https://tag-n-ride-production.up.railway.app";

const authHeaders = () => ({
  Authorization: `Bearer ${getToken()}`,
});

async function fetchDriverPayslips(driverId: string): Promise<any[]> {
  const res = await fetch(`${BASE_URL}/api/admin/drivers/${driverId}/payslips`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to load payslips");
  return res.json();
}

async function fetchDriver(driverId: string): Promise<any> {
  const res = await api.driver(driverId);
  return res.data;
}

type CompanyConfig = {
  company_name?: string;
  company_reg_number?: string;
  company_vat_number?: string;
  company_address_line1?: string;
  company_address_line2?: string;
  company_phone?: string;
  company_email?: string;
};

const STATUS_TONE: Record<string, "green" | "red" | "yellow" | "cyan" | "purple" | "muted" | "orange"> = {
  generated: "green",
  deleted: "red",
};

function DocTypeBadge({ type }: { type: string }) {
  if (type === "payslip") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-900/40 text-green-400 border border-green-700/40">
        <ShieldCheck size={10} /> FORMAL PAYSLIP
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan/10 text-cyan border border-cyan/20">
      <FileText size={10} /> STATEMENT
    </span>
  );
}

// ── Print / Download modal ─────────────────────────────────────────────────────
function PayslipPrintModal({
  slip,
  driver,
  company,
  onClose,
}: {
  slip: any;
  driver: any;
  company: CompanyConfig;
  onClose: () => void;
}) {
  const hasCompany = company.company_name || company.company_address_line1;

  const doPrint = () => window.print();

  return (
    <Modal open onClose={onClose} title={slip.document_type === "payslip" ? "Formal Payslip" : "Earnings Statement"}>
      <div className="space-y-4 max-h-[78vh] overflow-y-auto pr-1" id="printable-payslip">

        {/* Company letterhead */}
        {hasCompany && (
          <div className="rounded-xl border border-border bg-bg2 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                {company.company_name && (
                  <p className="font-extrabold text-text text-sm">{company.company_name}</p>
                )}
                {company.company_address_line1 && (
                  <p className="text-textMuted text-[11px] mt-0.5">{company.company_address_line1}</p>
                )}
                {company.company_address_line2 && (
                  <p className="text-textMuted text-[11px]">{company.company_address_line2}</p>
                )}
              </div>
              <div className="text-right shrink-0 space-y-0.5">
                {company.company_reg_number && (
                  <p className="text-[10px] text-textDim">Reg: <span className="text-textMuted font-mono">{company.company_reg_number}</span></p>
                )}
                {company.company_vat_number && (
                  <p className="text-[10px] text-textDim">VAT: <span className="text-textMuted font-mono">{company.company_vat_number}</span></p>
                )}
                {company.company_phone && (
                  <p className="text-[10px] text-textDim">Tel: <span className="text-textMuted">{company.company_phone}</span></p>
                )}
                {company.company_email && (
                  <p className="text-[10px] text-textDim">Email: <span className="text-textMuted">{company.company_email}</span></p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Driver + period header */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-cyanDim border border-cyan/20">
          <div>
            <p className="font-extrabold text-text text-base">{driver?.full_name ?? "Driver"}</p>
            <p className="text-textMuted text-xs mt-0.5">
              {driver?.phone ?? ""} · Driver
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-textDim uppercase tracking-widest">Period</p>
            <p className="font-extrabold text-cyan text-sm">{slip.period_label}</p>
          </div>
        </div>

        {/* Earnings */}
        <div className="bg-bg rounded-xl border border-border p-4">
          <p className="text-[10px] font-extrabold text-textDim uppercase tracking-widest mb-3">Earnings</p>
          {[
            { label: "Gross Earnings", value: formatZAR(slip.gross_earnings), color: "text-text" },
            { label: "Platform Fee (3%)", value: `- ${formatZAR(slip.platform_fee)}`, color: "text-red" },
            { label: "Owner Payouts", value: `- ${formatZAR(slip.owner_payouts)}`, color: "text-textMuted" },
            { label: "Driver Cashups", value: `- ${formatZAR(slip.driver_cashups_self)}`, color: "text-textMuted" },
          ].map(r => (
            <div key={r.label} className="flex justify-between py-1.5 border-b border-border/50 last:border-0">
              <span className="text-sm text-textMuted">{r.label}</span>
              <span className={`text-sm font-bold ${r.color}`}>{r.value}</span>
            </div>
          ))}
        </div>

        {/* Net pay hero */}
        <div className="p-5 rounded-xl bg-green/5 border border-green/30 text-center">
          <p className="text-[10px] font-extrabold text-textDim uppercase tracking-widest mb-1">Net Earnings</p>
          <p className="text-3xl font-black text-green">{formatZAR(slip.driver_net_earnings)}</p>
          <p className="text-textDim text-xs mt-1">Wallet balance at generation: {formatZAR(slip.wallet_balance_at_generation)}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-bg rounded-xl border border-border p-3 text-center">
            <p className="text-[10px] text-textDim uppercase tracking-widest mb-1">Total Trips</p>
            <p className="font-extrabold text-text text-lg">{slip.total_trips}</p>
          </div>
          <div className="bg-bg rounded-xl border border-border p-3 text-center">
            <p className="text-[10px] text-textDim uppercase tracking-widest mb-1">Avg Rating</p>
            <p className="font-extrabold text-text text-lg">{(slip.rating_avg ?? 0).toFixed(1)} ★</p>
            <p className="text-textDim text-[10px]">{slip.rating_count} reviews</p>
          </div>
        </div>

        {/* Verification */}
        {slip.document_type === "payslip" && (
          <div className="bg-bg rounded-xl border border-green/20 p-4">
            <p className="text-[10px] font-extrabold text-green uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <ShieldCheck size={10} /> Verification
            </p>
            <p className="text-textDim text-[11px] mb-1">Reference</p>
            <p className="font-mono text-xs text-text">{slip.reference_number}</p>
            <p className="text-textDim text-[11px] mt-2 mb-1">Verify at</p>
            <p className="font-mono text-[11px] text-cyan break-all">
              {typeof window !== "undefined" ? window.location.origin : "https://admin.tagnride.co.za"}/verify?ref={slip.reference_number}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button onClick={doPrint} className="flex-1">
            <Printer size={13} /> Print / Save PDF
          </Button>
          <Button variant="secondary" onClick={onClose} className="flex-1">
            <X size={13} /> Close
          </Button>
        </div>
      </div>

      <style>{`
        @media print {
          body > * { display: none !important; }
          #printable-payslip { display: block !important; color: black !important; }
          #printable-payslip * { color: black !important; background: white !important; border-color: #ccc !important; }
          button { display: none !important; }
        }
      `}</style>
    </Modal>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function DriverStatementsPage() {
  const { id } = useParams<{ id: string }>();
  const [payslips, setPayslips] = useState<any[]>([]);
  const [driver, setDriver]     = useState<any>(null);
  const [company, setCompany]   = useState<CompanyConfig>({});
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Print modal
  const [printSlip, setPrintSlip] = useState<any | null>(null);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleting, setDeleting]         = useState(false);

  // Copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadPayslips = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [slips, drv] = await Promise.all([
        fetchDriverPayslips(id),
        fetchDriver(id).catch(() => null),
      ]);
      setPayslips(slips);
      setDriver(drv);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadCompany = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/admin/config`, { headers: authHeaders() });
      const rows: { key: string; value: string }[] = await res.json();
      const keys: (keyof CompanyConfig)[] = [
        "company_name", "company_reg_number", "company_vat_number",
        "company_address_line1", "company_address_line2", "company_phone", "company_email",
      ];
      const cfg: CompanyConfig = {};
      if (Array.isArray(rows)) {
        rows.forEach(r => { if (keys.includes(r.key as keyof CompanyConfig)) (cfg as any)[r.key] = r.value; });
      }
      setCompany(cfg);
    } catch { /* letterhead optional */ }
  }, []);

  useEffect(() => {
    loadPayslips();
    loadCompany();
  }, [loadPayslips, loadCompany]);

  const handleShare = async (slip: any) => {
    const verifyUrl = `${window.location.origin}/verify?ref=${slip.reference_number}`;
    const title = `${driver?.full_name ?? "Driver"} — ${slip.period_label} ${slip.document_type === "payslip" ? "Payslip" : "Statement"}`;

    if (navigator.share) {
      try {
        await navigator.share({ title, url: verifyUrl });
        return;
      } catch { /* fall through to clipboard */ }
    }
    await navigator.clipboard.writeText(verifyUrl);
    setCopiedId(slip.id);
    toast.success("Verification link copied to clipboard");
    setTimeout(() => setCopiedId(prev => prev === slip.id ? null : prev), 3000);
  };

  const handleDelete = async () => {
    if (!deleteTarget || !id) return;
    setDeleting(true);
    try {
      const res = await fetch(`${BASE_URL}/api/admin/drivers/${id}/payslips/${deleteTarget.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || `Delete failed (${res.status})`);
      }
      toast.success("Document deleted");
      setDeleteTarget(null);
      setPayslips(prev => prev.filter(p => p.id !== deleteTarget.id));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const driverName = driver?.full_name ?? id;
  const stmtCount = payslips.filter(p => p.document_type !== "payslip").length;
  const payslipCount = payslips.filter(p => p.document_type === "payslip").length;

  return (
    <AdminShell title="Driver Documents">
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href={`/admin/drivers/${id}`}>
            <Button variant="ghost">
              <ArrowLeft size={13} /> Back to Driver
            </Button>
          </Link>
          <div>
            <h1 className="text-text font-extrabold text-xl">Driver Documents</h1>
            <p className="text-textMuted text-xs mt-0.5">
              All statements and payslips for {driverName}
            </p>
          </div>
        </div>

        {loading ? (
          <Spinner />
        ) : error ? (
          <div className="bg-red/10 border border-red/30 rounded-xl p-4 text-red text-sm">{error}</div>
        ) : payslips.length === 0 ? (
          <div className="bg-bg2 border border-border rounded-xl p-10 text-center">
            <FileText size={36} className="text-textDim mx-auto mb-3" />
            <p className="text-text font-semibold">No documents found</p>
            <p className="text-textMuted text-sm mt-1">
              This driver has not generated any earnings statements or formal payslips yet.
            </p>
          </div>
        ) : (
          <>
            <div className="flex gap-4 text-xs text-textMuted">
              <span>{payslips.length} total document{payslips.length !== 1 ? "s" : ""}</span>
              <span className="text-cyan">{stmtCount} statement{stmtCount !== 1 ? "s" : ""}</span>
              <span className="text-green-400">{payslipCount} formal payslip{payslipCount !== 1 ? "s" : ""}</span>
            </div>

            <Table
              headers={["Type", "Period", "Net Earnings", "Fee Charged", "Reference", "Generated", "Status", ""]}
              empty={false}
            >
              {payslips.map(p => (
                <>
                  <Tr
                    key={p.id}
                    className="cursor-pointer"
                    onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                  >
                    <Td><DocTypeBadge type={p.document_type ?? "statement"} /></Td>
                    <Td><span className="font-semibold text-text">{p.period_label}</span></Td>
                    <Td><span className="font-bold text-green">{formatZAR(p.driver_net_earnings)}</span></Td>
                    <Td><span className="text-textMuted">{formatZAR(p.fee_charged)}</span></Td>
                    <Td><span className="font-mono text-xs text-text">{p.reference_number}</span></Td>
                    <Td className="text-textMuted text-xs">{formatDate(p.created_at)}</Td>
                    <Td><Badge label={p.status} tone={STATUS_TONE[p.status] ?? "muted"} /></Td>

                    {/* Action buttons */}
                    <Td onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {/* Print / Download */}
                        <button
                          title="Print / Download PDF"
                          onClick={() => setPrintSlip(p)}
                          className="p-1.5 rounded-lg border border-border text-textDim hover:text-cyan hover:border-cyan/30 transition-all"
                        >
                          <Printer size={11} />
                        </button>

                        {/* Download (same as print — browser saves as PDF) */}
                        <button
                          title="Download"
                          onClick={() => setPrintSlip(p)}
                          className="p-1.5 rounded-lg border border-border text-textDim hover:text-green hover:border-green/30 transition-all"
                        >
                          <Download size={11} />
                        </button>

                        {/* Share */}
                        <button
                          title={p.document_type === "payslip" ? "Share verification link" : "Share"}
                          onClick={() => handleShare(p)}
                          className="p-1.5 rounded-lg border border-border text-textDim hover:text-purple hover:border-purple/30 transition-all"
                        >
                          {copiedId === p.id ? <Check size={11} className="text-green" /> : <Share2 size={11} />}
                        </button>

                        {/* Delete */}
                        {p.status !== "deleted" && (
                          <button
                            title="Delete document"
                            onClick={() => setDeleteTarget(p)}
                            className="p-1.5 rounded-lg border border-border text-textDim hover:text-red hover:border-red/30 transition-all"
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    </Td>
                  </Tr>

                  {/* Expanded detail row */}
                  {expanded === p.id && (
                    <Tr key={`${p.id}-detail`}>
                      <Td colSpan={8}>
                        <div className="bg-bg border border-border rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-textMuted text-xs mb-1">Gross Earnings</p>
                            <p className="font-bold text-text">{formatZAR(p.gross_earnings)}</p>
                          </div>
                          <div>
                            <p className="text-textMuted text-xs mb-1">Platform Fee (3%)</p>
                            <p className="font-bold text-red">{formatZAR(p.platform_fee)}</p>
                          </div>
                          <div>
                            <p className="text-textMuted text-xs mb-1">Total Net</p>
                            <p className="font-bold text-text">{formatZAR(p.total_net)}</p>
                          </div>
                          <div>
                            <p className="text-textMuted text-xs mb-1">Owner Payouts</p>
                            <p className="font-bold text-text">{formatZAR(p.owner_payouts)}</p>
                          </div>
                          <div>
                            <p className="text-textMuted text-xs mb-1">Driver Cashups (Self)</p>
                            <p className="font-bold text-text">{formatZAR(p.driver_cashups_self)}</p>
                          </div>
                          <div>
                            <p className="text-textMuted text-xs mb-1">Wallet at Generation</p>
                            <p className="font-bold text-text">{formatZAR(p.wallet_balance_at_generation)}</p>
                          </div>
                          <div>
                            <p className="text-textMuted text-xs mb-1">Total Trips</p>
                            <p className="font-bold text-text">{p.total_trips}</p>
                          </div>
                          <div>
                            <p className="text-textMuted text-xs mb-1">Rating</p>
                            <p className="font-bold text-text">
                              {(p.rating_avg ?? 0).toFixed(1)} ★ ({p.rating_count})
                            </p>
                          </div>
                          {p.document_type === "payslip" && (
                            <div className="col-span-2 md:col-span-4">
                              <p className="text-textMuted text-xs mb-1">Verification URL</p>
                              <a
                                href={`/verify?ref=${p.reference_number}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-cyan text-xs font-mono break-all hover:underline"
                              >
                                {typeof window !== "undefined" ? window.location.origin : ""}/verify?ref={p.reference_number}
                              </a>
                            </div>
                          )}
                        </div>
                      </Td>
                    </Tr>
                  )}
                </>
              ))}
            </Table>
          </>
        )}
      </div>

      {/* ── Print / Download modal ── */}
      {printSlip && (
        <PayslipPrintModal
          slip={printSlip}
          driver={driver}
          company={company}
          onClose={() => setPrintSlip(null)}
        />
      )}

      {/* ── Delete confirm modal ── */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Document"
      >
        {deleteTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-red/5 border border-red/20">
              <AlertTriangle size={18} className="text-red flex-shrink-0" />
              <div>
                <p className="text-red text-sm font-semibold">This action cannot be undone.</p>
                <p className="text-textMuted text-xs mt-1">
                  {deleteTarget.document_type === "payslip" ? "Formal payslip" : "Statement"} for{" "}
                  <strong>{deleteTarget.period_label}</strong> will be permanently deleted.
                  The verification link will stop working.
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red text-white text-sm font-bold disabled:opacity-50 hover:bg-red/90 transition-all"
              >
                {deleting ? "Deleting…" : <><Trash2 size={13} /> Delete Document</>}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </AdminShell>
  );
}
