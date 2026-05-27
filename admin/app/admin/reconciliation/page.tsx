"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Table, Tr, Td, Badge, Button, Spinner, StatCard, Modal, Input } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import { RefreshCw, AlertCircle, CheckCircle2, Play } from "lucide-react";
import toast from "react-hot-toast";
import { api, ReconBatch, ReconDiscrepancy } from "@/lib/api";

const BATCH_TONE: Record<string, "green" | "yellow" | "red"> = {
  balanced: "green", discrepancy: "yellow", error: "red",
};

export default function ReconciliationPage() {
  const [batches, setBatches] = useState<ReconBatch[]>([]);
  const [discrepancies, setDiscrepancies] = useState<ReconDiscrepancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [resolveModal, setResolveModal] = useState(false);
  const [selected, setSelected] = useState<ReconDiscrepancy | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([
      api.reconBatches(),
      api.reconDiscrepancies(undefined, false),
    ])
      .then(([b, d]) => {
        setBatches(b.data);
        setDiscrepancies(d.data);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const runRecon = async () => {
    setRunning(true);
    try {
      const res = await api.runReconciliation();
      const r = res.data;
      toast.success(
        r.status === "balanced"
          ? `Reconciliation balanced — no discrepancies found`
          : `Reconciliation complete — ${r.discrepancy_count} discrepancy${r.discrepancy_count !== 1 ? "s" : ""} found (Variance: ${formatZAR(r.variance)})`
      );
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setRunning(false); }
  };

  const resolveDiscrepancy = async () => {
    if (!resolutionNote.trim()) { toast.error("Resolution note required"); return; }
    try {
      await api.resolveDiscrepancy(selected!.id, resolutionNote);
      toast.success("Discrepancy resolved");
      setResolveModal(false);
      setResolutionNote("");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const latest = batches[0];
  const totalDiscrepancy = discrepancies.reduce((s, d) => s + d.amount, 0);

  return (
    <AdminShell title="Reconciliation">
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Last Status" value={latest?.status || "Never run"} />
          <StatCard label="Open Discrepancies" value={String(discrepancies.length)} />
          <StatCard label="Discrepancy Value" value={formatZAR(totalDiscrepancy)} />
          <StatCard label="Last Run" value={latest ? formatDate(latest.created_at) : "Never"} />
        </div>

        {latest && (
          <Card>
            <h2 className="text-text font-bold mb-4">Latest Reconciliation</h2>
            <div className="grid md:grid-cols-6 gap-4">
              {[
                { label: "Total Top-ups", value: formatZAR(latest.total_topups) },
                { label: "Total Payments", value: formatZAR(latest.total_payments) },
                { label: "Platform Fees", value: formatZAR(latest.total_fees) },
                { label: "Total Withdrawals", value: formatZAR(latest.total_withdrawals) },
                { label: "Wallet Balances", value: formatZAR(latest.total_wallets) },
                { label: "Variance", value: formatZAR(latest.variance), highlight: Math.abs(latest.variance) > 0.01 },
              ].map(({ label, value, highlight }) => (
                <div key={label} className="bg-bg3 rounded-lg p-3">
                  <p className="text-[10px] text-textMuted uppercase font-bold tracking-widest mb-1">{label}</p>
                  <p className={`font-bold ${highlight ? "text-red" : "text-text"}`}>{value}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div className="flex justify-between items-center">
          <h2 className="text-text font-bold">Reconciliation Runs</h2>
          <Button onClick={runRecon} disabled={running}>
            {running ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} />}
            {running ? "Running..." : "Run Reconciliation"}
          </Button>
        </div>

        {loading ? <Spinner /> : (
          <Card>
            <Table
              headers={["Period", "Status", "Topups", "Payments", "Withdrawals", "Variance", "Discrepancies", "Run By", "Date"]}
              empty={!batches.length}
            >
              {batches.map((b) => (
                <Tr key={b.id}>
                  <Td className="text-textMuted text-xs">
                    {formatDate(b.period_start)} → {formatDate(b.period_end)}
                  </Td>
                  <Td><Badge label={b.status} tone={BATCH_TONE[b.status] || "muted"} /></Td>
                  <Td className="font-semibold text-green">{formatZAR(b.total_topups)}</Td>
                  <Td className="text-textMuted">{formatZAR(b.total_payments)}</Td>
                  <Td className="text-textMuted">{formatZAR(b.total_withdrawals)}</Td>
                  <Td className={`font-bold ${Math.abs(b.variance) > 0.01 ? "text-red" : "text-green"}`}>
                    {formatZAR(b.variance)}
                  </Td>
                  <Td>
                    <span className={`font-bold ${b.discrepancy_count > 0 ? "text-red" : "text-green"}`}>
                      {b.discrepancy_count}
                    </span>
                  </Td>
                  <Td className="text-textMuted text-xs">{b.run_by_name || "System"}</Td>
                  <Td className="text-textMuted text-xs">{formatDate(b.created_at)}</Td>
                </Tr>
              ))}
            </Table>
          </Card>
        )}

        {discrepancies.length > 0 && (
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle size={16} className="text-red" />
              <h2 className="text-text font-bold">Open Discrepancies</h2>
            </div>
            <Table
              headers={["Type", "Description", "Amount", "Expected", "Actual", "Date", "Actions"]}
              empty={false}
            >
              {discrepancies.map((d) => (
                <Tr key={d.id}>
                  <Td><Badge label={d.type} tone="red" /></Td>
                  <Td className="text-textMuted text-xs max-w-[200px]">{d.description}</Td>
                  <Td className="font-bold text-red">{formatZAR(d.amount)}</Td>
                  <Td className="text-textMuted text-xs">{formatZAR(d.expected)}</Td>
                  <Td className="text-textMuted text-xs">{formatZAR(d.actual)}</Td>
                  <Td className="text-textMuted text-xs">{formatDate(d.created_at)}</Td>
                  <Td>
                    <Button variant="secondary" onClick={() => { setSelected(d); setResolutionNote(""); setResolveModal(true); }}>
                      <CheckCircle2 size={12} /> Resolve
                    </Button>
                  </Td>
                </Tr>
              ))}
            </Table>
          </Card>
        )}
      </div>

      <Modal open={resolveModal} onClose={() => setResolveModal(false)} title="Resolve Discrepancy">
        <div className="space-y-4">
          <p className="text-sm text-textMuted">{selected?.description}</p>
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">Resolution Note *</label>
            <Input placeholder="Describe the resolution..." value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setResolveModal(false)}>Cancel</Button>
            <Button onClick={resolveDiscrepancy}><CheckCircle2 size={13} /> Mark Resolved</Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
