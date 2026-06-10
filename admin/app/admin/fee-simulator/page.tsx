"use client";
import { useEffect, useState, useMemo } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card } from "@/components/ui";
import client from "@/lib/api";
import { formatZAR } from "@/lib/utils";
import {
  Calculator, TrendingUp, Wallet, Percent,
  DollarSign, CreditCard, RefreshCw, Info,
} from "lucide-react";

type FeeConfig = {
  platform_fee_percent: number;
  topup_processing_fee_percent: number;
  topup_gateway_fee_percent: number;
  topup_gateway_fee_fixed: number;
};

type PayoutConfig = {
  owner_statement_price: number;
  passenger_statement_price: number;
  subscription_price_per_taxi: number;
};

function SliderInput({
  label, value, min, max, step = 1, prefix = "R", suffix = "",
  onChange, color = "text-cyan",
}: {
  label: string; value: number; min: number; max: number; step?: number;
  prefix?: string; suffix?: string; onChange: (v: number) => void; color?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[10px] font-bold text-textMuted uppercase tracking-widest">{label}</label>
        <span className={`text-sm font-black ${color}`}>
          {prefix}{typeof value === "number" ? (step < 1 ? value.toFixed(2) : value.toLocaleString()) : value}{suffix}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full accent-cyan cursor-pointer"
        style={{ accentColor: "var(--cyan)" }}
      />
      <div className="flex justify-between text-[9px] text-textDim mt-0.5">
        <span>{prefix}{min}{suffix}</span>
        <span>{prefix}{max.toLocaleString()}{suffix}</span>
      </div>
    </div>
  );
}

function ResultRow({ label, value, color = "text-text", bold = false, sub }: {
  label: string; value: string; color?: string; bold?: boolean; sub?: string;
}) {
  return (
    <div className={`flex items-center justify-between py-2.5 border-b border-border last:border-0 ${bold ? "font-bold" : ""}`}>
      <div>
        <span className="text-sm text-textMuted">{label}</span>
        {sub && <p className="text-[10px] text-textDim">{sub}</p>}
      </div>
      <span className={`text-sm font-bold ${color}`}>{value}</span>
    </div>
  );
}

