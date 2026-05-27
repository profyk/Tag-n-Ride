"use client";
import { useEffect, useState, useCallback } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Spinner, Button } from "@/components/ui";
import { hasPermission } from "@/lib/api";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/utils";
import {
  Download, TrendingUp, Users, Wallet, ArrowUpDown, Shield,
  RefreshCw, Clock, CheckCircle, BarChart3, FileText,
  Printer, Search, User, Car, MapPin, RotateCcw, Star,
  ChevronDown, ChevronUp, AlertTriangle, Building2,
} from "lucide-react";
import toast from "react-hot-toast";

const BASE = "https://tag-n-ride-production.up.railway.app";
const token = () => localStorage.getItem("tnr_admin_token") || "";
const authHeaders = () => ({ Authorization: `Bearer ${token()}` });

// ── Types ─────────────────────────────────────────────────────────────────────

type DateRange = "today" | "week" | "month" | "last_month" | "3months" | "6months" | "year" | "custom";

const DATE_RANGES: { key: DateRange; label: string }[] = [
  { key: "today",      label: "Today" },
  { key: "week",       label: "This Week" },
  { key: "month",      label: "This Month" },
  { key: "last_month", label: "Last Month" },
  { key: "3months",    label: "Last 3 Months" },
  { key: "6months",    label: "Last 6 Months" },
  { key: "year",       label: "This Year" },
  { key: "custom",     label: "Custom" },
];

interface StatDef {
  key: string;
  label: string;
  description: string;
  icon: any;
  color: string;
  endpoint: string;
  roles: string[];
  printable: boolean;
}

const STATEMENTS: StatDef[] = [
  {
    key: "transactions",   label: "Transaction History",
    description: "All platform transactions — payments, top-ups, refunds. Excludes test data.",
    icon: ArrowUpDown,  color: "text-cyan",    endpoint: "/admin/statements/transactions",     roles: ["finance","cfo","ceo","superadmin"], printable: true,
  },
  {
    key: "revenue",        label: "Revenue Statement",
    description: "Daily platform fee revenue, gross volume, and net margin breakdown.",
    icon: TrendingUp,   color: "text-green",   endpoint: "/admin/statements/revenue",           roles: ["cfo","ceo","superadmin"],           printable: true,
  },
  {
    key: "driver-earnings",label: "Driver Earnings",
    description: "Per-driver earnings, platform fees deducted, and net payouts.",
    icon: Car,          color: "text-yellow",  endpoint: "/admin/statements/driver-earnings",   roles: ["finance","cfo","ceo","superadmin"], printable: true,
  },
  {
    key: "withdrawals",    label: "Withdrawal Report",
    description: "All withdrawal requests with bank details, amounts, and status.",
    icon: Wallet,       color: "text-purple",  endpoint: "/admin/statements/withdrawals",       roles: ["finance","cfo","ceo","superadmin"], printable: true,
  },
  {
    key: "reconciliation", label: "Reconciliation Report",
    description: "Platform-wide balance reconciliation with variance analysis.",
    icon: BarChart3,    color: "text-cyan",    endpoint: "/admin/statements/reconciliation",    roles: ["cfo","ceo","superadmin"],           printable: true,
  },
  {
    key: "passenger-topups",label: "Passenger Top-ups",
    description: "All passenger top-up transactions, gateway fees, and net received.",
    icon: Users,        color: "text-cyan",    endpoint: "/admin/statements/passenger-topups",  roles: ["finance","cfo","ceo","superadmin"], printable: true,
  },
  {
    key: "fleet-earnings", label: "Fleet Owner Report",
    description: "Fleet owner earnings aggregated by owner, with per-driver breakdown.",
    icon: Building2,    color: "text-purple",  endpoint: "/admin/statements/fleet-earnings",    roles: ["finance","cfo","ceo","superadmin"], printable: true,
  },
  {
    key: "routes",         label: "Routes & Fare Collection",
    description: "All completed routes, fare amounts, app vs cash passenger split.",
    icon: MapPin,       color: "text-green",   endpoint: "/admin/statements/routes",            roles: ["finance","cfo","ceo","superadmin"], printable: true,
  },
  {
    key: "refunds",        label: "Refunds Report",
    description: "All processed refunds with amounts, requestor, and resolution notes.",
    icon: RotateCcw,    color: "text-yellow",  endpoint: "/admin/statements/refunds",           roles: ["finance","cfo","ceo","superadmin"], printable: true,
  },
  {
    key: "kyc-decisions",  label: "KYC Decisions Log",
    description: "All KYC submissions, review decisions, rejection reasons, and reviewers.",
    icon: Star,         color: "text-cyan",    endpoint: "/admin/statements/kyc-decisions",     roles: ["cfo","ceo","superadmin"],           printable: true,
  },
  {
    key: "audit-export",   label: "Audit Log Export",
    description: "Full audit trail of all admin actions — CEO and Superadmin only.",
    icon: Shield,       color: "text-red",     endpoint: "/admin/statements/audit-export",      roles: ["ceo","superadmin"],                 printable: true,
  },
];

