"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Spinner } from "@/components/ui";
import { getRole, getToken } from "@/lib/api";
import { useRouter } from "next/navigation";
import {
  FolderOpen, Folder, FileText, Download, Search, X,
  Eye, EyeOff, ChevronRight, ChevronDown, Lock,
  AlertTriangle, Copy, CheckCheck, Users, Crown,
  Plus, Pencil, Trash2, Save, Upload, Database,
  Printer, Share2, PenLine, FileSignature, RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────

type AccessLevel = "public" | "internal" | "confidential" | "restricted";
type Tier = "hr" | "exec";

interface DocFile {
  dbId?:       string;
  name:        string;
  path:        string;
  category:    string;
  folder:      string;
  fileName?:   string;
  size?:       number;
  accessLevel: AccessLevel;
  version?:    number;
  updatedAt?:  string;
}

interface DocFolder {
  id:    string;
  label: string;
  color: string;
  files: DocFile[];
}

interface EditorState {
  open:        boolean;
  mode:        "create" | "edit";
  dbId?:       string;
  folderId:    string;
  fileName:    string;
  displayName: string;
  content:     string;
  accessLevel: AccessLevel;
  saving:      boolean;
  error:       string | null;
}

// ── Role tiers ────────────────────────────────────────────────

const HR_ROLES    = ["superadmin", "ceo", "cfo", "cto", "hr"];
const EXEC_ROLES  = ["superadmin", "ceo"];
const EDIT_ROLES  = ["superadmin", "ceo", "hr"];

const HR_FOLDER_IDS   = ["04-hr-documents", "05-company-policies", "08-daily-use"];
const EXEC_FOLDER_IDS = [
  "01-legal-incorporation", "02-equity-and-shares", "03-investor-documents",
  "06-fintech-regulatory",  "07-marketing",
  "09-tax-sars", "10-business-agreements", "11-financial-management", "12-corporate-governance",
  "13-taxi-associations", "14-tender-documents", "15-legal-documents", "16-appointments-promotions",
];

const FOLDER_META: Record<string, { label: string; color: string }> = {
  "01-legal-incorporation":     { label: "Legal & Incorporation",     color: "purple" },
  "02-equity-and-shares":       { label: "Equity & Shares",           color: "yellow" },
  "03-investor-documents":      { label: "Investor Documents",        color: "cyan"   },
  "04-hr-documents":            { label: "Human Resources",           color: "green"  },
  "05-company-policies":        { label: "Company Policies",          color: "orange" },
  "06-fintech-regulatory":      { label: "Fintech & Regulatory",      color: "red"    },
  "07-marketing":               { label: "Marketing",                 color: "pink"   },
  "08-daily-use":               { label: "Daily Use Templates",       color: "blue"   },
  "09-tax-sars":                { label: "Tax & SARS",                color: "yellow" },
  "10-business-agreements":     { label: "Business Agreements",       color: "orange" },
  "11-financial-management":    { label: "Financial Management",      color: "green"  },
  "12-corporate-governance":    { label: "Corporate Governance",      color: "purple" },
  "13-taxi-associations":       { label: "Taxi Associations",         color: "orange" },
  "14-tender-documents":        { label: "Tender Documents",          color: "red"    },
  "15-legal-documents":         { label: "Legal Documents",           color: "purple" },
  "16-appointments-promotions": { label: "Appointments & Promotions", color: "green"  },
};

// ── Access level config ───────────────────────────────────────

const ACCESS_CONFIG: Record<AccessLevel, { label: string; color: string; icon: any }> = {
  public:       { label: "Public",       color: "text-green  bg-green/10  border-green/20",  icon: Eye },
  internal:     { label: "Internal",     color: "text-cyan   bg-cyan/10   border-cyan/20",   icon: Eye },
  confidential: { label: "Confidential", color: "text-yellow bg-yellow/10 border-yellow/20", icon: EyeOff },
  restricted:   { label: "Restricted",   color: "text-red    bg-red/10    border-red/20",    icon: Lock },
};

const FOLDER_COLORS: Record<string, string> = {
  purple: "text-purple", yellow: "text-yellow", cyan: "text-cyan",
  green: "text-green",   orange: "text-orange-400", red: "text-red",
  pink: "text-pink-400", blue: "text-blue",
};

// ── Helpers ───────────────────────────────────────────────────

function slugToTitle(slug: string) {
  return slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
function formatBytes(n?: number) {
  if (!n) return "";
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}
function nameToFileName(name: string) {
  return name.trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-_]/g, "") + ".md";
}
function authHeaders(token: string | null) {
  return token ? { Authorization: `Bearer ${token}` } : {} as Record<string, string>;
}

// ── Sub-components ────────────────────────────────────────────

function AccessBadge({ level }: { level: AccessLevel }) {
  const cfg = ACCESS_CONFIG[level];
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold flex-shrink-0", cfg.color)}>
      <Icon size={9} />{cfg.label}
    </span>
  );
}

