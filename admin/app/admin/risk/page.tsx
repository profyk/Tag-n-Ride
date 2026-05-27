"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Spinner, StatCard } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import { ShieldAlert, UserX, Eye } from "lucide-react";
import toast from "react-hot-toast";
import { api, RiskUser } from "@/lib/api";

const RISK_COLOR = (score: number) => score >= 75 ? "red" : score >= 50 ? "yellow" : "green";

const RiskBar = ({ score }: { score: number }) => (
  <div className="flex items-center gap-2">
    <div className="w-20 h-2 rounded-full bg-bg3">
      <div
        className={`h-2 rounded-full ${score >= 75 ? "bg-red" : score >= 50 ? "bg-yellow" : "bg-green"}`}
        style={{ width: `${score}%` }}
      />
    </div>
    <span className={`text-xs font-bold text-${RISK_COLOR(score)}`}>{score}</span>
  </div>
);

export default function RiskPage() {
  const [users, setUsers] = useState<RiskUser[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.riskUsers().then((r) => setUsers(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const flagUser = async (u: RiskUser) => {
    try {
      await api.flagUser(u.user_id, "Flagged via risk dashboard");
      toast.success(`${u.full_name} flagged for review`);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const highRisk = users.filter((u) => u.risk_score >= 75).length;
  const medRisk = users.filter((u) => u.risk_score >= 50 && u.risk_score < 75).length;
  const avgScore = users.length > 0 ? Math.round(users.reduce((s, u) => s + u.risk_score, 0) / users.length) : 0;
  const frozen = users.filter((u) => u.is_frozen).length;

  return (
    <AdminShell title="Risk & Fraud Management">
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="High-Risk Users" value={String(highRisk)} />
          <StatCard label="Medium-Risk" value={String(medRisk)} />
          <StatCard label="Avg Risk Score" value={String(avgScore)} />
          <StatCard label="Frozen Wallets" value={String(frozen)} />
        </div>

        <Card>
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert size={16} className="text-red" />
            <h2 className="text-text font-bold">Risk Flagged Accounts</h2>
          </div>

          {loading ? <Spinner /> : (
            <Table
              headers={["User", "Risk Score", "Flags", "24h Txns", "24h Volume", "Wallet", "Date", "Actions"]}
              empty={!users.length}
            >
              {users.map((u) => (
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
                  <Td className={`font-bold ${u.txns_24h > 20 ? "text-red" : "text-textMuted"}`}>{u.txns_24h}</Td>
                  <Td className={`font-bold ${u.volume_24h > 5000 ? "text-red" : "text-textMuted"}`}>{formatZAR(u.volume_24h)}</Td>
                  <Td className="font-semibold">{formatZAR(u.balance)}</Td>
                  <Td className="text-textMuted text-xs">{formatDate(u.created_at)}</Td>
                  <Td>
                    <div className="flex gap-2">
                      {!u.flagged && (
                        <Button variant="secondary" onClick={() => flagUser(u)}>
                          <UserX size={12} /> Flag
                        </Button>
                      )}
                      <Link href={`/admin/users/${u.user_id}`}>
                        <Button variant="ghost"><Eye size={13} /></Button>
                      </Link>
                    </div>
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}