export default function FeeSimulatorPage() {
  const [config, setConfig] = useState<FeeConfig>({
    platform_fee_percent: 3,
    topup_processing_fee_percent: 1.5,
    topup_gateway_fee_percent: 2,
    topup_gateway_fee_fixed: 0,
  });
  const [payoutConfig, setPayoutConfig] = useState<PayoutConfig>({
    owner_statement_price: 25,
    passenger_statement_price: 5,
    subscription_price_per_taxi: 10,
  });
  const [loadingConfig, setLoadingConfig] = useState(true);

  // Ride simulation
  const [rideAmount, setRideAmount] = useState(50);
  const [ridesPerDay, setRidesPerDay] = useState(20);

  // Top-up simulation
  const [topupAmount, setTopupAmount] = useState(200);

  // Withdrawal simulation
  const [withdrawalAmount, setWithdrawalAmount] = useState(500);

  // Fleet simulation
  const [fleetSize, setFleetSize] = useState(5);
  const [driversPerTaxi, setDriversPerTaxi] = useState(1);

  useEffect(() => {
    Promise.allSettled([
      client.get("/api/admin/config"),
      client.get("/api/admin/payout-settings"),
    ]).then(([cfg, ps]) => {
      if (cfg.status === "fulfilled" && Array.isArray(cfg.value?.data)) {
        const map: Record<string, string> = {};
        cfg.value.data.forEach((r: any) => { map[r.key] = r.value; });
        setConfig({
          platform_fee_percent: parseFloat(map.platform_fee_percent) || 3,
          topup_processing_fee_percent: parseFloat(map.topup_processing_fee_percent) || 1.5,
          topup_gateway_fee_percent: parseFloat(map.topup_gateway_fee_percent) || 2,
          topup_gateway_fee_fixed: parseFloat(map.topup_gateway_fee_fixed) || 0,
        });
      }
      if (ps.status === "fulfilled" && ps.value?.data) {
        const d = ps.value.data;
        setPayoutConfig({
          owner_statement_price: parseFloat(d.owner_statement_price) || 25,
          passenger_statement_price: parseFloat(d.passenger_statement_price) || 5,
          subscription_price_per_taxi: parseFloat(d.subscription_price_per_taxi) || 10,
        });
      }
    }).finally(() => setLoadingConfig(false));
  }, []);

  // ── Calculations ──────────────────────────────────────────────────────────

  const rideCalc = useMemo(() => {
    const fee = rideAmount * (config.platform_fee_percent / 100);
    const driverNet = rideAmount - fee;
    return { fee, driverNet };
  }, [rideAmount, config.platform_fee_percent]);

  const topupCalc = useMemo(() => {
    const processingFee = topupAmount * (config.topup_processing_fee_percent / 100);
    const gatewayFee = topupAmount * (config.topup_gateway_fee_percent / 100) + config.topup_gateway_fee_fixed;
    const totalFees = processingFee + gatewayFee;
    const walletCredit = topupAmount - totalFees;
    const platformRevenue = processingFee;
    return { processingFee, gatewayFee, totalFees, walletCredit, platformRevenue };
  }, [topupAmount, config]);

  const withdrawalCalc = useMemo(() => {
    const stitchFee = 3.50;
    const net = withdrawalAmount - stitchFee;
    return { stitchFee, net };
  }, [withdrawalAmount]);

  const dailyCalc = useMemo(() => {
    const dailyGross = rideAmount * ridesPerDay;
    const dailyFees = dailyGross * (config.platform_fee_percent / 100);
    const monthlyFees = dailyFees * 30;
    const yearlyFees = monthlyFees * 12;
    return { dailyGross, dailyFees, monthlyFees, yearlyFees };
  }, [rideAmount, ridesPerDay, config.platform_fee_percent]);

  const fleetCalc = useMemo(() => {
    const billableTaxis = Math.max(0, fleetSize - 1);
    const monthlySubscription = billableTaxis * payoutConfig.subscription_price_per_taxi;
    const totalDrivers = fleetSize * driversPerTaxi;
    const dailyFleetGross = rideAmount * ridesPerDay * totalDrivers;
    const dailyFleetFees = dailyFleetGross * (config.platform_fee_percent / 100);
    const monthlyFleetFees = dailyFleetFees * 30;
    const totalMonthlyRevenue = monthlyFleetFees + monthlySubscription;
    return { monthlySubscription, totalDrivers, dailyFleetGross, monthlyFleetFees, totalMonthlyRevenue };
  }, [fleetSize, driversPerTaxi, rideAmount, ridesPerDay, config, payoutConfig]);

  return (
    <AdminShell title="Fee Simulator" subtitle="Interactive fee calculator — uses live platform config">
      <div className="space-y-6">

        {/* Live config banner */}
        <div className="flex items-center gap-3 px-4 py-3 bg-cyan/5 border border-cyan/20 rounded-xl">
          <Info size={15} className="text-cyan flex-shrink-0" />
          <p className="text-text text-sm">
            Rates are loaded from <span className="text-cyan font-bold">live platform config</span>.
            Platform fee: <span className="text-cyan font-bold">{config.platform_fee_percent}%</span> ·
            Top-up processing: <span className="text-cyan font-bold">{config.topup_processing_fee_percent}%</span> ·
            Payout fee: <span className="text-cyan font-bold">R3.50 flat</span>
          </p>
          {loadingConfig && <RefreshCw size={13} className="text-textMuted animate-spin ml-auto flex-shrink-0" />}
        </div>

        {/* ─── ROW 1: Ride + Top-up ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Single Ride */}
          <Card>
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 rounded-lg bg-cyan/10 flex items-center justify-center">
                <DollarSign size={15} className="text-cyan" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-text">Single Ride Payment</h2>
                <p className="text-textDim text-[10px]">Passenger pays driver</p>
              </div>
            </div>
            <div className="mb-5">
              <SliderInput label="Ride Amount" value={rideAmount} min={5} max={500} step={5} onChange={setRideAmount} />
            </div>
            <div className="bg-bg rounded-xl p-4">
              <ResultRow label="Passenger pays" value={formatZAR(rideAmount)} />
              <ResultRow label={`Platform fee (${config.platform_fee_percent}%)`} value={`-${formatZAR(rideCalc.fee)}`} color="text-red" />
              <ResultRow label="Driver receives" value={formatZAR(rideCalc.driverNet)} color="text-green" bold />
              <ResultRow label="Tag-n-Ride earns" value={formatZAR(rideCalc.fee)} color="text-cyan" bold sub="Platform fee revenue" />
            </div>
          </Card>

          {/* Top-up */}
          <Card>
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 rounded-lg bg-purple/10 flex items-center justify-center">
                <CreditCard size={15} className="text-purple" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-text">Wallet Top-up</h2>
                <p className="text-textDim text-[10px]">Passenger loads their wallet</p>
              </div>
            </div>
            <div className="mb-5">
              <SliderInput label="Top-up Amount" value={topupAmount} min={50} max={5000} step={50} onChange={setTopupAmount} color="text-purple" />
            </div>
            <div className="bg-bg rounded-xl p-4">
              <ResultRow label="Amount charged" value={formatZAR(topupAmount)} />
              <ResultRow label={`Processing fee (${config.topup_processing_fee_percent}%)`} value={`-${formatZAR(topupCalc.processingFee)}`} color="text-yellow" />
              <ResultRow label={`Gateway fee (${config.topup_gateway_fee_percent}% + R${config.topup_gateway_fee_fixed})`} value={`-${formatZAR(topupCalc.gatewayFee)}`} color="text-red" sub="Paid to Stitch" />
              <ResultRow label="Wallet credited" value={formatZAR(topupCalc.walletCredit)} color="text-green" bold />
              <ResultRow label="Tag-n-Ride processing revenue" value={formatZAR(topupCalc.platformRevenue)} color="text-cyan" bold />
            </div>
          </Card>
        </div>

        {/* ─── ROW 2: Withdrawal + Daily Volume ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Withdrawal */}
          <Card>
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 rounded-lg bg-yellow/10 flex items-center justify-center">
                <Wallet size={15} className="text-yellow" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-text">Withdrawal to Bank</h2>
                <p className="text-textDim text-[10px]">Driver cashes out earnings</p>
              </div>
            </div>
            <div className="mb-5">
              <SliderInput label="Withdrawal Amount" value={withdrawalAmount} min={50} max={5000} step={50} onChange={setWithdrawalAmount} color="text-yellow" />
            </div>
            <div className="bg-bg rounded-xl p-4">
              <ResultRow label="Requested amount" value={formatZAR(withdrawalAmount)} />
              <ResultRow label="Stitch instant payout fee" value={`-${formatZAR(withdrawalCalc.stitchFee)}`} color="text-red" sub="Fixed per-payout fee" />
              <ResultRow label="Driver receives in bank" value={formatZAR(withdrawalCalc.net)} color="text-green" bold />
            </div>
            <div className="mt-3 p-3 bg-yellow/5 border border-yellow/20 rounded-lg">
              <p className="text-yellow text-[11px]">
                <strong>Note:</strong> The R3.50 Stitch payout fee is paid by the driver, not Tag-n-Ride. This is not platform revenue — it's a passthrough cost.
              </p>
            </div>
          </Card>

          {/* Daily Driver Volume */}
          <Card>
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 rounded-lg bg-green/10 flex items-center justify-center">
                <TrendingUp size={15} className="text-green" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-text">Driver Volume Projection</h2>
                <p className="text-textDim text-[10px]">Per-driver monthly & annual revenue</p>
              </div>
            </div>
            <div className="space-y-4 mb-5">
              <SliderInput label="Avg Ride Amount" value={rideAmount} min={5} max={500} step={5} onChange={setRideAmount} />
              <SliderInput label="Rides Per Day" value={ridesPerDay} min={1} max={100} onChange={setRidesPerDay} color="text-green" />
            </div>
            <div className="bg-bg rounded-xl p-4">
              <ResultRow label="Daily gross volume" value={formatZAR(dailyCalc.dailyGross)} />
              <ResultRow label={`Daily fees (${config.platform_fee_percent}%)`} value={formatZAR(dailyCalc.dailyFees)} color="text-cyan" />
              <ResultRow label="Monthly fee revenue" value={formatZAR(dailyCalc.monthlyFees)} color="text-cyan" bold />
              <ResultRow label="Annual fee revenue" value={formatZAR(dailyCalc.yearlyFees)} color="text-green" bold sub="Per driver, annualised" />
            </div>
          </Card>
        </div>

        {/* ─── Fleet Revenue Model ─── */}
        <Card>
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-purple/10 flex items-center justify-center">
              <Calculator size={15} className="text-purple" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-text">Fleet Owner Revenue Model</h2>
              <p className="text-textDim text-[10px]">Estimate total platform revenue from a fleet</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
            <SliderInput label="Taxis in Fleet" value={fleetSize} min={1} max={50} onChange={setFleetSize} color="text-purple" prefix="" />
            <SliderInput label="Drivers per Taxi" value={driversPerTaxi} min={1} max={3} onChange={setDriversPerTaxi} color="text-cyan" prefix="" />
            <SliderInput label="Rides per Driver/Day" value={ridesPerDay} min={1} max={100} onChange={setRidesPerDay} color="text-green" prefix="" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Total Drivers", value: `${fleetCalc.totalDrivers}`, color: "text-text" },
              { label: "Monthly Subscription", value: formatZAR(fleetCalc.monthlySubscription), color: "text-purple", sub: `${Math.max(0, fleetSize - 1)} billed taxis` },
              { label: "Monthly Ride Fees", value: formatZAR(fleetCalc.monthlyFleetFees), color: "text-cyan", sub: `${config.platform_fee_percent}% on all rides` },
              { label: "Total Monthly Revenue", value: formatZAR(fleetCalc.totalMonthlyRevenue), color: "text-green", sub: "From this fleet" },
            ].map(item => (
              <div key={item.label} className="bg-bg border border-border rounded-xl p-4">
                <p className="text-[9px] font-bold text-textDim uppercase tracking-widest">{item.label}</p>
                <p className={`text-xl font-black mt-1 ${item.color}`}>{item.value}</p>
                {item.sub && <p className="text-textDim text-[10px] mt-0.5">{item.sub}</p>}
              </div>
            ))}
          </div>
        </Card>

        {/* ─── Scale Calculator ─── */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Percent size={15} className="text-yellow" />
            <h2 className="text-sm font-bold text-text">Platform Scale Projections</h2>
            <span className="text-textDim text-xs">— based on {ridesPerDay} rides/driver/day @ {formatZAR(rideAmount)} avg</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Active Drivers", "Daily Gross Volume", "Daily Fee Revenue", "Monthly Fee Revenue", "Annual Revenue"].map(h => (
                    <th key={h} className="px-4 py-2 text-left text-[10px] font-bold text-textMuted uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[10, 50, 100, 250, 500, 1000].map(drivers => {
                  const gross = rideAmount * ridesPerDay * drivers;
                  const fees = gross * (config.platform_fee_percent / 100);
                  return (
                    <tr key={drivers} className="hover:bg-bg3 transition-colors">
                      <td className="px-4 py-3 font-bold text-text">{drivers.toLocaleString()}</td>
                      <td className="px-4 py-3 text-textMuted">{formatZAR(gross)}</td>
                      <td className="px-4 py-3 text-cyan font-bold">{formatZAR(fees)}</td>
                      <td className="px-4 py-3 text-cyan font-bold">{formatZAR(fees * 30)}</td>
                      <td className="px-4 py-3 text-green font-black">{formatZAR(fees * 365)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

      </div>
    </AdminShell>
  );
}
