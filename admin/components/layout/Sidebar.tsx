"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useMemo } from "react";
import {
  LayoutDashboard, Users, Car, ArrowLeftRight, Wallet,
  BarChart3, CreditCard, LogOut, Shield, ShieldCheck,
  FileText, HelpCircle, Fingerprint, Monitor, Bell,
  AlertTriangle, TrendingUp, Activity, Settings,
  UserCheck, Users2, Truck, Scale, MapPin, BookOpen,
  Terminal, Sun, Moon, FlaskConical, RefreshCw,
  DollarSign, RotateCcw, PieChart, Banknote,
  ShieldAlert, AlertOctagon, Gauge, Tag, Megaphone,
  Globe, Star, MessageCircle,
  ChevronDown, ChevronRight, Search, X, Mail,
  Rocket, Target, Calculator, Database, Repeat2, FolderLock, Percent, Cpu, Brain,
  Landmark, ClipboardList, Download, Zap,
  FileWarning, MinusCircle, Building2, Map,
} from "lucide-react";
import { clearToken, getRole, isSuperAdmin, hasPermission } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useTheme } from "@/app/providers";

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Superadmin", ceo: "CEO", cto: "CTO", cfo: "CFO",
  admin: "Admin", finance: "Finance", support: "Support",
};

const ROLE_COLORS: Record<string, string> = {
  superadmin: "text-purple bg-purple/10 border-purple/20",
  ceo: "text-purple bg-purple/10 border-purple/20",
  cfo: "text-cyan bg-cyanDim border-cyan/20",
  cto: "text-cyan bg-cyanDim border-cyan/20",
  admin: "text-green bg-green/10 border-green/20",
  finance: "text-yellow bg-yellow/10 border-yellow/20",
  support: "text-orange-400 bg-orange-400/10 border-orange-400/20",
};

type NavItem = { label: string; href: string; icon: any; permission?: string | null; superadminOnly?: boolean };

type NavGroup = {
  id: string;
  label: string;
  icon: any;
  color: string;
  items: NavItem[];
};

// ── Navigation groups ─────────────────────────────────────────────────────────

const CORE_NAV: NavItem[] = [
  { label: "Dashboard",    href: "/admin/dashboard",    icon: LayoutDashboard, permission: null },
  { label: "Alerts",       href: "/admin/alerts",       icon: Bell,            permission: null },
  { label: "Transactions", href: "/admin/transactions",  icon: ArrowLeftRight,  permission: null },
  { label: "Audit Log",    href: "/admin/audit",         icon: FileText,        permission: "view_audit" },
];

