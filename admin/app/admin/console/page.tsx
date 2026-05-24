"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Spinner } from "@/components/ui";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/utils";
import {
  Play, CheckCircle, XCircle, AlertTriangle,
  RefreshCw, Clock, ChevronDown, ChevronUp, Shield, Key,
} from "lucide-react";
import toast from "react-hot-toast";
import { DangerPinModal, ChangePinModal, useDangerPin } from "@/components/DangerPinModal";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = (dangerToken?: string) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
  ...(dangerToken ? { "X-Danger-Token": dangerToken } : {}),
});

const CATEGORY_LABELS: Record<string, string> = {
  financial: "Financial & Wallet",
  transactions: "Transactions & Payouts",
  routes: "Driver Routes",
  drivers: "Driver Data",
  maintenance: "Database Maintenance",
  danger: "Danger Zone",
};

const CATEGORY_COLORS: Record<string, string> = {
  financial: "text-cyan border-cyan/20 bg-cyan/5",
  transactions: "text-purple border-purple/20 bg-purple/5",
  routes: "text-green border-green/20 bg-green/5",
  drivers: "text-yellow border-yellow/20 bg-yellow/5",
  maintenance: "text-textMuted border-border bg-bg3",
  danger: "text-red border-red/20 bg-red/5",
};

const CATEGORY_ICONS: Record<string, string> = {
  financial: "💰", transactions: "🔄", routes: "🛣️",
  drivers: "🚗", maintenance: "🧹", danger: "⚠️",
};

const CATEGORY_ORDER = ["financial", "transactions", "routes", "drivers", "maintenance", "danger"];

type CmdResult = { ok: boolean; message: string; details: Record<string, any> };

function getAdminRole(): string {
  try {
    const token = localStorage.getItem("tnr_admin_token") || "";
    const payload = JSON.parse(atob(token.split(".")[1] || "e30="));
    return payload.role || "";
  } catch { return ""; }
}

