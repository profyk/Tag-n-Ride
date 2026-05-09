"use client";
import { useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { requireAdmin } from "@/lib/auth";

export function AdminShell({ children, title }: { children: React.ReactNode; title: string }) {
  useEffect(() => { requireAdmin(); }, []);
  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar />
      <main className="ml-60 flex-1 min-h-screen">
        <div className="px-8 py-6 border-b border-border bg-bg2 sticky top-0 z-30">
          <h1 className="text-text font-bold text-xl">{title}</h1>
        </div>
        <div className="px-8 py-6">{children}</div>
      </main>
    </div>
  );
}
