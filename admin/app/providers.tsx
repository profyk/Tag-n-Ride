"use client";
import { Toaster } from "react-hot-toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "#0D0D16",
            color: "#F0F0FF",
            border: "1px solid #1A1A2E",
            fontSize: 13,
          },
          success: { iconTheme: { primary: "#00E676", secondary: "#05050A" } },
          error: { iconTheme: { primary: "#FF4D6D", secondary: "#05050A" } },
        }}
      />
    </>
  );
}
