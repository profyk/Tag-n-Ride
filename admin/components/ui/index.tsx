"use client";
import { cn } from "@/lib/utils";
import { Loader2, ShieldAlert } from "lucide-react";
import { hasPermission, isSuperAdmin } from "@/lib/api";
import React from "react";

type BtnVariant = "primary" | "secondary" | "danger" | "ghost";

export function Button({
  children, onClick, loading, disabled, variant = "primary", className, title,
}: {
  children: React.ReactNode; onClick?: () => void; loading?: boolean;
  disabled?: boolean; variant?: BtnVariant; className?: string; title?: string;
}) {
  const base = "inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed";
  const variants: Record<BtnVariant, string> = {
    primary: "bg-cyan text-bg hover:bg-cyan/90",
    secondary: "bg-bg3 border border-border text-text hover:border-cyan hover:text-cyan",
    danger: "bg-red/10 border border-red/30 text-red hover:bg-red/20",
    ghost: "text-textMuted hover:text-text hover:bg-bg3",
  };
  return (
    <button onClick={onClick} disabled={disabled || loading} title={title}
      className={cn(base, variants[variant], className)}>
      {loading && <Loader2 size={12} className="animate-spin" />}
      {children}
    </button>
  );
}

export function Card({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div className={cn("bg-bg2 border border-border rounded-xl p-5", className)} onClick={onClick}>
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

export function Spinner({ size }: { size?: number } = {}) {
  if (size !== undefined) {
    return <Loader2 size={size} className="animate-spin text-cyan" />;
  }
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
  className, children, options, ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { children?: React.ReactNode; options?: { label: string; value: string }[] }) {
  return (
    <select {...props} className={cn(
      "bg-bg border border-border rounded-lg px-3 py-2 text-text text-sm",
      "focus:outline-none focus:border-cyan transition-colors",
      className
    )}>
      {options ? options.map(o => <option key={o.value} value={o.value}>{o.label}</option>) : children}
    </select>
  );
}

export function Modal({
  open, onClose, title, children, size,
}: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; size?: "sm" | "md" | "lg" | "xl";
}) {
  const maxW = size === "lg" ? "max-w-2xl" : size === "xl" ? "max-w-4xl" : size === "sm" ? "max-w-sm" : "max-w-md";
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}>
      <div
        className={`bg-bg2 border border-border rounded-xl p-6 w-full ${maxW} shadow-2xl`}
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

export function PermissionGate({
  permission, children,
}: { permission: string; children: React.ReactNode }) {
  if (!hasPermission(permission) && !isSuperAdmin()) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <div className="w-12 h-12 rounded-full bg-red/10 border border-red/20 flex items-center justify-center">
          <ShieldAlert size={22} className="text-red" />
        </div>
        <div>
          <p className="text-text font-bold text-sm">Access Denied</p>
          <p className="text-textMuted text-xs mt-1">You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
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
