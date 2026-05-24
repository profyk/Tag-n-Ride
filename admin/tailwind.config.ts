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
        bg:        "var(--bg)",
        bg2:       "var(--bg2)",
        bg3:       "var(--bg3)",
        border:    "var(--border)",
        cyan:      "var(--cyan)",
        cyanDim:   "var(--cyanDim)",
        green:     "var(--green)",
        greenDim:  "var(--greenDim)",
        red:       "var(--red)",
        redDim:    "var(--redDim)",
        yellow:    "var(--yellow)",
        yellowDim: "var(--yellowDim)",
        purple:    "var(--purple)",
        purpleDim: "var(--purpleDim)",
        orange:    "var(--orange)",
        text:      "var(--text)",
        textMuted: "var(--textMuted)",
        textDim:   "var(--textDim)",
      },
    },
  },
  plugins: [],
};

export default config;