export default function SystemConsolePage() {
  const router = useRouter();
  const [commands, setCommands] = useState<Record<string, any>>({});
  const [log, setLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, CmdResult>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showLog, setShowLog] = useState(false);
  const [changePinOpen, setChangePinOpen] = useState(false);
  const [role, setRole] = useState("");
  const dangerPin = useDangerPin();

  useEffect(() => {
    const r = getAdminRole();
    setRole(r);
    if (!["superadmin", "ceo"].includes(r)) {
      router.push("/admin/dashboard");
      return;
    }
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [cmdsRes, logRes] = await Promise.all([
        fetch(`${BASE}/api/admin/system/commands`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${BASE}/api/admin/system/command-log`, { headers: authHeaders() }).then(r => r.json()),
      ]);
      setCommands(cmdsRes.commands || {});
      setLog(Array.isArray(logRes) ? logRes : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const runCommand = async (cmd: string) => {
    const cmdDef = commands[cmd];
    let dangerToken: string | null = null;
    if (cmdDef?.danger) {
      dangerToken = await dangerPin.request();
      if (!dangerToken) return;
    }
    setRunning(cmd);
    try {
      const endpoint = cmdDef?.danger
        ? `${BASE}/api/admin/system/run-danger/${cmd}`
        : `${BASE}/api/admin/system/run/${cmd}`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: authHeaders(dangerToken || undefined),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Command failed");
      setResults(prev => ({ ...prev, [cmd]: data }));
      data.ok ? toast.success(data.message) : toast.error(data.message);
      loadAll();
    } catch (e: any) {
      setResults(prev => ({ ...prev, [cmd]: { ok: false, message: e.message, details: {} } }));
      toast.error(e.message);
    } finally {
      setRunning(null);
    }
  };

  const grouped = Object.entries(commands).reduce((acc, [key, val]) => {
    const cat = (val as any).category || "maintenance";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push({ key, ...val });
    return acc;
  }, {} as Record<string, any[]>);

  if (!["superadmin", "ceo"].includes(role) && role !== "") return null;

  return (
    <AdminShell title="System Console">
      <div className="space-y-6 max-w-4xl">

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 p-4 bg-yellow/5 border border-yellow/20 rounded-xl flex-1">
            <AlertTriangle size={18} className="text-yellow flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-yellow font-bold text-sm">CEO and Superadmin only — Use with caution</p>
              <p className="text-yellow/70 text-xs mt-1">
                These commands modify live data. Danger Zone commands require your security PIN.
                All actions are fully logged with your admin ID, IP, and timestamp.
              </p>
            </div>
          </div>
          <button onClick={() => setChangePinOpen(true)}
            className="flex items-center gap-2 px-4 py-3 bg-purple/10 border border-purple/20 rounded-xl text-purple text-sm font-bold hover:bg-purple/20 transition-all flex-shrink-0">
            <Key size={14} />
            Change PIN
          </button>
        </div>

        <div className="flex items-center gap-2 px-4 py-2.5 bg-bg2 border border-border rounded-xl">
          <Shield size={14} className="text-textMuted" />
          <p className="text-textMuted text-xs">
            Danger Zone is PIN-protected. Your PIN token is valid for 5 minutes after verification.
            Only test account data is reset — real user data is never touched.
          </p>
        </div>

        {loading ? <Spinner /> : (
          <>
            {CATEGORY_ORDER.map(cat => {
              const cmds = grouped[cat];
              if (!cmds?.length) return null;
              const colorClass = CATEGORY_COLORS[cat] || "text-textMuted border-border bg-bg3";
              const icon = CATEGORY_ICONS[cat] || "⚙️";
              const label = CATEGORY_LABELS[cat] || cat;
              return (
                <div key={cat}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">{icon}</span>
                    <h2 className="text-text font-bold">{label}</h2>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${colorClass}`}>
                      {cmds.length} {cmds.length === 1 ? "command" : "commands"}
                    </span>
                    {cat === "danger" && (
                      <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red/10 border border-red/20 text-red">
                        <Shield size={9} /> PIN required
                      </span>
                    )}
                  </div>
                  <div className="space-y-3">
                    {cmds.map((cmd: any) => {
                      const result = results[cmd.key];
                      const isRunning = running === cmd.key;
                      const isExpanded = expanded[cmd.key];
                      return (
                        <Card key={cmd.key} className={cmd.danger ? "border-red/20" : ""}>
                          <div className="flex items-start gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <h3 className="text-text font-bold text-sm">{cmd.label}</h3>
                                {cmd.danger && (
                                  <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-red/10 text-red border border-red/20 rounded-full">
                                    <Shield size={8} /> PIN
                                  </span>
                                )}
                                <span className="font-mono text-[10px] text-textDim bg-bg3 px-2 py-0.5 rounded border border-border">
                                  {cmd.key}
                                </span>
                              </div>
                              <p className="text-textMuted text-xs leading-relaxed">{cmd.description}</p>
                              {result && (
                                <div className={`mt-3 p-3 rounded-xl border text-xs ${
                                  result.ok ? "bg-green/5 border-green/20" : "bg-red/5 border-red/20"
                                }`}>
                                  <div className="flex items-center gap-2 mb-1">
                                    {result.ok
                                      ? <CheckCircle size={13} className="text-green" />
                                      : <XCircle size={13} className="text-red" />}
                                    <span className={`font-bold ${result.ok ? "text-green" : "text-red"}`}>
                                      {result.message}
                                    </span>
                                  </div>
                                  {Object.keys(result.details).length > 0 && (
                                    <>
                                      <button
                                        onClick={() => setExpanded(p => ({ ...p, [cmd.key]: !isExpanded }))}
                                        className="flex items-center gap-1 text-textDim hover:text-textMuted mt-1.5 transition-colors">
                                        {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                                        {isExpanded ? "Hide" : "Show"} details
                                      </button>
                                      {isExpanded && (
                                        <pre className="mt-2 text-[10px] text-textMuted overflow-x-auto whitespace-pre-wrap bg-bg rounded-lg p-2">
                                          {JSON.stringify(result.details, null, 2)}
                                        </pre>
                                      )}
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => runCommand(cmd.key)}
                              disabled={isRunning || !!running}
                              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold flex-shrink-0 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                                cmd.danger
                                  ? "bg-red/10 text-red border border-red/20 hover:bg-red/20"
                                  : "bg-cyanDim text-cyan border border-cyan/20 hover:bg-cyan/10"
                              }`}>
                              {isRunning
                                ? <RefreshCw size={13} className="animate-spin" />
                                : cmd.danger ? <Shield size={13} /> : <Play size={13} />}
                              {isRunning ? "Running..." : cmd.danger ? "Run (PIN)" : "Run"}
                            </button>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div>
              <button onClick={() => setShowLog(v => !v)}
                className="flex items-center gap-2 text-textMuted hover:text-text transition-colors mb-3">
                <Clock size={14} />
                <span className="font-bold text-sm">Command Log ({log.length})</span>
                {showLog ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {showLog && (
                <Card>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-text font-bold">Recent Commands</h2>
                    <button onClick={loadAll}
                      className="text-xs text-textMuted hover:text-cyan flex items-center gap-1 transition-colors">
                      <RefreshCw size={11} /> Refresh
                    </button>
                  </div>
                  {log.length === 0 ? (
                    <p className="text-textMuted text-sm text-center py-8">No commands run yet</p>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {log.map(entry => {
                        const cmdDef = commands[entry.command];
                        const isDanger = entry.action?.includes("DANGER");
                        return (
                          <div key={entry.id}
                            className={`flex items-center gap-3 p-3 rounded-xl border text-sm ${
                              isDanger ? "bg-red/5 border-red/20" : "bg-bg border-border"
                            }`}>
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                              isDanger ? "bg-red/10" : "bg-green/10"
                            }`}>
                              {isDanger
                                ? <Shield size={13} className="text-red" />
                                : <CheckCircle size={13} className="text-green" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-text font-medium text-xs truncate">
                                {cmdDef?.label || entry.command}
                              </p>
                              <p className="text-textDim text-[10px] truncate">
                                {entry.metadata?.message || entry.command}
                              </p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-textDim text-[10px]">{formatDate(entry.created_at)}</p>
                              {entry.ip_address && (
                                <p className="text-textDim text-[10px] font-mono">{entry.ip_address}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              )}
            </div>
          </>
        )}
      </div>

      <DangerPinModal
        open={dangerPin.open}
        onSuccess={dangerPin.handleSuccess}
        onCancel={dangerPin.handleCancel}
        actionLabel="run this destructive command"
      />
      <ChangePinModal open={changePinOpen} onClose={() => setChangePinOpen(false)} />
    </AdminShell>
  );
}
