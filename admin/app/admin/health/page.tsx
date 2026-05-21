"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Spinner, Button } from "@/components/ui";
import { CheckCircle, XCircle, RefreshCw, Activity, Database, Users, AlertTriangle } from "lucide-react";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

export default function HealthPage() {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const load = () => {
    setLoading(true);
    fetch(`${BASE}/api/admin/system/health`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => { setHealth(d); setLastChecked(new Date()); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const StatRow = ({ label, value, icon: Icon, color = "text-text" }: any) => (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="flex items-center gap-3">
        <Icon size={16} className="text-textMuted" />
        <span className="text-textMuted text-sm">{label}</span>
      </div>
      <span className={`font-bold text-sm ${color}`}>{value}</span>
    </div>
  );

  return (
    <AdminShell title="System Health">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${
              health?.status === "healthy" ? "bg-green animate-pulse" : "bg-red animate-pulse"
            }`} />
            <span className={`font-bold ${
              health?.status === "healthy" ? "text-green" : "text-red"
            }`}>
              {health?.status === "healthy" ? "All Systems Operational" : "System Issues Detected"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {lastChecked && (
              <span className="text-textMuted text-xs">
                Last checked: {lastChecked.toLocaleTimeString()}
              </span>
            )}
            <Button variant="secondary" onClick={load}>
              <RefreshCw size={13} /> Refresh
            </Button>
          </div>
        </div>

        {loading && !health ? <Spinner /> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="text-center">
                <div className="flex justify-center mb-2">
                  {health?.db_connected
                    ? <CheckCircle size={28} className="text-green" />
                    : <XCircle size={28} className="text-red" />}
                </div>
                <p className="font-bold text-sm text-text">Database</p>
                <p className="text-textMuted text-xs mt-1">{health?.db_latency_ms}ms</p>
              </Card>
              <Card className="text-center">
                <div className="flex justify-center mb-2">
                  <CheckCircle size={28} className="text-green" />
                </div>
                <p className="font-bold text-sm text-text">API Server</p>
                <p className="text-textMuted text-xs mt-1">Operational</p>
              </Card>
              <Card className="text-center">
                <div className="flex justify-center mb-2">
                  <Activity size={28} className="text-cyan" />
                </div>
                <p className="font-bold text-sm text-text">Active Sessions</p>
                <p className="text-cyan font-bold text-lg">
                  {health?.stats?.active_admin_sessions || 0}
                </p>
              </Card>
              <Card className="text-center">
                <div className="flex justify-center mb-2">
                  {(health?.stats?.failed_transactions_today || 0) > 0
                    ? <AlertTriangle size={28} className="text-yellow" />
                    : <CheckCircle size={28} className="text-green" />}
                </div>
                <p className="font-bold text-sm text-text">Failed Txns Today</p>
                <p className={`font-bold text-lg ${
                  (health?.stats?.failed_transactions_today || 0) > 0 ? "text-yellow" : "text-green"
                }`}>
                  {health?.stats?.failed_transactions_today || 0}
                </p>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <h2 className="text-text font-bold mb-2">Platform Statistics</h2>
                <StatRow label="Total Users"
                  value={health?.stats?.total_users?.toLocaleString()} icon={Users} color="text-cyan" />
                <StatRow label="Total Transactions"
                  value={health?.stats?.total_transactions?.toLocaleString()} icon={Activity} color="text-green" />
                <StatRow label="DB Latency"
                  value={`${health?.db_latency_ms}ms`} icon={Database}
                  color={health?.db_latency_ms < 100 ? "text-green" : "text-yellow"} />
              </Card>
              <Card>
                <h2 className="text-text font-bold mb-2">Pending Actions</h2>
                <StatRow label="Pending KYC"
                  value={health?.stats?.pending_kyc} icon={AlertTriangle}
                  color={(health?.stats?.pending_kyc || 0) > 0 ? "text-yellow" : "text-green"} />
                <StatRow label="Pending Withdrawals"
                  value={health?.stats?.pending_withdrawals} icon={AlertTriangle}
                  color={(health?.stats?.pending_withdrawals || 0) > 0 ? "text-yellow" : "text-green"} />
                <StatRow label="Open Disputes"
                  value={health?.stats?.open_disputes} icon={AlertTriangle}
                  color={(health?.stats?.open_disputes || 0) > 0 ? "text-red" : "text-green"} />
                <StatRow label="Blacklisted Numbers"
                  value={health?.stats?.blacklisted_numbers} icon={XCircle}
                  color={(health?.stats?.blacklisted_numbers || 0) > 0 ? "text-red" : "text-green"} />
              </Card>
            </div>

            <Card>
              <h2 className="text-text font-bold mb-4">Service Endpoints</h2>
              <div className="space-y-2">
                {[
                  { name: "Backend API", url: "https://tag-n-ride-production.up.railway.app" },
                  { name: "Admin Panel", url: "https://tag-n-ride.vercel.app" },
                  { name: "Landing Page", url: "https://tag-n-ride-website.vercel.app" },
                ].map(s => (
                  <div key={s.name}
                    className="flex items-center justify-between p-3 bg-bg border border-border rounded-lg">
                    <div>
                      <p className="text-text font-semibold text-sm">{s.name}</p>
                      <p className="text-textMuted text-xs font-mono">{s.url}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green animate-pulse" />
                      <span className="text-green text-xs font-bold">Online</span>
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
