"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, Car, ArrowLeftRight, Wallet,
  BarChart3, CreditCard, LogOut, Shield, ShieldCheck,
} from "lucide-react";
import { clearToken, getToken } from "@/lib/api";
import { cn } from "@/lib/utils";

function isSuperAdmin() {
  try {
    const token = getToken();
    if (!token) return false;
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.role === "superadmin";
  } catch { return false; }
}

const nav = [
  { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Users", href: "/admin/users", icon: Users },
  { label: "Drivers", href: "/admin/drivers", icon: Car },
  { label: "Transactions", href: "/admin/transactions", icon: ArrowLeftRight },
  { label: "Withdrawals", href: "/admin/withdrawals", icon: Wallet },
  { label: "Payouts", href: "/admin/payouts", icon: CreditCard },
  { label: "Analytics", href: "/admin/analytics", icon: BarChart3 },
];

const superAdminNav = [
  { label: "Admin Accounts", href: "/admin/admins", icon: Shield },
  { label: "Superadmin", href: "/admin/superadmin", icon: ShieldCheck },
];

export function Sidebar() {
  const path = usePathname();
  const superAdmin = isSuperAdmin();

  return (
    <aside className="fixed top-0 left-0 h-screen w-60 bg-bg2 border-r border-border flex flex-col z-40">
      <div className="px-4 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Image src="/icons/logo.png" alt="Tag n Ride" width={40} height={40} className="rounded-full" />
          <div>
            <p className="text-text font-bold text-sm leading-none">Tag n Ride</p>
            <p className="text-textMuted text-xs mt-0.5">
              {superAdmin ? "Superadmin" : "Admin"} Panel
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {nav.map(({ label, href, icon: Icon }) => {
          const active = path === href || path.startsWith(href + "/");
          return (
            <Link key={href} href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all",
                active ? "bg-cyanDim text-cyan border border-cyan/20" : "text-textMuted hover:text-text hover:bg-bg3"
              )}>
              <Icon size={16} />
              {label}
            </Link>
          );
        })}

        {superAdmin && (
          <>
            <div className="pt-3 pb-1">
              <p className="px-3 text-xs font-bold text-textDim uppercase tracking-widest">Superadmin</p>
            </div>
            {superAdminNav.map(({ label, href, icon: Icon }) => {
              const active = path === href || path.startsWith(href + "/");
              return (
                <Link key={href} href={href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all",
                    active ? "bg-purpleDim text-purple border border-purple/20" : "text-textMuted hover:text-text hover:bg-bg3"
                  )}>
                  <Icon size={16} />
                  {label}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      <div className="px-3 py-4 border-t border-border">
        <button onClick={() => { clearToken(); window.location.href = "/login"; }}
          className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-textMuted hover:text-red hover:bg-redDim w-full transition-all">
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
