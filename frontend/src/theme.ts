import { useContext } from "react";
import { ThemeContext } from "./ThemeContext";

// ── Light palette ──
export const lightColors = {
  bg: "#F2F2F7",
  bg2: "#FFFFFF",
  bg3: "#E5E5EA",
  border: "#D1D1D6",
  borderStrong: "#C7C7CC",
  text: "#000000",
  textMuted: "#3C3C43",
  textDim: "#8E8E93",
  cyan: "#0099BB",
  green: "#28A745",
  blue: "#0A84FF",
  red: "#FF3B30",
  yellow: "#CC9900",
  overlay: "rgba(0,0,0,0.4)",
  cyanDim: "rgba(0,153,187,0.12)",
  greenDim: "rgba(40,167,69,0.12)",
  redDim: "rgba(255,59,48,0.12)",
};

// ── Dark palette ──
export const darkColors = {
  bg: "#0A0A0A",
  bg2: "#121212",
  bg3: "#1C1C1E",
  border: "#2A2A2A",
  borderStrong: "#333333",
  text: "#FFFFFF",
  textMuted: "#A0A0A5",
  textDim: "#6B6B70",
  cyan: "#00E5FF",
  green: "#39FF14",
  blue: "#0A84FF",
  red: "#FF3B30",
  yellow: "#FFD60A",
  overlay: "rgba(0,0,0,0.7)",
  cyanDim: "rgba(0,229,255,0.12)",
  greenDim: "rgba(57,255,20,0.12)",
  redDim: "rgba(255,59,48,0.12)",
};

export type ColorTokens = typeof darkColors;
export type ThemeMode = "dark" | "light" | "system";

// Default export — always dark for static imports
// Components that need theme-awareness should use useColors() hook
export const colors = darkColors;

export const radius = { sm: 8, md: 16, lg: 24, pill: 9999 };
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export const formatZAR = (n: number | string | undefined | null): string => {
  const v = typeof n === "string" ? parseFloat(n) : n ?? 0;
  if (Number.isNaN(v)) return "R 0.00";
  return "R " + (v as number).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const formatNGN = formatZAR;

export const formatDate = (iso: string): string => {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

// Hook — use this in components for live theme colors
export function useColors(): ColorTokens {
  const ctx = useContext(ThemeContext);
  return ctx?.colors ?? darkColors;
}
