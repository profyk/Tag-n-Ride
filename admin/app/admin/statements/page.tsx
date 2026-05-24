"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Spinner } from "@/components/ui";
import { hasPermission } from "@/lib/api";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/utils";
import {
  Download, TrendingUp, Users, Wallet, ArrowUpDown,
  Shield, RefreshCw, Clock, CheckCircle, BarChart3, FileText,
} from "lucide-react";
import toast from "react-hot-toast";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

type DateRange = "today" | "week" | "month" | "last_month" | "3months" | "6months" | "year" | "custom";

const DATE_RANGES: { key: DateRange; label: string }[] = [
  { key: "today",      label: "Today" },
  { key: "week",       label: "This Week" },
  { key: "month",      label: "This Month" },
  { key: "last_month", label: "Last Month" },
  { key: "3months",    label: "Last 3 Months" },
  { key: "6months",    label: "Last 6 Months" },
  { key: "year",       label: "This Year" },
  { key: "custom",     label: "Custom Range" },
];

function getDateRange(range: DateRange, customFrom?: string, customTo?: string) {
  const now = new Date();
  switch (range) {
    case "today": {
      const start = new Date(now); start.setHours(0,0,0,0);
      return { from: start.toISOString(), to: new Date().toISOString() };
    }
    case "week": {
      const d = new Date(); d.setDate(d.getDate() - 7);
      return { from: d.toISOString(), to: new Date().toISOString() };
    }
    case "month": {
      const d = new Date(); d.setDate(1); d.setHours(0,0,0,0);
      return { from: d.toISOString(), to: new Date().toISOString() };
    }
    case "last_month": {
      const start = new Date(); start.setMonth(start.getMonth()-1,1); start.setHours(0,0,0,0);
      const end = new Date(); end.setDate(0); end.setHours(23,59,59,999);
      return { from: start.toISOString(), to: end.toISOString() };
    }
    case "3months": {
      const d = new Date(); d.setMonth(d.getMonth()-3);
      return { from: d.toISOString(), to: new Date().toISOString() };
    }
    case "6months": {
      const d = new Date(); d.setMonth(d.getMonth()-6);
      return { from: d.toISOString(), to: new Date().toISOString() };
    }
    case "year": {
      const d = new Date(); d.setMonth(0,1); d.setHours(0,0,0,0);
      return { from: d.toISOString(), to: new Date().toISOString() };
    }
    case "custom":
      return { from: customFrom || "", to: customTo || "" };
    default:
      return { from: "", to: "" };
  }
}

interface StatementType {
  key: string;
  label: string;
  description: string;
  icon: any;
  color: string;
  endpoint: string;
  roles: string[];
}

