import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#05050A",
        bg2: "#0D0D16",
        bg3: "#141420",
        border: "#1A1A2E",
        cyan: "#00D4FF",
        cyanDim: "rgba(0,212,255,0.08)",
        green: "#00E676",
        greenDim: "rgba(0,230,118,0.08)",
        red: "#FF4D6D",
        redDim: "rgba(255,77,109,0.08)",
        yellow: "#FFD60A",
        yellowDim: "rgba(255,214,10,0.08)",
        purple: "#A064FF",
        purpleDim: "rgba(160,100,255,0.08)",
        text: "#F0F0FF",
        textMuted: "#7777AA",
        textDim: "#333355",
      },
    },
  },
  plugins: [],
};

export default config;
