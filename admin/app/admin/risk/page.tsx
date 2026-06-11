"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Spinner, StatCard, Modal } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import { ShieldAlert, UserX, Eye, Snowflake, RefreshCw, AlertTriangle, Zap, Download, Info } from "lucide-react";
import toast from "react-hot-toast";
import { api, RiskUser } from "@/lib/api";
import { DangerPinModal, useDangerPin } from "@/components/DangerPinModal";

const RISK_COLOR = (score: number) => score >= 75 ? "red" : score >= 50 ? "yellow" : "green";

const RiskBar = ({ score }: { score: number }) => (
  <div className="flex items-center gap-2">
    <div className="w-24 h-2 rounded-full bg-bg3 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${score >= 75 ? "bg-red" : score >= 50 ? "bg-yellow" : "bg-green"}`}
        style={{ width: `${score}%` }}
      />
    </div>
    <span className={`text-xs font-extrabold text-${RISK_COLOR(score)}`}>{score}</span>
  </div>
);

export default function RiskPage() {
  const [users, setUsers] = useState<RiskUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [freezing, setFreezing] = useState<string | null>(null);
  const [flagging, setFlagging] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkActing, setBulkActing] = useState(false);
  const [scoreFilter, setScoreFilter] = useState<"all" | "high" | "medium">("all");
  const { open: pinOpen, request: requestPin, handleSuccess: pinSuccess, handleCancel: pinCancel } = useDangerPin();
  const [bulkFreezeConfirm, setBulkFreezeConfirm] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.riskUsers().then((r) => setUsers(r.data)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 120_000); // auto-refresh every 2 min
    return () => clearInterval(timer);
  }, [load]);

  const filteredUsers = users.filter(u => {
    if (scoreFilter === "high") return u.risk_score >= 75;
    if (scoreFilter === "medium") return u.risk_score >= 50 && u.risk_score < 75;
    return true;
  });

  const handleFlag = async (u: RiskUser) => {
    setFlagging(u.user_id);
    try {
      await api.flagUser(u.user_id, "Flagged via risk dashboard");
      toast.success(`${u.full_name} flagged`);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setFlagging(null); }
  };

  const handleFreeze = async (u: RiskUser) => {
    const token = await requestPin();
    if (!token) return;
    setFreezing(u.user_id);
    try {
      if (u.is_frozen) {
        await api.unfreezeWallet(u.user_id);
        toast.success(`Wallet unfrozen for ${u.full_name}`);
      } else {
        await api.freezeWallet(u.user_id, `Risk score ${u.risk_score} — auto-flagged`);
        toast.success(`Wallet frozen for ${u.full_name}`);
      }
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setFreezing(null); }
  };

  const handleBulkFreezeHigh = () => {
    const highRisk = filteredUsers.filter(u => u.risk_score >= 75 && !u.is_frozen);
    if (!highRisk.length) { toast.error("No unfrozen high-risk users"); return; }
    setBulkFreezeConfirm(true);
  };
  const doBulkFreezeHigh = async () => {
    const highRisk = filteredUsers.filter(u => u.risk_score >= 75 && !u.is_frozen);
    setBulkFreezeConfirm(false);
    const token = await requestPin();
    if (!token) return;
    setBulkActing(true);
    let done = 0;
    for (const u of highRisk) {
      try {
        await api.freezeWallet(u.user_id, `Bulk freeze — risk score ${u.risk_score}`);
        done++;
      } catch {}
    }
    setBulkActing(false);
    toast.success(`${done}/${highRisk.length} wallets frozen`);
    load();
  };

  const highRisk = users.filter((u) => u.risk_score >= 75).length;
  const medRisk = users.filter((u) => u.risk_score >= 50 && u.risk_score < 75).length;
  const avgScore = users.length > 0 ? Math.round(users.reduce((s, u) => s + u.risk_score, 0) / users.length) : 0;
  const frozenCount = users.filter((u) => u.is_frozen).length;
  const highUnfrozen = users.filter(u => u.risk_score >= 75 && !u.is_frozen).length;

  return (
    <AdminShell title="Risk & Fraud Management">
      <DangerPinModal open={pinOpen} onSuccess={pinSuccess} onCancel={pinCancel} actionLabel="wallet freeze/unfreeze" />
      <div className="space-y-6">

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="High-Risk (≥75)" value={String(highRisk)} tone={highRisk > 0 ? "red" : "green"} />
          <StatCard label="Medium-Risk (50–74)" value={String(medRisk)} tone={medRisk > 0 ? "yellow" : "green"} />
          <StatCard label="Avg Risk Score" value={String(avgScore)} tone={avgScore >= 50 ? "yellow" : "green"} />
          <StatCard label="Frozen Wallets" value={String(frozenCount)} tone={frozenCount > 0 ? "purple" : undefined} />
        </div>

        {highUnfrozen > 0 && (
          <div className="flex items-center justify-between p-4 bg-red/5 border border-red/20 rounded-xl">
            <div className="flex items-center gap-3">
              <AlertTriangle size={16} className="text-red flex-shrink-0" />
              <p className="text-red text-sm font-semibold">
                {highUnfrozen} high-risk user{highUnfrozen > 1 ? "s" : ""} with unfrozen wallet{highUnfrozen > 1 ? "s" : ""}
              </p>
            </div>
            <Button variant="danger" loading={bulkActing} onClick={handleBulkFreezeHigh}>
              <Snowflake size={13} /> Bulk Freeze High-Risk
            </Button>
          </div>
        )}

        <Card>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <ShieldAlert size={16} className="text-red" />
              <h2 className="text-text font-bold">Risk Flagged Accounts</h2>
              <span className="text-textDim text-xs">Auto-refreshes every 2 min</span>
            </div>
            <div className="flex gap-2">
              {([
                { key: "all", label: "All" },
                { key: "high", label: `High (${highRisk})` },
                { key: "medium", label: `Medium (${medRisk})` },
              ] as const).map(f => (
                <button key={f.key} onClick={() => setScoreFilter(f.key)}
                  className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                    scoreFilter === f.key ? "bg-cyanDim text-cyan border-cyan/20" : "bg-bg2 text-textMuted border-border hover:text-text"
                  }`}>
                  {f.label}
                </button>
              ))}
              <Button variant="secondary" onClick={load} disabled={loading}>
                <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              </Button>
              <Button variant="secondary" onClick={() => {
                const rows = [
                  ["Name", "Phone", "Role", "Risk Score", "24h Txns", "24h Volume", "Failed Txns", "Disputes", "Frozen", "Flagged", "Joined"],
                  ...filteredUsers.map(u => [
                    u.full_name, u.phone_number, u.role, u.risk_score,
                    u.txns_24h, formatZAR(u.volume_24h), u.failed_txns, u.dispute_count,
                    u.is_frozen ? "Yes" : "No", u.flagged ? "Yes" : "No", u.created_at?.slice(0, 10),
                  ]),
                ];
                const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
                const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
                a.download = `risk-report-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
              }}>
                <Download size={13} /> Export
              </Button>
            </div>
          </div>

          {/* Score explanation */}
          <div className="mb-4 p-3 bg-bg border border-border rounded-lg flex items-start gap-2">
            <Info size={12} className="text-cyan flex-shrink-0 mt-0.5" />
            <p className="text-textDim text-[10px] leading-relaxed">
              Risk score (0–100) is computed from: high-frequency transactions, failed payment attempts, open disputes, high 24h volume, flagged status, and account age.
              {" "}<span className="text-red font-bold">≥75 = High risk</span>, <span className="text-yellow font-bold">50–74 = Medium</span>, <span className="text-green font-bold">&lt;50 = Normal</span>.
            </p>
          </div>

          {loading ? <Spinner /> : (
            <Table
              headers={["User", "Risk Score", "Signals", "24h Txns", "24h Volume", "Wallet", "Date", "Actions"]}
              empty={!filteredUsers.length}
            >
              {filteredUsers.map((u) => (
                <Tr key={u.user_id}>
                  <Td>
                    <p className="font-semibold">{u.full_name}</p>
                    <p className="text-[10px] text-textMuted font-mono">{u.phone_number}</p>
                  </Td>
                  <Td><RiskBar score={u.risk_score} /></Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {u.flagged && <Badge label="flagged" tone="red" />}
                      {u.is_frozen && <Badge label="frozen" tone="purple" />}
                      {u.dispute_count > 0 && <Badge label={`${u.dispute_count} dispute${u.dispute_count > 1 ? "s" : ""}`} tone="yellow" />}
                      {u.failed_txns > 3 && <Badge label={`${u.failed_txns} failed`} tone="red" />}
                    </div>
                  </Td>
                  <Td className={`font-bold ${u.txns_24h > 20 ? "text-red" : "text-textMuted"}`}>
                    {u.txns_24h}
                    {u.txns_24h > 20 && <span className="block text-[9px] text-red">HIGH</span>}
                  </Td>
                  <Td className={`font-bold ${u.volume_24h > 5000 ? "text-red" : "text-textMuted"}`}>
                    {formatZAR(u.volume_24h)}
                  </Td>
                  <Td className="font-semibold">{formatZAR(u.balance)}</Td>
                  <Td className="text-textMuted text-xs">{formatDate(u.created_at)}</Td>
                  <Td>
                    <div className="flex gap-1.5 flex-wrap">
                      {!u.flagged && (
                        <Button variant="secondary" loading={flagging === u.user_id} onClick={() => handleFlag(u)}>
                          <UserX size={12} /> Flag
                        </Button>
                      )}
                      <Button
                        variant={u.is_frozen ? "secondary" : "danger"}
                        loading={freezing === u.user_id}
                        onClick={() => handleFreeze(u)}
                        title={u.is_frozen ? "Unfreeze wallet" : "Freeze wallet"}>
                        <Snowflake size={12} />
                        {u.is_frozen ? "Unfreeze" : "Freeze"}
                      </Button>
                      <Link href={`/admin/support?q=${u.phone_number}`}>
                        <Button variant="ghost" title="Open in support"><Eye size={13} /></Button>
                      </Link>
                    </div>
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      {/* Bulk Freeze Confirmation Modal */}
      <Modal open={bulkFreezeConfirm} onClose={() => setBulkFreezeConfirm(false)} title="Bulk Freeze High-Risk Wallets">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red/5 border border-red/20 rounded-xl">
            <AlertTriangle size={15} className="text-red flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red text-sm font-semibold">Freeze {filteredUsers.filter(u => u.risk_score >= 75 && !u.is_frozen).length} high-risk wallets (score ≥75)?</p>
              <p className="text-textMuted text-xs mt-1">PIN confirmation required. Frozen users cannot make transactions until manually unfrozen.</p>
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setBulkFreezeConfirm(false)}>Cancel</Button>
            <Button variant="danger" onClick={doBulkFreezeHigh} loading={bulkActing}><Snowflake size={12} /> Freeze Wallets</Button>
          </div>
        </div>
      </Modal>

    </AdminShell>
  );
}