const STATEMENTS: StatementType[] = [
  {
    key: "transactions", label: "Transaction History",
    description: "All platform transactions — payments, top-ups, refunds. Excludes test data.",
    icon: ArrowUpDown, color: "text-cyan",
    endpoint: "/admin/statements/transactions",
    roles: ["finance", "cfo", "ceo", "superadmin"],
  },
  {
    key: "revenue", label: "Revenue Statement",
    description: "Daily platform fee revenue and gross volume breakdown.",
    icon: TrendingUp, color: "text-green",
    endpoint: "/admin/statements/revenue",
    roles: ["cfo", "ceo", "superadmin"],
  },
  {
    key: "driver-earnings", label: "Driver Earnings",
    description: "Per-driver earnings, fees deducted, and net payouts.",
    icon: Users, color: "text-yellow",
    endpoint: "/admin/statements/driver-earnings",
    roles: ["finance", "cfo", "ceo", "superadmin"],
  },
  {
    key: "withdrawals", label: "Withdrawal Report",
    description: "All withdrawal requests with bank details and status.",
    icon: Wallet, color: "text-purple",
    endpoint: "/admin/statements/withdrawals",
    roles: ["finance", "cfo", "ceo", "superadmin"],
  },
  {
    key: "reconciliation", label: "Reconciliation Report",
    description: "Platform-wide balance reconciliation with variance analysis.",
    icon: BarChart3, color: "text-cyan",
    endpoint: "/admin/statements/reconciliation",
    roles: ["cfo", "ceo", "superadmin"],
  },
  {
    key: "audit-export", label: "Audit Log Export",
    description: "Full audit trail of all admin actions — CEO and Superadmin only.",
    icon: Shield, color: "text-red",
    endpoint: "/admin/statements/audit-export",
    roles: ["ceo", "superadmin"],
  },
];export default function StatementsPage() {
  const router = useRouter();
  const [dateRange, setDateRange] = useState<DateRange>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [userRole, setUserRole] = useState("");

  useEffect(() => {
    if (!hasPermission("download_statements")) {
      router.push("/admin/dashboard");
      return;
    }
    try {
      const token = localStorage.getItem("tnr_admin_token") || "";
      const payload = JSON.parse(atob(token.split(".")[1] || "e30="));
      setUserRole(payload.role || "");
    } catch {}
  }, []);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`${BASE}/api/admin/statements/list`, { headers: authHeaders() });
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
    finally { setHistoryLoading(false); }
  };

  const handleDownload = async (stmt: StatementType) => {
    const { from, to } = getDateRange(dateRange, customFrom, customTo);
    if (dateRange === "custom" && (!from || !to)) {
      toast.error("Select a custom date range first");
      return;
    }
    setDownloading(stmt.key);
    try {
      const params = new URLSearchParams({ fmt: "csv" });
      if (from) params.set("date_from", from);
      if (to) params.set("date_to", to);
      const url = `${BASE}/api${stmt.endpoint}?${params}`;
      const res = await fetch(url, { headers: authHeaders() });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Download failed");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename=(.+)/);
      const filename = match ? match[1] : `${stmt.key}.csv`;
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
      toast.success(`${stmt.label} downloaded`);
      if (showHistory) loadHistory();
    } catch (e: any) { toast.error(e.message); }
    finally { setDownloading(null); }
  };

  const availableStatements = STATEMENTS.filter(s => s.roles.includes(userRole));

  return (
    <AdminShell title="Statements">
      <div className="space-y-6 max-w-4xl">

        <Card>
          <h2 className="text-text font-bold mb-4">Date Range</h2>
          <div className="flex flex-wrap gap-2 mb-3">
            {DATE_RANGES.map(r => (
              <button key={r.key} onClick={() => setDateRange(r.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                  dateRange === r.key
                    ? "bg-cyan/20 border-cyan/30 text-cyan"
                    : "bg-bg3 border-border text-textMuted hover:text-text"
                }`}>
                {r.label}
              </button>
            ))}
          </div>
          {dateRange === "custom" && (
            <div className="flex items-center gap-3 mt-2">
              <div className="flex-1">
                <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1 block">From</label>
                <input type="date" value={customFrom.slice(0,10)}
                  onChange={e => setCustomFrom(new Date(e.target.value).toISOString())}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-text text-sm focus:outline-none focus:border-cyan" />
              </div>
              <div className="flex-1">
                <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1 block">To</label>
                <input type="date" value={customTo.slice(0,10)}
                  onChange={e => setCustomTo(new Date(e.target.value + "T23:59:59").toISOString())}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-text text-sm focus:outline-none focus:border-cyan" />
              </div>
            </div>
          )}
          {dateRange !== "custom" && (
            <p className="text-textDim text-xs">
              {(() => {
                const { from, to } = getDateRange(dateRange);
                if (!from) return "";
                return `${new Date(from).toLocaleDateString()} — ${new Date(to).toLocaleDateString()}`;
              })()}
            </p>
          )}
        </Card>

        <div className="space-y-3">
          <h2 className="text-text font-bold">Available Statements</h2>
          {availableStatements.length === 0 ? (
            <Card>
              <p className="text-textMuted text-sm text-center py-6">Loading statements...</p>
            </Card>
          ) : availableStatements.map(stmt => {
            const Icon = stmt.icon;
            const isDownloading = downloading === stmt.key;
            return (
              <Card key={stmt.key}>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-bg3 border border-border flex items-center justify-center flex-shrink-0">
                    <Icon size={18} className={stmt.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-text font-bold text-sm">{stmt.label}</h3>
                    <p className="text-textMuted text-xs mt-0.5">{stmt.description}</p>
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      {stmt.roles.map(r => (
                        <span key={r} className="text-[9px] font-bold px-1.5 py-0.5 bg-bg3 border border-border rounded text-textDim uppercase">
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => handleDownload(stmt)} disabled={!!downloading}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-bg3 border border-border rounded-xl text-textMuted text-xs font-bold hover:text-cyan hover:border-cyan/30 transition-all disabled:opacity-50 flex-shrink-0">
                    {isDownloading
                      ? <RefreshCw size={13} className="animate-spin" />
                      : <Download size={13} />}
                    {isDownloading ? "Downloading..." : "Download CSV"}
                  </button>
                </div>
              </Card>
            );
          })}
        </div>

        <div>
          <button onClick={() => { setShowHistory(v => !v); if (!showHistory) loadHistory(); }}
            className="flex items-center gap-2 text-textMuted hover:text-text transition-colors mb-3">
            <Clock size={14} />
            <span className="font-bold text-sm">Download History</span>
          </button>
          {showHistory && (
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-text font-bold">Recent Downloads</h2>
                <button onClick={loadHistory} className="text-xs text-textMuted hover:text-cyan flex items-center gap-1 transition-colors">
                  <RefreshCw size={11} /> Refresh
                </button>
              </div>
              {historyLoading ? <Spinner /> : history.length === 0 ? (
                <p className="text-textMuted text-sm text-center py-6">No downloads yet</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {history.map(h => (
                    <div key={h.id} className="flex items-center gap-3 p-3 bg-bg rounded-xl border border-border text-xs">
                      <CheckCircle size={13} className="text-green flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-text font-medium capitalize">{h.statement_type.replace(/_/g, " ")} · {h.format?.toUpperCase()}</p>
                        <p className="text-textDim font-mono">{h.reference}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-textMuted">{h.downloaded_by_name || "Admin"}</p>
                        <p className="text-textDim">{formatDate(h.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </AdminShell>
  );
 }                                           
