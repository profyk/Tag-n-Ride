"use client";
import { useState, useRef, useEffect } from "react";
import { Sun, Moon, Monitor, ChevronDown, Check } from "lucide-react";
import { useTheme } from "@/app/providers";

type Theme = "dark" | "light" | "system";

const OPTIONS: { value: Theme; label: string; icon: any; desc: string }[] = [
  { value: "dark",   label: "Dark",   icon: Moon,    desc: "Always dark" },
  { value: "light",  label: "Light",  icon: Sun,     desc: "Always light" },
  { value: "system", label: "System", icon: Monitor, desc: "Follows OS setting" },
];

const ICONS: Record<Theme, any> = { dark: Moon, light: Sun, system: Monitor };export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const ActiveIcon = ICONS[theme] || Moon;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-bg3 border border-border text-textMuted hover:text-text hover:border-cyan/30 transition-all text-xs font-medium"
        title="Toggle theme">
        <ActiveIcon size={13} />
        <span className="hidden sm:inline capitalize">{theme}</span>
        <ChevronDown size={11} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-44 bg-bg2 border border-border rounded-xl shadow-2xl overflow-hidden z-50">
          <div className="px-3 py-2 border-b border-border">
            <p className="text-[10px] font-bold text-textDim uppercase tracking-widest">Appearance</p>
          </div>
          {OPTIONS.map(opt => {
            const Icon = opt.icon;
            const active = theme === opt.value;
            return (
              <button key={opt.value} onClick={() => { setTheme(opt.value); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-bg3 ${active ? "bg-cyanDim" : ""}`}>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  active ? "bg-cyan/20 border border-cyan/30" : "bg-bg3 border border-border"
                }`}>
                  <Icon size={13} className={active ? "text-cyan" : "text-textMuted"} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-bold ${active ? "text-cyan" : "text-text"}`}>{opt.label}</p>
                  <p className="text-[10px] text-textDim">{opt.desc}</p>
                </div>
                {active && <Check size={12} className="text-cyan flex-shrink-0" />}
              </button>
            );
          })}
          <div className="px-3 py-2 border-t border-border">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${resolvedTheme === "dark" ? "bg-textDim" : "bg-yellow"}`} />
              <p className="text-[10px] text-textDim">
                Currently {resolvedTheme === "dark" ? "dark" : "light"}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}export function ThemeToggleCompact() {
  const { theme, setTheme } = useTheme();

  const cycle = () => {
    const order: Theme[] = ["dark", "light", "system"];
    const next = order[(order.indexOf(theme) + 1) % order.length];
    setTheme(next);
  };

  const Icon = ICONS[theme] || Moon;

  return (
    <button onClick={cycle}
      title={`Theme: ${theme} — click to cycle`}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-textMuted hover:text-text hover:bg-bg3 w-full transition-all">
      <Icon size={15} />
      <span className="capitalize">{theme} mode</span>
    </button>
  );
}
