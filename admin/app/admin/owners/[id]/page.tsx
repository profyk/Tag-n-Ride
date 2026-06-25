"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import { Table, Tr, Td, Badge, Button, Spinner } from "@/components/ui";
import { api, OwnerDetail, OwnerDriver, TaxiAssociation, hasPermission } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import { ArrowLeft, Car, Star, Phone, Building2, CreditCard, Wallet, ExternalLink, CheckCircle } from "lucide-react";
import QRCode from "qrcode";
import toast from "react-hot-toast";

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

export default function OwnerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<OwnerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"drivers" | "cashups">("drivers");
  const [qrSrc, setQrSrc] = useState("");

  const [associations, setAssociations] = useState<TaxiAssociation[]>([]);
  const [assocId, setAssocId] = useState<string>("");
  const [savingAssoc, setSavingAssoc] = useState(false);
  const canManage = hasPermission("manage_users");

  useEffect(() => {
    Promise.all([
      api.ownerDetail(id),
      api.taxiAssociations().catch(() => ({ data: [] })),
    ]).then(([r, assocs]) => {
      setData(r.data);
      setAssociations((assocs as any).data || []);
      if (r.data.owner.taxi_association_id) setAssocId(r.data.owner.taxi_association_id);
    }).finally(() => setLoading(false));
  }, [id]);

  const saveAssociation = async () => {
    if (!data) return;
    setSavingAssoc(true);
    try {
      await api.updateDriverAssociation(data.owner.user_id, assocId || null);
      const assocName = associations.find(a => a.id === assocId)?.name;
      toast.success(assocId ? `Linked to ${assocName}` : "Association removed");
      setData({ ...data, owner: { ...data.owner, taxi_association_id: assocId || null } });
    } catch (e: any) { toast.error(e.message); }
    finally { setSavingAssoc(false); }
  };

  useEffect(() => {
    const code = data?.owner.qr_code;
    if (!code) { setQrSrc(""); return; }
    generateQRWithLogo(code).then(setQrSrc).catch(() => setQrSrc("error"));
  }, [data?.owner.qr_code]);

  if (loading) return <AdminShell title="Fleet Owner"><Spinner /></AdminShell>;
  if (!data)   return <AdminShell title="Fleet Owner"><p className="text-red-400">Owner not found.</p></AdminShell>;

  const { owner, drivers, cashup_history } = data;

  const totalEarnings = drivers.reduce((s, d) => s + d.total_earnings, 0);
  const confirmedCount = drivers.filter(d => d.confirmed).length;

  return (
    <AdminShell title={owner.full_name}>
      <div className="space-y-6">

        {/* Back */}
        <Link href="/admin/owners">
          <Button variant="ghost"><ArrowLeft size={13} /> All Owners</Button>
        </Link>

        {/* Top grid: owner info + QR */}
        <div className="grid grid-cols-3 gap-5">

          {/* Owner info card */}
          <div className="col-span-2 bg-bg2 border border-border rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="text-text text-xl font-extrabold">{owner.full_name}</h2>
              {owner.business_name && (
                <p className="text-textMuted text-sm mt-1 flex items-center gap-1.5">
                  <Building2 size={13} /> {owner.business_name}
                </p>
              )}
              <p className="text-textDim text-xs font-mono mt-1 flex items-center gap-1.5">
                <Phone size={11} /> {owner.phone_number}
              </p>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Wallet Balance", value: formatZAR(owner.balance), color: "text-cyan" },
                { label: "Linked Drivers", value: drivers.length, color: "text-purple" },
                { label: "Confirmed Drivers", value: confirmedCount, color: "text-green" },
                { label: "Fleet Earnings", value: formatZAR(totalEarnings), color: "text-yellow" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-bg3 rounded-xl p-3 text-center">
                  <p className={`text-lg font-extrabold ${color}`}>{value}</p>
                  <p className="text-[10px] text-textMuted mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* Bank & cashup method */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-bg3 rounded-xl p-4">
                <p className="text-[10px] text-textMuted uppercase tracking-wide mb-2">Cashup Method</p>
                <div className="flex items-center gap-2">
                  {owner.cashup_method === "wallet"
                    ? <><Wallet size={15} className="text-cyan" /><span className="text-text font-semibold text-sm">TNR Wallet</span></>
                    : <><CreditCard size={15} className="text-purple" /><span className="text-text font-semibold text-sm">Bank Account</span></>}
                </div>
              </div>
              <div className="bg-bg3 rounded-xl p-4">
                <p className="text-[10px] text-textMuted uppercase tracking-wide mb-2">Bank Account</p>
                {owner.bank_name ? (
                  <>
                    <p className="text-text font-semibold text-sm">{owner.bank_name}</p>
                    <p className="text-textMuted text-xs font-mono mt-0.5">{owner.account_number}</p>
                    {owner.account_name && <p className="text-textDim text-xs mt-0.5">{owner.account_name}</p>}
                  </>
                ) : (
                  <p className="text-textDim text-xs italic">Not set</p>
                )}
              </div>
            </div>

            <p className="text-textDim text-xs">Registered {formatDate(owner.created_at)}</p>
          </div>

          {/* QR code card */}
          <div className="bg-bg2 border border-border rounded-2xl p-6 flex flex-col items-center justify-center gap-4">
            <p className="text-xs text-textMuted uppercase tracking-wide">Owner QR Code</p>
            <div className="w-44 h-44 bg-white rounded-2xl p-2.5 shadow-inner flex items-center justify-center">
              {!owner.qr_code ? (
                <p className="text-gray-400 text-xs text-center">No QR generated</p>
              ) : qrSrc === "error" ? (
                <p className="text-gray-400 text-xs text-center">Failed to render QR</p>
              ) : qrSrc ? (
                <img src={qrSrc} alt="Owner QR" className="w-full h-full object-contain" />
              ) : (
                <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
              )}
            </div>
            <p className="text-textDim text-[10px] text-center">Used when owner drives a vehicle</p>
          </div>
        </div>

        {/* Taxi Association */}
        <div className="bg-bg2 border border-border rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Building2 size={16} className="text-cyan" />
            <h3 className="text-text font-bold">Taxi Association</h3>
          </div>
          {owner.taxi_association_id && !assocId ? (
            <p className="text-textMuted text-sm mb-3">
              Currently linked to: <span className="text-cyan font-semibold">
                {associations.find(a => a.id === owner.taxi_association_id)?.name || owner.taxi_association_id}
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
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border pb-0">
          {(["drivers", "cashups"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2 text-sm font-semibold border-b-2 transition-colors capitalize ${
                tab === t ? "border-cyan text-cyan" : "border-transparent text-textMuted hover:text-text"
              }`}>
              {t === "drivers" ? `Linked Drivers (${drivers.length})` : `Cashup History (${cashup_history.length})`}
            </button>
          ))}
        </div>

        {/* Drivers tab */}
        {tab === "drivers" && (
          drivers.length === 0
            ? <p className="text-textMuted text-sm py-8 text-center">No drivers linked to this owner yet.</p>
            : (
              <Table headers={["Driver", "Phone", "Plate", "Earnings", "Rating", "Daily Target", "Status", "Actions"]} empty={false}>
                {drivers.map((d: OwnerDriver) => (
                  <Tr key={d.user_id}>
                    <Td><p className="font-semibold">{d.full_name}</p></Td>
                    <Td className="font-mono text-xs text-textMuted">{d.phone_number}</Td>
                    <Td>
                      {d.vehicle_plate
                        ? <span className="font-mono text-xs bg-yellow/10 text-yellow px-2 py-0.5 rounded border border-yellow/20">{d.vehicle_plate}</span>
                        : <span className="text-textDim text-xs">—</span>}
                    </Td>
                    <Td className="font-bold text-green">{formatZAR(d.total_earnings)}</Td>
                    <Td>
                      {d.rating_count > 0
                        ? <span className="flex items-center gap-1 text-yellow text-xs font-bold">
                            <Star size={11} fill="currentColor" />
                            {d.rating_avg.toFixed(1)}
                            <span className="text-textMuted font-normal">({d.rating_count})</span>
                          </span>
                        : <span className="text-textMuted text-xs italic">New</span>}
                    </Td>
                    <Td className="text-textMuted text-xs">
                      {d.daily_target > 0 ? formatZAR(d.daily_target) : <span className="italic">Not set</span>}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <Badge label={d.is_verified ? "Verified" : "Pending"} tone={d.is_verified ? "green" : "yellow"} />
                        {d.confirmed && <Badge label="Confirmed" tone="cyan" />}
                      </div>
                    </Td>
                    <Td>
                      <Link href={`/admin/drivers/${d.user_id}`}>
                        <Button variant="ghost"><ExternalLink size={13} /> View</Button>
                      </Link>
                    </Td>
                  </Tr>
                ))}
              </Table>
            )
        )}

        {/* Cashup history tab */}
        {tab === "cashups" && (
          cashup_history.length === 0
            ? <p className="text-textMuted text-sm py-8 text-center">No cashup records yet.</p>
            : (
              <Table headers={["Driver", "Cashup Amount", "Driver Profit", "Shortfall", "Fee", "Method", "Status", "Date"]} empty={false}>
                {cashup_history.map(c => (
                  <Tr key={c.id}>
                    <Td className="font-medium">{c.driver_name}</Td>
                    <Td className="font-bold text-green">{formatZAR(c.cashup_amount)}</Td>
                    <Td className="text-cyan">{formatZAR(c.driver_profit)}</Td>
                    <Td>
                      {c.shortfall > 0
                        ? <span className="text-red-400 font-semibold">{formatZAR(c.shortfall)}</span>
                        : <span className="text-textDim">—</span>}
                    </Td>
                    <Td className="text-textMuted text-xs">
                      {c.payout_fee > 0 ? formatZAR(c.payout_fee) : "Free"}
                    </Td>
                    <Td>
                      <Badge label={c.cashup_method === "wallet" ? "Wallet" : "Bank"} tone={c.cashup_method === "wallet" ? "cyan" : "purple"} />
                    </Td>
                    <Td><Badge label={c.status} tone={c.status === "completed" ? "green" : "yellow"} /></Td>
                    <Td className="text-textMuted text-xs">{formatDate(c.created_at)}</Td>
                  </Tr>
                ))}
              </Table>
            )
        )}

      </div>
    </AdminShell>
  );
}
