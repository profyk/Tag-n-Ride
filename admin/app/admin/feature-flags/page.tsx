"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function FeatureFlagsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/admin/settings?tab=feature-flags"); }, []);
  return null;
}
