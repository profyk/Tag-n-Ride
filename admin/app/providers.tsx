"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { useState, useEffect } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
  }));

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(console.error);
    }
  }, []);

  return (
    <QueryClientProvider client={qc}>
      {children}
      <Toaster position="top-right" toastOptions={{
        style: { background: "#1A1A24", color: "#F0F0FF", border: "1px solid #2A2A3E" },
        success: { iconTheme: { primary: "#00E676", secondary: "#0A0A0F" } },
        error: { iconTheme: { primary: "#FF3B3B", secondary: "#0A0A0F" } },
      }} />
    </QueryClientProvider>
  );
}
