"use client";
import { useEffect, useState, useMemo, useCallback, useRef, Fragment } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  TrendingUp, Users, AlertTriangle, CheckCircle2, Save, Zap, Gift,
  RefreshCw, CreditCard, Building, Calendar, DollarSign, ChevronRight,
  BarChart3, Wrench, Play, ToggleLeft, ToggleRight, Info,
  Search, X, ChevronDown, Clock, Receipt, Download, XCircle,
  Landmark, History,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";

const BASE = "https://tag-n-ride-production.up.railway.app";
const h = () => ({
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
  "Content-Type": "application/json",
});

const TT = {
  contentStyle: { background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 },
  labelStyle:   { color: "var(--text)", fontSize: 11 },
  itemStyle:    { color: "var(--textMuted)", fontSize: 11 },
};

const MONTH_COLORS = ["#00D4FF","#00E676","#A064FF","#FFD60A","#FF8C42","#FF4D9E"];

// ── Status config ───────────────────────────────────────────────────────────
const SUB_STATUS: Record<string, { cls: string; label: string }> = {
  active:    { cls: "bg-green/10 border-green/20 text-green",   label: "Active"    },
  overdue:   { cls: "bg-red/10 border-red/20 text-red",         label: "Overdue"   },
  free:      { cls: "bg-cyan/10 border-cyan/20 text-cyan",       label: "Free"      },
  cancelled: { cls: "bg-bg3 border-border text-textMuted",       label: "Cancelled" },
};

const BILL_STATUS: Record<string, { cls: string; label: string }> = {
  paid:   { cls: "bg-green/10 border-green/20 text-green",   label: "Paid"   },
  failed: { cls: "bg-red/10 border-red/20 text-red",         label: "Failed" },
  waived: { cls: "bg-cyan/10 border-cyan/20 text-cyan",       label: "Waived" },
};

// ── Initials avatar ──────────────────────────────────────────────────────────
function Avatar({ name }: { name: string }) {
  const ini = name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  return (
    <div className="w-8 h-8 rounded-full bg-cyan/10 border border-cyan/20 flex items-center justify-center font-black text-cyan text-[10px] flex-shrink-0">
      {ini}
    </div>
  );
}

