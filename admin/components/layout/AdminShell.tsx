"use client";
import { Sidebar } from "./Sidebar";
import { useEffect } from "react";
import { isAuthenticated } from "@/lib/auth";
import { useRouter } from "next/navigation";

export function AdminShell({
  title, children,
}: {
  title: string; children: React.ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated()) router.push("/login");
  }, [router]);

  return (
    <div className="min-h-screen bg-bg flex">
      <Sidebar />
      <main className="flex-1 ml-[220px] p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-text text-2xl font-extrabold tracking-tight mb-6">
            {title}
          </h1>
          {children}
        </div>
      </main>
    </div>
  );
}
