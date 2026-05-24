"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { Toaster } from "react-hot-toast";

type Theme = "dark" | "light" | "system";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  resolvedTheme: "dark" | "light";
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => {},
  resolvedTheme: "dark",
});

export function useTheme() { return useContext(ThemeContext); }function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = (localStorage.getItem("tnr_theme") as Theme) || "dark";
    setThemeState(stored);
    applyTheme(stored);
    setMounted(true);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (theme === "system") {
        setResolvedTheme(mq.matches ? "dark" : "light");
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const applyTheme = (t: Theme) => {
    const root = document.documentElement;
    root.classList.add("theme-switching");
    root.setAttribute("data-theme", t);
    const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolved = t === "system" ? (sysDark ? "dark" : "light") : t;
    setResolvedTheme(resolved);
    requestAnimationFrame(() => {
      root.classList.remove("theme-switching");
    });
  };

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem("tnr_theme", t);
    applyTheme(t);
  };

  if (!mounted) return null;

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}export function Providers({ children }: { children: React.ReactNode }) {
  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const t = document.documentElement.getAttribute("data-theme");
      const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const resolved =
        t === "system" ? (sysDark ? "dark" : "light") :
        t === "light" ? "light" : "dark";
      setResolvedTheme(resolved as "dark" | "light");
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  const isLight = resolvedTheme === "light";

  return (
    <ThemeProvider>
      {children}
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: isLight ? "#FFFFFF" : "#0D0D16",
            color: isLight ? "#0D0F1A" : "#F0F0FF",
            border: `1px solid ${isLight ? "#DDE2EF" : "#1A1A2E"}`,
            fontSize: 13,
          },
          success: {
            iconTheme: {
              primary: isLight ? "#00A855" : "#00E676",
              secondary: isLight ? "#FFFFFF" : "#05050A",
            },
          },
          error: {
            iconTheme: {
              primary: isLight ? "#E02040" : "#FF4D6D",
              secondary: isLight ? "#FFFFFF" : "#05050A",
            },
          },
        }}
      />
    </ThemeProvider>
  );
}