function StatusBadge({ status, map }: { status: string; map: Record<string, { cls: string; label: string }> }) {
  const cfg = map[status] || { cls: "bg-bg3 border-border text-textMuted", label: status };
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${cfg.cls}`}>{cfg.label}</span>;
}

function ordinal(n: number) {
  return n + (["st","nd","rd"][n - 1] || "th");
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function SubscriptionsPage() {
  type Tab = "overview" | "subscribers" | "billing" | "settings" | "maintenance";

  // ── Data ─────────────────────────────────────────────────────────────────
  const [subs,          setSubs]          = useState<any[]>([]);
  const [revenue,       setRevenue]       = useState<any>(null);
  const [billingHist,   setBillingHist]   = useState<any[]>([]);
  const [maintPreview,  setMaintPreview]  = useState<any>(null);

  // ── Load states ───────────────────────────────────────────────────────────
  const [loadingSubs,    setLoadingSubs]    = useState(true);
  const [loadingRev,     setLoadingRev]     = useState(true);
  const [loadingBilling, setLoadingBilling] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // ── Error tracking ────────────────────────────────────────────────────────
  const [subsError, setSubsError] = useState<string | null>(null);
  const [revError,  setRevError]  = useState<string | null>(null);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [activeTab,   setActiveTab]   = useState<Tab>("overview");
  const [search,      setSearch]      = useState("");
  const [statusFilt,  setStatusFilt]  = useState<"all"|"active"|"overdue"|"free">("all");
  const [billFilt,    setBillFilt]    = useState<"all"|"paid"|"failed"|"waived">("all");
  const [expanded,    setExpanded]    = useState<string | null>(null);
  const [acting,      setActing]      = useState<string | null>(null);
  const [countdown,   setCountdown]   = useState(60);

  // ── Settings state ────────────────────────────────────────────────────────
  const [pricePerTaxi,      setPricePerTaxi]      = useState("10");
  const [freeTaxis,         setFreeTaxis]          = useState("1");
  const [subBillingDay,     setSubBillingDay]      = useState("1");
  const [ownerStmtPrice,    setOwnerStmtPrice]     = useState("10");
  const [passengerStmtPrice,setPassengerStmtPrice] = useState("5");
  const [savingPricing,     setSavingPricing]      = useState(false);

  // ── Maintenance state ──────────────────────────────────────────────────────
  const [maintEnabled,    setMaintEnabled]    = useState(false);
  const [maintAmount,     setMaintAmount]     = useState("0");
  const [maintDay,        setMaintDay]        = useState("1");
  const [maintLabel,      setMaintLabel]      = useState("Monthly maintenance fee");
  const [savingMaint,     setSavingMaint]     = useState(false);
  const [previewLoading,  setPreviewLoading]  = useState(false);
  const [runningMaint,    setRunningMaint]    = useState(false);

  const timerRef = useRef<any>(null);

  // ── Load functions (independent — one failure doesn't kill another) ────────
  const loadSubs = useCallback(() => {
    setLoadingSubs(true); setSubsError(null);
    api.subscriptions()
      .then(r => setSubs(Array.isArray(r.data) ? r.data : []))
      .catch(e => setSubsError(e.message || "Failed to load subscribers"))
      .finally(() => setLoadingSubs(false));
  }, []);

  const loadRevenue = useCallback(() => {
    setLoadingRev(true); setRevError(null);
    api.subscriptionRevenue()
      .then(r => setRevenue(r.data))
      .catch(e => setRevError(e.message || "No access to revenue data"))
      .finally(() => setLoadingRev(false));
  }, []);

  const loadBillingHistory = useCallback((status?: string) => {
    setLoadingBilling(true);
    api.subscriptionBillingHistory({ status: status === "all" ? undefined : status, limit: 200 })
      .then(r => setBillingHist(Array.isArray(r.data) ? r.data : []))
      .catch(e => toast.error(e.message || "Failed to load billing history"))
      .finally(() => setLoadingBilling(false));
  }, []);

  const loadSettings = useCallback(() => {
    api.getPayoutSettings()
      .then(r => {
        const d = r.data;
        setPricePerTaxi(String(d.subscription_price_per_taxi ?? 10));
        setFreeTaxis(String(d.subscription_free_taxis ?? 1));
        setSubBillingDay(String(d.subscription_billing_day ?? 1));
        setOwnerStmtPrice(String(d.owner_statement_price ?? 10));
        setPassengerStmtPrice(String(d.passenger_statement_price ?? 5));
        setMaintEnabled(!!d.maintenance_fee_enabled);
        setMaintAmount(String(d.maintenance_fee_amount ?? 0));
        setMaintDay(String(d.maintenance_fee_day ?? 1));
        setMaintLabel(d.maintenance_fee_label || "Monthly maintenance fee");
        setSettingsLoaded(true);
      })
      .catch(() => {});
    api.maintenanceFeePreview().then(r => setMaintPreview(r.data)).catch(() => {});
  }, []);

  const refreshAll = useCallback(() => {
    loadSubs(); loadRevenue(); loadSettings(); setCountdown(60);
  }, [loadSubs, loadRevenue, loadSettings]);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  useEffect(() => {
    if (activeTab === "billing") loadBillingHistory(billFilt);
  }, [activeTab, billFilt, loadBillingHistory]);

  // 60s countdown
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown(c => { if (c <= 1) { refreshAll(); return 60; } return c - 1; });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [refreshAll]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const overdueSubs  = useMemo(() => subs.filter(s => s.status === "overdue"),  [subs]);
  const activeSubs   = useMemo(() => subs.filter(s => s.status === "active"),   [subs]);
  const freeSubs     = useMemo(() => subs.filter(s => s.monthly_fee === 0 || s.status === "free"), [subs]);
  const mrr          = revenue?.mrr ?? 0;
  const thisMonth    = revenue?.this_month ?? 0;
  const totalCollected = revenue?.total_collected ?? 0;

  const filteredSubs = useMemo(() => {
    let list = statusFilt === "all" ? subs : subs.filter(s => s.status === statusFilt);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.full_name.toLowerCase().includes(q) ||
        (s.business_name || "").toLowerCase().includes(q) ||
        (s.email || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [subs, statusFilt, search]);

  const filteredBilling = useMemo(() => {
    if (billFilt === "all") return billingHist;
    return billingHist.filter(b => b.status === billFilt);
  }, [billingHist, billFilt]);

  const monthlyData = useMemo(() =>
    (revenue?.monthly_breakdown ?? [])
      .slice().reverse()
      .map((m: any) => ({
        month: new Date(m.year, m.month - 1).toLocaleString("default", { month: "short" }),
        revenue: m.revenue,
        billings: m.billings,
      })),
    [revenue]
  );

  // ── Actions ───────────────────────────────────────────────────────────────
  const billNow = async (ownerUserId: string, name: string) => {
    if (!confirm(`Bill ${name} now? This deducts their subscription fee immediately.`)) return;
    setActing(ownerUserId);
    try {
      await api.billOwnerNow(ownerUserId);
      toast.success(`Billing triggered for ${name}`);
      loadSubs();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setActing(null); }
  };

  const waive = async (ownerUserId: string, name: string) => {
    if (!confirm(`Waive this month's subscription for ${name}? This marks them active until next cycle.`)) return;
    setActing(ownerUserId + "_waive");
    try {
      await api.waiveSubscription(ownerUserId);
      toast.success(`Fee waived for ${name}`);
      loadSubs();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setActing(null); }
  };

  const savePricing = async () => {
    setSavingPricing(true);
    try {
      await api.updatePayoutSettings({
        subscription_price_per_taxi:  parseFloat(pricePerTaxi),
        subscription_free_taxis:      parseInt(freeTaxis),
        subscription_billing_day:     parseInt(subBillingDay),
        owner_statement_price:        parseFloat(ownerStmtPrice),
        passenger_statement_price:    parseFloat(passengerStmtPrice),
      });
      toast.success("Pricing & schedule updated");
      loadSubs();
    } catch { toast.error("Failed to save pricing"); }
    finally { setSavingPricing(false); }
  };

  const saveMaintenance = async () => {
    setSavingMaint(true);
    try {
      await api.updatePayoutSettings({
        maintenance_fee_enabled: maintEnabled,
        maintenance_fee_amount:  parseFloat(maintAmount),
        maintenance_fee_day:     parseInt(maintDay),
        maintenance_fee_label:   maintLabel,
      });
      toast.success("Maintenance fee settings saved");
      const preview = await api.maintenanceFeePreview();
      setMaintPreview(preview.data);
    } catch { toast.error("Failed to save maintenance settings"); }
    finally { setSavingMaint(false); }
  };

  const runMaintenanceFee = async () => {
    if (!confirm(`Deduct ${formatZAR(parseFloat(maintAmount) || 0)} from ALL eligible wallets right now?`)) return;
    setRunningMaint(true);
    try {
      const r = await api.runMaintenanceFee();
      toast.success(`Done — ${r.data.charged} wallets charged · ${formatZAR(r.data.total_collected)} collected · ${r.data.skipped} skipped`);
      setPreviewLoading(true);
      api.maintenanceFeePreview().then(r2 => setMaintPreview(r2.data)).finally(() => setPreviewLoading(false));
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setRunningMaint(false); }
  };

  const TABS = [
    { id: "overview"     as Tab, label: "Overview",        icon: BarChart3  },
    { id: "subscribers"  as Tab, label: "Subscribers",     icon: Users      },
    { id: "billing"      as Tab, label: "Billing History", icon: History    },
    { id: "settings"     as Tab, label: "Pricing",         icon: DollarSign },
    { id: "maintenance"  as Tab, label: "Maintenance Fee", icon: Wrench     },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AdminShell title="Subscriptions">
      <div className="space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <p className="text-textMuted text-xs">Fleet owner subscription billing, pricing config and monthly maintenance fee management</p>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-textDim">Refresh in {countdown}s</span>
            <button onClick={refreshAll} className="text-textDim hover:text-cyan transition-colors">
              <RefreshCw size={13} className={(loadingSubs || loadingRev) ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* ── Overdue alert ── */}
        {overdueSubs.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 bg-red/5 border border-red/20 rounded-xl">
            <AlertTriangle size={16} className="text-red flex-shrink-0" />
            <p className="text-red text-sm font-bold">
              {overdueSubs.length} fleet owner{overdueSubs.length !== 1 ? "s" : ""} overdue — wallet balance may be insufficient
            </p>
            <button onClick={() => { setActiveTab("subscribers"); setStatusFilt("overdue"); }}
              className="ml-auto flex items-center gap-1 text-xs font-bold text-red border border-red/30 px-3 py-1.5 rounded-lg hover:bg-red/10 transition-colors whitespace-nowrap">
              View Overdue <ChevronRight size={12} />
            </button>
          </div>
        )}

        {/* ── Stats strip ── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="border-green/20">
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">MRR</p>
            {loadingRev ? <div className="h-8 bg-bg3 animate-pulse rounded" /> :
              revError ? <p className="text-textDim text-xs">{revError}</p> :
              <p className="text-2xl font-black text-green tabular-nums">{formatZAR(mrr)}</p>
            }
            <p className="text-textDim text-[10px] mt-1">Monthly recurring revenue</p>
          </Card>

          <Card>
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">This Month</p>
            {loadingRev ? <div className="h-8 bg-bg3 animate-pulse rounded" /> :
              <p className="text-2xl font-black text-cyan tabular-nums">{formatZAR(thisMonth)}</p>
            }
            <p className="text-textDim text-[10px] mt-1">Collected to date</p>
          </Card>

          <Card>
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Active</p>
            {loadingSubs ? <div className="h-8 bg-bg3 animate-pulse rounded" /> :
              <p className="text-2xl font-black text-purple tabular-nums">{activeSubs.length}</p>
            }
            <p className="text-textDim text-[10px] mt-1">{freeSubs.length} on free tier</p>
          </Card>

          <Card className={overdueSubs.length > 0 ? "border-red/20" : ""}>
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">Overdue</p>
            {loadingSubs ? <div className="h-8 bg-bg3 animate-pulse rounded" /> :
              <p className={`text-2xl font-black tabular-nums ${overdueSubs.length > 0 ? "text-red" : "text-green"}`}>
                {overdueSubs.length}
              </p>
            }
            <p className="text-textDim text-[10px] mt-1">{overdueSubs.length > 0 ? "Needs attention" : "All current ✓"}</p>
          </Card>

          <Card>
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">All-Time Collected</p>
            {loadingRev ? <div className="h-8 bg-bg3 animate-pulse rounded" /> :
              <p className="text-xl font-black text-yellow tabular-nums">{formatZAR(totalCollected)}</p>
            }
            <p className="text-textDim text-[10px] mt-1">Since launch</p>
          </Card>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 border-b border-border overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
                activeTab === t.id ? "text-cyan border-cyan" : "text-textMuted border-transparent hover:text-text"
              }`}>
              <t.icon size={12} /> {t.label}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            TAB: OVERVIEW
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "overview" && (
          <div className="space-y-5">
            {/* Revenue chart */}
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 size={14} className="text-cyan" />
                <h2 className="text-sm font-bold text-text">Monthly Subscription Revenue</h2>
              </div>
              {loadingRev ? (
                <div className="h-52 bg-bg3 animate-pulse rounded-lg" />
              ) : revError ? (
                <div className="h-52 flex items-center justify-center text-textDim text-sm">{revError}</div>
              ) : monthlyData.length === 0 ? (
                <div className="h-52 flex items-center justify-center text-textDim text-sm">No billing data yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="month" tick={{ fill: "var(--textMuted)", fontSize: 11 }} />
                    <YAxis tick={{ fill: "var(--textMuted)", fontSize: 10 }} tickFormatter={v => `R${v}`} />
                    <Tooltip {...TT} formatter={(v: number) => [formatZAR(v), "Revenue"]} />
                    <Bar dataKey="revenue" radius={[5, 5, 0, 0]}>
                      {monthlyData.map((_: any, i: number) => (
                        <Cell key={i} fill={MONTH_COLORS[i % MONTH_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            {/* Quick stats row */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Total Fleet Owners",    value: subs.length,      color: "text-text"   },
                { label: "Avg Monthly Revenue",   value: activeSubs.length > 0 ? formatZAR(mrr / Math.max(activeSubs.length, 1)) : "—", color: "text-cyan" },
                { label: "Free Tier Conversion",  value: subs.length > 0 ? `${Math.round((activeSubs.filter(s => s.monthly_fee > 0).length / Math.max(subs.length, 1)) * 100)}%` : "—", color: "text-green" },
              ].map(s => (
                <div key={s.label} className="p-4 bg-bg2 border border-border rounded-xl text-center">
                  <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                  <p className="text-textDim text-[10px] mt-1 font-semibold uppercase tracking-wider">{s.label}</p>
                </div>
              ))}
            </div>

            {/* How it works */}
            <div className="bg-bg2 border border-cyan/10 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <CreditCard size={14} className="text-cyan" />
                <h3 className="text-sm font-bold text-text">How Fleet Subscriptions Work</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { icon: Gift,     color: "text-green",  title: "Free Tier",       desc: `First ${freeTaxis} taxi per owner is always free — zero cost for single-taxi operators` },
                  { icon: DollarSign, color: "text-cyan", title: "Paid Tier",       desc: `Each additional taxi costs R${pricePerTaxi}/month, auto-deducted from owner wallet` },
                  { icon: Calendar, color: "text-yellow", title: "Auto-Billing",    desc: `Bills on the ${ordinal(parseInt(subBillingDay))} of each month. Insufficient balance → overdue status + notification` },
                  { icon: Building, color: "text-purple", title: "Statement Fees",  desc: `Owner statements R${ownerStmtPrice} · Passenger statements R${passengerStmtPrice} — deducted per download` },
                ].map(item => (
                  <div key={item.title} className="flex items-start gap-3 p-3 bg-bg rounded-xl border border-border">
                    <item.icon size={14} className={`${item.color} flex-shrink-0 mt-0.5`} />
                    <div>
                      <p className="text-text text-xs font-bold">{item.title}</p>
                      <p className="text-textMuted text-[11px] mt-0.5 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            TAB: SUBSCRIBERS
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "subscribers" && (
          <div className="space-y-4">
            <Card>
              {/* Toolbar */}
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <Users size={14} className="text-cyan" />
                  <h2 className="text-sm font-bold text-text">Fleet Owner Subscriptions</h2>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <div className="relative">
                    <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-textDim" />
                    <input
                      placeholder="Name, business, email…"
                      value={search} onChange={e => setSearch(e.target.value)}
                      className="bg-bg border border-border rounded-lg pl-8 pr-7 py-2 text-text text-xs focus:outline-none focus:border-cyan placeholder:text-textDim w-48"
                    />
                    {search && (
                      <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-textDim hover:text-text">
                        <X size={11} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Status filter tabs */}
              <div className="flex gap-1 mb-4">
                {([
                  { key: "all",     label: "All",     count: subs.length,          cls: "bg-cyanDim text-cyan border-cyan/20" },
                  { key: "active",  label: "Active",  count: activeSubs.length,    cls: "bg-green/10 text-green border-green/20" },
                  { key: "overdue", label: "Overdue", count: overdueSubs.length,   cls: "bg-red/10 text-red border-red/20" },
                  { key: "free",    label: "Free",    count: freeSubs.length,      cls: "bg-cyan/10 text-cyan border-cyan/20" },
                ] as const).map(t => (
                  <button key={t.key} onClick={() => setStatusFilt(t.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all whitespace-nowrap ${
                      statusFilt === t.key ? t.cls : "bg-bg3 border-border text-textMuted hover:text-text"
                    }`}>
                    {t.label} ({t.count})
                  </button>
                ))}
              </div>

              <p className="text-xs text-textMuted mb-3">
                {loadingSubs ? "Loading…" : `${filteredSubs.length} owner${filteredSubs.length !== 1 ? "s" : ""}${search ? ` matching "${search}"` : ""}`}
              </p>

              {loadingSubs ? (
                <div className="flex justify-center py-12"><Spinner /></div>
              ) : subsError ? (
                <div className="py-12 text-center">
                  <XCircle size={28} className="mx-auto mb-3 text-red opacity-50" />
                  <p className="text-red text-sm font-medium">{subsError}</p>
                  <button onClick={loadSubs} className="mt-3 text-xs text-cyan hover:underline">Retry</button>
                </div>
              ) : filteredSubs.length === 0 ? (
                <div className="py-12 text-center">
                  <Building size={32} className="mx-auto mb-3 text-textDim opacity-30" />
                  <p className="text-textMuted text-sm">{search ? `No owners matching "${search}"` : "No subscribers yet"}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        {["Owner", "Taxis", "Monthly Fee", "Status", "Next Billing", "Total Paid", "Actions", ""].map((h, i) => (
                          <th key={i} className="text-left py-2 px-3 text-textDim font-bold uppercase tracking-wider text-[10px]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSubs.map(r => {
                        const isExpanded = expanded === r.owner_user_id;
                        return (
                          <Fragment key={r.owner_user_id}>
                            <tr className={`border-b border-border/50 hover:bg-bg3/30 transition-colors ${isExpanded ? "bg-bg3/40" : ""}`}>
                              {/* Owner */}
                              <td className="py-3 px-3">
                                <div className="flex items-center gap-2">
                                  <Avatar name={r.full_name} />
                                  <div>
                                    <p className="font-semibold text-text text-xs leading-tight">{r.full_name}</p>
                                    <p className="text-[10px] text-textMuted">{r.business_name || r.email || "—"}</p>
                                  </div>
                                </div>
                              </td>
                              {/* Taxis */}
                              <td className="py-3 px-3">
                                <p className="font-black text-text text-sm tabular-nums">{r.taxi_count}</p>
                                <p className="text-[10px] text-textMuted">
                                  {r.billable_taxis === 0
                                    ? <span className="text-green flex items-center gap-1"><Gift size={9} /> Free</span>
                                    : `${r.billable_taxis} billed`}
                                </p>
                              </td>
                              {/* Monthly fee */}
                              <td className="py-3 px-3">
                                <p className={`font-black text-sm tabular-nums ${r.monthly_fee > 0 ? "text-cyan" : "text-green"}`}>
                                  {r.monthly_fee > 0 ? formatZAR(r.monthly_fee) : "Free"}
                                </p>
                              </td>
                              {/* Status */}
                              <td className="py-3 px-3">
                                <StatusBadge status={r.status} map={SUB_STATUS} />
                                {r.overdue_since && (
                                  <p className="text-[10px] text-red mt-1 flex items-center gap-1">
                                    <Clock size={9} /> Since {formatDate(r.overdue_since)}
                                  </p>
                                )}
                              </td>
                              {/* Next billing */}
                              <td className="py-3 px-3">
                                <p className="text-textMuted text-xs">{r.next_billing_date ? formatDate(r.next_billing_date) : "—"}</p>
                                {r.last_billed_date && (
                                  <p className="text-textDim text-[10px]">Last: {formatDate(r.last_billed_date)}</p>
                                )}
                              </td>
                              {/* Total paid */}
                              <td className="py-3 px-3">
                                <p className="font-bold text-green tabular-nums">{formatZAR(r.total_paid)}</p>
                                <p className="text-textDim text-[10px]">{r.paid_count} payment{r.paid_count !== 1 ? "s" : ""}</p>
                              </td>
                              {/* Actions */}
                              <td className="py-3 px-3">
                                <div className="flex gap-1.5 flex-wrap">
                                  <button onClick={() => billNow(r.owner_user_id, r.full_name)}
                                    disabled={!!acting}
                                    className="flex items-center gap-1 px-2.5 py-1.5 bg-cyan/10 border border-cyan/20 text-cyan text-[10px] font-bold rounded-lg hover:bg-cyan/20 transition-all disabled:opacity-50 whitespace-nowrap">
                                    {acting === r.owner_user_id ? <Spinner /> : <Zap size={10} />} Bill Now
                                  </button>
                                  <button onClick={() => waive(r.owner_user_id, r.full_name)}
                                    disabled={!!acting}
                                    className="flex items-center gap-1 px-2.5 py-1.5 bg-green/10 border border-green/20 text-green text-[10px] font-bold rounded-lg hover:bg-green/20 transition-all disabled:opacity-50 whitespace-nowrap">
                                    {acting === r.owner_user_id + "_waive" ? <Spinner /> : <Gift size={10} />} Waive
                                  </button>
                                </div>
                              </td>
                              {/* Expand */}
                              <td className="py-3 px-2">
                                <button onClick={() => setExpanded(isExpanded ? null : r.owner_user_id)}
                                  className="text-textDim hover:text-cyan transition-colors p-1 rounded">
                                  {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                </button>
                              </td>
                            </tr>

                            {/* Expanded detail */}
                            {isExpanded && (
                              <tr className="bg-bg3/40 border-b border-border/30">
                                <td colSpan={8} className="px-6 py-4">
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div>
                                      <p className="text-[10px] font-bold text-textDim uppercase tracking-widest mb-1">Owner ID</p>
                                      <p className="font-mono text-textMuted text-[10px] break-all">{r.owner_user_id}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-bold text-textDim uppercase tracking-widest mb-1">Email</p>
                                      <p className="text-textMuted text-xs">{r.email || "—"}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-bold text-textDim uppercase tracking-widest mb-1">Taxis</p>
                                      <p className="text-textMuted text-xs">{r.taxi_count} total · {r.billable_taxis} billed · {r.taxi_count - r.billable_taxis} free</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-bold text-textDim uppercase tracking-widest mb-1">Total Payments</p>
                                      <p className="font-bold text-green">{formatZAR(r.total_paid)} across {r.paid_count} billing{r.paid_count !== 1 ? "s" : ""}</p>
                                    </div>
                                    <div className="md:col-span-4 pt-2 border-t border-border/50 flex gap-3">
                                      <button onClick={() => { setActiveTab("billing"); }}
                                        className="flex items-center gap-1.5 text-xs text-cyan hover:underline">
                                        <Receipt size={11} /> View full billing history →
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            TAB: BILLING HISTORY
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "billing" && (
          <div className="space-y-4">
            <Card>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <History size={14} className="text-cyan" />
                  <h2 className="text-sm font-bold text-text">Billing Records</h2>
                </div>
                <button onClick={() => loadBillingHistory(billFilt)}
                  className="text-textDim hover:text-cyan transition-colors">
                  <RefreshCw size={13} className={loadingBilling ? "animate-spin" : ""} />
                </button>
              </div>

              {/* Filter tabs */}
              <div className="flex gap-1 mb-4">
                {([
                  { key: "all",    label: "All",    cls: "bg-cyanDim text-cyan border-cyan/20"       },
                  { key: "paid",   label: "Paid",   cls: "bg-green/10 text-green border-green/20"   },
                  { key: "failed", label: "Failed", cls: "bg-red/10 text-red border-red/20"         },
                  { key: "waived", label: "Waived", cls: "bg-cyan/10 text-cyan border-cyan/20"       },
                ] as const).map(t => (
                  <button key={t.key} onClick={() => setBillFilt(t.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      billFilt === t.key ? t.cls : "bg-bg3 border-border text-textMuted hover:text-text"
                    }`}>
                    {t.label}
                  </button>
                ))}
              </div>

              {loadingBilling ? (
                <div className="flex justify-center py-10"><Spinner /></div>
              ) : filteredBilling.length === 0 ? (
                <div className="py-10 text-center">
                  <Receipt size={28} className="mx-auto mb-3 text-textDim opacity-30" />
                  <p className="text-textMuted text-sm">No {billFilt !== "all" ? billFilt : ""} billing records</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        {["Owner", "Period", "Taxis", "Amount", "Status", "Billed At"].map((h, i) => (
                          <th key={i} className="text-left py-2 px-3 text-textDim font-bold uppercase tracking-wider text-[10px]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBilling.map(b => (
                        <tr key={b.id} className="border-b border-border/50 hover:bg-bg3/30 transition-colors">
                          <td className="py-3 px-3">
                            <p className="font-semibold text-text">{b.full_name}</p>
                            <p className="text-textDim text-[10px]">{b.business_name || "—"}</p>
                          </td>
                          <td className="py-3 px-3">
                            <p className="font-mono font-bold text-text">{b.period}</p>
                          </td>
                          <td className="py-3 px-3">
                            <p className="text-textMuted">{b.taxi_count} total · {b.billable_taxis} billed</p>
                          </td>
                          <td className="py-3 px-3">
                            <p className={`font-black tabular-nums ${b.amount > 0 ? "text-green" : "text-textMuted"}`}>
                              {b.amount > 0 ? formatZAR(b.amount) : "Waived"}
                            </p>
                            {b.price_per_taxi > 0 && (
                              <p className="text-textDim text-[10px]">@ {formatZAR(b.price_per_taxi)}/taxi</p>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <StatusBadge status={b.status} map={BILL_STATUS} />
                            {b.failure_reason && (
                              <p className="text-red text-[10px] mt-1">{b.failure_reason}</p>
                            )}
                          </td>
                          <td className="py-3 px-3 text-textMuted">{b.billed_at ? formatDate(b.billed_at) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-textDim text-[10px] text-center mt-3">Showing latest 200 records</p>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            TAB: PRICING SETTINGS
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "settings" && (
          <div className="space-y-5">
            <Card>
              <div className="flex items-center gap-2 mb-1">
                <DollarSign size={14} className="text-cyan" />
                <h2 className="text-sm font-bold text-text">Subscription & Statement Pricing</h2>
              </div>
              <p className="text-textMuted text-xs mb-5">
                First <span className="text-cyan font-bold">{freeTaxis}</span> taxi is free. Each additional taxi bills monthly.
                Statement fees deducted from wallet on download.
              </p>

              {!settingsLoaded ? <Spinner /> : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { label: "Price per extra taxi / month (R)", value: pricePerTaxi, set: setPricePerTaxi, min: 0, desc: "Monthly charge per taxi beyond the free tier" },
                    { label: "Free taxis per owner",             value: freeTaxis,    set: setFreeTaxis,    min: 0, desc: "Number of taxis included at no cost" },
                    { label: "Auto-debit day (1–28)",            value: subBillingDay,set: setSubBillingDay,min: 1, max: 28, desc: `Currently bills on the ${ordinal(parseInt(subBillingDay))} of each month` },
                    { label: "Owner statement fee (R)",          value: ownerStmtPrice,set: setOwnerStmtPrice, min: 0, desc: "Deducted per fleet statement download" },
                    { label: "Passenger statement fee (R)",      value: passengerStmtPrice, set: setPassengerStmtPrice, min: 0, desc: "Deducted per passenger expense statement" },
                  ].map(f => (
                    <div key={f.label} className="bg-bg border border-border rounded-xl p-4">
                      <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-2">{f.label}</label>
                      <input type="number" min={f.min} max={(f as any).max} value={f.value}
                        onChange={e => f.set(e.target.value)}
                        className="w-full bg-bg2 border border-border rounded-lg px-3 py-2.5 text-text text-sm font-mono focus:outline-none focus:border-cyan transition-colors" />
                      <p className="text-textDim text-[10px] mt-1.5">{f.desc}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-5 pt-4 border-t border-border flex justify-end">
                <button onClick={savePricing} disabled={savingPricing}
                  className="flex items-center gap-2 px-5 py-2 bg-cyan/10 border border-cyan/20 text-cyan text-xs font-bold rounded-lg hover:bg-cyan/20 disabled:opacity-50 transition-all">
                  {savingPricing ? <Spinner /> : <Save size={13} />} Save Pricing
                </button>
              </div>
            </Card>

            {/* Live preview */}
            <Card>
              <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-3">Pricing Preview</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[1, 2, 3, 5, 10].map(n => {
                  const billable = Math.max(0, n - parseInt(freeTaxis));
                  const fee = billable * parseFloat(pricePerTaxi);
                  return (
                    <div key={n} className={`p-4 rounded-xl border text-center ${fee === 0 ? "border-green/20 bg-green/5" : "border-cyan/20 bg-cyan/5"}`}>
                      <p className="text-textMuted text-[10px] font-bold uppercase tracking-widest">{n} Taxi{n !== 1 ? "s" : ""}</p>
                      <p className={`text-xl font-black mt-1 ${fee === 0 ? "text-green" : "text-cyan"}`}>
                        {fee === 0 ? "Free" : formatZAR(fee)}
                      </p>
                      <p className="text-textDim text-[9px] mt-1">{fee > 0 ? "/mo" : "always free"}</p>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            TAB: MAINTENANCE FEE
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "maintenance" && (
          <div className="space-y-5">
            {/* Status banner */}
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
              maintEnabled ? "bg-cyan/5 border-cyan/20" : "bg-bg2 border-border"
            }`}>
              {maintEnabled
                ? <CheckCircle2 size={16} className="text-cyan flex-shrink-0" />
                : <Info size={16} className="text-textMuted flex-shrink-0" />}
              <div className="flex-1">
                <p className={`text-sm font-bold ${maintEnabled ? "text-cyan" : "text-textMuted"}`}>
                  Maintenance fee is {maintEnabled ? "ENABLED" : "DISABLED"}
                </p>
                {maintEnabled && (
                  <p className="text-xs text-textMuted mt-0.5">
                    {formatZAR(parseFloat(maintAmount) || 0)} deducted from all active wallets on the {ordinal(parseInt(maintDay))} of every month
                  </p>
                )}
              </div>
            </div>

            {/* Preview stats */}
            {maintPreview && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Eligible Wallets",  value: maintPreview.eligible_wallets,          color: "text-cyan"    },
                  { label: "Total Wallets",      value: maintPreview.total_wallets,             color: "text-textMuted" },
                  { label: "Projected Revenue",  value: formatZAR(maintPreview.projected_revenue), color: "text-green" },
                  { label: "Fee Amount",         value: formatZAR(maintPreview.fee),            color: "text-yellow"  },
                ].map(c => (
                  <div key={c.label} className="bg-bg2 border border-border rounded-xl p-4 text-center">
                    <p className="text-[10px] font-bold text-textDim uppercase tracking-widest mb-1">{c.label}</p>
                    <p className={`text-2xl font-black ${c.color}`}>{c.value}</p>
                  </div>
                ))}
              </div>
            )}

            <Card>
              <div className="flex items-center gap-2 mb-1">
                <Wrench size={14} className="text-cyan" />
                <h2 className="text-sm font-bold text-text">Maintenance Fee Settings</h2>
              </div>
              <p className="text-textMuted text-xs mb-5">
                Charged from all users — passengers, drivers, and owners. Wallets with insufficient balance are skipped.
              </p>

              {/* Toggle */}
              <div className="flex items-center justify-between p-4 bg-bg border border-border rounded-xl mb-5">
                <div>
                  <p className="text-sm font-bold text-text">Enable Maintenance Fee</p>
                  <p className="text-textDim text-xs mt-0.5">Auto-debit on configured day each month from all active wallets</p>
                </div>
                <button onClick={() => setMaintEnabled(v => !v)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-bold text-sm transition-all ${
                    maintEnabled ? "bg-cyan/10 border-cyan/30 text-cyan" : "bg-bg2 border-border text-textMuted"
                  }`}>
                  {maintEnabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                  {maintEnabled ? "Enabled" : "Disabled"}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-bg border border-border rounded-xl p-4">
                  <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-2">Fee Amount (R)</label>
                  <input type="number" min={0} step={0.5} value={maintAmount} onChange={e => setMaintAmount(e.target.value)}
                    className="w-full bg-bg2 border border-border rounded-lg px-3 py-2.5 text-text text-sm font-mono focus:outline-none focus:border-cyan" />
                  <p className="text-textDim text-[10px] mt-1.5">Amount deducted from every active wallet</p>
                </div>

                <div className="bg-bg border border-border rounded-xl p-4">
                  <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-2">Debit Day (1–28)</label>
                  <input type="number" min={1} max={28} value={maintDay} onChange={e => setMaintDay(e.target.value)}
                    className="w-full bg-bg2 border border-border rounded-lg px-3 py-2.5 text-text text-sm font-mono focus:outline-none focus:border-cyan" />
                  <p className="text-textDim text-[10px] mt-1.5">Day each month fee is auto-debited (max 28 to avoid month-end issues)</p>
                </div>

                <div className="md:col-span-2 bg-bg border border-border rounded-xl p-4">
                  <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-2">Transaction Label</label>
                  <input type="text" value={maintLabel} onChange={e => setMaintLabel(e.target.value)}
                    placeholder="Monthly maintenance fee"
                    className="w-full bg-bg2 border border-border rounded-lg px-3 py-2.5 text-text text-sm focus:outline-none focus:border-cyan" />
                  <p className="text-textDim text-[10px] mt-1.5">Label shown in user transaction history</p>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-border flex items-center justify-between">
                <button onClick={() => { setPreviewLoading(true); api.maintenanceFeePreview().then(r => setMaintPreview(r.data)).finally(() => setPreviewLoading(false)); }}
                  disabled={previewLoading}
                  className="flex items-center gap-2 text-xs font-bold text-textMuted border border-border px-3 py-2 rounded-lg hover:border-cyan hover:text-cyan transition-colors disabled:opacity-50">
                  <RefreshCw size={12} className={previewLoading ? "animate-spin" : ""} /> Refresh Preview
                </button>
                <div className="flex items-center gap-3">
                  <button onClick={saveMaintenance} disabled={savingMaint}
                    className="flex items-center gap-2 px-5 py-2 bg-cyan/10 border border-cyan/20 text-cyan text-xs font-bold rounded-lg hover:bg-cyan/20 disabled:opacity-50 transition-all">
                    {savingMaint ? <Spinner /> : <Save size={13} />} Save Settings
                  </button>
                  <button onClick={runMaintenanceFee} disabled={runningMaint || !maintEnabled}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red/10 border border-red/30 text-red text-xs font-bold hover:bg-red/20 transition-colors disabled:opacity-40">
                    {runningMaint ? <Spinner /> : <Play size={13} />} Run Now
                  </button>
                </div>
              </div>
            </Card>

            <div className="flex items-start gap-3 p-4 bg-yellow/5 border border-yellow/20 rounded-xl">
              <AlertTriangle size={15} className="text-yellow flex-shrink-0 mt-0.5" />
              <p className="text-textMuted text-xs">
                <span className="text-yellow font-bold">Run Now</span> immediately deducts from all eligible wallets.
                Use only for manual billing outside the scheduled date. The auto-debit loop runs hourly and triggers automatically on the configured day.
              </p>
            </div>
          </div>
        )}

      </div>
    </AdminShell>
  );
}