function DocRow({ file, selected, onSelect, canEdit, canDelete, onEdit, onDelete }: {
  file: DocFile; selected: boolean; onSelect: (f: DocFile) => void;
  canEdit: boolean; canDelete: boolean;
  onEdit: (f: DocFile) => void; onDelete: (f: DocFile) => void;
}) {
  return (
    <div className={cn(
      "group w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all",
      selected ? "bg-cyan/10 border border-cyan/20" : "hover:bg-bg3 border border-transparent"
    )}>
      <button onClick={() => onSelect(file)} className="flex-1 flex items-center gap-2 text-left min-w-0">
        <FileText size={12} className={selected ? "text-cyan flex-shrink-0" : "text-textMuted group-hover:text-text flex-shrink-0"} />
        <div className="flex-1 min-w-0">
          <p className={cn("text-xs font-semibold truncate", selected ? "text-cyan" : "text-text")}>
            {slugToTitle(file.name)}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            {file.size && <span className="text-[10px] text-textDim">{formatBytes(file.size)}</span>}
            {file.dbId && (
              <span className="inline-flex items-center gap-0.5 text-[9px] text-purple font-bold">
                <Database size={7} />DB
              </span>
            )}
            {file.version && file.version > 1 && (
              <span className="text-[9px] text-textDim">v{file.version}</span>
            )}
          </div>
        </div>
        <AccessBadge level={file.accessLevel} />
        {selected && <ChevronRight size={11} className="text-cyan flex-shrink-0" />}
      </button>

      {/* Action buttons — show on hover */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        {canEdit && (
          <button
            onClick={() => onEdit(file)}
            title="Edit document"
            className="p-1 rounded hover:bg-cyan/10 text-textDim hover:text-cyan transition-colors">
            <Pencil size={11} />
          </button>
        )}
        {canDelete && file.dbId && (
          <button
            onClick={() => onDelete(file)}
            title="Delete document"
            className="p-1 rounded hover:bg-red/10 text-textDim hover:text-red transition-colors">
            <Trash2 size={11} />
          </button>
        )}
      </div>
    </div>
  );
}

function FolderSection({ folder, selectedFile, onSelectFile, searchQuery, canEdit, canDelete, onEdit, onDelete }: {
  folder: DocFolder; selectedFile: DocFile | null;
  onSelectFile: (f: DocFile) => void; searchQuery: string;
  canEdit: boolean; canDelete: boolean;
  onEdit: (f: DocFile) => void; onDelete: (f: DocFile) => void;
}) {
  const colorClass = FOLDER_COLORS[folder.color] || "text-textMuted";
  const hasSelected = folder.files.some(f => f.path === selectedFile?.path);
  const [open, setOpen] = useState(true);

  const visible = folder.files.filter(f =>
    !searchQuery || f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  if (visible.length === 0) return null;

  return (
    <div className="mb-1.5">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg hover:bg-bg3 transition-all">
        {open ? <FolderOpen size={12} className={colorClass} /> : <Folder size={12} className={colorClass} />}
        <span className={cn("flex-1 text-left text-[10px] font-extrabold uppercase tracking-wider", colorClass)}>
          {folder.label}
        </span>
        {hasSelected && <div className="w-1.5 h-1.5 rounded-full bg-cyan" />}
        <span className="text-[10px] text-textDim mr-1">{visible.length}</span>
        {open ? <ChevronDown size={10} className="text-textDim" /> : <ChevronRight size={10} className="text-textDim" />}
      </button>
      {open && (
        <div className="ml-2 pl-2 border-l border-border/50 space-y-0.5 mt-0.5">
          {visible.map(file => (
            <DocRow
              key={file.path}
              file={file}
              selected={selectedFile?.path === file.path}
              onSelect={onSelectFile}
              canEdit={canEdit}
              canDelete={canDelete}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TierHeader({ icon: Icon, title, subtitle, color }: {
  icon: any; title: string; subtitle: string; color: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5 px-3 py-2 rounded-lg border mb-2", color)}>
      <Icon size={13} className="flex-shrink-0" />
      <div>
        <p className="text-xs font-extrabold uppercase tracking-wider">{title}</p>
        <p className="text-[10px] opacity-70">{subtitle}</p>
      </div>
    </div>
  );
}

// ── Signature Modal ───────────────────────────────────────────

function SignatureModal({ file, content, onClose, onSaved }: {
  file: DocFile; content: string; onClose: () => void; onSaved: () => void;
}) {
  const token = getToken();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [signedDate, setSignedDate] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getCanvas = () => canvasRef.current;
  const getCtx = () => getCanvas()?.getContext("2d") ?? null;

  useEffect(() => {
    const canvas = getCanvas();
    if (!canvas) return;
    const ctx = getCtx();
    if (!ctx) return;
    ctx.strokeStyle = "#06b6d4";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  }

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = getCanvas(); const ctx = getCtx();
    if (!canvas || !ctx) return;
    e.preventDefault();
    setDrawing(true);
    const { x, y } = getPos(e, canvas);
    ctx.beginPath(); ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing) return;
    const canvas = getCanvas(); const ctx = getCtx();
    if (!canvas || !ctx) return;
    e.preventDefault();
    const { x, y } = getPos(e, canvas);
    ctx.lineTo(x, y); ctx.stroke();
    setHasStrokes(true);
  };

  const endDraw = () => setDrawing(false);

  const clearCanvas = () => {
    const canvas = getCanvas(); const ctx = getCtx();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
  };

  const handleSave = async () => {
    if (!hasStrokes) { setError("Please draw your signature"); return; }
    if (!signerName.trim()) { setError("Signer name is required"); return; }
    setSaving(true); setError(null);

    const canvas = getCanvas();
    const sigDataUrl = canvas?.toDataURL("image/png") ?? "";

    // Build PDF-like HTML content with signature embedded
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${slugToTitle(file.name)} — Signed</title>
<style>
body{font-family:Georgia,serif;max-width:800px;margin:40px auto;color:#111;line-height:1.7;}
h1{font-size:20px;border-bottom:2px solid #333;padding-bottom:8px;}
pre{white-space:pre-wrap;font-family:inherit;font-size:13px;}
.sig-block{margin-top:48px;border-top:1px solid #ccc;padding-top:20px;}
.sig-block img{display:block;max-width:260px;height:80px;border:1px solid #ddd;}
.sig-meta{margin-top:8px;font-size:12px;color:#555;}
@media print{body{margin:20px;}}
</style></head><body>
<h1>${slugToTitle(file.name)}</h1>
<pre>${content.replace(/</g, "&lt;")}</pre>
<div class="sig-block">
<p style="font-weight:bold;margin-bottom:6px;">Electronic Signature</p>
<img src="${sigDataUrl}" alt="Signature" />
<div class="sig-meta">
<p>Signed by: <strong>${signerName}</strong></p>
${counterparty ? `<p>Counterparty: <strong>${counterparty}</strong></p>` : ""}
<p>Date: <strong>${signedDate}</strong></p>
<p style="font-size:11px;color:#888;margin-top:4px;">This document was signed electronically via Tag-n-Ride Admin on ${new Date().toISOString()}</p>
</div></div></body></html>`;

    // Convert HTML to Blob (PDF-ready for browser print)
    const blob = new Blob([html], { type: "text/html" });
    const formData = new FormData();
    formData.append("file", blob, `${file.path.split("/").pop()?.replace(".md", "")}-SIGNED.html`);
    formData.append("meta", JSON.stringify({
      title: `${slugToTitle(file.name)} — Signed`,
      description: `Electronically signed document`,
      category: "general",
      signed_by: signerName,
      signed_date: signedDate,
      counterparty: counterparty || null,
      access_level: "restricted",
    }));

    try {
      const res = await fetch("/api/signed-documents", {
        method: "POST",
        headers: authHeaders(token),
        body: formData,
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || d.detail || "Save failed");
      }
      onSaved();
    } catch (e: any) {
      setError(e.message || "Failed to save signed document");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-bg2 border border-border rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan/10 flex items-center justify-center">
              <FileSignature size={15} className="text-cyan" />
            </div>
            <div>
              <p className="text-sm font-bold text-text">Electronic Signature</p>
              <p className="text-[11px] text-textMuted truncate max-w-xs">{slugToTitle(file.name)}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg3 text-textDim hover:text-text transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red/10 border border-red/20 rounded-lg">
              <AlertTriangle size={13} className="text-red flex-shrink-0" />
              <p className="text-xs text-red">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-textDim mb-1">Signer Name *</label>
              <input
                value={signerName}
                onChange={e => setSignerName(e.target.value)}
                placeholder="e.g. Profy T D Keakile"
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs text-text placeholder:text-textDim focus:outline-none focus:border-cyan transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-textDim mb-1">Date Signed</label>
              <input
                type="date"
                value={signedDate}
                onChange={e => setSignedDate(e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs text-text focus:outline-none focus:border-cyan transition-colors"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-textDim mb-1">Counterparty / Other Party (optional)</label>
            <input
              value={counterparty}
              onChange={e => setCounterparty(e.target.value)}
              placeholder="e.g. ABC Taxi Association"
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs text-text placeholder:text-textDim focus:outline-none focus:border-cyan transition-colors"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-textDim">
                Draw Your Signature *
              </label>
              <button
                onClick={clearCanvas}
                className="flex items-center gap-1 text-[10px] text-textDim hover:text-text transition-colors">
                <RotateCcw size={10} />Clear
              </button>
            </div>
            <canvas
              ref={canvasRef}
              width={440}
              height={130}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
              className="w-full rounded-xl border-2 border-dashed border-cyan/30 bg-bg cursor-crosshair touch-none"
              style={{ height: "130px" }}
            />
            <p className="text-[10px] text-textDim mt-1">
              {hasStrokes ? "Signature drawn — clear and redraw if needed" : "Draw your signature with mouse or finger"}
            </p>
          </div>

          <div className="flex items-start gap-2 px-3 py-2.5 bg-cyan/5 border border-cyan/15 rounded-lg">
            <FileSignature size={12} className="text-cyan flex-shrink-0 mt-0.5" />
            <p className="text-[10px] text-textMuted leading-relaxed">
              The signed document will be saved to the <strong className="text-text">Signed Documents Vault</strong> as a secure HTML file ready for print-to-PDF. The original template is not modified.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-border text-xs font-medium text-textMuted hover:text-text transition-all">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-cyan/10 border border-cyan/30 hover:bg-cyan/20 text-xs font-bold text-cyan transition-all disabled:opacity-50">
            {saving ? <><Spinner /><span>Saving...</span></> : <><FileSignature size={12} />Sign & Save</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Print helper ──────────────────────────────────────────────

function printDocument(title: string, content: string) {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${title}</title>
<style>
body{font-family:Georgia,serif;max-width:760px;margin:40px auto;color:#111;font-size:13px;line-height:1.75;}
h1,h2,h3{font-family:Arial,sans-serif;}
pre{white-space:pre-wrap;font-family:inherit;}
table{border-collapse:collapse;width:100%;margin:12px 0;}
th,td{border:1px solid #ccc;padding:6px 10px;text-align:left;font-size:12px;}
th{background:#f5f5f5;font-weight:bold;}
@media print{body{margin:20px;}@page{margin:2cm;}}
</style></head><body><pre>${content.replace(/</g, "&lt;")}</pre>
<script>window.onload=()=>{window.print();}<\/script></body></html>`);
  win.document.close();
}

function DocViewer({ file, content, loading, error, onDownload, onCopy, copied, canSign, onSign }: {
  file: DocFile; content: string | null; loading: boolean; error: string | null;
  onDownload: () => void; onCopy: () => void; copied: boolean;
  canSign: boolean; onSign: () => void;
}) {
  const handleShare = async () => {
    const title = slugToTitle(file.name);
    if (navigator.share) {
      await navigator.share({ title, text: content ?? "" }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(window.location.href);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-border flex-shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <AccessBadge level={file.accessLevel} />
            {file.dbId && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold text-purple bg-purple/10 border-purple/20">
                <Database size={8} />Stored in DB
              </span>
            )}
            <span className="text-[10px] text-textDim">{file.category}</span>
          </div>
          <h2 className="text-sm font-bold text-text leading-tight">{slugToTitle(file.name)}</h2>
          <p className="text-[10px] text-textDim mt-0.5 font-mono">{file.path}</p>
          {file.updatedAt && (
            <p className="text-[10px] text-textDim mt-0.5">
              Last updated: {new Date(file.updatedAt).toLocaleDateString("en-ZA", { dateStyle: "medium" })}
              {file.version && file.version > 1 ? ` · v${file.version}` : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
          {canSign && content && (
            <button
              onClick={onSign}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan/10 border border-cyan/30 hover:bg-cyan/20 text-xs font-bold text-cyan transition-all">
              <PenLine size={12} />Sign
            </button>
          )}
          <button
            onClick={() => content && printDocument(slugToTitle(file.name), content)}
            disabled={!content}
            title="Print document"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg3 border border-border hover:border-cyan text-xs font-medium text-textMuted hover:text-cyan transition-all disabled:opacity-40">
            <Printer size={12} />Print
          </button>
          <button
            onClick={handleShare}
            disabled={!content}
            title="Share document"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg3 border border-border hover:border-cyan text-xs font-medium text-textMuted hover:text-cyan transition-all disabled:opacity-40">
            <Share2 size={12} />Share
          </button>
          <button
            onClick={onCopy}
            disabled={!content}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg3 border border-border hover:border-cyan text-xs font-medium text-textMuted hover:text-cyan transition-all disabled:opacity-40">
            {copied ? <CheckCheck size={12} className="text-green" /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={onDownload}
            disabled={!content}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan/10 border border-cyan/30 hover:bg-cyan/20 text-xs font-bold text-cyan transition-all disabled:opacity-40">
            <Download size={12} />Download
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-5">
        {loading && (
          <div className="flex items-center justify-center h-40 gap-3">
            <Spinner /><span className="text-sm text-textMuted">Loading document...</span>
          </div>
        )}
        {error && (
          <div className="flex items-start gap-3 p-4 bg-yellow/10 border border-yellow/20 rounded-xl">
            <AlertTriangle size={16} className="text-yellow flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-yellow">Document unavailable online</p>
              <p className="text-xs text-textMuted mt-1">{error}</p>
              <p className="text-xs text-textDim mt-2">
                Available locally at: <code className="bg-bg3 px-1 rounded text-cyan">company-docs/{file.path}</code>
              </p>
            </div>
          </div>
        )}
        {content && !loading && (
          <pre className="whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-text bg-bg border border-border rounded-xl p-5 overflow-x-auto">
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}

// ── Editor Modal ──────────────────────────────────────────────

function EditorModal({ state, folders, onClose, onSaved }: {
  state: EditorState;
  folders: DocFolder[];
  onClose: () => void;
  onSaved: (docId?: string) => void;
}) {
  const token = getToken();
  const fileRef = useRef<HTMLInputElement>(null);
  const [localState, setLocalState] = useState(state);

  useEffect(() => { setLocalState(state); }, [state]);

  const set = (patch: Partial<EditorState>) => setLocalState(s => ({ ...s, ...patch }));

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      set({ content: text });
      if (!localState.displayName && file.name.endsWith(".md")) {
        const name = file.name.replace(".md", "").replace(/-/g, " ");
        set({ content: text, displayName: name, fileName: file.name });
      }
    };
    reader.readAsText(file);
  };

  const handleSave = async () => {
    if (!localState.displayName.trim()) { set({ error: "Document name is required" }); return; }
    if (!localState.folderId)           { set({ error: "Please select a folder" });    return; }
    set({ saving: true, error: null });

    const headers = { ...authHeaders(token), "Content-Type": "application/json" };
    const fileName = localState.fileName || nameToFileName(localState.displayName);

    try {
      let res: Response;
      if (localState.mode === "create") {
        res = await fetch("/api/documents", {
          method: "POST",
          headers,
          body: JSON.stringify({
            folder_id:    localState.folderId,
            file_name:    fileName,
            display_name: localState.displayName.trim(),
            content:      localState.content,
            access_level: localState.accessLevel,
          }),
        });
      } else {
        res = await fetch(`/api/documents/${localState.dbId}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({
            display_name: localState.displayName.trim(),
            content:      localState.content,
            access_level: localState.accessLevel,
          }),
        });
      }
      const data = await res.json();
      if (!res.ok) { set({ saving: false, error: data.error || data.detail || "Save failed" }); return; }
      set({ saving: false });
      onSaved(localState.mode === "create" ? data.id : localState.dbId);
    } catch (e: any) {
      set({ saving: false, error: e.message || "Network error" });
    }
  };

  if (!localState.open) return null;

  const editableFolders = folders.filter(f => {
    const role = getRole() || "";
    if (EXEC_FOLDER_IDS.includes(f.id)) return EXEC_ROLES.includes(role);
    return EDIT_ROLES.includes(role);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-3xl bg-bg2 border border-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center",
              localState.mode === "create" ? "bg-cyan/10 text-cyan" : "bg-purple/10 text-purple"
            )}>
              {localState.mode === "create" ? <Plus size={15} /> : <Pencil size={15} />}
            </div>
            <div>
              <p className="text-sm font-bold text-text">
                {localState.mode === "create" ? "New Document" : "Edit Document"}
              </p>
              <p className="text-[11px] text-textMuted">Saved to database</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg3 text-textDim hover:text-text transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {localState.error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red/10 border border-red/20 rounded-lg">
              <AlertTriangle size={13} className="text-red flex-shrink-0" />
              <p className="text-xs text-red">{localState.error}</p>
            </div>
          )}

          {/* Folder + Name row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-textDim mb-1.5">
                Folder
              </label>
              {localState.mode === "create" ? (
                <select
                  value={localState.folderId}
                  onChange={e => set({ folderId: e.target.value })}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs text-text focus:outline-none focus:border-cyan transition-colors">
                  <option value="">Select folder...</option>
                  {editableFolders.map(f => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
              ) : (
                <div className="px-3 py-2 bg-bg3 border border-border rounded-lg text-xs text-textMuted">
                  {FOLDER_META[localState.folderId]?.label || localState.folderId}
                </div>
              )}
            </div>
            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-textDim mb-1.5">
                Access Level
              </label>
              <select
                value={localState.accessLevel}
                onChange={e => set({ accessLevel: e.target.value as AccessLevel })}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs text-text focus:outline-none focus:border-cyan transition-colors">
                <option value="internal">Internal</option>
                <option value="confidential">Confidential</option>
                <option value="restricted">Restricted</option>
                <option value="public">Public</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-textDim mb-1.5">
              Document Name
            </label>
            <input
              value={localState.displayName}
              onChange={e => set({ displayName: e.target.value })}
              placeholder="e.g. Employment Contract Standard"
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs text-text placeholder:text-textDim focus:outline-none focus:border-cyan transition-colors"
            />
            {localState.displayName && (
              <p className="text-[10px] text-textDim mt-1">
                File: <span className="text-cyan font-mono">{localState.fileName || nameToFileName(localState.displayName)}</span>
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-textDim">
                Content (Markdown)
              </label>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border hover:border-cyan text-[10px] font-semibold text-textMuted hover:text-cyan transition-all">
                <Upload size={10} />Upload .md file
              </button>
              <input ref={fileRef} type="file" accept=".md,.txt" className="hidden" onChange={handleFileUpload} />
            </div>
            <textarea
              value={localState.content}
              onChange={e => set({ content: e.target.value })}
              placeholder={"# Document Title\n\nStart writing your document in Markdown format...\n\nUse ## for section headings, **bold**, *italic*, and | tables |."}
              rows={18}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-[11px] font-mono text-text placeholder:text-textDim focus:outline-none focus:border-cyan transition-colors resize-none leading-relaxed"
            />
            <p className="text-[10px] text-textDim mt-1">
              {localState.content.length.toLocaleString()} characters
              {localState.content.split("\n").length > 1 && ` · ${localState.content.split("\n").length} lines`}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border flex-shrink-0">
          <p className="text-[10px] text-textDim">
            {localState.mode === "create"
              ? "This document will be stored in the database."
              : "Changes are saved to the database and override the local file."}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg border border-border text-xs font-medium text-textMuted hover:text-text hover:border-text/30 transition-all">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={localState.saving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-cyan/10 border border-cyan/30 hover:bg-cyan/20 text-xs font-bold text-cyan transition-all disabled:opacity-50">
              {localState.saving ? <><Spinner /><span>Saving...</span></> : <><Save size={12} />Save Document</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirm ────────────────────────────────────────────

function DeleteConfirm({ file, onConfirm, onCancel, deleting }: {
  file: DocFile; onConfirm: () => void; onCancel: () => void; deleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-bg2 border border-red/20 rounded-2xl p-5 shadow-2xl">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-red/10 flex items-center justify-center">
            <Trash2 size={16} className="text-red" />
          </div>
          <div>
            <p className="text-sm font-bold text-text">Delete document?</p>
            <p className="text-xs text-textMuted">This action cannot be undone.</p>
          </div>
        </div>
        <div className="px-3 py-2 bg-bg3 border border-border rounded-lg mb-4">
          <p className="text-xs font-semibold text-text">{slugToTitle(file.name)}</p>
          <p className="text-[10px] text-textDim font-mono mt-0.5">{file.path}</p>
        </div>
        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 rounded-lg border border-border text-xs font-medium text-textMuted hover:text-text transition-all">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-red/10 border border-red/30 hover:bg-red/20 text-xs font-bold text-red transition-all disabled:opacity-50">
            {deleting ? <><Spinner /><span>Deleting...</span></> : <><Trash2 size={12} />Delete</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

const EDITOR_BLANK: EditorState = {
  open: false, mode: "create", folderId: "", fileName: "",
  displayName: "", content: "", accessLevel: "internal",
  saving: false, error: null,
};

export default function DocumentsPage() {
  const router = useRouter();
  const role   = getRole() || "";
  const token  = getToken();

  const isExec  = EXEC_ROLES.includes(role);
  const isHR    = HR_ROLES.includes(role);
  const canEdit = EDIT_ROLES.includes(role);

  const [allFolders,   setAllFolders]   = useState<DocFolder[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [selectedFile, setSelectedFile] = useState<DocFile | null>(null);
  const [docContent,   setDocContent]   = useState<string | null>(null);
  const [docLoading,   setDocLoading]   = useState(false);
  const [docError,     setDocError]     = useState<string | null>(null);
  const [search,       setSearch]       = useState("");
  const [copied,       setCopied]       = useState(false);
  const [editor,       setEditor]       = useState<EditorState>(EDITOR_BLANK);
  const [deleteTarget, setDeleteTarget] = useState<DocFile | null>(null);
  const [deleting,     setDeleting]     = useState(false);
  const [signTarget,   setSignTarget]   = useState<DocFile | null>(null);

  useEffect(() => {
    if (!isHR && !isExec) router.replace("/admin/dashboard");
  }, [isHR, isExec, router]);

  const loadList = useCallback(() => {
    if (!isHR && !isExec) return;
    setLoading(true);
    fetch("/api/documents", { headers: authHeaders(token) })
      .then(r => r.json())
      .then(d => setAllFolders(d.folders || []))
      .catch(() => setAllFolders([]))
      .finally(() => setLoading(false));
  }, [isHR, isExec, token]);

  useEffect(() => { loadList(); }, [loadList]);

  const hrFolders   = allFolders.filter(f => HR_FOLDER_IDS.includes(f.id));
  const execFolders = allFolders.filter(f => EXEC_FOLDER_IDS.includes(f.id));

  const applySearch = (folders: DocFolder[]) =>
    folders.map(f => ({
      ...f,
      files: f.files.filter(d => !search || d.name.toLowerCase().includes(search.toLowerCase())),
    })).filter(f => f.files.length > 0);

  const visibleHR   = applySearch(hrFolders);
  const visibleExec = applySearch(execFolders);
  const totalDocs   = (isExec ? allFolders : hrFolders).reduce((a, f) => a + f.files.length, 0);

  // ── Can edit in a given folder ──
  function canEditFolder(folderId: string) {
    if (!canEdit) return false;
    if (EXEC_FOLDER_IDS.includes(folderId)) return isExec;
    return true;
  }

  // ── Load document content ──
  const loadDoc = useCallback(async (file: DocFile) => {
    setSelectedFile(file);
    setDocContent(null);
    setDocError(null);
    setDocLoading(true);
    setCopied(false);
    try {
      const params = new URLSearchParams({ path: file.path });
      if (file.dbId) params.set("dbId", file.dbId);
      const res = await fetch(`/api/documents/content?${params}`, { headers: authHeaders(token) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setDocContent(data.content);
    } catch (e: any) {
      setDocError(e.message || "Could not load document.");
    } finally {
      setDocLoading(false);
    }
  }, [token]);

  // ── Editor helpers ──
  const openCreate = (defaultFolderId?: string) => {
    setEditor({
      ...EDITOR_BLANK,
      open: true, mode: "create",
      folderId: defaultFolderId || "",
    });
  };

  const openEdit = async (file: DocFile) => {
    const content = docContent && selectedFile?.path === file.path ? docContent : null;
    setEditor({
      open: true, mode: "edit",
      dbId:        file.dbId,
      folderId:    file.folder,
      fileName:    file.fileName || file.path.split("/").pop() || "",
      displayName: file.name,
      content:     content ?? "Loading...",
      accessLevel: file.accessLevel,
      saving: false, error: null,
    });

    if (!content) {
      const params = new URLSearchParams({ path: file.path });
      if (file.dbId) params.set("dbId", file.dbId);
      try {
        const res  = await fetch(`/api/documents/content?${params}`, { headers: authHeaders(token) });
        const data = await res.json();
        setEditor(s => ({ ...s, content: data.content || "" }));
      } catch {
        setEditor(s => ({ ...s, content: "" }));
      }
    }
  };

  const handleEditorSaved = (newDocId?: string) => {
    setEditor(EDITOR_BLANK);
    loadList();
    if (selectedFile && newDocId) {
      // Reload the current doc with new DB ID
      setTimeout(() => loadList(), 300);
    }
  };

  // ── Delete ──
  const handleDelete = async () => {
    if (!deleteTarget?.dbId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/documents/${deleteTarget.dbId}`, {
        method: "DELETE",
        headers: authHeaders(token),
      });
      if (!res.ok) throw new Error("Delete failed");
      setDeleteTarget(null);
      if (selectedFile?.path === deleteTarget.path) {
        setSelectedFile(null); setDocContent(null);
      }
      loadList();
    } catch {
    } finally {
      setDeleting(false);
    }
  };

  // ── Download & Copy ──
  const handleDownload = () => {
    if (!docContent || !selectedFile) return;
    const blob = new Blob([docContent], { type: "text/markdown" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = selectedFile.path.split("/").pop() || "document.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    if (!docContent) return;
    await navigator.clipboard.writeText(docContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isHR && !isExec) return null;

  return (
    <AdminShell title="Company Documents">
      <div className="space-y-4">

        {/* Modals */}
        {editor.open && (
          <EditorModal
            state={editor}
            folders={allFolders}
            onClose={() => setEditor(EDITOR_BLANK)}
            onSaved={handleEditorSaved}
          />
        )}
        {deleteTarget && (
          <DeleteConfirm
            file={deleteTarget}
            onConfirm={handleDelete}
            onCancel={() => setDeleteTarget(null)}
            deleting={deleting}
          />
        )}
        {signTarget && docContent && (
          <SignatureModal
            file={signTarget}
            content={docContent}
            onClose={() => setSignTarget(null)}
            onSaved={() => setSignTarget(null)}
          />
        )}

        {/* Banner */}
        <div className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-xl border",
          isExec ? "bg-purple/10 border-purple/20 text-purple" : "bg-cyan/10 border-cyan/20 text-cyan"
        )}>
          {isExec ? <Crown size={16} className="flex-shrink-0" /> : <Users size={16} className="flex-shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold">
              {isExec ? "Full Document Vault — CEO & Superadmin" : "HR Document Vault"}
            </p>
            <p className="text-xs opacity-70">
              {isExec
                ? "All documents visible. Editable documents are stored in the database."
                : "HR and operational documents. Legal and investor documents require CEO access."}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs font-bold opacity-70">{totalDocs} documents</span>
            {canEdit && (
              <button
                onClick={() => openCreate()}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all",
                  isExec
                    ? "bg-purple/10 border-purple/30 hover:bg-purple/20 text-purple"
                    : "bg-cyan/10 border-cyan/30 hover:bg-cyan/20 text-cyan"
                )}>
                <Plus size={12} />New Document
              </button>
            )}
          </div>
        </div>

        {/* Layout */}
        <div className="flex gap-4 h-[calc(100vh-220px)]">

          {/* Left — folder tree */}
          <div className="w-72 flex-shrink-0 bg-bg2 border border-border rounded-xl flex flex-col overflow-hidden">
            <div className="px-3 py-3 border-b border-border flex-shrink-0">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-textDim" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search documents..."
                  className="w-full bg-bg border border-border rounded-lg pl-7 pr-7 py-1.5 text-[11px] text-text placeholder:text-textDim focus:outline-none focus:border-cyan transition-colors"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-textDim hover:text-text">
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
              {loading ? (
                <div className="flex items-center justify-center h-32 gap-2">
                  <Spinner /><span className="text-xs text-textMuted">Loading...</span>
                </div>
              ) : (
                <>
                  {/* HR TIER */}
                  <TierHeader
                    icon={Users}
                    title="HR & Operations"
                    subtitle="hr · cfo · cto · ceo · superadmin"
                    color="text-cyan bg-cyan/5 border-cyan/20"
                  />
                  {visibleHR.map(folder => (
                    <FolderSection
                      key={folder.id}
                      folder={folder}
                      selectedFile={selectedFile}
                      onSelectFile={loadDoc}
                      searchQuery={search}
                      canEdit={canEditFolder(folder.id)}
                      canDelete={isExec}
                      onEdit={openEdit}
                      onDelete={setDeleteTarget}
                    />
                  ))}
                  {visibleHR.length === 0 && search && (
                    <p className="text-xs text-textDim px-3 py-2">No HR documents match "{search}"</p>
                  )}

                  {/* EXEC TIER */}
                  <div className="pt-2">
                    <TierHeader
                      icon={Crown}
                      title="Executive & Legal"
                      subtitle={isExec ? "ceo · superadmin only" : "🔒 CEO & Superadmin only"}
                      color={isExec ? "text-purple bg-purple/5 border-purple/20" : "text-textDim bg-bg3 border-border"}
                    />
                    {isExec ? (
                      visibleExec.map(folder => (
                        <FolderSection
                          key={folder.id}
                          folder={folder}
                          selectedFile={selectedFile}
                          onSelectFile={loadDoc}
                          searchQuery={search}
                          canEdit={canEditFolder(folder.id)}
                          canDelete={isExec}
                          onEdit={openEdit}
                          onDelete={setDeleteTarget}
                        />
                      ))
                    ) : (
                      <div className="flex items-center gap-2 px-3 py-3 rounded-lg bg-bg3 border border-border mx-1">
                        <Lock size={13} className="text-textDim flex-shrink-0" />
                        <div>
                          <p className="text-[11px] font-semibold text-textMuted">Access restricted</p>
                          <p className="text-[10px] text-textDim">CEO & Superadmin only</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* New doc quick button (bottom of tree) */}
                  {canEdit && (
                    <div className="pt-2">
                      <button
                        onClick={() => openCreate()}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-border hover:border-cyan text-[11px] font-semibold text-textDim hover:text-cyan transition-all">
                        <Plus size={11} />Add New Document
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Right — viewer */}
          <div className="flex-1 bg-bg2 border border-border rounded-xl overflow-hidden">
            {selectedFile ? (
              <DocViewer
                file={selectedFile}
                content={docContent}
                loading={docLoading}
                error={docError}
                onDownload={handleDownload}
                onCopy={handleCopy}
                copied={copied}
                canSign={isExec || isHR}
                onSign={() => setSignTarget(selectedFile)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
                <div className="w-14 h-14 rounded-2xl bg-bg3 border border-border flex items-center justify-center">
                  <FileText size={24} className="text-textDim" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text">Select a document to view</p>
                  <p className="text-xs text-textMuted mt-1">Choose a file from the folder tree on the left.</p>
                </div>
                {canEdit && (
                  <button
                    onClick={() => openCreate()}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan/10 border border-cyan/30 hover:bg-cyan/20 text-xs font-bold text-cyan transition-all mt-2">
                    <Plus size={13} />Create New Document
                  </button>
                )}
                <div className="flex flex-col gap-2 mt-2 w-full max-w-xs text-left">
                  {(["restricted", "confidential", "internal"] as AccessLevel[]).map(level => {
                    const cfg = ACCESS_CONFIG[level];
                    const desc = level === "restricted" ? "Legal, equity, investor — CEO only"
                              : level === "confidential" ? "HR contracts, regulatory policies"
                              : "Policies, guidelines, templates";
                    return (
                      <div key={level} className={cn("flex items-center gap-2 px-3 py-2 rounded-lg border", cfg.color)}>
                        <cfg.icon size={11} />
                        <p className="text-[11px] font-semibold">{cfg.label}</p>
                        <p className="text-[10px] opacity-60 ml-1">{desc}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
