"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import { Spinner, PermissionGate } from "@/components/ui";
import { api, Incident } from "@/lib/api";
import { timeAgo } from "@/lib/utils";
import { AlertTriangle, Plus, Eye, CheckCircle, Search, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";

const INCIDENT_TYPES = ["accident", "breakdown", "suspicious_activity", "medical_emergency", "panic", "other"];

const SEVERITY_CLS: Record<string, string> = {
  low: "bg-bg3 border-border text-textMuted",
  medium: "bg-yellow/10 border-yellow/20 text-yellow",
  high: "bg-orange/10 border-orange/20 text-orange",
  critical: "bg-red/10 border-red/20 text-red",
};

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const [createPlate, setCreatePlate] = useState("");
  const [createType, setCreateType] = useState("accident");
  const [createDesc, setCreateDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "resolved">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const fetchIncidents = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await api.incidents();
      setIncidents(res.data || []);
    } catch (e: any) {
      setLoadError(true);
      toast.error(e.message || "Failed to load incidents");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchIncidents(); }, [fetchIncidents]);

  const handleCreate = async () => {
    if (!createPlate.trim()) { toast.error("Vehicle plate is required"); return; }
    setCreating(true);
    try {
      const res = await api.createIncident({
        vehicle_plate: createPlate.trim().toUpperCase(),
        incident_type: createType,
        description: createDesc.trim() || undefined,
      });
      if (res.data.trip_id) {
        toast.success(`Incident ${res.data.incident_reference} created — ${res.data.notifications_sent_count || 0} SMS sent`);
      } else {
        toast(`Incident ${res.data.incident_reference} created — no active trip matched this plate, no passengers notified`, { icon: "⚠️" });
      }
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

  const visible = useMemo(() => {
    let list = incidents;
    if (statusFilter !== "all") {
      list = list.filter(i => statusFilter === "resolved" ? i.status === "resolved" : i.status !== "resolved");
    }
    if (typeFilter !== "all") list = list.filter(i => i.incident_type === typeFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(i => (i.vehicle_plate || "").toLowerCase().includes(q) || (i.incident_reference || "").toLowerCase().includes(q));
    return list;
  }, [incidents, statusFilter, typeFilter, search]);

  return (
    <AdminShell title="Incident Management">
      <PermissionGate permission="view_audit">
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

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-textDim" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by plate or reference…"
              className="w-full bg-bg2 border border-border rounded-lg pl-8 pr-3 py-2 text-xs text-text placeholder:text-textDim focus:outline-none focus:border-cyan"
            />
          </div>
          {(["all", "active", "resolved"] as const).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                statusFilter === f ? "bg-cyanDim text-cyan border border-cyan/20" : "text-textMuted border border-border hover:text-text"
              }`}>
              {f === "all" ? "All" : f === "active" ? "Active" : "Resolved"}
            </button>
          ))}
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="bg-bg2 border border-border rounded-lg px-3 py-2 text-xs text-text focus:outline-none focus:border-cyan">
            <option value="all">All types</option>
            {INCIDENT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
          </select>
        </div>

        {/* Incidents table */}
        <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Spinner size={24} /></div>
          ) : loadError ? (
            <div className="flex flex-col items-center gap-2 py-16 text-textMuted text-sm">
              <AlertCircle size={20} className="text-yellow-400" />
              Failed to load incidents — try refreshing.
            </div>
          ) : visible.length === 0 ? (
            <div className="text-center py-16 text-textMuted text-sm">
              {incidents.length === 0 ? "No incidents recorded" : "No incidents match this filter"}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-bg3">
                  {["Reference", "Plate", "Type", "Severity", "Assigned", "Passengers", "SMS Sent", "Age", "Status", ""].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-textDim font-extrabold uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map(inc => (
                  <tr key={inc.id} className="border-b border-border/50 hover:bg-bg3 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-text">{inc.incident_reference}</td>
                    <td className="px-4 py-3 font-bold text-cyan">{inc.vehicle_plate}</td>
                    <td className="px-4 py-3 text-textMuted capitalize">{(inc.incident_type || "").replace(/_/g, " ")}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold ${SEVERITY_CLS[inc.severity] ?? SEVERITY_CLS.medium}`}>{(inc.severity || "medium").toUpperCase()}</span>
                    </td>
                    <td className="px-4 py-3 text-textMuted">{inc.assigned_admin_name || "—"}</td>
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
                    <td className="px-4 py-3 text-textMuted">
                      <span title={formatTime(inc.flagged_at)}>
                        {inc.status !== "resolved" ? timeAgo(inc.flagged_at) : formatTime(inc.flagged_at)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold ${inc.status === "resolved" ? "bg-green/10 border-green/20 text-green" : "bg-red/10 border-red/20 text-red"}`}>
                        {inc.status === "resolved" ? "Resolved" : "Active"}
                      </span>
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
      </PermissionGate>
    </AdminShell>
  );
}
