// Theme tokens for Tag n Ride - electric/neon dark theme
export const colors = {
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

export const radius = { sm: 8, md: 16, lg: 24, pill: 9999 };
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export const formatZAR = (n: number | string | undefined | null): string => {
  const v = typeof n === "string" ? parseFloat(n) : n ?? 0;
  if (Number.isNaN(v)) return "R 0.00";
  return "R " + (v as number).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Backwards-compat alias for any old call sites
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
