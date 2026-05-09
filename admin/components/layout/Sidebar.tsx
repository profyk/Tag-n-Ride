"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Car, ArrowLeftRight, Wallet, BarChart3, CreditCard, LogOut } from "lucide-react";
import { clearToken } from "@/lib/api";
import { cn } from "@/lib/utils";

const nav = [
  { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Users", href: "/admin/users", icon: Users },
  { label: "Drivers", href: "/admin/drivers", icon: Car },
  { label: "Transactions", href: "/admin/transactions", icon: ArrowLeftRight },
  { label: "Withdrawals", href: "/admin/withdrawals", icon: Wallet },
  { label: "Payouts", href: "/admin/payouts", icon: CreditCard },
  { label: "Analytics", href: "/admin/analytics", icon: BarChart3 },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="fixed top-0 left-0 h-screen w-60 bg-bg2 border-r border-border flex flex-col z-40">
      <div className="px-6 py-6 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-cyan flex items-center justify-center">
            <span className="text-bg font-mono font-bold text-sm">T</span>
          </div>
          <div>
            <p className="text-text font-bold text-sm leading-none">Tag n Ride</p>
            <p className="text-textMuted text-xs mt-0.5">Admin Panel</p>
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
      </nav>
      <div className="px-3 py-4 border-t border-border">
        <button
          onClick={() => { clearToken(); window.location.href = "/login"; }}
          className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-textMuted hover:text-red hover:bg-redDim w-full transition-all">
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
