"use client";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

type BadgeTone = "green" | "red" | "yellow" | "cyan" | "purple" | "muted";
const badgeMap: Record<BadgeTone, string> = {
  green: "bg-greenDim text-green border-green/20",
  red: "bg-redDim text-red border-red/20",
  yellow: "bg-yellowDim text-yellow border-yellow/20",
  cyan: "bg-cyanDim text-cyan border-cyan/20",
  purple: "bg-purpleDim text-purple border-purple/20",
  muted: "bg-bg3 text-textMuted border-border",
};
export function Badge({ label, tone }: { label: string; tone: BadgeTone }) {
  return <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border uppercase tracking-wide", badgeMap[tone])}>{label}</span>;
}

type BtnVariant = "primary" | "secondary" | "danger" | "ghost";
const btnMap: Record<BtnVariant, string> = {
  primary: "bg-cyan text-bg hover:bg-cyan/90",
  secondary: "bg-bg3 text-text border border-border hover:bg-borderStrong",
  danger: "bg-redDim text-red border border-red/20 hover:bg-red/20",
  ghost: "text-textMuted hover:text-text hover:bg-bg3",
};
export function Button({ children, variant = "primary", loading, onClick, disabled, className, type = "button" }: {
  children: React.ReactNode; variant?: BtnVariant; loading?: boolean;
  onClick?: () => void; disabled?: boolean; className?: string; type?: "button" | "submit";
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading}
      className={cn("inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed", btnMap[variant], className)}>
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("bg-bg2 border border-border rounded-lg p-5", className)}>{children}</div>;
}

export function StatCard({ label, value, sub, tone = "cyan" }: { label: string; value: string | number; sub?: string; tone?: "cyan" | "green" | "purple" | "yellow" }) {
  const colors = { cyan: "text-cyan", green: "text-green", purple: "text-purple", yellow: "text-yellow" };
  return (
    <Card>
      <p className="text-textMuted text-xs font-bold uppercase tracking-widest">{label}</p>
      <p className={cn("text-3xl font-bold mt-2", colors[tone])}>{value}</p>
      {sub && <p className="text-textMuted text-xs mt-1">{sub}</p>}
    </Card>
  );
}

export function Table({ headers, children, empty }: { headers: string[]; children: React.ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-bg3 border-b border-border">
          <tr>{headers.map((h) => <th key={h} className="px-4 py-3 text-left text-textMuted font-bold text-xs uppercase tracking-wider">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-border">
          {empty ? <tr><td colSpan={headers.length} className="px-4 py-12 text-center text-textMuted">No records found</td></tr> : children}
        </tbody>
      </table>
    </div>
  );
}

export function Tr({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tr className={cn("hover:bg-bg3 transition-colors", className)}>{children}</tr>;
}

export function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 text-text", className)}>{children}</td>;
}

export function Spinner() {
  return <div className="flex items-center justify-center py-16"><Loader2 size={28} className="animate-spin text-cyan" /></div>;
}

export function Input({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn("w-full bg-bg border border-border rounded-md px-3 py-2 text-text text-sm placeholder:text-textDim focus:outline-none focus:border-cyan transition-colors", props.className)} />;
}

export function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn("bg-bg border border-border rounded-md px-3 py-2 text-text text-sm focus:outline-none focus:border-cyan transition-colors", props.className)}>{children}</select>;
}
