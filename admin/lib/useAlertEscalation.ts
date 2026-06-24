"use client";
import { useEffect, useRef } from "react";

const FLASH_MS = 1000;

/**
 * While `hasActiveAlert` is true and the tab is hidden, flashes the document title
 * and fires a native browser notification so operators away from the tab notice new SOS events.
 */
export function useAlertEscalation(hasActiveAlert: boolean, alertTitle = "🚨 SOS ACTIVE") {
  const originalTitle = useRef<string | null>(null);
  const flashOn = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (originalTitle.current === null) originalTitle.current = document.title;

    if (!hasActiveAlert) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      document.title = originalTitle.current;
      return;
    }

    if (document.visibilityState === "hidden" && !intervalRef.current) {
      intervalRef.current = setInterval(() => {
        flashOn.current = !flashOn.current;
        document.title = flashOn.current ? alertTitle : (originalTitle.current || "");
      }, FLASH_MS);
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
        document.title = originalTitle.current || "";
      } else if (hasActiveAlert && !intervalRef.current) {
        intervalRef.current = setInterval(() => {
          flashOn.current = !flashOn.current;
          document.title = flashOn.current ? alertTitle : (originalTitle.current || "");
        }, FLASH_MS);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };
  }, [hasActiveAlert, alertTitle]);
}

export function notifyNewAlert(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "granted") {
    try { new Notification(title, { body }); } catch {}
  }
}