// ── Date helpers ──────────────────────────────────────────────────────────────

function getDateRange(range: DateRange, customFrom?: string, customTo?: string) {
  const now = new Date();
  const iso = (d: Date) => d.toISOString();
  switch (range) {
    case "today": {
      const s = new Date(now); s.setHours(0,0,0,0);
      return { from: iso(s), to: iso(now) };
    }
    case "week": {
      const s = new Date(now); s.setDate(s.getDate()-7);
      return { from: iso(s), to: iso(now) };
    }
    case "month": {
      const s = new Date(now); s.setDate(1); s.setHours(0,0,0,0);
      return { from: iso(s), to: iso(now) };
    }
    case "last_month": {
      const s = new Date(now); s.setMonth(s.getMonth()-1,1); s.setHours(0,0,0,0);
      const e = new Date(now); e.setDate(0); e.setHours(23,59,59,999);
      return { from: iso(s), to: iso(e) };
    }
    case "3months": {
      const s = new Date(now); s.setMonth(s.getMonth()-3);
      return { from: iso(s), to: iso(now) };
    }
    case "6months": {
      const s = new Date(now); s.setMonth(s.getMonth()-6);
      return { from: iso(s), to: iso(now) };
    }
    case "year": {
      const s = new Date(now); s.setMonth(0,1); s.setHours(0,0,0,0);
      return { from: iso(s), to: iso(now) };
    }
    case "custom":
      return { from: customFrom || "", to: customTo || "" };
    default:
      return { from: "", to: "" };
  }
}

function fmtDateRange(range: DateRange, from: string, to: string) {
  if (!from || !to) return "";
  const f = new Date(from).toLocaleDateString("en-ZA", { day:"numeric", month:"short", year:"numeric" });
  const t = new Date(to).toLocaleDateString("en-ZA", { day:"numeric", month:"short", year:"numeric" });
  return range === "today" ? f : `${f} — ${t}`;
}

// ── Admin name from JWT ───────────────────────────────────────────────────────

function adminName(): string {
  try {
    const tk = token();
    const payload = JSON.parse(atob(tk.split(".")[1] || "e30="));
    return payload.full_name || payload.name || payload.email || "Admin";
  } catch { return "Admin"; }
}

function adminRole(): string {
  try {
    const tk = token();
    const payload = JSON.parse(atob(tk.split(".")[1] || "e30="));
    return payload.role || "";
  } catch { return ""; }
}

// ── CSV parsing ───────────────────────────────────────────────────────────────

function parseCSV(csv: string): { headers: string[]; rows: string[][] } {
  const lines = csv.trim().split("\n").filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };
  const parseRow = (line: string) =>
    line.match(/(?:"[^"]*"|[^,])+/g)?.map(c => c.replace(/^"|"$/g, "").trim()) ?? [];
  const [first, ...rest] = lines;
  return { headers: parseRow(first), rows: rest.map(parseRow) };
}

// ── Print engine ──────────────────────────────────────────────────────────────

