"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import {
  TrendingUp, Users, AlertTriangle, CheckCircle, Save, Zap, Gift,
  RefreshCw, CreditCard, Building, Calendar, DollarSign, ChevronRight,
  BarChart3, Wrench, Play, ToggleLeft, ToggleRight, Info,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell,
} from "recharts";

const STATUS_TONE: Record<string, "green" | "red" | "yellow" | "cyan" | "muted"> = {
  active: "green", overdue: "red", cancelled: "muted", free: "cyan",
};

const TT = {
  contentStyle: {
    background: "var(--bg2)", border: "1px solid var(--border)",
    borderRadius: 8, color: "var(--text)", fontSize: 11,
  },
};

const MONTH_COLORS = ["#00D4FF", "#00E676", "#A064FF", "#FFD60A", "#FF8C42", "#FF4D9E"];

function KPICard({ label, value, sub, icon: Icon, color, border }: {
  label: string; value: string | number; sub?: string;
  icon: any; color: string; border: string;
}) {
  return (
    <div className={`bg-bg2 border ${border} rounded-xl p-5`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-bold text-textDim uppercase tracking-widest mb-2">{label}</p>
          <p className={`text-2xl font-black ${color}`}>{value}</p>
          {sub && <p className="text-textDim text-xs mt-1">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-current/10`}
          style={{ backgroundColor: `var(--${color.replace("text-", "")})/10` }}>
          <Icon size={18} className={color} />
        </div>
      </div>
    </div>
  );
}

export default function SubscriptionsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [revenue, setRevenue] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const [settingsLoading, setSettingsLoading] = useState(true);
  const [pricePerTaxi, setPricePerTaxi] = useState("10");
  const [freeTaxis, setFreeTaxis] = useState("1");
  const [subBillingDay, setSubBillingDay] = useState("1");
  const [ownerStmtPrice, setOwnerStmtPrice] = useState("10");
  const [passengerStmtPrice, setPassengerStmtPrice] = useState("5");
  const [savingPricing, setSavingPricing] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "subscribers" | "settings" | "maintenance">("overview");

  // Maintenance fee state
  const [maintEnabled, setMaintEnabled] = useState(false);
  const [maintAmount, setMaintAmount] = useState("0");
  const [maintDay, setMaintDay] = useState("1");
  const [maintLabel, setMaintLabel] = useState("Monthly maintenance fee");
  const [savingMaint, setSavingMaint] = useState(false);
  const [maintPreview, setMaintPreview] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [runningMaint, setRunningMaint] = useState(false);

  const loadAll = () => {
    setLoading(true);
    Promise.all([api.subscriptions(), api.subscriptionRevenue()])
      .then(([subs, rev]) => { setRows(Array.isArray(subs.data) ? subs.data : []); setRevenue(rev.data); })
      .catch(() => toast.error("Failed to load subscriptions"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAll();
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
      })
      .finally(() => setSettingsLoading(false));
    // Load maintenance fee preview
    api.maintenanceFeePreview().then(r => setMaintPreview(r.data)).catch(() => {});
  }, []);

  const savePricing = async () => {
    setSavingPricing(true);
    try {
      await api.updatePayoutSettings({
        subscription_price_per_taxi: parseFloat(pricePerTaxi),
        subscription_free_taxis: parseInt(freeTaxis),
        subscription_billing_day: parseInt(subBillingDay),
        owner_statement_price: parseFloat(ownerStmtPrice),
        passenger_statement_price: parseFloat(passengerStmtPrice),
      });
      toast.success("Pricing & billing schedule updated");
      loadAll();
    } catch { toast.error("Failed to save pricing"); }
    finally { setSavingPricing(false); }
  };

  const saveMaintenance = async () => {
    setSavingMaint(true);
    try {
      await api.updatePayoutSettings({
        maintenance_fee_enabled: maintEnabled,
        maintenance_fee_amount: parseFloat(maintAmount),
        maintenance_fee_day: parseInt(maintDay),
        maintenance_fee_label: maintLabel,
      });
      toast.success("Maintenance fee settings saved");
      // Refresh preview
      const preview = await api.maintenanceFeePreview();
      setMaintPreview(preview.data);
    } catch { toast.error("Failed to save maintenance fee settings"); }
    finally { setSavingMaint(false); }
  };

  const loadMaintPreview = async () => {
    setPreviewLoading(true);
    try {
      const r = await api.maintenanceFeePreview();
      setMaintPreview(r.data);
    } catch { toast.error("Failed to load preview"); }
    finally { setPreviewLoading(false); }
  };

  const runMaintenanceFee = async () => {
    if (!confirm(`Deduct ${formatZAR(parseFloat(maintAmount))} from ALL eligible wallets right now? This cannot be undone.`)) return;
    setRunningMaint(true);
    try {
      const r = await api.runMaintenanceFee();
      toast.success(`Done — ${r.data.charged} wallets charged · ${formatZAR(r.data.total_collected)} collected · ${r.data.skipped} skipped`);
      loadMaintPreview();
    } catch (e: any) { toast.error(e?.message || "Failed to run maintenance fee"); }
    finally { setRunningMaint(false); }
  };

  const billNow = async (ownerUserId: string, name: string) => {
    setActing(ownerUserId);
    try {
      await api.billOwnerNow(ownerUserId);
      toast.success(`Billing triggered for ${name}`);
      loadAll();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setActing(null); }
  };

  const waive = async (ownerUserId: string, name: string) => {
    setActing(ownerUserId + "_waive");
    try {
      await api.waiveSubscription(ownerUserId);
      toast.success(`Fee waived for ${name}`);
      loadAll();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setActing(null); }
  };

  const overdueCount = rows.filter(r => r.status === "overdue").length;
  const activeCount = rows.filter(r => r.status === "active").length;
  const freeCount = rows.filter(r => r.monthly_fee === 0 || r.status === "free").length;
  const monthlyData = revenue?.monthly_breakdown?.map((m: any, i: number) => ({
    month: new Date(m.year, m.month - 1).toLocaleString("default", { month: "short" }),
    revenue: m.revenue,
    billings: m.billings,
  })) ?? [];

  const TABS = [
    { id: "overview",    label: "Overview",         icon: BarChart3  },
    { id: "subscribers", label: "Subscribers",       icon: Users      },
    { id: "settings",    label: "Pricing & Schedule", icon: DollarSign },
    { id: "maintenance", label: "Maintenance Fee",   icon: Wrench     },
  ] as const;

  return (
    <AdminShell title="Subscriptions">
      <div className="space-y-6">

        {/* Alert banner for overdue */}
        {overdueCount > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 bg-red/10 border border-red/20 rounded-xl">
            <AlertTriangle size={16} className="text-red flex-shrink-0" />
            <p className="text-red text-sm font-semibold">
              {overdueCount} fleet owner{overdueCount !== 1 ? "s" : ""} ha{overdueCount !== 1 ? "ve" : "s"} overdue subscriptions — wallet balance may be insufficient.
            </p>
            <button
              onClick={() => setActiveTab("subscribers")}
              className="ml-auto text-xs font-bold text-red border border-red/30 px-3 py-1 rounded-lg hover:bg-red/10 transition-colors flex items-center gap-1"
            >
              View <ChevronRight size={12} />
            </button>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard label="Monthly Recurring Revenue" value={revenue ? formatZAR(revenue.mrr ?? revenue.monthly_revenue ?? 0) : "—"} sub="Active paid subscriptions" icon={TrendingUp} color="text-green" border="border-green/20" />
          <KPICard label="This Month Collected" value={revenue ? formatZAR(revenue.this_month ?? revenue.this_month_revenue ?? 0) : "—"} sub="Billing to date" icon={CheckCircle} color="text-cyan" border="border-cyan/20" />
          <KPICard label="Active Subscribers" value={activeCount || revenue?.active_subscriptions || 0} sub={`${freeCount} on free tier`} icon={Users} color="text-purple" border="border-purple/20" />
          <KPICard label="Overdue Accounts" value={overdueCount} sub="Require manual action" icon={AlertTriangle} color={overdueCount > 0 ? "text-red" : "text-textMuted"} border={overdueCount > 0 ? "border-red/20" : "border-border"} />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border pb-0">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${
                activeTab === t.id ? "text-cyan border-cyan" : "text-textMuted border-transparent hover:text-text"
              }`}
            >
              <t.icon size={12} /> {t.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 pb-2">
            <Button variant="secondary" onClick={loadAll} disabled={loading}>
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
          </div>
        </div>

        {/* ─── TAB: OVERVIEW ─── */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Revenue history chart */}
            {monthlyData.length > 0 && (
              <Card>
                <div className="flex items-center gap-2 mb-5">
                  <BarChart3 size={15} className="text-cyan" />
                  <h2 className="text-sm font-bold text-text">Monthly Subscription Revenue</h2>
                </div>
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
              </Card>
            )}

            {/* How it works */}
            <div className="bg-bg2 border border-cyan/20 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <CreditCard size={15} className="text-cyan" />
                <h3 className="text-sm font-bold text-text">How Fleet Subscriptions Work</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { icon: Gift, title: "Free Tier", desc: `First ${freeTaxis} taxi per owner is always free — zero cost for single-taxi operators`, color: "text-green" },
                  { icon: DollarSign, title: "Paid Tier", desc: `Each additional taxi costs R${pricePerTaxi}/month, deducted automatically from owner wallet`, color: "text-cyan" },
                  { icon: Calendar, title: "Auto-Billing", desc: `Billing runs on the ${subBillingDay}${["st","nd","rd"][parseInt(subBillingDay)-1]||"th"} of each month. Failed billing marks account overdue and sends notification`, color: "text-yellow" },
                  { icon: Building, title: "Statement Fees", desc: `Owner statements R${ownerStmtPrice} · Passenger statements R${passengerStmtPrice} — deducted on download`, color: "text-purple" },
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

        {/* ─── TAB: SUBSCRIBERS ─── */}
        {activeTab === "subscribers" && (
          <div className="space-y-4">
            {loading ? (
              <div className="flex justify-center py-16"><Spinner /></div>
            ) : rows.length === 0 ? (
              <div className="text-center py-16 text-textMuted">
                <Building size={40} className="mx-auto mb-3 opacity-20" />
                <p className="font-semibold">No fleet owners yet</p>
                <p className="text-xs mt-1 text-textDim">Subscriptions appear here when fleet owners register</p>
              </div>
            ) : (
              <Table headers={["Owner", "Taxis", "Monthly Fee", "Status", "Next Billing", "Total Paid", "Actions"]} empty={false}>
                {rows.map(r => (
                  <Tr key={r.owner_user_id}>
                    <Td>
                      <p className="font-semibold text-sm">{r.full_name}</p>
                      <p className="text-[10px] text-textMuted">{r.business_name || r.email || "—"}</p>
                    </Td>
                    <Td>
                      <span className="font-mono font-bold text-text">{r.taxi_count}</span>
                      <p className="text-[10px] mt-0.5">
                        {r.billable_taxis === 0
                          ? <span className="text-green flex items-center gap-1"><Gift size={9} /> Free tier</span>
                          : <span className="text-textMuted">{r.billable_taxis} billed</span>}
                      </p>
                    </Td>
                    <Td>
                      <span className={`font-mono font-bold text-sm ${r.monthly_fee > 0 ? "text-cyan" : "text-green"}`}>
                        {r.monthly_fee > 0 ? formatZAR(r.monthly_fee) : "Free"}
                      </span>
                    </Td>
                    <Td>
                      <Badge label={r.status} tone={STATUS_TONE[r.status] || "muted"} />
                      {r.overdue_since && (
                        <p className="text-[10px] text-red mt-0.5">Since {formatDate(r.overdue_since)}</p>
                      )}
                    </Td>
                    <Td className="text-textMuted text-xs">{r.next_billing_date ? formatDate(r.next_billing_date) : "—"}</Td>
                    <Td>
                      <span className="font-mono text-green font-semibold">{formatZAR(r.total_paid)}</span>
                      <p className="text-[10px] text-textDim">{r.paid_count} payment{r.paid_count !== 1 ? "s" : ""}</p>
                    </Td>
                    <Td>
                      <div className="flex gap-1.5 flex-wrap">
                        <Button
                          onClick={() => billNow(r.owner_user_id, r.full_name)}
                          disabled={!!acting}
                          loading={acting === r.owner_user_id}
                        >
                          <Zap size={12} /> Bill Now
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => waive(r.owner_user_id, r.full_name)}
                          disabled={!!acting}
                          loading={acting === r.owner_user_id + "_waive"}
                        >
                          <Gift size={12} /> Waive
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Table>
            )}
          </div>
        )}

        {/* ─── TAB: MAINTENANCE FEE ─── */}
        {activeTab === "maintenance" && (
          <div className="space-y-6">

            {/* Current status banner */}
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${maintEnabled ? "bg-cyan/10 border-cyan/30" : "bg-bg2 border-border"}`}>
              {maintEnabled
                ? <CheckCircle size={16} className="text-cyan flex-shrink-0" />
                : <Info size={16} className="text-textMuted flex-shrink-0" />}
              <div className="flex-1">
                <p className={`text-sm font-bold ${maintEnabled ? "text-cyan" : "text-textMuted"}`}>
                  Maintenance fee is {maintEnabled ? "ENABLED" : "DISABLED"}
                </p>
                {maintEnabled && (
                  <p className="text-xs text-textMuted mt-0.5">
                    {formatZAR(parseFloat(maintAmount) || 0)} deducted from ALL active wallets on the {maintDay}{["st","nd","rd"][parseInt(maintDay)-1]||"th"} of every month
                  </p>
                )}
              </div>
            </div>

            {/* Preview stats */}
            {maintPreview && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Eligible Wallets",    value: maintPreview.eligible_wallets,                          color: "text-cyan",    icon: Users       },
                  { label: "Total Wallets",        value: maintPreview.total_wallets,                             color: "text-textMuted",icon: Users       },
                  { label: "Projected Revenue",    value: formatZAR(maintPreview.projected_revenue),              color: "text-green",   icon: TrendingUp  },
                  { label: "Fee Amount",           value: formatZAR(maintPreview.fee),                            color: "text-yellow",  icon: DollarSign  },
                ].map(c => (
                  <div key={c.label} className="bg-bg2 border border-border rounded-xl p-4">
                    <p className="text-[9px] font-bold text-textDim uppercase tracking-widest mb-1">{c.label}</p>
                    <p className={`text-xl font-black ${c.color}`}>{c.value}</p>
                  </div>
                ))}
              </div>
            )}

            <Card>
              <div className="flex items-center gap-2 mb-1">
                <Wrench size={15} className="text-cyan" />
                <h2 className="text-sm font-bold text-text">Maintenance Fee Settings</h2>
              </div>
              <p className="text-textMuted text-xs mb-5">
                Charged from all users — passengers, drivers, and owners. Wallets with insufficient balance are skipped.
              </p>

              {/* Enable toggle */}
              <div className="flex items-center justify-between p-4 bg-bg border border-border rounded-xl mb-5">
                <div>
                  <p className="text-sm font-bold text-text">Enable Maintenance Fee</p>
                  <p className="text-textDim text-xs mt-0.5">Auto-debit on the configured day each month from all active wallets</p>
                </div>
                <button
                  onClick={() => setMaintEnabled(v => !v)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-bold text-sm transition-all ${
                    maintEnabled
                      ? "bg-cyan/10 border-cyan/30 text-cyan"
                      : "bg-bg2 border-border text-textMuted"
                  }`}
                >
                  {maintEnabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                  {maintEnabled ? "Enabled" : "Disabled"}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="bg-bg border border-border rounded-xl p-4">
                  <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-2">Fee Amount (R)</label>
                  <input
                    type="number" min={0} step={0.5} value={maintAmount}
                    onChange={e => setMaintAmount(e.target.value)}
                    className="w-full bg-bg2 border border-border rounded-lg px-3 py-2.5 text-text text-sm font-mono focus:outline-none focus:border-cyan transition-colors"
                    placeholder="e.g. 5.00"
                  />
                  <p className="text-textDim text-[10px] mt-1.5">Amount deducted from every active wallet</p>
                </div>

                <div className="bg-bg border border-border rounded-xl p-4">
                  <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-2">Debit Day of Month (1–28)</label>
                  <input
                    type="number" min={1} max={28} value={maintDay}
                    onChange={e => setMaintDay(e.target.value)}
                    className="w-full bg-bg2 border border-border rounded-lg px-3 py-2.5 text-text text-sm font-mono focus:outline-none focus:border-cyan transition-colors"
                    placeholder="e.g. 1"
                  />
                  <p className="text-textDim text-[10px] mt-1.5">Day each month the fee is auto-debited (max 28 to avoid month-end issues)</p>
                </div>

                <div className="md:col-span-2 bg-bg border border-border rounded-xl p-4">
                  <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-2">Transaction Label</label>
                  <input
                    type="text" value={maintLabel}
                    onChange={e => setMaintLabel(e.target.value)}
                    className="w-full bg-bg2 border border-border rounded-lg px-3 py-2.5 text-text text-sm focus:outline-none focus:border-cyan transition-colors"
                    placeholder="Monthly maintenance fee"
                  />
                  <p className="text-textDim text-[10px] mt-1.5">Label shown in user transaction history</p>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-border flex items-center gap-3 justify-between">
                <button
                  onClick={loadMaintPreview}
                  disabled={previewLoading}
                  className="flex items-center gap-2 text-xs font-bold text-textMuted border border-border px-3 py-2 rounded-lg hover:border-cyan hover:text-cyan transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={12} className={previewLoading ? "animate-spin" : ""} />
                  Refresh Preview
                </button>
                <div className="flex items-center gap-3">
                  <Button onClick={saveMaintenance} loading={savingMaint}>
                    <Save size={13} /> Save Settings
                  </Button>
                  <button
                    onClick={runMaintenanceFee}
                    disabled={runningMaint || !maintEnabled}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red/10 border border-red/30 text-red text-sm font-bold hover:bg-red/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {runningMaint ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} />}
                    Run Now
                  </button>
                </div>
              </div>
            </Card>

            {/* Warning note */}
            <div className="flex items-start gap-3 p-4 bg-yellow/10 border border-yellow/20 rounded-xl">
              <AlertTriangle size={15} className="text-yellow flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-yellow text-xs font-bold">Important</p>
                <p className="text-textMuted text-xs mt-0.5">
                  "Run Now" immediately deducts from all eligible wallets. Use it only for manual billing outside the scheduled date.
                  The auto-debit loop runs hourly and triggers on the configured day.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB: SETTINGS ─── */}
        {activeTab === "settings" && (
          <div className="space-y-6">
            <Card>
              <div className="flex items-center gap-2 mb-1">
                <DollarSign size={15} className="text-cyan" />
                <h2 className="text-sm font-bold text-text">Subscription & Statement Pricing</h2>
              </div>
              <p className="text-textMuted text-xs mb-5">
                First <span className="text-cyan font-bold">{freeTaxis}</span> taxi is free. Additional taxis billed monthly.
                Statement fees are deducted from user wallet on download.
              </p>
              {settingsLoading ? <Spinner /> : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {[
                    {
                      label: "Price / extra taxi / month (R)",
                      value: pricePerTaxi, setter: setPricePerTaxi, min: 0,
                      desc: "Monthly charge per taxi beyond the free tier",
                    },
                    {
                      label: "Free taxis per owner",
                      value: freeTaxis, setter: setFreeTaxis, min: 0,
                      desc: "Number of taxis included at no cost",
                    },
                    {
                      label: "Subscription auto-debit day (1–28)",
                      value: subBillingDay, setter: setSubBillingDay, min: 1, max: 28,
                      desc: "Day of each month subscriptions are automatically debited from owner wallets",
                    },
                    {
                      label: "Owner statement price (R)",
                      value: ownerStmtPrice, setter: setOwnerStmtPrice, min: 0,
                      desc: "Fee deducted per fleet statement download",
                    },
                    {
                      label: "Passenger statement price (R)",
                      value: passengerStmtPrice, setter: setPassengerStmtPrice, min: 0,
                      desc: "Fee deducted per passenger expense statement",
                    },
                  ].map(field => (
                    <div key={field.label} className="bg-bg border border-border rounded-xl p-4">
                      <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-2">{field.label}</label>
                      <input
                        type="number" min={field.min ?? 0} max={(field as any).max}
                        value={field.value}
                        onChange={e => field.setter(e.target.value)}
                        className="w-full bg-bg2 border border-border rounded-lg px-3 py-2.5 text-text text-sm font-mono focus:outline-none focus:border-cyan transition-colors"
                      />
                      <p className="text-textDim text-[10px] mt-1.5">{field.desc}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-5 pt-4 border-t border-border flex justify-end">
                <Button onClick={savePricing} loading={savingPricing}>
                  <Save size={13} /> Save Pricing
                </Button>
              </div>
            </Card>

            {/* Preview */}
            <div className="bg-bg2 border border-border rounded-xl p-5">
              <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-3">Pricing Preview</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[1, 2, 3, 5, 10].map(n => {
                  const billable = Math.max(0, n - parseInt(freeTaxis));
                  const fee = billable * parseFloat(pricePerTaxi);
                  return (
                    <div key={n} className={`p-3 rounded-xl border ${fee === 0 ? "border-green/20 bg-green/5" : "border-cyan/20 bg-cyan/5"}`}>
                      <p className="text-[10px] text-textMuted font-semibold">{n} Taxi{n !== 1 ? "s" : ""}</p>
                      <p className={`text-lg font-black mt-0.5 ${fee === 0 ? "text-green" : "text-cyan"}`}>
                        {fee === 0 ? "Free" : formatZAR(fee)}/mo
                      </p>
                      <p className="text-textDim text-[9px] mt-0.5">{billable} billed taxi{billable !== 1 ? "s" : ""}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
