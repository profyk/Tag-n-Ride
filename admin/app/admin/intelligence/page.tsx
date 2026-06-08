"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell,
} from "recharts";
import {
  Activity, DollarSign, Users, Shield, Sparkles, Trophy,
  RefreshCw, Download, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle, XCircle, Zap,
  Brain, Car, Wallet, FileText, Search,
  Clock, ArrowUp,
  ChevronDown, Star,
} from "lucide-react";
import client, { isSuperAdmin } from "@/lib/api";
import { AdminShell } from "@/components/layout/AdminShell";

// ── colour palette ────────────────────────────────────────────
const C = {
  cyan: "#22d3ee",
  purple: "#a78bfa",
  green: "#4ade80",
  yellow: "#fbbf24",
  red: "#f87171",
  orange: "#fb923c",
  blue: "#60a5fa",
};

// ── types ─────────────────────────────────────────────────────
type Overview = {
  timestamp: string;
  system_status: "healthy" | "degraded" | "down";
  live_pulse: {
    users_online_estimate: number;
    drivers_active: number;
    trips_live: number;
    money_moving_last_hour: number;
    pending_kyc: number;
    open_compliance_alerts: number;
    open_incidents: number;
    open_disputes: number;
  };
  money: {
    today_gross_volume: number;
    today_platform_fees: number;
    today_cashouts: number;
    today_topups: number;
    total_wallet_balance: number;
    pending_withdrawals: number;
    monthly_revenue: number;
    monthly_revenue_last_month: number;
    revenue_growth_pct: number;
    largest_transaction_today: number;
    transaction_count_today: number;
    avg_transaction_value: number;
    payslip_revenue_today: number;
  };
  users: {
    total_users: number;
    total_passengers: number;
    total_drivers: number;
    total_owners: number;
    new_users_today: number;
    new_users_this_week: number;
    new_users_this_month: number;
    active_users_today: number;
    kyc_approved: number;
    kyc_pending: number;
    kyc_rejected: number;
    safety_profiles_complete: number;
    safety_profiles_incomplete: number;
    blacklisted_users: number;
    top_passenger: { name: string; total_spent_month: number } | null;
    top_driver: { name: string; total_earned_month: number } | null;
  };
  trips: {
    active_trips_now: number;
    trips_today: number;
    trips_this_week: number;
    total_passengers_in_active_trips: number;
    panic_buttons_this_month: number;
  };
  safety: {
    active_incidents: number;
    incidents_this_month: number;
    passengers_without_safety_profile: number;
  };
  system: {
    database_status: string;
    payment_gateway_status: string;
    sms_gateway_status: string;
    cloudinary_status: string;
    total_transactions_all_time: number;
    total_volume_all_time: number;
    total_fees_all_time: number;
  };
  trends: {
    daily_revenue_last_30_days: { date: string; fees: number; volume: number; transactions: number }[];
    hourly_transactions_today: { hour: number; count: number; volume: number }[];
    user_growth_last_30_days: { date: string; new_users: number; cumulative: number }[];
  };
};

type LeaderboardEntry = {
  rank: number;
  name: string;
  phone_number: string;
  earnings?: number;
  trips?: number;
  rating?: number;
  total_spent?: number;
  member_since?: string;
  fleet_size?: number;
  fleet_revenue?: number;
};

type Leaderboard = {
  top_drivers: LeaderboardEntry[];
  top_passengers: LeaderboardEntry[];
  top_owners: LeaderboardEntry[];
};

type ChatMsg = { role: "user" | "ai"; text: string; timestamp: Date; followups?: string[] };

// ── helpers ───────────────────────────────────────────────────
function R(n: number) {
  return `R ${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}
function Num(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── sub-components ────────────────────────────────────────────
function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-bg3 rounded-lg ${className}`} />;
}

function StatCard({
  label, value, sub, color = C.cyan, icon: Icon, alert = false, pulse = false,
}: {
  label: string; value: string; sub?: string; color?: string; icon: any; alert?: boolean; pulse?: boolean;
}) {
  return (
    <div className={`bg-bg2 border rounded-xl p-4 flex gap-3 items-start ${alert ? "border-red/40" : "border-border"}`}>
      <div className="relative mt-0.5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: color + "20" }}>
          <Icon size={16} style={{ color }} />
        </div>
        {pulse && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }}>
            <span className="absolute inset-0 rounded-full animate-ping" style={{ backgroundColor: color, opacity: 0.5 }} />
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-textMuted text-[10px] font-semibold uppercase tracking-wide">{label}</p>
        <p className="text-text font-black text-xl leading-tight mt-0.5" style={{ color }}>{value}</p>
        {sub && <p className="text-textDim text-[10px] mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function ServiceBadge({ label, status, icon: Icon }: { label: string; status: string; icon: any }) {
  const ok = status === "healthy";
  return (
    <div className="bg-bg2 border border-border rounded-xl p-4 flex items-center gap-3">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${ok ? "bg-green/10" : "bg-red/10"}`}>
        <Icon size={16} className={ok ? "text-green" : "text-red"} />
      </div>
      <div className="flex-1">
        <p className="text-text text-xs font-bold">{label}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-green animate-pulse" : "bg-red"}`} />
          <span className={`text-[10px] font-bold ${ok ? "text-green" : "text-red"}`}>{ok ? "HEALTHY" : "DOWN"}</span>
        </div>
      </div>
    </div>
  );
}

