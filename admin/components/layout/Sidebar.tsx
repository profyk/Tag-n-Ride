"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, Car, ArrowLeftRight, Wallet,
  BarChart3, CreditCard, LogOut, Shield, ShieldCheck,
  FileText, HelpCircle, Fingerprint, Monitor, Bell,
  AlertTriangle, TrendingUp, Activity, Settings,
  UserCheck, Users2, Truck, Scale, MapPin, BookOpen,
  Terminal, Sun, Moon, FlaskConical, RefreshCw,
  DollarSign, Lock, RotateCcw, PieChart, Banknote,
  ShieldAlert, AlertOctagon, Gauge, Tag, Megaphone,
  Zap, Globe, Star, ToggleRight, Key, MessageCircle,
} from "lucide-react";
import { clearToken, getRole, isSuperAdmin, hasPermission } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useTheme } from "@/app/providers";

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Superadmin", ceo: "CEO", cto: "CTO", cfo: "CFO",
  admin: "Admin", finance: "Finance", support: "Support",
};

const nav = [
  { label: "Dashboard",    href: "/admin/dashboard",    icon: LayoutDashboard, permission: null },
  { label: "Users",        href: "/admin/users",         icon: Users,           permission: "manage_users" },
  { label: "Drivers",      href: "/admin/drivers",       icon: Car,             permission: "manage_drivers" },
  { label: "Transactions", href: "/admin/transactions",  icon: ArrowLeftRight,  permission: null },
  { label: "Withdrawals",  href: "/admin/withdrawals",   icon: Wallet,          permission: "approve_withdrawals" },
  { label: "KYC Review",   href: "/admin/kyc",           icon: Fingerprint,     permission: "review_kyc" },
  { label: "Analytics",    href: "/admin/analytics",     icon: BarChart3,       permission: "view_analytics" },
  { label: "Payouts",      href: "/admin/payouts",       icon: CreditCard,      permission: "approve_withdrawals" },
  { label: "Audit Log",    href: "/admin/audit",         icon: FileText,        permission: "view_audit" },
  { label: "Support",      href: "/admin/support",          icon: HelpCircle,      permission: "reset_pin" },
  { label: "WA Support",  href: "/admin/whatsapp-support", icon: MessageCircle,   permission: "reset_pin" },
];

const advancedNav = [
  { label: "Routes & Trips",      href: "/admin/routes",            icon: MapPin,        permission: "view_analytics" },
  { label: "Ledger",              href: "/admin/ledger",            icon: BookOpen,      permission: "view_ledger" },
  { label: "Compliance & Risk",   href: "/admin/compliance",        icon: AlertTriangle, permission: "view_audit" },
  { label: "Financial Reports",   href: "/admin/reports",           icon: TrendingUp,    permission: "view_analytics" },
  { label: "Disputes",            href: "/admin/disputes",          icon: Scale,         permission: "manage_users" },
  { label: "Notifications",       href: "/admin/notifications",     icon: Bell,          permission: "manage_users" },
  { label: "System Health",       href: "/admin/health",            icon: Activity,      permission: "view_audit" },
  { label: "Passenger Analytics", href: "/admin/passengers",        icon: Users2,        permission: "view_analytics" },
  { label: "Fleet Reports",       href: "/admin/fleet",             icon: Truck,         permission: "view_analytics" },
  { label: "Driver Performance",  href: "/admin/performance",       icon: PieChart,      permission: "view_analytics" },
  { label: "Onboarding",          href: "/admin/onboarding",        icon: UserCheck,     permission: "manage_drivers" },
  { label: "Statements",          href: "/admin/statements",        icon: FileText,      permission: "download_statements" },
  { label: "Revenue & Fees",      href: "/admin/revenue",           icon: DollarSign,    permission: "view_analytics" },
  { label: "Refunds",             href: "/admin/refunds",           icon: RotateCcw,     permission: "manage_refunds" },
  { label: "Reconciliation",      href: "/admin/reconciliation",    icon: RefreshCw,     permission: "view_ledger" },
  { label: "Wallet Operations",   href: "/admin/wallet-ops",        icon: Banknote,      permission: "view_audit" },
  { label: "Risk & Fraud",        href: "/admin/risk",              icon: ShieldAlert,   permission: "view_risk" },
  { label: "Chargebacks",         href: "/admin/chargebacks",       icon: AlertOctagon,  permission: "manage_refunds" },
  { label: "Tx Limits",           href: "/admin/limits",            icon: Gauge,         permission: "manage_limits" },
  { label: "Promotions",          href: "/admin/promotions",        icon: Tag,           permission: "manage_promotions" },
  { label: "Referrals",           href: "/admin/referrals",         icon: Users2,        permission: "view_analytics" },
  { label: "Broadcast",           href: "/admin/broadcast",         icon: Megaphone,     permission: "broadcast_messages" },
  { label: "WhatsApp",            href: "/admin/whatsapp",          icon: MessageCircle, permission: "broadcast_messages" },
  { label: "Pricing Rules",       href: "/admin/pricing",           icon: Zap,           permission: "manage_pricing" },
  { label: "Coverage Zones",      href: "/admin/geography",         icon: Globe,         permission: "view_analytics" },
  { label: "User Feedback",       href: "/admin/feedback",          icon: Star,          permission: "view_analytics" },
];

