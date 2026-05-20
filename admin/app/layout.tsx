import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";

export const metadata: Metadata = {
  title: "Tag n Ride Admin",
  description: "Tag n Ride Administration Panel",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
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
      </body>
    </html>
  );
}
