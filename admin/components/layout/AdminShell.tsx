"use client";
import { Sidebar } from "./Sidebar";
import { useEffect, useState } from "react";
import { isAuthenticated } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { AlertTriangle, Clock } from "lucide-react";

function getTokenExpiryMs(): number | null {
  try {
    const token = typeof window !== "undefined" ? localStorage.getItem("tnr_admin_token") : null;
    if (!token) return null;
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 - Date.now();
  } catch { return null; }
}

export function AdminShell({
  title, subtitle, children,
}: {
  title: string; subtitle?: string; children: React.ReactNode;
}) {
  const router = useRouter();
  const [expiryWarning, setExpiryWarning] = useState<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) { router.push("/login"); return; }
    const check = () => {
      const ms = getTokenExpiryMs();
      if (ms !== null && ms < 30 * 60 * 1000) setExpiryWarning(Math.max(0, Math.floor(ms / 60000)));
      else setExpiryWarning(null);
    };
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, [router]);

  return (
    <div className="min-h-screen bg-bg flex">
      <Sidebar />
      <main className="flex-1 ml-[220px] p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">
          {/* Session expiry warning */}
          {expiryWarning !== null && (
            <div className="flex items-center gap-3 mb-4 px-4 py-3 rounded-xl bg-yellow/5 border border-yellow/20">
              <Clock size={14} className="text-yellow flex-shrink-0" />
              <p className="text-yellow text-xs font-semibold flex-1">
                {expiryWarning <= 0
                  ? "Your session has expired. Please log in again."
                  : `Your session expires in ${expiryWarning} minute${expiryWarning !== 1 ? "s" : ""}. Save your work.`}
              </p>
              <button
                onClick={() => router.push("/login")}
                className="text-xs font-bold text-yellow hover:text-yellow/80 underline">
                Re-login
              </button>
            </div>
          )}

          <h1 className="text-text text-2xl font-extrabold tracking-tight mb-1">
            {title}
          </h1>
          {subtitle && (
            <p className="text-textMuted text-sm mb-6">{subtitle}</p>
          )}
          {!subtitle && <div className="mb-6" />}
          {children}
        </div>
      </main>
    </div>
  );
}