const superAdminNav = [
  { label: "Admin Accounts", href: "/admin/admins",     icon: Shield },
  { label: "Roles & Perms",  href: "/admin/roles",      icon: Lock },
  { label: "Sessions",       href: "/admin/sessions",   icon: Monitor },
  { label: "Settings",       href: "/admin/settings",       icon: Settings },
  { label: "System Console", href: "/admin/console",        icon: Terminal },
  { label: "Superadmin",     href: "/admin/superadmin",     icon: ShieldCheck },
  { label: "Test Users",     href: "/admin/test-users",     icon: FlaskConical },
  { label: "Feature Flags",  href: "/admin/feature-flags",  icon: ToggleRight },
  { label: "API Keys",       href: "/admin/api-keys",       icon: Key },
  { label: "GDPR & Privacy", href: "/admin/gdpr",           icon: ShieldCheck },
];

function ThemeToggleCompact() {
  const { theme, setTheme } = useTheme();
  const cycle = () => {
    const order = ["dark", "light", "system"] as const;
    setTheme(order[(order.indexOf(theme as any) + 1) % order.length]);
  };
  const Icon = theme === "light" ? Sun : theme === "system" ? Monitor : Moon;
  return (
    <button onClick={cycle} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-textMuted hover:text-text hover:bg-bg3 w-full transition-all">
      <Icon size={15} />
      <span className="capitalize">{theme} mode</span>
    </button>
  );
}

export function Sidebar() {
  const path = usePathname();
  const role = getRole() || "";
  const superAdmin = isSuperAdmin();

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

  const visibleNav = nav.filter(({ permission }) => permission === null || hasPermission(permission));
  const visibleAdvanced = advancedNav.filter(({ permission }) => hasPermission(permission));

  const NavLink = ({ href, icon: Icon, label, purple = false }: { href: string; icon: any; label: string; purple?: boolean }) => {
    const active = path === href || path.startsWith(href + "/");
    return (
      <Link href={href} className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
        active
          ? purple ? "bg-purple/10 text-purple border border-purple/20" : "bg-cyanDim text-cyan border border-cyan/20"
          : "text-textMuted hover:text-text hover:bg-bg3"
      )}>
        <Icon size={15} />
        {label}
      </Link>
    );
  };

  return (
    <aside className="fixed top-0 left-0 h-screen w-60 bg-bg2 border-r border-border flex flex-col z-40">
      <div className="px-4 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-cyanDim border border-cyan/30 flex items-center justify-center">
            <span className="text-cyan font-black text-sm">TR</span>
          </div>
          <div>
            <p className="text-text font-extrabold text-sm leading-none">Tag n Ride</p>
            <p className="text-textMuted text-[10px] mt-0.5 font-medium">{ROLE_LABELS[role] || "Admin"} Panel</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {visibleNav.map(({ label, href, icon }) => (
          <NavLink key={href} href={href} icon={icon} label={label} />
        ))}
        {visibleAdvanced.length > 0 && (
          <>
            <div className="pt-4 pb-1.5">
              <p className="px-3 text-[9px] font-extrabold text-textDim uppercase tracking-widest">Advanced</p>
            </div>
            {visibleAdvanced.map(({ label, href, icon }) => (
              <NavLink key={href} href={href} icon={icon} label={label} />
            ))}
          </>
        )}
        {superAdmin && (
          <>
            <div className="pt-4 pb-1.5">
              <p className="px-3 text-[9px] font-extrabold text-textDim uppercase tracking-widest">Superadmin</p>
            </div>
            {superAdminNav.map(({ label, href, icon }) => (
              <NavLink key={href} href={href} icon={icon} label={label} purple />
            ))}
          </>
        )}
      </nav>

      <div className="px-3 py-3 border-t border-border space-y-0.5">
        <ThemeToggleCompact />
        <button onClick={handleSignOut} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-textMuted hover:text-red hover:bg-red/10 w-full transition-all">
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