const NAV_GROUPS: NavGroup[] = [
  // ── People ──────────────────────────────────────────────────
  {
    id: "people",
    label: "People",
    icon: Users,
    color: "text-cyan",
    items: [
      { label: "Users",          href: "/admin/users",       icon: Users,       permission: "manage_users" },
      { label: "Drivers",        href: "/admin/drivers",     icon: Car,         permission: "manage_drivers" },
      { label: "Fleet Owners",   href: "/admin/owners",      icon: Truck,       permission: "manage_drivers" },
      { label: "Passengers",     href: "/admin/passengers",  icon: Users2,      permission: "view_analytics" },
      { label: "KYC Review",     href: "/admin/kyc",         icon: Fingerprint, permission: "review_kyc" },
      { label: "Onboarding",     href: "/admin/onboarding",  icon: UserCheck,   permission: "manage_drivers" },
    ],
  },
  // ── Fleet ───────────────────────────────────────────────────
  {
    id: "fleet",
    label: "Fleet",
    icon: Truck,
    color: "text-cyan",
    items: [
      { label: "Driver Transfers",   href: "/admin/transfers",           icon: Repeat2,      permission: "manage_drivers" },
      { label: "Commission Splits",  href: "/admin/commissions",         icon: Percent,      permission: "manage_drivers" },
      { label: "Performance",        href: "/admin/performance",         icon: PieChart,     permission: "view_analytics" },
      { label: "Fleet Reports",      href: "/admin/fleet",               icon: BarChart3,    permission: "view_analytics" },
      { label: "Document Expiry",    href: "/admin/fleet/documents",     icon: FileWarning,  permission: "manage_drivers" },
      { label: "Driver Deductions",  href: "/admin/fleet/deductions",    icon: MinusCircle,  permission: "manage_drivers" },
      { label: "Taxi Associations",  href: "/admin/taxi-associations",   icon: Building2,    permission: "manage_drivers" },
    ],
  },
  // ── Finance ─────────────────────────────────────────────────
  {
    id: "finance",
    label: "Finance",
    icon: DollarSign,
    color: "text-green",
    items: [
      { label: "Treasury",                href: "/admin/treasury",       icon: Landmark,     permission: "view_ledger" },
      { label: "Settlement Center",     href: "/admin/settlement",     icon: Scale,        permission: "view_ledger" },
      { label: "Withdrawals & Payouts", href: "/admin/withdrawals",    icon: Wallet,       permission: "approve_withdrawals" },
      { label: "System Wallet",           href: "/admin/system-wallet",  icon: Landmark,     permission: "view_ledger" },
      { label: "Revenue & Fees",        href: "/admin/revenue",        icon: TrendingUp,   permission: "view_analytics" },
      { label: "Ledger",                href: "/admin/ledger",         icon: BookOpen,     permission: "view_ledger" },
      { label: "Reconciliation",        href: "/admin/reconciliation", icon: RefreshCw,    permission: "view_ledger" },
      { label: "Refunds",               href: "/admin/refunds",        icon: RotateCcw,    permission: "manage_refunds" },
      { label: "Chargebacks",           href: "/admin/chargebacks",    icon: AlertOctagon, permission: "manage_refunds" },
      { label: "Wallet Operations",     href: "/admin/wallet-ops",     icon: Banknote,     permission: "view_audit" },
      { label: "Statements",            href: "/admin/statements",     icon: FileText,     permission: "download_statements" },
      { label: "Financial Reports",     href: "/admin/reports",        icon: BarChart3,    permission: "view_analytics" },
      { label: "Subscriptions",         href: "/admin/subscriptions",  icon: Tag,          permission: "view_analytics" },
      { label: "Fee Simulator",         href: "/admin/fee-simulator",  icon: Calculator,   permission: "view_analytics" },
      { label: "Fee & Payout Config",   href: "/admin/fee-config",     icon: Settings,     permission: "edit_fees" },
      { label: "Pricing Rules",         href: "/admin/pricing",        icon: DollarSign,   permission: "edit_fees" },
      { label: "Export Center",         href: "/admin/export-center",  icon: Download,     permission: "export_data" },
      { label: "Document Pricing",      href: "/admin/document-pricing", icon: Tag,        permission: "edit_fees" },
    ],
  },
  // ── Analytics ───────────────────────────────────────────────
  {
    id: "analytics",
    label: "Analytics",
    icon: BarChart3,
    color: "text-purple",
    items: [
      { label: "Overview",        href: "/admin/analytics",      icon: BarChart3, permission: "view_analytics" },
      { label: "Data Analytics",  href: "/admin/data-analytics", icon: Cpu,       permission: "view_analytics" },
      { label: "Growth",          href: "/admin/growth",         icon: Rocket,    permission: "view_analytics" },
      { label: "Provinces",       href: "/admin/provinces",      icon: Map,       permission: "view_analytics" },
      { label: "Routes & Trips",  href: "/admin/routes",         icon: MapPin,    permission: "view_analytics" },
      { label: "Intelligence",    href: "/admin/intelligence",   icon: Brain,     permission: null, superadminOnly: true },
    ],
  },
  // ── SafeRide ─────────────────────────────────────────────────
  {
    id: "saferide",
    label: "SafeRide",
    icon: Shield,
    color: "text-red-400",
    items: [
      { label: "Command Centre",    href: "/admin/saferide",                       icon: Shield,        permission: "view_audit" },
      { label: "Live Monitor",      href: "/admin/monitoring",                     icon: Activity,      permission: "view_audit" },
      { label: "Live Trips",        href: "/admin/trips",                          icon: Activity,      permission: "view_analytics" },
      { label: "Incidents",         href: "/admin/saferide/incidents",             icon: AlertTriangle, permission: "view_audit" },
      { label: "Dead Man Resets",   href: "/admin/saferide/dead-man-resets",       icon: FolderLock,    permission: "approve_deadman_reset" },
    ],
  },
  // ── Compliance ───────────────────────────────────────────────
  {
    id: "compliance",
    label: "Compliance",
    icon: ShieldCheck,
    color: "text-yellow",
    items: [
      { label: "Regulatory & FICA",  href: "/admin/regulatory", icon: ClipboardList, permission: "view_audit" },
      { label: "Compliance & Risk", href: "/admin/compliance", icon: AlertTriangle, permission: "view_audit" },
      { label: "Risk & Fraud",      href: "/admin/risk",       icon: ShieldAlert,   permission: "view_risk" },
      { label: "Disputes",          href: "/admin/disputes",   icon: Scale,         permission: "manage_users" },
      { label: "Tx Limits",         href: "/admin/limits",     icon: Gauge,         permission: "manage_limits" },
      { label: "Velocity Monitor",  href: "/admin/velocity",   icon: Zap,           permission: "manage_limits" },
      { label: "GDPR & Privacy",    href: "/admin/gdpr",       icon: ShieldCheck,   permission: "view_audit" },
    ],
  },
  // ── Communications ───────────────────────────────────────────
  {
    id: "comms",
    label: "Communications",
    icon: Megaphone,
    color: "text-orange-400",
    items: [
      { label: "Announcements",  href: "/admin/notifications", icon: Megaphone,     permission: "broadcast_messages" },
      { label: "WhatsApp",      href: "/admin/whatsapp",      icon: MessageCircle, permission: "broadcast_messages" },
      { label: "Send Notice",   href: "/admin/notices",       icon: Mail,          permission: "manage_users" },
      { label: "Promotions",    href: "/admin/promotions",    icon: Tag,           permission: "manage_promotions" },
      { label: "Marketing",     href: "/admin/marketing",     icon: Target,        permission: "manage_promotions" },
      { label: "Referrals",     href: "/admin/referrals",     icon: Users2,        permission: "view_analytics" },
      { label: "User Feedback", href: "/admin/feedback",      icon: Star,          permission: "view_analytics" },
    ],
  },
  // ── Support ──────────────────────────────────────────────────
  {
    id: "support",
    label: "Support",
    icon: HelpCircle,
    color: "text-cyan",
    items: [
      { label: "Support Lookup",    href: "/admin/support",          icon: HelpCircle,    permission: "reset_pin" },
      { label: "WhatsApp Support",  href: "/admin/whatsapp-support", icon: MessageCircle, permission: "reset_pin" },
      { label: "Support Tickets",   href: "/admin/tickets",          icon: ClipboardList, permission: "reset_pin" },
    ],
  },
  // ── System ───────────────────────────────────────────────────
  {
    id: "system",
    label: "System",
    icon: Settings,
    color: "text-textMuted",
    items: [
      { label: "Daily Operations", href: "/admin/daily-ops", icon: Zap,      permission: "view_analytics" },
      { label: "Coverage Zones",  href: "/admin/geography", icon: Globe,    permission: "view_analytics" },
      { label: "System Health",   href: "/admin/health",    icon: Activity, permission: "view_audit" },
      { label: "System Manual",   href: "/admin/manual",    icon: BookOpen, permission: null },
    ],
  },
];