async function fetchAndPrint(opts: {
  url: string;
  title: string;
  subtitle: string;
  dateLabel: string;
  confidential?: boolean;
}) {
  const { url, title, subtitle, dateLabel, confidential } = opts;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).detail || "Failed to fetch data");
  }
  const csv = await res.text();
  const { headers, rows } = parseCSV(csv);
  if (headers.length === 0) throw new Error("No data available for this period");

  const now = new Date().toLocaleString("en-ZA");
  const admin = adminName();
  const refId = `TNR-${Date.now().toString(36).toUpperCase()}`;

  const tableHead = headers.map(h => `<th>${h}</th>`).join("");
  const tableBody = rows.map(row =>
    `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`
  ).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      font-size: 10px; color: #111; background: #fff;
      padding: 24px 28px;
    }
    .header {
      display: flex; justify-content: space-between; align-items: flex-start;
      padding-bottom: 14px; margin-bottom: 14px;
      border-bottom: 2px solid #000;
    }
    .brand { font-size: 20px; font-weight: 900; letter-spacing: -0.5px; }
    .brand span { color: #009900; }
    .meta-right { text-align: right; }
    .title { font-size: 15px; font-weight: 700; margin-top: 4px; }
    .subtitle { font-size: 11px; color: #444; margin-top: 2px; }
    .date { font-size: 10px; color: #666; margin-top: 2px; }
    .info-strip {
      display: flex; gap: 24px; margin-bottom: 14px;
      padding: 8px 12px; background: #f5f5f5; border-radius: 4px;
      font-size: 9px; color: #555;
    }
    .info-strip strong { color: #111; }
    table {
      width: 100%; border-collapse: collapse; font-size: 9px;
      page-break-inside: auto;
    }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    th {
      background: #111; color: #fff; padding: 5px 7px; text-align: left;
      font-size: 8px; text-transform: uppercase; letter-spacing: 0.6px;
      font-weight: 700; white-space: nowrap;
    }
    td { padding: 4px 7px; border-bottom: 1px solid #eee; vertical-align: top; }
    tr:nth-child(even) td { background: #fafafa; }
    tr:last-child td { border-bottom: none; }
    .footer {
      margin-top: 16px; padding-top: 8px; border-top: 1px solid #ddd;
      display: flex; justify-content: space-between; font-size: 8px; color: #888;
    }
    .confidential {
      display: inline-block; padding: 2px 8px; background: #ffe0e0;
      color: #cc0000; border: 1px solid #ffaaaa; border-radius: 3px;
      font-size: 8px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 1px; margin-bottom: 8px;
    }
    .count { font-size: 9px; color: #666; margin-bottom: 8px; }
    @media print {
      @page { margin: 1.2cm 1.4cm; size: A4 landscape; }
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">Tag<span>-n-</span>Ride</div>
      ${confidential ? '<div class="confidential">Confidential</div>' : ""}
      <div class="title">${title}</div>
      <div class="subtitle">${subtitle}</div>
      <div class="date">Period: ${dateLabel}</div>
    </div>
    <div class="meta-right">
      <div style="font-size:11px;font-weight:700">Official Statement</div>
      <div style="font-size:9px;color:#666;margin-top:4px">Generated: ${now}</div>
      <div style="font-size:9px;color:#666">By: ${admin}</div>
      <div style="font-size:9px;color:#888;margin-top:4px">Ref: ${refId}</div>
    </div>
  </div>
  <div class="info-strip">
    <span><strong>Report:</strong> ${title}</span>
    <span><strong>Records:</strong> ${rows.length}</span>
    <span><strong>Exported:</strong> ${now}</span>
    <span><strong>Admin:</strong> ${admin}</span>
  </div>
  <p class="count">${rows.length} record${rows.length !== 1 ? "s" : ""}</p>
  <table>
    <thead><tr>${tableHead}</tr></thead>
    <tbody>${tableBody}</tbody>
  </table>
  <div class="footer">
    <span>Tag-n-Ride Operations · Confidential · For internal use only</span>
    <span>Ref: ${refId}</span>
  </div>
  <script>window.onload = function(){ window.print(); }<\/script>
</body>
</html>`;

  const pw = window.open("", "_blank");
  if (!pw) throw new Error("Allow pop-ups to print");
  pw.document.write(html);
  pw.document.close();
}

// ── Per-entity statement section ──────────────────────────────────────────────

function EntityStatement({
  label, icon: Icon, placeholder, lookupUrl, statementUrl, dateLabel,
}: {
  label: string;
  icon: any;
  placeholder: string;
  lookupUrl: (q: string) => string;
  statementUrl: (id: string) => string;
  dateLabel: string;
}) {
  const [query, setQuery] = useState("");
  const [entity, setEntity] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true); setEntity(null);
    try {
      const res = await fetch(`${BASE}${lookupUrl(query.trim())}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Not found");
      const d = await res.json();
      setEntity(d.user || d.driver || d.data || d);
    } catch { toast.error(`${label} not found`); }
    finally { setSearching(false); }
  };

  const download = async () => {
    if (!entity) return;
    setDownloading(true);
    try {
      const id = entity.user_id || entity.id;
      const url = `${BASE}${statementUrl(id)}`;
      const res = await fetch(url, { headers: authHeaders() });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `statement-${entity.full_name?.replace(/\s+/g,"-") || id}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Downloaded");
    } catch (e: any) { toast.error(e.message); }
    finally { setDownloading(false); }
  };

  const print = async () => {
    if (!entity) return;
    setPrinting(true);
    try {
      const id = entity.user_id || entity.id;
      const url = `${BASE}${statementUrl(id)}`;
      await fetchAndPrint({
        url,
        title: `${label} Statement`,
        subtitle: entity.full_name || entity.phone_number || id,
        dateLabel,
        confidential: true,
      });
    } catch (e: any) { toast.error(e.message); }
    finally { setPrinting(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Icon size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-textDim" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && search()}
            placeholder={placeholder}
            className="w-full bg-bg border border-border rounded-lg pl-8 pr-4 py-2 text-text text-sm focus:outline-none focus:border-cyan placeholder:text-textDim"
          />
        </div>
        <Button onClick={search} loading={searching}>
          <Search size={13} /> Find
        </Button>
      </div>

      {entity && (
        <div className="flex items-center justify-between p-4 bg-bg border border-cyan/20 rounded-xl">
          <div>
            <p className="text-text font-bold text-sm">{entity.full_name || "—"}</p>
            <p className="text-textDim text-xs font-mono">{entity.phone_number || entity.id}</p>
            {entity.role && <p className="text-textDim text-[10px] mt-0.5 capitalize">{entity.role}</p>}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={download} loading={downloading}>
              <Download size={13} /> CSV
            </Button>
            <Button onClick={print} loading={printing}>
              <Printer size={13} /> Print
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StatementsPage() {
  const router = useRouter();
  const [dateRange, setDateRange] = useState<DateRange>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [printing, setPrinting] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showEntitySection, setShowEntitySection] = useState(false);
  const [userRole, setUserRole] = useState("");

  useEffect(() => {
    if (!hasPermission("download_statements")) { router.push("/admin/dashboard"); return; }
    setUserRole(adminRole());
  }, []);

  const { from, to } = getDateRange(dateRange, customFrom, customTo);
  const dateLabel = fmtDateRange(dateRange, from, to);

  const buildParams = (extra: Record<string,string> = {}) => {
    const p = new URLSearchParams(extra);
    if (from) p.set("date_from", from);
    if (to)   p.set("date_to", to);
    return p.toString();
  };

  const handleDownload = async (stmt: StatDef) => {
    if (dateRange === "custom" && (!from || !to)) { toast.error("Select a date range first"); return; }
    setDownloading(stmt.key);
    try {
      const url = `${BASE}/api${stmt.endpoint}?${buildParams({ fmt: "csv" })}`;
      const res = await fetch(url, { headers: authHeaders() });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || "Download failed"); }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename=(.+)/);
      const filename = match ? match[1] : `${stmt.key}-${dateRange}.csv`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(`${stmt.label} downloaded`);
      if (showHistory) loadHistory();
    } catch (e: any) { toast.error(e.message); }
    finally { setDownloading(null); }
  };

  const handlePrint = async (stmt: StatDef) => {
    if (dateRange === "custom" && (!from || !to)) { toast.error("Select a date range first"); return; }
    setPrinting(stmt.key);
    try {
      const url = `${BASE}/api${stmt.endpoint}?${buildParams({ fmt: "csv" })}`;
      await fetchAndPrint({
        url,
        title: stmt.label,
        subtitle: stmt.description,
        dateLabel: dateLabel || "All time",
        confidential: stmt.roles.includes("ceo") || stmt.roles.includes("cfo"),
      });
    } catch (e: any) { toast.error(e.message); }
    finally { setPrinting(null); }
  };

  const handleAuditPrint = async (auditDateRange: DateRange) => {
    setPrinting("audit-quick-" + auditDateRange);
    try {
      const { from: f, to: t } = getDateRange(auditDateRange);
      const label = fmtDateRange(auditDateRange, f, t);
      const p = new URLSearchParams({ fmt: "csv" });
      if (f) p.set("date_from", f);
      if (t) p.set("date_to", t);
      const url = `${BASE}/api/admin/statements/audit-export?${p}`;
      await fetchAndPrint({
        url,
        title: "Admin Audit Trail",
        subtitle: "All admin actions and system events",
        dateLabel: label,
        confidential: true,
      });
    } catch (e: any) { toast.error(e.message); }
    finally { setPrinting(null); }
  };

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`${BASE}/api/admin/statements/list`, { headers: authHeaders() });
      const d = await res.json();
      setHistory(Array.isArray(d) ? d : []);
    } catch {}
    finally { setHistoryLoading(false); }
  }, []);

  const availableStatements = STATEMENTS.filter(s => s.roles.includes(userRole));

  return (
    <AdminShell title="Statements & Reports">
      <div className="space-y-6 max-w-5xl">

        {/* Date Range */}
        <Card>
          <h2 className="text-text font-bold mb-3 flex items-center gap-2">
            <Clock size={15} className="text-textMuted" /> Date Range
          </h2>
          <div className="flex flex-wrap gap-2 mb-3">
            {DATE_RANGES.map(r => (
              <button
                key={r.key}
                onClick={() => setDateRange(r.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                  dateRange === r.key
                    ? "bg-cyanDim text-cyan border-cyan/30"
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
          {dateLabel && (
            <p className="text-textDim text-xs mt-2 font-mono">{dateLabel}</p>
          )}
        </Card>

        {/* Platform-wide reports */}
        <div>
          <h2 className="text-text font-bold mb-3 flex items-center gap-2">
            <FileText size={15} className="text-textMuted" /> Platform Reports
          </h2>
          <div className="space-y-2">
            {availableStatements.length === 0 ? (
              <Card>
                <div className="flex items-center justify-center py-8 gap-2">
                  <Spinner /> <p className="text-textMuted text-sm">Loading…</p>
                </div>
              </Card>
            ) : availableStatements.map(stmt => {
              const Icon = stmt.icon;
              const isDl = downloading === stmt.key;
              const isPr = printing === stmt.key;
              return (
                <Card key={stmt.key}>
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl bg-bg3 border border-border flex items-center justify-center flex-shrink-0`}>
                      <Icon size={17} className={stmt.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-text font-bold text-sm">{stmt.label}</h3>
                        {stmt.roles.includes("ceo") && !stmt.roles.includes("finance") && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-red/10 text-red border border-red/20 rounded font-bold uppercase">Restricted</span>
                        )}
                      </div>
                      <p className="text-textMuted text-xs mt-0.5">{stmt.description}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleDownload(stmt)}
                        disabled={!!downloading || !!printing}
                        className="flex items-center gap-1.5 px-3 py-2 bg-bg3 border border-border rounded-lg text-textMuted text-xs font-bold hover:text-cyan hover:border-cyan/30 transition-all disabled:opacity-50">
                        {isDl ? <RefreshCw size={12} className="animate-spin" /> : <Download size={12} />}
                        {isDl ? "…" : "CSV"}
                      </button>
                      {stmt.printable && (
                        <button
                          onClick={() => handlePrint(stmt)}
                          disabled={!!downloading || !!printing}
                          className="flex items-center gap-1.5 px-3 py-2 bg-bg3 border border-border rounded-lg text-textMuted text-xs font-bold hover:text-cyan hover:border-cyan/30 transition-all disabled:opacity-50">
                          {isPr ? <RefreshCw size={12} className="animate-spin" /> : <Printer size={12} />}
                          {isPr ? "…" : "Print"}
                        </button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Quick Audit Trail Print */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Shield size={15} className="text-red" />
            <h2 className="text-text font-bold">Quick Audit Trail Print</h2>
            <span className="text-[9px] px-1.5 py-0.5 bg-red/10 text-red border border-red/20 rounded font-bold uppercase">Superadmin / CEO</span>
          </div>
          <p className="text-textMuted text-xs mb-4">
            Print the full admin audit trail directly without configuring a date range above.
          </p>
          <div className="flex flex-wrap gap-3">
            {(["today","week","month","3months"] as const).map(r => {
              const label = DATE_RANGES.find(x => x.key === r)?.label || r;
              const id = "audit-quick-" + r;
              const busy = printing === id;
              return (
                <button
                  key={r}
                  onClick={() => handleAuditPrint(r)}
                  disabled={!!printing}
                  className="flex items-center gap-2 px-4 py-2.5 bg-red/10 border border-red/20 text-red text-xs font-bold rounded-xl hover:bg-red/20 transition-all disabled:opacity-50">
                  {busy ? <RefreshCw size={12} className="animate-spin" /> : <Printer size={12} />}
                  {label}
                </button>
              );
            })}
          </div>
          <p className="text-textDim text-[10px] mt-3 flex items-center gap-1">
            <AlertTriangle size={9} className="text-yellow" />
            Opens a browser print dialog. Pop-ups must be allowed for this domain.
          </p>
        </Card>

        {/* Per-entity statements */}
        <Card>
          <button
            onClick={() => setShowEntitySection(v => !v)}
            className="w-full flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User size={15} className="text-textMuted" />
              <h2 className="text-text font-bold">Individual Statements</h2>
              <span className="text-[10px] text-textDim">(per user or driver)</span>
            </div>
            {showEntitySection ? <ChevronUp size={14} className="text-textDim" /> : <ChevronDown size={14} className="text-textDim" />}
          </button>

          {showEntitySection && (
            <div className="mt-5 space-y-6">
              <p className="text-textMuted text-xs">
                Search for a specific user or driver to generate their individual wallet statement — download as CSV or print.
              </p>

              {/* User statement */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <User size={13} className="text-cyan" />
                  <h3 className="text-text font-semibold text-sm">User / Passenger Statement</h3>
                </div>
                <EntityStatement
                  label="User"
                  icon={User}
                  placeholder="Search by phone number or name…"
                  lookupUrl={(q) => `/api/admin/support/user/${encodeURIComponent(q)}`}
                  statementUrl={(id) => `/api/admin/statements/user/${id}?${buildParams({ fmt: "csv" })}`}
                  dateLabel={dateLabel || "All time"}
                />
              </div>

              <div className="border-t border-border" />

              {/* Driver statement */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Car size={13} className="text-yellow" />
                  <h3 className="text-text font-semibold text-sm">Driver Earnings Statement</h3>
                </div>
                <EntityStatement
                  label="Driver"
                  icon={Car}
                  placeholder="Search driver by phone number or name…"
                  lookupUrl={(q) => `/api/admin/support/user/${encodeURIComponent(q)}`}
                  statementUrl={(id) => `/api/admin/statements/driver/${id}?${buildParams({ fmt: "csv" })}`}
                  dateLabel={dateLabel || "All time"}
                />
              </div>

              <div className="border-t border-border" />

              {/* Fleet owner statement */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Building2 size={13} className="text-purple" />
                  <h3 className="text-text font-semibold text-sm">Fleet Owner Report</h3>
                </div>
                <EntityStatement
                  label="Fleet Owner"
                  icon={Building2}
                  placeholder="Search fleet owner by phone number or name…"
                  lookupUrl={(q) => `/api/admin/support/user/${encodeURIComponent(q)}`}
                  statementUrl={(id) => `/api/admin/statements/fleet-owner/${id}?${buildParams({ fmt: "csv" })}`}
                  dateLabel={dateLabel || "All time"}
                />
              </div>
            </div>
          )}
        </Card>

        {/* Download history */}
        <div>
          <button
            onClick={() => { setShowHistory(v => !v); if (!showHistory) loadHistory(); }}
            className="flex items-center gap-2 text-textMuted hover:text-text transition-colors mb-3">
            <Clock size={14} />
            <span className="font-bold text-sm">Download History</span>
            {showHistory ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
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
                  {history.map((h: any) => (
                    <div key={h.id} className="flex items-center gap-3 p-3 bg-bg rounded-xl border border-border text-xs">
                      <CheckCircle size={13} className="text-green flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-text font-medium capitalize">{h.statement_type?.replace(/_/g," ")} · {h.format?.toUpperCase()}</p>
                        <p className="text-textDim font-mono text-[10px]">{h.reference}</p>
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
