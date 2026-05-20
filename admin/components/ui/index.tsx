"use client";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import React from "react";

type BtnVariant = "primary" | "secondary" | "danger" | "ghost";

export function Button({
  children, onClick, loading, disabled, variant = "primary", className,
}: {
  children: React.ReactNode; onClick?: () => void; loading?: boolean;
  disabled?: boolean; variant?: BtnVariant; className?: string;
}) {
  const base = "inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed";
  const variants: Record<BtnVariant, string> = {
    primary: "bg-cyan text-bg hover:bg-cyan/90",
    secondary: "bg-bg3 border border-border text-text hover:border-cyan hover:text-cyan",
    danger: "bg-red/10 border border-red/30 text-red hover:bg-red/20",
    ghost: "text-textMuted hover:text-text hover:bg-bg3",
  };
  return (
    <button onClick={onClick} disabled={disabled || loading}
      className={cn(base, variants[variant], className)}>
      {loading && <Loader2 size={12} className="animate-spin" />}
      {children}
    </button>
  );
}

type Tone = "green" | "red" | "yellow" | "cyan" | "purple" | "muted" | "orange";

export function Badge({ label, tone = "muted" }: { label: string; tone?: Tone }) {
  const tones: Record<Tone, string> = {
    green: "bg-green/10 text-green border-green/20",
    red: "bg-red/10 text-red border-red/20",
    yellow: "bg-yellow/10 text-yellow border-yellow/20",
    cyan: "bg-cyan/10 text-cyan border-cyan/20",
    purple: "bg-purple/10 text-purple border-purple/20",
    orange: "bg-orange-400/10 text-orange-400 border-orange-400/20",
    muted: "bg-bg3 text-textMuted border-border",
  };
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border",
      tones[tone]
    )}>
      {label}
    </span>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("bg-bg2 border border-border rounded-xl p-5", className)}>
      {children}
    </div>
  );
}

export function StatCard({
  label, value, sub, tone = "cyan",
}: {
  label: string; value: string | number; sub?: string;
  tone?: "cyan" | "green" | "yellow" | "purple" | "red";
}) {
  const colors: Record<string, string> = {
    cyan: "text-cyan", green: "text-green", yellow: "text-yellow",
    purple: "text-purple", red: "text-red",
  };
  return (
    <Card className="flex flex-col gap-1">
      <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest">{label}</p>
      <p className={cn("text-2xl font-extrabold tracking-tight", colors[tone])}>{value}</p>
      {sub && <p className="text-xs text-textMuted">{sub}</p>}
    </Card>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 size={28} className="animate-spin text-cyan" />
    </div>
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props} className={cn(
      "w-full bg-bg border border-border rounded-lg px-3 py-2 text-text text-sm",
      "placeholder:text-textDim focus:outline-none focus:border-cyan transition-colors",
      className
    )} />
  );
}

export function Select({
  className, children, ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return (
    <select {...props} className={cn(
      "bg-bg border border-border rounded-lg px-3 py-2 text-text text-sm",
      "focus:outline-none focus:border-cyan transition-colors",
      className
    )}>
      {children}
    </select>
  );
}

export function Table({
  headers, children, empty,
}: {
  headers: string[]; children?: React.ReactNode; empty?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-bg3 border-b border-border">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-textMuted uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {empty ? (
            <tr>
              <td colSpan={headers.length} className="px-4 py-12 text-center text-textMuted text-sm">
                No records found
              </td>
            </tr>
          ) : children}
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

export function Modal({
  open, onClose, title, children,
}: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}>
      <div
        className="bg-bg2 border border-border rounded-xl p-6 w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-text font-bold text-lg">{title}</h3>
          <button
            onClick={onClose}
            className="text-textMuted hover:text-text transition-colors text-xl leading-none">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Alert({
  type = "info", children,
}: {
  type?: "info" | "warn" | "error" | "success"; children: React.ReactNode;
}) {
  const styles: Record<string, string> = {
    info: "bg-cyan/10 border-cyan/20 text-cyan",
    warn: "bg-yellow/10 border-yellow/20 text-yellow",
    error: "bg-red/10 border-red/20 text-red",
    success: "bg-green/10 border-green/20 text-green",
  };
  return (
    <div className={cn("flex items-start gap-3 p-4 rounded-xl border text-sm", styles[type])}>
      {children}
    </div>
  );
}
