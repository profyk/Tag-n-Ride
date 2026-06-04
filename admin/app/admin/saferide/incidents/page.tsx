"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import { Badge, Spinner, Button } from "@/components/ui";
import client from "@/lib/api";
import { AlertTriangle, Plus, Eye, CheckCircle } from "lucide-react";
import toast from "react-hot-toast";

const INCIDENT_TYPES = ["accident", "breakdown", "suspicious_activity", "medical_emergency", "panic", "other"];

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const [createPlate, setCreatePlate] = useState("");
  const [createType, setCreateType] = useState("accident");
  const [createDesc, setCreateDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchIncidents = useCallback(async () => {
    try {
      const res = await client.get("/api/admin/incidents");
      setIncidents(res.data || []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load incidents");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchIncidents(); }, []);

  const handleCreate = async () => {
    if (!createPlate.trim()) { toast.error("Vehicle plate is required"); return; }
    setCreating(true);
    try {
      const res = await client.post("/api/admin/incidents", {
        vehicle_plate: createPlate.trim().toUpperCase(),
        incident_type: createType,
        description: createDesc.trim() || undefined,
      });
      toast.success(`Incident ${res.data.incident_reference} created — ${res.data.notifications_sent_count || 0} SMS sent`);
      setShowCreate(false);
      setCreatePlate(""); setCreateType("accident"); setCreateDesc("");
      fetchIncidents();
    } catch (e: any) {
      toast.error(e.message || "Failed to create incident");
    } finally { setCreating(false); }
  };

  const formatTime = (iso: string) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-ZA", { dateStyle: "short", timeStyle: "short" });
  };

  return (
    <AdminShell>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red/10 border border-red/20 flex items-center justify-center">
              <AlertTriangle size={20} className="text-red-400" />
            </div>
            <div>
              <h1 className="text-xl font-black text-text">Incident Management</h1>
              <p className="text-xs text-textMuted">SafeRide emergency incidents and notifications</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/admin/saferide" className="text-xs text-textMuted hover:text-cyan transition-colors">
              ← SafeRide Command
            </Link>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-lg transition-colors">
              <Plus size={14} />
              Create Incident
            </button>
          </div>
        </div>

        {/* Create Incident Panel */}
        {showCreate && (
          <div className="bg-bg2 border border-red-500/30 rounded-xl p-5">
            <h2 className="font-extrabold text-red-400 text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
              <AlertTriangle size={14} />
              Create Incident
            </h2>
            <p className="text-xs text-textMuted mb-4">
              This will automatically find all passengers in the vehicle and send SMS to all emergency contacts.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] font-extrabold text-textDim uppercase tracking-wider block mb-1">
                  Vehicle Plate *
                </label>
                <input
                  value={createPlate}
                  onChange={e => setCreatePlate(e.target.value.toUpperCase())}
                  placeholder="e.g. ND 123 456"
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-textDim focus:outline-none focus:border-red-400 transition-colors"
                />
              </div>
              <div>
                <label className="text-[10px] font-extrabold text-textDim uppercase tracking-wider block mb-1">
                  Incident Type
                </label>
                <select
                  value={createType}
                  onChange={e => setCreateType(e.target.value)}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-red-400 transition-colors">
                  {INCIDENT_TYPES.map(t => (
                    <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-extrabold text-textDim uppercase tracking-wider block mb-1">
                  Description
                </label>
                <input
                  value={createDesc}
                  onChange={e => setCreateDesc(e.target.value)}
                  placeholder="Brief description (optional)"
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-textDim focus:outline-none focus:border-red-400 transition-colors"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex items-center gap-2 px-6 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-60">
                {creating ? <Spinner size={14} /> : <AlertTriangle size={14} />}
                Create & Send SMS Alerts
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-textMuted hover:text-text text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Incidents table */}
        <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Spinner size={24} /></div>
          ) : incidents.length === 0 ? (
            <div className="text-center py-16 text-textMuted text-sm">No incidents recorded</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-bg3">
                  {["Reference", "Plate", "Type", "Passengers", "SMS Sent", "Time", "Status", ""].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-textDim font-extrabold uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {incidents.map(inc => (
                  <tr key={inc.id} className="border-b border-border/50 hover:bg-bg3 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-text">{inc.incident_reference}</td>
                    <td className="px-4 py-3 font-bold text-cyan">{inc.vehicle_plate}</td>
                    <td className="px-4 py-3 text-textMuted capitalize">{(inc.incident_type || "").replace(/_/g, " ")}</td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-text">{inc.passenger_count || 0}</span>
                    </td>
                    <td className="px-4 py-3">
                      {inc.notifications_sent ? (
                        <span className="flex items-center gap-1 text-green font-bold">
                          <CheckCircle size={12} /> {inc.notif_count || 0}
                        </span>
                      ) : (
                        <span className="text-textDim">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-textMuted">{formatTime(inc.flagged_at)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={inc.status === "resolved" ? "green" : "red"}>
                        {inc.status === "resolved" ? "Resolved" : "Active"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/saferide/incidents/${inc.id}`}
                        className="flex items-center gap-1 text-cyan hover:underline font-semibold">
                        <Eye size={12} /> View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
