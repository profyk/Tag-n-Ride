"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RolesRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/admin/settings?tab=roles"); }, []);
  return null;
}
