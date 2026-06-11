"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/layout/AdminShell";
import { Spinner } from "@/components/ui";

export default function BroadcastRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/admin/notifications"); }, []);
  return (
    <AdminShell title="Broadcast">
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Spinner />
        <p className="text-textMuted text-sm">Redirecting to Announcements...</p>
      </div>
    </AdminShell>
  );
}
