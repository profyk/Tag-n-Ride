import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "./ThemeContext";
import { ThemeMode } from "./theme";
import { radius } from "./theme";

type Option = { mode: ThemeMode; icon: any; label: string };

const OPTIONS: Option[] = [
  { mode: "light", icon: "sunny-outline", label: "Light" },
  { mode: "system", icon: "phone-portrait-outline", label: "System" },
  { mode: "dark",  icon: "moon-outline",  label: "Dark" },
];

export function ThemeToggle() {
  const { mode, setMode, colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.bg3, borderColor: colors.border }]}>
      {OPTIONS.map((opt) => {
        const active = mode === opt.mode;
        return (
          <TouchableOpacity
            key={opt.mode}
            onPress={() => setMode(opt.mode)}
            style={[
              styles.option,
              active && { backgroundColor: colors.bg2, borderColor: colors.cyan },
              !active && { borderColor: "transparent" },
            ]}
            activeOpacity={0.8}>
            <Ionicons
              name={opt.icon}
              size={16}
              color={active ? colors.cyan : colors.textDim}
            />
            <Text style={[
              styles.label,
              { color: active ? colors.cyan : colors.textDim },
              active && { fontWeight: "800" },
            ]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    borderRadius: radius.pill,
    borderWidth: 1,
    padding: 3,
    alignSelf: "center",
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  label: { fontSize: 13 },
});
