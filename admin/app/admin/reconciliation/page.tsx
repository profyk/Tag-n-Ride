"use client";
import { useEffect, useState, useCallback } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Card, Button, Spinner, Modal, Input } from "@/components/ui";
import { formatZAR, formatDate } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import {
  RefreshCw, AlertCircle, CheckCircle2, Play, ArrowRight,
  TrendingUp, TrendingDown, Clock, DollarSign, Activity,
  ShieldCheck, AlertTriangle, Layers,
} from "lucide-react";
import toast from "react-hot-toast";
import { api, ReconBatch, ReconDiscrepancy } from "@/lib/api";

const TT = {
  contentStyle: { background: "#0D0D16", border: "1px solid #1A1A2E", borderRadius: 8, color: "#F0F0FF", fontSize: 12 },
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    balanced:    "bg-green/10 border-green/20 text-green",
    discrepancy: "bg-yellow/10 border-yellow/20 text-yellow",
    error:       "bg-red/10 border-red/20 text-red",
  };
  const icons: Record<string, any> = {
    balanced:    CheckCircle2,
    discrepancy: AlertTriangle,
    error:       AlertCircle,
  };
  const cls = map[status] || "bg-bg3 border-border text-textMuted";
  const Icon = icons[status] || Activity;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-black capitalize ${cls}`}>
      <Icon size={9} /> {status}
    </span>
  );
}

function FlowPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col items-center gap-1 min-w-[110px]">
      <p className={`text-[10px] font-bold uppercase tracking-widest ${color}`}>{label}</p>
      <p className={`text-lg font-black tabular-nums ${color}`}>{formatZAR(value)}</p>
    </div>
  );
}

export default function ReconciliationPage() {
  const [batches, setBatches]             = useState<ReconBatch[]>([]);
  const [discrepancies, setDiscrepancies] = useState<ReconDiscrepancy[]>([]);
  const [loading, setLoading]             = useState(true);
  const [running, setRunning]             = useState(false);
  const [resolveModal, setResolveModal]   = useState(false);
  const [selected, setSelected]           = useState<ReconDiscrepancy | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [historyTab, setHistoryTab]       = useState<"table" | "chart">("chart");

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.reconBatches(),
      api.reconDiscrepancies(undefined, false),
    ])
      .then(([b, d]) => {
        setBatches(b.data);
        setDiscrepancies(d.data);
      })
      .catch(() => toast.error("Failed to load reconciliation data"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const runRecon = async () => {
    setRunning(true);
    try {
      const res = await api.runReconciliation();
      const r = res.data;
      toast.success(
        r.status === "balanced"
          ? "Reconciliation balanced — no discrepancies"
          : `${r.discrepancy_count} discrepanc${r.discrepancy_count !== 1 ? "ies" : "y"} found (variance: ${formatZAR(r.variance)})`
      );
      load();
    } catch (e: any) { toast.error(e.message || "Reconciliation failed"); }
    finally { setRunning(false); }
  };

  const resolveDiscrepancy = async () => {
    if (!resolutionNote.trim()) { toast.error("Resolution note required"); return; }
    try {
      await api.resolveDiscrepancy(selected!.id, resolutionNote);
      toast.success("Discrepancy resolved");
      setResolveModal(false); setResolutionNote("");
      load();
    } catch (e: any) { toast.error(e.message || "Failed to resolve"); }
  };

  const latest              = batches[0];
  const totalDiscrepancy    = discrepancies.reduce((s, d) => s + d.amount, 0);
  const balanced            = batches.filter(b => b.status === "balanced").length;
  const discrepancyCount    = batches.filter(b => b.status === "discrepancy").length;
  const healthPct           = batches.length > 0 ? Math.round((balanced / batches.length) * 100) : 100;

  const chartData = batches.slice(0, 10).reverse().map((b, i) => ({
    name: `#${batches.length - i}`,
    variance: Math.abs(b.variance),
    status: b.status,
  }));

  if (loading && !batches.length) return (
    <AdminShell title="Reconciliation" subtitle="Automated financial balance audit">
      <Spinner />
    </AdminShell>
  );

  return (
    <AdminShell title="Reconciliation" subtitle="Automated financial balance audit">
      <div className="space-y-5">

        {/* ── Stats strip ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {
              label: "System Health",
              value: `${healthPct}%`,
              sub: `${balanced}/${batches.length} runs balanced`,
              color: healthPct === 100 ? "text-green" : healthPct >= 80 ? "text-yellow" : "text-red",
              icon: ShieldCheck,
            },
            {
              label: "Open Issues",
              value: String(discrepancies.length),
              sub: discrepancies.length === 0 ? "All clear" : `${formatZAR(totalDiscrepancy)} variance`,
              color: discrepancies.length > 0 ? "text-red" : "text-green",
              icon: AlertCircle,
            },
            {
              label: "Last Status",
              value: latest?.status || "Never run",
              sub: latest ? formatDate(latest.created_at) : "—",
              color: latest?.status === "balanced" ? "text-green" : latest?.status === "discrepancy" ? "text-yellow" : "text-textMuted",
              icon: Activity,
            },
            {
              label: "Total Runs",
              value: batches.length.toString(),
              sub: `${discrepancyCount} with discrepancy`,
              color: "text-cyan",
              icon: Layers,
            },
          ].map(s => (
            <div key={s.label} className="bg-bg2 border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] font-bold text-textDim uppercase tracking-wider">{s.label}</p>
                <s.icon size={12} className={s.color} />
              </div>
              <p className={`text-2xl font-black tabular-nums ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-textDim mt-1">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Alert banner ── */}
        {discrepancies.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-red/5 border border-red/20 rounded-xl">
            <div className="flex items-center gap-2">
              <AlertCircle size={14} className="text-red" />
              <p className="text-red text-xs font-bold">
                {discrepancies.length} open discrepanc{discrepancies.length !== 1 ? "ies" : "y"} — total variance {formatZAR(totalDiscrepancy)}. Resolve before next run.
              </p>
            </div>
            <a href="#discrepancies" className="text-[10px] text-red border border-red/30 rounded-lg px-3 py-1.5 hover:bg-red/10 font-bold transition-all whitespace-nowrap">
              View Issues
            </a>
          </div>
        )}

        {/* ── Latest batch: financial pipeline ── */}
        {latest && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest">Latest Run</p>
                <StatusBadge status={latest.status} />
              </div>
              <div className="flex items-center gap-2 text-[10px] text-textDim">
                <Clock size={10} />
                {formatDate(latest.created_at)} · {latest.run_by_name || "System"}
              </div>
            </div>

            {/* Money flow visualization */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              <FlowPill label="Top-ups"     value={latest.total_topups}      color="text-green" />
              <ArrowRight size={14} className="text-textDim flex-shrink-0" />
              <FlowPill label="Payments"    value={latest.total_payments}    color="text-cyan" />
              <ArrowRight size={14} className="text-textDim flex-shrink-0" />
              <FlowPill label="Withdrawals" value={latest.total_withdrawals} color="text-purple" />
              <ArrowRight size={14} className="text-textDim flex-shrink-0" />
              <FlowPill label="Fees"        value={latest.total_fees}        color="text-yellow" />
              <ArrowRight size={14} className="text-textDim flex-shrink-0" />
              <FlowPill label="Wallets"     value={latest.total_wallets}     color="text-orange-400" />
              <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                <div className="w-px h-12 bg-border" />
                <div className="flex flex-col items-center gap-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-textDim">Variance</p>
                  <p className={`text-xl font-black tabular-nums ${Math.abs(latest.variance) > 0.01 ? "text-red" : "text-green"}`}>
                    {formatZAR(latest.variance)}
                  </p>
                  {Math.abs(latest.variance) <= 0.01 && (
                    <span className="text-[9px] text-green font-black uppercase flex items-center gap-1">
                      <CheckCircle2 size={9} /> Balanced
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Health bar */}
            <div className="mt-4">
              <div className="h-1.5 bg-bg3 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    Math.abs(latest.variance) <= 0.01 ? "bg-green" :
                    Math.abs(latest.variance) < 100   ? "bg-yellow" : "bg-red"
                  }`}
                  style={{ width: Math.abs(latest.variance) <= 0.01 ? "100%" : "60%" }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[9px] text-textDim">Period: {formatDate(latest.period_start)} → {formatDate(latest.period_end)}</span>
                <span className={`text-[9px] font-bold ${Math.abs(latest.variance) <= 0.01 ? "text-green" : "text-red"}`}>
                  {Math.abs(latest.variance) <= 0.01 ? "Fully balanced" : "Imbalance detected"}
                </span>
              </div>
            </div>
          </Card>
        )}

        {/* ── Run button ── */}
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <button onClick={() => setHistoryTab("chart")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                historyTab === "chart" ? "bg-cyanDim border-cyan/20 text-cyan" : "bg-bg2 border-border text-textMuted"
              }`}>
              Chart
            </button>
            <button onClick={() => setHistoryTab("table")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                historyTab === "table" ? "bg-cyanDim border-cyan/20 text-cyan" : "bg-bg2 border-border text-textMuted"
              }`}>
              History
            </button>
          </div>
          <Button onClick={runRecon} disabled={running} loading={running}>
            {!running && <Play size={13} />}
            {running ? "Running…" : "Run Reconciliation"}
          </Button>
        </div>

        {/* ── Run history ── */}
        {historyTab === "chart" ? (
          <Card>
            <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest mb-4 flex items-center gap-1.5">
              <TrendingUp size={11} /> Variance History (last 10 runs)
            </p>
            {chartData.length === 0 ? (
              <div className="py-10 text-center text-textDim text-sm">No runs yet — click "Run Reconciliation" to start</div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData}>
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: "#6b7280" }} axisLine={false} tickLine={false}
                    tickFormatter={v => `R${v.toFixed(0)}`} />
                  <Tooltip {...TT} formatter={(v: number) => [formatZAR(v), "Variance"]} />
                  <Bar dataKey="variance" radius={[4, 4, 0, 0]}>
                    {chartData.map((d, i) => (
                      <Cell key={i} fill={d.status === "balanced" ? "#22c55e" : d.status === "discrepancy" ? "#fbbf24" : "#ef4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            <div className="flex items-center gap-4 mt-2 justify-end">
              {[["Balanced", "#22c55e"], ["Discrepancy", "#fbbf24"], ["Error", "#ef4444"]].map(([l, c]) => (
                <div key={l} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-sm" style={{ background: c }} />
                  <span className="text-[10px] text-textDim">{l}</span>
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-bg3">
                    {["Period", "Status", "Topups", "Payments", "Withdrawals", "Fees", "Variance", "Issues", "Run By", "Date"].map(h => (
                      <th key={h} className="text-left py-3 px-4 text-[10px] font-bold text-textDim uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {batches.length === 0 ? (
                    <tr><td colSpan={10} className="py-12 text-center text-textMuted">No reconciliation runs yet</td></tr>
                  ) : batches.map((b) => (
                    <tr key={b.id} className="border-b border-border hover:bg-bg3/50 transition-colors">
                      <td className="py-3 px-4 text-textDim text-[10px] font-mono whitespace-nowrap">
                        {formatDate(b.period_start).split(",")[0]} → {formatDate(b.period_end).split(",")[0]}
                      </td>
                      <td className="py-3 px-4"><StatusBadge status={b.status} /></td>
                      <td className="py-3 px-4 font-bold text-green tabular-nums">{formatZAR(b.total_topups)}</td>
                      <td className="py-3 px-4 text-textMuted tabular-nums">{formatZAR(b.total_payments)}</td>
                      <td className="py-3 px-4 text-textMuted tabular-nums">{formatZAR(b.total_withdrawals)}</td>
                      <td className="py-3 px-4 text-yellow tabular-nums">{formatZAR(b.total_fees)}</td>
                      <td className={`py-3 px-4 font-black tabular-nums ${Math.abs(b.variance) > 0.01 ? "text-red" : "text-green"}`}>
                        {formatZAR(b.variance)}
                      </td>
                      <td className={`py-3 px-4 font-bold ${b.discrepancy_count > 0 ? "text-red" : "text-green"}`}>
                        {b.discrepancy_count}
                      </td>
                      <td className="py-3 px-4 text-textDim">{b.run_by_name || "System"}</td>
                      <td className="py-3 px-4 text-textDim whitespace-nowrap">{formatDate(b.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Open discrepancies ── */}
        {discrepancies.length > 0 && (
          <div id="discrepancies" className="space-y-3">
            <div className="flex items-center gap-2">
              <AlertCircle size={14} className="text-red" />
              <h2 className="text-text font-bold text-sm">Open Discrepancies</h2>
              <span className="text-xs text-textDim">({discrepancies.length} requiring resolution)</span>
            </div>
            {discrepancies.map((d) => (
              <div key={d.id} className="bg-bg2 border border-red/20 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-red/20 bg-red/10 text-red text-[10px] font-black">
                        {d.type}
                      </span>
                      <span className="text-[10px] text-textDim">{formatDate(d.created_at)}</span>
                    </div>
                    <p className="text-textMuted text-sm mb-2">{d.description}</p>
                    <div className="flex items-center gap-4 text-[11px]">
                      <div>
                        <span className="text-textDim">Expected: </span>
                        <span className="text-text font-bold tabular-nums">{formatZAR(d.expected)}</span>
                      </div>
                      <div>
                        <span className="text-textDim">Actual: </span>
                        <span className="text-text font-bold tabular-nums">{formatZAR(d.actual)}</span>
                      </div>
                      <div>
                        <span className="text-textDim">Variance: </span>
                        <span className="text-red font-black tabular-nums">{formatZAR(d.amount)}</span>
                      </div>
                    </div>
                  </div>
                  <Button variant="secondary" onClick={() => { setSelected(d); setResolutionNote(""); setResolveModal(true); }}>
                    <CheckCircle2 size={13} /> Resolve
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {discrepancies.length === 0 && !loading && (
          <div className="flex flex-col items-center gap-3 py-10 border border-green/20 bg-green/5 rounded-xl">
            <ShieldCheck size={28} className="text-green" />
            <p className="text-green font-bold">No open discrepancies</p>
            <p className="text-textDim text-sm">All reconciliation batches are resolved</p>
          </div>
        )}
      </div>

      <Modal open={resolveModal} onClose={() => setResolveModal(false)} title="Resolve Discrepancy">
        <div className="space-y-4">
          {selected && (
            <div className="bg-bg border border-border rounded-lg p-3">
              <p className="text-textDim text-[10px] uppercase font-bold tracking-widest mb-1">Issue</p>
              <p className="text-text text-sm">{selected.description}</p>
              <p className="text-red font-black mt-2 tabular-nums">{formatZAR(selected.amount)} variance</p>
            </div>
          )}
          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1.5">
              Resolution Note <span className="text-red">*</span>
            </label>
            <textarea
              value={resolutionNote}
              onChange={e => setResolutionNote(e.target.value)}
              placeholder="Describe how this discrepancy was investigated and resolved…"
              rows={3}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-text text-sm placeholder:text-textDim focus:outline-none focus:border-cyan resize-none"
            />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setResolveModal(false)}>Cancel</Button>
            <Button onClick={resolveDiscrepancy} disabled={!resolutionNote.trim()}>
              <CheckCircle2 size={13} /> Mark Resolved
            </Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
