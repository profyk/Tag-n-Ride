"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import { Badge, Spinner } from "@/components/ui";
import client from "@/lib/api";
import { AlertTriangle, Phone, CheckCircle, XCircle, MapPin, ArrowLeft, Check } from "lucide-react";
import toast from "react-hot-toast";

export default function IncidentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [incident, setIncident] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [resolveNotes, setResolveNotes] = useState("");
  const [showResolve, setShowResolve] = useState(false);
  const [resendingIndex, setResendingIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    client.get(`/api/admin/incidents/${id}`)
      .then(res => setIncident(res.data))
      .catch(e => toast.error(e.message || "Failed to load incident"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleResolve = async () => {
    setResolving(true);
    try {
      await client.patch(`/api/admin/incidents/${id}/resolve`, { resolution_notes: resolveNotes });
      toast.success("Incident resolved");
      setShowResolve(false);
      const res = await client.get(`/api/admin/incidents/${id}`);
      setIncident(res.data);
    } catch (e: any) {
      toast.error(e.message || "Failed to resolve");
    } finally { setResolving(false); }
  };

  const handleResendAll = async () => {
    if (!incident) return;
    const failedContacts = incident.notifications?.filter((n: any) => n.sms_status !== "sent") || [];
    if (failedContacts.length === 0) { toast("All SMS were already sent successfully"); return; }
    toast("Re-send feature: contact your SMS provider to retry failed messages.");
  };

  const handleDownloadPDF = () => {
    if (!incident) return;
    const html = buildManifestHTML(incident);
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  const formatTime = (iso: string) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
  };

  if (loading) return (
    <AdminShell title="Incident Detail">
      <div className="flex items-center justify-center h-64"><Spinner size={24} /></div>
    </AdminShell>
  );

  if (!incident) return (
    <AdminShell title="Incident Detail">
      <div className="p-6 text-textMuted">Incident not found.</div>
    </AdminShell>
  );

  return (
    <AdminShell title="Incident Detail">
      <div className="p-6 space-y-6 max-w-4xl">
        {/* Back + header */}
        <div>
          <Link href="/admin/saferide/incidents" className="flex items-center gap-1 text-xs text-textMuted hover:text-cyan mb-4 transition-colors">
            <ArrowLeft size={13} /> Back to Incidents
          </Link>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red/10 border border-red/20 flex items-center justify-center mt-0.5">
                <AlertTriangle size={18} className="text-red-400" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-lg font-black text-text">{incident.incident_reference}</h1>
                  <Badge tone={incident.status === "resolved" ? "green" : "red"}>
                    {incident.status === "resolved" ? "Resolved" : "Active"}
                  </Badge>
                  <span className="text-xs text-textMuted capitalize">{(incident.incident_type || "").replace(/_/g, " ")}</span>
                </div>
                <p className="text-xs text-textMuted mt-1">
                  {incident.vehicle_plate} · Flagged {formatTime(incident.flagged_at)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleResendAll} className="px-3 py-1.5 text-xs bg-bg border border-border text-textMuted hover:text-text rounded-lg transition-colors">
                Resend Failed SMS
              </button>
              <button onClick={handleDownloadPDF} className="px-3 py-1.5 text-xs bg-bg border border-border text-cyan rounded-lg transition-colors">
                Download Manifest PDF
              </button>
              {incident.status !== "resolved" && (
                <button onClick={() => setShowResolve(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green/10 border border-green/20 text-green rounded-lg hover:bg-green/20 transition-colors font-bold">
                  <Check size={12} /> Mark Resolved
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Resolve panel */}
        {showResolve && (
          <div className="bg-bg2 border border-green/30 rounded-xl p-4">
            <p className="text-sm font-bold text-text mb-2">Resolve Incident</p>
            <textarea
              value={resolveNotes}
              onChange={e => setResolveNotes(e.target.value)}
              placeholder="Enter resolution notes..."
              rows={3}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-textDim focus:outline-none focus:border-green resize-none mb-3"
            />
            <div className="flex gap-2">
              <button onClick={handleResolve} disabled={resolving}
                className="flex items-center gap-2 px-4 py-2 bg-green/80 hover:bg-green text-white text-xs font-bold rounded-lg disabled:opacity-60 transition-colors">
                {resolving ? <Spinner size={12} /> : <Check size={12} />}
                Confirm Resolved
              </button>
              <button onClick={() => setShowResolve(false)} className="px-3 py-2 text-xs text-textMuted hover:text-text transition-colors">Cancel</button>
            </div>
          </div>
        )}

        {/* Description */}
        {incident.description && (
          <div className="bg-bg2 border border-border rounded-xl p-4">
            <p className="text-[10px] font-extrabold text-textDim uppercase tracking-wider mb-1">Description</p>
            <p className="text-sm text-text">{incident.description}</p>
          </div>
        )}

        {/* GPS */}
        {incident.latitude && (
          <div className="bg-bg2 border border-border rounded-xl p-4 flex items-center gap-3">
            <MapPin size={16} className="text-green" />
            <div className="flex-1">
              <p className="text-xs font-bold text-text">Incident Location</p>
              <p className="text-xs text-textMuted">{incident.latitude}, {incident.longitude}</p>
            </div>
            <a href={`https://maps.google.com/?q=${incident.latitude},${incident.longitude}`}
              target="_blank" rel="noopener noreferrer"
              className="text-xs text-cyan hover:underline">View on Map</a>
          </div>
        )}

        {/* Resolution notes */}
        {incident.status === "resolved" && incident.resolution_notes && (
          <div className="bg-green/5 border border-green/20 rounded-xl p-4">
            <p className="text-[10px] font-extrabold text-green uppercase tracking-wider mb-1">Resolution Notes</p>
            <p className="text-sm text-text">{incident.resolution_notes}</p>
            <p className="text-[10px] text-textDim mt-1">Resolved {formatTime(incident.resolved_at)}</p>
          </div>
        )}

        {/* Passenger Manifest */}
        <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-extrabold text-sm text-text uppercase tracking-wider">
              Passenger Manifest ({incident.passengers?.length || 0})
            </h2>
          </div>
          {!incident.passengers?.length ? (
            <p className="text-textMuted text-sm text-center py-8">No passengers found for this trip</p>
          ) : (
            <div className="divide-y divide-border">
              {incident.passengers.map((p: any, i: number) => (
                <div key={i} className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-bold text-text">{p.passenger_name || "Unknown Passenger"}</p>
                      <a href={`tel:${p.passenger_phone}`} className="text-cyan text-xs hover:underline flex items-center gap-1 mt-0.5">
                        <Phone size={10} /> {p.passenger_phone}
                      </a>
                    </div>
                    <div className="flex items-center gap-2">
                      {p.blood_type && (
                        <span className="bg-red-500/10 text-red-400 text-[10px] font-extrabold px-2 py-0.5 rounded border border-red-500/20">
                          {p.blood_type}
                        </span>
                      )}
                      <Badge tone={p.profile_complete ? "green" : "yellow"}>
                        {p.profile_complete ? "SafeRide ✓" : "No Profile"}
                      </Badge>
                    </div>
                  </div>
                  {p.medical_conditions && (
                    <div className="bg-bg border border-border rounded p-2 text-xs text-textMuted mb-3">
                      ⚕ <strong>Medical:</strong> {p.medical_conditions}
                    </div>
                  )}
                  {p.allergies && (
                    <div className="bg-bg border border-border rounded p-2 text-xs text-textMuted mb-3">
                      ⚠ <strong>Allergies:</strong> {p.allergies}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {[
                      { label: "Primary Contact", name: p.emergency_contact_1_name, phone: p.emergency_contact_1_phone, rel: p.emergency_contact_1_relationship },
                      { label: "Secondary Contact", name: p.emergency_contact_2_name, phone: p.emergency_contact_2_phone, rel: p.emergency_contact_2_relationship },
                      { label: "Next of Kin", name: p.next_of_kin_name, phone: p.next_of_kin_phone, rel: p.next_of_kin_relationship },
                    ].filter(c => c.name || c.phone).map(c => (
                      <div key={c.label} className="flex items-center justify-between bg-bg border border-border rounded px-3 py-2">
                        <div>
                          <span className="text-[10px] font-bold text-textDim uppercase">{c.label}</span>
                          <span className="text-xs text-text ml-2">{c.name}{c.rel ? ` (${c.rel})` : ""}</span>
                        </div>
                        {c.phone && (
                          <a href={`tel:${c.phone}`} className="text-cyan text-xs hover:underline flex items-center gap-1">
                            <Phone size={10} /> {c.phone}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Emergency Notifications */}
        <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-extrabold text-sm text-text uppercase tracking-wider">
              Emergency Notifications ({incident.notifications?.length || 0})
            </h2>
          </div>
          {!incident.notifications?.length ? (
            <p className="text-textMuted text-sm text-center py-6">No notifications sent</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {["Contact", "Phone", "Relationship", "Status", "Sent At"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-textDim font-extrabold uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {incident.notifications.map((n: any, i: number) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="px-4 py-2 font-semibold text-text">{n.contact_name || "—"}</td>
                    <td className="px-4 py-2">
                      <a href={`tel:${n.contact_phone}`} className="text-cyan hover:underline">{n.contact_phone}</a>
                    </td>
                    <td className="px-4 py-2 text-textMuted capitalize">{n.contact_relationship || "—"}</td>
                    <td className="px-4 py-2">
                      {n.sms_status === "sent" ? (
                        <span className="flex items-center gap-1 text-green font-bold"><CheckCircle size={11} /> Sent</span>
                      ) : (
                        <span className="flex items-center gap-1 text-red-400 font-bold"><XCircle size={11} /> {n.sms_status}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-textDim">{n.sent_at ? formatTime(n.sent_at) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* GPS Route */}
        {incident.gps_route?.length > 0 && (
          <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="font-extrabold text-sm text-text uppercase tracking-wider">
                GPS Route ({incident.gps_route.length} points)
              </h2>
              {incident.gps_route[incident.gps_route.length - 1]?.latitude && (
                <a
                  href={`https://maps.google.com/?q=${incident.gps_route[incident.gps_route.length - 1].latitude},${incident.gps_route[incident.gps_route.length - 1].longitude}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-xs text-cyan hover:underline">
                  View Last Location
                </a>
              )}
            </div>
            <div className="max-h-48 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-bg2">
                  <tr className="border-b border-border">
                    {["Time", "Latitude", "Longitude", "Speed"].map(h => (
                      <th key={h} className="text-left px-4 py-2 text-textDim font-extrabold uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {incident.gps_route.map((g: any, i: number) => (
                    <tr key={i} className="border-b border-border/30">
                      <td className="px-4 py-1.5 text-textDim">{g.recorded_at ? formatTime(g.recorded_at) : "—"}</td>
                      <td className="px-4 py-1.5 text-textMuted font-mono">{g.latitude?.toFixed(6)}</td>
                      <td className="px-4 py-1.5 text-textMuted font-mono">{g.longitude?.toFixed(6)}</td>
                      <td className="px-4 py-1.5 text-textMuted">{g.speed > 0 ? `${Math.round(g.speed)} km/h` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}

function buildManifestHTML(incident: any): string {
  const now = new Date().toLocaleDateString("en-ZA");
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; color: #222; padding: 30px; }
  .header { text-align: center; border-bottom: 3px solid #ef4444; padding-bottom: 16px; margin-bottom: 20px; }
  .brand { font-size: 24px; font-weight: 900; color: #00D4FF; letter-spacing: 2px; }
  .inc-ref { background: #ef4444; color: #fff; font-size: 14px; font-weight: 900; padding: 8px 16px; border-radius: 6px; display: inline-block; margin: 8px 0; }
  .section { font-size: 10px; font-weight: 800; letter-spacing: 1.2px; color: #888; text-transform: uppercase; margin: 16px 0 8px; }
  .passenger { border: 1px solid #ddd; border-radius: 8px; padding: 14px; margin-bottom: 14px; }
  .p-name { font-size: 14px; font-weight: 800; }
  .blood { background: #fef2f2; color: #ef4444; font-weight: 800; padding: 2px 8px; border-radius: 4px; font-size: 11px; display: inline-block; margin-left: 8px; }
  .contact { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f0f0f0; font-size: 11px; }
  .footer { text-align: center; color: #aaa; font-size: 10px; border-top: 1px solid #e5e5e5; padding-top: 14px; margin-top: 20px; }
</style>
</head>
<body>
<div class="header">
  <div class="brand">TAG N RIDE SAFERIDE</div>
  <div class="inc-ref">${incident.incident_reference}</div>
  <div style="font-size:11px;color:#888;">INCIDENT PASSENGER MANIFEST · ${now}</div>
  <div style="margin-top:8px;font-size:12px;"><strong>Vehicle:</strong> ${incident.vehicle_plate} &nbsp;|&nbsp; <strong>Type:</strong> ${(incident.incident_type || "").replace(/_/g, " ")} &nbsp;|&nbsp; <strong>Status:</strong> ${incident.status}</div>
</div>
${(incident.passengers || []).map((p: any, i: number) => `
<div class="passenger">
  <div class="p-name">${i + 1}. ${p.passenger_name || "Unknown"} ${p.blood_type ? `<span class="blood">${p.blood_type}</span>` : ""}</div>
  <div style="font-size:11px;color:#555;margin-top:4px;">${p.passenger_phone || ""}</div>
  ${p.medical_conditions ? `<div style="background:#fff8f0;padding:6px 8px;border-radius:4px;margin:6px 0;font-size:11px;">⚕ <strong>Medical:</strong> ${p.medical_conditions}</div>` : ""}
  ${p.allergies ? `<div style="background:#fff8f0;padding:6px 8px;border-radius:4px;margin:6px 0;font-size:11px;">⚠ <strong>Allergies:</strong> ${p.allergies}</div>` : ""}
  <div class="section">Emergency Contacts</div>
  ${[[p.emergency_contact_1_name, p.emergency_contact_1_phone, p.emergency_contact_1_relationship, "Primary"],
     [p.emergency_contact_2_name, p.emergency_contact_2_phone, p.emergency_contact_2_relationship, "Secondary"],
     [p.next_of_kin_name, p.next_of_kin_phone, p.next_of_kin_relationship, "Next of Kin"]
    ].filter(c => c[0] || c[1]).map(c => `
  <div class="contact">
    <span>${c[3]}: ${c[0] || "—"}${c[2] ? ` (${c[2]})` : ""}</span>
    <span><strong>${c[1] || "—"}</strong></span>
  </div>`).join("")}
</div>`).join("")}
<div class="footer">
  This document is confidential — For emergency services and authorized personnel only<br/>
  Tag n Ride Pty Ltd · support@tagnride.com · Generated ${now}
</div>
</body>
</html>`;
}