const HR_NAV: NavItem[] = [
  { label: "HR · Staff",    href: "/admin/hr",        icon: Users2 },
  { label: "Payroll",       href: "/admin/payroll",    icon: Banknote },
  { label: "HR Documents",  href: "/admin/documents",  icon: FolderLock },
];

const SUPERADMIN_NAV: NavItem[] = [
  { label: "Admin Accounts",    href: "/admin/admins",     icon: Shield },
  { label: "Settings & Config", href: "/admin/settings",   icon: Settings },
  { label: "System Console",    href: "/admin/console",    icon: Terminal },
  { label: "Database",          href: "/admin/database",   icon: Database },
  { label: "Superadmin Tools",  href: "/admin/superadmin", icon: ShieldCheck },
  { label: "Test Users",        href: "/admin/test-users", icon: FlaskConical },
  { label: "System Manual",     href: "/admin/manual",     icon: BookOpen },
];

// ── ThemeToggle ───────────────────────────────────────────────────────────────

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const cycle = () => {
    const order = ["dark", "light", "system"] as const;
    setTheme(order[(order.indexOf(theme as any) + 1) % order.length]);
  };
  const Icon = theme === "light" ? Sun : theme === "system" ? Monitor : Moon;
  const labels = { dark: "Dark", light: "Light", system: "System" };
  return (
    <button
      onClick={cycle}
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-textMuted hover:text-text hover:bg-bg3 w-full transition-all">
      <Icon size={13} />
      <span>{labels[theme as keyof typeof labels] ?? theme} mode</span>
    </button>
  );
}

