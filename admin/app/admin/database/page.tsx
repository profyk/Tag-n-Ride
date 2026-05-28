"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Spinner, Badge } from "@/components/ui";
import {
  Database, Table2, Play, Download, RefreshCw, Search,
  ChevronLeft, ChevronRight, Terminal, X, Copy, History,
  AlertCircle, CheckCircle, Clock, Layers,
} from "lucide-react";
import toast from "react-hot-toast";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

type TableInfo = { name: string; rows: number; size?: string; type?: string };
type QueryResult = { columns: string[]; rows: any[][]; count: number; duration_ms?: number; error?: string };

const DEFAULT_QUERY = "SELECT * FROM users LIMIT 10;";

const TABLE_COLORS: Record<string, string> = {
  users: "text-cyan", wallets: "text-green", transactions: "text-purple",
  notifications: "text-yellow", kyc_documents: "text-orange-400",
  drivers: "text-cyan", withdrawals: "text-red", promotions: "text-pink-400",
};

function fmt(v: any): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  return s.length > 80 ? s.slice(0, 77) + "…" : s;
}

function isNullish(v: any) { return v === null || v === undefined || v === "NULL"; }

function CellVal({ v }: { v: any }) {
  const raw = v === null || v === undefined ? "NULL" : v;
  const isNull = isNullish(v);
  const isBool = typeof raw === "boolean";
  const isNum = typeof raw === "number";
  const isDate = typeof raw === "string" && /^\d{4}-\d{2}-\d{2}/.test(raw);
  const isId = typeof raw === "string" && (raw.length === 36 || raw.length >= 20);

  return (
    <span className={
      isNull ? "text-textDim italic" :
      isBool ? (raw ? "text-green font-bold" : "text-red font-bold") :
      isNum ? "text-cyan font-mono" :
      isDate ? "text-yellow" :
      isId ? "text-purple font-mono text-[10px]" :
      "text-text"
    }>
      {fmt(raw)}
    </span>
  );
}

