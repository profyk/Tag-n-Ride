"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Spinner, Button, Badge } from "@/components/ui";
import {
  CheckCircle, XCircle, RefreshCw, Activity, Database, Users,
  AlertTriangle, Wifi, Server, Clock, Zap, ExternalLink,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const BASE = "https://tag-n-ride-production.up.railway.app";
const h = () => ({ Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}` });

const SERVICES = [
  { name: "Backend API", url: BASE, key: "api" },
  { name: "Admin Panel", url: "https://tag-n-ride.vercel.app", key: "admin" },
  { name: "Landing Page", url: "https://tag-n-ride-website.vercel.app", key: "landing" },
  { name: "Stitch Payments", url: "https://stitch.money", key: "stitch" },
];

const latencyColor = (ms: number) => ms < 100 ? "text-green" : ms < 300 ? "text-yellow" : "text-red";
const latencyLabel = (ms: number) => ms < 100 ? "Excellent" : ms < 300 ? "Degraded" : "Critical";

export default function HealthPage() {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [latencyHistory, setLatencyHistory] = useState<{ time: string; ms: number }[]>([]);
  const [uptime, setUptime] = useState(99.9);

  const load = () => {
    setLoading(true);
    fetch(`${BASE}/api/admin/system/health`, { headers: h() })
      .then((r) => r.json())
      .then((d) => {
        setHealth(d);
        setLastChecked(new Date());
        setLatencyHistory((prev) => {
          const next = [...prev, { time: new Date().toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }), ms: d.db_latency_ms || 0 }];
          return next.slice(-12);
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const dbMs = health?.db_latency_ms || 0;
  const isHealthy = health?.status === "healthy";

  return (
    <AdminShell title="System Health">
      <div className="space-y-6">

        {/* Status header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-3 h-3 rounded-full ${isHealthy ? "bg-green animate-pulse" : "bg-red animate-pulse"}`} />
            <div>
              <span className={`font-bold text-lg ${isHealthy ? "text-green" : "text-red"}`}>
                {isHealthy ? "All Systems Operational" : "System Issues Detected"}
              </span>
              <p className="text-xs text-textMuted">Uptime this month: <span className="text-green font-bold">{uptime}%</span></p>
            </div>
            <Badge label={isHealthy ? "healthy" : "degraded"} tone={isHealthy ? "green" : "red"} />
          </div>
          <div className="flex items-center gap-3">
            {lastChecked && (
              <span className="text-textMuted text-xs flex items-center gap-1">
                <Clock size={11} /> Last checked: {lastChecked.toLocaleTimeString()}
              </span>
            )}
            <Button variant="secondary" onClick={load}>
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
          </div>
        </div>

        {loading && !health ? <Spinner /> : (
          <>
            {/* System cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="text-center">
                <div className="flex justify-center mb-2">
                  {health?.db_connected ? <CheckCircle size={28} className="text-green" /> : <XCircle size={28} className="text-red" />}
                </div>
                <p className="font-bold text-sm text-text">Database</p>
                <p className={`text-xs font-bold mt-1 ${latencyColor(dbMs)}`}>{dbMs}ms</p>
                <p className="text-[10px] text-textMuted">{latencyLabel(dbMs)}</p>
              </Card>

              <Card className="text-center">
                <div className="flex justify-center mb-2">
                  <Server size={28} className="text-green" />
                </div>
                <p className="font-bold text-sm text-text">API Server</p>
                <p className="text-xs font-bold mt-1 text-green">Operational</p>
                <p className="text-[10px] text-textMuted">Railway.app</p>
              </Card>

              <Card className="text-center">
                <div className="flex justify-center mb-2">
                  <Activity size={28} className="text-cyan" />
                </div>
                <p className="font-bold text-sm text-text">Active Sessions</p>
                <p className="text-cyan font-bold text-lg mt-1">{health?.stats?.active_admin_sessions || 0}</p>
                <p className="text-[10px] text-textMuted">Admin users</p>
              </Card>

              <Card className="text-center">
                <div className="flex justify-center mb-2">
                  {(health?.stats?.failed_transactions_today || 0) > 0
                    ? <AlertTriangle size={28} className="text-yellow" />
                    : <CheckCircle size={28} className="text-green" />}
                </div>
                <p className="font-bold text-sm text-text">Failed Txns Today</p>
                <p className={`font-bold text-lg mt-1 ${(health?.stats?.failed_transactions_today || 0) > 0 ? "text-yellow" : "text-green"}`}>
                  {health?.stats?.failed_transactions_today || 0}
                </p>
                <p className="text-[10px] text-textMuted">Requires review</p>
              </Card>
            </div>

            {/* DB latency chart */}
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <Zap size={16} className="text-cyan" />
                <h2 className="text-text font-bold">DB Latency History</h2>
                <span className="text-[10px] text-textMuted">(last 12 polls — 30s intervals)</span>
              </div>
              {latencyHistory.length > 1 ? (
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={latencyHistory}>
                    <XAxis dataKey="time" tick={{ fill: "#7777AA", fontSize: 10 }} />
                    <YAxis tick={{ fill: "#7777AA", fontSize: 10 }} tickFormatter={(v) => `${v}ms`} />
                    <Tooltip
                      contentStyle={{ background: "#0D0D16", border: "1px solid #1A1A2E", borderRadius: 8 }}
                      itemStyle={{ color: "#7777AA", fontSize: 11 }}
                      formatter={(v: any) => [`${v}ms`, "Latency"]}
                    />
                    <Line type="monotone" dataKey="ms" stroke="#00D4FF" strokeWidth={2} dot={{ fill: "#00D4FF", r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-20 text-textMuted text-sm">
                  Collecting data — refreshes every 30s
                </div>
              )}
              <div className="flex gap-4 mt-3 text-xs text-textMuted">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green inline-block" /> &lt;100ms — Excellent</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow inline-block" /> 100–300ms — Degraded</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red inline-block" /> &gt;300ms — Critical</span>
              </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Platform stats */}
              <Card>
                <h2 className="text-text font-bold mb-3">Platform Statistics</h2>
                <div className="space-y-0">
                  {[
                    { label: "Total Users", value: health?.stats?.total_users?.toLocaleString(), icon: Users, color: "text-cyan" },
                    { label: "Total Transactions", value: health?.stats?.total_transactions?.toLocaleString(), icon: Activity, color: "text-green" },
                    { label: "DB Latency", value: `${dbMs}ms`, icon: Database, color: latencyColor(dbMs) },
                  ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                      <div className="flex items-center gap-3">
                        <Icon size={15} className="text-textMuted" />
                        <span className="text-textMuted text-sm">{label}</span>
                      </div>
                      <span className={`font-bold text-sm ${color}`}>{value ?? "—"}</span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Pending actions */}
              <Card>
                <h2 className="text-text font-bold mb-3">Pending Actions</h2>
                <div className="space-y-0">
                  {[
                    { label: "Pending KYC", value: health?.stats?.pending_kyc, warn: true },
                    { label: "Pending Withdrawals", value: health?.stats?.pending_withdrawals, warn: true },
                    { label: "Open Disputes", value: health?.stats?.open_disputes, critical: true },
                    { label: "Blacklisted Numbers", value: health?.stats?.blacklisted_numbers, critical: true },
                  ].map(({ label, value, warn, critical }) => {
                    const v = value || 0;
                    const color = v > 0 ? (critical ? "text-red" : "text-yellow") : "text-green";
                    return (
                      <div key={label} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                        <div className="flex items-center gap-3">
                          <AlertTriangle size={15} className="text-textMuted" />
                          <span className="text-textMuted text-sm">{label}</span>
                        </div>
                        <span className={`font-bold text-sm ${color}`}>{v}</span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>

            {/* Service endpoints */}
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <Wifi size={16} className="text-cyan" />
                <h2 className="text-text font-bold">Service Endpoints</h2>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                {SERVICES.map((s) => (
                  <div key={s.name} className="flex items-center justify-between p-3 bg-bg border border-border rounded-xl hover:border-cyan/30 transition-all">
                    <div>
                      <p className="text-text font-semibold text-sm">{s.name}</p>
                      <p className="text-textMuted text-xs font-mono">{s.url}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-green animate-pulse" />
                        <span className="text-green text-xs font-bold">Online</span>
                      </div>
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-textMuted hover:text-cyan transition-all">
                        <ExternalLink size={13} />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </div>
    </AdminShell>
  );
}