function SummaryParagraph({ d }: { d: Overview }) {
  const peak = d.trends.hourly_transactions_today.reduce((a, b) => (b.count > a.count ? b : a), { hour: 0, count: 0 });
  const growth = d.money.revenue_growth_pct;
  return (
    <div className="bg-bg2 border border-cyan/20 rounded-xl p-5 border-l-4 border-l-cyan">
      <p className="text-xs font-bold text-cyan uppercase tracking-widest mb-3">What This Means</p>
      <p className="text-text text-sm leading-relaxed">
        Tag n Ride processed{" "}
        <span className="text-cyan font-bold">{R(d.money.today_gross_volume)}</span> today across{" "}
        <span className="text-cyan font-bold">{d.money.transaction_count_today}</span> transactions.
        Your platform earned{" "}
        <span className="text-green font-bold">{R(d.money.today_platform_fees)}</span> in fees.{" "}
        <span className="text-cyan font-bold">{d.trips.active_trips_now}</span> drivers are active right now,
        carrying an estimated{" "}
        <span className="text-cyan font-bold">{d.trips.total_passengers_in_active_trips}</span> passengers.{" "}
        <span className="text-green font-bold">{d.users.new_users_today}</span> new users joined today.{" "}
        {peak.count > 0 && (
          <>Your busiest hour was <span className="text-yellow font-bold">{peak.hour}:00</span> with{" "}
          <span className="text-yellow font-bold">{peak.count}</span> transactions. </>
        )}
        {growth > 0
          ? <><span className="text-green font-bold">↑ {growth}%</span> revenue growth vs last month.</>
          : growth < 0
          ? <><span className="text-red font-bold">↓ {Math.abs(growth)}%</span> revenue decline vs last month.</>
          : "Revenue is flat vs last month."}
      </p>
    </div>
  );
}

function MoneyFlowDiagram({ d }: { d: Overview }) {
  return (
    <div className="bg-bg2 border border-border rounded-xl p-5">
      <p className="text-xs font-bold text-textMuted uppercase tracking-widest mb-4">Money Flow</p>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {[
          { label: "Passenger Wallets", value: R(d.money.total_wallet_balance * 0.6), color: C.blue, icon: Users },
          null,
          { label: "Driver Wallets", value: R(d.money.total_wallet_balance * 0.35), color: C.cyan, icon: Car },
          null,
          { label: "TNR Revenue", value: R(d.money.monthly_revenue), color: C.green, icon: DollarSign },
          null,
          { label: "Banks", value: R(d.money.today_cashouts), color: "#6b7280", icon: Wallet },
        ].map((item, i) =>
          item === null ? (
            <div key={i} className="flex flex-col items-center gap-0.5">
              <div className="w-8 h-px bg-border" />
              <span className="text-textDim text-[9px]">→</span>
            </div>
          ) : (
            <div key={i} className="flex-1 min-w-[80px] text-center rounded-lg border p-3" style={{ borderColor: item.color + "40", backgroundColor: item.color + "10" }}>
              <item.icon size={14} className="mx-auto mb-1" style={{ color: item.color }} />
              <p className="text-[9px] text-textMuted font-semibold">{item.label}</p>
              <p className="text-xs font-black mt-0.5" style={{ color: item.color }}>{item.value}</p>
            </div>
          )
        )}
      </div>
      <p className="text-textDim text-[10px] mt-3 text-center">Platform fee: 3% on every ride payment</p>
    </div>
  );
}

const SUGGESTED_QUESTIONS = [
  { group: "Finance", qs: ["Why is revenue low today?", "What is my projected monthly revenue?", "Explain reconciliation in my system", "Which transactions look suspicious?"] },
  { group: "Users", qs: ["Who are my top performing drivers?", "How is user growth trending?", "Which passengers spend the most?"] },
  { group: "Safety", qs: ["Are there any safety concerns right now?", "Which users have incomplete safety profiles?", "Show me incident history"] },
  { group: "System", qs: ["Is everything working correctly?", "Explain how a payment works in my system", "How does the 3% fee work?", "What is a wallet in my system?"] },
  { group: "Growth", qs: ["How is Tag n Ride growing?", "What should I focus on to grow revenue?", "When is my platform busiest?"] },
];

