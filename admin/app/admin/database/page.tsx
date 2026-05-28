"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Spinner } from "@/components/ui";
import { DangerPinModal, useDangerPin } from "@/components/DangerPinModal";
import {
  Database, Table2, Play, Download, RefreshCw, Search,
  ChevronLeft, ChevronRight, Terminal, X, Copy, History,
  AlertCircle, CheckCircle, Clock, Layers, Edit2, Trash2, Plus,
  Save, Info, ShieldAlert,
} from "lucide-react";
import toast from "react-hot-toast";

const BASE = "https://tag-n-ride-production.up.railway.app";
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
});

type TableInfo = { name: string; rows: number; size?: string };
type QueryResult = { columns: string[]; rows: any[][]; count: number; duration_ms?: number; error?: string };
type ColDef = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };

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

function CellVal({ v }: { v: any }) {
  const raw = v === null || v === undefined ? null : v;
  if (raw === null) return <span className="text-textDim italic">NULL</span>;
  if (typeof raw === "boolean") return <span className={raw ? "text-green font-bold" : "text-red font-bold"}>{String(raw)}</span>;
  if (typeof raw === "number") return <span className="text-cyan font-mono">{String(raw)}</span>;
  if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}/.test(raw)) return <span className="text-yellow">{fmt(raw)}</span>;
  if (typeof raw === "string" && raw.length >= 20) return <span className="text-purple font-mono text-[10px]">{fmt(raw)}</span>;
  return <span className="text-text">{fmt(raw)}</span>;
}