export default function DatabasePage() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<QueryResult | null>(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [tableSearch, setTableSearch] = useState("");

  const [sqlMode, setSqlMode] = useState(false);
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [queryRunning, setQueryRunning] = useState(false);
  const [queryHistory, setQueryHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [colSearch, setColSearch] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadTables = async () => {
    setTablesLoading(true);
    try {
      const res = await fetch(`${BASE}/api/admin/db/tables`, { headers: authHeaders() });
      const d = await res.json();
      setTables(Array.isArray(d) ? d : (d.tables ?? []));
    } catch {
      // Fallback — show placeholder with known table names
      setTables([
        { name: "users", rows: 0 }, { name: "wallets", rows: 0 },
        { name: "transactions", rows: 0 }, { name: "notifications", rows: 0 },
        { name: "kyc_documents", rows: 0 }, { name: "withdrawals", rows: 0 },
        { name: "promotions", rows: 0 }, { name: "referrals", rows: 0 },
        { name: "audit_logs", rows: 0 }, { name: "sessions", rows: 0 },
        { name: "feature_flags", rows: 0 }, { name: "price_rules", rows: 0 },
        { name: "broadcasts", rows: 0 }, { name: "feedback", rows: 0 },
        { name: "disputes", rows: 0 }, { name: "reconciliation_batches", rows: 0 },
      ]);
    } finally { setTablesLoading(false); }
  };

  const loadTableData = useCallback(async (tableName: string, pg: number = 1) => {
    setTableLoading(true);
    setTableData(null);
    try {
      const res = await fetch(
        `${BASE}/api/admin/db/table/${tableName}?page=${pg}&limit=${pageSize}`,
        { headers: authHeaders() }
      );
      const d = await res.json();
      setTableData(d);
    } catch (e: any) {
      setTableData({ columns: [], rows: [], count: 0, error: e.message || "Failed to load table data" });
    } finally { setTableLoading(false); }
  }, [pageSize]);

  const runQuery = async () => {
    if (!query.trim()) return;
    setQueryRunning(true);
    setQueryResult(null);
    const start = Date.now();
    try {
      const res = await fetch(`${BASE}/api/admin/db/query`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ sql: query.trim() }),
      });
      const d = await res.json();
      const duration_ms = Date.now() - start;
      if (!res.ok || d.error) {
        setQueryResult({ columns: [], rows: [], count: 0, error: d.error || d.detail || "Query failed", duration_ms });
      } else {
        setQueryResult({ ...d, duration_ms });
        setQueryHistory(prev => [query.trim(), ...prev.filter(q => q !== query.trim())].slice(0, 20));
      }
    } catch (e: any) {
      setQueryResult({ columns: [], rows: [], count: 0, error: e.message, duration_ms: Date.now() - start });
    } finally { setQueryRunning(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runQuery();
    }
  };

  const exportCSV = (result: QueryResult) => {
    const header = result.columns.join(",");
    const rows = result.rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([header + "\n" + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `${selectedTable || "query"}_${Date.now()}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success("CSV downloaded");
  };

  useEffect(() => { loadTables(); }, []);

  useEffect(() => {
    if (selectedTable) { setPage(1); loadTableData(selectedTable, 1); }
  }, [selectedTable, loadTableData]);

  const filteredTables = tables.filter(t =>
    t.name.toLowerCase().includes(tableSearch.toLowerCase())
  );

  const activeResult = sqlMode ? queryResult : tableData;
  const visibleCols = activeResult
    ? activeResult.columns.filter(c => !colSearch || c.toLowerCase().includes(colSearch.toLowerCase()))
    : [];
  const visibleColIndexes = activeResult
    ? activeResult.columns.map((c, i) => !colSearch || c.toLowerCase().includes(colSearch.toLowerCase()) ? i : -1).filter(i => i >= 0)
    : [];

  const totalPages = tableData ? Math.ceil(tableData.count / pageSize) : 1;

  return (
    <AdminShell title="Database Explorer">
      <div className="flex gap-0 -mx-6 -mt-2" style={{ height: "calc(100vh - 110px)" }}>

        {/* ── Left panel: table list ── */}
        <div className="w-56 flex-shrink-0 bg-bg border-r border-border flex flex-col">
          <div className="p-3 border-b border-border">
            <div className="flex items-center gap-2 mb-2">
              <Database size={14} className="text-cyan" />
              <span className="text-xs font-extrabold text-text uppercase tracking-widest">Tables</span>
              <button onClick={loadTables} className="ml-auto text-textDim hover:text-cyan transition-colors">
                <RefreshCw size={11} />
              </button>
            </div>
            <div className="relative">
              <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-textDim" />
              <input
                value={tableSearch}
                onChange={e => setTableSearch(e.target.value)}
                placeholder="Filter tables..."
                className="w-full bg-bg2 border border-border rounded-lg pl-6 pr-2 py-1.5 text-[11px] text-text placeholder:text-textDim focus:outline-none focus:border-cyan transition-colors"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {tablesLoading ? (
              <div className="flex justify-center pt-6"><Spinner /></div>
            ) : filteredTables.map(t => (
              <button
                key={t.name}
                onClick={() => { setSelectedTable(t.name); setSqlMode(false); setQuery(`SELECT * FROM ${t.name} LIMIT 50;`); }}
                className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-all hover:bg-bg2 ${selectedTable === t.name && !sqlMode ? "bg-cyanDim border-r-2 border-cyan" : ""}`}>
                <Table2 size={11} className={TABLE_COLORS[t.name] || "text-textMuted"} />
                <span className={`flex-1 truncate font-medium ${selectedTable === t.name && !sqlMode ? "text-cyan" : "text-textMuted"}`}>{t.name}</span>
                {t.rows > 0 && (
                  <span className="text-[9px] text-textDim font-mono">
                    {t.rows >= 1000 ? `${(t.rows / 1000).toFixed(1)}k` : t.rows}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="p-2 border-t border-border">
            <button
              onClick={() => { setSqlMode(true); setSelectedTable(null); }}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${sqlMode ? "bg-purple/10 text-purple border border-purple/20" : "text-textMuted hover:text-purple hover:bg-purple/5"}`}>
              <Terminal size={12} />
              SQL Editor
            </button>
          </div>
        </div>

        {/* ── Right panel ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Toolbar */}
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-bg2 flex-shrink-0">
            {sqlMode ? (
              <>
                <Terminal size={14} className="text-purple" />
                <span className="text-xs font-bold text-purple">SQL Editor</span>
                <span className="text-textDim text-xs">Ctrl+Enter to run</span>
              </>
            ) : selectedTable ? (
              <>
                <Table2 size={14} className={TABLE_COLORS[selectedTable] || "text-cyan"} />
                <span className={`text-xs font-bold ${TABLE_COLORS[selectedTable] || "text-cyan"}`}>{selectedTable}</span>
                {tableData && !tableData.error && (
                  <span className="text-textDim text-xs">{tableData.count.toLocaleString()} rows</span>
                )}
              </>
            ) : (
              <span className="text-xs text-textMuted">Select a table or open SQL Editor</span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {!sqlMode && selectedTable && (
                <>
                  <div className="relative">
                    <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-textDim" />
                    <input value={colSearch} onChange={e => setColSearch(e.target.value)}
                      placeholder="Filter columns..."
                      className="bg-bg border border-border rounded-lg pl-6 pr-2 py-1 text-[11px] text-text placeholder:text-textDim focus:outline-none focus:border-cyan w-36" />
                  </div>
                  <button onClick={() => loadTableData(selectedTable, page)}
                    className="p-1.5 rounded-lg border border-border text-textMuted hover:text-cyan hover:border-cyan/30 transition-all">
                    <RefreshCw size={12} />
                  </button>
                </>
              )}
              {activeResult && !activeResult.error && activeResult.columns.length > 0 && (
                <button onClick={() => exportCSV(activeResult)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-bold text-textMuted hover:text-cyan hover:border-cyan/30 transition-all">
                  <Download size={11} /> CSV
                </button>
              )}
            </div>
          </div>

          {/* SQL Editor panel */}
          {sqlMode && (
            <div className="border-b border-border bg-bg flex-shrink-0" style={{ maxHeight: "220px" }}>
              <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50">
                <span className="text-[10px] font-extrabold text-textDim uppercase tracking-widest">Query</span>
                <div className="ml-auto flex items-center gap-2">
                  <button onClick={() => setShowHistory(h => !h)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] border transition-all ${showHistory ? "bg-purple/10 text-purple border-purple/20" : "text-textMuted border-border hover:text-purple"}`}>
                    <History size={11} /> History
                  </button>
                  <button onClick={() => { setQuery(""); textareaRef.current?.focus(); }}
                    className="p-1 rounded-lg text-textDim hover:text-textMuted transition-colors">
                    <X size={12} />
                  </button>
                  <button onClick={runQuery} disabled={queryRunning}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-purple text-white hover:bg-purple/80 disabled:opacity-50 transition-all">
                    {queryRunning ? <span className="animate-spin">⟳</span> : <Play size={11} />}
                    {queryRunning ? "Running..." : "Run"}
                  </button>
                </div>
              </div>
              <div className="flex" style={{ height: "160px" }}>
                <div style={{ height: "160px", overflow: "hidden", flex: 1 }}>
                  <textarea
                    ref={textareaRef}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    spellCheck={false}
                    className="w-full h-full bg-transparent text-text text-xs font-mono resize-none focus:outline-none px-4 py-3 leading-relaxed"
                    placeholder="SELECT * FROM users LIMIT 10;"
                  />
                </div>
                {showHistory && queryHistory.length > 0 && (
                  <div className="w-64 border-l border-border overflow-y-auto bg-bg2">
                    <p className="text-[10px] font-bold text-textDim uppercase tracking-widest px-3 py-2 border-b border-border">History</p>
                    {queryHistory.map((q, i) => (
                      <button key={i} onClick={() => { setQuery(q); setShowHistory(false); }}
                        className="w-full text-left px-3 py-2 text-[11px] text-textMuted hover:bg-bg hover:text-text transition-colors truncate border-b border-border/50 font-mono">
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Data grid */}
          <div className="flex-1 overflow-auto">
            {!selectedTable && !sqlMode ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-cyanDim border border-cyan/20 flex items-center justify-center">
                  <Database size={28} className="text-cyan" />
                </div>
                <div>
                  <p className="text-text font-bold text-lg">Database Explorer</p>
                  <p className="text-textMuted text-sm mt-1">Select a table from the left panel to browse data,<br />or open the SQL Editor to run custom queries.</p>
                </div>
                <div className="flex gap-3 mt-2">
                  <div className="text-xs text-textMuted bg-bg2 border border-border rounded-lg px-4 py-2 flex items-center gap-2">
                    <Layers size={12} className="text-cyan" /> {tables.length} tables
                  </div>
                </div>
              </div>
            ) : (tableLoading || (sqlMode && queryRunning)) ? (
              <div className="flex justify-center pt-12"><Spinner /></div>
            ) : (
              (() => {
                const result = sqlMode ? queryResult : tableData;
                if (!result) {
                  if (sqlMode) return (
                    <div className="flex flex-col items-center justify-center h-full gap-3">
                      <Terminal size={32} className="text-textDim" />
                      <p className="text-textMuted text-sm">Run a query to see results</p>
                      <p className="text-textDim text-xs">Ctrl+Enter to execute</p>
                    </div>
                  );
                  return null;
                }
                if (result.error) return (
                  <div className="p-6">
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-red/5 border border-red/20">
                      <AlertCircle size={18} className="text-red mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-bold text-red text-sm">Query Error</p>
                        <p className="text-red/80 text-xs mt-1 font-mono whitespace-pre-wrap">{result.error}</p>
                      </div>
                    </div>
                  </div>
                );
                if (!result.columns.length) return (
                  <div className="flex flex-col items-center justify-center h-full gap-3">
                    <CheckCircle size={32} className="text-green" />
                    <p className="text-textMuted text-sm">Query executed successfully</p>
                    <p className="text-textDim text-xs">{result.count} rows affected</p>
                  </div>
                );
                return (
                  <div className="relative">
                    {/* Result meta bar */}
                    {sqlMode && (
                      <div className="sticky top-0 z-10 flex items-center gap-4 px-4 py-1.5 bg-bg border-b border-border/50 text-[11px] text-textDim">
                        <CheckCircle size={11} className="text-green" />
                        <span className="text-green font-bold">{result.count.toLocaleString()} rows returned</span>
                        {result.duration_ms && (
                          <>
                            <span className="text-border">|</span>
                            <Clock size={10} /> <span>{result.duration_ms}ms</span>
                          </>
                        )}
                        <span className="text-border">|</span>
                        <span>{result.columns.length} columns</span>
                      </div>
                    )}
                    <table className="w-full text-xs border-collapse">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-bg2 border-b-2 border-border">
                          <th className="px-3 py-2 text-left text-[10px] font-extrabold text-textDim uppercase tracking-widest w-10 border-r border-border">#</th>
                          {visibleCols.map(col => (
                            <th key={col} className="px-3 py-2 text-left text-[10px] font-extrabold text-textMuted uppercase tracking-widest whitespace-nowrap border-r border-border/50">
                              <div className="flex items-center gap-1.5">
                                <span>{col}</span>
                                <button onClick={() => { navigator.clipboard.writeText(col); toast.success("Copied"); }}
                                  className="text-textDim hover:text-cyan opacity-0 group-hover:opacity-100 transition-all">
                                  <Copy size={9} />
                                </button>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.rows.map((row, ri) => (
                          <tr key={ri} className="border-b border-border/40 hover:bg-bg2 transition-colors group">
                            <td className="px-3 py-2 text-textDim font-mono text-[10px] border-r border-border/30 select-none">
                              {(page - 1) * pageSize + ri + 1}
                            </td>
                            {visibleColIndexes.map(ci => (
                              <td key={ci} className="px-3 py-2 max-w-[200px] overflow-hidden border-r border-border/20">
                                <CellVal v={row[ci]} />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()
            )}
          </div>

          {/* Pagination (table mode only) */}
          {!sqlMode && selectedTable && tableData && !tableData.error && totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-bg2 flex-shrink-0">
              <span className="text-xs text-textMuted">
                Rows {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, tableData.count)} of {tableData.count.toLocaleString()}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => { setPage(p => Math.max(1, p - 1)); loadTableData(selectedTable, Math.max(1, page - 1)); }}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg border border-border text-textMuted hover:text-cyan hover:border-cyan/30 disabled:opacity-30 transition-all">
                  <ChevronLeft size={13} />
                </button>
                <span className="text-xs text-text font-bold px-2">{page} / {totalPages}</span>
                <button onClick={() => { setPage(p => Math.min(totalPages, p + 1)); loadTableData(selectedTable, Math.min(totalPages, page + 1)); }}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded-lg border border-border text-textMuted hover:text-cyan hover:border-cyan/30 disabled:opacity-30 transition-all">
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