// ── NavLink ───────────────────────────────────────────────────────────────────

function NavLink({ href, icon: Icon, label, purple = false, compact = false }: {
  href: string; icon: any; label: string; purple?: boolean; compact?: boolean;
}) {
  const path = usePathname();
  const active = path === href || path.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 px-3 rounded-lg text-xs font-semibold transition-all group",
        compact ? "py-1.5" : "py-2",
        active
          ? purple
            ? "bg-purple/10 text-purple border border-purple/20"
            : "bg-cyanDim text-cyan border border-cyan/20"
          : "text-textMuted hover:text-text hover:bg-bg3 border border-transparent"
      )}>
      <Icon size={13} className={active ? "" : "group-hover:scale-110 transition-transform"} />
      <span className="truncate">{label}</span>
      {active && <div className="ml-auto w-1 h-1 rounded-full bg-current opacity-70" />}
    </Link>
  );
}

// ── CollapsibleGroup ──────────────────────────────────────────────────────────

function CollapsibleGroup({
  group, defaultOpen, searchQuery,
}: {
  group: NavGroup; defaultOpen: boolean; searchQuery: string;
}) {
  const path = usePathname();
  const hasActive = group.items.some(i => path === i.href || path.startsWith(i.href + "/"));
  const [open, setOpen] = useState(defaultOpen || hasActive);

  const visible = group.items.filter(({ permission, label, href, superadminOnly }) => {
    if (superadminOnly && !isSuperAdmin()) return false;
    if (permission && !hasPermission(permission)) return false;
    if (searchQuery) {
      return label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        href.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });

  if (visible.length === 0) return null;

  const Icon = group.icon;

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-[10px] font-extrabold tracking-widest uppercase transition-all",
          hasActive ? "text-text" : "text-textDim hover:text-textMuted"
        )}>
        <Icon size={11} className={group.color} />
        <span className="flex-1 text-left">{group.label}</span>
        {hasActive && <div className="w-1.5 h-1.5 rounded-full bg-cyan" />}
        {open
          ? <ChevronDown size={10} className="opacity-50" />
          : <ChevronRight size={10} className="opacity-50" />}
      </button>
      {open && (
        <div className="ml-2 pl-2 border-l border-border/50 space-y-0.5 mb-1">
          {visible.map(item => (
            <NavLink key={item.href} href={item.href} icon={item.icon} label={item.label} compact />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Sidebar ──────────────────────────────────────────────────────────────

export function Sidebar() {
  const path = usePathname();
  const role = getRole() || "";
  const superAdmin = isSuperAdmin();
  // HR section visible to hr, cfo, ceo, superadmin
  const hrAllowed  = ["superadmin", "ceo", "cfo", "hr"].includes(role);
  // Full docs vault (CEO/Superadmin only) — separate from HR docs link
  const execDocsAllowed = ["superadmin", "ceo"].includes(role);
  const [search, setSearch] = useState("");
  const [superOpen, setSuperOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      await fetch("https://tag-n-ride-production.up.railway.app/api/auth/admin-logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}` },
      });
    } catch {}
    clearToken();
    window.location.href = "/login";
  };

  const isSearching = search.trim().length > 0;

  const filteredCore = CORE_NAV.filter(({ permission, label }) => {
    if (permission !== null && permission && !hasPermission(permission)) return false;
    if (isSearching) return label.toLowerCase().includes(search.toLowerCase());
    return true;
  });

  const filteredSuper = SUPERADMIN_NAV.filter(({ label }) =>
    !isSearching || label.toLowerCase().includes(search.toLowerCase())
  );

  const superActive = SUPERADMIN_NAV.some(i => path.startsWith(i.href));

  return (
    <aside className="fixed top-0 left-0 h-screen w-[220px] bg-bg2 border-r border-border flex flex-col z-40">

      {/* Brand */}
      <div className="px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="relative w-9 h-9 flex-shrink-0">
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-cyan/30 to-purple/20 blur-sm" />
            <div className="relative w-9 h-9 rounded-xl bg-bg border border-cyan/30 flex items-center justify-center">
              <span className="text-cyan font-black text-xs tracking-tight">TNR</span>
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-text font-extrabold text-sm leading-none">Tag-n-Ride</p>
            <span className={cn(
              "inline-block text-[9px] font-bold px-1.5 py-0.5 rounded border mt-1",
              ROLE_COLORS[role] || "text-textMuted bg-bg3 border-border"
            )}>
              {ROLE_LABELS[role] || "Admin"}
            </span>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-border">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-textDim" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search pages..."
            className="w-full bg-bg border border-border rounded-lg pl-7 pr-7 py-1.5 text-[11px] text-text placeholder:text-textDim focus:outline-none focus:border-cyan transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-textDim hover:text-text">
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto scrollbar-thin">

        {/* Core */}
        {filteredCore.length > 0 && (
          <div className="space-y-0.5 mb-2">
            {!isSearching && (
              <p className="px-3 py-1 text-[9px] font-extrabold text-textDim uppercase tracking-widest">Quick Access</p>
            )}
            {filteredCore.map(item => (
              <NavLink key={item.href} href={item.href} icon={item.icon} label={item.label} />
            ))}
          </div>
        )}

        {/* Groups */}
        <div className="space-y-1">
          {NAV_GROUPS.map(group => (
            <CollapsibleGroup
              key={group.id}
              group={group}
              defaultOpen={false}
              searchQuery={search}
            />
          ))}
        </div>

        {/* Company Documents (full vault) — CEO & Superadmin only */}
        {execDocsAllowed && (!search || "company documents".includes(search.toLowerCase())) && (
          <div className="mt-2">
            <NavLink href="/admin/documents" icon={FolderLock} label="Company Documents" />
          </div>
        )}

        {/* Human Resources — CEO / CFO / HR / Superadmin */}
        {hrAllowed && (
          <div className="mt-2">
            <p className="px-3 py-1.5 text-[10px] font-extrabold tracking-widest uppercase text-yellow flex items-center gap-1.5">
              <Users2 size={10} className="text-yellow" /> Human Resources
            </p>
            <div className="ml-2 pl-2 border-l border-yellow/20 space-y-0.5 mb-1">
              {HR_NAV.filter(i => !search || i.label.toLowerCase().includes(search.toLowerCase()))
                .map(item => (
                  <NavLink key={item.href} href={item.href} icon={item.icon} label={item.label} compact />
                ))}
            </div>
          </div>
        )}

        {/* Superadmin */}
        {superAdmin && filteredSuper.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setSuperOpen(o => !o)}
              className={cn(
                "flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-[10px] font-extrabold tracking-widest uppercase transition-all",
                superActive ? "text-purple" : "text-textDim hover:text-purple"
              )}>
              <ShieldCheck size={11} className="text-purple" />
              <span className="flex-1 text-left">Superadmin</span>
              {superActive && <div className="w-1.5 h-1.5 rounded-full bg-purple" />}
              {superOpen
                ? <ChevronDown size={10} className="opacity-50" />
                : <ChevronRight size={10} className="opacity-50" />}
            </button>
            {(superOpen || isSearching) && (
              <div className="ml-2 pl-2 border-l border-purple/20 space-y-0.5 mb-1">
                {filteredSuper.map(item => (
                  <NavLink key={item.href} href={item.href} icon={item.icon} label={item.label} purple compact />
                ))}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="px-2 py-2 border-t border-border space-y-0.5">
        <ThemeToggle />
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-textMuted hover:text-red hover:bg-red/10 w-full transition-all">
          <LogOut size={13} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