const MEDAL_COLORS = ["#FFD700", "#C0C0C0", "#CD7F32"];

// ── MAIN PAGE ─────────────────────────────────────────────────
export default function IntelligencePage() {
  const router = useRouter();
  const isAuthorized = isSuperAdmin(); // SSR-safe: getToken() guards with typeof window check

  const [tab, setTab] = useState<"overview" | "money" | "users" | "safety" | "ai" | "leaderboard">("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(30);
  const [question, setQuestion] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "ai",
      text: "Hello. I am your Tag n Ride System Intelligence AI.\n\nI have access to all your live platform data. I can explain anything about how your system works, analyse your numbers, identify issues and help you make better decisions.\n\nWhat would you like to know?",
      timestamp: new Date(),
      followups: SUGGESTED_QUESTIONS[0].qs,
    },
  ]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [ovRes, lbRes] = await Promise.all([
        client.get("/admin/intelligence/overview"),
        client.get("/admin/intelligence/leaderboard"),
      ]);
      setOverview(ovRes.data);
      setLeaderboard(lbRes.data);
      setLastUpdated(new Date());
      setCountdown(30);
    } catch (e: any) {
      setError(e?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSuperAdmin()) { router.replace("/admin/dashboard"); return; }
    fetchData();
  }, []);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { fetchData(true); return 30; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleAsk = async (q?: string) => {
    const text = (q ?? question).trim();
    if (!text) return;
    setQuestion("");
    setMessages(m => [...m, { role: "user", text, timestamp: new Date() }]);
    setAiLoading(true);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    try {
      const res = await client.post("/admin/intelligence/ask", { question: text });
      setMessages(m => [...m, {
        role: "ai",
        text: res.data.answer,
        timestamp: new Date(),
        followups: res.data.suggested_followups,
      }]);
    } catch (e: any) {
      setMessages(m => [...m, { role: "ai", text: `Error: ${e?.message || "Failed to get AI response."}`, timestamp: new Date() }]);
    } finally {
      setAiLoading(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  };

  const exportCSV = (rows: Record<string, any>[], filename: string) => {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(","), ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? "")).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const TABS = [
    { id: "overview", label: "Overview", icon: Activity },
    { id: "money", label: "Money", icon: DollarSign },
    { id: "users", label: "Users", icon: Users },
    { id: "safety", label: "Safety", icon: Shield },
    { id: "ai", label: "Ask AI", icon: Sparkles },
    { id: "leaderboard", label: "Leaderboard", icon: Trophy },
  ] as const;

  const d = overview;

  // Always render AdminShell — never return null/undefined from a Next.js page
  // Role redirect is handled in useEffect above
  return (
    <AdminShell title="System Intelligence">
      {!isAuthorized ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-textMuted text-sm">Redirecting…</p>
        </div>
      ) : (<>
      {/* ── Page Header ── */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Brain size={22} className="text-purple" />
            <h1 className="text-2xl font-black text-text">System Intelligence</h1>
            {d && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ml-1 ${
                d.system_status === "healthy"
                  ? "text-green bg-green/10 border-green/30"
                  : "text-red bg-red/10 border-red/30"
              }`}>
                {d.system_status.toUpperCase()}
              </span>
            )}
          </div>
          <p className="text-textMuted text-sm mt-0.5">Tag n Ride Command Centre</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {lastUpdated && (
            <div className="text-right">
              <p className="text-textDim text-[10px]">Last updated: {lastUpdated.toLocaleTimeString()}</p>
              <p className="text-textDim text-[10px]">Refreshes in: <span className="text-cyan font-bold">{countdown}s</span></p>
            </div>
          )}
          <div className="flex items-center gap-1">
            {d ? (
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green" />
              </span>
            ) : (
              <span className="h-2.5 w-2.5 rounded-full bg-red" />
            )}
          </div>
          <button
            onClick={() => fetchData()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-bg2 border border-border rounded-lg text-xs text-textMuted hover:text-text transition-colors"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <div className="relative group">
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-cyanDim border border-cyan/30 rounded-lg text-xs text-cyan hover:bg-cyan/20 transition-colors">
              <Download size={12} /> Export
              <ChevronDown size={10} />
            </button>
            <div className="absolute right-0 top-full mt-1 bg-bg2 border border-border rounded-lg shadow-xl z-50 min-w-[180px] hidden group-hover:block">
              {[
                { label: "Revenue CSV", fn: () => d && exportCSV(d.trends.daily_revenue_last_30_days, "tnr-revenue.csv") },
                { label: "User Growth CSV", fn: () => d && exportCSV(d.trends.user_growth_last_30_days, "tnr-users.csv") },
                { label: "Print Overview", fn: () => window.print() },
              ].map(item => (
                <button key={item.label} onClick={item.fn} className="block w-full text-left px-3 py-2 text-xs text-textMuted hover:text-text hover:bg-bg3 transition-colors first:rounded-t-lg last:rounded-b-lg">
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1.5 mb-6 border-b border-border pb-2 flex-wrap">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              tab === t.id
                ? "bg-cyanDim text-cyan border border-cyan/20"
                : "text-textMuted hover:text-text hover:bg-bg3 border border-transparent"
            }`}
          >
            <t.icon size={13} />
            {t.label}
            {t.id === "ai" && (
              <span className="w-1.5 h-1.5 rounded-full bg-purple animate-pulse" />
            )}
          </button>
        ))}
      </div>

      {/* ── Error state ── */}
      {error && (
        <div className="bg-red/10 border border-red/30 rounded-xl p-4 mb-4 flex items-center gap-3">
          <XCircle size={16} className="text-red flex-shrink-0" />
          <p className="text-red text-sm">{error}</p>
          <button onClick={() => fetchData()} className="ml-auto text-xs text-red border border-red/40 rounded-lg px-3 py-1.5 hover:bg-red/10">Retry</button>
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loading && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      )}

      {/* ══════════════ TAB: OVERVIEW ══════════════════════════ */}
      {!loading && d && tab === "overview" && (
        <div className="space-y-6">
          {/* Live Pulse */}
          <div>
            <p className="text-[10px] font-bold text-textDim uppercase tracking-widest mb-3">Live Pulse</p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard label="Users Online" value={Num(d.live_pulse.users_online_estimate)} icon={Users} color={C.cyan} sub="Last 30 min" />
              <StatCard label="Drivers Active" value={Num(d.live_pulse.drivers_active)} icon={Car} color={C.green} sub="On the road" pulse />
              <StatCard label="Live Trips" value={Num(d.live_pulse.trips_live)} icon={Activity} color={C.green} sub="Active now" pulse />
              <StatCard label="Money Moving" value={R(d.live_pulse.money_moving_last_hour)} icon={DollarSign} color={C.cyan} sub="Last 60 mins" />
              <StatCard label="Pending KYC" value={Num(d.live_pulse.pending_kyc)} icon={FileText} color={d.live_pulse.pending_kyc > 0 ? C.yellow : C.green} alert={d.live_pulse.pending_kyc > 5} />
              <StatCard label="Open Incidents" value={Num(d.live_pulse.open_incidents)} icon={AlertTriangle} color={d.live_pulse.open_incidents > 0 ? C.red : C.green} alert={d.live_pulse.open_incidents > 0} />
            </div>
          </div>

          {/* System services */}
          <div>
            <p className="text-[10px] font-bold text-textDim uppercase tracking-widest mb-3">System Services</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <ServiceBadge label="Database" status={d.system.database_status} icon={Activity} />
              <ServiceBadge label="Stitch Payments" status={d.system.payment_gateway_status} icon={DollarSign} />
              <ServiceBadge label="SMS Gateway" status={d.system.sms_gateway_status} icon={Zap} />
              <ServiceBadge label="Cloudinary" status={d.system.cloudinary_status} icon={FileText} />
            </div>
          </div>

          {/* Revenue chart */}
          <div className="bg-bg2 border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-bold text-text">Revenue Last 30 Days</p>
                <p className="text-textMuted text-xs mt-0.5">
                  Total: <span className="text-cyan font-bold">{R(d.trends.daily_revenue_last_30_days.reduce((a, b) => a + b.fees, 0))}</span>
                </p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={d.trends.daily_revenue_last_30_days}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#888" }} tickFormatter={v => v.slice(5)} />
                <YAxis tick={{ fontSize: 9, fill: "#888" }} tickFormatter={v => `R${v}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 11 }}
                  formatter={(v: any, name: string) => [R(Number(v)), name === "fees" ? "Platform Fees" : "Volume"]}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="fees" stroke={C.cyan} strokeWidth={2} dot={false} name="fees" />
                <Line type="monotone" dataKey="volume" stroke={C.purple} strokeWidth={1.5} dot={false} strokeOpacity={0.5} name="volume" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Hourly bar chart */}
          <div className="bg-bg2 border border-border rounded-xl p-5">
            <p className="text-sm font-bold text-text mb-1">Transaction Activity Today</p>
            <p className="text-textMuted text-xs mb-4">
              Peak hour: <span className="text-yellow font-bold">
                {d.trends.hourly_transactions_today.length > 0
                  ? `${d.trends.hourly_transactions_today.reduce((a, b) => b.count > a.count ? b : a).hour}:00`
                  : "—"}
              </span>
            </p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={Array.from({ length: 24 }, (_, h) => {
                const found = d.trends.hourly_transactions_today.find(x => x.hour === h);
                return { hour: `${h}:00`, count: found?.count ?? 0 };
              })}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="hour" tick={{ fontSize: 8, fill: "#888" }} interval={2} />
                <YAxis tick={{ fontSize: 9, fill: "#888" }} />
                <Tooltip contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="count" fill={C.cyan} radius={[3, 3, 0, 0]}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <Cell key={h} fill={h === new Date().getHours() ? "#fff" : C.cyan} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* All-time stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "All-Time Transactions", value: Num(d.system.total_transactions_all_time), icon: Activity, color: C.cyan },
              { label: "All-Time Volume", value: R(d.system.total_volume_all_time), icon: DollarSign, color: C.green },
              { label: "All-Time Fees (Revenue)", value: R(d.system.total_fees_all_time), icon: TrendingUp, color: C.purple },
              { label: "Total Users", value: Num(d.users.total_users), icon: Users, color: C.yellow },
            ].map(s => <StatCard key={s.label} {...s} />)}
          </div>

          <SummaryParagraph d={d} />
        </div>
      )}

      {/* ══════════════ TAB: MONEY ════════════════════════════ */}
      {!loading && d && tab === "money" && (
        <div className="space-y-6">
          <MoneyFlowDiagram d={d} />

          {/* Today breakdown */}
          <div>
            <p className="text-[10px] font-bold text-textDim uppercase tracking-widest mb-3">Today</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard label="Gross Volume" value={R(d.money.today_gross_volume)} icon={DollarSign} color={C.cyan} sub="All payments today" />
              <StatCard label="Platform Fees" value={R(d.money.today_platform_fees)} icon={TrendingUp} color={C.green} sub="Your revenue today" />
              <StatCard label="Total Cashouts" value={R(d.money.today_cashouts)} icon={Wallet} color={C.purple} sub="Paid out today" />
              <StatCard label="Total Top-ups" value={R(d.money.today_topups)} icon={ArrowUp} color={C.blue} sub="Wallet loads today" />
              <StatCard label="Largest Transaction" value={R(d.money.largest_transaction_today)} icon={Star} color={C.yellow} />
              <StatCard label="Payslip Revenue" value={R(d.money.payslip_revenue_today)} icon={FileText} color={C.orange} sub="Document fees today" />
            </div>
          </div>

          {/* Monthly comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { label: "This Month", value: d.money.monthly_revenue, color: C.cyan },
              { label: "Last Month", value: d.money.monthly_revenue_last_month, color: C.purple },
            ].map(m => (
              <div key={m.label} className="bg-bg2 border border-border rounded-xl p-5">
                <p className="text-textMuted text-xs font-semibold uppercase tracking-wide">{m.label}</p>
                <p className="text-3xl font-black mt-2" style={{ color: m.color }}>{R(m.value)}</p>
                <p className="text-textDim text-xs mt-1">Platform fee revenue</p>
              </div>
            ))}
          </div>

          {/* Revenue projection */}
          {(() => {
            const now = new Date();
            const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            const dayOfMonth = now.getDate();
            const daysLeft = daysInMonth - dayOfMonth;
            const dailyAvg = dayOfMonth > 0 ? d.money.monthly_revenue / dayOfMonth : 0;
            const projected = d.money.monthly_revenue + dailyAvg * daysLeft;
            const vsLast = d.money.monthly_revenue_last_month > 0
              ? ((projected - d.money.monthly_revenue_last_month) / d.money.monthly_revenue_last_month * 100).toFixed(1)
              : null;
            const growing = vsLast ? Number(vsLast) > 0 : false;
            return (
              <div className="bg-bg2 border border-border rounded-xl p-5">
                <p className="text-sm font-bold text-text mb-4">Revenue Projection</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "This month so far", value: R(d.money.monthly_revenue), color: C.cyan },
                    { label: "Days remaining", value: String(daysLeft), color: C.yellow },
                    { label: "Daily average", value: R(dailyAvg), color: C.purple },
                    { label: "Projected total", value: R(projected), color: growing ? C.green : C.red },
                  ].map(item => (
                    <div key={item.label}>
                      <p className="text-textDim text-[10px] uppercase tracking-wide">{item.label}</p>
                      <p className="text-lg font-black mt-1" style={{ color: item.color }}>{item.value}</p>
                    </div>
                  ))}
                </div>
                {vsLast !== null && (
                  <div className={`mt-3 flex items-center gap-1.5 text-xs font-bold ${growing ? "text-green" : "text-red"}`}>
                    {growing ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                    {growing ? "+" : ""}{vsLast}% vs last month (projected)
                  </div>
                )}
              </div>
            );
          })()}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Wallet Balances" value={R(d.money.total_wallet_balance)} icon={Wallet} color={C.cyan} sub="All user wallets" />
            <StatCard label="Pending Withdrawals" value={R(d.money.pending_withdrawals)} icon={Clock} color={C.yellow} sub="Awaiting approval" alert={d.money.pending_withdrawals > 0} />
            <StatCard label="Avg Transaction" value={R(d.money.avg_transaction_value)} icon={DollarSign} color={C.purple} sub="Per payment today" />
            <StatCard label="Transaction Count" value={Num(d.money.transaction_count_today)} icon={Activity} color={C.green} sub="Payments today" />
          </div>
        </div>
      )}

      {/* ══════════════ TAB: USERS ════════════════════════════ */}
      {!loading && d && tab === "users" && (
        <div className="space-y-6">
          {/* Donut chart */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-bg2 border border-border rounded-xl p-5">
              <p className="text-sm font-bold text-text mb-4">User Breakdown</p>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={[
                      { name: "Passengers", value: d.users.total_passengers },
                      { name: "Drivers", value: d.users.total_drivers },
                      { name: "Fleet Owners", value: d.users.total_owners },
                    ]}
                    cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value"
                  >
                    {[C.blue, C.cyan, C.purple].map((color, i) => <Cell key={i} fill={color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
              <p className="text-center text-textMuted text-xs mt-1">
                Total: <span className="text-cyan font-bold">{Num(d.users.total_users)}</span> users
              </p>
            </div>

            <div className="bg-bg2 border border-border rounded-xl p-5">
              <p className="text-sm font-bold text-text mb-4">Growth — Last 30 Days</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={d.trends.user_growth_last_30_days}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="date" tick={{ fontSize: 8, fill: "#888" }} tickFormatter={v => v.slice(5)} />
                  <YAxis tick={{ fontSize: 9, fill: "#888" }} />
                  <Tooltip contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 11 }} />
                  <Line type="monotone" dataKey="new_users" stroke={C.cyan} strokeWidth={2} dot={false} name="New users" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* KYC funnel */}
          <div className="bg-bg2 border border-border rounded-xl p-5">
            <p className="text-sm font-bold text-text mb-4">KYC Funnel</p>
            {[
              { label: "Approved", value: d.users.kyc_approved, color: C.green },
              { label: "Pending Review", value: d.users.kyc_pending, color: C.yellow },
              { label: "Rejected", value: d.users.kyc_rejected, color: C.red },
            ].map(item => {
              const total = d.users.kyc_approved + d.users.kyc_pending + d.users.kyc_rejected;
              const pct = total > 0 ? (item.value / total) * 100 : 0;
              return (
                <div key={item.label} className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-textMuted">{item.label}</span>
                    <span className="font-bold" style={{ color: item.color }}>{item.value} ({pct.toFixed(1)}%)</span>
                  </div>
                  <div className="h-2 bg-bg rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: item.color }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Safety profiles */}
          <div className="bg-bg2 border border-border rounded-xl p-5">
            <p className="text-sm font-bold text-text mb-2">Safety Profile Completion</p>
            <p className="text-textMuted text-xs mb-4">Incomplete profiles reduce SafeRide effectiveness</p>
            {[
              { label: "Passengers with complete profiles", complete: d.users.safety_profiles_complete, total: d.users.safety_profiles_complete + d.users.safety_profiles_incomplete },
            ].map(item => {
              const pct = item.total > 0 ? (item.complete / item.total) * 100 : 0;
              const warn = pct < 50;
              return (
                <div key={item.label} className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-textMuted">{item.label}</span>
                    <span className={`font-bold ${warn ? "text-red" : "text-green"}`}>{item.complete}/{item.total} ({pct.toFixed(0)}%)</span>
                  </div>
                  <div className="h-2 bg-bg rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: warn ? C.red : C.green }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Stats table */}
          <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <tbody>
                {[
                  ["Total users all time", Num(d.users.total_users)],
                  ["Active today", Num(d.users.active_users_today)],
                  ["New this week", Num(d.users.new_users_this_week)],
                  ["New this month", Num(d.users.new_users_this_month)],
                  ["Blacklisted users", String(d.users.blacklisted_users)],
                  ["Top passenger this month", d.users.top_passenger ? `${d.users.top_passenger.name} (${R(d.users.top_passenger.total_spent_month)})` : "—"],
                  ["Top driver this month", d.users.top_driver ? `${d.users.top_driver.name} (${R(d.users.top_driver.total_earned_month)})` : "—"],
                ].map(([label, value], i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-bg2" : "bg-bg"}>
                    <td className="px-4 py-3 text-textMuted">{label}</td>
                    <td className="px-4 py-3 text-text font-bold text-right">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════ TAB: SAFETY ══════════════════════════ */}
      {!loading && d && tab === "safety" && (
        <div className="space-y-6">
          {/* Status card */}
          <div className={`rounded-xl border p-6 flex items-center gap-4 ${
            d.safety.active_incidents === 0
              ? "bg-green/5 border-green/30"
              : "bg-red/5 border-red/30"
          }`}>
            {d.safety.active_incidents === 0
              ? <CheckCircle size={40} className="text-green flex-shrink-0" />
              : <AlertTriangle size={40} className="text-red flex-shrink-0" />}
            <div>
              <p className={`text-xl font-black ${d.safety.active_incidents === 0 ? "text-green" : "text-red"}`}>
                {d.safety.active_incidents === 0 ? "All Safe" : `${d.safety.active_incidents} Active Incident${d.safety.active_incidents !== 1 ? "s" : ""}`}
              </p>
              <p className="text-textMuted text-sm mt-0.5">
                {d.trips.active_trips_now} active routes · {d.trips.total_passengers_in_active_trips} passengers currently on board
              </p>
            </div>
          </div>

          {/* Incident summary */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard label="Active Incidents" value={String(d.safety.active_incidents)} icon={AlertTriangle} color={d.safety.active_incidents > 0 ? C.red : C.green} alert={d.safety.active_incidents > 0} />
            <StatCard label="Incidents This Month" value={String(d.safety.incidents_this_month)} icon={Shield} color={C.orange} />
            <StatCard label="Panic Buttons (Month)" value={String(d.trips.panic_buttons_this_month)} icon={Zap} color={C.red} />
            <StatCard label="Open Disputes" value={String(d.live_pulse.open_disputes)} icon={AlertTriangle} color={d.live_pulse.open_disputes > 0 ? C.yellow : C.green} />
            <StatCard label="Passengers w/o Profile" value={String(d.safety.passengers_without_safety_profile)} icon={Users} color={d.safety.passengers_without_safety_profile > 0 ? C.yellow : C.green} />
            <StatCard label="Pending KYC" value={String(d.live_pulse.pending_kyc)} icon={FileText} color={d.live_pulse.pending_kyc > 0 ? C.yellow : C.green} />
          </div>

          <div className="bg-bg2 border border-cyan/20 rounded-xl p-4 border-l-4 border-l-cyan">
            <p className="text-xs font-bold text-cyan mb-1">SafeRide Command</p>
            <p className="text-textMuted text-xs">View live driver locations, active trips, and manage incidents in the SafeRide Command panel.</p>
            <a href="/admin/saferide" className="mt-2 inline-flex items-center gap-1.5 text-xs text-cyan font-bold hover:underline">
              Open SafeRide Command →
            </a>
          </div>
        </div>
      )}

      {/* ══════════════ TAB: ASK AI ═══════════════════════════ */}
      {tab === "ai" && (
        <div className="flex flex-col gap-4 max-w-3xl mx-auto">
          {/* Chat history */}
          <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
            {messages.map((msg, i) => (
              <div key={i}>
                <div className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                  {msg.role === "ai" && (
                    <div className="w-8 h-8 rounded-full bg-purple/20 border border-purple/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Brain size={14} className="text-purple" />
                    </div>
                  )}
                  <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed border-l-4 ${
                    msg.role === "user"
                      ? "bg-cyanDim border-l-cyan text-text"
                      : "bg-bg2 border-l-purple text-text"
                  }`}>
                    {msg.text.split("\n").map((line, j) => (
                      <span key={j}>{line}{j < msg.text.split("\n").length - 1 && <br />}</span>
                    ))}
                    <p className="text-textDim text-[10px] mt-1.5">{msg.timestamp.toLocaleTimeString()}</p>
                  </div>
                </div>
                {msg.followups && msg.role === "ai" && (
                  <div className="flex flex-wrap gap-2 mt-2 ml-11">
                    {msg.followups.map(q => (
                      <button key={q} onClick={() => handleAsk(q)} className="text-[10px] bg-bg2 border border-purple/30 text-purple px-2.5 py-1 rounded-full hover:bg-purple/10 transition-colors">
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {aiLoading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-purple/20 border border-purple/30 flex items-center justify-center flex-shrink-0">
                  <Brain size={14} className="text-purple animate-pulse" />
                </div>
                <div className="bg-bg2 border border-border rounded-xl px-4 py-3">
                  <p className="text-textMuted text-xs animate-pulse">Analysing your system data...</p>
                  <p className="text-textDim text-[10px] mt-0.5">Reading live data from your platform</p>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Suggested questions */}
          <div className="space-y-2">
            {SUGGESTED_QUESTIONS.slice(0, 2).map(group => (
              <div key={group.group}>
                <p className="text-[10px] text-textDim uppercase tracking-widest mb-1.5">{group.group}</p>
                <div className="flex flex-wrap gap-1.5">
                  {group.qs.map(q => (
                    <button key={q} onClick={() => setQuestion(q)} className="text-[10px] bg-bg2 border border-border text-textMuted px-2.5 py-1 rounded-full hover:text-cyan hover:border-cyan/30 transition-colors">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="flex gap-2">
            <input
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleAsk()}
              placeholder="Ask anything about your platform..."
              className="flex-1 bg-bg2 border border-border rounded-xl px-4 py-3 text-sm text-text placeholder:text-textDim focus:outline-none focus:border-purple/50 transition-colors"
            />
            <button
              onClick={() => handleAsk()}
              disabled={aiLoading || !question.trim()}
              className="px-5 py-3 bg-purple/20 border border-purple/30 rounded-xl text-purple font-bold text-sm hover:bg-purple/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Search size={16} />
            </button>
          </div>
          <div className="flex justify-end">
            <button onClick={() => setMessages(messages.slice(0, 1))} className="text-[10px] text-textDim hover:text-textMuted">Clear history</button>
          </div>
        </div>
      )}

      {/* ══════════════ TAB: LEADERBOARD ═════════════════════ */}
      {!loading && leaderboard && tab === "leaderboard" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Top Drivers */}
            <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <Car size={14} className="text-cyan" />
                <p className="text-sm font-bold text-text">Top Drivers</p>
                <span className="text-textDim text-xs">this month</span>
              </div>
              <div className="divide-y divide-border">
                {leaderboard.top_drivers.length === 0
                  ? <p className="text-textDim text-xs text-center py-6">No data yet</p>
                  : leaderboard.top_drivers.map(d => (
                  <div key={d.rank} className="px-4 py-3 flex items-center gap-3">
                    <span className="text-lg" style={{ color: MEDAL_COLORS[d.rank - 1] || "#6b7280" }}>
                      {d.rank <= 3 ? ["🥇","🥈","🥉"][d.rank-1] : `#${d.rank}`}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-text text-xs font-bold truncate">{d.name}</p>
                      <p className="text-textDim text-[10px]">{d.trips} trips · ⭐ {Number(d.rating).toFixed(1)}</p>
                    </div>
                    <p className="text-green text-xs font-black">{R(d.earnings ?? 0)}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Passengers */}
            <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <Users size={14} className="text-blue" />
                <p className="text-sm font-bold text-text">Top Passengers</p>
                <span className="text-textDim text-xs">this month</span>
              </div>
              <div className="divide-y divide-border">
                {leaderboard.top_passengers.length === 0
                  ? <p className="text-textDim text-xs text-center py-6">No data yet</p>
                  : leaderboard.top_passengers.map(p => (
                  <div key={p.rank} className="px-4 py-3 flex items-center gap-3">
                    <span className="text-lg" style={{ color: MEDAL_COLORS[p.rank - 1] || "#6b7280" }}>
                      {p.rank <= 3 ? ["🥇","🥈","🥉"][p.rank-1] : `#${p.rank}`}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-text text-xs font-bold truncate">{p.name}</p>
                      <p className="text-textDim text-[10px]">{p.trips} trips</p>
                    </div>
                    <p className="text-cyan text-xs font-black">{R(p.total_spent ?? 0)}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Fleet Owners */}
            <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <Trophy size={14} className="text-yellow" />
                <p className="text-sm font-bold text-text">Top Fleet Owners</p>
                <span className="text-textDim text-xs">this month</span>
              </div>
              <div className="divide-y divide-border">
                {leaderboard.top_owners.length === 0
                  ? <p className="text-textDim text-xs text-center py-6">No data yet</p>
                  : leaderboard.top_owners.map(o => (
                  <div key={o.rank} className="px-4 py-3 flex items-center gap-3">
                    <span className="text-lg" style={{ color: MEDAL_COLORS[o.rank - 1] || "#6b7280" }}>
                      {o.rank <= 3 ? ["🥇","🥈","🥉"][o.rank-1] : `#${o.rank}`}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-text text-xs font-bold truncate">{o.name}</p>
                      <p className="text-textDim text-[10px]">{o.fleet_size} drivers</p>
                    </div>
                    <p className="text-yellow text-xs font-black">{R(o.fleet_revenue ?? 0)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-bg2 border border-border rounded-xl p-4">
            <p className="text-xs font-bold text-text mb-1">Geographic Activity</p>
            <p className="text-textDim text-xs">Full geographic analysis requires Google Maps API integration. Area-level data coming soon.</p>
          </div>
        </div>
      )}
      </>)}
    </AdminShell>
  );
}
