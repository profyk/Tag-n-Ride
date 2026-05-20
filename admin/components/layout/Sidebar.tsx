"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, Car, ArrowLeftRight, Wallet,
  BarChart3, CreditCard, LogOut, Shield, ShieldCheck,
  FileText, HelpCircle, Fingerprint, Monitor,
} from "lucide-react";
import { clearToken, getRole, isSuperAdmin } from "@/lib/api";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Superadmin", ceo: "CEO", cto: "CTO",
  cfo: "CFO", admin: "Admin", finance: "Finance", support: "Support",
};

const nav = [
  { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Users", href: "/admin/users", icon: Users },
  { label: "Drivers", href: "/admin/drivers", icon: Car },
  { label: "Transactions", href: "/admin/transactions", icon: ArrowLeftRight },
  { label: "Withdrawals", href: "/admin/withdrawals", icon: Wallet },
  { label: "KYC Review", href: "/admin/kyc", icon: Fingerprint },
  { label: "Analytics", href: "/admin/analytics", icon: BarChart3 },
  { label: "Payouts", href: "/admin/payouts", icon: CreditCard },
  { label: "Audit Log", href: "/admin/audit", icon: FileText },
  { label: "Support", href: "/admin/support", icon: HelpCircle },
];

const superAdminNav = [
  { label: "Admin Accounts", href: "/admin/admins", icon: Shield },
  { label: "Sessions", href: "/admin/sessions", icon: Monitor },
  { label: "Superadmin", href: "/admin/superadmin", icon: ShieldCheck },
];

export function Sidebar() {
  const path = usePathname();
  const role = getRole() || "";
  const superAdmin = isSuperAdmin();

  const handleSignOut = async () => {
    try {
      await fetch(
        "https://tag-n-ride-production.up.railway.app/api/auth/admin-logout",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("tnr_admin_token")}`,
          },
        }
      );
    } catch {}
    clearToken();
    window.location.href = "/login";
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
            <p className="text-textMuted text-[10px] mt-0.5 font-medium">
              {ROLE_LABELS[role] || "Admin"} Panel
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {nav.map(({ label, href, icon: Icon }) => {
          const active = path === href || path.startsWith(href + "/");
          return (
            <Link key={href} href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                active
                  ? "bg-cyanDim text-cyan border border-cyan/20"
                  : "text-textMuted hover:text-text hover:bg-bg3"
              )}>
              <Icon size={15} />
              {label}
            </Link>
          );
        })}

        {superAdmin && (
          <>
            <div className="pt-4 pb-1.5">
              <p className="px-3 text-[9px] font-extrabold text-textDim uppercase tracking-widest">
                Superadmin
              </p>
            </div>
            {superAdminNav.map(({ label, href, icon: Icon }) => {
              const active = path === href || path.startsWith(href + "/");
              return (
                <Link key={href} href={href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                    active
                      ? "bg-purple/10 text-purple border border-purple/20"
                      : "text-textMuted hover:text-text hover:bg-bg3"
                  )}>
                  <Icon size={15} />
                  {label}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      <div className="px-3 py-3 border-t border-border">
        <button onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-textMuted hover:text-red hover:bg-red/10 w-full transition-all">
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
