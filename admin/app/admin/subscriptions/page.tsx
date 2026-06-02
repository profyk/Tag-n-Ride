"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { formatDate } from "@/lib/utils";
import { TrendingUp, Users, AlertTriangle, CheckCircle, Save, Zap, Gift } from "lucide-react";

const STATUS_TONE: Record<string, "green" | "red" | "yellow" | "muted"> = {
  active: "green", overdue: "red", cancelled: "muted",
};

function StatCard({ label, value, sub, icon: Icon, color }: any) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 mb-1">{label}</p>
          <p className="text-2xl font-black text-gray-900">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </Card>
  );
}

export default function SubscriptionsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [revenue, setRevenue] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  // Pricing settings
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [pricePerTaxi, setPricePerTaxi] = useState("10");
  const [freeTaxis, setFreeTaxis] = useState("1");
  const [ownerStmtPrice, setOwnerStmtPrice] = useState("10");
  const [passengerStmtPrice, setPassengerStmtPrice] = useState("5");
  const [savingPricing, setSavingPricing] = useState(false);

  const loadAll = () => {
    setLoading(true);
    Promise.all([api.subscriptions(), api.subscriptionRevenue()])
      .then(([subs, rev]) => { setRows(subs.data); setRevenue(rev.data); })
      .catch(() => toast.error("Failed to load subscriptions"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAll();
    api.getPayoutSettings()
      .then(r => {
        setPricePerTaxi(String(r.data.subscription_price_per_taxi ?? 10));
        setFreeTaxis(String(r.data.subscription_free_taxis ?? 1));
        setOwnerStmtPrice(String(r.data.owner_statement_price ?? 10));
        setPassengerStmtPrice(String(r.data.passenger_statement_price ?? 5));
      })
      .finally(() => setSettingsLoading(false));
  }, []);

  const savePricing = async () => {
    setSavingPricing(true);
    try {
      await api.updatePayoutSettings({
        subscription_price_per_taxi: parseFloat(pricePerTaxi),
        subscription_free_taxis: parseInt(freeTaxis),
        owner_statement_price: parseFloat(ownerStmtPrice),
        passenger_statement_price: parseFloat(passengerStmtPrice),
      });
      toast.success("Pricing updated");
      loadAll();
    } catch { toast.error("Failed to save pricing"); }
    finally { setSavingPricing(false); }
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

  const fmtZAR = (v: number) => `R${v.toFixed(2)}`;

  return (
    <AdminShell title="Subscriptions">
      <div className="space-y-6">

        {/* Revenue KPIs */}
        {revenue && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Monthly Recurring Revenue" value={fmtZAR(revenue.mrr)}
              sub="Active paid subscriptions" icon={TrendingUp} color="bg-green-500" />
            <StatCard label="This Month" value={fmtZAR(revenue.this_month)}
              sub="Collected so far" icon={CheckCircle} color="bg-blue-500" />
            <StatCard label="Active Subscribers" value={revenue.active_subscriptions}
              sub={`${revenue.free_subscriptions} on free tier`} icon={Users} color="bg-purple-500" />
            <StatCard label="Overdue" value={revenue.overdue_subscriptions}
              sub="Need attention" icon={AlertTriangle} color="bg-red-500" />
          </div>
        )}

        {/* Monthly breakdown */}
        {revenue?.monthly_breakdown?.length > 0 && (
          <Card className="p-5">
            <h2 className="font-semibold text-gray-800 mb-4">Monthly Revenue History</h2>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {revenue.monthly_breakdown.map((m: any) => (
                <div key={`${m.year}-${m.month}`}
                  className="flex-shrink-0 text-center bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 min-w-[90px]">
                  <div className="text-xs text-gray-400 font-medium">
                    {new Date(m.year, m.month - 1).toLocaleString("default", { month: "short" })} {m.year}
                  </div>
                  <div className="text-lg font-black text-green-600 mt-1">{fmtZAR(m.revenue)}</div>
                  <div className="text-xs text-gray-400">{m.billings} billing{m.billings !== 1 ? "s" : ""}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Pricing settings */}
        <Card className="p-5">
          <h2 className="font-semibold text-gray-800 mb-1">Subscription & Statement Pricing</h2>
          <p className="text-sm text-gray-500 mb-4">
            First <strong>{freeTaxis}</strong> taxi is free. Additional taxis billed monthly.
            Statement fees are deducted from user wallet on download.
          </p>
          {settingsLoading ? <Spinner /> : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Price / extra taxi / month (R)</label>
                <input type="number" min={0} value={pricePerTaxi} onChange={e => setPricePerTaxi(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Free taxis per owner</label>
                <input type="number" min={0} max={10} value={freeTaxis} onChange={e => setFreeTaxis(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Owner statement price (R)</label>
                <input type="number" min={0} value={ownerStmtPrice} onChange={e => setOwnerStmtPrice(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Passenger statement price (R)</label>
                <input type="number" min={0} value={passengerStmtPrice} onChange={e => setPassengerStmtPrice(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          )}
          <div className="mt-4">
            <Button onClick={savePricing} disabled={savingPricing} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Save className="w-4 h-4 mr-1.5" />
              {savingPricing ? "Saving…" : "Save pricing"}
            </Button>
          </div>
        </Card>

        {/* Owner subscription table */}
        <Card>
          <div className="px-5 pt-4 pb-2">
            <h2 className="font-semibold text-gray-800">Fleet Owner Subscriptions</h2>
            <p className="text-sm text-gray-400 mt-0.5">
              Billing runs automatically on the 1st of each month. Use bill-now to charge immediately or waive to skip.
            </p>
          </div>
          {loading ? (
            <div className="p-8 flex justify-center"><Spinner /></div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No subscriptions yet</div>
          ) : (
            <Table headers={["Owner", "Taxis", "Monthly Fee", "Status", "Next Billing", "Total Paid", "Actions"]}>
              {rows.map(r => (
                <Tr key={r.owner_user_id}>
                  <Td>
                    <div className="font-medium">{r.full_name}</div>
                    <div className="text-xs text-gray-400">{r.business_name || r.email || "—"}</div>
                  </Td>
                  <Td>
                    <span className="font-mono font-bold">{r.taxi_count}</span>
                    <div className="text-xs text-gray-400">
                      {r.billable_taxis === 0
                        ? <span className="flex items-center gap-1 text-green-600"><Gift className="w-3 h-3" /> Free tier</span>
                        : `${r.billable_taxis} billed`}
                    </div>
                  </Td>
                  <Td>
                    <span className={`font-mono font-bold ${r.monthly_fee > 0 ? "text-blue-600" : "text-green-500"}`}>
                      {r.monthly_fee > 0 ? fmtZAR(r.monthly_fee) : "Free"}
                    </span>
                  </Td>
                  <Td>
                    <Badge label={r.status} tone={STATUS_TONE[r.status] || "muted"} />
                    {r.overdue_since && (
                      <div className="text-xs text-red-500 mt-1">Since {formatDate(r.overdue_since)}</div>
                    )}
                  </Td>
                  <Td>{r.next_billing_date ? formatDate(r.next_billing_date) : "—"}</Td>
                  <Td>
                    <span className="font-mono text-green-700 font-semibold">{fmtZAR(r.total_paid)}</span>
                    <div className="text-xs text-gray-400">{r.paid_count} payment{r.paid_count !== 1 ? "s" : ""}</div>
                  </Td>
                  <Td>
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        onClick={() => billNow(r.owner_user_id, r.full_name)}
                        disabled={acting === r.owner_user_id}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
                      >
                        <Zap className="w-3 h-3 mr-1" />
                        Bill now
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => waive(r.owner_user_id, r.full_name)}
                        disabled={acting === r.owner_user_id + "_waive"}
                        className="border-green-400 text-green-700 hover:bg-green-50 text-xs"
                      >
                        <Gift className="w-3 h-3 mr-1" />
                        Waive
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </Card>

        {/* Info */}
        <Card className="p-4 bg-blue-50 border-blue-200">
          <h3 className="font-semibold text-blue-800 mb-2">How Subscriptions Work</h3>
          <ul className="text-sm text-blue-700 space-y-1 list-disc ml-4">
            <li>First taxi per owner is always free — no charge for single-taxi operators</li>
            <li>Each additional taxi costs the configured monthly fee (default R10/taxi)</li>
            <li>Billing runs automatically on the 1st of each month from the owner&apos;s wallet</li>
            <li>Failed billing marks the account as <strong>overdue</strong> and sends a notification</li>
            <li><strong>Bill now</strong> charges immediately; <strong>Waive</strong> skips this month and resets next billing date</li>
            <li>Statement fees are a separate revenue stream — deducted per download request</li>
          </ul>
        </Card>

      </div>
    </AdminShell>
  );
}
