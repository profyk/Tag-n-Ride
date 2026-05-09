import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      colors: {
        bg: "#0A0A0F",
        bg2: "#111118",
        bg3: "#1A1A24",
        border: "#1E1E2E",
        borderStrong: "#2A2A3E",
        cyan: "#00D4FF",
        cyanDim: "rgba(0,212,255,0.1)",
        green: "#00E676",
        greenDim: "rgba(0,230,118,0.1)",
        red: "#FF3B3B",
        redDim: "rgba(255,59,59,0.1)",
        yellow: "#FFD60A",
        yellowDim: "rgba(255,214,10,0.1)",
        purple: "#A064FF",
        purpleDim: "rgba(160,100,255,0.1)",
        text: "#F0F0FF",
        textMuted: "#8888AA",
        textDim: "#444466",
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "16px",
        xl: "24px",
      },
    },
  },
  plugins: [],
};
export default config;