function sqlLiteral(v: any): string {
  if (v === null || v === undefined || String(v).trim().toUpperCase() === "NULL" || String(v).trim() === "") return "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

function rowToObj(columns: string[], row: any[]): Record<string, any> {
  return Object.fromEntries(columns.map((c, i) => [c, row[i] ?? null]));
}

function findPK(obj: Record<string, any>): { col: string; val: any } | null {
  if ("id" in obj) return { col: "id", val: obj["id"] };
  const pkCol = Object.keys(obj).find(k => k.endsWith("_id"));
  if (pkCol) return { col: pkCol, val: obj[pkCol] };
  return null;
}

function FieldInput({ col, val, onChange, colDef }: {
  col: string; val: any; onChange: (v: string) => void; colDef?: ColDef;
}) {
  const dtype = colDef?.data_type || "";
  const isBool = dtype.includes("bool") || typeof val === "boolean";
  const isNum = dtype.includes("int") || dtype.includes("numeric") || dtype.includes("float") || dtype.includes("double");
  const isJson = dtype.includes("json") || (typeof val === "object" && val !== null);
  const strVal = val === null || val === undefined ? "" : (typeof val === "object" ? JSON.stringify(val, null, 2) : String(val));
  const hasDefault = !!colDef?.column_default;

  if (isBool) return (
    <select value={strVal} onChange={e => onChange(e.target.value)}
      className="w-full bg-bg border border-border rounded-lg px-2.5 py-1.5 text-xs text-text focus:outline-none focus:border-cyan">
      <option value="">NULL</option>
      <option value="true">true</option>
      <option value="false">false</option>
    </select>
  );

  if (isJson || strVal.length > 100) return (
    <textarea value={strVal} onChange={e => onChange(e.target.value)} rows={3}
      placeholder={hasDefault ? `default: ${colDef!.column_default}` : "NULL"}
      className="w-full bg-bg border border-border rounded-lg px-2.5 py-1.5 text-xs text-text focus:outline-none focus:border-cyan resize-none font-mono" />
  );

  return (
    <input type={isNum ? "number" : "text"} value={strVal} onChange={e => onChange(e.target.value)}
      placeholder={hasDefault ? `auto: ${colDef!.column_default}` : "NULL"}
      className="w-full bg-bg border border-border rounded-lg px-2.5 py-1.5 text-xs text-text focus:outline-none focus:border-cyan" />
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

  const [editModal, setEditModal] = useState<{ obj: Record<string, any>; isNew: boolean } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Record<string, any> | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [mutating, setMutating] = useState(false);
  const [schemaMode, setSchemaMode] = useState(false);
  const [schemaData, setSchemaData] = useState<ColDef[] | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dangerPin = useDangerPin();

  const loadTables = async () => {
    setTablesLoading(true);
    try {
      const res = await fetch(`${BASE}/api/admin/db/tables`, { headers: authHeaders() });
      const d = await res.json();
      setTables(Array.isArray(d) ? d : (d.tables ?? []));
    } catch {
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
    setSelectedRows(new Set());
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

  const loadSchema = useCallback(async (tableName: string) => {
    setSchemaLoading(true);
    setSchemaData(null);
    try {
      const res = await fetch(`${BASE}/api/admin/db/query`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          sql: `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = '${tableName}' ORDER BY ordinal_position`,
        }),
      });
      const d = await res.json();
      if (d.rows) {
        setSchemaData(d.rows.map((r: any[]) => ({
          column_name: r[0], data_type: r[1], is_nullable: r[2], column_default: r[3] ?? null,
        })));
      }
    } catch { /* ignore */ }
    finally { setSchemaLoading(false); }
  }, []);

  const isMutationSQL = (sql: string) =>
    /^\s*(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE)\s/i.test(sql.trim());

  const runQuery = async () => {
    if (!query.trim()) return;
    if (isMutationSQL(query)) {
      const token = await dangerPin.request();
      if (!token) return;
    }
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

  const runMutation = async (sql: string): Promise<void> => {
    const res = await fetch(`${BASE}/api/admin/db/query`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ sql }),
    });
    const d = await res.json();
    if (!res.ok || d.error) throw new Error(d.error || d.detail || "Operation failed");
  };

  const handleSaveEdit = async () => {
    if (!editModal || !selectedTable) return;
    const token = await dangerPin.request();
    if (!token) return;
    setMutating(true);
    try {
      if (editModal.isNew) {
        const entries = Object.entries(editModal.obj).filter(([, v]) => v !== "" && v !== null);
        const cols = entries.map(([k]) => k).join(", ");
        const vals = entries.map(([, v]) => sqlLiteral(v)).join(", ");
        await runMutation(`INSERT INTO ${selectedTable} (${cols}) VALUES (${vals})`);
        toast.success("Row inserted");
      } else {
        const pk = findPK(editModal.obj);
        if (!pk) { toast.error("No primary key found — cannot update"); return; }
        const setClauses = Object.entries(editModal.obj)
          .filter(([k]) => k !== pk.col)
          .map(([k, v]) => `${k} = ${sqlLiteral(v)}`)
          .join(", ");
        await runMutation(`UPDATE ${selectedTable} SET ${setClauses} WHERE ${pk.col} = ${sqlLiteral(pk.val)}`);
        toast.success("Row updated");
      }
      setEditModal(null);
      loadTableData(selectedTable, page);
      loadTables();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setMutating(false); }
  };

  const handleDelete = async (obj: Record<string, any>) => {
    if (!selectedTable) return;
    const pk = findPK(obj);
    if (!pk) { toast.error("No primary key found — cannot delete"); return; }
    const token = await dangerPin.request();
    if (!token) return;
    setMutating(true);
    try {
      await runMutation(`DELETE FROM ${selectedTable} WHERE ${pk.col} = ${sqlLiteral(pk.val)}`);
      toast.success("Row deleted");
      setDeleteConfirm(null);
      loadTableData(selectedTable, page);
      loadTables();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setMutating(false); }
  };

  const handleBulkDelete = async () => {
    if (!selectedTable || !tableData || selectedRows.size === 0) return;
    const token = await dangerPin.request();
    if (!token) return;
    setMutating(true);
    try {
      for (const ri of Array.from(selectedRows)) {
        const obj = rowToObj(tableData.columns, tableData.rows[ri]);
        const pk = findPK(obj);
        if (pk) await runMutation(`DELETE FROM ${selectedTable} WHERE ${pk.col} = ${sqlLiteral(pk.val)}`);
      }
      toast.success(`${selectedRows.size} rows deleted`);
      setSelectedRows(new Set());
      loadTableData(selectedTable, page);
      loadTables();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setMutating(false); }
  };

  const openInsert = () => {
    if (!tableData?.columns) return;
    setEditModal({ obj: Object.fromEntries(tableData.columns.map(c => [c, null])), isNew: true });
  };

  const openEdit = (row: any[]) => {
    if (!tableData?.columns) return;
    setEditModal({ obj: rowToObj(tableData.columns, row), isNew: false });
  };

  const toggleRow = (i: number) => {
    setSelectedRows(prev => { const next = new Set(prev); next.has(i) ? next.delete(i) : next.add(i); return next; });
  };

  const toggleAll = () => {
    if (!tableData) return;
    setSelectedRows(selectedRows.size === tableData.rows.length && tableData.rows.length > 0
      ? new Set() : new Set(tableData.rows.map((_, i) => i)));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); runQuery(); }
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
    if (selectedTable) { setPage(1); setSchemaData(null); setSchemaMode(false); loadTableData(selectedTable, 1); }
  }, [selectedTable, loadTableData]);

  useEffect(() => {
    if (schemaMode && selectedTable && !schemaData) loadSchema(selectedTable);
  }, [schemaMode, selectedTable, schemaData, loadSchema]);

  const filteredTables = tables.filter(t => t.name.toLowerCase().includes(tableSearch.toLowerCase()));
  const activeResult = sqlMode ? queryResult : tableData;
  const visibleCols = activeResult?.columns.filter(c => !colSearch || c.toLowerCase().includes(colSearch.toLowerCase())) ?? [];
  const visibleColIndexes = activeResult?.columns.map((c, i) => (!colSearch || c.toLowerCase().includes(colSearch.toLowerCase())) ? i : -1).filter(i => i >= 0) ?? [];
  const totalPages = tableData ? Math.ceil(tableData.count / pageSize) : 1;
  const colDefMap = Object.fromEntries((schemaData ?? []).map(c => [c.column_name, c]));

  return (
    <AdminShell title="Database Manager">
      <div className="flex gap-0 -mx-6 -mt-2" style={{ height: "calc(100vh - 110px)" }}>

        {/* Left panel: table list */}
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
              <input value={tableSearch} onChange={e => setTableSearch(e.target.value)} placeholder="Filter tables..."
                className="w-full bg-bg2 border border-border rounded-lg pl-6 pr-2 py-1.5 text-[11px] text-text placeholder:text-textDim focus:outline-none focus:border-cyan transition-colors" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {tablesLoading ? (
              <div className="flex justify-center pt-6"><Spinner /></div>
            ) : filteredTables.map(t => (
              <button key={t.name}
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
            <button onClick={() => { setSqlMode(true); setSelectedTable(null); }}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${sqlMode ? "bg-purple/10 text-purple border border-purple/20" : "text-textMuted hover:text-purple hover:bg-purple/5"}`}>
              <Terminal size={12} /> SQL Editor
            </button>
          </div>
        </div>

        {/* Right panel */}
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
                  {selectedRows.size > 0 && (
                    <button onClick={handleBulkDelete} disabled={mutating}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red/30 text-xs font-bold text-red hover:bg-red/10 disabled:opacity-50 transition-all">
                      <Trash2 size={11} /> Delete {selectedRows.size}
                    </button>
                  )}
                  <button onClick={openInsert}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-green/30 text-xs font-bold text-green hover:bg-green/10 transition-all">
                    <Plus size={11} /> Insert Row
                  </button>
                  <button onClick={() => setSchemaMode(s => !s)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all ${schemaMode ? "bg-yellow/10 border-yellow/30 text-yellow" : "border-border text-textMuted hover:text-yellow hover:border-yellow/30"}`}>
                    <Info size={11} /> Schema
                  </button>
                  <div className="relative">
                    <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-textDim" />
                    <input value={colSearch} onChange={e => setColSearch(e.target.value)} placeholder="Filter cols..."
                      className="bg-bg border border-border rounded-lg pl-6 pr-2 py-1 text-[11px] text-text placeholder:text-textDim focus:outline-none focus:border-cyan w-28" />
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

          {/* SQL Editor */}
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
                  {isMutationSQL(query) && (
                    <span className="flex items-center gap-1 text-yellow text-[10px] font-bold px-2">
                      <ShieldAlert size={11} /> PIN required
                    </span>
                  )}
                  <button onClick={runQuery} disabled={queryRunning}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50 transition-all ${isMutationSQL(query) ? "bg-yellow text-black hover:bg-yellow/80" : "bg-purple text-white hover:bg-purple/80"}`}>
                    {queryRunning ? <span className="animate-spin">⟳</span> : <Play size={11} />}
                    {queryRunning ? "Running..." : "Run"}
                  </button>
                </div>
              </div>
              <div className="flex" style={{ height: "160px" }}>
                <div style={{ height: "160px", overflow: "hidden", flex: 1 }}>
                  <textarea ref={textareaRef} value={query} onChange={e => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown} spellCheck={false}
                    className="w-full h-full bg-transparent text-text text-xs font-mono resize-none focus:outline-none px-4 py-3 leading-relaxed"
                    placeholder="SELECT * FROM users LIMIT 10;" />
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

          {/* Schema panel */}
          {schemaMode && selectedTable && (
            <div className="border-b border-border bg-bg flex-shrink-0 overflow-auto" style={{ maxHeight: "200px" }}>
              {schemaLoading ? (
                <div className="flex justify-center py-4"><Spinner /></div>
              ) : schemaData ? (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-bg2 border-b border-border">
                      {["Column", "Type", "Nullable", "Default"].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] font-extrabold text-textDim uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {schemaData.map(col => (
                      <tr key={col.column_name} className="border-b border-border/40 hover:bg-bg2">
                        <td className="px-3 py-1.5 text-cyan font-mono font-bold">{col.column_name}</td>
                        <td className="px-3 py-1.5 text-purple font-mono">{col.data_type}</td>
                        <td className="px-3 py-1.5">
                          <span className={col.is_nullable === "YES" ? "text-yellow" : "text-green"}>{col.is_nullable}</span>
                        </td>
                        <td className="px-3 py-1.5 text-textDim font-mono text-[11px]">{col.column_default || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
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
                  <p className="text-text font-bold text-lg">Database Manager</p>
                  <p className="text-textMuted text-sm mt-1">Select a table to browse, insert, edit, and delete data,<br />or open the SQL Editor to run custom queries.</p>
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
                        <p className="font-bold text-red text-sm">Error</p>
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
                    {sqlMode && (
                      <div className="sticky top-0 z-10 flex items-center gap-4 px-4 py-1.5 bg-bg border-b border-border/50 text-[11px] text-textDim">
                        <CheckCircle size={11} className="text-green" />
                        <span className="text-green font-bold">{result.count.toLocaleString()} rows returned</span>
                        {result.duration_ms && <><span className="text-border">|</span><Clock size={10} /><span>{result.duration_ms}ms</span></>}
                        <span className="text-border">|</span>
                        <span>{result.columns.length} columns</span>
                      </div>
                    )}
                    <table className="w-full text-xs border-collapse">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-bg2 border-b-2 border-border">
                          {!sqlMode && (
                            <th className="px-3 py-2 w-8 border-r border-border">
                              <input type="checkbox"
                                checked={!!tableData && selectedRows.size === tableData.rows.length && tableData.rows.length > 0}
                                onChange={toggleAll} className="accent-cyan cursor-pointer" />
                            </th>
                          )}
                          <th className="px-3 py-2 text-left text-[10px] font-extrabold text-textDim uppercase tracking-widest w-10 border-r border-border">#</th>
                          {visibleCols.map(col => (
                            <th key={col} className="px-3 py-2 text-left text-[10px] font-extrabold text-textMuted uppercase tracking-widest whitespace-nowrap border-r border-border/50">
                              <div className="flex items-center gap-1.5">
                                <span>{col}</span>
                                <button onClick={() => { navigator.clipboard.writeText(col); toast.success("Copied"); }}
                                  className="text-textDim hover:text-cyan transition-all"><Copy size={9} /></button>
                              </div>
                            </th>
                          ))}
                          {!sqlMode && <th className="px-3 py-2 w-20 border-l border-border" />}
                        </tr>
                      </thead>
                      <tbody>
                        {result.rows.map((row, ri) => (
                          <tr key={ri} className={`border-b border-border/40 hover:bg-bg2 transition-colors group ${selectedRows.has(ri) ? "bg-cyan/5" : ""}`}>
                            {!sqlMode && (
                              <td className="px-3 py-2 border-r border-border/30" onClick={e => e.stopPropagation()}>
                                <input type="checkbox" checked={selectedRows.has(ri)} onChange={() => toggleRow(ri)}
                                  className="accent-cyan cursor-pointer" />
                              </td>
                            )}
                            <td className="px-3 py-2 text-textDim font-mono text-[10px] border-r border-border/30 select-none">
                              {(page - 1) * pageSize + ri + 1}
                            </td>
                            {visibleColIndexes.map(ci => (
                              <td key={ci} className="px-3 py-2 max-w-[200px] overflow-hidden border-r border-border/20">
                                <CellVal v={row[ci]} />
                              </td>
                            ))}
                            {!sqlMode && (
                              <td className="px-2 py-1 border-l border-border/20">
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all" onClick={e => e.stopPropagation()}>
                                  <button onClick={() => openEdit(row)}
                                    className="p-1.5 rounded-lg border border-border text-textDim hover:text-cyan hover:border-cyan/30 transition-all"
                                    title="Edit row">
                                    <Edit2 size={11} />
                                  </button>
                                  <button onClick={() => setDeleteConfirm(rowToObj(tableData!.columns, row))}
                                    className="p-1.5 rounded-lg border border-border text-textDim hover:text-red hover:border-red/30 transition-all"
                                    title="Delete row">
                                    <Trash2 size={11} />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()
            )}
          </div>

          {/* Pagination */}
          {!sqlMode && selectedTable && tableData && !tableData.error && totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-bg2 flex-shrink-0">
              <span className="text-xs text-textMuted">
                Rows {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, tableData.count)} of {tableData.count.toLocaleString()}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => { const p = Math.max(1, page - 1); setPage(p); loadTableData(selectedTable, p); }}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg border border-border text-textMuted hover:text-cyan hover:border-cyan/30 disabled:opacity-30 transition-all">
                  <ChevronLeft size={13} />
                </button>
                <span className="text-xs text-text font-bold px-2">{page} / {totalPages}</span>
                <button onClick={() => { const p = Math.min(totalPages, page + 1); setPage(p); loadTableData(selectedTable, p); }}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded-lg border border-border text-textMuted hover:text-cyan hover:border-cyan/30 disabled:opacity-30 transition-all">
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit / Insert Modal */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-bg border border-border rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center gap-3 p-4 border-b border-border flex-shrink-0">
              {editModal.isNew ? <Plus size={16} className="text-green" /> : <Edit2 size={16} className="text-cyan" />}
              <span className="font-bold text-text">
                {editModal.isNew ? `Insert Row — ${selectedTable}` : `Edit Row — ${selectedTable}`}
              </span>
              <button onClick={() => setEditModal(null)} className="ml-auto text-textDim hover:text-text transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 grid grid-cols-2 gap-3">
              {Object.entries(editModal.obj).map(([col, val]) => (
                <div key={col}>
                  <label className="block text-[10px] font-bold text-textMuted uppercase tracking-widest mb-1">
                    {col}
                    {colDefMap[col] && <span className="ml-1.5 text-textDim font-normal normal-case">{colDefMap[col].data_type}</span>}
                  </label>
                  <FieldInput col={col} val={val} colDef={colDefMap[col]}
                    onChange={v => setEditModal(prev => prev ? { ...prev, obj: { ...prev.obj, [col]: v } } : null)} />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-3 p-4 border-t border-border flex-shrink-0">
              <button onClick={() => setEditModal(null)}
                className="px-4 py-2 rounded-lg border border-border text-xs font-bold text-textMuted hover:text-text transition-all">
                Cancel
              </button>
              <button onClick={handleSaveEdit} disabled={mutating}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-50 transition-all ${editModal.isNew ? "bg-green text-black hover:bg-green/80" : "bg-cyan text-black hover:bg-cyan/80"}`}>
                <Save size={13} />
                {mutating ? "Saving..." : editModal.isNew ? "Insert" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-bg border border-red/20 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-red/10 border border-red/20 flex items-center justify-center mx-auto mb-4">
                <Trash2 size={20} className="text-red" />
              </div>
              <p className="font-bold text-text text-lg mb-1">Delete Row?</p>
              <p className="text-textMuted text-sm mb-3">
                Permanently deletes this row from <span className="text-cyan font-mono">{selectedTable}</span>. Cannot be undone.
              </p>
              {findPK(deleteConfirm) && (
                <p className="text-textDim text-xs font-mono mb-4 bg-bg2 rounded-lg px-3 py-2">
                  WHERE {findPK(deleteConfirm)!.col} = {String(findPK(deleteConfirm)!.val)}
                </p>
              )}
              <div className="flex gap-3">
                <button onClick={() => setDeleteConfirm(null)}
                  className="flex-1 px-4 py-2 rounded-lg border border-border text-xs font-bold text-textMuted hover:text-text transition-all">
                  Cancel
                </button>
                <button onClick={() => handleDelete(deleteConfirm)} disabled={mutating}
                  className="flex-1 px-4 py-2 rounded-lg bg-red text-white text-xs font-bold hover:bg-red/80 disabled:opacity-50 transition-all">
                  {mutating ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <DangerPinModal
        open={dangerPin.open}
        onSuccess={dangerPin.handleSuccess}
        onCancel={dangerPin.handleCancel}
      />
    </AdminShell>
  );
}
