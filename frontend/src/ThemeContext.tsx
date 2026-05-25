import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { lightColors, darkColors, ColorTokens, ThemeMode } from "./theme";

const THEME_KEY = "tnr_theme_mode";

type ThemeContextType = {
  mode: ThemeMode;
  colors: ColorTokens;
  isDark: boolean;
  setMode: (m: ThemeMode) => void;
};

export const ThemeContext = createContext<ThemeContextType>({
  mode: "dark",
  colors: darkColors,
  isDark: true,
  setMode: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("dark");

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then(saved => {
      if (saved === "dark" || saved === "light" || saved === "system") {
        setModeState(saved);
      }
    });
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(THEME_KEY, m);
  }, []);

  const isDark = mode === "system"
    ? systemScheme === "dark"
    : mode === "dark";

  const resolvedColors = isDark ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ mode, colors: resolvedColors, isDark, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
