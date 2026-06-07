"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function APIKeysRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/admin/settings?tab=api-keys"); }, []);
  return null;
}
